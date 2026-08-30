# 07 — BrushStore (document lifecycle)

**Wave:** W3 · **Depends on:** 01, 04, 05
**Touches:** `client/src/stores/domain/BrushStore.ts` (new) · `client/src/stores/history/brushCommands.ts` (new) · `client/src/stores/domain/__tests__/BrushStore.test.ts` (new) · `client/src/stores/history/__tests__/brushCommands.test.ts` (new)
**Effort:** M

## Objective
A MobX store owns the loaded brush document as an `observable.ref`, its name, the brush list,
a four-state load machine, three version counters, and its **own** `HistoryStore`; it exposes
flows to init/list/load/create/switch/rename/delete and a `commit()` primitive that records a
whole-document snapshot command. It satisfies `AutoSaveDocument<BrushDocument>`.

## Context
- Mirror `client/src/stores/domain/DomainStore.ts`: observables `:139-209` (`loadState`,
  `loadError`, `projectName`, `projectList` (shallow), `domainVersion`, `pixelVersion`,
  `loadGeneration`), `makeObservable` map `:217-246` (explicit annotations — **never
  `makeAutoObservable`**), flows `:508-759` with the `session.setSaveSuspended(true) … finally
  false` bracketing, `initProject`'s StrictMode guard `:509`, the **no default-document fallback
  in `catch`** rule `:529-536` (R5), `serialize :467`.
- `AutoSaveDocument<TDoc>` from task 05 (`stores/session/AutoSaveController.ts`): needs
  `loadState`, `loadGeneration`, `domainVersion`, `pixelVersion`, `saveName`, `serialize()`.
- History: `stores/history/HistoryStore.ts` (`new HistoryStore()`, `record :229`, `snapshot :243`
  via `setSnapshotProvider :173`, `undo/redo :251-263`, `isReplaying :89`). Commands:
  `stores/history/commands.ts:38 Command`, `:53 SnapshotCommand`, `:63 SnapshotHost`,
  `:145 createSnapshotCommand` — typed to `Project`, so write a brush-specific twin.
- API: `brushApi` from `../../api` (task 04). `brushApi.get()` returns raw `unknown` → run
  `normalizeBrushDocument` (task 01); `null` → treat as a load failure (`loadState: "failed"`,
  `loadError` an `ApiError` of kind `"unknown"` — construct via the exported `ApiError` class).
- ESLint: `stores/domain/**` may not import `stores/ui/**`. Callbacks are injected.
- Test rigs: `stores/domain/__tests__/loadProject.test.ts` (bare-store pattern with a fake
  api) and `stores/session/__tests__/autoSaveController.test.ts`.

## Steps
1. `stores/history/brushCommands.ts`:
   ```ts
   export interface BrushSnapshotHost { current(): BrushDocument | null; restore(doc: BrushDocument): void }
   export function estimateBrushBytes(doc: BrushDocument): number   // frames*layers*w*h*10 + 256, never walks cells
   export function createBrushSnapshotCommand(o: { label: string; before: BrushDocument; host: BrushSnapshotHost }): Command & { before: BrushDocument }
   export interface BrushPatch { x: number; y: number; before: BrushCell; after: BrushCell }
   export interface BrushPixelTarget { frameId: string; layerId: string }
   export interface BrushPatchHost { applyPatch(target: BrushPixelTarget, cells: readonly BrushPatch[], direction: "undo" | "redo"): void }
   export function createBrushPixelCommand(o: { label: string; target: BrushPixelTarget; cells: readonly BrushPatch[]; host: BrushPatchHost }): Command & { kind: "brush-pixel"; target; cells }
   ```
   Snapshot `undo` = capture `host.current()` as `after` on first undo, `restore(before)`;
   `redo` = `restore(after)`. Pixel command: `undo` applies cells reversed with `direction: "undo"`,
   `redo` forward (mirror `PixelStore.ts:613-648`). `bytes` = `cells.length * 40 + 128`.
