# Transform tool — MASTER plan

Planned 2026-09-27. Measured on `main @ 96e0284` (application source identical to `9007990`, the
plan-13 merge); **published on `main @ 9d94103`, whose parent `8eb365c` is the plan-14 merge.** The
drift between the two was re-checked before publishing: of every file this plan cites, only
`client/src/stores/ApplicationStore.ts` changed (+26 lines — `undo()` is now at `:1924`, the
pose / reaction anchors at `:620-627` are unchanged). Executed by `/plan-go`, one fresh agent per
task. **Read this file, `CLAUDE.md`, and your task file. Nothing else is required; nothing else is
assumed.**

> **Ordering note.** Plan 14 (`docs/14-multi-brush-projects/`) is **merged**. Plan 15
> (`docs/15-brush-application-mapping/`) and plan 16 (`docs/16-studio-aware-tool-config/`) are
> written and unexecuted. This plan has **no dependency** on either, but it edits three files plan 15
> also edits (`toolHandlers.ts`, `PixelStore.ts`, `CanvasContainer.tsx` — additive in every case).
> Run plans **sequentially**, never two at once on the same base, and re-read the lines cited here on
> the branch you cut: line numbers were measured on `96e0284`, symbols are the anchor.

---

## 1. Request

Verbatim:

> We need to implement a generic transform tool:
> - If there is nothing selected, this tool should start as the selection tool
> - When a selection is present, the transform tool shows 8 points around the edge of the selection that can be used for dragging to scale x, scale y, or both. If the mouse hovers outside of the corner points, it should make the mouse show as a curved arrow and there the user can click and drag to rotate the pixels.
> - Because we are dealing with pixels and not continuous information, while the selection is present, THAT will keep on record the ORIGINAL pixel data and the transform will enact on the original data to compute the new pixel information and display to the user. This orginal data is retained until the selection is removed or changed.
> - The rotations and scaling should be happening at a float granularity and that granularity should be applied to compute the correct pixel outcome so the user's experience is smoothe while the outcome is bucketized to pixels.
> - Make sure pressing escape removes the selection.

### Interpretation

A new pixel-studio tool, `"transform"` (hotkey `T`). With no selection it behaves exactly like the
Selection tool (rect / flood / lasso / colour per the current `selectionMode`). With a selection it
draws a frame around the selection's bounds with **eight handles** (four corners scale both axes, four
edge midpoints scale one axis), a **rotate band** just outside the corners where the cursor becomes a
curved arrow and dragging rotates, and the frame's interior where dragging translates. The first
gesture **lifts** the original pixels under the selection into a session (`app.transform`); every
gesture since then edits one continuous transform (centre, scale x/y, rotation in floats) that is
re-applied to the **lifted** pixels — never to the canvas — and rasterised with nearest-neighbour
inverse mapping to whole cells for the live preview. The project grid is untouched until the session
ends: Enter commits and the selection follows the result; **Escape clears the selection**, which ends
the session by committing it (one undo entry); switching tool, changing the selection by any other
means, or changing frame / layer / object also commits. Undo during a session resets the transform
instead of touching history.

### Assumptions where the request was ambiguous

| Ambiguity | Decision |
| --- | --- |
| Is this a new tool or a mode of the Selection tool? | A **new tool** `"transform"` — the request says "this tool should start as the selection tool", i.e. it is its own toolbar entry that degrades to selecting when there is nothing to transform. The Selection tool is unchanged. |
| What does dragging **inside** the frame do? | **Translate** (float, bucketised like everything else). The request lists handles and the rotate band; a transform frame whose interior does nothing would be a surprise. The Selection tool's `movePixels` / `moveSelection` / `editMask` behaviours do **not** apply to the transform tool — its interior always translates the lifted pixels. |
| What does a press **outside** the rotate band do? | Falls through to the Selection-tool gesture (starts a new selection per `selectionMode`). Releasing that gesture replaces the selection, which commits the pending transform first. |
| Does Escape cancel or commit the pending transform? | The request says Escape removes the selection, and the original pixels are retained only while the selection exists — so Escape **ends the session by committing** the transformed pixels (one undo entry) and clears the selection. Cancel is ⌘Z (resets the transform to identity while the session is open) or, after committing, ⌘Z again. |
| Sampling | **Nearest-neighbour inverse mapping**: every destination cell's centre is mapped back through the inverse transform and floored to a source cell. Float scale and rotation are honoured exactly; the output is whole cells with no holes; pixel-art edges stay hard. No smoothing kernels. |
| Which cells are lifted | Only **non-empty** masked cells (`color !== 0 || normal !== 0 || height !== 0`). Empty cells inside the selection do not become "transparent paint" that erases artwork where they land. Vacated source cells are written empty on commit unless the result covers them. |
| Normal-map channel under rotation | The `normal` vector is copied, **not rotated**. Rotating normals is a lighting-studio concern and is recorded as an open item. |
| Variant layers | The transform tool is **inert while editing a variant layer** (`app.isEditingVariant`): no lift, no frame; it still selects. `PixelStore.resolveTargetFor` refuses variant layers by design and their grid size differs from the object's. |
| Modifier keys | Shift on a corner handle = uniform scale; Shift while rotating = snap to 15°. No Alt/Option behaviour. Touch has no modifiers. |
| Negative scale | Allowed — dragging a handle past its anchor flips the pixels. |
| Where the frame's screen size comes from | Handles are **8 screen px** squares with an 8 px hit radius; the rotate band is **24 screen px** wide outside the frame; both divided by `combinedScale` for hit-testing in cell space. |
| Brush Studio / Lighting Studio | Hidden and inert in the Brush Studio (like `brush`, `origin`); the Lighting Studio's toolbar is separate and untouched. |
| Other Hand Mode | Title only (`TOOL_TITLES.transform = "Transform"`); no thumb widgets. |
| Panel section | None in this plan (readouts / Apply / Reset buttons are an open item). Enter applies, Escape ends, ⌘Z resets. |

---

## 2. Outcome

When every wave is DONE the owner can:

1. Press `T` (or the toolbar button after Selection). With nothing selected, drag a rectangle (or
   flood / lasso / colour per the selection mode) exactly as the Selection tool does.
2. With a selection, see a frame with eight handles. Drag a corner: the pixels scale on both axes
   with the opposite corner fixed; drag an edge midpoint: one axis; hold Shift on a corner: uniform.
   Hover just outside a corner: the cursor becomes a curved arrow; drag: the pixels rotate about the
   frame's centre, smoothly, with the preview re-bucketised to whole cells every frame. Drag inside:
   the pixels move.
3. Scale, then rotate, then scale again: every step is computed from the **original** pixels lifted
   when the first gesture started — no accumulated resampling. The frame follows the transform; the
   original cells are shaded until the result covers them.
