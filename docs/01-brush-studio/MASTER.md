# Brush Studio — MASTER plan

Planned 2026-08-29 against branch `feat/rail-layout-controls` (HEAD `37a4bce`). Executed by
`/plan-go`, one fresh agent per task. **Read this file, `CLAUDE.md`, and your task file. Nothing
else is required; nothing else is assumed.**

---

## 1. Request

Verbatim (`docs/plans/brush-studio.md`):

> Lets implement a very complex feature: Brushes
>
> - We will start by creating the "Brush Studio" which will be activated via a button in the
>   tool bar next to the lighting studio button
> - Brush studio's goal is to generate brushes that will be available in the pixel editor (we
>   will ignore that part of the implmentation for now and will focus on building brushes)
> - A brush will be defined as pixel data that applies changes to the pixel studio
> - A brush can have layers and frames. How they will be applied will be complex.
>
> The Big stuff:
>
> - This mode will hijack the layers siderail: it will replace the object selector with a
>   brush selector.
> - The layers will now be layers representing brush data. There will be NO CONCEPT of
>   VARIANTS within brush editing.
> - Layers will be more complex in that layers will be able to be grouped into APPLIED LAYERS.
>   Applied layers are how pixel layer data for the brush will be applied and divided into the
>   target layers of the pixel studio (more on this UX when we actually start implementing
>   using the brushes in pixel studio)
> - Layer's will also have the ability to declare their pixel data type. There will be a
>   button that opens a menu to select HSL, RGB, NORMAL, or HEIGHTMAP.
> - All tools should be allowed to be used on brush layers, but the color selections are
>   instead the channels selected by the layer and range -255 to 255; the pixel data
>   represents the DELTA for that channel when the brush is used. When drawing to a layer each
>   channel HSLA or RGBA will map to RGBA for rendering. The color will be mapped to the
>   closest value with 127 as 0 and 0 as -255 and 255 as 255. The rendering will be colorized
>   this way, BUT the values will be stored as the higher resolution of -255 to 255. So an H
>   delta of 100 will render as R with an appropriate value of 127 to 255. And an S of -100
>   will render as a G with an appropriate value of 0 to 127.
> - Brushes will also have frames. So the frame controller will still need to be available
>   BUT AGAIN, no variants. The timeline view will also be needed; HOWEVER, per frame ordering
>   of layers will not be possible. We will instead only allow layer swapping. Brush frames
>   will be used for various effects in the pixel studio to be implemented later. We will need
>   play mode for feedback, but we do NOT need optimized playback mode.
> - Brushes need to be saved in their own project files. This will let us save them and use
>   them across projects, so the brush studio needs to hijack the project Button in the
>   toolbar and replace it with "Brushes" as the the label.

### Interpretation

A third studio mode, `"brush"`, beside `"pixel"` and `"lighting"`. It edits a **brush
document** — a separate file type stored under `server/src/data/brushes/`, entirely
independent of the pixel project's wire format. A brush document has `width × height`,
frames, and layers; every layer carries a `channelType` (`hsl | rgb | normal | heightmap`) and
a grid of signed delta cells in −255..255. Layer order is uniform across frames (the same layer
ids in the same order in every frame). Layers can be assigned to an "applied group". The
existing drawing tools drive the brush canvas; the colour picker is replaced by per-channel
delta sliders. The timeline shows frames × layers with a 200 ms play loop. The "Projects"
button becomes "Brushes" and opens a brush-file chooser. Using brushes inside the pixel
studio is **out of scope**.

### Assumptions made where the request was ambiguous

| Ambiguity | Decision |
| --- | --- |
| "project Button in the toolbar" | **Measured: there is no project button in the Toolbar.** The `Projects` button is in the Header (`client/src/ui/components/Header/Header.tsx:353-362`). The plan relabels *that* button. |
| Unpainted vs "delta of zero" | A cell is either `0` (unpainted, renders transparent) or a 4-tuple of deltas. A painted all-zero delta renders as mid-grey 127. |
| Alpha channel rendering | Per the request, HSLA/RGBA map channel-for-channel; the A delta maps through the same 127-centred function, so a painted cell with A=0 renders at alpha 127. |
| Height/normal channel counts | `normal` = 3 channels (X, Y, Z), `heightmap` = 1 channel (H). Storage always keeps 4 slots; unused slots stay 0. |
| Where the tool set comes from | The pixel studio's tool table, shared `ToolUIStore`. `origin` and `reference-trace` are hidden in brush mode (meaningless there). `gaussian-fill` behaves as `flood-fill` on delta grids. |
| Playback | Local 200 ms interval, same as `FrameTimeline.tsx:226-256`. No fps control. |
| Which brush opens on entering the mode | The first brush alphabetically, if any; otherwise an empty state until one is created. |
| Cross-tab sync | Not broadcast for brushes in v1. |
| Persisting brush-studio UI state | Not persisted in v1 (selection, zoom, delta sliders are in-memory). The `studioMode: "brush"` value *is* persisted in the project's `uiState` exactly like `"lighting"`. |

