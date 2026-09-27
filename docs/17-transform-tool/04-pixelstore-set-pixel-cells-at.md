# 04 — `PixelStore` label + `setPixelCellsAt`

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/stores/domain/PixelStore.ts` · `client/src/stores/domain/__tests__/PixelStore.test.ts`
**Effort:** S

## Objective
`setPixelCells` accepts an optional history label (defaulting to today's `"Stamp pose"`), and a new
`setPixelCellsAt(target, cells, options, label)` writes all three channels to a layer addressed by
**object, frame and layer ids** — so a pending transform can be committed to the layer it was lifted
from even after the timeline selection moved. One history entry per call, no transaction.

## Context
- `client/src/stores/domain/PixelStore.ts` (1825 lines): `setPixelCells(cells, options = {}) :866-908`
  — resolves the current target, dedupes per cell (later wins), builds `PixelPatch`es with full
  `PixelData` before/after, and ends in `commitCells(target, layer, "Stamp pose", patches, trackHistory)`
  (`:904`). `PixelCellWrite :119-125`. `resolveTargetFor(frameId, layerId) :439-465` — object from
  `this.source.selectedObjectId`, frame/layer by id, **refuses variant layers** (header `:427-436`
  explains why; keep that). `commitCells :501-537` — one entry, one `publishAndBump`.
- Test file `client/src/stores/domain/__tests__/PixelStore.test.ts` (902 lines) — find the
  `setPixelCells` describe and mirror its rig.
- CLAUDE.md: `stores/domain/` changes must leave the corpus suites unchanged. This task adds methods
  only; no serialisation is touched.
- ⚠️ Plan 15 (unexecuted) adds `setPixelsAt(frameId, layerId, …)` to this file. Different name,
  different channels; both may coexist. If it has landed, place the new method beside it.

## Steps
1. `setPixelCells(cells, options = {}, label = "Stamp pose")` — thread `label` into `commitCells`.
   Existing callers and tests are unchanged.
2. Private `resolveTargetIn(objectId, frameId, layerId)` — the body of `resolveTargetFor` with the
   object id supplied (find the object by id instead of the selection); identical refusals; `null`
   on any missing link. Refactor `resolveTargetFor` to call it with `this.source.selectedObjectId`
   (behaviour identical; its tests prove it).
3. `setPixelCellsAt(target: { objectId: string; frameId: string; layerId: string }, cells: readonly PixelCellWrite[], options: PixelWriteOptions = {}, label = "Transform selection"): void`
   — `resolveTargetIn` (`null` → silent no-op), then exactly `setPixelCells`'s dedupe / patch / commit.
   Extract the shared patch construction into one private helper both methods call. Annotate as an
   action beside `setPixelCells`. Header comment: purpose (plan 17), why it targets by ids, why no
   transaction.
   Commit: `transform(04): setPixelCells label + setPixelCellsAt`.
4. Tests (new `describe("setPixelCellsAt")` + one for the label):
   - `setPixelCells(cells, {}, "Custom")` records an entry labelled `"Custom"`; without the argument
     the label is still `"Stamp pose"`.
   - `setPixelCellsAt` writes colour + normal + height to a **non-selected** frame's layer and to a
     **non-selected object's** layer; the selected layer is untouched.
   - unknown object / frame / layer id or a variant layer → no grid change, no entry, no
     `pixelVersion` bump.
   - dedupe: two writes to one cell → one patch with the second value.
   - one history entry per call; `undo()` restores every channel; `trackHistory: false` → no entry.
   - `resolveTargetFor`'s existing tests still green (the refactor is behaviour-neutral).
   Commit: `transform(04): tests`.

## Constraints
- No change to `setPixels`, `moveSelectedPixels`, `deleteSelectionPixels`, `commitCells`, history.
- No transaction anywhere. No mask/behaviour gating added to the new method (the caller passes `{}`).
- Do not touch `storeTypes.ts`, `CanvasContainer.tsx`, `ApplicationStore.ts`.

## Verification
```sh
cd client && bunx vitest run src/stores/domain               # green
cd client && bunx vitest run src/types                       # green, snapshots unchanged
cd client && bunx tsc --noEmit && bunx eslint src/stores     # clean; PixelStore.ts already carries a max-lines warning — no new warning kind
git status --porcelain | grep __snapshots__                  # prints nothing
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules  # prints nothing
```
Manual: none.

## Definition of done
- [ ] Label parameter and `setPixelCellsAt` with D7 semantics; `resolveTargetIn` extracted.
- [ ] Tests listed above green; existing suites untouched and green.
- [ ] Corpus suites unchanged; no snapshot written.
- [ ] Two commits `transform(04):`; no lockfile.
