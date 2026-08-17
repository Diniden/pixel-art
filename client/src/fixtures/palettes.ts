import type { Color, Palette } from "@/types";
import { allColors, black, cyan, magenta, white } from "./colors";

/**
 * Palette builders.
 *
 * Deliberately NOT re-exports of `BASE_PALETTES` from `src/types`: those are
 * four palettes totalling 76 colours, which makes a palette-grid story
 * unreadable and a serializer snapshot enormous. Fixtures stay small enough to
 * read; a test that specifically needs the shipped palettes should import
 * `BASE_PALETTES` directly and say so.
 */

export function makePalette(
  id: string,
  name: string,
  colors: Color[],
): Palette {
  return { id, name, colors: colors.map((c) => ({ ...c })) };
}

/** 8 colours — the smallest palette that still wraps in a grid. */
export const paletteBasic: Palette = makePalette(
  "fixture-palette-basic",
  "Basic",
  allColors,
);

/** 4 colours, all monochrome — for contrast/greyscale checks. */
export const paletteMono: Palette = makePalette(
  "fixture-palette-mono",
  "Mono",
  [
    black,
    { r: 85, g: 85, b: 85, a: 255 },
    { r: 170, g: 170, b: 170, a: 255 },
    white,
  ],
);

/** Empty — the empty-state branch of any palette UI. */
export const paletteEmpty: Palette = makePalette(
  "fixture-palette-empty",
  "Empty",
  [],
);

/** 64 colours — overflow / scroll-container branch. */
export const paletteLarge: Palette = makePalette(
  "fixture-palette-large",
  "Large",
  Array.from({ length: 64 }, (_c, i) => ({
    r: (i * 4) % 256,
    g: (i * 9) % 256,
    b: (i * 17) % 256,
    a: 255,
  })),
);

export const palettesTypical: Palette[] = [paletteBasic, paletteMono];
export const palettesDense: Palette[] = [
  paletteBasic,
  paletteMono,
  paletteLarge,
];

/** A two-colour accent palette matching the app's own accents. */
export const paletteAccent: Palette = makePalette(
  "fixture-palette-accent",
  "Accent",
  [cyan, magenta],
);
