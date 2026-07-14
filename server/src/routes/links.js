import express from 'express';
import rateLimit from 'express-rate-limit';
import { appendRow, findRow, updateRow, getRows } from '../lib/sheetsDb.js';
import { readObjectBuffer, objectExists } from '../lib/driveStorage.js';
import { generateToken, hashPassword, verifyPassword } from '../lib/tokens.js';
import { requireTeam } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';
import { isProjectOwner } from '../lib/ownership.js';

const apiRouter = express.Router();
const downloadRouter = express.Router();

const downloadLimiter = rateLimit({
  windowMs: (Number(process.env.DOWNLOAD_RATE_LIMIT_WINDOW_MIN) || 15) * 60 * 1000,
  max: Number(process.env.DOWNLOAD_RATE_LIMIT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

/**
 * POST /api/links — team creates a secure link for an existing asset version.
 * Body: { versionId, friendlyName, expiresAt?, maxDownloads?, password? }
 * The client only ever refers to files by versionId — the Drive fileId is
 * resolved here server-side and is stored only in the DownloadLinks sheet;
 * it is never echoed back in any response.
 */
apiRouter.post('/links', requireTeam, async (req, res) => {
  const { versionId, friendlyName, expiresAt, maxDownloads, password } = req.body;
  if (!versionId || !friendlyName) {
    return res.status(400).json({ error: 'versionId and friendlyName are required' });
  }

  const version = await findRow('AssetVersions', 'id', versionId);
  if (!version) return res.status(404).json({ error: 'Source file not found' });
  const asset = await findRow('Assets', 'id', version.assetId);
  if (!asset) return res.status(404).json({ error: 'Source file not found' });
  const project = await findRow('Projects', 'id', asset.projectId);
  if (!isProjectOwner(project, req.user)) return res.status(403).json({ error: 'Forbidden' });
  const { driveFileId, mimeType } = version;

  const exists = await objectExists(driveFileId);
  if (!exists) return res.status(404).json({ error: 'Source file not found' });

  const token = generateToken(16);
  const passwordHash = password ? await hashPassword(password) : '';

  await appendRow('DownloadLinks', {
    token,
    driveFileId,
    friendlyName,
    mimeType: mimeType || 'application/octet-stream',
    expiresAt: expiresAt || '',
    maxDownloads: maxDownloads || '',
    downloadsUsed: 0,
    passwordHash,
    active: true,
    createdBy: req.user.sub,
    createdAt: new Date().toISOString(),
  });

  logActivity({
    type: 'link_created',
    message: `Secure link created for "${friendlyName}"`,
    actor: req.user.sub,
  });

  res.status(201).json({
    url: `${req.protocol}://${req.get('host')}/d/${token}`,
    token,
    friendlyName,
    expiresAt: expiresAt || null,
    maxDownloads: maxDownloads || null,
    hasPassword: Boolean(password),
  });
});

/** GET /api/links — team lists their own links (no driveFileId exposed). */
apiRouter.get('/links', requireTeam, async (req, res) => {
  const rows = (await getRows('DownloadLinks')).filter((r) => r.createdBy === req.user.sub);
  const links = rows.map((r) => ({
    token: r.token,
    friendlyName: r.friendlyName,
    mimeType: r.mimeType,
    expiresAt: r.expiresAt || null,
    maxDownloads: r.maxDownloads || null,
    downloadsUsed: Number(r.downloadsUsed || 0),
    hasPassword: Boolean(r.passwordHash),
    active: String(r.active) === 'true' || r.active === true,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
  }));
  res.json({ links });
});

/** PATCH /api/links/:token/revoke — team revokes a link immediately. */
apiRouter.patch('/links/:token/revoke', requireTeam, async (req, res) => {
  const link = await findRow('DownloadLinks', 'token', req.params.token);
  if (!link) return res.status(404).json({ error: 'Link not found' });
  if (link.createdBy !== req.user.sub) return res.status(403).json({ error: 'Forbidden' });

  const updated = await updateRow('DownloadLinks', 'token', req.params.token, { active: false });
  logActivity({
    type: 'link_revoked',
    message: `Secure link "${updated.friendlyName}" revoked`,
    actor: req.user.sub,
  });
  res.json({ ok: true });
});

/** Shared validation for both the interstitial page and the actual file route. */
async function resolveDownloadLink(token) {
  const link = await findRow('DownloadLinks', 'token', token);
  if (!link || !(String(link.active) === 'true' || link.active === true)) {
    return { status: 410, message: 'This link is no longer available.' };
  }
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    return { status: 410, message: 'This link has expired.' };
  }
  const max = Number(link.maxDownloads || 0);
  const used = Number(link.downloadsUsed || 0);
  if (max > 0 && used >= max) {
    return { status: 410, message: 'This link has reached its download limit.' };
  }
  return { link };
}

/**
 * GET /d/:token — public download endpoint. No auth required (token itself
 * is the credential). Reading the file through the Apps Script proxy can
 * take a long time for a large file (tens of seconds), so this only does the
 * fast checks (state, password) and then hands off to an interstitial page
 * that immediately shows a "preparing your download" message — otherwise the
 * browser tab just sits blank the whole time, which looks broken.
 */
downloadRouter.get('/d/:token', downloadLimiter, async (req, res) => {
  const { link, status, message } = await resolveDownloadLink(req.params.token);
  if (!link) return res.status(status).send(message);

  if (link.passwordHash) {
    const supplied = req.query.password || req.body?.password;
    const ok = await verifyPassword(supplied || '', link.passwordHash);
    if (!ok) {
      // Lightweight password gate page — no info about the file leaks here.
      return res.status(401).send(passwordGateHtml(req.params.token, Boolean(supplied)));
    }
  }

  res.send(interstitialHtml(req.params.token, req.query.password));
});

/**
 * GET /d/:token/file — does the actual (slow) Drive read and streams the
 * file with attachment headers. Kicked off by the interstitial page above,
 * not meant to be linked to directly.
 */
downloadRouter.get('/d/:token/file', downloadLimiter, async (req, res) => {
  const { link, status, message } = await resolveDownloadLink(req.params.token);
  if (!link) return res.status(status).send(message);

  if (link.passwordHash) {
    const supplied = req.query.password || req.body?.password;
    const ok = await verifyPassword(supplied || '', link.passwordHash);
    if (!ok) return res.status(401).send('Unauthorized');
  }

  let file;
  try {
    file = await readObjectBuffer(link.driveFileId);
  } catch {
    return res.status(404).send('File not found.');
  }

  res.setHeader('Content-Type', link.mimeType || file.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(link.friendlyName)}"`);
  res.setHeader('Content-Length', file.buffer.length);
  res.setHeader('Cache-Control', 'no-store');
  res.send(file.buffer);

  await updateRow('DownloadLinks', 'token', link.token, { downloadsUsed: Number(link.downloadsUsed || 0) + 1 });
  logActivity({
    type: 'download',
    message: `Downloaded "${link.friendlyName}"`,
    actor: 'external',
    ip: req.ip,
  });
});

function sanitizeFilename(name) {
  return String(name || 'download').replace(/["\r\n]/g, '');
}

function interstitialHtml(token, password) {
  const fileUrl = `/d/${token}/file${password ? `?password=${encodeURIComponent(password)}` : ''}`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Preparing your download…</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5;text-align:center}
  .card{background:#fff;padding:32px;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);max-width:340px}
  .spinner{width:28px;height:28px;border:3px solid #ddd;border-top-color:#111;border-radius:50%;margin:0 auto 16px;animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  p{color:#666;font-size:13px;margin:8px 0 0}
</style></head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <strong>Preparing your download…</strong>
    <p>This can take up to a minute for larger files. Don't close this tab — it'll start automatically.</p>
  </div>
  <script>window.location.href = ${JSON.stringify(fileUrl)};</script>
</body></html>`;
}

function passwordGateHtml(token, wasWrong) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Password required</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5}
  form{background:#fff;padding:32px;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);width:320px}
  h2{margin:0 0 16px;font-size:18px}
  input{width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;margin-bottom:12px}
  button{width:100%;padding:10px;border:none;border-radius:6px;background:#111;color:#fff;cursor:pointer}
  .err{color:#c0392b;font-size:13px;margin-bottom:12px}
</style></head>
<body>
  <form method="GET" action="/d/${token}">
    <h2>This file is password protected</h2>
    ${wasWrong ? '<div class="err">Incorrect password. Try again.</div>' : ''}
    <input type="password" name="password" placeholder="Enter password" autofocus required>
    <button type="submit">Unlock</button>
  </form>
</body></html>`;
}

export { apiRouter, downloadRouter };
