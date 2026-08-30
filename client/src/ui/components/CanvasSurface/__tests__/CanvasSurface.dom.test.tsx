/**
 * 🏁 GATE 2 OF REFRESH TASK 32, AS AN EXECUTABLE ASSERTION.
 *
 * The task's second gate is "the `CanvasSurface` stories render with NO store
 * provider". A grep for store imports is necessary but not sufficient — a
 * transitive import, a `useContext` call or a module-level singleton would all
 * pass a grep and still throw on mount.
 *
 * So this file MOUNTS EVERY ONE OF THE SIX STORIES, using their real args,
 * with no `StoreProvider`, no `ApplicationStore`, no `installBridge` and no
 * decorator of any kind. Nothing in the render tree can reach a store, and if
 * anything tried, these tests would throw rather than pass quietly.
 *
 * ⚠️ This is deliberately a stronger claim than the primitives' DOM snapshots
 * make. Those pin structure; this pins the ARCHITECTURE — that the largest
 * coupling site in the application (47 store members in one destructure) is
 * genuinely gone from the presentational half, not merely relocated.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { composeStories } from "@storybook/react-vite";
import * as stories from "../CanvasSurface.stories";
import { projectTypical } from "../../../../fixtures";

const composed = composeStories(stories);

/**
 * The same grid the stories size their canvases from
 * (`CanvasSurface.stories.tsx`'s `GRID`), imported rather than hard-coded so
 * the 1:1 assertion below cannot drift away from what the story actually
 * renders.
 */
const GRID_SIZE = projectTypical.objects[0]!.gridSize;

// jsdom has no 2D context, so `getContext("2d")` returns null and logs a
// "Not implemented" notice per canvas. The harness's paint callback then
// no-ops, which is FINE — these tests assert DOM STRUCTURE and props, not
// pixels (canvas painting is hash-tested against `canvasStub.ts` in
// `src/ui/canvas/render/__tests__`, which is the right tool for it). The stub
// below keeps the output readable without pretending a context exists.
beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

const NAMES = [
  "Default",
  "VariantEdit",
  "SelectionActive",
  "FrameOverlay",
  "LightGridMode",
  "ReflectionGuides",
] as const;

