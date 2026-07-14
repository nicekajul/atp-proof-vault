/**
 * Proof Vault — Apps Script backend proxy.
 *
 * Bind this script to the Google Sheet used as the database
 * (Extensions > Apps Script, from inside the Sheet). It serves two jobs:
 *   1. CRUD over the Sheet's tabs (replaces googleapis + a service account key).
 *   2. File storage in a Drive folder (replaces the GCS bucket).
 *
 * Deploy as a Web App (Execute as: Me, Who has access: Anyone), then set
 * APPS_SCRIPT_URL + APPS_SCRIPT_SECRET in server/.env. Every request must
 * include the matching secret or it is rejected — treat this URL like an API
 * key holder, not something to share publicly.
 *
 * Set the secret once via Project Settings > Script Properties, or run
 * setSecret_() below from the Apps Script editor.
 */

const SECRET_PROPERTY = 'PROOF_VAULT_SECRET';
const ROOT_FOLDER_PROPERTY = 'PROOF_VAULT_ROOT_FOLDER_ID';

const SCHEMA = {
  Projects: ['id', 'title', 'authorName', 'authorEmail', 'publisher', 'stage', 'status', 'brandLogoUrl', 'brandPrimaryColor', 'dueDate', 'createdAt', 'updatedAt', 'createdBy'],
  Assets: ['id', 'projectId', 'type', 'title', 'currentVersionId', 'status', 'createdAt'],
  AssetVersions: ['id', 'assetId', 'versionNumber', 'driveFileId', 'previewDriveFileId', 'mimeType', 'fileSize', 'uploadedBy', 'uploadNote', 'external', 'externalUrl', 'createdAt'],
  Comments: ['id', 'assetId', 'versionId', 'authorType', 'authorName', 'body', 'posX', 'posY', 'boxW', 'boxH', 'page', 'resolved', 'reviewerChecked', 'createdAt'],
  Approvals: ['id', 'assetId', 'versionId', 'decision', 'decidedBy', 'note', 'decidedAt'],
  DownloadLinks: ['token', 'driveFileId', 'friendlyName', 'mimeType', 'expiresAt', 'maxDownloads', 'downloadsUsed', 'passwordHash', 'active', 'createdBy', 'createdAt'],
  AccessTokens: ['token', 'projectId', 'role', 'expiresAt', 'usedAt', 'createdAt'],
  ActivityLog: ['id', 'projectId', 'type', 'message', 'actor', 'ip', 'createdAt'],
};

/** One-time helper: run this from the editor to set the shared secret. */
function setSecret_() {
  const secret = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty(SECRET_PROPERTY, secret);
  Logger.log('Secret set. Copy this into APPS_SCRIPT_SECRET: %s', secret);
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut_({ ok: false, error: 'Invalid JSON body' });
  }

  const expected = PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY);
  if (!expected || body.secret !== expected) {
    return jsonOut_({ ok: false, error: 'Unauthorized' });
  }

  try {
    const data = route_(body.action, body.payload || {});
    return jsonOut_({ ok: true, data: data });
  } catch (err) {
    return jsonOut_({ ok: false, error: String((err && err.message) || err) });
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function route_(action, payload) {
  switch (action) {
    case 'sheets.ensureSchema': return ensureSchema_();
    case 'sheets.getRows': return getRows_(payload.tab);
    case 'sheets.appendRow': return appendRow_(payload.tab, payload.record);
    case 'sheets.updateRow': return updateRow_(payload.tab, payload.keyField, payload.keyValue, payload.patch);
    case 'sheets.findRow': return findRow_(payload.tab, payload.field, payload.value);
    case 'sheets.findRows': return findRowsBy_(payload.tab, payload.field, payload.value);
    case 'sheets.findRowsIn': return findRowsIn_(payload.tab, payload.field, payload.values);
    case 'sheets.deleteRow': return deleteRow_(payload.tab, payload.field, payload.value);
    case 'sheets.deleteRows': return deleteRows_(payload.tab, payload.field, payload.value);
    case 'drive.upload': return driveUpload_(payload.path, payload.base64, payload.mimeType);
    case 'drive.download': return driveDownload_(payload.fileId);
    case 'drive.metadata': return driveMetadata_(payload.fileId);
    case 'drive.exists': return driveExists_(payload.fileId);
    case 'drive.delete': return driveDelete_(payload.fileId);
    default: throw new Error('Unknown action: ' + action);
  }
}

// --- Sheets ---------------------------------------------------------------

function getSheet_(tab, createIfMissing) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(tab);
  if (!sheet && createIfMissing) {
    sheet = ss.insertSheet(tab);
  }
  return sheet;
}

function ensureSchema_() {
  Object.keys(SCHEMA).forEach(function (tab) {
    const headers = SCHEMA[tab];
    const sheet = getSheet_(tab, true);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  });
  return { ok: true };
}

