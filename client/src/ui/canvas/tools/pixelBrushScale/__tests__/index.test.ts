/**
 * `pixelBrushScale/index` — the strategy registry and the layer pipeline
 * (plan 13, task 09; MASTER D7, D10, D12).
 *
 * The pipeline composes task 07's `resamplePixelBrushGrid` and task 08's
 * scalers, so the expected grids below are either those modules' own pinned
 * answers (the 2×2 checker at 4× nearest; the 3×3 diagonal at EPX 2×) or a
 * hand-computed nearest pass over them, with the index arithmetic shown
 * inline:
 *
 *   u = (i + 0.5) · src / dst − 0.5,   index = floor(u + 0.5) clamped.
 */

import { describe, expect, it } from "vitest";
import type { BrushCell, BrushDelta } from "@/types/brush";
import {
  DEFAULT_PIXEL_BRUSH_SCALE,
  PIXEL_BRUSH_2D_STRATEGY_IDS,
  PIXEL_BRUSH_SCALE_OPTIONS,
  isPixelBrush2DStrategy,
  isPixelBrushScaleStrategy,
  scalePixelBrushGrid,
  scalePixelBrushLayers,
} from "../index";
import type { PixelBrushScaleRequest, PixelBrushScaleStrategy } from "../index";
import { PIXEL_BRUSH_HQ2X } from "../hqx";
import {
  PIXEL_BRUSH_KERNEL_IDS,
  PIXEL_BRUSH_KERNELS,
  resamplePixelBrushGrid,
} from "../kernels";
import { PIXEL_BRUSH_SCALER_IDS, PIXEL_BRUSH_SCALERS } from "../pixelArt";

/* ── Fixtures ──────────────────────────────────────────────────────────────── */

/** The one painted value of the diagonal fixtures (task 08's `X`). */
const X: BrushDelta = [100, -20, 5, 255];

/** ASCII grid → cells: `X` is a fresh clone of `X`, anything else is `0`. */
function parse(rows: readonly string[]): BrushCell[][] {
  return rows.map((row) =>
    [...row].map((ch): BrushCell => (ch === "X" ? [...X] : 0)),
  );
}

const DIAGONAL = ["X..", ".X.", "..X"];

/** Task 08's pinned EPX answer for the diagonal (clamp-to-edge). */
const DIAGONAL_EPX_6 = [
  "XX....", //
  "X.X...",
  ".XXX..",
  "..XXX.",
  "...X.X",
  "....XX",
];

function req(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  x: PixelBrushScaleStrategy,
  y: PixelBrushScaleStrategy = x,
): PixelBrushScaleRequest {
  return { srcW, srcH, dstW, dstH, x, y };
}

const nearest = (
  g: BrushCell[][],
  w: number,
  h: number,
  dw: number,
  dh: number,
) => resamplePixelBrushGrid(g, w, h, dw, dh, "nearest", "nearest");

const epx = (g: BrushCell[][], w: number, h: number) =>
  PIXEL_BRUSH_SCALERS.epx.scale(g, w, h);

/** No row or tuple of `out` is shared with `src`. */
function expectFresh(out: BrushCell[][], src: BrushCell[][]): void {
  expect(out).not.toBe(src);
  for (const row of out) {
    for (const srcRow of src) {
      expect(row).not.toBe(srcRow);
      for (const cell of row) {
        if (cell === 0) continue;
        for (const srcCell of srcRow) expect(cell).not.toBe(srcCell);
      }
    }
  }
}

/* ── Registry ──────────────────────────────────────────────────────────────── */

