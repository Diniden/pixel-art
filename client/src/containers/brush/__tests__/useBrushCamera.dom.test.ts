/**
 * `useBrushCamera` — the brush canvas's adapter over `useCanvasViewport`
 * (Brush follow-ups task 06, MASTER D1–D3).
 *
 * What is pinned: the engine's native wheel listener binds on the element
 * the hook hands out, ctrl-wheel changes the VIEW zoom and commits it into
 * the camera (with the derived floor) on the engine's debounce, a plain wheel
 * pans and commits the pan, Reset View centres against `cellWidth * zoom`
 * and returns view zoom to 1, `combinedScale` is `zoom * viewZoom`, and —
 * the header's reason for owning the ref — the listeners bind when the
 * surface mounts AFTER the hook first ran (the empty-state → brush case).
 *
 * The hook is mounted through a probe component rather than `renderHook`
 * because the ref must be assigned by React at COMMIT, before the engine's
 * effects run, exactly as `CanvasSurface` does it in the container.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { createElement } from "react";
import { useBrushCamera } from "../useBrushCamera";
import type { BrushCamera, BrushCameraArgs } from "../useBrushCamera";
import type { CanvasCamera } from "../../../stores/ui/CanvasCameraStore";

const WIDTH = 16;
const HEIGHT = 12;
const ZOOM = 10;
/** The on-screen box at view zoom 1 — `cellWidth * zoom`, never the store. */
const CONTENT_W = WIDTH * ZOOM; // 160
const CONTENT_H = HEIGHT * ZOOM; // 120
/** The engine's commit debounce (`PAN_COMMIT_MS`). */
const COMMIT_MS = 150;

function fakeCamera(over: Partial<CanvasCamera> = {}) {
  return {
    panOffset: { x: 0, y: 0 },
    viewZoom: undefined,
    setPanOffset: vi.fn(),
    setViewZoom: vi.fn(),
    resetView: vi.fn(),
    ...over,
  };
}

/** Give the viewport a known box, as `CanvasSurface`'s container has. */
function size(el: HTMLElement) {
  Object.defineProperty(el, "clientWidth", { value: 800, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: 600, configurable: true });
  el.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
    }) as DOMRect;
}

/**
 * Mount the hook the way the container does: the returned ref goes onto a
 * viewport `<div>` when `enabled`, an empty state stands in otherwise.
 */
function mount(args: Partial<BrushCameraArgs> = {}) {
  const camera = fakeCamera();
  const holder: { current: BrushCamera | null } = { current: null };
  const defaults: BrushCameraArgs = {
    enabled: true,
    width: WIDTH,
    height: HEIGHT,
    zoom: ZOOM,
    camera,
    resyncKey: "brush:frame",
  };
  function Probe(props: BrushCameraArgs) {
    const result = useBrushCamera(props);
    holder.current = result;
    return props.enabled
      ? createElement("div", { ref: result.containerRef, id: "viewport" })
      : createElement("span", null, "empty");
  }
  const view = render(createElement(Probe, { ...defaults, ...args }));
  const viewport = () => {
    const el = view.container.querySelector<HTMLDivElement>("#viewport");
    if (!el) throw new Error("no viewport mounted");
    return el;
  };
  const rerender = (next: Partial<BrushCameraArgs>) =>
    view.rerender(createElement(Probe, { ...defaults, ...args, ...next }));
  return { camera, holder, viewport, rerender };
}

const wheel = (init: WheelEventInit) =>
  new WheelEvent("wheel", { cancelable: true, bubbles: true, ...init });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the adapter's derived values", () => {
  it("combinedScale is zoom * viewZoom, computed here and nowhere else", () => {
    const { holder } = mount();
    expect(holder.current?.viewZoom).toBe(1);
    expect(holder.current?.combinedScale).toBe(ZOOM);
  });

  it("contentWidth/Height are cellWidth * zoom, never the backing store", () => {
    const { holder } = mount();
    expect(holder.current?.contentWidth).toBe(CONTENT_W);
    expect(holder.current?.contentHeight).toBe(CONTENT_H);
  });

  it("viewZoomFloor is the engine's derived floor for that box, capped at 1", () => {
    const { holder } = mount();
    // 50 / 160 — a 160 px brush may shrink to 50 screen px on its long side.
    expect(holder.current?.viewZoomFloor).toBeCloseTo(50 / CONTENT_W, 6);
    const big = mount({ zoom: 2 });
    // 32 × 24 px is already under 50, so the floor is 1:1.
    expect(big.holder.current?.viewZoomFloor).toBe(1);
  });

  it("seeds pan and view zoom from the camera", () => {
    const camera = fakeCamera({ panOffset: { x: 40, y: 30 }, viewZoom: 2 });
    const { holder } = mount({ camera });
    expect(holder.current?.viewPanOffset).toEqual({ x: 40, y: 30 });
    expect(holder.current?.viewZoom).toBe(2);
    expect(holder.current?.combinedScale).toBe(ZOOM * 2);
  });
});

