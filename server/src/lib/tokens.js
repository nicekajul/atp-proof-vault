import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { config } from '../config.js';

export function signTeamJwt(user) {
  return jwt.sign(
    { sub: user.email, role: 'team', name: user.name || user.email },
    config.jwtSecret,
    { expiresIn: config.teamJwtTtl }
  );
}

export function signAuthorJwt(projectId) {
  return jwt.sign(
    { sub: projectId, role: 'author', projectId },
    config.jwtSecret,
    { expiresIn: config.authorJwtTtl }
  );
}

export function signReviewerJwt(projectId) {
  return jwt.sign(
    { sub: projectId, role: 'reviewer', projectId },
    config.jwtSecret,
    { expiresIn: config.authorJwtTtl }
  );
}

export function verifyJwt(token) {
  return jwt.verify(token, config.jwtSecret);
}

/** Random, unguessable, URL-safe token (default 21 chars via nanoid). */
export function generateToken(size = 24) {
  return nanoid(size);
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain, hash) {
  if (!hash) return true; // no password set
  return bcrypt.compare(plain, hash);
}
