/**
 * Tests for the silhouette outline post-pass (MASTER E3/E4/E5/E6).
 *
 * Pure array maths, so all of it runs in the **node** lane — there is no
 * WebGL in jsdom and this module deliberately touches neither GL nor canvas.
 *
 * The highest-value cases here are the ones whose failure mode is *plausible
 * output* rather than a crash:
 *
 *  - **model pixels are never overwritten**. An outline that eats the model's
 *    own edge pixels still looks like an outline in a screenshot; it just
 *    quietly shaves a pixel off every silhouette that gets stamped. MASTER
 *    §8 lists it as one of the easiest mistakes to make here.
 *  - **the silhouette is read from the ORIGINAL alpha**. Because the buffer is
 *    mutated in place, a naive implementation would see its own freshly
 *    written outline pixels as model and grow without bound. Pinned by the
 *    "twice at width 1 is not width 2" case.
 *  - **the alpha threshold is 128**, the same cutoff the stamp uses (E6/D8).
 *    A mismatch puts the outline half a pixel out of step with what actually
 *    gets committed, and only on anti-aliased diagonals.
 *  - **the borders clip rather than wrap**. A wrapped read looks like a stray
 *    pixel on the far side of the canvas, which reads as a rendering glitch
 *    rather than as a bug in here.
 */
import { describe, expect, it } from "vitest";
import {
  applyOutline,
  buildSilhouette,
  DEFAULT_OUTLINE_ALPHA_THRESHOLD,
  MAX_OUTLINE_WIDTH,
} from "@/ui/canvas/pose/poseOutline";
import { DEFAULT_ALPHA_THRESHOLD } from "@/ui/canvas/pose/poseStamp";
import type { PoseColor } from "@/ui/canvas/pose/poseTypes";

/** The outline colour used throughout; deliberately not a grey. */
const EDGE: PoseColor = { r: 255, g: 0, b: 128, a: 255 };
/** The model colour used throughout. */
const MODEL: PoseColor = { r: 10, g: 200, b: 40, a: 255 };

/** A `width * height` RGBA buffer, fully transparent. */
function blank(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height * 4);
}

/** Write one pixel's RGBA. */
function put(
  buf: Uint8Array,
  width: number,
  x: number,
  y: number,
  color: PoseColor,
): void {
  const c = (y * width + x) * 4;
  buf[c] = color.r;
  buf[c + 1] = color.g;
  buf[c + 2] = color.b;
  buf[c + 3] = color.a;
}

/** Read one pixel back as a tuple. */
function at(
  buf: Uint8Array,
  width: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const c = (y * width + x) * 4;
  return [buf[c], buf[c + 1], buf[c + 2], buf[c + 3]];
}

/** A buffer with a single opaque model pixel at `(x, y)`. */
function dot(width: number, height: number, x: number, y: number): Uint8Array {
  const buf = blank(width, height);
  put(buf, width, x, y, MODEL);
  return buf;
}

/**
 * A one-character-per-pixel map of the result:
 * `M` model, `O` outline, `.` transparent, `?` anything else.
 */
function render(buf: Uint8Array, width: number, height: number): string[] {
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    let row = "";
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = at(buf, width, x, y);
      if (a === 0) row += ".";
      else if (r === MODEL.r && g === MODEL.g && b === MODEL.b) row += "M";
      else if (r === EDGE.r && g === EDGE.g && b === EDGE.b && a === 255)
        row += "O";
      else row += "?";
    }
    rows.push(row);
  }
  return rows;
}

/** Count the pixels painted in the outline colour. */
function countOutline(buf: Uint8Array, width: number, height: number): number {
  return render(buf, width, height)
    .join("")
    .split("")
    .filter((c) => c === "O").length;
}

/* ── the kernel: Chebyshev rings around a single pixel ────────────────────── */

