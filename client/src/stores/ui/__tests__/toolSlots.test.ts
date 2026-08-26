/**
 * The two tool SLOTS — the Apple Pencil double-tap model (2026-08-25).
 *
 * ⚠️ THE INVARIANT EVERYTHING ELSE DEPENDS ON: `selectedTool` remains the one
 * source of truth for what is drawing. The alternate slot sits BESIDE it, so
 * every existing reader — the canvas, the tool handlers, the persisted wire
 * format — is untouched by this feature. These tests pin that, and pin the
 * two edge cases where a naive implementation goes wrong: swapping into the
 * eyedropper (which has its own bookkeeping) and assigning the active tool to
 * the alternate slot (which would make the swap silently inert).
 */
import { describe, expect, it } from "vitest";
import { runInAction } from "mobx";

import { ToolUIStore } from "@/stores/ui/ToolUIStore";

function store(): ToolUIStore {
  return new ToolUIStore();
}

describe("tool slots — the double-tap swap", () => {
  it("defaults the alternate slot to the eraser", () => {
    // The pairing a double-tap is nearly always used for.
    expect(store().alternateTool).toBe("eraser");
  });

  it("⭐ swaps the two slots, so a second swap returns", () => {
    const t = store();
    runInAction(() => t.setTool("pixel"));

    runInAction(() => t.swapTools());
    expect(t.selectedTool).toBe("eraser");
    expect(t.alternateTool).toBe("pixel");

    runInAction(() => t.swapTools());
    expect(t.selectedTool).toBe("pixel");
    expect(t.alternateTool).toBe("eraser");
  });

  it("picking a tool replaces the ACTIVE slot and leaves the alternate", () => {
    // The Procreate model: the toolbar sets whichever slot is active.
    const t = store();
    runInAction(() => t.setTool("pixel"));
    runInAction(() => t.setTool("line"));

    expect(t.selectedTool).toBe("line");
    expect(t.alternateTool).toBe("eraser");
  });

  it("is a no-op when both slots already hold the same tool", () => {
    const t = store();
    runInAction(() => t.setTool("eraser"));
    expect(t.alternateTool).toBe("eraser");

    runInAction(() => t.swapTools());
    expect(t.selectedTool).toBe("eraser");
    expect(t.alternateTool).toBe("eraser");
  });

  it("⭐ swapping INTO the eyedropper keeps its revert bookkeeping intact", () => {
    // `setTool` remembers the outgoing tool when the eyedropper is entered.
    // A bare assignment in `swapTools` would skip that and strand the user:
    // `revertToPreviousTool` would have nothing to go back to.
    const t = store();
    runInAction(() => t.setTool("pixel"));
    runInAction(() => t.setAlternateTool("eyedropper"));

    runInAction(() => t.swapTools());
    expect(t.selectedTool).toBe("eyedropper");
    expect(t.previousTool).toBe("pixel");

    runInAction(() => t.revertToPreviousTool());
    expect(t.selectedTool).toBe("pixel");
  });

  it("swapping OUT of the eyedropper clears the revert memory", () => {
    const t = store();
    runInAction(() => t.setTool("pixel"));
    runInAction(() => t.setTool("eyedropper"));
    expect(t.previousTool).toBe("pixel");

    runInAction(() => t.swapTools());
    expect(t.selectedTool).toBe("eraser");
    expect(t.previousTool).toBeNull();
  });
});

describe("setAlternateTool", () => {
  it("assigns the alternate slot without disturbing the active one", () => {
    const t = store();
    runInAction(() => t.setTool("pixel"));
    runInAction(() => t.setAlternateTool("flood-fill"));

    expect(t.selectedTool).toBe("pixel");
    expect(t.alternateTool).toBe("flood-fill");
  });

  it("⭐ exchanges rather than duplicating when given the ACTIVE tool", () => {
    // Both slots holding one tool makes the swap inert and invisible; the
    // only reading that keeps both meaningful is an exchange.
    const t = store();
    runInAction(() => t.setTool("pixel"));
    runInAction(() => t.setAlternateTool("line"));

    runInAction(() => t.setAlternateTool("pixel"));
    expect(t.selectedTool).toBe("line");
    expect(t.alternateTool).toBe("pixel");
    // And the swap still works afterwards — it was not left inert.
    runInAction(() => t.swapTools());
    expect(t.selectedTool).toBe("pixel");
    expect(t.alternateTool).toBe("line");
  });
});

describe("the wire format is NOT extended by this feature", () => {
  it("alternateTool is session-only — hydrate never reads it", () => {
    const t = store();
    runInAction(() => t.setAlternateTool("line"));
    // A loaded project carries no alternate; hydrating must not clear or set
    // it, because it is not part of `uiState` at all.
    runInAction(() => t.hydrate({ selectedTool: "flood-fill" } as never));
    expect(t.selectedTool).toBe("flood-fill");
    expect(t.alternateTool).toBe("line");
  });
});
