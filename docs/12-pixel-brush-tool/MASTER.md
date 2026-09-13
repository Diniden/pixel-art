# Pixel-studio Brush tool — MASTER plan

Planned 2026-09-09 against branch `feat/01-brush-studio` (HEAD `8ed9c1d`, clean tree), directly after
plan 11 closed. Executed by `/plan-go`, one fresh agent per task. **Read this file, `CLAUDE.md`, and
your task file. Nothing else is required; nothing else is assumed.**

---

## 1. Request

Verbatim:

> We now need to make a brush tool.
> - The brush tool will be available in the pixel studio
> - The tool when enabled will have the color picker available in the side rail
> - We have many features to add for the brush itself, but let's start with just simply making the
>   brush able to draw in the editor
> - On selecting the brush, the highlight region of the brush for the cursor needs to be exactly the
>   full composited layrs of the brush on the brush's current frame
> - Drawing with the brush should start with the color that was selected by the user and should apply
>   all of the deltas across the layers to settle which color actually gets drawn to the canvas

### Interpretation

A new pixel-studio drawing tool, `"brush"`, that **stamps the brush document currently open in the
Brush Studio** onto the pixel canvas. Its hover marker is the union of every painted cell of every
visible layer of the brush's current frame, centred on the cursor. Each stamped pixel's colour is the
user's selected (edge) colour with every visible layer's signed delta at that cell applied in
bottom→top order — RGB deltas in RGB space, HSL deltas in HSL space — clamped and rounded. Dragging
stamps the brush along the rasterised segment, one undo entry per drag, through the same
`actions.setPixels` funnel every other tool uses (so selection masks and reflection mirroring apply
for free). The colour picker is **already** rendered unconditionally in the pixel studio's right rail
(measured: `PixelStudioPanel.tsx:358`), so that requirement is satisfied by pinning it in a test, not
by new wiring. A small "Brush" rail section tells the user which brush project / frame will be
stamped and offers a button into the Brush Studio.

### Assumptions where the request was ambiguous

| Ambiguity | Decision |
| --- | --- |
| "Selected color" — edge or fill slot? | The **edge** colour (`ui.tool.selectedColor`), as the pencil uses. `colorTarget` is ignored in v1. |
| What does an HSL delta of ±255 mean in degrees / percent? | Full range, symmetric with RGB: H ±255 ↔ ±360°, S and L ±255 ↔ ±100 %, A ±255 ↔ ±255 alpha. See D5. |
| `normal` / `heightmap` layers | They have no meaning against an RGBA base (they target lighting data, per the plan-01 request: "for various effects to be implemented later"). They contribute to the **footprint** (they are painted cells the brush studio renders) but not to the colour. Open item. |
| A painted cell whose deltas are all zero, or whose A delta is −255 | In the footprint, written as the (unchanged / fully transparent) settled colour. The footprint is "the painted cells", not "the cells that look non-empty", so the marker equals exactly what a stroke writes. |
| Which frame is "the brush's current frame"? | `brushUI.selectedFrameId`, falling back to `frames[0]` — the same rule the brush studio uses (its private `frameIn`). Exposed as `BrushUIStore.selectedFrameIn(doc)` (task 03). |
| Where is the brush anchored under the cursor? | Cell `(floor(w/2), floor(h/2))` sits on the cursor cell. |
| Brush scaling with `brushSize`, spacing, per-frame animation, applied groups, mixed-target layers | Out of scope. "Let's start with just simply making the brush able to draw." |
| No brush document loaded in pixel mode (fresh load never visits the brush studio) | The tool calls `app.brushes.init()` (idempotent, StrictMode-safe) when selected. Until a document is loaded: no marker, strokes write nothing, and the rail section says so with an "Open Brush Studio" button. |
| Remember the last-used brush across reloads | No. `BrushStore.init()` loads `brushList[0]`; persisting a name would touch the codec paths (`types/codecs/**`) — deliberately avoided. Open item. |

---

## 2. Outcome

When every wave is DONE the owner can, in the pixel studio:

