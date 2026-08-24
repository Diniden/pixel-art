/**
 * normalCompute — the PURE lighting algorithms, extracted from the store and
 * the toolbar (REFRESH task 27, folding in `MASTER.md` §9.5).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ SPEC CORRECTION — WHAT "the normal-from-height algorithm" ACTUALLY IS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Task 27's Context table points at `lightingActions.ts:485-621` and calls it
 * "the normal-from-height algorithm ... pure". Measured, it is neither:
 *
 *  - Those 136 lines are `computeNormalsForAllFrames`, a store action that
 *    walks the project tree and calls `updateProjectAndSave`. It is not pure
 *    and never was.
 *  - The *actual* pure normal computation it delegates to —
 *    `computeEdgeInterpolatedNormals` — was ALREADY extracted, into
 *    `utils/edgeInterpolate.ts:468`, and already has 20 unit tests
 *    (`utils/__tests__/edgeInterpolate.test.ts`). Re-extracting it would
 *    duplicate a module that exists.
 *  - It is EDGE-interpolation, not height-derived: it reads `layer.pixels`'
 *    colour coverage to find silhouette edges. Nothing in it reads `height`.
 *
 * The genuinely-unextracted pure algorithm in the lighting slice is the
 * **height map** one, and it lives in a COMPONENT:
 * `components/Toolbar/LightingStudioTools.tsx:24-252` — `rgbToHsl`,
 * `getChannelValue` and the min/max normalisation that turns a colour channel
 * into a 0-255 height. That is what §9.5 was really pointing at ("extract the
 * pure algorithm out of the action module into a pure function"), it is the
 * one that ran inside a React component, and it is what this module holds.
 *
 * The two grid transforms the flips need are here too, for the same reason:
 * they are pure, they were duplicated verbatim four times between
 * `flipHorizontal` and `flipVertical` (two branches each), and `PixelStore`
 * cannot be unit-tested against them while they are inlined in a Zustand
 * action closure.
 *
 * ── EVERY FUNCTION HERE IS A FAITHFUL PORT ────────────────────────────────
 *
 * Task 08 pinned this behaviour. The arithmetic is transcribed exactly,
 * including the parts that look wrong:
 *
 *  - `rgbToHsl` scales H, S and L to **0-255**, not to degrees/percent, and
 *    ROUNDS each — so hue resolution is 256 steps, not 360.
 *  - The height normalisation clamps to 0-255 and then forces any non-zero
 *    result up to at least 1, because height `0` is the "no height data"
 *    sentinel rather than a legitimate floor.
 *  - A zero-range channel (every pixel the same) maps to `params.min`, not to
 *    the midpoint.
 *
 * Do NOT "improve" any of it. Assert observed behaviour.
 */
import type { Layer, Normal, Pixel, PixelData } from "../types";

/* ══ THE HEIGHT MAP ALGORITHM ═════════════════════════════════════════════ */

/** The six COLOUR channels a height map can be derived from. */
export type ColorChannel = "R" | "G" | "B" | "H" | "S" | "L";

/**
 * The three NORMAL-MAP axes a height map can be derived from. `NX`/`NY` read
 * the axis MAGNITUDE (`|x|`, `|y|` of the signed byte), `NZ` reads `z` raw —
 * it is already an unsigned "toward the screen" magnitude, so the more
 * screen-facing a normal is, the higher the suggested height.
 */
export type NormalAxis = "NX" | "NY" | "NZ";

/** Everything the height-map dialog can derive a height from. */
export type HeightChannel = ColorChannel | NormalAxis;

/** Narrow a {@link HeightChannel} to the normal-axis members. */
export function isNormalAxis(channel: HeightChannel): channel is NormalAxis {
  return channel === "NX" || channel === "NY" || channel === "NZ";
}

/** The height-map dialog's parameters. */
export interface HeightMapParams {
  channel: HeightChannel;
  /** The height the DARKEST/lowest channel value maps to. */
  min: number;
  /** The height the BRIGHTEST/highest channel value maps to. */
  max: number;
}

/** One cell the height map wants written. */
export interface HeightWrite {
  x: number;
  y: number;
  height: number;
}

