/**
 * W29i — the render-behaviour proof for narrowing the timeline's `project` prop.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS FILE EXISTS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `FrameTimelineContainer` was the codebase's second-to-last real
 * legacy-store-hook importer. It read the WHOLE `project` node off Zustand and
 * threaded it into `FramesView`/`VariantView`, where `FrameThumbnail`'s
 * `React.memo` comparator reads `project.uiState.variantFrameIndices` BY
 * REFERENCE (`FramesView.tsx:108-110` and `:150-152`).
 *
 * W29c MEASURED that comparator against the owner's real project and found it
 * **LIVE** — 7 variant groups, 9 populated `variantFrameIndices` entries, and
 * `TimelineUIStore.setVariantFrameIndex` rebuilds the record as a NEW object
 * per write (it is `observableRef`), so the by-reference compare genuinely
 * gates re-renders. That is the OPPOSITE of W20's `ObjectThumbnail` result,
 * where the same shape of guard was dead code. Only measuring separates them.
 *
 * W29i narrows the prop from the whole `Project` to a four-field
 * `TimelineProjectView` built from MobX observables. **Changing what a live
 * comparator observes changes which timeline cells re-render — invisible to
 * tsc and to the rest of the suite.** So the change needs render-counting
 * evidence, in the shape W25 used: drive it for real, count real renders.
 *
 * ⚠️ A test that passes both before and after proves nothing. This file was
 * written and RUN AGAINST THE PRE-CHANGE CODE FIRST, and the six numbers
 * below are that measured baseline. The narrowed prop must reproduce them
 * exactly. Two of the cases (`a NEW indices object with equal values` and
 * `a change to an UNWATCHED group`) are the ones that would silently flip if
 * the narrowing accidentally turned the by-reference guard into a
 * by-value one or vice versa — they are the negative controls for this proof.
 *
 * ── The subject is the comparator, not the container ──────────────────────
 *
 * `FrameThumbnail` is imported directly, because the comparator is the ONLY
 * thing the prop change can affect: `FramesView`/`VariantView` otherwise just
 * destructure four fields off the node. Mounting the 684-line `FramesView`
 * would add drag state, modals and a canvas per cell without exercising one
 * extra branch of the comparison.
 *
 * ── How a render is counted ───────────────────────────────────────────────
 *
 * `FrameThumbnail`'s body is a single `useEffect` that calls
 * `renderFramePreview`, with a dep array covering exactly the props the
 * comparator gates. So one `renderFramePreview` call == one render that the
 * comparator ALLOWED through, and mocking that module is an exact counter.
 *
 * ⚠️ `getContext("2d")` MUST be stubbed as well. jsdom returns `null` from it,
 * and the effect early-returns on a null context — BEFORE reaching
 * `renderFramePreview`. Measured: without the stub every case reports 0
 * re-renders and three of the six "pass" for entirely the wrong reason. That
 * near-miss is exactly the failure class this file exists to rule out, so the
 * stub is load-bearing, not incidental.
 */
import {
  describe,
  expect,
  it,
  beforeEach,
  vi,
  type MockInstance,
} from "vitest";
import { render } from "@testing-library/react";
import type { Frame, VariantGroup } from "../../types";

import { FrameThumbnail } from "../../components/FrameTimeline/FramesView";
import * as previewRenderer from "../../utils/previewRenderer";

/**
 * ⚠️ `vi.spyOn`, NOT `vi.mock`. Measured in this repo: a `vi.mock` factory
 * does NOT get applied to a statically-imported binding under this
 * Bun + Vitest 3.2.7 setup — a probe read `typeof export === "function"` with
 * `.mock === undefined`, i.e. the real module. `spyOn` on the namespace
 * object does intercept `FramesView`'s call, verified by the same probe.
 */
let renderFramePreview: MockInstance<typeof previewRenderer.renderFramePreview>;

/* ══ fixtures ═══════════════════════════════════════════════════════════════
 *
 * Shaped after the owner's real project: several variant groups, each with a
 * variant carrying multiple frames, so `variantFrameIndices` has more than
 * one populated key and the comparator's per-group loop actually runs.
 */

const FRAME: Frame = {
  id: "frame-0",
  name: "frame-0",
  layers: [{ id: "l0", name: "base", visible: true, opacity: 1, pixels: [] }],
} as unknown as Frame;

function makeVariantGroup(id: string, frameCount: number): VariantGroup {
  return {
    id,
    name: id,
    variants: [
      {
        id: `${id}-v0`,
        name: "v0",
        gridSize: { width: 8, height: 8 },
        frames: Array.from({ length: frameCount }, (_, i) => ({
          id: `${id}-f${i}`,
          name: `f${i}`,
          layers: [],
        })),
      },
    ],
  } as unknown as VariantGroup;
}

const VARIANTS = [
  makeVariantGroup("vg-a", 4),
  makeVariantGroup("vg-b", 3),
  makeVariantGroup("vg-c", 2),
];

/**
 * The shape the container now passes.
 *
 * ⚠️ Note this is EXACTLY what `FrameThumbnail`'s prop type has always
 * declared (`{ uiState?: { variantFrameIndices?: … } }`). The component never
 * asked for a `Project`; it was merely handed one. That is the structural
 * reason the narrowing is safe, and these cases are the proof.
 */
type IndicesView = {
  uiState?: { variantFrameIndices?: { [key: string]: number } };
};

function view(indices: { [k: string]: number }): IndicesView {
  return { uiState: { variantFrameIndices: indices } };
}