describe("PIXEL_BRUSH_SCALE_OPTIONS", () => {
  it("lists the 7 kernels, the 4 pixel-art scalers, then hq2x — 12 options", () => {
    expect(PIXEL_BRUSH_SCALE_OPTIONS).toHaveLength(12);
    expect(PIXEL_BRUSH_2D_STRATEGY_IDS).toEqual([
      ...PIXEL_BRUSH_SCALER_IDS,
      "hq2x",
    ]);
    expect(PIXEL_BRUSH_SCALE_OPTIONS.map((o) => o.id)).toEqual([
      ...PIXEL_BRUSH_KERNEL_IDS,
      ...PIXEL_BRUSH_SCALER_IDS,
      "hq2x",
    ]);
    expect(PIXEL_BRUSH_SCALE_OPTIONS.map((o) => o.group)).toEqual([
      ...PIXEL_BRUSH_KERNEL_IDS.map(() => "kernel"),
      ...PIXEL_BRUSH_2D_STRATEGY_IDS.map(() => "pixel-art"),
    ]);
  });

  it("has unique ids and unique shorts", () => {
    const ids = PIXEL_BRUSH_SCALE_OPTIONS.map((o) => o.id);
    const shorts = PIXEL_BRUSH_SCALE_OPTIONS.map((o) => o.short);
    expect(new Set(ids).size).toBe(12);
    expect(new Set(shorts).size).toBe(12);
  });

  it("carries each family's label and short verbatim", () => {
    for (const o of PIXEL_BRUSH_SCALE_OPTIONS) {
      const src =
        o.group === "kernel"
          ? PIXEL_BRUSH_KERNELS[o.id as (typeof PIXEL_BRUSH_KERNEL_IDS)[number]]
          : o.id === "hq2x"
            ? PIXEL_BRUSH_HQ2X
            : PIXEL_BRUSH_SCALERS[
                o.id as (typeof PIXEL_BRUSH_SCALER_IDS)[number]
              ];
      expect([o.label, o.short]).toEqual([src.label, src.short]);
    }
    expect(PIXEL_BRUSH_SCALE_OPTIONS[0]).toEqual({
      id: "nearest",
      label: "Nearest",
      short: "NN",
      group: "kernel",
    });
    expect(PIXEL_BRUSH_SCALE_OPTIONS[7]).toEqual({
      id: "epx",
      label: "EPX / Scale2x",
      short: "EPX",
      group: "pixel-art",
    });
    expect(PIXEL_BRUSH_SCALE_OPTIONS[11]).toEqual({
      id: "hq2x",
      label: "hq2x",
      short: "HQ2",
      group: "pixel-art",
    });
  });

  it("defaults to nearest, which is an option", () => {
    expect(DEFAULT_PIXEL_BRUSH_SCALE).toBe("nearest");
    expect(isPixelBrushScaleStrategy(DEFAULT_PIXEL_BRUSH_SCALE)).toBe(true);
  });
});

describe("guards", () => {
  it("isPixelBrush2DStrategy is true exactly for the pixel-art ids", () => {
    for (const id of PIXEL_BRUSH_KERNEL_IDS) {
      expect(isPixelBrush2DStrategy(id)).toBe(false);
    }
    for (const id of PIXEL_BRUSH_2D_STRATEGY_IDS) {
      expect(isPixelBrush2DStrategy(id)).toBe(true);
    }
    expect(isPixelBrush2DStrategy("hq2x")).toBe(true);
  });

  it("isPixelBrushScaleStrategy accepts the 12 ids and nothing else", () => {
    for (const o of PIXEL_BRUSH_SCALE_OPTIONS) {
      expect(isPixelBrushScaleStrategy(o.id)).toBe(true);
    }
    for (const bad of ["hq3x", "Nearest", "", 0, null, undefined, {}, []]) {
      expect(isPixelBrushScaleStrategy(bad)).toBe(false);
    }
  });
});

/* ── scalePixelBrushGrid — identity and kernel path ─────────────────────────── */

describe("scalePixelBrushGrid — identity", () => {
  it.each(PIXEL_BRUSH_SCALE_OPTIONS.map((o) => o.id))(
    "%s at the source size is a fresh deep copy",
    (id) => {
      const src = parse(DIAGONAL);
      const out = scalePixelBrushGrid(src, req(3, 3, 3, 3, id));
      expect(out).toEqual(src);
      expectFresh(out, src);
    },
  );

  it("returns an empty grid for an empty source", () => {
    expect(scalePixelBrushGrid([], req(0, 0, 4, 4, "epx"))).toEqual([]);
    expect(scalePixelBrushGrid([], req(0, 0, 4, 4, "bilinear"))).toEqual([]);
  });
});

describe("scalePixelBrushGrid — kernel path", () => {
  it("2×2 checker → 4×4 nearest is task 07's block pattern", () => {
    // u = (i + 0.5)/2 − 0.5 = −0.25, 0.25, 0.75, 1.25 → floor(u + 0.5) = 0, 0, 1, 1.
    const A: BrushDelta = [10, 20, 30, 40];
    const B: BrushDelta = [-10, -20, -30, -40];
    const src: BrushCell[][] = [
      [A, B],
      [B, A],
    ];
    const out = scalePixelBrushGrid(src, req(2, 2, 4, 4, "nearest"));
    expect(out).toEqual([
      [A, A, B, B],
      [A, A, B, B],
      [B, B, A, A],
      [B, B, A, A],
    ]);
    expectFresh(out, src);
    expect(out[0]![0]).not.toBe(out[0]![1]);
  });

  it("passes x and y kernels through to the separable resampler", () => {
    const src = parse(["XX..", "..XX"]);
    expect(
      scalePixelBrushGrid(src, req(4, 2, 6, 5, "lanczos3", "box")),
    ).toEqual(resamplePixelBrushGrid(src, 4, 2, 6, 5, "lanczos3", "box"));
    expect(
      scalePixelBrushGrid(src, req(4, 2, 2, 1, "bilinear", "mitchell")),
    ).toEqual(resamplePixelBrushGrid(src, 4, 2, 2, 1, "bilinear", "mitchell"));
  });

  it("floors fractional sizes and clamps to at least one cell", () => {
    const src = parse(DIAGONAL);
    expect(scalePixelBrushGrid(src, req(3, 3, 5.9, 0, "nearest"))).toEqual(
      nearest(src, 3, 3, 5, 1),
    );
  });
});

