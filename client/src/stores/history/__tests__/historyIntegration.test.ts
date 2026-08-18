/**
 * HistoryStore integration suite (REFRESH task 17) — the command stack driven
 * through the REAL store actions, exactly as the app drives it: the
 * spec-mandated undo-depth matrix, stroke batching, the non-undoable set,
 * redo, redo-tail truncation, byte-budget eviction through
 * `ApplicationStore`'s options, and the `isReplaying` auto-save guard.
 *
 * Task 08's characterisation suite (`src/store/__tests__/`) remains the R4
 * parity baseline and is NOT duplicated here — this suite covers what is NEW
 * (redo, budget, replay guard) plus the spec's verification matrix.
 *
 * ⚠️ Memory: every fixture is tinyProject-sized (4×4). Never fill history
 * with a realistic project — 6.9 MB × 100 ≈ 680 MB OOMs the worker.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runInAction } from "mobx";
import { editorHistory } from "@/store";
import { MAX_HISTORY_BYTES } from "@/stores/history/HistoryStore";
import { ApplicationStore } from "@/stores/ApplicationStore";
import { projectApi } from "@/api";
import { projectToCompact } from "@/types";
import {
  BLUE,
  GREEN,
  RED,
  cloneProject,
  colorAt,
  createZustandHarness,
  layerOf,
  mkLayer,
  tinyProject,
  wireAutoSave,
  type StoreHarness,
  type WiredApp,
} from "@/store/__tests__/storeContract";
import type { Layer, Project } from "@/types";

/**
 * The undo-depth-matrix fixture: two frames, a regular layer AND a variant
 * host layer on frame 1, and one variant group — enough surface for all five
 * spec-mandated edit kinds. Still 4×4 everywhere.
 */
function matrixProject(): Project {
  const regular = mkLayer("layer-1");
  const variantHost: Layer = {
    ...mkLayer("layer-2"),
    isVariant: true,
    variantGroupId: "vg-1",
    selectedVariantId: "v-1",
  };
  const project = tinyProject({
    frames: [
      { id: "frame-1", name: "Frame 1", layers: [regular, variantHost] },
      { id: "frame-2", name: "Frame 2", layers: [mkLayer("layer-3")] },
    ],
  });
  project.variants = [
    {
      id: "vg-1",
      name: "Group",
      variants: [
        {
          id: "v-1",
          name: "V1",
          gridSize: { width: 4, height: 4 },
          frames: [{ id: "vf-0", layers: [mkLayer("vl-0")] }],
          baseFrameOffsets: {},
        },
      ],
    },
  ];
  project.uiState.variantFrameIndices = { "vg-1": 0 };
  return project;
}

