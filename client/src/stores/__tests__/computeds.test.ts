/**
 * The 6 cross-store computeds (REFRESH task 23) — the replacement for
 * `store/helpers.ts`.
 *
 * `helpers.ts` is 93 lines, pure, and called ~120 times across 9 store modules
 * and 8 components. These tests pin that each computed returns exactly what
 * its helper returned, and — the reason this file exists — that
 * `currentVariant`'s FOUR-LEVEL offset fallback keeps its precedence.
 *
 * ⚠️ Getting that precedence wrong misplaces every variant on canvas, and it
 * is not the kind of bug a type checker or a smoke test finds. Task 08 pinned
 * all four levels through the Zustand helper; this suite pins the same four
 * through the MobX computed, one test per branch, so the two implementations
 * are provably interchangeable.
 *
 * These run without React and without the bridge: the computeds read
 * `DomainStore`'s tree and `ApplicationStore.selection`, both of which are set
 * directly here.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { runInAction } from "mobx";

import { ApplicationStore } from "@/stores/ApplicationStore";
import type { DomainMirror } from "@/stores/domain/DomainMutator";
import type { ProjectHost } from "@/stores/domain/DomainStore";
import type { SelectionSink } from "@/stores/domain/ObjectStore";
import { tinyProject } from "@/store/__tests__/storeContract";
import { createHelpers } from "@/store/helpers";
import type {
  Layer,
  PixelObject,
  Project,
  Variant,
  VariantGroup,
} from "@/types";

/* ── an ApplicationStore with no Zustand attached ────────────────────────── */

function makeApp(project: Project): {
  app: ApplicationStore;
  published: Project[];
} {
  let current: Project | null = project;
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
  const published: Project[] = [];
  const mirror: DomainMirror = {
    publish: (p) => {
      current = p;
      published.push(p);
    },
    snapshot: () => {},
  };
  const selectionSink: SelectionSink = {
    selectObjectTree: (ids) => {
      if (!current) return;
      current = { ...current, uiState: { ...current.uiState, ...ids } };
    },
  };
  const app = new ApplicationStore({
    autoSaveEnabled: false,
    projectHost: host,
    domainMirror: mirror,
    selectionSink,
  });
  runInAction(() => {
    app.domain.adoptTree(project);
    app.selection.adopt({
      selectedObjectId: project.uiState.selectedObjectId,
      selectedFrameId: project.uiState.selectedFrameId,
      selectedLayerId: project.uiState.selectedLayerId,
      variantFrameIndices: project.uiState.variantFrameIndices ?? {},
    });
  });
  return { app, published };
}

/* ── a project whose selected layer IS a variant layer ───────────────────── */

const GROUP_ID = "vg-1";
const VARIANT_ID = "v-1";

function variantLayer(overrides: Partial<Layer> = {}): Layer {
  return {
    id: "layer-1",
    name: "Layer 1",
    pixels: [
      [0, 0],
      [0, 0],
    ] as unknown as Layer["pixels"],
    visible: true,
    isVariant: true,
    variantGroupId: GROUP_ID,
    selectedVariantId: VARIANT_ID,
    ...overrides,
  };
}

function variantGroup(variantOverrides: Partial<Variant> = {}): VariantGroup {
  return {
    id: GROUP_ID,
    name: "Group",
    variants: [
      {
        id: VARIANT_ID,
        name: "Variant",
        gridSize: { width: 2, height: 2 },
        frames: [
          {
            id: "vf-1",
            layers: [
              {
                id: "vl-1",
                name: "VL",
                pixels: [
                  [0, 0],
                  [0, 0],
                ] as unknown as Layer["pixels"],
                visible: true,
              },
            ],
          },
        ],
        baseFrameOffsets: {},
        ...variantOverrides,
      },
    ],
  };
}

