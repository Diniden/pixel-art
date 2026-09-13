/**
 * The Brush tool draws (plan 12, task 05; MASTER D6, D7).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THIS PINS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The unit tests prove the pure module settles colours correctly and the
 * handler delegates correctly. Neither proves the CONTAINER feeds a real
 * stamp into the real context, or that a real press on the real canvas
 * reaches the layer through `actions.setPixels` — the `eraserBrushWidth`
 * failure mode ("tested and unconsumed"). So this file mounts the REAL
 * `CanvasContainer` with an installed brush document, presses the surface,
 * and reads the project layer back:
 *
 *   - a press writes EXACTLY the settled colours at `(press) + offset`, and
 *     nothing else — expected values computed with `settlePixelBrushColor`;
 *   - `app.undo()` restores the cells (one entry per stroke);
 *   - a drag writes a ribbon, and ONE undo removes the whole drag;
 *   - with `installDocument(null)` a press writes nothing but the stroke
 *     still records ONE history entry (`strokeControl.end` snapshots an
 *     empty transaction — the pinned empty-stroke behaviour);
 *   - with a selection in `editMask` behaviour the stamp is clipped to the
 *     mask, because writes go through the single `actions.setPixels` funnel.
 *
 * ── ⚠️ THE `getBoundingClientRect` STUB IS LOAD-BEARING ───────────────────
 *
 * Transcribed from `eraserBrushWidth.dom.test.tsx`: jsdom reports a
 * zero-size rect for every element and `screenToPixel` then returns `null`
 * for every event. Without the stub NOTHING is drawn and every assertion
 * that counts written cells would read 0 for a broken tool and a correct
 * one alike.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { runInAction } from "mobx";

import { ApplicationStore } from "@/stores/ApplicationStore";
import { StoreProvider } from "@/stores/context";
import { CanvasContainer } from "@/containers/CanvasContainer";
import { createStubContext } from "@test/canvasStub";
import type { StubContext } from "@test/canvasStub";
import { createBrushDocument, createBrushLayer } from "@/types";
import type { BrushDocument, Layer, PixelData, Pixel, Project } from "@/types";
import { settlePixelBrushColor } from "@/ui/canvas/tools/pixelBrushStamp";

const W = 8;
const H = 8;
const CELL_PX = 10;

const BASE: Pixel = { r: 200, g: 40, b: 40, a: 255 };

/* ── The brush: 3×3, origin (1,1) ──────────────────────────────────────────── */

/** rgb deltas at (0,0) and (2,1); an hsl hue shift at (2,1) on top. */
const RGB_AT_00: [number, number, number, number] = [-100, 60, 0, 0];
const RGB_AT_21: [number, number, number, number] = [0, 0, 100, -55];
const HSL_AT_21: [number, number, number, number] = [85, 0, 0, 0];

function brushDocument(): BrushDocument {
  const doc = createBrushDocument(3, 3);
  const rgb = createBrushLayer("rgb-1", "rgb", 3, 3, "rgb");
  rgb.pixels[0]![0] = RGB_AT_00;
  rgb.pixels[1]![2] = RGB_AT_21;
  const hsl = createBrushLayer("hsl-1", "hsl", 3, 3, "hsl");
  hsl.pixels[1]![2] = HSL_AT_21;
  doc.frames = [{ id: "frame-1", name: "Frame 1", layers: [rgb, hsl] }];
  return doc;
}

/** What the two painted cells settle to from BASE — the pure module's answer. */
const EXPECTED_00 = settlePixelBrushColor(BASE, [
  { channelType: "rgb", delta: RGB_AT_00 },
]);
const EXPECTED_21 = settlePixelBrushColor(BASE, [
  { channelType: "rgb", delta: RGB_AT_21 },
  { channelType: "hsl", delta: HSL_AT_21 },
]);

/* ── The project ───────────────────────────────────────────────────────────── */

function blankGrid(w = W, h = H): PixelData[][] {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({
      color: { r: 0, g: 0, b: 0, a: 0 },
      normal: 0,
      height: 0,
    })),
  );
}

