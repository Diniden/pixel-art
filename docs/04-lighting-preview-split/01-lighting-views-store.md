# 01 — `LightingViewsUIStore`: split state + the Preview camera

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/stores/ui/LightingViewsUIStore.ts` (new) · `client/src/stores/ui/__tests__/LightingViewsUIStore.test.ts` (new) · `client/src/stores/ApplicationStore.ts`
**Effort:** S

## Objective
The application store owns `app.lightingViews: LightingViewsUIStore` — the session-only record
of which lighting render modes are open (`edit` / `preview`), which sits on the left, and an
independent camera for **each** pane. Nothing is persisted; `toPersistedUIState()` and the
151-snapshot corpus digests are byte-identical.

## Context
- **The analogue is `client/src/stores/ui/CanvasViewsUIStore.ts` (107 lines).** Read it first —
  this store is the same shape with two differences, both mandated by `MASTER.md` D2/D3:
  1. Its modes are `"edit" | "preview"`, not `"full" | "layer"`.
  2. It owns **two** `CanvasCameraStore`s, not one. In the pixel studio the Full pane's camera is
     the persisted `ViewportUIStore`; the lighting studio has **no persisted camera at all**
     (measured: `containers/LightingCanvasContainer.tsx:241-252` passes a hard-coded
     `panOffset: {x:0,y:0}`, no `onCommitPan`, no `viewZoom`, no `onCommitViewZoom` — its pan and
     view zoom are local to `useCanvasViewport` and die on reload). So **both** lighting panes get
     a `CanvasCameraStore`, and neither is persisted. This is not a regression: the lighting view
     transform is session-only today.
- `client/src/stores/ui/CanvasCameraStore.ts` already exports what you need — do **not** write a
  second camera class:
  ```ts
  export interface CanvasCamera {
    readonly panOffset: { x: number; y: number };
    readonly viewZoom: number | undefined;   // `undefined` = never zoomed; readers use `?? 1`
    setPanOffset(offset: { x: number; y: number }): void;
    setViewZoom(zoom: number): void;         // clamps 0.25–4
    resetView(centeredPan: { x: number; y: number }): void;
  }
  export class CanvasCameraStore implements CanvasCamera { … }
  ```
  `panOffset` is `observableRef`, `viewZoom` is `observable`. Import both from
  `./CanvasCameraStore`.
- **Wiring precedent:** `CanvasViewsUIStore` is declared at `stores/ApplicationStore.ts:391`
  (`readonly canvasViews: CanvasViewsUIStore;`) and constructed at `:497`
  (`this.canvasViews = new CanvasViewsUIStore();`) — a dependency-free store built directly by
  `ApplicationStore`, exactly like `canvasInteraction` (`:383`/`:487`). Do the same immediately
  after `canvasViews` in both places.
- Two containers will read this store concurrently (one per pane). Every field is a scalar or an
  `observableRef` inside a camera; nothing here is ever deep.
- ⚠️ The lighting **pixel scale** stays `app.ui.viewport.zoom` (shared, persisted, read at
  `LightingCanvasContainer.tsx:191`). It is **not** part of `CanvasCamera` and must not appear in
  this store. See D4.

## Steps
1. Create `client/src/stores/ui/LightingViewsUIStore.ts`. Header comment in house style (dated
   block name, the one ⚠️: nothing here is persisted and nothing here may be deep; a reload
   returns to a single Edit pane).
   ```ts
   export type LightingRenderMode = "edit" | "preview";

   export class LightingViewsUIStore {
     editOpen = true;              // observable
     previewOpen = false;          // observable
     leftMode: LightingRenderMode = "edit";  // observable — which mode is the LEFT pane
     /** Both panes are session-only: the lighting studio has never persisted a camera. */
     readonly editCamera = new CanvasCameraStore();
     readonly previewCamera = new CanvasCameraStore();

     get bothOpen(): boolean
     get openModes(): LightingRenderMode[]      // computed, left→right, length 1 or 2
     /** The ONE pane that owns the window keyboard map: "edit" whenever it is open, else "preview". */
     get keyboardOwner(): LightingRenderMode
     cameraFor(mode: LightingRenderMode): CanvasCamera
     isOpen(mode): boolean
     openMode(mode): void      // new pane goes on the RIGHT (leftMode = the already-open mode)
     closeMode(mode): void     // no-op when it is the only open mode
     swap(): void              // flips leftMode; no-op unless bothOpen
   }
   ```
   Mirror `CanvasViewsUIStore.ts:61-106` method for method; `openMode` on an already-open mode is
   a no-op. `cameraFor` is the one addition — it keeps the mode→camera choice in the store rather
   than repeating a ternary in two containers.
2. Wire it in `ApplicationStore.ts`: `readonly lightingViews: LightingViewsUIStore;` beside
   `canvasViews` (`:391`) with a short doc comment, and
   `this.lightingViews = new LightingViewsUIStore();` right after `:497`. Import at the top.
   Nothing else in `ApplicationStore` changes; do **not** add it to `UIStore`.
3. Write `client/src/stores/ui/__tests__/LightingViewsUIStore.test.ts` (node env — **no** `.dom.`
   suffix). Copy the case list from `stores/ui/__tests__/CanvasViewsUIStore.test.ts` and adapt:
   defaults (`edit` open, `preview` closed, `leftMode === "edit"`, `openModes` is `["edit"]`);
   `openMode("preview")` → `["edit","preview"]`; `swap()` → `["preview","edit"]`; `swap()` with one
   pane open is a no-op; `keyboardOwner` is `"edit"` while Edit is open and `"preview"` after
   `closeMode("edit")`; `closeMode` of the last open pane is a no-op; opening the other mode after
   a close puts the new pane on the right; **`cameraFor("edit") !== cameraFor("preview")`** and
   each is stable across calls; `previewCamera.setViewZoom(10)` clamps to 4 and `resetView`
   restores 1; `previewCamera.panOffset` is not a MobX proxy after `setPanOffset` (copy the
   `isObservable` assertion from `CanvasViewsUIStore.test.ts:124`).
4. Commit: `feat(stores): LightingViewsUIStore with per-pane session-only cameras`.

## Constraints
- No new key in `toPersistedUIState()`; no change to `UIStore.ts`, `ViewportUIStore.ts`, or any
  codec. Adding one would touch the 151-snapshot corpus.
- No persistence of any kind (no `localStorage`, no `uiState`).
- Do not write a second camera class — import `CanvasCameraStore`.
- Do not touch `containers/` or `ui/` — those are tasks 03–06.

## Verification
```sh
cd client && bunx tsc --noEmit                       # clean
cd client && bunx vitest run src/stores              # all pass, new file included
cd client && bunx vitest run src/types src/test      # corpus digests: pass UNCHANGED (no -u, ever)
cd client && bunx eslint src/stores                  # 0 errors
cd client && bunx prettier --check src/stores/ui/LightingViewsUIStore.ts src/stores/ui/__tests__/LightingViewsUIStore.test.ts
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # (from repo root) prints nothing
```

## Definition of done
- [ ] `LightingViewsUIStore.ts` and its test file exist and pass.
- [ ] `app.lightingViews` is constructed in `ApplicationStore`.
- [ ] `persistedUIState.test.ts`, `persistedUIVersion.test.ts` and the corpus suites pass with no
      snapshot change (`git status` shows no modified `__snapshots__`).
- [ ] One commit, only the three `Touches` files staged.
