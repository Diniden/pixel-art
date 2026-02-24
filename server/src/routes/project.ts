import { Router, Request, Response } from 'express';
import { readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import {
  safeWriteFile,
  ensureDir,
  DATA_DIR,
  getProjectFilePath,
  loadConfig,
  saveConfig,
  listProjects,
  projectExists,
  renameProjectFile,
  deleteProjectFile,
  runBackupForProject,
  listBackupsForProject,
  readBackupFile
} from '../backup.js';

export const projectRouter = Router();

// Ensure data directory exists
async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

// Validate project name (no special characters, reasonable length)
function isValidProjectName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  if (name.length === 0 || name.length > 100) return false;
  // Allow alphanumeric, spaces, hyphens, underscores
  if (!/^[a-zA-Z0-9\s\-_]+$/.test(name)) return false;
  // Don't allow names that could conflict with system files
  if (name === 'config' || name.startsWith('.')) return false;
  return true;
}

// GET /api/config - Get current project name
projectRouter.get('/config', async (_req: Request, res: Response) => {
  try {
    const config = await loadConfig();
    res.json(config);
  } catch (error) {
    console.error('Error loading config:', error);
    res.status(500).json({ error: 'Failed to load config' });
  }
});

// POST /api/config - Set current project name
projectRouter.post('/config', async (req: Request, res: Response) => {
  try {
    const { currentProject } = req.body;

    if (!isValidProjectName(currentProject)) {
      res.status(400).json({ error: 'Invalid project name' });
      return;
    }

    await saveConfig({ currentProject });
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving config:', error);
    res.status(500).json({ error: 'Failed to save config' });
  }
});

