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
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { createElement } from "react";
import { observer } from "mobx-react-lite";
import { runInAction } from "mobx";

import { ApplicationStore } from "@/stores/ApplicationStore";
import { createBrushDocument, createBrushLayer } from "@/types";
import type { BrushDocument } from "@/types";
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
