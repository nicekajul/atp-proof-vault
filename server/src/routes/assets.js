import express from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { appendRow, findRow, findRowsEq, updateRow, deleteRow, deleteRows } from '../lib/sheetsDb.js';
import { uploadObject, getObjectMetadata, deleteObject } from '../lib/driveStorage.js';
import { generatePreview } from '../lib/preview.js';
import { requireTeam, requireTeamProjectOwner } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';
import { isProjectOwner } from '../lib/ownership.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

// The Apps Script Web App proxy caps request/response payloads around ~50MB and
// execution time around ~6 minutes. Base64-encoding a file adds ~33% overhead, so
// refuse well before that ceiling with a clear message instead of a mid-upload failure.
const MAX_DIRECT_UPLOAD_BYTES = 40 * 1024 * 1024;

const ASSET_TYPES = new Set([
  // Publishing
  'cover', 'illustration', 'interior', 'proofreading', 'manuscript', 'audio',
  // Marketing
  'website', 'trailer', 'magazine', 'billboard',
  // Shared
  'other',
]);

function safeFilename(name) {
  return String(name).replace(/[^a-zA-Z0-9_.\-]/g, '_');
}

const DRIVE_URL_PATTERNS = [
  /\/file\/d\/([a-zA-Z0-9_-]{10,})/, // https://drive.google.com/file/d/FILE_ID/view
  /[?&]id=([a-zA-Z0-9_-]{10,})/, // https://drive.google.com/open?id=FILE_ID or /uc?id=FILE_ID
];

function extractDriveFileId(url) {
  for (const re of DRIVE_URL_PATTERNS) {
    const match = String(url || '').match(re);
    if (match) return match[1];
  }
  return null;
}

const YOUTUBE_URL_PATTERNS = [
  /youtu\.be\/([a-zA-Z0-9_-]{6,})/,
  /youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{6,})/,
  /youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/,
  /youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/,
];

function extractYouTubeId(url) {
  for (const re of YOUTUBE_URL_PATTERNS) {
    const match = String(url || '').match(re);
    if (match) return match[1];
  }
  return null;
}

/**
 * POST /api/projects/:id/assets/link — registers an externally-hosted video
 * as an asset version, for large files that would exceed the Apps Script
 * proxy's payload/time limits. Supports Google Drive (must be shared
 * "Anyone with the link"), YouTube, or a direct video file URL. Nothing is
 * copied into our storage — playback happens via the source's own player
 * (embedUrl) rather than being proxied through this server.
 * Fields: videoUrl, assetId?, type, title, uploadNote?
 */
