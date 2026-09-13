# 09 — `BrushStructureStore` brush-scoped + brush CRUD

**Wave:** W3 · **Depends on:** 05, 07
**Touches:** `client/src/stores/domain/BrushStructureStore.ts` · `client/src/stores/domain/__tests__/BrushStructureStore.test.ts`
**Effort:** L

## Objective
Every structural op (frames, layers, applied groups, resize) acts on the **selected brush** of the document, spine-copying `doc.brushes` so every other brush keeps its identity. Five new ops manage the brushes themselves — `addBrush`, `duplicateBrush`, `deleteBrush`, `renameBrush`, `moveBrush` — each one snapshot commit, with selection written through the sink. The suite (46 tests) is migrated and extended, including the aliasing checks in MASTER R3.

## Context
`client/src/stores/domain/BrushStructureStore.ts` (680 lines). Read the header (`:1-45`): uniform layers (D6), immutable spine writes (D8), boundaries (selection read through an injected `BrushSelectionSource :57`, written through `BrushSelectionSink :63`). Pure helpers: `cloneCell`, `copyGrid`, `resizeGrid`, `mapFrames(doc, fn) :110`, `mapLayers :118`, `mapLayer :129`, `withoutAppliedGroup`, `withoutColorSource`, `swapped`, `inserted`, `isDimension`. Class: private `commit(label, mutate, bumpPixels) :192-205` (asserts uniform layers on a changed result), `layerIndexOf(doc, id) :209`; frames `:223-380`; layers `:382-600` (`addLayer` reads `current.width/height :401`); groups `:604-655`; `resizeBrush :662-680`.

`BrushStructureStore.test.ts`: fake api `store.set(name, doc ?? createBrushDocument()) :66`; `twoByTwoDoc() :80-100` builds a full document literal; helpers `layerIds/frameIds/layerIn :158-161` walk `doc.frames`. `generateId` is in `types/factories.ts:70` (re-exported from `types`).

### Locked (MASTER D5)

```ts
export interface BrushSelectionSource {
  readonly selectedBrushId: string | null;
  readonly selectedFrameId: string | null;
  readonly selectedLayerId: string | null;
}
export interface BrushSelectionSink {
  selectBrush(id: string): void;      // ApplicationStore adapts this to brushUI.selectBrush(id, document) — task 11
  selectFrame(id: string | null): void;
  selectLayer(id: string | null): void;
}
export type BrushMoveDirection = "up" | "down";   // "up" = toward index 0

addBrush(name: string, width = 16, height = 16): string;
duplicateBrush(id: string): string;
deleteBrush(id: string): void;       // refuses the last
renameBrush(id: string, name: string): void;
moveBrush(id: string, direction: BrushMoveDirection): void;
```

Mechanics:
- Private `selectedBrushIndex(doc)`: index of `source.selectedBrushId` in `doc.brushes`, else `0`, else `-1` for an empty array. Private `commitBrush(label, mutate: (brush: Brush) => Brush, bumpPixels)`: resolves the index from the **live** document inside `brush.commit`'s callback (`(doc) => { const i = …; const before = doc.brushes[i]; const next = mutate(before); if (next === before) return doc; assertUniformLayers(next); return { ...doc, brushes: replacedAt(doc.brushes, i, next) }; }`). Every existing op switches from `this.commit(label, (doc) => …)` to `this.commitBrush(label, (brush) => …)` and its pre-checks read `const brush = brushIn(this.brush.document, this.source.selectedBrushId)` instead of `const doc = this.brush.document`.
- The helpers `mapFrames`, `mapLayers`, `mapLayer` are re-typed to `(brush: Brush, …) => Brush`; bodies unchanged. `layerIndexOf(brush, id)`.
- `addBrush`: `createBrush(generateId(), name, width, height)` appended; `select.selectBrush(newId)` after the commit; returns the id or `""` without a document. `bumpPixels = true`.
- `duplicateBrush(id)`: deep copy (`copyGrid` on every layer of every frame; `appliedGroups` copied by spread; frame/layer ids **kept** — they are brush-scoped), `name: "<name> Copy"`, new `generateId()`, inserted after the source, selected. Returns the id or `""`.
- `deleteBrush(id)`: no-op when `brushes.length <= 1` or the id is unknown. Commit the filter; if the deleted brush was the selected one (or nothing was selected), `select.selectBrush(survivor.id)` where survivor = the previous index, else the new first — the `deleteFrame` rule.
- `renameBrush(id, name)`: relabel, `bumpPixels = false`.
- `moveBrush(id, dir)`: swap with the neighbour, no-op at the ends, `bumpPixels = false` (the list reorders; nothing painted changes). Note the sense: `"up"` = index − 1.
- `resizeBrush(w, h)` resizes the selected brush; the early-out compares against that brush.

