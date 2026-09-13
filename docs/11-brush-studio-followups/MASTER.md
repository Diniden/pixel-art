# Brush Studio follow-ups — MASTER plan

Planned 2026-09-09 against branch `feat/01-brush-studio` (HEAD `4ed1d3c`, clean tree), after the
owner's first manual pass over the Brush Studio (`docs/01-brush-studio`). Executed by `/plan-go`,
one fresh agent per task. **Read this file, `CLAUDE.md`, and your task file. Nothing else is
required; nothing else is assumed.**

---

## 1. Request

Verbatim:

> The edit canvas region needs all of the same functionality as the other normal edit regions
> with proper two finger panning etc, it also needs to have the composite and single layer split
> view editing. The region also has blurriness issues that we addressed in the other canvas
> editing that should be present here as well. The timeline rail at the bottom needs a min
> height. It's exceedingly small right now. It should fit 5 layers as a default even if they
> are not present. The Brushes folder at the top that replaces the projects: The modal that
> opens needs to indicate it is "brush projects", it's current look makes it appear as though
> you are making a single brush instead of a group of brushes. The delta color picking needs to
> have edge/fill selection like normal color picking.

### Interpretation

Four independent fixes to the brush studio, all inside the existing MobX + `ui/` + `containers/`
architecture:

1. **Canvas parity.** The brush canvas adopts the same viewport engine (`useCanvasViewport`),
   touch arbitration (`canvasTouchFilter`), view controls (Reset View) and pane model
   (`CanvasSplit` + `CanvasViewsUIStore`) as the pixel canvas. "Composite" = the existing Full
   render of all visible layers; "single layer" = a Layer pane showing only the selected layer.
2. **Blur.** Measured: the brush canvas already uses the 1:1 backing store + single CSS transform
   + `image-rendering: pixelated` model that fixed the pixel canvas (plan 05). The one measured
   divergence is that today's pinch multiplies the integer `zoom` into a **non-integer px/cell**,
   whereas the pixel canvas keeps `zoom` integer and puts the continuous factor in `viewZoom`.
   Adopting the engine removes that divergence; task 06 records a before/after comparison and
   the owner verifies on device.
3. **Timeline floor.** The bottom rail is purely content-sized; the brush timeline collapses to
   one 32 px row. An opt-in `minRows` on the pure `TimelineView` floors the grid at N row pitches.
4. **Naming.** Brush files are called **brush projects** on the header button, the modal, and the
   left rail, with an intro line in the modal explaining what one is.
5. **Edge/fill deltas.** `BrushUIStore` gains a fill slot and an active-slot flag; the delta
   picker gets the colour picker's Edge/Fill tabs and swap; writes route per pixel like the pixel
   studio (outline/pencil = edge, fill/interior = fill); `X` swaps deltas in brush mode.

### Assumptions where the request was ambiguous

| Ambiguity | Decision |
| --- | --- |
| Does "brush projects" also rename the header button and the rail header? | Yes — all three surfaces say "Brush Projects"; the BEM blocks, file names and validator messages keep "brush". |
| Should the timeline floor apply to the pixel studio too? | No. `minRows` is opt-in; only `BrushTimelineContainer` passes it. |
| Is the fill delta persisted / undoable? | Neither — same as the edge delta (plan 01 D17). No tri-state: `fillDelta` starts at `[0,0,0,0]`. |
| Which slot does the eyedropper write? | The active one, mirroring `app.setActiveColor`. |
| Do the two panes share one selection mask? | Not in v1 — each pane keeps its own container-local mask; recorded as an open item. |
| Other-Hand rail Edge/Fill/Swap widgets in brush mode | Out of scope; open item. |
| Space-bar pan / single-finger pan | The pixel canvas has neither (measured: `setIsPanning(true)` only at `CanvasContainer.tsx:4708`, the mouse branch); the brush matches — two-finger pan, middle/alt-drag, wheel. |

