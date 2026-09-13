/**
 * BrushUIStore — defaults, selection adoption, the delta tuples, the zoom
 * clamp, the `CanvasCamera` surface, and playback (Brush Studio plan, task
 * 10; brush follow-ups task 03).
 *
 * Pins MASTER D7/D17: session-only state (nothing persisted, no `hydrate`),
 * the `observableRef` contract — `selectedDelta`, `fillDelta` and `panOffset`
 * are never MobX proxies and every write produces a NEW identity — and the
 * adoption rule: valid ids survive a document swap, stale ones fall back to
 * `frames[0]` / the TOP (last) layer, and `adoptDocument(null)` clears both.
 *
 * Follow-ups D2/D8: the store satisfies `CanvasCamera` (`viewZoom`,
 * `setViewZoom(z, floor)`, `resetView`) with the `ViewportUIStore` clamp, and
 * holds an edge slot (`selectedDelta`) and a fill slot (`fillDelta`) behind a
 * `deltaTarget` flag — `activeDelta` and the `*Active*` setters follow the
 * flag; the pre-split `setDelta*` API keeps writing the edge slot.
 */
import { describe, expect, it } from "vitest";
import { isObservable, isObservableProp } from "mobx";

import {
  BRUSH_ZOOM_DEFAULT,
  BRUSH_ZOOM_MAX,
  BRUSH_ZOOM_MIN,
  BrushUIStore,
} from "@/stores/ui/BrushUIStore";
import type { CanvasCamera } from "@/stores/ui/CanvasCameraStore";
import {
  createBrushDocument,
  createBrushFrame,
  createBrushLayer,
  type BrushDocument,
} from "@/types";

/** Two frames, each with layers `bottom` (index 0) and `top` (index 1). */
function twoByTwo(): BrushDocument {
  const mk = (frameId: string, name: string) =>
    createBrushFrame(frameId, name, [
      createBrushLayer("bottom", "Bottom", 4, 4, "rgb"),
      createBrushLayer("top", "Top", 4, 4, "normal"),
    ]);
  return {
    ...createBrushDocument(4, 4),
    frames: [mk("f1", "Frame 1"), mk("f2", "Frame 2")],
  };
}

describe("BrushUIStore — defaults", () => {
  it("starts unselected, zero delta, zoom 16, origin pan, not playing", () => {
    const s = new BrushUIStore();
    expect(s.selectedFrameId).toBeNull();
    expect(s.selectedLayerId).toBeNull();
    expect(s.selectedDelta).toEqual([0, 0, 0, 0]);
    expect(s.zoom).toBe(BRUSH_ZOOM_DEFAULT);
    expect(s.zoom).toBe(16);
    expect(s.panOffset).toEqual({ x: 0, y: 0 });
    expect(s.isPlaying).toBe(false);
  });

  it("starts with a zero fill delta, the edge slot active, and an unset view zoom", () => {
    const s = new BrushUIStore();
    expect(s.fillDelta).toEqual([0, 0, 0, 0]);
    expect(s.deltaTarget).toBe("edge");
    expect(s.activeDelta).toBe(s.selectedDelta);
    expect(s.viewZoom).toBeUndefined();
  });

  it("declares every field observable and keeps the ref fields un-proxied", () => {
    const s = new BrushUIStore();
    for (const key of [
      "selectedFrameId",
      "selectedLayerId",
      "selectedDelta",
      "fillDelta",
      "deltaTarget",
      "activeDelta",
      "zoom",
      "panOffset",
      "viewZoom",
      "isPlaying",
    ]) {
      expect(isObservableProp(s, key), key).toBe(true);
    }
    // `observableRef`: the VALUES are plain, only the property is tracked.
    expect(isObservable(s.selectedDelta)).toBe(false);
    expect(isObservable(s.fillDelta)).toBe(false);
    expect(isObservable(s.panOffset)).toBe(false);
    s.setDelta([1, 2, 3, 4]);
    s.setFillDelta([4, 3, 2, 1]);
    s.setPanOffset({ x: 3, y: 4 });
    expect(isObservable(s.selectedDelta)).toBe(false);
    expect(isObservable(s.fillDelta)).toBe(false);
    expect(isObservable(s.panOffset)).toBe(false);
  });
});