## Steps
1. Extend the two interfaces; add `BrushMoveDirection`; add `selectedBrushIndex`, `commitBrush`, and a `replacedAt<T>(items, index, item): T[]` helper beside `swapped`/`inserted`.
2. Re-type the pure helpers and `layerIndexOf`; migrate every existing method to `commitBrush` + brush-scoped pre-checks. Keep every label string and every `bumpPixels` value exactly as it is.
3. Add the five brush ops after the "Document" section, under a new `/* ══ Brushes ═══ */` banner.
4. Rewrite the header: the store acts on the selected brush; brushes themselves are managed by the new section; the spine copy now includes `doc.brushes`.
5. Tests: migrate `twoByTwoDoc()` to return a brush-2 document (one brush) and the helpers to read `doc.brushes[0]`; give the fake selection source a `selectedBrushId` and the sink a `selectBrush` spy. Add: every existing op on a **two-brush** document touches only the selected brush (`before.brushes[1] === after.brushes[1]` and `before.brushes[0] !== after.brushes[0]` — R3) for at least `addFrame`, `addLayer`, `resizeBrush`, `addAppliedGroup`; ops with brush 2 selected edit brush 2; `addBrush` appends, selects, one history entry, ⌘Z removes it and the sink was told to re-select (assert the second `selectBrush` call — undo restores the document, and `adoptDocument` in the UI store handles the clamp, so here just assert the document); `duplicateBrush` deep-copies grids (no shared row/cell references) and keeps frame/layer ids; `deleteBrush` refuses the last, re-selects the previous, leaves an unselected deletion's selection alone; `renameBrush` no pixel bump; `moveBrush` up/down and no-op at the ends; unknown ids are no-ops everywhere.
6. Run the verification. Commit: `multi-brush(09): BrushStructureStore acts on the selected brush; brush add/duplicate/delete/rename/move`.

## Constraints
- No import from `stores/ui/**`. Selection only via the injected source/sink.
- Never mutate an argument; never share a grid between two brushes after `duplicateBrush`.
- Do not touch `BrushPixelStore.ts` (task 10), `BrushStore.ts` (task 11).

## Verification
```sh
cd client && bunx vitest run src/stores/domain/__tests__/BrushStructureStore.test.ts && bunx eslint src/stores/domain/BrushStructureStore.ts
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # prints nothing
```
Expected: suite green (46 → ~65); eslint 0 errors. Compare `bunx eslint src/stores/domain/BrushStructureStore.ts` before and after: the file is 680 lines with heavy comments and `max-lines` counts code lines only — if the five ops trip a new `max-lines` warning, move the pure helpers (`cloneCell` … `isDimension`, `replacedAt`) to `stores/domain/brushDocumentOps.ts` and add it to your report as a `Touches` addition; the repo-wide warning count must stay ≤ 66.

Manual: none.

## Definition of done
- [ ] Every op brush-scoped with spine copies; five new ops per D5.
- [ ] R3 aliasing tests present and green; suite output pasted.
- [ ] Labels and `bumpPixels` values unchanged for existing ops.
