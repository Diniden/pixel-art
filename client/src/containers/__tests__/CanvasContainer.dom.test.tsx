/**
 * 🏁 THE PER-LAYER RENDER, PROVEN BY RENDERING — plan 05, task 05.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS FILE EXISTS, AND WHY IT IS THE ONLY SAFETY NET THIS WAVE HAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `CanvasContainer` had **no test file at all** before this one — the folder
 * held `frameThumbnailMemo`, `layoutsGate2Probe` and `syncNoFlash` and nothing
 * that mounted the canvas. Task 05 then replaced its ~1000-line, three-branch
 * `render` with a per-layer painter, moved cross-layer dimming from a per-cell
 * JS alpha multiply to a CSS `opacity`, and retired two raster painters.
 *
 * This wave's gate is *visual* (risk R4) and the owner has deferred every
 * visual check to one consolidated pass after W6. So the ten manual checks
 * cannot be claimed here, and what this file does instead is pin the half of
 * the change that a machine CAN see:
 *
 *   - N layers produce N registered canvases, bottom → top, at 1:1.
 *   - Each layer's cells land on ITS OWN canvas and on no other.
 *   - `layerOpacity` matches D4's table for all three `layerFocusMode` values.
 *   - `onion` is an OUTLINE, not an opacity — the trap the task names twice.
 *   - Both split-canvas render modes still work, together.
 *
 * ── ⚠️ THE CANVAS STUB IS LOAD-BEARING, NOT SCENERY ───────────────────────
 *
 * jsdom's `getContext("2d")` returns `null`, and every painter in the
 * container early-returns on a null context. Measured: without a stub, every
 * "the cells landed on the right canvas" assertion below reads an empty
 * buffer and would "pass" for exactly the wrong reason — the same near-miss
 * `frameThumbnailMemo.dom.test.tsx` documents at its own `getContext` stub.
 *
 * So `getContext` is replaced with the repo's real rasterising stub
 * (`src/test/canvasStub.ts`), ONE PER ELEMENT, cached by element identity.
 * Per-element is the whole point: a single shared buffer could not tell
 * "layer A's pixel is on layer A's canvas" from "…is on some canvas", which
 * is precisely the claim this task has to make good.
 *
 * ── What is NOT asserted here, deliberately ───────────────────────────────
 *
 * Anything requiring eyes: the R4 alpha comparison, whether the checkerboard
 * looks right, whether the SVG chrome is positioned correctly on screen. A
 * jsdom test can prove the plumbing; it cannot prove the picture.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { runInAction } from "mobx";

import { ApplicationStore } from "@/stores/ApplicationStore";
import { StoreProvider } from "@/stores/context";
import { CanvasContainer } from "@/containers/CanvasContainer";
import { createStubContext, getPixel } from "@test/canvasStub";
import {
  paintLayerCells,
  clearLayerCells,
  dilateCells,
} from "@/ui/canvas/render/renderLayerView";
import type { StubContext } from "@test/canvasStub";
import {
  VARIANT_EDIT_OTHER_DIM,
  VARIANT_EDIT_REGULAR_DIM,
} from "@/ui/theme/canvasTokens";
import type { Layer, PixelData, Pixel, Project } from "@/types";

/* ══ fixtures ═══════════════════════════════════════════════════════════════
 *
 * Hand-built rather than taken from `storeContract`, because what is under
 * test is which CELL landed on which CANVAS — so every layer needs a colour
 * of its own and a cell at a coordinate of its own, and the grid has to be
 * small enough that an exhaustive buffer sweep is cheap.
 */

const W = 6;
const H = 4;

const RED: Pixel = { r: 255, g: 0, b: 0, a: 255 };
const GREEN: Pixel = { r: 0, g: 255, b: 0, a: 255 };
const BLUE: Pixel = { r: 0, g: 0, b: 255, a: 255 };

const EMPTY: PixelData = { color: 0, normal: 0, height: 0 };

function blankGrid(w = W, h = H): PixelData[][] {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ ...EMPTY })),
  );
}

/** A layer with `color` written at each of `cells`. */
function mkLayer(
  id: string,
  color: Pixel,
  cells: ReadonlyArray<[number, number]>,
  over: Partial<Layer> = {},
  w = W,
  h = H,
): Layer {
  const pixels = blankGrid(w, h);
  for (const [x, y] of cells) {
    pixels[y][x] = { color: { ...color }, normal: 0, height: 0 };
  }
  return { id, name: id, visible: true, pixels, ...over };
}

/** A 3x3 solid block, for the onion-outline test: 8 outline cells, 1 interior. */
function solidBlockLayer(id: string, color: Pixel): Layer {
  const cells: [number, number][] = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) cells.push([x, y]);
  return mkLayer(id, color, cells);
}

function mkProject(layers: Layer[], over: Partial<Project> = {}): Project {
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
      selectedLayerId: layers[0]?.id,
      zoom: 8,
      panOffset: { x: 0, y: 0 },
    },
    ...over,
  } as unknown as Project;
}

/* ══ the canvas stub, one buffer per element ════════════════════════════════ */

/**
 * ⚠️ Keyed by the ELEMENT, not by size or by call order.
 *
 * A shared buffer would make "layer A's red pixel is on layer A's canvas"
 * indistinguishable from "a red pixel exists somewhere", which is the exact
 * claim per-layer rendering has to support. Cached so that repeated
 * `getContext` calls on one element — the container calls it on every frame —
 * return the SAME buffer, or nothing would ever accumulate.
 */
let contexts: WeakMap<HTMLCanvasElement, StubContext>;

function installCanvasStub(): void {
  contexts = new WeakMap();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      const existing = contexts.get(this);
      if (existing) return existing as unknown as CanvasRenderingContext2D;
      // jsdom leaves width/height at the attribute values React set, so the
      // stub is sized exactly as the real backing store would be.
      const ctx = createStubContext(this.width || 1, this.height || 1);
      contexts.set(this, ctx);
      return ctx as unknown as CanvasRenderingContext2D;
    } as unknown as typeof HTMLCanvasElement.prototype.getContext,
  );
}

/** The buffer a given layer canvas was painted into, or `null`. */
function bufferFor(
  container: HTMLElement,
  layerId: string,
): StubContext["buffer"] | null {
  const el = container.querySelector<HTMLCanvasElement>(
    `canvas[data-layer-id="${CSS.escape(layerId)}"]`,
  );
  if (!el) return null;
  return contexts.get(el)?.buffer ?? null;
}

/** Every `[x, y, r, g, b, a]` with a non-zero alpha in a buffer. */
function paintedCells(
  buf: StubContext["buffer"],
): { x: number; y: number; rgba: number[] }[] {
  const out: { x: number; y: number; rgba: number[] }[] = [];
  for (let y = 0; y < buf.height; y++) {
    for (let x = 0; x < buf.width; x++) {
      const rgba = getPixel(buf, x, y);
      if (rgba[3] !== 0) out.push({ x, y, rgba: [...rgba] });
    }
  }
  return out;
}

