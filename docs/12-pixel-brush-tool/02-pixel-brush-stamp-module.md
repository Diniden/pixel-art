# 02 — `pixelBrushStamp.ts`: footprint, colour settling, stamp resolution, segment stamping

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/canvas/tools/pixelBrushStamp.ts` (new) · `client/src/ui/canvas/tools/__tests__/pixelBrushStamp.test.ts` (new)
**Effort:** M

## Objective
A pure, store-free module under `ui/canvas/tools/` computes everything the brush tool needs from a
brush document's frame and a base colour: the **footprint** (which cells the brush covers and where
they sit relative to the cursor), the **settled colour** of one cell (base colour + every visible
layer's delta, RGB in RGB space, HSL in HSL space), the **stamp** (footprint + one settled colour per
cell), and the **writes** a drag segment produces. Every function is unit-tested against
hand-computed vectors. Nothing consumes it yet (task 05).

## Context
- Types to read: `client/src/types/brush.ts` — `BrushChannelType` `:20`, `BrushDelta` `:42`, `BrushCell` `:44`
  (`0` = unpainted), `BrushLayer` `:49-56` (`pixels[y][x]`, `visible`, `channelType`). **`brushCellToRgba` /
  `deltaToByte` (`:80-123`) are display-only** — they halve resolution and centre on 127. Read `cell[i]` raw.
  `ui/` may import from `types/brush` (precedent: `client/src/ui/canvas/render/renderBrushFrame.ts`).
- Layer order and clipping to copy: `renderBrushFrame.ts:66` (array order = bottom → top; hidden skipped),
  `:99` `rows = Math.min(height, buffer.height, pixels.length)`, `:105` `cols = Math.min(width, stride, row.length)`.
  Structural layer type to accept: `BrushSceneLayer { pixels: ReadonlyArray<ReadonlyArray<BrushCell>>; channelType; visible }`
  (`renderBrushFrame.ts:56-61`) — import the type from there so a real `BrushLayer` and the brush studio's
  scene layers are both accepted.
- HSL converters (the only ones allowed): `client/src/ui/utils/colorMath.ts` — `hslToRgb(h, s, l)` `:21`
  (h 0..360, s/l 0..100 → `{r,g,b}` bytes) and `rgbToHsl(r, g, b, prevHsl?)` `:60` (returns **rounded**
  h 0..360, s/l 0..100; `prevHsl` keeps H and S when L rounds to 0 or 100 — header `:8-14` explains why
  it is load-bearing).
- Geometry vocabulary to reuse (types only): `client/src/ui/canvas/tools/brushStamp.ts` — `StampPoint` `:47`,
  `StampBounds` `:52`, `StampColor` `:62`, `LineFn` `:84`, `inBounds` `:110`. `stampSegment` `:156-181` is the
  model for segment stamping (`prev === null` → `[next]`; dedupe key `p.y * gridWidth + p.x`).
- Do NOT import `toolHandlers.ts` (it will import this module in task 05 — avoid the cycle). Declare a
  structural `PixelBrushWrite { x; y; color: StampColor }`, assignable to `ToolPixelWrite`.
- Test rig to imitate: `client/src/ui/canvas/tools/__tests__/brushStamp.test.ts` (plain vitest, no DOM).
- Naming: MASTER D2 — everything `PixelBrush*` / `pixelBrush*`. Never `BrushShape*`, `stampAt`, `brushStamp`.

## Steps
1. Create `pixelBrushStamp.ts` with a header explaining the four responsibilities, the display-vs-operator
   distinction (`brushCellToRgba` is never used here), and the HSL scale constants. Export:
   ```ts
   export const PIXEL_BRUSH_HUE_PER_DELTA = 360 / 255;      // H ±255 ↔ ±360°
   export const PIXEL_BRUSH_PERCENT_PER_DELTA = 100 / 255;  // S, L ±255 ↔ ±100 %
   export interface PixelBrushOffset { dx: number; dy: number }
   export interface PixelBrushFootprint { width: number; height: number; originX: number; originY: number; offsets: ReadonlyArray<PixelBrushOffset> }
   export interface PixelBrushCell extends PixelBrushOffset { color: StampColor }
   export interface PixelBrushStamp { width: number; height: number; originX: number; originY: number; cells: ReadonlyArray<PixelBrushCell> }
   export interface PixelBrushLayerDelta { channelType: BrushChannelType; delta: BrushDelta }
   export interface PixelBrushWrite { x: number; y: number; color: StampColor }
   export function pixelBrushOrigin(width: number, height: number): { originX: number; originY: number }   // floor(w/2), floor(h/2)
   export function pixelBrushFootprint(layers: ReadonlyArray<BrushSceneLayer>, width: number, height: number): PixelBrushFootprint
   export function settlePixelBrushColor(base: StampColor, deltas: ReadonlyArray<PixelBrushLayerDelta>): StampColor
   export function resolvePixelBrushStamp(layers: ReadonlyArray<BrushSceneLayer>, width: number, height: number, base: StampColor): PixelBrushStamp
   export function stampPixelBrushSegment(prev: StampPoint | null, next: StampPoint, line: LineFn, stamp: PixelBrushStamp, bounds: StampBounds): PixelBrushWrite[]
   ```
2. `pixelBrushFootprint` (MASTER D3): iterate `y` in `0..min(height, layer.pixels.length)`, `x` in
   `0..min(width, row.length)` for each **visible** layer; a cell is painted when `cell !== 0 && cell !== undefined`;
   the union is emitted row-major once per cell (use a `Uint8Array(width*height)` mark). Zero-delta cells and
   A = −255 cells count. `normal`/`heightmap` layers count. Hidden layers never count.
3. `settlePixelBrushColor` (MASTER D5, verbatim): working `{ r, g, b, a }` as floats seeded from `base`, plus
   `hsl: { h, s, l } | null = null` and `prevHsl: { h, s, l } | undefined`. For each delta in order:
   - `rgb`: if `hsl` is set → `{ r, g, b } = hslToRgb(hsl.h, hsl.s, hsl.l)`, `prevHsl = hsl`, `hsl = null`.
     Then `r = clamp(r + d[0], 0, 255)` etc., `a = clamp(a + d[3], 0, 255)`.
   - `hsl`: if `hsl` is null → `hsl = rgbToHsl(Math.round(r), Math.round(g), Math.round(b), prevHsl)`.
     `h = ((h + d[0] * PIXEL_BRUSH_HUE_PER_DELTA) % 360 + 360) % 360`; `s = clamp(s + d[1] * PIXEL_BRUSH_PERCENT_PER_DELTA, 0, 100)`;
     `l = clamp(l + d[2] * …, 0, 100)`; `a = clamp(a + d[3], 0, 255)`.
   - `normal` / `heightmap`: no change (comment: lighting-data layers have no meaning against an RGBA base — open item).
   At the end convert back if `hsl` is set; return `{ r, g, b, a }` each `Math.round`ed and clamped to 0..255.
   Empty `deltas` returns a **copy** of `base` (never the same object).
4. `resolvePixelBrushStamp`: one pass over the grid (same loops and clipping as step 2); for each painted
   cell collect the visible layers' non-zero deltas bottom→top and call `settlePixelBrushColor`. Each cell
   owns its own colour object. `width/height/originX/originY` as in the footprint. A stamp resolved from a
   footprint-equal frame has `cells.map(({dx,dy}) => …)` equal to `footprint.offsets`.
5. `stampPixelBrushSegment` (MASTER D7): `segment = prev && (prev.x !== next.x || prev.y !== next.y) ? line(prev, next) : [next]`;
   for each step, for each stamp cell: `x = step.x + dx`, `y = step.y + dy`; skip unless `inBounds`; `map.set(y * gridWidth + x, { x, y, color: cell.color })`
   (last write wins); return `[...map.values()]`.
6. Tests (`__tests__/pixelBrushStamp.test.ts`), at minimum:
   - `pixelBrushOrigin`: 16×16 → (8,8); 3×3 → (1,1); 1×1 → (0,0).
   - Footprint: 3×3 doc, layer A (rgb, visible) painted at (0,0); layer B (rgb, **hidden**) painted at (2,2);
     layer C (`normal`, visible) painted at (1,1); a zero-delta cell `[0,0,0,0]` at (2,0) on A; an A = −255 cell
     at (0,2) on A → offsets exactly `[(-1,-1), (1,-1), (0,0), (-1,1)]` in row-major order. A layer whose grid is
     shorter than the document is clipped without throwing; a grid wider than the document is clipped to `width`.
   - Settle, RGB: base (100,100,100,255) + rgb [10,−20,30,0] → (110,80,130,255); clamp: (250,0,0,255) + [10,−10,0,0] → (255,0,0,255);
     alpha: base a 255 + [0,0,0,−255] → a 0; two rgb layers add cumulatively.
   - Settle, HSL: pure red (255,0,0,255) + hsl [85,0,0,0] (≈ +120°) → within ±2 per channel of (0,255,0);
     red + [0,−255,0,0] → grey (r = g = b within ±1 of 128); black + [0,0,127.5→ use 128,0] → grey ≈ (128,128,128);
     the `prevHsl` carry: black base, hsl layer 1 = [85,255,0,0] (hue + saturation only — black stays black),
     hsl layer 2 = [0,0,128,0] → result is a **coloured** pixel (not grey), proving H/S survived the L = 0 singularity.
   - Settle, mixed order: rgb then hsl then rgb applies sequentially (assert against a hand computation you
     show in the test); `normal` and `heightmap` deltas change nothing; empty deltas returns an equal but
     non-identical object.
   - Stamp: colours per cell differ when layers differ; no two cells share a colour object; `cells` offsets equal
     the footprint's offsets for the same layers.
   - Segment: stamp with cells (0,0)→X and (1,0)→Y; `prev = null`, `next = (5,5)`, 10×10 grid → `[(5,5,X),(6,5,Y)]`;
     `prev = (0,0)`, `next = (2,0)` with a stub `line` returning `[(0,0),(1,0),(2,0)]` → cells (0,0)=X, (1,0)=X, (2,0)=X, (3,0)=Y
     (last write wins); a cell landing off-grid is dropped; `prev === next` stamps once.
7. Commit: `pixel-brush(02): pixelBrushStamp — footprint, HSL/RGB delta settling, stamp, segment writes`.

## Constraints
- Pure: no React, no MobX, no store, no `containers/`, no `components/`, no `toolHandlers.ts` import.
- No `brushCellToRgba` / `deltaToByte` anywhere in this module.
- Do not edit `colorMath.ts`, `brushStamp.ts`, `renderBrushFrame.ts`, `types/brush.ts`.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/ui/canvas/tools
cd client && bunx vitest run src/ui/canvas/tools
cd client && bun run lint:boundaries
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
No manual checks (pure module).

## Definition of done
- [ ] Module exports exactly the API above; header documents the scale constants and the display-vs-operator rule.
- [ ] Every test vector in step 6 present and green; boundaries OK; one commit with only the two new files.