1. Press `B` (or click the Brush button after the Eraser) and see a "Brush" section in the right
   rail above the colour picker, naming the loaded brush project, its size, its current frame and
   layer count — or an empty state with an "Open Brush Studio" button.
2. Hover the canvas and see a marker that is exactly the painted cells of the brush's current frame
   (all visible layers, any channel type), centred on the cursor, clipped at the grid edge.
3. Click or drag and paint that shape: each pixel is the selected colour with every visible layer's
   delta applied (RGB adds, HSL shifts hue/saturation/lightness, both shift alpha), one undo entry
   per drag, respecting the active selection mask and reflection lines.
4. Pick a different colour and paint again — the stamp re-settles from the new base.
5. Switch to the Brush Studio, change the frame or a layer, come back (press `B` again — mode
   switches reset the tool, unchanged behaviour) and see the new footprint and colours.
6. Run the full gate green with the corpus digests unchanged.

---

## 3. Locked decisions

| # | Decision | Value |
| --- | --- | --- |
| D1 | Tool identity | `Tool` union member `"brush"` (`types/domain.ts:458`). Toolbar row **after `eraser`**: `{ id: "brush", icon: Paintbrush (lucide), label: "Brush (stamps the open brush project)", hotkey: "B" }`. `TOOL_HOTKEYS`: `b` and `B`. `HotkeyTool` gains `"brush"`. |
| D2 | Naming prefix | Every new pixel-studio-side artefact is `PixelBrush*` / `pixelBrush*` (`pixelBrushStamp.ts`, `PixelBrushStamp`, `PixelBrushFootprint`, `usePixelBrush`). **Never** reuse `BrushShape`, `BrushShapeFn`, `isBrushTool`, `brushStamp`, `stampAt` (pencil stroke geometry) or `Brush*` bare (brush-studio document family). Commit prefix `pixel-brush(NN): …`. |
| D3 | Footprint | `pixelBrushFootprint(layers, width, height)`: the union of cells `!== 0` (and `!== undefined`) across layers with `visible === true`, rows/cols clipped to `min(height, pixels.length)` / `min(width, row.length)` exactly as `renderBrushFrame.ts:99,105` clips. Includes zero-delta cells, A = −255 cells, and `normal`/`heightmap` cells. Offsets are `(x − originX, y − originY)` with `originX = floor(width/2)`, `originY = floor(height/2)`, row-major. |
| D4 | Current frame | `BrushUIStore.selectedFrameIn(doc)`: the frame whose id is `selectedFrameId`, else `frames[0]`, else `null`. Mirrors the existing `selectedLayerIn`. |
| D5 | Colour settling | `settlePixelBrushColor(base, deltas)` — `deltas` is the visible layers' cells at one position, bottom→top, `0` cells skipped. Working state: `{ r, g, b, a }` floats plus an optional HSL working triple. Per layer: **`rgb`** → if in HSL space, convert back first (`hslToRgb`, remember the triple as `prevHsl`); `r += d0, g += d1, b += d2` clamped 0..255; `a += d3` clamped 0..255. **`hsl`** → if not in HSL space, `rgbToHsl(round r, round g, round b, prevHsl)`; `h = ((h + d0·360/255) mod 360 + 360) mod 360`; `s = clamp(s + d1·100/255, 0, 100)`; `l = clamp(l + d2·100/255, 0, 100)`; `a += d3` clamped. Consecutive `hsl` layers stay in HSL space (no intermediate round trip). **`normal` / `heightmap`** → no change. End: convert back if in HSL space; round every channel to an integer 0..255. Uses `ui/utils/colorMath.ts` (`hslToRgb(h 0..360, s 0..100, l 0..100)`, `rgbToHsl(r,g,b,prevHsl?)`) — the only converters in the repo; the `prevHsl` carry is load-bearing at L = 0 / 100. |
| D6 | Stamp | `PixelBrushStamp { width, height, originX, originY, cells: { dx, dy, color }[] }` = the footprint with a settled colour per cell for one base colour. Resolved once per (document, frame, base colour) in the container (`usePixelBrush`), never per pointer event. Every cell gets its own colour object (no shared references). |
| D7 | Stroke | `stampPixelBrushSegment(prev, next, line, stamp, bounds)`: rasterise `prev → next` with the injected `LineFn` (`[next]` when `prev` is `null`, exactly as `stampSegment`), stamp every cell at every step, drop out-of-bounds cells, **last write wins** per cell (`Map` keyed `y·gridWidth + x`). Returns `{ x, y, color }[]` (structurally a `ToolPixelWrite[]`). Handler: `onDown` = `beginStroke` + stamp at `coords` + `setLastStrokePixel`; `onMove` = stamp segment from `lastStrokePixel` + `setLastStrokePixel`. With no stamp: `beginStroke` still runs (one empty undo entry, same as a pencil that paints nothing) and nothing is written. |
| D8 | Context plumbing | `ToolContext` gains **optional** `pixelBrushStamp?: PixelBrushStamp \| null` (optional so `containers/brush/brushToolContext.ts` compiles untouched). `FootprintOptions` gains optional `pixelBrushOffsets?: ReadonlyArray<{dx,dy}> \| null`; `toolFootprint` for `tool === "brush"` returns the offsets translated to `center`, bounds-filtered, or `[]` when null. `isBrushTool` is **unchanged** (its test pins exactly three tools). |
| D9 | State ownership | No new store, nothing persisted. `containers/pixelBrush/usePixelBrush.ts` (container-tier hook, takes `app`): calls `app.brushes.init()` in an effect while `enabled`; memoises the footprint on `[document, selectedFrameId, brushes.pixelVersion, brushes.domainVersion]` and the stamp on `[footprint, base.r, base.g, base.b, base.a]`. Grids are read inside the memo, never observed (`document` is `observable.ref`). |
| D10 | Rail section | `PixelStudioPanel` gains one grouped optional prop `pixelBrush?: PixelStudioBrushInfo` and `showBrushControls = selectedTool === "brush"`; the section renders **above** the colour picker like the other tool sections. The colour picker stays unconditional. `TOOL_TITLES.brush = "Brush"` in `containers/otherHand/toolWidgets.ts`; the Other-Hand widget list for the tool is empty. |
| D11 | Brush studio | `"brush"` is added to `BRUSH_HIDDEN_TOOLS` (`PixelStudioToolsContainer.tsx:30`) and `BRUSH_INERT_TOOLS` (`containers/brush/brushToolContext.ts:200`). `LightingUIStore.setStudioMode` keeps resetting the tool to `"pixel"` — unchanged. |
| D12 | Cursor / marker policy | Cursor `crosshair` (the default branch). `markerPolicy` unchanged: like the pencil, the marker does not track during a stroke. |
| D13 | Persistence and data safety | Nothing new is persisted. `selectedTool` already round-trips as a string, so `"brush"` survives reload through the existing slot. **No edits** under `client/src/types/codecs/`, `client/src/services/`, `server/src/export/`, any `__snapshots__`. The `types/domain.ts` union edit must leave every snapshot unchanged (tasks 01 and 07 check). |