---

## 2. Outcome

When every wave is DONE the owner can, in brush mode:

1. Pan with two fingers and pinch-zoom about the fingers without drift; draw with the Pencil
   while a finger rests; wheel / ⌘-wheel / middle-drag / alt-drag; hit Reset View; never zoom
   the brush below ~50 screen px.
2. Open a Layer pane beside the Full pane, swap them, close one; each with its own pan/zoom.
3. See cells as crisp as the pixel studio's at every view zoom (verified on the iPad).
4. See a bottom rail at least five rows tall with a one-layer brush.
5. Read "Brush Projects" on the header button, the modal title (with an explanatory line), and
   the rail; create / rename / delete "brush projects".
6. Pick Edge or Fill in the delta panel, edit either, swap with the button or `X`; paint a
   "both"-mode rectangle with an edge outline and a fill interior; flood-fill with the fill delta.
7. Run the full gate green with the corpus digests unchanged.

---

## 3. Locked decisions

| # | Decision | Value |
| --- | --- | --- |
| D1 | Viewport engine | `ui/hooks/useCanvasViewport` (unchanged). `containers/brush/useBrushCamera.ts` becomes a thin adapter; the hand-rolled wheel/pinch code is deleted. |
| D2 | Camera ownership | Full pane camera = `app.brushUI` (now `implements CanvasCamera`: `viewZoom`, `setViewZoom(z, floor)`, `resetView`). Layer pane camera = `app.brushViews.layerCamera`. `brushUI.zoom` (px/cell, integer-ish 1..64) is shared by both panes; pinch/wheel change `viewZoom` only. |
| D3 | `combinedScale` | `brushUI.zoom * (camera.viewZoom ?? 1)`, computed once in the container; `cellWidth/Height` stay 1:1; no `will-change` anywhere. |
| D4 | Touch arbitration | `canvasTouchFilter` (`touchesInContainer`, `pinchTouches`, `drawingTouch`) with `pencilOnly = app.ui.viewport.pencilOnly ?? isTouchDevice()`. |
| D5 | Panes | `app.brushViews = new CanvasViewsUIStore()` (second instance; `presentVariantPanes` never called). `BrushStudioContainer` renders `CanvasSplit` with `key = mode`. `BrushCanvasContainer` gets `renderMode?: CanvasRenderMode`. Layer mode renders only `brushUI.selectedLayerIn(doc)`. Keyboard: `enabled = brushViews.keyboardOwner === renderMode`. |
| D6 | Timeline floor | `TimelineViewProps.minRows?: number` → root class `timeline-view--min-rows` + CSS var `--timeline-min-rows`; rule on `.timeline-view__scroll`: `min-height: calc(N*32px + (N-1)*var(--space-0-5))`. Brush passes 5. |
| D7 | Naming | Header button / modal title / rail header: **"Brush Projects"**. Modal intro line under the header. Actions: "New Brush Project", "Delete Current Brush Project", "Current brush project", empty state "No brush projects yet. Create one to start.", header fallback "No brush project". BEM blocks, files, props, validator messages unchanged. |
| D8 | Delta slots | `BrushUIStore`: `selectedDelta` (edge, name kept), `fillDelta`, `deltaTarget: "edge" \| "fill"`, `activeDelta` (computed), `setDeltaTarget`, `setActiveDelta`, `setActiveDeltaChannel`, `resetActiveDelta`, `swapDeltas`, `setFillDelta`. Not persisted, not undoable. |
| D9 | Write routing | Two sentinel colours in `brushToolContext.ts`: `DUMMY_TOOL_COLOR` (edge, `a:255`) and `DUMMY_FILL_COLOR` (fill, `a:254`). `mapWritesToBrushCells(writes, edge, fill)` routes by sentinel; `0` erases. `floodFillAt`/`gaussianFillAt` emit fill; pencil/eraser/line/square emit edge. Shape commit: `"outline"` → edge, `"fill"` → fill, `"both"` → `getShapeOutlineKeys` splits per pixel. Preview colourised per pixel. |
| D10 | Picker UI | `BrushDeltaPicker` gains optional `target`, `onTargetChange`, `edgeValue`, `fillValue`, `onSwap` (tablist + swap, copied from `ColorPicker.tsx:637-687`). Optional so the old caller compiles during W1. |
| D11 | Hotkey | `X` in brush mode → `brushUI.swapDeltas()`; pixel/lighting unchanged. |
| D12 | Naming prefix | Everything new is `Brush*` / `brush*`; commit prefix `brush-followups(NN): …`. |

