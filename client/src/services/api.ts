/**
 * The project load/save path — and the home of the MIGRATION CHAIN.
 *
 * REFRESH task 15 removed all transport from this module: every HTTP request
 * now goes through the typed API layer (`src/api/`), which is the only place
 * in the client that calls `fetch`. What remains here is deliberate:
 *
 *  - the three migration functions and the load-time chain that applies them.
 *    ⚠️ Task 16 moves them VERBATIM into the store's load path
 *    (`DomainStore.loadProject`) — per MASTER.md §9.6 they may not move (or be
 *    rewritten) before that task, because that is where a store exists to
 *    receive them. The 8 schema migrations protect the owner's real data;
 *    `services/__tests__/loadProject.test.ts` and the corpus digests pin them.
 *  - thin, name-stable wrappers (`getConfig`, `listProjects`, …) so the store
 *    (`store/projectActions.ts`, `services/autoSave.ts`) and its 336-test
 *    behaviour suite — which mocks THIS module wholesale — keep a single,
 *    stable seam until task 16 rebuilds the load path on the store side.
 *
 * ⚠️ NOTHING here fabricates a success value any more (R5, first half):
 *  - `loadProject` used to swallow EVERY failure and return
 *    `createDefaultProject()`, which auto-save then wrote over the user's real
 *    1.1 MB file. It now THROWS the typed `ApiError`. The only remaining
 *    default is the 404 "no project file exists yet" first-run path, which is
 *    pinned behaviour (loadProject.test.ts L7), not error masking.
 *  - `getConfig` / `listProjects` no longer return `{currentProject:"project"}`
 *    / `[]` on failure — they throw, and the caller decides.
 */
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
import { backupApi, configApi, isKind, projectApi } from "../api";

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
      (infer T)[] | undefined
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
      (infer T)[] | undefined
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
  return configApi.get();
}

// List all available projects
export async function listProjects(): Promise<string[]> {
  return projectApi.list();
}

/**
 * Load a project by name (or current project if not specified), applying the
 * migration chain to the raw payload `projectApi.get` returns.
 *
 * FAILURES THROW (task 15 / R5 first half). The single surviving default is
 * the 404 path: no project file exists yet, so a fresh default is the correct
 * first-run behaviour (pinned by loadProject.test.ts L7), not error masking.
 */
export async function loadProject(projectName?: string): Promise<Project> {
  let data: unknown;
  try {
    data = await projectApi.get(projectName);
  } catch (error) {
    if (isKind(error, "notFound")) {
      // No project exists yet, return default
      return createDefaultProject();
    }
    throw error;
  }

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
        await backupApi.createMigrationBackup(compactData);
        console.log("Created backup of project before migration");
      } catch (backupError) {
        // Best-effort BY PINNED DESIGN (loadProject.test.ts L2): making the
        // backup blocking is a product decision needing owner sign-off.
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
}

// Save a project with optional name (uses current project if not specified).
// Always saves in compact format to reduce file size. Failures throw.
export async function saveProject(
  project: Project,
  projectName?: string,
): Promise<void> {
  const compactProject = projectToCompact(project);
  await projectApi.save(compactProject, projectName);
}

// Create a new project
export async function createProject(
  name: string,
  projectData?: Project,
): Promise<void> {
  await projectApi.create(
    name,
    projectData ? projectToCompact(projectData) : undefined,
  );
}

// Rename a project
export async function renameProject(
  oldName: string,
  newName: string,
): Promise<void> {
  await projectApi.rename(oldName, newName);
}

// Delete a project
export async function deleteProject(name: string): Promise<void> {
  await projectApi.remove(name);
}

// Switch to a different project (just updates server config)
export async function switchProject(name: string): Promise<void> {
  await projectApi.switchTo(name);
}

// Restore a project from a backup file
export async function restoreBackup(
  date: string,
  filename: string,
  projectName?: string,
): Promise<void> {
  await backupApi.restore(date, filename, projectName);
}
