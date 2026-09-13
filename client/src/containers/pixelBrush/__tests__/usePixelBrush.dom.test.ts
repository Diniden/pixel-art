/**
 * `usePixelBrush` — the Brush tool's container-tier state (plan 12, task 05;
 * MASTER D6, D9).
 *
 * The hook is rendered inside a tiny `observer` probe component (the real
 * caller, `CanvasContainer`, is an observer) so its store reads subscribe.
 * The probe reports every result through a callback; the tests read the
 * LATEST one. What is pinned:
 *
 *   - `init()` is called when enabled and NOT when disabled — a fresh
 *     pixel-mode load must load a brush without a visit to the Brush Studio.
 *   - The footprint / stamp equal the pure module's answer for the same
 *     layers (so the container cannot disagree with `pixelBrushStamp.ts`).
 *   - `stamp` is REFERENTIALLY STABLE across a re-render with an equal base
 *     colour object — the property `getToolContext`'s dependency array relies
 *     on to avoid rebuilding at pointer rate.
 *   - A new base colour, a frame switch and a document change each yield a
 *     new stamp; `document === null` yields `null` for both.
 *   - Scaling (plan 13, task 12; MASTER D12): the frame's layers are scaled
 *     per `ui.pixelBrush` before the footprint / stamp, at the scaled size;
 *     a strategy change re-resolves; a brush with different native
 *     dimensions resets the size to native; `size` reports the effective
 *     size. At native size the stability case above holds unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { createElement } from "react";
import { observer } from "mobx-react-lite";
import { runInAction } from "mobx";

import { ApplicationStore } from "@/stores/ApplicationStore";
import { createBrushDocument, createBrushLayer } from "@/types";
import type { BrushDocument } from "@/types";
import { scalePixelBrushLayers } from "@/ui/canvas/tools/pixelBrushScale";
import {
  pixelBrushFootprint,
  resolvePixelBrushStamp,
} from "@/ui/canvas/tools/pixelBrushStamp";
import { usePixelBrush } from "../usePixelBrush";
import type { PixelBrushBase, PixelBrushState } from "../usePixelBrush";

/* ── Fixtures ──────────────────────────────────────────────────────────────── */

const RED: PixelBrushBase = { r: 255, g: 0, b: 0, a: 255 };
const BLUE: PixelBrushBase = { r: 0, g: 0, b: 255, a: 255 };

/**
 * A 3×3 brush, origin (1,1): an rgb layer painted at (0,0) and (2,1), an hsl
 * layer painted at (2,1) only. Frame 2 paints a single different cell so a
 * frame switch is visible in the footprint.
 */
function threeByThree(): BrushDocument {
  const doc = createBrushDocument(3, 3);
  const rgb = createBrushLayer("rgb-1", "rgb", 3, 3, "rgb");
  rgb.pixels[0]![0] = [10, 0, 0, 0];
  rgb.pixels[1]![2] = [0, 0, 40, 0];
  const hsl = createBrushLayer("hsl-1", "hsl", 3, 3, "hsl");
  hsl.pixels[1]![2] = [0, 0, 60, 0];
  doc.frames = [
    { id: "frame-1", name: "Frame 1", layers: [rgb, hsl] },
    {
      id: "frame-2",
      name: "Frame 2",
      layers: [
        (() => {
          const l = createBrushLayer("rgb-1", "rgb", 3, 3, "rgb");
          l.pixels[2]![2] = [1, 1, 1, 0];
          return l;
        })(),
        createBrushLayer("hsl-1", "hsl", 3, 3, "hsl"),
      ],
    },
  ];
  return doc;
}

let app: ApplicationStore;
/**
 * `init()` stubbed for every test: the documents here are installed by
 * hand, and the real flow would reach the (MSW-guarded) network and flip
 * `loadState` to `loading`. The store's `init` is a `flow`, so the stub
 * returns a resolved promise as the real one would.
 */
let init: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  app = new ApplicationStore({ autoSaveEnabled: false });
  init = vi
    .spyOn(app.brushes, "init")
    .mockImplementation((() => Promise.resolve()) as never);
});

afterEach(() => {
  app.dispose();
  vi.restoreAllMocks();
});

function installLoaded(doc: BrushDocument | null): void {
  runInAction(() => {
    app.brushes.brushName = doc ? "test-brush" : "";
    app.brushes.installDocument(doc);
    app.brushes.loadState = doc ? "loaded" : "idle";
  });
}

interface ProbeProps {
  enabled: boolean;
  base: PixelBrushBase;
  onResult: (state: PixelBrushState) => void;
}

