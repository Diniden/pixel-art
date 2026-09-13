/**
 * BrushLayerPanelContainer — the colour source reaches the rows and the
 * store (plan 13 `docs/13-brush-source-and-resize`, task 04; MASTER D1–D3).
 *
 * What is pinned, over the REAL `ApplicationStore` with a 2-frame, 2-layer
 * brush installed (harness: `PixelStudioPanelContainer.dom.test.tsx` +
 * the installer from `pixelBrushTool.dom.test.tsx`):
 *
 *   (a) each row shows the source badge the DOCUMENT says — `SEL` for a
 *       layer without the key, `TGT` for one with `colorSource: "target"`;
 *   (b) ⭐ the `SEL` badge's menu → "Target pixel" reaches
 *       `brushStructure.setLayerColorSource`: EVERY frame's copy of the
 *       layer gains the key and the brush's OWN history grows by one entry
 *       — a container that forgot `onSetColorSource` cannot compile (the
 *       prop is required, task 03), but one wired to the wrong store method
 *       would pass (a) and fail here;
 *   (c) ⭐ the "+" flow — "Target pixel" then "RGB" — creates the layer
 *       with `colorSource: "target"` in every frame, i.e. the container
 *       forwards BOTH `onAddLayer` arguments to `addLayer`.
 *
 * Multi-brush projects (plan 14 `docs/14-multi-brush-projects`, task 12):
 * the document is brush-2 — one brush, `brush-1`, holding the two frames —
 * and every read goes through the SELECTED brush (`brush()` below). The last
 * describe installs a TWO-brush document and pins that
 *   (d) ⭐ `brushUI.selectBrush("brush-2", doc)` re-renders the rows to
 *       brush 2's layers, and
 *   (e) ⭐ "+" adds to brush 2 ONLY — brush 1's brush and frame objects keep
 *       their identity in the new document (the spine copy stops at the
 *       touched brush, MASTER §8 mistake 2).
 *
 * The menu is a portal, so `screen` queries against `document.body`. jsdom
 * reports zero-size rects; the menu only uses them to position itself.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { runInAction } from "mobx";

import { tinyProject } from "@/store/__tests__/storeContract";
import { ApplicationStore } from "@/stores/ApplicationStore";
import { StoreProvider } from "@/stores/context";
import { BrushLayerPanelContainer } from "@/containers/BrushLayerPanelContainer";
import {
  BRUSH_DOCUMENT_VERSION,
  createBrushFrame,
  createBrushLayer,
} from "@/types";
import type { Brush, BrushDocument, BrushLayer } from "@/types";

const W = 4;
const H = 4;

/** Two frames × two layers: `layer-1` (rgb, no key) and `layer-2` (hsl, target). */
function twoLayerBrush(): Brush {
  const layers = (): BrushLayer[] => [
    createBrushLayer("layer-1", "Layer 1", W, H, "rgb"),
    createBrushLayer("layer-2", "Layer 2", W, H, "hsl", "target"),
  ];
  return {
    id: "brush-1",
    name: "Brush 1",
    width: W,
    height: H,
    frames: [
      createBrushFrame("frame-1", "Frame 1", layers()),
      createBrushFrame("frame-2", "Frame 2", layers()),
    ],
    appliedGroups: [],
  };
}

/** brush-2: the one two-layer brush. */
function twoLayerDocument(): BrushDocument {
  return { version: BRUSH_DOCUMENT_VERSION, brushes: [twoLayerBrush()] };
}

/**
 * Two brushes: the two-layer 4×4 one, then a 2×2 "Dot" with ONE frame and
 * one layer whose name no row of brush 1 shares. Its ids repeat brush 1's
 * (`frame-1`, `layer-1`) — ids are unique within a brush only.
 */
function twoBrushDocument(): BrushDocument {
  const dot: Brush = {
    id: "brush-2",
    name: "Dot",
    width: 2,
    height: 2,
    frames: [
      createBrushFrame("frame-1", "Frame 1", [
        createBrushLayer("layer-1", "Dot layer", 2, 2, "normal"),
      ]),
    ],
    appliedGroups: [],
  };
  return { version: BRUSH_DOCUMENT_VERSION, brushes: [twoLayerBrush(), dot] };
}

let app: ApplicationStore;

beforeEach(() => {
  app = new ApplicationStore({ autoSaveEnabled: false });
  runInAction(() => {
    app.adoptProject(tinyProject());
    app.domain.loadState = "loaded";
    // Install the brush as if `loadProject` had just succeeded.
    // `installDocument` clears the brush's own history and fires
    // `brushUI.adoptDocument`, which selects frame-1 / the top layer.
    app.brushes.projectName = "panel-brush";
    app.brushes.installDocument(twoLayerDocument());
    app.brushes.loadState = "loaded";
  });
});

