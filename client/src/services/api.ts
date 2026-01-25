import { Project, createDefaultProject } from '../types';

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
    return response.json();
  } catch (error) {
    console.error('Error loading project:', error);
    // Return default project if server is unavailable
    return createDefaultProject();
  }
}

export async function saveProject(project: Project): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/project`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(project),
    });
    if (!response.ok) {
      throw new Error(`Failed to save project: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error saving project:', error);
    throw error;
  }
}

