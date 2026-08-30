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
  it("mounts one canvas per layer PLUS the background, bottom → top", () => {
    load(
      mkProject([
        mkLayer("l-bottom", RED, [[0, 0]]),
        mkLayer("l-middle", GREEN, [[1, 1]]),
        mkLayer("l-top", BLUE, [[2, 2]]),
      ]),
    );
    const { container } = mountCanvas();

    const ids = layerCanvases(container).map((c) => c.dataset.layerId);
    // The background is the synthetic BOTTOM canvas: it has to sit behind the
    // artwork, and the pointer surface and every overlay are in FRONT of the
    // stack by DOM order, so there is nowhere else for it to go until task 06
    // replaces it with a CSS DIV.
    expect(ids).toEqual(["::background", "l-bottom", "l-middle", "l-top"]);
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
    expect(layerCanvases(container)).toHaveLength(2); // bg + 1

    let newId = "";
    act(() => {
      newId = app.layers.addLayer("added");
    });

    const ids = layerCanvases(container).map((c) => c.dataset.layerId);
    expect(ids).toHaveLength(3);
    expect(ids).toContain(newId);
    expect(ids[0]).toBe("::background");
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
function variantEditProject(): Project {
  const project = mkProject([
    mkLayer("l-regular", RED, [[0, 0]]),
    mkLayer("l-variant", GREEN, [], {
      isVariant: true,
      variantGroupId: "vg-1",
      selectedVariantId: "v-1",
      variantOffsets: { "v-1": { x: 1, y: 1 } },
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
            baseFrameOffsets: { 0: { x: 1, y: 1 } },
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

  it("the background canvas is NEVER dimmed, in any focus mode", () => {
    // It carries the checkerboard, which is not artwork and must not fade
    // with it. It is also why `layerOpacity` cannot simply be a per-mode
    // constant applied to the whole stack.
    for (const mode of ["normal", "transparent", "onion"] as const) {
      load(variantEditProject());
      act(() => {
        runInAction(() => app.ui.viewport.setLayerFocusMode(mode));
      });
      const { container, unmount } = mountCanvas();
      expect(opacities(container)["::background"]).toBe("1");
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
      "::background",
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
      "::background",
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