/* ── scalePixelBrushGrid — 2-D path (D10) ───────────────────────────────────── */

describe("scalePixelBrushGrid — 2-D path", () => {
  const src = parse(DIAGONAL);

  it("EPX 3×3 → 5×5: need 5/3 ≤ 2 → one pass to 6×6, then nearest down", () => {
    // Nearest 6→5: u = (i + 0.5)·1.2 − 0.5 = 0.1, 1.3, 2.5, 3.7, 4.9
    //   → floor(u + 0.5) = 0, 1, 3, 4, 5, applied to rows and columns of
    //   task 08's 6×6 answer.
    const out = scalePixelBrushGrid(src, req(3, 3, 5, 5, "epx"));
    expect(out).toEqual(
      parse([
        "XX...", //
        "X....",
        "..XX.",
        "..X.X",
        "...XX",
      ]),
    );
    expect(out).toEqual(nearest(parse(DIAGONAL_EPX_6), 6, 6, 5, 5));
  });

  it("EPX 3×3 → 6×6 is exactly one pass (task 08's answer)", () => {
    const out = scalePixelBrushGrid(src, req(3, 3, 6, 6, "epx"));
    expect(out).toEqual(parse(DIAGONAL_EPX_6));
    expectFresh(out, src);
  });

  it("EPX 3×3 → 12×12: need 4 > 2 → two passes, no nearest change", () => {
    const twoPasses = epx(epx(src, 3, 3), 6, 6);
    const out = scalePixelBrushGrid(src, req(3, 3, 12, 12, "epx"));
    expect(out).toHaveLength(12);
    expect(out[0]).toHaveLength(12);
    expect(out).toEqual(twoPasses);
  });

  it("EPX 3×3 → 7×7: need 7/3 > 2 → two passes to 12×12, then nearest down", () => {
    const twoPasses = epx(epx(src, 3, 3), 6, 6);
    expect(scalePixelBrushGrid(src, req(3, 3, 7, 7, "epx"))).toEqual(
      nearest(twoPasses, 12, 12, 7, 7),
    );
  });

  it("EPX never runs more than two passes: 3×3 → 100×100 is nearest of 12×12", () => {
    const twoPasses = epx(epx(src, 3, 3), 6, 6);
    const out = scalePixelBrushGrid(src, req(3, 3, 100, 100, "epx"));
    expect(out).toHaveLength(100);
    expect(out[0]).toHaveLength(100);
    expect(out).toEqual(nearest(twoPasses, 12, 12, 100, 100));
  });

  it("EPX 3×3 → 2×2: need ≤ 1 → nearest only", () => {
    // Nearest 3→2: u = (i + 0.5)·1.5 − 0.5 = 0.25, 1.75 → floor = 0, 2.
    expect(scalePixelBrushGrid(src, req(3, 3, 2, 2, "epx"))).toEqual(
      parse(["X.", ".X"]),
    );
    expect(scalePixelBrushGrid(src, req(3, 3, 3, 1, "xbr"))).toEqual(
      nearest(src, 3, 3, 3, 1),
    );
  });

  it("EPX 3×3 → 6×3: need = max(2, 1) = 2 → one pass, then nearest rows", () => {
    // Rows 6→3: u = (j + 0.5)·2 − 0.5 = 0.5, 2.5, 4.5 → floor(u + 0.5) = 1, 3, 5.
    expect(scalePixelBrushGrid(src, req(3, 3, 6, 3, "epx"))).toEqual(
      parse(["X.X...", "..XXX.", "....XX"]),
    );
  });

  it("Scale3x 3×3 → 9×9 is one pass; → 10×10 needs two (need 10/3 > 3)", () => {
    const s3 = PIXEL_BRUSH_SCALERS.scale3x;
    const onePass = s3.scale(src, 3, 3);
    expect(scalePixelBrushGrid(src, req(3, 3, 9, 9, "scale3x"))).toEqual(
      onePass,
    );
    const twoPasses = s3.scale(onePass, 9, 9);
    expect(scalePixelBrushGrid(src, req(3, 3, 10, 10, "scale3x"))).toEqual(
      nearest(twoPasses, 27, 27, 10, 10),
    );
  });

  it.each(PIXEL_BRUSH_2D_STRATEGY_IDS)(
    "%s 3×3 → 4×4 is its own single pass then nearest 6/9 → 4",
    (id) => {
      const scaler = id === "hq2x" ? PIXEL_BRUSH_HQ2X : PIXEL_BRUSH_SCALERS[id];
      const f = scaler.factor;
      expect(scalePixelBrushGrid(src, req(3, 3, 4, 4, id))).toEqual(
        nearest(scaler.scale(src, 3, 3), 3 * f, 3 * f, 4, 4),
      );
    },
  );

  it("hq2x 3×3 → 6×6 is exactly one pass; → 12×12 is two", () => {
    const one = PIXEL_BRUSH_HQ2X.scale(src, 3, 3);
    expect(scalePixelBrushGrid(src, req(3, 3, 6, 6, "hq2x"))).toEqual(one);
    expect(scalePixelBrushGrid(src, req(3, 3, 12, 12, "hq2x"))).toEqual(
      PIXEL_BRUSH_HQ2X.scale(one, 6, 6),
    );
  });

  it("a 2-D id on either axis selects the 2-D path", () => {
    const both = scalePixelBrushGrid(src, req(3, 3, 5, 5, "epx"));
    expect(
      scalePixelBrushGrid(src, req(3, 3, 5, 5, "epx", "bilinear")),
    ).toEqual(both);
    expect(
      scalePixelBrushGrid(src, req(3, 3, 5, 5, "bilinear", "epx")),
    ).toEqual(both);
    // …and it is not what bilinear would have produced.
    expect(both).not.toEqual(
      resamplePixelBrushGrid(src, 3, 3, 5, 5, "bilinear", "bilinear"),
    );
  });

  it("x's 2-D id wins when both axes hold different 2-D ids", () => {
    const g = parse(["XX.", "X..", "..."]);
    expect(scalePixelBrushGrid(g, req(3, 3, 6, 6, "eagle", "scale3x"))).toEqual(
      PIXEL_BRUSH_SCALERS.eagle.scale(g, 3, 3),
    );
  });
});

