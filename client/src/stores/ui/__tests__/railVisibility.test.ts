/**
 * Panel dismissal and focus mode — one mechanism (owner, 2026-08-30).
 *
 * ⚠️ THE PROPERTY THAT MAKES THIS FEATURE COHERENT: the focus button is
 * ASYMMETRIC. "Off" is a single state (everything visible); "on" is any
 * non-empty subset of hidden rails. That is what lets one button undo three
 * different × presses, and it is why the store models a SET rather than a
 * flag plus three overrides.
 */
import { describe, expect, it } from "vitest";
import { runInAction } from "mobx";

import { ViewportUIStore } from "@/stores/ui/ViewportUIStore";
import {
  FOCUS_MODE_RAILS,
  DISMISSABLE_RAILS,
  needsHiddenRailsKey,
} from "@/ui/layout/railVisibility";

const store = () => new ViewportUIStore();

describe("dismissing one rail", () => {
  it("hides only that rail", () => {
    const s = store();
    runInAction(() => s.setRailHidden("right", true));

    expect(s.isRailHidden("right")).toBe(true);
    expect(s.isRailHidden("left")).toBe(false);
    expect(s.isRailHidden("bottom")).toBe(false);
  });

  it("⭐ ENGAGES the focus button — it is the way back", () => {
    // A button that stayed unlit while a rail was missing would leave the
    // user no visible way to undo the dismissal.
    const s = store();
    expect(s.focusModeEngaged).toBe(false);

    runInAction(() => s.setRailHidden("right", true));
    expect(s.focusModeEngaged).toBe(true);
  });

  it("engages for ANY of the three rails, not just the classic two", () => {
    for (const rail of DISMISSABLE_RAILS) {
      const s = store();
      runInAction(() => s.setRailHidden(rail, true));
      expect(s.focusModeEngaged, `${rail} should engage`).toBe(true);
    }
  });

  it("dis-engages once the rail is shown again", () => {
    const s = store();
    runInAction(() => s.setRailHidden("bottom", true));
    runInAction(() => s.setRailHidden("bottom", false));

    expect(s.focusModeEngaged).toBe(false);
    expect(s.focusMode).toBe(false);
  });
});

describe("the focus button", () => {
  it("hides the two classic rails when NOT engaged", () => {
    // Unchanged behaviour: the button does what it always did from the
    // un-engaged state.
    const s = store();
    runInAction(() => s.toggleFocusMode());

    expect(s.isRailHidden("left")).toBe(true);
    expect(s.isRailHidden("bottom")).toBe(true);
    // ⚠️ NOT the right rail — it carries the tool options the user is
    // drawing with, and focus mode has never hidden it.
    expect(s.isRailHidden("right")).toBe(false);
    expect(s.focusMode).toBe(true);
  });

  it("⭐ restores EVERYTHING when engaged — including individual dismissals", () => {
    // The asymmetry. Classic focus mode never touched the right rail, but the
    // engaged button must still bring it back, or a rail dismissed by its ×
    // would have no way home.
    const s = store();
    runInAction(() => s.setRailHidden("right", true));
    runInAction(() => s.toggleFocusMode());

    for (const rail of DISMISSABLE_RAILS) {
      expect(s.isRailHidden(rail), `${rail} should be visible`).toBe(false);
    }
    expect(s.focusModeEngaged).toBe(false);
  });

  it("restores from a MIXED state in one press", () => {
    const s = store();
    runInAction(() => {
      s.toggleFocusMode(); // left + bottom
      s.setRailHidden("right", true); // ...and the third
    });
    expect(s.focusModeEngaged).toBe(true);

    runInAction(() => s.toggleFocusMode());
    expect(s.hiddenRails.size).toBe(0);
  });

  it("⭐ is NOT a plain toggle — two presses from a dismissal are not a no-op", () => {
    // Press 1 restores everything; press 2 enters classic focus mode. A
    // symmetric toggle would have returned to the single dismissed rail.
    const s = store();
    runInAction(() => s.setRailHidden("right", true));

    runInAction(() => s.toggleFocusMode());
    expect(s.hiddenRails.size).toBe(0);

    runInAction(() => s.toggleFocusMode());
    expect([...s.hiddenRails].sort()).toEqual([...FOCUS_MODE_RAILS].sort());
  });
});

describe("the legacy focusMode boolean stays honest", () => {
  it("goes true exactly when BOTH classic rails are hidden", () => {
    // So an older build reading a newer file still behaves sensibly.
    const s = store();
    runInAction(() => s.setRailHidden("left", true));
    expect(s.focusMode).toBe(false);

    runInAction(() => s.setRailHidden("bottom", true));
    expect(s.focusMode).toBe(true);

    runInAction(() => s.setRailHidden("left", false));
    expect(s.focusMode).toBe(false);
  });

  it("stays false when only the right rail is hidden", () => {
    // Focus mode has never meant "the tools rail is gone".
    const s = store();
    runInAction(() => s.setRailHidden("right", true));
    expect(s.focusMode).toBe(false);
    expect(s.focusModeEngaged).toBe(true);
  });

  it("⭐ expands a legacy `focusMode: true` into the rails it always meant", () => {
    // An old project must come back looking exactly as it did.
    const s = store();
    runInAction(() => s.hydrate({ focusMode: true }));

    expect([...s.hiddenRails].sort()).toEqual([...FOCUS_MODE_RAILS].sort());
    expect(s.focusModeEngaged).toBe(true);
  });

  it("drops a rail name this build does not know", () => {
    const s = store();
    runInAction(() => s.hydrate({ hiddenRails: ["right", "toolbar", "nope"] }));
    expect([...s.hiddenRails]).toEqual(["right"]);
  });
});

describe("needsHiddenRailsKey — the corpus guard", () => {
  it("⭐ refuses the key for states `focusMode` already encodes", () => {
    // MEASURED: a real corpus snapshot carries `focusMode: true`, and
    // emitting on "non-empty" alone added a key to the owner's data.
    expect(needsHiddenRailsKey(new Set())).toBe(false);
    expect(needsHiddenRailsKey(new Set(FOCUS_MODE_RAILS))).toBe(false);
  });

  it("requires the key for anything else", () => {
    expect(needsHiddenRailsKey(new Set(["right"]))).toBe(true);
    expect(needsHiddenRailsKey(new Set(["left"]))).toBe(true);
    expect(needsHiddenRailsKey(new Set(["bottom"]))).toBe(true);
    expect(needsHiddenRailsKey(new Set(DISMISSABLE_RAILS))).toBe(true);
  });
});
