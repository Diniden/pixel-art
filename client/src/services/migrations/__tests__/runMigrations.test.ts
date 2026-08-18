/**
 * `runMigrations` orchestration tests (REFRESH task 16).
 *
 * The chain itself moved VERBATIM from `services/api.ts`; its behaviour is
 * pinned elsewhere (the transforms in `types/__tests__/migrations.test.ts`,
 * the load path in `stores/domain/__tests__/loadProject.test.ts`, the corpus
 * digests). What THIS suite pins is the orchestration contract the move
 * introduced:
 *
 *  - the `if` / `else if` at the former `api.ts:223-229` survives: the legacy
 *    and variant migrations are MUTUALLY EXCLUSIVE per load;
 *  - `applied` is non-empty exactly when the old `needsMigration` flag was
 *    true — the caller uses it to decide on the pre-migration backup;
 *  - a clean project passes through UNTOUCHED (same reference, no clone).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MODERN_PIXELS,
  syntheticLayer,
  syntheticProject,
  syntheticUIState,
} from "@test/__fixtures__/projects";
import {
  needsVariantMigration,
  runMigrations,
} from "@/services/migrations";
import type { CompactProject } from "@/types";

let consoleLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  consoleLog.mockRestore();
});

/** Legacy pixel format: scalar colour hex, no `[c,n,h]` tuples. */
function legacyPixelProject(): CompactProject {
  return syntheticProject([
    syntheticLayer("l0", [
      [0, 0xff_00_00_ff],
      [0, 0],
    ]),
  ]);
}

/** Modern pixels, object-level variantGroups awaiting hoisting. */
function objectVariantProject(): CompactProject {
  return {
    version: "1.1.0",
    objects: [
      {
        id: "o1",
        name: "Object 1",
        gridSize: { width: 2, height: 2 },
        variantGroups: [
          {
            id: "vg1",
            name: "Head",
            variants: [
              {
                id: "v1",
                name: "Variant 1",
                gridSize: { width: 2, height: 2 },
                frames: [
                  {
                    id: "vf0",
                    layers: [syntheticLayer("vf0-l0", MODERN_PIXELS)],
                  },
                ],
                baseFrameOffsets: { 0: { x: 1, y: 2 } },
              },
            ],
          },
        ],
        frames: [
          {
            id: "o1-f0",
            name: "Frame 0",
            layers: [syntheticLayer("o1-f0-l0", MODERN_PIXELS)],
          },
        ],
      },
    ],
    palettes: [{ id: "pal", name: "Palette", colors: [0] }],
    uiState: syntheticUIState(),
  };
}

/** Modern pixels, project-level variants — nothing to migrate. */
function cleanProject(): CompactProject {
  return syntheticProject([syntheticLayer("l0", MODERN_PIXELS)], {
    variants: [],
  });
}

describe("runMigrations — the preserved if / else-if", () => {
  it("legacy pixels → migrateLegacyProject ONLY, even when variantGroups are present", () => {
    const legacy = legacyPixelProject();
    legacy.objects[0].variantGroups =
      objectVariantProject().objects[0].variantGroups;

    const { project, applied } = runMigrations(legacy);

    // One branch, never both (`else if` — L3's invariant).
    expect(applied).toEqual(["migrateLegacyProject"]);
    expect(consoleLog).toHaveBeenCalledWith(
      "Migrating legacy project to new format with lighting data...",
    );
    expect(consoleLog).not.toHaveBeenCalledWith(
      "Migrating variant groups from objects to project level...",
    );
    // The legacy path hoisted the variants itself…
    expect(project.variants?.map((v) => v.id)).toEqual(["vg1"]);
    expect(project.objects[0].variantGroups).toBeUndefined();
    // …and migrated the scalar pixel into a [c, n, h] tuple.
    const px = project.objects[0].frames[0].layers[0].pixels[0][1];
    expect(Array.isArray(px)).toBe(true);
    expect((px as number[])[0]).toBe(0xff_00_00_ff);
  });

  it("modern pixels + object-level variants → migrateVariantsToProjectLevel ONLY", () => {
    const { project, applied } = runMigrations(objectVariantProject());

    expect(applied).toEqual(["migrateVariantsToProjectLevel"]);
    expect(consoleLog).toHaveBeenCalledWith(
      "Migrating variant groups from objects to project level...",
    );
    expect(consoleLog).not.toHaveBeenCalledWith(
      "Migrating legacy project to new format with lighting data...",
    );
    expect(project.variants?.map((v) => v.id)).toEqual(["vg1"]);
    expect(project.objects[0].variantGroups).toBeUndefined();
  });

  it("a clean project passes through with applied === [] and the SAME reference", () => {
    const clean = cleanProject();
    const { project, applied } = runMigrations(clean);

    expect(applied).toEqual([]);
    // Untouched means untouched: no defensive clone was introduced by the move.
    expect(project).toBe(clean);
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it("`applied` non-empty ⟺ the old `needsMigration` flag (the backup condition)", () => {
    // The deleted api.ts computed `needsMigration = isLegacyCompactFormat(raw)
    // || needsVariantMigration(raw)` BEFORE branching; the caller now uses
    // `applied.length > 0` to decide on the pre-migration backup. Pin the
    // concrete truth table so the two can never drift apart silently.
    expect(runMigrations(legacyPixelProject()).applied.length > 0).toBe(true);
    expect(runMigrations(objectVariantProject()).applied.length > 0).toBe(true);
    expect(runMigrations(cleanProject()).applied.length > 0).toBe(false);
  });
});

describe("needsVariantMigration (moved verbatim)", () => {
  it("false when variants already exist at project level", () => {
    const p = objectVariantProject();
    p.variants = [{ id: "existing", name: "X", variants: [] }];
    expect(needsVariantMigration(p)).toBe(false);
  });

  it("false for an empty project-level variants array with no object groups", () => {
    expect(needsVariantMigration(cleanProject())).toBe(false);
  });

  it("true when any object carries variantGroups", () => {
    expect(needsVariantMigration(objectVariantProject())).toBe(true);
  });
});
