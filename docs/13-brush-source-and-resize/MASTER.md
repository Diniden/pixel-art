# MASTER — Brush colour source and resizable brushes (plan 13)

## 1. Request

Verbatim (2026-09-13):

> For brush studio and brush tool:
> - We need the studio when creating layers to specify if the layer is supposed to source the color from the target or from selected color
> - The idea is to be able to make brush tools that can perform things like burns or fades etc
> - Brush studio specifies the dimensions of the initial brush stroke, I want the brush tool to be able to adjust width and height further from that initial size.
> - Adjusting size implies that we are scaling the brush canvas, but scaling is a tricky operation for pixel perfect items. So I want you to implement all of the common and best scaling strategies for textures and let the user select the strategies for the x and y axis for the resize.
> - The x and y sizing and ratios between each other should be locked together initially so sliding x will affect y and selecting scaling strategy applies to both initially.
> - Use sliders and set up for other hand mode properly.

**Interpretation.** Two features on the plan-12 Brush tool. (1) Each brush **layer** gains a
`colorSource` — `"selected"` (the deltas operate on the picked colour, today's behaviour) or
`"target"` (the deltas operate on the pixel already on the canvas), chosen when the layer is
created in the Brush Studio and changeable afterwards. This is what makes burn / dodge / fade /
tint brushes possible. (2) The pixel studio's Brush tool gets **width and height** controls
that resample the brush frame before stamping, with a selectable scaling **strategy per axis**
from a full set (nearest, bilinear, bicubic, Mitchell, Lanczos-2/3, box; EPX/Scale2x, Scale3x,
Eagle, xBR, hq2x), a **ratio lock** that is on by default (moving one slider moves the other;
one strategy pick sets both), sliders in the rail, and matching thumb widgets in Other Hand Mode.

**Assumptions made where the request was ambiguous**
- "Target" means the pixel under the stamped cell on the **editable layer** (the grid
  `setPixels` writes), not the composited image. Empty target → nothing written (a burn on
  nothing is nothing).
- A target-seeded cell is settled **once per stroke** from its pre-stroke pixel, so dragging
  back and forth in one stroke does not compound; a second stroke compounds.
- When layers with different sources overlap on one cell, the **bottom-most visible painted
  layer** at that cell decides the seed; all layers' deltas still apply in order (one fold,
  as plan 12 D5).
- Size is an absolute cell count (not a percentage); `null` means "the brush's native size",
  and a brush with different native dimensions resets to native.
- The stamp size and strategies are **session-only** (not saved in the project or the brush).
- Pixel-art scalers are inherently 2-D at integer factors: picking one applies to both axes;
  the exact target size is reached with a final nearest pass.

## 2. Outcome

- In the Brush Studio, "+" shows a **Colour source** section above **Channels**; every row
  shows `SEL` or `TGT` beside its channel badge and the badge's menu changes it (undoable).
- In the pixel studio with the Brush tool (B): an HSL layer with L −60 and source Target
  darkens what you paint over and leaves empty canvas empty; the rail's Brush section has
  W/H sliders with numeric inputs, a lock button, "Native size", and a scaling dropdown
  (one when locked, X and Y when unlocked); the hover marker and the stroke use the scaled
  brush; Other Hand Mode shows the same controls as thumb widgets.
- Old brush files load unchanged; the project wire format, codecs, migrations and corpus
  snapshots are untouched.

## 3. Locked decisions

