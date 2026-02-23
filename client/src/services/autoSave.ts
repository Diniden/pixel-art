import { Project } from '../types';
import { saveProject } from './api';

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingProject: Project | null = null;
let pendingProjectName: string | null = null;
let isSaving = false;
let onSaveStatusChange: ((status: 'saving' | 'saved' | 'error') => void) | null = null;

const DEBOUNCE_MS = 500;

export function setOnSaveStatusChange(callback: (status: 'saving' | 'saved' | 'error') => void) {
  onSaveStatusChange = callback;
}

async function performSave() {
  if (!pendingProject || isSaving) return;

  const projectToSave = pendingProject;
  const projectName = pendingProjectName;
  pendingProject = null;
  pendingProjectName = null;
  isSaving = true;
  onSaveStatusChange?.('saving');

  try {
    await saveProject(projectToSave, projectName || undefined);
    onSaveStatusChange?.('saved');
  } catch {
    onSaveStatusChange?.('error');
    // Re-queue the project for saving
    pendingProject = projectToSave;
    pendingProjectName = projectName;
    scheduleAutoSave(projectToSave, projectName);
  } finally {
    isSaving = false;

    // If there's a new pending project, save it
    if (pendingProject) {
      performSave();
    }
  }
}

export function scheduleAutoSave(project: Project, projectName?: string | null) {
  pendingProject = project;
  pendingProjectName = projectName || null;

  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    performSave();
  }, DEBOUNCE_MS);
}

export function cancelPendingSave() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  pendingProject = null;
  pendingProjectName = null;
}
