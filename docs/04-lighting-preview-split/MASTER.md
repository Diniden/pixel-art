# Lighting Preview Split — MASTER plan

Planned 2026-08-29 against branch `feat/02-split-canvas-render-modes` (HEAD `fe06e86`, clean tree).
Executed by `/plan-go`, one fresh agent per task. **Read this file, `CLAUDE.md`, and your task
file. Nothing else is required; nothing else is assumed.**

---

## 1. Request

Verbatim:

> Ok we need this same sort of strategy for the lighting preview in the lighting studio. We need
> it to also be made so we can edit the normal and height map on the preview just like all editor
> modes. Needs the separate camera control etc as well.

Followed, after clarifying questions, by the owner's correction:

> Turns out the questions you asked made me realize: this mode: the preview should remain just a
> preview. We should make it this new UX where it's a new editor that shares the workspace area
> instead of a floating panel, but we should not edit it as it's a composite view of everything
> which just gets super complex in reality.

### Interpretation

The lighting studio gains the split-pane strategy from plan 02. `LightingCanvasContainer` becomes
parameterised by a `renderMode` (`"edit" | "preview"`). **Edit** is today's normal/height painting
canvas, unchanged. **Preview** is the lit composite — promoted out of its 200 px floating panel
into a real workspace pane with its own camera, and **read-only**: the owner reversed the original
"edit on the preview" requirement because a composite of every layer has no sound mapping back to
a single layer's cells. The floating panel is retired; the pane replaces it. Each pane gets its own
`CanvasCameraStore` (pan + view zoom + pinch + reset), the shared pixel scale `zoom` stays shared,
and exactly one pane owns the window keyboard listener.

Separately and at the owner's explicit request, a lighting **paint stroke becomes one undo entry**
instead of one per pointer move.

### Assumptions made where the request was ambiguous

