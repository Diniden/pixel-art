import express from 'express';
import cors from 'cors';
import { projectRouter } from './routes/project.js';
import { exportRouter, DEFAULT_EXPORT_FOLDER } from './routes/export.js';
import { aiRouter } from './routes/ai.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
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
