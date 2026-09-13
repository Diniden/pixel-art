# 05 — `pixelBrushStamp.ts`: target-seeded cells, settled at write time

**Wave:** W2 · **Depends on:** 01
**Touches:** `client/src/ui/canvas/tools/pixelBrushStamp.ts` · `client/src/ui/canvas/tools/__tests__/pixelBrushStamp.test.ts`
**Effort:** M

## Objective
The pure stamp module understands `colorSource`. A cell whose **bottom-most visible painted
layer** is `"target"`-sourced is settled against the canvas pixel under it at write time,
through an injected sampler, once per stroke; every other cell keeps today's pre-settled
colour. No consumer passes a sampler yet (task 06), and without one behaviour is unchanged.

## Context
- Module: `client/src/ui/canvas/tools/pixelBrushStamp.ts` (350 lines; header `:1-58`).
  `PixelBrushCell { dx, dy, color }` `:87-89`; `forEachPaintedCell` `:131-157` walks visible
  layers bottom → top; `settlePixelBrushColor(base, deltas)` `:218-268`;
  `resolvePixelBrushStamp` `:279-313` collects `perCell` deltas then settles once;
  `stampPixelBrushSegment(prev, next, line, stamp, bounds)` `:325-350` dedupes per segment
  with key `y * gridWidth + x`, last write wins.
- `BrushSceneLayer` (`ui/canvas/render/renderBrushFrame.ts:56-61`) is structural
  `{ pixels, channelType, visible }`. Real `BrushLayer` objects are what the container passes,
  so declare here `export interface PixelBrushSourceLayer extends BrushSceneLayer { colorSource?: BrushColorSource }`
  and accept `ReadonlyArray<PixelBrushSourceLayer>` (a `BrushSceneLayer` without the key is
  still assignable). Do **not** edit `renderBrushFrame.ts`.
- Sampler precedent: `ui/canvas/tools/traceSampler.ts:54` `TraceSamplerFn = (x, y) => … | null | 0`
  — the grid never crosses into `ui/` (R2); the container binds a closure.
- Existing tests: `__tests__/pixelBrushStamp.test.ts` — fixtures `:28-63` (`grid`, `layer`,
  `paint`, `d`, colours), invariant `offsetsOf(stamp) == footprint.offsets` `:276-277` of the
  module. Hand-computed expectations with the arithmetic shown inline (header `:1-11`).
- `toolHandlers.test.ts` and `pixelBrushTool.dom.test.tsx` build `PixelBrushStamp` literals
  `{ dx, dy, color }` — the cell shape must stay **backwards compatible** (MASTER D4).

## Steps
1. Types:
   ```ts
   export type PixelBrushTargetSampler = (x: number, y: number) => StampColor | null;
   export interface PixelBrushTarget {
     /** The canvas pixel at grid (x, y), or `null` when the cell is empty. Bound by the container. */
     sample: PixelBrushTargetSampler;
     /** Cells (keyed `y * gridWidth + x`) already settled in THIS stroke. Cleared by the handler on press. */
     touched: Set<number>;
   }
   export interface PixelBrushCell extends PixelBrushOffset {
     /** Settled from the selected colour. For a target-seeded cell this is the FALLBACK used when no sampler is supplied. */
     color: StampColor;
     /** Present ⇒ target-seeded: the visible-layer deltas, bottom → top, to apply to the canvas pixel. */
     targetDeltas?: ReadonlyArray<PixelBrushLayerDelta>;
   }
   ```
2. `resolvePixelBrushStamp`: while collecting `perCell`, also record the seed of the **first**
   (bottom-most) contributing layer per cell via `brushLayerColorSource(layer)`
   (import from `@/types/brush`). When the seed is `"target"`, emit
   `{ dx, dy, color: settle(base, deltas), targetDeltas: deltas }`; otherwise exactly today's
   cell. `pixelBrushFootprint` is unchanged (footprint ignores sources).
3. `stampPixelBrushSegment(prev, next, line, stamp, bounds, target?: PixelBrushTarget | null)`:
   for a cell without `targetDeltas`, or when `target` is absent — today's path. For a
   target cell with a sampler: `key = y * gridWidth + x`; if `target.touched.has(key)` skip;
   `const px = target.sample(x, y)`; if `px === null` skip (nothing to burn/fade — MASTER D5);
   else `touched.add(key)` and write `settlePixelBrushColor(px, cell.targetDeltas)`. A later
   selected-seeded write to the same key in the same segment still wins (Map semantics
   unchanged). Document the per-stroke rule in the header: **a target cell is settled at most
   once per stroke from its pre-stroke pixel**, so a drag that crosses a cell twice does not
   compound the burn.
4. Tests (hand-computed, arithmetic inline):
   - a `"target"` rgb layer with `[-50,-50,-50,0]` over a `"selected"` layer at a different
     cell: the stamp has one cell with `targetDeltas` and one without; `offsetsOf` still
     equals the footprint.
   - seed rule: target layer **below** a selected layer at the same cell → target-seeded with
     both deltas in order; selected below target → selected-seeded, no `targetDeltas`.
   - segment with a sampler returning `(200,100,50,255)` → written `(150,50,0,255)`; sampler
     returning `null` → no write for that cell; a second call in the same stroke (same
     `touched` set) → no write; after `touched.clear()` → writes again; `target` omitted →
     the fallback `color` is written (today's behaviour, pinned).
   - hidden `"target"` layers are ignored; `normal`/`heightmap` target layers seed but do
     not change colour.
   - the existing suite passes untouched.
5. Commit: `brush-source(05): target-seeded stamp cells settled through an injected sampler`.

## Constraints
- Pure: no React, MobX, DOM, store. No import of `toolHandlers.ts`. Keep `brushCellToRgba`
  out (display-only). `max-lines` error at 400 code lines under `src/ui/**` — the file is
  350 raw lines with a large header; if code lines exceed 400 after the change, move
  `settlePixelBrushColor` and its constants to `pixelBrushSettle.ts` (same folder), re-export
  them from `pixelBrushStamp.ts`, and list the new file in your report.

## Verification
```sh
cd client && bunx tsc --noEmit && bunx eslint src/ui/canvas/tools && bunx vitest run src/ui/canvas/tools
```
Expected: green; the test file's new describe blocks show the inline arithmetic.

## Definition of done
- [ ] `PixelBrushTarget`, `PixelBrushTargetSampler`, `PixelBrushSourceLayer` exported; `PixelBrushCell.targetDeltas?` optional.
- [ ] Seed = bottom-most visible painted layer's source; target cells settle per stroke, once, from the sampled pixel; empty pixel → no write.
- [ ] Without a sampler the output is byte-identical to before (pinned by test).
