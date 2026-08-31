/**
 * 🏁 GATE 2 OF REFRESH TASK 32, AS AN EXECUTABLE ASSERTION — plus the plan-05
 * task-04 layer-stack proofs.
 *
 * The task's second gate is "the `CanvasSurface` stories render with NO store
 * provider". A grep for store imports is necessary but not sufficient — a
 * transitive import, a `useContext` call or a module-level singleton would all
 * pass a grep and still throw on mount.
 *
 * So this file MOUNTS EVERY ONE OF THE STORIES, using their real args, with no
 * `StoreProvider`, no `ApplicationStore`, no `installBridge` and no decorator
 * of any kind. Nothing in the render tree can reach a store, and if anything
 * tried, these tests would throw rather than pass quietly.
 *
 * ⚠️ This is deliberately a stronger claim than the primitives' DOM snapshots
 * make. Those pin structure; this pins the ARCHITECTURE — that the largest
 * coupling site in the application (47 store members in one destructure) is
 * genuinely gone from the presentational half, not merely relocated.
 *
 * ── The second half: the per-layer canvas stack (plan 05, task 04) ─────────
 *
 * The `describe` block at the bottom drives `CanvasSurface` DIRECTLY rather
 * than through a story, because what it asserts is about MOUNT and UNMOUNT
 * lifecycles and about element IDENTITY across a re-render — neither of which
 * a story's static args can express.
 *
 * The load-bearing one is the reorder test. `Layer.id` is stable across
 * `moveLayer`, so React's keyed reconciliation is supposed to MOVE the DOM
 * node rather than recreate it — which is what keeps the painted bitmap alive
 * and is the entire reason no manual canvas pool exists. Asserting "three
 * canvases, in the new order" would pass even if React had thrown all three
 * away and made new ones. So the test holds the actual element references from
 * before the reorder and asserts they are the SAME OBJECTS afterwards. That is
 * the pooling proof, and nothing weaker is.
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { composeStories } from "@storybook/react-vite";
import { createRef } from "react";
import type { RefObject } from "react";
import * as stories from "../CanvasSurface.stories";
import { CanvasSurface } from "../CanvasSurface";
import type { CanvasSurfaceProps } from "../CanvasSurface";
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
  "LayerStack",
  "SvgChrome",
] as const;

describe("CanvasSurface — GATE 2: renders with NO store provider", () => {
  it("exposes exactly the stories the task requires", () => {
    expect(Object.keys(composed).sort()).toEqual([...NAMES].sort());
  });

  for (const name of NAMES) {
    it(`${name} mounts with no provider and paints the canvas stack`, () => {
      const Story = composed[name];
      // No wrapper. No context. If CanvasSurface reached for a store, this
      // line would throw.
      const { container } = render(<Story />);

      // The block, the viewport, the transform wrapper and the pointer
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

  it("mounts the reflection guide canvas unconditionally", () => {
    // Unconditional, for the same reason as the hover marker: the dash ticker
    // repaints through `useCanvasRender(...).invalidate()`, which needs a
    // context to already exist. Mounting behind a `hasReflectionLines` flag
    // would drop the first frame of every guide.
    //
    // ⚠️ It is no longer LAST in the frame — the SVG chrome is (see below).
    // The canvas is retained because `CanvasContainer.renderReflection` still
    // paints into it; `reflectionGuides` is its vector replacement, and task
    // 05 retires the raster surface. Removing it here first would leave that
    // painter writing into `null`.
    const { container } = render(<composed.FrameOverlay />);
    expect(
      container.querySelectorAll(".canvas__overlay--reflection"),
    ).toHaveLength(1);
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

/* ══════════════════════════════════════════════════════════════════════════ *
 * Plan 05, task 04 — the per-layer canvas stack and the SVG chrome mount
 * ══════════════════════════════════════════════════════════════════════════ */

const SCALE = 8;

/**
 * The minimum `CanvasSurface` needs, with no layers and no chrome.
 *
 * Every ref is a bare `createRef` — nothing paints in these tests, and the
 * point is the DOM, not the pixels.
 */