describe("BrushUIStore — selection", () => {
  it("selectFrame / selectLayer set and clear", () => {
    const s = new BrushUIStore();
    s.selectFrame("f1");
    s.selectLayer("top");
    expect(s.selectedFrameId).toBe("f1");
    expect(s.selectedLayerId).toBe("top");
    s.selectFrame(null);
    s.selectLayer(null);
    expect(s.selectedFrameId).toBeNull();
    expect(s.selectedLayerId).toBeNull();
  });

  it("adoptDocument on a fresh store picks frames[0] and the TOP (last) layer", () => {
    const s = new BrushUIStore();
    s.adoptDocument(twoByTwo());
    expect(s.selectedFrameId).toBe("f1");
    expect(s.selectedLayerId).toBe("top");
  });

  it("adoptDocument keeps ids that still exist", () => {
    const s = new BrushUIStore();
    s.selectFrame("f2");
    s.selectLayer("bottom");
    s.adoptDocument(twoByTwo());
    expect(s.selectedFrameId).toBe("f2");
    expect(s.selectedLayerId).toBe("bottom");
  });

  it("adoptDocument replaces a stale frame id with frames[0] and keeps a valid layer", () => {
    const s = new BrushUIStore();
    s.selectFrame("gone");
    s.selectLayer("bottom");
    s.adoptDocument(twoByTwo());
    expect(s.selectedFrameId).toBe("f1");
    expect(s.selectedLayerId).toBe("bottom");
  });

  it("adoptDocument replaces a stale layer id with the top layer and keeps a valid frame", () => {
    const s = new BrushUIStore();
    s.selectFrame("f2");
    s.selectLayer("gone");
    s.adoptDocument(twoByTwo());
    expect(s.selectedFrameId).toBe("f2");
    expect(s.selectedLayerId).toBe("top");
  });

  it("adoptDocument(null) clears both ids", () => {
    const s = new BrushUIStore();
    s.adoptDocument(twoByTwo());
    s.adoptDocument(null);
    expect(s.selectedFrameId).toBeNull();
    expect(s.selectedLayerId).toBeNull();
  });

  it("adoptDocument with no frames / no layers clears the missing half", () => {
    const s = new BrushUIStore();
    s.selectFrame("f1");
    s.selectLayer("top");
    s.adoptDocument({ ...createBrushDocument(2, 2), frames: [] });
    expect(s.selectedFrameId).toBeNull();
    expect(s.selectedLayerId).toBeNull();

    s.selectFrame("f1");
    s.selectLayer("top");
    s.adoptDocument({
      ...createBrushDocument(2, 2),
      frames: [createBrushFrame("f1", "Frame 1", [])],
    });
    expect(s.selectedFrameId).toBe("f1");
    expect(s.selectedLayerId).toBeNull();
  });

  it("channelTypeIn / selectedLayerIn read the selected layer from the given doc", () => {
    const s = new BrushUIStore();
    const doc = twoByTwo();
    expect(s.channelTypeIn(doc)).toBeNull();
    expect(s.channelTypeIn(null)).toBeNull();

    s.adoptDocument(doc);
    expect(s.channelTypeIn(doc)).toBe("normal");
    expect(s.selectedLayerIn(doc)?.id).toBe("top");

    s.selectLayer("bottom");
    expect(s.channelTypeIn(doc)).toBe("rgb");

    s.selectLayer("gone");
    expect(s.channelTypeIn(doc)).toBeNull();
    expect(s.selectedLayerIn(doc)).toBeNull();
    expect(s.channelTypeIn(null)).toBeNull();
  });

  it("channelTypeIn falls back to frames[0] when the selected frame is not in the doc", () => {
    const s = new BrushUIStore();
    s.selectFrame("gone");
    s.selectLayer("bottom");
    expect(s.channelTypeIn(twoByTwo())).toBe("rgb");
  });

  it("selectedFrameIn(null) is null", () => {
    const s = new BrushUIStore();
    expect(s.selectedFrameIn(null)).toBeNull();
    s.selectFrame("f1");
    expect(s.selectedFrameIn(null)).toBeNull();
  });

  it("selectedFrameIn returns the frame selectedFrameId names, by reference", () => {
    const s = new BrushUIStore();
    const doc = twoByTwo();
    s.selectFrame("f2");
    const frame = s.selectedFrameIn(doc);
    expect(frame).toBe(doc.frames[1]);
    expect(frame?.id).toBe("f2");
  });

  it("selectedFrameIn falls back to frames[0] for an unknown id", () => {
    const s = new BrushUIStore();
    const doc = twoByTwo();
    s.selectFrame("gone");
    expect(s.selectedFrameIn(doc)).toBe(doc.frames[0]);
  });

  it("selectedFrameIn falls back to frames[0] when nothing is selected", () => {
    const s = new BrushUIStore();
    const doc = twoByTwo();
    expect(s.selectedFrameId).toBeNull();
    expect(s.selectedFrameIn(doc)).toBe(doc.frames[0]);
  });

  it("selectedFrameIn falls back to frames[0] once the selected frame is removed, and to null with no frames", () => {
    const s = new BrushUIStore();
    s.adoptDocument(twoByTwo());
    s.selectFrame("f2");
    const withoutF2: BrushDocument = {
      ...createBrushDocument(4, 4),
      frames: [createBrushFrame("f1", "Frame 1", [])],
    };
    expect(s.selectedFrameIn(withoutF2)).toBe(withoutF2.frames[0]);
    // The selection itself is left alone — this is a read, not an adoption.
    expect(s.selectedFrameId).toBe("f2");
    expect(
      s.selectedFrameIn({ ...createBrushDocument(2, 2), frames: [] }),
    ).toBeNull();
  });

  it("adoptDocument touches only the ids — deltas, target and camera survive a swap", () => {
    const s = new BrushUIStore();
    s.setDelta([1, 2, 3, 4]);
    s.setFillDelta([5, 6, 7, 8]);
    s.setDeltaTarget("fill");
    s.setZoom(24);
    const pan = { x: 7, y: -3 };
    s.setPanOffset(pan);
    s.setViewZoom(2);
    const edge = s.selectedDelta;
    const fill = s.fillDelta;

    s.adoptDocument(twoByTwo());
    s.adoptDocument({ ...createBrushDocument(2, 2), frames: [] });
    s.adoptDocument(null);

    expect(s.selectedDelta).toBe(edge);
    expect(s.fillDelta).toBe(fill);
    expect(s.deltaTarget).toBe("fill");
    expect(s.zoom).toBe(24);
    expect(s.panOffset).toBe(pan);
    expect(s.viewZoom).toBe(2);
  });
});

