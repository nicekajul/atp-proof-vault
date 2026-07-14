import express from 'express';
import { v4 as uuid } from 'uuid';
import { appendRow, findRow, findRowsEq, findRowsIn, updateRow } from '../lib/sheetsDb.js';
import { requireAuthor, requirePortal, requireTeam } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';
import { isProjectOwner } from '../lib/ownership.js';

async function assertTeamOwnsAsset(req, assetId) {
  const asset = await findRow('Assets', 'id', assetId);
  if (!asset) return null;
  const project = await findRow('Projects', 'id', asset.projectId);
  if (!isProjectOwner(project, req.user)) return null;
  return asset;
}

const router = express.Router();

async function assertAssetInScope(req, assetId) {
  const asset = await findRow('Assets', 'id', assetId);
  if (!asset) return null;
  const projectId = req.author?.projectId || req.reviewer?.projectId;
  if (projectId && asset.projectId !== projectId) return null;
  return asset;
}

/** GET /api/review/project — assets + versions + comments for the author's or reviewer's project. */
router.get('/review/project', requirePortal, async (req, res) => {
  const projectId = req.author?.projectId || req.reviewer?.projectId;
  if (!projectId) return res.status(403).json({ error: 'Forbidden' });
  const [project, assets] = await Promise.all([
    findRow('Projects', 'id', projectId),
    findRowsEq('Assets', 'projectId', projectId),
  ]);
  if (!project) return res.status(404).json({ error: 'Not found' });

  const assetIds = assets.map((a) => a.id);
  const [versions, comments, approvals] = await Promise.all([
    findRowsIn('AssetVersions', 'assetId', assetIds),
    findRowsIn('Comments', 'assetId', assetIds),
    findRowsIn('Approvals', 'assetId', assetIds),
  ]);

  res.json({
    project: stripRow(project),
    assets: assets.map(stripRow),
    versions: versions.map(stripVersion),
    comments: comments.map(stripRow),
    approvals: approvals.map(stripRow),
  });
});

router.post('/assets/:id/approve', requireAuthor, async (req, res) => {
  const asset = await assertAssetInScope(req, req.params.id);
  if (!asset) return res.status(404).json({ error: 'Not found' });

  await decide(req, res, asset, 'approved', 'author');
});

router.post('/assets/:id/request-changes', requireAuthor, async (req, res) => {
  const asset = await assertAssetInScope(req, req.params.id);
  if (!asset) return res.status(404).json({ error: 'Not found' });

  await decide(req, res, asset, 'changes_requested', 'author');
});

router.post('/assets/:id/reviewer-approve', requirePortal, async (req, res) => {
  if (!req.reviewer) return res.status(403).json({ error: 'Forbidden' });
  const asset = await assertAssetInScope(req, req.params.id);
  if (!asset) return res.status(404).json({ error: 'Not found' });

  await decide(req, res, asset, 'reviewer_approved', 'reviewer');
});

router.post('/assets/:id/reviewer-request-changes', requirePortal, async (req, res) => {
  if (!req.reviewer) return res.status(403).json({ error: 'Forbidden' });
  const asset = await assertAssetInScope(req, req.params.id);
  if (!asset) return res.status(404).json({ error: 'Not found' });

  await decide(req, res, asset, 'reviewer_changes_requested', 'reviewer');
});

// Final approval of an asset ("Approve") is deliberately author-only — see
// /assets/:id/approve above. The team lead can flag issues back to whoever
// uploaded (final-request-changes), and can acknowledge that a collaborator's
// requested changes have been addressed, but cannot approve on the author's
// behalf. This avoids a misclick finalizing a project the author never saw.
router.post('/assets/:id/final-request-changes', requireTeam, async (req, res) => {
  const asset = await assertTeamOwnsAsset(req, req.params.id);
  if (!asset) return res.status(404).json({ error: 'Not found' });

  await decide(req, res, asset, 'changes_requested', 'team');
});

router.post('/assets/:id/acknowledge-changes', requireTeam, async (req, res) => {
  const asset = await assertTeamOwnsAsset(req, req.params.id);
  if (!asset) return res.status(404).json({ error: 'Not found' });

  await decide(req, res, asset, 'reviewer_changes_acknowledged', 'team');
});

const STATUS_BY_DECISION = {
  approved: 'approved',
  changes_requested: 'changes_requested',
  reviewer_approved: 'review_pending',
  reviewer_changes_requested: 'review_pending',
  // Team addressed the collaborator's notes — sends it back to the author
  // for the actual approval, rather than finalizing anything itself.
  reviewer_changes_acknowledged: 'pending',
};

