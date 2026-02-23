import * as api from './api';

/**
 * Trigger server-side export of the current or specified project.
 * Export is written to EXPORT_FOLDER/<projectName>/ (frames.json, index.ts, textures/*.png).
 */
export async function exportProject(projectName?: string): Promise<{ success: true; path: string; kebabName: string }> {
  return api.exportProject(projectName);
}