---

## 4. Ground truth (measured 2026-09-09)

### Baseline
Branch `feat/01-brush-studio` @ `4ed1d3c`, clean. Gate at that commit (coordinator run, plan 01
close-out): client tsc clean · eslint 0 errors / 66 warnings · vitest **183 files, 3825 tests** ·
boundaries OK · stylelint **2 pre-existing errors** (`src/ui/components/OtherHand/OtherHand.css:338,359`)
+ 69 warnings · storybook ✓ · `bun run build` ✓ · server tsc/eslint clean, vitest 102 · no lockfile.

### Canvas engine (paths relative to `client/src/`)
- `ui/hooks/useCanvasViewport.ts` (677): options `:117-159`, return `:161-190`, `viewZoomFloor :93-100`,
  `MIN_CANVAS_SCREEN_PX = 50 :81`, `ZOOM_ANCHOR_MS :67`, `PAN_COMMIT_MS :106`, `WHEEL_ZOOM_RATE :109`,
  `PINCH_EXPONENT :115`, wheel `:349-421`, pinch `:444-554` (two-finger pan composed at `:512-534`),
  native touch listeners on the container `:562-660`.
- `ui/canvas/model/canvasTouchFilter.ts` (160): `touchesInContainer :82-88`, `isStylus :91-93`,
  `pinchTouches :102-106`, `drawingTouch :148-160`.
- `stores/ui/CanvasCameraStore.ts:39-51` `CanvasCamera`; `:53` `CanvasCameraStore`.
  `stores/ui/ViewportUIStore.ts:44` implements it (persisted); `:129` `pencilOnly` tri-state.
- `stores/ui/CanvasViewsUIStore.ts` (138): fields `:38-43`, `openModes :67-72`, `keyboardOwner :75-77`,
  `openMode :88-94`, `closeMode :97-101`, `swap :134-137`.
- `ui/components/CanvasSplit/CanvasSplit.tsx:27-38`; `CanvasSplit.css:20-49` (50/50, portrait stacks).
- `ui/components/CanvasViewControls/CanvasViewControls.tsx:59-72` props.
- `ui/components/CanvasSurface/CanvasSurface.tsx:298-314` (`cellWidth` 1:1), `:316-341` (`combinedScale`),
  `:456-463` (`viewControls` sibling of the transform), `:548-601` (`ScreenWidthPath`), `:666-677`
  (the transform). `CanvasSurface.css:53-72` **never add `will-change`**; pixelated at `:131,215,293,386`.
- `containers/LightingCanvasContainer.tsx`: hook `:334-373`, `handleResetView :386-416`,
  touch bail `:797`, `combinedScale :943`, `viewControls :953`.
- `containers/CanvasContainer.tsx` (6157): `pencilOnly :648`, `camera :588-590`, `layerPlan` layer
  branch `:1409-1432`, `resyncKey :1129`, keyboard owner `:4151`, mouse pan `:4705-4711,4884-4896`,
  touch `:5279-5283,5320-5333,5448-5457` (the `:5490-5524` touch-pan branch is unreachable from touch), pane buttons `:5789-5806`, `viewControls :6147-6154`,
  shape commit `:5071-5106`, preview `:1917-1958`, `getToolContext :4382-4441`.
