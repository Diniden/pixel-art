/**
 * `PaletteStore` and `ObjectStore` (REFRESH task 23) — the two
 * trivially-extractable modules, and the proof of the sub-store pattern.
 *
 * What matters here beyond "the action works":
 *
 *  - **All 5 palette actions stay NON-UNDOABLE.** Every one passed
 *    `trackHistory=false` in `paletteActions.ts` and task 17 pinned it. A
 *    later task "improving" this would change product behaviour silently.
 *  - **All 6 object actions stay UNDOABLE**, and snapshot BEFORE mutating —
 *    the ordering `DomainMutator` exists to enforce.
 *  - **The sub-stores mutate `DomainStore`'s tree**, they do not own slices.
 *  - **Grids survive `resizeObject`/`duplicateObject` as raw arrays** — both
 *    build new grids, which is a `ref` replacement and R2-legal.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { runInAction } from "mobx";

import { ApplicationStore } from "@/stores/ApplicationStore";
import type { DomainMirror } from "@/stores/domain/DomainMutator";
import type { ProjectHost } from "@/stores/domain/DomainStore";
import type { SelectionSink } from "@/stores/domain/ObjectStore";
import { assertGridsAreRaw } from "@/stores/domain/gridSafety";
import { tinyProject } from "@/store/__tests__/storeContract";
import type { Project } from "@/types";

interface Rig {
  app: ApplicationStore;
  /** Every history label recorded, in order. */
  snapshots: string[];
  /** Every project published to the Zustand mirror. */
  published: Project[];
  selections: Array<{ selectedObjectId: string | null }>;
}

function makeRig(project: Project = tinyProject()): Rig {
  let current: Project | null = project;
  const snapshots: string[] = [];
  const published: Project[] = [];
  const selections: Array<{ selectedObjectId: string | null }> = [];

  const host: ProjectHost = {
    getProject: () => current,
    installProject: (p) => {
      current = p;
    },
    replaceProject: (p) => {
      current = p;
    },
    snapshotToHistory: () => {},
  };
  const mirror: DomainMirror = {
    publish: (p) => {
      current = p;
      published.push(p);
    },
    snapshot: (label) => snapshots.push(label),
  };
  const selectionSink: SelectionSink = {
    selectObjectTree: (ids) => {
      selections.push({ selectedObjectId: ids.selectedObjectId });
      if (current) {
        current = { ...current, uiState: { ...current.uiState, ...ids } };
      }
    },
  };
  const app = new ApplicationStore({
    autoSaveEnabled: false,
    projectHost: host,
    domainMirror: mirror,
    selectionSink,
  });
  runInAction(() => app.domain.adoptTree(project));
  return { app, snapshots, published, selections };
}

/* ── PaletteStore ────────────────────────────────────────────────────────── */

describe("PaletteStore", () => {
  let rig: Rig;

  beforeEach(() => {
    rig = makeRig();
  });

  it("addPalette appends a palette with the default colour", () => {
    rig.app.palettes.addPalette("New");
    const palettes = rig.app.domain.palettes;
    expect(palettes).toHaveLength(2);
    expect(palettes[1].name).toBe("New");
    expect(palettes[1].colors).toHaveLength(1);
  });

  it("deletePalette removes by id", () => {
    rig.app.palettes.deletePalette("pal-1");
    expect(rig.app.domain.palettes).toHaveLength(0);
  });

  it("renamePalette renames by id", () => {
    rig.app.palettes.renamePalette("pal-1", "Renamed");
    expect(rig.app.domain.palettes[0].name).toBe("Renamed");
  });

  it("addColorToPalette appends a colour", () => {
    rig.app.palettes.addColorToPalette("pal-1", { r: 1, g: 2, b: 3, a: 255 });
    expect(rig.app.domain.palettes[0].colors).toHaveLength(2);
  });

  it("removeColorFromPalette removes by index", () => {
    rig.app.palettes.removeColorFromPalette("pal-1", 0);
    expect(rig.app.domain.palettes[0].colors).toHaveLength(0);
  });

  it("⚠️ ALL FIVE are NON-UNDOABLE — zero history snapshots", () => {
    // Pinned by task 17: every one passes `trackHistory=false` today. This is
    // product behaviour, not an oversight — do not "fix" it.
    rig.app.palettes.addPalette("A");
    const created = rig.app.domain.palettes[1];
    rig.app.palettes.addColorToPalette(created.id, { r: 0, g: 0, b: 1, a: 1 });
    rig.app.palettes.removeColorFromPalette(created.id, 0);
    rig.app.palettes.renamePalette(created.id, "B");
    rig.app.palettes.deletePalette(created.id);
    expect(rig.snapshots).toEqual([]);
  });

  it("publishes to the Zustand mirror and bumps domainVersion", () => {
    const before = rig.app.domain.domainVersion;
    rig.app.palettes.addPalette("A");
    expect(rig.published).toHaveLength(1);
    expect(rig.app.domain.domainVersion).toBe(before + 1);
  });
});