/**
 * RGB → HSL, with all three outputs scaled to **0-255 and rounded**.
 *
 * ⚠️ Ported verbatim from `LightingStudioTools.tsx:25-62`. The 0-255 scaling
 * is deliberate: the result feeds a height byte, so degrees would have to be
 * rescaled anyway. Rounding at this step (rather than at the end) is part of
 * the observed output and is preserved.
 */
export function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 255), // Scale to 0-255
    s: Math.round(s * 255),
    l: Math.round(l * 255),
  };
}

/**
 * Read one channel off a pixel. The HSL channels go through
 * {@link rgbToHsl}; R/G/B are returned raw.
 *
 * Ported verbatim from `LightingStudioTools.tsx:65-79`.
 */
export function getChannelValue(pixel: Pixel, channel: ColorChannel): number {
  switch (channel) {
    case "R":
      return pixel.r;
    case "G":
      return pixel.g;
    case "B":
      return pixel.b;
    case "H":
    case "S":
    case "L": {
      const hsl = rgbToHsl(pixel.r, pixel.g, pixel.b);
      return hsl[channel.toLowerCase() as "h" | "s" | "l"];
    }
  }
}

/**
 * Read one axis off a normal, as a 0-255 "how far along this axis" value.
 *
 * `x` and `y` are signed bytes, so their MAGNITUDE is taken — a normal
 * pointing hard left and one pointing hard right are equally "along x". `z`
 * is stored unsigned and always screen-facing, so it is returned raw: 255 is
 * a normal pointing straight out of the screen.
 */
export function getNormalAxisValue(normal: Normal, axis: NormalAxis): number {
  switch (axis) {
    case "NX":
      return Math.abs(normal.x);
    case "NY":
      return Math.abs(normal.y);
    case "NZ":
      return normal.z;
  }
}

/**
 * Derive a height map from a layer's colours — or, for the `N*` channels,
 * from its normal map.
 *
 * Two passes, exactly as the component did them: collect every COLOURED
 * pixel's channel value to find the data's own min/max, then linearly map
 * each onto `[params.min, params.max]`.
 *
 * Returns the cells to write, or an EMPTY array when the layer has no
 * coloured pixels at all — the component's `if (channelValues.length === 0)
 * return;` early exit, preserved as "nothing to write" rather than as an
 * error.
 *
 * ⚠️ Three transcribed quirks, all observable:
 *  1. only pixels with `color !== 0` participate, so transparent cells keep
 *     whatever height they had — and for the normal-axis channels, only
 *     pixels with `normal !== 0`, so cells without normal data likewise keep
 *     their height;
 *  2. a zero range (every coloured pixel identical in that channel) maps
 *     everything to `params.min`;
 *  3. the result is clamped to 0-255 and then RAISED to 1 if it is non-zero,
 *     because `height: 0` means "no height data" and a legitimate low height
 *     must not be mistaken for it.
 *
 * Ported from `LightingStudioTools.tsx:196-252`.
 */
export function computeHeightMap(
  layer: Layer,
  width: number,
  height: number,
  params: HeightMapParams,
): HeightWrite[] {
  // Pass 1: collect the channel value of every pixel that HAS the source
  // datum — a colour for the R/G/B/H/S/L channels, a normal for NX/NY/NZ.
  const channelValues: number[] = [];
  const pixelPositions: { x: number; y: number; value: number }[] = [];

  for (let y = 0; y < height; y++) {
    const row = layer.pixels[y];
    if (!row) continue;
    for (let x = 0; x < width; x++) {
      const pixelData: PixelData | undefined = row[x];
      if (!pixelData) continue;

      let value: number | undefined;
      if (isNormalAxis(params.channel)) {
        if (pixelData.normal !== 0 && typeof pixelData.normal === "object") {
          value = getNormalAxisValue(pixelData.normal, params.channel);
        }
      } else if (
        pixelData.color !== 0 &&
        typeof pixelData.color === "object"
      ) {
        value = getChannelValue(pixelData.color, params.channel);
      }

      if (value !== undefined) {
        channelValues.push(value);
        pixelPositions.push({ x, y, value });
      }
    }
  }

  if (channelValues.length === 0) return [];

  // Pass 2: normalise each onto the requested output range.
  //
  // ⚠️ `Math.min(...channelValues)` is a SPREAD over one element per coloured
  // pixel, ported as-is. On the owner's 300k-cell project that is a 300k-wide
  // argument list, which is within V8's limit but not by a wide margin. It is
  // preserved rather than rewritten because task 08 pinned the output and a
  // reduce would be a behaviour-identical but unpinned change; noted here so
  // the next person who sees it knows it was considered.
  const actualMin = Math.min(...channelValues);
  const actualMax = Math.max(...channelValues);
  const range = actualMax - actualMin;

  return pixelPositions.map(({ x, y, value: channelValue }) => {
    let normalized: number;
    if (range === 0) {
      normalized = params.min;
    } else {
      const t = (channelValue - actualMin) / range;
      normalized = params.min + t * (params.max - params.min);
    }

    // Clamp to 0-255, then floor non-zero results at 1: height 0 is the
    // "no height data" sentinel, not a value.
    const heightValue = Math.max(0, Math.min(255, Math.round(normalized)));
    return { x, y, height: heightValue === 0 ? 0 : Math.max(1, heightValue) };
  });
}