/** A project with one variant layer selected, plus whatever offsets we pin. */
function variantProject(options: {
  layer?: Partial<Layer>;
  variant?: Partial<Variant>;
  variantFrameIndices?: { [k: string]: number };
}): Project {
  const layer = variantLayer(options.layer);
  const base = tinyProject({ layers: [layer] });
  return {
    ...base,
    variants: [variantGroup(options.variant)],
    uiState: {
      ...base.uiState,
      selectedLayerId: layer.id,
      ...(options.variantFrameIndices
        ? { variantFrameIndices: options.variantFrameIndices }
        : {}),
    },
  };
}

/* ── currentObject / currentFrame / currentLayer ─────────────────────────── */

describe("currentObject / currentFrame / currentLayer", () => {
  let app: ApplicationStore;

  beforeEach(() => {
    app = makeApp(tinyProject()).app;
  });

  it("resolves the selected object, frame and layer", () => {
    expect(app.currentObject?.id).toBe("obj-1");
    expect(app.currentFrame?.id).toBe("frame-1");
    expect(app.currentLayer?.id).toBe("layer-1");
  });

  it("returns null when the selected id matches nothing", () => {
    runInAction(() => {
      app.selection.selectedObjectId = "nope";
    });
    expect(app.currentObject).toBeNull();
    // and the whole chain below it collapses to null, not to a throw
    expect(app.currentFrame).toBeNull();
    expect(app.currentLayer).toBeNull();
  });

  it("currentFrame is null when the frame id matches nothing", () => {
    runInAction(() => {
      app.selection.selectedFrameId = "nope";
    });
    expect(app.currentObject?.id).toBe("obj-1");
    expect(app.currentFrame).toBeNull();
    expect(app.currentLayer).toBeNull();
  });

  it("recomputes when the selection changes", () => {
    const second: PixelObject = {
      id: "obj-2",
      name: "Second",
      gridSize: { width: 1, height: 1 },
      frames: [{ id: "frame-2", name: "F", layers: [] }],
    };
    runInAction(() => {
      app.domain.objects = [...app.domain.objects, second];
      app.selection.selectedObjectId = "obj-2";
    });
    expect(app.currentObject?.id).toBe("obj-2");
  });

  it("is CACHED — repeated reads return the identical reference", () => {
    expect(app.currentObject).toBe(app.currentObject);
    expect(app.currentLayer).toBe(app.currentLayer);
  });
});

/* ── isEditingVariant / selectedVariantLayer ─────────────────────────────── */

describe("isEditingVariant", () => {
  it("is false for an ordinary layer", () => {
    const { app } = makeApp(tinyProject());
    expect(app.isEditingVariant).toBe(false);
  });

  it("is true for a variant layer", () => {
    const { app } = makeApp(variantProject({}));
    expect(app.isEditingVariant).toBe(true);
  });

  it("reads currentLayer, NOT currentVariant — true even when the group is missing", () => {
    // Pinned quirk of the legacy helper (`helpers.ts:82-85`): it checks only
    // `layer.isVariant`, so `isEditingVariant && !currentVariant` is a
    // reachable state the consumers already handle. Do not "fix" this.
    const project = variantProject({});
    const { app } = makeApp({ ...project, variants: [] });
    expect(app.currentVariant).toBeNull();
    expect(app.isEditingVariant).toBe(true);
  });
});

describe("selectedVariantLayer", () => {
  it("is the first layer of the resolved variant frame", () => {
    const { app } = makeApp(variantProject({}));
    expect(app.selectedVariantLayer?.id).toBe("vl-1");
  });

  it("is null when there is no current variant", () => {
    const { app } = makeApp(tinyProject());
    expect(app.selectedVariantLayer).toBeNull();
  });
});

/* ── currentVariant — resolution ─────────────────────────────────────────── */

