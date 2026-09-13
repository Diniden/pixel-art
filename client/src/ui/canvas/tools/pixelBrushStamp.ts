/**
 * `pixelBrushStamp` — the pixel-studio Brush tool's pure core (plan 12, task 02).
 *
 * The Brush tool stamps the brush document open in the Brush Studio onto the
 * pixel canvas. Everything it needs that is NOT a store read lives here, as
 * four responsibilities:
 *
 *  1. **Footprint** (`pixelBrushFootprint`, MASTER D3) — which cells of the
 *     brush frame are painted on any VISIBLE layer, as offsets relative to the
 *     brush origin `(floor(w/2), floor(h/2))`, row-major. This is the hover
 *     marker AND the set of cells a press writes, so the two cannot disagree.
 *  2. **Colour settling** (`settlePixelBrushColor`, MASTER D5) — one cell's
 *     final colour: the user's base colour with every visible layer's signed
 *     delta applied bottom → top. `rgb` deltas add in RGB space; `hsl` deltas
 *     shift hue / saturation / lightness in HSL space; both shift alpha.
 *     `normal` / `heightmap` deltas are inert (they target lighting data and
 *     have no meaning against an RGBA base — an open item).
 *  3. **Stamp** (`resolvePixelBrushStamp`, MASTER D6) — the footprint with a
 *     settled colour per cell for one base colour. Resolved once per
 *     (document, frame, base colour) by the container, never per pointer event.
 *  4. **Segment writes** (`stampPixelBrushSegment`, MASTER D7) — the pixel
 *     writes a drag segment produces: the stamp at every rasterised step,
 *     bounds-filtered, last write wins per cell.
 *
 * ## Display vs operator — why `brushCellToRgba` is NEVER used here
 *
 * `types/brush.ts` exports `deltaToByte` / `brushCellToRgba`, which map a
 * −255..255 delta onto a 0..255 byte centred on 127 (`127 + v / 2`). That is
 * the Brush Studio's DISPLAY mapping: it halves the resolution and exists only
 * so a signed grid can be drawn on an unsigned canvas. Here the deltas are
 * OPERATORS applied to a real colour, so every cell is read raw (`cell[i]`)
 * at full resolution and full sign. Reaching for the display helpers in this
 * file would silently halve every delta and offset it by 127.
 *
 * ## The HSL scale (MASTER D5, symmetric with RGB)
 *
 * A delta of ±255 is "the full range" on every channel:
 *
 *  - H: ±255 ↔ ±360° — `PIXEL_BRUSH_HUE_PER_DELTA = 360 / 255` degrees per unit.
 *  - S, L: ±255 ↔ ±100 % — `PIXEL_BRUSH_PERCENT_PER_DELTA = 100 / 255` per unit.
 *  - A: ±255 ↔ ±255 alpha, unscaled, in both spaces.
 *
 * Both constants live here and nowhere else so a re-tune is a one-line change.
 *
 * ## The `prevHsl` carry is load-bearing
 *
 * `rgbToHsl` returns H = S = 0 for pure black and pure white — hue and
 * saturation are undefined there. When an `rgb` layer follows an `hsl` layer
 * we convert back to RGB and remember the HSL triple; the next `hsl` layer
 * hands it to `rgbToHsl` as `prevHsl`, so a black base that an earlier `hsl`
 * layer gave a hue keeps that hue when a later `hsl` layer finally lifts L.
 * Consecutive `hsl` layers stay in HSL space and never round-trip at all.
 *
 * ## Colour source: selected vs target (plan 13, task 05)
 *
 * Each brush layer has a `colorSource` (`brushLayerColorSource`, absent =
 * `"selected"`). A cell's SEED is the source of its **bottom-most visible
 * painted layer**; every visible layer's delta still applies in order (one
 * fold, as above). A `"selected"`-seeded cell is settled here, once, against
 * the user's base colour — today's path. A `"target"`-seeded cell cannot be
 * settled ahead of time because its base is the canvas pixel under it, so
 * the stamp carries the raw `targetDeltas` and `stampPixelBrushSegment`
 * settles them at write time through an injected `PixelBrushTarget.sample`
 * (a bound closure — no grid crosses into `ui/`, as `TraceSamplerFn`).
 *
 * **A target cell is settled at most once per stroke, from its pre-stroke
 * pixel.** `PixelBrushTarget.touched` (keyed `y * gridWidth + x`) remembers
 * the cells this stroke has already settled, and the handler clears it on
 * press, so a drag that crosses a cell twice does not compound the burn while
 * a second stroke does. An empty pixel (`sample` → `null`) is never written:
 * a burn on nothing is nothing. Without a `target` every cell writes its
 * pre-settled `color` — the selected-seed settle, which a target cell keeps
 * as its FALLBACK — so consumers that never supply a sampler (the Brush
 * Studio, older callers) see exactly the old output.
 *
 * Pure: no React, no MobX, no store, no DOM. Grids are read by reference and
 * never observed. Does NOT import `toolHandlers.ts` (that module imports this
 * one); `PixelBrushWrite` is declared structurally and is assignable to
 * `ToolPixelWrite` by shape.
 */

