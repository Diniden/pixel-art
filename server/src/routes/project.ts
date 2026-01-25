import { Router, Request, Response } from 'express';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const PROJECT_FILE = join(DATA_DIR, 'project.json');

export const projectRouter = Router();

// Ensure data directory exists
async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

// GET /api/project - Load project
projectRouter.get('/project', async (_req: Request, res: Response) => {
  try {
    await ensureDataDir();

    if (!existsSync(PROJECT_FILE)) {
      res.status(404).json({ error: 'No project found' });
      return;
    }

    const data = await readFile(PROJECT_FILE, 'utf-8');
    const project = JSON.parse(data);
    res.json(project);
  } catch (error) {
    console.error('Error loading project:', error);
    res.status(500).json({ error: 'Failed to load project' });
  }
});

// POST /api/project - Save project
projectRouter.post('/project', async (req: Request, res: Response) => {
  try {
    await ensureDataDir();

    const project = req.body;

    if (!project || typeof project !== 'object') {
      res.status(400).json({ error: 'Invalid project data' });
      return;
    }

    // Save without pretty-printing to minimize file size
    await writeFile(PROJECT_FILE, JSON.stringify(project), 'utf-8');
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving project:', error);
    res.status(500).json({ error: 'Failed to save project' });
  }
});

