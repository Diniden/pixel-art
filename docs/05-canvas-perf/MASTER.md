# Canvas Rendering Performance for Large Editing Surfaces — MASTER plan

Planned 2026-08-30 against branch `feat/03-reflection-tool`, HEAD `5d76ce9`
("Checkpoint: Stable version before optimize"), working tree clean. Executed by
`/plan-go`, one fresh agent per task. **Read this file, `CLAUDE.md`, and your task file.
Nothing else is required; nothing else is assumed.**

---

## 1. Request

Verbatim:

> We need to work on performance for large editing surfaces:
>
> - Layers need to each be their own canvas
> - The background grid needs to be rendered as it's own DIV using CSS tricks for rendering
>   the grid.
> - When editing a layer, only the pixels affected should be redrawn (this will be supported
>   via the layering of canvas')
> - We do not want to be rendering every pixel across the entire canvas'
> - If there is anything preventing this type of optimization, let me know

Follow-up clarification, verbatim — **decisive, and it overrides the first analysis**:

> Let's write up this plan, but I want to clarify how zoom and canvas -should- work. We
> should be using transform based zoom and NOT canvas backing buffer resizing. The canvas'
> really need to stay at the small pixel data level for keeping our memory footprint TINY
> and redraws fully hardware backed. I don't really care about the gradient per pixel effect
> we have had up till now. Gridding effects should be handled with CSS border tricks to
> again maximize our hardware utilization and not raw compute.

### Interpretation

Four changes, in dependency order:

1. **Canvas backing stores go 1:1 with pixel data.** `canvasWidth` stops being
   `gridWidth * zoom` and becomes `gridWidth`. One sprite pixel = one canvas pixel.
2. **All scaling becomes one CSS transform.** `.canvas__layout` already carries
   `translate(...) scale(viewZoom)`; it becomes `scale(zoom * viewZoom)`. The GPU does the
   magnification, `image-rendering: pixelated` keeps it crisp.
3. **Each layer gets its own 1:1 canvas**, stacked in DOM order, composited by the browser.
   Per-layer dimming (`layerFocusMode`) becomes CSS `opacity` on the layer's canvas rather
   than a per-cell alpha multiply in JS.
4. **Only dirty cells are repainted.** `PixelStore.commitCells` already holds the exact
   `PixelPatch[]`; it publishes them, and the affected layer's canvas repaints just those
   cells instead of the whole grid.

The background checkerboard and grid lines leave `<canvas>` entirely and become a CSS DIV
behind the layer stack.

### Assumptions made where the request was ambiguous

| Ambiguity | Decision |
| --- | --- |
| "gradient per pixel effect" — what exactly is being given up? | The alpha-compositing differences between `renderScene.ts`'s buffer path and the live `fillRect` path, and the smooth checkerboard at high zoom. Under 1:1 canvases the browser composites layers; semi-transparent pixels blend via normal `source-over`. **Still needs a visual eyeball at W4** — the owner accepted the change in principle, not sight-unseen. |
| Do `zoom` and `viewZoom` merge into one field? | **No.** Both persist with their current ranges and meanings; only their *application* changes (CSS instead of backing store). Merging them would invalidate every saved `panOffset` — see Risk R1. |
| Is `zoom` still shared across panes and `viewZoom` still per-pane? | **Yes, unchanged.** They already multiply, so `scale(zoom * viewZoom)` preserves both invariants exactly. |
| Are the overlay canvases (hover, reflection, selection, origin cross) also 1:1? | **No — they move to inline SVG** inside the transformed layer, with `vector-effect: non-scaling-stroke`. See Locked decision D5; this is the single most important design call in the plan. |
| Is the lighting studio in scope? | **Out of scope for W1–W7**, with one exception: `useCanvasViewport` is shared, so its pan-clamp fix (task 02) lands for both. `LightingCanvasContainer` keeps its own `viewCellsX * zoom` sizing. Task 08 is the follow-on. |
| Does the reference-image panel follow? | **No.** `ReferenceImagePanel` builds its own `zoom`-scaled canvas outside the transform and keeps working unchanged. Same for `PreviewModal` and `ExportPreviewModal`. |
| Should a zoom control be reintroduced? | **Not in this plan.** Noted as a follow-on opportunity (§12). |

---

## 2. Outcome

When every wave is DONE:

1. Opening `Landscapes` (256×224) and drawing is smooth. One pencil dot repaints **one
   cell on one layer**, not 57,344 cells across every layer.
2. Zoom is a GPU transform. Changing zoom allocates nothing and repaints nothing.
3. Total canvas memory for a 7-layer Base Unit sprite is ~20 KB (was up to 7.3 MB *per
   canvas* at zoom 50); for Landscapes ~1.5 MB (was 546 MB per canvas — i.e. it could not
   be allocated at all).
4. **The zoom-50 crash on large sprites is gone.** Today `Landscapes` at zoom 50 asks for a
   12800×11200 backing store; that is already broken before this plan.
5. The checkerboard and grid are CSS on one DIV; no canvas, no cache, no blit.
6. Toggling layer visibility or focus mode is a CSS property change, not a full repaint.
7. Every existing project loads and renders identically — same pan, same zoom, same pixels.

---

## 3. Locked decisions

Made now so executors do not re-decide them mid-flight.

| # | Decision | Rationale |
| --- | --- | --- |
| **D1** | Canvas backing = **grid cells, not pixels**. `canvasWidth = editingVariant ? viewWidth : gridWidth`. | The whole point. Preserve the `editingVariant` conditional — dropping it breaks variant editing. |
| **D2** | The combined scale is **`zoom * viewZoom`**, applied on `.canvas__layout`. Neither store field changes its range, default, or persistence. | `panOffset` is persisted in post-transform CSS px against a content box of `gridWidth * zoom`. Keeping both fields multiplicative keeps that box the same size, so every saved `panOffset` stays valid with **zero migration**. |
| **D3** | Per-layer canvases are keyed by **`layer.id`**, rendered in array order (bottom→top), inside a `.canvas__layers` wrapper that sits **below** all overlays. | `Layer.id` is stable across reorder/add/delete (`types/domain.ts:25`), so React handles pooling. DOM order is already load-bearing z-order here. |
| **D4** | `layerFocusMode` dimming becomes **CSS `opacity` on the layer canvas** (`normal`→1, `transparent`→0.5, variant-other→0.7). | Removes the per-cell alpha multiply from the hot loop and makes it a compositor property. Constants keep the values in `renderScene.ts:76-80`. |
| **D5** | Chrome overlays that draw **sub-cell or screen-constant geometry** move to **inline SVG** with `vector-effect: non-scaling-stroke`: grid lines, brush outline, hover outline, lasso, marching ants, origin cross, reflection guides. | Measured: a viewport-sized raster overlay costs 24–113 MB and must repaint on every pan/zoom, defeating the hardware-transform goal; a scaled overlay costs 546 MB at Landscapes/zoom 50. SVG costs no raster memory, is GPU-composited, and `non-scaling-stroke` gives *exactly* the screen-constant stroke these painters already document as their intent. **Every one of these painters already separates pure geometry from stroking** — the geometry functions emit path data unchanged. |
| **D6** | Cell-fill overlays **stay on canvas at 1:1**: reference trace, frame onion-skin, frame trace, selection mask fill, drag preview, brush/hover *fills*. | These are cell fills, safe at zoom=1, and cheap. |
| **D7** | Dirty regions publish via a new **`pixelDirty` observable** on `DomainStore` alongside `pixelVersion`. It carries `{layerId, cells}` or `null` meaning "repaint everything". | `pixelVersion` must keep its exact current semantics — `AutoSaveController` observes it and the no-save-on-undo gate depends on it (`PixelStore.ts:587-605`). Adding a channel is safe; changing that one is not. |
| **D8** | The dirty channel **must publish on the undo/redo path too**, where `publishAndBump` returns early. | `applyPatch` (`PixelStore.ts:613-646`) publishes the tree but skips the bump during replay. A dirty region that skipped replay would leave undone pixels on screen. |
| **D9** | Onion mode dilates the dirty rect by **1 cell in each direction**. | `isOutlineCell` reads 4-neighbours (`CanvasContainer.tsx:278-291`), so a 1px edit changes its neighbours' outline status. |
| **D10** | `renderScene.ts` is **deleted**, not adopted. | It is dead code (`CanvasContainer.tsx:874`) and its buffer-compositing model is the opposite of the per-layer direction. Its `VARIANT_EDIT_*` constants move to `ui/theme/canvasTokens.ts`. |
| **D11** | The checkerboard DIV uses **CSS custom properties**, not the JS `BackgroundTheme`. `lightGridMode` becomes a class on the DIV. | `tokens.css` already defines `--bg-hover` / `--canvas-checker-b` per theme (`:213`, `:528`). `LIGHT_THEME`'s hardcoded `#c8c8c8/#cccccc/#eeeeee` (`canvasBackground.ts:82-88`) become three new tokens. |
| **D12** | `renderLightingPreview.ts` is **untouched**. Its `zoom` is an internally-computed fit-to-thumbnail scale for a fixed 200×200 canvas, not the view zoom. | Forcing 1:1 there would shrink every sprite to a dot. |

---

## 4. Ground truth (measured 2026-08-30)

### Real project data — `server/src/data/`

| Project | Grid | Frames | Max layers | Cells per full repaint |
| --- | --- | --- | --- | --- |
| Base Unit | 24×32 | 8–10 | 7 | ~5,376 |
| Plants | 64×64 | 4 | 3 | ~12,288 |
| **Landscapes** | **256×224** | 1 | 1 | **57,344** |

`CLAUDE.md`'s 300,249-cell figure is the whole-project total across all frames and layers,
**not** one repaint. `Landscapes` is the surface that motivates this work.

### Backing-store memory, today vs. after

Today, `canvasWidth = gridWidth * zoom`, and **there are six canvases all at that size**:

| Case | Per canvas today | ×6 canvases |
| --- | --- | --- |
| Base Unit @ zoom 8 | 0.2 MB | 1.2 MB |
| Base Unit @ zoom 50 | 7.3 MB | 44 MB |
| Plants @ zoom 50 | 39.1 MB | 235 MB |
| Landscapes @ zoom 8 | 14.0 MB | 84 MB |
| **Landscapes @ zoom 50** | **546.9 MB** | **3.2 GB — unallocatable** |

After (1:1): 3 KB per layer for Base Unit (7 layers = 20 KB), 224 KB per layer for
Landscapes (7 layers = 1.5 MB). Overlays that stay raster are also 1:1; the SVG overlays
cost no raster memory at all.

### The render path today

- `containers/CanvasContainer.tsx:882` — `render`, a ~1000-line `useCallback`.
- `ui/hooks/useCanvasRender.ts` — rAF-coalesces it; called at `CanvasContainer.tsx:1888`
  with deps `[render, pixelVersion]`.
- Every pixel edit bumps `pixelVersion` → full repaint: background blit, then nested
  `for y / for x` over every cell of every visible layer, building an
  `rgba(...)` **string per cell** and calling `fillRect`. Hot loops at
  `CanvasContainer.tsx:1033`, `1155`, `1252`; `ui/canvas/render/renderLayerView.ts:70-98`.

### Sizing and scale

- `ui/hooks/useCanvasGeometry.ts:149-150` — `canvasWidth = editingVariant ? viewWidth * zoom : gridWidth * zoom`.
- `stores/ui/ViewportUIStore.ts:135` — `zoom` clamped `[1, 50]`, default 10 (`types/constants.ts:34`).
- `stores/ui/ViewportUIStore.ts:144` — `viewZoom` clamped `[0.25, 4]`, tri-state `undefined`.
- Combined effective scale range: **0.25 – 200**.
- **No production code calls `viewport.setZoom`.** The Zoom stepper was removed 2026-08-28
  (`RightSidebarTopControls.tsx:24-30`). `zoom` is frozen at whatever the project file
  holds. This substantially de-risks the change: no live gesture can alter `zoom` mid-session.

### What already works in our favour — verify, do not rewrite

- **`ui/canvas/model/coords.ts` is already correct.** `screenToPixel` maps through
  `getBoundingClientRect()` *ratios*, never through `zoom`, and its header (`:9-15`) says
  this is deliberate *because a CSS transform is already applied*. `rect.width` picks up the
  combined scale automatically. Same for `LightingCanvasContainer.tsx:446-458`.
- **The transform wrapper exists.** `CanvasSurface.tsx:205-213` — `.canvas__layout` with
  `translate(...) scale(viewZoom)` and `transformOrigin: "0 0"`.
- **`image-rendering: pixelated`** is already on `.canvas__surface` and `.canvas__overlay`
  (`CanvasSurface.css:66-68, 85-86`). It becomes load-bearing rather than belt-and-braces.
- **The dirty data already exists.** `PixelStore.commitCells` (`:483-518`) receives
  `patches: readonly PixelPatch[]` with exact `{x, y, before, after}` and discards it at
  `publishAndBump()` (`:514`).
- **`layer.pixels` is `observable.ref`** and must stay so (R2 in `CLAUDE.md`).
- **The `ui/` boundary is clean and ESLint-enforced**; the painters under
  `ui/canvas/render/` are already pure.
- **`--z-behind: -1`** already exists in `tokens.css:394`, documented for "decorative
  ::before / bg grids" — the exact slot for the background DIV.

### Per-painter audit — `ui/canvas/render/` (12 modules)

| Module | Verdict |
| --- | --- |
| `renderScene.ts` | Safe at 1:1 — but **delete** (D10) |
| `renderLayerView.ts` | Safe at 1:1 |
| `renderFrameOverlay.ts` | Safe at 1:1 |
| `renderNormalEdit.ts` | Safe — `floor(y/zoom)` collapses to identity |
| `renderLitComposite.ts` | Safe — same inverse-mapping collapse |
| `canvasBackground.ts` | **Split**: `paintCheckerboard` safe; `strokeGrid`/`gridLinePath` → CSS |
| `renderBrushOverlay.ts` | **Split**: `paintBrushCells` safe; `strokeBrushOutlines` → SVG |
| `renderHoverMarker.ts` | **Split**: `paintHoverCells` safe; `strokeHoverOutline` → SVG |
| `renderSelectionOverlay.ts` | **Split**: fills safe; `drawLasso`/`drawMarchingAnts` → SVG |
| `renderOriginCross.ts` | **→ SVG.** Worst case: `ORIGIN_CROSS_SIZE = 12` is documented as screen-constant |
| `renderReflectionLines.ts` | **→ SVG.** `REFLECTION_DASH = 4` documented as screen-constant |
| `renderLightingPreview.ts` | **Untouched** (D12) |

Why the split painters break at 1:1, concretely:

- `strokeGrid`: lines at `x*zoom + 0.5`. At zoom=1 that is one line per pixel column — the
  grid becomes a **flat wash of `gridStroke` over the entire canvas**.
- `strokeBrushOutlines`: `width: zoom - 1` → **`strokeRect(x, y, 0, 0)`**.
- `strokeHoverOutline`: `right = left + zoom - 1` → every edge is a **zero-length segment**,
  which with `lineCap: "butt"` renders **nothing**. Silent failure — no error, no artifact.
- `drawMarchingAnts`: inner rect inset by 1 device px = one whole cell; `width - 2` inverts
  for any selection under 3 cells. The `[4,4]` dash spans four cells.
- `drawOriginCross` / `drawReflectionLines`: sizes are constants in *backing* px, which
  equal screen px today. Under CSS scale they multiply — a 4px dash at zoom 20 becomes 80px.

`vector-effect: non-scaling-stroke` gives these exactly the invariant their comments already
claim. Each already exposes pure geometry (`gridLinePath`, `brushCellOutlines`,
`markerPerimeter`, `lassoPath`, `marchingAntsRects`, `originCrossGeometry`,
`reflectionSegments`) separate from the stroking — that seam is what makes D5 cheap.

### Gate commands — all verified to run on 2026-08-30

```
bun run --cwd client typecheck    # exit 0
cd client && bunx vitest run      # 123 files, 2128 tests, all pass, ~72s
bun run --cwd client lint
bun run --cwd client lint:css
bun run --cwd client lint:boundaries
bun run --cwd client build-storybook
```

⚠️ `bunx` can create a lockfile as a side effect. After any `bunx`, run
`find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` and delete anything it finds.
Verified clean after the baseline run.

---

## 5. Wave table

| Wave | Tasks | Agents | Gate (must exit 0 before next wave) |
| --- | --- | --- | --- |
| W1 | 01 | 1 | `typecheck` + `vitest run` + `lint:boundaries` |
| W2 | 02, 03 | 2 | `typecheck` + `vitest run` + `lint` + `lint:css` |
| W3 | 04 | 1 | `typecheck` + `vitest run` + **manual visual pass** |
| W4 | 05 | 1 | `typecheck` + `vitest run` + **manual visual pass** |
| W5 | 06 | 1 | `typecheck` + `vitest run` + `lint:css` + **manual visual pass** |
| W6 | 07 | 1 | `typecheck` + `vitest run` + **manual perf measurement** |
| W7 | 08 | 1 | `typecheck` + `vitest run` + full `verify` |

Only W2 is parallel. That is honest: this is a sequential refactor of one render path, and
manufacturing more parallelism would guarantee collisions.

---

## 6. Dependency graph

```
01 (dirty-region channel, store)
 │
 ├─────────────┬──────────────┐
 │             │              │
02 (geometry   03 (SVG        │     ← W2, disjoint, parallel
    + transform)   overlay
 │                 primitives)
 │             │
 └──────┬──────┘
        │
       04 (CanvasSurface: layer stack + SVG mount)
        │
       05 (CanvasContainer: per-layer render)
        │
       06 (background/grid → CSS DIV)
        │
       07 (incremental redraw from dirty regions)
        │
       08 (lighting studio follow-on)
```

| Task | Depends on |
| --- | --- |
| 01 | none |
| 02 | 01 |
| 03 | 01 |
| 04 | 02, 03 |
| 05 | 04 |
| 06 | 05 |
| 07 | 05 |
| 08 | 07 |

---

## 7. Collision matrix

Only W2 has two tasks. Their `Touches` sets:

| Task 02 | Task 03 |
| --- | --- |
| `client/src/ui/hooks/useCanvasGeometry.ts` | `client/src/ui/canvas/svg/gridOverlay.ts` (new) |
| `client/src/ui/hooks/useCanvasViewport.ts` | `client/src/ui/canvas/svg/chromeOverlay.ts` (new) |
| `client/src/ui/hooks/__tests__/useCanvasViewport.dom.test.ts` | `client/src/ui/canvas/svg/__tests__/` (new) |
| `client/src/ui/components/CanvasSurface/CanvasSurface.tsx` | |
| `client/src/ui/components/CanvasSurface/CanvasSurface.stories.tsx` | |

**Disjoint.** Task 03 creates a new `ui/canvas/svg/` directory and touches nothing existing.
Task 02 does not create or read anything under that directory — task 04 is what first
imports task 03's output.

---

## 8. Alignment guide

**Naming to hold across contexts.**

- `cellWidth` / `cellHeight` — the new 1:1 backing dimensions (grid cells). Do **not** keep
  calling them `canvasWidth`/`canvasHeight`; the rename is what stops a stale `* zoom` from
  surviving unnoticed.
- `contentWidth` / `contentHeight` — the on-screen CSS size, `cellWidth * zoom * viewZoom`.
  This is what pan clamping and centring use.
- `combinedScale` — `zoom * viewZoom`. Compute once, in one place.
- `pixelDirty` — the D7 observable. `PixelDirtyRegion = { layerId: string; cells: readonly {x, y}[] } | null`.

**Analogues to imitate.**

- For a new pure `ui/canvas/` module: `ui/canvas/render/renderLayerView.ts` — header
  explaining *why*, pure function, cells opaque via `getPixelColor`.
- For a new store observable: `DomainStore.pixelVersion` (`:199`, `:232`, `:266`).
- For a container wiring stores to `ui/`: `CanvasContainer`'s existing `useCanvasRender` call.
- For inline SVG in `ui/`: `ui/components/AnchorGrid/AnchorGrid.tsx:155-180`.

**Boundaries that must not be crossed.**

- Nothing under `client/src/ui/` imports a store, the API, or MobX. `observer()` only in
  `containers/`. Run `bun run --cwd client lint:boundaries`.
- **No pixel grid crosses into `ui/` as a prop.** `CanvasSurface` takes refs and callbacks,
  never `layers` or `pixels`. Its header (`:39-47`) says why; the per-layer work must not
  break it — pass a `layerIds: string[]` plus a ref-registration callback, not layer objects.
- `layer.pixels` stays `observable.ref`. Never `observable`.

**What "done" looks like.**

Open `Landscapes`, draw a stroke. It is fluid. Zoom to 50 — no stall, no crash, memory flat
in the profiler. The checkerboard and grid look as they do today. Undo restores exactly.

**What an executor is most likely to get wrong.**

1. Dropping the `editingVariant ? viewWidth : gridWidth` conditional (D1). Breaks variants.
2. Fixing `canvasWidth * viewZoom` at `CanvasContainer.tsx:2457`/`2885` but missing
   `useCanvasViewport.ts:339-340`, or vice versa. All three must become `contentWidth`.
3. Forgetting `handleResetView`'s comment *"At view zoom 1 the content is exactly
   canvasWidth × canvasHeight"* (`CanvasContainer.tsx:3010`) — that assumption is exactly
   what breaks. Centring must use `cellWidth * zoom`.
4. Publishing the dirty region only in `commitCells` and not in `applyPatch` (D8) — undo
   leaves stale pixels.
5. Assuming `image-rendering: pixelated` is decorative. It is now the only thing between a
   1:1 canvas and a blurry mess at 50×.
6. Leaving `zoom` in `bgCacheKey` (`useCanvasGeometry.ts:157-161`) — harmless but thrashes
   the cache on every zoom step.
7. Touching `renderLightingPreview.ts` (D12).

---

## 9. Risk register

| # | Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- |
| **R1** | Renormalising `zoom` or merging it with `viewZoom` invalidates every saved `panOffset`; sprites load off-screen. There is **no migration hook for `zoom`** — `ViewportUIStore.ts:230` hydrates it straight in. | Low (D2 forbids it) | **Severe — corrupts the view state of real projects** | D2: both fields keep range, default and persistence; only application changes. Task 02 asserts a saved `panOffset` still centres identically. | 02 |
| **R2** | Screen-constant decorations (origin cross 12px, reflection dash 4px, marching-ants period) scale up with `zoom` and become enormous. | **Certain if unhandled** | High — unusable chrome | D5: SVG + `vector-effect: non-scaling-stroke`. | 03, 04 |
| **R3** | Sub-cell stroke painters degenerate silently at 1:1 — `strokeHoverOutline` renders *nothing*, no error. | **Certain if unhandled** | High, and hard to notice in review | D5 moves every one to SVG. Task 04's manual checks name each overlay explicitly. | 03, 04 |
| **R4** | Alpha compositing changes visibly (owner accepted in principle, not sight-unseen). | Medium | Medium — visual regression on real art | W4 gate requires a side-by-side visual pass on a variant-edit sprite in all three `layerFocusMode` values before the wave closes. | 05 |
| **R5** | Corpus snapshots change. Task 01 touches `stores/domain/`. | Low | **Severe — owner's real data** | Task 01 changes only the *notification* path, never serialization. Gate runs the full suite; snapshots must pass **unchanged**. `vitest -u` is forbidden and hook-blocked. | 01 |
| **R6** | Dirty-region tracking misses a write path (fill, shape, paste, move, variant edit) leaving stale pixels. | Medium | Medium — visible corruption until next full repaint | D7's region is nullable: `null` = "repaint everything". Every path not explicitly handled publishes `null` and stays correct-but-slow. Task 07 enumerates the paths. | 07 |
| **R7** | `LightingCanvasContainer` keeps `viewCellsX * zoom` while the main canvas goes 1:1, so `zoom` means two things at once. | **Certain, by design, until task 08** | Medium — lighting studio keeps today's memory profile | Accepted and scoped. Task 08 closes it. Task 02 must not "helpfully" change lighting sizing. | 08 |
| **R8** | The layer canvas stack breaks the "no pixel grid crosses the `ui/` boundary" rule. | Medium | Medium — architectural regression, ESLint may not catch a *prop* | Task 04 passes `layerIds` + a ref-registration callback, never layer objects. `lint:boundaries` in the gate. | 04 |
| **R9** | `bunx` silently recreates a lockfile. | Medium | Medium — violates standing owner policy | Every task's Verification ends with the `find` check. | all |

---

## 10. Rules for every executor

From `CLAUDE.md`, the ones that bite here:

- **Bun only.** `node`/`npm` are not on PATH. Never `--frozen-lockfile`.
- **Never create a lockfile.** Check after every `bunx`.
- **Never run `vitest -u`** on migration or corpus suites. A hook blocks it; that is a
  backstop, not permission to stop thinking.
- **Never deep-observe a pixel grid.** `layer.pixels` is `observable.ref`, always.
- **The `ui/` boundary**: no store/API/MobX under `ui/`; `observer()` only in `containers/`.
- **Anything touching `stores/domain/`** must confirm corpus snapshots pass **unchanged**.
- **Never break `bun run dev`.**
- **Commit at task granularity.**

And for this plan specifically:

- **Stay inside your `Touches` list.** The collision matrix is only valid if it is accurate.
- **Do the manual checks.** This is a *visual* refactor. Typecheck and unit tests cannot see
  a grid that renders as a grey wash or a hover outline that vanished. A task whose manual
  checks were skipped is **not done**.
- **Report honestly, including partial completion.** Six of eight steps with reasons stated
  beats a claim of success.
- **Paste real gate output.** "It passes" is not a report.

---

## 11. Task index

| NN | Title | Wave | Effort | Summary |
| --- | --- | --- | --- | --- |
| 01 | Dirty-region channel on the domain store | W1 | M | Publish the `PixelPatch[]` that `commitCells` already has, on both the write and replay paths. |
| 02 | 1:1 geometry and the combined CSS transform | W2 | L | `cellWidth`/`cellHeight`, `scale(zoom * viewZoom)`, and every pan/clamp/centre site that assumed scaled backing. |
| 03 | SVG overlay primitives | W2 | M | New `ui/canvas/svg/` emitting path data from the existing pure geometry functions, with `non-scaling-stroke`. |
| 04 | CanvasSurface: per-layer canvas stack + SVG mount | W3 | L | Layer canvases keyed by `layer.id` below the overlays; SVG chrome above; two size props. |
| 05 | CanvasContainer: per-layer rendering | W4 | L | Split the ~1000-line `render` into per-layer painters; dimming becomes CSS opacity. |
| 06 | Background and grid → CSS DIV | W5 | M | Delete the two offscreen caches; `repeating-linear-gradient` checkerboard + grid on one DIV. |
| 07 | Incremental redraw from dirty regions | W6 | L | Consume task 01's channel; repaint only dirty cells on the affected layer. |
| 08 | Lighting studio follow-on | W7 | M | Bring `LightingCanvasContainer` onto the same model, closing R7. |

---

## 12. Follow-on opportunities (not in this plan)

- **Reintroduce a zoom control.** With scaling free, `zoom` could become a live slider.
  Removed 2026-08-28 when it was expensive; that reason is gone.
- **`OffscreenCanvas` + worker** for the initial full paint of very large grids.
- **Raise the zoom ceiling** past 50 — the constraint that motivated it disappears.