import { brushLayerColorSource } from "@/types/brush";
import type {
  BrushChannelType,
  BrushColorSource,
  BrushDelta,
} from "@/types/brush";
import type { BrushSceneLayer } from "../render/renderBrushFrame";
import { hslToRgb, rgbToHsl } from "../../utils/colorMath";
import { inBounds } from "./brushStamp";
import type { LineFn, StampBounds, StampColor, StampPoint } from "./brushStamp";

/** Degrees of hue per unit of H delta: ±255 ↔ ±360°. */
export const PIXEL_BRUSH_HUE_PER_DELTA = 360 / 255;
/** Percent of saturation / lightness per unit of S / L delta: ±255 ↔ ±100 %. */
export const PIXEL_BRUSH_PERCENT_PER_DELTA = 100 / 255;

/** A cell's position relative to the brush origin, in whole cells. */
export interface PixelBrushOffset {
  dx: number;
  dy: number;
}

/** The painted cells of a brush frame, relative to the origin, row-major. */
export interface PixelBrushFootprint {
  width: number;
  height: number;
  originX: number;
  originY: number;
  offsets: ReadonlyArray<PixelBrushOffset>;
}

/**
 * A brush layer as the stamp sees it: the compositor's slice plus the
 * optional colour source. A real `BrushLayer` satisfies this structurally,
 * and so does a plain `BrushSceneLayer` (the key is optional — absent means
 * `"selected"`, via `brushLayerColorSource`).
 */
export interface PixelBrushSourceLayer extends BrushSceneLayer {
  colorSource?: BrushColorSource;
}

/** One visible layer's raw delta at a position, with the space it applies in. */
export interface PixelBrushLayerDelta {
  channelType: BrushChannelType;
  delta: BrushDelta;
}

/** One footprint cell with its settled colour. Owns its `color` object. */
export interface PixelBrushCell extends PixelBrushOffset {
  /**
   * Settled from the selected colour. For a target-seeded cell this is the
   * FALLBACK used when no sampler is supplied.
   */
  color: StampColor;
  /**
   * Present ⇒ target-seeded: the visible-layer deltas, bottom → top, to apply
   * to the canvas pixel under the cell at write time.
   */
  targetDeltas?: ReadonlyArray<PixelBrushLayerDelta>;
}

/** The canvas pixel at grid `(x, y)`, or `null` when the cell is empty. */
export type PixelBrushTargetSampler = (
  x: number,
  y: number,
) => StampColor | null;

/** What a target-seeded cell needs at write time. Bound by the container. */
export interface PixelBrushTarget {
  /** The canvas pixel at grid (x, y), or `null` when the cell is empty. Bound by the container. */
  sample: PixelBrushTargetSampler;
  /** Cells (keyed `y * gridWidth + x`) already settled in THIS stroke. Cleared by the handler on press. */
  touched: Set<number>;
}

/** The footprint with a settled colour per cell for one base colour. */
export interface PixelBrushStamp {
  width: number;
  height: number;
  originX: number;
  originY: number;
  cells: ReadonlyArray<PixelBrushCell>;
}

/**
 * One pixel write. Structurally a `ToolPixelWrite` (`toolHandlers.ts`) —
 * declared here rather than imported to avoid the import cycle.
 */
export interface PixelBrushWrite {
  x: number;
  y: number;
  color: StampColor;
}

/** The brush cell that sits on the cursor cell: `(floor(w/2), floor(h/2))`. */
export function pixelBrushOrigin(
  width: number,
  height: number,
): { originX: number; originY: number } {
  return { originX: Math.floor(width / 2), originY: Math.floor(height / 2) };
}

/**
 * Visit every painted cell of every visible layer inside `width × height`,
 * bottom → top, with the same clipping `renderBrushFrame.ts` applies:
 * rows to `min(height, pixels.length)`, columns to `min(width, row.length)`.
 * A missing row and a `0` / `undefined` cell are skipped. Shared by the
 * footprint and the stamp so the two walk exactly the same cells.
 */
