# Split Canvas Render Modes — MASTER plan

Planned 2026-08-29 against branch `feat/rail-layout-controls` (HEAD `37a4bce`). Executed by
`/plan-go`, one fresh agent per task. **Read this file, `CLAUDE.md`, and your task file. Nothing
else is required; nothing else is assumed.**

---

## 1. Request

Verbatim:

> I have some big changes to take care of for the canvas editor:
> - The current editing shows all layers combined together with the variant space being rendered
>   within the region it is to appear. We will call this editor the Full Render Mode.
> - We need an additional editor mode to be where we JUST get the workspace and canvas size of the
>   variant/layer itself. We will call this Layer Render Mode.
> - Every render mode get's it's own camera and pinch and zoom space and zoom reset button
> - If one or the other mode is not currently open yet -> there will be a button to open the other
>   mode. The button will always be above the zoom reset button for that view.
> - Opening the other mode will split the editor/canvas space
> - Full render mode needs additional buttons along the bottom (small like the zoom reset) that are
>   arrows for adjusting variant offsets when it's a variant (mimicks the WASD functionality)
> - When both modes are open, the mode opening button will turn into a swap button that let's us
>   swap which side the editor mode takes up in the editor region.
> - Remember both modes will let us edit the pixel data but with the differing views. Editing one
>   should see the edit in the other immediately.

### Interpretation

The existing `CanvasContainer` becomes parameterised by a `renderMode` (`"full" | "layer"`). The
pixel studio's canvas region renders one or two instances of it side by side. **Full** is
today's view, untouched. **Layer** renders only the editable grid — the selected variant's own
`gridSize` canvas (all of that variant frame's layers, at origin, no offset, no object union, no
dimming) or, for a regular layer, that one layer on the object-sized grid. Each instance has its
own camera (`panOffset` + `viewZoom`) and its own floating control cluster: a mode button
(open-other / swap) on top, a close button when two panes are open, the existing zoom-reset,
and — in Full mode with a variant selected — four arrow buttons that call the same undoable
`setVariantOffset` action WASD calls. Pixel writes go through the one `PixelStore`; both panes
redraw from the one `pixelVersion` counter, so edits are visible in both on the next frame.

### Assumptions made where the request was ambiguous

| Ambiguity | Decision |
| --- | --- |
| How does a pane get closed once both are open? | A **close** button per pane, between the mode/swap button and reset, shown only when both are open. The last open pane cannot be closed. (Requested behaviour did not say; without it the split is a one-way door.) |
| What does Layer mode show for a **non-variant** layer? | Only the current layer's pixels, on the object-sized grid. "JUST the layer itself." |
| What does Layer mode show for a **variant** layer? | All layers of the selected variant frame (`currentVariant.variantFrame.layers`), at origin, on `variant.gridSize`. That is the set the Full view composites for that variant; `editableGrid` writes `layers[0]`. |
| Is the pixel scale (`zoom`, 1–50) per pane? | **No.** "Camera" = pan + view zoom. `zoom` is a per-sprite setting chosen in the toolbar/CanvasInfo and is shared. |
| Is the split / the Layer camera persisted? | **No.** Session-only. A reload comes back to a single Full pane. The Full camera keeps persisting exactly as today. Adding keys to the wire format touches the 151-snapshot corpus and was not asked for. |
| Reference-image / frame-reference overlays and the origin cross in Layer mode | Object-space aids; hidden in Layer mode (origin cross hidden only when a variant is selected — for a regular layer the grid *is* the object). |
| Arrow-button modifier | Shift-click = `allFrames`, mirroring Shift+WASD exactly (`useCanvasKeyboard.ts:224-225` passes the shift flag through; the store treats it as "all frames"). |
| Which side a newly opened pane appears on | The right. The pane that was already open stays left. |
| Portrait / narrow screens | Panes stack vertically under `@media (orientation: portrait)`. No draggable divider, 50/50 only. |
| Keyboard map with two panes | Exactly one pane owns `useCanvasKeyboard` (Full if open, else Layer) — otherwise every WASD press and ⌘Z would fire twice. |

---

## 2. Outcome