function baseProps(): CanvasSurfaceProps {
  const ref = <T,>() => createRef<T>() as RefObject<T | null>;
  return {
    canvasRef: ref<HTMLCanvasElement>(),
    overlayCanvasRef: ref<HTMLCanvasElement>(),
    frameOverlayCanvasRef: ref<HTMLCanvasElement>(),
    frameTraceOverlayCanvasRef: ref<HTMLCanvasElement>(),
    hoverCanvasRef: ref<HTMLCanvasElement>(),
    containerRef: ref<HTMLDivElement>(),
    cellWidth: 24,
    cellHeight: 32,
    viewPanOffset: { x: 0, y: 0 },
    combinedScale: SCALE,
    cursor: "crosshair",
    showReferenceOverlay: false,
    showFrameOverlay: false,
    showFrameTraceOverlay: false,
    onMouseDown: () => {},
    onMouseMove: () => {},
    onMouseUp: () => {},
    onMouseLeave: () => {},
    onTouchStart: () => {},
    onTouchMove: () => {},
    onTouchEnd: () => {},
  };
}

const layerNodes = (c: HTMLElement) =>
  Array.from(c.querySelectorAll<HTMLCanvasElement>(".canvas__layer"));

describe("CanvasSurface — the per-layer canvas stack (plan 05, D3)", () => {
  it("renders exactly one canvas per id, in the order given", () => {
    const { container } = render(
      <CanvasSurface {...baseProps()} layerIds={["a", "b", "c"]} />,
    );
    const nodes = layerNodes(container);
    expect(nodes).toHaveLength(3);
    // Bottom → top: the first id is the bottom layer, and DOM order is
    // z-order here.
    expect(nodes.map((n) => n.dataset.layerId)).toEqual(["a", "b", "c"]);
  });

  it("sizes every layer canvas 1:1 with the pixel data", () => {
    // ⚠️ The headline claim of the whole plan. `cellWidth x cellHeight`, NOT
    // `* combinedScale` — a Landscapes layer is 224 KB at any zoom rather than
    // 546 MB at zoom 50, and `image-rendering: pixelated` handles the upscale.
    const { container } = render(
      <CanvasSurface {...baseProps()} layerIds={["a", "b"]} />,
    );
    for (const node of layerNodes(container)) {
      expect(node.getAttribute("width")).toBe("24");
      expect(node.getAttribute("height")).toBe("32");
    }
  });

  it("renders no layer wrapper content when no ids are given", () => {
    const { container } = render(<CanvasSurface {...baseProps()} />);
    expect(container.querySelector(".canvas__layers")).not.toBeNull();
    expect(layerNodes(container)).toHaveLength(0);
  });

  it("stacks the layers BELOW the pointer surface and every overlay", () => {
    // Source order IS z-order here — all the overlays share
    // `var(--z-canvas-overlay)` and the later sibling wins — so the layer
    // wrapper being the first child of `.canvas__frame` is what puts the
    // artwork underneath the chrome. A z-index would be redundant here and a
    // stylelint error.
    const { container } = render(
      <CanvasSurface {...baseProps()} layerIds={["a"]} showFrameOverlay />,
    );
    const frame = container.querySelector(".canvas__frame")!;
    const kids = Array.from(frame.children);
    const background = container.querySelector(".canvas__background")!;
    const layers = container.querySelector(".canvas__layers")!;
    const surface = container.querySelector(".canvas__surface")!;
    const hover = container.querySelector(".canvas__overlay--hover")!;

    // ⚠️ The BACKGROUND DIV is index 0 now (task 06), not the layer wrapper.
    // It also carries `--z-behind`, so it stays under the stack even if
    // `.canvas__layers` ever gains a z-index — source order alone would not
    // survive that. The chain below is unchanged.
    expect(kids.indexOf(background)).toBe(0);
    expect(kids.indexOf(background)).toBeLessThan(kids.indexOf(layers));
    expect(kids.indexOf(layers)).toBeLessThan(kids.indexOf(surface));
    expect(kids.indexOf(surface)).toBeLessThan(kids.indexOf(hover));
  });

  /* ── the background DIV (plan 05, task 06, decision D11) ───────────────── */

  it("sizes the background DIV 1:1 with the cells, like every layer canvas", () => {
    // It lives inside `.canvas__layout`, so one CSS pixel here is one grid
    // cell and the transform magnifies it — the same model the 1:1 canvases
    // use. A `cellWidth * zoom` here would put the checkerboard out of
    // register with the artwork on top of it.
    const { container } = render(<CanvasSurface {...baseProps()} />);
    const bg = container.querySelector<HTMLElement>(".canvas__background")!;
    expect(bg.style.width).toBe("24px");
    expect(bg.style.height).toBe("32px");
  });

  it("lightGridMode selects the palette by MODIFIER CLASS, not a theme object", () => {
    // D11: the colours are custom properties and `lightGridMode` is a class.
    // The JS `BackgroundTheme` must never cross this boundary.
    const dark = render(<CanvasSurface {...baseProps()} />);
    expect(
      dark.container.querySelector(".canvas__background")!.className,
    ).toBe("canvas__background");
    dark.unmount();

    const light = render(
      <CanvasSurface {...baseProps()} lightGridMode={true} />,
    );
    expect(
      light.container.querySelector(".canvas__background")!.className,
    ).toContain("canvas__background--light");
  });

  it("treats an ABSENT lightGridMode as dark, never as light", () => {
    // ⚠️ `ViewportUIStore.lightGridMode` is TRI-STATE (`undefined` = absent
    // from the project file). The container collapses it with `?? false` at
    // the read site and only a boolean arrives here — but if a future caller
    // forwards the undefined, the dark palette is the safe resolution, and it
    // is what `lightGridMode ?? false` has always produced.
    const { container } = render(
      <CanvasSurface {...baseProps()} lightGridMode={undefined} />,
    );
    expect(container.querySelector(".canvas__background")!.className).toBe(
      "canvas__background",
    );
  });

  it("⚠️ PARITY: checkerParity becomes the background-position", () => {
    // The one invariant of the background that fails SILENTLY. On a 2px tile
    // a 1px shift IS a phase flip, which is how the CSS reproduces
    // `paintCheckerboard`'s `(offsetX + px + offsetY + py) % 2` in WORLD
    // cells. A variant view scrolled an odd number of cells must keep the
    // checkerboard it had in object space.
    const { container } = render(
      <CanvasSurface {...baseProps()} checkerParity={{ x: 1, y: 0 }} />,
    );
    const bg = container.querySelector<HTMLElement>(".canvas__background")!;
    expect(bg.style.backgroundPosition).toBe("1px 0px");
  });

  it("defaults the parity to 0 0 when no offset is supplied", () => {
    const { container } = render(<CanvasSurface {...baseProps()} />);
    const bg = container.querySelector<HTMLElement>(".canvas__background")!;
    expect(bg.style.backgroundPosition).toBe("0px 0px");
  });

  it("is inert to the pointer and hidden from assistive tech", () => {
    // The pointer surface is the only element that may take input; a DIV
    // stacked in the frame that swallowed events would break every stroke.
    const { container } = render(<CanvasSurface {...baseProps()} />);
    const bg = container.querySelector(".canvas__background")!;
    expect(bg.getAttribute("aria-hidden")).toBe("true");
    expect(bg.tagName).toBe("DIV");
  });

  it("maps layerOpacity onto CSS opacity, defaulting missing ids to 1", () => {
    // D4: `layerFocusMode` dimming is a compositor property now, not a
    // per-cell alpha multiply in a six-figure loop. A layer the container has
    // not classified must stay fully opaque rather than vanish.
    const { container } = render(
      <CanvasSurface
        {...baseProps()}
        layerIds={["a", "b", "c"]}
        layerOpacity={{ a: 0.5, b: 0.7 }}
      />,
    );
    expect(layerNodes(container).map((n) => n.style.opacity)).toEqual([
      "0.5",
      "0.7",
      "1",
    ]);
  });

  it("hides a layer with display:none and keeps the element mounted", () => {
    // `display`, not unmounting: the element keeps its painted bitmap AND its
    // registered ref across a visibility toggle, so re-showing it costs
    // nothing and the container's ref map does not churn.
    const { container } = render(
      <CanvasSurface
        {...baseProps()}
        layerIds={["a", "b"]}
        layerVisible={{ a: true, b: false }}
      />,
    );
    const nodes = layerNodes(container);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]!.style.display).toBe("block");
    expect(nodes[1]!.style.display).toBe("none");
  });

  it("treats a missing layerVisible entry as visible", () => {
    const { container } = render(
      <CanvasSurface {...baseProps()} layerIds={["a"]} layerVisible={{}} />,
    );
    expect(layerNodes(container)[0]!.style.display).toBe("block");
  });

  it("registers each canvas element on mount and null on unmount", () => {
    // The container's only handle on a layer's surface. The `null` call is
    // what lets it drop stale refs when a layer is deleted — without it the
    // map leaks detached elements and a later paint writes into a node that
    // is no longer in the document.
    const calls: Array<[string, HTMLCanvasElement | null]> = [];
    const register = (id: string, el: HTMLCanvasElement | null) => {
      calls.push([id, el]);
    };

    const { container, unmount } = render(
      <CanvasSurface
        {...baseProps()}
        layerIds={["a", "b"]}
        registerLayerCanvas={register}
      />,
    );
    const mounted = layerNodes(container);
    expect(calls).toEqual([
      ["a", mounted[0]],
      ["b", mounted[1]],
    ]);

    calls.length = 0;
    unmount();
    expect(calls).toEqual([
      ["a", null],
      ["b", null],
    ]);
  });

  it("unregisters a deleted layer and leaves the map correct", () => {
    // The contract is about the END STATE of the container's map, not about
    // the exact call sequence.
    //
    // ⚠️ Deleting a layer changes the id SET, which rebuilds every cached ref
    // callback (see `useLayerRefs`), so React re-attaches the survivors too:
    // they arrive as a `null` followed immediately by their element, and the
    // element is the SAME node — no remount, no lost bitmap. The one thing
    // that must hold is that the deleted id ends at `null` and every survivor
    // ends at a live element. A structural change is a rare, user-initiated
    // event; the churn this DOES prevent is the per-render kind, pinned by
    // the reorder test below.
    const map = new Map<string, HTMLCanvasElement | null>();
    const register = (id: string, el: HTMLCanvasElement | null) => {
      if (el === null) map.delete(id);
      else map.set(id, el);
    };
    const props = baseProps();

    const { container, rerender } = render(
      <CanvasSurface
        {...props}
        layerIds={["a", "b", "c"]}
        registerLayerCanvas={register}
      />,
    );
    expect([...map.keys()].sort()).toEqual(["a", "b", "c"]);

    rerender(
      <CanvasSurface
        {...props}
        layerIds={["a", "c"]}
        registerLayerCanvas={register}
      />,
    );

    expect([...map.keys()].sort()).toEqual(["a", "c"]);
    // And the survivors' entries point at the nodes that are actually in the
    // document — a stale detached element here is the leak the `null` call
    // exists to prevent.
    const live = layerNodes(container);
    expect(map.get("a")).toBe(live[0]);
    expect(map.get("c")).toBe(live[1]);
  });

  it("does not re-register on an ordinary re-render (pan, zoom, cursor)", () => {
    // The churn case that actually happens constantly. A fresh
    // `(el) => register(id, el)` arrow in the JSX would make React detach and
    // reattach every layer canvas on every pan frame, every wheel tick and
    // every hover sample — firing a `null` through the container's ref map
    // dozens of times a second while the painter is reading from it.
    const calls: Array<[string, HTMLCanvasElement | null]> = [];
    const register = (id: string, el: HTMLCanvasElement | null) => {
      calls.push([id, el]);
    };
    const props = baseProps();

    const { rerender } = render(
      <CanvasSurface
        {...props}
        layerIds={["a", "b"]}
        registerLayerCanvas={register}
      />,
    );
    calls.length = 0;

    // A pan and a zoom, exactly as `useCanvasViewport` drives them.
    rerender(
      <CanvasSurface
        {...props}
        layerIds={["a", "b"]}
        registerLayerCanvas={register}
        viewPanOffset={{ x: 40, y: 12 }}
        combinedScale={SCALE * 2}
        cursor="grab"
      />,
    );

    expect(calls).toEqual([]);
  });

  it("REORDERS the DOM nodes without remounting them (the pooling proof)", () => {
    // ══════════════════════════════════════════════════════════════════════
    //  This is the test that justifies "do not build a manual canvas pool".
    // ══════════════════════════════════════════════════════════════════════
    //
    // `Layer.id` is stable across `LayerStore.moveLayer`, so React's keyed
    // reconciliation MOVES each node instead of destroying and recreating it.
    // That is what keeps the painted bitmap alive across a reorder — a
    // recreated canvas comes back blank and would need a full repaint of
    // every cell of every layer, which is exactly the cost this plan exists
    // to remove.
    //
    // Asserting the new ORDER is not enough: three fresh canvases in the right
    // order would pass that. So the actual element objects are captured before
    // the reorder and compared by IDENTITY afterwards.
    const props = baseProps();
    const { container, rerender } = render(
      <CanvasSurface {...props} layerIds={["a", "b", "c"]} />,
    );

    const before = layerNodes(container);
    const byId = new Map(before.map((n) => [n.dataset.layerId, n]));

    rerender(<CanvasSurface {...props} layerIds={["c", "a", "b"]} />);

    const after = layerNodes(container);
    expect(after.map((n) => n.dataset.layerId)).toEqual(["c", "a", "b"]);
    // Same objects, new positions. Identity, not equality.
    expect(after[0]).toBe(byId.get("c"));
    expect(after[1]).toBe(byId.get("a"));
    expect(after[2]).toBe(byId.get("b"));
  });

  it("does not re-register an unchanged layer on reorder", () => {
    // The corollary of the pooling proof, and the case that actually matters
    // for churn: a reorder does not change the id SET, so `useLayerRefs`'
    // memo key is unchanged, the cached closures survive, React sees the same
    // ref identity and calls nothing. A spurious `(id, null)` here would blank
    // the container's ref map mid-session — and reorders can arrive from a
    // drag, i.e. repeatedly and fast.
    const calls: Array<[string, HTMLCanvasElement | null]> = [];
    const register = (id: string, el: HTMLCanvasElement | null) => {
      calls.push([id, el]);
    };
    const props = baseProps();

    const { rerender } = render(
      <CanvasSurface
        {...props}
        layerIds={["a", "b"]}
        registerLayerCanvas={register}
      />,
    );
    calls.length = 0;

    rerender(
      <CanvasSurface
        {...props}
        layerIds={["b", "a"]}
        registerLayerCanvas={register}
      />,
    );

    expect(calls).toEqual([]);
  });
});

