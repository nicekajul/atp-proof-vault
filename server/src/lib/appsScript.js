import { config } from '../config.js';

/**
 * Thin client for the Apps Script Web App proxy (see /apps-script/Code.gs).
 * It fronts both the Sheets database and Drive file storage, so the Node
 * backend never needs a service account key.
 */
export async function callAppsScript(action, payload = {}) {
  if (!config.appsScript.url || !config.appsScript.secret) {
    throw new Error('APPS_SCRIPT_URL / APPS_SCRIPT_SECRET are not configured');
  }

  const res = await fetch(config.appsScript.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: config.appsScript.secret, action, payload }),
    // Apps Script Web Apps issue a redirect to the actual execution URL.
    redirect: 'follow',
  });

  if (!res.ok) {
    throw new Error(`Apps Script proxy HTTP ${res.status}`);
  }

  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || 'Apps Script proxy call failed');
  }
  return json.data;
}
