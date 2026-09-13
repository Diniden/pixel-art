/**
 * BrushListContainer — the rail's brush list over the REAL `ApplicationStore`
 * (multi-brush projects, `docs/14-multi-brush-projects`, task 13; MASTER D8 /
 * D9 / D10).
 *
 * Harness: `BrushLayerPanelContainer.dom.test.tsx`'s — a two-brush project
 * installed straight into `BrushStore` (`installDocument` fires
 * `brushUI.adoptDocument`, which selects brush-1 / frame-1 / its top layer).
 *
 * What is pinned:
 *   (a) one row per brush, in array order, with `name` and `W×H`; the
 *       selected row highlighted;
 *   (b) ⭐ click → `brushUI.selectedBrushId`, AND the frame/layer ids are
 *       re-seated inside the new brush — a container that called
 *       `selectBrush(id)` without the document (MASTER §8, mistake 3) would
 *       clear all three ids and fail here;
 *   (c) "+" with name / W / H → a brush of that size appended and selected;
 *   (d) rename → `document.brushes[i].name`; duplicate → a new row after the
 *       source; delete disabled with one brush, enabled with two and
 *       re-selecting; move up / down reorder `document.brushes`;
 *   (e) ⭐ the thumbnails: the selected brush paints its SELECTED frame,
 *       every other brush its frame 0 (D10), and the revision repaints on a
 *       `pixelVersion` bump and on a frame change.
 *
 * jsdom has no canvas. For (a)–(d) that is fine — `getContext` returns null
 * and no `draw` runs. For (e) a minimal fake context is spied onto
 * `HTMLCanvasElement.prototype.getContext`: `putImageData` records the 1:1
 * composite the draw closure blits through its offscreen canvas, which is
 * compared byte-for-byte with `renderBrushFrame` over the expected frame —
 * the canvasStub "buffer in, buffer out" strategy, one level up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { runInAction } from "mobx";

import { tinyProject } from "@/store/__tests__/storeContract";
import { ApplicationStore } from "@/stores/ApplicationStore";
import { StoreProvider } from "@/stores/context";
import { BrushListContainer } from "@/containers/BrushListContainer";
import {
  createBrushBuffer,
  renderBrushFrame,
} from "@/ui/canvas/render/renderBrushFrame";
import {
  BRUSH_DOCUMENT_VERSION,
  createBrush,
  createBrushDocument,
  createBrushFrame,
  createBrushLayer,
} from "@/types";
import type { Brush, BrushDocument } from "@/types";

/**
 * "Round" (8×8, TWO frames with different cells) then "Dot" (4×4, one frame).
 * Array order is display order: Round is the top row.
 */
function twoBrushDocument(): BrushDocument {
  const round = createBrush("brush-1", "Round", 8, 8);
  round.frames[0].layers[0].pixels[1][1] = [255, 0, 0, 0];
  round.frames.push(
    createBrushFrame("frame-2", "Frame 2", [
      createBrushLayer("layer-1", "Layer 1", 8, 8),
    ]),
  );
  round.frames[1].layers[0].pixels[3][3] = [0, 255, 0, 0];

  const dot = createBrush("brush-2", "Dot", 4, 4);
  dot.frames[0].layers[0].pixels[2][2] = [0, 0, 255, 0];

  return { version: BRUSH_DOCUMENT_VERSION, brushes: [round, dot] };
}

let app: ApplicationStore;

beforeEach(() => {
  app = new ApplicationStore({ autoSaveEnabled: false });
  runInAction(() => {
    app.adoptProject(tinyProject());
    app.domain.loadState = "loaded";
  });
});

afterEach(() => {
  app.dispose();
});

/** Install `doc` as if `loadProject` had just succeeded. */
function install(doc: BrushDocument | null): void {
  runInAction(() => {
    app.brushes.projectName = doc ? "list-project" : "";
    app.brushes.installDocument(doc);
    app.brushes.loadState = doc ? "loaded" : "idle";
  });
}