function getRows_(tab) {
  const headers = SCHEMA[tab];
  if (!headers) throw new Error('Unknown sheet tab: ' + tab);
  const sheet = getSheet_(tab, false);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  return values.map(function (row, i) {
    const obj = { _row: i + 2 };
    headers.forEach(function (h, idx) { obj[h] = row[idx]; });
    return obj;
  });
}

function appendRow_(tab, record) {
  const headers = SCHEMA[tab];
  if (!headers) throw new Error('Unknown sheet tab: ' + tab);
  const sheet = getSheet_(tab, true);
  const row = headers.map(function (h) { return record[h] === undefined || record[h] === null ? '' : record[h]; });
  sheet.appendRow(row);
  return record;
}

function updateRow_(tab, keyField, keyValue, patch) {
  const headers = SCHEMA[tab];
  if (!headers) throw new Error('Unknown sheet tab: ' + tab);
  const existing = findRow_(tab, keyField, keyValue);
  if (!existing) return null;

  const updated = Object.assign({}, existing, patch);
  const sheet = getSheet_(tab, false);
  const row = headers.map(function (h) { return updated[h] === undefined || updated[h] === null ? '' : updated[h]; });
  sheet.getRange(existing._row, 1, 1, headers.length).setValues([row]);
  return updated;
}

function findRow_(tab, field, value) {
  const rows = getRows_(tab);
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][field]) === String(value)) return rows[i];
  }
  return null;
}

/** Server-side equality filter — avoids shipping the whole tab back over the wire. */
function findRowsBy_(tab, field, value) {
  const headers = SCHEMA[tab];
  if (!headers) throw new Error('Unknown sheet tab: ' + tab);
  return getRows_(tab).filter(function (r) { return String(r[field]) === String(value); });
}

/** Server-side "field is one of these values" filter, for joining across tabs. */
function findRowsIn_(tab, field, values) {
  const headers = SCHEMA[tab];
  if (!headers) throw new Error('Unknown sheet tab: ' + tab);
  const set = {};
  (values || []).forEach(function (v) { set[String(v)] = true; });
  return getRows_(tab).filter(function (r) { return Object.prototype.hasOwnProperty.call(set, String(r[field])); });
}

function deleteRow_(tab, field, value) {
  const headers = SCHEMA[tab];
  if (!headers) throw new Error('Unknown sheet tab: ' + tab);
  const rows = getRows_(tab);
  const match = rows.find(function (r) { return String(r[field]) === String(value); });
  if (!match) return 0;
  getSheet_(tab, false).deleteRow(match._row);
  return 1;
}

function deleteRows_(tab, field, value) {
  const headers = SCHEMA[tab];
  if (!headers) throw new Error('Unknown sheet tab: ' + tab);
  const rows = getRows_(tab).filter(function (r) { return String(r[field]) === String(value); });
  if (rows.length === 0) return 0;
  const sheet = getSheet_(tab, false);
  // Delete bottom-up so earlier row indices stay valid as rows shift up.
  rows.sort(function (a, b) { return b._row - a._row; });
  rows.forEach(function (r) { sheet.deleteRow(r._row); });
  return rows.length;
}

// --- Drive storage ----------------------------------------------------------

function getRootFolder_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(ROOT_FOLDER_PROPERTY);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* fall through and recreate */ }
  }
  const folder = DriveApp.createFolder('Proof Vault Files');
  props.setProperty(ROOT_FOLDER_PROPERTY, folder.getId());
  return folder;
}

function getOrCreateFolderPath_(segments) {
  let folder = getRootFolder_();
  segments.forEach(function (name) {
    const existing = folder.getFoldersByName(name);
    folder = existing.hasNext() ? existing.next() : folder.createFolder(name);
  });
  return folder;
}

/** payload.path is a "/"-separated virtual path; only used to organize folders. */
function driveUpload_(path, base64, mimeType) {
  const parts = String(path).split('/').filter(Boolean);
  const filename = parts.pop() || 'file';
  const folder = getOrCreateFolderPath_(parts);
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType || 'application/octet-stream', filename);
  const file = folder.createFile(blob);
  return { fileId: file.getId(), size: file.getSize() };
}

function driveDownload_(fileId) {
  const file = DriveApp.getFileById(fileId);
  const blob = file.getBlob();
  return {
    base64: Utilities.base64Encode(blob.getBytes()),
    mimeType: blob.getContentType(),
    size: file.getSize(),
    name: file.getName(),
  };
}

function driveMetadata_(fileId) {
  const file = DriveApp.getFileById(fileId);
  return { size: file.getSize(), mimeType: file.getBlob().getContentType(), name: file.getName() };
}

function driveExists_(fileId) {
  try {
    DriveApp.getFileById(fileId);
    return true;
  } catch (e) {
    return false;
  }
}

function driveDelete_(fileId) {
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch (e) {
    // already gone — ignore
  }
  return { ok: true };
}
