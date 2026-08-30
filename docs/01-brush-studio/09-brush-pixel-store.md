# 09 — BrushPixelStore (cell writes)

**Wave:** W4 · **Depends on:** 07, 10
**Touches:** `client/src/stores/domain/BrushPixelStore.ts` (new) · `client/src/stores/domain/__tests__/BrushPixelStore.test.ts` (new)
**Effort:** M

## Objective
Cell writes on the selected brush layer: `setCells` (with optional mask and history tracking),
`clearCells`, `moveLayerCells(dx, dy)`, `flipHorizontal/Vertical`, and `cellAt(x, y)`; every
write copies only touched rows, replaces the document immutably, records an inverse-patch
`BrushPixelCommand` into the brush history, and bumps `brushes.pixelVersion`. A 100-cell drag
stays under 16 ms/frame.

## Context
- The pattern is `client/src/stores/domain/PixelStore.ts`: `PixelWriteOptions :89-101`,
  `PixelWrite :103`, `writeCells :222-235` (row copy, new array), `commitCells :483-513`
  (build patches → write → record → publish/bump), `publishAndBump :601-606` (**no bump while
  `history.isReplaying`**), `applyPatch :613-648` (reverse on undo, forward on redo), de-dup
  "last write to a cell wins, one patch". Read those ranges before writing a line.
- History pieces from task 07: `createBrushPixelCommand`, `BrushPatch`, `BrushPixelTarget`,
  `BrushPatchHost`. The store implements `BrushPatchHost.applyPatch` and passes itself as `host`.
- Snapshot family for flips (`brush.commit`) — mirrors `PixelStore.ts:139-159` where flips are
  the one snapshot exception.
- Selection source: `{ selectedFrameId, selectedLayerId }` injected (task 11 passes `brushUI`);
  this file must not import `stores/ui/**`.
- Perf gate precedent: `stores/domain/__tests__/PixelStore.test.ts:589-634` (100-move drag < 16 ms,
  undo/redo < 16 ms) and `pixelGridContract.test.ts:191-246`.

## Steps
1. Implement:
   ```ts
   export interface BrushCellWrite { x: number; y: number; value: BrushCell }
   export interface BrushWriteOptions { mask?: ReadonlySet<number>; maskSize?: { width; height }; trackHistory?: boolean }
   export interface BrushPixelStoreDeps { brush: BrushStore; source: BrushSelectionSource }
   export class BrushPixelStore implements BrushPatchHost {
     resolveTarget(): { target: BrushPixelTarget; frameIndex; layerIndex; layer: BrushLayer; width; height } | null
     cellAt(x, y): BrushCell | undefined
     setCells(writes: readonly BrushCellWrite[], opts?): void       // bounds + mask filter; de-dup; skip if value deep-equals existing
     clearCells(cells: readonly {x,y}[], opts?): void                // value 0
     moveLayerCells(dx, dy, opts?): void                             // whole selected layer; cells shifted out are dropped
     flipHorizontal(): void; flipVertical(): void                    // snapshot via brush.commit
     applyPatch(target, cells, direction): void                      // used by undo/redo; never records
   }
   ```
   `commitCells(target, label, patches, trackHistory)`: `brush.replaceDocument(next, { bumpPixels: true })`
   … except that `replaceDocument` bumps `domainVersion` — for pixel writes only `pixelVersion`
   should move. Use `brush.adoptDocument(next); brush.bumpPixelVersion();` directly (both public
   from task 07) and record the command with `brush.history.record(...)` when `trackHistory !== false`
   and `!brush.history.isReplaying`.
2. Tests: write one cell → `pixelVersion` +1, `domainVersion` unchanged, exactly one history
   entry, other rows keep their **reference identity** (row-copy proof), grids raw (not proxies);
   writing the same value records nothing; de-dup keeps one patch with the last value; mask
   excludes cells and a mismatched `maskSize` disables masking (mirror `PixelStore`'s pinned
   rule); undo restores cells and bumps `pixelVersion`; `moveLayerCells` drops out-of-bounds;
   flips are one entry each and undo; **perf**: a 100-write drag inside
   `history.beginTransaction/endTransaction` on a 64×64 layer — worst frame < 16 ms and
   undo/redo < 16 ms (`performance.now()`), plus the transaction collapses to one entry.
3. Commit: `brush-studio(09): BrushPixelStore`.

## Constraints
- Do not edit `BrushStore.ts`, `brushCommands.ts`, `PixelStore.ts`.
- No `structuredClone` or whole-grid copies on a write path.
- Never bump `domainVersion` from a cell write.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/stores/domain
cd client && bunx vitest run src/stores
cd client && bun run lint:boundaries
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Paste the measured worst-frame numbers from the perf test output (log them with `console.info` inside the test).

## Definition of done
- [ ] API above implemented; inverse-patch commands; row-copy proven by test.
- [ ] Perf numbers pasted and under budget.
- [ ] Gate green; one commit with only Touches files.
