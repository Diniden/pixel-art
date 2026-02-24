import { readFile, writeFile, mkdir, readdir, unlink, stat, rename, rm } from 'fs/promises';
import { existsSync, createWriteStream } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import { createGzip } from 'zlib';
import * as crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const BACKUPS_DIR = join(DATA_DIR, 'backups');
const CONFIG_FILE = join(DATA_DIR, 'config.json');

const BACKUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes minimum between backups
const MAX_BACKUPS_PER_DAY = 50;

// Track last backup time and hash per project
interface ProjectBackupState {
  lastBackupTime: number;
  lastBackupHash: string | null;
}

const projectBackupStates: Map<string, ProjectBackupState> = new Map();

/**
 * Generate a hash of file content for comparison
 */
function generateHash(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Get the current date folder name in MM-DD-YYYY format
 */
function getDateFolderName(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const year = now.getFullYear();
  return `${month}-${day}-${year}`;
}

/**
 * Get timestamp string for backup filename (HH-MM-SS)
 */
function getTimestampString(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}-${minutes}-${seconds}`;
}

/**
 * Ensure a directory exists
 */
async function ensureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Safe file write: write to temp file first, then rename
 */
async function safeWriteFile(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.tmp.${Date.now()}`;

  try {
    // Write to temporary file
    await writeFile(tempPath, content, 'utf-8');

    // Verify the temp file was written correctly by reading it back
    const verification = await readFile(tempPath, 'utf-8');
    if (verification !== content) {
      throw new Error('Write verification failed: content mismatch');
    }

    // Atomic rename (this is atomic on most filesystems)
    await rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      if (existsSync(tempPath)) {
        await unlink(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Compress a folder to .gz using gzip
 */
async function compressAndDeleteFolder(folderPath: string): Promise<void> {
  const folderName = basename(folderPath);
  const gzipPath = `${folderPath}.gz`;

  try {
    // Read all backup files in the folder
    const files = await readdir(folderPath);
    const backupFiles = files.filter(f => f.endsWith('.json'));

    if (backupFiles.length === 0) {
      console.log(`No backup files in ${folderName}, deleting empty folder`);
      await rm(folderPath, { recursive: true, force: true });
      return;
    }

    // Create a combined JSON with all backups (for simplicity without tar)
    const combined: { [filename: string]: unknown } = {};
    for (const file of backupFiles) {
      const content = await readFile(join(folderPath, file), 'utf-8');
      combined[file] = JSON.parse(content);
    }

    // Write combined JSON
    const combinedContent = JSON.stringify(combined);

    // Compress using gzip with maximum compression
    const tempPath = `${gzipPath}.tmp`;
    const writeStream = createWriteStream(tempPath);
    const gzip = createGzip({ level: 9 }); // Maximum compression

    await new Promise<void>((resolve, reject) => {
      gzip.on('error', reject);
      writeStream.on('error', reject);
      writeStream.on('finish', resolve);

      gzip.write(combinedContent);
      gzip.end();
      gzip.pipe(writeStream);
    });

    // Rename to final path
    await rename(tempPath, gzipPath);

    // Delete the original folder
    await rm(folderPath, { recursive: true, force: true });

    console.log(`Compressed ${folderName} with ${backupFiles.length} backups to ${basename(gzipPath)}`);
  } catch (error) {
    console.error(`Error compressing folder ${folderName}:`, error);
  }
}

/**
 * Parse date from folder name (MM-DD-YYYY format)
 */
function parseDateFromFolderName(name: string): Date | null {
  const match = name.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;

  const month = parseInt(match[1], 10) - 1; // JavaScript months are 0-indexed
  const day = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  return new Date(year, month, day);
}

/**
 * Check if a date folder is from a previous day
 */
function isPreviousDay(folderName: string): boolean {
  const folderDate = parseDateFromFolderName(folderName);
  if (!folderDate) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  folderDate.setHours(0, 0, 0, 0);

  return folderDate.getTime() < today.getTime();
}

/**
 * Get backup files in a folder sorted by modification time (oldest first)
 */
async function getSortedBackupFiles(folderPath: string): Promise<string[]> {
  const files = await readdir(folderPath);
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  // Get file stats and sort by mtime
  const fileStats = await Promise.all(
    jsonFiles.map(async (file) => {
      const filePath = join(folderPath, file);
      const stats = await stat(filePath);
      return { file, mtime: stats.mtime.getTime() };
    })
  );

  fileStats.sort((a, b) => a.mtime - b.mtime);
  return fileStats.map(fs => fs.file);
}

/**
 * Cleanup old backups in a folder (keep only MAX_BACKUPS_PER_DAY)
 */
async function cleanupOldBackups(folderPath: string): Promise<void> {
  const sortedFiles = await getSortedBackupFiles(folderPath);

  if (sortedFiles.length > MAX_BACKUPS_PER_DAY) {
    const filesToDelete = sortedFiles.slice(0, sortedFiles.length - MAX_BACKUPS_PER_DAY);
    for (const file of filesToDelete) {
      await unlink(join(folderPath, file));
      console.log(`Deleted old backup: ${file}`);
    }
  }
}

/**
 * Get the project file path for a given project name
 */
function getProjectFilePath(projectName: string): string {
  return join(DATA_DIR, `${projectName}.json`);
}

/**
 * Run backup for a specific project (called on auto-save)
 * Returns true if backup was created, false if skipped
 */
export async function runBackupForProject(projectName: string, projectContent: string): Promise<boolean> {
  try {
    await ensureDir(BACKUPS_DIR);

    const currentHash = generateHash(projectContent);
    const now = Date.now();

    // Get or create backup state for this project
    let backupState = projectBackupStates.get(projectName);
    if (!backupState) {
      backupState = { lastBackupTime: 0, lastBackupHash: null };
      projectBackupStates.set(projectName, backupState);
    }

    // Check if enough time has passed since last backup (5 minutes)
    const timeSinceLastBackup = now - backupState.lastBackupTime;
    if (timeSinceLastBackup < BACKUP_INTERVAL_MS) {
      console.log(`Backup skipped for ${projectName}: only ${Math.round(timeSinceLastBackup / 1000)}s since last backup`);
      return false;
    }

    // Check if content changed since last backup
    if (backupState.lastBackupHash === currentHash) {
      console.log(`Backup skipped for ${projectName}: content unchanged`);
      return false;
    }

    // Get today's backup folder
    const dateFolderName = getDateFolderName();
    const dateFolderPath = join(BACKUPS_DIR, dateFolderName);
    await ensureDir(dateFolderPath);

    // Create backup file with project name and timestamp
    const timestamp = getTimestampString();
    const backupFileName = `${projectName}-${timestamp}.json`;
    const backupFilePath = join(dateFolderPath, backupFileName);

    // Use safe write for the backup
    await safeWriteFile(backupFilePath, projectContent);
    console.log(`Created backup: ${dateFolderName}/${backupFileName}`);

    // Update backup state
    backupState.lastBackupTime = now;
    backupState.lastBackupHash = currentHash;

    // Cleanup old backups in today's folder
    await cleanupOldBackups(dateFolderPath);

    // Check for old date folders and compress them
    const allFolders = await readdir(BACKUPS_DIR);
    for (const folder of allFolders) {
      const folderPath = join(BACKUPS_DIR, folder);
      const folderStat = await stat(folderPath);

      // Only process directories (not .gz files)
      if (folderStat.isDirectory() && isPreviousDay(folder)) {
        console.log(`Compressing old backup folder: ${folder}`);
        await compressAndDeleteFolder(folderPath);
      }
    }

    return true;
  } catch (error) {
    console.error(`Backup error for ${projectName}:`, error);
    return false;
  }
}

/**
 * Load the server config (includes current project name)
 */
export async function loadConfig(): Promise<{ currentProject: string }> {
  try {
    await ensureDir(DATA_DIR);

    if (!existsSync(CONFIG_FILE)) {
      // Default config
      return { currentProject: 'project' };
    }

    const content = await readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error loading config:', error);
    return { currentProject: 'project' };
  }
}

/**
 * Save the server config
 */
export async function saveConfig(config: { currentProject: string }): Promise<void> {
  await ensureDir(DATA_DIR);
  await safeWriteFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * List all available projects (json files in data directory)
 */
export async function listProjects(): Promise<string[]> {
  await ensureDir(DATA_DIR);
  const files = await readdir(DATA_DIR);

  return files
    .filter(f => f.endsWith('.json') && f !== 'config.json' && !f.includes('.backup') && !f.includes('.migration-backup'))
    .map(f => f.replace('.json', ''))
    .sort();
}

/**
 * Check if a project exists
 */
export function projectExists(projectName: string): boolean {
  return existsSync(getProjectFilePath(projectName));
}

/**
 * Rename a project file
 */
export async function renameProjectFile(oldName: string, newName: string): Promise<void> {
  const oldPath = getProjectFilePath(oldName);
  const newPath = getProjectFilePath(newName);

  if (!existsSync(oldPath)) {
    throw new Error(`Project "${oldName}" does not exist`);
  }

  if (existsSync(newPath)) {
    throw new Error(`Project "${newName}" already exists`);
  }

  await rename(oldPath, newPath);
}

/**
 * Delete a project file
 */
export async function deleteProjectFile(projectName: string): Promise<void> {
  const filePath = getProjectFilePath(projectName);

  if (!existsSync(filePath)) {
    throw new Error(`Project "${projectName}" does not exist`);
  }

  await unlink(filePath);
}

/**
 * List unzipped backups for a given project (only from date folders, not .gz)
 * Returns entries sorted newest-first.
 */
export async function listBackupsForProject(
  projectName: string,
): Promise<{ date: string; time: string; filename: string }[]> {
  await ensureDir(BACKUPS_DIR);

  const entries: { date: string; time: string; filename: string; mtime: number }[] = [];

  let allItems: string[];
  try {
    allItems = await readdir(BACKUPS_DIR);
  } catch {
    return [];
  }

  for (const item of allItems) {
    const itemPath = join(BACKUPS_DIR, item);
    const itemStat = await stat(itemPath);

    if (!itemStat.isDirectory()) continue;

    const dateMatch = item.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!dateMatch) continue;

    let files: string[];
    try {
      files = await readdir(itemPath);
    } catch {
      continue;
    }

    const prefix = `${projectName}-`;
    for (const file of files) {
      if (!file.startsWith(prefix) || !file.endsWith('.json')) continue;

      const timeStr = file.slice(prefix.length, -5); // strip prefix and .json
      const filePath = join(itemPath, file);
      const fileStat = await stat(filePath);

      entries.push({
        date: item,
        time: timeStr,
        filename: file,
        mtime: fileStat.mtime.getTime(),
      });
    }
  }

  entries.sort((a, b) => b.mtime - a.mtime);
  return entries.map(({ date, time, filename }) => ({ date, time, filename }));
}

/**
 * Read a specific backup file's content
 */
export async function readBackupFile(
  dateFolderName: string,
  filename: string,
): Promise<string> {
  const filePath = join(BACKUPS_DIR, dateFolderName, filename);

  if (!existsSync(filePath)) {
    throw new Error(`Backup file not found: ${dateFolderName}/${filename}`);
  }

  return await readFile(filePath, 'utf-8');
}

// Export utilities for use in project routes
export { safeWriteFile, ensureDir, DATA_DIR, getProjectFilePath };