function forEachPaintedCell(
  layers: ReadonlyArray<PixelBrushSourceLayer>,
  width: number,
  height: number,
  visit: (
    x: number,
    y: number,
    layer: PixelBrushSourceLayer,
    delta: BrushDelta,
  ) => void,
): void {
  for (const layer of layers) {
    if (!layer.visible) continue;
    const { pixels } = layer;
    const rows = Math.min(height, pixels.length);
    for (let y = 0; y < rows; y++) {
      const row = pixels[y];
      if (!row) continue;
      const cols = Math.min(width, row.length);
      for (let x = 0; x < cols; x++) {
        const cell = row[x];
        if (cell === 0 || cell === undefined) continue;
        visit(x, y, layer, cell);
      }
    }
  }
}

/**
 * The union of painted cells across VISIBLE layers (MASTER D3), as offsets
 * from the origin, emitted once per cell in row-major order.
 *
 * "Painted" is `cell !== 0` — the footprint is the set of cells the brush
 * studio considers painted, not the set that looks non-empty. So a cell whose
 * deltas are all zero, a cell whose A delta is −255, and a cell on a `normal`
 * or `heightmap` layer all count; a cell on a hidden layer never does.
 */
export function pixelBrushFootprint(
  layers: ReadonlyArray<BrushSceneLayer>,
  width: number,
  height: number,
): PixelBrushFootprint {
  const w = Math.max(0, Math.floor(width)) || 0;
  const h = Math.max(0, Math.floor(height)) || 0;
  const { originX, originY } = pixelBrushOrigin(w, h);
  const mark = new Uint8Array(w * h);

  forEachPaintedCell(layers, w, h, (x, y) => {
    mark[y * w + x] = 1;
  });

  const offsets: PixelBrushOffset[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mark[y * w + x]) offsets.push({ dx: x - originX, dy: y - originY });
    }
  }
  return { width: w, height: h, originX, originY, offsets };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function toByte(v: number): number {
  return clamp(Math.round(v), 0, 255);
}

interface HslTriple {
  h: number;
  s: number;
  l: number;
}

/**
 * Apply one position's visible-layer deltas, bottom → top, to `base`
 * (MASTER D5, verbatim).
 *
 * Working state is `{ r, g, b, a }` as floats plus an optional HSL triple.
 * `rgb` layers work in RGB space (converting back first if an `hsl` layer left
 * us in HSL space, remembering the triple as `prevHsl`); `hsl` layers work in
 * HSL space (converting in with the `prevHsl` carry if not already there).
 * Consecutive `hsl` layers do not round-trip. `normal` / `heightmap` layers
 * change nothing. Every channel is rounded and clamped to 0..255 at the end.
 *
 * Always returns a NEW object — with no deltas, a copy of `base`.
 */
export function settlePixelBrushColor(
  base: StampColor,
  deltas: ReadonlyArray<PixelBrushLayerDelta>,
): StampColor {
  let r = base.r;
  let g = base.g;
  let b = base.b;
  let a = base.a;
  let hsl: HslTriple | null = null;
  let prevHsl: HslTriple | undefined;

  for (const { channelType, delta: d } of deltas) {
    switch (channelType) {
      case "rgb": {
        if (hsl) {
          ({ r, g, b } = hslToRgb(hsl.h, hsl.s, hsl.l));
          prevHsl = hsl;
          hsl = null;
        }
        r = clamp(r + d[0], 0, 255);
        g = clamp(g + d[1], 0, 255);
        b = clamp(b + d[2], 0, 255);
        a = clamp(a + d[3], 0, 255);
        break;
      }
      case "hsl": {
        if (!hsl) {
          hsl = rgbToHsl(Math.round(r), Math.round(g), Math.round(b), prevHsl);
        }
        hsl = {
          h: (((hsl.h + d[0] * PIXEL_BRUSH_HUE_PER_DELTA) % 360) + 360) % 360,
          s: clamp(hsl.s + d[1] * PIXEL_BRUSH_PERCENT_PER_DELTA, 0, 100),
          l: clamp(hsl.l + d[2] * PIXEL_BRUSH_PERCENT_PER_DELTA, 0, 100),
        };
        a = clamp(a + d[3], 0, 255);
        break;
      }
      case "normal":
      case "heightmap":
        // Lighting-data layers have no meaning against an RGBA base — they
        // shape the footprint but not the colour. Open item (MASTER §1).
        break;
    }
  }

  if (hsl) {
    ({ r, g, b } = hslToRgb(hsl.h, hsl.s, hsl.l));
  }

  return { r: toByte(r), g: toByte(g), b: toByte(b), a: toByte(a) };
}