---

## 2. Outcome

When every wave is DONE the owner can:

1. Click a third studio button (brush icon) beside Pixel/Lighting in the toolbar and land in
   the Brush Studio; click Pixel to return, with the pixel project untouched.
2. See the Header's document button read **Brushes**; open it to list / create / rename /
   delete brush files; brush files appear at `server/src/data/brushes/<name>.json`.
3. See the left rail show a **brush selector** (list of brush files, current highlighted) and
   a **brush layer panel** instead of the object library and project layer panel.
4. Add / rename / delete / reorder (swap up/down, applied to every frame) / show-hide layers;
   pick each layer's channel type from a menu (HSL, RGB, NORMAL, HEIGHTMAP) and assign it to
   an applied group.
5. Draw on a brush layer with pencil, eraser, line, rectangle, ellipse, fill-square,
   flood-fill, eyedropper, move (and selection — W9), using per-channel delta sliders
   (−255..255) in place of the colour picker. The canvas renders deltas colourised with
   127 = 0.
6. Add / duplicate / delete / reorder frames in a timeline (frames × layers grid) and press
   play to cycle frames at 200 ms.
7. Undo/redo brush edits with ⌘Z/⇧⌘Z; the pixel project's undo stack is not disturbed.
8. Have every edit autosaved (500 ms debounce, status dot) to the brush's own file, and
   reload the page to find the brush exactly as left.
9. Run the full gate (`bun run verify` + `lint:boundaries` + `lint:css` + server tests) green,
   with the 151-snapshot corpus digests **unchanged**.

---

## 3. Locked decisions

