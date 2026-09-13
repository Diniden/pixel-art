# 10 — `BrushPixelStore` brush-scoped

**Wave:** W3 · **Depends on:** 05, 07
**Touches:** `client/src/stores/domain/BrushPixelStore.ts` · `client/src/stores/domain/__tests__/BrushPixelStore.test.ts`
**Effort:** M

## Objective
Cell writes, moves, flips and undo/redo replays resolve the target as brush → frame → layer and rebuild the document spine through `doc.brushes` as well, so a write in one brush leaves every other brush's object identity untouched. `BrushPixelTarget` carries `brushId`.

## Context
`client/src/stores/domain/BrushPixelStore.ts` (455 lines): `BrushSelectionSource :59`, `ResolvedBrushTarget :100` (`target, frameIndex, layerIndex, layer, width, height`), `writeCells :137`, `replaceLayerGrid(doc, frameIndex, layerIndex, pixels) :159-171` (`{ ...doc, frames }`), `resolveTarget :201-219` (strict — a `null` selection is "nowhere", not frame 0; returns `width: doc.width`), `cellAt :222`, `setCells :237`, `clearCells :279`, `moveLayerCells :294`, flips `:336-357` (snapshot family via `brush.commit`), `applyPatch :371-395` (resolves by ids from the live document), `effectiveMask :406`, `commitCells :422-449`. The header's ordering rule for `applyPatch` (cells arrive already ordered for the direction) is unchanged.

`BrushPixelStore.test.ts` (39): `mkDocument() :52` returns `{ ...createBrushDocument(w,h), frames }` and `BrushLayer` literals `:48`; the fake selection source is a plain object.

Locked (MASTER D6):
- `BrushSelectionSource` gains `readonly selectedBrushId: string | null`.
- `resolveTarget()`: `brushIndex = doc.brushes.findIndex(b => b.id === selectedBrushId)`; a `null` brush id is treated like a stale one — **strict**, return `null` (the UI store guarantees an id whenever a document is installed; a write with none is "nowhere", matching the frame rule). `ResolvedBrushTarget` gains `brushIndex`; `target` gains `brushId`; `width/height` come from the brush.
- `replaceLayerGrid(doc, brushIndex, frameIndex, layerIndex, pixels)`: also `const brushes = [...doc.brushes]; brushes[brushIndex] = { ...brush, frames }`.
- `applyPatch(target, cells, dir)`: resolve `target.brushId` first; missing → no-op.
- Flips: `flipInto` passes `brushIndex` through.

## Steps
1. Extend the source interface and `ResolvedBrushTarget`; rewrite `resolveTarget` and `replaceLayerGrid`; thread `brushIndex` through `commitCells`, `flipInto`, `applyPatch`. Update the header (brush → frame → layer; spine copy includes `brushes`).
2. Tests: migrate `mkDocument` to brush-2 with **two** brushes (the second a different size); the fake source gains `selectedBrushId`. Add: with brush 2 selected, `setCells` writes brush 2's grid and `before.brushes[0] === after.brushes[0]` (R3); with brush 1 selected, `before.brushes[1] === after.brushes[1]`; a `null` brush id → `setCells` writes nothing and records nothing; `applyPatch` with a `brushId` not in the document is a no-op; undo of a write in brush 2 after switching the selection to brush 1 still restores brush 2 (the command holds ids, not the selection); bounds use the selected brush's size (a 4×4 brush 2 rejects `x: 5` even though brush 1 is 8×8); flips act on the selected brush only.
3. Run the verification. Commit: `multi-brush(10): BrushPixelStore writes through brush → frame → layer`.

## Constraints
- No `structuredClone`; touched rows only, as today. Never bump `domainVersion` from a cell write.
- Do not touch `brushCommands.ts` (task 07) or `BrushStructureStore.ts` (task 09).

## Verification
```sh
cd client && bunx vitest run src/stores/domain/__tests__/BrushPixelStore.test.ts && bunx eslint src/stores/domain/BrushPixelStore.ts
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # prints nothing
```
Expected: suite green (39 → ~47); no new lint warning.

Manual: none.

## Definition of done
- [ ] `resolveTarget`, `replaceLayerGrid`, `applyPatch`, flips brush-scoped; `brushId` in every target.
- [ ] R3 identity tests and the cross-brush undo test present and green; output pasted.
