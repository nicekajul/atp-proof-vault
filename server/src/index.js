import app from './app.js';
import { config } from './config.js';
import { ensureSchema } from './lib/sheetsDb.js';

// Local/standalone entry point (`npm run dev` / `npm start`). Not used on
// Vercel, where /api/index.js imports app.js directly and the platform owns
// the request loop — see vercel.json.
async function start() {
  try {
    await ensureSchema();
    console.log('[sheetsDb] schema verified');
  } catch (err) {
    console.warn('[sheetsDb] could not verify schema on startup:', err.message);
  }

  app.listen(config.port, () => {
    console.log(`Proof Vault server listening on :${config.port}`);
  });
}

start();
