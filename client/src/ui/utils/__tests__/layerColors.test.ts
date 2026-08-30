/**
 * `sortPaletteColors` — the Current Palette's display order.
 *
 * The contract, in one line: the 10 most recently used colours first, then
 * everything else grouped by hue and ramped darkest to lightest within a hue.
 *
 * The interesting cases are all in the seams — what "recently used" means when
 * the trail and the art disagree, and where greys go.
 */
import { describe, expect, it } from "vitest";
import {
  RECENT_COLOR_SLOTS,
  colorKey,
  sortPaletteColors,
} from "../layerColors";
import type { Color } from "../../../types";

const c = (r: number, g: number, b: number, a = 255): Color => ({ r, g, b, a });

/** Readable assertions: compare by key rather than by object identity. */
const keys = (colors: readonly Color[]) => colors.map(colorKey);

describe("sortPaletteColors — the rest, by hue then lightness", () => {
  it("groups by hue, so a red sits with reds and a blue with blues", () => {
    const darkRed = c(80, 0, 0);
    const lightRed = c(255, 180, 180);
    const darkBlue = c(0, 0, 80);
    const lightBlue = c(180, 180, 255);

    // Deliberately interleaved on input.
    const sorted = sortPaletteColors(
      [lightBlue, darkRed, darkBlue, lightRed],
      [],
    );

    // Reds (hue 0) before blues (hue 240), each ramped dark -> light.
    expect(keys(sorted)).toEqual(keys([darkRed, lightRed, darkBlue, lightBlue]));
  });

  it("ramps DARKEST to LIGHTEST within one hue", () => {
    const ramp = [c(255, 200, 200), c(40, 0, 0), c(160, 0, 0), c(220, 60, 60)];
    const sorted = sortPaletteColors(ramp, []);

    const lightness = sorted.map((x) => (Math.max(x.r, x.g, x.b) + Math.min(x.r, x.g, x.b)) / 2);
    expect(lightness).toEqual([...lightness].sort((a, b) => a - b));
  });

  it("⭐ keeps GREYS together, in their own group before the hues", () => {
    // The trap: a naive HSL conversion reports hue 0 for an achromatic
    // colour, which is indistinguishable from pure red — so the neutral ramp
    // gets scattered through the reds instead of staying a ramp.
    const black = c(0, 0, 0);
    const grey = c(128, 128, 128);
    const white = c(255, 255, 255);
    const red = c(255, 0, 0);

    const sorted = sortPaletteColors([red, white, black, grey], []);

    expect(keys(sorted)).toEqual(keys([black, grey, white, red]));
  });

  it("is a TOTAL order — two colours differing only in alpha do not tie", () => {
    const opaque = c(120, 30, 30, 255);
    const faded = c(120, 30, 30, 64);

    expect(keys(sortPaletteColors([opaque, faded], []))).toEqual(
      keys([faded, opaque]),
    );
  });

  it("does not mutate its input", () => {
    const input = [c(255, 0, 0), c(0, 0, 255), c(0, 255, 0)];
    const before = keys(input);
    sortPaletteColors(input, []);
    expect(keys(input)).toEqual(before);
  });
});

describe("sortPaletteColors — the recently-used block", () => {
  it("pins recent colours to the front, newest first", () => {
    const red = c(255, 0, 0);
    const green = c(0, 255, 0);
    const blue = c(0, 0, 255);

    // Trail is newest-first, as `SessionStore.colorHistory` maintains it.
    const sorted = sortPaletteColors([red, green, blue], [blue, green]);

    expect(keys(sorted).slice(0, 2)).toEqual(keys([blue, green]));
    // Everything not pinned still sorts by hue.
    expect(keys(sorted).slice(2)).toEqual(keys([red]));
  });

  it(`pins at most ${RECENT_COLOR_SLOTS}, leaving the overflow to the hue sort`, () => {
    // 14 distinct colours, all of them in the trail.
    const many = Array.from({ length: 14 }, (_, i) => c(10 + i * 15, 20, 30));
    const sorted = sortPaletteColors(many, many);

    expect(keys(sorted).slice(0, RECENT_COLOR_SLOTS)).toEqual(
      keys(many.slice(0, RECENT_COLOR_SLOTS)),
    );
    expect(sorted).toHaveLength(many.length);
  });

  it("⭐ IGNORES a recent colour that is not in the art", () => {
    // `colorHistory` is session-wide: it survives project switches, records
    // colours picked but never painted, and keeps colours whose last pixel was
    // since erased. Appending it blindly would put swatches in the palette
    // that match ZERO pixels — and double-tapping one would open a recolour
    // session over nothing.
    const inArt = c(255, 0, 0);
    const neverPainted = c(7, 7, 7);

    const sorted = sortPaletteColors([inArt], [neverPainted, inArt]);

    expect(keys(sorted)).toEqual(keys([inArt]));
  });

  it("survives a duplicate inside the trail itself", () => {
    const red = c(255, 0, 0);
    const blue = c(0, 0, 255);

    const sorted = sortPaletteColors([red, blue], [red, red, blue]);

    expect(keys(sorted)).toEqual(keys([red, blue]));
    expect(sorted).toHaveLength(2);
  });

  it("matches on ALL FOUR channels — same RGB at another alpha is a different colour", () => {
    const opaque = c(120, 30, 30, 255);
    const faded = c(120, 30, 30, 64);

    // Only the opaque one was used recently.
    const sorted = sortPaletteColors([faded, opaque], [opaque]);

    expect(keys(sorted)).toEqual(keys([opaque, faded]));
  });

  it("falls back to a pure hue sort when the trail is empty", () => {
    const colors = [c(0, 0, 255), c(255, 0, 0)];
    expect(keys(sortPaletteColors(colors, []))).toEqual(
      keys([c(255, 0, 0), c(0, 0, 255)]),
    );
  });

  it("returns every colour exactly once, pinned or not", () => {
    const colors = Array.from({ length: 40 }, (_, i) => c(i * 6, 255 - i * 6, 90));
    const sorted = sortPaletteColors(colors, colors.slice(20, 30));

    expect(sorted).toHaveLength(colors.length);
    expect(new Set(keys(sorted)).size).toBe(colors.length);
  });
});
