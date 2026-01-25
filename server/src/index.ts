import express from 'express';
import cors from 'cors';
import { projectRouter } from './routes/project.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Routes
app.use('/api', projectRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`🎨 Pixel Art server running on http://localhost:${PORT}`);
});

