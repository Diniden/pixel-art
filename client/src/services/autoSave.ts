import { Project } from '../types';
import { saveProject } from './api';

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingProject: Project | null = null;
let isSaving = false;
let onSaveStatusChange: ((status: 'saving' | 'saved' | 'error') => void) | null = null;

const DEBOUNCE_MS = 500;

export function setOnSaveStatusChange(callback: (status: 'saving' | 'saved' | 'error') => void) {
  onSaveStatusChange = callback;
}

async function performSave() {
  if (!pendingProject || isSaving) return;

  const projectToSave = pendingProject;
  pendingProject = null;
  isSaving = true;
  onSaveStatusChange?.('saving');

  try {
    await saveProject(projectToSave);
    onSaveStatusChange?.('saved');
  } catch {
    onSaveStatusChange?.('error');
    // Re-queue the project for saving
    pendingProject = projectToSave;
    scheduleAutoSave(projectToSave);
  } finally {
    isSaving = false;

    // If there's a new pending project, save it
    if (pendingProject) {
      performSave();
    }
  }
}

export function scheduleAutoSave(project: Project) {
  pendingProject = project;

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
}

