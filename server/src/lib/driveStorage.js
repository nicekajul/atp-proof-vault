import { callAppsScript } from './appsScript.js';

/**
 * File storage backed by Google Drive, via the Apps Script proxy. Replaces
 * the GCS bucket module — same "never leak the location to the client"
 * contract, except the opaque handle is a Drive fileId instead of a bucket
 * path, and reads/writes go through Apps Script's JSON+base64 interface
 * rather than a true byte stream.
 *
 * Note: Apps Script Web Apps cap response payloads (~50MB) and execution
 * time (~6 min), so this suits images/PDFs/manuscripts/audio well but very
 * large video trailers may need to stay under that ceiling.
 */

/** Uploads a buffer to Drive under a virtual folder path; returns the new fileId. */
export async function uploadObject(path, buffer, { contentType } = {}) {
  const { fileId } = await callAppsScript('drive.upload', {
    path,
    base64: buffer.toString('base64'),
    mimeType: contentType || 'application/octet-stream',
  });
  return fileId;
}

// The Drive round trip (JSON + base64 over the Apps Script proxy) is slow —
// tens of seconds for a large manuscript or video. Cache the decoded buffer
// by fileId so repeat reads (re-downloads, video scrubbing via Range
// requests, etc.) don't re-pay that cost. Files never change in place (a new
// upload always gets a new fileId), so there's no staleness risk.
const TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 30;
const MAX_CACHEABLE_BYTES = 60 * 1024 * 1024;

const bufferCache = new Map(); // fileId -> { value, at }

function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of bufferCache) {
    if (now - entry.at > TTL_MS) bufferCache.delete(key);
  }
  while (bufferCache.size > MAX_ENTRIES) {
    bufferCache.delete(bufferCache.keys().next().value);
  }
}

/** Downloads the full file into memory. Returns { buffer, mimeType, size, name }. */
export async function readObjectBuffer(fileId) {
  const cached = bufferCache.get(fileId);
  if (cached) {
    cached.at = Date.now();
    return cached.value;
  }
  const { base64, mimeType, size, name } = await callAppsScript('drive.download', { fileId });
  const value = { buffer: Buffer.from(base64, 'base64'), mimeType, size, name };
  if (value.buffer.length <= MAX_CACHEABLE_BYTES) {
    bufferCache.set(fileId, { value, at: Date.now() });
    pruneCache();
  }
  return value;
}

export async function getObjectMetadata(fileId) {
  return callAppsScript('drive.metadata', { fileId });
}

export async function objectExists(fileId) {
  if (!fileId) return false;
  return callAppsScript('drive.exists', { fileId });
}

export async function deleteObject(fileId) {
  await callAppsScript('drive.delete', { fileId });
}