4. Press Enter: the result is written to the layer in **one** undo entry and the selection now
   outlines the transformed pixels. Press Escape instead: the result is written the same way and the
   selection is cleared. Switch tool, click elsewhere to start a new selection, or change frame /
   layer: the pending result is committed first. ⌘Z while a transform is pending resets it to identity
   without touching history; ⌘Z after committing restores the original pixels.
5. All of it works with a mouse and with touch / Pencil on the iPad (pinch cancels the current drag).
6. Nothing else changes: the Selection tool, its three behaviours, the corpus digests and every
   snapshot are untouched; the brush studio hides the tool.

---

## 3. Locked decisions

| # | Decision | Value |
| --- | --- | --- |
| D1 | **Tool registration** | `"transform"` appended to the `Tool` union after `"brush"` (`types/domain.ts`) with a two-line comment; `toolHandlers.ts` entry `transform: {}` (arbitrated ahead of the table like `selection`); hotkey `t` / `T` (`useCanvasKeyboard.ts` `TOOL_HOTKEYS`, `HotkeyTool` union 14 → 15; `t` is free); toolbar row **directly after** the Selection row in `PixelStudioTools.tsx`: `{ id: "transform", icon: Scaling, label: "Transform (scale / rotate the selection)", hotkey: "T" }` (lucide `Scaling`, present in `lucide-react@0.575.0`); `BRUSH_HIDDEN_TOOLS` (`PixelStudioToolsContainer.tsx`) and `BRUSH_INERT_TOOLS` (`brushToolContext.ts`) gain it; `TOOL_TITLES.transform = "Transform"` (`toolWidgets.ts`). The hotkey path that clears the selection when switching **away from** `"selection"` (`useCanvasKeyboard.ts:221-230`) treats `"transform"` the same way. `isGestureTool` (`CanvasContainer.tsx:388-397`) gains `"transform"` in task 10. |
| D2 | **Geometry module** (pure, new `client/src/ui/canvas/model/transform.ts`) | Exact API in the type block below. Coordinates are **world cell units** on the editable grid (cell `(x, y)` spans `[x, x+1) × [y, y+1)`), floats. The transform maps source space to world space as `world = c + R(θ) · S · (p − c0)` with `c0` = the source bounds' centre, `c = (cx, cy)` the transformed centre, `S = diag(scaleX, scaleY)`, `θ` radians counter-clockwise on screen (y down → the usual `[[cos, -sin],[sin, cos]]` on screen axes). Identity = `{ cx: c0.x, cy: c0.y, scaleX: 1, scaleY: 1, rotation: 0 }`. `transformQuad` returns the four corners TL, TR, BR, BL of the bounds' corner lattice `(x, y), (x+w, y), (x+w, y+h), (x, y+h)` mapped forward. Handles: `nw, n, ne, e, se, s, sw, w` = corners and edge midpoints of the quad, in that order. |
| D3 | **Hit-testing** (`hitTestTransform(point, params, bounds, combinedScale)`) | Order: (1) `handle` if the point is within `HANDLE_HIT_RADIUS_PX / combinedScale` of any handle (nearest wins); (2) transform the point into the box's **local frame** (`inverse rotation about c`, no scale): `inside` if `|lx| ≤ hw && |ly| ≤ hh` where `hw = |scaleX|·w/2`, `hh = |scaleY|·h/2`; (3) `rotate` if `|lx| ≤ hw + band && |ly| ≤ hh + band` with `band = ROTATE_BAND_PX / combinedScale` (the band surrounds the whole frame — "outside the corner points" is where it is widest visually, and an edge-adjacent band is harmless); (4) `outside`. Constants `HANDLE_HIT_RADIUS_PX = 8`, `HANDLE_SIZE_PX = 8`, `ROTATE_BAND_PX = 24`. |
| D4 | **Drag math** (`dragParams(drag, point, modifiers, bounds)`) | All in the local frame `u = R(−θ0) · (p − c_start)` at the drag's `startParams`. **Handle**: the **opposite handle is the anchor** and stays fixed in world space. For each dragged axis the new signed half-extent is derived from the pointer's local coordinate relative to the anchor (`extent = (u_axis − a_axis)`; `scale = extent / w` (or `h`), sign preserved, magnitude clamped to `≥ 0.5 / w` so the box never collapses); untouched axis keeps its scale; corner + `uniform` (Shift) applies the dragged corner's **x-ratio** to both axes (`scaleY = sign(scaleY) · |scaleX_new| · |scaleY0| / |scaleX0|`); then `c_new = c_start + R(θ0)·(a_old − a_new)` where `a_old`/`a_new` are the anchor's local positions before/after so the anchor does not move. **Rotate**: `θ = θ0 + (atan2(p − c) − atan2(p_start − c))`, normalised to `(−π, π]`; `snap` (Shift) rounds to multiples of `π/12`. **Inside**: `c = c_start + (p − p_start)`. Rotation and scale never change during a translate; centre never changes during a rotate. |
| D5 | **Rasterisation** (`rasterizeTransform(source, params, gridWidth, gridHeight)`) | Destination box = the integer bounding box of `transformQuad` (floor of min, ceil of max), intersected with the grid. For every destination cell `(x, y)` in it: `s = inversePoint((x + 0.5, y + 0.5))`, `sx = floor(s.x + 1e-9)`, `sy = floor(s.y + 1e-9)`; if `source.cells` has `sy * source.width + sx` → `cells.set(y * gridWidth + x, that PixelData)` (the same object reference — the commit copies). `vacated` = every key of `source.cells` not in `cells`. Returns `{ cells, vacated, box }`. Identity params reproduce the source exactly (pinned). |
| D6 | **Commit writes** (`transformCommitWrites(result, source)`) | `PixelCellWrite[]`: one `{ x, y, color: 0, normal: 0, height: 0 }` per vacated cell **first**, then one `{ x, y, ...copy of the PixelData }` per result cell (later wins per cell in `setPixelCells`, so a covered source cell is written once with the new value). |
| D7 | **Domain write** (`stores/domain/PixelStore.ts`) | `setPixelCells(cells, options = {}, label = "Stamp pose")` — the label becomes an optional third parameter (the pose stamp keeps its label by default). New `setPixelCellsAt(target: { objectId; frameId; layerId }, cells, options = {}, label = "Transform selection")` resolving through a new private `resolveTargetIn(objectId, frameId, layerId)` (the `resolveTargetFor` body with the object id supplied instead of read from the selection; refuses variant layers; `null` → silent no-op). Same dedupe and one `commitCells` as `setPixelCells`; no transaction (a single call is already one entry). Nothing else in `PixelStore` changes. |
| D8 | **Session store** (new `stores/ui/TransformUIStore.ts`, `app.transform`) | `session: TransformSession \| null` and `params: TransformParams \| null`, both `observable.ref`. `TransformSession { target: { objectId; frameId; layerId }; gridWidth; gridHeight; bounds: SelectionBox; source: TransformSource; selectionRef: object }` — `selectionRef` is the `SelectionUIStore.selection` object identity at lift time (so "the selection changed" is a reference compare, never a mask compare). Actions: `begin(session)` (sets `params = identityParams(bounds)`), `setParams(p)`, `nudge(dx, dy)` (moves `cx, cy`), `reset()` (params → identity), `end()` (both null). Computeds: `isActive` (session ≠ null), `isPending` (active and `!isIdentity`), `result` (`rasterizeTransform` over session + params, `null` when inactive — memoised by MobX, recomputed only when a ref changes). Session-only: **nothing persisted**, nothing in history, `persistedUIState.test.ts` unchanged. May import the pure geometry module (`PixelBrushUIStore` imports `@/ui/canvas/tools/pixelBrushScale` — precedent). |
| D9 | **Lift** (`containers/transform/liftTransformSource.ts`) | `liftTransformSource(app): TransformSession \| null` — `null` unless `app.selectionUI.selection`, `app.currentObject/currentFrame/currentLayer` exist, `!app.isEditingVariant`, and the selection's `width/height` equal the object's `gridSize`. Walks `selection.mask` once, reads `app.editableGrid.grid[y][x]`, keeps non-empty cells into a `Map<number, PixelData>` keyed `y * width + x`. Runs once per session (first consumed press), never at pointer rate, never inside an observer render. |
| D10 | **Session lifecycle** (`ApplicationStore`) | `this.transform = new TransformUIStore()` after `pose`. Reaction A (`loadGeneration` → `transform.end()`, the reflection/pose pattern). Reaction B on the tuple `[selectionUI.selection, ui.tool.selectedTool, ui.timeline.selectedObjectId, selectedFrameId, selectedLayerId]`: when a session exists and (`selection !== session.selectionRef` or tool ≠ `"transform"` or any target id differs) → `commitTransform({ selectFollows: false })`. `commitTransform({ selectFollows }): boolean` — reads `session`, `isPending`, `result`; calls `transform.end()` **before** any write (so reaction B sees no session when the selection is updated); if pending: `pixels.setPixelCellsAt(session.target, transformCommitWrites(result, session.source), {}, "Transform selection")` then, if `selectFollows`, `selectionUI.setSelectionMask(new Set(result.cells.keys()), { width, height })`; returns whether anything was written. `undo()`: when `activeHistory === history` and `transform.isPending` → `transform.reset()` and return (no history navigation); `redo()` unchanged. Both reactions disposed in `dispose()`. |
| D11 | **Keyboard** (`useCanvasKeyboard.ts`) | `CanvasKeyboardOptions` gains `transformActive: boolean`, `commitTransform: () => void`, `nudgeTransform: (dx, dy) => void`. `Enter` (no modifiers, not from a dialog / text field) with `transformActive` → `commitTransform()` (the container passes `selectFollows: true`), `preventDefault`. Arrow keys with `transformActive` → `nudgeTransform(dx, dy)` **instead of** the selection / layer nudges (they would write to the grid under a pending transform). `Escape` is **unchanged**: it clears the selection, and reaction B commits. `Delete` / `Backspace` unchanged (documented edge: deleting under a pending transform deletes the source cells, then the commit writes the result — acceptable, rare). |
| D12 | **Float coordinates** (`ui/canvas/model/coords.ts`) | New `SnapMode` `"float"`: the `"pixel-unbounded"` branch without `Math.floor` — returns the raw world cell coordinate (variant view offset applied exactly as `"pixel"` does), never `null` except for a degenerate rect, never clamped. Container wrapper `getFloatCoords(clientX, clientY)` beside `getCornerCoords`, through `canvas.getBoundingClientRect()` and `coordGeomRef.current` like the others (the rect rule — `coords.ts:9-15`). |
| D13 | **Preview raster** (new `ui/canvas/render/renderTransformPreview.ts`) | Pure painter on a `cellWidth × cellHeight` overlay canvas: `clearRect`; `ctx.translate(-viewMinX, -viewMinY)`; every vacated source cell `fillRect(x, y, 1, 1)` with `BLACK_12`; every result cell `fillRect` with its colour as `rgba` at full opacity (empty colour never occurs — lifted cells are non-empty). Geometry exported separately from stroking (the `canvasStub` convention). Colours only from `ui/theme/canvasTokens.ts`. Painted by its **own** `useCanvasRender` in the container (pose D11 pattern), invalidated from a MobX `reaction` on `[transform.session, transform.params]`, never through the main `render`. |
| D14 | **Frame chrome** (new `ui/canvas/svg/transformOverlay.ts` + `ui/components/CanvasSurface/TransformChrome.tsx`) | `transformFrameOverlay(quad, handles, inverseScale): TransformFrameOverlay` = `{ outline: SvgPathSpec (closed quad path, dashed, screen-constant via the ScreenWidthPath recipe), handles: Array<{ id; x; y }> }`. `TransformChrome` renders the outline with `ScreenWidthPath` semantics (counter-scaled stroke, `HALF_PIXEL` alignment as `marchingAnts`) and each handle as `<g transform="translate(x y) scale(inverseScale)"><rect x=-4 y=-4 width=8 height=8/></g>` — the `originCross` counter-scale recipe (`CanvasSurface.tsx:945-967`) so handles stay 8 screen px at every zoom. Colours `ACCENT_PRIMARY` fill / `WHITE` stroke. `CanvasSurface` gains `transformChrome?: TransformFrameOverlay` (rendered **after** `originCross`, last in the SVG) and `transformCanvasRef?: RefObject<HTMLCanvasElement>` mounted as `.canvas__overlay canvas__overlay--transform` **immediately after the pose canvas** and before the reflection canvas (DOM order = z-order; no numeric z-index). The standard `marchingAnts` are **not passed** while a session is active; the mask fill and drag preview in `renderChrome` are skipped while a session is active. |
| D15 | **Cursor** | `transformCursor(zone, params): string` in `transformOverlay.ts`: `inside` → `"move"`; `handle` → one of `ns-resize`, `ew-resize`, `nesw-resize`, `nwse-resize` chosen from the handle's **outward direction rotated by θ**, snapped to the nearest 45°; `rotate` → `ROTATE_CURSOR` = `url("data:image/svg+xml;utf8,<curved-arrow svg 20×20>") 10 10, crosshair`; `outside` → `"crosshair"`. The gesture hook keeps the cursor in **React state updated only when the zone changes** (not per pointer sample) and the container's cursor resolver returns it for the transform tool. |
| D16 | **Gesture hook** (new `containers/transform/useTransformGesture.ts`) | `useTransformGesture(deps): TransformGesture` — deps `{ app, getFloatCoords, getCombinedScale, lift }`; returns `{ pointerDown(clientX, clientY, mods): boolean; pointerMove(clientX, clientY, mods): boolean; pointerUp(): boolean; cancel(): void; dragOpenRef: RefObject<boolean>; cursor: string }`. `pointerDown`: `false` (fall through to the selection gesture) when no selection, editing a variant, or the zone is `outside`; otherwise begins the session if none (`lift()`), records the drag `{ zone, start, startParams }` in a **ref**, sets `dragOpenRef`, returns `true`. `pointerMove`: while dragging → `app.transform.setParams(dragParams(...))`, `true`; idle with a mouse → updates the cursor state on zone change, `false`. `pointerUp` clears the drag. `cancel()` (pinch / touchcancel) → `setParams(drag.startParams)` and clears the drag. Modifiers `{ uniform: shiftKey, snap: shiftKey }`; touch passes `false`. |
| D17 | **Container arbitration** (`CanvasContainer.tsx`) | Mouse down / move / up and touch start / move / end / cancel: `if (currentTool === "transform" && transformGesture.pointerDown(...)) return;` **before** the selection branch and before the `isGestureTool` touch bails (the R4 rule); when not consumed, the transform tool takes the **same** branches as `"selection"` (`beginSelectionAt` / `updateSelectionAt` / `commitSelection`) — introduce `isSelectionLikeTool(tool)` = `selection \| transform` for those conditions. The window `mousemove` forwarder (`:5248-5267`) also forwards while `transformGesture.dragOpenRef.current`. Pinch start → `transformGesture.cancel()`. Hover marker suppressed for `"transform"` (like `reflection`). |
| D18 | **Data safety / scope** | Only task 04 touches `stores/domain/`; nobody touches `types/codecs/**`, `services/`, `server/`, `UIStore.toPersistedUIState`, `SelectionUIStore.ts`, any snapshot. `types/domain.ts` is touched by task 01 only (the union). Corpus suites (`bunx vitest run src/types`) unchanged at every gate. |
| D19 | **Commits / branch** | Prefix `transform(NN):` for tasks 01–10, `docs(17):` for 11. One commit per task. Branch `feat/17-transform-tool`. |