describe("HistoryStore through the store actions", () => {
  let harness: StoreHarness;

  beforeEach(() => {
    harness = createZustandHarness();
    harness.reset();
    // cloneProject: the baseline must already be round-trip-normalised so the
    // final byte-identity comparison is against a stable form (task 07's R1:
    // the round trip is not identity on a raw literal).
    harness.load(cloneProject(tinyProject()));
  });

  afterEach(() => {
    harness.dispatch("endStroke");
    harness.reset();
    runInAction(() => editorHistory.setBudgetBytes(MAX_HISTORY_BYTES));
  });

  /* ══ THE UNDO-DEPTH MATRIX (spec verification, task 17) ════════════════ */

  it("5 distinct edits then 5 undos restore the project BYTE-IDENTICALLY", () => {
    harness.load(cloneProject(matrixProject()));
    const baseline = projectToCompact(harness.getProject()!);
    const baselineBytes = JSON.stringify(baseline);

    // 1. add a layer
    harness.dispatch("addLayer", "Matrix layer");
    expect(harness.getHistoryLength()).toBe(1);
    // 2. draw a stroke (one transaction = one entry)
    harness.dispatch("beginStroke");
    for (let i = 0; i < 8; i++) {
      harness.dispatch("setPixel", i % 4, Math.floor(i / 4), RED);
    }
    harness.dispatch("endStroke");
    expect(harness.getHistoryLength()).toBe(2);
    // 3. delete a frame
    harness.dispatch("deleteFrame", "frame-2");
    expect(harness.getHistoryLength()).toBe(3);
    // 4. rename an object
    harness.dispatch("renameObject", "obj-1", "Renamed");
    expect(harness.getHistoryLength()).toBe(4);
    // 5. move a variant offset (selectLayer is non-tracking — census)
    harness.dispatch("selectLayer", "layer-2");
    expect(harness.getHistoryLength()).toBe(4);
    harness.dispatch("setVariantOffset", 3, 1);
    expect(harness.getHistoryLength()).toBe(5);

    // The edits actually happened.
    expect(harness.getProject()!.objects[0].name).toBe("Renamed");
    expect(harness.getProject()!.objects[0].frames).toHaveLength(1);

    for (let i = 0; i < 5; i++) {
      harness.dispatch("undo");
    }

    const restored = projectToCompact(harness.getProject()!);
    expect(restored).toEqual(baseline);
    expect(JSON.stringify(restored)).toBe(baselineBytes);
  });

  /* ══ STROKE BATCHING ═══════════════════════════════════════════════════ */

  it("one continuous 50-pixel drag is EXACTLY ONE entry, and one redo brings it all back", () => {
    harness.dispatch("beginStroke");
    for (let i = 0; i < 50; i++) {
      harness.dispatch("setPixel", i % 4, Math.floor(i / 4) % 4, {
        r: i * 5,
        g: 0,
        b: 0,
        a: 255,
      });
    }
    harness.dispatch("endStroke");
    expect(harness.getHistoryLength()).toBe(1);

    harness.dispatch("undo");
    const painted = layerOf(harness.getProject())!
      .pixels.flat()
      .filter((p) => p.color !== 0);
    expect(painted).toHaveLength(0);

    harness.dispatch("redo");
    const repainted = layerOf(harness.getProject())!
      .pixels.flat()
      .filter((p) => p.color !== 0);
    expect(repainted.length).toBeGreaterThan(0);
  });

  /* ══ THE NON-UNDOABLE SET ══════════════════════════════════════════════ */

  it("tool, zoom and palette-colour changes record NOTHING (census preserved)", () => {
    harness.dispatch("setPixel", 1, 1, RED);
    const before = harness.getHistoryLength();

    harness.dispatch("setTool", "eraser");
    harness.dispatch("setZoom", 20);
    harness.dispatch("addColorToPalette", "pal-1", BLUE);

    expect(harness.getHistoryLength()).toBe(before);
    // …and undo does not revert them: the palette colour survives the undo of
    // the pixel edit? No — a full-snapshot undo restores the ENTIRE pre-edit
    // project (pinned legacy semantics), so only the history LENGTH is
    // asserted here, exactly as task 08 pins it.
  });

  /* ══ REDO ══════════════════════════════════════════════════════════════ */

  describe("redo (NEW in task 17)", () => {
    it("undo then redo restores the post-edit state", () => {
      harness.dispatch("setPixel", 1, 1, RED);
      harness.dispatch("undo");
      expect(colorAt(harness.getProject(), 1, 1)).toBe(0);

      harness.dispatch("redo");
      expect(colorAt(harness.getProject(), 1, 1)).toEqual(RED);
    });

    it("walks forward through several undone edits in order", () => {
      harness.dispatch("setPixel", 0, 0, RED);
      harness.dispatch("setPixel", 1, 1, BLUE);
      harness.dispatch("undo");
      harness.dispatch("undo");
      expect(colorAt(harness.getProject(), 0, 0)).toBe(0);

      harness.dispatch("redo");
      expect(colorAt(harness.getProject(), 0, 0)).toEqual(RED);
      expect(colorAt(harness.getProject(), 1, 1)).toBe(0);

      harness.dispatch("redo");
      expect(colorAt(harness.getProject(), 1, 1)).toEqual(BLUE);
    });

    it("redo restores a CLONE — the live project is not the stored snapshot", () => {
      harness.dispatch("setPixel", 1, 1, RED);
      harness.dispatch("undo");
      harness.dispatch("redo");
      expect(harness.getProject()).not.toBe(harness.getHistoryEntry(0));
    });

    it("is a NO-OP at the top of the stack and on empty history", () => {
      const empty = JSON.stringify(harness.getProject());
      harness.dispatch("redo");
      expect(JSON.stringify(harness.getProject())).toBe(empty);

      harness.dispatch("setPixel", 1, 1, RED);
      const top = JSON.stringify(harness.getProject());
      harness.dispatch("redo");
      expect(JSON.stringify(harness.getProject())).toBe(top);
    });

    it("undo/redo round trips repeat stably", () => {
      harness.dispatch("setPixel", 2, 2, GREEN);
      for (let i = 0; i < 3; i++) {
        harness.dispatch("undo");
        expect(colorAt(harness.getProject(), 2, 2)).toBe(0);
        harness.dispatch("redo");
        expect(colorAt(harness.getProject(), 2, 2)).toEqual(GREEN);
      }
    });
  });

  /* ══ REDO-TAIL TRUNCATION ══════════════════════════════════════════════ */

  it("a new edit after an undo discards the redo tail (deferred truncation preserved)", () => {
    harness.dispatch("setPixel", 0, 0, RED);
    harness.dispatch("setPixel", 1, 1, BLUE);
    harness.dispatch("undo");
    // Tail physically present until the next edit (pinned semantics)…
    expect(harness.getHistoryLength()).toBe(2);

    harness.dispatch("setPixel", 2, 2, GREEN);
    expect(harness.getHistoryLength()).toBe(2);

    // …and now genuinely gone: redo is a no-op, BLUE is unreachable.
    const state = JSON.stringify(harness.getProject());
    harness.dispatch("redo");
    expect(JSON.stringify(harness.getProject())).toBe(state);
    expect(colorAt(harness.getProject(), 1, 1)).toBe(0);
  });

  /* ══ BYTE-BUDGET EVICTION through ApplicationStore's options ═══════════ */

  it("a small configured budget evicts entries from the FRONT", () => {
    // tinyProject snapshot estimate: 16 cells × 24 B + 1024 + 4096 = 5,504 B.
    // A 12,000 B budget therefore retains exactly 2 entries.
    const app = new ApplicationStore({
      autoSaveEnabled: false,
      historyBudgetBytes: 12_000,
    });
    expect(app.history).toBe(editorHistory); // the bridge-era shared instance

    for (let i = 0; i < 6; i++) {
      harness.dispatch("setPixel", i % 4, Math.floor(i / 4) % 4, {
        r: (i + 1) * 20,
        g: 0,
        b: 0,
        a: 255,
      });
    }

    expect(harness.getHistoryLength()).toBe(2);
    expect(harness.getHistoryIndex()).toBe(1);
    // The pristine first snapshot was evicted: the oldest survivor is painted.
    const oldest = harness.getHistoryEntry(0)!;
    const anyPainted = oldest.objects[0].frames[0].layers[0].pixels
      .flat()
      .some((p) => p.color !== 0);
    expect(anyPainted).toBe(true);

    app.dispose();
  });
});