describe("currentVariant — resolution", () => {
  it("resolves group, variant and frame for a variant layer", () => {
    const { app } = makeApp(variantProject({}));
    const cv = app.currentVariant;
    expect(cv?.variantGroup.id).toBe(GROUP_ID);
    expect(cv?.variant.id).toBe(VARIANT_ID);
    expect(cv?.variantFrame.id).toBe("vf-1");
  });

  it("is null for a non-variant layer", () => {
    const { app } = makeApp(tinyProject());
    expect(app.currentVariant).toBeNull();
  });

  it("is null when the variant GROUP cannot be found", () => {
    const project = variantProject({});
    const { app } = makeApp({ ...project, variants: [] });
    expect(app.currentVariant).toBeNull();
  });

  it("is null when the selected VARIANT cannot be found in the group", () => {
    const { app } = makeApp(
      variantProject({ layer: { selectedVariantId: "missing" } }),
    );
    expect(app.currentVariant).toBeNull();
  });

  it("wraps variantFrameIndices modulo the frame count", () => {
    // One frame, index 5 → 5 % 1 === 0. Pinned: the helper does NOT clamp.
    const { app } = makeApp(
      variantProject({ variantFrameIndices: { [GROUP_ID]: 5 } }),
    );
    expect(app.currentVariant?.variantFrame.id).toBe("vf-1");
  });

  it("baseFrameIndex is the index of the selected base frame", () => {
    const { app } = makeApp(variantProject({}));
    expect(app.currentVariant?.baseFrameIndex).toBe(0);
  });
});

/* ── currentVariant — THE FOUR-LEVEL OFFSET FALLBACK ─────────────────────── */
//
// helpers.ts:69-77, one test per branch. Precedence, highest first:
//   1. layer.variantOffsets[selectedVariantId]
//   2. layer.variantOffset            (legacy single offset)
//   3. variant.baseFrameOffsets[i]    (legacy per-base-frame)
//   4. { x: 0, y: 0 }                 (the floor)

describe("currentVariant — the offset fallback (all four levels)", () => {
  it("LEVEL 1: variantOffsets[selectedVariantId] wins over everything", () => {
    const { app } = makeApp(
      variantProject({
        layer: {
          variantOffsets: { [VARIANT_ID]: { x: 11, y: 12 } },
          variantOffset: { x: 21, y: 22 },
        },
        variant: { baseFrameOffsets: { 0: { x: 31, y: 32 } } },
      }),
    );
    expect(app.currentVariant?.offset).toEqual({ x: 11, y: 12 });
  });

  it("LEVEL 2: the legacy variantOffset when variantOffsets has no entry", () => {
    const { app } = makeApp(
      variantProject({
        layer: {
          variantOffsets: { "some-other-variant": { x: 99, y: 99 } },
          variantOffset: { x: 21, y: 22 },
        },
        variant: { baseFrameOffsets: { 0: { x: 31, y: 32 } } },
      }),
    );
    expect(app.currentVariant?.offset).toEqual({ x: 21, y: 22 });
  });

  it("LEVEL 3: baseFrameOffsets[baseFrameIndex] when neither layer offset exists", () => {
    const { app } = makeApp(
      variantProject({
        variant: { baseFrameOffsets: { 0: { x: 31, y: 32 } } },
      }),
    );
    expect(app.currentVariant?.offset).toEqual({ x: 31, y: 32 });
  });

  it("LEVEL 4: {x:0,y:0} when no offset is defined at any level", () => {
    const { app } = makeApp(variantProject({}));
    expect(app.currentVariant?.offset).toEqual({ x: 0, y: 0 });
  });

  it("an EXPLICIT {0,0} at level 1 still beats level 2 (`??`, not `||`)", () => {
    // The chain uses `??`, so a defined-but-zero offset is a real answer and
    // does NOT fall through. `||` here would silently promote level 2.
    const { app } = makeApp(
      variantProject({
        layer: {
          variantOffsets: { [VARIANT_ID]: { x: 0, y: 0 } },
          variantOffset: { x: 21, y: 22 },
        },
      }),
    );
    expect(app.currentVariant?.offset).toEqual({ x: 0, y: 0 });
  });

  it("an unmatched selectedFrameId collapses the whole chain to null", () => {
    // ⚠️ MEASURED, and worth recording: `helpers.ts:74-76` guards
    // `baseFrameIndex >= 0 ? baseFrameIndex : 0`, which reads as a live
    // fallback for "the base frame was not found". It is in fact UNREACHABLE
    // through the normal selection path in BOTH implementations — the same
    // `selectedFrameId` that feeds the `findIndex` also gates `currentFrame`,
    // so an unmatched id makes `currentLayer` null and the computed returns
    // null long before the offset chain runs.
    //
    // It is therefore defensive code, not a fifth precedence level. Pinned
    // here as the observed behaviour so a later task does not "restore" a
    // branch that never fired, and so the equivalence with the helper is
    // recorded rather than assumed.
    const project = variantProject({
      variant: { baseFrameOffsets: { 0: { x: 31, y: 32 } } },
    });
    const { app } = makeApp(project);
    runInAction(() => {
      app.selection.selectedFrameId = "no-such-frame";
    });
    expect(app.currentFrame).toBeNull();
    expect(app.currentLayer).toBeNull();
    expect(app.currentVariant).toBeNull();
  });
});