/**
 * The footprint with a settled colour per cell for `base` (MASTER D6). One
 * pass over the grid with the footprint's loops and clipping; each painted
 * cell collects the visible layers' deltas bottom → top and settles once.
 * Every cell owns its own colour object — no two cells share one.
 *
 * For the same layers, `cells.map(({ dx, dy }) => ({ dx, dy }))` equals
 * `pixelBrushFootprint(...).offsets` — the footprint ignores colour sources.
 *
 * The cell's seed is the `colorSource` of the FIRST (bottom-most) layer that
 * contributes to it. A `"target"` seed adds `targetDeltas` (the same list the
 * fallback `color` was settled from); a `"selected"` seed emits exactly the
 * cell it always did, with no extra key.
 */
export function resolvePixelBrushStamp(
  layers: ReadonlyArray<PixelBrushSourceLayer>,
  width: number,
  height: number,
  base: StampColor,
): PixelBrushStamp {
  const w = Math.max(0, Math.floor(width)) || 0;
  const h = Math.max(0, Math.floor(height)) || 0;
  const { originX, originY } = pixelBrushOrigin(w, h);

  // Deltas per cell, keyed row-major; a key is present only for painted cells.
  const perCell: Array<PixelBrushLayerDelta[] | undefined> = new Array<
    PixelBrushLayerDelta[] | undefined
  >(w * h);
  // The seed per cell, recorded on the FIRST contribution only.
  const seed: Array<BrushColorSource | undefined> = new Array<
    BrushColorSource | undefined
  >(w * h);

  forEachPaintedCell(layers, w, h, (x, y, layer, delta) => {
    const key = y * w + x;
    let list = perCell[key];
    if (!list) {
      list = perCell[key] = [];
      seed[key] = brushLayerColorSource(layer);
    }
    list.push({ channelType: layer.channelType, delta });
  });

  const cells: PixelBrushCell[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const key = y * w + x;
      const deltas = perCell[key];
      if (!deltas) continue;
      const cell: PixelBrushCell = {
        dx: x - originX,
        dy: y - originY,
        color: settlePixelBrushColor(base, deltas),
      };
      if (seed[key] === "target") cell.targetDeltas = deltas;
      cells.push(cell);
    }
  }
  return { width: w, height: h, originX, originY, cells };
}

/**
 * The writes a drag segment produces (MASTER D7): rasterise `prev → next`
 * with the injected `line` (`[next]` when `prev` is `null` or equal to
 * `next`, exactly as `stampSegment`), stamp every cell at every step, drop
 * out-of-bounds cells, last write wins per cell.
 *
 * Target-seeded cells (`cell.targetDeltas` present) with a `target` supplied
 * are settled here, against `target.sample(x, y)`, **at most once per stroke
 * per cell** (`target.touched`); an empty pixel (`null`) writes nothing. A
 * selected-seeded write to the same key later in the segment still wins —
 * the `Map` semantics are unchanged. Without a `target`, or for a cell with
 * no `targetDeltas`, the pre-settled `cell.color` is written as before.
 *
 * Writes share their stamp cell's colour object — a write is consumed
 * immediately by `setPixels`, so this is safe; the discipline that matters
 * (no two STAMP cells sharing a colour) is `resolvePixelBrushStamp`'s.
 * A target write owns a fresh object from `settlePixelBrushColor`.
 */
export function stampPixelBrushSegment(
  prev: StampPoint | null,
  next: StampPoint,
  line: LineFn,
  stamp: PixelBrushStamp,
  bounds: StampBounds,
  target?: PixelBrushTarget | null,
): PixelBrushWrite[] {
  const moved = prev !== null && (prev.x !== next.x || prev.y !== next.y);
  const segment = moved ? line(prev, next) : [next];
  const { gridWidth } = bounds;
  const map = new Map<number, PixelBrushWrite>();

  for (const step of segment) {
    for (const cell of stamp.cells) {
      const x = step.x + cell.dx;
      const y = step.y + cell.dy;
      if (!inBounds({ x, y }, bounds)) continue;
      // In-bounds, so `y * gridWidth + x` is a unique non-negative key.
      const key = y * gridWidth + x;
      let color = cell.color;
      if (cell.targetDeltas && target) {
        if (target.touched.has(key)) continue;
        const px = target.sample(x, y);
        if (px === null) continue;
        target.touched.add(key);
        color = settlePixelBrushColor(px, cell.targetDeltas);
      }
      // `Map.set` on an existing key keeps its insertion position, so the
      // output stays in first-touched order while the colour is the last.
      map.set(key, { x, y, color });
    }
  }

  return [...map.values()];
}
