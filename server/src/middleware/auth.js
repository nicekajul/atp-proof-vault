import { verifyJwt } from '../lib/tokens.js';
import { findRow } from '../lib/sheetsDb.js';
import { isProjectOwner } from '../lib/ownership.js';

function extractToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies && req.cookies.token) return req.cookies.token;
  return null;
}

export function requireTeam(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = verifyJwt(token);
    if (payload.role !== 'team') return res.status(403).json({ error: 'Forbidden' });
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

export function requireAuthor(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = verifyJwt(token);
    if (payload.role !== 'author') return res.status(403).json({ error: 'Forbidden' });
    req.author = payload; // { projectId }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

export function requirePortal(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = verifyJwt(token);
    if (payload.role === 'author') {
      req.author = payload;
      return next();
    }
    if (payload.role === 'reviewer') {
      req.reviewer = payload;
      return next();
    }
    return res.status(403).json({ error: 'Forbidden' });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

export function requireTeamOrPortal(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = verifyJwt(token);
    if (payload.role === 'team') {
      req.user = payload;
      return next();
    }
    if (payload.role === 'author') {
      req.author = payload;
      return next();
    }
    if (payload.role === 'reviewer') {
      req.reviewer = payload;
      return next();
    }
    return res.status(403).json({ error: 'Forbidden' });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

/** Accepts either a team member who owns the project, or an author/reviewer scoped to the route's project id (`:projectId` or `:id`). */
export async function requireProjectAccess(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const routeProjectId = req.params.projectId || req.params.id;
  try {
    const payload = verifyJwt(token);
    if (payload.role === 'team') {
      const project = await findRow('Projects', 'id', routeProjectId);
      if (!isProjectOwner(project, payload)) return res.status(403).json({ error: 'Forbidden' });
      req.user = payload;
      return next();
    }
    if (payload.role === 'author' && payload.projectId === routeProjectId) {
      req.author = payload;
      return next();
    }
    if (payload.role === 'reviewer' && payload.projectId === routeProjectId) {
      req.reviewer = payload;
      return next();
    }
    return res.status(403).json({ error: 'Forbidden' });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

/** Team-only, and only if the team member is the project's creator (`:projectId` or `:id`). */
export async function requireTeamProjectOwner(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const routeProjectId = req.params.projectId || req.params.id;
  try {
    const payload = verifyJwt(token);
    if (payload.role !== 'team') return res.status(403).json({ error: 'Forbidden' });
    const project = await findRow('Projects', 'id', routeProjectId);
    if (!isProjectOwner(project, payload)) return res.status(403).json({ error: 'Forbidden' });
    req.user = payload;
    req.project = project;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}
