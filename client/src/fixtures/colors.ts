import type { Color, Normal, Pixel } from "@/types";

/**
 * Named colour / normal literals.
 *
 * Deliberately plain object literals rather than re-exports of the `DEFAULT_*`
 * constants in `src/types`: a fixture that aliases a production default silently
 * changes when that default changes, which makes a snapshot diff look like a
 * fixture bug instead of the behaviour change it is.
 */

export const makeColor = (r: number, g: number, b: number, a = 255): Color => ({
  r,
  g,
  b,
  a,
});

export const black: Color = { r: 0, g: 0, b: 0, a: 255 };
export const white: Color = { r: 255, g: 255, b: 255, a: 255 };
export const red: Color = { r: 255, g: 0, b: 0, a: 255 };
export const green: Color = { r: 0, g: 255, b: 0, a: 255 };
export const blue: Color = { r: 0, g: 0, b: 255, a: 255 };
export const cyan: Color = { r: 0, g: 217, b: 255, a: 255 };
export const magenta: Color = { r: 255, g: 0, b: 170, a: 255 };
export const yellow: Color = { r: 255, g: 170, b: 0, a: 255 };

/** Half-transparent, for alpha-blend fixtures. */
export const halfRed: Color = { r: 255, g: 0, b: 0, a: 128 };
/** Fully transparent but non-zero RGB — catches code that tests `a` only. */
export const clearBlue: Color = { r: 0, g: 0, b: 255, a: 0 };

export const allColors: Color[] = [
  black,
  white,
  red,
  green,
  blue,
  cyan,
  magenta,
  yellow,
];

/** `Pixel` and `Color` are structurally identical; alias for call-site clarity. */
export const asPixel = (c: Color): Pixel => ({ ...c });

// ── Normals ───────────────────────────────────────────────────────────────
// x, y are signed bytes (-128..127); z is unsigned (0..255, toward the screen).

/** Straight out of the screen. */
export const normalFlat: Normal = { x: 0, y: 0, z: 255 };
export const normalLeft: Normal = { x: -128, y: 0, z: 128 };
export const normalRight: Normal = { x: 127, y: 0, z: 128 };
export const normalUp: Normal = { x: 0, y: -128, z: 128 };
export const normalDown: Normal = { x: 0, y: 127, z: 128 };
/** The app's default light direction shape: top-left-front. */
export const normalTopLeftFront: Normal = { x: -64, y: -64, z: 180 };

export const allNormals: Normal[] = [
  normalFlat,
  normalLeft,
  normalRight,
  normalUp,
  normalDown,
  normalTopLeftFront,
];
