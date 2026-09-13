/**
 * `brushPanes` — the per-pane helpers of the brush split view (Brush
 * follow-ups task 09, MASTER D5).
 *
 * Pins the two pure pieces: the pane controls (open / swap / close, mirroring
 * the pixel canvas's) and the scene each pane composites (Full = the frame
 * as it is; Layer = the selected layer alone, forced visible, others HIDDEN).
 * The compositor hook is exercised through `BrushStudioContainer.dom.test.tsx`
 * (jsdom has no 2d context, so its paint early-returns there).
 */
import { describe, expect, it, vi } from "vitest";
import { brushPaneControls, brushPaneScene } from "../brushPanes";
import type { BrushPaneLayer, BrushPaneViews } from "../brushPanes";
import type { BrushCell } from "../../../types";

function views(bothOpen: boolean): BrushPaneViews {
  return {
    bothOpen,
    openMode: vi.fn(),
    closeMode: vi.fn(),
    swap: vi.fn(),
  };
}

describe("brushPaneControls", () => {
  it("⭐ one pane open: 'Open <other> view', no close; reset passes through", () => {
    const v = views(false);
    const onResetView = vi.fn();
    const full = brushPaneControls(v, "full", onResetView);
    expect(full.onResetView).toBe(onResetView);
    expect(full.onClose).toBeUndefined();
    expect(full.modeButton).toMatchObject({
      kind: "open",
      label: "Open Layer view",
    });
    full.modeButton!.onClick();
    expect(v.openMode).toHaveBeenCalledWith("layer");

    const layer = brushPaneControls(v, "layer", onResetView);
    expect(layer.modeButton).toMatchObject({
      kind: "open",
      label: "Open Full view",
    });
    layer.modeButton!.onClick();
    expect(v.openMode).toHaveBeenLastCalledWith("full");
  });

  it("⭐ both open: swap above close, and close closes THIS pane", () => {
    const v = views(true);
    const full = brushPaneControls(v, "full", () => {});
    expect(full.modeButton).toMatchObject({
      kind: "swap",
      label: "Swap pane sides",
    });
    full.modeButton!.onClick();
    expect(v.swap).toHaveBeenCalledTimes(1);
    expect(full.onClose?.label).toBe("Close Full view");
    full.onClose!.onClick();
    expect(v.closeMode).toHaveBeenLastCalledWith("full");

    const layer = brushPaneControls(v, "layer", () => {});
    expect(layer.onClose?.label).toBe("Close Layer view");
    layer.onClose!.onClick();
    expect(v.closeMode).toHaveBeenLastCalledWith("layer");
    expect(v.openMode).not.toHaveBeenCalled();
  });
});

const PIXELS: BrushCell[][] = [[0]];
function layer(id: string, visible: boolean): BrushPaneLayer {
  return { id, visible, channelType: "rgb", pixels: PIXELS };
}
const DOC = {
  frames: [
    {
      id: "f1",
      layers: [layer("a", true), layer("b", false), layer("c", true)],
    },
    { id: "f2", layers: [layer("d", true)] },
  ],
};

describe("brushPaneScene", () => {
  it("⭐ Full (layerId null): the frame's layers untouched, hidden ones included for the compositor to skip", () => {
    const scene = brushPaneScene(DOC, "f1", null);
    expect(scene).toBe(DOC.frames[0].layers);
  });

  it("⭐ Layer: the selected layer ALONE — others hidden, not dimmed — visible regardless of its eye flag", () => {
    const shown = brushPaneScene(DOC, "f1", "c");
    expect(shown).toHaveLength(1);
    // A visible layer is passed through as the same object.
    expect(shown![0]).toBe(DOC.frames[0].layers[2]);

    const hidden = brushPaneScene(DOC, "f1", "b");
    expect(hidden).toHaveLength(1);
    expect(hidden![0].visible).toBe(true);
    // A shallow copy: the grid is the SAME reference, never cloned.
    expect(hidden![0].pixels).toBe(PIXELS);
    expect(hidden![0]).not.toBe(DOC.frames[0].layers[1]);
    expect(DOC.frames[0].layers[1].visible).toBe(false);
  });

  it("Layer with an id not in this frame draws nothing; no document / no frame is null", () => {
    expect(brushPaneScene(DOC, "f2", "a")).toEqual([]);
    expect(brushPaneScene(DOC, "nope", null)).toBeNull();
    expect(brushPaneScene(DOC, null, null)).toBeNull();
    expect(brushPaneScene(null, "f1", null)).toBeNull();
  });
});