| # | Decision | Value |
| --- | --- | --- |
| D1 | Mode representation | Widen `StudioMode` (`client/src/types/domain.ts:279`) to `"pixel" \| "lighting" \| "brush"`. Owner stays `LightingUIStore.studioMode`; `setStudioMode("brush")` resets tool to `"pixel"`. |
| D2 | Brush document type | New `client/src/types/brush.ts`. `BrushDocument { version: "brush-1"; width; height; frames: BrushFrame[]; appliedGroups: BrushAppliedGroup[] }`. **No name inside the file** — the filename stem is the identity, like projects. |
| D3 | Cell type | `type BrushCell = [number, number, number, number] \| 0`. Grid is `BrushCell[][]` indexed `[y][x]`. In-memory shape **is** the wire shape (plain `JSON.stringify`). No compact codec in v1. |
| D4 | Channel types | `type BrushChannelType = "hsl" \| "rgb" \| "normal" \| "heightmap"`. `BRUSH_CHANNELS = { hsl: ["H","S","L","A"], rgb: ["R","G","B","A"], normal: ["X","Y","Z"], heightmap: ["H"] }`. |
| D5 | Colourisation | `deltaToByte(v) = clamp(Math.round(127 + v / 2), 0, 255)` (−255→0, 0→127, 255→255). `brushCellToRgba(cell, type)`: hsl/rgb → `{r:b(c0), g:b(c1), b:b(c2), a:b(c3)}`; normal → `{r:b(c0), g:b(c1), b:b(c2), a:255}`; heightmap → grey `b(c0)`, a 255; `0` → `null`. |
| D6 | Layer identity | `BrushLayer.id` is **stable across frames**. Invariant: every frame has the same layer ids in the same order. Enforced by `BrushStructureStore`; `assertUniformLayers(doc)` throws otherwise. |
| D7 | Store tree | `app.brushes: BrushStore` (owns the document + lifecycle, **own `HistoryStore` instance**), `app.brushStructure: BrushStructureStore`, `app.brushPixels: BrushPixelStore` (behaviour modules over `brushes.document`), `app.brushUI: BrushUIStore` (selection, delta, zoom/pan, playing). |
| D8 | Observability | `BrushStore.document` is `observable.ref`. Every mutation replaces the document immutably (spine copy, touched rows only). Grids are never proxied. Canvases redraw from `brushes.pixelVersion`. |
| D9 | History | Structural ops → `createBrushSnapshotCommand` (whole-document `before`). Pixel writes → `createBrushPixelCommand` with `{x,y,before,after}` inverse patches. Both in new `client/src/stores/history/brushCommands.ts`. Strokes wrap in `beginTransaction/endTransaction` on the brush history. |
| D10 | Undo routing | `ApplicationStore.activeHistory` computed = `brushes.history` when `studioMode === "brush"`, else `history`. `app.undo()/redo()` and the toolbar use it. |
| D11 | Autosave | `AutoSaveController` becomes generic over a structural `AutoSaveDocument<TDoc>` interface (no behaviour change). A second instance, `app.brushAutoSave`, saves via `brushApi.save`. Trigger tuple: `[loadGeneration, domainVersion, pixelVersion]` of `BrushStore`. |
| D12 | Server storage | `server/src/data/brushes/<name>.json` via `safeWriteFile`; previous version copied to `server/src/data/brushes/.prev/<name>.json` before each overwrite. Names validated by `isValidProjectName`. No rotation, no sync broadcast. |
| D13 | Routes | `GET /api/brushes`, `GET /api/brush?name=`, `POST /api/brush?name=`, `POST /api/brush/create`, `POST /api/brush/rename`, `DELETE /api/brush?name=`. Mounted `app.use("/api", brushRouter)`. |
| D14 | Client API | `client/src/api/resources/brushApi.ts`, exported from the barrel. Same shape as `projectApi`. |
| D15 | Layout | New `ui/layouts/BrushStudioLayout` (slots: header, toolbar, brushLibrary, layerPanel, rightControls, studioPanel, timeline, canvas). No `layerColors`, no reference panels. |
| D16 | Left rail | `BrushLibrary` (brush file list) above `BrushLayerPanel`. Both new pure components. |
| D17 | Delta picker | New `ui/components/BrushDeltaPicker` — N sliders per `BRUSH_CHANNELS[type]`, −255..255, editing `brushUI.selectedDelta` (UI state, **not** undoable). |
| D18 | Canvas | New `containers/BrushCanvasContainer.tsx` reusing `CanvasSurface`, `useCanvasPointer`, `useCanvasRender`, `toolHandlers`, `canvasBackground`, `renderHoverMarker`, `app.canvasInteraction`. Rendering: `renderBrushFrame` (new, `ui/canvas/render/`) into an `ImageData`, upscaled with `renderNormalEdit`. |
| D19 | Tool colour | Tool handlers run unchanged; the container passes a dummy `currentColor` and maps each `ToolPixelWrite` to `color === 0 ? 0 : brushUI.selectedDelta`. |
| D20 | Timeline | `TimelineView` (pure, existing) fed by a new `BrushTimelineContainer`. Only the timeline view mode — no `FramesView`/`VariantView`. |
| D21 | Header | `Header` gets `projectButtonLabel?: string` (default `"Projects"`); `HeaderContainer` passes `"Brushes"` and `BrushSelectModalContainer` as `projectModal` in brush mode. Inline project-rename shows the brush name in brush mode. |
| D22 | Hotkey | The existing pixel⇄lighting toggle hotkey is unchanged; brush mode is entered only via the toolbar button. |
| D23 | Naming | Prefix everything `Brush*`. **Avoid** `BrushShape`, `BrushShapeFn`, `isBrushTool`, `brushStamp` — those already exist in `ui/canvas/tools/` and mean stroke geometry. |
| D24 | CSS | One BEM block per new component (`brush-layer-panel`, `brush-library`, `brush-delta-picker`, `brush-select-modal`, `brush-studio-layout`), tokens only, co-located `<Name>.css` imported by the `.tsx`. |

---

## 4. Ground truth (measured 2026-08-29)

### Refresh state
The 38-task refresh has landed; `REFRESH/` is deleted in the working tree. Everything new is
MobX + `ui/` + `containers/` + BEM. Legacy remnants: `client/src/components/{AnchorGrid,Canvas,FrameTimeline}` and `client/src/store/storeTypes.ts`. Zustand is gone.

### ⚠️ Dirty worktree
Branch `feat/rail-layout-controls` has **103 uncommitted files** (sync client/server, Other-Hand
rail, iOS companion, `.gitignore`, deleted `REFRESH/`). These are the owner's in-flight work.
**Executors stage only the files in their `Touches` list** (`git add <paths>`), never `git add -A`.