### The type blocks, verbatim (later waves code against these)

```ts
// ui/canvas/model/transform.ts (task 02)
export interface TransformParams { cx: number; cy: number; scaleX: number; scaleY: number; rotation: number }
export interface TransformSource { width: number; height: number; bounds: SelectionBox; cells: ReadonlyMap<number, PixelData> }
export type TransformHandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const TRANSFORM_HANDLE_IDS: readonly TransformHandleId[];
export interface TransformHandle { id: TransformHandleId; x: number; y: number }
export type TransformZone = { kind: "handle"; id: TransformHandleId } | { kind: "rotate" } | { kind: "inside" } | { kind: "outside" };
export interface TransformDrag { zone: Exclude<TransformZone, { kind: "outside" }>; start: Point; startParams: TransformParams }
export interface TransformModifiers { uniform: boolean; snap: boolean }
export interface TransformResult { cells: Map<number, PixelData>; vacated: Set<number>; box: SelectionBox }
export const HANDLE_HIT_RADIUS_PX = 8; export const HANDLE_SIZE_PX = 8; export const ROTATE_BAND_PX = 24;
export function sourceCenter(bounds: SelectionBox): Point;
export function identityParams(bounds: SelectionBox): TransformParams;
export function isIdentity(params: TransformParams, bounds: SelectionBox): boolean;
export function forwardPoint(p: Point, params: TransformParams, bounds: SelectionBox): Point;
export function inversePoint(p: Point, params: TransformParams, bounds: SelectionBox): Point;
export function transformQuad(params: TransformParams, bounds: SelectionBox): [Point, Point, Point, Point];
export function transformHandles(quad: readonly Point[]): TransformHandle[];
export function hitTestTransform(p: Point, params: TransformParams, bounds: SelectionBox, combinedScale: number): TransformZone;
export function dragParams(drag: TransformDrag, p: Point, mods: TransformModifiers, bounds: SelectionBox): TransformParams;
export function rasterizeTransform(source: TransformSource, params: TransformParams, gridWidth: number, gridHeight: number): TransformResult;
export function transformCommitWrites(result: TransformResult, source: TransformSource): PixelCellWrite[];  // structural { x; y; color; normal; height }

// ui/canvas/svg/transformOverlay.ts (task 05)
export interface TransformFrameOverlay { outline: SvgPathSpec; handles: ReadonlyArray<TransformHandle> }
export function transformFrameOverlay(quad: readonly Point[], handles: readonly TransformHandle[]): TransformFrameOverlay;
export const ROTATE_CURSOR: string;
export function transformCursor(zone: TransformZone, params: TransformParams): string;

// ui/canvas/render/renderTransformPreview.ts (task 05)
export interface TransformPreviewCell { x: number; y: number; css: string }
export function transformPreviewCells(result: TransformResult, source: TransformSource): { vacated: Point[]; painted: TransformPreviewCell[] };
export function drawTransformPreview(ctx: CanvasRenderingContext2D, cells: ReturnType<typeof transformPreviewCells>, viewMinX: number, viewMinY: number, cellWidth: number, cellHeight: number): void;

// stores/ui/TransformUIStore.ts (task 06)
export interface TransformTarget { objectId: string; frameId: string; layerId: string }
export interface TransformSession { target: TransformTarget; gridWidth: number; gridHeight: number; bounds: SelectionBox; source: TransformSource; selectionRef: object }
export class TransformUIStore { session; params; begin(session); setParams(p); nudge(dx, dy); reset(); end(); get isActive; get isPending; get result: TransformResult | null }

// containers/transform (task 09)
export function liftTransformSource(app: ApplicationStore): TransformSession | null;
export interface TransformGestureDeps { app: ApplicationStore; getFloatCoords: (clientX: number, clientY: number) => Point | null; getCombinedScale: () => number; lift: () => TransformSession | null }
export interface TransformGesture { pointerDown(clientX, clientY, mods: TransformModifiers): boolean; pointerMove(clientX, clientY, mods): boolean; pointerUp(): boolean; cancel(): void; dragOpenRef: React.RefObject<boolean>; cursor: string }
```