describe("BrushUIStore — delta", () => {
  it("setDeltaChannel clamps to −255..255, rounds, and produces a NEW tuple", () => {
    const s = new BrushUIStore();
    const before = s.selectedDelta;
    s.setDeltaChannel(0, 100);
    expect(s.selectedDelta).toEqual([100, 0, 0, 0]);
    expect(s.selectedDelta).not.toBe(before);
    expect(before).toEqual([0, 0, 0, 0]);

    const mid = s.selectedDelta;
    s.setDeltaChannel(1, -999);
    s.setDeltaChannel(2, 999);
    s.setDeltaChannel(3, 12.6);
    expect(s.selectedDelta).toEqual([100, -255, 255, 13]);
    expect(s.selectedDelta).not.toBe(mid);
  });

  it("setDeltaChannel folds NaN to 0", () => {
    const s = new BrushUIStore();
    s.setDeltaChannel(0, 50);
    s.setDeltaChannel(0, Number.NaN);
    expect(s.selectedDelta).toEqual([0, 0, 0, 0]);
  });

  it("setDelta clamps every channel and does not keep the caller's tuple", () => {
    const s = new BrushUIStore();
    const arg: [number, number, number, number] = [300, -300, 1.4, -1.6];
    s.setDelta(arg);
    expect(s.selectedDelta).toEqual([255, -255, 1, -2]);
    expect(s.selectedDelta).not.toBe(arg);
    arg[0] = 0;
    expect(s.selectedDelta[0]).toBe(255);
  });

  it("resetDelta zeroes the tuple with a new reference", () => {
    const s = new BrushUIStore();
    s.setDelta([1, 2, 3, 4]);
    const before = s.selectedDelta;
    s.resetDelta();
    expect(s.selectedDelta).toEqual([0, 0, 0, 0]);
    expect(s.selectedDelta).not.toBe(before);
  });
});