### Gate baseline
| Command | Result |
| --- | --- |
| `cd client && bunx tsc --noEmit` | clean (4 s) |
| `cd client && bunx eslint .` | 0 errors, 64 warnings (10 s) |
| `cd client && bunx vitest run` | 113 files, 1948 tests pass (70 s; corpus digests included) |
| `cd client && bun run lint:boundaries` | OK — all 5 rules hold |
| `cd client && bunx stylelint "src/**/*.css"` | **2 pre-existing errors** (`src/ui/components/OtherHand/OtherHand.css:267,288`, uncommitted, not ours) + 66 warnings. Gate = no *new* errors. |
| `cd client && bunx storybook build` | OK (7 s), 67 stories. `storybook dev` does not work here (no lockfile) — use `bun run storybook`. |
| `cd server && bunx tsc --noEmit` | clean |
| `cd server && bunx vitest run` | 52 tests pass |
| lockfile check | none present |

`bun run verify` (root) = typecheck + lint + format:check + client test + build. It does **not**
run server tests, `lint:boundaries` or `lint:css` — waves list those explicitly.

### Key code facts (paths are relative to `client/src/` unless noted)
- `types/domain.ts:1-22` `Pixel`, `Normal`, `PixelData`; `:24-39` `Layer` (no opacity/lock); `:41-46` `Frame`; `:279` `StudioMode`.
- `types/codecs/compactTypes.ts:108` `studioMode` is a persisted wire field; `codecs/deserialize.ts:189` defaults `?? "pixel"`.
- `stores/ui/LightingUIStore.ts:189-192` `setStudioMode` (coupled tool reset, pinned by `stores/ui/__tests__/LightingUIStore.test.ts:248-254`).
- `containers/AppContainer.tsx:103-107` mode switch is `=== "lighting" ? … : …` (else-fallback).
- `containers/ToolbarContainer.tsx:50,54`; `ui/components/Toolbar/Toolbar.tsx:39-69` props (`isLightingMode: boolean`, `onSetStudioMode: (mode: "pixel"|"lighting")`), `:151-177` studio buttons; `Toolbar.css:274-292, 387-394` (`[aria-label="Lighting Studio"]` selector).
- `containers/GlobalHotkeys.tsx:100-101` toggle ternary; `containers/RightSidebarTopControlsContainer.tsx:74`; `containers/otherHand/toolWidgets.ts:60`.
- `stores/ApplicationStore.ts` (1653 lines): children `:199-385`, ctor `:391-784` (order load-bearing, `:442-469`), `undo/redo :1527-1532`, `dispose :1644`. Options `autoSaveEnabled :109`.
- `stores/domain/DomainStore.ts`: observables `:139-209`, flows `:508-759`, `serialize :467`, `projectName :142`.
- `stores/session/AutoSaveController.ts`: ctor `:148`, trigger `:237-241`, `run :274-306`, options `:99`.
- `stores/history/HistoryStore.ts`: `beginTransaction :200`, `endTransaction :212`, `record :229`, `undo/redo :251-263`; `history/commands.ts`: `Command :38`, `createSnapshotCommand :145`, `createCompositeCommand :190`, `collapseTransaction :631`.
- `stores/domain/PixelStore.ts`: `writeCells :222-235` (row-copy pattern), `commitCells :483`, `publishAndBump :601`.
- `ui/canvas/tools/toolHandlers.ts:51-125` `ToolContext`, `ToolPixelWrite`, `getToolHandler`; `:275-286` exhaustiveness gate.
- `ui/hooks/useCanvasPointer.ts:62-96`; `ui/hooks/useCanvasRender.ts:49`; `ui/canvas/render/renderNormalEdit.ts:46-75`; `ui/canvas/render/canvasBackground.ts:93-185`; `ui/canvas/render/renderHoverMarker.ts`; `utils/alphaBlend.ts:127` `blendOverInto`.
- `containers/LightingCanvasContainer.tsx` (714 lines) — the small canvas-container analogue; `containers/CanvasContainer.tsx:1817-1887` `getToolContext`, `:2253-2271` `finishDrawingStroke`.
- `ui/components/CanvasSurface/CanvasSurface.tsx:78-149` props; `ui/components/TimelineView/TimelineView.tsx:57-105` props; `TimelineCell.tsx`; `timelineTypes.ts:18-48`; `ui/primitives/ThumbnailCanvas` (`draw`+`revision`).
- `ui/components/LayerPanel/*` (LayerRow `:61-122`), `ui/components/ObjectLibrary/ObjectLibrary.tsx:58-101`, `ui/components/ProjectSelectModal/ProjectSelectModal.tsx:6-16`, `ui/components/Toolbar/EyedropperModeMenu.tsx` (portalled menu pattern), `ui/primitives/Dropdown` (not portalled — clips in scroll containers).
- `ui/layouts/PixelStudioLayout/PixelStudioLayout.tsx` (147), `LightingStudioLayout.tsx` (117), `ui/components/AppShell/AppShell.tsx:34-81`; `containers/hooks/useRailLayout.tsx`.
- `ui/components/Header/Header.tsx:58-115` props, `:353-362` button, `:383`; `containers/HeaderContainer.tsx:220`.
- `api/index.ts` barrel (only legal import site); `api/resources/projectApi.ts`; `api/client/httpClient.ts:18,116`; `api/__mocks__/{fixtures,handlers}.ts`; `api/__tests__/resources.contract.test.ts`.
- `server/src/index.ts:39-41` router mounts; `server/src/routes/project.ts`; `server/src/backup.ts:74 safeWriteFile`, `:65 ensureDir`, `:476 exports`; `server/src/validation.ts:14 isValidProjectName`; `server/vitest.config.ts`.
- Test rigs: `store/__tests__/storeContract.ts` (`tinyProject`, `makeRig` pattern), `fixtures/` (pure data, no MobX), `test/setup.*.ts`, MSW `onUnhandledRequest: "error"`.
- ESLint boundaries: `client/eslint.config.js:274-360`; `client/scripts/check-boundaries.mjs`.