describe("applyOutline — the Chebyshev kernel (MASTER E5)", () => {
  it("rings a lone pixel with an exact 3x3 square at width 1", () => {
    const buf = dot(7, 7, 3, 3);
    applyOutline(buf, 7, 7, 1, EDGE);

    expect(render(buf, 7, 7)).toEqual([
      ".......",
      ".......",
      "..OOO..",
      "..OMO..",
      "..OOO..",
      ".......",
      ".......",
    ]);
  });

  it("rings a lone pixel with a filled 5x5 square at width 2", () => {
    const buf = dot(7, 7, 3, 3);
    applyOutline(buf, 7, 7, 2, EDGE);

    expect(render(buf, 7, 7)).toEqual([
      ".......",
      ".OOOOO.",
      ".OOOOO.",
      ".OOMOO.",
      ".OOOOO.",
      ".OOOOO.",
      ".......",
    ]);
  });

  it("rings a lone pixel with a filled 7x7 square at width 3", () => {
    const buf = dot(9, 9, 4, 4);
    applyOutline(buf, 9, 9, 3, EDGE);

    expect(render(buf, 9, 9)).toEqual([
      ".........",
      ".OOOOOOO.",
      ".OOOOOOO.",
      ".OOOOOOO.",
      ".OOOMOOO.",
      ".OOOOOOO.",
      ".OOOOOOO.",
      ".OOOOOOO.",
      ".........",
    ]);
  });

  it("rings a lone pixel with a filled 9x9 square at width 4", () => {
    const buf = dot(11, 11, 5, 5);
    applyOutline(buf, 11, 11, 4, EDGE);

    // (2*4+1)^2 = 81 cells in the square, minus the model pixel itself.
    expect(countOutline(buf, 11, 11)).toBe(81 - 1);
    const out = render(buf, 11, 11);
    expect(out[0]).toBe("...........");
    expect(out[1]).toBe(".OOOOOOOOO.");
    expect(out[5]).toBe(".OOOOMOOOO.");
    expect(out[10]).toBe("...........");
  });

  it("is SQUARE, not round: the diagonal corner at width 2 is filled", () => {
    // The Euclidean distance to (dx=2, dy=2) is 2.83 — a round kernel of
    // radius 2 would leave that corner transparent. Chebyshev fills it.
    const buf = dot(7, 7, 3, 3);
    applyOutline(buf, 7, 7, 2, EDGE);

    expect(at(buf, 7, 1, 1)).toEqual([EDGE.r, EDGE.g, EDGE.b, 255]);
    expect(at(buf, 7, 5, 5)).toEqual([EDGE.r, EDGE.g, EDGE.b, 255]);
    expect(at(buf, 7, 1, 5)).toEqual([EDGE.r, EDGE.g, EDGE.b, 255]);
    expect(at(buf, 7, 5, 1)).toEqual([EDGE.r, EDGE.g, EDGE.b, 255]);
  });

  it("paints exactly (2N+1)^2 - 1 pixels around a lone pixel with room to spare", () => {
    for (const n of [1, 2, 3, 4]) {
      const size = 2 * n + 3;
      const centre = Math.floor(size / 2);
      const buf = dot(size, size, centre, centre);
      applyOutline(buf, size, size, n, EDGE);
      expect(countOutline(buf, size, size)).toBe((2 * n + 1) ** 2 - 1);
    }
  });
});

/* ── shapes ───────────────────────────────────────────────────────────────── */