---

## 4. Ground truth (measured 2026-09-09)

### Baseline
Branch `feat/01-brush-studio` @ `8ed9c1d`, clean. Gate at that commit (plan 11 coordinator run):
client tsc clean · eslint 0 errors / **66 warnings** · vitest **187 files / 3919 tests** · boundaries OK ·
stylelint **2 pre-existing errors** (`src/ui/components/OtherHand/OtherHand.css:338,359`) + 69 warnings ·
storybook ✓ · `bun run build` ✓ · server tsc/eslint clean, vitest 102 · no lockfile. `CanvasContainer.tsx`
already exceeds `max-lines` (warning, pre-existing).

### Brush document family (paths relative to `client/src/`)
- `types/brush.ts` (337): `BrushChannelType = "hsl"|"rgb"|"normal"|"heightmap"` `:20`; `BrushDelta` (4-tuple, −255..255) `:42`;
  `BrushCell = BrushDelta | 0` `:44`; `BrushLayer { id, name, channelType, visible, appliedGroupId?, pixels[y][x] }` `:49-56`;
  `BrushFrame { id, name, layers }`; `BrushDocument { version:"brush-1", width, height, frames, appliedGroups }` `:62-69`.
  `deltaToByte` `:80` and `brushCellToRgba` `:92-123` are **display-only** (halve resolution, centre on 127) — the settle
  function must read `cell[i]` raw. `clampDelta` `:74`. **`ui/` already imports `types/brush`** (`ui/canvas/render/renderBrushFrame.ts`).
