/**
 * Golden-hash tests for the lighting studio's editable surface.
 *
 * Render mode covered: **normal / height edit visualisation, scaled onto the
 * checkerboard** (both `lightGridMode` states — the W19 bug-3 fix).
 *
 * Everything `renderNormalEdit` draws is `putImageData` work, so it hashes
 * exactly. The GRID is stroked and lives at the call site (see the module's
 * header); `canvasBackground.test.ts` already covers it.
 *
 * Every hash below was recorded from a real run (MASTER.md §10 rule 10).
 */
import { describe, expect, it } from "vitest";
import { renderNormalEdit } from "@/ui/canvas/render/renderNormalEdit";
import type { PixelBuffer } from "@/ui/canvas/render/renderNormalEdit";
import { backgroundTheme } from "@/ui/canvas/render/canvasBackground";
import { createBuffer, getPixel, hashBuffer } from "@/test/canvasStub";

/**
 * A 4×4 source in the shape `renderNormalAsRGB` produces: opaque RGB where a
 * cell has a normal, fully transparent where it does not.
 *
 * The values are the flat-normal encoding `{x:0,y:0,z:255}` → `(128,128,255)`
 * on the diagonal, and a tilted normal `{x:-64,y:64,z:180}` → `(64,192,180)`
 * in one corner, so a wrong channel order is visible rather than only "a
 * different hash".
 */
function source4(): PixelBuffer {
  const buf = createBuffer(4, 4);
  const put = (
    x: number,
    y: number,
    r: number,
    g: number,
    b: number,
    a = 255,
  ) => {
    const i = (y * 4 + x) * 4;
    buf.data[i] = r;
    buf.data[i + 1] = g;
    buf.data[i + 2] = b;
    buf.data[i + 3] = a;
  };
  put(0, 0, 128, 128, 255);
  put(1, 1, 128, 128, 255);
  put(2, 2, 128, 128, 255);
  put(3, 3, 128, 128, 255);
  put(0, 3, 64, 192, 180);
  return buf;
}

/** A source with a HALF-transparent cell — the one that proves compositing. */
function sourceHalf(): PixelBuffer {
  const buf = createBuffer(4, 4);
  const i = (1 * 4 + 1) * 4;
  buf.data[i] = 255;
  buf.data[i + 1] = 255;
  buf.data[i + 2] = 255;
  buf.data[i + 3] = 128;
  return buf;
}

const render = (source: PixelBuffer, light: boolean, zoom = 4) => {
  const buf = createBuffer(4 * zoom, 4 * zoom);
  renderNormalEdit(buf, {
    source,
    gridWidth: 4,
    gridHeight: 4,
    zoom,
    theme: backgroundTheme(light),
  });
  return buf;
};

describe("renderNormalEdit — golden hashes", () => {
  it("GOLDEN: dark theme, 4×4 at zoom 4", () => {
    expect(hashBuffer(render(source4(), false))).toBe("16x16:006e10a5");
  });

  it("GOLDEN: light theme, 4×4 at zoom 4", () => {
    expect(hashBuffer(render(source4(), true))).toBe("16x16:f6bca445");
  });

  it("GOLDEN: zoom 1 — the degenerate scale", () => {
    expect(hashBuffer(render(source4(), false, 1))).toBe("4x4:d8fc10c5");
  });

  it("GOLDEN: a half-transparent source cell composites, not overwrites", () => {
    expect(hashBuffer(render(sourceHalf(), false))).toBe("16x16:7ec31385");
  });
});

describe("renderNormalEdit — the properties behind the hashes", () => {
  it("⚠️ THE W19 BUG-3 FIX: the two themes produce DIFFERENT pixels", () => {
    // Before this task the lighting canvas passed `false` unconditionally, so
    // these two were byte-identical. That they now differ IS the fix.
    expect(hashBuffer(render(source4(), false))).not.toBe(
      hashBuffer(render(source4(), true)),
    );
  });

  it("shows the checkerboard where the source is transparent", () => {
    const dark = render(source4(), false);
    // Cell (1,0) is empty in the fixture; parity (1+0)%2===1 → `color2`.
    expect(getPixel(dark, 1 * 4, 0)).toEqual([34, 34, 48, 255]);

    const light = render(source4(), true);
    expect(getPixel(light, 1 * 4, 0)).toEqual([238, 238, 238, 255]);
  });

  it("upscales nearest-neighbour: a source cell fills its whole zoom² block", () => {
    const buf = render(source4(), false);
    // Cell (0,0) is the flat normal. Every pixel of its 4×4 block matches.
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        expect(getPixel(buf, x, y)).toEqual([128, 128, 255, 255]);
      }
    }
    // And the cell next door does NOT.
    expect(getPixel(buf, 4, 0)).not.toEqual([128, 128, 255, 255]);
  });

  it("writes every pixel opaque — nothing shows through the edit surface", () => {
    const buf = render(source4(), false);
    for (let i = 3; i < buf.data.length; i += 4) {
      expect(buf.data[i]).toBe(255);
    }
  });

  it("composites a half-alpha source over the checkerboard", () => {
    const buf = render(sourceHalf(), false);
    // Cell (1,1): parity even → `color1` = (42,42,58); source white at a=128.
    // 255 * (128/255) + 42 * (1 - 128/255) = 128 + 20.9 → 149.
    const [r, , , a] = getPixel(buf, 4, 4);
    expect(a).toBe(255);
    expect(r).toBe(149);
    // Not the raw source colour — that would be an overwrite, not a blend.
    expect(r).not.toBe(255);
  });

  it("returns the same buffer it was given", () => {
    const buf = createBuffer(16, 16);
    const out = renderNormalEdit(buf, {
      source: source4(),
      gridWidth: 4,
      gridHeight: 4,
      zoom: 4,
      theme: backgroundTheme(false),
    });
    expect(out).toBe(buf);
  });

  it("is safe when the source is smaller than the declared grid", () => {
    const buf = createBuffer(16, 16);
    expect(() =>
      renderNormalEdit(buf, {
        source: createBuffer(2, 2),
        gridWidth: 4,
        gridHeight: 4,
        zoom: 4,
        theme: backgroundTheme(false),
      }),
    ).not.toThrow();
    // The uncovered region is still checkerboard, not garbage.
    expect(getPixel(buf, 12, 12)).toEqual([42, 42, 58, 255]);
  });
});
