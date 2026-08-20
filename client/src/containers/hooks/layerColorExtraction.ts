/**
 * layerColorExtraction — the unique-colour scan for `LayerColors`
 * (REFRESH task 36, W27).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THIS WALKS PIXELS, SO IT MAY NOT LIVE IN `ui/` (R2)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This was a `useMemo` inside `LayerColors.tsx`. It iterates every cell of a
 * grid — and in `allFramesMode`, every cell of every matching layer of every
 * frame. On the owner's real project that is 300,249 cells per full pass. R2
 * bars that work from `ui/`, and W26 established `containers/hooks/` as where
 * it goes instead.
 *
 * The algorithm is transcribed VERBATIM, including:
 *   - the `MAX_DISPLAY = 64` cap and the labelled `break` out of the nested
 *     loops the moment the cap is exceeded (this is what keeps the scan cheap
 *     on a dense layer — do not "simplify" the labels away),
 *   - the `pixel.a > 0` test, which is separate from `getPixelColor`'s
 *     `color === 0` packed-empty test,
 *   - the luminance sort (0.299/0.587/0.114) that orders the swatches,
 *   - returning `colors: []` when `exceeded`, so the caller renders the
 *     "too many colors" state rather than a truncated list.
 *
 * ── Invalidation ─────────────────────────────────────────────────────────
 *
 * ⚠️ The caller MUST pass `pixelVersion`. The original `useMemo` keyed on the
 * `layer`/`obj` OBJECT IDENTITIES, which is not sufficient here: grids are
 * `observable.ref`, so a paint that replaces `layer.pixels` need not produce a
 * new `layer` node, and MobX would not report a read of the cells themselves.
 * Without the version in the dependency list the swatch list goes STALE — the
 * spec's manual check 2 ("paint a new colour and confirm it appears in the
 * list immediately") is precisely this bug.
 */
import type { Color, Layer, Pixel, PixelData, PixelObject } from "../../types";
import type { CurrentVariant } from "../../types";
// The result type and the swatch key live in `ui/utils/layerColors.ts` — see
// that file for why they are split from this scan.
import { colorKey, type LayerColorsData } from "../../ui/utils/layerColors";

/** Extracts the colour from a packed `PixelData`, or null when empty. */
function getPixelColor(pd: PixelData | undefined): Pixel | null {
  if (!pd || pd.color === 0) return null;
  return pd.color;
}

export type { LayerColorsData };

export function extractLayerColors(
  layer: Layer | null,
  obj: PixelObject | null,
  allFramesMode: boolean,
  editingVariant: boolean,
  variantData: CurrentVariant | null,
  variantLayer: Layer | null,
): LayerColorsData {
  if (!layer || !obj)
    return { colors: [] as Color[], exceeded: false, count: 0 };

  const MAX_DISPLAY = 64;
  const colorMap = new Map<string, Color>();
  let exceeded = false;

  const addColor = (pixel: Color) => {
    const key = colorKey(pixel);
    if (!colorMap.has(key)) {
      colorMap.set(key, pixel);
      if (colorMap.size > MAX_DISPLAY) {
        exceeded = true;
      }
    }
  };

  // Handle variant editing mode
  if (editingVariant && variantData && variantLayer) {
    const { variant } = variantData;
    const { width, height } = variant.gridSize;

    if (allFramesMode) {
      // Get colors from all variant frames
      outerVariantAll: for (const variantFrame of variant.frames) {
        for (const vLayer of variantFrame.layers) {
          for (let y = 0; y < height; y++) {
            const row = vLayer.pixels[y];
            if (!row) continue;

            for (let x = 0; x < width; x++) {
              const pixel = getPixelColor(row[x]);
              if (pixel && pixel.a > 0) {
                addColor(pixel);
                if (exceeded) break outerVariantAll;
              }
            }
          }
        }
      }
    } else {
      // Get colors only from current variant frame's layer
      outerVariantCurrent: for (let y = 0; y < height; y++) {
        const row = variantLayer.pixels[y];
        if (!row) continue;

        for (let x = 0; x < width; x++) {
          const pixel = getPixelColor(row[x]);
          if (pixel && pixel.a > 0) {
            addColor(pixel);
            if (exceeded) break outerVariantCurrent;
          }
        }
      }
    }
  } else {
    // Regular layer editing mode
    const { width, height } = obj.gridSize;

    if (allFramesMode) {
      // Get colors from all frames with matching layer names
      outerAllFrames: for (const frame of obj.frames) {
        const matchingLayers = frame.layers.filter(
          (l) => l.name === layer.name,
        );
        for (const matchingLayer of matchingLayers) {
          for (let y = 0; y < height; y++) {
            const row = matchingLayer.pixels[y];
            if (!row) continue;

            for (let x = 0; x < width; x++) {
              const pixel = getPixelColor(row[x]);
              if (pixel && pixel.a > 0) {
                addColor(pixel);
                if (exceeded) break outerAllFrames;
              }
            }
          }
        }
      }
    } else {
      // Get colors only from current layer
      outerCurrentLayer: for (let y = 0; y < height; y++) {
        const row = layer.pixels[y];
        if (!row) continue;

        for (let x = 0; x < width; x++) {
          const pixel = getPixelColor(row[x]);
          if (pixel && pixel.a > 0) {
            addColor(pixel);
            if (exceeded) break outerCurrentLayer;
          }
        }
      }
    }
  }

  // Sort by luminance for a nice visual order
  const colors = exceeded
    ? []
    : Array.from(colorMap.values()).sort((a, b) => {
        const lumA = 0.299 * a.r + 0.587 * a.g + 0.114 * a.b;
        const lumB = 0.299 * b.r + 0.587 * b.g + 0.114 * b.b;
        return lumA - lumB;
      });

  return { colors, exceeded, count: colorMap.size };
}
