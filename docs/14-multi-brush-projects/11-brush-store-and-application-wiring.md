# 11 — `BrushStore` + `ApplicationStore` wiring

**Wave:** W3 · **Depends on:** 01, 05, 06, 08 (and 09 for the sink type — code to D5's interface)
**Touches:** `client/src/stores/domain/BrushStore.ts` · `client/src/stores/ApplicationStore.ts` · `client/src/stores/domain/__tests__/BrushStore.test.ts` · `client/src/stores/__tests__/brushWiring.test.ts`
**Effort:** S

## Objective
`BrushStore` creates brush-2 projects and loads legacy files through the new normaliser without further change; `ApplicationStore` wires the structure store's `selectBrush` sink to `brushUI.selectBrush(id, brushes.document)` so a brush added or deleted by the store re-seats the frame and layer selection. The store suite and the wiring suite are migrated and pin: a legacy file loads as one brush; `createProject(name, w, h)` yields one brush of that size; `onDocumentInstalled` still fires on every adopt.

## Context
`BrushStore.ts` after task 01: `createProject :~354` calls `createBrushDocument(width, height)` — its return is now brush-2 (task 05) with the brush named "Brush 1" by default: **nothing to change** in the body except the doc comment. `loadProject :~314` calls `normalizeBrushDocument(raw)`, which now wraps legacy input — nothing to change. `serialize`, `saveName`, counters, history — unchanged. Update the header (`:1-45`) where it says the document is one brush.

`ApplicationStore.ts:958-976`: `brushUI` constructed first; `new BrushStore({ session, onDocumentInstalled: (doc) => brushUI.adoptDocument(doc) })`; `new BrushStructureStore({ brush: this.brushes, source: brushUI, select: brushUI })`; `new BrushPixelStore({ brush: this.brushes, source: brushUI })`. After task 08, `BrushUIStore.selectBrush(id, doc)` takes two arguments, so `brushUI` no longer satisfies `BrushSelectionSink` (task 09's `selectBrush(id)`); `source: brushUI` still satisfies both source interfaces structurally (`selectedBrushId` is a field).

Locked adapter (MASTER §8 mistake 3):

```ts
this.brushStructure = new BrushStructureStore({
  brush: this.brushes,
  source: brushUI,
  select: {
    selectBrush: (id) => brushUI.selectBrush(id, this.brushes.document),
    selectFrame: (id) => brushUI.selectFrame(id),
    selectLayer: (id) => brushUI.selectLayer(id),
  },
});
```
The document read inside the adapter is the **post-commit** document (the store commits before it calls the sink), which is what the clamp needs. Add a comment saying exactly that.

Tests: `BrushStore.test.ts` (37) — the fake api `files: Map<string, BrushDocument>` `:57-65` is fine; `renameFirstLayer :102-107` maps `doc.frames` → `doc.brushes[0].frames`; any assertion on `document.width` → `document.brushes[0].width`. `brushWiring.test.ts` (13) — `installLoadedBrush()` `:36-37`, the pixel read `:47` (`document?.brushes[0].frames[0].layers[0].pixels[y][x]`), the save assertion `:155` (unchanged: the payload is the document reference).

## Steps
1. `BrushStore.ts`: comments only (header, `createProject`, `loadProject`); confirm nothing else needs to change by running its suite after step 3.
2. `ApplicationStore.ts`: the sink adapter above; update the construction comment (`:948-957`) to mention it.
3. Migrate both suites. Add to `BrushStore.test.ts`: the fake api returns a **legacy** brush-1 object for a name → `loadProject` installs a one-brush document named "Brush 1" with the legacy frames intact; `createProject("x", 3, 5)` → `files.get("x").brushes[0]` is 3×5 and `brushes.length === 1`; a corrupt brush-2 payload (`brushes: []`) → `loadState === "failed"`, previous document untouched. Add to `brushWiring.test.ts`: `app.brushStructure.addBrush("Second")` → `app.brushUI.selectedBrushId` is the new id and `selectedLayerIn(document)` is that brush's layer (proves the adapter passed the document); `deleteBrush` of the selected brush re-seats to the survivor; a pixel write through `app.brushPixels.setCells` lands in the selected brush.
4. Run the verification. Commit: `multi-brush(11): BrushStore on brush-2; selection sink adapter passes the document`.

## Constraints
- `BrushStore` imports nothing from `stores/ui/**`. The adapter lives in `ApplicationStore` only.
- Do not touch `AutoSaveController.ts`; the brush autosave contract is unchanged.

## Verification
```sh
cd client && bunx vitest run src/stores && bunx eslint src/stores
cd client && bunx tsc --noEmit 2>&1 | grep -oE "^src/[^(]+" | sort -u        # paste this list
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules            # prints nothing
```
Expected: **every** `src/stores` suite green (this closes the W3 seam for stores); the tsc file list is a subset of MASTER §8's W3 seam list (containers and their tests only) — paste it.

Manual: none.

## Definition of done
- [ ] Adapter wired with the post-commit comment; `BrushStore` comments updated.
- [ ] Both suites migrated with the new cases; all `src/stores` green; tsc list pasted and within the W3 seam.
