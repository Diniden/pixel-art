/**
 * ⭐ THE STALE-THUMBNAIL REGRESSION (REFRESH task 28, manual check 6).
 *
 * Task 28's spec names this "the check most likely to fail": *`ObjectLibrary`
 * thumbnails must update when a variant frame changes.* It was gated by a
 * 79-line hand-written `React.memo` comparator threading `project` internals,
 * which task 28 removed.
 *
 * ── What was actually wrong BEFORE task 28 ────────────────────────────────
 *
 * The comparator's variant-frame branch iterated **`prev.variantGroups`** —
 * the OBJECT-level variant list, which the v1.1.0 migration sets to
 * `undefined` on load. The loop therefore never executed, so on the path
 * where the object identity had changed, a `variantFrameIndices` change never
 * invalidated the thumbnail. The regression was live in the code, not
 * introduced by the removal.
 *
 * ── ⚠️ WHY THIS FILE MOVED (task 35) ──────────────────────────────────────
 *
 * These five assertions are unchanged in CONTRACT and moved in LOCATION.
 * Task 35 split `ObjectLibrary` and made it pure: `renderFramePreview` walks
 * `frame.layers[].pixels` (R2) and may not run under `ui/`, so the paint
 * decision moved to `containers/hooks/objectThumbnailDraw.ts` and reaches the
 * component as a bound `draw` closure.
 *
 * The seam the comparator used to control is therefore
 * `makeObjectThumbnailDraw` rather than a React render, and the tests point
 * at it directly. That makes them STRONGER, not weaker: they no longer need a
 * DOM, a canvas stub or a render pass to state what the thumbnail is painted
 * with, and the "object identity changed" case is now expressed as the two
 * distinct object arrays it always meant.
 *
 * ── What this test asserts ────────────────────────────────────────────────
 *
 * `renderFramePreview` is the single paint call; the comparator's whole job
 * was deciding whether it re-runs and with what. So the contract is stated at
 * that seam: change the variant frame index, and the next paint must use THE
 * NEW INDEX.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const renderFramePreview = vi.fn();
vi.mock("@/utils/previewRenderer", () => ({
  renderFramePreview: (...args: unknown[]) => renderFramePreview(...args),
  renderVariantFramePreview: vi.fn(),
}));

beforeEach(() => {
  renderFramePreview.mockClear();
});

import { makeObjectThumbnailDraw } from "../objectThumbnailDraw";
import type { PixelData, PixelObject, VariantGroup } from "@/types";

/** The `0` sentinel form of an empty cell. */
const EMPTY_CELL: PixelData = { color: 0, normal: 0, height: 0 };

const GROUP_ID = "vg-1";
const VARIANT_ID = "v-1";
const THUMB = 32;

function variantGroup(): VariantGroup {
  const frame = (id: string) => ({
    id,
    layers: [
      {
        id: `${id}-l`,
        name: "Layer 1",
        visible: true,
        pixels: [[EMPTY_CELL]],
      },
    ],
  });
  return {
    id: GROUP_ID,
    name: "Body",
    variants: [
      {
        id: VARIANT_ID,
        name: "Body",
        gridSize: { width: 1, height: 1 },
        frames: [frame("vf-0"), frame("vf-1")],
        baseFrameOffsets: { 0: { x: 0, y: 0 } },
      },
    ],
  };
}

function objectWithVariantHost(): PixelObject {
  return {
    id: "obj-1",
    name: "Object 1",
    gridSize: { width: 1, height: 1 },
    frames: [
      {
        id: "frame-1",
        name: "Frame 1",
        layers: [
          {
            id: "host-1",
            name: "Body",
            visible: true,
            pixels: [[EMPTY_CELL]],
            isVariant: true,
            variantGroupId: GROUP_ID,
            selectedVariantId: VARIANT_ID,
          },
        ],
      },
    ],
  };
}

/** A stand-in context — the paint itself is mocked. */
const ctx = {} as CanvasRenderingContext2D;

function paint(
  overrides: Partial<Parameters<typeof makeObjectThumbnailDraw>[0]> = {},
) {
  const draw = makeObjectThumbnailDraw({
    objectId: "obj-1",
    objects: [objectWithVariantHost()],
    variants: [variantGroup()],
    variantFrameIndices: { [GROUP_ID]: 0 },
    selectedObjectId: "obj-1",
    selectedFrameId: "frame-1",
    ...overrides,
  });
  draw(ctx, THUMB);
}

/** The `variantFrameIndices` the last paint was handed. */
function lastPaintedIndices(): Record<string, number> | undefined {
  const calls = renderFramePreview.mock.calls;
  const call = calls[calls.length - 1];
  return (call?.[1] as { variantFrameIndices?: Record<string, number> })
    ?.variantFrameIndices;
}

describe("ObjectLibrary thumbnails — the memo-comparator regression", () => {
  it("paints the selected object's thumbnail with the LIVE variant frame index", () => {
    paint();
    expect(renderFramePreview).toHaveBeenCalled();
    expect(lastPaintedIndices()).toEqual({ [GROUP_ID]: 0 });
  });

  it("⭐ REPAINTS with the new index when the variant frame changes", () => {
    paint();
    const paintsBefore = renderFramePreview.mock.calls.length;

    // Exactly what `TimelineUIStore.selectVariantFrame` produces: a NEW
    // record (the field is `observableRef`), same object identity otherwise.
    paint({ variantFrameIndices: { [GROUP_ID]: 1 } });

    expect(renderFramePreview.mock.calls.length).toBeGreaterThan(paintsBefore);
    expect(lastPaintedIndices()).toEqual({ [GROUP_ID]: 1 });
  });

  it("⭐ repaints even when the OBJECT identity also changed", () => {
    // The path the old comparator got wrong: it fell through to a loop over
    // `prev.variantGroups`, which the migration sets to `undefined`, so the
    // index change was never noticed. Every pixel edit publishes new object
    // identities, so this is the common case, not the corner one.
    paint();
    const paintsBefore = renderFramePreview.mock.calls.length;

    paint({
      objects: [objectWithVariantHost()], // a fresh identity
      variantFrameIndices: { [GROUP_ID]: 1 },
    });

    expect(renderFramePreview.mock.calls.length).toBeGreaterThan(paintsBefore);
    expect(lastPaintedIndices()).toEqual({ [GROUP_ID]: 1 });
  });

  it("an UNSELECTED object renders the static index-0 pose, not the live one", () => {
    // Behaviour preserved from before the comparator removal: only the
    // selected object on its selected first frame follows the live index.
    paint({
      selectedObjectId: "other",
      variantFrameIndices: { [GROUP_ID]: 1 },
    });
    expect(lastPaintedIndices()).toEqual({ [GROUP_ID]: 0 });
  });

  it("is handed the PROJECT-level variants, never object-level variantGroups", () => {
    paint();
    const calls = renderFramePreview.mock.calls;
    const call = calls[calls.length - 1];
    const arg = call?.[1] as { variants?: VariantGroup[] };
    expect(arg.variants?.map((v) => v.id)).toEqual([GROUP_ID]);
  });
});
