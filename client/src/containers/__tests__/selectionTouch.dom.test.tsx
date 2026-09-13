/**
 * 🏁 RECT AND LASSO SELECTION UNDER THE PENCIL — plan 09, task 08.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THIS FILE IS ACTUALLY GUARDING, AND WHY IT MOUNTS THE REAL CONTAINER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The bug this task fixed was not a wrong calculation. It was an ABSENT
 * branch: `"selection"` is a member of `isGestureTool`, the touch handlers
 * bail on every member of that list, and a selection branch written after
 * that bail never runs — SILENTLY. No error, no warning, just a Pencil that
 * does nothing, which is indistinguishable from an unimplemented feature.
 * That is the plan's highest-likelihood risk (R4) and the file itself carries
 * a warning about it at the reflection/pose branches.
 *
 * A test of the extracted helpers in isolation would be worthless against
 * exactly that failure: it would call `beginSelectionAt` directly and pass
 * whether or not the touch handler ever reaches it. So this file mounts the
 * REAL `CanvasContainer` and fires REAL `touchstart`/`touchmove`/`touchend`
 * events at the same `<canvas>` the Pencil hits, and asserts on what lands in
 * `SelectionUIStore` and on the rendered chrome.
 *
 * ── ⚠️ PROVEN BY REVERTING THE FIX, not by going green once ───────────────
 *
 * Each of the five ways this task could have been got wrong was re-injected
 * into the container and the suite re-run. Measured, of 18:
 *
 *   R4 — the touchstart branch moved BELOW the `isGestureTool` bail  10 fail
 *   the `handleTouchEnd` commit branch deleted                        6 fail
 *   the `handleTouchMove` `updateSelectionAt` call deleted            5 fail
 *   the `handleTouchCancel` abandon deleted                           2 fail
 *   `"selection"` put back into `MOUSE_ONLY_TOOLS`                    1 fail
 *
 * The cancel row is why the two cancel tests read the rendered SVG rather
 * than the store — see `overlayPathCount`. Store-only assertions scored ZERO
 * failures against a deleted abandon, i.e. they were worthless, and were
 * rewritten rather than kept.
 *
 * ── ⚠️ THE `getBoundingClientRect` STUB IS LOAD-BEARING ───────────────────
 *
 * jsdom reports a zero-size rect for every element, and `screenToPixel`'s
 * first line is `if (rect.width <= 0 || rect.height <= 0) return null`. So
 * WITHOUT a stub every `getPixelCoords` call in this file returns `null`,
 * every touch is discarded before it reaches any branch, and each assertion
 * below would read "no selection committed" — which is precisely the broken
 * behaviour these tests exist to detect. A false pass in the shape of the
 * exact bug. The rect is therefore stubbed to a real CELL_PX-per-cell box, so
 * client coordinates map onto grid cells the way they do on the device.
 *
 * ── What is NOT asserted here ─────────────────────────────────────────────
 *
 * Anything needing the physical iPad: whether a two-finger pinch feels right,
 * whether a resting palm actually reports `touchType: "stylus"` on the other
 * contact, whether the marching ants are drawn where the user expects. jsdom
 * can prove the gesture plumbing; it cannot prove the gesture.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { runInAction } from "mobx";

import { ApplicationStore } from "@/stores/ApplicationStore";
import { StoreProvider } from "@/stores/context";
import { CanvasContainer } from "@/containers/CanvasContainer";
import { canDispatchTool } from "@/ui/hooks/useCanvasPointer";
import { createStubContext } from "@test/canvasStub";
import type { StubContext } from "@test/canvasStub";
import type { Layer, PixelData, Pixel, Project } from "@/types";

/* ══ fixtures ═══════════════════════════════════════════════════════════════ */

const W = 8;
const H = 8;
/** Screen pixels per grid cell in the stubbed rect. */
const CELL_PX = 10;

