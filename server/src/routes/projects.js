import express from 'express';
import { v4 as uuid } from 'uuid';
import { appendRow, findRow, findRowsEq, getRows, updateRow } from '../lib/sheetsDb.js';
import { generateToken } from '../lib/tokens.js';
import { requireTeam, requireProjectAccess, requireTeamProjectOwner } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';
import { config } from '../config.js';

const router = express.Router();

const STAGES = ['Manuscript', 'Editing', 'Cover Design', 'Interior Layout', 'Proof Review', 'Approved', 'Delivered'];

router.get('/projects', requireTeam, async (req, res) => {
  const [allProjects, assets, approvals] = await Promise.all([
    getRows('Projects'),
    getRows('Assets'),
    getRows('Approvals'),
  ]);

  const projects = allProjects.filter((p) => p.createdBy === req.user.sub);

  const summary = projects.map((p) => {
    const projectAssets = assets.filter((a) => a.projectId === p.id);
    const approvedCount = projectAssets.filter((a) => a.status === 'approved').length;
    const lastActivity = approvals
      .filter((ap) => projectAssets.some((a) => a.id === ap.assetId))
      .sort((a, b) => new Date(b.decidedAt) - new Date(a.decidedAt))[0];

    return {
      ...stripRow(p),
      assetCount: projectAssets.length,
      approvedCount,
      overdue: Boolean(p.dueDate) && new Date(p.dueDate) < new Date() && p.status !== 'complete',
      lastActivityAt: lastActivity?.decidedAt || null,
    };
  });

  res.json({ projects: summary, stages: STAGES });
});

router.post('/projects', requireTeam, async (req, res) => {
  const { title, authorName, authorEmail, publisher, brandLogoUrl, brandPrimaryColor, dueDate } = req.body;
  if (!title || !authorEmail) return res.status(400).json({ error: 'title and authorEmail are required' });

  const now = new Date().toISOString();
  const project = {
    id: uuid(),
    title,
    authorName: authorName || '',
    authorEmail,
    publisher: publisher || '',
    stage: STAGES[0],
    status: 'active',
    brandLogoUrl: brandLogoUrl || '',
    brandPrimaryColor: brandPrimaryColor || '#111111',
    dueDate: dueDate || '',
    createdAt: now,
    updatedAt: now,
    createdBy: req.user.sub,
  };
  await appendRow('Projects', project);
  logActivity({ projectId: project.id, type: 'project_created', message: `Project "${title}" created`, actor: req.user.sub });
  res.status(201).json({ project });
});

router.get('/projects/:id', requireProjectAccess, async (req, res) => {
  const project = await findRow('Projects', 'id', req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  if (req.author && req.author.projectId !== project.id) return res.status(403).json({ error: 'Forbidden' });
  res.json({ project: stripRow(project), stages: STAGES });
});

router.patch('/projects/:id', requireTeamProjectOwner, async (req, res) => {
  const allowed = ['title', 'authorName', 'authorEmail', 'publisher', 'stage', 'status', 'brandLogoUrl', 'brandPrimaryColor', 'dueDate'];
  const patch = {};
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
  patch.updatedAt = new Date().toISOString();

  const updated = await updateRow('Projects', 'id', req.params.id, patch);
  if (!updated) return res.status(404).json({ error: 'Not found' });

  logActivity({
    projectId: req.params.id,
    type: 'project_updated',
    message: `Project updated (${Object.keys(patch).join(', ')})`,
    actor: req.user.sub,
  });
  res.json({ project: stripRow(updated) });
});

/**
 * POST /api/projects/:id/invite — creates a magic-link review token and
 * returns the URL for the team to copy and share themselves (no SMTP;
 * see LinksManager-style "generate, then copy" flow on the client).
 * Body: { expiresAt? } — an ISO datetime; defaults to MAGIC_LINK_TTL_MINUTES
 * from now if omitted.
 */
router.post('/projects/:id/invite', requireTeamProjectOwner, async (req, res) => {
  const project = req.project;

  const token = generateToken(20);
  const requested = req.body?.expiresAt ? new Date(req.body.expiresAt) : null;
  const expiresAt = (requested && !isNaN(requested)
    ? requested
    : new Date(Date.now() + config.magicLinkTtlMinutes * 60000)
  ).toISOString();
  await appendRow('AccessTokens', {
    token,
    projectId: project.id,
    role: 'author',
    expiresAt,
    usedAt: '',
    createdAt: new Date().toISOString(),
  });

  logActivity({ projectId: project.id, type: 'invite_created', message: 'Review link generated', actor: req.user.sub });
  res.json({ url: `${config.appBaseUrl}/review/${token}`, expiresAt });
});

router.post('/projects/:id/invite-reviewer', requireTeamProjectOwner, async (req, res) => {
  const project = req.project;

  const token = generateToken(20);
  const requested = req.body?.expiresAt ? new Date(req.body.expiresAt) : null;
  const expiresAt = (requested && !isNaN(requested)
    ? requested
    : new Date(Date.now() + config.magicLinkTtlMinutes * 60000)
  ).toISOString();
  await appendRow('AccessTokens', {
    token,
    projectId: project.id,
    role: 'reviewer',
    expiresAt,
    usedAt: '',
    createdAt: new Date().toISOString(),
  });

  logActivity({ projectId: project.id, type: 'reviewer_invite_created', message: 'Collaborator review link generated', actor: req.user.sub });
  res.json({ url: `${config.appBaseUrl}/review/${token}`, expiresAt });
});

router.get('/projects/:id/activity', requireProjectAccess, async (req, res) => {
  const rows = await findRowsEq('ActivityLog', 'projectId', req.params.id);
  rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ activity: rows.map(stripRow) });
});

function stripRow(r) {
  const { _row, ...rest } = r;
  return rest;
}

export default router;
