import express from 'express';
import { findRowsEq, findRowsIn } from '../lib/sheetsDb.js';
import { requireTeamProjectOwner } from '../middleware/auth.js';

const router = express.Router();

/** GET /api/projects/:id/assets — team view of all assets + current version + approvals. */
router.get('/projects/:id/assets', requireTeamProjectOwner, async (req, res) => {
  const projectId = req.params.id;
  const assets = await findRowsEq('Assets', 'projectId', projectId);

  const assetIds = assets.map((a) => a.id);
  const [versions, approvals, comments] = await Promise.all([
    findRowsIn('AssetVersions', 'assetId', assetIds),
    findRowsIn('Approvals', 'assetId', assetIds),
    findRowsIn('Comments', 'assetId', assetIds),
  ]);

  const result = assets.map((a) => ({
    ...stripRow(a),
    versions: versions.filter((v) => v.assetId === a.id).map(stripVersion),
    approvals: approvals.filter((ap) => ap.assetId === a.id).map(stripRow),
    comments: comments.filter((c) => c.assetId === a.id).map(stripRow),
  }));

  res.json({ assets: result });
});

/** GET /api/projects/:id/certificate — sign-off summary for PDF export on the client. */
router.get('/projects/:id/certificate', requireTeamProjectOwner, async (req, res) => {
  const projectId = req.params.id;
  const project = req.project;
  const assets = await findRowsEq('Assets', 'projectId', projectId);

  const assetIds = assets.map((a) => a.id);
  const [approvals, versions] = await Promise.all([
    findRowsIn('Approvals', 'assetId', assetIds),
    findRowsIn('AssetVersions', 'assetId', assetIds),
  ]);

  const rows = assets.map((a) => {
    const latest = approvals
      .filter((ap) => ap.assetId === a.id)
      .sort((x, y) => new Date(y.decidedAt) - new Date(x.decidedAt))[0];
    const approvedVersion = versions.find((v) => v.id === latest?.versionId);
    return {
      assetTitle: a.title,
      assetType: a.type,
      versionNumber: approvedVersion ? Number(approvedVersion.versionNumber) : null,
      decision: latest?.decision || 'pending',
      decidedBy: latest?.decidedBy || '',
      decidedAt: latest?.decidedAt || '',
      note: latest?.note || '',
    };
  });

  res.json({
    project: { title: project.title, authorName: project.authorName, publisher: project.publisher },
    generatedAt: new Date().toISOString(),
    rows,
  });
});

function stripRow(r) {
  const { _row, ...rest } = r;
  return rest;
}

// Versions carry driveFileId/previewDriveFileId — never send those to any client.
// External (linked) versions are the one exception: they get an embedUrl
// pointing at the source's own player (Drive, YouTube, or a direct video
// URL), since that's the point of linking instead of uploading (bypasses
// the Apps Script proxy's size/time cap).
function stripVersion(v) {
  const { _row, driveFileId, previewDriveFileId, externalUrl, ...rest } = v;
  const isExternal = String(v.external) === 'true' || v.external === true;
  if (!isExternal || !externalUrl) return rest;
  const embedKind = /drive\.google\.com|youtube\.com/.test(externalUrl) ? 'iframe' : 'video';
  return { ...rest, embedUrl: externalUrl, embedKind };
}

export default router;
