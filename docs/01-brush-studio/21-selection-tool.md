# 21 — Selection tool on the brush canvas

**Wave:** W9 · **Depends on:** 20
**Touches:** `client/src/containers/BrushCanvasContainer.tsx` · `client/src/containers/brush/brushToolContext.ts` · `client/src/containers/brush/brushSelection.ts` (new) · `client/src/containers/brush/__tests__/brushSelection.test.ts` (new) · `client/src/containers/brush/__tests__/brushToolContext.test.ts`
**Effort:** M

## Objective
The selection tool works on brush layers: rectangle (and lasso, if the shared selection model
supports it without pixel-project coupling) creates a mask sized to the brush grid; the mask is
drawn on the overlay canvas with marching ants; paint tools respect it via `BrushWriteOptions.mask`;
Delete/Backspace clears selected cells; dragging inside the selection moves only those cells.

## Context — investigate first, then decide
- `stores/ui/SelectionUIStore.ts` (500 lines) holds the pixel studio's mask (`selection`
  `observable.ref`, a raw `Set` of packed `y*width+x`), `writeOptions`/`maskWriteOptions`
  (bridges into `PixelWriteOptions`), flood/lasso/colour selection helpers. Its dimensions
  come from `ApplicationStore.selectionDims` (`:1130`, `?? {32,32}` floor) — i.e. **the project
  grid**. Read the store fully and answer in your report: can it be driven with brush
  dimensions without touching project state? If **yes** (e.g. its helpers take `width/height`
  as arguments), reuse those pure helpers only — never its observable state. If **no**, implement a
  minimal brush-local selection in `brushSelection.ts` (rectangle only) and say lasso is deferred.
- Overlay drawing: `ui/canvas/render/renderSelectionOverlay.ts` (mask fill, marching ants,
  `MASK_FILL_LIMIT :50`) is pure — reuse it on `overlayCanvasRef`.
- Masked writes: `BrushPixelStore.setCells(writes, { mask, maskSize })` (task 09); selection
  move: `moveLayerCells` currently moves the whole layer — add nothing to the store; instead
  compute the moved cells in the container as explicit writes (clear old cells, write new) in one
  transaction. Keep the selection mask in `brushUI`? — **no** (`stores/ui/**` is out of Touches);
  hold it in container `useState` for v1 and document that it resets on brush switch.

## Steps
1. `brushSelection.ts`: `rectMask(x0,y0,x1,y1,width,height): Set<number>`, `shiftMask(mask, dx, dy, width, height)`,
   `maskToCells(mask, width)`; tests.
2. `brushToolContext.ts`: remove `selection` from `isBrushInertTool`; thread `mask`/`maskSize`
   into `setPixels` when a selection exists.
3. `BrushCanvasContainer.tsx`: selection gesture (down/move/up → rect), overlay render via
   `renderSelectionOverlay`, Escape clears, Delete/Backspace → `brushPixels.clearCells(maskToCells)`,
   drag inside mask → move selected cells (one transaction), selection resets when the
   document identity changes.
4. Commit: `brush-studio(21): selection tool on brush layers`.

## Constraints
- Do not edit stores or `ui/**`; do not touch `SelectionUIStore` observables from this container.
- Keep the container ≲ 500 lines after this task — extract to `containers/brush/` if needed.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/containers
cd client && bunx vitest run src/containers
cd client && bun run lint:boundaries
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Manual: draw a rect selection → ants render at the right zoom; pencil outside the selection does
nothing, inside paints; Delete clears; drag inside moves cells; Escape clears; switching brush
clears the selection; StrictMode does not double-apply the move.

## Definition of done
- [ ] Rectangle selection with masked writes, delete, move; lasso status stated explicitly.
- [ ] Report answers the `SelectionUIStore` reuse question with file/line evidence.
- [ ] Manual checks reported; gate green; one commit with only Touches files.
