/**
 * The other-hand colour rail honours the edge/fill target (plan 09 task 07).
 *
 * ── What was broken ───────────────────────────────────────────────────────
 *
 * `ColorSection` was EDGE-ONLY: it read `ui.tool.selectedColor` and wrote
 * `app.setColorAndAddToHistory`, with no `colorTarget` read and no
 * `setFillColor` call anywhere in the other-hand tree. So a thumb slider
 * dragged on an iPad with the Fill tab open silently recoloured the pencil —
 * one of the three hardcoded-edge sites the owner reported as "colour
 * selections only set the edge colour".
 *
 * The fix routes every read through `app.activeColor` and every write through
 * `app.setActiveColor`, the single branch point from task 05. These tests pin
 * that the branch is actually taken, in BOTH directions — an assertion that
 * only reads the fill slot would still pass if the container wrote both.
 *
 * ── Why this mounts the real container ────────────────────────────────────
 *
 * The rail's whole job is to project store state into widget specs, and the
 * defect lived in that projection. Testing the callbacks in isolation would
 * re-implement the projection in the test and prove nothing about what the
 * user's thumb actually hits, so the real `OtherHandRailContainer` is
 * rendered and driven through its DOM.
 *
 * ⚠️ `otherHandSection` is set DIRECTLY rather than through `enterOtherHand`.
 * That method is a deliberate no-op off a tablet (`LayoutUIStore:401-404`,
 * gated on `otherHandAvailable`), and jsdom classifies as "desktop" because
 * it reports no coarse pointer. The section field is a plain observable, so
 * setting it mounts the section under test without pretending jsdom is an
 * iPad or stubbing `detectDeviceClass`. What is under test is the colour
 * projection, not the availability gate — `LayoutUIStore.otherHand.test.ts`
 * already covers that gate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { runInAction } from "mobx";

import { ApplicationStore } from "@/stores/ApplicationStore";
import { StoreProvider } from "@/stores/context";
import { OtherHandRailContainer } from "@/containers/OtherHandRailContainer";
import { OTHER_HAND_SECTIONS } from "@/containers/otherHand/otherHandSections";
import { tinyProject } from "@/store/__tests__/storeContract";
import { createBrushDocument } from "@/types";
import type { Color } from "@/types";

const RED: Color = { r: 255, g: 0, b: 0, a: 255 };
const BLUE: Color = { r: 0, g: 0, b: 255, a: 255 };

let app: ApplicationStore;
let consoleError: ReturnType<typeof vi.spyOn>;

function mountColorSection() {
  return render(
    <StoreProvider store={app}>
      <OtherHandRailContainer />
    </StoreProvider>,
  );
}

/**
 * Nudge one channel slider up by a step.
 *
 * ⚠️ KEYBOARD, NOT A POINTER DRAG. `ThumbSlider` is a `div[role="slider"]`
 * that maps a drag to a value through `getBoundingClientRect()`, and jsdom
 * reports every rect as zeros — the component's own `rect.height <= 0` guard
 * would return the value unchanged and the test would pass for the wrong
 * reason. Its `onKeyDown` path (`ThumbSlider.tsx:84-96`) runs the identical
 * `onDragStart → onChange → onDragEnd` sequence with no geometry, so it
 * exercises the same container callback the thumb does.
 */
function nudgeChannel(label: string, key = "ArrowUp"): void {
  const slider = screen.getByRole("slider", { name: label });
  act(() => {
    fireEvent.keyDown(slider, { key });
  });
}

function channelValue(label: string): string | null {
  return screen
    .getByRole("slider", { name: label })
    .getAttribute("aria-valuenow");
}

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  app = new ApplicationStore({ autoSaveEnabled: false });
  runInAction(() => {
    app.adoptProject(tinyProject());
    app.domain.loadState = "loaded";
    // See the header: set the section field directly, not via `enterOtherHand`.
    app.ui.layout.otherHandSection = OTHER_HAND_SECTIONS.color;
    // RGB, so the sliders map one-to-one onto the colour under assertion.
    app.ui.layout.setOtherHandColorModel(OTHER_HAND_SECTIONS.color, "rgb");
    app.ui.tool.setColor(RED);
    app.ui.tool.setFillColor(BLUE);
  });
});

