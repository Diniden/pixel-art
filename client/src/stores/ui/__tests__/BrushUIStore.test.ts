/**
 * BrushUIStore — defaults, selection adoption, the delta tuple, the zoom
 * clamp, and playback (Brush Studio plan, task 10).
 *
 * Pins MASTER D7/D17: session-only state (nothing persisted, no `hydrate`),
 * the `observableRef` contract — `selectedDelta` and `panOffset` are never
 * MobX proxies and every write produces a NEW identity — and the adoption
 * rule: valid ids survive a document swap, stale ones fall back to
 * `frames[0]` / the TOP (last) layer, and `adoptDocument(null)` clears both.
 */
import { describe, expect, it } from "vitest";
import { isObservable, isObservableProp } from "mobx";

import {
  BRUSH_ZOOM_DEFAULT,
  BRUSH_ZOOM_MAX,
  BRUSH_ZOOM_MIN,
  BrushUIStore,
} from "@/stores/ui/BrushUIStore";
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

  it("declares every field observable and keeps the ref fields un-proxied", () => {
    const s = new BrushUIStore();
    for (const key of [
      "selectedFrameId",
      "selectedLayerId",
      "selectedDelta",
      "zoom",
      "panOffset",
      "isPlaying",
    ]) {
      expect(isObservableProp(s, key), key).toBe(true);
    }
    // `observableRef`: the VALUES are plain, only the property is tracked.
    expect(isObservable(s.selectedDelta)).toBe(false);
    expect(isObservable(s.panOffset)).toBe(false);
    s.setDelta([1, 2, 3, 4]);
    s.setPanOffset({ x: 3, y: 4 });
    expect(isObservable(s.selectedDelta)).toBe(false);
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