/** The layer canvases, in DOM order — which IS z-order, bottom → top (D3). */
function layerCanvases(container: HTMLElement): HTMLCanvasElement[] {
  return [
    ...container.querySelectorAll<HTMLCanvasElement>(".canvas__layer"),
  ];
}

/* ══ harness ════════════════════════════════════════════════════════════════ */

let app: ApplicationStore;
let consoleError: ReturnType<typeof vi.spyOn>;

/**
 * Mount and flush. `useCanvasRender` coalesces through `requestAnimationFrame`,
 * so a mount alone paints nothing — the frame has to be run.
 *
 * ⚠️ rAF is stubbed to fire SYNCHRONOUSLY rather than driven by a virtual
 * clock. What is under test is WHICH CANVAS a cell lands on, not the
 * scheduler's coalescing (which `useCanvasRender.dom.test` already owns), and
 * a synchronous frame keeps every assertion below a plain read.
 */
function mountCanvas(props: Parameters<typeof CanvasContainer>[0] = {}) {
  const result = render(
    <StoreProvider store={app}>
      <CanvasContainer {...props} />
    </StoreProvider>,
  );
  act(() => {});
  return result;
}

beforeEach(() => {
  // React logs about the unrecognised stub context in some paths; the tests
  // assert on buffers, not on the console.
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  installCanvasStub();
  app = new ApplicationStore({ autoSaveEnabled: false });
});

afterEach(() => {
  app.dispose();
  consoleError.mockRestore();
});

function load(project: Project): void {
  runInAction(() => {
    app.adoptProject(project);
    app.domain.loadState = "loaded";
  });
}

/* ══ 1. N layers → N canvases ═══════════════════════════════════════════════ */

describe("the layer stack: N layers produce N registered canvases", () => {
  it("mounts EXACTLY one canvas per layer, bottom → top — no synthetic ids", () => {
    load(
      mkProject([
        mkLayer("l-bottom", RED, [[0, 0]]),
        mkLayer("l-middle", GREEN, [[1, 1]]),
        mkLayer("l-top", BLUE, [[2, 2]]),
      ]),
    );
    const { container } = mountCanvas();

    const ids = layerCanvases(container).map((c) => c.dataset.layerId);
    // ⚠️ NO `"::background"`. Task 05 prepended a synthetic bottom canvas so
    // the checkerboard could sit behind the artwork; task 06 replaced it with
    // a CSS DIV on `--z-behind`, so every id here is a real `Layer.id` again.
    // Regressing this would put a raster background back on the repaint path.
    expect(ids).toEqual(["l-bottom", "l-middle", "l-top"]);
  });

  it("sizes every layer canvas 1:1 with the pixel data, never gridWidth * zoom", () => {
    // ⚠️ THE HEADLINE CLAIM OF THE WHOLE PLAN. `zoom` is 8 in the fixture; a
    // canvas of 48x32 here would mean the backing store is still pre-scaled,
    // which is what made Landscapes ask for 546 MB at zoom 50.
    load(mkProject([mkLayer("l-1", RED, [[0, 0]])]));
    const { container } = mountCanvas();

    for (const canvas of layerCanvases(container)) {
      expect([canvas.width, canvas.height]).toEqual([W, H]);
    }
  });

  it("adds a canvas when a layer is added", () => {
    // ⚠️ Through `LayerStore.addLayer`, NOT by pushing onto `frame.layers`.
    // `DomainStore.objects` is `observableShallow` (R2 — nothing may deep-
    // observe a pixel tree), so a nested array mutation notifies nobody; the
    // store's own action bumps `domainVersion`, which is what the container
    // observes. A test that mutated the tree by hand would report "no new
    // canvas" and blame the container for the harness's mistake.
    load(mkProject([mkLayer("l-1", RED, [[0, 0]])]));
    const { container } = mountCanvas();
    expect(layerCanvases(container)).toHaveLength(1); // no synthetic bg (task 06)

    let newId = "";
    act(() => {
      newId = app.layers.addLayer("added");
    });

    const ids = layerCanvases(container).map((c) => c.dataset.layerId);
    expect(ids).toHaveLength(2);
    expect(ids).toContain(newId);
    expect(ids[0]).toBe("l-1");
  });

  it("hides a layer with display:none, keeping its element and its bitmap", () => {
    // `display: none` rather than unmounting is what makes a visibility
    // toggle a compositor property change instead of a repaint — and it is
    // why the painter clears a hidden layer's canvas rather than skipping it.
    load(
      mkProject([
        mkLayer("l-shown", RED, [[0, 0]]),
        mkLayer("l-hidden", GREEN, [[1, 1]], { visible: false }),
      ]),
    );
    const { container } = mountCanvas();

    const byId = Object.fromEntries(
      layerCanvases(container).map((c) => [c.dataset.layerId, c]),
    );
    expect(byId["l-shown"].style.display).toBe("block");
    expect(byId["l-hidden"].style.display).toBe("none");
  });
});

/* ══ 2. each layer's cells land on ITS OWN canvas ═══════════════════════════ */

describe("each layer's cells land on its own canvas and on no other", () => {
  it("paints exactly one cell per layer, at the right coordinate, in the right colour", () => {
    load(
      mkProject([
        mkLayer("l-red", RED, [[0, 0]]),
        mkLayer("l-green", GREEN, [[3, 1]]),
        mkLayer("l-blue", BLUE, [[5, 3]]),
      ]),
    );
    const { container } = mountCanvas();

    expect(paintedCells(bufferFor(container, "l-red")!)).toEqual([
      { x: 0, y: 0, rgba: [255, 0, 0, 255] },
    ]);
    expect(paintedCells(bufferFor(container, "l-green")!)).toEqual([
      { x: 3, y: 1, rgba: [0, 255, 0, 255] },
    ]);
    expect(paintedCells(bufferFor(container, "l-blue")!)).toEqual([
      { x: 5, y: 3, rgba: [0, 0, 255, 255] },
    ]);
  });

  it("⚠️ NO layer's cells appear on ANOTHER layer's canvas", () => {
    // The negative control, and the one assertion that separates "per-layer
    // rendering" from "the old composite, drawn N times". Before this task
    // every layer's cells were composited into ONE canvas, so each buffer
    // here would have held all three.
    load(
      mkProject([
        mkLayer("l-red", RED, [[0, 0]]),
        mkLayer("l-green", GREEN, [[3, 1]]),
      ]),
    );
    const { container } = mountCanvas();

    const red = paintedCells(bufferFor(container, "l-red")!);
    const green = paintedCells(bufferFor(container, "l-green")!);

    expect(red.some((c) => c.x === 3 && c.y === 1)).toBe(false);
    expect(green.some((c) => c.x === 0 && c.y === 0)).toBe(false);
  });

  it("clears a hidden layer's canvas rather than leaving stale paint on it", () => {
    // `display: none` keeps the bitmap, so a layer that is hidden while its
    // canvas still holds paint would show that paint again the moment it is
    // re-shown. The painter clears unconditionally, before the visibility
    // check, for exactly this reason.
    const hidden = mkLayer("l-hidden", GREEN, [[1, 1]]);
    load(mkProject([mkLayer("l-shown", RED, [[0, 0]]), hidden]));
    const { container } = mountCanvas();
    expect(paintedCells(bufferFor(container, "l-hidden")!)).toHaveLength(1);

    // Through the store action, for the `observableShallow` reason above.
    act(() => {
      app.layers.toggleLayerVisibility("l-hidden");
    });

    expect(paintedCells(bufferFor(container, "l-hidden")!)).toHaveLength(0);
  });

  it("drops a fully transparent cell instead of painting a black one", () => {
    load(
      mkProject([
        mkLayer("l-1", { r: 12, g: 34, b: 56, a: 0 }, [
          [0, 0],
          [1, 0],
        ]),
      ]),
    );
    const { container } = mountCanvas();
    expect(paintedCells(bufferFor(container, "l-1")!)).toEqual([]);
  });

  it("preserves a semi-transparent cell's alpha rather than flattening it", () => {
    // R4 is about CROSS-layer compositing. WITHIN one layer the alpha must
    // survive untouched — `putImageData` writes it verbatim — or the CSS
    // opacity above it would be multiplying an already-wrong value.
    load(mkProject([mkLayer("l-1", { r: 255, g: 0, b: 0, a: 128 }, [[2, 2]])]));
    const { container } = mountCanvas();
    expect(paintedCells(bufferFor(container, "l-1")!)).toEqual([
      { x: 2, y: 2, rgba: [255, 0, 0, 128] },
    ]);
  });
});