/* ══ THE FLIP TRANSFORMS ══════════════════════════════════════════════════ */

/**
 * Mirror a grid left-to-right, negating each normal's **x** component.
 *
 * ⚠️ Ported verbatim from `lightingActions.ts:753-891`, where it appeared
 * TWICE (the regular branch and the variant branch, character-identical).
 *
 * ⚠️ NOT UNIFIED WITH {@link flipGridVertical}. The two are mirror images of
 * each other and a single `flipAxis(axis)` is the obvious refactor, but task
 * 27's constraints forbid it here: task 08 pinned `flipHorizontal ∘
 * flipHorizontal = identity` AND that H and V agree modulo transpose, and
 * collapsing them before those pins are re-verified against the new store
 * would change two things at once. Unifying is a follow-up.
 *
 * Behaviour worth knowing, all transcribed:
 *  - the output grid is FULLY REBUILT from empty cells, so a ragged or
 *    short input row yields a rectangular `height × width` result;
 *  - `normal === 0` (the "no normal" sentinel) is left as `0`, never negated
 *    into `-0`;
 *  - `height` rides along untouched — a horizontal mirror does not change how
 *    tall anything is.
 */
export function flipGridHorizontal(
  pixels: readonly PixelData[][],
  width: number,
  height: number,
): PixelData[][] {
  const newPixels = emptyGrid(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const flippedX = width - 1 - x;
      const sourcePixel = pixels[y]?.[x];
      if (sourcePixel) {
        let flippedNormal: Normal | 0 = sourcePixel.normal;
        if (flippedNormal !== 0) {
          // Negate x component of normal for horizontal flip
          flippedNormal = { ...flippedNormal, x: -flippedNormal.x };
        }
        newPixels[y][flippedX] = {
          color: sourcePixel.color,
          normal: flippedNormal,
          height: sourcePixel.height,
        };
      }
    }
  }
  return newPixels;
}

/**
 * Mirror a grid top-to-bottom, negating each normal's **y** component.
 *
 * The vertical twin of {@link flipGridHorizontal} — see its notes, which
 * apply here unchanged. Ported verbatim from `lightingActions.ts:893-1031`,
 * where it too appeared twice.
 */
export function flipGridVertical(
  pixels: readonly PixelData[][],
  width: number,
  height: number,
): PixelData[][] {
  const newPixels = emptyGrid(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const flippedY = height - 1 - y;
      const sourcePixel = pixels[y]?.[x];
      if (sourcePixel) {
        let flippedNormal: Normal | 0 = sourcePixel.normal;
        if (flippedNormal !== 0) {
          // Negate y component of normal for vertical flip
          flippedNormal = { ...flippedNormal, y: -flippedNormal.y };
        }
        newPixels[flippedY][x] = {
          color: sourcePixel.color,
          normal: flippedNormal,
          height: sourcePixel.height,
        };
      }
    }
  }
  return newPixels;
}

/**
 * A fresh `height × width` grid of empty cells.
 *
 * ⚠️ Every cell is a DISTINCT object literal, exactly as the legacy
 * `Array.from({length}, () => ({...}))` produced. Hoisting one shared empty
 * cell would alias every untouched pixel to the same object — harmless while
 * grids are treated as immutable, and a silent corruption the moment
 * something writes through one.
 */
function emptyGrid(width: number, height: number): PixelData[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({
      color: 0 as const,
      normal: 0 as const,
      height: 0,
    })),
  );
}
