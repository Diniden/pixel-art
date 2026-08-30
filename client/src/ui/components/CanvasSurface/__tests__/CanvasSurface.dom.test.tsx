/**
 * 🏁 GATE 2 OF REFRESH TASK 32, AS AN EXECUTABLE ASSERTION.
 *
 * The task's second gate is "the `CanvasSurface` stories render with NO store
 * provider". A grep for store imports is necessary but not sufficient — a
 * transitive import, a `useContext` call or a module-level singleton would all
 * pass a grep and still throw on mount.
 *
 * So this file MOUNTS EVERY ONE OF THE FIVE STORIES, using their real args,
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

const composed = composeStories(stories);

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
] as const;

describe("CanvasSurface — GATE 2: renders with NO store provider", () => {
  it("exposes exactly the five stories the task requires", () => {
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
    // ⚠️ Counts the CONDITIONAL overlays only. The hover marker also carries
    // `.canvas__overlay` — it takes that class for its positioning — but is
    // mounted unconditionally, so a bare `.canvas__overlay` count would
    // always be one higher and would stop measuring what this test is about.
    const conditional = (c: HTMLElement) =>
      c.querySelectorAll(".canvas__overlay:not(.canvas__overlay--hover)")
        .length;

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

  it("applies the view transform and the cursor from props alone", () => {
    const { container } = render(<composed.Default />);
    const layout = container.querySelector<HTMLElement>(".canvas__layout");
    const surface = container.querySelector<HTMLElement>(".canvas__surface");
    expect(layout?.style.transform).toBe("translate(24px, 24px) scale(1)");
    expect(layout?.style.transformOrigin).toBe("0 0");
    expect(surface?.style.cursor).toBe("crosshair");
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