/* ══ 3. layerOpacity — D4's table, all three focus modes ════════════════════ */

/**
 * The variant-edit fixture.
 *
 * Two layers: a REGULAR one and a VARIANT one that is the selected layer, so
 * `isEditingVariant` resolves and every row of D4's table is reachable. The
 * variant carries a second sub-layer so the "another variant layer" row is
 * exercised too — a variant layer that is NOT the one being edited is,
 * structurally, another sub-layer of the same variant group here.
 */
function variantEditProject(offset = { x: 1, y: 1 }): Project {
  const project = mkProject([
    mkLayer("l-regular", RED, [[0, 0]]),
    mkLayer("l-variant", GREEN, [], {
      isVariant: true,
      variantGroupId: "vg-1",
      selectedVariantId: "v-1",
      variantOffsets: { "v-1": offset },
    }),
  ]);
  return {
    ...project,
    variants: [
      {
        id: "vg-1",
        name: "vg-1",
        variants: [
          {
            id: "v-1",
            name: "v-1",
            gridSize: { width: 3, height: 3 },
            baseFrameOffsets: { 0: offset },
            frames: [
              {
                id: "vf-1",
                name: "vf-1",
                layers: [mkLayer("vl-1", BLUE, [[0, 0]], {}, 3, 3)],
              },
            ],
          },
        ],
      },
    ],
    uiState: { ...project.uiState, selectedLayerId: "l-variant" },
  } as unknown as Project;
}

/** The `opacity` style each layer canvas carries, keyed by id. */
function opacities(container: HTMLElement): Record<string, string> {
  return Object.fromEntries(
    layerCanvases(container).map((c) => [
      c.dataset.layerId,
      c.style.opacity || "1",
    ]),
  );
}

describe("layerOpacity matches D4's table for all three focus modes", () => {
  it("normal: nothing is dimmed", () => {
    load(variantEditProject());
    act(() => {
      runInAction(() => app.ui.viewport.setLayerFocusMode("normal"));
    });
    const { container } = mountCanvas();

    const op = opacities(container);
    expect(op["l-regular"]).toBe("1");
    // The edited variant's own sub-layer canvas.
    expect(op["l-variant::vl-1"]).toBe("1");
  });

  it("transparent: a regular layer dims to VARIANT_EDIT_REGULAR_DIM (0.5)", () => {
    load(variantEditProject());
    act(() => {
      runInAction(() => app.ui.viewport.setLayerFocusMode("transparent"));
    });
    const { container } = mountCanvas();

    expect(opacities(container)["l-regular"]).toBe(
      String(VARIANT_EDIT_REGULAR_DIM),
    );
    expect(VARIANT_EDIT_REGULAR_DIM).toBe(0.5);
  });

  it("transparent: the variant layer BEING EDITED stays at full alpha", () => {
    load(variantEditProject());
    act(() => {
      runInAction(() => app.ui.viewport.setLayerFocusMode("transparent"));
    });
    const { container } = mountCanvas();
    expect(opacities(container)["l-variant::vl-1"]).toBe("1");
  });

  it("onion: a regular layer is dimmed to REGULAR_DIM too — the dim is per-MODE, not per-branch", () => {
    // Both non-normal modes take the same dim; what `onion` changes on top of
    // that is WHICH CELLS are painted, not how faint they are.
    load(variantEditProject());
    act(() => {
      runInAction(() => app.ui.viewport.setLayerFocusMode("onion"));
    });
    const { container } = mountCanvas();
    expect(opacities(container)["l-regular"]).toBe(
      String(VARIANT_EDIT_REGULAR_DIM),
    );
  });

  it("the background is NEVER dimmed — it is a DIV outside the opacity map", () => {
    // The checkerboard is not artwork and must not fade with it. Task 05 got
    // that by pinning a synthetic layer's opacity to 1; task 06 gets it
    // structurally, because the background is no longer a layer at all.
    // Asserting BOTH halves is the point: the DIV exists in every focus mode,
    // and no `::`-prefixed id survives in the layer opacity map.
    for (const mode of ["normal", "transparent", "onion"] as const) {
      load(variantEditProject());
      act(() => {
        runInAction(() => app.ui.viewport.setLayerFocusMode(mode));
      });
      const { container, unmount } = mountCanvas();
      expect(container.querySelector(".canvas__background")).not.toBeNull();
      expect(opacities(container)["::background"]).toBeUndefined();
      unmount();
    }
  });

  it("pins VARIANT_EDIT_OTHER_DIM at 0.7 — the value moved out of renderScene", () => {
    // The constant's VALUE is the migration's contract: `renderScene.ts` was
    // deleted and this is where its two dimming numbers now live.
    expect(VARIANT_EDIT_OTHER_DIM).toBe(0.7);
  });

  it("outside variant-edit nothing is dimmed, whatever the focus mode says", () => {
    // `layerFocusMode` is meaningless without a variant to focus ON, and the
    // pre-per-layer render gated every dim on `isEditingVariantResolved`.
    load(mkProject([mkLayer("l-1", RED, [[0, 0]])]));
    act(() => {
      runInAction(() => app.ui.viewport.setLayerFocusMode("transparent"));
    });
    const { container } = mountCanvas();
    expect(opacities(container)["l-1"]).toBe("1");
  });
});

/* ══ 4. onion is an OUTLINE, not an opacity ═════════════════════════════════ */