---

## 4. Ground truth (measured 2026-09-27 on `main @ 96e0284`)

### Repo state
- Refresh complete; no `REFRESH/`. Every file here is MobX + BEM + `ui/`/`containers/`. Plan 14 merged (`8eb365c`); plans 15/16 unexecuted (see the ordering note).
- Baseline gate **after the plan-14 merge** (its ledger, `docs/14-multi-brush-projects/HANDOFF.md`): `bun run verify` exit 0 — tsc clean, eslint **0 errors / 66 warnings**, vitest **201 files / 4529 tests**, build OK; stylelint 2 pre-existing errors (`OtherHand.css:338,359`) / 69 warnings; storybook OK; boundaries 5/5; server 5 files / 109 tests; no lockfile. (Pre-merge, on `96e0284`: 200 files / 4361 tests; the other numbers identical.)
- ⚠️ `client/src/test/__fixtures__/corpus/*.json` (11 files) is gitignored and absent in a fresh worktree; copy from the launch checkout before the first gate (`corpusFiles()` throws on an empty dir).
- `lucide-react@0.575.0` exports `Scaling`. `TOOL_HOTKEYS` has no `t`/`T`.

### Selection machinery (the thing this plan extends)
- `stores/ui/SelectionUIStore.ts` (500): one observable `selection: SelectionState | null` (`observableRef`, `:143/:152`); `SelectionState { width; height; mask: Set<number>; bounds }` in `store/storeTypes.ts:93-101`, packed `y * width + x`; `bounds :182`, `hasSelection :186`, `writeOptions :196-209`, `maskWriteOptions :226-237`; actions `setSelection :256`, `setSelectionMask(mask, dims, op) :269`, `clearSelection :297`, `moveSelection :307`, `selectFloodFillAt :396`, `selectAllByColorAt :434`, `selectLasso :460`. No lifted/floating pixels concept exists anywhere. **Not edited by this plan.**
- `selectionMode` / `selectionBehavior` live on `ToolUIStore` (`:129-130`, actions `:511/:515`).
- `PixelStore.ts` (1825): `moveSelectedPixels :958-1006` (two-pass against the original grid, one entry), `deleteSelectionPixels :918`, `flipHorizontal/Vertical :1546/:1551` (snapshot commands), **`setPixelCells(cells, options) :866-908` with the hard-coded label `"Stamp pose"` at `:904`**, `resolveTargetFor(frameId, layerId) :439-465` (refuses variant layers), `commitCells :501-537`. No rotate/scale exists. `PixelCellWrite { x; y; color; normal; height } :119-125`; `EMPTY :43`.
- `CanvasContainer.tsx` (6193): selection gesture closures `beginSelectionAt :4567-4627` (inside-mask test `:4568-4574`, branch order drag-existing → editMask swallow → rect → flood → colour → lasso), `updateSelectionAt :4643-4688`, `commitSelection(commit) :4705-4738`; in-flight `useState` `:555-567` (`selectionDragMode`, `pixelDragOffset`); `actions` memo `:841+` (`setPixels :881`, `moveSelectedPixels :923-926` two-step order, `setPixelCells :3546`); keyboard wiring `:4148-4194`; `isGestureTool :388-397` (`move | selection | eyedropper | origin | reflection | pose`); mouse down `:4777+`, move `:4941+`, window mouseup + blur `:5269-5281`, window mousemove forwarder gated on `shapeDragOpenRef` `:5248-5267`; touch start `:5321`, canvasTouches `:5315`, pinch `:5362-5367`, the gesture-tool bails documented `:5378-5420`; cursor IIFE `:5761-5774` → `CanvasSurface cursor` prop `:6151`; `renderChrome :1885-2160` (mask fill `:2036-2052`, move-pixels preview `:2056-2094`, `SELECTION_FILL_CELL_LIMIT` 20000); SVG chrome props `:5936-6007` (`marchingAnts :5958`, `originCross :5989`); `poseScreenToCellDelta :3213-3225` (the only float mapper, a delta); hover marker suppression for reflection `:2277`; overlay schedulers: main `:4016`, hover `:2359`, pose `:2732-2738` via `invalidatePoseRef`; `getCornerCoords :1219-1231` (the wrapper shape to copy); `coordGeomRef` from `useCanvasGeometry`.
- `ui/canvas/model/coords.ts` (193): `SnapMode :80` = `"pixel" | "pixel-unbounded" | "origin" | "corner"`; `screenToPixel :88-193` (`pixel-unbounded :121-143`, `corner :145-169`); rect rule header `:9-15`. Test `__tests__/coords.test.ts` (393).
- `ui/hooks/useCanvasPointer.ts` (183): `MOUSE_ONLY_TOOLS :64`; integer coords only. `ui/hooks/useCanvasKeyboard.ts` (362): `HotkeyTool :46-60`, `TOOL_HOTKEYS :74-94`, `CanvasKeyboardOptions :118-157`, `handleCanvasKeyDown :181-325` (Delete `:205-218`, hotkeys clear selection when leaving `"selection"` `:221-230`, arrows `:276-287`, Escape `:291-316`), window capture `:339-344`. Test (455) pins the 14-tool count `:353-380`.
- `GlobalHotkeys.tsx` (191): Escape only for colour adjustment `:92`; precedence matrix `:9-45`. `ApplicationStore.undo :1924`, `redo :1934` (post-plan-14; `:1904/:1914` before it); reflection/pose `loadGeneration` reactions `:606-627`; fields `reflection :461`, `pose :482`; `isEditingVariant :1350`, `editableGrid :1385`, `selectionDims :1416`, `currentObject/Frame/Layer :1259-1278`.