describe("BrushUIStore — zoom & pan", () => {
  it("setZoom clamps 1..64", () => {
    const s = new BrushUIStore();
    s.setZoom(0);
    expect(s.zoom).toBe(BRUSH_ZOOM_MIN);
    s.setZoom(1000);
    expect(s.zoom).toBe(BRUSH_ZOOM_MAX);
    s.setZoom(-5);
    expect(s.zoom).toBe(1);
    s.setZoom(24);
    expect(s.zoom).toBe(24);
  });

  it("setZoom ignores a non-finite value", () => {
    const s = new BrushUIStore();
    s.setZoom(24);
    s.setZoom(Number.NaN);
    s.setZoom(Number.POSITIVE_INFINITY);
    expect(s.zoom).toBe(24);
  });

  it("zoomBy multiplies then clamps", () => {
    const s = new BrushUIStore();
    s.zoomBy(2);
    expect(s.zoom).toBe(32);
    s.zoomBy(4);
    expect(s.zoom).toBe(64);
    s.zoomBy(0.001);
    expect(s.zoom).toBe(1);
  });

  it("setPanOffset replaces the offset by reference", () => {
    const s = new BrushUIStore();
    const before = s.panOffset;
    const next = { x: 10, y: -4 };
    s.setPanOffset(next);
    expect(s.panOffset).toBe(next);
    expect(s.panOffset).not.toBe(before);
  });
});

