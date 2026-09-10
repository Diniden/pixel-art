# 03 — `BrushUIStore.selectedFrameIn(doc)`

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/stores/ui/BrushUIStore.ts` · `client/src/stores/ui/__tests__/BrushUIStore.test.ts`
**Effort:** S

## Objective
Callers outside the brush studio can ask the brush UI store which frame is "current" without
re-implementing the fallback rule: `selectedFrameIn(doc)` returns the frame named by
`selectedFrameId`, else the document's first frame, else `null` — exactly what the store's private
`frameIn` helper already does.

## Context
- `client/src/stores/ui/BrushUIStore.ts`: `frameIn(doc, frameId)` is **module-private** at `:89-98`
  (`doc.frames.find(f => f.id === frameId) ?? doc.frames[0] ?? null`). Public analogues to mirror in
  shape and doc style: `selectedLayerIn(doc)` `:217` and `channelTypeIn(doc)` `:228` — both take the
  document as an argument because `stores/ui/**` never imports `stores/domain/**` (header `:15-19`).
- `selectedFrameId` `:102`. `adoptDocument` `:196` sets the ids; `selectFrame` exists (grep).
- Style: explicit `makeObservable` map — a plain method that reads observables needs **no** entry
  (mirror how `selectedLayerIn` is (or is not) listed). No persistence, no MobX deep observation of
  `doc` (it is a plain object passed in).
- Test rig: `client/src/stores/ui/__tests__/BrushUIStore.test.ts` (37 tests after plan 11) —
  `createBrushDocument` fixtures from `client/src/types/brush.ts:162`.

## Steps
1. Add `selectedFrameIn(doc: BrushDocument | null): BrushFrame | null` next to `selectedLayerIn`,
   implemented as `doc ? frameIn(doc, this.selectedFrameId) : null`, with a doc comment naming the
   consumer ("the pixel studio's brush tool — docs/12-pixel-brush-tool task 05/06") and the fallback rule.
   Import `BrushFrame` as a type if not already imported.
2. Tests: `null` doc → `null`; `selectedFrameId` matching the second of two frames → that frame (same
   reference, not a copy); `selectedFrameId` set to an unknown id → `frames[0]`; `selectedFrameId`
   `null` → `frames[0]`; document with the selected frame removed → `frames[0]`.
3. Commit: `pixel-brush(03): BrushUIStore.selectedFrameIn(doc)`.

## Constraints
- No new observable fields; nothing persisted; no `stores/domain` import; no consumer edits.
- Do not rename or change `frameIn`, `selectedLayerIn`, `channelTypeIn`.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/stores/ui
cd client && bunx vitest run src/stores
cd client && bun run lint:boundaries
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
No manual checks (store-only).

## Definition of done
- [ ] `selectedFrameIn` exported with the documented fallback; five tests green; all pre-existing tests untouched.
- [ ] One commit with only the two files.