function mkProject(
  layers: Layer[] = [
    { id: "l-1", name: "l-1", visible: true, pixels: blankGrid() },
  ],
): Project {
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
    palettes: [{ id: "pal-1", name: "Palette", colors: [BASE] }],
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
  // ⚠️ `app.history` is the module-level `editorHistory` singleton, shared by
  // every store in this file (`stores/history/editorHistory.ts`). Without a
  // reset, entries — and the redo tail a previous test's `undo()` left, which
  // the next push truncates — carry across tests and every "one entry per
  // stroke" count is measured against a moving baseline. Measured: a first
  // draft without this line read +2 and +0 for strokes that recorded one.
  app.history.clear();
  // The hook calls `brushes.init()` when the tool is selected. The document
  // is installed by hand below, so the network path must be inert — and MSW
  // in this lane would fail the test loudly if it were reached.
  vi.spyOn(app.brushes, "init").mockImplementation((() =>
    Promise.resolve()) as never);
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

function installBrush(doc: BrushDocument | null): void {
  runInAction(() => {
    app.brushes.brushName = doc ? "test-brush" : "";
    app.brushes.installDocument(doc);
    app.brushes.loadState = doc ? "loaded" : "idle";
  });
}

function selectBrushTool(): void {
  runInAction(() => {
    app.ui.tool.setColor(BASE);
    app.ui.tool.setTool("brush");
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

/**
 * One press-and-release at a single cell — the whole stroke, no drag.
 *
 * ⚠️ TWO `act()` CALLS, deliberately. The container's window `mouseup`
 * listener calls `mouseUpRef.current()`, a closure re-pointed on re-render.
 * Fired in the SAME `act` as the press, the release runs before React has
 * re-rendered for the press, so the stale closure sees `isDrawing === false`
 * and the stroke never ends: the transaction stays open, no history entry is
 * pushed, and `undo()` has nothing to undo. Measured — a first draft with
 * one `act` read 0 entries after a tap that painted, and "undo" left the
 * cells in place. (The eraser rig's single-`act` tap never checks anything
 * after the release, so it never noticed.)
 */
function tap(surface: HTMLElement, x: number, y: number) {
  act(() => {
    fireEvent.mouseDown(surface, { button: 0, ...at(x, y) });
  });
  act(() => {
    fireEvent.mouseUp(window, { button: 0, ...at(x, y) });
  });
}

/** Press at `from`, move through each point, release at the last. */
function drag(surface: HTMLElement, points: Array<[number, number]>) {
  const [first, ...rest] = points;
  act(() => {
    fireEvent.mouseDown(surface, { button: 0, ...at(first![0], first![1]) });
  });
  for (const [x, y] of rest) {
    act(() => {
      fireEvent.mouseMove(surface, { button: 0, ...at(x, y) });
    });
  }
  const last = points[points.length - 1]!;
  act(() => {
    fireEvent.mouseUp(window, { button: 0, ...at(last[0], last[1]) });
  });
}

/** The colour a cell holds, or `null` for the packed-empty sentinel / a = 0. */
function colorAt(x: number, y: number): Pixel | null {
  const layer = app.currentLayer;
  if (!layer) throw new Error("no selected layer — the fixture is wrong");
  const color = layer.pixels[y]![x]!.color as unknown;
  if (typeof color === "number") return null;
  const c = color as Pixel;
  return c.a === 0 ? null : { r: c.r, g: c.g, b: c.b, a: c.a };
}

/** Every painted cell as `"x,y"`, sorted. */
function paintedCells(): string[] {
  const out: string[] = [];
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (colorAt(x, y)) out.push(`${x},${y}`);
    }
  }
  return out.sort();
}

/* ══ 1. a press ═════════════════════════════════════════════════════════════ */

describe("⭐⭐ a press stamps the brush's settled colours at (press) + offset", () => {
  it("writes exactly the two painted cells, tinted per layer from the selected colour", () => {
    load(mkProject());
    installBrush(brushDocument());
    selectBrushTool();
    const { surface } = mountCanvas();

    tap(surface, 4, 4);

    // Origin (1,1) sits on (4,4): (0,0) → (3,3), (2,1) → (5,4).
    expect(paintedCells()).toEqual(["3,3", "5,4"]);
    expect(colorAt(3, 3)).toEqual(EXPECTED_00);
    expect(colorAt(5, 4)).toEqual(EXPECTED_21);
    // And the expected values are genuinely settled, not the base colour —
    // otherwise a container that stamped `currentColor` would pass.
    expect(EXPECTED_00).not.toEqual(BASE);
    expect(EXPECTED_21).not.toEqual(BASE);
    expect(EXPECTED_21.a).toBe(200); // −55 alpha from the rgb layer
  });

  it("is clipped at the grid edge — a press at (0,0) keeps only the in-bounds cell", () => {
    load(mkProject());
    installBrush(brushDocument());
    selectBrushTool();
    const { surface } = mountCanvas();

    tap(surface, 0, 0);

    // (0,0)+(-1,-1) is off-grid; (0,0)+(1,0) = (1,0) survives.
    expect(paintedCells()).toEqual(["1,0"]);
    expect(colorAt(1, 0)).toEqual(EXPECTED_21);
  });

  it("⭐ app.undo() restores the cells — one entry per press", () => {
    load(mkProject());
    installBrush(brushDocument());
    selectBrushTool();
    const { surface } = mountCanvas();
    const entriesBefore = app.history.entries.length;

    tap(surface, 4, 4);
    expect(paintedCells()).toEqual(["3,3", "5,4"]);
    expect(app.history.entries.length).toBe(entriesBefore + 1);

    act(() => {
      app.undo();
    });
    expect(paintedCells()).toEqual([]);

    // A second press after the undo paints again, identically.
    tap(surface, 4, 4);
    expect(paintedCells()).toEqual(["3,3", "5,4"]);
    expect(colorAt(3, 3)).toEqual(EXPECTED_00);
  });

  it("⭐ a changed selected colour re-settles the stamp from the new base", () => {
    load(mkProject());
    installBrush(brushDocument());
    selectBrushTool();
    const { surface } = mountCanvas();

    const GREEN: Pixel = { r: 10, g: 220, b: 30, a: 255 };
    act(() => {
      app.ui.tool.setColor(GREEN);
    });
    tap(surface, 4, 4);

    expect(colorAt(3, 3)).toEqual(
      settlePixelBrushColor(GREEN, [{ channelType: "rgb", delta: RGB_AT_00 }]),
    );
    expect(colorAt(3, 3)).not.toEqual(EXPECTED_00);
  });
});

/* ══ 2. a drag ══════════════════════════════════════════════════════════════ */

describe("⭐ a drag stamps a ribbon and ONE undo removes the whole drag", () => {
  it("stamps at every step of the segment", () => {
    load(mkProject());
    installBrush(brushDocument());
    selectBrushTool();
    const { surface } = mountCanvas();
    const entriesBefore = app.history.entries.length;

    drag(surface, [
      [2, 4],
      [5, 4],
    ]);

    // Steps (2,4)…(5,4): (0,0)-cells at (1,3),(2,3),(3,3),(4,3); (2,1)-cells
    // at (3,4),(4,4),(5,4),(6,4).
    expect(paintedCells()).toEqual(
      ["1,3", "2,3", "3,3", "4,3", "3,4", "4,4", "5,4", "6,4"].sort(),
    );
    expect(colorAt(2, 3)).toEqual(EXPECTED_00);
    expect(colorAt(6, 4)).toEqual(EXPECTED_21);
    expect(app.history.entries.length).toBe(entriesBefore + 1);

    act(() => {
      app.undo();
    });
    expect(paintedCells()).toEqual([]);
  });
});

/* ══ 3. no document ═════════════════════════════════════════════════════════ */

describe("with no brush document loaded", () => {
  it("⭐ a press writes nothing, but the stroke still records ONE history entry", () => {
    // `strokeControl.end` snapshots an EMPTY transaction so begin/end with no
    // write leaves exactly one entry (`editorHistory.ts`, the pinned
    // empty-stroke case). The brush with no stamp behaves exactly like a
    // pencil that paints nothing — MASTER D7.
    load(mkProject());
    installBrush(null);
    selectBrushTool();
    const { surface } = mountCanvas();
    const entriesBefore = app.history.entries.length;

    tap(surface, 4, 4);

    expect(paintedCells()).toEqual([]);
    expect(app.history.entries.length).toBe(entriesBefore + 1);
  });

  it("calls brushes.init() on selecting the tool, so a fresh load gets a brush", () => {
    load(mkProject());
    selectBrushTool();
    mountCanvas();
    expect(app.brushes.init).toHaveBeenCalled();
  });
});

/* ══ 4. the funnel — selection mask ═════════════════════════════════════════ */

describe("⭐ writes go through actions.setPixels — the selection mask clips the stamp", () => {
  it("in editMask behaviour only the cells inside the selection are written", () => {
    load(mkProject());
    installBrush(brushDocument());
    selectBrushTool();
    runInAction(() => {
      // A 1-cell selection over (5,4) — the (2,1) cell of a press at (4,4).
      app.ui.tool.setSelectionBehavior("editMask");
      app.selectionUI.setSelection(
        { x: 5, y: 4, width: 1, height: 1 },
        app.selectionDims,
      );
    });
    const { surface } = mountCanvas();

    tap(surface, 4, 4);

    expect(paintedCells()).toEqual(["5,4"]);
    expect(colorAt(5, 4)).toEqual(EXPECTED_21);
  });
});