- Compositing order: `renderBrushFrame.ts:66` "in array order (bottom → top); hidden layers are skipped"; clipping `:99,105`.
  `BrushUIStore.adoptDocument` treats the **last** element as the top layer (`:186-188`).
- **No function anywhere applies a delta to a base colour.** Grepped `applyDelta`, `settle`, `resolveDelta`, `shiftHue`, `adjustHsl`.
- `ui/utils/colorMath.ts`: `hslToRgb(h, s, l)` `:21` (h 0..360, s/l 0..100 → bytes); `rgbToHsl(r, g, b, prevHsl?)` `:60` (returns rounded
  h 0..360, s/l 0..100; `prevHsl` preserves H/S at L = 0 / 100 — header `:8-14`).
- Stores: `stores/domain/BrushStore.ts` — `document: BrushDocument | null` (**`observableRef`**, `:111-119`), `brushName`, `brushList`,
  `loadState: "idle"|"loading"|"loaded"|"failed"`, `hasBrush`, `domainVersion`, `pixelVersion`, `init()` `:286-305` (lists, loads
  `brushList[0]`, returns synchronously when `"loading"`/`"loaded"`, never rejects, installs no default on failure).
  `stores/ui/BrushUIStore.ts` — `selectedFrameId` `:102`, `selectedLayerIn(doc)` `:217`, `channelTypeIn(doc)` `:228`; the frame
  lookup `frameIn(doc, frameId)` `:89-98` is **module-private**; `selectedFrameIn` does not exist (task 03 adds it).
- `ApplicationStore.ts`: `brushUI :380`, `brushes :387` (comment `:383-386`: `brushes.init()` deliberately not called in the ctor),
  construction `:958-976`. **Only caller of `init()`:** `containers/BrushStudioContainer.tsx:71` (mount effect). Switching studio mode
  unmounts the brush studio but the store and its document survive; on a fresh pixel-mode load `document` is `null`.
- `stores/ui/LightingUIStore.ts:193-196` `setStudioMode(mode)` sets `tool.selectedTool = mode === "lighting" ? "normal-pencil" : "pixel"`.
- `containers/brush/brushPanes.ts:104` `brushPaneScene(doc, frameId, null)` — strict frame lookup (no frame-0 fallback), returns the
  frame's layers bottom→top including hidden ones. Structural `BrushSceneLayer { pixels, channelType, visible }` (`renderBrushFrame.ts:56`).
- `containers/brush/brushToolContext.ts` — `BRUSH_INERT_TOOLS` `:200`, `isBrushInertTool` `:210`; the module header `:20-30` pins that
  no two cells may share a delta tuple reference — the same discipline applies to stamp colours.

### Pixel-studio tool system
- `types/domain.ts:458-476` `Tool` union (18 members; `"pixel"` is the pencil); `StudioMode` `:480`. Default tool `types/constants.ts:25`.
- `ui/canvas/tools/toolHandlers.ts` (303): `ToolPixelWrite { x, y, color: ToolColor | 0 }` `:66-70`; `ToolContext` `:78-121`
  (`gridWidth/Height`, `brushSize`, `currentColor`, `pencilShape`, `eraserShapeFn`, `line: LineFn`, `shapeMode`, `borderRadius`,
  `lastStrokePixel`, `setLastStrokePixel`, `beginStroke`, `endDrawing`, `setPixels`, `setPreviewPixels`, `floodFillAt`, `gaussianFillAt`,
  `squarePixelsAt`, `rectanglePreview`, `ellipsePreview`, `linePreview`); `ToolEvent` `:124-129`; `paintDown/paintMove` `:147-188`;
  the table `:196-278` with `pixel`/`eraser` `:196-204`; **exhaustiveness gate `TOOLS_ARE_EXHAUSTIVE` `:293-301`** — a `Tool` member
  without a table entry is a `tsc` error; `getToolHandler` `:301`. **No `toolHandlers.test.ts` exists** (`ui/canvas/tools/__tests__/`
  holds `brushStamp`, `toolFootprint`, `traceSampler` tests).
