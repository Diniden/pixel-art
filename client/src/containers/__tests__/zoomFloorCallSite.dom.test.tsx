/**
 * The main canvas passes its DERIVED zoom floor (plan 09, task 04 → applied
 * in task 11).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THIS PINS, AND WHY THE EXISTING SUITE DOES NOT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Task 04 replaced the hard-coded `viewZoom >= 0.25` with a floor derived
 * from the content box — `viewZoomFloor(w, h) = min(1, 50 / longest)` — so a
 * sprite of any size can be zoomed out to a ~50px thumbnail. It is covered
 * thoroughly in `stores/ui/__tests__/viewZoomFloor.test.ts`: the helper's
 * arithmetic, and both stores honouring a supplied floor.
 *
 * ⚠️ EVERY ONE OF THOSE TESTS PASSED WHILE THE MAIN CANVAS STILL CLAMPED AT
 * 0.25. `setViewZoom(zoom, floor = 0.25)` defaults its second parameter,
 * because stores may not read the DOM; task 04 wired
 * `LightingCanvasContainer` and was forbidden from `CanvasContainer.tsx`, so
 * the pixel studio's commit call kept the default and the user's "zoom out
 * further" request was half delivered on the pane they actually draw in.
 *
 * A defaulted parameter is invisible to a suite that tests the callee. So
 * what is pinned here is the ARGUMENT: that `CanvasContainer` supplies a
 * second argument at all, and that it is the derived value rather than the
 * legacy constant.
 *
 * ── How the commit is reached ─────────────────────────────────────────────
 *
 * `onCommitViewZoom` fires from `useCanvasViewport`'s trailing 150 ms
 * debounce, which pan and zoom share (they must be committed together — a pan
 * offset only means anything at the scale it was measured against). So the
 * test performs a real middle-button pan and advances fake timers past
 * `PAN_COMMIT_MS`.
 *
 * ⚠️ The `getBoundingClientRect` stub is load-bearing for the same reason it
 * is in `selectionTouch.dom.test.tsx`, and additionally here: `contentWidth`
 * and `contentHeight` are what the floor is DERIVED FROM, so a zero-size box
 * would make the expected and actual values agree at a degenerate value.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { runInAction } from "mobx";

import { ApplicationStore } from "@/stores/ApplicationStore";
import { StoreProvider } from "@/stores/context";
import { CanvasContainer } from "@/containers/CanvasContainer";
import { viewZoomFloor } from "@/ui/hooks/useCanvasViewport";
import { createStubContext } from "@test/canvasStub";
import type { StubContext } from "@test/canvasStub";
import type { Layer, PixelData, Pixel, Project } from "@/types";

/** Big enough that the derived floor is FAR below 0.25 and unmistakable. */
const W = 256;
const H = 256;
const CELL_PX = 4;

const RED: Pixel = { r: 255, g: 0, b: 0, a: 255 };

function blankGrid(): PixelData[][] {
  return Array.from({ length: H }, () =>
    Array.from({ length: W }, () => ({
      color: { r: 0, g: 0, b: 0, a: 0 },
      normal: 0,
      height: 0,
    })),
  );
}

function mkProject(): Project {
  const layers: Layer[] = [
    { id: "l-1", name: "l-1", visible: true, pixels: blankGrid() },
  ];
  return {
    version: "1.1.0",
    objects: [
      {
        id: "obj-1",
        name: "Object 1",
        gridSize: { width: W, height: H },
        frames: [{ id: "frame-1", name: "Frame 1", layers }],
      },
    ],
    palettes: [{ id: "pal-1", name: "Palette", colors: [RED] }],
    variants: [],
    uiState: {
      selectedObjectId: "obj-1",
      selectedFrameId: "frame-1",
      selectedLayerId: "l-1",
      zoom: CELL_PX,
      panOffset: { x: 0, y: 0 },
    },
  } as unknown as Project;
}

let app: ApplicationStore;
let consoleError: ReturnType<typeof vi.spyOn>;
let contexts: WeakMap<HTMLCanvasElement, StubContext>;

beforeEach(() => {
  vi.useFakeTimers();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});

  contexts = new WeakMap();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      const existing = contexts.get(this);
      if (existing) return existing as unknown as CanvasRenderingContext2D;
      const ctx = createStubContext(this.width || 1, this.height || 1);
      contexts.set(this, ctx);
      return ctx as unknown as CanvasRenderingContext2D;
    } as unknown as typeof HTMLCanvasElement.prototype.getContext,
  );

  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () =>
      ({
        left: 0,
        top: 0,
        right: W * CELL_PX,
        bottom: H * CELL_PX,
        width: W * CELL_PX,
        height: H * CELL_PX,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  );

  app = new ApplicationStore({ autoSaveEnabled: false });
});