function decisionMessage(decision, actor, assetTitle) {
  if (decision === 'reviewer_changes_acknowledged') {
    return `${actor} marked the collaborator's requested changes on "${assetTitle}" as addressed`;
  }
  const verb = decision === 'approved' || decision === 'reviewer_approved' ? 'approved' : 'flagged for changes';
  return `"${assetTitle}" ${verb} by ${actor}`;
}

async function decide(req, res, asset, decision, actor) {
  const { note } = req.body;
  const approval = {
    id: uuid(),
    assetId: asset.id,
    versionId: asset.currentVersionId,
    decision,
    decidedBy: actor,
    note: note || '',
    decidedAt: new Date().toISOString(),
  };
  await appendRow('Approvals', approval);
  const nextStatus = STATUS_BY_DECISION[decision] || asset.status;
  await updateRow('Assets', 'id', asset.id, { status: nextStatus });

  logActivity({
    projectId: asset.projectId,
    type: `asset_${decision}`,
    message: decisionMessage(decision, actor, asset.title),
    actor,
  });

  res.json({ approval: stripRow(approval) });
}

router.post('/assets/:id/comments', requirePortal, async (req, res) => {
  const asset = await assertAssetInScope(req, req.params.id);
  if (!asset) return res.status(404).json({ error: 'Not found' });

  const { body, versionId, posX, posY, boxW, boxH, page, authorName } = req.body;
  if (!body) return res.status(400).json({ error: 'Comment body required' });

  const isReviewer = Boolean(req.reviewer);
  const comment = {
    id: uuid(),
    assetId: asset.id,
    versionId: versionId || asset.currentVersionId,
    authorType: isReviewer ? 'reviewer' : 'author',
    authorName: authorName || (isReviewer ? 'Reviewer' : 'Author'),
    body,
    posX: posX ?? '',
    posY: posY ?? '',
    boxW: boxW ?? '',
    boxH: boxH ?? '',
    page: page ?? '',
    resolved: false,
    reviewerChecked: false,
    createdAt: new Date().toISOString(),
  };
  await appendRow('Comments', comment);
  logActivity({ projectId: asset.projectId, type: 'comment_added', message: `Comment added on "${asset.title}"`, actor: isReviewer ? 'reviewer' : 'author' });
  res.status(201).json({ comment: stripRow(comment) });
});

router.patch('/comments/:id/reviewer-check', requirePortal, async (req, res) => {
  if (!req.reviewer) return res.status(403).json({ error: 'Forbidden' });
  const comment = await findRow('Comments', 'id', req.params.id);
  if (!comment) return res.status(404).json({ error: 'Not found' });
  const asset = await findRow('Assets', 'id', comment.assetId);
  if (!asset || asset.projectId !== req.reviewer.projectId) return res.status(403).json({ error: 'Forbidden' });

  const checked = req.body?.checked === true;
  const updated = await updateRow('Comments', 'id', comment.id, { reviewerChecked: checked ? 'true' : '' });
  logActivity({ projectId: asset.projectId, type: 'comment_reviewed', message: `${checked ? 'Reviewer checked' : 'Reviewer unchecked'} note "${comment.body}"`, actor: 'reviewer' });
  res.json({ comment: stripRow(updated) });
});

/** Team-side: reply/add a comment (e.g. clarifying a change request). */
router.post('/assets/:id/team-comments', requireTeam, async (req, res) => {
  const asset = await assertTeamOwnsAsset(req, req.params.id);
  if (!asset) return res.status(404).json({ error: 'Not found' });

  const { body, versionId } = req.body;
  if (!body) return res.status(400).json({ error: 'Comment body required' });

  const comment = {
    id: uuid(),
    assetId: asset.id,
    versionId: versionId || asset.currentVersionId,
    authorType: 'team',
    authorName: req.user.sub,
    body,
    posX: '',
    posY: '',
    boxW: '',
    boxH: '',
    page: '',
    resolved: false,
    createdAt: new Date().toISOString(),
  };
  await appendRow('Comments', comment);
  res.status(201).json({ comment: stripRow(comment) });
});

router.patch('/comments/:id/resolve', requireTeam, async (req, res) => {
  const comment = await findRow('Comments', 'id', req.params.id);
  if (!comment) return res.status(404).json({ error: 'Not found' });
  const asset = await assertTeamOwnsAsset(req, comment.assetId);
  if (!asset) return res.status(404).json({ error: 'Not found' });

  const updated = await updateRow('Comments', 'id', req.params.id, { resolved: true });
  res.json({ comment: stripRow(updated) });
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
