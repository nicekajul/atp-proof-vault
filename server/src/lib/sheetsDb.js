import { callAppsScript } from './appsScript.js';

// Single source of truth for tab names + header columns (kept in sync with
// the SCHEMA constant in apps-script/Code.gs — update both together).
export const SCHEMA = {
  Projects: [
    'id', 'title', 'authorName', 'authorEmail', 'publisher', 'stage', 'status',
    'brandLogoUrl', 'brandPrimaryColor', 'dueDate', 'createdAt', 'updatedAt', 'createdBy',
  ],
  Assets: [
    'id', 'projectId', 'type', 'title', 'currentVersionId', 'status', 'createdAt',
  ],
  AssetVersions: [
    'id', 'assetId', 'versionNumber', 'driveFileId', 'previewDriveFileId', 'mimeType',
    'fileSize', 'uploadedBy', 'uploadNote', 'external', 'externalUrl', 'createdAt',
  ],
  Comments: [
    'id', 'assetId', 'versionId', 'authorType', 'authorName', 'body', 'posX', 'posY',
    'boxW', 'boxH', 'page', 'resolved', 'reviewerChecked', 'createdAt',
  ],
  Approvals: [
    'id', 'assetId', 'versionId', 'decision', 'decidedBy', 'note', 'decidedAt',
  ],
  DownloadLinks: [
    'token', 'driveFileId', 'friendlyName', 'mimeType', 'expiresAt', 'maxDownloads',
    'downloadsUsed', 'passwordHash', 'active', 'createdBy', 'createdAt',
  ],
  AccessTokens: [
    'token', 'projectId', 'role', 'expiresAt', 'usedAt', 'createdAt',
  ],
  ActivityLog: [
    'id', 'projectId', 'type', 'message', 'actor', 'ip', 'createdAt',
  ],
};

/** Ensures all tabs/headers exist in the Sheet. Safe to call repeatedly. */
export async function ensureSchema() {
  await callAppsScript('sheets.ensureSchema');
}

/** Reads all rows from a tab as an array of plain objects keyed by header. */
export async function getRows(tab) {
  if (!SCHEMA[tab]) throw new Error(`Unknown sheet tab: ${tab}`);
  return callAppsScript('sheets.getRows', { tab });
}

/** Appends a new row. `record` keys must match the tab's headers (missing = blank). */
export async function appendRow(tab, record) {
  if (!SCHEMA[tab]) throw new Error(`Unknown sheet tab: ${tab}`);
  await callAppsScript('sheets.appendRow', { tab, record });
  return record;
}

/**
 * Updates specific fields of a row, matched by a unique key column (e.g. 'id' or 'token').
 * Returns the updated record, or null if no matching row was found.
 */
export async function updateRow(tab, keyField, keyValue, patch) {
  if (!SCHEMA[tab]) throw new Error(`Unknown sheet tab: ${tab}`);
  return callAppsScript('sheets.updateRow', { tab, keyField, keyValue, patch });
}

/** Finds the first row where `field` === `value`. Returns null if not found. */
export async function findRow(tab, field, value) {
  if (!SCHEMA[tab]) throw new Error(`Unknown sheet tab: ${tab}`);
  return callAppsScript('sheets.findRow', { tab, field, value });
}

/** Finds all rows matching a predicate function (client-side filter over getRows). */
export async function findRows(tab, predicate) {
  const rows = await getRows(tab);
  return rows.filter(predicate);
}

/**
 * Finds all rows where `field` === `value`, filtered inside Apps Script so only
 * matching rows cross the wire — much cheaper than findRows() once a tab holds
 * data from many projects.
 */
export async function findRowsEq(tab, field, value) {
  if (!SCHEMA[tab]) throw new Error(`Unknown sheet tab: ${tab}`);
  return callAppsScript('sheets.findRows', { tab, field, value });
}

/** Finds all rows where `field` is one of `values` (a join, filtered server-side). */
export async function findRowsIn(tab, field, values) {
  if (!SCHEMA[tab]) throw new Error(`Unknown sheet tab: ${tab}`);
  if (!values || values.length === 0) return [];
  return callAppsScript('sheets.findRowsIn', { tab, field, values });
}

/** Deletes the first row where `field` === `value`. Returns the number of rows deleted (0 or 1). */
export async function deleteRow(tab, field, value) {
  if (!SCHEMA[tab]) throw new Error(`Unknown sheet tab: ${tab}`);
  return callAppsScript('sheets.deleteRow', { tab, field, value });
}

/** Deletes every row where `field` === `value`. Returns the number of rows deleted. */
export async function deleteRows(tab, field, value) {
  if (!SCHEMA[tab]) throw new Error(`Unknown sheet tab: ${tab}`);
  return callAppsScript('sheets.deleteRows', { tab, field, value });
}