| Ambiguity | Decision |
| --- | --- |
| Does the Preview pane accept pointer input at all? | **No.** No painting, no hover marker, no brush overlay. Read-only (owner's correction). |
| What does the Preview pane show — the edit grid or the whole object? | The **whole object** composite, as the floating panel showed. It is a preview of the finished sprite; cropping it to the edit grid would make it a different thing. Uses `objWidth/objHeight`, not `gridWidth/gridHeight`. |
| Does the floating 200 px panel survive? | **No** — retired entirely (owner's answer). Its persisted keys stay in the wire format but stop being read; removing them would move the corpus digests. |
| Does the lighting studio also get a Layer-style pane, like the pixel studio? | **No** — two modes only, `edit` and `preview` (owner's answer). |
| Where do the lighting cameras live? | A new `LightingViewsUIStore` with **two** `CanvasCameraStore`s. Unlike the pixel studio there is no persisted lighting camera to reuse: measured, the lighting studio passes a hard-coded `panOffset: {x:0,y:0}` and no commit sinks, so its transform is already session-only. |
| Should `CanvasViewsUIStore` be generalised to serve both studios? | **No.** It is hard-coded to `full`/`layer` with two booleans and one `layerCamera`. Generalising it would rewrite a store that plan 02 shipped a week ago and is pinned by 13 tests. A sibling store is cheaper and safer. |
| Which pane owns the keyboard? | Edit whenever it is open, else Preview. The lighting container registers its **own** raw `window` listener (not `useCanvasKeyboard`), so the gate is an early return inside that effect. |
| Which side does a newly opened pane appear on? | The right. The already-open pane stays left. Same as plan 02. |
| Undo grain for lighting strokes | **One entry per stroke** (owner's answer). `HistoryStore.beginTransaction`/`endTransaction` already exists and is used three times in `PixelStore`. |

---

## 2. Outcome

When every wave is DONE the owner can:

1. Open the lighting studio and see it exactly as before — minus the floating preview panel — plus
   an **Open Preview view** button directly above the zoom-reset button.
2. Click **Open Preview view** → the workspace splits; the right pane shows the lit composite of
   the whole object at editor scale, not a 200 px thumbnail.
3. Pan, ctrl+wheel and pinch each pane independently; press each pane's reset independently.
4. Paint normals or heights in the Edit pane and watch the Preview update within a frame.
5. Click and drag on the Preview pane and have **nothing happen** — it is a preview.
6. Drag a stroke across ten cells and undo the whole thing with **one** ⌘Z.
7. Click **Swap** to exchange sides without either canvas remounting; **Close** to return to one pane.
8. Run the full gate green with the corpus digests **unchanged**.

---

## 3. Locked decisions

| # | Decision | Value |
| --- | --- | --- |
| D1 | Mode type | `export type LightingRenderMode = "edit" \| "preview"` in `client/src/stores/ui/LightingViewsUIStore.ts`. `ui/` never imports it — pure components take strings and callbacks. |
| D2 | Cameras | **Both** panes get a `CanvasCameraStore` (`editCamera`, `previewCamera`), reached via `cameraFor(mode)`. Reuse `stores/ui/CanvasCameraStore.ts` — do not write a second camera class. |
| D3 | Persistence | None, for the split state or either camera. No new key in `toPersistedUIState()`, no `localStorage`. The lighting view transform is already session-only today. |
| D4 | Pixel scale | `app.ui.viewport.zoom` stays the single shared pixel scale for both panes. It is **not** part of `CanvasCamera`. |
| D5 | Store home | `app.lightingViews: LightingViewsUIStore`, constructed directly by `ApplicationStore` beside `canvasViews` (`:391`/`:497`). Not on `UIStore`. |
| D6 | Split state | `editOpen`, `previewOpen`, `leftMode`; computeds `bothOpen`, `openModes` (left→right), `keyboardOwner`; actions `openMode` (new pane on the right), `closeMode` (refuses the last), `swap` (no-op unless both). Mirrors `CanvasViewsUIStore` exactly. |
| D7 | Floating panel | **Retired** in task 06: `LightingPreviewPanel*` and `LightingPreviewPanelContainer` deleted, `previewPanel` slots removed from `LightingSurface` and `LightingStudioLayout`. ⚠️ The persisted `lightingPreviewPanel*` keys and the `PanelName` union member **stay** — deleting them moves the corpus digests. |
| D8 | Preview content | The whole-object lit composite (`composeLayers` → `renderWithLighting`), painted by a new `drawLitComposite` at `objWidth × objHeight × zoom`. **Read-only.** |
| D9 | Preview painter | New pure `ui/canvas/render/renderLitComposite.ts`. `renderLightingPreview.ts` is untouched and keeps its golden hashes; its `previewPlacement` fixed-thumb fit is explicitly the wrong tool here. |
| D10 | Controls host | `LightingSurface` gains `viewControls?: ReactNode` rendered inside `.lighting-canvas__viewport`, and that element becomes `position: relative`. ⚠️ Never inside `.lighting-canvas__surface` — it carries the pan/zoom transform. |
| D11 | Container API | `LightingCanvasContainer` gains one prop, `renderMode?: LightingRenderMode` (default `"edit"`); it derives camera, controls and keyboard ownership from `app.lightingViews`. |
| D12 | Keyboard | The container's existing raw `window` listener early-returns unless `views.keyboardOwner === renderMode`. `useCanvasKeyboard` is **not** adopted here — the non-reuse is deliberate and documented. |
| D13 | Geometry | Stays hand-rolled in the container (`:221-233`). Adopting `useCanvasGeometry` is a separate refactor, out of scope. |
| D14 | Stroke undo | `useLightingPaint` gains optional `onStrokeStart(label)` / `onStrokeEnd()`; the container supplies `history.beginTransaction` / `endTransaction`. `PixelStore` and `HistoryStore` are **not** modified. |
| D15 | Naming | `LightingRenderMode`, `LightingViewsUIStore`, `drawLitComposite`. Reuse `CanvasCamera`, `CanvasCameraStore`, `CanvasSplit`, `CanvasViewControls` unchanged. |

---

## 4. Ground truth (measured 2026-08-29)

### Refresh state
The 38-task refresh has landed; `REFRESH/` is deleted. Everything this plan touches is MobX +
`ui/` + `containers/` + BEM. Plan 02 (split canvas) is merged into the working branch at `fe06e86`.

### Gate baseline (run 2026-08-29 by the plan-02 coordinator, `client/`)
| Command | Result |
| --- | --- |
| `bunx tsc --noEmit` (client and server) | clean |
| `bunx eslint .` | 0 errors, 64 warnings |
| `bunx vitest run` | 117 files, 1984 tests pass (~68 s; corpus digests included) |
| `bun run lint:boundaries` | `OK — all 5 boundary rules hold` |
| `bunx stylelint "src/**/*.css"` | **2 pre-existing errors** (`src/ui/components/OtherHand/OtherHand.css:267,288`) + 66 warnings. Gate = no *new* errors. |
| `bunx storybook build` | `✓ built in 5.42s` |
| `bun run verify` (root) | exit 0 — typecheck + lint + format:check + client test + build. It does **not** run `lint:boundaries`, `lint:css` or storybook; waves list those explicitly. |
| lockfile check | none present. `bunx` can create one — check after every invocation. |

### Reusable from plan 02 (do not rewrite)
- `stores/ui/CanvasCameraStore.ts` — `CanvasCamera` interface (`:39-46`) + `CanvasCameraStore`
  (`:48-82`): `panOffset` (`observableRef`), `viewZoom` (tri-state, clamp 0.25–4), `setPanOffset`,
  `setViewZoom`, `resetView(centeredPan)`.
- `ui/components/CanvasSplit/CanvasSplit.tsx` — `panes: ReadonlyArray<{key: string; node: ReactNode}>`;
  `key` is `string`, so the component never learns a mode union. Classes `canvas-split`,
  `--dual`, `__pane`. A swap reorders; it never remounts (pinned by its DOM test).
- `ui/components/CanvasViewControls/CanvasViewControls.tsx` — props `onResetView`,
  `modeButton?: {kind: "open"|"swap"; label; onClick}`, `onClose?: {label; onClick}`,
  `onNudgeOffset?`. Positions `absolute; left/bottom: var(--space-3)` against its containing block.
- `stores/ui/CanvasViewsUIStore.ts` — the **shape** to mirror (`:35-106`), but it is hard-coded to
  `full`/`layer` with two booleans and one `layerCamera`. Not generalised; see §1.
- `containers/CanvasContainer.tsx` — the wiring model: camera into `useCanvasViewport` (`:631-645`),
  `enabled` gate (`:1676-1678`), `handleResetView` (`:2673-2692`), control props (`:2694-2722`).
- `containers/PixelStudioContainer.tsx:156-167`, `:203` — the panes map + `CanvasSplit` usage.

### Lighting studio, as it stands (paths relative to `client/src/`)
- **`containers/LightingCanvasContainer.tsx` — 714 lines, no props.** Store reads `:181-216`
  (`viewport.zoom :191`, `lightGridMode :194`, the nine `lightingUI` fields `:202-209`,
  `pixelVersion :216` — the redraw signal). Geometry hand-rolled `:221-233`.
  **Camera `:241-252`: `panOffset: {x:0,y:0}` literal, no `onCommitPan`, no `viewZoom`, no
  `resyncKey`** — the transform is hook-local and dies on reload. Three rAF painters `:509-514`:
  `renderPreview :359-415` (the 200 px thumb), `renderEdit :423-474`, `renderBrushOverlay :477-497`.
  Paint callbacks `:296-322` → `pixels.setNormalPixels(cells, selectionUI.writeOptions) :303-306`
  and `setHeightPixels :313-317`. Screen→pixel is rect-relative `:344-356` (deliberately not
  `screenToPixel` — it must work under the CSS `scale()`). Pointer handlers `:517-621`.
  **Keyboard `:625-665`: its own raw `window` listener, bubble phase**, ⌘Z → `app.undo()` `:633-640`,
  `.`/`,` frame nav `:641-661`. Renders `LightingSurface` `:683-711`.
- **`ui/components/LightingSurface/LightingSurface.tsx` — 219 lines.** Props `:56-124`; slot
  `previewPanel?: ReactNode :114` rendered `:216`. **No `viewControls` slot.**
  `.lighting-canvas` is `position: relative` (css `:11-12`); **`.lighting-canvas__viewport` is
  NOT** (css `:39-46`) — the blocker task 03 fixes. `.lighting-canvas__surface` carries the
  transform (css `:48-52`). The empty branch `:149-157` attaches no `rootRef`.
- **The floating preview:** `containers/LightingPreviewPanelContainer.tsx` (73) +
  `ui/components/LightingPreviewPanel/*` (102 tsx, 28 css, 165 stories, 104 dom test). A
  `FloatingPanel`, 200×200 canvas, positioned against `rootRef`. State in
  `ViewportUIStore.panels.lightingPreview` (`:37`, `:96-99`, `:194-199`), persisted flattened at
  `:227-228`, `:258-259`. Mounted from inside `LightingCanvasContainer :697-703`, **not** from the
  studio container — the layout's `previewPanel?` slot (`LightingStudioLayout.tsx:60`) is unused.
- **`containers/LightingStudioContainer.tsx` — 80 lines.** `canvas={<LightingCanvasContainer />}`
  `:76`. `ui/layouts/LightingStudioLayout/LightingStudioLayout.tsx` — 117 lines, same AppShell
  shape as `PixelStudioLayout`; the canvas lands in `.app__canvas-stack`
  (`AppShell.tsx:255`, css `:160-168`), `<main class="app__canvas-area canvas-area">` is
  `position: relative` (`AppShell.css:125-132`). **No lighting file uses
  `document.querySelector(".canvas-area")`** — the 8 sites are the two pixel-studio panels.
- **Renderers.** `utils/lightingRenderer.ts` (553): `composeLayers :103-108`,
  `renderWithLighting :351-354` (`LightingParams :5-10` — one directional light),
  `renderNormalAsRGB :461`, `renderHeightAsGrayscale :517`. `ui/canvas/render/renderLightingPreview.ts`
  (217): `previewPlacement :80-98` (integer fit into 200 px, **crops** larger sprites `:29-32`),
  `renderLightingPreview :122-217`, `PREVIEW_THUMB_SIZE = 200 :52`. `ui/canvas/render/renderNormalEdit.ts`
  (135) — the structural analogue for the new painter. **None is WebGL.**
- **`ui/hooks/useLightingPaint.ts` — 171 lines.** Options `:57-73`; `beginStroke :121-135`,
  `continueStroke :137-156`, `endStroke :158-161`, `apply :107-119`. Takes **cell** coordinates —
  no geometry, no `screenToPixel`. **Batches per stamp, so a drag makes N undo entries** — what
  task 02 fixes. No line interpolation (deliberate, `:36-41`).
- **History.** `stores/history/HistoryStore.ts:83`. `beginTransaction(label)` / `endTransaction()`
  buffer commands into one `CompositeCommand` — documented as the stroke invariant at
  `stores/domain/PixelStore.ts:52-56`, used at `:1201/1207`, `:1446/1467`, `:1594/1620`.
  ⚠️ `PixelStore.ts:948-961`: a transaction opened while one is already open **commits the outer
  one first**; always close from a `finally`.
- **Lighting writes.** `PixelStore.setNormalPixels :1280-1300` (`"Set normals"`),
  `setHeightPixels :1308-1328` (`"Set heights"`), both via `commitLighting :1357-1370` which bumps
  `pixelVersion` **even on an empty batch** (`:1364-1366`, legacy behaviour, pinned).
- **Tests.** `stores/ui/__tests__/LightingUIStore.test.ts` (315),
  `stores/domain/__tests__/PixelStoreLighting.test.ts` (645),
  `ui/hooks/__tests__/useLightingPaint.dom.test.ts` (153),
  `ui/canvas/render/__tests__/renderLightingPreview.test.ts` / `renderNormalEdit.test.ts` (golden
  hashes), `ui/components/LightingSurface/__tests__/LightingSurface.dom.test.tsx`,
  `ui/components/LightingPreviewPanel/__tests__/LightingPreviewPanel.dom.test.tsx`.
  **There is no test for `LightingCanvasContainer` itself.** Vitest lanes: `*.test.ts` = node,
  `*.dom.test.ts(x)` = jsdom.
- **ESLint boundaries** (`client/eslint.config.js`): `src/ui/**` may not import stores/api/mobx/
  `useContext`; `mobx-react-lite` only in `src/containers/**`; `max-lines` 400 = error in `src/ui/**`.

---

## 5. Wave table

| Wave | Tasks | Parallel | Gate before next wave |
| --- | --- | --- | --- |
| W1 | 01 store, 02 stroke undo, 03 surface slot, 04 painter | 4 | `cd client && bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run lint:boundaries && bunx stylelint "src/**/*.css"` (no new errors) `&& bunx storybook build`; corpus digests unchanged; no lockfile |
| W2 | 05 `LightingCanvasContainer` render mode | 1 | same client gate (storybook optional); manual checks in task 05 |
| W3 | 06 studio wiring + panel retirement | 1 | full client gate + `cd server && bunx tsc --noEmit` + `bun run verify` (root); all 11 manual checks |

---

## 6. Dependency graph

```
01 store ──────┐
02 stroke undo ┼──► 05 LightingCanvasContainer ──► 06 wiring
03 surface slot┘
04 painter ────┘
```

- 01, 02, 03, 04: no dependencies on each other.
- 05 depends on 01 (`LightingViewsUIStore`, `cameraFor`), 02 (the stroke callbacks), 03 (the
  `viewControls` slot) and 04 (`drawLitComposite`).
- 06 depends on 05 (the `renderMode` prop).

---

## 7. Collision matrix (W1)

| Task | Touches |
| --- | --- |
| 01 | `stores/ui/LightingViewsUIStore.ts` (new) · `stores/ui/__tests__/LightingViewsUIStore.test.ts` (new) · `stores/ApplicationStore.ts` |
| 02 | `ui/hooks/useLightingPaint.ts` · `ui/hooks/__tests__/useLightingPaint.dom.test.ts` · `stores/domain/__tests__/PixelStoreLighting.test.ts` |
| 03 | `ui/components/LightingSurface/LightingSurface.tsx` · `…/LightingSurface.css` · `…/LightingSurface.stories.tsx` · `…/__tests__/LightingSurface.dom.test.tsx` |
| 04 | `ui/canvas/render/renderLitComposite.ts` (new) · `ui/canvas/render/__tests__/renderLitComposite.test.ts` (new) |

Pairwise disjoint: 01 is `stores/ui` + `ApplicationStore`; 02 is `ui/hooks` + one `stores/domain`
**test** file (01 touches no test under `stores/domain`); 03 is one component folder; 04 is two new
files under `ui/canvas/render`. No file appears twice. W2 and W3 are single-task waves.

⚠️ Task 06 edits `LightingSurface.tsx`, its stories and its DOM test — the same files as task 03.
They are in different waves, so this is sequential, not a collision. Task 06's executor must read
task 03's landed state, not the pre-W1 state described here.

---

## 8. Alignment guide

- **Two zooms.** `zoom` = pixel scale (shared, persisted, untouched). `viewZoom` + `panOffset` =
  the camera (per pane). If you find yourself giving the Preview pane its own `zoom`, stop.
- **The Edit view must not change** except for the two intended fixes: its camera now lives in a
  store, and a stroke is one undo entry. Everything else — painting, brush overlay, grid,
  hover, frame nav — is byte-identical. Diff against that invariant before every commit.
- **The Preview pane is read-only.** No pointer handlers, no brush cells, no hover marker, no
  history transaction. If you are writing a `paint*` call in a `previewMode` branch, stop.
- **Reuse, don't re-derive.** `CanvasCameraStore`, `CanvasSplit`, `CanvasViewControls` ship as-is
  from plan 02. `composeLayers` / `renderWithLighting` already do the lighting maths. The only new
  painter is the upscale-and-checkerboard step, and `renderNormalEdit.ts` is its template.
- **Boundaries.** `ui/` never imports a store, `mobx`, the API or `useContext` — which is exactly
  why the stroke transaction reaches `useLightingPaint` as callbacks. `observer()` only in
  `containers/`.
- **Identity.** Pane `key` = mode. A swap is an array reorder. If a canvas flashes on swap, the key
  changed or something remounted — fix that, do not paper over it with an effect.
- **One keyboard owner.** The lighting container owns a raw `window` listener; gate it inside the
  effect. Test by pressing `.` with both panes open — the frame advances once.
- **Corpus safety.** The floating panel's *persisted keys* stay even though the panel goes.
  Removing a key from `toPersistedUIState()` moves 151 snapshots of the owner's real work.
- **What done looks like.** Bottom-left of each pane: a column `[mode] [close?] [reset]` of
  identical square buttons. Two equal panes with a 1px divider. Painting in the Edit pane updates
  the Preview within a frame; clicking the Preview does nothing; one ⌘Z undoes a whole drag.
- **Most likely mistakes.** (1) Registering the keyboard listener twice. (2) Putting the controls
  inside `.lighting-canvas__surface`, so they pan and scale with the sprite. (3) Reusing
  `previewPlacement` and getting a cropped 200 px thumbnail in a full-size pane. (4) Deleting a
  persisted `lightingPreviewPanel*` key along with the panel. (5) Opening a history transaction
  that is never closed — every later edit disappears into it.

---

## 9. Risk register

| Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- |
| Moving the lighting camera into a store regresses pan/pinch (it was hook-local, with a fresh `{x:0,y:0}` literal each render) | Medium | High | Commit step 1 of task 05 alone, with Edit-mode manual checks before going further; `resyncKey` mirrors `CanvasContainer` | 05 |
| An unclosed history transaction swallows subsequent edits | Medium | **Critical** | Close from `finally`/cleanup; guard double-close; unmount test; `PixelStore.ts:948-961` read first | 02, 05 |
| Stroke-undo change breaks pinned lighting history behaviour | Medium | High | Seven pinned hook cases listed in task 02; `PixelStoreLighting` suite must pass unchanged | 02 |
| Retiring the floating panel removes a persisted key and moves the corpus | Low | **Critical** | D7: delete the components, keep every persisted field and codec; corpus suites in W3 | 06 |
| Two keyboard listeners → doubled ⌘Z / frame steps | High without D12 | High | `keyboardOwner` gate inside the effect; manual checks 5 and 9 | 05, 06 |
| Preview pane cropped or letterboxed like the 200 px thumb | Medium | Medium | D9 + the explicit no-crop test in task 04 | 04, 05 |
| Controls positioned against the wrong element in a split | Medium | Medium | D10: `.lighting-canvas__viewport` becomes the containing block; DOM test pins the ancestor | 03 |
| Deep-observing a grid via the new store or the painter | Low | High | Store holds no grid; painter takes a lit buffer by value; redraw from `pixelVersion` | 01, 04, 05 |
| Swap remounts panes (cache loss, listener rebind, pan reset) | Medium | Medium | `key` = mode; `CanvasSplit`'s existing no-remount test; manual check 7 | 06 |

---

## 10. Rules for every executor

- **Bun only.** No `node`, no `npm`. After any `bunx`, run
  `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` from the repo root and delete any
  lockfile it created. Never use the frozen-lockfile flag.
- **Never run `vitest -u`.** If a snapshot or corpus digest differs, stop and report the diff.
- **Never touch** `server/src/data/**`, `server/exports/**`, `client/src/types/codecs/**`,
  `client/src/services/migrations/**`, `server/src/export/**`, or any `__snapshots__`.
- **Never point a browser at the real server.** Manual checks run against a **copy** of
  `server/src` and its `data/` in the scratchpad (port 3002, `DISABLE_BONJOUR=1`,
  `VITE_API_URL` pointed at it) — the method the plan-02 executors used successfully.
- **Stay inside `Touches`.** If you need a file not listed, stop and report.
- **Stage only your files.** `git add <paths>`; never `git add -A` / `git commit -a`. Commit at
  task granularity with the messages given in the task.
- **`ui/` stays pure**; `observer()` only in `containers/`; nothing under `ui/` imports a store.
- **Grids are `observable.ref`**; redraw from `pixelVersion`.
- **Run `bunx prettier --check` on your files** before committing — root `bun run verify` includes
  `format:check`.
- **Run the gate and paste real output.** "It passes" is not a report.
- **Do the manual checks** listed in your task. A task with manual checks skipped is PARTIAL.
- **Report honestly**, including what you could not finish and why.
- Do not break `bun run dev`.

---

## 11. Task index

| NN | Title | Wave | Effort | Summary |
| --- | --- | --- | --- | --- |
| 01 | `LightingViewsUIStore` | W1 | S | `LightingRenderMode`, split state, two session-only cameras, wired as `app.lightingViews` |
| 02 | One undo entry per lighting stroke | W1 | S | `onStrokeStart`/`onStrokeEnd` callbacks on `useLightingPaint`; history transaction collapses a drag |
| 03 | `LightingSurface` `viewControls` slot | W1 | S | New slot inside a now-`relative` `.lighting-canvas__viewport`; story + DOM test |
| 04 | `drawLitComposite` painter | W1 | S | Pure lit-composite painter at camera scale, no thumbnail fit, no crop |
| 05 | `LightingCanvasContainer` render mode | W2 | L | `renderMode` prop, per-pane camera, read-only Preview branch, keyboard gate, per-pane controls, stroke callbacks |
| 06 | Studio split wiring + panel retirement | W3 | M | `CanvasSplit` of `LightingCanvasContainer`s; delete the floating panel; full gate + 11 manual checks |
