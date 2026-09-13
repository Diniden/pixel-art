# 08 — `BrushUIStore.selectedBrushId`

**Wave:** W3 · **Depends on:** 05
**Touches:** `client/src/stores/ui/BrushUIStore.ts` · `client/src/stores/ui/__tests__/BrushUIStore.test.ts`
**Effort:** M

## Objective
`BrushUIStore` knows which brush of the open project is selected. `selectedBrushId` is observable; `selectBrush(id, doc)` switches brush and re-seats the frame/layer selection; `adoptDocument` clamps brush → frame → layer; `selectedBrushIn`, `selectedFrameIn`, `selectedLayerIn` and `channelTypeIn` all resolve through the selected brush. The suite pins every rule.

## Context
`client/src/stores/ui/BrushUIStore.ts` (371 lines): the private `frameIn(doc, frameId) :91-99` (falls back to `frames[0]`), fields `selectedFrameId/selectedLayerId :103-105`, the `makeObservable` map `:138-174`, `selectFrame/selectLayer :176-182`, `adoptDocument :197-221` (null clears; stale frame → `frames[0]`; stale layer → top = last element), `selectedFrameIn :224`, `selectedLayerIn :229`, `channelTypeIn :240`. The header explains why the document is passed **in**: `stores/ui/**` never imports `stores/domain/**`. Deltas, camera and playback (`:249-370`) are untouched.

`BrushUIStore.test.ts` (42 tests) builds documents as `{ ...createBrushDocument(4,4), frames: [...] }` (`:43-44`, `:156`, `:163`, `:230-232`, `:238`) — every such literal becomes `{ ...createBrushDocument(4,4), brushes: [{ ...createBrushDocument(4,4).brushes[0], frames: [...] }] }`; write a local `docWithFrames(frames)` helper and a `twoBrushDoc()` helper.

Locked (MASTER D4):

```ts
selectedBrushId: string | null = null;           // observable
selectBrush(id: string, doc: BrushDocument | null): void;
selectedBrushIn(doc: BrushDocument | null): Brush | null;   // = brushIn(doc, this.selectedBrushId)
```
- `selectBrush(id, doc)`: `selectedBrushId = id; selectedFrameId = null; selectedLayerId = null; this.adoptDocument(doc)`. So after a switch the new brush's first frame and top layer are selected. If `id` is not in `doc`, the clamp falls back to `brushes[0]` (and its id is stored — the store never keeps an id the document does not have, exactly as for frames).
- `adoptDocument(doc)`: `null` → clear all three. Else `brush = brushIn(doc, selectedBrushId)`; `null` brush (empty document — impossible after normalisation but handle it) → clear all three; else `selectedBrushId = brush.id`, then today's frame/layer clamp **against `brush.frames`**.
- `selectedFrameIn(doc)` = `frameIn(selectedBrushIn(doc), selectedFrameId)`; `selectedLayerIn` / `channelTypeIn` follow. The private `frameIn` now takes a `Brush | null`.
- `brushIn` comes from `../../types` (task 05).

## Steps
1. Add the field, the observable entry, `selectBrush: action`, `selectedBrushIn`; re-type `frameIn`; rewrite `adoptDocument` with the brush level; route the three resolvers through the selected brush. Update the header comment (selection is now brush → frame → layer; `selectBrush` takes the document for the same reason `adoptDocument` does).
2. Update the test builders; migrate every existing test.
3. Add tests: `adoptDocument` with no brush id selects `brushes[0]` and its first frame / top layer; a stale brush id falls back to `brushes[0]`; a kept brush id keeps frame and layer; `selectBrush("brush-2", doc)` selects brush 2's first frame and top layer even when brush 1's frame id is the same string (use `createBrush` twice — both have `frame-1` — and assert `selectedLayerIn(doc)` is brush 2's layer object by identity); `selectBrush(unknownId, doc)` → `brushes[0]`; `selectBrush(id, null)` → all three null; `selectedBrushIn(null)` → null; deltas and camera survive `selectBrush` untouched.
4. Run the verification. Commit: `multi-brush(08): BrushUIStore selects a brush, then a frame, then a layer`.

## Constraints
- No import from `stores/domain/**`. No new persisted state.
- Do not touch `PixelBrushUIStore.ts` or `UIStore.ts`.

## Verification
```sh
cd client && bunx vitest run src/stores/ui/__tests__/BrushUIStore.test.ts && bunx eslint src/stores/ui
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # prints nothing
```
Expected: the suite green (42 → ~52). tsc red elsewhere by design (W3 seam).

Manual: none.

## Definition of done
- [ ] `selectedBrushId`, `selectBrush(id, doc)`, `selectedBrushIn` implemented per D4; resolvers brush-scoped.
- [ ] Suite migrated and extended; output pasted.
