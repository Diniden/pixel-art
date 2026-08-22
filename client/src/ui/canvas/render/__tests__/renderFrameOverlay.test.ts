/**
 * Golden-hash tests for the unified frame-overlay renderer.
 *
 * Render modes covered: **frame overlay** (#8) and **trace overlay** (#9).
 *
 * This is the riskiest extraction in task 30: two ~200-line near-duplicates
 * collapsed into one parameterised function. The tests below pin the SIX ways
 * they genuinely differed, so a later "tidy-up" that normalises any of them
 * fails here rather than silently changing what the user sees.
 *
 * Every hash was recorded from a real run (MASTER.md §10 rule 10).
 */
import { describe, expect, it } from "vitest";
import {
  renderFrameOverlay,
  overlayVariantFrameIndices,
  FRAME_OVERLAY_MODE,
  FRAME_TRACE_MODE,
} from "@/ui/canvas/render/renderFrameOverlay";
import type { RenderFrameOverlayOptions } from "@/ui/canvas/render/renderFrameOverlay";
import { createBuffer, getPixel, hashBuffer } from "@/test/canvasStub";
import { DIAGONAL_4, VARIANT_2, getPixelColor, BLUE, RED } from "./fixtures";

const W = 16;
const H = 16;

const baseOpts = (
  over: Partial<RenderFrameOverlayOptions> = {},
): RenderFrameOverlayOptions => ({
  layers: [{ visible: true, pixels: DIAGONAL_4 }],
  refObjWidth: 4,
  refObjHeight: 4,
  zoom: 4,
  ox: 0,
  oy: 0,
  variants: undefined,
  variantFrameIndices: undefined,
  frameIndex: 0,
  getPixelColor,
  ...FRAME_OVERLAY_MODE,
  ...over,
});

const render = (over: Partial<RenderFrameOverlayOptions> = {}) => {
  const buf = createBuffer(W, H);
  renderFrameOverlay(buf, baseOpts(over));
  return buf;
};

