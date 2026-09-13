/**
 * ApplicationStore ↔ Brush Studio wiring (docs/01-brush-studio, task 11;
 * MASTER D7 / D10 / D11).
 *
 * What is pinned, over the REAL `ApplicationStore` constructor:
 *
 *   (a) a brush cell write bumps `brushes.pixelVersion` and, after the 500 ms
 *       debounce, reaches the BRUSH auto-save transport with the document and
 *       its name — and NEVER the project transport (MASTER §9: "autosave
 *       silently not wired for brushes" / "brush undo stack collides").
 *   (b) `activeHistory` follows `lightingUI.studioMode`; `undo()` in brush
 *       mode reverses the cell write on the brush's own stack and leaves the
 *       project stack's cursor where it was.
 *   (c) `dispose()` disposes BOTH controllers.
 *
 * Fake timers own the debounce. Both transports are spies passed through
 * options — MSW is active in this lane with `onUnhandledRequest: "error"`,
 * so a default transport reaching the network would fail the test loudly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runInAction } from "mobx";

import { ApplicationStore } from "@/stores/ApplicationStore";
import { AutoSaveController } from "@/stores/session/AutoSaveController";
import { CanvasViewsUIStore } from "@/stores/ui/CanvasViewsUIStore";
import { createBrushDocument } from "@/types";
import type { BrushDocument } from "@/types";

const BRUSH_NAME = "wiring-brush";

let app: ApplicationStore;
let projectSave: ReturnType<typeof vi.fn>;
let brushSave: ReturnType<typeof vi.fn>;

/** Install a 4×4 brush as if `loadBrush` had just succeeded. */
function installLoadedBrush(): BrushDocument {
  const doc = createBrushDocument(4, 4);
  runInAction(() => {
    app.brushes.brushName = BRUSH_NAME;
    app.brushes.installDocument(doc);
    app.brushes.loadState = "loaded";
  });
  return doc;
}

function cellAt(x: number, y: number) {
  return app.brushes.document?.frames[0].layers[0].pixels[y][x];
}

beforeEach(() => {
  vi.useFakeTimers();
  projectSave = vi.fn().mockResolvedValue({ success: true });
  brushSave = vi.fn().mockResolvedValue({ success: true });
  app = new ApplicationStore({
    autoSaveEnabled: true,
    autoSave: { save: projectSave },
    brushAutoSave: { save: brushSave },
  });
});

afterEach(() => {
  app.dispose();
  vi.useRealTimers();
});

describe("construction", () => {
  it("exposes the four brush stores and a brush auto-save controller", () => {
    expect(app.brushUI).toBeDefined();
    expect(app.brushes).toBeDefined();
    expect(app.brushStructure).toBeDefined();
    expect(app.brushPixels).toBeDefined();
    expect(app.brushAutoSave).toBeInstanceOf(AutoSaveController);
    // Distinct stacks (D7): the brush history is never the shared editor one.
    expect(app.brushes.history).not.toBe(app.history);
  });

  it("does not call brushes.init() — no brush is loaded on a pixel-studio boot", () => {
    expect(app.brushes.loadState).toBe("idle");
    expect(app.brushes.document).toBeNull();
    expect(app.brushes.brushList).toEqual([]);
  });

  it("brushAutoSave is null when autoSaveEnabled is false, like autoSave", () => {
    const quiet = new ApplicationStore({ autoSaveEnabled: false });
    try {
      expect(quiet.autoSave).toBeNull();
      expect(quiet.brushAutoSave).toBeNull();
    } finally {
      quiet.dispose();
    }
  });

  it("wires brushUI.adoptDocument through BrushStore's onDocumentInstalled", () => {
    expect(app.brushUI.selectedFrameId).toBeNull();
    expect(app.brushUI.selectedLayerId).toBeNull();

    installLoadedBrush();

    expect(app.brushUI.selectedFrameId).toBe("frame-1");
    expect(app.brushUI.selectedLayerId).toBe("layer-1");

    // The callback fires on EVERY adopt, including the null install.
    runInAction(() => app.brushes.installDocument(null));
    expect(app.brushUI.selectedFrameId).toBeNull();
    expect(app.brushUI.selectedLayerId).toBeNull();
  });
});

describe("brushViews — the brush studio's own pane store (docs/11-brush-studio-followups task 04)", () => {
  it("is a second CanvasViewsUIStore, distinct from the pixel studio's canvasViews", () => {
    expect(app.brushViews).toBeInstanceOf(CanvasViewsUIStore);
    expect(app.brushViews).not.toBe(app.canvasViews);
    // Each pane store owns its own Layer-pane camera.
    expect(app.brushViews.layerCamera).not.toBe(app.canvasViews.layerCamera);
    // Fresh defaults: only Full is open, and Full owns the keyboard.
    expect(app.brushViews.openModes).toEqual(["full"]);
    expect(app.brushViews.keyboardOwner).toBe("full");
  });

  it("opening a Layer pane in brushViews leaves canvasViews untouched", () => {
    const pixelModesBefore = app.canvasViews.openModes;

    app.brushViews.openMode("layer");

    expect(app.brushViews.openModes).toEqual(["full", "layer"]);
    expect(app.canvasViews.openModes).toEqual(pixelModesBefore);
    expect(app.canvasViews.openModes).toEqual(["full"]);
    expect(app.canvasViews.isOpen("layer")).toBe(false);
  });
});

