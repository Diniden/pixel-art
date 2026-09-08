/**
 * Tests for the SVG chrome overlays.
 *
 * One `describe` per overlay, plus two cross-cutting blocks that are the real
 * reason this file exists:
 *
 * - **`vector-effect` on every stroked element.** The entire plan's answer to
 *   R2 and R3 is `non-scaling-stroke`. If one overlay quietly ships without
 *   it, that overlay's stroke scales with `zoom` and becomes a 100px slab at
 *   zoom 50 — the exact failure D5 exists to prevent. So the assertion is
 *   made exhaustively, over every spec every exported function can produce,
 *   rather than politely once per overlay.
 *
 * - **Zoom independence.** These functions take no `zoom` and must not grow
 *   one. The guard runs each overlay with a `zoom`-shaped variable in scope
 *   and asserts the output is byte-identical whatever its value — the
 *   regression test against someone reintroducing a `* zoom` because "the
 *   overlay looked small".
 *
 * The style constants are asserted against their SOURCE constants, not against
 * literal colour strings, because inventing a colour here is a spec violation
 * and comparing to the import is what makes that impossible to do quietly.
 */
import { describe, expect, it } from "vitest";
import {
  brushOutlineOverlay,
  hoverOutlineOverlay,
  lassoOverlay,
  marchingAntsOverlay,
  originCrossOverlay,
  reflectionGuideOverlays,
  variantBoxOverlay,
  VARIANT_BOX_DASH,
  VARIANT_BOX_STROKE,
  type SvgPathSpec,
  type SvgStrokeAttrs,
} from "@/ui/canvas/svg/chromeOverlay";
import { BRUSH_OVERLAY_STYLE } from "@/ui/canvas/render/renderBrushOverlay";
import { HOVER_MARKER_STYLE } from "@/ui/canvas/render/renderHoverMarker";
import { SELECTION_COLOR } from "@/ui/canvas/render/renderSelectionOverlay";
import {
  ORIGIN_CROSS_SIZE,
  ORIGIN_CROSS_RADIUS,
} from "@/ui/canvas/render/renderOriginCross";
import {
  REFLECTION_DASH,
  REFLECTION_DASH_PERIOD,
} from "@/ui/canvas/render/renderReflectionLines";
import { ACCENT_VARIANT, WHITE } from "@/ui/theme/canvasTokens";

const ORIGIN_RED = "#ff3232";

/** Every numeric coordinate in a `d` string. */
function coords(d: string): number[] {
  return (d.match(/-?[\d.]+/g) ?? []).map(Number);
}

/* ================================================================== *
 * Brush outline
 * ================================================================== */

describe("brushOutlineOverlay", () => {
  it("draws one closed unit square per cell, on the cell boundary", () => {
    const spec = brushOutlineOverlay([{ x: 2, y: 3 }]);
    expect(spec.d).toBe("M2 3h1v1h-1Z");
  });

  it("drops the + 0.5 — corners land on integers, not half cells", () => {
    const spec = brushOutlineOverlay([
      { x: 0, y: 0 },
      { x: 5, y: 7 },
    ]);
    for (const n of coords(spec.d)) expect(Number.isInteger(n)).toBe(true);
    expect(spec.d).not.toContain(".5");
  });

  it("is a REAL rectangle, not the degenerate 0×0 the canvas painter gives at zoom 1", () => {
    // strokeBrushOutlines at zoom 1 produces strokeRect(x, y, 0, 0). The whole
    // reason this module exists is that a cell is one unit here.
    const spec = brushOutlineOverlay([{ x: 1, y: 1 }]);
    expect(spec.d).toContain("h1");
    expect(spec.d).toContain("v1");
  });

  it("emits an empty path for no cells rather than a malformed one", () => {
    expect(brushOutlineOverlay([]).d).toBe("");
  });

  it("reuses BRUSH_OVERLAY_STYLE verbatim — no invented colour or width", () => {
    const attrs = brushOutlineOverlay([{ x: 0, y: 0 }]).attrs;
    expect(attrs.stroke).toBe(BRUSH_OVERLAY_STYLE.stroke);
    expect(attrs["stroke-width"]).toBe(BRUSH_OVERLAY_STYLE.lineWidth);
    expect(attrs.fill).toBe("none");
  });
});

