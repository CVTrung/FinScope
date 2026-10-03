import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createApp } from './app.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = createApp();
const production = process.argv.includes('--production') || process.env.NODE_ENV === 'production';
if (production) {
  app.use(express.static(resolve(root, 'dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve(root, 'dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () =>
  console.log(`FinScope: http://localhost:${port} (${production ? 'production' : 'development'})`),
);