afterEach(() => {
  app.dispose();
});

function mount() {
  return render(
    <StoreProvider store={app}>
      <BrushLayerPanelContainer />
    </StoreProvider>,
  );
}

/** The live document — `observable.ref`, replaced wholesale by every commit. */
function doc(): BrushDocument {
  const d = app.brushes.document;
  if (!d) throw new Error("no brush document installed");
  return d;
}

/** The SELECTED brush of the live document — what the panel projects. */
function brush(): Brush {
  const b = app.brushUI.selectedBrushIn(doc());
  if (!b) throw new Error("no brush selected");
  return b;
}

/** `layer` as each frame of the selected brush holds it, in frame order. */
function copiesOf(layerId: string): BrushLayer[] {
  return brush().frames.map((f) => {
    const l = f.layers.find((x) => x.id === layerId);
    if (!l) throw new Error(`${layerId} missing from ${f.id}`);
    return l;
  });
}

const radio = (name: RegExp | string) =>
  screen.getByRole("menuitemradio", { name });
const sourceBadges = () =>
  screen.getAllByRole("button", { name: /^Colour source:/ });

describe("BrushLayerPanelContainer — colour source", () => {
  it("shows each layer's source badge from the document: SEL without the key, TGT with it", () => {
    mount();
    expect(screen.getByLabelText("Colour source: TGT")).not.toBeNull();
    expect(screen.getByLabelText("Colour source: SEL")).not.toBeNull();
    expect(sourceBadges()).toHaveLength(2);
    // The badges sit in the rows they belong to: TGT is layer-2, displayed
    // first (top of the stack), SEL is layer-1 below it.
    const tgt = screen.getByLabelText("Colour source: TGT");
    const sel = screen.getByLabelText("Colour source: SEL");
    expect(
      tgt.compareDocumentPosition(sel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Nothing recorded by rendering.
    expect(app.brushes.history.entries).toHaveLength(0);
  });

  it("the SEL badge → Target pixel reaches setLayerColorSource: every frame gains the key, one history entry", () => {
    mount();
    expect(copiesOf("layer-1").every((l) => !("colorSource" in l))).toBe(true);
    const entriesBefore = app.brushes.history.entries.length;

    fireEvent.click(screen.getByLabelText("Colour source: SEL"));
    // The row menu, anchored on the badge: Target is unticked for layer-1.
    expect(
      screen.getByRole("menu", { name: "Layer 1 channel" }),
    ).not.toBeNull();
    expect(radio(/^Selected colour/)).toHaveAttribute("aria-checked", "true");
    expect(radio(/^Target pixel/)).toHaveAttribute("aria-checked", "false");

    fireEvent.click(radio(/^Target pixel/));

    // The store's relabel: uniform across frames (D6), key present only
    // for "target" (D1), one snapshot on the brush's OWN history (D2).
    expect(copiesOf("layer-1").map((l) => l.colorSource)).toEqual([
      "target",
      "target",
    ]);
    expect(app.brushes.history.entries).toHaveLength(entriesBefore + 1);
    // The menu closed and the row now reads TGT — the badge is projected
    // from the new document, not from local state.
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getAllByLabelText("Colour source: TGT")).toHaveLength(2);
    expect(screen.queryByLabelText("Colour source: SEL")).toBeNull();
    // layer-2 is untouched.
    expect(copiesOf("layer-2").map((l) => l.colorSource)).toEqual([
      "target",
      "target",
    ]);
  });

  it("the TGT badge → Selected colour drops the key in every frame", () => {
    mount();
    fireEvent.click(screen.getByLabelText("Colour source: TGT"));
    expect(radio(/^Target pixel/)).toHaveAttribute("aria-checked", "true");
    fireEvent.click(radio(/^Selected colour/));

    expect(copiesOf("layer-2").every((l) => !("colorSource" in l))).toBe(true);
    expect(app.brushes.history.entries).toHaveLength(1);
    expect(screen.getAllByLabelText("Colour source: SEL")).toHaveLength(2);
  });

  it("the '+' flow — Target pixel, then RGB — creates a layer with colorSource 'target' in every frame", () => {
    mount();
    const entriesBefore = app.brushes.history.entries.length;

    fireEvent.click(screen.getByRole("button", { name: "Add layer" }));
    fireEvent.click(radio(/^Target pixel/));
    // Sticky tick, still open, nothing created yet (D3).
    expect(brush().frames[0].layers).toHaveLength(2);
    expect(radio(/^Target pixel/)).toHaveAttribute("aria-checked", "true");

    fireEvent.click(radio(/^RGB/));

    // Both `onAddLayer` arguments reached `addLayer(name, channel, source)`.
    const frames = brush().frames;
    expect(frames.map((f) => f.layers.length)).toEqual([3, 3]);
    const added = frames.map((f) => f.layers[f.layers.length - 1]);
    expect(added.map((l) => l.name)).toEqual(["Layer 3", "Layer 3"]);
    expect(added.map((l) => l.channelType)).toEqual(["rgb", "rgb"]);
    expect(added.map((l) => l.colorSource)).toEqual(["target", "target"]);
    expect(new Set(added.map((l) => l.id)).size).toBe(1);
    expect(app.brushes.history.entries).toHaveLength(entriesBefore + 1);
    // The store selected the new layer; the panel shows three rows with
    // the new TGT badge on top.
    expect(app.brushUI.selectedLayerId).toBe(added[0].id);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(sourceBadges()).toHaveLength(3);
    expect(screen.getAllByLabelText("Colour source: TGT")).toHaveLength(2);
  });

  it("the '+' flow with the default source creates a layer WITHOUT the key", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Add layer" }));
    fireEvent.click(radio(/^Normal/));

    const added = brush().frames.map((f) => f.layers[f.layers.length - 1]);
    expect(added.map((l) => l.channelType)).toEqual(["normal", "normal"]);
    expect(added.every((l) => !("colorSource" in l))).toBe(true);
    expect(screen.getAllByLabelText("Colour source: SEL")).toHaveLength(2);
  });
});

