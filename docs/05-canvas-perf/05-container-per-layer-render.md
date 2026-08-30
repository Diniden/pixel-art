# 05 — CanvasContainer: per-layer rendering

**Wave:** W4 · **Depends on:** 04
**Touches:** `client/src/containers/CanvasContainer.tsx` · `client/src/ui/canvas/render/renderLayerView.ts` · `client/src/ui/canvas/render/renderScene.ts` (deleted) · `client/src/ui/canvas/render/__tests__/renderScene.test.ts` (deleted) · `client/src/ui/theme/canvasTokens.ts` · `client/src/containers/__tests__/CanvasContainer.dom.test.tsx` (new)
**Effort:** L

## Objective

The ~1000-line monolithic `render` is replaced by a per-layer painter: each layer's own 1:1
canvas is painted with only that layer's cells, and cross-layer dimming becomes the CSS
opacity task 04 wired. Compositing moves from JS to the browser. This is where the
"every pixel of every layer on every edit" loop finally dies.

## Context

### What `render` does today

`CanvasContainer.tsx:882` — a `useCallback` running to roughly line 1300, driven by
`useCanvasRender(render, [render, pixelVersion])` at `:1888`. It has three branches:

1. **Layer mode** (`:908-938`) — delegates to `drawLayerView`, plus preview pixels and grid.
2. **Variant-edit** (`:939-1100`) — the intricate one: per-layer loops with
   `layerFocusMode` dimming, `isOutlineCell` onion tests, variant offsets, view clipping,
   grid lines, object bounds, the variant rectangle.
3. **Normal** (`:1101-1300`) — every visible layer composited, then selection chrome.

All three build an `rgba(...)` **string per cell** and call `fillRect`. On Landscapes that
is 57,344 string allocations per repaint, per edit.

### The target shape

One function that paints **one layer into its own canvas**:

```ts
function paintLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  opts: { cellWidth; cellHeight; offsetX; offsetY; onionOutline: boolean; ... },
): void
```

At 1:1 a cell is `fillRect(x, y, 1, 1)`. Better: build an `ImageData` and `putImageData`
once per layer — one call instead of N, and no string building. Either is acceptable;
**measure and say which you chose and why**.

The container then:
- passes `layerIds` (bottom→top) and `layerOpacity` to `CanvasSurface`
- keeps a `Map<string, HTMLCanvasElement>` fed by `registerLayerCanvas`
- on invalidation, paints each layer into its own canvas
- draws chrome (selection fills, previews) on the shared overlay canvases as before

### Dimming: JS → CSS (D4)

Today, per cell:

```ts
const alpha = isCurrentLayer || layerFocusMode === "normal" ? pixel.a / 255 : (pixel.a / 255) * 0.7;
ctx.fillStyle = `rgba(${pixel.r}, ${pixel.g}, ${pixel.b}, ${alpha})`;
```

Now: paint the layer at full alpha and pass the multiplier as `layerOpacity[layer.id]`.
Rules, preserved verbatim from `renderScene.ts:76-80` and `CanvasContainer.tsx:999-1047`:

| Layer, in variant-edit | Opacity |
| --- | --- |
| Regular layer, `layerFocusMode === "normal"` | 1.0 |
| Regular layer, otherwise | **0.5** (`VARIANT_EDIT_REGULAR_DIM`) |
| Variant layer being edited | 1.0 |
| Variant layer, other, `normal` | 1.0 |
| Variant layer, other, otherwise | **0.7** (`VARIANT_EDIT_OTHER_DIM`) |

Move both constants to `ui/theme/canvasTokens.ts` before deleting `renderScene.ts` (D10).

⚠️ **`onion` is NOT an opacity.** It is outline-only rendering via `isOutlineCell`
(`CanvasContainer.tsx:278-291`), a 4-neighbour test. It stays a paint-time decision inside
`paintLayer`. Passing it as opacity would render solid silhouettes.

### ⚠️ Alpha compositing changes here — this is Risk R4