/* ── scalePixelBrushLayers ─────────────────────────────────────────────────── */

interface Layer {
  id: string;
  name: string;
  visible: boolean;
  pixels: ReadonlyArray<ReadonlyArray<BrushCell>>;
}

function layers(): Layer[] {
  return [
    { id: "a", name: "Top", visible: true, pixels: parse(DIAGONAL) },
    {
      id: "b",
      name: "Bottom",
      visible: false,
      pixels: parse(["...", ".X.", "..."]),
    },
  ];
}

describe("scalePixelBrushLayers", () => {
  it("returns the very same array for an identity request", () => {
    const ls = layers();
    expect(scalePixelBrushLayers(ls, req(3, 3, 3, 3, "nearest"))).toBe(ls);
    expect(scalePixelBrushLayers(ls, req(3, 3, 3, 3, "epx"))).toBe(ls);
    expect(scalePixelBrushLayers(ls, req(3, 3, 3.7, 3.2, "lanczos3"))).toBe(ls);
    expect(scalePixelBrushLayers([], req(3, 3, 3, 3, "nearest"))).toEqual([]);
  });

  it("maps each layer to a spread copy with scaled pixels", () => {
    const ls = layers();
    const r = req(3, 3, 6, 6, "epx");
    const out = scalePixelBrushLayers(ls, r);
    expect(out).not.toBe(ls);
    expect(out).toHaveLength(2);
    out.forEach((layer, i) => {
      const src = ls[i]!;
      expect(layer).not.toBe(src);
      expect(layer).toEqual({
        ...src,
        pixels: scalePixelBrushGrid(src.pixels, r),
      });
    });
    expect(out[0]!.pixels).toEqual(parse(DIAGONAL_EPX_6));
  });

  it("leaves the input layers and their grids untouched", () => {
    const ls = layers();
    const before = ls.map((l) => l.pixels);
    scalePixelBrushLayers(ls, req(3, 3, 2, 2, "bilinear"));
    ls.forEach((l, i) => {
      expect(l.pixels).toBe(before[i]);
    });
    expect(ls[0]!.pixels).toEqual(parse(DIAGONAL));
  });
});