### Overlay / chrome machinery
- `ui/components/CanvasSurface/CanvasSurface.tsx` (976 raw, **≈400 code lines — at the `src/ui/**` `max-lines` error limit**): DOM = z-order inside `.canvas__frame` `:663-975`: background → layers → `.canvas__surface` (pointer surface, `style={{ cursor }}` `:760`) → hover → reference → onion → frame trace → **pose canvas `:837-843`** → **reflection canvas `:852-858`** → `.canvas__svg :871-969` (`viewBox 0 0 cellWidth cellHeight`; `marchingAnts` via `ScreenWidthPath :890-913`, `originCross` counter-scaled group `:945-967`, `inverseScale :651`, `hasSvgChrome :653-661`). `ScreenWidthPath :548-568` documents that `vector-effect: non-scaling-stroke` does **not** work under the CSS `scale()` — counter-scale instead. Props: `poseCanvasRef`, `reflectionCanvasRef?`, `combinedScale :341`, `cursor :376`, chrome `:392-434`. Test (1078) pins cursor `:177` and layer-ref pooling; stories (832): `SvgChrome :696`, `PoseReference :779`.
- `ui/canvas/svg/chromeOverlay.ts` (627 raw / ≈250 code): `SvgPathSpec`, `HALF_PIXEL :141`, `marchingAntsOverlay :354`, `originCrossOverlay :503` (the counter-scale recipe), `reflectionGuideOverlays :575`. Test (647).
- `ui/canvas/render/renderSelectionOverlay.ts` (334): `paintDragPreview :172` (`DRAG_SHADE`), `MASK_FILL_LIMIT :50`. `ui/hooks/useCanvasRender.ts` (271): `useCanvasRender(render, deps): { invalidate; invalidateRegion; cancel } :153`. `ui/theme/canvasTokens.ts`: `ACCENT_PRIMARY`, `WHITE`, `BLACK_12 :85`, `ACCENT_PRIMARY_14 :57` (parity test — canvas colours only from here).
- `ui/canvas/model/canvasTouchFilter.ts` (160): `drawingTouch`, `pinchTouches`, `isStylus`. The canvas uses `mouse*`/`touch*` events, never pointer capture; React touch handlers are passive, so `touch-action: none` + native non-passive listeners are both load-bearing (`useCanvasViewport.ts:449-481`).
- No custom cursor exists anywhere; the `cursor` prop is a free CSS string. No handle hit-test exists anywhere (`DirectionOrb.tsx` `HANDLE_RADIUS = 7` is a rail widget).
- Lift-out precedent: `containers/brush/useBrushSelection.ts` (316), `useBrushPointerHandlers.ts` (274), `containers/pixelBrush/usePixelBrush.ts` (207) — hooks that own refs + state so the container stays a binding layer. No `containers/transform/` exists.
- Store → pure-`ui` imports have precedent: `PixelBrushUIStore.ts:41-42` imports `@/ui/canvas/tools/pixelBrushScale`; `LayoutUIStore`, `ViewportUIStore` import `ui/layout/*`. ESLint forbids only `stores/domain → stores/ui`, and `ui/ → stores|api|mobx`.

