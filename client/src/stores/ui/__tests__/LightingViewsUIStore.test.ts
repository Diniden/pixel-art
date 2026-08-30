/**
 * LightingViewsUIStore — split state, ordering rules and the two cameras
 * (lighting-preview-split task 01).
 *
 * Pins MASTER D6: a newly opened pane goes on the RIGHT, the last pane cannot
 * be closed, swap needs both, and exactly ONE pane owns the keyboard map.
 * Pins D2 as well — the Edit and Preview panes hold DISTINCT, stable cameras,
 * neither of which is `ViewportUIStore`. And pins the `observableRef` contract
 * on a camera's `panOffset` the way `CanvasViewsUIStore.test.ts:124` does — by
 * asserting the value is a raw object, not a proxy.
 */
import { describe, expect, it } from "vitest";
import { isObservable, isObservableProp, runInAction } from "mobx";
import { LightingViewsUIStore } from "../LightingViewsUIStore";

describe("LightingViewsUIStore — defaults", () => {
  it("starts with a single Edit pane", () => {
    const s = new LightingViewsUIStore();
    expect(s.editOpen).toBe(true);
    expect(s.previewOpen).toBe(false);
    expect(s.leftMode).toBe("edit");
    expect(s.bothOpen).toBe(false);
    expect(s.openModes).toEqual(["edit"]);
    expect(s.isOpen("edit")).toBe(true);
    expect(s.isOpen("preview")).toBe(false);
  });
});

describe("LightingViewsUIStore — open / close / swap", () => {
  it("openMode('preview') puts the new pane on the RIGHT", () => {
    const s = new LightingViewsUIStore();
    runInAction(() => s.openMode("preview"));
    expect(s.bothOpen).toBe(true);
    expect(s.openModes).toEqual(["edit", "preview"]);
  });

  it("openMode on an already-open mode is a no-op", () => {
    const s = new LightingViewsUIStore();
    runInAction(() => s.openMode("preview"));
    runInAction(() => s.swap());
    runInAction(() => s.openMode("preview"));
    expect(s.openModes).toEqual(["preview", "edit"]);
  });

  it("swap() flips the sides", () => {
    const s = new LightingViewsUIStore();
    runInAction(() => s.openMode("preview"));
    runInAction(() => s.swap());
    expect(s.openModes).toEqual(["preview", "edit"]);
    runInAction(() => s.swap());
    expect(s.openModes).toEqual(["edit", "preview"]);
  });

  it("swap() with one pane open is a no-op", () => {
    const s = new LightingViewsUIStore();
    runInAction(() => s.swap());
    expect(s.leftMode).toBe("edit");
    expect(s.openModes).toEqual(["edit"]);
  });

  it("closeMode of the last open pane is a no-op", () => {
    const s = new LightingViewsUIStore();
    runInAction(() => s.closeMode("edit"));
    expect(s.editOpen).toBe(true);
    expect(s.openModes).toEqual(["edit"]);
    // And closing a pane that is not open changes nothing either.
    runInAction(() => s.closeMode("preview"));
    expect(s.openModes).toEqual(["edit"]);
  });

  it("closeMode with both open leaves the other pane alone", () => {
    const s = new LightingViewsUIStore();
    runInAction(() => s.openMode("preview"));
    runInAction(() => s.closeMode("edit"));
    expect(s.openModes).toEqual(["preview"]);
    expect(s.editOpen).toBe(false);
    expect(s.previewOpen).toBe(true);
  });

  it("opening the other mode after a close puts the NEW pane on the right", () => {
    const s = new LightingViewsUIStore();
    runInAction(() => s.openMode("preview"));
    runInAction(() => s.closeMode("edit"));
    // Preview is the only pane; Edit is the newcomer, so it goes right.
    runInAction(() => s.openMode("edit"));
    expect(s.openModes).toEqual(["preview", "edit"]);
    expect(s.leftMode).toBe("preview");
  });
});

describe("LightingViewsUIStore — keyboardOwner", () => {
  it("is 'edit' while Edit is open, 'preview' once Edit is closed", () => {
    const s = new LightingViewsUIStore();
    expect(s.keyboardOwner).toBe("edit");
    runInAction(() => s.openMode("preview"));
    expect(s.keyboardOwner).toBe("edit");
    runInAction(() => s.swap());
    // Side has nothing to do with ownership.
    expect(s.keyboardOwner).toBe("edit");
    runInAction(() => s.closeMode("edit"));
    expect(s.keyboardOwner).toBe("preview");
  });
});

describe("LightingViewsUIStore — the two session-only cameras", () => {
  it("cameraFor returns a DISTINCT, stable camera per mode", () => {
    const s = new LightingViewsUIStore();
    expect(s.cameraFor("edit")).toBe(s.editCamera);
    expect(s.cameraFor("preview")).toBe(s.previewCamera);
    expect(s.cameraFor("edit")).not.toBe(s.cameraFor("preview"));
    // Stable across calls — a container may hold the reference.
    expect(s.cameraFor("edit")).toBe(s.cameraFor("edit"));
    expect(s.cameraFor("preview")).toBe(s.cameraFor("preview"));
  });

  it("both cameras start un-zoomed at the origin", () => {
    const s = new LightingViewsUIStore();
    expect(s.editCamera.viewZoom).toBeUndefined();
    expect(s.editCamera.panOffset).toEqual({ x: 0, y: 0 });
    expect(s.previewCamera.viewZoom).toBeUndefined();
    expect(s.previewCamera.panOffset).toEqual({ x: 0, y: 0 });
  });

  it("the panes pan and zoom independently", () => {
    const s = new LightingViewsUIStore();
    runInAction(() => s.cameraFor("preview").setViewZoom(2));
    runInAction(() => s.cameraFor("preview").setPanOffset({ x: 7, y: 8 }));
    expect(s.editCamera.viewZoom).toBeUndefined();
    expect(s.editCamera.panOffset).toEqual({ x: 0, y: 0 });
  });

  it("setViewZoom clamps to 0.25–4 and resetView restores 1", () => {
    const s = new LightingViewsUIStore();
    runInAction(() => s.previewCamera.setViewZoom(10));
    expect(s.previewCamera.viewZoom).toBe(4);
    runInAction(() => s.previewCamera.setViewZoom(0.01));
    expect(s.previewCamera.viewZoom).toBe(0.25);
    runInAction(() => s.previewCamera.resetView({ x: 12, y: 34 }));
    expect(s.previewCamera.viewZoom).toBe(1);
    expect(s.previewCamera.panOffset).toEqual({ x: 12, y: 34 });
  });

  it("panOffset is observable AS A REF: the value is NOT a proxy", () => {
    const s = new LightingViewsUIStore();
    const raw = { x: 5, y: 9 };
    runInAction(() => s.previewCamera.setPanOffset(raw));
    expect(isObservableProp(s.previewCamera, "panOffset")).toBe(true);
    expect(isObservable(s.previewCamera.panOffset)).toBe(false);
    expect(s.previewCamera.panOffset).toBe(raw);
  });
});