afterEach(() => {
  app.dispose();
  consoleError.mockRestore();
  vi.restoreAllMocks();
});

describe("OtherHandRailContainer — the colour section's target", () => {
  it("⭐ with the FILL target, a slider writes fillColor and leaves the edge alone", () => {
    runInAction(() => app.ui.tool.setColorTarget("fill"));
    mountColorSection();

    // The section starts from the FILL colour (blue, R = 0), so one step up
    // lands on 1 — a value the red edge colour (R = 255) could never produce.
    nudgeChannel("R");

    expect(app.ui.tool.fillColor).toEqual({ ...BLUE, r: 1 });
    // The regression this file exists for: the edge slot must not move.
    expect(app.ui.tool.selectedColor).toEqual(RED);
  });

  it("⭐ with the EDGE target, a slider writes selectedColor", () => {
    runInAction(() => app.ui.tool.setColorTarget("edge"));
    mountColorSection();

    // G, not R: the edge colour is red, so R is already at its 255 maximum
    // and a step up would clamp to the value it already had.
    nudgeChannel("G");

    expect(app.ui.tool.selectedColor).toEqual({ ...RED, g: 1 });
    expect(app.ui.tool.fillColor).toEqual(BLUE);
  });

  it("reflects the targeted slot's colour, so the sliders start where the user left them", () => {
    runInAction(() => app.ui.tool.setColorTarget("fill"));
    mountColorSection();

    // Blue: R 0, G 0, B 255 — the FILL colour, not the red edge one. Read
    // through the container, this is the `app.activeColor` half of the fix.
    expect(channelValue("R")).toBe("0");
    expect(channelValue("B")).toBe("255");
  });

  it("the Edge/Fill selector writes the target back to the store", () => {
    runInAction(() => app.ui.tool.setColorTarget("edge"));
    mountColorSection();

    const group = screen.getByRole("group", { name: "Slot" });
    act(() => {
      within(group).getByRole("button", { name: "Fill" }).click();
    });

    expect(app.ui.tool.colorTarget).toBe("fill");
  });
});

describe("OtherHandRailContainer — the swap control", () => {
  it("⭐ exchanges the two slots", () => {
    mountColorSection();

    const group = screen.getByRole("group", { name: "Colors" });
    act(() => {
      within(group).getByRole("button", { name: "Swap" }).click();
    });

    expect(app.ui.tool.selectedColor).toEqual(BLUE);
    expect(app.ui.tool.fillColor).toEqual(RED);
  });

  it("⭐ is exactly ONE undo step — one press, one entry", () => {
    mountColorSection();
    // Start from a clean stack so the single-entry claim is unambiguous.
    runInAction(() => app.history.clear());

    const group = screen.getByRole("group", { name: "Colors" });
    act(() => {
      within(group).getByRole("button", { name: "Swap" }).click();
    });

    // One gesture, one entry — `swapEdgeAndFillColors` snapshots ONCE, before
    // it mutates, and the rail deliberately does not bracket it with a second
    // `saveStateToHistory`. Two entries here would mean a half-swapped pair
    // after a single undo.
    expect(app.history.entries).toHaveLength(1);
  });

  /**
   * ⚠️ CHARACTERISATION, NOT A DESIRED-BEHAVIOUR ASSERTION — and a finding.
   *
   * MEASURED 2026-09-06 while writing this file: one undo after a swap
   * restores `selectedColor` but leaves `fillColor` where the swap put it.
   * Verified independent of the swap — a bare `saveStateToHistory()`, a
   * direct `setFillColor`, then `undo()` shows the same thing, so this is the
   * snapshot/restore path, not the rail and not task 05's swap.
   *
   * The cause: the history snapshot carries the edge colour through the
   * hosted project's `uiState.selectedColor` ride-along (`colorSink`,
   * `ApplicationStore:584-588`), and `fillColor` has NO equivalent sink — it
   * is MobX-only, exactly as `ColorPickerContainer` and `setActiveColor`'s
   * headers say. So `fillColor` was never in the undo stack, for ANY writer,
   * since the edge/fill split landed on 2026-09-01.
   *
   * Not fixed here: the fix is a new sink on `ApplicationStore`, which is
   * outside plan 09 task 07's `Touches` (and touches the persistence
   * perimeter). Pinned so the gap is visible and a later task changing it
   * fails loudly rather than silently.
   */
  it("undo restores the EDGE slot only — fillColor has no history sink (pinned)", () => {
    mountColorSection();

    const group = screen.getByRole("group", { name: "Colors" });
    act(() => {
      within(group).getByRole("button", { name: "Swap" }).click();
    });
    expect(app.ui.tool.selectedColor).toEqual(BLUE);
    expect(app.ui.tool.fillColor).toEqual(RED);

    act(() => {
      app.undo();
    });

    expect(app.ui.tool.selectedColor).toEqual(RED);
    // Observed, not desired — see the header above.
    expect(app.ui.tool.fillColor).toEqual(RED);
  });
});

