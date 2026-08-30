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
 * ⚠️ There used to be a companion file next door for the floating
 * `LightingPreviewPanel`. That panel was retired on 2026-08-29 (MASTER D7)
 * when the lit composite became a workspace pane, so this file is now the
 * whole of the lighting studio's `ui/` purity gate.
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
    // ⚠️ `scale(14)`, not `scale(1)`. The canvases are 1:1 with the pixel data
    // (task 08), so the shared pixel scale reaches the DOM ONLY here. A
    // regression to `scale(viewZoom)` would render the sprite at 1/14th size
    // — visible, but the arithmetic is what pins it.
    expect(surface?.style.transform).toBe("translate(24px, 24px) scale(14)");
    expect(surface?.style.transformOrigin).toBe("0 0");
  });

  it("Zoomed multiplies the view zoom INTO the pixel scale, never replaces it", () => {
    const { container } = render(<composed.Zoomed />);
    const surface = container.querySelector<HTMLElement>(
      ".lighting-canvas__surface",
    );
    // 14 * 1.75. This is the assertion that would catch someone passing
    // `viewZoom` alone into `combinedScale` — the exact shape of the bug the
    // old pre-scaled backing store used to hide.
    expect(surface?.style.transform).toBe("translate(0px, 0px) scale(24.5)");
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

  it("sizes both canvases 1:1 WITH THE PIXEL DATA, not `cells * zoom`", () => {
    const { container } = render(<composed.Default />);
    const canvases = container.querySelectorAll("canvas");
    expect(canvases.length).toBe(2);
    for (const canvas of canvases) {
      // 16 grid cells → 16 device pixels. It was 224 (16 × 14) before task 08.
      expect(canvas.getAttribute("width")).toBe("16");
      expect(canvas.getAttribute("height")).toBe("16");
    }
  });

  /**
   * ⚠️ THE HEADLINE CLAIM OF TASK 08, AS ARITHMETIC.
   *
   * The sprite occupies the same screen box it always did — `cellWidth * zoom`
   * — while the backing store it is drawn into shrank by `zoom²`. Both halves
   * have to be asserted together: shrinking the canvas alone would be a bug
   * (a sprite rendered at 1/14th size), and the transform alone would be a
   * no-op. This is the pair.
   */
  it("keeps the ON-SCREEN box identical while the backing store drops by zoom²", () => {
    const { container } = render(<composed.Default />);
    const canvas = container.querySelector<HTMLCanvasElement>(
      ".lighting-canvas__edit-canvas",
    );
    const surface = container.querySelector<HTMLElement>(
      ".lighting-canvas__surface",
    );

    const backing = Number(canvas?.getAttribute("width"));
    const scale = Number(
      /scale\(([\d.]+)\)/.exec(surface?.style.transform ?? "")?.[1],
    );

    // On screen: 16 × 14 = 224 CSS px, byte-identical to the pre-task-08 box.
    expect(backing * scale).toBe(224);
    // In memory: 16², not 224². A 196× reduction at this zoom, and 2,500× at
    // the ceiling of 50 — which is what makes a 256×224 sprite allocatable at
    // all (546 MB → 224 KB).
    expect(backing * backing).toBe(256);
  });
});

/**
 * ⚠️ THE SVG CHROME (plan 05, D5, task 08).
 *
 * The grid and the brush outline left the canvas because BOTH fail SILENTLY at
 * 1:1 — `strokeGrid` puts one line per pixel column and paints a flat wash of
 * colour over the whole canvas, and `strokeBrushOutlines` sizes each rect
 * `zoom - 1` and strokes 0×0 rectangles that render nothing at all. Neither
 * throws, so only an assertion on the DOM catches a regression to either.
 */
describe("LightingSurface — the SVG chrome", () => {
  it("renders the grid as ONE path inside the transformed surface", () => {
    const { container } = render(<composed.Default />);

    const svg = container.querySelector("svg.lighting-canvas__svg");
    expect(svg).not.toBeNull();
    // One user unit = one CELL, matching the 1:1 canvases. A viewBox in device
    // pixels would put every line at the wrong seam.
    expect(svg?.getAttribute("viewBox")).toBe("0 0 16 16");

    const grid = container.querySelector("path.lighting-canvas__svg-grid");
    expect(grid).not.toBeNull();
    expect(grid?.getAttribute("d")?.length ?? 0).toBeGreaterThan(0);

    // Inside the TRANSFORMED surface — it must scale and pan with the sprite,
    // unlike the view controls, which must not.
    const surface = container.querySelector(".lighting-canvas__surface");
    expect(surface?.contains(svg!)).toBe(true);
  });

  it("gives every chrome stroke `non-scaling-stroke` — the screen-constant hairline", () => {
    const { container } = render(<composed.Default />);
    const paths = container.querySelectorAll("svg.lighting-canvas__svg path");
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      // Without this the stroke width is multiplied by `combinedScale`, so a
      // 1px grid line is 14px here and 200px at the ceiling.
      expect(path.getAttribute("vector-effect")).toBe("non-scaling-stroke");
    }
  });

  it("the grid follows `lightGridMode` — the two themes stroke different colours", () => {
    const dark = render(<composed.Default />);
    const light = render(<composed.LightGridMode />);

    const strokeOf = (r: ReturnType<typeof render>) =>
      r.container
        .querySelector("path.lighting-canvas__svg-grid")
        ?.getAttribute("stroke");

    expect(strokeOf(dark)).not.toBeNull();
    expect(strokeOf(light)).not.toBeNull();
    // The measured rule: white 5% dark, black 8% light (`gridOverlayAttrs`).
    expect(strokeOf(dark)).not.toBe(strokeOf(light));
  });

  it("BrushOverlay draws the outline as a path — the canvas has only the fill", () => {
    const { container } = render(<composed.BrushOverlay />);
    const paths = container.querySelectorAll("svg.lighting-canvas__svg path");
    // The grid, plus the brush outline.
    expect(paths.length).toBe(2);
    const outline = Array.from(paths).find(
      (p) => !p.classList.contains("lighting-canvas__svg-grid"),
    );
    expect(outline?.getAttribute("d")?.length ?? 0).toBeGreaterThan(0);
  });

  it("renders no brush-outline path when nothing is hovered", () => {
    const { container } = render(<composed.Default />);
    const paths = container.querySelectorAll("svg.lighting-canvas__svg path");
    expect(paths.length).toBe(1);
    expect(paths[0]?.classList.contains("lighting-canvas__svg-grid")).toBe(true);
  });

  it("the SVG never takes pointer events — the edit canvas is the only input surface", () => {
    const { container } = render(<composed.Default />);
    const svg = container.querySelector<SVGElement>(".lighting-canvas__svg");
    expect(svg).not.toBeNull();
    // Stacked above both canvases by source order, so without this it would
    // swallow every stroke. The rule is in the stylesheet; this pins that the
    // element is the LAST child of the stack, which is what makes it matter.
    const stack = container.querySelector(".lighting-canvas__stack");
    expect(stack?.lastElementChild).toBe(svg);
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