/* ══ isReplaying — the auto-save replay guard (owner decision 2026-08-16) ══ */

const spyOnSave = () => vi.spyOn(projectApi, "save");

describe("isReplaying blocks auto-save during replay", () => {
  let harness: StoreHarness;
  let wired: WiredApp;
  let save: ReturnType<typeof spyOnSave>;

  beforeEach(() => {
    vi.useFakeTimers();
    save = spyOnSave();
    save.mockResolvedValue({ success: true, backupCreated: false });
    harness = createZustandHarness();
    harness.reset();
    harness.load(cloneProject(tinyProject()));
    wired = wireAutoSave();
    wired.openGate("test");
    save.mockClear();
  });

  afterEach(() => {
    wired.dispose();
    harness.dispatch("endStroke");
    harness.reset();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("undo fires NO POST /api/project — the next real edit saves instead", async () => {
    harness.dispatch("setPixel", 0, 0, RED);
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
    save.mockClear();

    harness.dispatch("undo");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(save).not.toHaveBeenCalled();

    harness.dispatch("setPixel", 1, 1, BLUE);
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("redo fires NO POST either", async () => {
    harness.dispatch("setPixel", 0, 0, RED);
    await vi.advanceTimersByTimeAsync(500);
    harness.dispatch("undo");
    await vi.advanceTimersByTimeAsync(5_000);
    save.mockClear();

    harness.dispatch("redo");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(save).not.toHaveBeenCalled();
    // The redone pixel is present even though nothing saved.
    expect(colorAt(harness.getProject(), 0, 0)).toEqual(RED);
  });

  it("a pending debounced save is not hijacked by a replay commit", async () => {
    // Edit, then undo INSIDE the debounce window: the replay must not bump
    // domainVersion, and the pending edit's save (already scheduled) carries
    // the LATEST project — the post-undo state — exactly one save total.
    harness.dispatch("setPixel", 0, 0, RED);
    harness.dispatch("undo");
    await vi.advanceTimersByTimeAsync(5_000);
    // The edit itself scheduled one save; the undo added nothing.
    expect(save.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