Today one canvas composites layers in JS with an explicit alpha multiply. Now the browser
composites N canvases via CSS `opacity` and `source-over`. **These are not identical for
semi-transparent pixels.** The owner accepted this ("I don't really care about the gradient
per pixel effect") — in principle, not sight-unseen. **The visual pass below is the gate for
this wave.** If something looks wrong, report it with a screenshot rather than inventing a
correction.

Note the ordering difference: CSS `opacity` applies to the **composited layer as a whole**,
where the old code multiplied **per cell before compositing**. For a single layer these agree;
for overlapping semi-transparent cells *within* one layer they can differ. Watch for it.

### Delete `renderScene.ts` (D10)

It is dead code. `CanvasContainer.tsx:874-881` records that task 30 extracted and hash-tested
it but deliberately never adopted it, because its buffer-compositing alpha differs visibly
from the live `fillRect` path. Its model — composite everything into one buffer — is the
opposite of this plan's direction. Delete it and its test after moving the two constants.

`drawLayerView` (`renderLayerView.ts`) is the opposite case: it is live, already per-layer
shaped, and safe at 1:1. **Adapt it into the per-layer painter** rather than writing a new
one. Its header explicitly notes it deliberately does *not* use `renderScene`'s compositor
because the two panes must agree on what a half-transparent pixel looks like — that reasoning
now applies across the whole app.

### What must not change

- **`pixelVersion` stays the invalidation signal** in this task. Task 07 adds the dirty
  region. Do not consume `pixelDirty` here — one change at a time.
- **`useCanvasRender`** (`ui/hooks/useCanvasRender.ts`) stays as-is: rAF coalescing, the
  render-through-a-ref, StrictMode cleanup. Do not restructure it.
- **`layer.pixels` stays `observable.ref`.** Read it in the imperative painter; never
  `observer()` over it, never deep-observe.
- **`coords.ts`** — untouched.
- The `editingVariant` view-union behaviour from task 02.
- **Split-canvas render modes** (`renderMode: "full" | "layer"`, plan 02) must keep working.
  Both panes share `zoom`, each has its own camera. Test both, and both open at once.

## Steps

1. Move `VARIANT_EDIT_REGULAR_DIM` and `VARIANT_EDIT_OTHER_DIM` to `ui/theme/canvasTokens.ts`.
   ⚠️ It has a parity test against `tokens.css` (`ui/theme/__tests__/canvasTokens.test.ts`) —
   these are canvas-only values, so add them to the **canvas-only** section, not `CSS_MIRROR`.
2. Generalise `renderLayerView.ts` into the per-layer painter: onion-outline support, an
   offset for variant placement, and the `ImageData` path if you take it. Keep it pure and
   keep its existing tests passing.
3. Delete `renderScene.ts` and its test.
4. Commit after step 3.
5. Rework `CanvasContainer`: maintain the layer-canvas `Map`, compute `layerIds` and
   `layerOpacity`, replace the three branches of `render` with a per-layer loop, keep chrome
   on the shared overlays. Preserve every behaviour of all three branches — variant offsets,
   view clipping, move-tool preview, preview pixels, object bounds, the variant rectangle.
6. Create `containers/__tests__/CanvasContainer.dom.test.tsx` — **there is no test file for
   this container today**; the folder holds only `frameThumbnailMemo`, `layoutsGate2Probe`
   and `syncNoFlash`. Copy the harness setup from one of those. Cover: N layers produce N
   registered canvases; each layer's cells land on its own canvas; `layerOpacity` matches
   the table above for all three focus modes.
7. Run the gate. Commit.

## Constraints

- **Do not consume `pixelDirty`** — task 07.
- **Do not modify `useCanvasRender`, `coords.ts`, or `CanvasSurface`** (task 04 finished it).
- **Do not change `PixelStore` or any domain store.**
- `observer()` stays in the container only; nothing under `ui/` gains a store import.
- Do not deep-observe `layer.pixels`.
- Do not delete `drawLayerView` — adapt it.
- Preserve both split-canvas render modes.
- Do not touch `LightingCanvasContainer` (task 08).

## Verification

```sh
bun run --cwd client typecheck
cd client && bunx vitest run
bun run --cwd client lint
bun run --cwd client lint:boundaries
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # must print nothing
```

All exit 0, corpus snapshots unchanged. Paste real output.

**Manual checks — this wave's gate is visual (R4). Do every one.** `bun run dev`.

1. **Base Unit, normal mode.** All 7 layers composite correctly, right order, right colours.
2. **Toggle layer visibility** — the right layer hides; others unaffected.
3. **Draw on a middle layer** — the stroke appears on that layer, correctly occluded by
   layers above.
4. **Variant-edit, all three `layerFocusMode` values:**
   - `normal` — nothing dimmed
   - `transparent` — regular layers at 0.5, other variants at 0.7, edited layer at full
   - `onion` — non-edited layers render as outlines only, **not** solid silhouettes
5. **R4 side-by-side.** Pick a sprite with semi-transparent pixels. Screenshot before
   (`git stash`) and after. Compare. **Report the difference honestly, with the screenshot,
   even if you judge it acceptable.** This is the owner's sign-off evidence.
6. **Variant offsets** — a variant with a non-zero offset draws in the right place; the
   object-bounds dashes and variant rectangle are correct.
7. **Move tool** — dragging pixels previews correctly; cells leaving the grid are dropped.
8. **Split canvas** — open both Full and Layer panes; edit in one, see it in the other; both
   cameras independent; swap and close work.
9. **Undo/redo** — a stroke undoes completely, with no stale pixels.
10. **Landscapes** — draw. Note whether it is visibly faster than before (task 07 is the big
    win, but full-repaint cost should already drop).

## Definition of done

- [ ] Each layer painted into its own 1:1 canvas.
- [ ] Dimming is CSS opacity; constants moved to `canvasTokens.ts` (canvas-only section).
- [ ] `onion` still a paint-time outline decision, not an opacity.
- [ ] `renderScene.ts` and its test deleted; constants preserved first.
- [ ] `drawLayerView` adapted, not replaced; its tests still pass.
- [ ] `pixelVersion` still the invalidation signal; `pixelDirty` untouched.
- [ ] `useCanvasRender`, `coords.ts`, `CanvasSurface` and all domain stores unmodified.
- [ ] Both split-canvas render modes work.
- [ ] All four gate commands exit 0; corpus snapshots unchanged; output pasted.
- [ ] All ten manual checks done and reported individually.
- [ ] **R4 visual comparison reported with a screenshot**, whatever the finding.
- [ ] Chosen painting strategy (`fillRect` vs `putImageData`) stated with reasoning.
- [ ] No lockfile.
- [ ] Two commits (step 4, step 7).