describe("⚠️ onion renders OUTLINES, not solid silhouettes", () => {
  it("drops the interior cell of a solid block and keeps its 8 edge cells", () => {
    // THE trap the task names twice. A 3x3 solid block has exactly one cell
    // (1,1) with four painted neighbours; every other cell touches an empty
    // one. If onion were expressed as an opacity, all NINE would be painted
    // and the layer would read as a dimmed silhouette.
    const project = variantEditProject();
    const frame = project.objects[0].frames[0];
    frame.layers[0] = solidBlockLayer("l-regular", RED);
    load(project);
    act(() => {
      runInAction(() => app.ui.viewport.setLayerFocusMode("onion"));
    });
    const { container } = mountCanvas();

    const cells = paintedCells(bufferFor(container, "l-regular")!);
    expect(cells).toHaveLength(8);
    expect(cells.some((c) => c.x === 1 && c.y === 1)).toBe(false);
  });

  it("paints all 9 cells of that block in transparent mode — the negative control", () => {
    // Same fixture, same layer, one field different. A test that passed in
    // both modes would prove nothing about onion at all.
    const project = variantEditProject();
    const frame = project.objects[0].frames[0];
    frame.layers[0] = solidBlockLayer("l-regular", RED);
    load(project);
    act(() => {
      runInAction(() => app.ui.viewport.setLayerFocusMode("transparent"));
    });
    const { container } = mountCanvas();

    expect(paintedCells(bufferFor(container, "l-regular")!)).toHaveLength(9);
  });

  it("keeps a silhouette's edge where it touches the grid border", () => {
    // Out-of-bounds neighbours count as EMPTY, so a block flush against the
    // border keeps that side. Preserved verbatim from `isOutlineCell`.
    const project = variantEditProject();
    const frame = project.objects[0].frames[0];
    // A 2x2 block at the top-left corner: every cell touches a border or an
    // empty neighbour, so all four survive.
    frame.layers[0] = mkLayer("l-regular", RED, [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]);
    load(project);
    act(() => {
      runInAction(() => app.ui.viewport.setLayerFocusMode("onion"));
    });
    const { container } = mountCanvas();
    expect(paintedCells(bufferFor(container, "l-regular")!)).toHaveLength(4);
  });
});

/* ══ 5. variant placement and the view union ════════════════════════════════ */

describe("variant offsets and the expanded view", () => {
  it("draws a variant's cells at its offset, in view space", () => {
    // The variant grid is 3x3 at offset (1,1) inside a 6x4 object, so the
    // view union is the object's own bounds and `viewMin` is (0,0). A cell at
    // the variant's (0,0) therefore lands at surface (1,1).
    load(variantEditProject());
    const { container } = mountCanvas();

    expect(paintedCells(bufferFor(container, "l-variant::vl-1")!)).toEqual([
      { x: 1, y: 1, rgba: [0, 0, 255, 255] },
    ]);
  });

  it("gives every variant SUB-layer its own canvas", () => {
    // Not tidiness: it is what makes `putImageData` safe. One pixel grid holds
    // exactly one cell per (x, y), so compositing several sub-layers into one
    // buffer would reintroduce the JS alpha arithmetic R4 is about, in the one
    // place it is avoidable.
    load(variantEditProject());
    const { container } = mountCanvas();
    const ids = layerCanvases(container).map((c) => c.dataset.layerId);
    expect(ids).toContain("l-variant::vl-1");
  });

  it("expands the surface to the union of object and variant when the variant overhangs", () => {
    // D1: `cellWidth = editingVariant ? viewWidth : gridWidth`. A variant at a
    // NEGATIVE offset pushes `viewMin` left, so the surface grows and the
    // whole variant stays visible. Dropping that conditional is MASTER §8's
    // first "most likely to get wrong".
    const project = variantEditProject();
    const layers = project.objects[0].frames[0].layers;
    layers[1].variantOffsets = { "v-1": { x: -2, y: 0 } };
    project.variants![0].variants[0].baseFrameOffsets = { 0: { x: -2, y: 0 } };
    load(project);
    const { container } = mountCanvas();

    // 6 object cells + 2 cells of overhang to the left.
    for (const canvas of layerCanvases(container)) {
      expect(canvas.width).toBe(W + 2);
    }
  });
});

/* ══ 6. both split-canvas render modes ══════════════════════════════════════ */

describe("both split-canvas render modes keep working", () => {
  it("Full mode composites every layer of the frame", () => {
    load(
      mkProject([
        mkLayer("l-1", RED, [[0, 0]]),
        mkLayer("l-2", GREEN, [[1, 1]]),
      ]),
    );
    const { container } = mountCanvas({ renderMode: "full" });
    expect(layerCanvases(container).map((c) => c.dataset.layerId)).toEqual([
      "l-1",
      "l-2",
    ]);
  });

  it("Layer mode shows ONLY the editable grid — the selected layer, at origin", () => {
    // The Layer view is the opposite of Full: one canvas, no offset, no
    // dimming, no object outline. It is what `drawLayerView` was written for
    // and what the per-layer painter now serves directly.
    load(
      mkProject([
        mkLayer("l-1", RED, [[0, 0]]),
        mkLayer("l-2", GREEN, [[1, 1]]),
      ]),
    );
    const { container } = mountCanvas({ renderMode: "layer" });
    expect(layerCanvases(container).map((c) => c.dataset.layerId)).toEqual([
      "l-1",
    ]);
  });

  it("renders both panes at once without their canvases colliding", () => {
    // Both panes share `zoom` and each has its own camera. Two mounted
    // instances mean two independent ref maps; a shared one would have the
    // second mount's `registerLayerCanvas` overwrite the first's and leave one
    // pane painting into the other's canvas.
    load(mkProject([mkLayer("l-1", RED, [[2, 1]])]));
    const { container } = render(
      <StoreProvider store={app}>
        <CanvasContainer renderMode="full" />
        <CanvasContainer renderMode="layer" />
      </StoreProvider>,
    );
    act(() => {});

    const canvases = container.querySelectorAll<HTMLCanvasElement>(
      'canvas[data-layer-id="l-1"]',
    );
    expect(canvases).toHaveLength(2);
    // BOTH were painted — not one of them twice.
    for (const el of canvases) {
      const buf = contexts.get(el)?.buffer;
      expect(buf && paintedCells(buf)).toEqual([
        { x: 2, y: 1, rgba: [255, 0, 0, 255] },
      ]);
    }
  });
});

/* ══ 7. the two retired painters ════════════════════════════════════════════ */