// GET /api/projects - List all projects
projectRouter.get('/projects', async (_req: Request, res: Response) => {
  try {
    await ensureDataDir();
    const projects = await listProjects();
    res.json({ projects });
  } catch (error) {
    console.error('Error listing projects:', error);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

// GET /api/project - Load current or specified project
projectRouter.get('/project', async (req: Request, res: Response) => {
  try {
    await ensureDataDir();

    // Get project name from query param or use current project from config
    let projectName = req.query.name as string | undefined;

    if (!projectName) {
      const config = await loadConfig();
      projectName = config.currentProject;
    }

    const projectFile = getProjectFilePath(projectName);

    if (!existsSync(projectFile)) {
      res.status(404).json({ error: 'No project found', projectName });
      return;
    }

    const data = await readFile(projectFile, 'utf-8');
    const project = JSON.parse(data);
    res.json(project);
  } catch (error) {
    console.error('Error loading project:', error);
    res.status(500).json({ error: 'Failed to load project' });
  }
});

// POST /api/project - Save project (using safe write)
projectRouter.post('/project', async (req: Request, res: Response) => {
  try {
    await ensureDataDir();

    // Get project name from query param or use current project from config
    let projectName = req.query.name as string | undefined;

    if (!projectName) {
      const config = await loadConfig();
      projectName = config.currentProject;
    }

    const project = req.body;

    if (!project || typeof project !== 'object') {
      res.status(400).json({ error: 'Invalid project data' });
      return;
    }

    const projectFile = getProjectFilePath(projectName);
    const projectContent = JSON.stringify(project);

    // Save without pretty-printing to minimize file size
    // Using safe write: temp file + atomic rename
    await safeWriteFile(projectFile, projectContent);

    // Run backup check (will only backup if 5+ minutes since last backup)
    const backupCreated = await runBackupForProject(projectName, projectContent);

    res.json({ success: true, backupCreated });
  } catch (error) {
    console.error('Error saving project:', error);
    res.status(500).json({ error: 'Failed to save project' });
  }
});

// POST /api/project/create - Create a new project
projectRouter.post('/project/create', async (req: Request, res: Response) => {
  try {
    await ensureDataDir();

    const { name, projectData } = req.body;

    if (!isValidProjectName(name)) {
      res.status(400).json({ error: 'Invalid project name' });
      return;
    }

    if (projectExists(name)) {
      res.status(409).json({ error: 'Project already exists' });
      return;
    }

    const projectFile = getProjectFilePath(name);

    // Save the project data (or empty project if no data provided)
    const dataToSave = projectData || {};
    await safeWriteFile(projectFile, JSON.stringify(dataToSave));

    // Update config to switch to the new project
    await saveConfig({ currentProject: name });

    res.json({ success: true, projectName: name });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// POST /api/project/rename - Rename a project
projectRouter.post('/project/rename', async (req: Request, res: Response) => {
  try {
    const { oldName, newName } = req.body;

    if (!isValidProjectName(oldName) || !isValidProjectName(newName)) {
      res.status(400).json({ error: 'Invalid project name' });
      return;
    }

    if (!projectExists(oldName)) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    if (projectExists(newName)) {
      res.status(409).json({ error: 'A project with that name already exists' });
      return;
    }

    await renameProjectFile(oldName, newName);

    // If the renamed project was the current one, update config
    const config = await loadConfig();
    if (config.currentProject === oldName) {
      await saveConfig({ currentProject: newName });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error renaming project:', error);
    res.status(500).json({ error: 'Failed to rename project' });
  }
});

// DELETE /api/project - Delete a project
projectRouter.delete('/project', async (req: Request, res: Response) => {
  try {
    const { name } = req.query;

    if (!name || typeof name !== 'string' || !isValidProjectName(name)) {
      res.status(400).json({ error: 'Invalid project name' });
      return;
    }

    if (!projectExists(name)) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Get list of projects before deletion
    const projects = await listProjects();

    // Don't allow deleting the last project
    if (projects.length <= 1) {
      res.status(400).json({ error: 'Cannot delete the last project' });
      return;
    }

    await deleteProjectFile(name);

    // If the deleted project was the current one, switch to another
    const config = await loadConfig();
    if (config.currentProject === name) {
      const remainingProjects = projects.filter(p => p !== name);
      await saveConfig({ currentProject: remainingProjects[0] });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// POST /api/project/switch - Switch to a different project
projectRouter.post('/project/switch', async (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    if (!isValidProjectName(name)) {
      res.status(400).json({ error: 'Invalid project name' });
      return;
    }

    if (!projectExists(name)) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    await saveConfig({ currentProject: name });

    res.json({ success: true });
  } catch (error) {
    console.error('Error switching project:', error);
    res.status(500).json({ error: 'Failed to switch project' });
  }
});

// GET /api/project/backups - List unzipped backups for a project
projectRouter.get('/project/backups', async (req: Request, res: Response) => {
  try {
    let projectName = req.query.name as string | undefined;

    if (!projectName) {
      const config = await loadConfig();
      projectName = config.currentProject;
    }

    const backups = await listBackupsForProject(projectName);
    res.json({ backups });
  } catch (error) {
    console.error('Error listing backups:', error);
    res.status(500).json({ error: 'Failed to list backups' });
  }
});

// POST /api/project/restore-backup - Restore a project from a backup file
projectRouter.post('/project/restore-backup', async (req: Request, res: Response) => {
  try {
    const { date, filename } = req.body;

    if (!date || !filename) {
      res.status(400).json({ error: 'Missing date or filename' });
      return;
    }

    const backupContent = await readBackupFile(date, filename);

    // Validate it's valid JSON
    JSON.parse(backupContent);

    // Get current project name
    let projectName = req.query.name as string | undefined;
    if (!projectName) {
      const config = await loadConfig();
      projectName = config.currentProject;
    }

    // Overwrite the current project file with the backup content
    const projectFile = getProjectFilePath(projectName);
    await safeWriteFile(projectFile, backupContent);

    res.json({ success: true });
  } catch (error) {
    console.error('Error restoring backup:', error);
    res.status(500).json({ error: 'Failed to restore backup' });
  }
});

// POST /api/project/backup - Create a backup before migration (legacy endpoint)
projectRouter.post('/project/backup', async (req: Request, res: Response) => {
  try {
    await ensureDataDir();

    const project = req.body;

    if (!project || typeof project !== 'object') {
      res.status(400).json({ error: 'Invalid project data' });
      return;
    }

    // Get current project name
    const config = await loadConfig();
    const projectName = config.currentProject;

    const BACKUP_FILE = `${DATA_DIR}/${projectName}.migration-backup.json`;

    // Only create backup if one doesn't already exist (don't overwrite previous backups)
    if (!existsSync(BACKUP_FILE)) {
      await safeWriteFile(BACKUP_FILE, JSON.stringify(project));
      console.log('Created migration backup at:', BACKUP_FILE);
      res.json({ success: true, message: 'Backup created' });
    } else {
      console.log('Migration backup already exists, skipping');
      res.json({ success: true, message: 'Backup already exists' });
    }
  } catch (error) {
    console.error('Error creating backup:', error);
    res.status(500).json({ error: 'Failed to create backup' });
  }
});
