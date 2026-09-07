/**
 * The eraser draws at its OWN size (plan 09, task 09 → applied in task 11).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THIS PINS, AND WHY IT EXISTS SEPARATELY
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Task 09 split `eraserBrushSize` / `eraserBrushMax` off the single global
 * `brushSize` and gave the eraser its own panel and rail controls. It added
 * `ToolUIStore.activeToolBrushSize` — "the eraser's size when erasing, the
 * pencil's otherwise" — and covered it thoroughly at the STORE level in
 * `stores/ui/__tests__/eraserBrush.test.ts` (20 tests).
 *
 * But task 09 was forbidden from editing `CanvasContainer.tsx`, so the getter
 * shipped **tested and unconsumed**. The eraser's sliders were independent
 * while its actual stroke and hover footprint still read `brushSize`. Every
 * one of those 20 store tests passed the whole time.
 *
 * ⚠️ THAT IS THE FAILURE MODE THIS FILE EXISTS FOR: a green store suite that
 * proves a value is computed correctly and nothing about whether anything
 * reads it. What is pinned here is the CONSUMPTION, at the container, through
 * a real mouse drag on the real canvas.
 *
 * Three tool-aware sites were wired:
 *   - the hover-footprint memo   — the marker under the cursor
 *   - `brushStampOptions`        — what both paint tools stamp through
 *   - `getToolContext.brushSize` — what `toolHandlers` draws with
 *
 * ⚠️ AND TWO SITES WERE DELIBERATELY NOT. `fill-square` reads the PENCIL's
 * size by design (`getToolContext.squarePixelsAt` and the mouse-move hover
 * preview), which is exactly why `:607` could not be swapped wholesale and
 * why `activeToolBrushSize` branches on `"eraser"` alone. The last group
 * below pins that, so a future "tidy-up" that collapses the two locals fails
 * here rather than silently resizing fill-square with the eraser's slider.
 *
 * ── ⚠️ THE `getBoundingClientRect` STUB IS LOAD-BEARING ───────────────────
 *
 * Transcribed from `selectionTouch.dom.test.tsx`, which documents it: jsdom
 * reports a zero-size rect for every element and `screenToPixel` then returns
 * `null` for every event. Without the stub NOTHING is drawn and every
 * "erased N cells" assertion would read 0 — passing for a broken tool and a
 * correct one alike.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { runInAction } from "mobx";

import { ApplicationStore } from "@/stores/ApplicationStore";
import { StoreProvider } from "@/stores/context";
import { CanvasContainer } from "@/containers/CanvasContainer";
import { createStubContext } from "@test/canvasStub";
import type { StubContext } from "@test/canvasStub";
import type { Layer, PixelData, Pixel, Project } from "@/types";

const W = 16;
const H = 16;
const CELL_PX = 10;

const RED: Pixel = { r: 255, g: 0, b: 0, a: 255 };

function blankGrid(w = W, h = H): PixelData[][] {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({
      color: { r: 0, g: 0, b: 0, a: 0 },
      normal: 0,
      height: 0,
    })),
  );
}

/** A layer painted solid, so every erased cell is a visible difference. */
function solidLayer(id: string): Layer {
  const pixels = blankGrid();
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      pixels[y][x] = { color: { ...RED }, normal: 0, height: 0 };
    }
  }
  return { id, name: id, visible: true, pixels };
}

function mkProject(layers: Layer[] = [solidLayer("l-1")]): Project {
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
  } as unknown as Project;
}

let app: ApplicationStore;
let consoleError: ReturnType<typeof vi.spyOn>;
let contexts: WeakMap<HTMLCanvasElement, StubContext>;

beforeEach(() => {
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

  // See the header: without this every event maps to `null` and nothing draws.
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
});

function load(project: Project): void {
  runInAction(() => {
    app.adoptProject(project);
    app.domain.loadState = "loaded";
  });
}

function mountCanvas(): { surface: HTMLCanvasElement; container: HTMLElement } {
  const { container } = render(
    <StoreProvider store={app}>
      <CanvasContainer />
    </StoreProvider>,
  );
  act(() => {});
  const surface =
    container.querySelector<HTMLCanvasElement>(".canvas__surface");
  if (!surface) throw new Error("no .canvas__surface — the container changed");
  return { surface, container };
}

/** Aim at the CENTRE of a cell — a corner sits on a `floor()` boundary. */
function at(x: number, y: number) {
  return {
    clientX: x * CELL_PX + CELL_PX / 2,
    clientY: y * CELL_PX + CELL_PX / 2,
  };
}

/** One press-and-release at a single cell — the whole stroke, no drag. */
function tap(surface: HTMLElement, x: number, y: number) {
  act(() => {
    fireEvent.mouseDown(surface, { button: 0, ...at(x, y) });
    fireEvent.mouseUp(window, { button: 0, ...at(x, y) });
  });
}

/**
 * True when a cell carries no paint.
 *
 * ⚠️ MEASURED, NOT ASSUMED, AND IT IS THE TRAP IN THIS FILE. The eraser does
 * NOT write `{ r, g, b, a: 0 }` — it writes the packed empty sentinel
 * `color: 0`. A first version of these helpers tested `cell.color.a === 0`
 * and reported ZERO erased cells after a real, working eraser stroke; every
 * "greater than" assertion then failed against CORRECT code, and a
 * "not greater than" phrasing would have passed against broken code for the
 * same reason. Both forms are accepted here.
 */
function isEmpty(cell: PixelData): boolean {
  const color = cell.color as unknown;
  if (typeof color === "number") return color === 0;
  return (color as Pixel).a === 0;
}