| # | Decision | Value |
| --- | --- | --- |
| D1 | Wire shape | `BrushLayer.colorSource?: "selected" \| "target"` — **optional, additive**; the key is present only when `"target"`. No version bump (`normalizeBrushDocument` never reads `version`). Helper `brushLayerColorSource(layer)` = `layer.colorSource ?? "selected"`. Tables `BRUSH_COLOR_SOURCES`, `BRUSH_COLOR_SOURCE_LABEL` (`Selected colour` / `Target pixel`), `BRUSH_COLOR_SOURCE_BADGE` (`SEL` / `TGT`), `DEFAULT_BRUSH_COLOR_SOURCE` in `types/brush.ts`. |
| D2 | Store API | `BrushStructureStore.addLayer(name, channelType, colorSource = "selected")`; `setLayerColorSource(id, source)` — snapshot commit `"Change colour source"`, `bumpPixels = false`, `"selected"` **drops the key** (mirrors `withoutAppliedGroup`). `duplicateLayer` carries it via spread. |
| D3 | Creation UX | The "+" menu shows **Colour source** (radios, sticky tick, does **not** close) above **Channels** (picking a channel creates and closes): `onAddLayer(channelType, colorSource)`. Draft source resets to `"selected"` when the menu closes. Row: second badge button `brush-layer-panel__source-badge` opening the same row menu; picking a source fires `onSetColorSource(id, source)` and closes. `BrushTimelineContainer`'s add-layer inherits the selected layer's source as it inherits its channel. |
| D4 | Stamp cell shape | `PixelBrushCell { dx, dy, color, targetDeltas? }` — backwards compatible. `targetDeltas` present ⇒ target-seeded. `color` is always the selected-seed settle and is the **fallback** when no sampler is supplied (the Brush Studio never supplies one). |
| D5 | Seed and write rule | Seed = `colorSource` of the **bottom-most visible painted layer** at the cell. `stampPixelBrushSegment(prev, next, line, stamp, bounds, target?)` with `PixelBrushTarget { sample(x, y): StampColor \| null; touched: Set<number> }`: target cell → skip if `touched` has `y·gridWidth + x`; `sample` `null` (cell `color === 0`/missing) → **no write**; else write `settlePixelBrushColor(pixel, targetDeltas)` and mark touched. A present pixel with `a === 0` is sampled (not null). Settled `a === 0` is written as-is (same as the selected path). The handler's `onDown` clears `touched` before its first stamp. |
| D6 | Resampling model | Five channels per cell `(c·d0, c·d1, c·d2, c·d3, c)`, `c` = coverage (1 painted / 0 unpainted). Resample all five; output painted iff `c ≥ 0.5`; deltas `clampDelta(Σ/c)`. Separable: rows with `kernelX` to `dstW`, then columns with `kernelY` to `dstH`. Centre convention `u = (i + 0.5)·src/dst − 0.5`; clamp-to-edge; minification stretches the kernel by `src/dst`. Identical size → exact deep copy for **every** kernel. Nearest clones the sampled tuple (integer upscales are pixel-exact). |
| D7 | Strategy set | Kernels (per-axis): `nearest` NN, `bilinear` BIL, `bicubic` BIC (Catmull-Rom), `mitchell` MIT, `lanczos2` LZ2, `lanczos3` LZ3, `box` BOX. Pixel-art (2-D): `epx` EPX (Scale2x), `scale3x` S3X, `eagle` EGL, `xbr` XBR, `hq2x` HQ2 (task 10, may be deferred). Registry `PIXEL_BRUSH_SCALE_OPTIONS` (kernels first), `DEFAULT_PIXEL_BRUSH_SCALE = "nearest"`. |
| D8 | Module layout | `client/src/ui/canvas/tools/pixelBrushScale/{kernels,pixelArt,hqx,hqxTable,index}.ts` — split by family because `max-lines` is an **error** at 400 code lines under `src/ui/**`. Pure, node-lane tests in `pixelBrushScale/__tests__/`. Naming stays `pixelBrush*` / `PixelBrush*` (plan 12 D2). |
| D9 | Pixel-art equality | Cells compare by exact tuple equality including painted-ness (`cellsEqual`); xBR/hqx "distance" = L1 over the four deltas + a large penalty when painted-ness differs. Pixel-art scalers **choose** source cells; hq2x blends deltas only among painted cells. |
| D10 | 2-D pipeline | `need = max(dstW/srcW, dstH/srcH)`; `need ≤ 1` → nearest only; else `passes = need > factor ? 2 : 1` of the scaler, then **nearest** to the exact size. A 2-D id on either axis selects the 2-D path. |
| D11 | Lock / strategy rules | `PixelBrushUIStore` (session-only, at `ui.pixelBrush`): `width/height: number \| null` (null = native), `lockRatio = true`, `lockedRatio: number \| null` (h/w captured when the lock engages; null = native ratio), `scaleX/scaleY`. `setWidth` (locked) → `height = clamp(round(w × ratio))`; `setHeight` (locked) → `width = clamp(round(h / ratio))`; clamps 1..`PIXEL_BRUSH_MAX_SIZE = 256`. `setScale(axis, id)`: 2-D id → both axes; locked → both; unlocked → that axis, and if the other axis holds a 2-D id it becomes `"nearest"`. `resetSize()` → nulls (strategies kept). Slider max `pixelBrushSliderMax(native) = min(256, max(64, 4 × max side))`. |
| D12 | Where scaling runs | `usePixelBrush` (container hook) scales `frame.layers` with `scalePixelBrushLayers` in a memo keyed on `[app, enabled, doc, frameId, pv, dv, width, height, scaleX, scaleY]`, then feeds the **unchanged** `pixelBrushFootprint` / `resolvePixelBrushStamp` at the scaled size. Identity returns the same layer array (stamp reference stability preserved). The hook resets the size when the document's native width/height change. `CanvasContainer`'s call site is unchanged. |
| D13 | Rail UI | New `ui/components/PixelStudioPanel/PixelStudioBrushSection.tsx` (extracted from the panel's inline section; the panel is ~367 code lines against a 400 error limit). `SliderWithNumber` for W and H, `IconButton` lock (lucide `Link`/`Unlink`, `aria-pressed`), `Dropdown` for strategy (one when locked, "Scale X"/"Scale Y" when unlocked; a disabled separator item before the 2-D group), `Button` "Native size". Grouped prop `PixelStudioBrushInfo.size?: PixelStudioBrushSizeControls` — all values resolved by the container. |
| D14 | Other hand | New `containers/otherHand/pixelBrushWidgets.ts` (`toolWidgets.ts` is already over the `max-lines` warning; the count must not rise) + one `case "brush"`. Widgets: slider `width`, one-button toggle `lock` (`Locked`/`Free`), slider `height`, buttons `scale` (locked) or `scale-x` + `scale-y` (unlocked) with `short` labels, action `reset` (`Native`). No new widget kind; section key `tool:brush`. |
| D15 | Persistence / data safety | Nothing new persisted: no edit to `UIStore.toPersistedUIState`, `hydrate`, `types/domain.ts`, `types/codecs/**`, `services/**`, `server/src/export/**`, any `__snapshots__`. The brush file gains one optional key written by the client's plain `JSON.stringify`; the server writes raw JSON and needs no change. |
| D16 | Commits | Prefix `brush-source(NN):` for tasks 01–06, `brush-scale(NN):` for 07–14, `docs(13):` for 15. One commit per task (plus a separate Prettier commit if a sweep is needed). |

## 4. Ground truth (measured 2026-09-13)

### Baseline
`main @ 9df1e72` (every feature branch merged and pushed; working tree clean). `bun run verify`
exit 0: client tsc clean · eslint **0 errors / 66 warnings** · prettier clean · vitest
**193 files / 4027 tests** · vite build OK. Stylelint baseline: 2 pre-existing errors
(`ui/components/OtherHand/OtherHand.css:338,359`). No lockfile. `CanvasContainer.tsx`
(6157 lines) and `toolWidgets.ts` (407 lines) already exceed the containers `max-lines` warning.

### Brush document family (`client/src/`)
- `types/brush.ts` (337): `BrushChannelType` `:20`, `BRUSH_CHANNEL_TYPES` `:21-26`, `BRUSH_CHANNEL_BADGE` `:33-38`,
  `BrushDelta`/`BrushCell` `:42-44`, `BrushLayer { id, name, channelType, visible, appliedGroupId?, pixels }` `:49-56`,
  `clampDelta` `:76`, `createBrushLayer(id, name, w, h, channelType = "rgb")` `:138-152`, `isChannelType` `:225-230`,
  `normalizeLayer` `:255-273` (optional-key pattern for `appliedGroupId` `:269-271`), `normalizeBrushDocument` `:310-337`
  (**never reads `raw.version`**). Test `types/__tests__/brush.test.ts` (barrel import `:1-25`; pins at `:141, :272, :279, :322, :396`).
- **Files that build `BrushLayer` literals and must keep compiling** (why D1 is optional):
  `stores/ui/__tests__/BrushUIStore.test.ts:39-40`, `stores/domain/__tests__/BrushPixelStore.test.ts:48`,
  `containers/pixelBrush/__tests__/usePixelBrush.dom.test.ts:48-64`, `containers/__tests__/pixelBrushTool.dom.test.tsx:62-65`,
  `containers/brush/__tests__/brushSelection.test.ts:356`, `containers/brush/__tests__/brushToolContext.test.ts:1054`.
- `stores/domain/BrushStructureStore.ts` (638): `cloneCell` `:78`, `resizeGrid` (crop/pad, **not** a resampler) `:91`,
  `mapFrames/mapLayers/mapLayer` `:107-132`, `withoutAppliedGroup` `:134-138`, `commit(label, mutate, bumpPixels)` `:174-195`,
  `layerIndexOf` `:197-201`, `addLayer` `:365-395`, `duplicateLayer` `:486-510`, `setLayerChannelType` `:512-529`,
  `setLayerAppliedGroup` `:531-556`. History: `stores/history/brushCommands.ts:88-107` snapshot command holds the
  pre-mutation document **by reference** — never mutate a layer in place. Test `BrushStructureStore.test.ts`: rig `:88`,
  `addLayer` `:395-433`, `setLayerChannelType` `:615-645`, history table `:778-852`, no-document list `:910`.
- Server `server/src/routes/brush.ts:52-55, :107-126` — object check only, raw JSON written. **No server change.**
- Layer panel UI (`ui/components/BrushLayerPanel/`): `BrushLayerPanel.tsx` props `:28-47`, "+" `:73-89`, creation menu
  `:121-132`; `BrushChannelMenu.tsx` props `:58-86`, `showGroups` `:114`, `radio()` `:225-253`, sections `:256-341`,
  `ITEM_SELECTOR` `:91-93`, positioning deps `:137`; `BrushLayerRow.tsx` `BrushLayerRowModel` `:43-56`, badge `:158-178`,
  menu wiring `:286-307`; CSS `BrushLayerPanel.css` `:94-122, :224-251`; the only DOM test
  `__tests__/BrushChannelMenu.dom.test.tsx` (`:147` focus order, `:302` "+" payload). Containers:
  `BrushLayerPanelContainer.tsx` rows `:75-93`, callbacks `:103-130`; **second `addLayer` site** `BrushTimelineContainer.tsx:255-263`.

### Pixel-studio Brush tool (plan 12)
- `ui/canvas/tools/pixelBrushStamp.ts` (350): `PixelBrushCell` `:87-89`, `forEachPaintedCell` `:131-157`,
  `settlePixelBrushColor` `:218-268`, `resolvePixelBrushStamp` `:279-313`, `stampPixelBrushSegment` `:325-350`.
  `BrushSceneLayer` structural type `ui/canvas/render/renderBrushFrame.ts:56-61`. Sampler precedent
  `ui/canvas/tools/traceSampler.ts:54`. Test fixtures `__tests__/pixelBrushStamp.test.ts:28-63`.
- `ui/canvas/tools/toolHandlers.ts`: `ToolContext` `:83-131` (`pixelBrushStamp?` `:97-105`), `brush` handler `:293-317`.
  Test `__tests__/toolHandlers.test.ts` (`ctx` builder `:30-70`, `brush` `:78+`). `toolFootprint.ts` `pixelBrushOffsets?` `:82-87`, branch `:129-137`.
- `containers/pixelBrush/usePixelBrush.ts` (135, quoted in the task-12 context): reads `:96-101`, footprint memo `:103-113`,
  stamp memo `:116-128`. Test `__tests__/usePixelBrush.dom.test.ts` (`:138-157`, `:159+`, stability `:183`).
- `containers/CanvasContainer.tsx`: `getPixelColor` `:304-312`, `usePixelBrush` call `:642`, hover memo `:2289`,
  `editableGrid()` `:4348-4354`, `getToolContext` `:4382-4466` (`pixelBrushStamp` `:4403`; deps rule `:4443-4455`),
  `floodFillAt` `:4415-4427`, eyedropper read `:4812-4855`. `PixelData.color: Pixel | 0` (`types/domain.ts:18-22`).
- Rail: `ui/components/PixelStudioPanel/PixelStudioPanel.tsx` (463 raw / ~367 code lines): `PixelStudioBrushInfo` `:86-98`,
  gate `:214`, Brush section `:395-440`; CSS `:57-75` (size idiom), `:96-108, :235` (shape buttons), `:174-224` (brush);
  tests `__tests__/PixelStudioPanel.dom.test.tsx`. Container `PixelStudioPanelContainer.tsx:150-178`, `:205-211` (other-hand
  button), test `containers/__tests__/PixelStudioPanelContainer.dom.test.tsx:44-70, :96-190`.
- Other hand: `stores/ui/LayoutUIStore.ts:307, :526-546`; `containers/OtherHandRailContainer.tsx:46-65, :312-326`;
  `containers/otherHand/toolWidgets.ts` `TOOL_TITLES` `:24-41`, `planToolSection` `:58`, eraser slider `:176-196, :225-236`,
  toggle idiom `:306-321`, switch `:215-403` (**no `case "brush"`**); `ui/components/OtherHand/thumbWidgets.ts` `:26-77`;
  test `containers/__tests__/OtherHandRailContainer.dom.test.tsx:26-33, :60-76`.
- Primitives: `ui/primitives/Slider` (`:23-39`), `SliderWithNumber` (`:23-40`), `Dropdown<T>` (`:26-49`), `Toggle` (`:27-36`),
  `IconButton` (`:25-37`), `Icon`, `Button`, `NumberInput`. No lock/link icon is used anywhere yet (lucide ships `Link`, `Unlink`).
- Stores: `ToolUIStore.ts` non-persisted block `:156-180`; `UIStore.ts` constructor `:340-350`, `toPersistedUIState` `:590-640`
  (**do not touch**), persistence suites `stores/ui/__tests__/persistedUIState.test.ts`, `persistedUIVersion.test.ts`.

### Scaling prior art
**None.** No resampler exists client-side (`resizeGrid`, `resizeObject`, `resizeVariant` are crop/pad;
`frameEncoding.ts:267` is a canvas flag). Server `sharp` is a byte-frozen PNG encoder (`raster.ts`), Node-only — off-limits.
`ui/utils/colorMath.ts` exports only `hslToRgb` `:21` and `rgbToHsl` `:60`.

### Gate commands (confirmed on `main @ 9df1e72`)
Client: `cd client && bunx tsc --noEmit` · `bunx eslint .` · `bunx vitest run` · `bun run lint:boundaries` ·
`bunx stylelint "src/**/*.css"` · `bunx storybook build` (note: `storybook dev` cannot run here — no lockfile; use
`bunx storybook build && bunx vite preview --outDir storybook-static --port 6006`). Server: `cd server && bunx tsc --noEmit && bunx eslint . && bunx vitest run`.
Root: `bun run verify` (typecheck → lint → format:check → client test → build; it does **not** run stylelint,
`lint:boundaries` or server tests). Lanes: `*.test.ts` = node, `*.dom.test.tsx` = jsdom (`client/vitest.config.ts`).
ESLint: `max-lines` 400 code lines — **warn** everywhere, **error** under `src/ui/**`; `ui/` may not import stores/api/mobx/`useContext`;
`ui/primitives` may not import `types`. `max-lines`'s exemption list only ever shrinks.

## 5. Wave table

| Wave | Tasks | Parallel | Gate before next wave |
| --- | --- | --- | --- |
| W1 | 01 colour-source type · 07 kernels · 08 pixel-art scalers | 3 | client gate + `bun run format:check` (task 01 touches `types/`) |
| W2 | 02 structure store · 03 layer panel UI · 05 stamp target seed · 09 registry + pipeline | 4 | client gate + stylelint (no new errors) + `bunx storybook build` |
| W3 | 04 layer-panel containers · 06 canvas sampler wiring · 10 hq2x · 11 `PixelBrushUIStore` | 4 | client gate + corpus/snapshot check + **manual** (task 04, task 06) |
| W4 | 12 hook scaling · 13 rail section · 14 other-hand widgets | 3 | client gate + stylelint + storybook + **manual** (12, 13, 14) + lint-warning count ≤ 66 |
| W5 | 15 final gate, docs, QA | 1 | `bun run verify` + boundaries + stylelint + storybook + server + lockfile + corpus |

"client gate" = `cd client && bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run lint:boundaries`,
then from the repo root `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` prints nothing.

## 6. Dependency graph

```
01 type ──┬─► 02 store ──────┬─► 04 containers ───────────────────┐
          ├─► 03 panel UI ───┘                                    │
          └─► 05 stamp seed ──► 06 canvas wiring ──► 12 hook ─────┤
07 kernels ─┬─► 09 registry ──┬─► 10 hq2x ──────────────────────────┼─► 15 final
08 pixel-art┘                 ├─► 11 store ──┬─► 12 hook           │
                              │              ├─► 13 rail ──────────┤
                              │              └─► 14 other hand ────┘
                              └─► 13, 14 (options list)
```
01 none · 02 → 01 · 03 → 01 · 04 → 02, 03 · 05 → 01 · 06 → 05 · 07 none · 08 none · 09 → 07, 08 ·
10 → 09 · 11 → 09 · 12 → 06, 09, 11 · 13 → 09, 11 · 14 → 09, 11 · 15 → 04, 06, 10, 12, 13, 14.

## 7. Collision matrix

| Wave | Task | Touches |
| --- | --- | --- |
| W1 | 01 | `types/brush.ts`, `types/__tests__/brush.test.ts` |
| W1 | 07 | `ui/canvas/tools/pixelBrushScale/kernels.ts`, `…/__tests__/kernels.test.ts` (new) |
| W1 | 08 | `ui/canvas/tools/pixelBrushScale/pixelArt.ts`, `…/__tests__/pixelArt.test.ts` (new) |
| W2 | 02 | `stores/domain/BrushStructureStore.ts`, `stores/domain/__tests__/BrushStructureStore.test.ts` |
| W2 | 03 | `ui/components/BrushLayerPanel/*` (8 files) |
| W2 | 05 | `ui/canvas/tools/pixelBrushStamp.ts`, `…/__tests__/pixelBrushStamp.test.ts` |
| W2 | 09 | `ui/canvas/tools/pixelBrushScale/index.ts`, `…/__tests__/index.test.ts` (new) |
| W3 | 04 | `containers/BrushLayerPanelContainer.tsx`, `containers/BrushTimelineContainer.tsx`, `containers/__tests__/BrushLayerPanelContainer.dom.test.tsx` (new) |
| W3 | 06 | `ui/canvas/tools/toolHandlers.ts`, `…/__tests__/toolHandlers.test.ts`, `containers/CanvasContainer.tsx`, `containers/__tests__/pixelBrushTool.dom.test.tsx` |
| W3 | 10 | `ui/canvas/tools/pixelBrushScale/hqx.ts`, `hqxTable.ts`, `__tests__/hqx.test.ts` (new), `pixelBrushScale/index.ts`, `__tests__/index.test.ts` |
| W3 | 11 | `stores/ui/PixelBrushUIStore.ts`, `stores/ui/__tests__/PixelBrushUIStore.test.ts` (new), `stores/ui/UIStore.ts` |
| W4 | 12 | `containers/pixelBrush/usePixelBrush.ts`, `containers/pixelBrush/__tests__/usePixelBrush.dom.test.ts` |
| W4 | 13 | `ui/components/PixelStudioPanel/{PixelStudioBrushSection.tsx, .stories.tsx, __tests__/PixelStudioBrushSection.dom.test.tsx}` (new), `PixelStudioPanel.tsx`, `PixelStudioPanel.css`, `__tests__/PixelStudioPanel.dom.test.tsx`, `containers/PixelStudioPanelContainer.tsx`, `containers/__tests__/PixelStudioPanelContainer.dom.test.tsx` |
| W4 | 14 | `containers/otherHand/pixelBrushWidgets.ts` (new), `containers/otherHand/toolWidgets.ts`, `containers/__tests__/OtherHandRailContainer.dom.test.tsx` |

Every multi-task wave is pairwise disjoint (checked file by file). Task 10 edits `index.ts`
in W3 while 09 (its author) finished in W2 and no W3 task touches it. Task 12 (W4) edits
`usePixelBrush.ts` after 06 (W3) touched `CanvasContainer.tsx`; neither shares a file.

## 8. Alignment guide

- **Names.** Everything pixel-studio-side stays `pixelBrush*` / `PixelBrush*`; brush-studio
  document things stay `Brush*`. New folder `pixelBrushScale/`. Store `PixelBrushUIStore` at
  `ui.pixelBrush`. Commit prefixes in D16.
- **Analogues to imitate.** Enum field → `channelType`; optional key → `appliedGroupId`;
  undoable relabel → `setLayerChannelType`; menu rows → `radio()` in `BrushChannelMenu`;
  bound sampler → `floodFillAt` / `TraceSamplerFn`; non-persisted UI state → `ToolUIStore.colorTarget`;
  thumb widgets → the eraser case in `toolWidgets.ts`; pure numeric tests → `pixelBrushStamp.test.ts`
  (expected values hand-computed with the arithmetic inline).
- **Boundaries that must hold.** No grid crosses into `ui/`; `ui/` imports no store/api/mobx;
  `observer()` only in containers; grids read inside memos, never observed; pointer-rate values
  are never `getToolContext` deps; new grids are always new arrays with no shared tuples.
- **What "done" looks like.** Brush Studio: "+" → Colour source then Channel; rows show `RGB SEL`
  or `HSL TGT`. Pixel studio: a Target burn brush darkens paint and skips empty canvas, once per
  stroke; the rail's W/H sliders move together while locked, the marker grows, "EPX" gives a
  crisp 2× outline, "Lanczos 3" a soft one; Other Hand Mode has the same widgets.
- **Most likely mistakes.** Using `brushCellToRgba`/`deltaToByte` in operator or resampling
  code (halves the deltas). Averaging a painted cell with an unpainted one (coverage model
  exists to stop this). Sampling the target from a composited image instead of `editableGrid()`.
  Forgetting `touched.clear()` on press (compounding burns). Reading `app.ui.pixelBrush` in
  `CanvasContainer` instead of inside the hook. Adding the store to `toPersistedUIState`
  (changes 151 corpus digests). Letting `PixelStudioPanel.tsx` or a `pixelBrushScale` file cross
  400 code lines (an **error** under `src/ui/**`). Raising `toolWidgets.ts`'s warning count.
  Breaking the "+" test at `BrushChannelMenu.dom.test.tsx:302` by making the source pick close the menu.
  Testing `ThumbSlider` with pointer events in jsdom (use the keyboard).

## 9. Risk register

| # | Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- |
| R1 | Resampling holes: deltas bleed toward 0 at painted/unpainted borders, or holes fill in | High without the model | Brushes change shape when scaled | Coverage channel (D6) + the single-cell 2× test in task 07 | 07 |
| R2 | Bicubic/Lanczos overshoot leaves `> 255` or `−0` in a cell | Medium | Invalid deltas in stamps | `clampDelta` on every output; overshoot test | 07 |
| R3 | A wrong hq2x table entry draws garbage | High | Visible corruption for one strategy | Table as data + 8-transform symmetry test; **deferral rule** (nothing committed if it fails) | 10 |
| R4 | Burn compounds within one drag | High if forgotten | Unusable burn brush | Per-stroke `touched` set cleared on press; container test drags back and forth | 05, 06 |
| R5 | Per-write settle at pointer rate is slow for big scaled brushes | Medium | Lag on target brushes | Settle only target cells, once per cell per stroke; kernels run in the memo, not per event; manual lag check at 256×256 vs `main` | 06, 12 |
| R6 | `max-lines` error under `src/ui/**` | High for the panel and the scale folder | Gate fails | Extract `PixelStudioBrushSection`; split the scale folder by family; table as data | 07, 08, 10, 13 |
| R7 | `toolWidgets.ts` gains lint warnings (baseline 66) | Medium | W4 gate | New widgets in `pixelBrushWidgets.ts`; measure warning count before/after | 14 |
| R8 | Corpus digests change | Low | **Owner data safety rule** | Nothing persisted (D15); corpus/snapshot check in W3 and W5 | 11, 15 |
| R9 | Stamp reference instability at native size regresses stroke performance | Medium | Pointer-rate rebuild of `getToolContext` | Identity returns the same layer array; stability test kept | 09, 12 |
| R10 | Old brush files with no `colorSource` behave differently | Low | Silent change for the owner's brushes | Absent = `"selected"`; normaliser test; round-trip test | 01 |
| R11 | Manual/device checks skipped | High (no device in most sessions) | Plan reported complete when it is not | Every task lists its manual rows; task 15 consolidates; PARTIAL if any is skipped | all |

## 10. Rules for every executor

- **Bun only**; `bun add --exact`; never a lockfile — after any `bunx`, run
  `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` (must print nothing). Never pass a
  frozen-lockfile flag to any command (a hook blocks it; it is meaningless here).
- **Never `vitest -u`.** Corpus and migration snapshots must pass **unchanged**. This plan edits nothing under
  `types/codecs/`, `services/`, `stores/domain/` other than `BrushStructureStore.ts` (a brush-document module, not
  the project's), or `server/src/export/`. Corpus check: `git status --short | grep __snapshots__` prints nothing and
  `git diff --stat 9df1e72..HEAD -- client/src/types/codecs client/src/services server/src/export` is empty.
- **Never deep-observe a pixel grid.** `document` is `observable.ref`; read grids inside memos/callbacks.
- **`ui/` boundary**: nothing under `client/src/ui/` imports a store, the API or MobX; `observer()` only in `containers/`.
  Run `bun run lint:boundaries` — a rule matching nothing looks like a rule that passes.
- **Never break `bun run dev`.**
- **Stay inside `Touches`.** If you must touch another file, stop, record it in `HANDOFF.md` Deviations, and say so in
  the report — the collision matrix is only valid if `Touches` is accurate.
- **One branch for the plan** (`feat/13-brush-source-and-resize`), one commit per task, merged `--no-ff` to `main` only
  when the W5 gate exits 0.
- **Run the gate and paste the real output.** Counts, not adjectives.
- **Do the manual checks** and list each one with what you observed. A task whose manual checks were skipped is
  **PARTIAL**, not done. Report partial completion honestly.

## 11. Consolidated manual QA (task 15 fills the status column)

| # | Where | Check |
| --- | --- | --- |
| 1 | Brush Studio | "+" shows Colour source above Channels; picking a source keeps the menu open; picking a channel creates and closes; the new row shows the chosen badge |
| 2 | Brush Studio | Row badge menu changes `SEL`↔`TGT`; ⌘Z reverts; timeline add-layer inherits the selected layer's source |
| 3 | Pixel studio | HSL L −60 Target brush darkens paint, skips empty canvas; back-and-forth in one stroke darkens once; second stroke compounds; ⌘Z one step |
| 4 | Pixel studio | Reflection lines on: the mirrored side is burned too |
| 5 | Pixel studio | Mixed brush (target centre + selected ring) shows both behaviours in one press |
| 6 | Rail | W slider moves H at the native ratio; marker grows; lock → independent; re-lock captures the new ratio |
| 7 | Rail | EPX → both axes EPX, crisp 2× marker; unlocked Lanczos 3 on X with EPX on Y → Y becomes Nearest |
| 8 | Rail | "Native size" restores; loading a brush with other dimensions resets to its native size |
| 9 | Rail | Section fits the narrowest rail width; light and dark themes |
| 10 | Performance | A 64×64 brush at 256×256 with Lanczos 3: no visible lag on drag vs `main`; native size unchanged |
| 11 | Other hand (tablet) | Brush section shows Width, Ratio, Height, Scale, Size widgets; Width drags Height while Locked; `Free` releases; 12-button stack fits; positions persist |
| 12 | StrictMode | `bun run dev`: switching to the Brush tool calls `init()` once; no duplicate-reset warning on the native-size effect |

## 12. Task index

| NN | Title | Wave | Effort | Summary |
| --- | --- | --- | --- | --- |
| 01 | `BrushLayer.colorSource` type, factory, normaliser | W1 | S | Optional additive field + tables + helper; old files load unchanged |
| 02 | Structure store: create with a source, change it undoably | W2 | S | `addLayer(…, colorSource)`, `setLayerColorSource`, history table |
| 03 | Layer panel: colour source at creation and from the badge | W2 | M | Menu section, sticky tick, second badge, stories, DOM tests |
| 04 | Containers: rows + callbacks + timeline inheritance | W3 | S | Both `addLayer` sites, new container test |
| 05 | Stamp: target-seeded cells settled at write time | W2 | M | `PixelBrushTarget`, seed rule, per-stroke `touched`, fallback |
| 06 | Canvas wiring: sampler via `ToolContext` | W3 | M | Handler clears `touched`; container binds `editableGrid()`; burn proven end-to-end |
| 07 | Separable kernels | W1 | L | 7 kernels, coverage channel, clamp, identity copy |
| 08 | Pixel-art scalers | W1 | M | EPX, Scale3x, Eagle, xBR; symmetry-verified |
| 09 | Registry + layer pipeline | W2 | S | 11 options, 2-D pass rule, identity returns the same array |
| 10 | hq2x | W3 | L | Table as data, symmetry test, explicit deferral rule |
| 11 | `PixelBrushUIStore` | W3 | M | Size, ratio lock, per-axis strategy; session-only |
| 12 | `usePixelBrush` scaling | W4 | S | Scale layers in a memo; native-change reset; `size` exposed |
| 13 | Rail brush section | W4 | M | Extracted component; sliders, lock, dropdowns, reset; stories + tests |
| 14 | Other-hand widgets | W4 | S | New widget file + `case "brush"`; keyboard-driven tests |
| 15 | Final gate, docs, QA | W5 | S | Full gate output, `ARCHITECTURE.md`, QA ledger |