### Tests to imitate
- `containers/__tests__/selectionTouch.dom.test.tsx` (756): real `CanvasContainer`, real touch events, **`getBoundingClientRect` stubbed to a `CELL_PX` box** (`:39-51`) — without it `screenToPixel` returns `null` for every event and every assertion reads as a false pass. `createStubContext` from `@test/canvasStub` (records `ctx.calls`, does not rasterise).
- `containers/__tests__/pixelBrushTool.dom.test.tsx` (600) — end-to-end tool test with history assertions. `store/__tests__/selection.test.ts` (809) — the selection behaviour pin. `ui/canvas/model/__tests__/reflection.test.ts` (384), `coords.test.ts` (393), `ui/canvas/svg/__tests__/chromeOverlay.test.ts` (647), `ui/hooks/__tests__/useCanvasKeyboard.dom.test.ts` (455), `stores/__tests__/brushWiring.test.ts` (ApplicationStore wiring rig).

### Gate commands (confirmed)
- **Client gate** = `cd client && bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run lint:boundaries`; then from the root `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` prints nothing.
- Side gates: `cd client && bunx stylelint "src/**/*.css"` (no new errors; baseline 2), `cd client && bunx storybook build`, `bun run format:check` (root), `bun run verify` (root). Server untouched (run once in W5).
- **Data-safety check** (every wave): `cd client && bunx vitest run src/types` green · `git status --porcelain | grep __snapshots__` empty · `git diff --stat <base>..HEAD -- client/src/types/codecs client/src/services server/src/export` empty.
- `max-lines`: 400 **code** lines, `error` under `src/ui/**`, `warn` elsewhere (baseline 66 warnings; every gate requires ≤ 66). `.claude/hooks/guard-data-safety.sh` blocks `vitest -u` and the frozen-lockfile flag **by command text** — write docs with the Write tool.

---

## 5. Wave table

| Wave | Tasks | Parallel | Gate before next wave |
| --- | --- | --- | --- |
| W1 | 01 register tool · 02 geometry module · 03 float snap mode · 04 `PixelStore` label + `setPixelCellsAt` | 4 | Full client gate green (tsc clean, eslint 0e / ≤ 66w, vitest all green, boundaries 5/5) + data-safety check + `bunx storybook build` + no lockfile |
| W2 | 05 preview painter + frame chrome spec + cursor · 06 `TransformUIStore` | 2 | Full client gate + data-safety check + no lockfile |
| W3 | 07 `CanvasSurface` transform layer · 08 `ApplicationStore` + keyboard · 09 gesture hook + lift | 3 | Full client gate + data-safety check + stylelint (no new errors) + storybook + no lockfile |
| W4 | 10 `CanvasContainer` integration | 1 | Full client gate + data-safety check + no lockfile + **manual checks of task 10** |
| W5 | 11 final gate, `ARCHITECTURE.md`, QA ledger | 1 | `bun run verify` exit 0 + boundaries + stylelint + storybook + server gate + no lockfile + data-safety check + the manual QA table filled |

Every gate is fully green — no red seam anywhere in this plan.

---

## 6. Dependency graph

```
W1  01 register tool ───────────────────────────────────────────┐
    02 geometry (ui/canvas/model/transform.ts) ──┬──────┐        │
    03 coords "float" ───────────────────────────┼──┐   │        │
    04 PixelStore setPixelCellsAt ───────────────┼──┼───┼──┐     │
W2  05 painter + chrome spec ◄─ 02 ──────────────┘  │   │  │     │
    06 TransformUIStore ◄─ 02 ──────────────────────┼───┘  │     │
W3  07 CanvasSurface layer ◄─ 05 ───────────────────┼──────┼──┐  │
    08 ApplicationStore + keyboard ◄─ 04, 06 ───────┼──────┘  │  │
    09 gesture hook + lift ◄─ 02, 03, 05, 06 ───────┘         │  │
W4  10 CanvasContainer ◄─ 01, 07, 08, 09 ─────────────────────┴──┘
W5  11 ◄─ everything
```

---

## 7. Collision matrix

**W1**
| 01 | 02 | 03 | 04 |
| --- | --- | --- | --- |
| `client/src/types/domain.ts` · `client/src/ui/canvas/tools/toolHandlers.ts` · `client/src/ui/hooks/useCanvasKeyboard.ts` · `client/src/ui/hooks/__tests__/useCanvasKeyboard.dom.test.ts` · `client/src/ui/components/Toolbar/PixelStudioTools.tsx` · `client/src/ui/components/Toolbar/__tests__/PixelStudioTools.dom.test.tsx` · `client/src/containers/PixelStudioToolsContainer.tsx` · `client/src/containers/brush/brushToolContext.ts` · `client/src/containers/brush/__tests__/brushToolContext.test.ts` · `client/src/containers/otherHand/toolWidgets.ts` | `client/src/ui/canvas/model/transform.ts` (new) · `client/src/ui/canvas/model/__tests__/transform.test.ts` (new) | `client/src/ui/canvas/model/coords.ts` · `client/src/ui/canvas/model/__tests__/coords.test.ts` | `client/src/stores/domain/PixelStore.ts` · `client/src/stores/domain/__tests__/PixelStore.test.ts` |