/* ── The Brush tool's section (plan 13, task 14) ─────────────────────────── */

/**
 * The Brush tool's thumb widgets are bound to `app.ui.pixelBrush` (task 11)
 * with the rail section's rules: Width drags Height while the ratio is
 * locked, `Free` releases it, one strategy pick sets both axes while locked
 * and each axis has its own stack when not. Sliders are driven by KEYBOARD
 * (see `nudgeChannel`); the native size comes from the installed document's
 * `width` / `height` scalars.
 */
describe("OtherHandRailContainer — the Brush tool's section", () => {
  const SECTION_KEY = "tool:brush";

  function installBrush(width: number | null, height = width): void {
    runInAction(() => {
      const doc = width === null ? null : createBrushDocument(width, height!);
      app.brushes.brushName = doc ? "test-brush" : "";
      app.brushes.installDocument(doc);
      app.brushes.loadState = doc ? "loaded" : "idle";
    });
  }

  function mountBrushSection() {
    runInAction(() => {
      app.ui.tool.setTool("brush");
      app.ui.layout.otherHandSection = OTHER_HAND_SECTIONS.tool;
    });
    return mountColorSection();
  }

  function stackButton(stack: string, name: string): HTMLElement {
    const group = screen.getByRole("group", { name: stack });
    return within(group).getByRole("button", { name });
  }

  function tap(stack: string, name: string): void {
    act(() => {
      stackButton(stack, name).click();
    });
  }

  beforeEach(() => {
    // The documents here are installed by hand; the real `init()` is a flow
    // that would reach the (MSW-guarded) network. Same stub as
    // `usePixelBrush.dom.test.ts`.
    vi.spyOn(app.brushes, "init").mockImplementation((() =>
      Promise.resolve()) as never);
    installBrush(4);
  });

  it("⭐ renders Width, Ratio, Height, Scale and Size widgets at the native size", () => {
    mountBrushSection();

    expect(channelValue("Width")).toBe("4");
    expect(channelValue("Height")).toBe("4");
    expect(stackButton("Ratio", "Locked")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("group", { name: "Scale" })).toBeInTheDocument();
    expect(stackButton("Size", "Native")).not.toHaveAttribute("aria-pressed");
    // The order the thumb learns: Width, Ratio, Height, Scale, Size.
    const labels = Array.from(
      document.querySelectorAll(".other-hand__widget"),
    ).map((card) =>
      card.querySelector(".other-hand__grip")?.getAttribute("aria-label"),
    );
    expect(labels).toEqual([
      "Move Width",
      "Move Ratio",
      "Move Height",
      "Move Scale",
      "Move Size",
    ]);
  });

  it("⭐ ArrowUp on Width calls setWidth, and Height follows while locked", () => {
    mountBrushSection();

    nudgeChannel("Width");

    expect(app.ui.pixelBrush.width).toBe(5);
    // Locked at the native 1:1 ratio, so the height moves with it.
    expect(app.ui.pixelBrush.height).toBe(5);
    expect(channelValue("Width")).toBe("5");
    expect(channelValue("Height")).toBe("5");
  });

  it("⭐ tapping Locked → Free releases the ratio: Width then leaves Height alone", () => {
    mountBrushSection();

    tap("Ratio", "Locked");
    expect(app.ui.pixelBrush.lockRatio).toBe(false);
    expect(stackButton("Ratio", "Free")).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    nudgeChannel("Width");

    expect(app.ui.pixelBrush.width).toBe(5);
    expect(app.ui.pixelBrush.height).toBeNull();
    expect(channelValue("Width")).toBe("5");
    expect(channelValue("Height")).toBe("4");
  });

  it("⭐ the Scale stack marks NN active; tapping BIL sets both axes while locked", () => {
    mountBrushSection();

    expect(stackButton("Scale", "NN")).toHaveAttribute("aria-pressed", "true");
    expect(stackButton("Scale", "BIL")).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    tap("Scale", "BIL");

    expect(app.ui.pixelBrush.scaleX).toBe("bilinear");
    expect(app.ui.pixelBrush.scaleY).toBe("bilinear");
    expect(stackButton("Scale", "BIL")).toHaveAttribute("aria-pressed", "true");
    expect(stackButton("Scale", "NN")).toHaveAttribute("aria-pressed", "false");
  });

  it("unlocked shows Scale X and Scale Y stacks, each bound to its own axis", () => {
    mountBrushSection();

    tap("Ratio", "Locked");

    expect(screen.queryByRole("group", { name: "Scale" })).toBeNull();
    expect(screen.getByRole("group", { name: "Scale X" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Scale Y" })).toBeInTheDocument();

    tap("Scale Y", "LZ3");

    expect(app.ui.pixelBrush.scaleY).toBe("lanczos3");
    expect(app.ui.pixelBrush.scaleX).toBe("nearest");
    expect(stackButton("Scale Y", "LZ3")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(stackButton("Scale X", "NN")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("Native resets the size back to the brush's own", () => {
    mountBrushSection();

    nudgeChannel("Width");
    nudgeChannel("Height");
    expect(app.ui.pixelBrush.width).toBe(6);

    tap("Size", "Native");

    expect(app.ui.pixelBrush.width).toBeNull();
    expect(app.ui.pixelBrush.height).toBeNull();
    expect(channelValue("Width")).toBe("4");
    expect(channelValue("Height")).toBe("4");
  });

  it("without a document the section shows its empty message", () => {
    installBrush(null);
    mountBrushSection();

    expect(screen.queryByRole("slider", { name: "Width" })).toBeNull();
    expect(
      screen.getByText(
        "Brush has no thumb controls. Pick another tool, or leave Other Hand Mode.",
      ),
    ).toBeInTheDocument();
  });

  /**
   * The grip is pointer-only (no keyboard path), and jsdom reports every
   * rect as zeros — so the stage and card rects are stubbed exactly as
   * `OtherHand.dom.test.tsx` does for the surface. What is under test is
   * the SECTION KEY the container persists under, not the drag arithmetic.
   */
  it("persists a dragged position under the tool:brush key", () => {
    const { container } = mountBrushSection();
    const setPosition = vi.spyOn(app.ui.layout, "setOtherHandWidgetPosition");

    const stage = container.querySelector<HTMLElement>(".other-hand__stage")!;
    const card = container.querySelector<HTMLElement>(".other-hand__widget")!;
    const grip = screen.getByRole("button", { name: "Move Width" });
    Object.assign(grip, {
      setPointerCapture: () => {},
      releasePointerCapture: () => {},
      hasPointerCapture: () => false,
    });
    const rect = (x: number, y: number, w: number, h: number) =>
      ({
        left: x,
        top: y,
        right: x + w,
        bottom: y + h,
        width: w,
        height: h,
        x,
        y,
        toJSON: () => ({}),
      }) as DOMRect;
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue(
      rect(0, 0, 400, 800),
    );
    vi.spyOn(card, "getBoundingClientRect").mockReturnValue(
      rect(0, 0, 80, 300),
    );

    // Three separate events, each its own `act` (RTL's `fireEvent` wraps
    // one): the surface's `drag` state must flush between down and move.
    fireEvent.pointerDown(grip, {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    });
    // +100px right, +200px down on a 400×800 stage → 25% / 25%.
    fireEvent.pointerMove(grip, { clientX: 110, clientY: 210, pointerId: 1 });
    fireEvent.pointerUp(grip, { pointerId: 1 });

    expect(setPosition).toHaveBeenCalledWith(SECTION_KEY, "width", {
      x: 25,
      y: 25,
    });
    expect(
      app.ui.layout.otherHandLayoutFor(SECTION_KEY).positions.width,
    ).toEqual({ x: 25, y: 25 });
  });
});
