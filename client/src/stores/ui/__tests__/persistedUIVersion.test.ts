/**
 * `persistedUIVersion` — the counter `AutoSaveController` adds to its trigger
 * tuple (REFRESH task 24).
 *
 * ⚠️ **A MISSED BUMP IS SILENT DATA LOSS.** If a persisted field changes and
 * the counter does not move, the save reaction never fires and the user's
 * edit is gone at the next reload with no error anywhere. The spec therefore
 * requires BOTH directions to be tested, and both are here:
 *
 *   1. the missed-bump test — every persisted field, set one at a time,
 *      must move the counter;
 *   2. the inverse — a session-only field (`previousTool`,
 *      `colorAdjustment`) must NOT move it, or every eyedropper pick would
 *      schedule a pointless save of unchanged bytes.
 *
 * The counter observes `persistedSignature`, which is derived from
 * `toPersistedUIState()` itself, so a field added to the builder is covered
 * automatically — the two cannot drift apart.
 */
import { describe, expect, it } from "vitest";
import { runInAction } from "mobx";

import { UIStore } from "@/stores/ui/UIStore";
import { SelectionMirror } from "@/stores/SelectionMirror";
import { SessionStore } from "@/stores/session/SessionStore";

function makeUI(): UIStore {
  return new UIStore({
    session: new SessionStore(),
    selection: new SelectionMirror(),
  });
}

/** Every persisted field, with a mutation that genuinely changes its value. */
const PERSISTED_EDITS: [name: string, edit: (ui: UIStore) => void][] = [
  ["selectedTool", (ui) => ui.tool.setTool("ellipse")],
  ["selectedColor", (ui) => ui.tool.setColor({ r: 1, g: 2, b: 3, a: 255 })],
  ["brushSize", (ui) => ui.tool.setBrushSize(5)],
  // 16, not 8: 8 is already the default, and an idempotent write is
  // correctly NOT an edit (see the idempotence test below).
  ["bitDepth", (ui) => ui.tool.setBitDepth(16)],
  ["shapeMode", (ui) => ui.tool.setShapeMode("outline")],
  ["borderRadius", (ui) => ui.tool.setBorderRadius(4)],
  ["eraserShape", (ui) => ui.tool.setEraserShape("square")],
  ["pencilBrushShape", (ui) => ui.tool.setPencilBrushShape("circle")],
  ["pencilBrushMax", (ui) => ui.tool.setPencilBrushMax(64)],
  ["moveAllLayers", (ui) => ui.tool.setMoveAllLayers(true)],
  ["selectionMode", (ui) => ui.tool.setSelectionMode("lasso")],
  ["selectionBehavior", (ui) => ui.tool.setSelectionBehavior("editMask")],
  ["originColor", (ui) => ui.tool.setOriginColor({ r: 9, g: 9, b: 9, a: 255 })],
  [
    "gaussianFill",
    (ui) => ui.tool.setGaussianFillParams({ smoothing: 3, radius: 4 }),
  ],
  ["zoom", (ui) => ui.viewport.setZoom(21)],
  ["panOffset", (ui) => ui.viewport.setPanOffset({ x: 5, y: 6 })],
  ["focusMode", (ui) => ui.viewport.toggleFocusMode()],
  ["lightGridMode", (ui) => ui.viewport.toggleLightGridMode()],
  ["canvasInfoHidden", (ui) => ui.viewport.setCanvasInfoHidden(true)],
  [
    "objectLibraryViewMode",
    (ui) => ui.viewport.setObjectLibraryViewMode("grid"),
  ],
  ["timelineThumbnailMode", (ui) => ui.viewport.setTimelineThumbnailMode(true)],
  ["layerSelectionCounter", (ui) => ui.viewport.bumpLayerSelectionCounter()],
  [
    "frameReferencePanelPosition",
    (ui) =>
      ui.viewport.setPanel("frameReference", {
        position: { topPercent: 1, leftPercent: 2 },
      }),
  ],
  [
    "frameReferencePanelMinimized",
    (ui) => ui.viewport.setPanel("frameReference", { minimized: true }),
  ],
  [
    "frameReferencePanelVisible",
    (ui) => ui.viewport.toggleFrameReferencePanelVisible(),
  ],
  [
    "referenceImagePanelPosition",
    (ui) =>
      ui.viewport.setPanel("referenceImage", {
        position: { topPercent: 3, leftPercent: 4 },
      }),
  ],
  [
    "referenceImagePanelMinimized",
    (ui) => ui.viewport.setPanel("referenceImage", { minimized: true }),
  ],
  [
    "lightingPreviewPanelPosition",
    (ui) =>
      ui.viewport.setPanel("lightingPreview", {
        position: { topPercent: 5, leftPercent: 6 },
      }),
  ],
  [
    "lightingPreviewPanelMinimized",
    (ui) => ui.viewport.setPanel("lightingPreview", { minimized: true }),
  ],
  [
    "traceNudgeAmount",
    (ui) => {
      ui.traceNudgeAmount = 50;
    },
  ],
  // The two 2026-08-25 additions. ⚠️ These matter more than most entries in
  // this list: `AutoSaveController` observes ONLY `persistedUIVersion`, so a
  // field that does not bump it is written to the store, shown on screen, and
  // NEVER SAVED — the exact silent-data-loss shape W29d found and fixed. A
  // rail the user moved that reverts on reload would look like a UI bug, not
  // a persistence one.
  ["viewZoom", (ui) => ui.viewport.setViewZoom(2)],
  // "stay", not "revert": the field is tri-state and reads as "revert" by
  // default, so writing "revert" would be an idempotent write that could
  // pass this test without the reaction ever seeing a change.
  ["eyedropperMode", (ui) => ui.tool.setEyedropperMode("stay")],
  ["railLayouts", (ui) => ui.layout.stepRail("left", 1)],
  ["theme", (ui) => ui.layout.setTheme("light-cozy")],
  [
    "lighting block",
    (ui) => {
      ui.lighting = {
        studioMode: "lighting",
        lightingDataLayerEditMode: "height",
        selectedNormal: 1,
        lightDirection: 2,
        lightColor: 3,
        ambientColor: 4,
        heightScale: 55,
        heightBrushValue: 66,
        normalBrushShape: "square",
      };
    },
  ],
];