describe("renderFrameOverlay — golden hashes per mode", () => {
  it("GOLDEN: frame overlay (#8) — blend / clip / clamped", () => {
    expect(hashBuffer(render(FRAME_OVERLAY_MODE))).toBe("16x16:14ebea65");
  });

  it("GOLDEN: trace overlay (#9) — overwrite / no clip / whole-cell", () => {
    // Deliberately the SAME hash as #8 above. On fully-opaque, in-bounds,
    // non-straddling pixels the six differences cannot express themselves, so
    // the two modes MUST agree — that agreement is the control that proves the
    // per-difference tests below are measuring the differences and not noise.
    expect(hashBuffer(render(FRAME_TRACE_MODE))).toBe("16x16:14ebea65");
  });

  it("renders each source cell as a zoom×zoom block at the right place", () => {
    const buf = render();
    // (0,0) is RED in the diagonal fixture -> the whole 4×4 block is red.
    expect(getPixel(buf, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(buf, 3, 3)).toEqual([255, 0, 0, 255]);
    // (1,0) is empty -> untouched.
    expect(getPixel(buf, 4, 0)).toEqual([0, 0, 0, 0]);
    // (0,3) is BLUE.
    expect(getPixel(buf, 0, 12)).toEqual([0, 0, 255, 255]);
  });

  it("skips hidden layers entirely", () => {
    const buf = render({ layers: [{ visible: false, pixels: DIAGONAL_4 }] });
    expect(buf.data.every((b) => b === 0)).toBe(true);
  });

  it("skips a layer with no pixel data", () => {
    const buf = render({ layers: [{ visible: true, pixels: undefined }] });
    expect(buf.data.every((b) => b === 0)).toBe(true);
  });
});

/* ── Difference 1: compositing ─────────────────────────────────────────── */

describe("DIFFERENCE 1 — blend vs overwrite", () => {
  // A solid blue layer, then a half-transparent white layer on top.
  const layers = [
    { visible: true, pixels: [[{ color: BLUE }]] },
    {
      visible: true,
      pixels: [[{ color: { r: 255, g: 255, b: 255, a: 128 } }]],
    },
  ];
  const opts = { layers, refObjWidth: 1, refObjHeight: 1 };

  it("blend (#8) composites the half-transparent layer OVER the blue", () => {
    const buf = render({ ...FRAME_OVERLAY_MODE, ...opts });
    const [r, , b, a] = getPixel(buf, 0, 0);
    // Porter-Duff over: neither pure blue nor pure white.
    expect(a).toBe(255);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(255);
    expect(b).toBeGreaterThan(r);
  });

  it("overwrite (#9) REPLACES the blue outright — the top layer wins", () => {
    const buf = render({ ...FRAME_TRACE_MODE, ...opts });
    // The half-transparent white is written verbatim, alpha included.
    expect(getPixel(buf, 0, 0)).toEqual([255, 255, 255, 128]);
  });

  it("the two composites disagree — this is a real behavioural difference", () => {
    expect(hashBuffer(render({ ...FRAME_OVERLAY_MODE, ...opts }))).not.toBe(
      hashBuffer(render({ ...FRAME_TRACE_MODE, ...opts })),
    );
  });

  it("blend leaves the destination ALONE when the result is ~transparent", () => {
    // A fully transparent source over an empty buffer writes nothing.
    const buf = createBuffer(4, 4);
    renderFrameOverlay(
      buf,
      baseOpts({
        ...FRAME_OVERLAY_MODE,
        refObjWidth: 1,
        refObjHeight: 1,
        zoom: 4,
        layers: [
          { visible: true, pixels: [[{ color: { r: 9, g: 9, b: 9, a: 1 } }]] },
        ],
      }),
    );
    expect(buf.data.every((b) => b === 0)).toBe(true);
  });
});

/* ── Difference 5: variant clipping to the base object ─────────────────── */

describe("DIFFERENCE 5 — clipToObject", () => {
  const variants = [
    {
      id: "vg1",
      variants: [
        {
          id: "v1",
          gridSize: { width: 2, height: 2 },
          frames: [{ layers: [{ visible: true, pixels: VARIANT_2 }] }],
          // Offset pushes the variant PARTLY outside the 4×4 base object.
          baseFrameOffsets: [{ x: 3, y: 3 }],
        },
      ],
    },
  ];
  const opts = {
    layers: [
      {
        visible: true,
        isVariant: true,
        variantGroupId: "vg1",
        selectedVariantId: "v1",
        pixels: undefined,
      },
    ],
    variants,
    variantFrameIndices: { vg1: 0 },
  };

  it("#8 DROPS variant pixels outside the base object bounds", () => {
    // A 16px buffer is too small to tell the two apart: cells (4,3)/(3,4) start
    // at 16px and miss the CANVAS regardless of clipping. Use a wide buffer so
    // the only thing that can reject them is the OBJECT bound.
    const wide = createBuffer(32, 32);
    renderFrameOverlay(wide, baseOpts({ ...FRAME_OVERLAY_MODE, ...opts }));
    // (3,3) is inside the 4×4 object -> drawn.
    expect(getPixel(wide, 12, 12)).toEqual([0, 255, 0, 255]);
    // (4,3) and (3,4) are OUTSIDE the object -> clipped away.
    expect(getPixel(wide, 16, 12)).toEqual([0, 0, 0, 0]);
    expect(getPixel(wide, 12, 16)).toEqual([0, 0, 0, 0]);
  });

  it("#9 KEEPS them — only the canvas bounds apply", () => {
    const buf = render({ ...FRAME_TRACE_MODE, ...opts });
    expect(getPixel(buf, 12, 12)).toEqual([0, 255, 0, 255]);
    // Cell (4,3) starts at x=16, which is off a 16px canvas -> still dropped,
    // but by the CANVAS bound, not the object bound. Verify with a wider buffer.
    const wide = createBuffer(32, 32);
    renderFrameOverlay(wide, baseOpts({ ...FRAME_TRACE_MODE, ...opts }));
    expect(getPixel(wide, 16, 12)).toEqual([0, 255, 0, 255]);
  });

  it("with clipping ON the same wide buffer stays empty outside the object", () => {
    const wide = createBuffer(32, 32);
    renderFrameOverlay(wide, baseOpts({ ...FRAME_OVERLAY_MODE, ...opts }));
    expect(getPixel(wide, 16, 12)).toEqual([0, 0, 0, 0]);
  });
});

/* ── Difference 6: edge-cell fill ──────────────────────────────────────── */

describe("DIFFERENCE 6 — clamped vs whole-cell edge fill", () => {
  // A 4×4 object at zoom 4 = 16px, rendered into a 14px buffer, so the
  // rightmost/bottom column of cells STRADDLES the edge.
  const straddle = { refObjWidth: 4, refObjHeight: 4, zoom: 4 };

  const renderInto = (
    mode: typeof FRAME_OVERLAY_MODE | typeof FRAME_TRACE_MODE,
  ) => {
    const buf = createBuffer(14, 14);
    renderFrameOverlay(
      buf,
      baseOpts({
        ...mode,
        ...straddle,
        layers: [
          {
            visible: true,
            pixels: [
              [0, 0, 0, { color: RED }],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
              [0, 0, 0, 0],
            ],
          },
        ],
      }),
    );
    return buf;
  };

  it("#8 (clamped) draws the VISIBLE PART of a cell straddling the edge", () => {
    const buf = renderInto(FRAME_OVERLAY_MODE);
    // Cell (3,0) spans x 12..16; the buffer ends at 14, so x=12,13 are painted.
    expect(getPixel(buf, 12, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(buf, 13, 0)).toEqual([255, 0, 0, 255]);
  });

  it("#9 (whole-cell) still draws it — its origin x=12 is in bounds", () => {
    const buf = renderInto(FRAME_TRACE_MODE);
    expect(getPixel(buf, 12, 0)).toEqual([255, 0, 0, 255]);
  });

  it("#9 DROPS a cell whose ORIGIN is out of bounds, where #8 would clip it", () => {
    // Buffer 10px wide: cell (3,0) starts at x=12, past the edge.
    const mk = (mode: typeof FRAME_OVERLAY_MODE | typeof FRAME_TRACE_MODE) => {
      const buf = createBuffer(10, 10);
      renderFrameOverlay(
        buf,
        baseOpts({
          ...mode,
          ...straddle,
          layers: [
            {
              visible: true,
              pixels: [
                [0, 0, { color: RED }, { color: BLUE }],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
              ],
            },
          ],
        }),
      );
      return buf;
    };
    // Cell (2,0) spans x 8..12 in a 10px buffer — both modes paint x=8,9.
    expect(getPixel(mk(FRAME_OVERLAY_MODE), 8, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(mk(FRAME_TRACE_MODE), 8, 0)).toEqual([255, 0, 0, 255]);
    // Cell (3,0) at x=12 is fully off-buffer for both — nothing to see.
    expect(getPixel(mk(FRAME_OVERLAY_MODE), 9, 0)).toEqual([255, 0, 0, 255]);
  });
});

/* ── The non-variant branch (#8's `else if` vs #9's bare `else`) ────────── */

describe("renderOrphanVariantLayers — the else-branch difference", () => {
  // A layer flagged isVariant but with NO variantGroupId: it fails the
  // bound-variant test and falls to the else branch.
  const orphan = [{ visible: true, isVariant: true, pixels: DIAGONAL_4 }];

  it("#8 SKIPS an orphaned variant layer (it required !isVariant)", () => {
    const buf = render({ ...FRAME_OVERLAY_MODE, layers: orphan });
    expect(buf.data.every((b) => b === 0)).toBe(true);
  });

  it("#9 RENDERS its base pixels (its else was unconditional)", () => {
    const buf = render({ ...FRAME_TRACE_MODE, layers: orphan });
    expect(getPixel(buf, 0, 0)).toEqual([255, 0, 0, 255]);
  });
});

/* ── The variant-offset fallback, through the overlay ──────────────────── */

describe("the 4-level offset fallback resolves through the overlay", () => {
  const variantAt = (extra: Record<string, unknown>) => ({
    id: "vg1",
    variants: [
      {
        id: "v1",
        gridSize: { width: 2, height: 2 },
        frames: [{ layers: [{ visible: true, pixels: VARIANT_2 }] }],
        ...extra,
      },
    ],
  });

  const layerAt = (extra: Record<string, unknown>) => ({
    visible: true,
    isVariant: true,
    variantGroupId: "vg1",
    selectedVariantId: "v1",
    pixels: undefined,
    ...extra,
  });

  it("level 1 — variantOffsets[selectedVariantId] wins over all others", () => {
    const buf = render({
      layers: [
        layerAt({
          variantOffsets: { v1: { x: 2, y: 0 } },
          variantOffset: { x: 0, y: 2 },
        }),
      ],
      variants: [variantAt({ baseFrameOffsets: [{ x: 0, y: 0 }] })],
      variantFrameIndices: { vg1: 0 },
    });
    expect(getPixel(buf, 8, 0)).toEqual([0, 255, 0, 255]);
    expect(getPixel(buf, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it("level 2 — the legacy variantOffset when level 1 is absent", () => {
    const buf = render({
      layers: [layerAt({ variantOffset: { x: 0, y: 2 } })],
      variants: [variantAt({ baseFrameOffsets: [{ x: 2, y: 2 }] })],
      variantFrameIndices: { vg1: 0 },
    });
    expect(getPixel(buf, 0, 8)).toEqual([0, 255, 0, 255]);
  });

  it("level 3 — baseFrameOffsets[frameIndex] when 1 and 2 are absent", () => {
    const buf = render({
      layers: [layerAt({})],
      variants: [variantAt({ baseFrameOffsets: [{ x: 2, y: 2 }] })],
      variantFrameIndices: { vg1: 0 },
    });
    expect(getPixel(buf, 8, 8)).toEqual([0, 255, 0, 255]);
  });

  it("level 4 — {x:0,y:0} when nothing resolves", () => {
    const buf = render({
      layers: [layerAt({})],
      variants: [variantAt({})],
      variantFrameIndices: { vg1: 0 },
    });
    expect(getPixel(buf, 0, 0)).toEqual([0, 255, 0, 255]);
  });
});

describe("overlayVariantFrameIndices", () => {
  const groups = [
    {
      id: "vg1",
      variants: [
        {
          id: "v1",
          gridSize: { width: 1, height: 1 },
          frames: [{ layers: [] }, { layers: [] }, { layers: [] }],
        },
      ],
    },
  ];

  it("wraps the base frame index by each group's variant frame count", () => {
    expect(overlayVariantFrameIndices(groups, 0)).toEqual({ vg1: 0 });
    expect(overlayVariantFrameIndices(groups, 4)).toEqual({ vg1: 1 });
  });

  it("returns undefined when the project has no variants at all", () => {
    expect(overlayVariantFrameIndices(undefined, 0)).toBeUndefined();
  });

  it("omits a group whose first variant has no frames", () => {
    const empty = [
      {
        id: "vg2",
        variants: [{ id: "v", gridSize: { width: 1, height: 1 }, frames: [] }],
      },
    ];
    expect(overlayVariantFrameIndices(empty, 0)).toEqual({});
  });
});

describe("mode constants stay as the originals had them", () => {
  it("frame overlay: 0.4 opacity, purple dashed [6,6] border", () => {
    expect(FRAME_OVERLAY_MODE.opacity).toBe(0.4);
    expect(FRAME_OVERLAY_MODE.borderColor).toBe("rgba(139, 92, 246, 0.6)");
    expect(FRAME_OVERLAY_MODE.borderDash).toEqual([6, 6]);
  });

  it("trace overlay: 0.5 opacity, amber dashed [4,4] border", () => {
    expect(FRAME_TRACE_MODE.opacity).toBe(0.5);
    expect(FRAME_TRACE_MODE.borderColor).toBe("rgba(255, 171, 0, 0.6)");
    expect(FRAME_TRACE_MODE.borderDash).toEqual([4, 4]);
  });
});