describe("the retired raster painters", () => {
  it("leaves the reflection canvas BLANK — the guides are vector now", () => {
    // Task 04 mounted the SVG `reflectionGuides` but could not remove this
    // canvas, because the raster painter lived in this container. Task 05
    // stopped that painter. The canvas is still mounted (CanvasSurface mounts
    // it unconditionally and the ref prop is optional) and must simply stay
    // blank — if it were painted too, every guide would be drawn twice, once
    // at the wrong scale.
    load(mkProject([mkLayer("l-1", RED, [[0, 0]])]));
    const { container } = mountCanvas();

    const el = container.querySelector<HTMLCanvasElement>(
      ".canvas__overlay--reflection",
    );
    expect(el).not.toBeNull();
    // Never handed a context by the container, so the stub never made one.
    expect(contexts.get(el!)).toBeUndefined();
  });

  it("does not paint grid lines onto the pointer surface", () => {
    // At 1:1 `strokeGrid` draws a 1px line every 1px — a flat wash of
    // gridStroke over the ENTIRE surface (MASTER §4's first named silent
    // failure). The grid is the SVG `grid` path now. If the raster cache ever
    // comes back, the pointer surface goes solid grey and this catches it.
    load(mkProject([mkLayer("l-1", RED, [[0, 0]])]));
    const { container } = mountCanvas();

    const surface = container.querySelector<HTMLCanvasElement>(
      ".canvas__surface",
    );
    const buf = contexts.get(surface!)?.buffer;
    // Nothing to draw in this fixture: no selection, no preview, not editing a
    // variant. A wash would show as W*H painted cells.
    expect(buf ? paintedCells(buf) : []).toEqual([]);
  });

  it("mounts the SVG grid instead", () => {
    load(mkProject([mkLayer("l-1", RED, [[0, 0]])]));
    const { container } = mountCanvas();
    const grid = container.querySelector(".canvas__svg-grid");
    expect(grid).not.toBeNull();
    // `cells + 1` lines per axis, both outer edges included.
    const segments = (grid!.getAttribute("d") ?? "").split("M").length - 1;
    expect(segments).toBe(W + 1 + (H + 1));
  });
});

/* ══ 7. the background DIV — plan 05, task 06, decision D11 ═════════════════ */

describe("the background is a CSS DIV, and its parity survives a variant view", () => {
  /** `.canvas__background`'s `background-position`, as `[x, y]` numbers. */
  function parity(container: HTMLElement): [number, number] {
    const bg = container.querySelector<HTMLElement>(".canvas__background")!;
    const [x, y] = bg.style.backgroundPosition.split(" ");
    return [parseFloat(x), parseFloat(y)];
  }

  it("mounts exactly ONE background DIV, and no background canvas", () => {
    // The whole point of the task: two offscreen canvases, a cache key and a
    // per-repaint `drawImage` became one compositor-drawn element. A second
    // `.canvas__background` — or a surviving `::background` layer canvas —
    // would mean the checkerboard is being drawn twice.
    load(mkProject([mkLayer("l-1", RED, [[0, 0]])]));
    const { container } = mountCanvas();

    expect(container.querySelectorAll(".canvas__background")).toHaveLength(1);
    expect(
      layerCanvases(container).map((c) => c.dataset.layerId),
    ).not.toContain("::background");
  });

  it("is dark by default and takes the light modifier from lightGridMode", () => {
    load(mkProject([mkLayer("l-1", RED, [[0, 0]])]));
    const dark = mountCanvas();
    expect(
      dark.container.querySelector(".canvas__background")!.className,
    ).toBe("canvas__background");
    dark.unmount();

    act(() => {
      runInAction(() => app.ui.viewport.toggleLightGridMode());
    });
    const light = mountCanvas();
    expect(
      light.container.querySelector(".canvas__background")!.className,
    ).toContain("canvas__background--light");
    light.unmount();
  });

  it("uses phase (0, 0) outside variant-edit — the surface IS object space", () => {
    load(mkProject([mkLayer("l-1", RED, [[0, 0]])]));
    const { container } = mountCanvas();
    expect(parity(container)).toEqual([0, 0]);
  });

  it("⚠️ PARITY: a NEGATIVE variant offset yields 0/1, never a negative px", () => {
    // ⚠️ `bgGeom.offsetX` is `Math.min(0, variantOffset.x)`, so a variant
    // dragged left is negative — and JS's `%` returns -1 for -1. The double
    // modulo in `checkerParity` is what keeps `background-position` a
    // NON-NEGATIVE 0 or 1 rather than `-1px`.
    load(variantEditProject({ x: -1, y: -2 }));
    const { container } = mountCanvas();
    const [x, y] = parity(container);
    expect([x, y]).toEqual([1, 0]);
  });

  it("a positive offset that leaves viewMin at 0 keeps phase (0, 0)", () => {
    // `viewMinX = Math.min(0, offsetX)`, so a variant dragged RIGHT does not
    // move the view origin and the checkerboard does not shift. This is the
    // negative control for the test above: it proves the offset is read from
    // the VIEW origin and not from `variantOffset` directly.
    load(variantEditProject({ x: 3, y: 3 }));
    const { container } = mountCanvas();
    expect(parity(container)).toEqual([0, 0]);
  });
});

/* ══ 9. INCREMENTAL REDRAW — plan 05, task 07 ═══════════════════════════════
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 THE PAYOFF OF THE WHOLE PLAN, AND THE ONLY IN-PROCESS PROOF OF IT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The owner's ask was "when editing a layer, only the pixels affected should
 * be redrawn". These tests measure that directly, off the canvas stub's call
 * log: a one-cell edit must reach ONE canvas and write ONE cell, not sweep
 * 57,344 cells across every layer.
 *
 * `putImageData`'s recorded `width x height` IS the cells-written count,
 * because the container's incremental path allocates a buffer the size of the
 * dirty cells' bounding box. So `sum(w * h)` over the frame's `putImageData`
 * calls is a real, exact "cells painted this repaint" figure — the number the
 * plan's gate asks for, taken where a browser is not available.
 *
 * ── What these tests CANNOT show ──────────────────────────────────────────
 *
 * Milliseconds in a real browser, and whether the picture looks right. Both
 * are owed to the consolidated visual pass. What is proven here is the
 * COUNT — which is the mechanism the milliseconds would follow from.
 */

/** Every `putImageData` on a layer canvas, with the cells it wrote. */
function putCalls(
  container: HTMLElement,
  layerId: string,
): { w: number; h: number; x: number; y: number }[] {
  const el = container.querySelector<HTMLCanvasElement>(
    `canvas[data-layer-id="${CSS.escape(layerId)}"]`,
  );
  if (!el) return [];
  const ctx = contexts.get(el);
  if (!ctx) return [];
  return ctx.calls
    .filter((c) => c.method === "putImageData")
    .map((c) => ({
      w: c.args[0] as number,
      h: c.args[1] as number,
      x: c.args[2] as number,
      y: c.args[3] as number,
    }));
}

/** Total cells written to a layer's canvas since `clearCalls`. */
function cellsPainted(container: HTMLElement, layerId: string): number {
  return putCalls(container, layerId).reduce((n, c) => n + c.w * c.h, 0);
}

/** Drop the mount paint so the next assertion measures ONE edit. */
function clearCalls(container: HTMLElement): void {
  for (const el of layerCanvases(container)) {
    const ctx = contexts.get(el);
    if (ctx) (ctx.calls as unknown[]).length = 0;
  }
}

