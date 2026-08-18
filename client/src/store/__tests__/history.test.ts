/**
 * Behaviour contract — undo, history cloning, the cap, and the `trackHistory`
 * census.
 *
 * MASTER.md R4: 129 `updateProjectAndSave` call sites, 3 `trackHistory`
 * semantics, and undo/redo correctness that otherwise becomes per-action manual
 * work. This is the only baseline that will ever exist for it.
 *
 * ## Memory discipline
 *
 * The cap test fills history to `MAX_HISTORY = 100`. A runtime snapshot of the
 * real `Base Unit.json` measures **6.9 MB**, so 100 of those is ~680 MB and WILL
 * OOM the worker. Every fixture here is `tinyProject()` — 1 object × 1 frame ×
 * 1 layer × **4×4** grid. Do not enlarge it.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BLUE,
  GREEN,
  HARNESSES,
  RED,
  colorAt,
  layerOf,
  tinyProject,
  type StoreHarness,
} from "./storeContract";
import { MAX_HISTORY } from "@/store/storeTypes";

// Task 16: the store no longer imports services/api (deleted) — dispatching
// actions can no longer reach the network, so the defensive module mock that
// used to live here is gone with it.

describe.each(HARNESSES)("%s — history", (_name, makeHarness) => {
  let harness: StoreHarness;

  beforeEach(() => {
    harness = makeHarness();
    harness.reset();
    harness.load(tinyProject());
  });

  afterEach(() => {
    harness.dispatch("endStroke");
    harness.reset();
  });

  /* ── the snapshot cursor ───────────────────────────────────────────────── */

  describe("snapshot bookkeeping", () => {
    it("starts empty with the index at -1", () => {
      expect(harness.getHistoryLength()).toBe(0);
      expect(harness.getHistoryIndex()).toBe(-1);
    });

    it("a tracking edit appends ONE entry and advances the index", () => {
      harness.dispatch("setPixel", 1, 1, RED);
      expect(harness.getHistoryLength()).toBe(1);
      expect(harness.getHistoryIndex()).toBe(0);

      harness.dispatch("setPixel", 2, 2, BLUE);
      expect(harness.getHistoryLength()).toBe(2);
      expect(harness.getHistoryIndex()).toBe(1);
    });

    it("the snapshot is the state BEFORE the edit, not after", () => {
      harness.dispatch("setPixel", 1, 1, RED);
      // The live project has the red pixel…
      expect(colorAt(harness.getProject(), 1, 1)).toEqual(RED);
      // …and history entry 0 is the pristine pre-edit project.
      expect(colorAt(harness.getHistoryEntry(0), 1, 1)).toBe(0);
    });

    it("a NON-tracking action leaves the history untouched", () => {
      harness.dispatch("setPixel", 1, 1, RED);
      const before = harness.getHistoryLength();
      harness.dispatch("setTool", "eraser");
      harness.dispatch("setBrushSize", 5);
      harness.dispatch("setZoom", 20);
      expect(harness.getHistoryLength()).toBe(before);
      expect(harness.getHistoryIndex()).toBe(before - 1);
    });

    it("saveCurrentStateToHistory snapshots WITHOUT changing the project", () => {
      const before = JSON.stringify(harness.getProject());
      harness.dispatch("saveCurrentStateToHistory");
      expect(harness.getHistoryLength()).toBe(1);
      expect(JSON.stringify(harness.getProject())).toBe(before);
    });
  });

  /* ── undo ──────────────────────────────────────────────────────────────── */

  describe("undo", () => {
    it("restores the prior pixels", () => {
      harness.dispatch("setPixel", 1, 1, RED);
      expect(colorAt(harness.getProject(), 1, 1)).toEqual(RED);

      harness.dispatch("undo");
      expect(colorAt(harness.getProject(), 1, 1)).toBe(0);
    });

    it("walks back through several edits in order", () => {
      harness.dispatch("setPixel", 0, 0, RED);
      harness.dispatch("setPixel", 1, 1, BLUE);
      harness.dispatch("setPixel", 2, 2, GREEN);

      harness.dispatch("undo");
      expect(colorAt(harness.getProject(), 2, 2)).toBe(0);
      expect(colorAt(harness.getProject(), 1, 1)).toEqual(BLUE);

      harness.dispatch("undo");
      expect(colorAt(harness.getProject(), 1, 1)).toBe(0);
      expect(colorAt(harness.getProject(), 0, 0)).toEqual(RED);

      harness.dispatch("undo");
      expect(colorAt(harness.getProject(), 0, 0)).toBe(0);
    });

    it("decrements the index but does NOT shorten the list", () => {
      harness.dispatch("setPixel", 1, 1, RED);
      harness.dispatch("setPixel", 2, 2, BLUE);
      expect(harness.getHistoryLength()).toBe(2);

      harness.dispatch("undo");
      expect(harness.getHistoryLength()).toBe(2);
      expect(harness.getHistoryIndex()).toBe(0);
    });

    it("is a NO-OP once the index reaches -1", () => {
      harness.dispatch("setPixel", 1, 1, RED);
      harness.dispatch("undo");
      expect(harness.getHistoryIndex()).toBe(-1);

      const snapshot = JSON.stringify(harness.getProject());
      harness.dispatch("undo");
      harness.dispatch("undo");
      expect(harness.getHistoryIndex()).toBe(-1);
      expect(JSON.stringify(harness.getProject())).toBe(snapshot);
    });

    it("is a NO-OP on empty history", () => {
      const snapshot = JSON.stringify(harness.getProject());
      harness.dispatch("undo");
      expect(harness.getHistoryIndex()).toBe(-1);
      expect(JSON.stringify(harness.getProject())).toBe(snapshot);
    });

    it("restores a CLONE, so a later edit cannot corrupt the snapshot", () => {
      harness.dispatch("setPixel", 1, 1, RED);
      harness.dispatch("undo");
      const restored = harness.getProject();
      const entry = harness.getHistoryEntry(0);
      expect(restored).not.toBe(entry);
    });
  });

  /* ── the redo tail truncation (store/index.ts:62) ──────────────────────── */

  describe("redo-tail truncation", () => {
    it("a new edit after an undo TRUNCATES everything after the cursor", () => {
      harness.dispatch("setPixel", 0, 0, RED);
      harness.dispatch("setPixel", 1, 1, BLUE);
      harness.dispatch("setPixel", 2, 2, GREEN);
      expect(harness.getHistoryLength()).toBe(3);

      harness.dispatch("undo");
      harness.dispatch("undo");
      expect(harness.getHistoryIndex()).toBe(0);
      // The tail is still PHYSICALLY present until the next edit.
      expect(harness.getHistoryLength()).toBe(3);

      harness.dispatch("setPixel", 3, 3, RED);
      // `slice(0, historyIndex + 1)` keeps entries [0..0], then appends one.
      expect(harness.getHistoryLength()).toBe(2);
      expect(harness.getHistoryIndex()).toBe(1);
    });

    it("the truncated branch is genuinely unreachable afterwards", () => {
      harness.dispatch("setPixel", 0, 0, RED);
      harness.dispatch("setPixel", 1, 1, BLUE);
      harness.dispatch("undo");
      harness.dispatch("setPixel", 2, 2, GREEN);

      // Undo now walks the NEW branch, never back to BLUE at (1,1).
      harness.dispatch("undo");
      expect(colorAt(harness.getProject(), 2, 2)).toBe(0);
      expect(colorAt(harness.getProject(), 1, 1)).toBe(0);
      expect(colorAt(harness.getProject(), 0, 0)).toEqual(RED);
    });

    it("truncation from index -1 discards the ENTIRE history", () => {
      harness.dispatch("setPixel", 0, 0, RED);
      harness.dispatch("setPixel", 1, 1, BLUE);
      harness.dispatch("undo");
      harness.dispatch("undo");
      expect(harness.getHistoryIndex()).toBe(-1);

      harness.dispatch("setPixel", 2, 2, GREEN);
      // slice(0, 0) === [] then one append.
      expect(harness.getHistoryLength()).toBe(1);
      expect(harness.getHistoryIndex()).toBe(0);
    });
  });

  /* ── the round-trip clone (store/index.ts:57-58) ───────────────────────── */

  describe("history cloning", () => {
    it("mutating the LIVE project in place does not change the snapshot", () => {
      harness.dispatch("setPixel", 0, 0, RED);
      const entry = harness.getHistoryEntry(0)!;
      const before = JSON.stringify(entry);

      // Reach into the live project and corrupt it directly. The snapshot went
      // through `compactToProject(projectToCompact(p))`, so it shares nothing.
      const live = layerOf(harness.getProject())!;
      live.pixels[3][3] = { color: BLUE, normal: 0, height: 9 };
      live.name = "mutated in place";

      expect(JSON.stringify(harness.getHistoryEntry(0))).toBe(before);
    });

    it("two consecutive snapshots share no pixel arrays", () => {
      harness.dispatch("setPixel", 0, 0, RED);
      harness.dispatch("setPixel", 1, 1, BLUE);
      const a = layerOf(harness.getHistoryEntry(0))!;
      const b = layerOf(harness.getHistoryEntry(1))!;
      expect(a.pixels).not.toBe(b.pixels);
      expect(a.pixels[0]).not.toBe(b.pixels[0]);
    });

    it("the snapshot survives the serializer round-trip losslessly for a tiny project", () => {
      harness.dispatch("setPixel", 2, 3, RED);
      harness.dispatch("undo");
      // After undo the project has itself been round-tripped twice.
      const p = harness.getProject()!;
      expect(p.objects).toHaveLength(1);
      expect(p.objects[0].gridSize).toEqual({ width: 4, height: 4 });
      expect(p.objects[0].frames[0].layers).toHaveLength(1);
      expect(colorAt(p, 2, 3)).toBe(0);
    });
  });

  /* ── the cap (store/index.ts:66-68) ────────────────────────────────────── */

  describe("the MAX_HISTORY cap", () => {
    it("caps at MAX_HISTORY and SHIFTS FROM THE FRONT, not the back", () => {
      const restore = harness.setMaxHistory(5);
      const cap = harness.getMaxHistory();

      // ⚠️ 4×4 tinyProject ONLY. See the memory note at the top of this file —
      // 100 snapshots of a realistic project is ~680 MB.
      const total = cap + 3;
      for (let i = 0; i < total; i++) {
        // Distinct colours so the retained window is identifiable.
        harness.dispatch("setPixel", i % 4, Math.floor(i / 4) % 4, {
          r: i % 256,
          g: 0,
          b: 0,
          a: 255,
        });
      }

      expect(harness.getHistoryLength()).toBe(cap);
      expect(harness.getHistoryIndex()).toBe(cap - 1);

      // The FIRST snapshot (the pristine, all-empty project) has been evicted:
      // the oldest surviving entry already carries edits.
      const oldest = harness.getHistoryEntry(0)!;
      const anyPainted = oldest.objects[0].frames[0].layers[0].pixels
        .flat()
        .some((p) => p.color !== 0);
      expect(anyPainted).toBe(true);

      restore?.();
    });

    it("the real cap is 100 and the harness reports it", () => {
      // A MobX harness may lower this; the Zustand one cannot (MAX_HISTORY is a
      // module const captured in a closure), so it reports the true value.
      expect(harness.getMaxHistory()).toBe(MAX_HISTORY);
      expect(MAX_HISTORY).toBe(100);
    });

    it("under the cap, nothing is evicted", () => {
      for (let i = 0; i < 8; i++) {
        harness.dispatch("setPixel", i % 4, Math.floor(i / 4) % 4, RED);
      }
      expect(harness.getHistoryLength()).toBe(8);
      // Entry 0 is still the pristine project.
      const oldest = harness.getHistoryEntry(0)!;
      expect(
        oldest.objects[0].frames[0].layers[0].pixels
          .flat()
          .every((p) => p.color === 0),
      ).toBe(true);
    });
  });

  /* ══ THE trackHistory CENSUS ═══════════════════════════════════════════ */
  //
  // Measured 2026-08-16 across all 129 `updateProjectAndSave` call sites:
  //
  //   | literal          | count |
  //   | true             |    74 |
  //   | false            |    47 |
  //   | !_strokeActive   |     4 |  (drawingActions.ts:75,144,219,295)
  //   | trackHistory     |     4 |  (colorAdjustmentActions.ts:229,287,344,392)
  //   | omitted          |     0 |
  //   | TOTAL            |   129 |
  //
  // ⚠️ SPEC CORRECTION: the task brief states "8 `!_strokeActive`". There are
  // only 4. The other 4 are a FIFTH, unlisted semantic — `adjustColor` forwards
  // its own optional `trackHistory` parameter, so those sites are decided by the
  // CALLER at runtime, not statically. The grand total of 129 still reconciles.
  // A MobX port must preserve all FIVE semantics, not three.

  describe("the trackHistory census", () => {
    const historyGrowth = (run: () => void) => {
      const before = harness.getHistoryLength();
      run();
      return harness.getHistoryLength() - before;
    };

    it("ALL 33 toolActions mutations are NON-tracking", () => {
      // Measured: toolActions.ts passes `false` at every one of its 33 call
      // sites. A MobX port that "helpfully" starts tracking them would turn one
      // brush-size change into an undo step.
      const grew = historyGrowth(() => {
        harness.dispatch("setTool", "eraser");
        harness.dispatch("setColor", BLUE);
        harness.dispatch("setColorAndAddToHistory", GREEN);
        harness.dispatch("setBrushSize", 4);
        harness.dispatch("setEraserShape", "square");
        harness.dispatch("setPencilBrushShape", "square");
        harness.dispatch("setPencilBrushMax", 32);
        harness.dispatch("setTraceNudgeAmount", 25);
        harness.dispatch("setNormalBrushShape", "square");
        harness.dispatch("setBitDepth", 16);
        harness.dispatch("setShapeMode", "outline");
        harness.dispatch("setBorderRadius", 2);
        harness.dispatch("setZoom", 20);
        harness.dispatch("setPanOffset", { x: 5, y: 5 });
        harness.dispatch("setMoveAllLayers", true);
        harness.dispatch("setCanvasInfoHidden", true);
        harness.dispatch("setObjectLibraryViewMode", "grid");
        harness.dispatch("setTimelineThumbnailMode", true);
        harness.dispatch("toggleFocusMode");
        harness.dispatch("toggleLightGridMode");
        harness.dispatch("toggleFrameReferencePanelVisible");
        harness.dispatch("setOriginColor", RED);
        harness.dispatch("setSelectionMode", "lasso");
        harness.dispatch("setSelectionBehavior", "editMask");
        harness.dispatch("setAiServiceUrl", "http://example.invalid");
        harness.dispatch("setFrameReferencePanelPosition", {
          topPercent: 1,
          leftPercent: 2,
        });
        harness.dispatch("setFrameReferencePanelMinimized", true);
        harness.dispatch("setReferenceImagePanelPosition", {
          topPercent: 1,
          leftPercent: 2,
        });
        harness.dispatch("setReferenceImagePanelMinimized", true);
        harness.dispatch("setLightingPreviewPanelPosition", {
          topPercent: 1,
          leftPercent: 2,
        });
        harness.dispatch("setLightingPreviewPanelMinimized", true);
        harness.dispatch("setGaussianFillParams", {
          smoothing: 2,
          radius: 3,
          radiusMax: 8,
        });
        harness.dispatch("revertToPreviousTool");
      });
      expect(grew).toBe(0);
    });

    it("ALL 5 paletteActions mutations are NON-tracking", () => {
      const grew = historyGrowth(() => {
        harness.dispatch("addPalette", "New Palette");
        // `.at(-1)` → index arithmetic: `Array.prototype.at` is lib-ES2022 and
        // this workspace compiles with lib ES2020. It used to slip through via
        // an @types/node compat shim that a transitive re-resolve (no-lockfile
        // policy) removed. Same value, type-only change (task 15, in passing).
        const palettes = harness.getProject()!.palettes;
        const created = palettes[palettes.length - 1]!;
        harness.dispatch("addColorToPalette", created.id, BLUE);
        harness.dispatch("removeColorFromPalette", created.id, 0);
        harness.dispatch("renamePalette", created.id, "Renamed");
        harness.dispatch("deletePalette", created.id);
      });
      expect(grew).toBe(0);
    });

    it("referenceActions.setReferenceImage is NON-tracking (referenceActions.ts:41)", () => {
      const grew = historyGrowth(() => {
        harness.dispatch("setReferenceImage", {
          imageBase64: "data:image/png;base64,AAAA",
          selectionBox: { startX: 0, startY: 0, endX: 1, endY: 1 },
        });
      });
      expect(grew).toBe(0);
      expect(harness.getProject()!.referenceImage).toBeDefined();
    });

    it("setFrameTraceActive is NON-tracking", () => {
      expect(
        historyGrowth(() => harness.dispatch("setFrameTraceActive", true, 0)),
      ).toBe(0);
    });

    it("every `select*` action is NON-tracking — selection is not undoable", () => {
      // Measured cross-file pattern: selectObject / selectFrame / selectLayer /
      // selectVariant / selectVariantFrame are each the lone `false` in an
      // otherwise all-`true` file.
      const grew = historyGrowth(() => {
        harness.dispatch("selectObject", "obj-1");
        harness.dispatch("selectFrame", "frame-1");
        harness.dispatch("selectLayer", "layer-1");
      });
      expect(grew).toBe(0);
    });

    it("structural actions ARE tracking — one entry each", () => {
      expect(historyGrowth(() => harness.dispatch("addLayer", "L2"))).toBe(1);
      expect(historyGrowth(() => harness.dispatch("addFrame", "F2"))).toBe(1);
      expect(
        historyGrowth(() => harness.dispatch("renameLayer", "layer-1", "R")),
      ).toBe(1);
      expect(
        historyGrowth(() => harness.dispatch("toggleLayerVisibility", "layer-1")),
      ).toBe(1);
      expect(
        historyGrowth(() => harness.dispatch("addObject", "O2", 4, 4)),
      ).toBe(1);
    });

    it("adjustColor's tracking is decided by the CALLER (the 5th semantic)", () => {
      // colorAdjustmentActions.ts:229/287/344/392 forward the action's own
      // optional `trackHistory` parameter. Not statically true or false.
      harness.dispatch("setPixel", 1, 1, RED);
      harness.dispatch("startColorAdjustment", RED, false);
      const base = harness.getHistoryLength();

      harness.dispatch("adjustColor", BLUE, false);
      expect(harness.getHistoryLength()).toBe(base);

      harness.dispatch("adjustColor", GREEN, true);
      expect(harness.getHistoryLength()).toBe(base + 1);

      harness.dispatch("clearColorAdjustment");
    });

    it("startColorAdjustment itself is NON-tracking", () => {
      harness.dispatch("setPixel", 1, 1, RED);
      expect(
        historyGrowth(() => harness.dispatch("startColorAdjustment", RED, false)),
      ).toBe(0);
      harness.dispatch("clearColorAdjustment");
    });
  });
});
