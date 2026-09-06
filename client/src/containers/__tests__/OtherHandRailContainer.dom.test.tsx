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
