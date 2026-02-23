import {
  Project,
  createDefaultProject,
  projectToCompact,
  compactToProject,
  isCompactFormat,
  isLegacyCompactFormat,
  migrateLegacyLayer,
  CompactProject,
} from "../types";

const API_BASE = "/api";

// Check if project has variants on objects (needs migration to project-level)
function needsVariantMigration(data: CompactProject): boolean {
  // If variants already exist at project level, no migration needed
  if (data.variants && data.variants.length > 0) {
    return false;
  }
  // Check if any object has variantGroups
  return data.objects.some(
    (obj) => obj.variantGroups && obj.variantGroups.length > 0,
  );
}

// Migrate a legacy compact project (pre-lighting studio) to new format
function migrateLegacyProject(legacy: CompactProject): CompactProject {
  console.log("Migrating legacy project to new format with lighting data...");

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

  // Collect all variant groups from all objects (they should be identical if shared)
  // For migration, we'll just take the first occurrence of each unique variant group
  const allVariantGroups: {
    [id: string]: (typeof legacy.objects)[0]["variantGroups"] extends
      | (infer T)[]
      | undefined
      ? T
      : never;
  } = {};

  for (const obj of legacy.objects) {
    if (obj.variantGroups) {
      for (const vg of obj.variantGroups) {
        if (!allVariantGroups[vg.id]) {
          allVariantGroups[vg.id] = vg;
        }
      }
    }
  }

  const projectVariants = Object.values(allVariantGroups).map((vg) => ({
    ...vg,
    variants: vg.variants.map((v) => ({
      ...v,
      frames: v.frames.map((vf) => ({
        ...vf,
        layers: vf.layers.map((layer) =>
          migrateLegacyLayer(layer as unknown as LegacyLayer),
        ),
      })),
    })),
  }));

  return {
    objects: legacy.objects.map((obj) => ({
      ...obj,
      frames: obj.frames.map((frame) => ({
        ...frame,
        layers: frame.layers.map((layer) =>
          migrateLegacyLayer(layer as unknown as LegacyLayer),
        ),
      })),
      // Remove variantGroups from objects (now at project level)
      variantGroups: undefined,
    })),
    palettes: legacy.palettes,
    uiState: {
      ...legacy.uiState,
      // Add default lighting studio state
      studioMode: "pixel",
      selectedNormal: 0x80_80_ff, // (0+128) << 16 | (0+128) << 8 | 255 = default normal
      lightDirection: 0x40_40_b4, // (-64+128) << 16 | (-64+128) << 8 | 180
      lightColor: 0xff_fa_f0_ff, // warm white
      ambientColor: 0x28_2d_3c_ff, // soft blue-gray
      // Add default eraser shape
      eraserShape: "circle",
      // Add default pixel pencil brush settings
      pencilBrushShape: "square",
      pencilBrushMax: 16,
      traceNudgeAmount: 10,
      // Add default normal brush shape
      normalBrushShape: "circle",
      // Add default height scale
      heightScale: 100,
    },
    // Add project-level variants
    variants: projectVariants.length > 0 ? projectVariants : undefined,
  };
}

// Migrate variant groups from objects to project level (for already-migrated lighting data)
function migrateVariantsToProjectLevel(data: CompactProject): CompactProject {
  console.log("Migrating variant groups from objects to project level...");

  // Collect all variant groups from all objects
  const allVariantGroups: {
    [id: string]: (typeof data.objects)[0]["variantGroups"] extends
      | (infer T)[]
      | undefined
      ? T
      : never;
  } = {};

  for (const obj of data.objects) {
    if (obj.variantGroups) {
      for (const vg of obj.variantGroups) {
        if (!allVariantGroups[vg.id]) {
          allVariantGroups[vg.id] = vg;
        }
      }
    }
  }

  const projectVariants = Object.values(allVariantGroups);

  return {
    ...data,
    objects: data.objects.map((obj) => ({
      ...obj,
      // Remove variantGroups from objects
      variantGroups: undefined,
    })),
    variants: projectVariants.length > 0 ? projectVariants : undefined,
  };
}