describe("CanvasSurface — the SVG chrome mount (plan 05, D5)", () => {
  const GRID_SPEC = {
    d: "M0 0L0 32M1 0L1 32",
    attrs: {
      stroke: "rgba(0, 0, 0, 0.08)",
      "stroke-width": 1,
      "vector-effect": "non-scaling-stroke",
      fill: "none",
    },
  } as const;

  it("mounts no SVG at all when there is no chrome to draw", () => {
    // An empty `<svg>` over the whole artwork is a compositing layer for
    // nothing.
    const { container } = render(<CanvasSurface {...baseProps()} />);
    expect(container.querySelector(".canvas__svg")).toBeNull();
  });

  it("mounts the SVG LAST inside the frame, above every raster overlay", () => {
    // The whole D5 stacking claim in one assertion. Source order is z-order,
    // so "last" is what puts the vector chrome above the trace overlays and
    // above the reflection canvas.
    const { container } = render(
      <CanvasSurface
        {...baseProps()}
        layerIds={["a"]}
        showFrameOverlay
        showFrameTraceOverlay
        grid={GRID_SPEC}
      />,
    );
    const frame = container.querySelector(".canvas__frame")!;
    const svg = container.querySelector(".canvas__svg")!;
    expect(frame.lastElementChild).toBe(svg);
  });

  it("gives the SVG a 1:1 cell-space viewBox and no pointer events", () => {
    // One SVG user unit = one grid cell, matching the 1:1 canvases, so the
    // element inherits `.canvas__layout`'s transform and every emitted
    // coordinate lands on the right cell. `pointer-events: none` keeps the
    // editable surface the only element that takes input.
    const { container } = render(
      <CanvasSurface {...baseProps()} grid={GRID_SPEC} />,
    );
    const svg = container.querySelector<SVGSVGElement>(".canvas__svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 32");
    expect(svg.getAttribute("width")).toBe("24");
    expect(svg.getAttribute("height")).toBe("32");
    expect(svg.style.pointerEvents).toBe("none");
  });

  it("spreads a path spec's attrs verbatim, non-scaling-stroke included", () => {
    // `ui/canvas/svg/` emits attributes already NAMED as the SVG attributes
    // they become, so they spread with no translation layer. If
    // `vector-effect` is missing the strokes scale with the zoom, which is the
    // bug the whole of D5 exists to fix.
    const { container } = render(
      <CanvasSurface {...baseProps()} grid={GRID_SPEC} />,
    );
    const path = container.querySelector(".canvas__svg-grid")!;
    expect(path.getAttribute("d")).toBe(GRID_SPEC.d);
    expect(path.getAttribute("vector-effect")).toBe("non-scaling-stroke");
    expect(path.getAttribute("stroke-width")).toBe("1");
    expect(path.getAttribute("fill")).toBe("none");
  });

  it("skips an overlay whose path data is empty", () => {
    const { container } = render(
      <CanvasSurface
        {...baseProps()}
        grid={GRID_SPEC}
        lasso={{ d: "", attrs: GRID_SPEC.attrs }}
      />,
    );
    // Only the grid path; the empty lasso contributes nothing.
    expect(container.querySelectorAll(".canvas__svg path")).toHaveLength(1);
  });

  it("COUNTER-SCALES the origin cross by 1/combinedScale", () => {
    // ══════════════════════════════════════════════════════════════════════
    //  HANDOFF finding 1 — the one overlay that cannot be a cell-space path.
    // ══════════════════════════════════════════════════════════════════════
    //
    // `vector-effect: non-scaling-stroke` exempts stroke WIDTH from the
    // transform. It does NOT exempt geometry. `ORIGIN_CROSS_SIZE = 12` emitted
    // as 12 user units renders 600 screen px at zoom 50 — the original bug in
    // new clothes. `originCrossOverlay` therefore returns the centre in CELL
    // space and the arm length and radius in SCREEN px, and this component
    // wraps them in a group scaled by `1 / combinedScale`, inside which one
    // unit is one screen pixel again.
    const { container } = render(
      <CanvasSurface
        {...baseProps()}
        originCross={{
          centerX: 12,
          centerY: 16,
          armLength: 12,
          radius: 3,
          arms: { d: "M-12 0H12M0 -12V12", attrs: GRID_SPEC.attrs },
          circle: { cx: 0, cy: 0, r: 3, attrs: GRID_SPEC.attrs },
        }}
      />,
    );
    const g = container.querySelector(".canvas__svg-origin")!;
    // `SCALE` is 8, so the counter-scale is 0.125 exactly.
    expect(g.getAttribute("transform")).toBe("translate(12 16) scale(0.125)");
    // The arms and the dot are RELATIVE to that group's own origin.
    expect(g.querySelector("path")?.getAttribute("d")).toBe(
      "M-12 0H12M0 -12V12",
    );
    expect(g.querySelector("circle")?.getAttribute("r")).toBe("3");
  });

  it("does not divide by a zero combinedScale", () => {
    // A transient 0 (or a missing) scale would emit `scale(Infinity)` and
    // blank the entire chrome overlay. Degrading to 1 keeps it visible.
    const { container } = render(
      <CanvasSurface
        {...baseProps()}
        combinedScale={0}
        originCross={{
          centerX: 1,
          centerY: 2,
          armLength: 12,
          radius: 3,
          arms: { d: "M-12 0H12", attrs: GRID_SPEC.attrs },
          circle: { cx: 0, cy: 0, r: 3, attrs: GRID_SPEC.attrs },
        }}
      />,
    );
    expect(
      container.querySelector(".canvas__svg-origin")?.getAttribute("transform"),
    ).toBe("translate(1 2) scale(1)");
  });

  it("strokes the marching ants twice, out of phase", () => {
    // Two passes over the SAME rectangle, half a dash period apart — that
    // phase difference is what reads as motion even though nothing animates.
    // ⚠️ The inner rect is deliberately NOT inset: 1 device px is one whole
    // CELL at 1:1, and `width - 2` inverts below three cells.
    const outer = {
      d: "M3 3h8v7h-8Z",
      attrs: { ...GRID_SPEC.attrs, "stroke-dasharray": "4 4" },
    } as const;
    const inner = {
      d: "M3 3h8v7h-8Z",
      attrs: {
        ...GRID_SPEC.attrs,
        "stroke-dasharray": "4 4",
        "stroke-dashoffset": 4,
      },
    } as const;

    const { container } = render(
      <CanvasSurface {...baseProps()} marchingAnts={{ outer, inner }} />,
    );
    const paths = container.querySelectorAll(".canvas__svg path");
    expect(paths).toHaveLength(2);
    expect(paths[0]!.getAttribute("d")).toBe(paths[1]!.getAttribute("d"));
    expect(paths[0]!.getAttribute("stroke-dashoffset")).toBeNull();
    expect(paths[1]!.getAttribute("stroke-dashoffset")).toBe("4");
  });

  it("renders each reflection guide as a base + highlight pair", () => {
    const spec = { d: "M0 0L24 32", attrs: GRID_SPEC.attrs } as const;
    const { container } = render(
      <CanvasSurface
        {...baseProps()}
        reflectionGuides={[
          { base: spec, highlight: spec, draft: false },
          { base: spec, highlight: spec, draft: true },
        ]}
      />,
    );
    expect(container.querySelectorAll(".canvas__svg-guide")).toHaveLength(2);
    expect(container.querySelectorAll(".canvas__svg path")).toHaveLength(4);
  });

  it("⭐ NEVER promotes the transformed element to its own layer — that rasterises the subtree once at 1:1 and GPU-upscales it, blurring worse the further you zoom", () => {
    // ⚠️ THIS TEST ASSERTS THE ABSENCE OF A FIX THAT WAS TRIED AND WAS WRONG.
    //
    // 2026-08-30 the artwork blurred while saving, and `will-change:
    // transform` was added here to give this subtree a stable layer. It made
    // the blur PERMANENT and zoom-dependent: `.canvas__layout` carries
    // `scale(combinedScale)`, so promoting it makes the browser rasterise the
    // whole subtree ONCE at 1:1 and then bilinearly stretch that single
    // bitmap. The children's `image-rendering: pixelated` never gets a say,
    // because they stop rasterising themselves and become texels in the
    // parent's texture. Reported back as "gets blurrier the more you zoom in",
    // which is the signature of exactly that.
    //
    // Leaving this element unpromoted is what keeps the artwork sharp: each
    // `<canvas>` then rasterises at its own scale, where `pixelated` decides
    // the filter. The save-time blur is fixed on the save indicator instead.
    //
    // jsdom applies no author CSS, so this is asserted against the sheet —
    // the same approach `Toast.dom.test.tsx` uses for `pointer-events: none`.
    const css = readFileSync(
      "src/ui/components/CanvasSurface/CanvasSurface.css",
      "utf8",
    );
    const layoutRule = /\.canvas__layout \{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(layoutRule).not.toBe("");
    expect(layoutRule).not.toMatch(/will-change/);
    expect(layoutRule).not.toMatch(/backface-visibility/);
    expect(layoutRule).not.toMatch(/translate[zZ]|translate3d/);
  });

  it("⭐ turns antialiasing off for the cell-aligned chrome, but leaves it ON for the origin cross and reflection guides", () => {
    // Reported 2026-08-30: "blurry edges all the time ... no antialiasing".
    // SVG antialiases by default, so the brush outline, hover outline, lasso
    // and marching ants — axis-aligned rectangles sitting exactly on cell
    // boundaries — drew soft grey half-covered pixels on every edge.
    //
    // The two exceptions are the point of this test. `crispEdges` on a
    // diagonal or counter-scaled shape does not sharpen it, it makes it a
    // staircase: the origin cross is sub-pixel geometry inside a
    // `1/combinedScale` group (and a circle is nothing but curves), and the
    // reflection guides are drawn at arbitrary angles. A future "make
    // everything crisp" sweep that deletes the exception block would make
    // those two visibly worse, so both halves are asserted.
    const css = readFileSync(
      "src/ui/components/CanvasSurface/CanvasSurface.css",
      "utf8",
    );
    expect(css).toMatch(/\.canvas__svg \{[^}]*shape-rendering: crispEdges/);
    expect(css).toMatch(
      /\.canvas__svg-origin,\s*\.canvas__svg-guide \{[^}]*shape-rendering: geometricPrecision/,
    );
  });
});