/** The observer the real caller is — its reads subscribe. Renders nothing. */
const Probe = observer(function Probe({ enabled, base, onResult }: ProbeProps) {
  onResult(usePixelBrush(app, enabled, base));
  return null;
});

function mount(enabled: boolean, base: PixelBrushBase) {
  const results: PixelBrushState[] = [];
  const onResult = (s: PixelBrushState) => {
    results.push(s);
  };
  const view = render(createElement(Probe, { enabled, base, onResult }));
  act(() => {});
  return {
    latest: () => results[results.length - 1]!,
    renders: () => results.length,
    rerender: (next: Partial<Pick<ProbeProps, "enabled" | "base">> = {}) => {
      view.rerender(
        createElement(Probe, {
          enabled: next.enabled ?? enabled,
          base: next.base ?? base,
          onResult,
        }),
      );
      act(() => {});
    },
    unmount: () => view.unmount(),
  };
}

/* ── init ──────────────────────────────────────────────────────────────────── */

describe("usePixelBrush — init()", () => {
  it("⭐ calls brushes.init() from an effect when enabled", () => {
    mount(true, RED);
    expect(init).toHaveBeenCalledTimes(1);
  });

  it("does NOT call init() when disabled", () => {
    mount(false, RED);
    expect(init).not.toHaveBeenCalled();
  });

  it("calls init() once the tool becomes enabled on a later render", () => {
    const h = mount(false, RED);
    expect(init).not.toHaveBeenCalled();
    h.rerender({ enabled: true });
    expect(init).toHaveBeenCalledTimes(1);
  });
});

/* ── footprint and stamp ───────────────────────────────────────────────────── */

describe("usePixelBrush — footprint and stamp", () => {
  it("⭐ with a 3×3 document, the footprint and stamp match the pure module", () => {
    const doc = threeByThree();
    installLoaded(doc);
    const h = mount(true, RED);
    const { footprint, stamp, loadState, brushName } = h.latest();

    const frame = doc.frames[0]!;
    expect(footprint).toEqual(pixelBrushFootprint(frame.layers, 3, 3));
    expect(footprint?.offsets).toEqual([
      { dx: -1, dy: -1 },
      { dx: 1, dy: 0 },
    ]);
    expect(stamp).toEqual(resolvePixelBrushStamp(frame.layers, 3, 3, RED));
    // And the colours really are settled from RED, not RED itself:
    // (0,0) is +10 R on 255 → clamped 255 (unchanged); (2,1) is +40 B then
    // an hsl L shift of +60 → lighter than pure red.
    expect(stamp?.cells[0]!.color).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    expect(stamp?.cells[1]!.color).not.toEqual({ r: 255, g: 0, b: 40, a: 255 });
    expect(stamp?.cells[1]!.color.g).toBeGreaterThan(0);
    expect(loadState).toBe("loaded");
    expect(brushName).toBe("test-brush");
  });

  it("⭐ the SAME stamp reference survives a re-render with an EQUAL base colour", () => {
    installLoaded(threeByThree());
    const h = mount(true, RED);
    const first = h.latest().stamp;
    const firstFootprint = h.latest().footprint;
    expect(first).not.toBeNull();
    // A fresh object with the same channels — what a per-render literal or a
    // replaced `observable.ref` colour looks like to the hook.
    h.rerender({ base: { ...RED } });
    expect(h.renders()).toBeGreaterThan(1);
    expect(h.latest().stamp).toBe(first);
    expect(h.latest().footprint).toBe(firstFootprint);
  });

  it("⭐ a new base colour yields a NEW stamp with re-settled colours", () => {
    installLoaded(threeByThree());
    const h = mount(true, RED);
    const red = h.latest().stamp!;
    h.rerender({ base: BLUE });
    const blue = h.latest().stamp!;
    expect(blue).not.toBe(red);
    expect(blue).toEqual(
      resolvePixelBrushStamp(threeByThree().frames[0]!.layers, 3, 3, BLUE),
    );
    expect(blue.cells[0]!.color).toEqual({ r: 10, g: 0, b: 255, a: 255 });
    // The footprint does not depend on the colour, so it is untouched.
    expect(h.latest().footprint?.offsets).toEqual(
      red.cells.map(({ dx, dy }) => ({ dx, dy })),
    );
  });

  it("⭐ a frame switch changes the footprint (and the stamp)", () => {
    const doc = threeByThree();
    installLoaded(doc);
    const h = mount(true, RED);
    const before = h.latest();
    act(() => {
      app.brushUI.selectFrame("frame-2");
    });
    const after = h.latest();
    expect(after.footprint).not.toBe(before.footprint);
    expect(after.footprint?.offsets).toEqual([{ dx: 1, dy: 1 }]);
    expect(after.stamp).not.toBe(before.stamp);
    expect(after.stamp?.cells).toHaveLength(1);
  });

  it("a cell write (pixelVersion) and a visibility change (domainVersion) each refresh", () => {
    const doc = threeByThree();
    installLoaded(doc);
    const h = mount(true, RED);
    const initial = h.latest().footprint;

    // A pixel write through the store bumps `pixelVersion`.
    act(() => {
      const next = structuredClone(doc);
      next.frames[0]!.layers[0]!.pixels[2]![0] = [1, 0, 0, 0];
      app.brushes.replaceDocument(next, { bumpPixels: true });
    });
    const afterWrite = h.latest().footprint;
    expect(afterWrite).not.toBe(initial);
    expect(afterWrite?.offsets).toContainEqual({ dx: -1, dy: 1 });

    // Hiding a layer bumps `domainVersion` (no pixel change).
    act(() => {
      const next = structuredClone(app.brushes.document!);
      next.frames[0]!.layers[0]!.visible = false;
      app.brushes.replaceDocument(next);
    });
    const afterHide = h.latest().footprint;
    expect(afterHide).not.toBe(afterWrite);
    // Only the hsl layer's (2,1) survives.
    expect(afterHide?.offsets).toEqual([{ dx: 1, dy: 0 }]);
  });

  it("⭐ document === null → footprint and stamp are both null, brushName null", () => {
    installLoaded(null);
    const h = mount(true, RED);
    expect(h.latest().footprint).toBeNull();
    expect(h.latest().stamp).toBeNull();
    expect(h.latest().brushName).toBeNull();
    expect(h.latest().loadState).toBe("idle");
  });

  it("disabled → both null even with a document loaded (no grid work)", () => {
    installLoaded(threeByThree());
    const h = mount(false, RED);
    expect(h.latest().footprint).toBeNull();
    expect(h.latest().stamp).toBeNull();
    // Enabling later computes them.
    h.rerender({ enabled: true });
    expect(h.latest().footprint?.offsets).toHaveLength(2);
    expect(h.latest().stamp?.cells).toHaveLength(2);
  });
});