function Subject({
  node,
  isSelected = true,
}: {
  node: IndicesView;
  isSelected?: boolean;
}) {
  return (
    <FrameThumbnail
      frame={FRAME}
      width={8}
      height={8}
      variants={VARIANTS}
      project={node}
      frameIndex={0}
      isSelected={isSelected}
    />
  );
}

/** Renders that the comparator let through, EXCLUDING the mount. */
function rerendersAfterMount(): number {
  return Math.max(0, renderFramePreview.mock.calls.length - 1);
}

/** Total renders the comparator let through, mount included. */
function totalRenders(): number {
  return renderFramePreview.mock.calls.length;
}

describe("W29i — FrameThumbnail memo behaviour under a narrowed project prop", () => {
  beforeEach(() => {
    renderFramePreview = vi
      .spyOn(previewRenderer, "renderFramePreview")
      .mockImplementation(() => {});
    // See the header: without this the effect early-returns on a null context
    // and every count is a false 0.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as unknown as CanvasRenderingContext2D,
    );
  });

  it("the counter is WIRED — a real prop change DOES reach renderFramePreview", () => {
    // ⚠️ The falsifiability check for the counter itself. If the spy missed,
    // or `getContext` were left unstubbed, this reads 0 — and every "expected
    // 0 re-renders" assertion below would pass for entirely the wrong reason.
    // That is not hypothetical: it is exactly what the first draft of this
    // file did, and it is why this case exists.
    const { rerender } = render(<Subject node={view({ "vg-a": 0 })} />);
    expect(totalRenders()).toBe(1);
    rerender(<Subject node={view({ "vg-a": 1 })} />);
    expect(totalRenders()).toBe(2);
  });

  it("mounts exactly once", () => {
    render(<Subject node={view({ "vg-a": 0, "vg-b": 0 })} />);
    expect(totalRenders()).toBe(1);
  });

  it("case 1 — parent re-renders with the SAME indices object: 0 re-renders", () => {
    const node = view({ "vg-a": 1, "vg-b": 2, "vg-c": 0 });
    const { rerender } = render(<Subject node={node} />);

    // Ten unrelated parent re-renders, same node identity throughout.
    for (let i = 0; i < 10; i += 1) rerender(<Subject node={node} />);

    expect(rerendersAfterMount()).toBe(0);
  });

  it("case 2 — a NEW indices object with a CHANGED watched value: 1 re-render", () => {
    const { rerender } = render(
      <Subject node={view({ "vg-a": 1, "vg-b": 2, "vg-c": 0 })} />,
    );

    // What `TimelineUIStore.setVariantFrameIndex` does: rebuild the record.
    rerender(<Subject node={view({ "vg-a": 2, "vg-b": 2, "vg-c": 0 })} />);

    expect(rerendersAfterMount()).toBe(1);
  });

  it("case 3 — a NEW indices object whose values are all EQUAL: 0 re-renders", () => {
    // ⚠️ NEGATIVE CONTROL. The outer guard is by-REFERENCE (`prevIndices !==
    // nextIndices`) but the inner loop is by-VALUE. A narrowing that
    // accidentally made the whole comparison by-reference would re-render
    // here and this case would go 0 -> 1.
    const { rerender } = render(
      <Subject node={view({ "vg-a": 1, "vg-b": 2, "vg-c": 0 })} />,
    );

    for (let i = 0; i < 10; i += 1) {
      rerender(<Subject node={view({ "vg-a": 1, "vg-b": 2, "vg-c": 0 })} />);
    }

    expect(rerendersAfterMount()).toBe(0);
  });

  it("case 4 — a change to a group NOT in `variants`: 0 re-renders", () => {
    // ⚠️ NEGATIVE CONTROL. The inner loop iterates `prevProps.variants`, so a
    // key outside that list is invisible. A narrowing that replaced the loop
    // with a plain object compare would re-render here (0 -> 1).
    const { rerender } = render(
      <Subject node={view({ "vg-a": 1, "vg-zz": 0 })} />,
    );

    rerender(<Subject node={view({ "vg-a": 1, "vg-zz": 7 })} />);

    expect(rerendersAfterMount()).toBe(0);
  });

  it("case 5 — the cell is NOT selected: a watched change is IGNORED, 0 re-renders", () => {
    // Non-selected cells derive their indices from frame position, so the
    // comparator deliberately skips the whole `variantFrameIndices` branch.
    const { rerender } = render(
      <Subject node={view({ "vg-a": 1, "vg-b": 2 })} isSelected={false} />,
    );

    rerender(
      <Subject node={view({ "vg-a": 3, "vg-b": 2 })} isSelected={false} />,
    );

    expect(rerendersAfterMount()).toBe(0);
  });

  it("case 6 — a 50-write burst on a watched group: exactly 50 re-renders, never more", () => {
    // The W25 shape: run the action many times and assert the render count is
    // driven by the VALUE changes, not by the number of parent renders. Each
    // write both rebuilds the record AND changes a watched value, so each one
    // legitimately re-renders — but the two unrelated parent re-renders
    // interleaved with it must not add any.
    const { rerender } = render(<Subject node={view({ "vg-a": 0 })} />);

    for (let i = 1; i <= 50; i += 1) {
      const node = view({ "vg-a": i });
      rerender(<Subject node={node} />);
      // Same object, twice more: must contribute nothing.
      rerender(<Subject node={node} />);
      rerender(<Subject node={node} />);
    }

    expect(rerendersAfterMount()).toBe(50);
  });
});
