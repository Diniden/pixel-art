# 11 — ApplicationStore wiring

**Wave:** W5 · **Depends on:** 03, 05, 07, 08, 09, 10
**Touches:** `client/src/stores/ApplicationStore.ts` · `client/src/stores/__tests__/brushWiring.test.ts` (new)
**Effort:** M

## Objective
`ApplicationStore` constructs and exposes `brushes`, `brushStructure`, `brushPixels`, `brushUI`,
and (when autosave is enabled) `brushAutoSave`; `activeHistory` routes undo/redo to the brush
history in brush mode; everything is disposed. A test proves a brush cell write triggers the
brush autosave and never the project autosave, and that undo in brush mode leaves the project
stack untouched.

## Context
- `client/src/stores/ApplicationStore.ts` (1653 lines). Child declarations `:199-385`; constructor
  `:391-784` — **construction order is load-bearing** (`:442-469`): `tool` before `lightingUI`,
  `viewport` before `timelineUI`/`ui`. Add the brush stores **after** `lightingUI` (they need
  nothing from it at construction) and before `autoSave` (`:761`). `undo :1527`, `redo :1532`,
  `dispose :1644-1650`. Options interface around `:100-135` (`autoSaveEnabled :109`, `autoSave :131`).
- `AutoSaveController<TDoc>` (task 05): `new AutoSaveController<BrushDocument>(this.brushes, this.session, this.brushes.history, { save: (doc, name) => brushApi.save(doc, name!) , clock }, null)`.
  Import `brushApi` from `../api` (ApplicationStore already imports `SyncClient` from there).
- `BrushStore` deps (task 07): `{ session, onDocumentInstalled: (doc) => this.brushUI.adoptDocument(doc) }`.
  `BrushStructureStore`/`BrushPixelStore` deps take `source: this.brushUI` and `select: this.brushUI`.
- Mode: `this.lightingUI.studioMode` (`"brush"` from task 03).
- Tests: `stores/__tests__/computeds.test.ts:68 makeRig()` shows constructing `ApplicationStore`
  with `autoSaveEnabled: false` and a `projectHost`; `stores/session/__tests__/autoSaveGate.test.ts`
  shows `autoSaveEnabled: true` + `wireAutoSave()`; fake timers via `vi.useFakeTimers()`.
  MSW is active in the unit lane with `onUnhandledRequest: "error"` — pass a spy `save` through
  options rather than letting the default hit the network. Add
  `options.brushAutoSave?: AutoSaveControllerOptions<BrushDocument>` for that.

## Steps
1. Add fields + construction:
   ```ts
   readonly brushUI: BrushUIStore;
   readonly brushes: BrushStore;
   readonly brushStructure: BrushStructureStore;
   readonly brushPixels: BrushPixelStore;
   readonly brushAutoSave: AutoSaveController<BrushDocument> | null;
   get activeHistory(): HistoryStore   // computed: studioMode === "brush" ? brushes.history : history
   ```
   `undo()`/`redo()` call `this.activeHistory.undo()/redo()` (keep any existing wrapping
   behaviour around the project path — read `:1527-1548` first and preserve it for the project case).
   Register `activeHistory` in the existing `makeObservable` map (`:734-748`).
2. `dispose()` also disposes `brushAutoSave`.
3. Do **not** call `brushes.init()` in the constructor — task 19's container does it on
   entering brush mode (avoids a network call for every pixel-studio boot and every test).
4. `brushWiring.test.ts`: (a) construct with `autoSaveEnabled: true`, spy `brushAutoSave.save`
   and spy project `autoSave.save`; install a document via `brushes.installDocument(createBrushDocument())`,
   set `brushes.loadState = "loaded"` (via `runInAction`), select frame/layer, `brushPixels.setCells([...])`,
   advance 500 ms → brush spy called once with the document and name, project spy **not** called;
   (b) `lightingUI.setStudioMode("brush")` → `activeHistory === brushes.history`; `undo()` undoes
   the cell write and `history.index` (project) unchanged; back to `"pixel"` → `activeHistory === history`;
   (c) `dispose()` disposes both controllers (spy on `dispose`).
5. Commit: `brush-studio(11): wire brush stores, autosave and history routing into ApplicationStore`.

## Constraints
- Do not reorder existing construction; append only.
- Do not change project autosave behaviour; `autoSaveGate.test.ts` and all existing tests must pass untouched.
- Do not touch `context.tsx`, containers, or `UIStore`.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/stores
cd client && bunx vitest run                 # whole suite — the app-store constructor is exercised everywhere
cd client && bun run lint:boundaries
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Paste the full-suite summary.

## Definition of done
- [ ] Five new members + `activeHistory`; undo/redo routed; dispose complete.
- [ ] Wiring tests a–c pass; full suite green with no snapshot diffs.
- [ ] One commit with only Touches files.
