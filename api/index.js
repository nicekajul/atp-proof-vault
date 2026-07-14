// Vercel serverless entry point. All /api/* and /d/* traffic is rewritten
// here (see vercel.json) — Express does its own internal routing based on
// the real request path, which Vercel preserves through the rewrite.
import app from '../server/src/app.js';

export default app;
