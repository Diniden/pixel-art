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
 *   (d) multi-brush projects (docs/14-multi-brush-projects task 11, MASTER
 *       D4 / D5 / §8 mistake 3): the structure store's selection sink is an
 *       ADAPTER that passes `brushes.document` to `brushUI.selectBrush`, so a
 *       brush added or deleted by the store re-seats the frame and layer ids
 *       inside the newly selected brush — and a pixel write then lands in
 *       THAT brush.
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

/** Install a one-brush 4×4 project as if `loadProject` had just succeeded. */
function installLoadedBrush(): BrushDocument {
  const doc = createBrushDocument(4, 4);
  runInAction(() => {
    app.brushes.projectName = BRUSH_NAME;
    app.brushes.installDocument(doc);
    app.brushes.loadState = "loaded";
  });
  return doc;
}

/** Frame 0 / layer 0 of brush `brushIndex` — every brush's ids repeat. */
function cellIn(brushIndex: number, x: number, y: number) {
  return app.brushes.document?.brushes[brushIndex].frames[0].layers[0].pixels[
    y
  ][x];
}

function cellAt(x: number, y: number) {
  return cellIn(0, x, y);
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
    expect(app.brushes.projectList).toEqual([]);
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
    expect(app.brushUI.selectedBrushId).toBeNull();
    expect(app.brushUI.selectedFrameId).toBeNull();
    expect(app.brushUI.selectedLayerId).toBeNull();

    installLoadedBrush();

    expect(app.brushUI.selectedBrushId).toBe("brush-1");
    expect(app.brushUI.selectedFrameId).toBe("frame-1");
    expect(app.brushUI.selectedLayerId).toBe("layer-1");

    // The callback fires on EVERY adopt, including the null install.
    runInAction(() => app.brushes.installDocument(null));
    expect(app.brushUI.selectedBrushId).toBeNull();
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

describe("(d) the structure store's selection sink passes the POST-commit document", () => {
  it("addBrush selects the new brush AND seats the frame/layer inside it", () => {
    installLoadedBrush();
    const before = app.brushes.document!;

    const id = app.brushStructure.addBrush("Second");

    const doc = app.brushes.document!;
    expect(doc).not.toBe(before);
    expect(doc.brushes).toHaveLength(2);
    expect(doc.brushes[1].id).toBe(id);
    expect(doc.brushes[1].name).toBe("Second");
    expect(id).not.toBe("brush-1");

    expect(app.brushUI.selectedBrushId).toBe(id);
    // Every brush reuses "frame-1" / "layer-1", so the ids alone prove
    // nothing — the RESOLVED objects must belong to the new brush. That is
    // only possible if the adapter handed `selectBrush` the document.
    expect(app.brushUI.selectedFrameId).toBe("frame-1");
    expect(app.brushUI.selectedLayerId).toBe("layer-1");
    expect(app.brushUI.selectedBrushIn(doc)).toBe(doc.brushes[1]);
    expect(app.brushUI.selectedFrameIn(doc)).toBe(doc.brushes[1].frames[0]);
    expect(app.brushUI.selectedLayerIn(doc)).toBe(
      doc.brushes[1].frames[0].layers[0],
    );
    expect(app.brushUI.selectedLayerIn(doc)).not.toBe(
      doc.brushes[0].frames[0].layers[0],
    );
  });

  it("deleteBrush of the selected brush re-seats to the survivor", () => {
    installLoadedBrush();
    const second = app.brushStructure.addBrush("Second");
    expect(app.brushUI.selectedBrushId).toBe(second);

    app.brushStructure.deleteBrush(second);

    const doc = app.brushes.document!;
    expect(doc.brushes).toHaveLength(1);
    expect(doc.brushes[0].id).toBe("brush-1");
    expect(app.brushUI.selectedBrushId).toBe("brush-1");
    expect(app.brushUI.selectedFrameId).toBe("frame-1");
    expect(app.brushUI.selectedLayerId).toBe("layer-1");
    expect(app.brushUI.selectedBrushIn(doc)).toBe(doc.brushes[0]);
    expect(app.brushUI.selectedLayerIn(doc)).toBe(
      doc.brushes[0].frames[0].layers[0],
    );
  });

  it("a pixel write through brushPixels.setCells lands in the SELECTED brush", () => {
    installLoadedBrush();
    const second = app.brushStructure.addBrush("Second", 4, 4);
    expect(app.brushUI.selectedBrushId).toBe(second);

    app.brushPixels.setCells([{ x: 1, y: 2, value: [10, -20, 30, 40] }]);

    expect(cellIn(1, 1, 2)).toEqual([10, -20, 30, 40]);
    expect(cellIn(0, 1, 2)).toBe(0);

    // Switching back through the UI store (with the document) moves the
    // write target with it.
    runInAction(() => app.brushUI.selectBrush("brush-1", app.brushes.document));
    app.brushPixels.setCells([{ x: 0, y: 0, value: [1, 2, 3, 4] }]);

    expect(cellIn(0, 0, 0)).toEqual([1, 2, 3, 4]);
    expect(cellIn(1, 0, 0)).toBe(0);
    expect(cellIn(1, 1, 2)).toEqual([10, -20, 30, 40]);
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
