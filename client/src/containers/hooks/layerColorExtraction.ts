/**
 * layerColorExtraction — the unique-colour scan behind the CURRENT PALETTE
 * (originally REFRESH task 36, W27, when it fed `LayerColors`).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THIS WALKS PIXELS, SO IT MAY NOT LIVE IN `ui/` (R2)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This was a `useMemo` inside `LayerColors.tsx`. It iterates every cell of a
 * grid — and with `allFrames`/`allLayers` on, every cell of every layer in
 * scope of every frame. On the owner's real project that is 300,249 cells per
 * full pass. R2 bars that work from `ui/`, and W26 established
 * `containers/hooks/` as where it goes instead.
 *
 * The original algorithm is preserved, including the `pixel.a > 0` test,
 * which is separate from `getPixelColor`'s `color === 0` packed-empty test.
 *
 * ⚠️ The luminance sort (0.299/0.587/0.114) that used to end this function is
 * GONE — not lost, MOVED. Display order is `sortPaletteColors` in
 * `ui/utils/layerColors.ts`, because it needs the recently-used trail this
 * module cannot see. See the note above the return.
 *
 * ── ⚠️ THE 64-COLOUR DISPLAY CAP IS GONE (owner's instruction) ────────────
 *
 * The scan used to stop at `MAX_DISPLAY = 64` distinct colours, set an
 * `exceeded` flag, and return `colors: []` — so the row rendered "Too many
 * colors to display (65+)" INSTEAD of any swatches. Every distinct colour in
 * scope is now returned.
 *
 * ⚠️ The cap was a display decision, NOT the thing keeping this scan cheap.
 * Its early `break` only helped once 65 distinct colours had already been
 * seen; below that — the overwhelmingly common case, and the one that runs on
 * every paint — the scan always walked every cell regardless. What actually
 * bounds the cost is the container: the scan runs only while the row is
 * EXPANDED (see `PaletteManagerContainer`'s header). Removing the cap does
 * not change the worst case, which was and remains a full
 * O(frames × layers × w × h) walk.
 *
 * The per-cell work is a `Map` key lookup, so an uncapped result grows the
 * MAP, not the pass. The real cost of removing it is the DOM: a 2,000-colour
 * object renders 2,000 swatch buttons. That is the accepted trade — a palette
 * that blanks itself exactly when the art is most colourful is worse than a
 * long list.
 *
 * ── The scope is now TWO ORTHOGONAL AXES ─────────────────────────────────
 *
 * `allFrames` and `allLayers` are independent toggles on the Current Palette,
 * so there are four scopes rather than two:
 *
 *      allFrames  allLayers   what is scanned
 *      ─────────  ─────────   ─────────────────────────────────────────────
 *        false      false     the selected layer, current frame
 *        true       false     every SAME-NAMED layer, every frame
 *        false      true      every layer of the current frame
 *        true       true      every layer of every frame
 *
 * ⚠️ THE LAYER AXIS MATCHES BY NAME, NOT BY ID, and that is load-bearing
 * rather than incidental. Layer ids are per-frame and do not correspond
 * across frames, so name is the only cross-frame identity the model has —
 * the same rule `ApplicationStore.startColorAdjustment` scans by, which is
 * what keeps the swatches the user sees and the cells a recolour touches in
 * agreement. Turning `allLayers` on is precisely "stop matching on name".
 *
 * ⚠️ The VARIANT branch never matched on name to begin with: it iterates
 * `variantFrame.layers` unconditionally (a pin from W29g, mirrored in
 * `startColorAdjustment`). So on the variant path `allLayers` is meaningful
 * only in the CURRENT-frame case; with `allFrames` on, every variant layer
 * was already in scope and the flag changes nothing.
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
import type {
  Color,
  Frame,
  Layer,
  Pixel,
  PixelData,
  PixelObject,
} from "../../types";
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

/** The two independent scope axes, as the Current Palette's toggles set them. */
export interface ColorScanScope {
  /** Scan every frame rather than only the current one. */
  allFrames: boolean;
  /** Scan every layer in scope rather than only same-named ones. */
  allLayers: boolean;
}

export function extractLayerColors(
  layer: Layer | null,
  obj: PixelObject | null,
  /**
   * The frame the editor is on. Only the `allLayers && !allFrames` branch
   * needs it, but it is passed IN rather than derived here: the current frame
   * index lives on the store (`ApplicationStore.currentFrame`) and this module
   * takes only domain nodes, so deriving it would mean re-implementing the
   * store's selection logic against a `PixelObject` that does not record it.
   */
  currentFrame: Frame | null,
  scope: ColorScanScope,
  editingVariant: boolean,
  variantData: CurrentVariant | null,
  variantLayer: Layer | null,
): LayerColorsData {
  if (!layer || !obj) return { colors: [] as Color[], count: 0 };

  const { allFrames, allLayers } = scope;

  const colorMap = new Map<string, Color>();

  /** Walk one grid, adding every non-transparent colour it holds. */
  const scanGrid = (pixels: PixelData[][], width: number, height: number) => {
    for (let y = 0; y < height; y++) {
      const row = pixels[y];
      if (!row) continue;

      for (let x = 0; x < width; x++) {
        const pixel = getPixelColor(row[x]);
        if (pixel && pixel.a > 0) {
          const key = colorKey(pixel);
          if (!colorMap.has(key)) colorMap.set(key, pixel);
        }
      }
    }
  };

  // Handle variant editing mode
  if (editingVariant && variantData && variantLayer) {
    const { variant } = variantData;
    const { width, height } = variant.gridSize;

    if (allFrames) {
      // Every layer of every variant frame. ⚠️ The variant path has never
      // matched on name (W29g pin), so `allLayers` adds nothing here.
      for (const variantFrame of variant.frames) {
        for (const vLayer of variantFrame.layers) {
          scanGrid(vLayer.pixels, width, height);
        }
      }
    } else if (allLayers) {
      // Every layer of the CURRENT variant frame.
      for (const vLayer of variantData.variantFrame.layers) {
        scanGrid(vLayer.pixels, width, height);
      }
    } else {
      // Only the selected variant layer, current frame.
      scanGrid(variantLayer.pixels, width, height);
    }
  } else {
    // Regular layer editing mode
    const { width, height } = obj.gridSize;

    if (allFrames) {
      // ⚠️ `filter` by NAME, not `find` — several same-named layers in one
      // frame are ALL in scope, and a renamed layer is silently stranded.
      // `allLayers` is exactly "skip the name filter".
      for (const frame of obj.frames) {
        const layers = allLayers
          ? frame.layers
          : frame.layers.filter((l) => l.name === layer.name);
        for (const matchingLayer of layers) {
          scanGrid(matchingLayer.pixels, width, height);
        }
      }
    } else if (allLayers) {
      // Every layer of the current frame.
      for (const frameLayer of currentFrame?.layers ?? []) {
        scanGrid(frameLayer.pixels, width, height);
      }
    } else {
      // Only the selected layer, current frame.
      scanGrid(layer.pixels, width, height);
    }
  }

  // ⚠️ RETURNED UNSORTED — this is deliberate, and it used to sort here.
  //
  // The scan sorted by luminance and that was the final order. Display order
  // now needs the recently-used trail (`SessionStore.colorHistory`), which is
  // session state this module has no access to and should not acquire: its job
  // is "which colours exist", not "in what order to show them". The container
  // applies `sortPaletteColors` to the result — one owner for ordering rather
  // than a sort here that a second sort immediately overrides.
  const colors = Array.from(colorMap.values());

  return { colors, count: colors.length };
}