describe("BrushUIStore — edge/fill delta slots", () => {
  it("setDelta / setDeltaChannel / resetDelta keep writing the EDGE slot whatever the target", () => {
    const s = new BrushUIStore();
    s.setDeltaTarget("fill");
    s.setDelta([1, 2, 3, 4]);
    expect(s.selectedDelta).toEqual([1, 2, 3, 4]);
    expect(s.fillDelta).toEqual([0, 0, 0, 0]);
    s.setDeltaChannel(0, 9);
    expect(s.selectedDelta).toEqual([9, 2, 3, 4]);
    expect(s.fillDelta).toEqual([0, 0, 0, 0]);
    s.setFillDelta([5, 5, 5, 5]);
    s.resetDelta();
    expect(s.selectedDelta).toEqual([0, 0, 0, 0]);
    expect(s.fillDelta).toEqual([5, 5, 5, 5]);
  });

  it("setFillDelta clamps every channel and does not keep the caller's tuple", () => {
    const s = new BrushUIStore();
    const arg: [number, number, number, number] = [300, -300, 1.4, -1.6];
    const edge = s.selectedDelta;
    s.setFillDelta(arg);
    expect(s.fillDelta).toEqual([255, -255, 1, -2]);
    expect(s.fillDelta).not.toBe(arg);
    arg[0] = 0;
    expect(s.fillDelta[0]).toBe(255);
    expect(s.selectedDelta).toBe(edge);
  });

  it("activeDelta follows deltaTarget", () => {
    const s = new BrushUIStore();
    s.setDelta([1, 1, 1, 1]);
    s.setFillDelta([2, 2, 2, 2]);
    expect(s.activeDelta).toBe(s.selectedDelta);
    s.setDeltaTarget("fill");
    expect(s.deltaTarget).toBe("fill");
    expect(s.activeDelta).toBe(s.fillDelta);
    s.setDeltaTarget("edge");
    expect(s.activeDelta).toBe(s.selectedDelta);
  });

  it("setActiveDelta on 'fill' leaves selectedDelta untouched and stores a NEW tuple", () => {
    const s = new BrushUIStore();
    s.setDelta([1, 2, 3, 4]);
    const edge = s.selectedDelta;
    const fillBefore = s.fillDelta;
    s.setDeltaTarget("fill");
    const arg: [number, number, number, number] = [10, 20, 300, -300];
    s.setActiveDelta(arg);
    expect(s.fillDelta).toEqual([10, 20, 255, -255]);
    expect(s.fillDelta).not.toBe(arg);
    expect(s.fillDelta).not.toBe(fillBefore);
    expect(s.selectedDelta).toBe(edge);
    expect(s.selectedDelta).toEqual([1, 2, 3, 4]);
  });

  it("setActiveDelta on 'edge' leaves fillDelta untouched", () => {
    const s = new BrushUIStore();
    s.setFillDelta([5, 6, 7, 8]);
    const fill = s.fillDelta;
    s.setActiveDelta([1, 2, 3, 4]);
    expect(s.selectedDelta).toEqual([1, 2, 3, 4]);
    expect(s.fillDelta).toBe(fill);
  });

  it("setActiveDeltaChannel clamps, rounds, and rebuilds only the active slot", () => {
    const s = new BrushUIStore();
    const edge = s.selectedDelta;
    s.setDeltaTarget("fill");
    const before = s.fillDelta;
    s.setActiveDeltaChannel(0, 999);
    s.setActiveDeltaChannel(1, -999);
    s.setActiveDeltaChannel(2, 12.6);
    s.setActiveDeltaChannel(3, Number.NaN);
    expect(s.fillDelta).toEqual([255, -255, 13, 0]);
    expect(s.fillDelta).not.toBe(before);
    expect(s.selectedDelta).toBe(edge);

    s.setDeltaTarget("edge");
    const fill = s.fillDelta;
    s.setActiveDeltaChannel(3, -1000);
    expect(s.selectedDelta).toEqual([0, 0, 0, -255]);
    expect(s.fillDelta).toBe(fill);
  });

  it("resetActiveDelta zeroes only the active slot, with a new reference", () => {
    const s = new BrushUIStore();
    s.setDelta([1, 2, 3, 4]);
    s.setFillDelta([5, 6, 7, 8]);
    s.setDeltaTarget("fill");
    const fillBefore = s.fillDelta;
    s.resetActiveDelta();
    expect(s.fillDelta).toEqual([0, 0, 0, 0]);
    expect(s.fillDelta).not.toBe(fillBefore);
    expect(s.selectedDelta).toEqual([1, 2, 3, 4]);

    s.setDeltaTarget("edge");
    const edgeBefore = s.selectedDelta;
    s.resetActiveDelta();
    expect(s.selectedDelta).toEqual([0, 0, 0, 0]);
    expect(s.selectedDelta).not.toBe(edgeBefore);
  });

  it("swapDeltas exchanges the slots into FRESH tuples and keeps the target", () => {
    const s = new BrushUIStore();
    s.setDelta([1, 2, 3, 4]);
    s.setFillDelta([5, 6, 7, 8]);
    s.setDeltaTarget("fill");
    const edge = s.selectedDelta;
    const fill = s.fillDelta;
    s.swapDeltas();
    expect(s.selectedDelta).toEqual([5, 6, 7, 8]);
    expect(s.fillDelta).toEqual([1, 2, 3, 4]);
    expect(s.selectedDelta).not.toBe(fill);
    expect(s.fillDelta).not.toBe(edge);
    expect(s.deltaTarget).toBe("fill");
    expect(s.activeDelta).toBe(s.fillDelta);
    // The old tuples were not mutated.
    expect(edge).toEqual([1, 2, 3, 4]);
    expect(fill).toEqual([5, 6, 7, 8]);
    // A second swap restores the values (still with new identities).
    s.swapDeltas();
    expect(s.selectedDelta).toEqual([1, 2, 3, 4]);
    expect(s.fillDelta).toEqual([5, 6, 7, 8]);
    expect(s.selectedDelta).not.toBe(edge);
  });

  it("swapDeltas with two zero slots still yields new tuples (no tri-state short-circuit)", () => {
    const s = new BrushUIStore();
    const edge = s.selectedDelta;
    const fill = s.fillDelta;
    s.swapDeltas();
    expect(s.selectedDelta).toEqual([0, 0, 0, 0]);
    expect(s.fillDelta).toEqual([0, 0, 0, 0]);
    expect(s.selectedDelta).not.toBe(edge);
    expect(s.fillDelta).not.toBe(fill);
  });
});

