# Proof Vault — Setup

The whole backend rides on one Google Sheet + one Apps Script Web App deployed
from inside it. No GCP project, no service account key, no SMTP credentials.

## 1. Create the Google Sheet

Create a blank Google Sheet — this is your database. Tabs and header rows
(`Projects`, `Assets`, `AssetVersions`, `Comments`, `Approvals`,
`DownloadLinks`, `AccessTokens`, `ActivityLog`) are created automatically the
first time the proxy runs `sheets.ensureSchema`. No manual tab setup needed.

## 2. Deploy the Apps Script proxy

1. In the Sheet: **Extensions → Apps Script**.
2. Delete the placeholder `Code.gs` content and paste in the contents of
   `apps-script/Code.gs` from this repo. Save (Ctrl+S).
3. Set the shared secret directly — this is simpler than running
   `setSecret_()` and avoids a couple of editor quirks (the function
   dropdown can be slow to pick up a freshly-pasted script, and running any
   function the first time triggers a permissions prompt anyway):
   - Click the **⚙️ Project Settings** gear icon in the left sidebar.
   - Scroll to **Script Properties → Add script property**.
   - Property: `PROOF_VAULT_SECRET`. Value: any long random string you
     choose (this is the same value you'll put in `APPS_SCRIPT_SECRET`
     below — copy it somewhere before moving on).
   - Click **Save script properties**.
4. **Deploy → New deployment → type: Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone** (the shared secret is what actually gates
     access — every request is rejected without it)
   - The first deployment will prompt you to grant permissions (Sheets +
     Drive, scoped to what this script touches) — accept them.
5. Copy the deployment's **Web app URL**.
6. This script owns a Drive folder called "Proof Vault Files" (auto-created
   on first upload) — all uploaded proofs and generated previews live there,
   private to the script owner's Drive, never public.

## 3. Server environment

```
cp server/.env.example server/.env
```

Fill in:
- `APPS_SCRIPT_URL` — the Web app URL from step 2.5
- `APPS_SCRIPT_SECRET` — the secret from step 2.3
- `JWT_SECRET` — any long random string
- `TEAM_ALLOWLIST` — comma-separated emails allowed to sign in as team
- `TEAM_PASSCODE` — a shared passcode team members enter alongside their
  email to sign in (see step 4)
- `APP_BASE_URL` — where the client is served (e.g. `http://localhost:5173`)

## 4. Team sign-in

No OAuth client, no Google Cloud project needed for this either. Team
sign-in is just an allowlisted email + a shared passcode, both checked
server-side against `TEAM_ALLOWLIST` and `TEAM_PASSCODE` in `.env`. Give
the passcode to whoever's on the team; anyone not in `TEAM_ALLOWLIST` is
rejected even with the correct passcode.

## 5. Run it

```
cd server && npm install && npm run dev
cd client && npm install && npm run dev
```

Visit `http://localhost:5173`.

## 6. Sharing the review portal with authors

There's no SMTP integration — clicking **Generate review link** on a project
creates a magic link and shows it in a copy-to-clipboard modal. Send it to
the author however you normally would (email, Slack, etc). The link is
project-scoped and expires automatically (`MAGIC_LINK_TTL_MINUTES`, 14 days
by default since it's shared manually rather than clicked straight from an
email). Secure download links work the same way — generate, copy, send.

## 7. Known limitation: file size / duration

The Apps Script Web App is the file storage layer (via Drive), and its
responses are base64-encoded JSON with roughly a 50MB payload cap and a
~6-minute execution limit per call. That's comfortable for covers, interior
PDFs, manuscripts, and audio samples. Large video trailers (multi-GB) may hit
that ceiling — if that becomes a real need, the storage layer
(`server/src/lib/driveStorage.js`) is isolated enough to swap for direct
Drive API access (or GCS) later without touching the routes above it.

## 8. Security notes

- Drive file IDs are never sent to the client — `driveFileId` /
  `previewDriveFileId` are stripped from every API response
  (`server/src/routes/*.js`), and downloads/previews stream through Express.
- Secure download tokens are generated with `nanoid` (cryptographically
  random, URL-safe, 16+ chars) and optionally password-protected with bcrypt.
- `/d/:token` is rate-limited (`DOWNLOAD_RATE_LIMIT_*` env vars).
- Author sessions are JWTs scoped to a single `projectId` — they can't read
  any other project's data even if they guess an asset ID.
- The Apps Script secret is a bearer credential for your entire Sheet +
  Drive folder — keep `APPS_SCRIPT_SECRET` out of version control same as
  any other secret (already covered by `.gitignore`).
