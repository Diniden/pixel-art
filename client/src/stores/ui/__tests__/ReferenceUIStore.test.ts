/**
 * `ReferenceUIStore` (REFRESH task 29).
 *
 * These tests exist because the state they cover was UNTESTABLE before this
 * task: it lived in a module-level `const persistentState` inside
 * `ReferenceImageModal.tsx`, so every test in a process shared one copy and
 * there was no reset hook (`handleClearImage`, bound to a button, was the only
 * one). Constructing a store per test is the whole point.
 */
import { describe, expect, it } from "vitest";
import { ReferenceUIStore } from "@/stores/ui/ReferenceUIStore";
import { ToolUIStore } from "@/stores/ui/ToolUIStore";
import type { ReferenceSelectionBox } from "@/utils/referenceImage";

const box = (
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): ReferenceSelectionBox => ({ startX, startY, endX, endY });

/** A stand-in for the live DOM node: only `width`/`height` are ever read. */
const fakeImage = (width: number, height: number) =>
  ({ width, height }) as HTMLImageElement;

describe("ReferenceUIStore — state that used to be a module singleton", () => {
  it("starts empty, and two instances DO NOT share state", () => {
    // The regression that the singleton made structurally impossible to avoid.
    const a = new ReferenceUIStore();
    const b = new ReferenceUIStore();
    a.setImage(fakeImage(10, 10), "data:a", box(0, 0, 5, 5));

    expect(a.image).not.toBeNull();
    expect(b.image).toBeNull();
    expect(b.referenceImageSelection).toBeNull();
  });

  it("writes image, url and selection as ONE atomic action", () => {
    const store = new ReferenceUIStore();
    const img = fakeImage(32, 32);
    store.setImage(img, "data:x", box(1, 2, 3, 4));

    expect(store.image).toBe(img);
    expect(store.imageUrl).toBe("data:x");
    expect(store.referenceImageSelection).toEqual(box(1, 2, 3, 4));
  });

  it("clear() resets all three fields — the reset hook the singleton lacked", () => {
    const store = new ReferenceUIStore();
    store.setImage(fakeImage(8, 8), "data:x", box(0, 0, 4, 4));
    store.clear();

    expect(store.image).toBeNull();
    expect(store.imageUrl).toBeNull();
    expect(store.referenceImageSelection).toBeNull();
  });

  it("holds the image BY REFERENCE (observable.ref) — never a clone", () => {
    // `image` is a live DOM node; a clone would be a different element and
    // would break every canvas read-back. Identity is the contract.
    const store = new ReferenceUIStore();
    const img = fakeImage(16, 16);
    store.setImage(img, null, null);
    expect(store.image).toBe(img);
  });
});

/**
 * ⚠️ The two tests that assert a SUCCESSFUL commit live in
 * `ReferenceUIStore.dom.test.ts`, not here: committing calls
 * `extractPixelsFromSelection`, which touches `document.createElement`, and
 * this lane runs in node. The REFUSAL paths stay here — they return before any
 * extraction happens, which is itself worth pinning.
 */
describe("ReferenceUIStore — the three selection actions", () => {
  it("shiftSelection is a no-op returning null without an image", () => {
    const store = new ReferenceUIStore();
    store.setSelection(box(0, 0, 5, 5));
    expect(store.shiftSelection(1, 0)).toBeNull();
  });

  it("shiftSelectionBySize REFUSES a partial step and does not save", () => {
    const saved: unknown[] = [];
    const store = new ReferenceUIStore({ save: () => saved.push(1) });
    store.setImage(fakeImage(100, 100), null, box(95, 0, 100, 10));

    expect(store.shiftSelectionBySize(1, 0, 10, 10)).toBeNull();
    // The refusal must leave the selection untouched AND write nothing.
    expect(store.referenceImageSelection).toEqual(box(95, 0, 100, 10));
    expect(saved).toEqual([]);
  });

  it("adjustBoxSize refuses a collapse below 1x1 and does not save", () => {
    const saved: unknown[] = [];
    const store = new ReferenceUIStore({ save: () => saved.push(1) });
    store.setImage(fakeImage(100, 100), null, box(10, 10, 11, 20));

    expect(store.adjustBoxSize("left", false)).toBeNull();
    expect(store.referenceImageSelection).toEqual(box(10, 10, 11, 20));
    expect(saved).toEqual([]);
  });
});

describe("ReferenceUIStore — trace overlay", () => {
  it("setFrameTraceActive moves the frame index ATOMICALLY with the flag", () => {
    const store = new ReferenceUIStore();
    store.setFrameTraceActive(true, 4);
    expect(store.frameTraceActive).toBe(true);
    expect(store.frameTraceFrameIndex).toBe(4);

    // Disabling always nulls the index — it can never be left dangling.
    store.setFrameTraceActive(false, 9);
    expect(store.frameTraceActive).toBe(false);
    expect(store.frameTraceFrameIndex).toBeNull();
  });

  it("resets the frame overlay offset on BOTH transitions (verbatim)", () => {
    const store = new ReferenceUIStore();
    store.moveFrameOverlay(3, 3);
    store.setFrameTraceActive(true, 0);
    expect(store.frameOverlayOffset).toEqual({ x: 0, y: 0 });

    store.moveFrameOverlay(2, 2);
    store.setFrameTraceActive(false, null);
    expect(store.frameOverlayOffset).toEqual({ x: 0, y: 0 });
  });

  it("moveOverlay accumulates, resetOverlay zeroes", () => {
    const store = new ReferenceUIStore();
    store.moveOverlay(2, 3);
    store.moveOverlay(1, 1);
    expect(store.overlayOffset).toEqual({ x: 3, y: 4 });
    store.resetOverlay();
    expect(store.overlayOffset).toEqual({ x: 0, y: 0 });
  });

  it("THE SINGLE EXCLUSIVITY REACTION: picking reference-trace exits frame trace", () => {
    const tool = new ToolUIStore();
    const store = new ReferenceUIStore({ tool });
    store.setFrameTraceActive(true, 2);

    tool.setTool("reference-trace");

    expect(store.frameTraceActive).toBe(false);
    expect(store.frameTraceFrameIndex).toBeNull();
    store.dispose();
  });

  it("the reaction does NOT fire for any other tool", () => {
    const tool = new ToolUIStore();
    const store = new ReferenceUIStore({ tool });
    store.setFrameTraceActive(true, 2);

    tool.setTool("pixel");

    expect(store.frameTraceActive).toBe(true);
    expect(store.frameTraceFrameIndex).toBe(2);
    store.dispose();
  });
});

describe("ReferenceUIStore — traceNudgeAmount (the one persisted field)", () => {
  it("defaults to 10 and is settable", () => {
    const store = new ReferenceUIStore();
    expect(store.traceNudgeAmount).toBe(10);
    store.setTraceNudgeAmount(25);
    expect(store.traceNudgeAmount).toBe(25);
  });

  it("hydrates from a loaded project, falling back to 10", () => {
    const store = new ReferenceUIStore();
    store.hydrate({ traceNudgeAmount: 50 });
    expect(store.traceNudgeAmount).toBe(50);
    store.hydrate({});
    expect(store.traceNudgeAmount).toBe(10);
  });
});
