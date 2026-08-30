/**
 * The eyedropper's two post-sample modes (2026-08-28).
 *
 * ⚠️ THE INVARIANT THAT PROTECTS THE OWNER'S DATA: `eyedropperMode` is
 * TRI-STATE. It stays `undefined` until the user actually picks a mode from
 * the toolbar menu, which is what keeps the key out of all 151 corpus
 * snapshots — `UIStore.toPersistedUIState` emits it through `assign`, so an
 * `undefined` field writes nothing at all. Seeding `"revert"` as the field's
 * default would add a key to every project the next time it was saved.
 * `persistedUIState.test.ts` pins the wire half; this pins the behaviour.
 *
 * The mode is read inside `revertToPreviousTool` rather than at the three
 * canvas call sites that sample a colour, so "stay" holds for every sampler
 * by construction. These tests pin that placement.
 */
import { describe, expect, it } from "vitest";
import { runInAction } from "mobx";

import { ToolUIStore } from "@/stores/ui/ToolUIStore";

function store(): ToolUIStore {
  return new ToolUIStore();
}

/** Enter the eyedropper from `from`, as the toolbar does. */
function enterEyedropperFrom(t: ToolUIStore, from = "pixel" as const) {
  runInAction(() => t.setTool(from));
  runInAction(() => t.setTool("eyedropper"));
}

describe("eyedropperMode — the tri-state field", () => {
  it("⭐ is undefined until the user picks one — no key for untouched projects", () => {
    // The whole reason the field is tri-state. See the header.
    expect(store().eyedropperMode).toBeUndefined();
  });

  it("reads as 'revert' by default — the historical behaviour", () => {
    expect(store().eyedropperModeOrDefault).toBe("revert");
  });

  it("setEyedropperMode writes the field, so it starts persisting", () => {
    const t = store();
    runInAction(() => t.setEyedropperMode("stay"));

    expect(t.eyedropperMode).toBe("stay");
    expect(t.eyedropperModeOrDefault).toBe("stay");
  });

  it("hydrate leaves the field absent when the project has no key", () => {
    // Assigned unconditionally on hydrate: absent must stay absent, or a
    // load-then-save round trip would add the key.
    const t = store();
    runInAction(() => t.setEyedropperMode("stay"));
    runInAction(() => t.hydrate({}));

    expect(t.eyedropperMode).toBeUndefined();
  });

  it("hydrate adopts the key when the project carries one", () => {
    const t = store();
    runInAction(() => t.hydrate({ eyedropperMode: "stay" }));

    expect(t.eyedropperMode).toBe("stay");
  });
});

describe("revertToPreviousTool — mode-aware", () => {
  it("⭐ 'revert' (the default) returns to the previous tool", () => {
    const t = store();
    enterEyedropperFrom(t);
    expect(t.previousTool).toBe("pixel");

    runInAction(() => t.revertToPreviousTool());

    expect(t.selectedTool).toBe("pixel");
    expect(t.previousTool).toBeNull();
  });

  it("⭐ 'stay' keeps the eyedropper active after sampling", () => {
    const t = store();
    runInAction(() => t.setEyedropperMode("stay"));
    enterEyedropperFrom(t);

    runInAction(() => t.revertToPreviousTool());

    expect(t.selectedTool).toBe("eyedropper");
  });

  it("'stay' still CLEARS the revert memory", () => {
    // The memory exists only to serve a revert that is no longer going to
    // happen. Leaving it set would strand a stale tool that a later switch
    // back to "revert" could jump to, long after the user left that tool.
    const t = store();
    runInAction(() => t.setEyedropperMode("stay"));
    enterEyedropperFrom(t);

    runInAction(() => t.revertToPreviousTool());

    expect(t.previousTool).toBeNull();
  });

  it("⭐ sampling repeatedly in 'stay' mode never leaves the eyedropper", () => {
    // The point of the mode: pick several colours in a row.
    const t = store();
    runInAction(() => t.setEyedropperMode("stay"));
    enterEyedropperFrom(t);

    for (let i = 0; i < 3; i++) {
      runInAction(() => t.revertToPreviousTool());
      expect(t.selectedTool).toBe("eyedropper");
    }
  });

  it("switching to 'stay' mid-eyedropper takes effect on the next sample", () => {
    const t = store();
    enterEyedropperFrom(t);
    runInAction(() => t.setEyedropperMode("stay"));

    runInAction(() => t.revertToPreviousTool());

    expect(t.selectedTool).toBe("eyedropper");
  });

  it("switching back to 'revert' restores the jump-back behaviour", () => {
    const t = store();
    runInAction(() => t.setEyedropperMode("stay"));
    enterEyedropperFrom(t);
    runInAction(() => t.setEyedropperMode("revert"));

    runInAction(() => t.revertToPreviousTool());

    expect(t.selectedTool).toBe("pixel");
  });

  it("stays a no-op when the eyedropper is not active, in either mode", () => {
    // Verbatim from the legacy action: the guard is on `selectedTool`, and
    // the mode check must not have loosened it.
    for (const mode of ["revert", "stay"] as const) {
      const t = store();
      runInAction(() => t.setEyedropperMode(mode));
      runInAction(() => t.setTool("pixel"));

      runInAction(() => t.revertToPreviousTool());

      expect(t.selectedTool).toBe("pixel");
    }
  });

  it("⭐ 'stay' survives the Pencil swap INTO the eyedropper", () => {
    // `swapTools` routes through `setTool`, so the bookkeeping runs — and the
    // mode must apply to a swap-entered eyedropper exactly as to a
    // toolbar-entered one.
    const t = store();
    runInAction(() => t.setEyedropperMode("stay"));
    runInAction(() => t.setTool("pixel"));
    runInAction(() => t.setAlternateTool("eyedropper"));
    runInAction(() => t.swapTools());
    expect(t.selectedTool).toBe("eyedropper");

    runInAction(() => t.revertToPreviousTool());

    expect(t.selectedTool).toBe("eyedropper");
  });
});
