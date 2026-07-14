import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { ensureSchema } from './lib/sheetsDb.js';

import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import projectAssetRoutes from './routes/projectAssets.js';
import assetRoutes from './routes/assets.js';
import reviewRoutes from './routes/review.js';
import previewRoutes from './routes/preview.js';
import { apiRouter as linkApiRoutes, downloadRouter } from './routes/links.js';

const app = express();

app.use(cors({ origin: config.appBaseUrl, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api', authRoutes);
app.use('/api', projectRoutes);
app.use('/api', projectAssetRoutes);
app.use('/api', assetRoutes);
app.use('/api', reviewRoutes);
app.use('/api', previewRoutes);
app.use('/api', linkApiRoutes); // /api/links*
app.use('/', downloadRouter);   // /d/:token (public download)

// Fallback error handler — never leak internals (paths, stack traces) to clients.
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});

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