---

## 5. Wave table

| Wave | Tasks | Parallel | Gate before next wave |
| --- | --- | --- | --- |
| W1 | 01 types, 02 server routes, 03 studio mode, 05 autosave generic | 4 | client gate · `cd server && bunx tsc --noEmit && bunx vitest run && bunx eslint .` · corpus digests unchanged |
| W2 | 04 brushApi, 06 brush render, 12 BrushLayerPanel, 13 BrushLibrary+SelectModal, 14 BrushDeltaPicker, 15 BrushStudioLayout | 6 | client gate + `bunx stylelint "src/**/*.css"` (no new errors) + `bunx storybook build` |
| W3 | 07 BrushStore, 10 BrushUIStore | 2 | client gate |
| W4 | 08 BrushStructureStore, 09 BrushPixelStore | 2 | client gate |
| W5 | 11 ApplicationStore wiring | 1 | client gate |
| W6 | 16 BrushCanvasContainer, 17 rail/panel containers, 18 BrushTimelineContainer | 3 | client gate + stylelint |
| W7 | 19 BrushStudioContainer + AppContainer + Header + Toolbar | 1 | client gate + stylelint + storybook build + **manual checks** |
| W8 | 20 flood-fill / eyedropper / move on brush canvas | 1 | client gate + manual |
| W9 | 21 selection tool on brush canvas | 1 | client gate + manual |
| W10 | 22 final gate, docs, QA sweep | 1 | `bun run verify` + `lint:boundaries` + `lint:css` + server tests + storybook build + lockfile check |

"client gate" = `cd client && bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run lint:boundaries`, then `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` from the repo root returns nothing.

---

## 6. Dependency graph

```
01 types ─────┬──────────────┬───────────┬──────────┬──────────┐
              ▼              ▼           ▼          ▼          ▼
02 server → 04 brushApi   06 render   12 LayerPanel 13 Library 14 Delta     15 Layout
03 mode          │            │           │          │          │            │
05 autosave      ▼            │           │          │          │            │
   │         07 BrushStore    │           │          │          │            │
   │            │   10 BrushUIStore       │          │          │            │
   │            ▼        │                │          │          │            │
   │      08 Structure  09 Pixels         │          │          │            │
   │            └────┬───┘                │          │          │            │
   └────────────────►11 App wiring        │          │          │            │
                     │                    │          │          │            │
        ┌────────────┼──────────────┐     │          │          │            │
        ▼            ▼              ▼     │          │          │            │
   16 Canvas ◄──06  17 Containers ◄─┴─────┴──────────┘   18 Timeline ◄──06   │
        └────────────┼──────────────────────────────────────┘                │
                     ▼                                                       │
              19 BrushStudioContainer ◄──────────────────────────────────────┘
                     │
              20 fill/eyedropper/move
                     │
              21 selection
                     │
              22 final gate
```

Task → depends on: 01 none · 02 none · 03 none · 05 none · 04 01,02 · 06 01 · 12 01 · 13 01 ·
14 01 · 15 none · 07 01,04,05 · 10 01 · 08 07,10 · 09 07,10 · 11 03,05,07,08,09,10 ·
16 06,11 · 17 11,12,13,14 · 18 11,06 · 19 03,15,16,17,18 · 20 19 · 21 20 · 22 21.

---

## 7. Collision matrix

