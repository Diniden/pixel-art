# 03 — `PixelStore.setPixelsAt`

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/stores/domain/PixelStore.ts` · `client/src/stores/domain/__tests__/PixelStore.test.ts`
**Effort:** M

## Objective
`app.pixels.setPixelsAt(frameId, layerId, writes, options)` writes colour cells to **any base layer of
any frame of the selected object**, with the same bounds / selection-mask / dedupe / inverse-patch
behaviour as `setPixels`, recording into whatever history transaction is open **without opening one
itself**. `setPixels` is unchanged.

## Context
- `client/src/stores/domain/PixelStore.ts` (1825 lines) is the sole pixel writer. Read these before
  coding (pre-14 lines; symbols are stable):
  - `setPixels(pixels, options)` `:771-818` — `resolveTarget(options.variantFrameIndex)`, filter
    out-of-bounds (`:785`) and mask-excluded (`:786`) cells, per-cell dedupe via `seen: Map<number, number>`
    so a later write to the same cell only updates `patch.after` (`:789-794`), **no same-colour filter**
    (deliberate, `:805-810`), then `commitCells(target, layer, "Draw", patches, options.trackHistory ?? true)`.
  - `resolveTargetFor(frameId, layerId)` `:439-465` — the seam you need: object from the selection, frame
    and layer by id, returns `null` for a variant layer (its header `:427-436` explains why; keep it).
  - `commitCells` `:501-540` — `writeGrid`, then if `trackHistory`: `mirror.reconcile()` +
    `history.record(createPixelCommand(...))`, then `publishAndBump()`, `publishDirty(layer.id, patches)`,
    `mirror.syncHistory()`. One history record per call — a record made while a transaction is open
    buffers into it (`HistoryStore.ts:34-38`).
  - `adjustColorAcross` `:1136-1179` + `commitAdjustment` `:1344-1365` — the existing multi-target write.
    It opens a transaction **only** when `trackHistory && work.length > 1`; you must open **none** (D6):
    the brush stroke already holds one (`CanvasContainer` `beginStroke` → `strokeControl.begin()`), and
    `HistoryStore.beginTransaction` while one is open commits the outer one (`HistoryStore.ts:200-202`),
    which would split a drag into several undo entries.
  - `PixelWriteOptions :89-100` (`mask`, `maskSize`, `behavior`, `variantFrameIndex`, `trackHistory`),
    `PixelWrite :103-107`.
- `client/src/stores/domain/__tests__/PixelStore.test.ts` (902 lines) has the rig (real `ApplicationStore`
  or the store with fakes — follow whichever the `setPixels` describe uses) and pins `setPixels`'s dedupe,
  mask and history behaviour; mirror those cases for `setPixelsAt`.
- CLAUDE.md: `stores/domain/` changes must leave the corpus snapshot suites unchanged (`bunx vitest run
  src/types`). This task adds a method; it touches no serialisation.
- MobX: the store's public methods are annotated `action` in its `makeObservable`/`makeAutoObservable`
  block — add `setPixelsAt` there the same way `setPixels` is.

## Steps
1. Extract the body of `setPixels` between target resolution and `commitCells` into a private helper,
   e.g. `buildPatches(layer, width, height, pixels, options): PixelPatch[]`, and call it from `setPixels`.
   Run the PixelStore suite: it must be green with **no** test change (behaviour identical). Commit:
   `brush-apply(03): extract patch construction from setPixels`.
2. Add `setPixelsAt(frameId: string, layerId: string, pixels: readonly PixelWrite[], options: PixelWriteOptions = {}): void`:
   `const resolved = this.resolveTargetFor(frameId, layerId); if (!resolved) return;` →
   `buildPatches` → `commitCells(resolved.target, resolved.layer, "Draw", patches, options.trackHistory ?? true)`.
   No transaction. `options.variantFrameIndex` is ignored (document why in the header: variant layers are
   refused by `resolveTargetFor`). Annotate as an action.
3. Header comment (in the file's voice): what it is for (plan 15 brush mapping), why it opens no
   transaction, why variant layers are a silent no-op.
4. Tests (new `describe("setPixelsAt")`):
   - writes to a **non-current** layer of the current frame; the current layer's grid is untouched.
   - writes to a layer of **another frame**; the current frame is untouched.
   - unknown `frameId` / unknown `layerId` / a variant layer → no-op: no grid change, no history entry,
     `pixelVersion` unchanged.
   - out-of-bounds and mask-excluded cells are dropped exactly as `setPixels` drops them (reuse the
     suite's mask fixture).
   - dedupe: two writes to one cell → one patch whose `after` is the second colour.
   - history: **inside** `history.beginTransaction("stroke")` a `setPixels` to the current layer plus a
     `setPixelsAt` to another layer, then `endTransaction()` → **one** undo entry; `undo()` restores both
     grids; `redo()` re-applies both. Outside a transaction → one entry per call (same as `setPixels`).
   - `trackHistory: false` → grid changes, no entry.
   - `pixelVersion` bumps once per successful call.
   Commit: `brush-apply(03): PixelStore.setPixelsAt + tests`.

## Constraints
- `setPixels` behaviour must not change (its existing tests are the proof; do not edit them beyond
  moving shared setup).
- Do not call `beginTransaction`/`endTransaction` inside `setPixelsAt`.
- Do not modify `resolveTargetFor` (its variant refusal is load-bearing).
- Do not touch `commands.ts`, `HistoryStore.ts`, `DomainMutator.ts`, `storeTypes.ts`, `CanvasContainer.tsx`.

## Verification
```sh
cd client && bunx vitest run src/stores/domain               # green
cd client && bunx vitest run src/types                       # green, snapshots unchanged
cd client && bunx tsc --noEmit && bunx eslint src/stores     # clean; warning count unchanged for PixelStore.ts (it already exceeds max-lines — no new warning kind)
git status --porcelain | grep __snapshots__                  # prints nothing
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules  # prints nothing
```
Manual: none (a container binds it in task 12).

## Definition of done
- [ ] `setPixelsAt` exists with the D6 signature and semantics; annotated as a MobX action.
- [ ] `setPixels` unchanged in behaviour; its tests untouched and green.
- [ ] New tests cover other-layer, other-frame, no-op cases, mask/bounds/dedupe, one-entry-in-transaction, `trackHistory:false`, `pixelVersion`.
- [ ] Corpus suites unchanged; no snapshot written.
- [ ] Two commits `brush-apply(03):`; no lockfile.
