# 20 — Flood-fill, eyedropper, move on the brush canvas

**Wave:** W8 · **Depends on:** 19
**Touches:** `client/src/containers/BrushCanvasContainer.tsx` · `client/src/containers/brush/brushToolContext.ts` · `client/src/containers/brush/brushFill.ts` (new) · `client/src/containers/brush/__tests__/brushFill.test.ts` (new) · `client/src/containers/brush/__tests__/brushToolContext.test.ts`
**Effort:** M

## Objective
Flood-fill (and gaussian-fill, treated identically) fills the contiguous region of cells equal
to the clicked cell with the current delta; eyedropper sets `brushUI.selectedDelta` from the
clicked cell (and switches the layer's channel semantics implicitly — the delta is just numbers);
move shifts the whole selected layer by the drag vector. These tools stop being inert.

## Context
- The pixel-studio implementations: `components/Canvas/drawingUtils.ts:279 floodFill`,
  `:380 gaussianFloodFill` — both compare `PixelData` colours. Do not adapt them; write a small
  4-connected flood fill over `BrushCell[][]` comparing cells by deep tuple equality
  (`0` vs `0` equal; tuple vs tuple by four numbers).
- Container seams from task 16: `buildBrushToolContext`'s `floodFillAt`/`gaussianFillAt`
  (return `ToolPixelWrite[]`; the handler passes them to `setPixels` — see
  `toolHandlers.ts:186-263` for how the flood handler commits immediately), `isBrushInertTool`.
- Eyedropper and move are **gesture tools** handled in the container before the handler table
  (`CanvasContainer.tsx:277-284 isGestureTool`, and the move logic around its mouse handlers —
  read how it accumulates `dx,dy` and calls `layers.moveLayerPixels`). Here: eyedropper on
  down → `brushPixels.cellAt(x,y)`; if a tuple, `brushUI.setDelta([...cell])`, else no-op. Move:
  on down record start cell; on move compute `dx,dy` since the **last applied** step and call
  `brushPixels.moveLayerCells(dx, dy)` inside one transaction opened on down and closed on up.
- `ui.tool.eyedropperModeOrDefault` and the pencil-hover eyedropper (`ui/hooks/usePencilHover.ts`)
  are pixel-studio features; ignore them here.

## Steps
1. `containers/brush/brushFill.ts`: `brushFloodFill(grid, width, height, x, y): {x,y}[]` +
   tests (region, boundary, `0` region, single cell, out of bounds → `[]`).
2. `brushToolContext.ts`: remove `flood-fill`, `gaussian-fill`, `eyedropper`, `move` from
   `isBrushInertTool`; `floodFillAt`/`gaussianFillAt` return writes from `brushFloodFill` with the
   dummy colour (mapping to the delta happens in `setPixels`). Update the test.
3. `BrushCanvasContainer.tsx`: gesture branches for eyedropper and move as described.
4. Commit: `brush-studio(20): flood-fill, eyedropper and move on brush layers`.

## Constraints
- Do not edit stores, `ui/**`, or `drawingUtils.ts`.
- `selection` stays inert (task 21).

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/containers
cd client && bunx vitest run src/containers
cd client && bun run lint:boundaries
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Manual (`bun run dev`, brush mode): paint a ring, flood-fill inside → only the interior fills, one
undo entry; gaussian-fill behaves the same; eyedropper on a painted cell sets the sliders to its
values; move drag shifts the layer, cells leaving the grid are dropped, one undo entry per drag;
touch drag works on iPad (or note unverified).

## Definition of done
- [ ] Flood/gaussian fill, eyedropper, move work with single undo entries; tests for the fill.
- [ ] Manual checks reported; gate green; one commit with only Touches files.