**W1**
| 01 | 02 | 03 | 05 |
| --- | --- | --- | --- |
| `client/src/types/brush.ts` (new), `client/src/types/index.ts`, `client/src/types/__tests__/brush.test.ts` (new) | `server/src/brushFiles.ts` (new), `server/src/routes/brush.ts` (new), `server/src/index.ts`, `server/src/__tests__/brushFiles.test.ts` (new) | `client/src/types/domain.ts`, `stores/ui/LightingUIStore.ts`, `stores/ui/__tests__/LightingUIStore.test.ts`, `ui/components/Toolbar/Toolbar.tsx`, `Toolbar.css`, `Toolbar.stories.tsx`, `containers/ToolbarContainer.tsx`, `containers/AppContainer.tsx`, `containers/GlobalHotkeys.tsx`, `containers/RightSidebarTopControlsContainer.tsx`, `containers/otherHand/toolWidgets.ts`, `fixtures/uiState.ts` | `stores/session/AutoSaveController.ts`, `stores/session/__tests__/autoSaveController.test.ts`, `stores/domain/DomainStore.ts` (one getter) |

Disjoint: 01 touches `types/brush.ts`+`types/index.ts`; 03 touches `types/domain.ts` only. ✔

**W2**
| 04 | 06 | 12 | 13 | 14 | 15 |
| --- | --- | --- | --- | --- | --- |
| `api/resources/brushApi.ts` (new), `api/index.ts`, `api/__mocks__/fixtures.ts`, `api/__mocks__/handlers.ts`, `api/__tests__/resources.contract.test.ts` | `ui/canvas/render/renderBrushFrame.ts` (new), `ui/canvas/render/__tests__/renderBrushFrame.test.ts` (new) | `ui/components/BrushLayerPanel/**` (new dir) | `ui/components/BrushLibrary/**` (new dir), `ui/components/BrushSelectModal/**` (new dir) | `ui/components/BrushDeltaPicker/**` (new dir) | `ui/layouts/BrushStudioLayout/**` (new dir) |

All new, distinct directories. ✔

**W3** — 07: `stores/domain/BrushStore.ts` (new), `stores/history/brushCommands.ts` (new), `stores/domain/__tests__/BrushStore.test.ts` (new), `stores/history/__tests__/brushCommands.test.ts` (new) · 10: `stores/ui/BrushUIStore.ts` (new), `stores/ui/__tests__/BrushUIStore.test.ts` (new). ✔

**W4** — 08: `stores/domain/BrushStructureStore.ts` (new), `stores/domain/__tests__/BrushStructureStore.test.ts` (new) · 09: `stores/domain/BrushPixelStore.ts` (new), `stores/domain/__tests__/BrushPixelStore.test.ts` (new). Both *read* `BrushStore.ts` and `brushCommands.ts` but do not edit them. ✔

**W6** — 16: `containers/BrushCanvasContainer.tsx` (new), `containers/brush/brushToolContext.ts` (new), `containers/brush/__tests__/brushToolContext.test.ts` (new) · 17: `containers/BrushLibraryContainer.tsx`, `containers/BrushSelectModalContainer.tsx`, `containers/BrushLayerPanelContainer.tsx`, `containers/BrushStudioPanelContainer.tsx` (all new) · 18: `containers/BrushTimelineContainer.tsx` (new), `containers/hooks/brushCellThumbnail.ts` (new). ✔

Single-task waves need no matrix.

---

## 8. Alignment guide

**Imitate these files, don't invent:**
- Store lifecycle & flows → `stores/domain/DomainStore.ts` (`initProject`, `switchProject`, `installTree`, `serialize`, `setSaveSuspended` bracketing).
- Behaviour-module store deps/injection → `stores/domain/FrameStore.ts:52-71`, `LayerStore.ts:97-118`.
- Row-copy immutable grid write → `stores/domain/PixelStore.ts:222-235`, `:483-513`.
- Command shapes → `stores/history/commands.ts:38-63,145,190,253-268`.
- UI store shape → `stores/ui/LightingUIStore.ts` (explicit `makeObservable` map, `observable.ref` for objects).
- Canvas container → `containers/LightingCanvasContainer.tsx` (structure), `containers/CanvasContainer.tsx:1817-1887` (`getToolContext`), `:2253-2271` (shape commit).
- Pure component + story → `ui/components/LayerPanel/LayerRow.tsx` + `LayerRow.stories.tsx` + `storyFixtures.ts`; `ui/components/ObjectLibrary/ObjectLibrary.tsx`; `ui/components/ProjectSelectModal/ProjectSelectModal.tsx`.
- Portalled per-row menu → `ui/components/Toolbar/EyedropperModeMenu.tsx`.
- Layout → `ui/layouts/LightingStudioLayout/LightingStudioLayout.tsx`.
- Server route + file helpers → `server/src/routes/project.ts`, `server/src/backup.ts:65-100`.
- API resource + MSW → `api/resources/projectApi.ts`, `api/__mocks__/handlers.ts:29-70`.