- `containers/PixelStudioContainer.tsx:156-166,209` panes.

### Brush side today
- `containers/BrushCanvasContainer.tsx` (498 raw / 379 counted of 400): `combinedScale={zoom} :483`,
  `finishStroke :333-348`, eyedropper `:284-297`, preview colour `:411`, `registerLayerCanvas :457-462`.
- `containers/brush/useBrushCamera.ts` (78): own wheel listener, ctrl/meta zoom, plain pan; no pinch.
- `containers/brush/useBrushPointerHandlers.ts` (170): synthetic touch on the canvas, `touches.length >= 2`
  → `zoomBy(d/last)` only (`:114-159`).
- `containers/brush/brushToolContext.ts` (470): `DUMMY_TOOL_COLOR :85`, `mapWritesToBrushCells :199-206`,
  `BrushToolContextArgs :353-397`, `buildBrushToolContext :408-470` (`fillAt :428-435`, `setPixels :451-452`).
- `containers/brush/useBrushSelection.ts:219-236` window keydown.
- `stores/ui/BrushUIStore.ts` (208): camera `:180-197`, `zoom` limits `:42-44`, deltas `:71,162-180`.
- `containers/BrushStudioContainer.tsx:92` bare `<BrushCanvasContainer />`.
- `containers/BrushTimelineContainer.tsx:423-458` renders `TimelineView` inside `.frame-timeline`.

### Gap table (brush vs pixel canvas), from the measured comparison
| # | Gap | Fixed by |
| --- | --- | --- |
| 1 | No two-finger pan (pinch scales only) | 06 |
| 2 | Pinch unanchored, no anchor lock, no `PINCH_EXPONENT` | 06 |
| 3 | Touch handlers synthetic + on the canvas (passive; miss the margin) | 06 |
| 4 | No `touchesInContainer`/`pinchTouches`/`drawingTouch`; no stylus awareness; no `pencilOnly` | 06 |
| 5 | No middle/alt-drag pan | 06 |
| 6 | No `viewZoomFloor`; no pan/zoom commit debounce; no `resyncKey` | 06 |
| 7 | No `viewControls` / Reset View | 06 (reset), 09 (mode buttons) |
| 8 | Non-integer px/cell after pinch (`zoomBy`) — the likely visible blur | 06 |
| 9 | No pane store, no `renderMode`, no `CanvasSplit`, no second camera, no keyboard owner | 04, 09 |

### Timeline
- `ui/components/AppShell/AppShell.css:193-210` `.app__bottom` content-sized, `max-height: 50vh×scale`.
- `ui/components/FrameTimeline/FrameTimeline.css`: `.frame-timeline :1-9`, `.timeline-view :711-717`,
  `__scroll :850-854`, `__grid :856-862`, `__row :865-870` (32 px), thumbnail `:980-986`.
- `ui/components/TimelineView/TimelineView.tsx:57-105` props, `:138` root. Pixel default view is
  `frames` (`FrameTimeline.tsx:178`), which is why its rail is ~120–140 px regardless of layer count.
- No token for row height; `height`/`min-height` are not token-enforced (`client/.stylelintrc.json:51-81`).

### Naming
- `ui/components/Header/Header.tsx:91,163,424-437`; `containers/HeaderContainer.tsx:225,237`.
- `ui/components/BrushSelectModal/BrushSelectModal.tsx` strings at `:181,193,196,209,240,296,362,371,379`.
- `ui/components/BrushLibrary/BrushLibrary.tsx:103,117-118,137,211`. Validator `BrushLibrary/brushName.ts:28-33`.
- Pins: `BrushSelectModal.dom.test.tsx`, `BrushLibrary.dom.test.tsx`, `containers/__tests__/BrushStudioContainer.dom.test.tsx:130,136,142`.

