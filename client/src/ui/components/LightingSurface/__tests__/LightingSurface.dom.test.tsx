/**
 * 🏁 GATE 2 OF REFRESH TASK 33, AS AN EXECUTABLE ASSERTION.
 *
 * The task's second gate is "nothing in `ui/` imports a store". A grep is
 * necessary but not sufficient — a transitive import, a `useContext` call or a
 * module-level singleton would all pass a grep and still throw on mount.
 *
 * So this file MOUNTS EVERY ONE OF THE `LightingSurface` STORIES, using
 * their real args, with no `StoreProvider`, no `ApplicationStore`, no
 * `installBridge` and no decorator of any kind. `LightingCanvas.tsx`
 * destructured 14 store members; if one had survived into the presentational
 * half, these tests would throw rather than pass quietly.
 *
 * ⚠️ The `LightingPreviewPanel` stories are covered by their own file next
 * door, and they are the stronger case: that panel is where a persistence KEY
 * could have leaked in.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { composeStories } from "@storybook/react-vite";
import * as stories from "../LightingSurface.stories";

const composed = composeStories(stories);

// jsdom has no 2D context, so `getContext("2d")` returns null and the harness's
// paint callback no-ops. That is FINE — these tests assert DOM STRUCTURE and
// props, not pixels; the pixels are hash-tested in
// `src/ui/canvas/render/__tests__` against `canvasStub.ts`, which is the right
// tool for it.
beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

const NAMES = [
  "Default",
  "LightGridMode",
  "HeightMode",
  "BrushOverlay",
  "Zoomed",
  "Empty",
  "WithViewControls",
] as const;

describe("LightingSurface — GATE 2: renders with NO store provider", () => {
  it("exposes exactly the stories the task requires", () => {
    expect(Object.keys(composed).sort()).toEqual([...NAMES].sort());
  });

  for (const name of NAMES) {
    it(`${name} mounts with no provider`, () => {
      const Story = composed[name];
      // No wrapper. No context. If `LightingSurface` reached for a store, this
      // line would throw.
      const { container } = render(<Story />);
      expect(container.querySelector(".lighting-canvas")).not.toBeNull();
    });
  }
});

describe("LightingSurface — the markup, from props alone", () => {
  it("renders both canvases, the viewport and the info bar", () => {
    const { container } = render(<composed.Default />);
    expect(
      container.querySelector(".lighting-canvas__viewport"),
    ).not.toBeNull();
    expect(container.querySelector(".lighting-canvas__stack")).not.toBeNull();
    expect(
      container.querySelector(".lighting-canvas__edit-canvas"),
    ).not.toBeNull();
    expect(container.querySelector(".lighting-canvas__overlay")).not.toBeNull();
    expect(container.querySelector(".lighting-canvas__info")).not.toBeNull();
  });

  it("applies the view transform from props", () => {
    const { container } = render(<composed.Default />);
    const surface = container.querySelector<HTMLElement>(
      ".lighting-canvas__surface",
    );
    expect(surface?.style.transform).toBe("translate(24px, 24px) scale(1)");
    expect(surface?.style.transformOrigin).toBe("0 0");
  });

  it("Zoomed carries its own scale, not the default", () => {
    const { container } = render(<composed.Zoomed />);
    const surface = container.querySelector<HTMLElement>(
      ".lighting-canvas__surface",
    );
    expect(surface?.style.transform).toBe("translate(0px, 0px) scale(1.75)");
  });

  it("labels the info bar from `editMode` — 'Normals' vs 'Height'", () => {
    const normals = render(<composed.Default />);
    expect(
      normals.container.querySelector(".lighting-canvas__info")?.textContent,
    ).toContain("Normals");

    const height = render(<composed.HeightMode />);
    expect(
      height.container.querySelector(".lighting-canvas__info")?.textContent,
    ).toContain("Height");
  });

  it("the `empty` branch renders the placeholder and NO canvas", () => {
    const { container } = render(<composed.Empty />);
    expect(container.querySelector(".lighting-canvas__empty")).not.toBeNull();
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelector(".lighting-canvas__info")).toBeNull();
  });

  it("sizes both canvases to the backing-store props", () => {
    const { container } = render(<composed.Default />);
    for (const canvas of container.querySelectorAll("canvas")) {
      expect(canvas.getAttribute("width")).toBe("224"); // 16 * 14
      expect(canvas.getAttribute("height")).toBe("224");
    }
  });
});

/**
 * ⚠️ THE POSITIONING INVARIANT, PINNED.
 *
 * `canvas-view-controls` is `position: absolute`, so which ancestor it resolves
 * against is decided entirely by the DOM. Two things must hold and neither is
 * visible from the CSS alone:
 *
 *  1. the cluster is inside `.lighting-canvas__viewport` — the element that is
 *     `position: relative`, so each pane of a split anchors its own controls;
 *  2. the cluster is NOT inside `.lighting-canvas__surface` — that element
 *     carries the pan/zoom `transform`, and a control there would be panned and
 *     scaled with the sprite.
 *
 * A refactor that moves the slot one level in either direction still renders
 * something plausible in jsdom; only an ancestor assertion catches it.
 */
describe("LightingSurface — the `viewControls` slot", () => {
  it("renders the cluster inside the viewport, NOT inside the transformed surface", () => {
    const { container } = render(<composed.WithViewControls />);

    const controls = container.querySelector(".canvas-view-controls");
    expect(controls).not.toBeNull();

    const viewport = container.querySelector(".lighting-canvas__viewport");
    const surface = container.querySelector(".lighting-canvas__surface");
    expect(viewport).not.toBeNull();
    expect(surface).not.toBeNull();

    expect(viewport?.contains(controls!)).toBe(true);
    expect(surface?.contains(controls!)).toBe(false);
    // Direct child of the viewport, and the LAST one — so it paints over the
    // sprite rather than under it.
    expect(controls?.parentElement).toBe(viewport);
    expect(viewport?.lastElementChild).toBe(controls);
  });

  it("renders no cluster when the prop is omitted — the DOM is unchanged", () => {
    const { container } = render(<composed.Default />);
    expect(container.querySelector(".canvas-view-controls")).toBeNull();
    // The viewport's only child is still the transformed surface.
    const viewport = container.querySelector(".lighting-canvas__viewport");
    expect(viewport?.children.length).toBe(1);
    expect(viewport?.firstElementChild?.className).toBe(
      "lighting-canvas__surface",
    );
  });

  it("the `empty` branch renders no controls", () => {
    const { container } = render(<composed.Empty />);
    expect(container.querySelector(".canvas-view-controls")).toBeNull();
    expect(container.querySelector(".lighting-canvas__viewport")).toBeNull();
  });
});
