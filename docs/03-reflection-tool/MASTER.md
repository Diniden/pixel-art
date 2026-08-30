# MASTER — Reflection tool

Plan folder: `docs/03-reflection-tool/`. Planned 2026-08-29. Executed by `/plan-go`.

## 1. Request

Verbatim (`docs/plans/reflection-tool.md`):

> I want to make a new tool: Reflection
>
> - This will let us draw a line (same concept as the line tool where press and drag begins drawing a line and release places the line)
> - This time the line will be drawn BETWEEN pixels.
> - Wherever the line is drawn, it will stay there as an animated dotted line.
> - To represent the pixels that are effected by this operation, imagine the line is the splitting middle of a rotated box. The box extends forever perpendicular to the line until all pixels are covered. These are the pixels that are affected by the operation.
> - Drawing or editing on one side of the line draws the exact same thing on the other side.
> - The reflection tool will remain in place and be valid even when switching layers.
> - We should be able to draw as many reflection lines as we want.
> - The tool should have a tool panel in the tool rail, it will track the reflection lines drawn and will allow the user to cancel those lines via an x icon in there.
> - The tool should have some common reflect strategies that you can click to auto draw some lines for you.

**Interpretation.** A new pixel-studio tool `reflection`. While selected, a press-drag
gesture draws a guide line whose endpoints snap to the lattice of cell corners ("between
pixels"). Released lines persist as animated dotted guides on their own overlay canvas
and keep working no matter which tool, layer, frame or object is selected afterwards.
Every pixel write from any drawing tool is mirrored across every line (the "infinite
box" is simply: reflect each written cell across the infinite line; drop images that land
off-grid). The right-rail `PixelStudioPanel` shows a Reflection section listing the lines
with ✕ buttons, Clear all, and preset buttons (vertical, horizontal, both, diagonals, all).

**Assumptions made.**
- "As many as we want" is capped at 8 lines (2^8 images per write worst case). Stated in the UI by disabling presets at capacity.
- Lines are **session state** (survive layer/frame/object switches, cleared on project switch, not saved to the project file, not undoable). Persisting them would extend the wire format across the owner's 151 backup snapshots and was not asked for.
- Move tool, selection move/delete and the lighting studio are **not** mirrored — they are layer-wide transforms, not "drawing".
- The guide is drawn as the segment the user dragged; the *effect* extends infinitely.

## 2. Outcome

When done, the owner can press `R` (or click the Reflection button), drag across the
canvas, and see an animated dotted guide between pixel rows/columns. Drawing with the
pencil, eraser, fills, line, rectangle, ellipse or square brush on one side produces the
same pixels on the other side, undoable as one entry per stroke; shape previews show
their mirror. Up to 8 lines compose (vertical + horizontal → 4-fold symmetry). The panel
lists the lines, removes any with ✕, clears all, and applies presets. Lines survive
switching layers/frames and disappear when another project is opened. Mouse and touch
both work. `bun run verify` passes.

## 3. Locked decisions

| # | Decision | Value |
| --- | --- | --- |
| D1 | Tool id / hotkey / icon / label | `"reflection"` · `R`/`r` · lucide `FlipHorizontal` · "Reflection (mirror across lines)", after Ellipse in the toolbar |
| D2 | Coordinate frame | Grid space of the editable grid (`gridWidth × gridHeight`, variant-local when editing a variant). Cell `(x,y)` = `[x,x+1)×[y,y+1)`. Hand-drawn endpoints snap to the **integer corner lattice** `0..w × 0..h` via a new `screenToPixel` mode `"corner"` (round + clamp). Presets may use half-integers for odd sizes. |
| D3 | Cell reflection | Reflect the cell centre `(x+0.5, y+0.5)` across the infinite line, `floor` (with 1e-9 epsilon), drop if off-grid. |
| D4 | Multiple lines | Sequential closure: `S = S ∪ reflect(S, line)` per line, originals first, dedupe by `y*w+x` keeping the first occurrence. `MAX_REFLECTION_LINES = 8`. Degenerate (zero-length) lines rejected. |
| D5 | Where mirroring happens | The single closure `actions.setPixels` in `CanvasContainer.tsx:464` (all 10 write paths funnel through it) and `actions.setPreviewPixels` (`:506`). **Mirror-then-mask**: images outside an `editMask` selection are dropped by `PixelStore.allows`. Not mirrored: `moveLayerPixels`, `moveSelectedPixels`, `deleteSelectionPixels`, lighting studio. `PixelStore` and `toolHandlers.ts` are not modified. |
| D6 | State home & lifetime | New `stores/ui/ReflectionUIStore.ts`, attached as `app.reflection`. `lines`/`draft` are `observableRef`, replaced wholesale. Not in `toPersistedUIState()`. Not in history. Cleared by a `reaction` on `DomainStore.loadGeneration` in `ApplicationStore` (not via `adoptProject`, which also runs on undo). |
| D7 | Gesture routing | Arbitrated in `CanvasContainer` ahead of the tool table, exactly like `origin`; `toolHandlers` gets an empty `reflection: {}` entry; `isGestureTool` gains `"reflection"`; never opens a history stroke. Mouse and touch; pinch cancels the draft. |
| D8 | Rendering | Sixth always-mounted overlay canvas (`reflectionCanvasRef`, class `canvas__overlay canvas__overlay--reflection`, last in `.canvas__frame`). Pure painter `ui/canvas/render/renderReflectionLines.ts` (geometry + stroke split). Colours `ACCENT_VARIANT` 2px + `WHITE` 1px, dash `[4,4]`, opposite phase; draft at alpha 0.5. Guide = the dragged segment, not extended. |
| D9 | Animation | New `ui/hooks/useDashTicker.ts`: rAF loop, phase += 1 every 80 ms mod 8, active only while lines or a draft exist. Phase lives in a ref; repaint via `useCanvasRender(...).invalidate()`. Never through the main `render`. `CanvasSurface.reflectionCanvasRef` is optional so W1 compiles independently. |
| D10 | Panel | New pure `ui/components/PixelStudioPanel/ReflectionLinesSection.tsx` (block `reflection-lines`), rendered by `PixelStudioPanel` when `selectedTool === "reflection"`, wired by `PixelStudioPanelContainer`. Presets computed by `presetLines()` in the geometry module, called from the container. |
| D11 | Split-canvas Layer pane (plan 02) | Out of scope. Only the main `CanvasSurface` gets the overlay. Recorded for plan 02 W2/W3 in task 08's notes. |

## 4. Ground truth (measured 2026-08-29)

- Refresh: **complete.** MobX stores in `client/src/stores/`, pure `client/src/ui/`, `observer()` only in `client/src/containers/`. No `REFRESH/` ledger remains. Zustand `store/` is legacy-only residue (`storeTypes.ts`).
- Branch state: `feat/02-split-canvas-render-modes`, HEAD `ba5b5af`, **dirty**: plan 02 W1 in progress, uncommitted edits to `client/src/stores/ApplicationStore.ts`, `stores/ui/ViewportUIStore.ts`, `ui/components/CanvasViewControls/*`, plus untracked `CanvasCameraStore.ts`, `CanvasViewsUIStore.ts` and tests. Plan 02 tasks 05/06 (`CanvasContainer` render mode, PixelStudio wiring) are TODO and will later touch `CanvasContainer.tsx`.
- Gate (run from `client/`): `bunx tsc --noEmit` 0 · `bunx eslint .` 0 errors/64 warnings · `bunx vitest run` 117 files / 1984 tests pass (≈70 s) · `bun run lint:boundaries` OK (5 rules) · `bunx stylelint "src/**/*.css"` **exit 2 — 2 pre-existing errors** (`ConfirmDialog.css:15`, `IconButton.css:32`, from commit `feff5fa`) · `client/.storybook/` exists · `bun run verify` at root. Vitest has two lanes: `unit` (node; `*.test.ts`) and `dom` (jsdom; `*.dom.test.*`). No lockfile present; `bunx` did not create one during measurement.
- Tool system: `Tool` union `types/domain.ts:261-277` (16). Dispatch table + exhaustiveness gate `ui/canvas/tools/toolHandlers.ts:186-286`. Line tool = `onMove` preview only; commit in `CanvasContainer.finishDrawingStroke` `:2253-2270`. Hotkeys `ui/hooks/useCanvasKeyboard.ts:46-80` (`R` free). Toolbar array `ui/components/Toolbar/PixelStudioTools.tsx:90-118`.
- Write choke point: `CanvasContainer.tsx:464` `actions.setPixels → app.pixels.setPixels(pixels, app.selectionUI.writeOptions)`; all 10 production write paths funnel through it (pencil, eraser, square, flood, gaussian, both trace modes, shape commits). `PixelStore.setPixels` `stores/domain/PixelStore.ts:710-757` dedupes (later wins), one history entry, one `pixelVersion` bump.
- Coordinates: `ui/canvas/model/coords.ts:76-142` modes `"pixel"` (floor) and `"origin"` (half-cell round, object space). Container bindings `:621-651`.
- Gesture arbitration: `isGestureTool` `:277-284`; origin handled ahead of the table `:1925-1929`; touch bails on gesture tools `:2431`, `:2520`.
- Rendering: `CanvasSurface.tsx` mounts 5 canvases (`:43-59`); hover canvas + `useCanvasRender` (`ui/hooks/useCanvasRender.ts`, one-shot rAF) is the overlay precedent (`CanvasContainer.tsx:1252-1302`). **No animation loop exists**; marching ants are static (`renderSelectionOverlay.ts:270-334`). Canvas colours only from `ui/theme/canvasTokens.ts` (parity test).
- Stores: pattern `stores/ui/CanvasCameraStore.ts`; wiring template = the uncommitted `CanvasViewsUIStore` hunks in `ApplicationStore.ts`. Persistence = explicit builder `stores/ui/UIStore.ts:345-512`; absence = not persisted. No UI-store reset hook exists; `DomainStore.loadGeneration` (`:209`, observable) is the fresh-install signal. `ApplicationStore.dispose()` at `:1654`.
- Panel: `ui/components/PixelStudioPanel/PixelStudioPanel.tsx:122-125` per-tool gating; container `containers/PixelStudioPanelContainer.tsx`. No story/test exists for the panel.
- Grid: `Layer.pixels: PixelData[][]` `[y][x]`, cells `{color|0, normal|0, height}`; dims from `object.gridSize` or `variant.gridSize` (`PixelStore.resolveTarget` `:333-393`). Owner's project: 300,249 cells.

## 5. Wave table

| Wave | Tasks | Parallel | Gate before next wave |
| --- | --- | --- | --- |
| W1 | 01 register tool · 02 geometry + corner snap · 03 store + wiring · 04 painter + ticker · 05 CanvasSurface layer | 5 | `cd client && bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run lint:boundaries` all exit 0 (eslint 0 errors); `bunx stylelint "src/**/*.css"` shows exactly the 2 baseline errors; `bunx storybook build` ok; `find . -maxdepth 2 -name 'bun.lock*' \| grep -v node_modules` empty |
| W2 | 06 panel section · 07 CanvasContainer integration | 2 | same client gate + task 07's 11 manual checks recorded |
| W3 | 08 full gate + QA + handoff | 1 | `bun run verify` exit 0 at root; `bun run dev` starts |

## 6. Dependency graph

```
01 register ──────┬──► 06 panel ──────┐
03 store ─────────┤                   ├──► 08 gate/QA
02 geometry ──────┤                   │
04 painter/ticker ┼──► 07 container ──┘
05 surface ───────┘
```
- 01–05: no dependencies (03 declares `ReflectionLine` locally; 05 makes its prop optional).
- 06 ← 01 (`"reflection"` in `Tool`), 03 (`app.reflection`), and uses 02's `presetLines`/`describeLine` (W1, landed).
- 07 ← 01, 02, 03, 04, 05.
- 08 ← 06, 07.

## 7. Collision matrix

**W1**

| Task | Touches |
| --- | --- |
| 01 | `types/domain.ts` · `ui/canvas/tools/toolHandlers.ts` · `ui/hooks/useCanvasKeyboard.ts` · `ui/hooks/__tests__/useCanvasKeyboard.dom.test.ts` · `ui/components/Toolbar/PixelStudioTools.tsx` |
| 02 | `ui/canvas/model/reflection.ts` (new) · `ui/canvas/model/__tests__/reflection.test.ts` (new) · `ui/canvas/model/coords.ts` · `ui/canvas/model/__tests__/coords.test.ts` |
| 03 | `stores/ui/ReflectionUIStore.ts` (new) · `stores/ui/__tests__/ReflectionUIStore.test.ts` (new) · `stores/ApplicationStore.ts` |
| 04 | `ui/canvas/render/renderReflectionLines.ts` (new) · `ui/canvas/render/__tests__/renderReflectionLines.test.ts` (new) · `ui/hooks/useDashTicker.ts` (new) · `ui/hooks/__tests__/useDashTicker.dom.test.ts` (new) |
| 05 | `ui/components/CanvasSurface/CanvasSurface.tsx` · `…/CanvasSurface.css` · `…/CanvasSurface.stories.tsx` · `…/__tests__/CanvasSurface.dom.test.tsx` |

01 and 04 both live under `ui/hooks/` but touch different files (`useCanvasKeyboard*` vs `useDashTicker*`). No file appears twice.

**W2**

| Task | Touches |
| --- | --- |
| 06 | `ui/components/PixelStudioPanel/ReflectionLinesSection.{tsx,css,stories.tsx}` (new) · `…/__tests__/ReflectionLinesSection.dom.test.tsx` (new) · `…/PixelStudioPanel.tsx` · `containers/PixelStudioPanelContainer.tsx` |
| 07 | `containers/CanvasContainer.tsx` |

Disjoint. W3 is single-task.

## 8. Alignment guide

- **Names to hold:** tool id `reflection`; store `ReflectionUIStore` / `app.reflection`; types `ReflectionLine {id,x1,y1,x2,y2}`, `ReflectionPreset`; module `ui/canvas/model/reflection.ts` (`expandWrites`, `reflectCell`, `presetLines`, `describeLine`, `MAX_REFLECTION_LINES`); painter `renderReflectionLines.ts` (`reflectionSegments`, `drawReflectionLines`); hook `useDashTicker`; ref `reflectionCanvasRef`; BEM block `reflection-lines`; snap mode `"corner"`.
- **Analogues to imitate:** origin tool (gesture ahead of the table, half-cell snapping) · hover canvas (own overlay + own `useCanvasRender`) · `renderOriginCross.ts` (geometry/stroke split + tests) · `CanvasCameraStore.ts` / `CanvasViewsUIStore.ts` + tests (store shape, header banner, ref assertions) · `PixelStudioPanel` shape-button row (preset row) · `CanvasViewControls` (story + dom test skeleton).
- **Boundaries:** nothing under `ui/` imports a store, MobX or the API; `observer()` only in `containers/`; `stores/domain/**` never reads `stores/ui/**` (this plan does not touch domain at all); pixel grids are never mutated in place and never deep-observed; `previewPixels`/`lines`/`draft` are refs replaced wholesale.
- **What done looks like:** a purple/white dotted line crawling slowly between pixel rows; pencil strokes appearing symmetrically in real time with no lag; one undo reverting both halves; the panel row count matching the guides on screen; lines outliving layer switches and dying on project switch.
- **Most likely mistakes:** snapping to cell centres instead of corners (use `"corner"`, not `"origin"`) · opening a history stroke for the reflection gesture · animating through the main render or via `useState` per tick · letting an image overwrite its original in the same batch (originals first, dedupe keeps first) · forgetting the touch path (origin/selection never worked on touch — reflection must) · clearing lines on undo by hooking `adoptProject` · adding a key to `toPersistedUIState()` · reusing `FlipHorizontal2` (already the flip action icon) · committing plan 02's dirty hunks in `ApplicationStore.ts` along with task 03's.

## 9. Risk register

| Risk | L | I | Mitigation | Owner |
| --- | --- | --- | --- | --- |
| Dirty worktree from plan 02 W1 shares `ApplicationStore.ts` with task 03 | High | Med | Stage own hunks only (`git add -p`); never revert others; ideally commit plan 02 W1 before `/plan-go` | 03 |
| Plan 02 tasks 05/06 will also edit `CanvasContainer.tsx` later | Med | Med | Task 07's edits are localised (documented seams table); plan 02 notes D11 | 07, 08 |
| `types/domain.ts` change drifts corpus snapshots | Low | High | No wire-format key added; full vitest run must pass with no `-u` | 01 |
| Mirrored writes 2^N blow the 16 ms frame budget | Low | Med | Cap 8 lines; manual perf check item 11; dedupe before `setPixels` | 02, 07 |
| Animation loop regresses touch drawing (2026-08-28 class of bug) | Med | High | Phase in a ref, invalidate-only repaint, dedicated canvas; manual check 6 | 04, 07 |
| Reflection lines mis-positioned on variant layers with different `gridSize` | Med | Low | Lines live in editable-grid space; off-grid images dropped; documented in plan notes | 02, 08 |
| New CSS adds stylelint errors hidden by the 2-error baseline | Med | Low | Task gates run stylelint on the new files alone; task 08 asserts count == 2 | 05, 06, 08 |
| Touch gesture-tool bail swallows the reflection gesture | High | Med | Reflection branch placed before the bail on all three touch handlers | 07 |

## 10. Rules for every executor

- Bun only; never `node`/`npm`; `bun add --exact`; **never** create a lockfile — check `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` after any `bunx`.
- Never `vitest -u`. Corpus/roundtrip/persistedUIState snapshots must pass unchanged.
- Never break `bun run dev`.
- `ui/` imports no store/MobX/API; `observer()` only in `containers/`; run `bun run lint:boundaries`.
- Pixel grids: never deep-observe, never mutate in place; all writes via `PixelStore.setPixels`.
- Stay inside your task's `Touches`. If you need another file, stop and record BLOCKED in HANDOFF.
- Commit at task granularity with the messages given; do not commit unrelated dirty files.
- Paste real gate output into HANDOFF. Manual checks are mandatory; a task with skipped manual checks is PARTIAL, not DONE. Report partial completion honestly.

## 11. Task index

| NN | Title | Wave | Effort | Summary |
| --- | --- | --- | --- | --- |
| 01 | Register the `reflection` tool | W1 | S | Union member, empty dispatch entry, hotkey R, toolbar button |
| 02 | Reflection geometry + corner snapping | W1 | M | Pure `reflection.ts` (reflect/expand/presets) and `"corner"` snap mode, tested |
| 03 | `ReflectionUIStore` + wiring | W1 | M | Session-only lines/draft store, attached to `ApplicationStore`, cleared on `loadGeneration` |
| 04 | Painter + dash ticker | W1 | M | `renderReflectionLines.ts` geometry/stroke split; `useDashTicker` rAF loop |
| 05 | CanvasSurface overlay canvas | W1 | S | Optional `reflectionCanvasRef`, sixth canvas, stories/test updated |
| 06 | Panel section | W2 | M | `ReflectionLinesSection` (list, ✕, clear, presets) in `PixelStudioPanel` + container |
| 07 | CanvasContainer integration | W2 | L | Gesture (mouse+touch), write/preview mirroring, animated overlay, 11 manual checks |
| 08 | Full gate + QA + handoff | W3 | S | `bun run verify`, stylelint baseline, integrated manual pass, notes |
