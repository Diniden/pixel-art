/**
 * CanvasViewsUIStore — split state, ordering rules and the Layer camera
 * (split-canvas task 01).
 *
 * Pins MASTER D6: a newly opened pane goes on the RIGHT, the last pane cannot
 * be closed, swap needs both, and exactly ONE pane owns the keyboard map.
 * Also pins the `observableRef` contract on `layerCamera.panOffset` the same
 * way `CanvasInteractionStore.test.ts` does — by asserting the value is a raw
 * object, not a proxy.
 */
import { describe, expect, it } from "vitest";
import { isObservable, isObservableProp, runInAction } from "mobx";
import { CanvasViewsUIStore } from "../CanvasViewsUIStore";
import { CanvasCameraStore, type CanvasCamera } from "../CanvasCameraStore";
import { ViewportUIStore } from "../ViewportUIStore";

describe("CanvasViewsUIStore — defaults", () => {
  it("starts with a single Full pane", () => {
    const s = new CanvasViewsUIStore();
    expect(s.fullOpen).toBe(true);
    expect(s.layerOpen).toBe(false);
    expect(s.leftMode).toBe("full");
    expect(s.bothOpen).toBe(false);
    expect(s.openModes).toEqual(["full"]);
    expect(s.isOpen("full")).toBe(true);
    expect(s.isOpen("layer")).toBe(false);
  });
});

describe("CanvasViewsUIStore — open / close / swap", () => {
  it("openMode('layer') puts the new pane on the RIGHT", () => {
    const s = new CanvasViewsUIStore();
    runInAction(() => s.openMode("layer"));
    expect(s.bothOpen).toBe(true);
    expect(s.openModes).toEqual(["full", "layer"]);
  });

  it("openMode on an already-open mode is a no-op", () => {
    const s = new CanvasViewsUIStore();
    runInAction(() => s.openMode("layer"));
    runInAction(() => s.swap());
    runInAction(() => s.openMode("layer"));
    expect(s.openModes).toEqual(["layer", "full"]);
  });

  it("swap() flips the sides", () => {
    const s = new CanvasViewsUIStore();
    runInAction(() => s.openMode("layer"));
    runInAction(() => s.swap());
    expect(s.openModes).toEqual(["layer", "full"]);
    runInAction(() => s.swap());
    expect(s.openModes).toEqual(["full", "layer"]);
  });

  it("swap() with one pane open is a no-op", () => {
    const s = new CanvasViewsUIStore();
    runInAction(() => s.swap());
    expect(s.leftMode).toBe("full");
    expect(s.openModes).toEqual(["full"]);
  });

  it("closeMode of the last open pane is a no-op", () => {
    const s = new CanvasViewsUIStore();
    runInAction(() => s.closeMode("full"));
    expect(s.fullOpen).toBe(true);
    expect(s.openModes).toEqual(["full"]);
    // And closing a pane that is not open changes nothing either.
    runInAction(() => s.closeMode("layer"));
    expect(s.openModes).toEqual(["full"]);
  });

  it("closeMode with both open leaves the other pane alone", () => {
    const s = new CanvasViewsUIStore();
    runInAction(() => s.openMode("layer"));
    runInAction(() => s.closeMode("full"));
    expect(s.openModes).toEqual(["layer"]);
    expect(s.fullOpen).toBe(false);
    expect(s.layerOpen).toBe(true);
  });

  it("opening the other mode after a close puts the NEW pane on the right", () => {
    const s = new CanvasViewsUIStore();
    runInAction(() => s.openMode("layer"));
    runInAction(() => s.closeMode("full"));
    // Layer is the only pane; Full is the newcomer, so it goes right.
    runInAction(() => s.openMode("full"));
    expect(s.openModes).toEqual(["layer", "full"]);
    expect(s.leftMode).toBe("layer");
  });
});

describe("CanvasViewsUIStore — keyboardOwner", () => {
  it("is 'full' while Full is open, 'layer' once Full is closed", () => {
    const s = new CanvasViewsUIStore();
    expect(s.keyboardOwner).toBe("full");
    runInAction(() => s.openMode("layer"));
    expect(s.keyboardOwner).toBe("full");
    runInAction(() => s.swap());
    // Side has nothing to do with ownership.
    expect(s.keyboardOwner).toBe("full");
    runInAction(() => s.closeMode("full"));
    expect(s.keyboardOwner).toBe("layer");
  });
});

describe("CanvasCameraStore — the Layer camera", () => {
  it("starts un-zoomed at the origin", () => {
    const c = new CanvasCameraStore();
    expect(c.viewZoom).toBeUndefined();
    expect(c.panOffset).toEqual({ x: 0, y: 0 });
  });

  it("setViewZoom clamps to 0.25–4 and resetView restores 1", () => {
    const s = new CanvasViewsUIStore();
    runInAction(() => s.layerCamera.setViewZoom(10));
    expect(s.layerCamera.viewZoom).toBe(4);
    runInAction(() => s.layerCamera.setViewZoom(0.01));
    expect(s.layerCamera.viewZoom).toBe(0.25);
    runInAction(() => s.layerCamera.resetView({ x: 12, y: 34 }));
    expect(s.layerCamera.viewZoom).toBe(1);
    expect(s.layerCamera.panOffset).toEqual({ x: 12, y: 34 });
  });

  it("panOffset is observable AS A REF: the value is NOT a proxy", () => {
    const s = new CanvasViewsUIStore();
    const raw = { x: 5, y: 9 };
    runInAction(() => s.layerCamera.setPanOffset(raw));
    expect(isObservableProp(s.layerCamera, "panOffset")).toBe(true);
    expect(isObservable(s.layerCamera.panOffset)).toBe(false);
    expect(s.layerCamera.panOffset).toBe(raw);
  });

  it("ViewportUIStore is assignable to CanvasCamera (the Full camera)", () => {
    // Type-level check: this line fails `tsc` if the interface drifts.
    const c: CanvasCamera = new ViewportUIStore();
    runInAction(() => c.setViewZoom(10));
    expect(c.viewZoom).toBe(4);
    runInAction(() => c.resetView({ x: 1, y: 2 }));
    expect(c.viewZoom).toBe(1);
    expect(c.panOffset).toEqual({ x: 1, y: 2 });
  });
});