const RED: Pixel = { r: 255, g: 0, b: 0, a: 255 };
const EMPTY: PixelData = { color: 0, normal: 0, height: 0 };

function blankGrid(w = W, h = H): PixelData[][] {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ ...EMPTY })),
  );
}

function mkLayer(
  id: string,
  cells: ReadonlyArray<[number, number]> = [],
): Layer {
  const pixels = blankGrid();
  for (const [x, y] of cells) {
    pixels[y][x] = { color: { ...RED }, normal: 0, height: 0 };
  }
  return { id, name: id, visible: true, pixels };
}

function mkProject(layers: Layer[] = [mkLayer("l-1")]): Project {
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

/* ══ harness ════════════════════════════════════════════════════════════════ */

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

  // ⚠️ See the header: without this every touch maps to `null` and every
  // assertion below passes for the wrong reason.
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

/** Mount, flush, and hand back the pointer surface plus its overlay root. */
function mountCanvas(): {
  surface: HTMLCanvasElement;
  container: HTMLElement;
} {
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

/**
 * How many SVG chrome paths are drawn, excluding the always-present grid.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ WHY THE CANCEL TESTS COUNT PATHS INSTEAD OF ASKING THE STORE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Measured while writing this file: deleting `commitSelection(false)` from
 * `handleTouchCancel` altogether left a store-only assertion — "nothing was
 * committed" — passing, and left a "the next gesture is clean" assertion
 * passing too. Both for the same wrong reason: `beginSelectionAt` REPLACES
 * `previewSelection` on every press, so the next press papers over whatever
 * the cancel failed to clear, and nothing was ever committed on a cancel
 * either way.
 *
 * The state a botched cancel actually leaks is VISIBLE, not stored: the
 * marching-ants box (two paths) or the lasso rubber band (one) stays drawn on
 * screen with no gesture left to remove it — precisely the "no stuck preview"
 * the task's manual check 6 looks for. So these tests read the rendered
 * chrome. Verified by deletion: with `commitSelection(false)` removed the
 * count stays at its mid-drag value across the cancel instead of returning to
 * the idle baseline.
 *
 * ⚠️ COMPARED TO A BASELINE, NOT TO ZERO. The chrome carries paths that have
 * nothing to do with selection — the brush/hover outline is one — and the
 * exact idle count is the SVG layer's business, not this test's. Asserting
 * `=== 0` would couple these tests to unrelated chrome and break the next
 * time an overlay is added. The claim is "back to how it was before the
 * gesture", which is what a cancel actually promises.
 */
function overlayPathCount(container: HTMLElement): number {
  return [...container.querySelectorAll("svg path")].filter(
    (p) => !p.classList.contains("canvas__svg-grid"),
  ).length;
}

/**
 * One Apple Pencil contact at grid cell `(x, y)`.
 *
 * ⚠️ `touchType: "stylus"` is not decoration. `pinchTouches` filters the
 * stylus out of the pinch count and `drawingTouch` gives it priority over any
 * finger, which is the whole "a Pencil plus a resting palm is still a stroke"
 * fix. A finger literal here would be testing a different gesture.
 *
 * ⚠️ `+ CELL_PX / 2` aims at the CENTRE of the cell. Aiming at its corner
 * would sit on a floor() boundary and make every assertion an off-by-one
 * argument rather than a behaviour claim.
 */
function pencilAt(x: number, y: number, target: Element) {
  return {
    clientX: x * CELL_PX + CELL_PX / 2,
    clientY: y * CELL_PX + CELL_PX / 2,
    touchType: "stylus",
    target,
  };
}

/** A plain finger, for the pinch case — a pinch is two FINGERS, never a stylus. */
function fingerAt(x: number, y: number, target: Element) {
  return {
    clientX: x * CELL_PX + CELL_PX / 2,
    clientY: y * CELL_PX + CELL_PX / 2,
    target,
  };
}

/** Select the selection tool and put it in `mode`. */
function useSelectionTool(mode: "rect" | "lasso" | "flood" | "color"): void {
  act(() => {
    app.ui.tool.setTool("selection");
    app.ui.tool.setSelectionMode(mode);
  });
}

/** The committed mask's packed indices, or `null` when nothing is selected. */
function committedMask(): Set<number> | null {
  return app.selectionUI.selection?.mask ?? null;
}

/** `[x, y]` pairs for the committed mask, sorted — readable in a failure. */
function committedCells(): [number, number][] {
  const sel = app.selectionUI.selection;
  if (!sel) return [];
  const out: [number, number][] = [];
  for (const idx of sel.mask) {
    out.push([idx % sel.width, Math.floor(idx / sel.width)]);
  }
  return out.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

/* ══ 1. the gate itself ═════════════════════════════════════════════════════ */

describe("canDispatchTool — selection is out of the mouse-only set", () => {
  it("⭐ dispatches `selection` from touch, which it did not before", () => {
    expect(canDispatchTool("selection", "touch")).toBe(true);
    expect(canDispatchTool("selection", "mouse")).toBe(true);
  });

  it("⭐ still refuses the other three — ONLY `selection` came out", () => {
    // Scope discipline, locked in MASTER §3: these three genuinely have no
    // touch gesture design and quietly "fixing" them here would ship
    // untested behaviour on the owner's device.
    for (const t of ["eyedropper", "origin", "reference-trace"]) {
      expect(canDispatchTool(t, "touch")).toBe(false);
      expect(canDispatchTool(t, "mouse")).toBe(true);
    }
  });
});

/* ══ 2. rect ════════════════════════════════════════════════════════════════ */

describe("rect mode — press, drag, release with the Pencil", () => {
  it("⭐⭐ commits the dragged box, which a touch used to do NOTHING at all", () => {
    load(mkProject());
    const { surface } = mountCanvas();
    useSelectionTool("rect");

    act(() => {
      fireEvent.touchStart(surface, { touches: [pencilAt(1, 1, surface)] });
    });
    act(() => {
      fireEvent.touchMove(surface, { touches: [pencilAt(3, 2, surface)] });
    });
    act(() => {
      fireEvent.touchEnd(surface, { touches: [] });
    });

    // (1,1)..(3,2) inclusive — 3 wide, 2 tall, six cells.
    expect(committedCells()).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
      [1, 2],
      [2, 2],
      [3, 2],
    ]);
  });

  it("commits a single cell for a press-and-lift with no drag", () => {
    load(mkProject());
    const { surface } = mountCanvas();
    useSelectionTool("rect");

    act(() => {
      fireEvent.touchStart(surface, { touches: [pencilAt(4, 5, surface)] });
    });
    act(() => {
      fireEvent.touchEnd(surface, { touches: [] });
    });

    // `beginSelectionAt` seeds a 1x1 preview, so the release has something to
    // commit even with no intervening move.
    expect(committedCells()).toEqual([[4, 5]]);
  });

  it("tracks BACKWARDS drags — the box normalises, it does not invert", () => {
    load(mkProject());
    const { surface } = mountCanvas();
    useSelectionTool("rect");

    act(() => {
      fireEvent.touchStart(surface, { touches: [pencilAt(5, 5, surface)] });
    });
    act(() => {
      fireEvent.touchMove(surface, { touches: [pencilAt(4, 4, surface)] });
    });
    act(() => {
      fireEvent.touchEnd(surface, { touches: [] });
    });

    expect(committedCells()).toEqual([
      [4, 4],
      [5, 4],
      [4, 5],
      [5, 5],
    ]);
  });
});

/* ══ 3. lasso ═══════════════════════════════════════════════════════════════ */

describe("lasso mode — a freehand path with the Pencil", () => {
  it("⭐⭐ commits a non-empty mask from a three-plus-point path", () => {
    load(mkProject());
    const { surface } = mountCanvas();
    useSelectionTool("lasso");

    act(() => {
      fireEvent.touchStart(surface, { touches: [pencilAt(1, 1, surface)] });
    });
    for (const [x, y] of [
      [5, 1],
      [5, 5],
      [1, 5],
      [1, 1],
    ] as const) {
      act(() => {
        fireEvent.touchMove(surface, { touches: [pencilAt(x, y, surface)] });
      });
    }
    act(() => {
      fireEvent.touchEnd(surface, { touches: [] });
    });

    const mask = committedMask();
    expect(mask).not.toBeNull();
    // A closed 5x5-ish box: the exact winding rule is `SelectionUIStore`'s
    // business and is covered by its own suite. What is claimed HERE is that
    // the touch path delivered the whole path to it — so: a real area, and
    // the interior cell is in it.
    expect(mask!.size).toBeGreaterThan(4);
    const sel = app.selectionUI.selection!;
    expect(mask!.has(3 * sel.width + 3)).toBe(true);
  });

  it("⭐ commits NOTHING for a single-point lasso", () => {
    // `commitSelection`'s `lassoPoints.length > 1` guard. A tap in lasso mode
    // is a mis-tap, not a one-cell selection — and note the store's
    // `selectLasso` WOULD commit a cell if it were handed one point, so this
    // guard is the container's and has to be tested at the container.
    load(mkProject());
    const { surface } = mountCanvas();
    useSelectionTool("lasso");

    act(() => {
      fireEvent.touchStart(surface, { touches: [pencilAt(2, 2, surface)] });
    });
    act(() => {
      fireEvent.touchEnd(surface, { touches: [] });
    });

    expect(committedMask()).toBeNull();
  });

  it("drops jitter — re-sampling the SAME cell does not extend the path", () => {
    load(mkProject());
    const { surface } = mountCanvas();
    useSelectionTool("lasso");

    act(() => {
      fireEvent.touchStart(surface, { touches: [pencilAt(2, 2, surface)] });
    });
    // Three moves, all landing on the one cell the press already recorded.
    for (let i = 0; i < 3; i++) {
      act(() => {
        fireEvent.touchMove(surface, { touches: [pencilAt(2, 2, surface)] });
      });
    }
    act(() => {
      fireEvent.touchEnd(surface, { touches: [] });
    });

    // Still ONE point, so still nothing to commit — the jitter filter held.
    expect(committedMask()).toBeNull();
  });
});

/* ══ 4. the one-shot modes ══════════════════════════════════════════════════ */

describe("flood and color modes — a single Pencil tap", () => {
  it("floods from the tapped cell", () => {
    load(mkProject([mkLayer("l-1")])); // fully transparent: one flood region
    const { surface } = mountCanvas();
    useSelectionTool("flood");

    act(() => {
      fireEvent.touchStart(surface, { touches: [pencilAt(2, 2, surface)] });
    });
    act(() => {
      fireEvent.touchEnd(surface, { touches: [] });
    });

    // An empty grid is one contiguous transparent region: the whole canvas.
    expect(committedMask()?.size).toBe(W * H);
  });

  it("selects by color from the tapped cell", () => {
    load(
      mkProject([
        mkLayer("l-1", [
          [0, 0],
          [7, 7],
        ]),
      ]),
    );
    const { surface } = mountCanvas();
    useSelectionTool("color");

    act(() => {
      fireEvent.touchStart(surface, { touches: [pencilAt(0, 0, surface)] });
    });
    act(() => {
      fireEvent.touchEnd(surface, { touches: [] });
    });

    // The two red cells, wherever they are — colour select is not contiguous.
    expect(committedCells()).toEqual([
      [0, 0],
      [7, 7],
    ]);
  });
});

/* ══ 5. cancel ══════════════════════════════════════════════════════════════ */

describe("touchcancel — abandon, do not commit", () => {
  it("⭐⭐ clears the on-screen rect preview and commits nothing", () => {
    load(mkProject());
    const { surface, container } = mountCanvas();
    useSelectionTool("rect");

    const idle = overlayPathCount(container);

    act(() => {
      fireEvent.touchStart(surface, { touches: [pencilAt(1, 1, surface)] });
    });
    act(() => {
      fireEvent.touchMove(surface, { touches: [pencilAt(4, 4, surface)] });
    });

    // ⚠️ The mid-drag assertion is not scenery. Without it, a cancel test that
    // only checks the count AFTER could pass on a run where the preview never
    // appeared in the first place — the R4 failure exactly. This pins that the
    // preview WAS on screen, so the drop below is a clear, not an absence.
    expect(overlayPathCount(container)).toBeGreaterThan(idle);

    act(() => {
      fireEvent.touchCancel(surface, { touches: [] });
    });

    // Gone: no stuck marching ants with no gesture left to remove them.
    expect(overlayPathCount(container)).toBe(idle);
    expect(committedMask()).toBeNull();
  });

  it("⭐ abandons a lasso the same way — the rubber band goes with it", () => {
    load(mkProject());
    const { surface, container } = mountCanvas();
    useSelectionTool("lasso");

    const idle = overlayPathCount(container);

    act(() => {
      fireEvent.touchStart(surface, { touches: [pencilAt(1, 1, surface)] });
    });
    for (const [x, y] of [
      [4, 1],
      [4, 4],
    ] as const) {
      act(() => {
        fireEvent.touchMove(surface, { touches: [pencilAt(x, y, surface)] });
      });
    }
    expect(overlayPathCount(container)).toBeGreaterThan(idle);

    act(() => {
      fireEvent.touchCancel(surface, { touches: [] });
    });

    expect(overlayPathCount(container)).toBe(idle);
    expect(committedMask()).toBeNull();
  });

  it("⭐ the next gesture after a cancel commits ONLY its own box", () => {
    // The store-visible half. Weaker than the two above on its own — see
    // `overlayPathCount`'s header for why — but it is the assertion that
    // catches a cancel which cleared the PREVIEW and left `selectionStart`
    // or `isSelectingRegion` behind, which the path count cannot see.
    load(mkProject());
    const { surface } = mountCanvas();
    useSelectionTool("rect");

    act(() => {
      fireEvent.touchStart(surface, { touches: [pencilAt(0, 0, surface)] });
    });
    act(() => {
      fireEvent.touchMove(surface, { touches: [pencilAt(6, 6, surface)] });
    });
    act(() => {
      fireEvent.touchCancel(surface, { touches: [] });
    });

    act(() => {
      fireEvent.touchStart(surface, { touches: [pencilAt(2, 2, surface)] });
    });
    act(() => {
      fireEvent.touchEnd(surface, { touches: [] });
    });

    expect(committedCells()).toEqual([[2, 2]]);
  });
});

/* ══ 6. arbitration — a pinch is not a selection ════════════════════════════ */

describe("gesture arbitration", () => {
  it("⭐ two FINGERS never select — the viewport listener owns the pinch", () => {
    // Trap named in the task: two-finger pinch must still pan/zoom. The
    // handler's own bail-out uses `pinchTouches`, which is why the contacts
    // here are fingers and not styluses.
    load(mkProject());
    const { surface } = mountCanvas();
    useSelectionTool("rect");

    act(() => {
      fireEvent.touchStart(surface, {
        touches: [fingerAt(1, 1, surface), fingerAt(5, 5, surface)],
      });
    });
    act(() => {
      fireEvent.touchMove(surface, {
        touches: [fingerAt(2, 2, surface), fingerAt(6, 6, surface)],
      });
    });
    act(() => {
      fireEvent.touchEnd(surface, { touches: [] });
    });

    expect(committedMask()).toBeNull();
  });

  it("⭐ a Pencil with a resting finger STILL selects (the 2026-08-28 fix)", () => {
    // `pinchTouches` drops the stylus, so pencil+finger is ONE pinch contact,
    // not two — and `drawingTouch` hands the gesture to the stylus. This is
    // the case that was reported as "unable to slide and draw"; a selection
    // drag has to survive a palm exactly as a stroke does.
    load(mkProject());
    const { surface } = mountCanvas();
    useSelectionTool("rect");

    const resting = fingerAt(7, 7, surface);
    act(() => {
      fireEvent.touchStart(surface, {
        touches: [resting, pencilAt(1, 1, surface)],
      });
    });
    act(() => {
      fireEvent.touchMove(surface, {
        touches: [resting, pencilAt(2, 3, surface)],
      });
    });
    act(() => {
      fireEvent.touchEnd(surface, { touches: [] });
    });

    expect(committedCells()).toEqual([
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
      [1, 3],
      [2, 3],
    ]);
  });

  it("does not select while a NON-selection tool is active", () => {
    // The bail is still a bail for everything else: the branch is scoped to
    // `currentTool === "selection"` and must not have widened it.
    load(mkProject());
    const { surface } = mountCanvas();
    act(() => {
      app.ui.tool.setTool("pixel");
    });

    act(() => {
      fireEvent.touchStart(surface, { touches: [pencilAt(1, 1, surface)] });
    });
    act(() => {
      fireEvent.touchMove(surface, { touches: [pencilAt(3, 3, surface)] });
    });
    act(() => {
      fireEvent.touchEnd(surface, { touches: [] });
    });

    expect(committedMask()).toBeNull();
  });
});

/* ══ 7. the mouse path must not have moved ══════════════════════════════════ */

describe("the shared gesture body did not change the MOUSE path", () => {
  it("⭐ a mouse rect drag still commits exactly the same box", () => {
    // Step 7's refactor moved the body out of `handleMouseDown/Move/Up` into
    // `beginSelectionAt` / `updateSelectionAt` / `commitSelection`. This is
    // the regression guard on the half of the change that had no new feature
    // in it — the mouse-up commit arrives on the WINDOW listener, not the
    // canvas, so the release is fired there.
    load(mkProject());
    const { surface } = mountCanvas();
    useSelectionTool("rect");

    act(() => {
      fireEvent.mouseDown(surface, {
        button: 0,
        clientX: 1 * CELL_PX + CELL_PX / 2,
        clientY: 1 * CELL_PX + CELL_PX / 2,
      });
    });
    act(() => {
      fireEvent.mouseMove(surface, {
        clientX: 3 * CELL_PX + CELL_PX / 2,
        clientY: 2 * CELL_PX + CELL_PX / 2,
      });
    });
    act(() => {
      fireEvent.mouseUp(window);
    });

    expect(committedCells()).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
      [1, 2],
      [2, 2],
      [3, 2],
    ]);
  });

  it("⭐ a mouse lasso still commits, and a 1-point one still does not", () => {
    load(mkProject());
    const { surface } = mountCanvas();
    useSelectionTool("lasso");

    act(() => {
      fireEvent.mouseDown(surface, {
        button: 0,
        clientX: 2 * CELL_PX + CELL_PX / 2,
        clientY: 2 * CELL_PX + CELL_PX / 2,
      });
    });
    act(() => {
      fireEvent.mouseUp(window);
    });
    expect(committedMask()).toBeNull();

    act(() => {
      fireEvent.mouseDown(surface, {
        button: 0,
        clientX: 1 * CELL_PX + CELL_PX / 2,
        clientY: 1 * CELL_PX + CELL_PX / 2,
      });
    });
    for (const [x, y] of [
      [5, 1],
      [5, 5],
      [1, 5],
      [1, 1],
    ] as const) {
      act(() => {
        fireEvent.mouseMove(surface, {
          clientX: x * CELL_PX + CELL_PX / 2,
          clientY: y * CELL_PX + CELL_PX / 2,
        });
      });
    }
    act(() => {
      fireEvent.mouseUp(window);
    });

    expect(committedMask()?.size).toBeGreaterThan(4);
  });
});