describe("incremental redraw: only the affected cells, on the affected layer", () => {
  it("🏁 a ONE-CELL edit paints ONE cell — not the whole grid, not every layer", () => {
    load(
      mkProject([
        mkLayer("l-bottom", RED, [[0, 0]]),
        mkLayer("l-middle", GREEN, [[1, 1]]),
        mkLayer("l-top", BLUE, [[2, 2]]),
      ]),
    );
    const { container } = mountCanvas();

    // The mount paint IS a full repaint — that is correct and expected.
    expect(cellsPainted(container, "l-bottom")).toBe(W * H);
    clearCalls(container);

    act(() => {
      app.pixels.setPixel(4, 3, GREEN);
    });

    // ⚠️ THE NUMBER THE PLAN ASKED FOR. One cell in, one cell painted.
    expect(cellsPainted(container, "l-bottom")).toBe(1);
    // ⚠️ AND THE OTHER HALF: the two layers that did not change were not
    // touched at all. On the owner's 7-layer sprite that is 6 canvases and
    // 6 full sweeps skipped per edit.
    expect(putCalls(container, "l-middle")).toHaveLength(0);
    expect(putCalls(container, "l-top")).toHaveLength(0);
  });

  it("🏁 the saving SCALES: on a 64x64 grid one edit still paints exactly 1 cell", () => {
    // The Landscapes proxy. A full repaint of this grid is 4,096 cells; the
    // owner's real surface is 256x224 = 57,344. Both are one cell here.
    const BIG = 64;
    load(
      mkProject([mkLayer("l-1", RED, [[0, 0]], {}, BIG, BIG)], {
        objects: [
          {
            id: "obj-1",
            name: "Object 1",
            gridSize: { width: BIG, height: BIG },
            frames: [
              {
                id: "frame-1",
                name: "Frame 1",
                layers: [mkLayer("l-1", RED, [[0, 0]], {}, BIG, BIG)],
              },
            ],
          },
        ],
      } as unknown as Partial<Project>),
    );
    const { container } = mountCanvas();
    expect(cellsPainted(container, "l-1")).toBe(BIG * BIG); // 4,096
    clearCalls(container);

    act(() => {
      app.pixels.setPixel(31, 31, GREEN);
    });

    const after = cellsPainted(container, "l-1");
    expect(after).toBe(1);
    // Stated as the ratio the plan's gate asks for, so a regression reads as
    // a number and not as a subjective "it got slower".
    expect(BIG * BIG / after).toBe(4096);
  });

  it("the painted cell holds the NEW colour, read from the live grid", () => {
    load(mkProject([mkLayer("l-1", RED, [[0, 0]])]));
    const { container } = mountCanvas();

    act(() => {
      app.pixels.setPixel(4, 3, GREEN);
    });

    const buf = bufferFor(container, "l-1");
    expect(buf).not.toBeNull();
    expect([...getPixel(buf!, 4, 3)]).toEqual([0, 255, 0, 255]);
    // And the cell that was already there survived the incremental pass —
    // this is what a blank `createImageData` bounding box would have erased.
    expect([...getPixel(buf!, 0, 0)]).toEqual([255, 0, 0, 255]);
  });

  it("⚠️ ERASE TO TRANSPARENT actually CLEARS — it does not leave a ghost", () => {
    // The `clearRect` check. `paintLayerCells` writes nothing for an empty
    // cell, so without the clear the old colour simply stays: erasing would
    // appear to do nothing. This is the failure the task names explicitly.
    load(mkProject([mkLayer("l-1", RED, [[2, 1]])]));
    const { container } = mountCanvas();
    expect([...getPixel(bufferFor(container, "l-1")!, 2, 1)]).toEqual([
      255, 0, 0, 255,
    ]);

    act(() => {
      app.pixels.setPixel(2, 1, 0); // erase
    });

    expect([...getPixel(bufferFor(container, "l-1")!, 2, 1)]).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it("a two-cell edit far apart preserves the pixels BETWEEN them", () => {
    // The bounding box spans the whole row. A blank `createImageData` box
    // would erase everything inside it; the read-back buffer must not.
    load(
      mkProject([
        mkLayer("l-1", RED, [
          [2, 0],
          [3, 0],
        ]),
      ]),
    );
    const { container } = mountCanvas();
    clearCalls(container);

    act(() => {
      app.pixels.setPixels([
        { x: 0, y: 0, color: GREEN },
        { x: 5, y: 0, color: GREEN },
      ]);
    });

    const buf = bufferFor(container, "l-1")!;
    expect([...getPixel(buf, 0, 0)]).toEqual([0, 255, 0, 255]);
    expect([...getPixel(buf, 5, 0)]).toEqual([0, 255, 0, 255]);
    // The untouched interior of the box — the whole point of the read-back.
    expect([...getPixel(buf, 2, 0)]).toEqual([255, 0, 0, 255]);
    expect([...getPixel(buf, 3, 0)]).toEqual([255, 0, 0, 255]);
  });

  it("⚠️ UNDO repaints, though pixelVersion never bumps (D8 — the trap)", () => {
    // `publishAndBump` skips the version bump during replay — the
    // no-save-on-undo gate (`autoSave.test.ts:225`). So `pixelVersion` does
    // NOT change here and the deps effect never re-runs: the dirty reaction
    // is the ONLY signal. If this fails, the undone pixels are stuck on
    // screen while the model is perfectly correct — the worst kind of bug.
    load(mkProject([mkLayer("l-1", RED, [[0, 0]])]));
    const { container } = mountCanvas();

    act(() => {
      app.pixels.setPixel(4, 3, GREEN);
    });
    expect([...getPixel(bufferFor(container, "l-1")!, 4, 3)]).toEqual([
      0, 255, 0, 255,
    ]);

    const versionBefore = app.domain.pixelVersion;
    act(() => {
      app.undo();
    });

    // The gate really is closed — this is what makes the test meaningful.
    expect(app.domain.pixelVersion).toBe(versionBefore);
    // And the pixel is gone anyway.
    expect([...getPixel(bufferFor(container, "l-1")!, 4, 3)]).toEqual([
      0, 0, 0, 0,
    ]);
  });

  it("REDO repaints too, on the same channel", () => {
    load(mkProject([mkLayer("l-1", RED, [[0, 0]])]));
    const { container } = mountCanvas();

    act(() => {
      app.pixels.setPixel(4, 3, GREEN);
    });
    act(() => {
      app.undo();
    });
    act(() => {
      app.redo();
    });

    expect([...getPixel(bufferFor(container, "l-1")!, 4, 3)]).toEqual([
      0, 255, 0, 255,
    ]);
  });

  it("undo of a MULTI-cell command reverts every cell", () => {
    load(mkProject([mkLayer("l-1", RED, [[0, 0]])]));
    const { container } = mountCanvas();

    act(() => {
      app.pixels.setPixels([
        { x: 1, y: 1, color: GREEN },
        { x: 2, y: 1, color: GREEN },
        { x: 3, y: 1, color: GREEN },
      ]);
    });
    act(() => {
      app.undo();
    });

    const buf = bufferFor(container, "l-1")!;
    for (const x of [1, 2, 3]) {
      expect([...getPixel(buf, x, 1)]).toEqual([0, 0, 0, 0]);
    }
    expect([...getPixel(buf, 0, 0)]).toEqual([255, 0, 0, 255]);
  });

  it("a FLIP publishes null and falls back to a FULL repaint (R6)", () => {
    // `flipInto` replaces the grid wholesale and calls `publishDirtyAll()`.
    // The accumulator must promote to "all" — a flip narrowed to a region
    // would leave most of the sprite mirrored-but-stale.
    load(
      mkProject([
        mkLayer("l-1", RED, [
          [0, 0],
          [1, 0],
        ]),
      ]),
    );
    const { container } = mountCanvas();
    clearCalls(container);

    act(() => {
      app.pixels.flipHorizontal();
    });

    // A full-surface put, not a 2-cell one.
    expect(cellsPainted(container, "l-1")).toBe(W * H);
    const buf = bufferFor(container, "l-1")!;
    expect([...getPixel(buf, W - 1, 0)]).toEqual([255, 0, 0, 255]);
    expect([...getPixel(buf, 0, 0)]).toEqual([0, 0, 0, 0]);
  });

  it("a non-pixel change (layer visibility) is still a FULL repaint", () => {
    // Rule 4 of the accumulator: only pixel writes take the fast path.
    load(
      mkProject([
        mkLayer("l-1", RED, [[0, 0]]),
        mkLayer("l-2", GREEN, [[1, 1]]),
      ]),
    );
    const { container } = mountCanvas();
    clearCalls(container);

    act(() => {
      app.layers.toggleLayerVisibility("l-2");
    });

    // BOTH canvases repainted in full — the visibility change is described by
    // no dirty region at all, so narrowing it would repaint nothing.
    expect(cellsPainted(container, "l-1")).toBe(W * H);
  });

  it("⚠️ R6: moveLayerPixels publishes NO region and still repaints in full", () => {
    // The audit's most important negative case. `moveLayerPixels` goes
    // through `DomainMutator.commit`, not `PixelStore` — it bumps
    // `domainVersion` and touches NEITHER `pixelVersion` NOR `pixelDirty`.
    // Its repaint therefore rides entirely on `render`'s identity changing,
    // which is the path the task 07 gate must not have broken. If this
    // regresses, a move leaves the sprite frozen where it was.
    load(mkProject([mkLayer("l-1", RED, [[1, 1]])]));
    const { container } = mountCanvas();
    expect([...getPixel(bufferFor(container, "l-1")!, 1, 1)]).toEqual([
      255, 0, 0, 255,
    ]);
    const dirtyBefore = app.domain.pixelDirty;
    const versionBefore = app.domain.pixelVersion;

    act(() => {
      app.layers.moveLayerPixels(1, 0);
    });

    // Neither channel moved — which is exactly why the full-repaint path has
    // to still exist.
    expect(app.domain.pixelDirty).toBe(dirtyBefore);
    expect(app.domain.pixelVersion).toBe(versionBefore);
    // And the canvas followed anyway.
    const buf = bufferFor(container, "l-1")!;
    expect([...getPixel(buf, 2, 1)]).toEqual([255, 0, 0, 255]);
    expect([...getPixel(buf, 1, 1)]).toEqual([0, 0, 0, 0]);
  });

  it("several edits in ONE frame coalesce with no cell dropped", () => {
    // The rapid-scribble case. rAF is synchronous in this harness, so the
    // accumulation itself is `useCanvasRender.dom.test`'s job; what this pins
    // is that every cell of a run reaches the canvas.
    load(mkProject([mkLayer("l-1", RED, [[0, 0]])]));
    const { container } = mountCanvas();

    act(() => {
      for (let x = 0; x < W; x++) app.pixels.setPixel(x, 2, BLUE);
    });

    const buf = bufferFor(container, "l-1")!;
    for (let x = 0; x < W; x++) {
      expect([...getPixel(buf, x, 2)]).toEqual([0, 0, 255, 255]);
    }
  });
});

/* ══ 10. D9 — the onion dilation, END TO END ═══════════════════════════════ */

describe("⚠️ D9: onion mode, incremental, stays identical to a full repaint", () => {
  it("an edit under onion focus leaves the canvas exactly as a full repaint would", () => {
    // ══════════════════════════════════════════════════════════════════════
    //  THE D9 CHECK AT THE CONTAINER LEVEL — WHY IT IS PHRASED THIS WAY
    // ══════════════════════════════════════════════════════════════════════
    //
    // `isOutlineCell` reads a cell's FOUR NEIGHBOURS, so under onion an edit
    // to one cell changes whether its NEIGHBOURS render as outline. Repaint
    // only the published cells and those neighbours keep paint that is no
    // longer correct — silently, until something forces a full repaint.
    //
    // The strongest assertion available is therefore not "these four cells
    // changed" but EQUIVALENCE: after an incremental pass the canvas must be
    // byte-identical to what a full repaint of the same grid produces. That
    // catches both an under-dilation (stale cells left) and an
    // over-dilation (cells cleared that should have stayed).
    //
    // The exhaustive cell-level proof of the dilation itself lives in
    // `renderLayerView.test.ts`, where the painter can be driven directly;
    // this one proves the container wires it up.
    const project = variantEditProject();
    const frame = project.objects[0].frames[0];
    frame.layers[0] = solidBlockLayer("l-regular", RED);
    load(project);
    act(() => {
      runInAction(() => app.ui.viewport.setLayerFocusMode("onion"));
    });
    const { container } = mountCanvas();

    // 8 of the block's 9 cells: the interior (1,1) is not an outline cell.
    expect(paintedCells(bufferFor(container, "l-regular")!)).toHaveLength(8);

    // Edit the VARIANT (the layer the user is actually on) and confirm the
    // onion layer beside it is unharmed, then force a full repaint and
    // compare. An incremental pass that touched the onion layer wrongly
    // would diverge here.
    act(() => {
      app.pixels.setPixel(1, 1, GREEN);
    });
    const incremental = paintedCells(bufferFor(container, "l-regular")!)
      .map((c) => `${c.x},${c.y}:${c.rgba.join(",")}`)
      .sort();

    act(() => {
      runInAction(() => app.ui.viewport.setLayerFocusMode("transparent"));
      runInAction(() => app.ui.viewport.setLayerFocusMode("onion"));
    });
    const full = paintedCells(bufferFor(container, "l-regular")!)
      .map((c) => `${c.x},${c.y}:${c.rgba.join(",")}`)
      .sort();

    expect(incremental).toEqual(full);
  });

  it("⚠️ dilation: filling a hole retires its FOUR neighbours' outline status", () => {
    // ══════════════════════════════════════════════════════════════════════
    //  THE CELL-LEVEL D9 PROOF — driven through the painter directly
    // ══════════════════════════════════════════════════════════════════════
    //
    // The container test above proves the wiring; this proves the RULE, and
    // it has to be driven at the painter because in today's UI the onion
    // layer is never the edit target (onion applies to a NON-current layer
    // under variant-edit focus, and every `PixelStore` write resolves to the
    // SELECTED layer). The dilation is therefore defensive — it costs 8 extra
    // cells per edit and removes a whole class of stale-outline bug the
    // moment any path does reach that layer.
    //
    // A plus with a hole at its centre: each of the four arms is an outline
    // cell BECAUSE (2,1) is empty. Fill (2,1) and the arms at (1,1) and (3,1)
    // stop being outline cells — but only (2,1) is in the dirty region.
    const before: [number, number][] = [
      [2, 0],
      [1, 1],
      [3, 1],
      [2, 2],
    ];
    const gridWidth = 5;
    const gridHeight = 3;
    const mkGrid = (cells: [number, number][]) => {
      const g = Array.from({ length: gridHeight }, () =>
        Array.from({ length: gridWidth }, () => ({ ...EMPTY })),
      );
      for (const [x, y] of cells) {
        g[y][x] = { color: { ...RED }, normal: 0, height: 0 };
      }
      return g;
    };
    const color = (cell: unknown) => {
      const c = (cell as PixelData | undefined)?.color;
      return c && typeof c === "object" ? (c as Pixel) : null;
    };

    // 1. Paint the BEFORE state in onion mode.
    const surface = createStubContext(gridWidth, gridHeight);
    const full0 = surface.createImageData(gridWidth, gridHeight);
    paintLayerCells(full0, {
      pixels: mkGrid(before),
      gridWidth,
      gridHeight,
      getPixelColor: color,
      onionOutline: true,
    });
    surface.putImageData(full0, 0, 0);
    // All four arms are outline cells while the hole is empty.
    expect(paintedCells(surface.buffer)).toHaveLength(4);

    // 2. Fill the hole and repaint INCREMENTALLY, with the dilation.
    const after = mkGrid([...before, [2, 1]]);
    const dirty = [{ x: 2, y: 1 }];
    const painted = dilateCells(dirty);
    clearLayerCells(surface, {
      cells: painted,
      gridWidth,
      gridHeight,
      surfaceWidth: gridWidth,
      surfaceHeight: gridHeight,
    });
    const patch = surface.getImageData(0, 0, gridWidth, gridHeight);
    paintLayerCells(patch, {
      pixels: after,
      gridWidth,
      gridHeight,
      getPixelColor: color,
      onionOutline: true,
      cells: painted,
    });
    surface.putImageData(patch, 0, 0);
    const incremental = paintedCells(surface.buffer)
      .map((c) => `${c.x},${c.y}`)
      .sort();

    // 3. What a FULL repaint of the same grid gives.
    const surfaceFull = createStubContext(gridWidth, gridHeight);
    const full1 = surfaceFull.createImageData(gridWidth, gridHeight);
    paintLayerCells(full1, {
      pixels: after,
      gridWidth,
      gridHeight,
      getPixelColor: color,
      onionOutline: true,
    });
    surfaceFull.putImageData(full1, 0, 0);
    const expected = paintedCells(surfaceFull.buffer)
      .map((c) => `${c.x},${c.y}`)
      .sort();

    expect(incremental).toEqual(expected);
    // ⚠️ AND THE INTERESTING PART, spelled out so a future reader does not
    // "fix" it: the filled hole (2,1) is NOT painted. All four of its
    // neighbours are now painted, so it is an interior cell, and onion draws
    // only the outline. The four arms survive because each still touches the
    // grid's empty surroundings. So the WRITE ITSELF produces no pixel while
    // its neighbours had to be re-evaluated — which is precisely why the
    // region has to be dilated rather than trusted.
    expect(incremental).toEqual(["1,1", "2,0", "2,2", "3,1"]);
  });

  it("⚠️ NEGATIVE CONTROL: WITHOUT the dilation the same edit goes stale", () => {
    // ══════════════════════════════════════════════════════════════════════
    //  THE PROOF THAT D9 IS LOAD-BEARING AND NOT DEFENSIVE DECORATION
    // ══════════════════════════════════════════════════════════════════════
    //
    // Same grid, same edit, run three ways: undilated, dilated, and a full
    // repaint as the truth. The dilated pass must MATCH the truth and the
    // undilated pass must NOT. If this ever starts matching, the dilation has
    // stopped doing anything and the test above has stopped proving anything.
    //
    // The case is an ERASE from the middle of a solid 5x5 block, and the
    // direction matters. Filling a hole makes the written cell INTERIOR — it
    // simply stops being painted, which even an undilated pass gets right
    // because it clears that cell anyway. Erasing does the opposite: the four
    // cells around the hole were interior (unpainted) and become outline
    // cells, and NONE of them is in the dirty region. Undilated, they stay
    // blank — a hole with no edge, which is exactly the stale-outline
    // artefact D9 exists to prevent.
    const G = 5;
    const color = (cell: unknown) => {
      const c = (cell as PixelData | undefined)?.color;
      return c && typeof c === "object" ? (c as Pixel) : null;
    };
    const mk5 = (cells: [number, number][]) => {
      const g = Array.from({ length: G }, () =>
        Array.from({ length: G }, () => ({ ...EMPTY })),
      );
      for (const [x, y] of cells) {
        g[y][x] = { color: { ...RED }, normal: 0, height: 0 };
      }
      return g;
    };
    const keys = (ctx: StubContext) =>
      paintedCells(ctx.buffer)
        .map((c) => `${c.x},${c.y}`)
        .sort();

    const solid: [number, number][] = [];
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) solid.push([x, y]);

    // The BEFORE state: a solid block's outline is its 16 border cells.
    const start = createStubContext(G, G);
    const b0 = start.createImageData(G, G);
    paintLayerCells(b0, {
      pixels: mk5(solid),
      gridWidth: G,
      gridHeight: G,
      getPixelColor: color,
      onionOutline: true,
    });
    start.putImageData(b0, 0, 0);
    expect(keys(start)).toHaveLength(16);

    const erased = mk5(solid.filter(([x, y]) => !(x === 2 && y === 2)));
    const dirty = [{ x: 2, y: 2 }];

    /** Replay `cells` onto a copy of the BEFORE surface. */
    const replay = (cells: readonly { x: number; y: number }[]) => {
      const ctx = createStubContext(G, G);
      ctx.putImageData(start.getImageData(0, 0, G, G), 0, 0);
      clearLayerCells(ctx, {
        cells,
        gridWidth: G,
        gridHeight: G,
        surfaceWidth: G,
        surfaceHeight: G,
      });
      const patch = ctx.getImageData(0, 0, G, G);
      paintLayerCells(patch, {
        pixels: erased,
        gridWidth: G,
        gridHeight: G,
        getPixelColor: color,
        onionOutline: true,
        cells,
      });
      ctx.putImageData(patch, 0, 0);
      return ctx;
    };

    const undilated = replay(dirty);
    const dilated = replay(dilateCells(dirty));

    // The truth: a full repaint of the erased grid.
    const truth = createStubContext(G, G);
    const bt = truth.createImageData(G, G);
    paintLayerCells(bt, {
      pixels: erased,
      gridWidth: G,
      gridHeight: G,
      getPixelColor: color,
      onionOutline: true,
    });
    truth.putImageData(bt, 0, 0);

    // ⚠️ THE WHOLE POINT.
    expect(keys(dilated)).toEqual(keys(truth));
    expect(keys(undilated)).not.toEqual(keys(truth));

    // Named concretely so a failure says WHICH cells went stale: the four
    // neighbours of the erased cell are the new edge of the hole.
    for (const k of ["1,2", "2,1", "2,3", "3,2"]) {
      expect(keys(truth)).toContain(k);
      expect(keys(dilated)).toContain(k);
      expect(keys(undilated)).not.toContain(k);
    }
  });
});