/* ── parity with the helper it replaces ──────────────────────────────────── */

describe("parity with store/helpers.ts", () => {
  it("matches getCurrentVariant's shape exactly", () => {
    const { app } = makeApp(
      variantProject({
        variant: { baseFrameOffsets: { 0: { x: 3, y: 4 } } },
      }),
    );
    expect(Object.keys(app.currentVariant ?? {}).sort()).toEqual(
      [
        "baseFrameIndex",
        "offset",
        "variant",
        "variantFrame",
        "variantGroup",
      ].sort(),
    );
  });
});

/* ── EQUIVALENCE: the computed vs the live legacy helper ─────────────────── */
//
// The strongest available proof that this migration is behaviour-preserving:
// run `createHelpers` (the real 93-line module, still on disk) and the MobX
// computeds over the SAME projects and require identical results. If a later
// task changes one and not the other, this fails.

describe("equivalence with the LIVE helpers.ts implementation", () => {
  const cases: Array<[string, Project]> = [
    ["plain project", tinyProject()],
    ["variant, no offsets", variantProject({})],
    [
      "variant, level 1 (variantOffsets)",
      variantProject({
        layer: {
          variantOffsets: { [VARIANT_ID]: { x: 11, y: 12 } },
          variantOffset: { x: 21, y: 22 },
        },
        variant: { baseFrameOffsets: { 0: { x: 31, y: 32 } } },
      }),
    ],
    [
      "variant, level 2 (legacy variantOffset)",
      variantProject({
        layer: { variantOffset: { x: 21, y: 22 } },
        variant: { baseFrameOffsets: { 0: { x: 31, y: 32 } } },
      }),
    ],
    [
      "variant, level 3 (baseFrameOffsets)",
      variantProject({
        variant: { baseFrameOffsets: { 0: { x: 31, y: 32 } } },
      }),
    ],
    [
      "variant, explicit zero at level 1",
      variantProject({
        layer: {
          variantOffsets: { [VARIANT_ID]: { x: 0, y: 0 } },
          variantOffset: { x: 21, y: 22 },
        },
      }),
    ],
    ["variant group missing", { ...variantProject({}), variants: [] }],
  ];

  it.each(cases)("%s — all 6 computeds agree", (_name, project) => {
    const { app } = makeApp(project);
    // The legacy helper reads everything through one `get()` returning the
    // project plus the other helpers, which is exactly how store/index.ts
    // wires it.
    const store: Record<string, unknown> = { project };
    const helpers = createHelpers(() => store as never);
    Object.assign(store, helpers);

    expect(app.currentObject).toEqual(helpers.getCurrentObject());
    expect(app.currentFrame).toEqual(helpers.getCurrentFrame());
    expect(app.currentLayer).toEqual(helpers.getCurrentLayer());
    expect(app.currentVariant).toEqual(helpers.getCurrentVariant());
    expect(app.selectedVariantLayer).toEqual(
      helpers.getSelectedVariantLayer(),
    );
    expect(app.isEditingVariant).toEqual(helpers.isEditingVariant());
  });
});