describe("applyOutline — shapes", () => {
  it("outlines a 2x2 block", () => {
    const buf = blank(6, 6);
    put(buf, 6, 2, 2, MODEL);
    put(buf, 6, 3, 2, MODEL);
    put(buf, 6, 2, 3, MODEL);
    put(buf, 6, 3, 3, MODEL);
    applyOutline(buf, 6, 6, 1, EDGE);

    expect(render(buf, 6, 6)).toEqual([
      "......",
      ".OOOO.",
      ".OMMO.",
      ".OMMO.",
      ".OOOO.",
      "......",
    ]);
  });

  it("outlines a diagonal line without breaking it up", () => {
    const buf = blank(7, 7);
    for (let i = 1; i <= 5; i++) put(buf, 7, i, i, MODEL);
    applyOutline(buf, 7, 7, 1, EDGE);

    expect(render(buf, 7, 7)).toEqual([
      "OOO....",
      "OMOO...",
      "OOMOO..",
      ".OOMOO.",
      "..OOMOO",
      "...OOMO",
      "....OOO",
    ]);
  });

  it("outlines a shape with a one-pixel-wide neck without severing it", () => {
    // Two 3-wide blobs joined by a single pixel column.
    const w = 9;
    const h = 7;
    const buf = blank(w, h);
    for (let x = 1; x <= 3; x++) for (let y = 2; y <= 4; y++) put(buf, w, x, y, MODEL);
    for (let x = 5; x <= 7; x++) for (let y = 2; y <= 4; y++) put(buf, w, x, y, MODEL);
    put(buf, w, 4, 3, MODEL); // the neck

    applyOutline(buf, w, h, 1, EDGE);
    const out = render(buf, w, h);

    // The neck itself survives untouched...
    expect(out[3][4]).toBe("M");
    // ...and the transparent cells above and below it are outlined, not left
    // blank — a 1px neck still gets an outline on both sides.
    expect(out[2][4]).toBe("O");
    expect(out[4][4]).toBe("O");
    expect(out).toEqual([
      ".........",
      "OOOOOOOOO",
      "OMMMOMMMO",
      "OMMMMMMMO",
      "OMMMOMMMO",
      "OOOOOOOOO",
      ".........",
    ]);
  });

  it("outlines a hole INSIDE the shape on its inner edge (pinned behaviour)", () => {
    // A 5x5 ring with a single transparent pixel at its centre.
    const buf = blank(7, 7);
    for (let y = 1; y <= 5; y++) {
      for (let x = 1; x <= 5; x++) {
        if (x === 3 && y === 3) continue;
        put(buf, 7, x, y, MODEL);
      }
    }
    applyOutline(buf, 7, 7, 1, EDGE);

    // The rule is purely local, so the inner hole is outlined exactly like the
    // exterior. This is a DECISION (see the module header), not an accident.
    expect(at(buf, 7, 3, 3)).toEqual([EDGE.r, EDGE.g, EDGE.b, 255]);
    expect(render(buf, 7, 7)).toEqual([
      "OOOOOOO",
      "OMMMMMO",
      "OMMMMMO",
      "OMMOMMO",
      "OMMMMMO",
      "OMMMMMO",
      "OOOOOOO",
    ]);
  });

  it("outlines a hole too large to be filled only on its rim", () => {
    // A 7x7 ring with a 3x3 hole: at width 1 only the hole's rim is painted,
    // its centre stays transparent.
    const w = 9;
    const buf = blank(w, w);
    for (let y = 1; y <= 7; y++) {
      for (let x = 1; x <= 7; x++) {
        if (x >= 3 && x <= 5 && y >= 3 && y <= 5) continue;
        put(buf, w, x, y, MODEL);
      }
    }
    applyOutline(buf, w, w, 1, EDGE);

    expect(render(buf, w, w)[4][4]).toBe(".");
    expect(render(buf, w, w)[3][3]).toBe("O");
  });
});

/* ── borders and corners: clip, never wrap ────────────────────────────────── */