/** The row names in DISPLAY order (top of the stack first). */
function rowNames(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll(".brush-layer-panel__name"),
    (el) => el.textContent ?? "",
  );
}

describe("BrushLayerPanelContainer — the selected brush (plan 14 task 12)", () => {
  beforeEach(() => {
    runInAction(() => {
      app.brushes.installDocument(twoBrushDocument());
    });
  });

  it("⭐ selectBrush('brush-2', doc) re-renders the rows to brush 2's layers", () => {
    const { container } = mount();
    // `adoptDocument` kept brush-1 (first) selected: its two layers, top first.
    expect(app.brushUI.selectedBrushId).toBe("brush-1");
    expect(rowNames(container)).toEqual(["Layer 2", "Layer 1"]);

    act(() => {
      app.brushUI.selectBrush("brush-2", app.brushes.document);
    });

    expect(app.brushUI.selectedBrushId).toBe("brush-2");
    expect(rowNames(container)).toEqual(["Dot layer"]);
    // Brush 2's top layer is selected and its badge is the one shown.
    expect(app.brushUI.selectedLayerId).toBe("layer-1");
    expect(screen.getByLabelText("Channel: NRM")).not.toBeNull();
    // Nothing recorded by switching.
    expect(app.brushes.history.entries).toHaveLength(0);

    act(() => {
      app.brushUI.selectBrush("brush-1", app.brushes.document);
    });
    expect(rowNames(container)).toEqual(["Layer 2", "Layer 1"]);
  });

  it("⭐ '+' adds a layer to brush 2 ONLY: brush 1's brush and frame objects keep their identity", () => {
    const { container } = mount();
    act(() => {
      app.brushUI.selectBrush("brush-2", app.brushes.document);
    });
    const before = doc();
    const roundBefore = before.brushes[0];

    fireEvent.click(screen.getByRole("button", { name: "Add layer" }));
    fireEvent.click(radio(/^RGB/));

    const after = doc();
    expect(after).not.toBe(before);
    // Brush 1 is the SAME object, frames included — untouched by reference.
    expect(after.brushes[0]).toBe(roundBefore);
    expect(after.brushes[0].frames[0]).toBe(roundBefore.frames[0]);
    expect(after.brushes[0].frames[1]).toBe(roundBefore.frames[1]);
    expect(after.brushes[0].frames.map((f) => f.layers.length)).toEqual([2, 2]);
    // Brush 2 gained "Layer 2" (counted against ITS frame 0), in every frame.
    expect(after.brushes[1]).not.toBe(before.brushes[1]);
    expect(
      after.brushes[1].frames.map((f) => f.layers.map((l) => l.name)),
    ).toEqual([["Dot layer", "Layer 2"]]);
    expect(app.brushes.history.entries).toHaveLength(1);
    // The rows follow: brush 2's two layers, new one on top and selected.
    expect(rowNames(container)).toEqual(["Layer 2", "Dot layer"]);
    expect(app.brushUI.selectedLayerId).toBe(
      after.brushes[1].frames[0].layers[1].id,
    );
  });
});