// Get server configuration (includes current project name)
export async function getConfig(): Promise<{ currentProject: string }> {
  try {
    const response = await fetch(`${API_BASE}/config`);
    if (!response.ok) {
      throw new Error(`Failed to get config: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error getting config:", error);
    return { currentProject: "project" };
  }
}

// List all available projects
export async function listProjects(): Promise<string[]> {
  try {
    const response = await fetch(`${API_BASE}/projects`);
    if (!response.ok) {
      throw new Error(`Failed to list projects: ${response.statusText}`);
    }
    const data = await response.json();
    return data.projects || [];
  } catch (error) {
    console.error("Error listing projects:", error);
    return [];
  }
}

// Load a project by name (or current project if not specified)
export async function loadProject(projectName?: string): Promise<Project> {
  try {
    const url = projectName
      ? `${API_BASE}/project?name=${encodeURIComponent(projectName)}`
      : `${API_BASE}/project`;

    const response = await fetch(url);
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
      let needsMigration = false;

      // Check if this is the old compact format (before lighting studio)
      if (isLegacyCompactFormat(compactData)) {
        needsMigration = true;
      }

      // Check if variants need to be migrated from objects to project level
      if (needsVariantMigration(compactData)) {
        needsMigration = true;
      }

      // Create backup before any migration
      if (needsMigration) {
        try {
          await fetch(`${API_BASE}/project/backup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(compactData),
          });
          console.log("Created backup of project before migration");
        } catch (backupError) {
          console.warn("Could not create backup:", backupError);
        }
      }

      // Apply migrations in order
      if (isLegacyCompactFormat(compactData)) {
        // This migration handles both pixel format AND variant migration
        compactData = migrateLegacyProject(compactData);
      } else if (needsVariantMigration(compactData)) {
        // Only migrate variants if pixel format is already new
        compactData = migrateVariantsToProjectLevel(compactData);
      }

      return compactToProject(compactData);
    }

    // Legacy format - return as-is
    return data as Project;
  } catch (error) {
    console.error("Error loading project:", error);
    // Return default project if server is unavailable
    return createDefaultProject();
  }
}

// Save a project with optional name (uses current project if not specified)
export async function saveProject(
  project: Project,
  projectName?: string,
): Promise<void> {
  try {
    // Always save in compact format to reduce file size
    const compactProject = projectToCompact(project);

    const url = projectName
      ? `${API_BASE}/project?name=${encodeURIComponent(projectName)}`
      : `${API_BASE}/project`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(compactProject),
    });
    if (!response.ok) {
      throw new Error(`Failed to save project: ${response.statusText}`);
    }
  } catch (error) {
    console.error("Error saving project:", error);
    throw error;
  }
}

// Create a new project
export async function createProject(
  name: string,
  projectData?: Project,
): Promise<void> {
  try {
    const body: { name: string; projectData?: unknown } = { name };

    if (projectData) {
      body.projectData = projectToCompact(projectData);
    }

    const response = await fetch(`${API_BASE}/project/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(
        data.error || `Failed to create project: ${response.statusText}`,
      );
    }
  } catch (error) {
    console.error("Error creating project:", error);
    throw error;
  }
}

// Rename a project
export async function renameProject(
  oldName: string,
  newName: string,
): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/project/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldName, newName }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(
        data.error || `Failed to rename project: ${response.statusText}`,
      );
    }
  } catch (error) {
    console.error("Error renaming project:", error);
    throw error;
  }
}

// Delete a project
export async function deleteProject(name: string): Promise<void> {
  try {
    const response = await fetch(
      `${API_BASE}/project?name=${encodeURIComponent(name)}`,
      {
        method: "DELETE",
      },
    );

    if (!response.ok) {
      const data = await response.json();
      throw new Error(
        data.error || `Failed to delete project: ${response.statusText}`,
      );
    }
  } catch (error) {
    console.error("Error deleting project:", error);
    throw error;
  }
}

// Switch to a different project (just updates server config)
export async function switchProject(name: string): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/project/switch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(
        data.error || `Failed to switch project: ${response.statusText}`,
      );
    }
  } catch (error) {
    console.error("Error switching project:", error);
    throw error;
  }
}

// Export the current or specified project to server export folder (EXPORT_FOLDER/<projectName>/)
export async function exportProject(
  projectName?: string,
): Promise<{ success: true; path: string; kebabName: string }> {
  const url = projectName
    ? `${API_BASE}/project/export?name=${encodeURIComponent(projectName)}`
    : `${API_BASE}/project/export`;
  const response = await fetch(url, { method: "POST" });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || `Export failed: ${response.statusText}`);
  }
  return response.json();
}