2. `stores/domain/BrushStore.ts`:
   ```ts
   export interface BrushApiLike { list(); get(name); save(doc, name); create(name, doc?); rename(a, b); remove(name) }
   export interface BrushStoreDeps { session: SessionStore; api?: BrushApiLike; history?: HistoryStore; onDocumentInstalled?: (doc: BrushDocument | null) => void }
   export class BrushStore implements AutoSaveDocument<BrushDocument> {
     loadState: LoadState = "idle"; loadError: ApiError | null = null;   // observable / observable.ref
     brushName = ""; brushList: string[] = [];                           // observable / observable.shallow
     document: BrushDocument | null = null;                              // observable.ref  ⚠️ NEVER deep
     domainVersion = 0; pixelVersion = 0; loadGeneration = 0;            // observable
     readonly history: HistoryStore;                                     // own instance
     get hasBrush(): boolean; get saveName(): string; get isLoading(): boolean;
     serialize(): BrushDocument | null                                   // returns `document` (already plain)
     adoptDocument(doc: BrushDocument | null): void                      // the single writer of `document`; calls onDocumentInstalled
     installDocument(doc): void   // adopt + history.clear() + loadGeneration++
     replaceDocument(doc, opts: { bumpPixels?: boolean }): void          // adopt + domainVersion++ (+ pixelVersion++)
     commit(label: string, mutate: (doc: BrushDocument) => BrushDocument): void
       // before = document; next = mutate(before); if next === before return;
       // history.record(createBrushSnapshotCommand({label, before, host})); replaceDocument(next)
       // host.restore = (d) => replaceDocument(d, {bumpPixels: true}) — while history.isReplaying, no command is recorded
     bumpPixelVersion(): void
     *init(): Generator          // guard like initProject; list; if list non-empty load list[0]; never throws
     *loadBrush(name): Generator // api.get → normalize → installDocument; sets loadState
     *createBrush(name, width, height): Generator<…, boolean>  // api.create(name, createBrushDocument(w,h)) → refresh list → loadBrush
     *switchBrush(name): Generator<…, boolean>
     *renameBrush(newName): Generator<…, boolean>
     *deleteBrush(): Generator<…, boolean>   // then load first remaining or adopt(null) with loadState "idle"
     *refreshList(): Generator
   }
   ```
   All flows bracket `session.setSaveSuspended(true/false)` exactly like `DomainStore`.
3. Tests, `brushCommands.test.ts`: snapshot undo/redo round-trip; pixel command undo applies
   reversed order; bytes estimates positive and cell-count-linear.
   `BrushStore.test.ts` with a fake in-memory `BrushApiLike`: `init` with empty list → `idle`,
   `document === null`; with `["b","a"]` → loads `"a"`… no — loads **`list[0]` as returned by the
   API** (the server sorts; the store does not); `loadBrush` of a malformed payload →
   `loadState: "failed"` and `document` unchanged; `createBrush` calls api.create with a
   normalised 16×16 doc, then `document` is that doc and `loadGeneration` advanced; `commit`
   records one command, `domainVersion` +1, `document` replaced, undo restores the old
   reference, `pixelVersion` bumped by restore; a `commit` whose `mutate` returns the same
   object records nothing; `saveSuspended` is true during `switchBrush` and false after;
   `document` is not a MobX proxy (`isObservableObject(document) === false`) and grids are
   raw arrays; `AutoSaveController<BrushDocument>` wired to this store with a spy save fires
   after a `replaceDocument` (fake timers).
4. Commit: `brush-studio(07): BrushStore, brush snapshot & pixel commands`.

## Constraints
- Do not import `stores/ui/**`, `editorHistory.ts`, or `ApplicationStore.ts`.
- Do not record into the shared `editorHistory`.
- Do not modify `DomainStore.ts`, `commands.ts`, `HistoryStore.ts`.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/stores
cd client && bunx vitest run src/stores
cd client && bun run lint:boundaries
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```

## Definition of done
- [ ] `BrushStore` and `brushCommands` exported with the shapes above; `document` is `observable.ref`.
- [ ] Listed tests pass, including the proxy/raw-grid assertion and the autosave wiring test.
- [ ] Gate green; one commit with only Touches files.
