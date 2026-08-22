/**
 * The store seams W29d added — the implementations that block the last six
 * legacy-hook container sites.
 *
 * ## Why these tests, and not more of them
 *
 * `src/store/__tests__/colorAdjustment.test.ts` (34 pins, both harness rows) is
 * the SPECIFICATION for the colour-adjustment behaviour, and it is frozen —
 * this wave may not touch it. But both of its rows dispatch through
 * the legacy Zustand hook, which during the bridge era means both rows exercise the
 * **Zustand** `colorAdjustmentActions.ts`. The MobX row varies READS, not
 * dispatch (`storeContract.ts:405`). So the new MobX implementations added
 * here are, by construction, NOT covered by those 34 pins.
 *
 * This file is that coverage: it drives the MobX seams DIRECTLY and asserts
 * they reproduce the four pinned semantics, so that when task 38 rewrites
 * `createMobxHarness.dispatch` to route at MobX, the pins meet an
 * implementation that has already been checked against them.
 *
 * ⚠️ Every assertion here is transcribed from an OBSERVED Zustand behaviour,
 * never from a preferred one — including the two that are arguably defects
 * (renamed layers stranded; several same-named layers in one frame all
 * recoloured). W29b pinned them as they are; so does this.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { runInAction } from "mobx";

import { ApplicationStore } from "@/stores/ApplicationStore";
import type { DomainMirror } from "@/stores/domain/DomainMutator";
import type { ProjectHost } from "@/stores/domain/DomainStore";
import type { SelectionSink } from "@/stores/domain/ObjectStore";
import {
  BLUE,
  GREEN,
  RED,
  mkLayer,
  tinyProject,
} from "@/store/__tests__/storeContract";
import type { Color, Frame, Layer, Project } from "@/types";

/* ── an ApplicationStore with no Zustand and no React attached ───────────── */

function makeApp(project: Project): ApplicationStore {
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
  const mirror: DomainMirror = {
    publish: (p) => {
      current = p;
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
    });
    app.selection.adoptVariantFrameIndices(
      project.uiState.variantFrameIndices ?? {},
    );
  });
  // The seams under test write history; start from a clean stack so the
  // single-entry assertions are unambiguous.
  runInAction(() => app.history.clear());
  return app;
}

/** Colour of one cell, read from the MobX tree rather than a `Project`. */
function cell(
  app: ApplicationStore,
  frameIndex: number,
  layerIndex: number,
  x: number,
  y: number,
): Color | 0 {
  const layer =
    app.domain.objects[0]?.frames[frameIndex]?.layers[layerIndex];
  return layer?.pixels[y]?.[x]?.color ?? 0;
}

/**
 * 3 frames, each with a layer named `"Body"` plus a differently-named
 * companion. Ids are DISTINCT per frame so an implementation matching on id
 * instead of name fails loudly — the same fixture shape `colorAdjustment.test.ts`
 * uses, for the same reason.
 */
function multiFrameProject(): Project {
  const mk = (id: string, name: string): Layer => ({ ...mkLayer(id), name });
  const frames: Frame[] = [
    {
      id: "frame-1",
      name: "Frame 1",
      layers: [mk("body-f1", "Body"), mk("hair-f1", "Hair")],
    },
    {
      id: "frame-2",
      name: "Frame 2",
      layers: [mk("body-f2", "Body"), mk("hair-f2", "Hair")],
    },
    {
      id: "frame-3",
      name: "Frame 3",
      layers: [mk("body-f3", "Body"), mk("hair-f3", "Hair")],
    },
  ];
  return tinyProject({ frames });
}