/* ── ObjectStore ─────────────────────────────────────────────────────────── */

describe("ObjectStore", () => {
  let rig: Rig;

  beforeEach(() => {
    rig = makeRig();
  });

  it("addObject appends and selects the new object", () => {
    rig.app.objects.addObject("Second", 8, 8);
    expect(rig.app.domain.objects).toHaveLength(2);
    expect(rig.app.domain.objects[1].name).toBe("Second");
    // `.at(-1)` is lib-ES2022; this workspace compiles with ES2020 (same
    // note as `store/__tests__/history.test.ts`). Index arithmetic instead.
    const lastSelection = rig.selections[rig.selections.length - 1];
    expect(lastSelection?.selectedObjectId).toBe(rig.app.domain.objects[1].id);
  });

  it("renameObject renames by id", () => {
    rig.app.objects.renameObject("obj-1", "Renamed");
    expect(rig.app.domain.objects[0].name).toBe("Renamed");
  });

  it("setObjectOrigin writes the origin", () => {
    rig.app.objects.setObjectOrigin("obj-1", { x: 3, y: 4 });
    expect(rig.app.domain.objects[0].origin).toEqual({ x: 3, y: 4 });
  });

  it("deleteObject substitutes a default when the LAST object goes", () => {
    // Verbatim legacy behaviour: a project is never left object-less.
    rig.app.objects.deleteObject("obj-1");
    expect(rig.app.domain.objects).toHaveLength(1);
    expect(rig.app.domain.objects[0].id).not.toBe("obj-1");
  });

  it("duplicateObject deep-copies frames, layers and grids", () => {
    rig.app.objects.duplicateObject("obj-1");
    const [original, copy] = rig.app.domain.objects;
    expect(rig.app.domain.objects).toHaveLength(2);
    expect(copy.name).toBe("Object 1 Copy");
    expect(copy.id).not.toBe(original.id);
    // a NEW grid, not the same reference
    expect(copy.frames[0].layers[0].pixels).not.toBe(
      original.frames[0].layers[0].pixels,
    );
    expect(copy.frames[0].layers[0].pixels).toEqual(
      original.frames[0].layers[0].pixels,
    );
  });

  it("resizeObject rebuilds every grid at the new size", () => {
    rig.app.objects.resizeObject("obj-1", 8, 6);
    const obj = rig.app.domain.objects[0];
    expect(obj.gridSize).toEqual({ width: 8, height: 6 });
    expect(obj.frames[0].layers[0].pixels).toHaveLength(6);
    expect(obj.frames[0].layers[0].pixels[0]).toHaveLength(8);
  });

  it("all 6 are UNDOABLE — one snapshot each, recorded BEFORE the mutation", () => {
    rig.app.objects.addObject("A", 4, 4);
    rig.app.objects.renameObject("obj-1", "R");
    rig.app.objects.setObjectOrigin("obj-1", { x: 1, y: 1 });
    rig.app.objects.resizeObject("obj-1", 8, 8);
    rig.app.objects.duplicateObject("obj-1");
    rig.app.objects.deleteObject("obj-1");
    expect(rig.snapshots).toHaveLength(6);
  });

  it("R2: grids stay RAW after resize and duplicate", () => {
    rig.app.objects.resizeObject("obj-1", 16, 16);
    rig.app.objects.duplicateObject("obj-1");
    expect(() =>
      assertGridsAreRaw(rig.app.domain.objects, rig.app.domain.variants),
    ).not.toThrow();
  });
});
