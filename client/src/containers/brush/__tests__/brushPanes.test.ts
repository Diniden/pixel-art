/**
 * `brushPanes` — the per-pane helpers of the brush split view (Brush
 * follow-ups task 09, MASTER D5).
 *
 * Pins the two pure pieces: the pane controls (open / swap / close, mirroring
 * the pixel canvas's) and the scene each pane composites (Full = the frame
 * as it is; Layer = the selected layer alone, forced visible, others HIDDEN).
 * The compositor hook is exercised through `BrushStudioContainer.dom.test.tsx`
 * (jsdom has no 2d context, so its paint early-returns there); what IS pinned
 * here is its paint-time resolution, `brushPaneScene(brushIn(doc,
 * selectedBrushId), frameId, layerId)` (multi-brush projects, plan 14 task
 * 12): switching the brush id composites the OTHER brush's layers, and the
 * frame lookup stays strict within the selected brush.
 */
import { describe, expect, it, vi } from "vitest";
import { brushPaneControls, brushPaneScene } from "../brushPanes";
import type { BrushPaneLayer, BrushPaneViews } from "../brushPanes";
import {
  BRUSH_DOCUMENT_VERSION,
  brushIn,
  createBrush,
  createBrushFrame,
  createBrushLayer,
} from "../../../types";
import type { BrushCell, BrushDocument } from "../../../types";

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
const BRUSH = {
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
    const scene = brushPaneScene(BRUSH, "f1", null);
    expect(scene).toBe(BRUSH.frames[0].layers);
  });

  it("⭐ Layer: the selected layer ALONE — others hidden, not dimmed — visible regardless of its eye flag", () => {
    const shown = brushPaneScene(BRUSH, "f1", "c");
    expect(shown).toHaveLength(1);
    // A visible layer is passed through as the same object.
    expect(shown![0]).toBe(BRUSH.frames[0].layers[2]);

    const hidden = brushPaneScene(BRUSH, "f1", "b");
    expect(hidden).toHaveLength(1);
    expect(hidden![0].visible).toBe(true);
    // A shallow copy: the grid is the SAME reference, never cloned.
    expect(hidden![0].pixels).toBe(PIXELS);
    expect(hidden![0]).not.toBe(BRUSH.frames[0].layers[1]);
    expect(BRUSH.frames[0].layers[1].visible).toBe(false);
  });

  it("Layer with an id not in this frame draws nothing; no brush / no frame is null", () => {
    expect(brushPaneScene(BRUSH, "f2", "a")).toEqual([]);
    expect(brushPaneScene(BRUSH, "nope", null)).toBeNull();
    expect(brushPaneScene(BRUSH, null, null)).toBeNull();
    expect(brushPaneScene(null, "f1", null)).toBeNull();
  });
});

/* ── the paint-time resolution: `brushIn` then `brushPaneScene` (task 12) ── */

/** Two brushes: "Round" 8×8 with TWO frames, "Dot" 4×4 with one. */
function twoBrushDocument() {
  const round = createBrush("brush-1", "Round", 8, 8);
  round.frames.push(
    createBrushFrame("frame-2", "Frame 2", [
      createBrushLayer("layer-1", "Layer 1", 8, 8),
    ]),
  );
  const dot = createBrush("brush-2", "Dot", 4, 4);
  const doc: BrushDocument = {
    version: BRUSH_DOCUMENT_VERSION,
    brushes: [round, dot],
  };
  return { doc, round, dot };
}

describe("brushPaneScene over brushIn — the selected brush at paint time", () => {
  it("⭐ switching selectedBrushId re-composites from the OTHER brush's layers", () => {
    const { doc, round, dot } = twoBrushDocument();
    const a = brushPaneScene(brushIn(doc, "brush-1"), "frame-1", null);
    expect(a).toBe(round.frames[0].layers);

    const b = brushPaneScene(brushIn(doc, "brush-2"), "frame-1", null);
    expect(b).toBe(dot.frames[0].layers);
    expect(b).not.toBe(a);

    // Frame and layer ids are unique WITHIN a brush only (MASTER §2): the
    // Layer pane's "layer-1" resolves to THIS brush's object, never Round's.
    const layerPane = brushPaneScene(
      brushIn(doc, "brush-2"),
      "frame-1",
      "layer-1",
    );
    expect(layerPane).toHaveLength(1);
    expect(layerPane![0]).toBe(dot.frames[0].layers[0]);
    expect(layerPane![0]).not.toBe(round.frames[0].layers[0]);
  });

  it("the frame lookup stays STRICT within the selected brush: a frame the other brush has is still null", () => {
    const { doc, round } = twoBrushDocument();
    // Round has "frame-2"; Dot does not — no fallback to frame 0, no
    // fall-through to the other brush.
    expect(brushPaneScene(brushIn(doc, "brush-2"), "frame-2", null)).toBeNull();
    expect(brushPaneScene(brushIn(doc, "brush-1"), "frame-2", null)).toBe(
      round.frames[1].layers,
    );
    expect(brushPaneScene(brushIn(doc, "brush-2"), "frame-9", null)).toBeNull();
    // `brushIn`'s own rule: a null / unknown id is the FIRST brush, and no
    // document is nothing at all.
    expect(brushPaneScene(brushIn(doc, null), "frame-1", null)).toBe(
      round.frames[0].layers,
    );
    expect(brushPaneScene(brushIn(doc, "nope"), "frame-1", null)).toBe(
      round.frames[0].layers,
    );
    expect(
      brushPaneScene(brushIn(null, "brush-1"), "frame-1", null),
    ).toBeNull();
  });
});
