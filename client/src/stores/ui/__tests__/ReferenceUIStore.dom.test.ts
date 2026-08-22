/**
 * `ReferenceUIStore`'s COMMIT paths (REFRESH task 29).
 *
 * ⚠️ Separated from `ReferenceUIStore.test.ts` because a successful commit calls
 * `extractPixelsFromSelection`, which does `document.createElement("canvas")` —
 * unavailable in the `unit` lane's node environment. The refusal paths, which
 * return before extracting, stay in the unit file.
 *
 * jsdom still has no canvas CONTEXT, so the extracted pixels are `null` here.
 * That is fine: what these pin is the STATE TRANSITION and the SAVE, which is
 * what the 16 panel buttons depend on.
 */
import { describe, expect, it } from "vitest";
import { ReferenceUIStore } from "@/stores/ui/ReferenceUIStore";
import type { ReferenceSelectionBox } from "@/utils/referenceImage";

const box = (
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): ReferenceSelectionBox => ({ startX, startY, endX, endY });

const fakeImage = (width: number, height: number) =>
  ({ width, height }) as HTMLImageElement;

describe("ReferenceUIStore — commit paths", () => {
  it("shiftSelection moves the stored box and persists through `save`", () => {
    const saved: Array<ReferenceSelectionBox | null> = [];
    const store = new ReferenceUIStore({
      save: (_image, selection) => saved.push(selection),
    });
    store.setImage(fakeImage(100, 100), null, box(10, 10, 20, 20));

    // jsdom has no canvas, so the extraction returns null — but the STATE
    // change and the save are what this asserts.
    store.shiftSelection(5, 0);

    expect(store.referenceImageSelection).toEqual(box(15, 10, 25, 20));
    expect(saved).toEqual([box(15, 10, 25, 20)]);
  });

  it("adjustBoxSize grows an edge and persists", () => {
    const saved: Array<ReferenceSelectionBox | null> = [];
    const store = new ReferenceUIStore({
      save: (_image, selection) => saved.push(selection),
    });
    store.setImage(fakeImage(100, 100), null, box(10, 10, 20, 20));

    store.adjustBoxSize("right", true);

    expect(store.referenceImageSelection).toEqual(box(10, 10, 21, 20));
    expect(saved).toEqual([box(10, 10, 21, 20)]);
  });
});