describe("CanvasSurface — GATE 2: renders with NO store provider", () => {
  it("exposes exactly the six stories the task requires", () => {
    expect(Object.keys(composed).sort()).toEqual([...NAMES].sort());
  });

  for (const name of NAMES) {
    it(`${name} mounts with no provider and paints the canvas stack`, () => {
      const Story = composed[name];
      // No wrapper. No context. If CanvasSurface reached for a store, this
      // line would throw.
      const { container } = render(<Story />);

      // The block, the viewport, the transform wrapper and the editable
      // surface are always present.
      expect(container.querySelector(".canvas")).not.toBeNull();
      expect(container.querySelector(".canvas__viewport")).not.toBeNull();
      expect(container.querySelector(".canvas__layout")).not.toBeNull();
      expect(container.querySelector(".canvas__surface")).not.toBeNull();
    });
  }

  it("mounts the frame-overlay canvas only when asked to", () => {
    // ⚠️ Counts the CONDITIONAL overlays only. TWO canvases also carry
    // `.canvas__overlay` — the hover marker and the reflection guides — and
    // take that class purely for its positioning, but both are mounted
    // unconditionally. A bare `.canvas__overlay` count would therefore always
    // be two higher and would stop measuring what this test is about.
    const conditional = (c: HTMLElement) =>
      c.querySelectorAll(
        ".canvas__overlay:not(.canvas__overlay--hover):not(.canvas__overlay--reflection)",
      ).length;

    const withOverlay = render(<composed.FrameOverlay />);
    expect(conditional(withOverlay.container)).toBe(1);

    const without = render(<composed.Default />);
    expect(conditional(without.container)).toBe(0);
  });

  it("mounts the hover-marker canvas unconditionally", () => {
    // Hover can begin at any moment without a mode being entered first —
    // an Apple Pencil starts reporting as the hand approaches. Mounting the
    // canvas in response to the first sample would drop that sample while
    // React committed, so it is always present.
    const { container } = render(<composed.Default />);
    expect(container.querySelectorAll(".canvas__overlay--hover")).toHaveLength(
      1,
    );
  });

  it("mounts the reflection guide canvas unconditionally, LAST in the frame", () => {
    // Two claims, and the second is the load-bearing one.
    //
    // Unconditional, for the same reason as the hover marker: the dash ticker
    // repaints through `useCanvasRender(...).invalidate()`, which needs a
    // context to already exist. Mounting behind a `hasReflectionLines` flag
    // would drop the first frame of every guide.
    //
    // LAST, because these siblings are absolutely positioned and DOM order is
    // z-order. The guides say where the next stroke will be mirrored, so a
    // semi-transparent trace or onion overlay painted over them would hide the
    // one thing the tool exists to communicate. `FrameOverlay` is the story to
    // assert against precisely because it mounts a competing overlay.
    const { container } = render(<composed.FrameOverlay />);
    const frame = container.querySelector(".canvas__frame");
    expect(frame).not.toBeNull();

    const guides = container.querySelectorAll(".canvas__overlay--reflection");
    expect(guides).toHaveLength(1);
    expect(frame?.lastElementChild).toBe(guides[0]);
  });

  it("does not let the reflection canvas swallow pointer events", () => {
    // The editable surface is the ONLY canvas that takes input. A guide layer
    // stacked above everything would otherwise intercept every stroke — the
    // exact failure the `pointer-events: none` inline style prevents.
    const { container } = render(<composed.ReflectionGuides />);
    const guides = container.querySelector<HTMLElement>(
      ".canvas__overlay--reflection",
    );
    expect(guides?.style.pointerEvents).toBe("none");
  });

  it("applies the view transform and the cursor from props alone", () => {
    // ⚠️ `scale(12)`, not `scale(1)` (plan 05, task 02). The scale factor is
    // `combinedScale` — `zoom * viewZoom` in the app — and it is now the ONLY
    // magnification in the system: the canvases below are 1:1 with the pixel
    // data, so this one declaration replaced allocating a `zoom`-times-larger
    // backing store per canvas. Until 2026-08-30 the prop was `viewZoom`
    // alone, and the story's `1` was the view scale with the shared pixel
    // scale already baked into the backing store.
    //
    // Derived from the story's own inputs rather than pasted from the DOM:
    // `Default` spreads `baseSurface` unmodified, which sets
    // `viewPanOffset: {x: 24, y: 24}` and `combinedScale: ZOOM` where
    // `ZOOM = 12`. If either story constant moves, this must move with it.
    const { container } = render(<composed.Default />);
    const layout = container.querySelector<HTMLElement>(".canvas__layout");
    const surface = container.querySelector<HTMLElement>(".canvas__surface");
    expect(layout?.style.transform).toBe("translate(24px, 24px) scale(12)");
    expect(layout?.style.transformOrigin).toBe("0 0");
    expect(surface?.style.cursor).toBe("crosshair");

    // The point of the whole task: the backing store did NOT grow with the
    // scale. 12x magnification, one device pixel per cell.
    expect(surface?.getAttribute("width")).toBe(String(GRID_SIZE.width));
    expect(surface?.getAttribute("height")).toBe(String(GRID_SIZE.height));
  });

  it("sizes the variant-edit canvas to the EXPANDED view, not the grid", () => {
    // The union of the object's bounds and the offset variant's — the whole
    // reason `useCanvasGeometry` distinguishes `gridWidth` from `viewWidth`.
    const grid = render(<composed.Default />);
    const variant = render(<composed.VariantEdit />);
    const gridW = Number(
      grid.container.querySelector(".canvas__surface")?.getAttribute("width"),
    );
    const variantW = Number(
      variant.container
        .querySelector(".canvas__surface")
        ?.getAttribute("width"),
    );
    expect(variantW).toBeGreaterThan(gridW);
  });
});
