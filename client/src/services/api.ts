import {
  Project,
  createDefaultProject,
  projectToCompact,
  compactToProject,
  isCompactFormat,
  CompactProject
} from '../types';

const API_BASE = '/api';

export async function loadProject(): Promise<Project> {
  try {
    const response = await fetch(`${API_BASE}/project`);
    if (!response.ok) {
      if (response.status === 404) {
        // No project exists yet, return default
        return createDefaultProject();
      }
      throw new Error(`Failed to load project: ${response.statusText}`);
    }
    const data = await response.json();

    // Handle both compact (new) and expanded (legacy) formats
    if (isCompactFormat(data)) {
      return compactToProject(data as CompactProject);
    }

    // Legacy format - return as-is
    return data as Project;
  } catch (error) {
    console.error('Error loading project:', error);
    // Return default project if server is unavailable
    return createDefaultProject();
  }
}

export async function saveProject(project: Project): Promise<void> {
  try {
    // Always save in compact format to reduce file size
    const compactProject = projectToCompact(project);

    const response = await fetch(`${API_BASE}/project`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(compactProject),
    });
    if (!response.ok) {
      throw new Error(`Failed to save project: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error saving project:', error);
    throw error;
  }
}

