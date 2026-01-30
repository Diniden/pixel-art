import {
  Project,
  createDefaultProject,
  projectToCompact,
  compactToProject,
  isCompactFormat,
  isLegacyCompactFormat,
  migrateLegacyLayer,
  CompactProject
} from '../types';

const API_BASE = '/api';

// Migrate a legacy compact project (pre-lighting studio) to new format
function migrateLegacyProject(legacy: CompactProject): CompactProject {
  console.log('Migrating legacy project to new format with lighting data...');

  // Type assertion for legacy layer format
  type LegacyLayer = {
    id: string;
    name: string;
    pixels: (number | 0)[][];
    visible: boolean;
    isVariant?: boolean;
    variantGroupId?: string;
    selectedVariantId?: string;
  };

  return {
    objects: legacy.objects.map(obj => ({
      ...obj,
      frames: obj.frames.map(frame => ({
        ...frame,
        layers: frame.layers.map(layer => migrateLegacyLayer(layer as unknown as LegacyLayer))
      })),
      variantGroups: obj.variantGroups?.map(vg => ({
        ...vg,
        variants: vg.variants.map(v => ({
          ...v,
          frames: v.frames.map(vf => ({
            ...vf,
            layers: vf.layers.map(layer => migrateLegacyLayer(layer as unknown as LegacyLayer))
          }))
        }))
      }))
    })),
    palettes: legacy.palettes,
    uiState: {
      ...legacy.uiState,
      // Add default lighting studio state
      studioMode: 'pixel',
      selectedNormal: 0x80_80_FF, // (0+128) << 16 | (0+128) << 8 | 255 = default normal
      lightDirection: 0x40_40_B4, // (-64+128) << 16 | (-64+128) << 8 | 180
      lightColor: 0xFF_FA_F0_FF, // warm white
      ambientColor: 0x28_2D_3C_FF, // soft blue-gray
      // Add default eraser shape
      eraserShape: 'circle',
      // Add default normal brush shape
      normalBrushShape: 'circle',
      // Add default height scale
      heightScale: 100
    }
  };
}

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
      let compactData = data as CompactProject;

      // Check if this is the old compact format (before lighting studio)
      if (isLegacyCompactFormat(compactData)) {
        // Create backup before migration by saving to backup endpoint
        try {
          await fetch(`${API_BASE}/project/backup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(compactData)
          });
          console.log('Created backup of legacy project before migration');
        } catch (backupError) {
          console.warn('Could not create backup:', backupError);
        }

        // Migrate to new format
        compactData = migrateLegacyProject(compactData);
      }

      return compactToProject(compactData);
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

