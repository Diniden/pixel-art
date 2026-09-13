# 04 — `app.brushViews`: a second `CanvasViewsUIStore` for the brush split view

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/stores/ApplicationStore.ts` · `client/src/stores/__tests__/brushWiring.test.ts`
**Effort:** S

## Objective
`ApplicationStore` owns `brushViews: CanvasViewsUIStore`, a second, independent instance of
the pane store the pixel studio uses, so the brush studio can open Full / Layer panes without
touching the pixel studio's `canvasViews`. Nothing else changes.

## Context
- `stores/ui/CanvasViewsUIStore.ts` (138 lines) is already generic: `fullOpen`, `layerOpen`,
  `leftMode`, `readonly layerCamera = new CanvasCameraStore()` (`:38-43`), computeds
  `bothOpen :62`, `openModes :67-72`, `keyboardOwner :75-77`, actions `openMode :88-94`
  (new pane goes right), `closeMode :97-101` (refuses the last), `swap :134-137`,
  `presentVariantPanes :127-131` (pixel-only concern; the brush never calls it). Nothing is
  persisted (`:11-22`).
- `ApplicationStore.ts`: the pixel instance is constructed somewhere in the ctor — grep
  `new CanvasViewsUIStore`. Brush stores are constructed after `selectionUI` and before
  `makeObservable`/`autoSave` (plan 01 task 11; grep `this.brushUI = new BrushUIStore`). Append
  `this.brushViews = new CanvasViewsUIStore();` right after the four brush stores. Construction
  order is load-bearing — append only, move nothing.
- `stores/__tests__/brushWiring.test.ts` is the rig (constructs `ApplicationStore` with
  `autoSaveEnabled` and spies); add one `describe`.

## Steps
1. Declare `readonly brushViews: CanvasViewsUIStore;` beside the other brush members with a
   comment: "the brush studio's Full/Layer pane state (docs/11-brush-studio-followups task 09
   consumes it); independent of `canvasViews`; layer pane camera = `brushViews.layerCamera`,
   full pane camera = `brushUI`."
2. Construct it as above. No `makeObservable` entry needed (the child is its own observable).
3. Test: `app.brushViews !== app.canvasViews`; `brushViews.openMode("layer")` leaves
   `canvasViews.openModes` untouched; `brushViews.layerCamera !== canvasViews.layerCamera`.
4. Commit: `brush-followups(04): app.brushViews pane store`.

## Constraints
- Do not reorder existing construction; do not touch `context.tsx`, containers, or `UIStore`.
- All existing tests pass untouched.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/stores
cd client && bunx vitest run src/stores/__tests__/brushWiring.test.ts src/stores/__tests__   # then the whole suite once
cd client && bunx vitest run
cd client && bun run lint:boundaries
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```

## Definition of done
- [ ] `app.brushViews` exists, constructed after the brush stores; test added.
- [ ] Full suite green; one commit with only the two files.
