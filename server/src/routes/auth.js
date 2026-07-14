import express from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { findRow, updateRow } from '../lib/sheetsDb.js';
import { signTeamJwt, signAuthorJwt, signReviewerJwt, verifyJwt } from '../lib/tokens.js';
import { logActivity } from '../lib/activity.js';

const router = express.Router();

const gateLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

/**
 * POST /api/auth/login — team sign-in via allowlisted email + shared passcode.
 * No OAuth client needed. Body: { email, passcode }.
 */
router.post('/auth/login', gateLimiter, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const passcode = String(req.body?.passcode || '');

  if (!email || !passcode) {
    return res.status(400).json({ error: 'Email and passcode are required.' });
  }
  if (!config.teamAllowlist.includes(email)) {
    return res.status(403).json({ error: 'This account is not authorized for team access.' });
  }
  if (!config.teamPasscode || passcode !== config.teamPasscode) {
    return res.status(401).json({ error: 'Incorrect passcode.' });
  }

  const jwtToken = signTeamJwt({ email });
  logActivity({ type: 'team_login', message: `${email} signed in`, actor: email });
  res.json({ token: jwtToken, user: { email } });
});

/**
 * GET /api/auth/review/:token — validates a magic link and returns an
 * author session JWT scoped to that project. Single-use is soft-enforced
 * (usedAt is recorded but link stays valid until its own expiry, so the
 * author can revisit the portal across multiple sessions).
 */
router.get('/auth/review/:token', gateLimiter, async (req, res) => {
  const access = await findRow('AccessTokens', 'token', req.params.token);
  if (!access) return res.status(404).json({ error: 'Invalid or expired link.' });
  if (access.expiresAt && new Date(access.expiresAt) < new Date()) {
    return res.status(410).json({ error: 'This link has expired.' });
  }

  if (!access.usedAt) {
    await updateRow('AccessTokens', 'token', access.token, { usedAt: new Date().toISOString() });
  }

  const role = String(access.role || 'author').trim().toLowerCase() === 'reviewer' ? 'reviewer' : 'author';
  const portalJwt = role === 'reviewer' ? signReviewerJwt(access.projectId) : signAuthorJwt(access.projectId);
  logActivity({
    projectId: access.projectId,
    type: 'portal_opened',
    message: role === 'reviewer' ? 'Reviewer opened the review portal' : 'Author opened the review portal',
    actor: role,
    ip: req.ip,
  });

  res.json({ token: portalJwt, projectId: access.projectId, role });
});

/** GET /api/auth/me — introspects the current session (team or author). */
router.get('/auth/me', (req, res) => {
  const header = req.headers.authorization;
  const raw = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies?.token;
  if (!raw) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = verifyJwt(raw);
    res.json({ role: payload.role, sub: payload.sub, projectId: payload.projectId });
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
});

export default router;
