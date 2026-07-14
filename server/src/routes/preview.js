import express from 'express';
import { findRow } from '../lib/sheetsDb.js';
import { readObjectBuffer } from '../lib/driveStorage.js';
import { getPdfPageCount, renderPdfPage } from '../lib/preview.js';
import { requireProjectAccess } from '../middleware/auth.js';

const router = express.Router();

async function resolveVersionScope(req, res, next) {
  const version = await findRow('AssetVersions', 'id', req.params.versionId);
  if (!version) return res.status(404).json({ error: 'Not found' });
  const asset = await findRow('Assets', 'id', version.assetId);
  if (!asset) return res.status(404).json({ error: 'Not found' });
  req.params.projectId = asset.projectId;
  req.version = version;
  next();
}

/** GET /api/preview/:versionId/pdf-meta — page count for the flipbook viewer. */
router.get('/preview/:versionId/pdf-meta', resolveVersionScope, requireProjectAccess, async (req, res) => {
  const version = req.version;
  if (version.mimeType !== 'application/pdf') return res.status(400).json({ error: 'Not a PDF' });
  if (String(version.external) === 'true' || version.external === true) {
    return res.status(400).json({ error: 'This version is an external link — use its embedUrl instead.' });
  }
  try {
    const pageCount = await getPdfPageCount(version.id, async () => (await readObjectBuffer(version.driveFileId)).buffer);
    res.json({ pageCount });
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

/** GET /api/preview/:versionId/pdf-page/:n — rasterized page (1-indexed) for the flipbook viewer. */
router.get('/preview/:versionId/pdf-page/:n', resolveVersionScope, requireProjectAccess, async (req, res) => {
  const version = req.version;
  if (version.mimeType !== 'application/pdf') return res.status(400).json({ error: 'Not a PDF' });
  if (String(version.external) === 'true' || version.external === true) {
    return res.status(400).json({ error: 'This version is an external link — use its embedUrl instead.' });
  }
  const pageNumber = parseInt(req.params.n, 10);
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return res.status(400).json({ error: 'Invalid page number' });

  try {
    const jpeg = await renderPdfPage(version.id, pageNumber, async () => (await readObjectBuffer(version.driveFileId)).buffer);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.end(jpeg);
  } catch {
    res.status(404).json({ error: 'Page not found' });
  }
});

/**
 * GET /api/preview/:versionId — serves a preview (or original for
 * video/audio) through the backend. Supports HTTP Range for scrubbing by
 * slicing the buffer fetched from Drive (the proxy has no native range
 * support). Requires either a team session or an author session scoped to
 * the version's project; the Drive file id is never exposed to the client.
 */
router.get('/preview/:versionId', async (req, res, next) => {
  // Resolve the owning project first so requireProjectAccess can check scope.
  const version = await findRow('AssetVersions', 'id', req.params.versionId);
  if (!version) return res.status(404).json({ error: 'Not found' });
  const asset = await findRow('Assets', 'id', version.assetId);
  if (!asset) return res.status(404).json({ error: 'Not found' });
  req.params.projectId = asset.projectId;
  next();
}, requireProjectAccess, async (req, res) => {
  const version = await findRow('AssetVersions', 'id', req.params.versionId);
  if (String(version.external) === 'true' || version.external === true) {
    return res.status(400).json({ error: 'This version is an external link — use its embedUrl instead.' });
  }
  const fileId = version.previewDriveFileId || version.driveFileId;
  const mimeType = version.previewDriveFileId ? 'image/jpeg' : version.mimeType;

  let file;
  try {
    file = await readObjectBuffer(fileId);
  } catch {
    return res.status(404).json({ error: 'File not found' });
  }

  const size = file.buffer.length;
  const range = req.headers.range;

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.setHeader('Accept-Ranges', 'bytes');

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match[1] ? parseInt(match[1], 10) : 0;
    const end = match[2] ? Math.min(parseInt(match[2], 10), size - 1) : size - 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    res.setHeader('Content-Length', end - start + 1);
    res.end(file.buffer.subarray(start, end + 1));
  } else {
    res.setHeader('Content-Length', size);
    res.end(file.buffer);
  }
});

export default router;
