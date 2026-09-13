/**
 * layerColors — the SHARED, store-free vocabulary for the layer-colour
 * swatch strip (REFRESH task 36, W27).
 *
 * ⚠️ Deliberately split from the SCAN. The scan itself walks every pixel of a
 * grid, so R2 keeps it in `containers/hooks/layerColorExtraction.ts`. But its
 * RESULT TYPE and the swatch key helper are pure data with no store and no
 * pixel iteration, and `CurrentPalette` (a `ui/` component) has to name both.
 * The names still say "layer colours" because that is what the scan produces;
 * the `LayerColors` COMPONENT they were written for is retired.
 *
 * Putting them here rather than in the hook is what keeps the boundary honest:
 * `ui/` may not import from `containers/`, and re-exporting the type through
 * the hook would have made the component reach across that line for a type it
 * is entitled to.
 */
import type { Color } from "../../types";

/**
 * The result of a unique-colour scan over a layer (or over all frames).
 *
 * ⚠️ There is NO display cap. The scan used to stop at 64 distinct colours and
 * report `exceeded`, and the row then showed "Too many colors to display"
 * INSTEAD of any swatches. That was removed on the owner's instruction: a
 * palette that hides itself exactly when the art is most colourful is worse
 * than a long list, and "all layers, all frames" makes passing 64 ordinary
 * rather than exceptional. Every distinct colour in scope is returned.
 */
export interface LayerColorsData {
  /**
   * Swatches, in DISPLAY ORDER — see {@link sortPaletteColors}.
   *
   * ⚠️ NOT luminance-sorted any more. The scan used to sort by luminance and
   * that was the final order; ordering now happens in one place, here, because
   * it needs the recently-used trail, which the scan has no access to.
   */
  colors: Color[];
  /** How many distinct colours were found. Always `colors.length`. */
  count: number;
}

/** Unique key for a colour — the swatch list's React key. */
export function colorKey(c: Color): string {
  return `${c.r}-${c.g}-${c.b}-${c.a}`;
}

/** How many recently-used colours are pinned to the front of the palette. */
export const RECENT_COLOR_SLOTS = 10;

/**
 * The HSL pair the palette sorts on: hue in [0, 360) and lightness in [0, 100].
 *
 * ⚠️ NOT `colorMath.rgbToHsl`, and that is a measured decision rather than a
 * missed reuse. That function ROUNDS its three components (`Math.round(h *
 * 360)`, `l` as an integer percent) because it backs the colour picker's
 * numeric fields, where integers are the point. Sorting on rounded values
 * collapses genuinely different colours into ties: 256 distinct blue-greys
 * land on a handful of integer lightnesses, the comparator reports 0, and the
 * ramp comes out in whatever order the scan happened to find them. The
 * palette needs the unrounded values, so it computes them here.
 *
 * ⚠️ `lightness` is HSL's `(max + min) / 2`, NOT the luminance the old sort
 * used (`0.299r + 0.587g + 0.114b`). They disagree: luminance is perceptually
 * weighted, so pure blue reads as very dark and pure green as light, and a
 * luminance sort therefore interleaves hues that HSL lightness keeps together.
 * Since the colours are already GROUPED by hue here, the perceptual weighting
 * would actively fight the grouping — within one hue bucket it is the
 * geometric dark-to-light ramp that reads as sorted.
 *
 * ⚠️ GREYS HAVE NO HUE and are separated out. `rgbToHsl` reports `h = 0` for
 * an achromatic colour, which is indistinguishable from pure red and scatters
 * the neutral ramp through the reds. Here they get `hue = -1` so they form
 * their own group at the FRONT — a greyscale ramp is exactly what an artist
 * expects to find together.
 */
function hueAndLightness(c: Color): { hue: number; lightness: number } {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = -1; // achromatic — see the header
  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  return { hue, lightness: (max + min) / 2 };
}

/**
 * The palette's display order: the {@link RECENT_COLOR_SLOTS} most recently
 * used colours first, then everything else grouped by hue and ramped darkest
 * to lightest within each hue.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE RECENT BLOCK IS FILTERED BY `colors`, NOT CONCATENATED ONTO IT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `recent` is the session-wide trail (`SessionStore.colorHistory`), which is
 * NOT a subset of `colors`: it survives project switches, it records colours
 * picked but never painted, and it keeps colours whose last pixel has since
 * been erased or painted over. Appending it would put swatches in the palette
 * that do not exist anywhere in the art — and double-tapping one would open a
 * recolour session that matches zero pixels.
 *
 * So the recent block is the INTERSECTION: a recently-used colour appears
 * only if the scan actually found it. That also means the block is often
 * SHORTER than {@link RECENT_COLOR_SLOTS}, which is correct rather than a
 * shortfall to pad out.
 *
 * ⚠️ Ordering is STABLE against the scan, not against the trail: painting
 * with a colour already in the palette reorders the front block on the next
 * scan. That is the point of the feature, but it does mean swatches move
 * under the user's finger as they work — which is why the recent block is
 * capped at 10 and the rest of the palette stays in a fixed hue order.
 *
 * @param colors  every distinct colour in scope, in any order.
 * @param recent  the newest-first recently-used trail; may be empty.
 */
export function sortPaletteColors(
  colors: readonly Color[],
  recent: readonly Color[],
): Color[] {
  const byHueThenLightness = (a: Color, b: Color): number => {
    const ha = hueAndLightness(a);
    const hb = hueAndLightness(b);
    if (ha.hue !== hb.hue) return ha.hue - hb.hue;
    if (ha.lightness !== hb.lightness) return ha.lightness - hb.lightness;
    // Total order, so the sort is deterministic for two colours that agree on
    // both axes (e.g. the same RGB at different alpha).
    return a.a - b.a;
  };

  if (recent.length === 0) return [...colors].sort(byHueThenLightness);

  const available = new Map(colors.map((c) => [colorKey(c), c]));

  const pinned: Color[] = [];
  const pinnedKeys = new Set<string>();
  for (const color of recent) {
    if (pinned.length >= RECENT_COLOR_SLOTS) break;
    const key = colorKey(color);
    // `available` is what makes this an intersection — see the header. The
    // `pinnedKeys` test guards against a duplicate in the trail itself.
    if (!available.has(key) || pinnedKeys.has(key)) continue;
    pinnedKeys.add(key);
    pinned.push(available.get(key)!);
  }

  const rest = colors
    .filter((c) => !pinnedKeys.has(colorKey(c)))
    .sort(byHueThenLightness);

  return [...pinned, ...rest];
}