function mount() {
  return render(
    <StoreProvider store={app}>
      <BrushListContainer />
    </StoreProvider>,
  );
}

/** The live document — `observable.ref`, replaced wholesale by every commit. */
function doc(): BrushDocument {
  const d = app.brushes.document;
  if (!d) throw new Error("no brush document installed");
  return d;
}

const names = () => doc().brushes.map((b) => b.name);
const ids = () => doc().brushes.map((b) => b.id);
const rows = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>(".brush-list__row"));
const selection = () =>
  runInAction(() => ({
    brush: app.brushUI.selectedBrushId,
    frame: app.brushUI.selectedFrameId,
    layer: app.brushUI.selectedLayerId,
  }));

describe("BrushListContainer — rows", () => {
  it("renders nothing without a document", () => {
    install(null);
    const { container } = mount();
    expect(container.querySelector(".brush-list")).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  it("one row per brush in array order, with name and W×H; the selected row highlighted", () => {
    install(twoBrushDocument());
    const { container } = mount();

    expect(container.querySelector(".brush-list")).not.toBeNull();
    expect(screen.getByText("Brushes")).toBeInTheDocument();
    const all = rows(container);
    expect(all).toHaveLength(2);
    expect(all[0]).toHaveTextContent("Round");
    expect(all[0]).toHaveTextContent("8×8");
    expect(all[1]).toHaveTextContent("Dot");
    expect(all[1]).toHaveTextContent("4×4");
    // Every brush is in memory, so every row has a thumbnail canvas.
    for (const row of all) expect(row.querySelector("canvas")).not.toBeNull();

    // `adoptDocument` selected brush-1 on install.
    expect(selection().brush).toBe("brush-1");
    expect(all[0]).toHaveClass("brush-list__row--selected");
    expect(all[0]).toHaveAttribute("aria-current", "true");
    expect(all[1]).not.toHaveClass("brush-list__row--selected");
    // Nothing recorded by rendering.
    expect(app.brushes.history.entries).toHaveLength(0);
  });
});

describe("BrushListContainer — selection", () => {
  it("⭐ click → selectBrush WITH the document: the brush id changes and the frame/layer are re-seated inside it", async () => {
    install(twoBrushDocument());
    const { container } = mount();
    // Move Round's frame selection off frame-1 so a re-seat is observable.
    act(() => app.brushUI.selectFrame("frame-2"));
    expect(selection()).toEqual({
      brush: "brush-1",
      frame: "frame-2",
      layer: "layer-1",
    });

    await userEvent.click(rows(container)[1]);

    // A `selectBrush(id)` without the document would have cleared all three
    // (`adoptDocument(null)`); with it, Dot's first frame and top layer are
    // selected and the highlight follows.
    expect(selection()).toEqual({
      brush: "brush-2",
      frame: "frame-1",
      layer: "layer-1",
    });
    expect(rows(container)[1]).toHaveClass("brush-list__row--selected");
    expect(rows(container)[0]).not.toHaveClass("brush-list__row--selected");
    // Selection is not a document change.
    expect(app.brushes.history.entries).toHaveLength(0);
  });
});

describe("BrushListContainer — the structural callbacks", () => {
  it("'+' with name / W / H appends a brush of that size, selected, one history entry", async () => {
    install(twoBrushDocument());
    const { container } = mount();

    await userEvent.click(screen.getByRole("button", { name: "New brush" }));
    await userEvent.type(screen.getByLabelText("Name"), "Two");
    const width = screen.getByLabelText("W");
    await userEvent.clear(width);
    await userEvent.type(width, "4{Enter}");
    const height = screen.getByLabelText("H");
    await userEvent.clear(height);
    await userEvent.type(height, "4{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(names()).toEqual(["Round", "Dot", "Two"]);
    const added = doc().brushes[2];
    expect(added.width).toBe(4);
    expect(added.height).toBe(4);
    expect(added.frames).toHaveLength(1);
    expect(app.brushes.history.entries).toHaveLength(1);
    // The store selected it (through the sink adapter, with the document).
    expect(selection()).toEqual({
      brush: added.id,
      frame: "frame-1",
      layer: "layer-1",
    });
    const all = rows(container);
    expect(all).toHaveLength(3);
    expect(all[2]).toHaveTextContent("Two");
    expect(all[2]).toHaveTextContent("4×4");
    expect(all[2]).toHaveClass("brush-list__row--selected");
    // The form closed.
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("double-click → rename → Enter reaches renameBrush: document.brushes[i].name", async () => {
    install(twoBrushDocument());
    mount();

    await userEvent.dblClick(screen.getByText("Dot"));
    const input = screen.getByRole("textbox", { name: "Brush name" });
    await userEvent.clear(input);
    await userEvent.type(input, "Point{Enter}");

    expect(names()).toEqual(["Round", "Point"]);
    expect(ids()).toEqual(["brush-1", "brush-2"]);
    expect(screen.getByText("Point")).toBeInTheDocument();
    expect(screen.queryByText("Dot")).toBeNull();
    expect(app.brushes.history.entries).toHaveLength(1);
  });

  it("duplicate inserts '<name> Copy' directly after the source and selects it", async () => {
    install(twoBrushDocument());
    const { container } = mount();

    await userEvent.click(
      screen.getByRole("button", { name: "Duplicate Round" }),
    );

    expect(names()).toEqual(["Round", "Round Copy", "Dot"]);
    const copy = doc().brushes[1];
    expect(copy.id).not.toBe("brush-1");
    expect(copy.width).toBe(8);
    expect(copy.frames).toHaveLength(2);
    expect(selection().brush).toBe(copy.id);
    const all = rows(container);
    expect(all).toHaveLength(3);
    expect(all[1]).toHaveTextContent("Round Copy");
    expect(all[1]).toHaveClass("brush-list__row--selected");
    expect(app.brushes.history.entries).toHaveLength(1);
  });

  it("delete is disabled with one brush", async () => {
    install(createBrushDocument(4, 4));
    mount();

    const del = screen.getByRole("button", { name: "Delete Brush 1" });
    expect(del).toBeDisabled();
    await userEvent.click(del);
    expect(names()).toEqual(["Brush 1"]);
    expect(app.brushes.history.entries).toHaveLength(0);
  });

  it("delete is enabled with two brushes; deleting the selected one re-selects the survivor", async () => {
    install(twoBrushDocument());
    const { container } = mount();
    expect(selection().brush).toBe("brush-1");

    const del = screen.getByRole("button", { name: "Delete Round" });
    expect(del).toBeEnabled();
    await userEvent.click(del);

    expect(names()).toEqual(["Dot"]);
    expect(selection()).toEqual({
      brush: "brush-2",
      frame: "frame-1",
      layer: "layer-1",
    });
    const all = rows(container);
    expect(all).toHaveLength(1);
    expect(all[0]).toHaveClass("brush-list__row--selected");
    // Now the last brush: its delete is disabled.
    expect(screen.getByRole("button", { name: "Delete Dot" })).toBeDisabled();
    expect(app.brushes.history.entries).toHaveLength(1);
  });

  it("move up / move down reorder document.brushes (array order = display order)", async () => {
    install(twoBrushDocument());
    const { container } = mount();

    // Round is at index 0: its up is disabled, Dot's down is disabled.
    expect(
      within(rows(container)[0]).getByRole("button", { name: "Move Round up" }),
    ).toBeDisabled();
    expect(
      within(rows(container)[1]).getByRole("button", { name: "Move Dot down" }),
    ).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Move Dot up" }));
    expect(ids()).toEqual(["brush-2", "brush-1"]);
    let all = rows(container);
    expect(all[0]).toHaveTextContent("Dot");
    expect(all[1]).toHaveTextContent("Round");
    // The selection is untouched by a reorder.
    expect(selection().brush).toBe("brush-1");
    expect(all[1]).toHaveClass("brush-list__row--selected");

    await userEvent.click(
      screen.getByRole("button", { name: "Move Dot down" }),
    );
    expect(ids()).toEqual(["brush-1", "brush-2"]);
    all = rows(container);
    expect(all[0]).toHaveTextContent("Round");
    expect(app.brushes.history.entries).toHaveLength(2);
  });
});

describe("BrushListContainer — thumbnails (D10) and the revision", () => {
  /** Every 1:1 composite the draw closures blit, in paint order. */
  let painted: Uint8ClampedArray[];

  beforeEach(() => {
    painted = [];
    // One fake context per canvas. The row canvas only needs `clearRect` /
    // `drawImage` / `imageSmoothingEnabled`; the offscreen canvas inside the
    // draw closure needs `createImageData` + `putImageData`, which is where
    // the composite is captured. Restored by `setup.dom.ts`.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () =>
        ({
          imageSmoothingEnabled: true,
          clearRect: () => {},
          drawImage: () => {},
          createImageData: (w: number, h: number) => ({
            data: new Uint8ClampedArray(w * h * 4),
            width: w,
            height: h,
          }),
          putImageData: (image: { data: Uint8ClampedArray }) => {
            painted.push(image.data.slice());
          },
        }) as unknown as CanvasRenderingContext2D,
    );
  });

  /** What `renderBrushFrame` yields for frame `frameIndex` of `brush`. */
  function expectedPixels(brush: Brush, frameIndex: number): Uint8ClampedArray {
    return renderBrushFrame(createBrushBuffer(brush.width, brush.height), {
      layers: brush.frames[frameIndex].layers,
      width: brush.width,
      height: brush.height,
    }).data;
  }

  it("⭐ the selected brush paints its SELECTED frame; every other brush paints frame 0", () => {
    const installed = twoBrushDocument();
    install(installed);
    const [round, dot] = installed.brushes;
    mount();

    // Mount: both rows painted, in row order — Round's frame-1, Dot's frame 0.
    expect(painted).toHaveLength(2);
    expect(painted[0]).toEqual(expectedPixels(round, 0));
    expect(painted[1]).toEqual(expectedPixels(dot, 0));
    // The two frames really differ, or the assertions below prove nothing.
    expect(expectedPixels(round, 1)).not.toEqual(expectedPixels(round, 0));

    // Step Round's timeline to frame-2: its thumbnail follows, Dot's does not.
    act(() => app.brushUI.selectFrame("frame-2"));
    expect(painted).toHaveLength(4);
    expect(painted[2]).toEqual(expectedPixels(round, 1));
    expect(painted[3]).toEqual(expectedPixels(dot, 0));

    // Select Dot: Round is no longer the selected brush, so it paints frame
    // 0 again regardless of the frame it was showing.
    act(() => app.brushUI.selectBrush("brush-2", app.brushes.document));
    expect(painted.length).toBeGreaterThanOrEqual(6);
    const last = painted.slice(-2);
    expect(last[0]).toEqual(expectedPixels(round, 0));
    expect(last[1]).toEqual(expectedPixels(dot, 0));
  });

  it("the revision repaints on a pixelVersion bump and on a selected-frame change, not otherwise", () => {
    install(twoBrushDocument());
    mount();
    expect(painted).toHaveLength(2);

    // A pixel write bumps `pixelVersion` only — both thumbnails repaint.
    act(() => {
      runInAction(() => {
        app.brushes.pixelVersion += 1;
      });
    });
    expect(painted).toHaveLength(4);

    // A frame change bumps neither counter — the low bits carry it.
    act(() => app.brushUI.selectFrame("frame-2"));
    expect(painted).toHaveLength(6);

    // Selecting the same frame again changes nothing: no repaint.
    act(() => app.brushUI.selectFrame("frame-2"));
    expect(painted).toHaveLength(6);

    // A structural change (rename, no pixel bump) bumps `domainVersion`.
    act(() => app.brushStructure.renameBrush("brush-2", "Spot"));
    expect(painted).toHaveLength(8);
  });
});
