/**
 * ⭐ THE STALE-THUMBNAIL REGRESSION (REFRESH task 28, manual check 6).
 *
 * Task 28's spec names this "the check most likely to fail": *`ObjectLibrary`
 * thumbnails must update when a variant frame changes.* It was gated by a
 * 79-line hand-written `React.memo` comparator threading `project` internals,
 * which this task removed.
 *
 * ── What was actually wrong BEFORE this task ──────────────────────────────
 *
 * The comparator's variant-frame branch iterated **`prev.variantGroups`** —
 * the OBJECT-level variant list, which the v1.1.0 migration sets to
 * `undefined` on load. The loop therefore never executed, so on the path
 * where the object identity had changed, a `variantFrameIndices` change never
 * invalidated the thumbnail. The regression was live in the code, not
 * introduced by the removal.
 *
 * ── What this test asserts ────────────────────────────────────────────────
 *
 * `renderFramePreview` is the single paint call; the comparator's whole job
 * was deciding whether it re-runs. So the contract is stated at that seam:
 * change the variant frame index, and the thumbnail must repaint WITH THE NEW
 * INDEX. jsdom has no canvas, so the paint itself is stubbed — what matters
 * here is that the effect fires and what it is handed, which is exactly the
 * surface the comparator controlled.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const renderFramePreview = vi.fn();
vi.mock("@/utils/previewRenderer", () => ({
  renderFramePreview: (...args: unknown[]) => renderFramePreview(...args),
  renderVariantFramePreview: vi.fn(),
}));

// jsdom returns null from getContext; give it a context object so the
// component's early-return guard does not swallow the call under test.
beforeEach(() => {
  renderFramePreview.mockClear();
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => ({}) as unknown as CanvasRenderingContext2D,
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

import { ObjectLibrary } from "../ObjectLibrary";
import type { PixelData, PixelObject, VariantGroup } from "@/types";

/** The `0` sentinel form of an empty cell. */
const EMPTY_CELL: PixelData = { color: 0, normal: 0, height: 0 };

const GROUP_ID = "vg-1";
const VARIANT_ID = "v-1";

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

const noop = () => {};

function props(overrides: Partial<Parameters<typeof ObjectLibrary>[0]> = {}) {
  return {
    objects: [objectWithVariantHost()],
    variants: [variantGroup()],
    variantFrameIndices: { [GROUP_ID]: 0 },
    selectedObjectId: "obj-1",
    selectedFrameId: "frame-1",
    objectLibraryViewMode: "normal" as const,
    onAddObject: noop,
    onDeleteObject: noop,
    onRenameObject: noop,
    onResizeObject: noop,
    onSelectObject: noop,
    onDuplicateObject: noop,
    onSetObjectLibraryViewMode: noop,
    ...overrides,
  };
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
    render(<ObjectLibrary {...props()} />);
    expect(renderFramePreview).toHaveBeenCalled();
    expect(lastPaintedIndices()).toEqual({ [GROUP_ID]: 0 });
  });

  it("⭐ REPAINTS with the new index when the variant frame changes", () => {
    const { rerender } = render(<ObjectLibrary {...props()} />);
    const paintsBefore = renderFramePreview.mock.calls.length;

    // Exactly what `TimelineUIStore.selectVariantFrame` produces: a NEW
    // record (the field is `observableRef`), same object identity otherwise.
    rerender(
      <ObjectLibrary {...props({ variantFrameIndices: { [GROUP_ID]: 1 } })} />,
    );

    expect(renderFramePreview.mock.calls.length).toBeGreaterThan(paintsBefore);
    expect(lastPaintedIndices()).toEqual({ [GROUP_ID]: 1 });
  });

  it("⭐ repaints even when the OBJECT identity also changed", () => {
    // The path the old comparator got wrong: it fell through to a loop over
    // `prev.variantGroups`, which the migration sets to `undefined`, so the
    // index change was never noticed. Every pixel edit publishes new object
    // identities, so this is the common case, not the corner one.
    const { rerender } = render(<ObjectLibrary {...props()} />);
    const paintsBefore = renderFramePreview.mock.calls.length;

    rerender(
      <ObjectLibrary
        {...props({
          objects: [objectWithVariantHost()], // a fresh identity
          variantFrameIndices: { [GROUP_ID]: 1 },
        })}
      />,
    );

    expect(renderFramePreview.mock.calls.length).toBeGreaterThan(paintsBefore);
    expect(lastPaintedIndices()).toEqual({ [GROUP_ID]: 1 });
  });

  it("an UNSELECTED object renders the static index-0 pose, not the live one", () => {
    // Behaviour preserved from before the comparator removal: only the
    // selected object on its selected first frame follows the live index.
    render(
      <ObjectLibrary
        {...props({
          selectedObjectId: "other",
          variantFrameIndices: { [GROUP_ID]: 1 },
        })}
      />,
    );
    expect(lastPaintedIndices()).toEqual({ [GROUP_ID]: 0 });
  });

  it("is handed the PROJECT-level variants, never object-level variantGroups", () => {
    render(<ObjectLibrary {...props()} />);
    const calls = renderFramePreview.mock.calls;
  const call = calls[calls.length - 1];
    const arg = call?.[1] as { variants?: VariantGroup[] };
    expect(arg.variants?.map((v) => v.id)).toEqual([GROUP_ID]);
  });
});