Disjoint: 02 and 03 are different files in `ui/canvas/model/`; 01 never enters `ui/canvas/model/` or `stores/`.

**W2**
| 05 | 06 |
| --- | --- |
| `client/src/ui/canvas/render/renderTransformPreview.ts` (new) · `client/src/ui/canvas/render/__tests__/renderTransformPreview.test.ts` (new) · `client/src/ui/canvas/svg/transformOverlay.ts` (new) · `client/src/ui/canvas/svg/__tests__/transformOverlay.test.ts` (new) | `client/src/stores/ui/TransformUIStore.ts` (new) · `client/src/stores/ui/__tests__/TransformUIStore.test.ts` (new) |

**W3**
| 07 | 08 | 09 |
| --- | --- | --- |
| `client/src/ui/components/CanvasSurface/CanvasSurface.tsx` · `client/src/ui/components/CanvasSurface/TransformChrome.tsx` (new) · `client/src/ui/components/CanvasSurface/OverlayCanvases.tsx` (new, only if needed for `max-lines`) · `client/src/ui/components/CanvasSurface/CanvasSurface.css` · `client/src/ui/components/CanvasSurface/CanvasSurface.stories.tsx` · `client/src/ui/components/CanvasSurface/__tests__/CanvasSurface.dom.test.tsx` | `client/src/stores/ApplicationStore.ts` · `client/src/stores/__tests__/transformWiring.test.ts` (new) · `client/src/ui/hooks/useCanvasKeyboard.ts` · `client/src/ui/hooks/__tests__/useCanvasKeyboard.dom.test.ts` | `client/src/containers/transform/useTransformGesture.ts` (new) · `client/src/containers/transform/liftTransformSource.ts` (new) · `client/src/containers/transform/__tests__/useTransformGesture.dom.test.ts` (new) · `client/src/containers/transform/__tests__/liftTransformSource.test.ts` (new) |

Disjoint by folder: 07 owns `ui/components/CanvasSurface/`, 08 owns `stores/` + `ui/hooks/`, 09 owns the new `containers/transform/`.

**W4 / W5** are single-task waves. Task 10 touches `client/src/containers/CanvasContainer.tsx`, `client/src/containers/__tests__/transformTool.dom.test.tsx` (new), `client/src/containers/__tests__/CanvasContainer.dom.test.tsx`. Task 11 touches `ARCHITECTURE.md` and `docs/17-transform-tool/HANDOFF.md`.

---

## 8. Alignment guide

### Naming to hold
- **Session** = the lifted original + the current params (`app.transform.session` / `params`). **Lift** = capturing the original cells once. **Commit** = writing the rasterised result to the layer (one entry). **Reset** = params back to identity, session kept. **End** = drop the session without writing.
- **Zone** = `handle | rotate | inside | outside`; **handle ids** `nw n ne e se s sw w`. **Frame** = the transformed quad chrome. Never say "gizmo" in code.
- Everything is `transform*` / `Transform*`; the tool id is `"transform"`; the BEM overlay modifier is `canvas__overlay--transform`.

### Files to imitate
- Tool registration: `docs/12-pixel-brush-tool/01-register-brush-tool.md`'s file list (task 01).
- Pure geometry + exhaustive tests: `ui/canvas/model/reflection.ts` + its test (task 02); float→cell precedent: `reflectCell` (centre + floor with epsilon).
- Snap mode: the `"pixel-unbounded"` branch of `coords.ts` (task 03).
- Domain write with a target: `PixelStore.setPixelCells` + `resolveTargetFor` (task 04).
- Painter split (geometry as data, stroking asserted structurally): `renderReflectionLines.ts` + its test (task 05). Counter-scaled chrome: `originCrossOverlay` + `CanvasSurface.tsx:945-967` (tasks 05, 07).
- Session-only UI store cleared on `loadGeneration`: `ReflectionUIStore` + `ApplicationStore.ts:606-627` (tasks 06, 08).
- Overlay canvas with its own scheduler and ref-held drag state: the pose canvas (`CanvasSurface.tsx:837-843`, `CanvasContainer.tsx:2732-2738`, `:3570-3612`) (tasks 07, 10).
- Container-tier hook owning refs + state: `containers/brush/useBrushSelection.ts` (task 09).
- Integration test rig: `selectionTouch.dom.test.tsx` (the `getBoundingClientRect` stub is mandatory) (task 10).

### Boundaries that must not be crossed
- `ui/` imports nothing from `stores/`, `api/`, `mobx`. `transform.ts`, `transformOverlay.ts`, `renderTransformPreview.ts`, `TransformChrome.tsx` receive plain data.
- `stores/ui/**` never imports `stores/domain/**`. `TransformUIStore` holds data and pure computeds; **`ApplicationStore` orchestrates the commit** (it is the one place that may touch `pixels`, `selectionUI` and `transform` together).
- Pointer-rate work never goes through the main `render`, never allocates a MobX observable per sample, and never re-renders for the cursor per sample. Drag state lives in refs; `params` is one `observable.ref` replaced per sample (the same cost as `pixelDragOffset` today).
- Grids are read only in `liftTransformSource` (once per session) and never observed.
- No transaction around the commit; no `key: undefined` anywhere; no snapshot updates; nothing in `server/src/data/`.

### What "done" looks like
- Toolbar: a Transform button after Selection with `T`. Selecting it with no selection → crosshair; dragging draws marching ants exactly like the Selection tool.
- With a selection: a dashed outline hugging the selection bounds with 8 small square handles that stay the same size at any zoom; hovering a handle shows a resize cursor oriented with the frame; hovering just outside a corner shows a curved arrow; hovering inside shows the move cursor.
- Dragging shows the pixels re-bucketised every frame, the source cells dimmed until covered; the standard marching ants are hidden while the frame is up.
- Enter: the pixels land, the marching ants outline the new pixels, ⌘Z once restores the original. Escape: the pixels land and the selection is gone.