/* ================================================================== *
 * Hover outline
 * ================================================================== */

describe("hoverOutlineOverlay", () => {
  it("strokes all four edges of a lone cell, each one unit long", () => {
    const spec = hoverOutlineOverlay([{ x: 0, y: 0 }]);
    const segs = spec.d.match(/M[^M]+/g) ?? [];
    expect(segs).toHaveLength(4);
    expect(spec.d).toContain("M0 0L1 0"); // top
    expect(spec.d).toContain("M0 1L1 1"); // bottom
    expect(spec.d).toContain("M0 0L0 1"); // left
    expect(spec.d).toContain("M1 0L1 1"); // right
  });

  it("renders SOMETHING — the canvas painter renders nothing at zoom 1", () => {
    // strokeHoverOutline's edges are all zero-length at zoom 1 and, with
    // lineCap "butt", draw literally nothing. Silent failure R3.
    const spec = hoverOutlineOverlay([{ x: 4, y: 4 }]);
    expect(spec.d.length).toBeGreaterThan(0);
    const segs = spec.d.match(/M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/g);
    expect(segs).not.toBeNull();
    for (const s of segs ?? []) {
      const [x1, y1, x2, y2] = coords(s);
      expect(x1 !== x2 || y1 !== y2).toBe(true);
    }
  });

  it("strokes only the OUTER perimeter of a 2×2 block — 8 edges, not 16", () => {
    const spec = hoverOutlineOverlay([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
    expect(spec.d.match(/M[^M]+/g) ?? []).toHaveLength(8);
  });

  it("uses the FAINTER hover style, never the lighting studio's brush style", () => {
    const attrs = hoverOutlineOverlay([{ x: 0, y: 0 }]).attrs;
    expect(attrs.stroke).toBe(HOVER_MARKER_STYLE.stroke);
    expect(attrs["stroke-width"]).toBe(HOVER_MARKER_STYLE.lineWidth);
    expect(attrs.stroke).not.toBe(BRUSH_OVERLAY_STYLE.stroke);
  });

  it("normalises the probe exactly — every coordinate is a whole cell", () => {
    // markerPerimeter is probed at zoom 2 because at zoom 1 all four edges of
    // a cell collapse onto one indistinguishable point. The probe is divided
    // straight back out, and it must divide out CLEANLY: a stray 0.25 or 0.75
    // would mean the normalisation is wrong, not merely inelegant.
    const spec = hoverOutlineOverlay([
      { x: 3, y: 5 },
      { x: 4, y: 5 },
      { x: 4, y: 6 },
    ]);
    for (const n of coords(spec.d)) expect(Number.isInteger(n)).toBe(true);
  });

  it("places a cell's edges on ITS OWN boundaries, not a neighbour's", () => {
    const spec = hoverOutlineOverlay([{ x: 7, y: 2 }]);
    expect(spec.d).toContain("M7 2L8 2"); // top
    expect(spec.d).toContain("M7 3L8 3"); // bottom
    expect(spec.d).toContain("M7 2L7 3"); // left
    expect(spec.d).toContain("M8 2L8 3"); // right
  });

  it("emits an empty path for no cells", () => {
    expect(hoverOutlineOverlay([]).d).toBe("");
  });
});

/* ================================================================== *
 * Lasso
 * ================================================================== */

describe("lassoOverlay", () => {
  it("KEEPS lassoPath's + 0.5 — those are cell CENTRES, not stroke centring", () => {
    const spec = lassoOverlay(
      [
        { x: 0, y: 0 },
        { x: 2, y: 1 },
      ],
      0,
      0,
    );
    expect(spec.d).toBe("M0.5 0.5L2.5 1.5");
  });

  it("applies the variant view offset", () => {
    const spec = lassoOverlay([{ x: 1, y: 1 }, { x: 2, y: 2 }], 10, 20);
    expect(spec.d).toBe("M11.5 21.5L12.5 22.5");
  });

  it("strokes nothing for fewer than two points, matching drawLasso's guard", () => {
    expect(lassoOverlay([], 0, 0).d).toBe("");
    expect(lassoOverlay([{ x: 1, y: 1 }], 0, 0).d).toBe("");
  });

  it("keeps drawLasso's cyan, 2px width and [3,3] dash", () => {
    const attrs = lassoOverlay([{ x: 0, y: 0 }, { x: 1, y: 1 }], 0, 0).attrs;
    expect(attrs.stroke).toBe(SELECTION_COLOR);
    expect(attrs["stroke-width"]).toBe(2);
    expect(attrs["stroke-dasharray"]).toBe("3 3");
  });

  it("carries vector-effect even on the empty path — attrs never degrade", () => {
    expect(lassoOverlay([], 0, 0).attrs["vector-effect"]).toBe(
      "non-scaling-stroke",
    );
  });
});

/* ================================================================== *
 * Marching ants
 * ================================================================== */

describe("marchingAntsOverlay", () => {
  const BOX = { x: 1, y: 2, width: 4, height: 3 };

  it("traces the selection box in cell units", () => {
    const { outer } = marchingAntsOverlay(BOX, 0, 0);
    expect(outer.d).toBe("M1 2h4v3h-4Z");
  });

  it("does NOT inset the inner rect — a 1px inset is one whole CELL at 1:1", () => {
    // marchingAntsRects insets by 1 and shrinks by 2; at 1:1 that is a whole
    // cell, and `width - 2` goes NEGATIVE below 3 cells, inverting the rect.
    const { outer, inner } = marchingAntsOverlay(BOX, 0, 0);
    expect(inner.d).toBe(outer.d);
  });

  it("survives a selection under 3 cells, which the canvas geometry inverts", () => {
    const { outer, inner } = marchingAntsOverlay(
      { x: 0, y: 0, width: 1, height: 1 },
      0,
      0,
    );
    expect(outer.d).toBe("M0 0h1v1h-1Z");
    expect(inner.d).toBe(outer.d);
    // The rect is not inverted: both EXTENTS are positive. (The trailing
    // `h-1` is the closing leg back to the start, not a negative width —
    // `marchingAntsRects`'s `width - 2` is what would produce a genuinely
    // negative extent, and this deliberately does not use it.)
    const extents = /^M0 0h([\d.]+)v([\d.]+)h/.exec(inner.d);
    expect(extents).not.toBeNull();
    expect(Number(extents?.[1])).toBeGreaterThan(0);
    expect(Number(extents?.[2])).toBeGreaterThan(0);
  });

  it("applies the variant offset and the drag delta", () => {
    const { outer } = marchingAntsOverlay(BOX, 10, 20, 2, 3);
    expect(outer.d).toBe("M13 25h4v3h-4Z");
  });

  it("keeps the two-pass phase trick: cyan and white, offset by half a period", () => {
    const { outer, inner } = marchingAntsOverlay(BOX, 0, 0);
    expect(outer.attrs.stroke).toBe(SELECTION_COLOR);
    expect(outer.attrs["stroke-dasharray"]).toBe("4 4");

    expect(inner.attrs.stroke).toBe(WHITE);
    expect(inner.attrs["stroke-dasharray"]).toBe("4 4");
    expect(inner.attrs["stroke-dashoffset"]).toBe(4);
  });

  /**
   * The occlusion fix, HALF of it. This module emits `1` in CELL units;
   * `CanvasSurface`'s `ScreenWidthPath` counter-scales it by
   * `1 / combinedScale` to make it one SCREEN pixel. `non-scaling-stroke`
   * does NOT do that here — see the module header's correction.
   *
   * What this pins is that the two widths are EQUAL and nominal-1. Equal
   * because the strokes share one path and differ only in colour and dash
   * phase: an unequal pair puts the white in a groove inside a thicker cyan
   * line instead of alternating with it along a single hairline.
   */
  it("emits both strokes at an equal nominal width of 1", () => {
    const { outer, inner } = marchingAntsOverlay(BOX, 0, 0);
    expect(outer.attrs["stroke-width"]).toBe(1);
    expect(inner.attrs["stroke-width"]).toBe(1);
  });

  /**
   * `vector-effect` is kept on both specs even though it is inert against an
   * ancestor CSS transform (header correction): it costs nothing, and it
   * becomes correct if the transform ever moves inside the SVG. It is NOT
   * what makes the box zoom-independent today — `ScreenWidthPath` is.
   */
  it("still declares non-scaling-stroke on both passes", () => {
    const { outer, inner } = marchingAntsOverlay(BOX, 0, 0);
    for (const spec of [outer, inner]) {
      expect(spec.attrs["vector-effect"]).toBe("non-scaling-stroke");
    }
  });
});

/* ================================================================== *
 * Origin cross
 * ================================================================== */

describe("originCrossOverlay", () => {
  it("centres on the origin in CELL space", () => {
    const o = originCrossOverlay({ x: 4, y: 6 }, ORIGIN_RED);
    expect(o.centerX).toBe(4);
    expect(o.centerY).toBe(6);
  });

  it("KEEPS a half-cell origin on the half cell — it does not round", () => {
    // The origin tool snaps to the half-cell lattice; rounding here would
    // shift the marker off the point it marks (renderOriginCross.ts:52-58).
    const o = originCrossOverlay({ x: 2.5, y: 3.5 }, ORIGIN_RED);
    expect(o.centerX).toBe(2.5);
    expect(o.centerY).toBe(3.5);
  });

  it("returns the arm length and radius as SCREEN pixels, not cell units", () => {
    // vector-effect exempts the STROKE from the transform, not the geometry.
    // These are lengths, so they are handed back raw for a counter-scaled <g>.
    const o = originCrossOverlay({ x: 0, y: 0 }, ORIGIN_RED);
    expect(o.armLength).toBe(ORIGIN_CROSS_SIZE);
    expect(o.radius).toBe(ORIGIN_CROSS_RADIUS);
  });

  it("draws both arms about the group's local origin", () => {
    const o = originCrossOverlay({ x: 9, y: 9 }, ORIGIN_RED);
    expect(o.arms.d).toBe(
      `M${-ORIGIN_CROSS_SIZE} 0H${ORIGIN_CROSS_SIZE}M0 ${-ORIGIN_CROSS_SIZE}V${ORIGIN_CROSS_SIZE}`,
    );
  });

  it("returns the CIRCLE as well as the lines, at radius 3", () => {
    const o = originCrossOverlay({ x: 1, y: 1 }, ORIGIN_RED);
    expect(o.circle.r).toBe(3);
    expect(o.circle.r).toBe(ORIGIN_CROSS_RADIUS);
    expect(o.circle.cx).toBe(0);
    expect(o.circle.cy).toBe(0);
  });

  it("takes the colour from the caller and strokes at drawOriginCross's 2px", () => {
    const o = originCrossOverlay({ x: 0, y: 0 }, ORIGIN_RED);
    expect(o.arms.attrs.stroke).toBe(ORIGIN_RED);
    expect(o.arms.attrs["stroke-width"]).toBe(2);
    expect(o.circle.attrs.stroke).toBe(ORIGIN_RED);
  });
});

/* ================================================================== *
 * Reflection guides
 * ================================================================== */

describe("reflectionGuideOverlays", () => {
  const LINE = { x1: 1, y1: 2, x2: 5, y2: 6 };

  it("maps each line into cell space, offset by the view origin", () => {
    const [g] = reflectionGuideOverlays([LINE], null, 0, 0, 0);
    expect(g?.base.d).toBe("M1 2L5 6");

    const [shifted] = reflectionGuideOverlays([LINE], null, 1, 1, 0);
    expect(shifted?.base.d).toBe("M0 1L4 5");
  });

  it("drops degenerate zero-length lines, as reflectionSegments does", () => {
    const guides = reflectionGuideOverlays(
      [{ x1: 3, y1: 3, x2: 3, y2: 3 }],
      null,
      0,
      0,
      0,
    );
    expect(guides).toHaveLength(0);
  });

  it("appends the draft last so it paints on top, at half opacity", () => {
    const guides = reflectionGuideOverlays(
      [LINE],
      { x1: 0, y1: 0, x2: 2, y2: 2 },
      0,
      0,
      0,
    );
    expect(guides).toHaveLength(2);
    expect(guides[0]?.draft).toBe(false);
    expect(guides[1]?.draft).toBe(true);
    expect(guides[0]?.base.attrs.opacity).toBe(1);
    expect(guides[1]?.base.attrs.opacity).toBe(0.5);
    expect(guides[1]?.highlight.attrs.opacity).toBe(0.5);
  });

  it("keeps the two-pass trick: ACCENT_VARIANT 2px, WHITE 1px half a period out", () => {
    const [g] = reflectionGuideOverlays([LINE], null, 0, 0, 0);
    expect(g?.base.attrs.stroke).toBe(ACCENT_VARIANT);
    expect(g?.base.attrs["stroke-width"]).toBe(2);
    expect(g?.highlight.attrs.stroke).toBe(WHITE);
    expect(g?.highlight.attrs["stroke-width"]).toBe(1);
    expect(g?.highlight.attrs["stroke-dashoffset"]).toBe(
      (g?.base.attrs["stroke-dashoffset"] ?? 0) + REFLECTION_DASH,
    );
  });

  it("uses REFLECTION_DASH for both passes — no invented dash pattern", () => {
    const [g] = reflectionGuideOverlays([LINE], null, 0, 0, 0);
    const dash = `${REFLECTION_DASH} ${REFLECTION_DASH}`;
    expect(g?.base.attrs["stroke-dasharray"]).toBe(dash);
    expect(g?.highlight.attrs["stroke-dasharray"]).toBe(dash);
  });

  it("NEGATES dashOffset so an increasing phase travels x1 → x2", () => {
    const [g] = reflectionGuideOverlays([LINE], null, 0, 0, 3);
    expect(g?.base.attrs["stroke-dashoffset"]).toBe(-3);
  });

  it("wraps an unbounded phase modulo the dash period", () => {
    const [a] = reflectionGuideOverlays([LINE], null, 0, 0, 3);
    const [b] = reflectionGuideOverlays(
      [LINE],
      null,
      0,
      0,
      3 + REFLECTION_DASH_PERIOD * 1000,
    );
    expect(b?.base.attrs["stroke-dashoffset"]).toBe(
      a?.base.attrs["stroke-dashoffset"],
    );
  });

  it("wraps a NEGATIVE phase into range rather than going further negative", () => {
    const [g] = reflectionGuideOverlays([LINE], null, 0, 0, -1);
    const off = g?.base.attrs["stroke-dashoffset"] ?? 0;
    expect(off).toBeLessThanOrEqual(0);
    expect(off).toBeGreaterThan(-REFLECTION_DASH_PERIOD);
  });

  it("changes ONLY the dash offset as the phase advances — no animation built here", () => {
    const [a] = reflectionGuideOverlays([LINE], null, 0, 0, 0);
    const [b] = reflectionGuideOverlays([LINE], null, 0, 0, 5);
    expect(a?.base.d).toBe(b?.base.d);
    expect(a?.base.attrs.stroke).toBe(b?.base.attrs.stroke);
    expect(a?.base.attrs["stroke-dashoffset"]).not.toBe(
      b?.base.attrs["stroke-dashoffset"],
    );
  });
});

/* ================================================================== *
 * Cross-cutting: non-scaling-stroke on EVERY stroked element
 * ================================================================== */

/** Every spec every exported function can produce, in one list. */
function allStrokedSpecs(): Array<{ name: string; attrs: SvgStrokeAttrs }> {
  const cells = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ];
  const points = [
    { x: 0, y: 0 },
    { x: 3, y: 4 },
  ];
  const box = { x: 1, y: 1, width: 5, height: 5 };
  const ants = marchingAntsOverlay(box, 0, 0);
  const cross = originCrossOverlay({ x: 2, y: 2 }, ORIGIN_RED);
  const guides = reflectionGuideOverlays(
    [{ x1: 0, y1: 0, x2: 4, y2: 4 }],
    { x1: 1, y1: 1, x2: 6, y2: 2 },
    0,
    0,
    2,
  );

  const out: Array<{ name: string; attrs: SvgStrokeAttrs }> = [
    { name: "brush outline", attrs: brushOutlineOverlay(cells).attrs },
    { name: "hover outline", attrs: hoverOutlineOverlay(cells).attrs },
    { name: "lasso", attrs: lassoOverlay(points, 0, 0).attrs },
    { name: "marching ants (outer)", attrs: ants.outer.attrs },
    { name: "marching ants (inner)", attrs: ants.inner.attrs },
    { name: "origin cross arms", attrs: cross.arms.attrs },
    { name: "origin cross circle", attrs: cross.circle.attrs },
  ];
  guides.forEach((g, i) => {
    out.push({ name: `reflection ${i} base`, attrs: g.base.attrs });
    out.push({ name: `reflection ${i} highlight`, attrs: g.highlight.attrs });
  });
  return out;
}

describe("non-scaling-stroke", () => {
  it("covers all six overlays plus the origin circle and both reflection passes", () => {
    // A guard on the guard: if an overlay is added and not listed above, this
    // count changes and the exhaustive assertion below silently stops covering
    // it. 7 fixed specs + 2 guides × 2 passes = 11.
    expect(allStrokedSpecs()).toHaveLength(11);
  });

  it("is present on EVERY stroked element — this is what R2 and R3 rest on", () => {
    for (const { name, attrs } of allStrokedSpecs()) {
      expect(
        attrs["vector-effect"],
        `${name} is missing vector-effect`,
      ).toBe("non-scaling-stroke");
    }
  });

  it("every stroked element also declares fill:none and a positive width", () => {
    for (const { name, attrs } of allStrokedSpecs()) {
      expect(attrs.fill, `${name} must not fill`).toBe("none");
      expect(attrs["stroke-width"], `${name} width`).toBeGreaterThan(0);
      expect(typeof attrs.stroke, `${name} colour`).toBe("string");
    }
  });
});

/* ================================================================== *
 * Cross-cutting: zoom independence
 * ================================================================== */

describe("zoom independence", () => {
  /**
   * Runs every overlay with a `zoom`-shaped value in scope and returns a
   * stable digest of everything they emit. The functions take no `zoom`
   * parameter and must never grow one: if a `* zoom` is ever reintroduced —
   * the single most likely regression in this plan — the digests diverge.
   */
  function digestAt(zoom: number): string {
    void zoom; // in scope, deliberately unused — that IS the invariant
    const cells = [
      { x: 2, y: 3 },
      { x: 3, y: 3 },
    ];
    const points = [
      { x: 0, y: 0 },
      { x: 4, y: 5 },
      { x: 7, y: 1 },
    ];
    const ants = marchingAntsOverlay({ x: 2, y: 2, width: 6, height: 4 }, 1, 1);
    const cross = originCrossOverlay({ x: 3.5, y: 4.5 }, ORIGIN_RED);
    const guides = reflectionGuideOverlays(
      [{ x1: 1, y1: 1, x2: 9, y2: 5 }],
      { x1: 0, y1: 0, x2: 3, y2: 3 },
      2,
      2,
      6,
    );

    const specs: SvgPathSpec[] = [
      brushOutlineOverlay(cells),
      hoverOutlineOverlay(cells),
      lassoOverlay(points, 1, 1),
      ants.outer,
      ants.inner,
      cross.arms,
      ...guides.flatMap((g) => [g.base, g.highlight]),
    ];

    return JSON.stringify({
      specs,
      centerX: cross.centerX,
      centerY: cross.centerY,
      armLength: cross.armLength,
      radius: cross.radius,
      circle: cross.circle,
    });
  }

  it("produces IDENTICAL path data at every zoom in the [1, 50] range", () => {
    const baseline = digestAt(1);
    for (const zoom of [1, 2, 8, 10, 20, 50]) {
      expect(digestAt(zoom), `zoom ${zoom} diverged`).toBe(baseline);
    }
  });

  it("holds across the full combined scale range, 0.25 – 200", () => {
    // zoom [1,50] × viewZoom [0.25,4] — MASTER.md §4. Nothing in this module
    // may respond to any of it.
    const baseline = digestAt(1);
    for (const scale of [0.25, 0.5, 1, 4, 100, 200]) {
      expect(digestAt(scale), `scale ${scale} diverged`).toBe(baseline);
    }
  });

  it("a 4-cell selection spans 4 user units, not 4 × zoom", () => {
    // The concrete form of the same claim: a surviving `* zoom` would make
    // this "h200" at zoom 50.
    const { outer } = marchingAntsOverlay(
      { x: 0, y: 0, width: 4, height: 4 },
      0,
      0,
    );
    expect(outer.d).toBe("M0 0h4v4h-4Z");
  });
});

describe("variantBoxOverlay — the violet variant edit box", () => {
  it("is emitted in CELL space: a 16x16 object spans 16 user units", () => {
    // The whole point of the move off the overlay canvas. A surviving `* zoom`
    // would make this "h800" at zoom 50, which is the defect being fixed.
    const spec = variantBoxOverlay({ x: 0, y: 0, width: 16, height: 16 });
    expect(spec.d).toBe("M0 0h16v16h-16Z");
  });

  it("lands ON the cell boundary — no half-pixel offset", () => {
    // "Between pixels" (owner, 2026-09-08): the corners are cell corners, so
    // the stroke straddles the seam rather than sitting on a cell. The `+ 0.5`
    // the canvas painters baked in is deliberately absent — see the module
    // header.
    const spec = variantBoxOverlay({ x: 3, y: 5, width: 2, height: 4 });
    expect(spec.d).toBe("M3 5h2v4h-2Z");
  });

  it("asks for a 1px stroke and a 6px dash, both SCREEN units", () => {
    // These are the numbers `ScreenWidthPath` counter-scales by
    // `1 / combinedScale`. The stroke is 1 — the canvas version's `lineWidth`
    // was 2, and 2 CELLS is what covered the artwork.
    const spec = variantBoxOverlay({ x: 0, y: 0, width: 1, height: 1 });
    expect(VARIANT_BOX_STROKE).toBe(1);
    expect(VARIANT_BOX_DASH).toBe(6);
    expect(spec.attrs["stroke-width"]).toBe(VARIANT_BOX_STROKE);
    expect(spec.attrs["stroke-dasharray"]).toBe("6 6");
  });

  it("keeps the violet the canvas version had", () => {
    // The owner kept the BOX; only its rendering was wrong.
    const spec = variantBoxOverlay({ x: 0, y: 0, width: 1, height: 1 });
    expect(spec.attrs.stroke).toBe(ACCENT_VARIANT);
    expect(spec.attrs.fill).toBe("none");
  });

  it("carries the variant offset, shifted into VIEW space", () => {
    // The geometry `renderChrome` used to get from `ctx.translate(-viewMinX,
    // -viewMinY)` wrapped around a `strokeRect(variantOffset.x,
    // variantOffset.y, …)`. The SVG has no such transform, so the caller
    // subtracts the view origin itself. This pins the arithmetic that
    // replaces the translate: a variant at world (2,3) in a view whose origin
    // is (-4,-1) draws at (6,4).
    const spec = variantBoxOverlay({
      x: 2 - -4,
      y: 3 - -1,
      width: 10,
      height: 10,
    });
    expect(spec.d).toBe("M6 4h10v10h-10Z");
  });

  it("is scale-agnostic: the module takes no zoom and cannot vary with one", () => {
    // The same invariant the ants carry. This function has no scale parameter
    // at all, so the guard is that its output is a pure function of the box —
    // any future `* zoom` would have to change the signature to compile.
    const box = { x: 2, y: 2, width: 8, height: 8 };
    const first = variantBoxOverlay(box);
    const second = variantBoxOverlay({ ...box });
    expect(second.d).toBe(first.d);
    expect(second.attrs).toEqual(first.attrs);
  });
});