- `ui/canvas/tools/brushStamp.ts` (181): `StampPoint`, `StampBounds`, `StampColor`, `BrushShapeFn` `:79`, `LineFn` `:84`, `inBounds` `:110`,
  `stampAt` `:124`, `stampSegment` `:156-181` (dedupe key `p.y * gridWidth + p.x`; `prev === null` stamps only `next`).
- `ui/canvas/tools/toolFootprint.ts` (133): `FootprintOptions` `:58-70`, `SHAPE_COLOR` `:78`, `isBrushTool` `:84-86` (exactly three tools;
  pinned by `__tests__/toolFootprint.test.ts:126`), `toolFootprint` `:95-133` (class 3 = single cell for every non-brush tool).
- `ui/hooks/useCanvasPointer.ts`: `MOUSE_ONLY_TOOLS` `:64`; `beginStroke` `:119-146` calls `startDrawing` then `handler.onDown`;
  `continueStroke` `:148-167`; `endStroke` `:169-178`.
- `ui/hooks/useCanvasKeyboard.ts`: `HotkeyTool` `:45-59` (13 members), `TOOL_HOTKEYS` `:74-91`, applied `:218-226`. Test
  `ui/hooks/__tests__/useCanvasKeyboard.dom.test.ts:353-380` pins **13** tools and `TOOL_HOTKEYS["4"] === undefined`. Free letters: `b`.
- `ui/components/Toolbar/PixelStudioTools.tsx`: `tools` registry `:96-133` (13 rows), lucide imports `:22-42`, `hiddenTools` filter
  `:325-330`. Test `__tests__/PixelStudioTools.dom.test.tsx:53,66,82` hard-codes counts (13, 12, 12). Container
  `containers/PixelStudioToolsContainer.tsx:30` `BRUSH_HIDDEN_TOOLS`, `:92`. lucide ships `Paintbrush` (`node_modules/lucide-react/dist/esm/icons/paintbrush.js`).
- `containers/CanvasContainer.tsx` (6157): `isGestureTool` `:386-395`; `pencilOnly :648`; `actions.setPixels` `:880-894` (**the single
  mirror/mask funnel**); `beginStroke/endStroke/endDrawing` `:924-928`; hover `resolveHoverCells` `:2258-2292` (a `useCallback` calling
  `toolFootprint`), `placeHoverCells` `:2311`, `renderHover` `:2321-2345`, outline `:2296-2304` (SVG via `chromeOverlay.ts:226`);
  `strokeCursor` `:4373-4375`; **`getToolContext` `:4382-4455`** with its dependency array (`:4443-4455`) and the repeated warning
  that pointer-rate values must not be deps (`:2180, :3179, :3628, :3657, :5886`); `pointer = useCanvasPointer(...)` `:4470-4477`;
  mouse down `:4700-5030` (`pointer.beginStroke` at `:4865`); `finishDrawingStroke` `:5071-5109`; cursor ladder `:5725-5739`.
  Stroke test rig: `containers/__tests__/eraserBrushWidth.dom.test.tsx` (real container, `getBoundingClientRect` stub `:129`,
  `fireEvent.mouseDown(surface, { button: 0, ...at(x, y) })` `:185`); touch analogue `selectionTouch.dom.test.tsx:306-319`.
  `CanvasContainer.dom.test.tsx` (1476 lines) fires no pointer events — use it only for project installation and layer reads.