### Most likely mistakes
1. **Hit-testing in floored cell coordinates.** Use the `"float"` snap mode; a floored coordinate makes every handle's hit box a whole cell.
2. **Forgetting `combinedScale` in the hit radius** — handles then become un-grabbable when zoomed out and huge when zoomed in.
3. **Re-rasterising from the canvas instead of the lifted source** — compounding errors on the second gesture. The rasteriser takes `session.source`, never the grid.
4. **Placing the touch branch after the `isGestureTool` bail** — the tool silently works with a mouse and not on the iPad (R4 of plan 09).
5. **Committing before `transform.end()`** — reaction B then sees a live session while the selection is being replaced and commits twice. `end()` first, then write.
6. **Setting the cursor per pointer sample through React state** — re-renders the container at pointer rate. Update state only on zone change.
7. **Adding lines to `CanvasSurface.tsx` beyond the mount points** — it sits at the `src/ui/**` error limit; the chrome is a sub-component, and the three raster overlays move to `OverlayCanvases.tsx` if the limit trips.
8. **Painting the transform preview from the main `render`** — repaints every layer per sample. Own `useCanvasRender`, own canvas.
9. **Editing `SelectionUIStore`** — it is not in any `Touches` list; the session compares selection identity, nothing more.
10. **Lifting empty cells** — a rotated block of "empty" then erases artwork where it lands.
11. **Using `vector-effect: non-scaling-stroke`** for the outline — it does not work under the CSS `scale()`; use the counter-scale recipe.

---

## 9. Risk register

| # | Risk | L | I | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- |
| R1 | Touch path swallowed by the gesture-tool bail; mouse works, iPad does not | High | High | D17 orders the branch before the bail; `transformTool.dom.test.tsx` drives real touch events through the stubbed rect; manual iPad row. | 10 |
| R2 | `CanvasSurface.tsx` trips the `src/ui/**` `max-lines` error | High | Med | Chrome in `TransformChrome.tsx`; if eslint errors after the two mount points are added, move the pose / reflection / transform canvases into `OverlayCanvases.tsx` (allowed in 07's Touches). | 07 |
| R3 | Double commit or lost commit around selection replacement (reaction B racing the tool's own commit) | Med | High | `commitTransform` calls `end()` before any write; `transformWiring.test.ts` pins: Enter → one entry + selection follows; new rect selection while pending → one entry, new selection stands; Escape → one entry, selection null; tool switch → one entry. | 08 |
| R4 | Performance on a large selection (owner's 300k-cell project; select-all on one layer) at pointer rate | Med | Med | Rasterisation is O(destination box); lift is once per session; preview paints only result + vacated cells; the mask-fill 20 000-cell guard already exists — task 05 adds the same guard to the vacated shading. Manual check: select-all + rotate stays interactive. | 05, 10 |
| R5 | Nested / stray history entries (commit inside an open stroke, or undo intercept misfiring in brush mode) | Low | High | The tool never opens a stroke; `undo()` intercept is gated on the project history; tests in 08. | 08 |
| R6 | Escape semantics surprise the owner (commit rather than cancel) | Med | Low | Stated in §1; ⌘Z resets while pending; `ARCHITECTURE.md` records it; QA row asks the owner to confirm. | 11 |
| R7 | Merge conflicts with plans 14 / 15 in `toolHandlers.ts`, `PixelStore.ts`, `CanvasContainer.tsx` | Med | Med | Additive edits only; run plans sequentially; the coordinator re-reads cited lines on the cut branch. | coordinator |
| R8 | Variant editing edge cases (selection dims ≠ grid, `resolveTargetIn` refusing) | Med | Low | Inert while editing a variant (D9); the lift returns `null` when dims differ; tests in 09. | 09 |
| R9 | Corpus JSON fixtures absent in the worktree | High | Low | Copy before the first gate; record in HANDOFF. | coordinator |
| R10 | `bunx` recreates a lockfile | Low | Low | The lockfile `find` runs at every gate. | all |

---

## 10. Rules for every executor

- **Bun only.** `node`/`npm` are not on PATH. `bun add` always `--exact`. Never create a lockfile; never pass the frozen-lockfile flag; run `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` before committing.
- **Never run `vitest -u`.** `git status --porcelain | grep __snapshots__` must print nothing.
- **Never touch `server/src/data/`**, `client/src/types/codecs/**`, `client/src/services/`, `server/src/export/`, `UIStore.toPersistedUIState`, `SelectionUIStore.ts`. `types/domain.ts` is task 01 only (the union); `stores/domain/` is task 04 only. `bunx vitest run src/types` must pass unchanged at every gate.
- **Never deep-observe a grid.** Grids are read once at lift time; `session` and `params` are `observable.ref`.
- **The `ui/` boundary.** Nothing under `client/src/ui/` imports a store, the API or MobX; `observer()` only under `containers/`. Run `bun run lint:boundaries`.
- **Stay inside `Touches`.** If you must touch another file, stop, record it under Deviations in `HANDOFF.md`, and say so in your report.
- **Run the gate and paste the real output.** Paste the eslint warning count and the vitest file/test totals.
- **Do the manual checks** listed in your task. Skipped checks make a task `PARTIAL`, not `DONE`.
- **Report honestly, including partial completion.**
- One commit per task, prefixed per D19, with the session's attribution trailers.

---

## 11. Task index

| NN | Title | Wave | Effort | Summary |
| --- | --- | --- | --- | --- |
| 01 | Register the `"transform"` tool | W1 | S | Union, `{}` handler, hotkey `T`, toolbar row, hidden/inert in the brush studio, Other-Hand title. |
| 02 | Geometry module `transform.ts` | W1 | L | Params, forward/inverse, quad, handles, hit-test, drag math, nearest-neighbour rasteriser, commit writes; exhaustive node tests. |
| 03 | `coords.ts` `"float"` snap mode | W1 | S | Raw world cell coordinates for hit-testing and drags. |
| 04 | `PixelStore` label + `setPixelCellsAt` | W1 | S | Optional label on `setPixelCells`; targeted write by object/frame/layer ids. |
| 05 | Preview painter, frame chrome spec, cursors | W2 | M | `renderTransformPreview.ts`, `transformOverlay.ts` (outline + handles + rotate cursor + cursor resolver). |
| 06 | `TransformUIStore` | W2 | M | Session + params refs, `result` computed, lifecycle actions; tests. |
| 07 | `CanvasSurface` transform layer | W3 | M | Overlay canvas after pose, `TransformChrome` in the SVG, story, dom test; `max-lines` guarded. |
| 08 | `ApplicationStore` lifecycle + keyboard | W3 | M | `app.transform`, reactions, `commitTransform`, undo intercept, Enter/arrow keys; wiring tests. |
| 09 | Gesture hook + lift | W3 | L | `useTransformGesture`, `liftTransformSource`; hook and lift tests. |
| 10 | `CanvasContainer` integration | W4 | L | Arbitration (mouse + touch), float coords, cursor, chrome, preview scheduler, hidden ants; integration tests; manual QA. |
| 11 | Final gate, `ARCHITECTURE.md`, QA ledger | W5 | S | `bun run verify` + side gates; docs; the manual QA table. |
