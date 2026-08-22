/**
 * The MIGRATION CHAIN (REFRESH task 16).
 *
 * Moved VERBATIM from `services/api.ts` (its former lines 15-145 and the
 * load-order orchestration at 223-229), per MASTER.md §9.6: transport must not
 * mutate domain data, so the chain now lives with the store's load path
 * (`DomainStore.loadProject`) instead of the deleted transport facade.
 *
 * ⚠️ DO NOT EDIT THE TRANSFORMS. The 8 schema migrations protect the owner's
 * real data, and no pre-migration data survives anywhere in the repo — the
 * hand-authored synthetic fixtures behind
 * `stores/domain/__tests__/loadProject.test.ts`,
 * `types/__tests__/migrations.test.ts` and the corpus digests are the ONLY
 * safety net. Every function below must stay byte-for-byte equivalent to the
 * `api.ts` original.
 *
 * ⚠️ `runMigrations` preserves the exact `if` / `else if` at the former
 * `api.ts:223-229`: legacy-pixel migration and variant migration are MUTUALLY
 * EXCLUSIVE on that branch (pinned by loadProject.test.ts L3/L4). Changing
 * `else if` to `if` is a silent semantic change.
 *
 * ⚠️ `migrateVariantsToProjectLevel` is one of two DIVERGENT implementations
 * of the same migration — the other lives inside `compactToProject`
 * (`types/codecs/deserialize.ts`) and additionally rewrites variant layers'
 * `variantOffsets` from `baseFrameOffsets[frameIndex]`. Task 07 pinned the
 * difference. Both stay; reconciling them is an open question, not a refactor.
 *
 * ⚠️ `migrateLegacyProject` deliberately DROPS the `version` field — the
 * object literal it returns has no `version` key, so a legacy project is
 * silently re-versioned to "1.1.0" by the `?? "1.1.0"` default in
 * `compactToProject`. Preserved, not fixed (task 16 spec).
 */
import {
  CompactProject,
  isLegacyCompactFormat,
  migrateLegacyLayer,
} from "../../types";

// Check if project has variants on objects (needs migration to project-level)
export function needsVariantMigration(data: CompactProject): boolean {
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
export function migrateLegacyProject(legacy: CompactProject): CompactProject {
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
export function migrateVariantsToProjectLevel(
  data: CompactProject,
): CompactProject {
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

/** Which migrations `runMigrations` applied, in order. */
export type AppliedMigration =
  "migrateLegacyProject" | "migrateVariantsToProjectLevel";

/**
 * The load-order orchestration, moved verbatim from the former
 * `api.ts:223-229`. `applied` is non-empty exactly when the old code's
 * `needsMigration` flag was true (`isLegacyCompactFormat(raw) ||
 * needsVariantMigration(raw)`), so callers use it to decide whether to POST
 * the pre-migration backup of the RAW payload.
 */
export function runMigrations(raw: CompactProject): {
  project: CompactProject;
  applied: AppliedMigration[];
} {
  let compactData = raw;
  const applied: AppliedMigration[] = [];

  // Apply migrations in order
  if (isLegacyCompactFormat(compactData)) {
    // This migration handles both pixel format AND variant migration
    compactData = migrateLegacyProject(compactData);
    applied.push("migrateLegacyProject");
  } else if (needsVariantMigration(compactData)) {
    // Only migrate variants if pixel format is already new
    compactData = migrateVariantsToProjectLevel(compactData);
    applied.push("migrateVariantsToProjectLevel");
  }

  return { project: compactData, applied };
}