describe("applyOutline — borders and corners", () => {
  it("clips at each of the four borders without wrapping", () => {
    const w = 5;
    const h = 5;

    // TOP border, middle column.
    {
      const buf = dot(w, h, 2, 0);
      applyOutline(buf, w, h, 1, EDGE);
      expect(render(buf, w, h)).toEqual([
        ".OMO.",
        ".OOO.",
        ".....",
        ".....",
        ".....",
      ]);
    }
    // BOTTOM border.
    {
      const buf = dot(w, h, 2, 4);
      applyOutline(buf, w, h, 1, EDGE);
      expect(render(buf, w, h)).toEqual([
        ".....",
        ".....",
        ".....",
        ".OOO.",
        ".OMO.",
      ]);
    }
    // LEFT border — the wrap-sensitive one: a wrapped read would light up
    // column 4 of the previous row.
    {
      const buf = dot(w, h, 0, 2);
      applyOutline(buf, w, h, 1, EDGE);
      expect(render(buf, w, h)).toEqual([
        ".....",
        "OO...",
        "MO...",
        "OO...",
        ".....",
      ]);
    }
    // RIGHT border.
    {
      const buf = dot(w, h, 4, 2);
      applyOutline(buf, w, h, 1, EDGE);
      expect(render(buf, w, h)).toEqual([
        ".....",
        "...OO",
        "...OM",
        "...OO",
        ".....",
      ]);
    }
  });

  it("clips at each of the four corners", () => {
    const w = 4;
    const h = 4;
    const corners: Array<[number, number, string[]]> = [
      [0, 0, ["MO..", "OO..", "....", "...."]],
      [3, 0, ["..OM", "..OO", "....", "...."]],
      [0, 3, ["....", "....", "OO..", "MO.."]],
      [3, 3, ["....", "....", "..OO", "..OM"]],
    ];
    for (const [x, y, expected] of corners) {
      const buf = dot(w, h, x, y);
      applyOutline(buf, w, h, 1, EDGE);
      expect(render(buf, w, h)).toEqual(expected);
    }
  });

  it("never writes past the declared pixel count", () => {
    // A buffer with 8 spare bytes past width*height*4; a wrapped or
    // out-of-bounds write would land in the tail.
    const w = 4;
    const h = 4;
    const buf = new Uint8Array(w * h * 4 + 8);
    put(buf, w, 0, 0, MODEL);
    applyOutline(buf, w, h, 4, EDGE);

    expect(Array.from(buf.subarray(w * h * 4))).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("fills a 1x1 canvas' single model pixel case without reading out of bounds", () => {
    const buf = dot(1, 1, 0, 0);
    const before = Array.from(buf);
    // Fully opaque (the one pixel is the model) → nothing to outline.
    applyOutline(buf, 1, 1, 4, EDGE);
    expect(Array.from(buf)).toEqual(before);
  });
});

/* ── the model is sacred ──────────────────────────────────────────────────── */

describe("applyOutline — opaque model pixels are never overwritten", () => {
  it("leaves every model pixel byte-identical at every width", () => {
    for (const n of [1, 2, 3, 4, 8]) {
      const w = 9;
      const h = 9;
      const buf = blank(w, h);
      const modelPixels: Array<[number, number]> = [];
      for (let y = 3; y <= 5; y++) {
        for (let x = 3; x <= 5; x++) {
          put(buf, w, x, y, MODEL);
          modelPixels.push([x, y]);
        }
      }
      applyOutline(buf, w, h, n, EDGE);

      for (const [x, y] of modelPixels) {
        expect(at(buf, w, x, y)).toEqual([MODEL.r, MODEL.g, MODEL.b, MODEL.a]);
      }
    }
  });

  it("does not overwrite a model pixel whose colour equals the outline colour", () => {
    // The renderer could legitimately produce a model pixel in the Edge colour;
    // it must still be treated as model, not as fair game.
    const buf = dot(5, 5, 2, 2);
    put(buf, 5, 2, 2, { ...EDGE, a: 255 });
    applyOutline(buf, 5, 5, 1, EDGE);
    // 3x3 ring minus the centre; the centre is model, so 8 painted, and the
    // centre keeps alpha 255 either way — the meaningful assertion is that no
    // 4th pixel of the ring's row got eaten.
    expect(countOutline(buf, 5, 5)).toBe(9);
  });

  it("preserves a semi-opaque MODEL pixel's own bytes (alpha >= 128 is model)", () => {
    const buf = blank(5, 5);
    put(buf, 5, 2, 2, { r: 1, g: 2, b: 3, a: 128 });
    applyOutline(buf, 5, 5, 1, EDGE);
    expect(at(buf, 5, 2, 2)).toEqual([1, 2, 3, 128]);
  });
});

/* ── the alpha threshold, coupled to the stamp ────────────────────────────── */

describe("applyOutline — the alpha threshold (MASTER E6)", () => {
  it("defaults to 128, the same cutoff poseStamp uses (D8)", () => {
    expect(DEFAULT_OUTLINE_ALPHA_THRESHOLD).toBe(128);
    // ⚠️ The coupling itself. The constants are duplicated so neither module
    // depends on the other; this assertion is what stops them drifting apart
    // and putting the outline out of step with what the stamp commits.
    expect(DEFAULT_OUTLINE_ALPHA_THRESHOLD).toBe(DEFAULT_ALPHA_THRESHOLD);
  });

  it("treats alpha 128 as model and alpha 127 as empty", () => {
    const a128 = blank(5, 5);
    put(a128, 5, 2, 2, { r: 9, g: 9, b: 9, a: 128 });
    applyOutline(a128, 5, 5, 1, EDGE);
    expect(countOutline(a128, 5, 5)).toBe(8);

    const a127 = blank(5, 5);
    put(a127, 5, 2, 2, { r: 9, g: 9, b: 9, a: 127 });
    const before = Array.from(a127);
    applyOutline(a127, 5, 5, 1, EDGE);
    // Nothing is opaque, so there is nothing to outline at all.
    expect(Array.from(a127)).toEqual(before);
  });

  it("honours an explicit alphaThreshold override", () => {
    const buf = blank(5, 5);
    put(buf, 5, 2, 2, { r: 9, g: 9, b: 9, a: 60 });
    applyOutline(buf, 5, 5, 1, EDGE, { alphaThreshold: 50 });
    expect(countOutline(buf, 5, 5)).toBe(8);
  });

  it("falls back to the default for a non-finite alphaThreshold", () => {
    const buf = dot(5, 5, 2, 2);
    applyOutline(buf, 5, 5, 1, EDGE, { alphaThreshold: Number.NaN });
    expect(countOutline(buf, 5, 5)).toBe(8);
  });

  it("buildSilhouette marks exactly the pixels at or above the cutoff", () => {
    const buf = blank(4, 1);
    put(buf, 4, 0, 0, { r: 0, g: 0, b: 0, a: 0 });
    put(buf, 4, 1, 0, { r: 0, g: 0, b: 0, a: 127 });
    put(buf, 4, 2, 0, { r: 0, g: 0, b: 0, a: 128 });
    put(buf, 4, 3, 0, { r: 0, g: 0, b: 0, a: 255 });
    expect(Array.from(buildSilhouette(buf, 4))).toEqual([0, 0, 1, 1]);
  });
});

/* ── degenerate input: total, never throws ────────────────────────────────── */

describe("applyOutline — degenerate input is a no-op, never a throw", () => {
  const cases: Array<[string, () => void]> = [
    ["outlineWidth 0", () => run(0)],
    ["outlineWidth -3", () => run(-3)],
    ["outlineWidth NaN", () => run(Number.NaN)],
    ["outlineWidth Infinity", () => run(Number.POSITIVE_INFINITY)],
    ["outlineWidth -Infinity", () => run(Number.NEGATIVE_INFINITY)],
    ["outlineWidth 0.5 (floors to 0)", () => run(0.5)],
  ];

  function run(outlineWidth: number): void {
    const buf = dot(5, 5, 2, 2);
    const before = Array.from(buf);
    const result = applyOutline(buf, 5, 5, outlineWidth, EDGE);
    expect(Array.from(result)).toEqual(before);
  }

  for (const [name, fn] of cases) {
    it(`leaves the buffer byte-identical for ${name}`, () => {
      expect(fn).not.toThrow();
    });
  }

  it("is a no-op for non-finite or non-positive dimensions", () => {
    for (const [w, h] of [
      [Number.NaN, 5],
      [5, Number.NaN],
      [Number.POSITIVE_INFINITY, 5],
      [0, 5],
      [5, 0],
      [-4, 5],
      [5, -4],
    ] as Array<[number, number]>) {
      const buf = dot(5, 5, 2, 2);
      const before = Array.from(buf);
      expect(() => applyOutline(buf, w, h, 1, EDGE)).not.toThrow();
      expect(Array.from(buf)).toEqual(before);
    }
  });

  it("is a no-op for a buffer shorter than width*height*4", () => {
    const buf = new Uint8Array(5 * 5 * 4 - 1);
    buf[buf.length - 1] = 200;
    const before = Array.from(buf);
    applyOutline(buf, 5, 5, 1, EDGE);
    expect(Array.from(buf)).toEqual(before);
  });

  it("tolerates a buffer LONGER than width*height*4", () => {
    const buf = new Uint8Array(5 * 5 * 4 + 16).fill(0);
    put(buf, 5, 2, 2, MODEL);
    applyOutline(buf, 5, 5, 1, EDGE);
    expect(countOutline(buf.subarray(0, 100) as Uint8Array, 5, 5)).toBe(8);
  });

  it("leaves a fully transparent buffer fully transparent", () => {
    const buf = blank(6, 6);
    const before = Array.from(buf);
    applyOutline(buf, 6, 6, 3, EDGE);
    expect(Array.from(buf)).toEqual(before);
  });

  it("leaves a fully opaque buffer unchanged — there is nothing to outline", () => {
    const w = 6;
    const buf = blank(w, w);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) put(buf, w, x, y, MODEL);
    const before = Array.from(buf);
    applyOutline(buf, w, w, 2, EDGE);
    expect(Array.from(buf)).toEqual(before);
  });

  it("clamps an absurd outlineWidth instead of looping for ever", () => {
    const buf = dot(5, 5, 2, 2);
    const started = Date.now();
    applyOutline(buf, 5, 5, 1e9, EDGE);
    // Every transparent pixel is within 1e9 of the model, so all 24 are painted.
    expect(countOutline(buf, 5, 5)).toBe(24);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(MAX_OUTLINE_WIDTH).toBeGreaterThanOrEqual(4);
  });
});

/* ── the written colour ───────────────────────────────────────────────────── */

describe("applyOutline — the outline colour", () => {
  it("writes the colour exactly, at full alpha", () => {
    const buf = dot(3, 3, 1, 1);
    applyOutline(buf, 3, 3, 1, { r: 12, g: 34, b: 56, a: 255 });
    expect(at(buf, 3, 0, 0)).toEqual([12, 34, 56, 255]);
    expect(at(buf, 3, 2, 2)).toEqual([12, 34, 56, 255]);
  });

  it("forces alpha 255 even when the colour is semi-transparent", () => {
    const buf = dot(3, 3, 1, 1);
    applyOutline(buf, 3, 3, 1, { r: 12, g: 34, b: 56, a: 3 });
    expect(at(buf, 3, 0, 0)).toEqual([12, 34, 56, 255]);
  });

  it("clamps out-of-range components rather than wrapping a Uint8Array", () => {
    const buf = dot(3, 3, 1, 1);
    applyOutline(buf, 3, 3, 1, { r: 300, g: -5, b: Number.NaN, a: 255 });
    expect(at(buf, 3, 0, 0)).toEqual([255, 0, 0, 255]);
  });

  it("produces the same result for a Uint8ClampedArray", () => {
    const plain = dot(5, 5, 2, 2);
    const clamped = new Uint8ClampedArray(plain);
    applyOutline(plain, 5, 5, 1, EDGE);
    applyOutline(clamped, 5, 5, 1, EDGE);
    expect(Array.from(clamped)).toEqual(Array.from(plain));
  });
});

/* ── mutation contract and self-growth ────────────────────────────────────── */

describe("applyOutline — the mutation contract", () => {
  it("MUTATES IN PLACE and returns the very same buffer reference", () => {
    const buf = dot(5, 5, 2, 2);
    const result = applyOutline(buf, 5, 5, 1, EDGE);
    expect(result).toBe(buf);
    expect(countOutline(buf, 5, 5)).toBe(8);
  });

  it("returns the same reference even on the degenerate no-op paths", () => {
    const buf = dot(5, 5, 2, 2);
    expect(applyOutline(buf, 5, 5, 0, EDGE)).toBe(buf);
    expect(applyOutline(buf, Number.NaN, 5, 1, EDGE)).toBe(buf);
  });

  it("WITHIN ONE CALL, reads the silhouette from the ORIGINAL alpha — the ring is exactly N thick", () => {
    // The self-growth bug this guards is scan-order dependent: a pass that read
    // back its own writes would carry the freshly painted row into the next
    // row's test and creep downward/rightward, producing a lopsided blob rather
    // than a symmetric ring. A single call must give exactly (2N+1)^2 - 1.
    for (const n of [1, 2, 3, 4]) {
      const size = 4 * n + 5; // generous margin: growth would have room to show
      const centre = Math.floor(size / 2);
      const buf = dot(size, size, centre, centre);
      applyOutline(buf, size, size, n, EDGE);

      expect(countOutline(buf, size, size)).toBe((2 * n + 1) ** 2 - 1);

      // Symmetric in both axes — a creeping pass would break this first.
      const out = render(buf, size, size);
      for (let y = 0; y < size; y++) {
        expect(out[y]).toBe(out[size - 1 - y]);
        expect(out[y]).toBe(out[y].split("").reverse().join(""));
      }
    }
  });

  it("is NOT idempotent ACROSS calls: a second pass rings the pixels the first one painted", () => {
    // ⚠️ MEASURED, and a deliberate part of the contract (see the module
    // header). The outline it painted is opaque, so the next call's alpha test
    // legitimately counts it as model. `applyOutline` must be applied at most
    // ONCE per rendered buffer.
    const twice = dot(9, 9, 4, 4);
    applyOutline(twice, 9, 9, 1, EDGE);
    const afterFirst = Array.from(twice);
    applyOutline(twice, 9, 9, 1, EDGE);

    expect(Array.from(twice)).not.toEqual(afterFirst);
    expect(countOutline(twice, 9, 9)).toBe(24);
  });

  it("applying width 1 twice equals applying width 2 once (pinned consequence)", () => {
    const twice = dot(9, 9, 4, 4);
    applyOutline(twice, 9, 9, 1, EDGE);
    applyOutline(twice, 9, 9, 1, EDGE);

    const once2 = dot(9, 9, 4, 4);
    applyOutline(once2, 9, 9, 2, EDGE);

    expect(render(twice, 9, 9)).toEqual(render(once2, 9, 9));
  });

  it("a second pass at width 1 after width 4 grows the ring by exactly one pixel", () => {
    const buf = dot(15, 15, 7, 7);
    applyOutline(buf, 15, 15, 4, EDGE);
    expect(countOutline(buf, 15, 15)).toBe(9 ** 2 - 1);
    applyOutline(buf, 15, 15, 1, EDGE);
    // 9x9 becomes 11x11 — the same as a single width-5 pass.
    expect(countOutline(buf, 15, 15)).toBe(11 ** 2 - 1);
  });

  it("outlining a fresh copy each time is stable — the frame-loop usage", () => {
    // How task 06 actually uses it: a new readback buffer per frame, one pass.
    // Repeated frames must produce byte-identical output.
    const frameA = dot(9, 9, 4, 4);
    const frameB = dot(9, 9, 4, 4);
    applyOutline(frameA, 9, 9, 2, EDGE);
    applyOutline(frameB, 9, 9, 2, EDGE);
    expect(Array.from(frameA)).toEqual(Array.from(frameB));
  });
});

/* ── shape of the export, for task 06 ─────────────────────────────────────── */

describe("applyOutline — the exported contract", () => {
  it("takes (rgba, width, height, outlineWidth, color, options?)", () => {
    expect(applyOutline).toHaveLength(5); // `options` is defaulted.
    expect(typeof applyOutline).toBe("function");
  });

  it("handles a non-square buffer with the right stride", () => {
    // 6 wide, 3 tall — a stride bug shows up as a diagonal smear.
    const buf = dot(6, 3, 1, 1);
    applyOutline(buf, 6, 3, 1, EDGE);
    expect(render(buf, 6, 3)).toEqual(["OOO...", "OMO...", "OOO..."]);
  });
});
