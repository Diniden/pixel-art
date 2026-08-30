# 01 — `CanvasViewsUIStore`: split state + the Layer-mode camera

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/stores/ui/CanvasCameraStore.ts` (new) · `client/src/stores/ui/CanvasViewsUIStore.ts` (new) · `client/src/stores/ui/__tests__/CanvasViewsUIStore.test.ts` (new) · `client/src/stores/ui/ViewportUIStore.ts` · `client/src/stores/ApplicationStore.ts`
**Effort:** S

## Objective
The application store owns `app.canvasViews: CanvasViewsUIStore` — the session-only record of
which render modes are open (`full` / `layer`), which one sits on the left, and a second,
independent camera (`layerCamera`) for the Layer Render Mode. `ViewportUIStore` is declared to
satisfy the same `CanvasCamera` interface, so a container can be handed *either* camera and not
know which. Nothing is persisted; the 151-snapshot corpus digests and `toPersistedUIState()` are
byte-identical.

## Context
- **Pattern:** MobX class store, `makeObservable` in the constructor, `observableRef` for
  wholesale-replaced objects, `action` for every mutator. The analogue to copy — nearly line for
  line in shape — is `client/src/stores/ui/CanvasInteractionStore.ts` (138 lines): a
  dependency-free store constructed directly by `ApplicationStore` at
  `client/src/stores/ApplicationStore.ts:487` (`this.canvasInteraction = new CanvasInteractionStore();`)
  with its member declared at `:383`. Do the same for `canvasViews`, immediately after that line.
- **The Full camera already exists.** `client/src/stores/ui/ViewportUIStore.ts` holds
  `panOffset` (`:41`, `observableRef`), `viewZoom` (`:63`, tri-state `number | undefined`,
  readers use `?? 1`), `setPanOffset` (`:137`), `setViewZoom` (`:142`, clamps 0.25–4) and
  `resetView(centeredPan)` (`:155`, sets `viewZoom = 1` and the pan). Those five members ARE the
  Full-mode camera and stay exactly where they are — they are persisted wire fields
  (`UIStore.ts:389-390, 502`). The `zoom` field (`:39`) is the **pixel scale** and is NOT part of
  the camera: both modes share it (locked decision D4 in `MASTER.md`).
- **Do not add new persisted keys.** `UIStore.toPersistedUIState()` is an explicit builder
  (`UIStore.ts:14-25`); it does not spread the viewport store, so new fields on
  `ViewportUIStore` would not leak — but this task adds none there anyway. The split state and
  the layer camera are session-only (D3).
- Two containers will read `app.canvasViews` concurrently (one per pane). Every field must be a
  scalar or an `observableRef`; nothing here is ever deep.

## Steps
1. Create `client/src/stores/ui/CanvasCameraStore.ts`:
   ```ts
   export interface CanvasCamera {
     readonly panOffset: { x: number; y: number };
     /** `undefined` = never zoomed; readers use `?? 1`. */
     readonly viewZoom: number | undefined;
     setPanOffset(offset: { x: number; y: number }): void;
     setViewZoom(zoom: number): void;
     resetView(centeredPan: { x: number; y: number }): void;
   }
   export class CanvasCameraStore implements CanvasCamera { … }
   ```
   `panOffset` is `observableRef` (initial `{ x: 0, y: 0 }`), `viewZoom` is `observable`
   (initial `undefined`). `setViewZoom` clamps with the same `Math.max(0.25, Math.min(4, z))` as
   `ViewportUIStore.setViewZoom`; `resetView` sets `viewZoom = 1` and replaces `panOffset`. Header
   comment: why this exists (a second camera for the Layer Render Mode; session-only; the Full
   camera is `ViewportUIStore`, which implements the same interface).
2. In `client/src/stores/ui/ViewportUIStore.ts` add `implements CanvasCamera` to the class
   declaration and the type import. **No other change to that file** — its members already
   satisfy the interface. If `tsc` disagrees, fix the interface, not the store.
3. Create `client/src/stores/ui/CanvasViewsUIStore.ts`:
   ```ts
   export type CanvasRenderMode = "full" | "layer";
   export class CanvasViewsUIStore {
     fullOpen = true;            // observable
     layerOpen = false;          // observable
     leftMode: CanvasRenderMode = "full";   // observable — which mode is the LEFT pane
     readonly layerCamera = new CanvasCameraStore();
     get bothOpen(): boolean
     get openModes(): CanvasRenderMode[]   // computed, in left→right order, length 1 or 2
     /** The ONE pane that owns the window keyboard map: "full" whenever it is open, else "layer". */
     get keyboardOwner(): CanvasRenderMode
     isOpen(mode): boolean
     openMode(mode: CanvasRenderMode): void   // sets the flag; a newly opened mode goes on the RIGHT
                                              // (leftMode = the mode that was already open)
     closeMode(mode: CanvasRenderMode): void  // refuses (no-op) when it is the only open mode
     swap(): void                             // flips leftMode; no-op unless bothOpen
   }
   ```
   `openMode` when the other mode is already open must set `leftMode` to the already-open mode
   so the new pane appears on the right (D6). `openMode` on an already-open mode is a no-op.
4. Wire it: in `ApplicationStore.ts` add `readonly canvasViews: CanvasViewsUIStore;` beside
   `:383` with a short doc comment, and `this.canvasViews = new CanvasViewsUIStore();` right after
   `:487`. Import at the top. Nothing else in `ApplicationStore` changes; do not add it to
   `UIStore` (it needs no deps and nothing depends on it — same reasoning as `canvasInteraction`).
5. Write `client/src/stores/ui/__tests__/CanvasViewsUIStore.test.ts` (node environment — no
   `.dom.` suffix), covering: defaults (`full` open, `layer` closed, `leftMode === "full"`,
   `openModes` is `["full"]`); `openMode("layer")` → `openModes` is `["full","layer"]`;
   `swap()` → `["layer","full"]`; `swap()` with one pane open is a no-op; `keyboardOwner` is
   `"full"` while Full is open and `"layer"` after `closeMode("full")`; `closeMode` of the last
   open pane is a no-op; opening the other mode after a close puts the new pane on the right;
   `layerCamera.setViewZoom(10)` clamps to 4 and `resetView` restores 1; `layerCamera.panOffset`
   is not a MobX proxy after `setPanOffset` (the `observableRef` contract — copy the
   `isObservable` assertion pattern from `CanvasInteractionStore.test.ts:30-60`); and a
   type-level check that `ViewportUIStore` is assignable to `CanvasCamera`
   (`const c: CanvasCamera = new ViewportUIStore();`).
6. Commit: `feat(stores): CanvasViewsUIStore with a session-only Layer-mode camera`.

## Constraints
- No new key in `toPersistedUIState()`; no change to `UIStore.ts`, no change to any codec.
- No persistence of any kind for this store (no `localStorage`, no `uiState`).
- Do not touch `ViewportUIStore` beyond the `implements` clause and its import.
- Do not touch `containers/` or `ui/` — those are tasks 05/06.

## Verification
```sh
cd client && bunx tsc --noEmit                       # clean
cd client && bunx vitest run src/stores              # all pass, new file included
cd client && bunx vitest run src/types src/test      # corpus digests: pass UNCHANGED (no -u, ever)
cd client && bunx eslint src/stores                  # 0 errors
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # (from repo root) prints nothing
```

## Definition of done
- [ ] `CanvasCameraStore.ts`, `CanvasViewsUIStore.ts` and the test file exist and pass.
- [ ] `ViewportUIStore implements CanvasCamera` compiles.
- [ ] `app.canvasViews` is constructed in `ApplicationStore` and `bun run dev` starts.
- [ ] `persistedUIState.test.ts`, `persistedUIVersion.test.ts` and the corpus suites pass with no
      snapshot change (`git status` shows no modified `__snapshots__`).
- [ ] One commit, only the five `Touches` files staged.