- `ui/canvas/model/markerPolicy.ts:68-100` (`"track" | "clear" | "ignore"`; only the eraser tracks mid-stroke).
- `ui/components/PixelStudioPanel/PixelStudioPanel.tsx`: `selectedTool: string` `:80`; gates `:176-180`
  (`showPencilControls = selectedTool === "pixel"` …); sections `:185-345` as `<div className="panel pixel-studio-panel__section">`;
  grouped optional props `reflection?` `:137`, `pose?` `:150`; `{colorPicker}{paletteManager}` unconditional `:358-359`.
  `PixelStudioPanel.css` beside it. **No story and no dom test for `PixelStudioPanel` itself** (`__tests__/` holds only
  `ReflectionLinesSection.dom.test.tsx`). Container `containers/PixelStudioPanelContainer.tsx` (`:141` render, `:163` colour picker,
  `:172` `reflection={{…}}`, `:192` `pose={{…}}`); **no container test exists**.
- `containers/otherHand/toolWidgets.ts`: `TOOL_TITLES: Partial<Record<Tool, string>>` `:24-41`; `switch (tool.selectedTool)` `:214`.
- Colour picker: `containers/ColorPickerContainer.tsx` has no tool read; single render site `PixelStudioPanelContainer.tsx:163`;
  landed unconditionally at `PixelStudioPanel.tsx:358`. `RightSidebarTopControls.tsx:111-128` shows nothing for unknown tools.

### Gate commands (all confirmed to run at `8ed9c1d`)
`cd client && bunx tsc --noEmit` · `bunx eslint .` · `bunx vitest run` · `bun run lint:boundaries` · `bunx stylelint "src/**/*.css"` ·
`bunx storybook build` · `bun run build`; `cd server && bunx tsc --noEmit && bunx eslint . && bunx vitest run`; root `bun run verify`.
Lockfile check from the repo root: `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` (must print nothing).
Corpus check: `git status --short` shows no `__snapshots__` file and
`git diff --stat 8ed9c1d..HEAD -- client/src/types/codecs client/src/services server/src/export` is empty.

---

## 5. Wave table

| Wave | Tasks | Parallel | Gate before next wave |
| --- | --- | --- | --- |
| W1 | 01 register tool, 02 pure stamp module, 03 `selectedFrameIn`, 04 panel section UI | 4 | client gate + `bunx stylelint "src/**/*.css"` (no new errors) + `bunx storybook build` + corpus check |
| W2 | 05 handler + hover + canvas wiring, 06 panel container wiring | 2 | client gate + **manual** (marker, stroke, colours) |
| W3 | 07 final gate, docs, QA | 1 | `bun run verify` + boundaries + stylelint + storybook + server + lockfile + corpus |

"client gate" = `cd client && bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run lint:boundaries`, then the lockfile
check from the repo root prints nothing.

---

## 6. Dependency graph

```
01 register tool ─────────────┬──────────────► 05 handler + hover + canvas ─┐
02 pixelBrushStamp.ts ────────┤                                             ├─► 07 final
03 BrushUIStore.selectedFrameIn ┴─► 06 panel container ◄── 04 panel UI ─────┘
```
01 none · 02 none · 03 none · 04 none · 05 → 01, 02, 03 · 06 → 01, 03, 04 · 07 → 05, 06.

---

## 7. Collision matrix

**W1**
| 01 | 02 | 03 | 04 |
| --- | --- | --- | --- |
| `types/domain.ts` · `ui/canvas/tools/toolHandlers.ts` · `ui/hooks/useCanvasKeyboard.ts` + `ui/hooks/__tests__/useCanvasKeyboard.dom.test.ts` · `ui/components/Toolbar/PixelStudioTools.tsx` + `__tests__/PixelStudioTools.dom.test.tsx` · `containers/PixelStudioToolsContainer.tsx` · `containers/brush/brushToolContext.ts` (+ `__tests__/brushToolContext.test.ts` only if it pins the inert set) · `containers/otherHand/toolWidgets.ts` | `ui/canvas/tools/pixelBrushStamp.ts` (new) · `ui/canvas/tools/__tests__/pixelBrushStamp.test.ts` (new) | `stores/ui/BrushUIStore.ts` · `stores/ui/__tests__/BrushUIStore.test.ts` | `ui/components/PixelStudioPanel/PixelStudioPanel.tsx` · `PixelStudioPanel.css` · `__tests__/PixelStudioPanel.dom.test.tsx` (new) |