/* ── scaling (plan 13, task 12) ────────────────────────────────────────────── */

/** A 4×4 brush painted at (1,1) only — a different native size from `threeByThree`. */
function fourByFour(): BrushDocument {
  const doc = createBrushDocument(4, 4);
  doc.frames[0]!.layers[0]!.pixels[1]![1] = [5, 0, 0, 0];
  return doc;
}

const NATIVE_3 = { width: 3, height: 3 };

describe("usePixelBrush — scaling from ui.pixelBrush", () => {
  it("⭐ at native size `size` is the document's own and the layers pass through unscaled", () => {
    const doc = threeByThree();
    installLoaded(doc);
    const h = mount(true, RED);
    expect(app.ui.pixelBrush.isNative).toBe(true);
    expect(h.latest().size).toEqual({ width: 3, height: 3 });
    // The identity path: exactly the pure module's answer for the frame's
    // own layers at the native size (the stability case above is the
    // reference-equality half of this guarantee).
    expect(h.latest().footprint).toEqual(
      pixelBrushFootprint(doc.frames[0]!.layers, 3, 3),
    );
  });

  it("⭐ setWidth(6) on a 3×3 brush (locked → 6×6) gives a nearest footprint of 4 × |painted| cells", () => {
    const doc = threeByThree();
    installLoaded(doc);
    const h = mount(true, RED);
    const nativeStamp = h.latest().stamp;

    act(() => {
      app.ui.pixelBrush.setWidth(6, NATIVE_3);
    });
    expect(app.ui.pixelBrush.width).toBe(6);
    expect(app.ui.pixelBrush.height).toBe(6);

    const { footprint, stamp, size } = h.latest();
    expect(size).toEqual({ width: 6, height: 6 });

    // Two painted source cells, each a 2×2 block at 2× nearest → 8 cells.
    // Origin of a 6×6 is (3,3): (0,0) → x 0..1, y 0..1; (2,1) → x 4..5, y 2..3.
    expect(footprint?.width).toBe(6);
    expect(footprint?.height).toBe(6);
    expect(footprint?.offsets).toHaveLength(8);
    expect(footprint?.offsets).toEqual([
      { dx: -3, dy: -3 },
      { dx: -2, dy: -3 },
      { dx: -3, dy: -2 },
      { dx: -2, dy: -2 },
      { dx: 1, dy: -1 },
      { dx: 2, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 2, dy: 0 },
    ]);

    // And both equal the pure pipeline fed the same request.
    const scaledLayers = scalePixelBrushLayers(doc.frames[0]!.layers, {
      srcW: 3,
      srcH: 3,
      dstW: 6,
      dstH: 6,
      x: "nearest",
      y: "nearest",
    });
    expect(footprint).toEqual(pixelBrushFootprint(scaledLayers, 6, 6));
    expect(stamp).not.toBe(nativeStamp);
    expect(stamp).toEqual(resolvePixelBrushStamp(scaledLayers, 6, 6, RED));
    expect(stamp?.cells).toHaveLength(8);
    // The (2,1)-derived block still carries the hsl lightness shift (g > 0),
    // and the (0,0)-derived block is the clamped red — nearest clones tuples.
    expect(stamp?.cells[0]!.color).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    expect(stamp?.cells[7]!.color.g).toBeGreaterThan(0);
  });

  it("at a scaled size the stamp reference is still stable across a re-render with an equal colour", () => {
    installLoaded(threeByThree());
    const h = mount(true, RED);
    act(() => {
      app.ui.pixelBrush.setWidth(6, NATIVE_3);
    });
    const first = h.latest().stamp;
    const firstFootprint = h.latest().footprint;
    const firstSize = h.latest().size;
    h.rerender({ base: { ...RED } });
    expect(h.latest().stamp).toBe(first);
    expect(h.latest().footprint).toBe(firstFootprint);
    expect(h.latest().size).toBe(firstSize);
  });

  it("⭐ switching the strategy to bilinear re-resolves the footprint and stamp", () => {
    const doc = threeByThree();
    installLoaded(doc);
    const h = mount(true, RED);
    act(() => {
      app.ui.pixelBrush.setWidth(6, NATIVE_3);
    });
    const nearestFootprint = h.latest().footprint;
    const nearestStamp = h.latest().stamp;

    act(() => {
      app.ui.pixelBrush.setScale("x", "bilinear");
    });
    // Locked → both axes (D11); the hook follows whatever the store holds.
    expect(app.ui.pixelBrush.scaleX).toBe("bilinear");
    expect(app.ui.pixelBrush.scaleY).toBe("bilinear");

    const { footprint, stamp } = h.latest();
    expect(footprint).not.toBe(nearestFootprint);
    expect(stamp).not.toBe(nearestStamp);
    const scaledLayers = scalePixelBrushLayers(doc.frames[0]!.layers, {
      srcW: 3,
      srcH: 3,
      dstW: 6,
      dstH: 6,
      x: "bilinear",
      y: "bilinear",
    });
    expect(footprint).toEqual(pixelBrushFootprint(scaledLayers, 6, 6));
    expect(stamp).toEqual(resolvePixelBrushStamp(scaledLayers, 6, 6, RED));
  });

  it("⭐ installing a 4×4 document after a 3×3 resets width/height to null; strategies are kept", () => {
    installLoaded(threeByThree());
    const h = mount(true, RED);
    act(() => {
      app.ui.pixelBrush.setWidth(6, NATIVE_3);
      app.ui.pixelBrush.setScale("x", "bilinear");
    });
    expect(app.ui.pixelBrush.width).toBe(6);
    expect(h.latest().size).toEqual({ width: 6, height: 6 });

    act(() => {
      installLoaded(fourByFour());
    });
    expect(app.ui.pixelBrush.width).toBeNull();
    expect(app.ui.pixelBrush.height).toBeNull();
    expect(app.ui.pixelBrush.lockedRatio).toBeNull();
    // `resetSize`, not `resetAll`: the strategy choice survives (D11).
    expect(app.ui.pixelBrush.scaleX).toBe("bilinear");
    expect(h.latest().size).toEqual({ width: 4, height: 4 });
    // The new brush at ITS native size: origin (2,2), one cell at (1,1).
    expect(h.latest().footprint?.offsets).toEqual([{ dx: -1, dy: -1 }]);
  });

  it("installing another document with the SAME native size keeps the chosen size", () => {
    installLoaded(threeByThree());
    const h = mount(true, RED);
    act(() => {
      app.ui.pixelBrush.setWidth(6, NATIVE_3);
    });
    act(() => {
      installLoaded(threeByThree());
    });
    expect(app.ui.pixelBrush.width).toBe(6);
    expect(app.ui.pixelBrush.height).toBe(6);
    expect(h.latest().size).toEqual({ width: 6, height: 6 });
  });

  it("`size` is null with no document and while disabled", () => {
    installLoaded(null);
    const h = mount(true, RED);
    expect(h.latest().size).toBeNull();

    act(() => {
      installLoaded(threeByThree());
    });
    h.rerender({ enabled: false });
    expect(h.latest().size).toBeNull();
    h.rerender({ enabled: true });
    expect(h.latest().size).toEqual({ width: 3, height: 3 });
  });
});