### Edge/fill (pixel precedent)
- `stores/ui/ToolUIStore.ts:59,72,169,339-349,376-394`; `stores/ApplicationStore.ts:2003-2048`.
- `ui/components/ColorPicker/ColorPicker.tsx:61,63-101,637-687`; `ColorPicker.css:275-357`.
- `containers/ColorPickerContainer.tsx:99-150`; `containers/GlobalHotkeys.tsx:113-144`;
  tests `containers/__tests__/GlobalHotkeys.dom.test.tsx:145-236`.
- `ui/canvas/tools/toolHandlers.ts:63-75` (`ToolPixelWrite.color`), `:79-121` (`ToolContext`, only `currentColor`).
- `components/Canvas/drawingUtils.ts:195-209` `getShapeOutlineKeys`.
- `ui/components/BrushDeltaPicker/BrushDeltaPicker.tsx:9-13,42-49,127`; `containers/BrushStudioPanelContainer.tsx:58-59,164-178`.

### Gate commands (all confirmed to run at `4ed1d3c`)
`cd client && bunx tsc --noEmit` · `bunx eslint .` · `bunx vitest run` · `bun run lint:boundaries` ·
`bunx stylelint "src/**/*.css"` · `bunx storybook build` · `bun run build`; `cd server && bunx tsc --noEmit && bunx eslint . && bunx vitest run`;
root `bun run verify`. Lockfile check: `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules`.

---

## 5. Wave table

| Wave | Tasks | Parallel | Gate before next wave |
| --- | --- | --- | --- |
| W1 | 01 timeline floor, 02 naming, 03 BrushUIStore camera+deltas, 04 app.brushViews, 05 delta picker UI | 5 | client gate + `bunx stylelint "src/**/*.css"` (no new errors) + `bunx storybook build` |
| W2 | 06 canvas gesture parity, 07 panel + hotkey wiring | 2 | client gate |
| W3 | 08 edge/fill writes | 1 | client gate + **manual** (edge/fill) |
| W4 | 09 split view | 1 | client gate + stylelint + **manual** (panes, gestures, blur) |
| W5 | 10 final gate, docs, QA | 1 | `bun run verify` + boundaries + stylelint + storybook + server + lockfile |

"client gate" = `cd client && bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run lint:boundaries`,
then the lockfile check from the repo root returns nothing.

---

## 6. Dependency graph

```
01 timeline ──────────────────────────────────────────────────┐
02 naming ────────────────────────────────────────────────────┤
03 BrushUIStore ──┬──────────────► 06 canvas parity ──┐        │
                  └─► 07 panel+X ◄── 05 picker UI      ├─► 08 edge/fill writes ─► 09 split view ─► 10 final
04 app.brushViews ────────────────────────────────────┘ (04 → 09)
```
01 none · 02 none · 03 none · 04 none · 05 none · 06 → 03 · 07 → 03, 05 · 08 → 03, 06, 07 ·
09 → 04, 06, 08 · 10 → 09.

---

## 7. Collision matrix

**W1**
| 01 | 02 | 03 | 04 | 05 |
| --- | --- | --- | --- | --- |
| `ui/components/TimelineView/{TimelineView.tsx, TimelineView.stories.tsx, __tests__/TimelineView.dom.test.tsx}`, `ui/components/FrameTimeline/FrameTimeline.css`, `containers/BrushTimelineContainer.tsx` | `ui/components/BrushSelectModal/**`, `ui/components/BrushLibrary/{BrushLibrary.tsx, __tests__/BrushLibrary.dom.test.tsx}`, `containers/HeaderContainer.tsx`, `containers/__tests__/BrushStudioContainer.dom.test.tsx` | `stores/ui/BrushUIStore.ts`, `stores/ui/__tests__/BrushUIStore.test.ts` | `stores/ApplicationStore.ts`, `stores/__tests__/brushWiring.test.ts` | `ui/components/BrushDeltaPicker/**` |