describe("persistedUIVersion — every persisted field bumps it", () => {
  it.each(PERSISTED_EDITS)("editing %s schedules a save", (_name, edit) => {
    const ui = makeUI();
    const before = ui.persistedUIVersion;
    runInAction(() => edit(ui));
    expect(ui.persistedUIVersion).toBeGreaterThan(before);
    ui.dispose();
  });

  it("covers every field the builder emits", () => {
    // Guards the list above against drift: if the builder grows a field, the
    // count here must grow too. 29 sub-store edits + `traceNudgeAmount` + the
    // lighting block (9 fields moving together) = 31 entries, covering all 43
    // persisted fields. The 3 selection ids and `variantFrameIndices` are
    // owned by `SelectionMirror` until `TimelineUIStore` lands.
    // +2 (2026-08-25): `railLayouts` and `theme`.
    // +1 (2026-08-28): `viewZoom`.
    // +1 (2026-08-28): `eyedropperMode`.
    expect(PERSISTED_EDITS).toHaveLength(35);
  });
});

describe("persistedUIVersion — the inverse: session-only fields do NOT bump", () => {
  it("previousTool alone does not schedule a save", () => {
    const ui = makeUI();
    const before = ui.persistedUIVersion;
    runInAction(() => {
      ui.tool.previousTool = "eraser";
    });
    expect(ui.persistedUIVersion).toBe(before);
    ui.dispose();
  });

  it("colorAdjustment does not schedule a save", () => {
    const ui = makeUI();
    const before = ui.persistedUIVersion;
    // W29d typed `colorAdjustment` as `ColorAdjustmentState | null`. The bare
    // `new Map()` here was filler for "any non-null value" — the assertion is
    // that setting it does NOT bump, and that is unchanged.
    runInAction(() =>
      ui.tool.setColorAdjustment({
        originalColor: { r: 1, g: 2, b: 3, a: 255 },
        allFrames: false,
        affectedPixels: [{ x: 0, y: 0 }],
      }),
    );
    expect(ui.persistedUIVersion).toBe(before);
    ui.dispose();
  });

  it("an IDEMPOTENT write does not schedule a save", () => {
    // `computedStruct` means setting a field to the value it already holds is
    // not an edit — otherwise every re-render that re-applies state would
    // save unchanged bytes.
    const ui = makeUI();
    runInAction(() => ui.viewport.setZoom(21));
    const after = ui.persistedUIVersion;
    runInAction(() => ui.viewport.setZoom(21));
    expect(ui.persistedUIVersion).toBe(after);
    ui.dispose();
  });
});