afterEach(() => {
  app.dispose();
  consoleError.mockRestore();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Mount, pan with the middle button, and let the trailing commit fire. */
function panAndCommit(): { surface: HTMLElement } {
  const { container } = render(
    <StoreProvider store={app}>
      <CanvasContainer />
    </StoreProvider>,
  );
  act(() => {});
  const surface = container.querySelector<HTMLElement>(".canvas__surface");
  if (!surface) throw new Error("no .canvas__surface — the container changed");

  /* ⚠️ ONE `act()` PER EVENT, not one around all three. `handleMouseDown`
     sets `isPanning` with `useState`, and `handleMouseMove` reads it from the
     render closure — so a move batched into the same `act()` as the press
     still sees `isPanning === false` and the pan never starts. Measured: the
     three-in-one form produced zero commits and a `panOffset` of {0,0}. */
  act(() => {
    // Middle button pans (`handleMouseDown`: `e.button === 1`).
    fireEvent.mouseDown(surface, { button: 1, clientX: 100, clientY: 100 });
  });
  act(() => {
    fireEvent.mouseMove(surface, { button: 1, clientX: 140, clientY: 130 });
  });
  act(() => {
    fireEvent.mouseUp(window, { button: 1, clientX: 140, clientY: 130 });
  });
  act(() => {
    // Past `PAN_COMMIT_MS` (150), which pan and view zoom share.
    vi.advanceTimersByTime(300);
  });
  return { surface };
}

describe("⭐⭐ CanvasContainer passes the derived zoom floor, not the default", () => {
  it("⭐⭐ calls setViewZoom with a SECOND argument", () => {
    // The bare shape of the defect: before task 11 the call was
    // `camera.setViewZoom(z)` and the store's `floor = 0.25` default applied.
    runInAction(() => {
      app.adoptProject(mkProject());
      app.domain.loadState = "loaded";
    });
    const setViewZoom = vi.spyOn(app.ui.viewport, "setViewZoom");

    panAndCommit();

    // The pan must actually have happened, or the commit assertions below
    // would be vacuous — this is the guard against a silently inert gesture.
    expect(app.ui.viewport.panOffset).not.toEqual({ x: 0, y: 0 });
    expect(setViewZoom).toHaveBeenCalled();
    /* ⚠️ Indexed, not `.at(-1)` — the client's `tsconfig` lib predates
       `Array.prototype.at` and `bun run typecheck` rejects it, though vitest
       runs it happily. Measured on the gate. */
    const calls = setViewZoom.mock.calls;
    const call = calls[calls.length - 1];
    expect(call).toHaveLength(2);
    expect(call[1]).toBeTypeOf("number");
  });

  it("⭐⭐ and that argument is the DERIVED floor, far below the legacy 0.25", () => {
    runInAction(() => {
      app.adoptProject(mkProject());
      app.domain.loadState = "loaded";
    });
    const setViewZoom = vi.spyOn(app.ui.viewport, "setViewZoom");

    panAndCommit();

    const calls = setViewZoom.mock.calls;
    const floor = calls[calls.length - 1][1] as number;
    // Computed from the same helper the container uses, against the same
    // content box the rect stub reports — so this asserts agreement, not a
    // magic number that would need editing if MIN_CANVAS_SCREEN_PX moved.
    expect(floor).toBeCloseTo(viewZoomFloor(W * CELL_PX, H * CELL_PX), 10);
    // And the user-visible claim: a 1024px composition can now shrink well
    // past the old limit. If a future edit reverts to the default, this reads
    // 0.25 and fails.
    expect(floor).toBeLessThan(0.25);
  });

  it("the store then actually accepts a zoom below 0.25", () => {
    // The consequence, through the real store rather than the spy: without the
    // second argument this clamps back to 0.25.
    runInAction(() => {
      app.adoptProject(mkProject());
      app.domain.loadState = "loaded";
    });

    const floor = viewZoomFloor(W * CELL_PX, H * CELL_PX);
    runInAction(() => app.ui.viewport.setViewZoom(floor, floor));

    expect(app.ui.viewport.viewZoom).toBeCloseTo(floor, 10);
    expect(app.ui.viewport.viewZoom).toBeLessThan(0.25);
  });
});