describe("BrushUIStore — CanvasCamera (viewZoom & resetView)", () => {
  it("is structurally a CanvasCamera", () => {
    const s = new BrushUIStore();
    const cam: CanvasCamera = s;
    expect(cam.viewZoom).toBeUndefined();
    expect(cam.panOffset).toEqual({ x: 0, y: 0 });
    cam.setViewZoom(2);
    expect(s.viewZoom).toBe(2);
    cam.setPanOffset({ x: 1, y: 2 });
    expect(s.panOffset).toEqual({ x: 1, y: 2 });
    cam.resetView({ x: 5, y: 6 });
    expect(s.viewZoom).toBe(1);
    expect(s.panOffset).toEqual({ x: 5, y: 6 });
  });

  it("viewZoom starts undefined and setViewZoom clamps to [0.25, 4] by default", () => {
    const s = new BrushUIStore();
    expect(s.viewZoom).toBeUndefined();
    s.setViewZoom(0.1);
    expect(s.viewZoom).toBe(0.25);
    s.setViewZoom(100);
    expect(s.viewZoom).toBe(4);
    s.setViewZoom(1.5);
    expect(s.viewZoom).toBe(1.5);
  });

  it("setViewZoom honours the caller's floor", () => {
    const s = new BrushUIStore();
    s.setViewZoom(0.1, 0.5);
    expect(s.viewZoom).toBe(0.5);
    // A floor below the legacy one is respected too — the store does not
    // second-guess the measured limit.
    s.setViewZoom(0.1, 0.05);
    expect(s.viewZoom).toBe(0.1);
    // The max is unaffected by the floor.
    s.setViewZoom(9, 0.5);
    expect(s.viewZoom).toBe(4);
  });

  it("setViewZoom ignores a non-finite value", () => {
    const s = new BrushUIStore();
    s.setViewZoom(Number.NaN);
    expect(s.viewZoom).toBeUndefined();
    s.setViewZoom(2);
    s.setViewZoom(Number.NaN);
    s.setViewZoom(Number.POSITIVE_INFINITY);
    s.setViewZoom(Number.NEGATIVE_INFINITY);
    expect(s.viewZoom).toBe(2);
  });

  it("resetView sets viewZoom to 1 and adopts the given pan by reference, leaving zoom alone", () => {
    const s = new BrushUIStore();
    s.setZoom(24);
    s.setViewZoom(3);
    s.setPanOffset({ x: 100, y: 100 });
    const centered = { x: 12, y: 34 };
    s.resetView(centered);
    expect(s.viewZoom).toBe(1);
    expect(s.panOffset).toBe(centered);
    expect(s.zoom).toBe(24);
  });

  it("view zoom and pixel zoom are independent", () => {
    const s = new BrushUIStore();
    s.setViewZoom(2);
    s.zoomBy(2);
    expect(s.zoom).toBe(32);
    expect(s.viewZoom).toBe(2);
    s.setZoom(8);
    expect(s.viewZoom).toBe(2);
  });
});

describe("BrushUIStore — playback", () => {
  it("setPlaying and togglePlaying", () => {
    const s = new BrushUIStore();
    s.setPlaying(true);
    expect(s.isPlaying).toBe(true);
    s.togglePlaying();
    expect(s.isPlaying).toBe(false);
    s.togglePlaying();
    expect(s.isPlaying).toBe(true);
    s.setPlaying(false);
    expect(s.isPlaying).toBe(false);
  });
});