describe("(a) a brush cell write triggers the BRUSH auto-save, never the project one", () => {
  it("bumps brushes.pixelVersion and saves the document under its name after 500 ms", async () => {
    installLoadedBrush();
    // Installing is not an edit: nothing is pending.
    vi.advanceTimersByTime(AutoSaveController.DEBOUNCE_MS * 4);
    expect(brushSave).not.toHaveBeenCalled();
    expect(projectSave).not.toHaveBeenCalled();

    const pixelBefore = app.brushes.pixelVersion;
    app.brushPixels.setCells([{ x: 1, y: 2, value: [10, -20, 30, 40] }]);

    expect(app.brushes.pixelVersion).toBe(pixelBefore + 1);
    expect(cellAt(1, 2)).toEqual([10, -20, 30, 40]);
    expect(app.session.saveStatus).toBe("pending");

    // Trailing edge: nothing before the window closes …
    vi.advanceTimersByTime(AutoSaveController.DEBOUNCE_MS - 1);
    expect(brushSave).not.toHaveBeenCalled();
    // … exactly once when it does.
    vi.advanceTimersByTime(1);
    await vi.runOnlyPendingTimersAsync();

    expect(brushSave).toHaveBeenCalledTimes(1);
    expect(brushSave).toHaveBeenCalledWith(app.brushes.document, BRUSH_NAME);
    expect(projectSave).not.toHaveBeenCalled();
  });

  it("a brush write records into the brush history, not the shared editor history", () => {
    installLoadedBrush();
    const projectIndex = app.history.index;

    app.brushPixels.setCells([{ x: 0, y: 0, value: [1, 1, 1, 1] }]);

    expect(app.brushes.history.canUndo).toBe(true);
    expect(app.history.index).toBe(projectIndex);
  });
});

describe("(b) activeHistory routes undo/redo by studio mode", () => {
  it("is the brush history in brush mode and the editor history otherwise", () => {
    expect(app.lightingUI.studioMode).toBe("pixel");
    expect(app.activeHistory).toBe(app.history);

    runInAction(() => app.lightingUI.setStudioMode("brush"));
    expect(app.activeHistory).toBe(app.brushes.history);

    runInAction(() => app.lightingUI.setStudioMode("lighting"));
    expect(app.activeHistory).toBe(app.history);

    runInAction(() => app.lightingUI.setStudioMode("pixel"));
    expect(app.activeHistory).toBe(app.history);
  });

  it("undo() in brush mode reverses the cell write and leaves the project stack untouched", () => {
    installLoadedBrush();
    const projectIndex = app.history.index;
    const projectCanUndo = app.history.canUndo;

    app.brushPixels.setCells([{ x: 3, y: 3, value: [5, 6, 7, 8] }]);
    expect(cellAt(3, 3)).toEqual([5, 6, 7, 8]);

    runInAction(() => app.lightingUI.setStudioMode("brush"));
    app.undo();

    expect(cellAt(3, 3)).toBe(0);
    expect(app.brushes.history.canUndo).toBe(false);
    expect(app.brushes.history.canRedo).toBe(true);
    expect(app.history.index).toBe(projectIndex);
    expect(app.history.canUndo).toBe(projectCanUndo);

    app.redo();
    expect(cellAt(3, 3)).toEqual([5, 6, 7, 8]);
    expect(app.history.index).toBe(projectIndex);
  });

  it("undo() in pixel mode does NOT touch the brush stack", () => {
    installLoadedBrush();
    app.brushPixels.setCells([{ x: 0, y: 1, value: [2, 2, 2, 2] }]);
    expect(app.lightingUI.studioMode).toBe("pixel");

    // Nothing on the (empty) project stack to undo; the brush entry survives.
    app.undo();

    expect(cellAt(0, 1)).toEqual([2, 2, 2, 2]);
    expect(app.brushes.history.canUndo).toBe(true);
  });

  it("a brush undo schedules a brush save of the RESTORED document (accepted, HANDOFF W3/07(g))", async () => {
    installLoadedBrush();
    app.brushPixels.setCells([{ x: 0, y: 0, value: [9, 9, 9, 9] }]);
    vi.advanceTimersByTime(AutoSaveController.DEBOUNCE_MS);
    await vi.runOnlyPendingTimersAsync();
    expect(brushSave).toHaveBeenCalledTimes(1);

    runInAction(() => app.lightingUI.setStudioMode("brush"));
    app.undo();
    expect(cellAt(0, 0)).toBe(0);

    vi.advanceTimersByTime(AutoSaveController.DEBOUNCE_MS);
    await vi.runOnlyPendingTimersAsync();

    expect(brushSave).toHaveBeenCalledTimes(2);
    expect(brushSave).toHaveBeenLastCalledWith(
      app.brushes.document,
      BRUSH_NAME,
    );
    expect(projectSave).not.toHaveBeenCalled();
  });
});

describe("(c) dispose", () => {
  it("disposes both auto-save controllers", () => {
    const { autoSave, brushAutoSave } = app;
    if (!autoSave || !brushAutoSave) {
      throw new Error("both controllers must exist with autoSaveEnabled");
    }
    const projectDispose = vi.spyOn(autoSave, "dispose");
    const brushDispose = vi.spyOn(brushAutoSave, "dispose");

    app.dispose();

    expect(projectDispose).toHaveBeenCalledTimes(1);
    expect(brushDispose).toHaveBeenCalledTimes(1);

    // The afterEach disposes again; a second dispose must be harmless.
  });
});