Pairwise disjoint. ✔ (01 touches `toolHandlers.ts` only to add the placeholder entry; 05 fills it in W2.)

**W2**
| 05 | 06 |
| --- | --- |
| `ui/canvas/tools/toolHandlers.ts` · `ui/canvas/tools/toolFootprint.ts` + `__tests__/toolFootprint.test.ts` · `ui/canvas/tools/__tests__/toolHandlers.test.ts` (new) · `containers/pixelBrush/usePixelBrush.ts` (new) + `containers/pixelBrush/__tests__/usePixelBrush.dom.test.ts` (new) · `containers/CanvasContainer.tsx` · `containers/__tests__/pixelBrushTool.dom.test.tsx` (new) | `containers/PixelStudioPanelContainer.tsx` · `containers/__tests__/PixelStudioPanelContainer.dom.test.tsx` (new) |

Disjoint. ✔

Single-task waves need no matrix.

---

## 8. Alignment guide

**Imitate, don't invent:**
- Handler bodies → `toolHandlers.ts:147-204` (`paintDown`/`paintMove`, the `pixel` entry). Segment rasterising → `brushStamp.ts:156-181`.
- Footprint class → `toolFootprint.ts` header `:1-45` (add a fourth class: "injected cells") and its body `:95-133`.
- Container-tier hook shape → `containers/brush/useBrushHover.ts` / `brushPanes.ts` (read grids at compute time, never observe them).
- Rail section → the pencil section `PixelStudioPanel.tsx:189-256` and the grouped optional props `reflection?`/`pose?` `:137,150`;
  container → `PixelStudioPanelContainer.tsx:172-210`.
- Store method → `BrushUIStore.selectedLayerIn` `:217`.
- HSL maths → `ui/utils/colorMath.ts` only; never re-derive a converter.

**Boundaries that must not be crossed:** `ui/**` imports no store / API / MobX / `containers/` / `components/` (`types/brush.ts` and
`ui/utils/colorMath.ts` are fine); `observer()` only in `containers/`; grids `observable.ref`, read inside memos, never deep-observed;
canvases redraw from version counters; `combinedScale` untouched; **no `will-change`**; no persisted-state key; no codec edit.

**`getToolContext` dependency discipline** (`CanvasContainer.tsx:4443-4455`): the stamp is a memo that changes only when the brush
document, frame or base colour changes — never at pointer rate. Do not put the hovered cell, the pointer, or any per-event value in it.

**Tuple / colour identity:** every stamp cell owns its own colour object; a write passed to `setPixels` may share its cell's colour
object (writes are consumed immediately), but no two stamp cells share one (mirrors `brushToolContext.ts:20-30`).

**What done looks like:** press `B`, hover — the marker is the brush's silhouette; click — that silhouette lands in the selected colour
tinted per layer; drag — a continuous ribbon of stamps; ⌘Z removes the whole drag; the rail says which brush and frame; the colour
picker never moved.

**Most likely mistakes:**
1. Using `brushCellToRgba` / `deltaToByte` in the settle path (they halve resolution and centre on 127 — display only).
2. Feeding `rgbToHsl` without the `prevHsl` carry — a black or white base loses its hue the moment an L delta lifts it.
3. Forgetting that `TOOLS_ARE_EXHAUSTIVE` fails `tsc` until the table has a `brush` entry (task 01 adds the placeholder).
4. Extending `isBrushTool` — its test pins exactly three tools; the brush is a fourth footprint class, not a size-scaled one.
5. Making `pixelBrushStamp` a required `ToolContext` field (breaks `containers/brush/brushToolContext.ts`, outside every Touches list).
6. Hard-coding test counts from this document — recount (13 → 14 rows; brush-mode hidden count depends on `BRUSH_HIDDEN_TOOLS`).
7. Observing `brushes.document.frames[…].layers[…].pixels` through an `observer` render instead of reading them inside `useMemo`.
8. Calling `app.brushes.init()` from a render instead of an effect; or forgetting it, so a fresh pixel-mode load never has a brush.

---

## 9. Risk register

| Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- |
| Owner expects a different HSL scale (e.g. ±255 ↔ ±180°) | Medium | Low | D5 locks full-range scaling; constants isolated in one place (`PIXEL_BRUSH_HUE_PER_DELTA`, `PIXEL_BRUSH_PERCENT_PER_DELTA`) so a re-tune is a one-line change; surfaced in the final report | 02, 07 |
| `types/domain.ts` edit perturbs corpus digests | Low | Critical | Union edit only; task 01 runs the full suite and checks `git status` for `__snapshots__`; task 07 repeats | 01, 07 |
| `getToolContext` rebuilds mid-stroke because the stamp memo churns | Low | Medium | Memo keys are document/frame/version/colour only; test pins referential stability across pointer moves | 05 |
| Brush document not loaded in pixel mode on a fresh load | Certain | Medium | `usePixelBrush` calls `init()`; rail shows loading/empty states; tests cover `null` document | 05, 06 |
| Big brush (64×64, 8 layers) hover recompute per pointer move | Low | Low | Offsets are precomputed once; per move is a translate + bounds filter of ≤ 4096 cells | 05 |
| `CanvasContainer.tsx` already over `max-lines` | Certain | Low | Warning is pre-existing; add ≤ 25 lines, push logic into `usePixelBrush.ts` | 05 |
| `B` in the brush studio selects an inert tool | Medium | Low | Hidden from the toolbar and inert in the handler classes; hotkey suppression is an open item | 01 |
| Executors sweep each other's staged files | Medium | Low | Pathspec commits only | all |

---

## 10. Rules for every executor

- **Bun only.** No `node`/`npm`. Never create a lockfile; after any `bunx`, run the lockfile check from the repo root and delete any
  lockfile it made. Never pass a frozen-lockfile flag to any command.
- **Never run `vitest -u`.** Any snapshot/corpus diff = stop and report.
- **Never touch** `server/src/data/**`, `server/exports/**`, `client/src/types/codecs/**`, `client/src/services/migrations/**`,
  `server/src/export/**`, any `__snapshots__`.
- **Stay inside `Touches`.** A co-located test/story that breaks purely from a prop/union/count you changed may be fixed minimally in
  the same commit — flag it. Anything else: stop and report.
- **Commit with the pathspec form** `git commit -- <your paths>` (new files: `git add -- <path>` first); never `git add -A`, `git add .`,
  `commit -a`, or a bare `git commit`. Prefix `pixel-brush(NN): …`.
- **`ui/` stays pure**; `observer()` only in `containers/`; grids `observable.ref`; no `will-change`; no new persisted key.
- **Run the gate and paste real output.** Report counts, exit codes, and the corpus check result.
- **List every manual check you could not perform.** A task with manual checks skipped is PARTIAL.
- **Report honestly**, including what you could not finish and why. Do not break `bun run dev`.

---

## 11. Task index

| NN | Title | Wave | Effort | Summary |
| --- | --- | --- | --- | --- |
| 01 | Register the `"brush"` tool | W1 | S | `Tool` union, handler placeholder, hotkey `B`, toolbar row, hidden/inert in the brush studio, Other-Hand title; tests recounted; corpus unchanged. |
| 02 | `pixelBrushStamp.ts` — footprint, settle, stamp, segment | W1 | M | Pure `ui/canvas/tools` module with exhaustive unit tests. |
| 03 | `BrushUIStore.selectedFrameIn(doc)` | W1 | S | Export the frame lookup with frame-0 fallback; tests. |
| 04 | `PixelStudioPanel` "Brush" section (pure UI) | W1 | S | Grouped optional prop, section above the picker, empty/loading/failed states, tokens-only CSS, dom test. |
| 05 | Brush handler, hover footprint, `usePixelBrush`, canvas wiring | W2 | L | Fill the table entry, extend `toolFootprint`, hook + `ToolContext` plumbing, tests incl. a container stroke test. |
| 06 | Panel container wiring | W2 | S | Feed `pixelBrush` from the stores, "Open Brush Studio", pin the colour picker for the brush tool. |
| 07 | Final gate, docs, QA | W3 | S | Full gate, `ARCHITECTURE.md`, consolidated QA checklist, open items, HANDOFF close-out. |