/** Paint (1,1) of every "Body" layer RED, directly on the tree. */
function paintBodyRed(project: Project, color: Color = RED): Project {
  return {
    ...project,
    objects: project.objects.map((o) => ({
      ...o,
      frames: o.frames.map((f) => ({
        ...f,
        layers: f.layers.map((l) => {
          if (l.name !== "Body") return l;
          const pixels = l.pixels.map((row) => [...row]);
          pixels[1][1] = { color, normal: 0, height: 1 };
          return { ...l, pixels };
        }),
      })),
    })),
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* A. ApplicationStore.startColorAdjustment — the ~190-line scan             */
/* ══════════════════════════════════════════════════════════════════════════ */

describe("ApplicationStore.startColorAdjustment — the scan", () => {
  let app: ApplicationStore;

  beforeEach(() => {
    app = makeApp(paintBodyRed(multiFrameProject()));
  });

  it("single-frame mode fills the FLAT list and leaves the Map absent", () => {
    app.startColorAdjustment(RED, false);
    const adj = app.ui.tool.colorAdjustment;
    expect(adj).not.toBeNull();
    expect(adj!.allFrames).toBe(false);
    expect(adj!.affectedPixels).toEqual([{ x: 1, y: 1 }]);
    expect(adj!.affectedPixelsByFrame).toBeUndefined();
  });

  it("all-frames mode fills the MAP and leaves the flat list EMPTY (pin 1)", () => {
    app.startColorAdjustment(RED, true);
    const adj = app.ui.tool.colorAdjustment!;
    expect(adj.allFrames).toBe(true);
    // The unused half of the tagged union — NOT a lost payload.
    expect(adj.affectedPixels).toEqual([]);
    expect(adj.affectedPixelsByFrame).toBeInstanceOf(Map);
    expect([...adj.affectedPixelsByFrame!.keys()].sort()).toEqual([
      "frame-1",
      "frame-2",
      "frame-3",
    ]);
  });

  it("keys the inner map by the per-frame LAYER ID, not the layer name", () => {
    app.startColorAdjustment(RED, true);
    const byFrame = app.ui.tool.colorAdjustment!.affectedPixelsByFrame!;
    expect([...byFrame.get("frame-2")!.keys()]).toEqual(["body-f2"]);
    expect(byFrame.get("frame-2")!.get("body-f2")).toEqual([{ x: 1, y: 1 }]);
  });

  it("matches layers BY NAME across frames (pin 2)", () => {
    app.startColorAdjustment(RED, true);
    const byFrame = app.ui.tool.colorAdjustment!.affectedPixelsByFrame!;
    // All three frames matched, though every layer id differs.
    expect(byFrame.size).toBe(3);
  });

  it("recolours EVERY same-named layer in one frame — `filter`, not `find`", () => {
    const mk = (id: string, name: string): Layer => ({ ...mkLayer(id), name });
    const project = paintBodyRed(
      tinyProject({
        frames: [
          {
            id: "frame-1",
            name: "Frame 1",
            layers: [mk("body-a", "Body"), mk("body-b", "Body")],
          },
        ],
      }),
    );
    const twin = makeApp(project);
    twin.startColorAdjustment(RED, true);
    const inner = twin.ui.tool.colorAdjustment!.affectedPixelsByFrame!.get(
      "frame-1",
    )!;
    expect([...inner.keys()].sort()).toEqual(["body-a", "body-b"]);
  });

  it("SILENTLY STRANDS a renamed layer — pinned as observed, not as desired", () => {
    const project = paintBodyRed(multiFrameProject());
    // Rename frame 2's Body. It still holds a RED pixel, and it is still the
    // "same" layer to a human — but name is the only cross-frame identity the
    // model has, so it drops out of the scan entirely.
    const renamed: Project = {
      ...project,
      objects: project.objects.map((o) => ({
        ...o,
        frames: o.frames.map((f) =>
          f.id === "frame-2"
            ? {
                ...f,
                layers: f.layers.map((l) =>
                  l.id === "body-f2" ? { ...l, name: "Torso" } : l,
                ),
              }
            : f,
        ),
      })),
    };
    const twin = makeApp(renamed);
    twin.startColorAdjustment(RED, true);
    const byFrame = twin.ui.tool.colorAdjustment!.affectedPixelsByFrame!;
    expect(byFrame.has("frame-2")).toBe(false);
    expect(byFrame.size).toBe(2);
  });

  it("omits a frame whose matching layers hold NO matching pixel", () => {
    app.startColorAdjustment(BLUE, true);
    expect(app.ui.tool.colorAdjustment!.affectedPixelsByFrame!.size).toBe(0);
  });

  it("requires an EXACT four-channel match (pin 4)", () => {
    // Same RGB, different alpha — not a match.
    const nearly: Color = { r: 255, g: 0, b: 0, a: 254 };
    app.startColorAdjustment(nearly, false);
    expect(app.ui.tool.colorAdjustment!.affectedPixels).toEqual([]);
  });

  it("never matches the transparent sentinel `0`", () => {
    // Every unpainted cell has `color: 0`. `typeof 0 === "object"` is false,
    // so a scan can never select them however the caller asks.
    app.startColorAdjustment(RED, false);
    expect(app.ui.tool.colorAdjustment!.affectedPixels).toHaveLength(1);
  });

  it("ALSO moves the colour picker to the adjusted colour (the coupled write)", () => {
    app.startColorAdjustment(RED, true);
    expect(app.ui.tool.selectedColor).toEqual(RED);
  });

  it("writes NO pixels and records NO history — the scan only reads", () => {
    const before = cell(app, 0, 0, 1, 1);
    app.startColorAdjustment(RED, true);
    expect(cell(app, 0, 0, 1, 1)).toBe(before);
    expect(app.history.entries).toHaveLength(0);
  });

  it("bails out silently when nothing is selected", () => {
    runInAction(() =>
      app.selection.adopt({
        selectedObjectId: null,
        selectedFrameId: null,
        selectedLayerId: null,
      }),
    );
    app.startColorAdjustment(RED, true);
    expect(app.ui.tool.colorAdjustment).toBeNull();
  });

  it("clearColorAdjustment drops it — the MobX home for the host callback", () => {
    app.startColorAdjustment(RED, true);
    expect(app.ui.tool.colorAdjustment).not.toBeNull();
    app.clearColorAdjustment();
    expect(app.ui.tool.colorAdjustment).toBeNull();
  });

  it("selectLayer drops it — `layerActions.ts:210`, now on the MobX copy too", () => {
    app.startColorAdjustment(RED, true);
    expect(app.ui.tool.colorAdjustment).not.toBeNull();
    // Before W29d this cleared ONLY Zustand's copy, through a
    // legacy-hook `setState` callback — so the MobX field stayed stale.
    runInAction(() => app.timelineUI.selectLayer("hair-f1"));
    expect(app.ui.tool.colorAdjustment).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* B. PixelStore.adjustColorAcross — the multi-target write                  */
/* ══════════════════════════════════════════════════════════════════════════ */

describe("PixelStore.adjustColorAcross — the multi-target write", () => {
  let app: ApplicationStore;

  beforeEach(() => {
    app = makeApp(paintBodyRed(multiFrameProject()));
  });

  /** Start an all-frames adjustment and hand back its Map. */
  function startedMap(color: Color = RED) {
    app.startColorAdjustment(color, true);
    return app.ui.tool.colorAdjustment!.affectedPixelsByFrame!;
  }

  it("recolours the matching cell in EVERY frame", () => {
    app.pixels.adjustColorAcross(startedMap(), BLUE, { trackHistory: true });
    expect(cell(app, 0, 0, 1, 1)).toEqual(BLUE);
    expect(cell(app, 1, 0, 1, 1)).toEqual(BLUE);
    expect(cell(app, 2, 0, 1, 1)).toEqual(BLUE);
  });

  it("leaves non-addressed layers alone", () => {
    app.pixels.adjustColorAcross(startedMap(), BLUE, { trackHistory: true });
    // The "Hair" layers were never in the Map.
    expect(cell(app, 0, 1, 1, 1)).toBe(0);
  });

  it("RECORDS EXACTLY ONE HISTORY ENTRY across three frames", () => {
    expect(app.history.entries).toHaveLength(0);
    app.pixels.adjustColorAcross(startedMap(), BLUE, { trackHistory: true });
    // Three layers written, three `commitCells` calls, ONE undo entry — the
    // transaction collapse. A naive loop would leave 3 here.
    expect(app.history.entries).toHaveLength(1);
  });

  it("that ONE entry undoes ALL three frames together", () => {
    app.pixels.adjustColorAcross(startedMap(), BLUE, { trackHistory: true });
    runInAction(() => app.history.undo());
    expect(cell(app, 0, 0, 1, 1)).toEqual(RED);
    expect(cell(app, 1, 0, 1, 1)).toEqual(RED);
    expect(cell(app, 2, 0, 1, 1)).toEqual(RED);
  });

  it("and redoes all three together", () => {
    app.pixels.adjustColorAcross(startedMap(), BLUE, { trackHistory: true });
    runInAction(() => app.history.undo());
    runInAction(() => app.history.redo());
    expect(cell(app, 0, 0, 1, 1)).toEqual(BLUE);
    expect(cell(app, 2, 0, 1, 1)).toEqual(BLUE);
  });

  it("records NOTHING when `trackHistory` is false, but still writes", () => {
    app.pixels.adjustColorAcross(startedMap(), BLUE, { trackHistory: false });
    expect(cell(app, 2, 0, 1, 1)).toEqual(BLUE);
    expect(app.history.entries).toHaveLength(0);
  });

  it("a SINGLE-layer write needs no transaction and still yields one entry", () => {
    const single = new Map([
      [
        "frame-1",
        new Map([["body-f1", [{ x: 1, y: 1 }]]]),
      ],
    ]);
    app.pixels.adjustColorAcross(single, BLUE, { trackHistory: true });
    expect(app.history.entries).toHaveLength(1);
    expect(cell(app, 0, 0, 1, 1)).toEqual(BLUE);
    // The other frames were not addressed.
    expect(cell(app, 1, 0, 1, 1)).toEqual(RED);
  });

  it("REPLAYS the snapshot verbatim — it does not re-match the colour (pin 3)", () => {
    const map = startedMap();
    app.pixels.adjustColorAcross(map, BLUE, { trackHistory: true });
    // The cells are BLUE now, so a re-matching implementation would find
    // nothing. The snapshot still addresses them, so the second adjustment
    // lands — which is what makes slider-dragging work.
    app.pixels.adjustColorAcross(map, GREEN, { trackHistory: true });
    expect(cell(app, 0, 0, 1, 1)).toEqual(GREEN);
    expect(cell(app, 2, 0, 1, 1)).toEqual(GREEN);
  });

  it("writes NO UI field — `selectedColor` is the caller's to set", () => {
    // Captured AFTER the start, because `startColorAdjustment` performs the
    // coupled `setColor` write — that one is deliberate and pinned. What is
    // asserted here is that the WRITE path adds none of its own.
    const map = startedMap();
    const before = app.ui.tool.selectedColor;
    app.pixels.adjustColorAcross(map, BLUE, { trackHistory: true });
    expect(app.ui.tool.selectedColor).toEqual(before);
  });

  it("an empty Map is a no-op returning 0", () => {
    expect(app.pixels.adjustColorAcross(new Map(), BLUE)).toBe(0);
    expect(app.history.entries).toHaveLength(0);
  });

  it("skips an unresolvable frame or layer id rather than throwing", () => {
    const bogus = new Map([
      ["no-such-frame", new Map([["no-such-layer", [{ x: 1, y: 1 }]]])],
      ["frame-1", new Map([["no-such-layer", [{ x: 1, y: 1 }]]])],
    ]);
    expect(app.pixels.adjustColorAcross(bogus, BLUE, { trackHistory: true })).toBe(
      0,
    );
    expect(app.history.entries).toHaveLength(0);
  });

  it("skips out-of-bounds cells", () => {
    const oob = new Map([
      ["frame-1", new Map([["body-f1", [{ x: 99, y: 99 }]]])],
    ]);
    expect(app.pixels.adjustColorAcross(oob, BLUE, { trackHistory: true })).toBe(0);
  });

  it("skips a cell already holding the target colour (no empty patch)", () => {
    const map = startedMap();
    // Adjust to the colour they already are.
    expect(app.pixels.adjustColorAcross(map, RED, { trackHistory: true })).toBe(0);
    expect(app.history.entries).toHaveLength(0);
  });

  it("PRESERVES normal and height, replacing only the colour", () => {
    runInAction(() => {
      app.pixels.setNormalPixel(1, 1, { x: 3, y: 4, z: 250 });
    });
    const before = app.domain.objects[0].frames[0].layers[0].pixels[1][1];
    expect(before.normal).not.toBe(0);
    app.startColorAdjustment(RED, true);
    app.pixels.adjustColorAcross(
      app.ui.tool.colorAdjustment!.affectedPixelsByFrame!,
      BLUE,
      { trackHistory: true },
    );
    const after = app.domain.objects[0].frames[0].layers[0].pixels[1][1];
    expect(after.color).toEqual(BLUE);
    expect(after.normal).toBe(before.normal);
    expect(after.height).toBe(before.height);
  });

  it("bumps `pixelVersion` — the canvas redraw signal", () => {
    const before = app.domain.pixelVersion;
    app.pixels.adjustColorAcross(startedMap(), BLUE, { trackHistory: true });
    expect(app.domain.pixelVersion).toBeGreaterThan(before);
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* C. The grid-resolution seams that were bridge closures                    */
/* ══════════════════════════════════════════════════════════════════════════ */

describe("ApplicationStore.editableGrid / selectionDims", () => {
  it("returns the selected layer's grid and the OBJECT's dimensions", () => {
    const app = makeApp(tinyProject({ width: 6, height: 5 }));
    const editable = app.editableGrid!;
    expect(editable.dims).toEqual({ width: 6, height: 5 });
    // BY REFERENCE — never a copy. `layer.pixels` is `observable.ref` (R2).
    expect(editable.grid).toBe(app.domain.objects[0].frames[0].layers[0].pixels);
  });

  it("selectionDims follows editableGrid", () => {
    const app = makeApp(tinyProject({ width: 6, height: 5 }));
    expect(app.selectionDims).toEqual({ width: 6, height: 5 });
  });

  it("falls back to 32x32 when nothing resolves — transcribed, not invented", () => {
    const app = makeApp(tinyProject());
    runInAction(() =>
      app.selection.adopt({
        selectedObjectId: null,
        selectedFrameId: null,
        selectedLayerId: null,
      }),
    );
    expect(app.editableGrid).toBeNull();
    expect(app.selectionDims).toEqual({ width: 32, height: 32 });
  });
});

/* ══════════════════════════════════════════════════════════════════════════ */
/* D. setAiServiceUrl — the PERSISTING write                                */
/* ══════════════════════════════════════════════════════════════════════════ */

describe("ApplicationStore.setAiServiceUrl", () => {
  function rig() {
    const published: string[] = [];
    let current: Project | null = tinyProject();
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
    const app = new ApplicationStore({
      autoSaveEnabled: false,
      projectHost: host,
      publishAiServiceUrl: (url) => published.push(url),
    });
    return { app, published };
  }

  it("writes the PERSISTING half — not just the observable", () => {
    const { app, published } = rig();
    app.setAiServiceUrl("http://ai.invalid:9000");
    // THE assertion this whole seam exists for. `session.setAiServiceUrl`
    // alone would leave this array empty, the URL would look set, and it
    // would be gone on the next reload.
    expect(published).toEqual(["http://ai.invalid:9000"]);
  });

  it("also updates the observable eagerly, so an observer re-renders now", () => {
    const { app } = rig();
    app.setAiServiceUrl("http://ai.invalid:9000");
    expect(app.session.aiServiceUrl).toBe("http://ai.invalid:9000");
  });

  it("the persisted value reaches the save payload", () => {
    // `UIStore.toPersistedUIState()` reads `session.aiServiceUrl`, so the
    // wire format carries it — this is the read side of the round trip.
    const { app } = rig();
    app.setAiServiceUrl("http://ai.invalid:9000");
    expect(app.ui.toPersistedUIState().aiServiceUrl).toBe(
      "http://ai.invalid:9000",
    );
  });

  it("bumps persistedUIVersion, which now SCHEDULES A SAVE (W29d)", () => {
    const { app } = rig();
    const before = app.ui.persistedUIVersion;
    app.setAiServiceUrl("http://ai.invalid:9000");
    // Before W29d this bump reached nothing: `AutoSaveController`'s trigger
    // tuple did not contain the counter. See that class's header.
    expect(app.ui.persistedUIVersion).toBeGreaterThan(before);
  });
});

describe("ApplicationStore.setColorAndAddToHistory", () => {
  function rig() {
    const published: Color[] = [];
    let current: Project | null = tinyProject();
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
    const app = new ApplicationStore({
      autoSaveEnabled: false,
      projectHost: host,
      publishColorAndHistory: (c) => published.push(c),
    });
    return { app, published };
  }

  it("writes the ZUSTAND-SOURCED half — the measured clobber, pinned", () => {
    const { app, published } = rig();
    app.setColorAndAddToHistory(RED);
    // MEASURED W29d with the bridge installed: a MobX-only write to
    // `selectedColor` reverted to black, and `colorHistory` went 1 -> 0, on
    // the very next unrelated Zustand change — `selectedColor` is re-hydrated
    // wholesale at `zustandBridge.ts:334` and `colorHistory` is a Phase A
    // mirror at `:340`. An empty array here means the seam writes only MobX
    // and will silently revert in the real app.
    expect(published).toEqual([RED]);
  });

  it("sets the colour and records the history entry eagerly", () => {
    const { app } = rig();
    app.setColorAndAddToHistory(RED);
    expect(app.ui.tool.selectedColor).toEqual(RED);
    expect(app.session.colorHistory[0]).toEqual(RED);
  });

  it("moves an existing colour to the FRONT rather than duplicating it", () => {
    const { app } = rig();
    app.setColorAndAddToHistory(RED);
    app.setColorAndAddToHistory(BLUE);
    app.setColorAndAddToHistory(RED);
    expect(app.session.colorHistory[0]).toEqual(RED);
    expect(app.session.colorHistory).toHaveLength(2);
  });
});

describe("ApplicationStore.undo / redo", () => {
  it("routes through the SINGLE mirror writer, not HistoryStore directly", () => {
    const calls: string[] = [];
    const app = new ApplicationStore({
      autoSaveEnabled: false,
      historyControl: {
        undo: () => calls.push("undo"),
        redo: () => calls.push("redo"),
      },
    });
    app.undo();
    app.redo();
    // ⚠️ `app.history.undo()` would undo the command and leave the bridge-era
    // Phase B `projectHistory`/`historyIndex` mirror describing the PRE-undo
    // stack. The glue in `store/index.ts` is its one writer (R6).
    expect(calls).toEqual(["undo", "redo"]);
  });
});

describe("SelectionUIStore.maskWriteOptions", () => {
  it("carries the mask and its size but DELIBERATELY omits `behavior`", () => {
    const app = makeApp(tinyProject({ width: 4, height: 4 }));
    runInAction(() =>
      app.selectionUI.setSelection(
        { x: 0, y: 0, width: 2, height: 2 },
        { width: 4, height: 4 },
      ),
    );
    const options = app.selectionUI.maskWriteOptions;
    expect(options.mask).toBeInstanceOf(Set);
    expect(options.maskSize).toEqual({ width: 4, height: 4 });
    // `moveSelectedPixels` / `deleteSelectionPixels` are NOT gated by
    // `selectionBehavior` — the legacy actions never consulted it, and
    // including it would let `"editMask"` filter out the very pixels they
    // exist to move.
    expect("behavior" in options).toBe(false);
    // Contrast `writeOptions`, which DOES carry it.
    expect(app.selectionUI.writeOptions.behavior).toBeDefined();
  });

  it("is empty — not throwing — with no selection", () => {
    const app = makeApp(tinyProject());
    expect(app.selectionUI.maskWriteOptions).toEqual({
      mask: undefined,
      maskSize: undefined,
    });
  });
});

/* ════════════════════════════════════════════════════════════════════════ */
/* W29h. PixelStore.adjustVariantColorAcross — the VARIANT multi-target write */
/* ════════════════════════════════════════════════════════════════════════ */

/**
 * The variant twin of the block above, and the reason W29h exists at all.
 *
 * `adjustColorAcross` refuses variants (W29d) because the two paths key their
 * snapshots differently — real `frame.id` + layer NAME on the object path,
 * synthetic `variant-frame-<index>` + layer ID on the variant path. W29h adds
 * `PixelTarget.variant.layerIndex` so the write engine can reach a variant
 * layer other than `layers[0]`, and `adjustVariantColorAcross` is the method
 * that spends it.
 *
 * The behaviour asserted here is W29g's, transcribed: all-frames variant
 * adjustment recolours EVERY layer of every variant frame, with no name
 * matching anywhere.
 */

/** A variant group: 3 frames × 2 layers, plus a host layer that selects it. */
function variantProject(): Project {
  const base = tinyProject({
    layers: [
      mkLayer("layer-1", 4, 4, {
        isVariant: true,
        variantGroupId: "vg-1",
        selectedVariantId: "v-1",
      }),
    ],
  });
  return {
    ...base,
    variants: [
      {
        id: "vg-1",
        name: "Group",
        variants: [
          {
            id: "v-1",
            name: "Variant 1",
            gridSize: { width: 4, height: 4 },
            baseFrameOffsets: {},
            frames: [0, 1, 2].map((f) => ({
              id: `vf-${f}`,
              name: `VF ${f}`,
              layers: [
                mkLayer(`vl-${f}-a`, 4, 4),
                mkLayer(`vl-${f}-b`, 4, 4),
              ],
            })),
          },
        ],
      },
    ],
  } as Project;
}

/** Paint (1,1) of EVERY variant layer, directly on the fixture. */
function paintAllVariantLayers(project: Project, color: Color = RED): Project {
  return {
    ...project,
    variants: project.variants!.map((vg) => ({
      ...vg,
      variants: vg.variants.map((v) => ({
        ...v,
        frames: v.frames.map((vf) => ({
          ...vf,
          layers: vf.layers.map((vl) => {
            const pixels = vl.pixels.map((row) => [...row]);
            pixels[1][1] = { color, normal: 0, height: 1 };
            return { ...vl, pixels };
          }),
        })),
      })),
    })),
  };
}

/** Colour of a variant cell, read from the MobX tree. */
function vcell(
  app: ApplicationStore,
  f: number,
  l: number,
  x = 1,
  y = 1,
): Color | 0 {
  return (
    app.domain.variants[0]?.variants[0]?.frames[f]?.layers[l]?.pixels[y]?.[x]
      ?.color ?? 0
  );
}

describe("W29h — PixelStore.adjustVariantColorAcross", () => {
  let app: ApplicationStore;

  /** Start an all-frames adjustment on RED and hand back the snapshot map. */
  const startedMap = () => {
    app.startColorAdjustment(RED, true);
    const state = app.ui.tool.colorAdjustment;
    const byFrame = state?.affectedPixelsByFrame;
    if (!byFrame) throw new Error("no snapshot");
    // The snapshot keys by `variant-frame-<index>`; the write engine addresses
    // by index. This is the translation the container performs.
    const out = new Map<
      number,
      Map<string, readonly { x: number; y: number }[]>
    >();
    for (const [key, byLayer] of byFrame) {
      const m = /^variant-frame-(\d+)$/.exec(key);
      if (!m) continue;
      out.set(Number(m[1]), new Map(byLayer));
    }
    return out;
  };

  beforeEach(() => {
    app = makeApp(paintAllVariantLayers(variantProject()));
  });

  it("the fixture selects the variant — the variant branch is reachable", () => {
    expect(app.isEditingVariant).toBe(true);
    expect(app.currentVariant?.variant.id).toBe("v-1");
  });

  it("the snapshot covers EVERY layer of every variant frame (W29g pin)", () => {
    const map = startedMap();
    expect([...map.keys()].sort()).toEqual([0, 1, 2]);
    for (const byLayer of map.values()) expect(byLayer.size).toBe(2);
  });

  it("⭐ recolours EVERY layer of every variant frame — 6 layers written", () => {
    const written = app.pixels.adjustVariantColorAcross(
      "vg-1",
      "v-1",
      startedMap(),
      BLUE,
      { trackHistory: true },
    );
    expect(written).toBe(6);
    for (const f of [0, 1, 2]) {
      for (const l of [0, 1]) expect(vcell(app, f, l)).toEqual(BLUE);
    }
  });

  it("⭐ layer 1 is genuinely written — not aliased onto layer 0", () => {
    // The whole point of `layerIndex`. Before W29h the engine could only
    // address `layers[0]`, so this cell stayed RED.
    app.pixels.adjustVariantColorAcross("vg-1", "v-1", startedMap(), BLUE, {
      trackHistory: true,
    });
    expect(vcell(app, 0, 1)).toEqual(BLUE);
    expect(vcell(app, 2, 1)).toEqual(BLUE);
  });

  it("writes ONE history entry for all six layers (W29d semantic)", () => {
    app.pixels.adjustVariantColorAcross("vg-1", "v-1", startedMap(), BLUE, {
      trackHistory: true,
    });
    expect(app.history.entries).toHaveLength(1);
  });

  it("⭐ that ONE entry undoes each layer back onto ITSELF", () => {
    app.pixels.adjustVariantColorAcross("vg-1", "v-1", startedMap(), BLUE, {
      trackHistory: true,
    });
    app.history.undo();
    for (const f of [0, 1, 2]) {
      for (const l of [0, 1]) expect(vcell(app, f, l)).toEqual(RED);
    }
    app.history.redo();
    for (const f of [0, 1, 2]) {
      for (const l of [0, 1]) expect(vcell(app, f, l)).toEqual(BLUE);
    }
  });

  it("records NOTHING with trackHistory false", () => {
    app.pixels.adjustVariantColorAcross("vg-1", "v-1", startedMap(), BLUE, {
      trackHistory: false,
    });
    expect(app.history.entries).toHaveLength(0);
    expect(vcell(app, 1, 1)).toEqual(BLUE);
  });

  it("replays the START snapshot verbatim — the slider-drag semantic", () => {
    const map = startedMap();
    app.pixels.adjustVariantColorAcross("vg-1", "v-1", map, BLUE, {
      trackHistory: true,
    });
    // The cells are no longer RED, but the snapshot is replayed as recorded.
    app.pixels.adjustVariantColorAcross("vg-1", "v-1", map, GREEN, {
      trackHistory: true,
    });
    for (const f of [0, 1, 2]) {
      for (const l of [0, 1]) expect(vcell(app, f, l)).toEqual(GREEN);
    }
  });

  it("skips an unknown layer id rather than guessing at layers[0]", () => {
    const map = new Map([
      [0, new Map([["not-a-layer", [{ x: 1, y: 1 }]]])],
    ]);
    expect(
      app.pixels.adjustVariantColorAcross("vg-1", "v-1", map, BLUE, {
        trackHistory: true,
      }),
    ).toBe(0);
    expect(vcell(app, 0, 0)).toEqual(RED);
  });

  it("skips an out-of-range frame index", () => {
    const map = new Map([[9, new Map([["vl-0-a", [{ x: 1, y: 1 }]]])]]);
    expect(app.pixels.adjustVariantColorAcross("vg-1", "v-1", map, BLUE)).toBe(0);
  });

  it("returns 0 for an unknown variant group, writing nothing", () => {
    expect(
      app.pixels.adjustVariantColorAcross("nope", "v-1", startedMap(), BLUE),
    ).toBe(0);
    expect(vcell(app, 0, 0)).toEqual(RED);
  });

  it("returns 0 on an empty map", () => {
    expect(
      app.pixels.adjustVariantColorAcross("vg-1", "v-1", new Map(), BLUE),
    ).toBe(0);
  });

  it("re-applying the SAME colour records no entry (patch list empties)", () => {
    expect(
      app.pixels.adjustVariantColorAcross("vg-1", "v-1", startedMap(), RED, {
        trackHistory: true,
      }),
    ).toBe(0);
    expect(app.history.entries).toHaveLength(0);
  });

  it("preserves normal and height on every recoloured cell", () => {
    app.pixels.adjustVariantColorAcross("vg-1", "v-1", startedMap(), BLUE, {
      trackHistory: true,
    });
    const cellData =
      app.domain.variants[0].variants[0].frames[0].layers[1].pixels[1][1];
    expect(cellData.height).toBe(1);
    expect(cellData.normal).toBe(0);
  });

  it("writes NO UI field — `selectedColor` is the caller's", () => {
    // ⚠️ `startColorAdjustment` moves the picker to the colour being adjusted
    // — its own pinned coupled write (W29b pin 4) — so `before` must be read
    // AFTER the snapshot is taken, not before. The assertion is that the
    // PIXEL write leaves it alone: `uiState.selectedColor` belongs to
    // `ApplicationStore.adjustColor`, never to `PixelStore`.
    const map = startedMap();
    const before = app.ui.tool.selectedColor;
    expect(before).toEqual(RED);
    app.pixels.adjustVariantColorAcross("vg-1", "v-1", map, GREEN, {
      trackHistory: true,
    });
    expect(app.ui.tool.selectedColor).toEqual(before);
  });

  it("a SINGLE-layer map opens no transaction (still one entry)", () => {
    const map = new Map([[0, new Map([["vl-0-a", [{ x: 1, y: 1 }]]])]]);
    expect(
      app.pixels.adjustVariantColorAcross("vg-1", "v-1", map, BLUE, {
        trackHistory: true,
      }),
    ).toBe(1);
    expect(app.history.entries).toHaveLength(1);
    expect(vcell(app, 0, 0)).toEqual(BLUE);
    expect(vcell(app, 0, 1)).toEqual(RED);
  });

  it("leaves the OBJECT tree untouched", () => {
    const objGrid = app.domain.objects[0].frames[0].layers[0].pixels;
    app.pixels.adjustVariantColorAcross("vg-1", "v-1", startedMap(), BLUE, {
      trackHistory: true,
    });
    expect(app.domain.objects[0].frames[0].layers[0].pixels).toBe(objGrid);
  });
});

/* ════════════════════════════════════════════════════════════════════════ */
/* W29h. ApplicationStore.adjustColor — the dispatcher the containers call   */
/* ════════════════════════════════════════════════════════════════════════ */

/**
 * `ColorPickerContainer` now dispatches here instead of at Zustand's
 * `adjustColor`, so this is the surface the migration actually rests on. It
 * dispatches over four cases — {variant, object} × {allFrames, single} — and
 * carries the coupled `uiState.selectedColor` write the legacy action folded
 * into the same commit.
 */
describe("W29h — ApplicationStore.adjustColor (the container's entry point)", () => {
  /** Record what reaches the Zustand `selectedColor` sink. */
  function makeAppWithSink(project: Project): {
    app: ApplicationStore;
    published: Color[];
  } {
    const published: Color[] = [];
    let current: Project | null = project;
    const app = new ApplicationStore({
      autoSaveEnabled: false,
      projectHost: {
        getProject: () => current,
        installProject: (p) => {
          current = p;
        },
        replaceProject: (p) => {
          current = p;
        },
        snapshotToHistory: () => {},
      },
      domainMirror: {
        publish: (p) => {
          current = p;
        },
        snapshot: () => {},
      },
      selectionSink: { selectObjectTree: () => {} },
      publishSelectedColor: (color) => published.push(color),
    });
    runInAction(() => {
      app.domain.adoptTree(project);
      app.selection.adopt({
        selectedObjectId: project.uiState.selectedObjectId,
        selectedFrameId: project.uiState.selectedFrameId,
        selectedLayerId: project.uiState.selectedLayerId,
      });
      app.selection.adoptVariantFrameIndices(
        project.uiState.variantFrameIndices ?? {},
      );
      app.history.clear();
    });
    return { app, published };
  }

  it("is a NO-OP with nothing pending — returns 0, publishes nothing", () => {
    const { app, published } = makeAppWithSink(paintBodyRed(multiFrameProject()));
    expect(app.adjustColor(BLUE, true)).toBe(0);
    expect(published).toEqual([]);
    expect(app.history.entries).toHaveLength(0);
  });

  it("object + allFrames: recolours every same-named layer, ONE entry", () => {
    const { app } = makeAppWithSink(paintBodyRed(multiFrameProject()));
    app.startColorAdjustment(RED, true);
    expect(app.adjustColor(BLUE, true)).toBe(3);
    expect(cell(app, 0, 0, 1, 1)).toEqual(BLUE);
    expect(cell(app, 2, 0, 1, 1)).toEqual(BLUE);
    expect(app.history.entries).toHaveLength(1);
  });

  it("object + single frame: recolours only the selected layer", () => {
    const { app } = makeAppWithSink(paintBodyRed(multiFrameProject()));
    app.startColorAdjustment(RED, false);
    expect(app.adjustColor(BLUE, true)).toBe(1);
    expect(cell(app, 0, 0, 1, 1)).toEqual(BLUE);
    expect(cell(app, 1, 0, 1, 1)).toEqual(RED);
  });

  it("⭐ variant + allFrames: recolours EVERY layer of every variant frame", () => {
    const { app } = makeAppWithSink(paintAllVariantLayers(variantProject()));
    app.startColorAdjustment(RED, true);
    // 3 frames × 2 layers. Before W29h the engine reached only `layers[0]`.
    expect(app.adjustColor(BLUE, true)).toBe(6);
    for (const f of [0, 1, 2]) {
      for (const l of [0, 1]) expect(vcell(app, f, l)).toEqual(BLUE);
    }
    expect(app.history.entries).toHaveLength(1);
  });

  it("⭐ that ONE entry undoes every variant layer back onto ITSELF", () => {
    const { app } = makeAppWithSink(paintAllVariantLayers(variantProject()));
    app.startColorAdjustment(RED, true);
    app.adjustColor(BLUE, true);
    app.history.undo();
    for (const f of [0, 1, 2]) {
      for (const l of [0, 1]) expect(vcell(app, f, l)).toEqual(RED);
    }
  });

  it("variant + single frame STILL writes layers[0] only — W29g's pinned defect", () => {
    // ⚠️ NOT a bug introduced here, and NOT fixed here. `resolveTarget`'s
    // variant branch transcribes `getSelectedVariantLayer()`, which ignores
    // `selectedLayerId` and always returns `layers[0]`. W29g pinned it;
    // changing it needs owner sign-off. W29h enabled the ENGINE only.
    const { app } = makeAppWithSink(paintAllVariantLayers(variantProject()));
    app.startColorAdjustment(RED, false);
    app.adjustColor(BLUE, true);
    expect(vcell(app, 0, 0)).toEqual(BLUE);
    expect(vcell(app, 0, 1)).toEqual(RED); // layer 1 untouched — the defect
  });

  it("publishes `selectedColor` through the ZUSTAND sink, not MobX-only", () => {
    const { app, published } = makeAppWithSink(paintBodyRed(multiFrameProject()));
    app.startColorAdjustment(RED, true);
    app.adjustColor(BLUE, true);
    // A MobX-only write is reverted by the next unrelated Zustand change —
    // measured in W29d. The sink writes the source.
    expect(published).toEqual([BLUE]);
    expect(app.ui.tool.selectedColor).toEqual(BLUE);
  });

  it("does NOT prepend to colorHistory — a slider drag must not flood it", () => {
    const { app } = makeAppWithSink(paintBodyRed(multiFrameProject()));
    const before = app.session.colorHistory.length;
    app.startColorAdjustment(RED, true);
    app.adjustColor(BLUE, true);
    app.adjustColor(GREEN, true);
    expect(app.session.colorHistory.length).toBe(before);
  });

  it("replays the START snapshot on every call — the slider-drag semantic", () => {
    const { app } = makeAppWithSink(paintBodyRed(multiFrameProject()));
    app.startColorAdjustment(RED, true);
    app.adjustColor(BLUE, true);
    // The cells are BLUE now, but the snapshot still names them.
    expect(app.adjustColor(GREEN, true)).toBe(3);
    expect(cell(app, 0, 0, 1, 1)).toEqual(GREEN);
  });

  it("records NO history entry with trackHistory false (the drag default)", () => {
    const { app } = makeAppWithSink(paintBodyRed(multiFrameProject()));
    app.startColorAdjustment(RED, true);
    app.adjustColor(BLUE, false);
    expect(app.history.entries).toHaveLength(0);
    expect(cell(app, 0, 0, 1, 1)).toEqual(BLUE);
  });

  it("after clearColorAdjustment it is a no-op again", () => {
    const { app } = makeAppWithSink(paintBodyRed(multiFrameProject()));
    app.startColorAdjustment(RED, true);
    app.clearColorAdjustment();
    expect(app.adjustColor(BLUE, true)).toBe(0);
    expect(cell(app, 0, 0, 1, 1)).toEqual(RED);
  });
});