/** How many cells on the selected layer now carry no paint. */
function erasedCount(): number {
  const layer = app.currentLayer;
  if (!layer) throw new Error("no selected layer — the fixture is wrong");
  let n = 0;
  for (const row of layer.pixels) {
    for (const cell of row) {
      if (isEmpty(cell)) n += 1;
    }
  }
  return n;
}

/** How many cells on the selected layer now carry paint. */
function paintedCount(): number {
  const layer = app.currentLayer;
  if (!layer) throw new Error("no selected layer — the fixture is wrong");
  let n = 0;
  for (const row of layer.pixels) {
    for (const cell of row) {
      if (!isEmpty(cell)) n += 1;
    }
  }
  return n;
}

describe("⭐⭐ the eraser draws at its OWN size, not the pencil's", () => {
  /**
   * The sizes are chosen so a wrong read is unambiguous, not off by one:
   * a 1-cell eraser and a 5-cell pencil differ by an order of magnitude in
   * area. The exact footprint of a given size is `getCirclePixels`'s business
   * and is tested there — what is asserted here is only WHICH SIZE was used,
   * by comparing two strokes against each other.
   */
  function eraseTapWith(eraser: number, pencil: number): number {
    load(mkProject());
    runInAction(() => {
      app.ui.tool.setBrushSize(pencil);
      app.ui.tool.setEraserBrushSize(eraser);
      app.ui.tool.setTool("eraser");
    });
    const { surface } = mountCanvas();
    tap(surface, 8, 8);
    return erasedCount();
  }

  it("⭐ a size-1 eraser erases far less than a size-5 pencil would", () => {
    // The defect: with `brushSize` read here, BOTH of these erased the
    // pencil's 5-wide footprint and the two numbers were equal.
    const small = eraseTapWith(1, 5);
    expect(small).toBeGreaterThan(0); // the stroke happened at all
    const big = eraseTapWith(5, 1);
    expect(big).toBeGreaterThan(small);
  });

  it("⭐ changing the PENCIL's size does not change the eraser's stroke", () => {
    // The sharpest form of the claim, and the one the old code fails: the
    // eraser is pinned at 1 while the pencil moves from 1 to 7.
    const withSmallPencil = eraseTapWith(1, 1);
    const withBigPencil = eraseTapWith(1, 7);
    expect(withBigPencil).toBe(withSmallPencil);
  });

  it("⭐ changing the ERASER's size DOES change its stroke", () => {
    // The negative of the above — without it, a container that ignored both
    // sizes and always erased one cell would pass the case before this.
    const one = eraseTapWith(1, 4);
    const seven = eraseTapWith(7, 4);
    expect(seven).toBeGreaterThan(one);
  });
});

describe("the pencil is unaffected — `brushSize` still means the pencil's", () => {
  function paintTapWith(pencil: number, eraser: number): number {
    // A blank layer, so painted cells are the visible difference.
    load(
      mkProject([
        { id: "l-1", name: "l-1", visible: true, pixels: blankGrid() },
      ]),
    );
    runInAction(() => {
      app.ui.tool.setBrushSize(pencil);
      app.ui.tool.setEraserBrushSize(eraser);
      app.ui.tool.setTool("pixel");
    });
    const { surface } = mountCanvas();
    tap(surface, 8, 8);
    return paintedCount();
  }

  it("⭐ changing the ERASER's size does not change the pencil's stroke", () => {
    // `activeToolBrushSize` branches on `"eraser"` ONLY. If a future edit made
    // it symmetric — or swapped the branch — this is what would catch it.
    const withSmallEraser = paintTapWith(3, 1);
    const withBigEraser = paintTapWith(3, 9);
    expect(withSmallEraser).toBeGreaterThan(0);
    expect(withBigEraser).toBe(withSmallEraser);
  });

  it("the pencil still follows its own size", () => {
    const one = paintTapWith(1, 2);
    const seven = paintTapWith(7, 2);
    expect(seven).toBeGreaterThan(one);
  });
});

describe("⚠️ fill-square keeps the PENCIL's size — the two sites NOT changed", () => {
  /**
   * The deliberate asymmetry, and the reason `:607`'s `brushSize` local
   * survives alongside `activeToolBrushSize`. `fill-square` is not the
   * eraser and has no size of its own; giving it one would mean another wire
   * key the user never asked for. So it reads the pencil's, whatever tool
   * setting the eraser carries.
   *
   * ⚠️ This is a CHARACTERISATION of a locked decision, not a claim that it
   * is the only defensible design. It is here so the decision cannot be
   * undone by accident.
   */
  function fillSquareTap(pencil: number, eraser: number): number {
    load(
      mkProject([
        { id: "l-1", name: "l-1", visible: true, pixels: blankGrid() },
      ]),
    );
    runInAction(() => {
      app.ui.tool.setBrushSize(pencil);
      app.ui.tool.setEraserBrushSize(eraser);
      app.ui.tool.setTool("fill-square");
    });
    const { surface } = mountCanvas();
    tap(surface, 8, 8);
    return paintedCount();
  }

  it("⭐ fill-square follows the PENCIL's size", () => {
    const two = fillSquareTap(2, 6);
    const six = fillSquareTap(6, 2);
    expect(two).toBeGreaterThan(0);
    expect(six).toBeGreaterThan(two);
  });

  it("⭐ fill-square ignores the ERASER's size entirely", () => {
    // If `squarePixelsAt` were switched to `activeToolBrushSize` this would
    // still pass (fill-square is not the eraser, so the getter returns the
    // pencil's size anyway) — so it is a CONTROL, kept to document the
    // contract rather than counted as coverage of the untouched sites.
    const withSmallEraser = fillSquareTap(4, 1);
    const withBigEraser = fillSquareTap(4, 9);
    expect(withBigEraser).toBe(withSmallEraser);
  });
});
