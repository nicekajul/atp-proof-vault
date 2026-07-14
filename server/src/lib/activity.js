import { v4 as uuid } from 'uuid';
import { appendRow } from './sheetsDb.js';

/**
 * Fire-and-forget by design — callers should NOT await this. Activity log
 * writes are their own Apps Script round trip; blocking the response on them
 * just adds latency for something the user doesn't need confirmed inline.
 */
export async function logActivity({ projectId, type, message, actor, ip }) {
  try {
    await appendRow('ActivityLog', {
      id: uuid(),
      projectId: projectId || '',
      type,
      message,
      actor: actor || 'system',
      ip: ip || '',
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[activity] failed to log:', err.message);
  }
}
