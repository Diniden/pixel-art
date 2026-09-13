# 07 — History commands for brushes

**Wave:** W2 · **Depends on:** 05 (shape only — code to MASTER §3's block)
**Touches:** `client/src/stores/history/brushCommands.ts` · `client/src/stores/history/__tests__/brushCommands.test.ts`
**Effort:** S

## Objective
The brush history commands understand the two-level document: `estimateBrushBytes` sums over every brush, and `BrushPixelTarget` carries `brushId` so an inverse-patch command addresses a cell by brush → frame → layer. Snapshot commands are unchanged in behaviour (whole document by reference).

## Context
`client/src/stores/history/brushCommands.ts` (208 lines): `BrushSnapshotHost :40-46` (`current()`, `restore(doc)`), `estimateBrushBytes :58-62` (`doc.width * doc.height`, walks `doc.frames` for the layer count), `createBrushSnapshotCommand :90-`, `BrushPatch`, `BrushPixelTarget { frameId; layerId } :~150`, `BrushPatchHost.applyPatch(target, cells, direction)`, `createBrushPixelCommand`. Header rules: snapshots are **held by reference** (documents are immutable), the grid is never walked, the pixel command holds copied cells addressed by ids.

Test `brushCommands.test.ts` (12 tests): snapshot chains `{ ...before, width: 8 }` `:51`, `v0/v1/v2` varying `width` `:116-118`; pixel commands with a fake host. These document literals move to brush-2 (`{ ...before, brushes: [{ ...before.brushes[0], width: 8 }] }`).

Locked (MASTER D7): `BrushPixelTarget { brushId: string; frameId: string; layerId: string }`; `estimateBrushBytes(doc)` = `Σ_brush (width × height × Σ_frames layers.length) × BYTES_PER_BRUSH_CELL + BYTES_SNAPSHOT_BASE`.

## Steps
1. Update `estimateBrushBytes` and `BrushPixelTarget`; update the header comment ("addressed by `(brushId, frameId, layerId)`") and the `BrushPatchHost.applyPatch` doc.
2. Update the tests: document literals to brush-2; add a case that `estimateBrushBytes` on a two-brush document (4×4 with 2 layers × 1 frame + 2×2 with 1 layer × 3 frames) equals `(32 + 12) * 10 + 256`; pixel command tests pass `brushId` through to `applyPatch` (assert the host receives it, both directions).
3. Run the verification. Commit: `multi-brush(07): brush history commands address brush → frame → layer`.

## Constraints
- No change to `commands.ts`, `HistoryStore.ts`, or the snapshot semantics.
- Do not fix `BrushPixelStore` (task 10) even though it now fails to compile against the new target.

## Verification
```sh
cd client && bunx vitest run src/stores/history && bunx eslint src/stores/history
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # prints nothing
```
Expected: `src/stores/history` suites green (brushCommands 12 → 14). tsc red elsewhere by design.

Manual: none.

## Definition of done
- [ ] `BrushPixelTarget.brushId` and the summed estimate implemented and pinned.
- [ ] History suites green; output pasted.
