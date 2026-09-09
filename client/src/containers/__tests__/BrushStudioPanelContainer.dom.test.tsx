/**
 * BrushStudioPanelContainer — the delta picker is wired to BOTH delta slots
 * (brush follow-ups `docs/11-brush-studio-followups`, task 07; MASTER D8 /
 * D10).
 *
 * What is pinned, over the REAL `ApplicationStore` with a 4×4 brush
 * installed (the harness is `BrushStudioContainer.dom.test.tsx`'s, minus the
 * fetch stub — this container never fetches):
 *
 *   (a) the Edge/Fill tab row and the swap button EXIST — the picker renders
 *       them only when the container passes `target` + `onTargetChange` and
 *       `onSwap`, so a container that forgot a prop shows the old single-slot
 *       picker and fails here;
 *   (b) clicking Fill writes `brushUI.deltaTarget`;
 *   (c) ⭐ a slider move under Fill changes `fillDelta` and NOT
 *       `selectedDelta` (the edge slot), and Reset under Fill zeroes only the
 *       fill — the discriminating cases: a container still wired to
 *       `setDeltaChannel` / `resetDelta` passes (a) and (b) and fails these;
 *   (d) the swap button exchanges the slots and takes NO history snapshot.
 *
 * jsdom has no canvas, but the picker paints its swatches with CSS, not a
 * canvas, so nothing here needs one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { runInAction } from "mobx";

import { tinyProject } from "@/store/__tests__/storeContract";
import { ApplicationStore } from "@/stores/ApplicationStore";
import { StoreProvider } from "@/stores/context";
import { BrushStudioPanelContainer } from "@/containers/BrushStudioPanelContainer";
import { createBrushDocument } from "@/types";
import type { BrushDelta } from "@/types";

const EDGE: BrushDelta = [40, -30, 20, 0];
const FILL: BrushDelta = [-100, 50, 0, 10];

let app: ApplicationStore;

beforeEach(() => {
  app = new ApplicationStore({ autoSaveEnabled: false });
  runInAction(() => {
    app.adoptProject(tinyProject());
    app.domain.loadState = "loaded";
    app.lightingUI.setStudioMode("brush");
    // Install a brush as if `loadBrush` had just succeeded. `installDocument`
    // fires `brushUI.adoptDocument`, which selects frame-1 / layer-1, so the
    // picker has a channel type (the default layer is `rgb`) and shows
    // sliders. `loadState = "loaded"` keeps `isLoading` false.
    app.brushes.brushName = "panel-brush";
    app.brushes.installDocument(createBrushDocument(4, 4));
    app.brushes.loadState = "loaded";
    app.brushUI.setDelta(EDGE);
    app.brushUI.setFillDelta(FILL);
  });
});

afterEach(() => {
  app.dispose();
});

function mount() {
  return render(
    <StoreProvider store={app}>
      <BrushStudioPanelContainer />
    </StoreProvider>,
  );
}

const fillTab = () => screen.getByRole("tab", { name: "Fill" });
const edgeTab = () => screen.getByRole("tab", { name: "Edge" });
const rSlider = () => screen.getByRole("slider", { name: "R delta" });

describe("BrushStudioPanelContainer — edge/fill delta wiring", () => {
  it("renders the picker with the Edge/Fill tab row and the swap button", () => {
    mount();
    // The store starts on the edge slot; the picker reflects it.
    expect(app.brushUI.deltaTarget).toBe("edge");
    expect(edgeTab()).toHaveAttribute("aria-selected", "true");
    expect(fillTab()).toHaveAttribute("aria-selected", "false");
    expect(
      screen.getByRole("button", { name: "Swap edge and fill deltas" }),
    ).toBeInTheDocument();
    // A layer is selected → sliders, not the empty state.
    expect(screen.queryByText("Select a layer")).toBeNull();
    expect(rSlider()).toHaveValue(String(EDGE[0]));
  });

  it("the tab swatches show each slot, and `value` is the active slot", () => {
    mount();
    // Edge active → the sliders show the edge tuple.
    expect(rSlider()).toHaveValue(String(EDGE[0]));
    expect(screen.getByRole("slider", { name: "G delta" })).toHaveValue(
      String(EDGE[1]),
    );
    // Both tab swatches are painted (colourised, not the null-layer grey).
    expect(
      screen.getByTestId("brush-delta-target-swatch-edge").style
        .backgroundColor,
    ).not.toBe("");
    expect(
      screen.getByTestId("brush-delta-target-swatch-fill").style
        .backgroundColor,
    ).not.toBe("");
  });

  it("clicking Fill sets brushUI.deltaTarget and the sliders switch to the fill slot", () => {
    mount();
    fireEvent.click(fillTab());
    expect(app.brushUI.deltaTarget).toBe("fill");
    expect(fillTab()).toHaveAttribute("aria-selected", "true");
    expect(rSlider()).toHaveValue(String(FILL[0]));

    fireEvent.click(edgeTab());
    expect(app.brushUI.deltaTarget).toBe("edge");
    expect(rSlider()).toHaveValue(String(EDGE[0]));
  });

  it("⭐ a slider move under Fill changes fillDelta and leaves selectedDelta (edge) alone", () => {
    mount();
    fireEvent.click(fillTab());
    fireEvent.change(rSlider(), { target: { value: "77" } });

    expect(app.brushUI.fillDelta).toEqual([77, FILL[1], FILL[2], FILL[3]]);
    expect(app.brushUI.selectedDelta).toEqual(EDGE);
    expect(app.brushUI.activeDelta).toBe(app.brushUI.fillDelta);
  });

  it("⭐ a slider move under Edge changes selectedDelta and leaves fillDelta alone", () => {
    mount();
    fireEvent.change(rSlider(), { target: { value: "-9" } });

    expect(app.brushUI.selectedDelta).toEqual([-9, EDGE[1], EDGE[2], EDGE[3]]);
    expect(app.brushUI.fillDelta).toEqual(FILL);
  });

  it("Reset under Fill zeroes only the fill slot", () => {
    mount();
    fireEvent.click(fillTab());
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(app.brushUI.fillDelta).toEqual([0, 0, 0, 0]);
    expect(app.brushUI.selectedDelta).toEqual(EDGE);
  });

  it("⭐ the swap button exchanges the two slots, keeps the tab, and takes no history snapshot", () => {
    mount();
    const saveStateToHistory = vi.spyOn(app, "saveStateToHistory");
    fireEvent.click(fillTab());
    fireEvent.click(
      screen.getByRole("button", { name: "Swap edge and fill deltas" }),
    );

    expect(app.brushUI.selectedDelta).toEqual(FILL);
    expect(app.brushUI.fillDelta).toEqual(EDGE);
    // `swapDeltas` leaves `deltaTarget` alone: the picker stays on its tab and
    // now shows what used to be the other slot.
    expect(app.brushUI.deltaTarget).toBe("fill");
    expect(rSlider()).toHaveValue(String(EDGE[0]));
    // UI state, not undoable — never bracketed with a save.
    expect(saveStateToHistory).not.toHaveBeenCalled();
  });

  it("every control is disabled while a brush lifecycle flow is in flight", () => {
    mount();
    // Inside `act`: the observer re-render is scheduled, not synchronous.
    act(() =>
      runInAction(() => {
        app.brushes.loadState = "loading";
      }),
    );
    expect(app.brushes.isLoading).toBe(true);
    expect(fillTab()).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Swap edge and fill deltas" }),
    ).toBeDisabled();
    expect(rSlider()).toBeDisabled();
  });
});
