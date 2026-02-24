import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

import express from 'express';
import cors from 'cors';
import { projectRouter } from './routes/project.js';
import { exportRouter, DEFAULT_EXPORT_FOLDER } from './routes/export.js';
import { aiRouter } from './routes/ai.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware — allow all origins by default so the client can live on a
// different host/port without CORS issues.
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve exported project assets (textures, frames.json, etc.)
const exportsDir = process.env.EXPORT_FOLDER || DEFAULT_EXPORT_FOLDER;
app.use('/exports', express.static(exportsDir));

// Routes
app.use('/api', projectRouter);
app.use('/api', exportRouter);
app.use('/api', aiRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, async () => {
  console.log(`🎨 Pixel Art server running on http://localhost:${PORT}`);
  console.log('📁 Backups will be created on auto-save (max every 5 minutes per project)');
});