Pairwise disjoint. ✔ (02 and 09 both touch `containers/__tests__/BrushStudioContainer.dom.test.tsx`, but in different waves.)

**W2**
| 06 | 07 |
| --- | --- |
| `containers/BrushCanvasContainer.tsx`, `containers/brush/{useBrushCamera.ts, useBrushPointerHandlers.ts, __tests__/useBrushPointerHandlers.dom.test.ts, __tests__/useBrushCamera.dom.test.ts}` | `containers/BrushStudioPanelContainer.tsx`, `containers/__tests__/BrushStudioPanelContainer.dom.test.tsx`, `containers/GlobalHotkeys.tsx`, `containers/__tests__/GlobalHotkeys.dom.test.tsx` |

Disjoint. ✔ 06 must not touch `brushToolContext.ts` (08's file).

Single-task waves need no matrix.

---

## 8. Alignment guide

**Imitate, don't invent:**
- Viewport adapter → `containers/LightingCanvasContainer.tsx:334-416` (hook call, `handleResetView`).
- Touch arbitration → `containers/CanvasContainer.tsx:5279-5333, 5448-5524` with `canvasTouchFilter`.
- Pane buttons and camera choice → `CanvasContainer.tsx:588-590, 5789-5806`; panes → `PixelStudioContainer.tsx:156-166`.
- Edge/fill tabs → `ColorPicker.tsx:637-687` + `ColorPicker.css:275-357`; container wiring → `ColorPickerContainer.tsx:99-150`.
- Per-pixel shape split → `CanvasContainer.tsx:5071-5106` + `drawingUtils.ts:195-209`.
- Store shape → `ViewportUIStore.setViewZoom/resetView`, `ToolUIStore.swapColors`.

**Boundaries that must not be crossed:** `ui/**` imports no store/API/MobX (the picker declares
its own `BrushDeltaTarget` union, as `ColorPicker` does `ColorTarget`); `observer()` only in
`containers/`; grids stay `observable.ref`; canvases redraw from `pixelVersion`/`domainVersion`;
**never add `will-change` or any compositing hint near a canvas** (`CanvasSurface.css:53-72`);
`combinedScale` computed in exactly one place per container; `contentWidth = cellWidth * zoom`,
never the backing store.

**`max-lines` (400 counted, `warn`):** `BrushCanvasContainer.tsx` is at 379. Tasks 06, 08, 09 each
add to it — every task pushes logic into `containers/brush/*.ts` and only wires in the container.
Report the counted line number in every report.

**What done looks like:** the brush canvas feels indistinguishable from the pixel canvas under
the fingers (same pinch curve, same pan, same reset button, same crispness); "Open Layer view"
appears in the same corner; the delta panel has the same Edge/Fill tabs as the colour panel; the
bottom rail is roomy with one layer; the header says "Brush Projects".

**Most likely mistakes:**
1. Passing `cellWidth` (1:1) as `contentWidth` to the hook — the clamp/floor thinks the content is
   `zoom` times smaller (`useCanvasViewport.ts:120-132`).
2. Leaving the old synthetic touch handlers alongside the hook's native listeners (double pinch).
3. Reading `e.touches` raw instead of `touchesInContainer` + `pinchTouches` (Pencil + resting finger becomes a pinch).
4. Letting both panes handle Escape/Delete (`keyboardOwner`).
5. Making the new picker props required in W1 (breaks the W2 container's compile).
6. Routing fill by colour *value* equality with a mutable object — use the sentinel's identity or its `a` byte.
7. Forgetting `fillDelta` in `getToolContext`'s dependency array.
8. Editing `brushToolContext.ts` from task 06 (collision with 08).

---

## 9. Risk register

| Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- |
| Blur persists after parity (cause is something unmeasured, e.g. device DPR) | Medium | Medium | Task 06 records the before/after chain; owner checks on iPad; if still blurry, log `combinedScale/zoom/viewZoom/devicePixelRatio` via the debug sink before touching CSS | 06 |
| `useCanvasViewport` and the brush container fight over touch (double handling) | Medium | High | Delete the synthetic pinch code; bail on `isPinching()`; dom tests assert no `zoomBy` on two fingers | 06 |
| `max-lines` fires on the container | High | Low | Helpers in `containers/brush/`; counted lines reported | 06, 08, 09 |
| Two panes double-apply keys / selection moves | Medium | Medium | `keyboardOwner` gating + test | 09 |
| Shape preview lies about a `"both"` commit | Medium | Low | Per-pixel preview colours from the same function as the commit | 08 |
| Renaming breaks exact-string pins | Certain | Low | Task 02 updates the four test files; BEM block name kept | 02 |
| Corpus digests | None expected | Critical | No `types/codecs`, `services`, `server/src/export` edits anywhere; final gate diff check | all, 10 |
| Parallel executors sweep each other's staged files | Medium | Low | Pathspec commits only (`git commit -- <paths>`) | all |

---

## 10. Rules for every executor

- **Bun only.** No `node`/`npm`. Never create a lockfile; after any `bunx`, run the lockfile check
  from the repo root and delete any lockfile it made. Never use the frozen-lockfile flag.
- **Never run `vitest -u`.** Any snapshot/corpus diff = stop and report.
- **Never touch** `server/src/data/**`, `server/exports/**`, `client/src/types/codecs/**`,
  `client/src/services/migrations/**`, `server/src/export/**`, any `__snapshots__`.
- **Stay inside `Touches`.** A co-located test/story that breaks purely from a prop you changed
  may be fixed minimally in the same commit — flag it. Anything else: stop and report.
- **Commit with the pathspec form** `git commit -- <your paths>`; never `git add -A`, `git add .`,
  `commit -a`, or a bare `git commit` (parallel executors share the index). Prefix
  `brush-followups(NN): …`.
- **`ui/` stays pure**; `observer()` only in `containers/`; grids `observable.ref`; no `will-change`.
- **Run the gate and paste real output.** Report counted line numbers for `BrushCanvasContainer.tsx`.
- **List every manual check you could not perform.** A task with manual checks skipped is PARTIAL.
- **Report honestly**, including what you could not finish and why. Do not break `bun run dev`.

---

## 11. Task index

| NN | Title | Wave | Effort | Summary |
| --- | --- | --- | --- | --- |
| 01 | Timeline rail minimum height (5 rows) | W1 | S | `TimelineView.minRows` + CSS floor; brush passes 5. |
| 02 | "Brush Projects" wording | W1 | S | Header button, modal title + intro, actions, rail header; tests updated. |
| 03 | BrushUIStore: `CanvasCamera` + fill delta | W1 | M | `viewZoom/setViewZoom/resetView`; `fillDelta`, `deltaTarget`, `activeDelta`, swap. |
| 04 | `app.brushViews` | W1 | S | Second `CanvasViewsUIStore` instance on `ApplicationStore`. |
| 05 | BrushDeltaPicker edge/fill UI | W1 | S | Tablist + swap, optional props, stories, tests. |
| 06 | Brush canvas gesture/camera parity | W2 | L | `useCanvasViewport` adapter, touch filter, pans, Reset View, blur comparison. |
| 07 | Panel + `X` wiring | W2 | S | Picker wired to the two slots; `X` swaps deltas in brush mode. |
| 08 | Edge/fill writes | W3 | M | Sentinel routing, per-pixel shape commit + preview, eyedropper into active slot. |
| 09 | Brush split view | W4 | M | `renderMode`, per-pane camera/controls/keyboard owner, `CanvasSplit` in the studio. |
| 10 | Final gate, docs, QA | W5 | S | Full gate, `ARCHITECTURE.md`, consolidated QA checklist, HANDOFF close-out. |