When every wave is DONE the owner can:

1. Load the app and see the editor exactly as before, plus an **Open Layer view** button directly
   above the zoom-reset button (and, with a variant layer selected, a bottom row of `← ↑ ↓ →`).
2. Click **Open Layer view** → the canvas region splits; the right pane shows only the selected
   variant's / layer's own canvas at its own size.
3. Pan, ctrl+wheel and pinch each pane independently; press each pane's reset independently.
4. Draw in either pane and see the edit in the other immediately; undo once undoes once.
5. Click **Swap** (the mode button when both are open) to exchange sides without either canvas
   remounting; click **Close** on either pane to return to one pane.
6. Click the arrows (or shift-click for all frames) to nudge the variant offset exactly as WASD
   does, with one undo entry per press.
7. Run the full gate green with the corpus digests **unchanged**.

---

## 3. Locked decisions

| # | Decision | Value |
| --- | --- | --- |
| D1 | Mode type | `export type CanvasRenderMode = "full" \| "layer"` in `client/src/stores/ui/CanvasViewsUIStore.ts`. `ui/` never imports it — pure components take strings/callbacks. |
| D2 | Camera interface | `CanvasCamera { panOffset; viewZoom; setPanOffset; setViewZoom; resetView }` in new `stores/ui/CanvasCameraStore.ts`. `ViewportUIStore implements CanvasCamera` (Full). `CanvasCameraStore` (Layer). `zoom` (pixel scale) is **not** in the interface — shared. |
| D3 | Persistence | None for split state or the Layer camera. No new key in `toPersistedUIState()`. No `localStorage`. |
| D4 | Pixel scale | `ViewportUIStore.zoom` stays the single shared pixel scale for both panes. |
| D5 | Store home | `app.canvasViews: CanvasViewsUIStore` constructed directly by `ApplicationStore` beside `canvasInteraction` (`ApplicationStore.ts:487`). Not on `UIStore`. |
| D6 | Split state | `fullOpen`, `layerOpen`, `leftMode`; computeds `bothOpen`, `openModes` (left→right), `keyboardOwner`; actions `openMode` (new pane on the right), `closeMode` (refuses the last), `swap` (no-op unless both). |
| D7 | Split layout | New pure `ui/components/CanvasSplit` — `panes: {key,node}[]`, flex row 50/50, 1px token divider, portrait → column. No drag, no ratio. Pane `key` = mode string; swap reorders, never remounts. |
| D8 | Controls layout | `CanvasViewControls` becomes a bottom-anchored row: `__stack` column (mode → close? → reset) + optional `__offsets` row (`← ↑ ↓ →`). All buttons share `canvas-view-controls__btn`. Props: `modeButton?: {kind:"open"\|"swap", label, onClick}`, `onClose?: {label,onClick}`, `onNudgeOffset?: (dx,dy,allFrames)`. |
| D9 | Floating panels | `.canvas-area` remains the single `<main>`; reference/frame panels keep positioning against the whole region. Accepted. |
| D10 | Layer render | New pure `ui/canvas/render/renderLayerView.ts` `drawLayerView(ctx, …)` — `fillRect` technique like the Full render (not `renderScene`'s buffer compositor), full opacity, no offset. |
| D11 | Container API | `CanvasContainer` gains one prop, `renderMode?: CanvasRenderMode` (default `"full"`); it derives camera, controls and keyboard ownership from `app.canvasViews` itself. |
| D12 | Keyboard | `useCanvasKeyboard` gains `enabled?: boolean` (default true); the container passes `enabled: views.keyboardOwner === renderMode`. Window capture registration unchanged. |
| D13 | Layer-mode geometry | `useCanvasGeometry` is called with `editingVariant: false` and `objWidth/objHeight = gridWidth/gridHeight`. No new geometry code. |
| D14 | Icons | lucide: `Columns2` (open), `ArrowLeftRight` (swap), `X` (close), `ArrowLeft/Up/Down/Right`, size 14 like `Locate`. |
| D15 | Naming | `CanvasRenderMode`, `CanvasCamera`, `CanvasCameraStore`, `CanvasViewsUIStore`, `CanvasSplit`, `drawLayerView`. Avoid "viewport" for the new things — `ViewportUIStore` already means the persisted Full camera + view flags. |

---

## 4. Ground truth (measured 2026-08-29)

### Refresh state
The 38-task refresh has landed; `REFRESH/` is deleted in the working tree. Everything this plan
touches is MobX + `ui/` + `containers/` + BEM. No Zustand remains in the touched paths.

### ⚠️ Dirty worktree
Branch `feat/rail-layout-controls` has **163 uncommitted paths** (deleted `REFRESH*/`, Other-Hand
rail, iOS companion, `.gitignore`, …) — the owner's in-flight work. **Executors stage only the
files in their `Touches` list** (`git add <paths>`), never `git add -A`.

### Gate baseline (run 2026-08-29, `client/`)
| Command | Result |
| --- | --- |
| `bunx tsc --noEmit` | clean |
| `bunx eslint .` | 0 errors, 64 warnings |
| `bunx vitest run` | 113 files, 1948 tests pass (72 s; corpus digests included) |
| `bun run lint:boundaries` | `OK — all 5 boundary rules hold` |
| `bunx stylelint "src/**/*.css"` | **2 pre-existing errors** (`src/ui/components/OtherHand/OtherHand.css:267,288`, untracked, not ours) + 66 warnings. Gate = no *new* errors. |
| `bunx storybook build` | works (recorded in `docs/01-brush-studio/MASTER.md`); `storybook dev` does not — use `bun run storybook`. |
| `cd server && bunx tsc --noEmit` | clean |
| lockfile check | none present; `bunx` did not create one this time — check anyway. |

`bun run verify` (root) = typecheck + lint + format:check + client test + build. It does **not**
run `lint:boundaries`, `lint:css` or storybook — waves list those explicitly.

### Key code facts (paths relative to `client/src/`)
- **Camera.** `stores/ui/ViewportUIStore.ts`: `zoom :39` (pixel scale, 1–50, shared), `panOffset :41`
  (`observableRef`), `viewZoom :63` (tri-state, `?? 1`), `setPanOffset :137`, `setViewZoom :142`
  (clamp 0.25–4), `resetView(centeredPan) :155`. Single instance (`ApplicationStore.ts:463`),
  shared by pixel and lighting canvases. Persisted at `stores/ui/UIStore.ts:389-390` (zoom, pan)
  and `:502` (`viewZoom`, conditional). Builder is explicit, never a spread (`:14-25`).
- **Engine.** `ui/hooks/useCanvasViewport.ts` (607 lines) — fully per-instance: local state seeded
  from `panOffset`/`viewZoom` props, `onCommitPan`/`onCommitViewZoom` sinks, native non-passive
  wheel + touch listeners bound on `containerRef`, `resyncKey`. Two call sites today:
  `containers/CanvasContainer.tsx:601-614` and `LightingCanvasContainer.tsx:247-251`.
- **Geometry.** `ui/hooks/useCanvasGeometry.ts:120` — view union only when `editingVariant`;
  otherwise the grid at (0,0). `coords.ts:76 screenToPixel` maps through the rect, branches on
  `editingVariant`. `CanvasContainer.tsx:533-564` resolves `gridWidth` = variant grid when
  editing a variant, else object grid; `isEditingVariantResolved :543`.
- **Store computeds.** `stores/ApplicationStore.ts`: `currentObject :973`, `currentFrame :979`,
  `currentLayer :987`, `currentVariant :1013` (`{variantGroup, variant, variantFrame,
  baseFrameIndex, offset}`), `selectedVariantLayer :1051`, `isEditingVariant :1064`
  (`currentLayer.isVariant === true` — can be true with `currentVariant === null`),
  `editableGrid :1099` (variant → `variantFrame.layers[0].pixels` + `variant.gridSize`).
- **Render.** `CanvasContainer.tsx:708 render` (`fillRect`, verbatim legacy; deliberately not
  `renderScene`, see `:698-707`): variant-edit branch `:734-894`, normal branch `:895-976`
  (`ensureGridCanvas()` blit `:974`), selection/lasso/ants tail `:978-1068`, origin cross
  `:1069-1078`; `useCanvasRender(render, [render, pixelVersion]) :1570`; `pixelVersion :400`.
  Overlays: `renderOverlay :1354`, `drawOverlayCanvas :1422`, `renderFrameOverlay/…Trace :1510-1535`.
  Hover: `applyMarker :1195`, `renderHover :1251`, `usePencilHover :1323`.
- **Actions.** `CanvasContainer.tsx:453-530 actions` memo; `setVariantOffset :515` →
  `stores/domain/VariantStore.ts:863 setVariantOffset(dx, dy, allFrames = false)` (undoable,
  `"Set variant offset"`, writes only `variantOffsets[selectedVariantId]`).
- **Keyboard.** `ui/hooks/useCanvasKeyboard.ts`: options `:104-136`, handler `:151`, WASD branch
  `:208-232` (`setVariantOffset(dx, dy, e.shiftKey)`), window capture registration `:306-320`
  (load-bearing order). Container call `CanvasContainer.tsx:1588-1625`. Tests
  `ui/hooks/__tests__/useCanvasKeyboard.dom.test.ts:220,235`.
- **Surface / controls.** `ui/components/CanvasSurface/CanvasSurface.tsx:78-149` props,
  `viewControls` rendered as a child of `.canvas__viewport` (`:246`, `position: relative` — the
  real containing block). `ui/components/CanvasViewControls/` (57-line tsx + css; one prop
  `onResetView`; bottom-left absolute column; no story/test). `handleResetView
  :2582-2601`; `viewControls={…} :2631`.
- **Layout.** `containers/PixelStudioContainer.tsx:177-181` renders the one `CanvasContainer`
  into `ui/layouts/PixelStudioLayout/PixelStudioLayout.tsx`'s `canvas` slot → first child of
  `AppShell`'s `.app__canvas-stack` (`AppShell.css:160-168`, column flex). `<main>` carries
  `app__canvas-area` + legacy `canvas-area` (8 `document.querySelector(".canvas-area")` sites in
  the reference panels). **No split-pane pattern exists anywhere in `client/src`.**
- **Transient gesture state.** `stores/ui/CanvasInteractionStore.ts` (138 lines): `isDrawing`,
  `drawStartPoint`, `previewPixels` (`observableRef`). Single instance `app.canvasInteraction`
  (`ApplicationStore.ts:383,487`) — the analogue for the new store's shape and wiring.
- **Icons.** `ui/primitives/Icon/Icon.tsx` takes any `LucideIcon` component (`lucide-react@0.575.0`).
- **Tests/stories precedent.** `ui/components/CanvasSurface/CanvasSurface.stories.tsx` +
  `__tests__/CanvasSurface.dom.test.tsx` (`composeStories`, no provider); render painters tested
  with a recording fake ctx (`ui/canvas/render/__tests__/renderOriginCross.test.ts`, fixtures in
  `__tests__/fixtures.ts`); `stores/ui/__tests__/CanvasInteractionStore.test.ts` (`observableRef`
  contract). Vitest: `*.test.ts` = node, `*.dom.test.ts(x)` = jsdom.
- **ESLint boundaries** `client/eslint.config.js`: `src/ui/**` may not import stores/api/mobx/
  `useContext`; `mobx-react-lite` only in `src/containers/**`; `max-lines` 400 = error in
  `src/ui/**`, warning elsewhere.
- **Tokens** (`styles/tokens.css`): `--space-2/3`, `--radius-md`, `--z-overlay-control`,
  `--border-primary`, `--bg-elevated`, `--bg-tertiary`, `--accent-primary`, `--text-secondary`,
  `--shadow-md`, `--transition-fast`. No control-size tokens exist; sizes come from padding.

---

## 5. Wave table

| Wave | Tasks | Parallel | Gate before next wave |
| --- | --- | --- | --- |
| W1 | 01 store, 02 view controls, 03 CanvasSplit, 04 layer painter + keyboard gate | 4 | `cd client && bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run lint:boundaries && bunx stylelint "src/**/*.css"` (no new errors) `&& bunx storybook build`; corpus digests unchanged; no lockfile |
| W2 | 05 CanvasContainer render mode | 1 | same client gate (storybook optional); manual checks in task 05 |
| W3 | 06 PixelStudio wiring + manual checklist | 1 | full client gate + `cd server && bunx tsc --noEmit` + `bun run verify` (root); all 11 manual checks |

---

## 6. Dependency graph

```
01 store ─────┐
02 controls ──┼──► 05 CanvasContainer ──► 06 wiring
04 painter ───┘                            ▲
03 CanvasSplit ────────────────────────────┘
```

- 01, 02, 03, 04: no dependencies.
- 05 depends on 01 (`CanvasCamera`, `CanvasViewsUIStore`), 02 (new props), 04 (`drawLayerView`, `enabled`).
- 06 depends on 03 (`CanvasSplit`) and 05 (`renderMode` prop).

---

## 7. Collision matrix (W1)

| Task | Touches |
| --- | --- |
| 01 | `stores/ui/CanvasCameraStore.ts` (new) · `stores/ui/CanvasViewsUIStore.ts` (new) · `stores/ui/__tests__/CanvasViewsUIStore.test.ts` (new) · `stores/ui/ViewportUIStore.ts` · `stores/ApplicationStore.ts` |
| 02 | `ui/components/CanvasViewControls/CanvasViewControls.tsx` · `…/CanvasViewControls.css` · `…/CanvasViewControls.stories.tsx` (new) · `…/__tests__/CanvasViewControls.dom.test.tsx` (new) |
| 03 | `ui/components/CanvasSplit/CanvasSplit.tsx` (new) · `…/CanvasSplit.css` (new) · `…/CanvasSplit.stories.tsx` (new) · `…/__tests__/CanvasSplit.dom.test.tsx` (new) |
| 04 | `ui/canvas/render/renderLayerView.ts` (new) · `ui/canvas/render/__tests__/renderLayerView.test.ts` (new) · `ui/hooks/useCanvasKeyboard.ts` · `ui/hooks/__tests__/useCanvasKeyboard.dom.test.ts` |

Pairwise disjoint: 01 is stores-only; 02 and 03 are separate component folders; 04 is
`ui/canvas/render` + `ui/hooks`. No file appears twice. W2 and W3 are single-task waves.

---

## 8. Alignment guide

- **Two zooms.** `zoom` = pixel scale (shared, persisted, untouched). `viewZoom` + `panOffset` =
  the camera (per pane). If you find yourself giving the Layer pane its own `zoom`, stop.
- **The Full view must not change by a pixel.** `renderMode` defaults to `"full"`, and with it
  every existing line in `CanvasContainer` runs exactly as before. Diff your change against that
  invariant before every commit.
- **`isEditingVariantResolved` is the switch.** In Layer mode it is forced `false`; that single
  flag already routes geometry, coordinates, background, selection and preview to "grid at
  origin". Do not add parallel `if (layerMode)` branches where that flag already does the work.
- **Imitate, don't invent.** New store ← `CanvasInteractionStore.ts`. New painter ←
  `renderOriginCross.ts` + its test. New component + story + DOM test ← `CanvasSurface/`.
  Comment style ← `CanvasViewControls.tsx` header (dated block name, one ⚠️, reasoning inline).
- **Boundaries.** `ui/` never imports a store, `mobx`, the API or `useContext`. `observer()`
  only in `containers/`. `CanvasSplit` and `CanvasViewControls` take strings and callbacks — the
  mode union stays in `stores/`.
- **Identity.** Pane `key` = mode. A swap is an array reorder. If a canvas flashes on swap, the
  key changed or something remounted — fix that, do not paper over it with effects.
- **One keyboard owner.** Two panes, one `enabled: true`. Test by pressing `W` with both panes
  open and reading `CanvasInfo`'s `Offset:` — it moves by exactly 1.
- **What done looks like.** Bottom-left of each pane: a column `[mode] [close?] [reset]` of
  identical square buttons; Full pane with a variant: `[←][↑][↓][→]` row to the right of the
  column. Two equal panes with a 1px divider. Drawing in one pane updates the other within a
  frame.
- **Most likely mistakes.** (1) Registering two keyboard maps. (2) Forgetting to gate the three
  overlay painters and the `show*` props in Layer mode (they draw object-space art over the
  wrong grid). (3) Leaving `viewport.resetView` hard-wired in `handleResetView`. (4) Adding a
  persisted key. (5) `git add -A` on the dirty worktree.

---

## 9. Risk register

| Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- |
| Editing `CanvasContainer` (2,634 lines) regresses the Full view | Medium | High | `renderMode` default; commit-per-step with manual Full-mode checks after each; `isEditingVariantResolved` as the single switch | 05 |
| Double keyboard handling with two panes (2× nudge, 2× undo) | High without D12 | High | `enabled` gate + `keyboardOwner`; manual check 6 | 04, 05, 06 |
| Corpus / persisted-UI drift | Low | Critical | No new persisted keys; run `persistedUIState`/corpus suites in W1 and W3; never `vitest -u` | 01, 06 |
| Deep-observing a grid via the new store or `drawLayerView` inputs | Low | High | Store holds no grid; painter receives `layer.pixels` by reference, redraw on `pixelVersion` | 01, 04, 05 |
| Swap remounts panes (cache loss, listener rebind, pan reset) | Medium | Medium | `key` = mode; DOM-identity test in 03; manual check 5 | 03, 06 |
| Overlays / origin cross drawn in Layer mode at object coordinates | Medium | Medium | Explicit guards + `show*` props false; manual check 2/9 | 05 |
| Floating reference panels look odd over a split | Medium | Low | Accepted (D9); note in report if the owner objects | 06 |
| Dirty worktree — staging the owner's files | Medium | High | `git add <paths>` only | all |

---

## 10. Rules for every executor

- **Bun only.** No `node`, no `npm`. After any `bunx`, run
  `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` from the repo root and delete
  any lockfile it created. Never use the frozen-lockfile flag.
- **Never run `vitest -u`.** If a snapshot or corpus digest differs, stop and report the diff.
- **Never touch** `server/src/data/**`, `server/exports/**`, `client/src/types/codecs/**`,
  `client/src/services/migrations/**`, `server/src/export/**`, or any `__snapshots__`.
- **Stay inside `Touches`.** If you need a file not listed, stop and report — the collision
  matrix depends on it.
- **Stage only your files.** `git add <paths>`; never `git add -A` / `git commit -a`. Commit at
  task granularity with the messages given in the task.
- **`ui/` stays pure**; `observer()` only in `containers/`; nothing under `ui/` imports a store.
- **Grids are `observable.ref`**; redraw from `pixelVersion`.
- **Run the gate and paste real output** into your report. "It passes" is not a report.
- **Do the manual checks** listed in your task. A task with manual checks skipped is PARTIAL,
  not DONE.
- **Report honestly**, including what you could not finish and why.
- Do not break `bun run dev`.

---

## 11. Task index

| NN | Title | Wave | Effort | Summary |
| --- | --- | --- | --- | --- |
| 01 | `CanvasViewsUIStore`: split state + Layer camera | W1 | S | `CanvasCamera` interface, `CanvasCameraStore`, open/close/swap/keyboardOwner, wired as `app.canvasViews` |
| 02 | `CanvasViewControls` mode/close/arrows | W1 | S | Props for the mode button above reset, close, and the `← ↑ ↓ →` row; stories + DOM tests |
| 03 | `CanvasSplit` pane container | W1 | S | Pure 1-or-2 pane flex split keyed by mode; stories + no-remount test |
| 04 | `drawLayerView` + keyboard `enabled` | W1 | S | Pure Layer-mode painter; one-owner gate on `useCanvasKeyboard` |
| 05 | `CanvasContainer` render mode | W2 | L | `renderMode` prop, per-mode camera, Layer render branch, overlay guards, per-pane controls |
| 06 | Pixel studio split wiring | W3 | M | `CanvasSplit` of `CanvasContainer`s from `openModes`; hint text; full gate + 11 manual checks |