**Boundaries that must not be crossed:**
- `ui/**` imports no store/API/MobX/`useContext`; `ui/primitives/**` imports no `types/`. `observer()` only in `containers/`. `stores/domain/**` never imports `stores/ui/**` — inject callbacks. `api/**` never imports stores.
- Grids: `BrushStore.document` is `observable.ref`; never `makeObservable` a cell; never `observer` on grid contents; redraw from `pixelVersion`.
- Never touch `types/codecs/**`, `services/migrations/**`, `server/src/export/**`, or the corpus snapshots. Task 03's `types/domain.ts` edit is a union widening only.

**Naming to hold:** `BrushDocument`, `BrushFrame`, `BrushLayer`, `BrushCell`, `BrushDelta` (a 4-tuple), `BrushChannelType`, `BrushAppliedGroup`; stores `BrushStore`, `BrushStructureStore`, `BrushPixelStore`, `BrushUIStore`; API `brushApi`; components `BrushLibrary`, `BrushLayerPanel`, `BrushLayerRow`, `BrushChannelMenu`, `BrushDeltaPicker`, `BrushSelectModal`, `BrushStudioLayout`; containers `Brush*Container`. BEM blocks in kebab-case of the same names.

**What done looks like:** the brush studio feels like the pixel studio with a smaller
canvas — same toolbar, same rails, same timeline grid — but the left rail lists brush files,
layer rows show a channel badge (`HSL`/`RGB`/`NRM`/`HGT`), the studio panel has sliders
instead of a colour wheel, and painted cells are mid-grey at zero delta.