router.post('/projects/:id/assets/link', requireTeamProjectOwner, async (req, res) => {
  const projectId = req.params.id;
  const project = req.project;

  const { videoUrl, type, title, uploadNote } = req.body;
  let { assetId } = req.body;
  if (!videoUrl) return res.status(400).json({ error: 'videoUrl is required' });

  const driveFileId = extractDriveFileId(videoUrl);
  const youtubeId = extractYouTubeId(videoUrl);

  let externalUrl, mimeType, fileSize, defaultTitle;

  if (driveFileId) {
    let metadata;
    try {
      metadata = await getObjectMetadata(driveFileId);
    } catch {
      return res.status(400).json({ error: 'Could not access that file — make sure sharing is set to "Anyone with the link".' });
    }
    externalUrl = `https://drive.google.com/file/d/${driveFileId}/preview`;
    mimeType = metadata.mimeType;
    fileSize = metadata.size;
    defaultTitle = metadata.name;
  } else if (youtubeId) {
    externalUrl = `https://www.youtube.com/embed/${youtubeId}`;
    mimeType = 'video/youtube';
    fileSize = 0;
    defaultTitle = 'YouTube video';
  } else if (/^https?:\/\//i.test(videoUrl)) {
    externalUrl = videoUrl;
    mimeType = 'video/mp4';
    fileSize = 0;
    defaultTitle = 'Linked video';
  } else {
    return res.status(400).json({ error: 'Enter a Google Drive link, a YouTube link, or a direct video URL.' });
  }

  let asset;
  if (assetId) {
    asset = await findRow('Assets', 'id', assetId);
    if (!asset || asset.projectId !== projectId) return res.status(404).json({ error: 'Asset not found' });
  } else {
    if (!ASSET_TYPES.has(type)) return res.status(400).json({ error: 'Invalid asset type' });
    asset = {
      id: uuid(),
      projectId,
      type,
      title: title || defaultTitle,
      currentVersionId: '',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    await appendRow('Assets', asset);
    assetId = asset.id;
  }

  const versions = await findRowsEq('AssetVersions', 'assetId', assetId);
  const versionNumber = versions.length + 1;

  const version = {
    id: uuid(),
    assetId,
    versionNumber,
    driveFileId: driveFileId || '',
    previewDriveFileId: '',
    mimeType,
    fileSize,
    uploadedBy: req.user.sub,
    uploadNote: uploadNote || '',
    external: true,
    externalUrl,
    createdAt: new Date().toISOString(),
  };
  await appendRow('AssetVersions', version);
  await updateRow('Assets', 'id', assetId, { currentVersionId: version.id, status: 'pending' });

  logActivity({
    projectId,
    type: 'asset_linked',
    message: `Linked "${asset.title}" (v${versionNumber}) from ${driveFileId ? 'Google Drive' : youtubeId ? 'YouTube' : 'an external URL'}`,
    actor: req.user.sub,
  });

  res.status(201).json({
    asset: { ...asset, currentVersionId: version.id, status: 'pending' },
    version: { id: version.id, versionNumber, mimeType: version.mimeType, fileSize: version.fileSize, createdAt: version.createdAt },
  });
});

/**
 * POST /api/projects/:id/assets/upload — multipart upload straight into the
 * private bucket. If `assetId` is provided, this bumps the version on an
 * existing asset; otherwise a new asset is created.
 * Fields: file (multipart), assetId?, type, title, uploadNote?
 */
router.post('/projects/:id/assets/upload', requireTeamProjectOwner, upload.single('file'), async (req, res) => {
  const projectId = req.params.id;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (req.file.size > MAX_DIRECT_UPLOAD_BYTES) {
    return res.status(400).json({
      error: `File is too large for direct upload (${(req.file.size / (1024 * 1024)).toFixed(1)}MB, limit ${MAX_DIRECT_UPLOAD_BYTES / (1024 * 1024)}MB). Upload it to Google Drive, share "Anyone with the link", and use "Link a file" instead.`,
    });
  }

  const { type, title, uploadNote } = req.body;
  let { assetId } = req.body;

  let asset;
  let createdNewAsset = false;
  if (assetId) {
    asset = await findRow('Assets', 'id', assetId);
    if (!asset || asset.projectId !== projectId) return res.status(404).json({ error: 'Asset not found' });
  } else {
    if (!ASSET_TYPES.has(type)) return res.status(400).json({ error: 'Invalid asset type' });
    asset = {
      id: uuid(),
      projectId,
      type,
      title: title || req.file.originalname,
      currentVersionId: '',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    await appendRow('Assets', asset);
    assetId = asset.id;
    createdNewAsset = true;
  }

  try {
    const versions = await findRowsEq('AssetVersions', 'assetId', assetId);
    const versionNumber = versions.length + 1;
    const virtualPath = `projects/${projectId}/${assetId}/v${versionNumber}/${safeFilename(req.file.originalname)}`;

    const driveFileId = await uploadObject(virtualPath, req.file.buffer, { contentType: req.file.mimetype });

    let previewDriveFileId = '';
    try {
      const preview = await generatePreview(req.file.buffer, req.file.mimetype);
      if (preview) {
        const previewPath = `projects/${projectId}/${assetId}/v${versionNumber}/preview.jpg`;
        previewDriveFileId = await uploadObject(previewPath, preview.buffer, { contentType: preview.mimeType });
      }
    } catch (err) {
      console.warn('[preview] generation failed:', err.message);
    }

    const version = {
      id: uuid(),
      assetId,
      versionNumber,
      driveFileId,
      previewDriveFileId,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedBy: req.user.sub,
      uploadNote: uploadNote || '',
      createdAt: new Date().toISOString(),
    };
    await appendRow('AssetVersions', version);
    await updateRow('Assets', 'id', assetId, { currentVersionId: version.id, status: 'pending' });

    logActivity({
      projectId,
      type: 'asset_uploaded',
      message: `Uploaded "${asset.title}" (v${versionNumber})`,
      actor: req.user.sub,
    });

    res.status(201).json({
      asset: { ...asset, currentVersionId: version.id, status: 'pending' },
      version: { id: version.id, versionNumber, mimeType: version.mimeType, fileSize: version.fileSize, createdAt: version.createdAt },
    });
  } catch (err) {
    // Storage write failed partway through — don't leave a versionless asset behind.
    if (createdNewAsset) await deleteRow('Assets', 'id', assetId).catch(() => {});
    console.error('[assets.upload] failed:', err.message);
    res.status(502).json({ error: 'Could not upload the file to storage. This can happen with a large file or a slow connection — try again, or use "Link a file" for large documents.' });
  }
});

router.get('/assets/:id/versions', requireTeam, async (req, res) => {
  const asset = await findRow('Assets', 'id', req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  const project = await findRow('Projects', 'id', asset.projectId);
  if (!isProjectOwner(project, req.user)) return res.status(403).json({ error: 'Forbidden' });

  const versions = await findRowsEq('AssetVersions', 'assetId', req.params.id);
  versions.sort((a, b) => a.versionNumber - b.versionNumber);
  res.json({
    versions: versions.map((v) => ({
      id: v.id,
      versionNumber: Number(v.versionNumber),
      mimeType: v.mimeType,
      fileSize: Number(v.fileSize),
      uploadedBy: v.uploadedBy,
      uploadNote: v.uploadNote,
      createdAt: v.createdAt,
    })),
  });
});

/**
 * DELETE /api/assets/:id — removes an asset and all its versions/comments/
 * approvals. Files this app actually uploaded (non-external versions) are
 * trashed in the shared Drive folder; externally-linked videos (Drive/
 * YouTube/direct URL) are never touched here since we don't own them.
 */
router.delete('/assets/:id', requireTeam, async (req, res) => {
  const asset = await findRow('Assets', 'id', req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  const project = await findRow('Projects', 'id', asset.projectId);
  if (!isProjectOwner(project, req.user)) return res.status(403).json({ error: 'Forbidden' });

  const versions = await findRowsEq('AssetVersions', 'assetId', asset.id);
  await Promise.all(versions.flatMap((v) => {
    const isExternal = String(v.external) === 'true' || v.external === true;
    if (isExternal) return [];
    return [
      v.driveFileId && deleteObject(v.driveFileId).catch(() => {}),
      v.previewDriveFileId && deleteObject(v.previewDriveFileId).catch(() => {}),
    ].filter(Boolean);
  }));

  await Promise.all([
    deleteRows('Comments', 'assetId', asset.id),
    deleteRows('Approvals', 'assetId', asset.id),
    deleteRows('AssetVersions', 'assetId', asset.id),
  ]);
  await deleteRow('Assets', 'id', asset.id);

  logActivity({
    projectId: asset.projectId,
    type: 'asset_deleted',
    message: `Deleted "${asset.title}"`,
    actor: req.user.sub,
  });

  res.json({ ok: true });
});

/**
 * DELETE /api/assets/:id/versions/:versionId — removes a single version.
 * Refuses to delete the last remaining version of an asset (use the asset
 * delete route for that). If the deleted version was current, the next
 * most recent version becomes current.
 */
router.delete('/assets/:id/versions/:versionId', requireTeam, async (req, res) => {
  const asset = await findRow('Assets', 'id', req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });
  const project = await findRow('Projects', 'id', asset.projectId);
  if (!isProjectOwner(project, req.user)) return res.status(403).json({ error: 'Forbidden' });

  const versions = await findRowsEq('AssetVersions', 'assetId', asset.id);
  const version = versions.find((v) => v.id === req.params.versionId);
  if (!version) return res.status(404).json({ error: 'Version not found' });
  if (versions.length === 1) {
    return res.status(400).json({ error: 'Cannot delete the only version — delete the whole asset instead.' });
  }

  const isExternal = String(version.external) === 'true' || version.external === true;
  if (!isExternal) {
    await Promise.all([
      version.driveFileId ? deleteObject(version.driveFileId).catch(() => {}) : null,
      version.previewDriveFileId ? deleteObject(version.previewDriveFileId).catch(() => {}) : null,
    ]);
  }

  await Promise.all([
    deleteRows('Comments', 'versionId', version.id),
    deleteRows('Approvals', 'versionId', version.id),
  ]);
  await deleteRow('AssetVersions', 'id', version.id);

  if (asset.currentVersionId === version.id) {
    const remaining = versions.filter((v) => v.id !== version.id).sort((a, b) => b.versionNumber - a.versionNumber);
    await updateRow('Assets', 'id', asset.id, { currentVersionId: remaining[0].id });
  }

  logActivity({
    projectId: asset.projectId,
    type: 'version_deleted',
    message: `Deleted v${version.versionNumber} of "${asset.title}"`,
    actor: req.user.sub,
  });

  res.json({ ok: true });
});

export default router;