describe("wheel, through the engine's native listener on the container", () => {
  it("⭐ ctrl-wheel changes viewZoom and commits it to the camera with the floor after the debounce", () => {
    const { camera, holder, viewport } = mount();
    const el = viewport();
    size(el);

    act(() => {
      el.dispatchEvent(
        wheel({ ctrlKey: true, deltaY: -100, clientX: 100, clientY: 100 }),
      );
    });
    const z = holder.current?.viewZoom ?? 0;
    expect(z).toBeGreaterThan(1);
    expect(holder.current?.combinedScale).toBeCloseTo(ZOOM * z, 9);
    // Live, not yet committed.
    expect(camera.setViewZoom).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(COMMIT_MS);
    });
    expect(camera.setViewZoom).toHaveBeenCalledTimes(1);
    expect(camera.setViewZoom).toHaveBeenLastCalledWith(z, 50 / CONTENT_W);
    // Pan and zoom commit together (the engine's rule).
    expect(camera.setPanOffset).toHaveBeenCalledTimes(1);
  });

  it("ctrl-wheel zooming out stops at the derived floor", () => {
    const { holder, viewport } = mount();
    const el = viewport();
    size(el);
    act(() => {
      el.dispatchEvent(
        wheel({ ctrlKey: true, deltaY: 5000, clientX: 0, clientY: 0 }),
      );
    });
    expect(holder.current?.viewZoom).toBeCloseTo(50 / CONTENT_W, 6);
  });

  it("⭐ a plain wheel pans by -delta and commits the pan after the debounce", () => {
    const { camera, holder, viewport } = mount();
    const el = viewport();
    size(el);

    act(() => {
      el.dispatchEvent(wheel({ deltaX: -50, deltaY: -30 }));
    });
    expect(holder.current?.viewPanOffset).toEqual({ x: 50, y: 30 });
    expect(holder.current?.viewZoom).toBe(1);
    expect(camera.setPanOffset).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(COMMIT_MS);
    });
    expect(camera.setPanOffset).toHaveBeenCalledWith({ x: 50, y: 30 });
  });

  it("⭐ the listener binds when the surface mounts AFTER the hook first ran (empty state → brush)", () => {
    const { holder, rerender, viewport } = mount({ enabled: false });
    expect(holder.current?.containerRef.current).toBeNull();

    act(() => {
      rerender({ enabled: true });
    });
    const el = viewport();
    size(el);
    expect(holder.current?.containerRef.current).toBe(el);

    act(() => {
      el.dispatchEvent(wheel({ deltaX: -10, deltaY: -20 }));
    });
    expect(holder.current?.viewPanOffset).toEqual({ x: 10, y: 20 });
  });
});

describe("Reset View", () => {
  it("⭐ centres against cellWidth * zoom and returns view zoom to 1", () => {
    const { camera, holder, viewport } = mount();
    const el = viewport();
    size(el);
    act(() => {
      el.dispatchEvent(
        wheel({ ctrlKey: true, deltaY: -100, clientX: 100, clientY: 100 }),
      );
    });
    expect(holder.current?.viewZoom).not.toBe(1);

    act(() => {
      holder.current?.handleResetView();
    });
    // (800 - 160) / 2, (600 - 120) / 2 — the box at view zoom 1, NOT the 1:1
    // backing store (which would centre at (392, 294) and miss by 90%).
    const centered = { x: 320, y: 240 };
    expect(holder.current?.viewZoom).toBe(1);
    expect(holder.current?.viewPanOffset).toEqual(centered);
    expect(holder.current?.combinedScale).toBe(ZOOM);
    expect(camera.resetView).toHaveBeenCalledWith(centered);
  });

  it("with no viewport element the reset lands at the origin", () => {
    const { camera, holder } = mount({ enabled: false });
    act(() => {
      holder.current?.handleResetView();
    });
    expect(camera.resetView).toHaveBeenCalledWith({ x: 0, y: 0 });
  });
});

describe("re-sync", () => {
  it("a changed resyncKey re-seats the live pan and zoom from the camera", () => {
    const camera = fakeCamera({ panOffset: { x: 5, y: 5 }, viewZoom: 1 });
    const { holder, rerender, viewport } = mount({ camera });
    const el = viewport();
    size(el);
    act(() => {
      el.dispatchEvent(wheel({ deltaX: -100, deltaY: -100 }));
    });
    expect(holder.current?.viewPanOffset).toEqual({ x: 105, y: 105 });

    // A new brush/frame: the store says (7, 9) at 2x.
    camera.panOffset = { x: 7, y: 9 };
    camera.viewZoom = 2;
    act(() => {
      rerender({ camera, resyncKey: "other:frame" });
    });
    expect(holder.current?.viewPanOffset).toEqual({ x: 7, y: 9 });
    expect(holder.current?.viewZoom).toBe(2);
  });
});