**Most likely mistakes:**
1. Forgetting the new store in the autosave trigger (silent data loss — see `AutoSaveController.ts:16-24`).
2. Recording brush commands into the shared `editorHistory` instead of `brushes.history`.
3. Making `document` deeply observable (`observable` instead of `observable.ref`).
4. Using `Dropdown` for the channel menu (clips inside the rail scroller) instead of the portalled pattern.
5. Breaking the pinned `LightingUIStore` test by leaving `setStudioMode`'s ternary un-widened.
6. Committing unrelated uncommitted files from the dirty worktree.
7. Letting a `ui/` file import a container or store (lint fails — good — but don't "fix" it by moving the file out of `ui/`).
8. Skipping the manual checks in W7–W9.

---

## 9. Risk register

| Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- |
| Corpus digest changes from `types/domain.ts` / `DomainStore` / `AutoSaveController` edits | Low | **Critical** (owner data) | Union-widening and a getter only; W1 gate re-runs the full suite; any digest diff = STOP, revert, report. Never `vitest -u`. | 03, 05 |
| Dirty worktree files get committed | Medium | High | `git add <Touches only>`; coordinator diffs each commit against `Touches`. | every task |
| Autosave silently not wired for brushes | Medium | High | 11 must add a test that a `brushPixels` write bumps `brushes.pixelVersion` and triggers the brush save. | 11 |
| Brush undo stack collides with project undo | Medium | Medium | Own `HistoryStore`; `activeHistory` routing test in 11. | 07, 11 |
| `BrushCanvasContainer` balloons like `CanvasContainer` | Medium | Medium | Scope split 16 → 20 → 21; ~300-line guideline per file, helpers in `containers/brush/`. | 16 |
| Channel menu clipped by rail scroll container | High if `Dropdown` used | Low | Portalled menu (alignment guide). | 12 |
| Server tests write into real data dir | Low | High | `brushFiles.ts` takes `baseDir`; tests use `mkdtemp`. Agents cannot read `server/src/data/**` anyway. | 02 |
| `verify` misses server tests / boundaries / stylelint | Certain | Medium | Wave gates list them explicitly. | coordinator |
| Storybook stories fail to build for new components | Low | Low | W2 & W7 gates run `bunx storybook build`. | 12–15 |
| Uniform-layer invariant broken by a frame op | Medium | Medium | `assertUniformLayers` called in every `BrushStructureStore` test; pixel store asserts layer exists in every frame. | 08 |
| The data-safety hook blocks Bash commands whose *text* contains the banned flag strings | Certain if quoted | Low | Never echo/heredoc those strings in Bash; use the Write tool for docs. | every task |

---

## 10. Rules for every executor

- **Bun only.** No `node`, no `npm`. Every `bun add` uses `--exact`. After any `bunx`, run
  `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` from the repo root and delete
  any lockfile it created. Never use the frozen-lockfile flag.
- **Never run `vitest -u`.** If a snapshot or corpus digest differs, stop and report the diff.
- **Never touch** `server/src/data/**`, `server/exports/**`, `client/src/types/codecs/**`,
  `client/src/services/migrations/**`, `server/src/export/**`, or any `__snapshots__`.
- **Stay inside `Touches`.** If you need a file not listed, stop and report — the collision
  matrix depends on it.
- **Stage only your files.** `git add <paths>`; never `git add -A` / `git commit -a`. Commit at
  task granularity with the message prefix `brush-studio(NN): …`.
- **`ui/` stays pure**; `observer()` only in `containers/`; domain never imports ui.
- **Grids are `observable.ref`**; redraw from version counters.
- **Run the gate and paste real output** into your report. "It passes" is not a report.
- **Do the manual checks** listed in your task. A task with manual checks skipped is PARTIAL,
  not DONE.
- **Report honestly**, including what you could not finish and why.
- Do not break `bun run dev`.

---

## 11. Task index

| NN | Title | Wave | Effort | Summary |
| --- | --- | --- | --- | --- |
| 01 | Brush document types & colourisation | W1 | S | `types/brush.ts`: document/frame/layer/cell types, channel table, `deltaToByte`, `brushCellToRgba`, factories, `normalizeBrushDocument`, tests. |
| 02 | Server brush file routes | W1 | M | `server/src/brushFiles.ts` + `routes/brush.ts`, mounted in `index.ts`, tests against a temp dir. |
| 03 | Third studio mode "brush" | W1 | M | Widen `StudioMode`; toolbar button; exhaustive `AppContainer` switch with placeholder; fix every boolean-flip site. |
| 05 | Generic AutoSaveController | W1 | S | Structural `AutoSaveDocument<TDoc>`; behaviour unchanged; `DomainStore.saveName` getter. |
| 04 | Client `brushApi` | W2 | S | Resource module, barrel export, MSW fixtures/handlers, contract tests. |
| 06 | Brush frame renderer | W2 | S | `renderBrushFrame` compositing colourised delta layers into a `PixelBuffer`; hash tests. |
| 12 | BrushLayerPanel UI | W2 | M | Pure panel + row + portalled channel/applied-group menu, CSS, fixtures, stories. |
| 13 | BrushLibrary & BrushSelectModal UI | W2 | M | Brush file list for the rail; create/rename/delete modal. Stories. |
| 14 | BrushDeltaPicker UI | W2 | S | Per-channel −255..255 sliders with swatch preview. Story. |
| 15 | BrushStudioLayout | W2 | S | Layout with the brush slot set; story. |
| 07 | BrushStore (document lifecycle) | W3 | M | Observable.ref document, list/load/create/switch/rename/delete flows, own history, snapshot commands. |
| 10 | BrushUIStore | W3 | S | Selected frame/layer, delta vector, zoom/pan, playing. |
| 08 | BrushStructureStore | W4 | M | Frame & layer ops preserving the uniform-layer invariant; applied groups. |
| 09 | BrushPixelStore | W4 | M | Cell writes with inverse-patch commands; move; flips. |
| 11 | ApplicationStore wiring | W5 | M | Construct the four stores, brush autosave, `activeHistory`, undo routing, dispose, tests. |
| 16 | BrushCanvasContainer | W6 | L | Render + pencil/eraser/line/rect/ellipse/fill-square strokes, hover marker, zoom. |
| 17 | Rail & panel containers | W6 | M | Library, select-modal, layer-panel, studio-panel containers. |
| 18 | BrushTimelineContainer | W6 | M | `TimelineView` grid, cell thumbnails, frame ops, 200 ms playback. |
| 19 | BrushStudioContainer & mode integration | W7 | M | Compose the layout; `AppContainer` brush branch; Header "Brushes"; toolbar history/tool routing. |
| 20 | Flood-fill, eyedropper, move | W8 | M | Remaining colour-dependent tools on delta grids. |
| 21 | Selection tool on brush canvas | W9 | M | Rect/lasso mask + masked writes + move-selection for brush grids. |
| 22 | Final gate, docs, QA | W10 | S | Full gate, `ARCHITECTURE.md` section, manual QA sweep, HANDOFF close-out. |
