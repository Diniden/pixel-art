# Component & File-Size Audit

**Task:** P1-03 · **Measured:** 2026-08-16 · **Scope:** `client/src`, `server/src` (read-only)

## Summary

**46 source files exceed 250 lines** (31,635 total lines across `client/src` + `server/src`).
Line count is the symptom; the measured causes are four:

1. **No viewport abstraction.** The pan/zoom/pinch/wheel engine is written **three times**
   (`Canvas.tsx`, `LightingCanvas.tsx`, `ReferenceImageModal.tsx`). `clampPanToViewport` is
   **byte-identical** between Canvas.tsx:212-232 and LightingCanvas.tsx:132-152 except for one
   ref name; the 62-line wheel handler differs by 27 diff-lines, all cosmetic.
2. **No composition/render primitives.** The checkerboard is implemented **4×**, the pixel-blit
   loop ~8×, alpha-compositing 5× (including two functions literally named `alphaBlend`).
3. **No UI primitives.** There is **no** `Button`, `Modal`, `Slider`, `Tooltip`, or `primitives/`
   directory anywhere (`find client/src -type d \( -name ui -o -name primitives -o -name common
   -o -name shared \)` → empty; the only shared component is `Icon/Icon.tsx`). Inline instead:
   197 raw `<button>`, 27 `<input type="range">`, 21 `<input type="number">`, 142 `title=`
   attributes, and **14 distinct modal backdrop class names** for one concept.
   Only **2 of 14 modals** handle Escape and **0 of 14** trap focus.
4. **Store coupling as a size multiplier.** `Canvas.tsx` destructures **48 store members in a
   single `useEditorStore()` call** (Canvas.tsx:101-149). Nothing in it is Storybook-able today.

**The single most important finding for wave planning:**

> **`bun run build` currently FAILS.** `bunx tsc -b` reports **56 errors** in `client`
> (19×TS6133 unused, 9 real type errors incl. 5×TS2322 array-rank bugs in `AIInterpolateModal.tsx`).
> `bunx vite build` alone exits **0** because esbuild strips types without checking — so the app
> ships despite a red typechecker. `server` is clean (`bunx tsc --noEmit` exits 0).
> **There is no green baseline to refactor against.** Fixing this is a prerequisite work item
> (W0), not a nice-to-have: without it, "did my refactor break the types?" is unanswerable.

Rough duplication recoverable: **~590 lines** in `FrameTimeline/`, **~440 lines** across the
Canvas pair + floating panels, **~350 lines** across the modal shells. Total **~1,400 lines**
deletable by extraction alone, before any behavioral change.

---

## Size census

Every `.ts`/`.tsx` in `client/src` + `server/src` over 250 lines. Hooks columns are raw call
counts (`useState`/`useEffect`/`useRef`/`useCallback`/`useMemo`). "Store" = `useEditorStore`
references. JSX depth is max nesting inside the returned tree.

| File | Lines | Exports | Hooks (St/Ef/Rf/Cb/Mm) | Store | JSX | Responsibilities | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `components/Canvas/Canvas.tsx` | 3062 | 1 | 16/9/17/12/0 | 48 members | 8 | **11** | **SPLIT — flagship.** See seam plan below |
| `store/variantActions.ts` | 1412 | 1 | – | – | – | 20 actions, 4 domains | **SPLIT** into 4 files by domain |
| `components/AIInterpolateModal/AIInterpolateModal.tsx` | 1252 | 1 | 14/7/8/5/12 | 4 | 15 | **7** (3 dup renderers, step-machine, job polling, 182-line accept) | **SPLIT** |
| `types/index.ts` | 1086 | 57 | – | – | – | **3** (types, factories, serializers) | **SPLIT** at line 519 — clean seam |
| `store/lightingActions.ts` | 1036 | 1 | – | – | – | 15 actions; 3 are 130-270 lines | **SPLIT** into 3 files |
| `components/Canvas/LightingCanvas.tsx` | 937 | 1 | 9/10/10/10/0 | 13 | 8 | **6** (+ floating panel clone) | **SPLIT** — shares 330 lines w/ Canvas |
| `server/src/routes/export.ts` | 927 | 2 real | – | – | – | **6** (types, compaction, PNG, codegen) | **SPLIT** — 93-line codegen template |
| `components/ReferenceImageModal/ReferenceImageModal.tsx` | 869 | 11 | 10/4/6/3/0 | 3 | 10 | **5** + module-level mutable state | **SPLIT** — arch. smell, see below |
| `store/layerClipboardActions.ts` | 837 | 1 | – | – | – | 3 actions (143/406/288 lines) | **SPLIT** — 3 giant actions |
| `components/FrameTimeline/TimelineView.tsx` | 836 | 1 | 5/2/2/10/4 | 2 | 14 | **6** (grid, colors, DnD, kbd, thumbs) | **SPLIT** |
| `store/layerActions.ts` | 763 | 1 | – | – | – | 15 actions; 4 squash variants | **SPLIT** — squash family dedupe |
| `components/FrameTimeline/FramesView.tsx` | 684 | 2 | 10/1/4/13/0 | 2 | 8 | **5** (+91-line memo comparator) | **SPLIT** |
| `components/ColorPicker/ColorPicker.tsx` | 673 | 1 | 5/5/5/6/0 | 2 | 9 | **4** (HSL math, 2 canvases, history) | **SPLIT** — extract color math |
| `store/selectionActions.ts` | 651 | 1 | – | – | – | 11 actions, cohesive | **KEEP** — split only if >800 |
| `components/ObjectLibrary/ObjectLibrary.tsx` | 643 | 1 | 15/1/2/2/0 | 2 | 14 | **5** (15 useState = 5 dialogs inline) | **SPLIT** — extract dialogs |
| `components/FrameTimeline/VariantView.tsx` | 617 | 1 | 11/1/5/12/0 | 2 | 12 | **5** (~200 lines dup vs *itself*) | **SPLIT** |
| `components/Canvas/drawingUtils.ts` | 546 | 7 | – | – | – | 7 pure fns, cohesive | **KEEP** — already correct shape |
| `components/ExportPreviewModal/ExportPreviewModal.tsx` | 537 | 1 | 5/6/5/2/1 | 0 | 10 | 3 | **REVIEW** |
| `utils/edgeInterpolate.ts` | 506 | 1 | – | – | – | 1 algorithm | **KEEP** |
| `components/LayerPanel/LayerPanel.tsx` | 501 | 1 | 7/1/0/0/0 | 2 | **18** | 4 | **SPLIT** — deepest JSX in codebase |
| `store/toolActions.ts` | 494 | 1 | – | – | – | ~20 small setters | **KEEP** |
| `utils/lightingRenderer.ts` | 481 | 5 | – | – | – | 2 (+ dup `alphaBlend`) | **REVIEW** — dedupe alphaBlend |
| `components/FrameReferencePanel/FrameReferencePanel.tsx` | 477 | 1 | 6/7/2/2/0 | 2 | 11 | 3 (+ floating-panel clone #2) | **SPLIT** — extract `useFloatingPanel` |
| `components/PreviewModal/PreviewModal.tsx` | 473 | 1 | 5/4/3/2/0 | 0 | 8 | 3 | **REVIEW** |
| `store/storeTypes.ts` | 453 | 11 | – | – | – | type decls only | **KEEP** |
| `store/colorAdjustmentActions.ts` | 442 | 1 | – | – | – | cohesive | **KEEP** |
| `server/src/backup.ts` | 441 | 10 | – | – | – | 2 (rotation, gzip io) | **KEEP** |
| `components/ReferenceImagePanel/ReferenceImagePanel.tsx` | 434 | 1 | 4/5/2/2/0 | 2 | 11 | 3 (+ floating-panel clone #3) | **SPLIT** — same hook as above |
| `services/api.ts` | 427 | 12 | – | – | – | typed fetch layer | **KEEP** — matches locked API decision |
| `components/RightSidebarTopControls/RightSidebarTopControls.tsx` | 403 | 1 | 0/0/0/0/0 | 2 | 14 | 1 (pure-ish, deep JSX) | **REVIEW** — good primitive candidate |
| `utils/previewRenderer.ts` | 396 | 4 | – | – | – | 4 render fns | **KEEP** — should absorb more callers |
| `store/drawingActions.ts` | 377 | 1 | – | – | – | cohesive | **KEEP** |
| `server/src/routes/project.ts` | 361 | 1 | – | – | – | CRUD routes | **KEEP** |
| `store/frameActions.ts` | 341 | 1 | – | – | – | cohesive | **KEEP** |
| `components/Header/Header.tsx` | 319 | 1 | 14/5/2/1/0 | 2 | 11 | 4 (14 useState) | **SPLIT** — extract AI-config popover |
| `store/timelineActions.ts` | 317 | 1 | – | – | – | cohesive | **KEEP** |
| `components/Toolbar/LightingStudioTools.tsx` | 308 | 1 | 2/0/0/0/0 | 2 | 7 | 2 | **KEEP** |
| `components/HeightMapModal/HeightMapModal.tsx` | 300 | 1 | 3/1/1/0/0 | 2 | 8 | 2 | **KEEP** |
| `components/VariantSelectModal/VariantSelectModal.tsx` | 295 | 1 | 9/1/1/0/0 | 2 | 10 | 3 | **REVIEW** |
| `components/LayerColors/LayerColors.tsx` | 295 | 1 | 1/0/0/0/1 | 2 | 9 | 1 | **KEEP** |
| `server/src/routes/ai.ts` | 289 | 1 | – | – | – | proxy routes | **KEEP** |
| `components/AddVariantModal/AddVariantModal.tsx` | 283 | 1 | 6/1/1/0/0 | 2 | 12 | 3 | **REVIEW** |
| `components/LightingStudioPanel/LightControl.tsx` | 281 | 1 | 1/1/1/1/0 | 2 | 7 | 2 | **KEEP** |
| `components/FrameTagsModal/FrameTagsModal.tsx` | 266 | 3 | 1/1/0/0/2 | 6 | 12 | 2 | **KEEP** |
| `components/LightingStudioPanel/NormalPicker.tsx` | 261 | 1 | 1/3/2/2/0 | 2 | 5 | 2 | **KEEP** |
| `components/FrameTimeline/FrameTimeline.tsx` | 251 | 1 | 4/4/5/1/0 | 2 | 8 | 2 (playback owner) | **KEEP** |

**Verdict tally:** SPLIT 17 · REVIEW 6 · KEEP 23.

Census command (reproducible):

```sh
find client/src server/src -type f \( -name '*.ts' -o -name '*.tsx' \) \
  | xargs wc -l | sort -rn | awk '$1>250'
```

---

## Decomposition proposals

### 1. `components/Canvas/Canvas.tsx` (3,062 lines) — the flagship

The file is one function, `Canvas()`, spanning lines 29-3062. Everything below is derived from
reading it end to end; line ranges are exact.

**Fused responsibilities (11 distinct concerns in one component):**

| # | Concern | Lines | Size |
| --- | --- | --- | --- |
| 1 | Store binding — 48 members from one `useEditorStore()` | 101-149 | 49 |
| 2 | Grid/view geometry — variant-aware bounds, `canvasWidth/Height`, cache keys | 151-285 | 135 |
| 3 | Pan/zoom viewport — `viewPanOffset`, `scheduleCommitPan`, `clampPanToViewport`, `viewZoom`, pinch/anchor refs | 40-99, 178-232, 273-280 | ~120 |
| 4 | Coordinate mapping — `getPixelCoords`, `getOriginCoords` | 289-365 | 77 |
| 5 | Static-layer caching — `ensureBgCanvas` (checkerboard), `ensureGridCanvas` | 368-491 | 124 |
| 6 | **Main render** — layers, variants, preview, selection mask, lasso, marching ants, origin cross | 494-928 | **435** |
| 7 | Reference-image overlay render | 950-1020 | 71 |
| 8 | Frame overlay render (alpha-composited ImageData) | 1024-1290 | 267 |
| 9 | Frame-trace overlay render — **near-verbatim clone of #8** | 1297-1506 | 210 |
| 10 | Keyboard shortcuts — undo, delete, 12 tool hotkeys, WASD×3 modes, arrows, Escape, frame nav | 1575-1825 | 251 |
| 11 | Pointer interaction — mouse down/move/up + touch start/move/end + wheel | 1961-2990 | **1030** |

**Measured internal duplication inside this one file:**

- **#8 vs #9** (lines 1024-1290 vs 1297-1506): same structure — size overlay to canvas, build a
  temp canvas, zero an `ImageData`, walk layers, resolve the 4-level variant-offset fallback,
  blit, `putImageData`, draw at `globalAlpha`, stroke a dashed border. **~200 duplicated lines.**
  They differ only in compositing (#8 alpha-blends 1173-1196; #9 overwrites 1422-1431), opacity
  (0.4 vs 0.5), border color, and #9 honoring `frameOverlayOffset`.
- **The variant-offset fallback chain is repeated 5×** verbatim — lines 541-543, 663-665,
  1113-1117, 1390-1394, 1915-1918:
  ```ts
  l.variantOffsets?.[l.selectedVariantId ?? ""] ?? l.variantOffset ??
    variant.baseFrameOffsets?.[baseFrameIndex] ?? { x: 0, y: 0 }
  ```
  This is domain logic living in a view file; every copy is a place the rule can drift.
- **Reference-trace vs frame-trace stamping** — `handleMouseDown` 1984-2018 vs 2021-2054, and
  `handleMouseMove` 2301-2344 vs 2347-2390. Identical brush-stamp + line-segment + dedupe loops
  differing only in the sampler called. **~110 duplicated lines.**
- **Mouse vs touch drawing** — `handleMouseDown` 2187-2266 vs `handleTouchStart` 2741-2816, and
  `handleMouseMove` 2460-2547 vs `handleTouchMove` 2908-2970. The pixel/eraser/fill-square/
  flood-fill/gaussian bodies are copy-paste. **~180 duplicated lines**, and they have **already
  drifted**: `handleTouchStart`'s eraser path (2766-2772) omits the bounds `.filter()` that the
  mouse path applies (2217-2222) — a latent out-of-bounds write on touch.
- `getPixelCoords` (289-325) and `getOriginCoords` (328-365) repeat the same rect math with
  different snapping. **~30 lines.**

**Proposed structure:**

```
components/Canvas/
  Canvas.tsx                     — container: store binding + composition only (~150 lines)
  CanvasSurface.tsx              — PURE presentational: the 4 <canvas> stack + transform
                                   wrapper + cursor. Props only. STORYBOOK-ABLE.
  useCanvasViewport.ts           — HOOK: viewZoom/viewPanOffset/pinch/wheel/clamp/touch-gesture
                                   (shared with LightingCanvas — see Duplication cluster D1)
  useCanvasGeometry.ts           — HOOK: variant-aware view bounds, canvasWidth/Height, cacheKey
  useCanvasKeyboard.ts           — HOOK: the 251-line keydown handler (1575-1825)
  useCanvasPointer.ts            — HOOK: mouse+touch dispatch, delegating to toolHandlers
  useCanvasRender.ts             — HOOK: rAF scheduling + invalidation (1523-1562)
  tools/
    toolHandlers.ts              — PURE: Record<Tool, {onDown,onMove,onUp}> — one entry per
                                   tool, unifying the mouse/touch duplication. TESTABLE.
    brushStamp.ts                — PURE: segment + brush-shape + dedupe → pixel list. TESTABLE.
    traceSampler.ts              — PURE: reference/frame samplers behind one interface
  render/
    renderScene.ts               — PURE(ctx): layers + preview + variant chrome (494-928)
    renderSelectionOverlay.ts    — PURE(ctx): mask fill, drag preview, lasso, marching ants
    renderOriginCross.ts         — PURE(ctx): 854-890
    renderFrameOverlay.ts        — PURE(ctx): ONE parameterised impl replacing #8 AND #9
    canvasBackground.ts          — PURE: checkerboard + grid (shared, see D2)
  model/
    variantOffset.ts             — PURE: resolveVariantOffset() — the 5×-repeated fallback
    coords.ts                    — PURE: screenToPixel(), snapping modes (subsumes both)
```

**Pure extractions (no store, no side effects — the Storybook/test surface):**
`CanvasSurface.tsx`, all of `render/*` (take `ctx` + plain data), `tools/brushStamp.ts`,
`tools/traceSampler.ts`, `model/variantOffset.ts`, `model/coords.ts`.
`resolveVariantOffset` and `screenToPixel` are the highest-value unit-test targets in the
codebase — pure, total, and currently duplicated 5× and 3× respectively.

**Custom hooks:** `useCanvasViewport`, `useCanvasGeometry`, `useCanvasKeyboard`,
`useCanvasPointer`, `useCanvasRender`.

**Effort:** **L (multi-day).** Do not attempt as one commit — sequence it (see Recommended split order).
**Regression risk:** **HIGH.** This component is the entire editing surface; there are zero tests.

**Must-test-before-refactor** (write these characterization tests *first*):
1. `screenToPixel` — normal mode, variant mode with negative offsets, out-of-bounds → null,
   half-pixel snapping (`getOriginCoords` rounds to `.5`, line 348).
2. `resolveVariantOffset` — all 4 fallback levels in priority order.
3. `brushStamp` — size 1 vs >1, circle vs square, bounds filtering (**this is where the
   touch/mouse drift lives — assert both paths agree**), and segment dedupe via `getLinePixels`.
4. Golden-image render tests: render a fixture project to an offscreen canvas and hash the
   `ImageData` — one per mode (normal, variant-edit, selection active, lasso, frame overlay,
   trace overlay). These catch #8/#9 unification regressions cheaply.
5. Keyboard matrix: each of the 12 tool hotkeys, WASD under all three priority modes
   (reference-trace > frame-trace > variant, lines 1649-1699), arrows under all three
   `selectionBehavior` values, Escape's 3-level precedence (1741-1761).

**Sequencing (each step independently shippable and type-checkable):**

| Step | Extract | Lines moved | Risk |
| --- | --- | --- | --- |
| C1 | `model/coords.ts` + `model/variantOffset.ts` (pure, replace 5 call sites) | ~110 | low |
| C2 | `render/canvasBackground.ts` from `ensureBg/GridCanvas` | ~124 | low |
| C3 | Unify #8+#9 into one `render/renderFrameOverlay.ts` | ~480→~270 | med |
| C4 | `render/renderScene.ts` + `renderSelectionOverlay.ts` + `renderOriginCross.ts` | ~435 | med |
| C5 | `useCanvasViewport` (with LightingCanvas — D1) | ~120 | med |
| C6 | `useCanvasKeyboard` | ~251 | med |
| C7 | `tools/brushStamp.ts` + `tools/toolHandlers.ts`; collapse mouse/touch | ~1030→~400 | **high** |
| C8 | `CanvasSurface.tsx` + final container slimming | ~150 | low |

After C1-C8, `Canvas.tsx` lands at roughly **150 lines**.

---

### 2. `store/variantActions.ts` (1,412 lines)

**Fused responsibilities:** 20 actions across 4 domains — group lifecycle, variant CRUD,
offset/geometry, and variant-frame timeline. Largest: `makeVariant` (23-282, **259 lines**),
`resizeVariant` (526-658), `setVariantOffset` (659-775).
**Layering violation:** line 14 imports `getAnchorPadding` from
`../components/AnchorGrid/AnchorGrid` — the store depends on a **UI component**.

```
store/variant/
  variantGroupActions.ts    — makeVariant, deleteVariantGroup, renameVariantGroup, addVariantLayerFromExisting, removeVariantLayer
  variantCrudActions.ts     — addVariant, deleteVariant, selectVariant, renameVariant
  variantGeometryActions.ts — resizeVariant, setVariantOffset
  variantFrameActions.ts    — selectVariantFrame, advanceVariantFrames, add/delete/duplicate/move/reorderVariantFrame, add/removeVariantFrameTag
  variantHelpers.ts         — PURE: anchor padding, grid resize math (moved OUT of AnchorGrid)
```
**Pure extractions:** `variantHelpers.ts` (anchor/padding/resize math) — directly testable.
**Effort:** M · **Regression risk:** med.
**Must-test-before-refactor:** `makeVariant` round-trip on a 2-frame/3-layer fixture;
`resizeVariant` for all 9 anchor positions; `setVariantOffset` clamping.

---

### 3. `components/AIInterpolateModal/AIInterpolateModal.tsx` (1,252 lines)

**Fused responsibilities:** (a) three near-identical base64 renderers (`renderLayerToBase64` 38-66,
`renderFrameToBase64` 68-107, `renderVariantFrameToBase64` 109-147 — same canvas/ImageData/
alpha-composite scaffold, differing only in the source walk); (b) two inline sub-components
(`Base64Thumbnail` 190-210, `SyncedAnimatedPreview` 212-290); (c) a 6-state step machine (line 27);
(d) health-check polling (318-348); (e) 9 derived `useMemo`s (350-541); (f) `handleGenerate` job
submission + polling (543-679); (g) **`handleAccept` 681-862 — a 182-line commit routine**;
(h) hand-rolled backdrop click handling (863-874).
**This file also holds 5 of the 9 real type errors** (TS2345/TS2322 at 692, 720, 736, 785, 815 —
`PixelData[]` used where `PixelData[][]` is required, i.e. a real array-rank bug).

```
components/AIInterpolateModal/
  AIInterpolateModal.tsx        — container/step orchestration only (~200)
  steps/CheckingStep.tsx        — PURE, Storybook-able
  steps/UnavailableStep.tsx     — PURE
  steps/SelectLayerStep.tsx     — PURE
  steps/ConfigureStep.tsx       — PURE (keyframes + settings tabs)
  steps/GeneratingStep.tsx      — PURE (per-pair progress)
  steps/ReviewStep.tsx          — PURE
  parts/Base64Thumbnail.tsx     — PURE (from 190-210)
  parts/SyncedAnimatedPreview.tsx — PURE (from 212-290)
  useInterpolationJob.ts        — HOOK: submit + poll + pair-job state
  applyInterpolation.ts         — PURE-ish: the 182-line accept, store-injected. FIX TYPES HERE.
  frameEncoding.ts              — PURE: ONE parameterised encoder replacing all three (38-147)
```
**Pure extractions:** all 6 steps, both parts, `frameEncoding.ts`.
**Effort:** L · **Regression risk:** med-high (AI job flow is hard to test end-to-end).
**Must-test-before-refactor:** `frameEncoding` byte-equality against current output for a fixture
layer/frame/variant-frame; `applyInterpolation` on a fixture (**must fix the array-rank bug — write
the test to assert `pixels` is `PixelData[][]`**); mock the job API and assert the step transitions.

---

### 4. `types/index.ts` (1,086 lines) — cleanest seam in the codebase

**Fused responsibilities:** three, with an exact boundary. Lines **1-517** are domain types,
constants, and factories. Lines **519-1086** are the compact serialization format.

```
types/
  index.ts            — barrel re-export (back-compat; 35 files import from "../types")
  domain.ts           — 1-235: Pixel, Normal, PixelData, Layer, Frame, Variant, VariantGroup,
                        PixelObject, Color, Palette, Project, UIState, Tool, SelectionBox, Point
  constants.ts        — 236-292 + 344-459: DEFAULT_*, EMPTY_PIXEL_DATA, DEFAULT_UI_STATE, BASE_PALETTES
  factories.ts        — 293-343 + 460-484: createEmptyPixelGrid, createDefaultLayer/Frame/Object/Project, generateId
  codecs/pixel.ts     — 485-543: rgbaToHex, hexToRgba, normalToPacked, packedToNormal, pixelDataToCompact, compactToPixelData
  codecs/compactTypes.ts — 544-684: Compact* interfaces
  codecs/serialize.ts    — 685-772: layerToCompact, variantGroupsToCompact, projectToCompact
  codecs/deserialize.ts  — 773-1015: compactToLayer, compactToVariantGroups, compactToProject
  codecs/migrate.ts      — 843-866 + 1016-1086: migrateLayerVariantOffset, isCompactFormat,
                           isLegacyCompactFormat, migrateLegacyPixel, migrateLegacyLayer
```
**Pure extractions: all of it.** Every function here is pure — this is the single highest
value-per-hour test target in the repo. `projectToCompact`/`compactToProject` round-trip is one
property test that would protect the entire persistence layer.
Note `types/index.ts:967` holds a real type error (TS2339: `lightGridMode` missing from `CompactUIState`)
— a **genuine round-trip data-loss bug**: the field is written but not declared, so it does not survive
save/load. Fix while splitting.
**Effort:** S-M (mechanical; barrel keeps all 35 importers working) · **Risk:** low.
**Must-test-before-refactor:** `compactToProject(projectToCompact(p))` deep-equals `p` for a
fixture with variants, tags, and legacy layers; `isLegacyCompactFormat` + `migrateLegacyLayer`
against a real file from `server/src/data/backups/`.

---

### 5. `store/lightingActions.ts` (1,036 lines)

**Fused responsibilities:** 15 actions, but three are huge algorithms:
`computeNormalsForAllFrames` (485-621, **136 lines**), `setHeightPixels` (622-755),
`flipHorizontal`/`flipVertical` (756-1035, **280 lines, mirror-image copies of each other**).
The small setters (11-131) are trivial UI-state writes.

```
store/lighting/
  lightingSettingsActions.ts — 11-131: studio mode, edit mode, light dir/color, ambient, brush, scale
  normalActions.ts           — 132-484: setNormalPixel(s), setNormalPixelsForAllFrames
  heightActions.ts           — 622-755: setHeightPixels
  flipActions.ts             — 756-1035: flipHorizontal/flipVertical via ONE shared `flipAxis(axis)`
  normalCompute.ts           — PURE: the 485-621 normal-from-height algorithm. TESTABLE.
```
**Pure extractions:** `normalCompute.ts`, and the unified `flipAxis` core (~140 lines saved).
**Effort:** M · **Risk:** med. **Must-test:** normals for a known height field; flip on an
asymmetric fixture (assert H+H = identity, and that H and V agree modulo transpose).

---

### 6. `components/Canvas/LightingCanvas.tsx` (937 lines)

**Fused responsibilities:** (a) viewport pan/zoom — **duplicate of Canvas.tsx** (see D1);
(b) three renderers (`renderPreview` 214-286, `renderEdit` 287-343, `renderBrushOverlay` 344-368);
(c) normal/height painting (588-662); (d) keyboard (665-710); (e) **a draggable floating preview
panel, 713-835 — a clone of `FrameReferencePanel` and `ReferenceImagePanel`** (see D3).

```
components/Canvas/
  LightingCanvas.tsx           — container (~150)
  LightingSurface.tsx          — PURE: canvas stack + transform. Storybook-able.
  useLightingPaint.ts          — HOOK: normal/height brush application
  render/renderLightingPreview.ts — PURE(ctx) (from 214-286)
  render/renderNormalEdit.ts      — PURE(ctx) (from 287-343)
  render/renderBrushOverlay.ts    — PURE(ctx) (from 344-368)
  (uses shared useCanvasViewport, canvasBackground, coords, useFloatingPanel)
components/LightingStudioPanel/LightingPreviewPanel.tsx — extracted from 713-869
```
**Three latent bugs to fix during this split** (all measured):
- No rAF coalescing (`grep -c renderRequestRef LightingCanvas.tsx` → **0**); renders fire
  synchronously from effects at 369-376, each redrawing an **uncached O(w·h) `fillRect`
  checkerboard** (298-305) that Canvas.tsx abandoned for `ImageData` at 387-423.
- `lastPaintPixel` is **state** (line 25) not a ref → a re-render *per pixel* during a stroke.
  Canvas.tsx correctly uses `lastStrokePixelRef` (line 38).
- Grid alpha is `0.08` hard-coded (line 322) vs Canvas's `0.05`, and `lightGridMode` is ignored
  entirely → the two canvases visibly disagree.

**Effort:** M-L · **Risk:** med. **Must-test:** normal-paint round-trip; height-paint clamping;
golden-image of `renderPreview` under a fixed light direction.

---

### 7. `server/src/routes/export.ts` (927 lines)

Despite the filename there are **no `router.get/post` calls**; `exportRouter` is created at line
486 and the whole export runs in one handler. The `export` keywords at 862-878 are **inside a
template literal** (822-915) that *generates TypeScript source* — not module exports. Real
exports: `DEFAULT_EXPORT_FOLDER` (20) and `exportRouter` (486).

**Fused responsibilities:** (1) name casing 24-42; (2) export-format type decls 43-165;
(3) string-table compaction 166-372 (`collectStrings`, `toCompactExport`); (4) pixel decoding
373-419; (5) PNG rasterization + content-hash dedupe 420-484 + 500-560; (6) the route handler
486-926, which itself does maxCanvas computation (628-680), file writes (700-713), `lib/` copy
(714-719), and **93 lines of TypeScript codegen via template literal (822-915)**.

```
server/src/export/
  exportRouter.ts        — route wiring + orchestration only (~120)
  exportTypes.ts         — 43-165
  naming.ts              — PURE: toKebabCase, toPascalCase (24-42). TESTABLE.
  compactExport.ts       — PURE: collectStrings, toCompactExport (166-372). TESTABLE.
  pixelDecode.ts         — PURE: compactPixelToRgba, compactPixelToNormalHeight, normalizePixel (373-419)
  textureWriter.ts       — sharp/PNG + bufferHash dedupe (420-484, 500-560)
  maxCanvas.ts           — PURE: variant-offset bounds union (628-680). TESTABLE.
  codegen/renderIndexTs.ts — the 822-915 template, isolated
  codegen/templates/     — ideally real .ts.tmpl files rather than an inline literal
```
**Pure extractions:** `naming.ts`, `compactExport.ts`, `pixelDecode.ts`, `maxCanvas.ts`,
`codegen/renderIndexTs.ts`. **Effort:** M · **Risk:** med (export output is a build artifact
consumed downstream). **Must-test:** golden-file test — export a fixture project to a temp dir,
snapshot `frames.json` + generated `index.ts` + texture hashes, assert byte-identical before/after.
`maxCanvas` deserves its own unit test (the 4-level offset fallback appears here too, 657-665).

---

### 8. `components/ReferenceImageModal/ReferenceImageModal.tsx` (869 lines)

**The architectural smell named in MASTER.md, confirmed.** Line 29 declares a **module-level
mutable object** `persistentState` (image, imageUrl, selection, zoom, panOffset, hasBeenActivated)
"so it survives unmounts". The file has **11 exports, 10 of them non-component**, and `App.tsx:19`
imports state functions from this modal. This is a **store living inside a UI component** —
directly contrary to the locked "UI fully divorced from the store" decision.

**Fused responsibilities:** (1) module-level image/selection store (29-39); (2) pure pixel
extraction (41-77); (3) selection nudge/resize API used by App (79-201); (4) base64 encode/decode
(203-233); (5) project persistence (234-288); (6) the modal UI (289-869), which contains a
**third** copy of pan/zoom + `getImageCoords` (505-520) + `render` (369-438) + mouse dispatch
(577-667).

```
store/referenceImageStore.ts   — the module state (29-39) + persistence (234-288) → MobX UIStore slice
utils/referenceImage.ts        — PURE: extractPixelsFromSelection, shift/adjust selection (41-201). TESTABLE.
utils/imageEncoding.ts         — PURE: encode/decodeBase64 (203-233)
components/ReferenceImageModal/
  ReferenceImageModal.tsx      — container (~150)
  ReferenceImageCropper.tsx    — PURE presentational: canvas + selection box + handles. Storybook-able.
  useImageCropSelection.ts     — HOOK: selection drag/resize/hover (521-667)
  (uses shared useCanvasViewport)
```
**Pure extractions:** `utils/referenceImage.ts`, `utils/imageEncoding.ts`, `ReferenceImageCropper.tsx`.
**Effort:** M · **Risk:** **high** — `App.tsx` depends on the module-level state surviving unmount;
moving it to the store changes lifetime semantics.
**Must-test-before-refactor:** `extractPixelsFromSelection` for in/partially-out-of-bounds
selections; base64 encode→decode round-trip; **manually** verify reference image survives
modal close→reopen→project switch (this is exactly what `persistentState` exists for).

---

## Duplication clusters

| Cluster | Files | Est. duplicated lines | Shared abstraction |
| --- | --- | --- | --- |
| **D1 Viewport / pan / zoom / pinch** | `Canvas.tsx:40-99,178-232,273-280,2625-2702,2704-2726,2820-2862,2973-2977,3006-3012` · `LightingCanvas.tsx:24-56,127-161,379-454,456-478,504-546,581-585,855-861` · `ReferenceImageModal.tsx:505-520,577-667` | **~185** (≥95% identical) | `hooks/useCanvasViewport.ts` |
| **D2 Checkerboard + pixel grid** | `Canvas.tsx:368-491` · `LightingCanvas.tsx:255-260,298-305,322-333` · `utils/previewRenderer.ts:12` | ~60 (**4 impls**) | `utils/canvasBackground.ts` |
| **D3 Draggable floating panel** | `LightingCanvas.tsx:713-835` · `FrameReferencePanel.tsx:32-102,272-323` · `ReferenceImagePanel.tsx:32-94,130-191` | **~120** (**3 clones**) | `hooks/useFloatingPanel.ts` |
| **D4 Timeline drag-reorder** | `FramesView.tsx:362-366,421-478,480-511` · `VariantView.tsx:123-132,167-273,275-334` (**2× in one file**) · `TimelineView.tsx:322-326,574-602` | **~265** | `hooks/useDragReorder.ts` |
| **D5 Thumbnail canvas + memo comparators** | `FramesView.tsx:15-163` (91-line comparator) · `VariantView.tsx:16-75` · `TimelineView.tsx:9-128` (re-blits instead of using `previewRenderer`) | **~150** | `FrameTimeline/ThumbnailCanvas.tsx` |
| **D6 Modal shell** (backdrop+panel+header+footer) | **14** modal components (5,353 lines); 14 distinct backdrop classes; only 2 handle Escape; 0 trap focus | **~298 TSX + ~250 CSS** | `primitives/Modal` |
| **D7 Canvas frame-overlay renderers** | `Canvas.tsx:1024-1290` vs `1297-1506` | **~200** | one parameterised `renderFrameOverlay` |
| **D8 Mouse vs touch tool bodies** | `Canvas.tsx:2187-2266` vs `2741-2816`; `2460-2547` vs `2908-2970` | **~180** (**already drifted**) | `tools/toolHandlers.ts` |
| **D9 Trace stamping (ref vs frame)** | `Canvas.tsx:1984-2018` vs `2021-2054`; `2301-2344` vs `2347-2390` | ~110 | `tools/traceSampler.ts` |
| **D10 Variant-offset fallback chain** | `Canvas.tsx:541,663,1113,1390,1915` · `export.ts:657` | ~30 (**6 copies of a domain rule**) | `model/variantOffset.ts` |
| **D11 Alpha compositing** | `utils/alphaBlend.ts:11` · `lightingRenderer.ts:46` (**both named `alphaBlend`**) · `Canvas.tsx:1177-1193` · `AIInterpolateModal.tsx:90-99` · `export.ts` | ~70 | single `utils/alphaBlend.ts` |
| **D12 Timeline toolbar / add-frame / modal trio** | `FramesView.tsx:520-589,569-587,644-680` · `VariantView.tsx:406-475,455-473,576-613` · `TimelineView.tsx:613-673,825-832` | **~170** | `TimelineToolbar`, `AddFrameControls`, `TimelineModals` |
| **D13 Base64 frame encoders** | `AIInterpolateModal.tsx:38-66,68-107,109-147` | ~70 | `frameEncoding.ts` |

**Total measured duplication: ~1,960 lines**, conservatively ~1,400 of it mechanically removable.

Representative evidence — `clampPanToViewport` differs by exactly one identifier:

```
$ diff <(sed -n '212,232p' Canvas.tsx) <(sed -n '132,152p' LightingCanvas.tsx)
7c7
<       const container = containerRef.current;
---
>       const container = editorContainerRef.current;
```

`getTouchCenter`/`getTouchDistance` (Canvas.tsx:2689-2702 vs LightingCanvas.tsx:441-454) differ
by the same single token. The 62-line wheel handler diff is 27 lines, all cosmetic (brace style,
a comment, and Canvas's two extra `scheduleCommitPan()` calls).

---

## Missing primitives

Counts are raw greps over `client/src/components/**/*.tsx`.

| Primitive | Count | Reimplemented at (real duplicate call sites) | Priority |
| --- | --- | --- | --- |
| **Modal** (portal + backdrop + panel + header + Escape + focus trap) | 14 | All 14 share `backdrop > panel > header`. Escape only at `ExportPreviewModal.tsx:431-442` and `PreviewModal.tsx:393-405` (**copy-paste twins**); `BrowseBackupsModal.tsx:106-114` and `ProjectSelectModal.tsx:89-101` put `onKeyDown` on a `tabIndex`-less div (**dead code**). 3 skip `createPortal`: `BrowseBackupsModal.tsx:116`, `ProjectSelectModal.tsx:103`, `ReferenceImageModal.tsx:750` | **P0** |
| **IconButton** (close button) | 13 verbatim | `className="close-btn"` + `<Icon icon={X} size={14}/>` at `AddVariantModal.tsx:126`, `CopyFromModal.tsx:187`, `ObjectSelectModal.tsx:113`, `VariantSelectModal.tsx:144`, `EdgeInterpolateModal.tsx:47`, `HeightMapModal.tsx:201`, `BrowseBackupsModal.tsx:125`, `ProjectSelectModal.tsx:108`, `ReferenceImageModal.tsx:755`; bespoke-class twins at `ResizeModal.tsx:60`, `PreviewModal.tsx:417`, `ExportPreviewModal.tsx:461`, `FrameTagsModal.tsx:175` | **P0** |
| **Button** | **197** `<button>` | `LayerPanel.tsx:148-160` vs `:161-173` (consecutive 13-line twins); `LayerPanel.tsx:285,339,350,361,372`; `ReferenceImagePanel.tsx:233-309` (**8 clone buttons**) and `:333-403` (**8 more**); play/preview pair identical at `FramesView.tsx:541-554`, `VariantView.tsx:427-440`, `TimelineView.tsx:658-671` | **P0** |
| **Slider** | **27** `type="range"` | `EdgeInterpolateModal.tsx:51-116` (3 consecutive 20-line copies); `LightControl.tsx:149,169,194,254` (4×); `ColorPicker.tsx:538,559,585,620,646` (5×) | **P0** |
| **NumberInput** | **21** `type="number"` | `ResizeModal.tsx:65-85` (twin clamps); **identical FPS clamp** at `PreviewModal.tsx:449-456` and `ExportPreviewModal.tsx:506-515`; `LightControl.tsx:160,185,211,268`; `ColorPicker.tsx:548,574,601,630,661` | P1 |
| **SliderWithNumber** (range+number row) | 8 | `LightControl.tsx:149-167` (×4) and `ColorPicker.tsx:538-661` (×5) are the same row | **P0** |
| **ConfirmDialog** | 3 | `ObjectLibrary.tsx:608`, `AddVariantModal.tsx:248` (`delete-confirm-header` duplicated across files), `BrowseBackupsModal.tsx:181` | **P0** |
| **FloatingPanel** (drag + minimize + %-position persist) | 3 | `LightingCanvas.tsx:713-835`, `FrameReferencePanel.tsx:32-102,272-323`, `ReferenceImagePanel.tsx:32-94,130-191` | **P0** |
| **ThumbnailCanvas** | 5 | `FramesView.tsx:15-163` (91-line comparator), `VariantView.tsx:16-75`, `TimelineView.tsx:47-128`, `ObjectSelectModal.tsx`, `CopyFromModal.tsx` | **P0** |
| **Toggle / Checkbox** | 9, **3 idioms** | Custom-slider span `RightSidebarTopControls.tsx:309-319`; label-wrapped `EdgeInterpolateModal.tsx:118-126`, `FramesView.tsx:571`, `VariantView.tsx:457`; **keyboard-inaccessible** no-op `onChange` + div `onClick` at `LayerColors.tsx:169-180`, `:197-208`, `:254` (**3× in one file**) | P1 |
| **Tooltip** | 142 `title=` + **2 bespoke** | Two independent portal tooltips: `CopyFromModal.tsx:72-88` and `Toolbar.tsx:38-45`. Three mutually incompatible mechanisms, no shared one | P1 |
| **ColorSwatch** | **3 impls** | `LayerColors.tsx:270-278` and `ColorPicker.tsx:421-429` share the `rgba(...)` expression **and** the hex-`title` construction character-for-character; `PaletteManager.tsx:118-125` uses a 3rd form (`R:/G:/B:/A:` title). CSS triplicated across the 3 `.css` files | P1 |
| **PanelHeader** | 12 + 13 ad-hoc | `panel-header` disagrees on nesting: container form `LayerPanel.tsx:145-147` vs bare-text `ColorPicker.tsx:415`, `RightSidebarTopControls.tsx:100,128`, `PixelStudioPanel.tsx:31,86,146`. `LightingStudioPanel.tsx:19` **and** `:83` use both forms in one file | P2 |
| **Dropdown / Select** | 1 | `ViewModeDropdown` inlined at `FrameTimeline.tsx:11-76` with its own click-outside effect | P2 |
| **Tabs** | **1** | Only `AIInterpolateModal.tsx:964-983`. **Not duplication — do not extract speculatively.** The `${base} ${cond ? 'active' : ''}` idiom *is* widespread (`ObjectSelectModal.tsx:119`, `LayerColors.tsx:272`, `BrowseBackupsModal.tsx:152`, `ProjectSelectModal.tsx:120`, `ReferenceImageModal.tsx:761`) → a `classNames` helper covers it | P3 |
| **ContextMenu** | **0** | Not implemented anywhere — absent, not duplicated | P3 |

**Backdrop-close is implemented two incompatible ways with no rationale:** 7 modals use
`stopPropagation` on the panel, 7 use an `e.target === e.currentTarget` guard, and **5 do both
redundantly** (`EdgeInterpolateModal.tsx:37+44`, `HeightMapModal.tsx:191+198`,
`FrameTagsModal.tsx:160+170`, `ResizeModal.tsx:50+57`). Only `AIInterpolateModal.tsx:863-874`
gets it right, tracking mousedown origin so a drag-release outside doesn't close the modal.

**Modal CSS duplication is worse than the TSX.** `EdgeInterpolateModal.css:1-15` and
`HeightMapModal.css:1-15` differ by **exactly one line** — the selector:

```
$ diff <(sed -n '1,15p' EdgeInterpolateModal/EdgeInterpolateModal.css) \
       <(sed -n '1,15p' HeightMapModal/HeightMapModal.css)
1c1
< .edge-interpolate-modal-backdrop {
---
> .height-map-modal-backdrop {
```

`@keyframes fadeIn` is redefined ≥3× (`EdgeInterpolateModal.css:12`, `HeightMapModal.css:12`,
`ReferenceImageModal.css:12`). There are **6 backdrop opacities** (0.5-0.85) and **6 z-indexes**
(1000, 1001, 9999, 10000, 99999) — a live stacking-bug surface: `AddVariantModal.css:324` puts a
nested confirm at `z-index: 1001` while the AI backdrop sits at `99999`.

**Hidden cross-component CSS dependency:** `.modal-overlay`, `.modal-header`, `.modal-footer` are
*declared* in `ReferenceImageModal.css:1,42,258` but *consumed* by `BrowseBackupsModal.tsx:117,123,168`
and `ProjectSelectModal.tsx:104,106,174`. Those two modals break if `ReferenceImageModal.css` is
ever unimported — flag for P1-04 (CSS audit).

Reproduce:
```sh
grep -rn '<button' client/src/components --include=*.tsx | wc -l          # 197
grep -rn 'type="range"' client/src/components --include=*.tsx | wc -l     # 27
grep -rn 'type="number"' client/src/components --include=*.tsx | wc -l    # 21
grep -rn 'title=' client/src/components --include=*.tsx | wc -l           # 142
grep -rhoE 'className="[a-z-]*(overlay|backdrop)[a-z-]*"' client/src/components --include=*.tsx | sort -u
find client/src -type d \( -name ui -o -name primitives -o -name common -o -name shared \)  # empty
```

**Accessibility note (a11y is currently unowned by any P1 task — flagging it here):** across all
14 modals there is **no `role="dialog"`, no `aria-modal`, and no focus trap**; the single
`aria-label` in the set is `FrameTagsModal.tsx:177`. 12 of 14 cannot be closed with Escape. A
single `Modal` primitive fixes all 14 components at once — the strongest ROI in this audit.

---

## Dead code

Verified with `bunx knip` in `client/` plus manual `grep` confirmation of every entry.

| File:line | What | Confidence |
| --- | --- | --- |
| `client/src/components/GaussianFillModal/` | **Empty directory** — 0 files, zero references anywhere in `client/src`. The `gaussian-fill` tool is handled inline in `Canvas.tsx:2241-2261`. Orphan folder | **High** (`ls` empty + grep returns nothing) |
| `client/src/services/aiService.ts:86` | `checkAiHeartbeat` — exported, **zero call sites** | **High** (grep: only the definition) |
| `client/src/services/aiService.ts:180` | `interpolateFrames` — exported, **zero call sites** | **High** (grep: only the definition) |
| `client/src/utils/alphaBlend.ts:11` | `alphaBlend` — exported but never imported; `layerActions.ts:3` imports only `blendPixels`. Duplicated by a private `alphaBlend` in `lightingRenderer.ts:46` | **High** |
| `client/src/components/FrameTimeline/TimelineView.tsx:328` | `gridRef` — declared and attached at :740 but **never dereferenced**. Dead ref (the natural home for missing scroll-into-view) | **High** |
| `client/src/components/FrameTimeline/TimelineView.tsx:305` | `moveLayer` destructured from store, unused (TS6133) | **High** (tsc) |
| `client/src/components/FrameTimeline/TimelineView.tsx:313` | `getCurrentObject` destructured, unused (TS6133) | **High** (tsc) |
| `client/src/components/FrameTimeline/VariantView.tsx:4` | `renderFramePreview` imported, unused (TS6133) | **High** (tsc) |
| `client/src/components/FrameTagsModal/FrameTagsModal.tsx:4` | entire import declaration unused (TS6192) | **High** (tsc) |
| 15 further TS6133 sites | unused locals/imports in `AnchorGrid`, `LightingCanvas:3`, `ColorPicker:198`, `HeightMapModal:84`, `LayerPanel:70`, `PreviewModal:342`, `VariantSelectModal:4`, `types/index.ts:888`, `lightingRenderer:1`, `TimelineView:583`, `VariantView:98` | **High** (tsc) |
| `client/src/services/aiService.ts:3,9` | `HeartbeatResult`, `InterpolateResult` — types for the two dead functions | **High** |
| `client/src/store/index.ts:12-15` | `SaveStatus`, `ColorAdjustmentState`, `LayerClipboard`, `TimelineCellClipboard` re-exported, never imported from here (originals in `storeTypes.ts` are used) | Med — harmless barrel duplication |
| `client/lib/parse-pixel-project.ts:18-27,143` · `client/lib/versions/v1.ts:9-37` | 12 exported types unused **within the repo** | **Low — DO NOT DELETE.** `lib/` is copied wholesale into exports (`export.ts:714-719`) and is public API for generated projects |

**Not found:** no commented-out code blocks, no `TODO`/`FIXME`/`HACK` markers anywhere in
`client/src` (greps returned zero). Only 5 `console.log` calls. The codebase is clean of
commented-out cruft — the size problem is duplication, not accumulated debris.

`ReferenceImageModal.tsx:41,203,224` were flagged by knip as unused exports but are **false
positives** — used internally at :112, :199, :286, :669, :244, :268. They should stop being
`export`ed once the file is split, but they are live code.

---

## Recommended split order

**Wave A — unblock (strictly first, nothing else is verifiable until it lands)**

| # | Work | Parallel? |
| --- | --- | --- |
| A1 | Fix the 56 `tsc` errors → green `bun run build` | solo, blocks everything |

**Wave B — pure extractions (no UI change; safe, high leverage, fully parallel)**

| # | Work | Touches | Parallel with |
| --- | --- | --- | --- |
| B1 | Split `types/index.ts` behind a barrel | `client/src/types/` | B2, B3, B4 |
| B2 | `model/variantOffset.ts` + `model/coords.ts` (D10) | `components/Canvas/model/` | B1, B3, B4 |
| B3 | `utils/canvasBackground.ts` (D2) + dedupe `alphaBlend` (D11) | `utils/`, `components/Canvas/` | B1, B2, B4 |
| B4 | Split `server/src/routes/export.ts` | `server/src/export/` | all of B (different package) |

**Wave C — shared hooks & primitives (each unlocks several later splits)**

| # | Work | Depends on | Parallel with |
| --- | --- | --- | --- |
| C1 | `hooks/useCanvasViewport.ts` (D1) | B2 | C2, C3, C4 |
| C2 | `hooks/useFloatingPanel.ts` (D3) | — | C1, C3, C4 |
| C3 | `primitives/` — Modal, Button, IconButton, Slider, NumberInput, ConfirmDialog (D6) | — | C1, C2, C4 |
| C4 | `hooks/useDragReorder.ts` + `ThumbnailCanvas` (D4, D5) | — | C1, C2, C3 |

**Wave D — component splits (parallel; each owns a disjoint folder)**

| # | Work | Depends on |
| --- | --- | --- |
| D-a | `Canvas.tsx` steps C1-C8 (**sequential internally**, multi-session) | B2, B3, C1 |
| D-b | `LightingCanvas.tsx` | C1, C2, B3 |
| D-c | `FrameTimeline/` triplet | C4, C3 |
| D-d | `AIInterpolateModal.tsx` (incl. the array-rank type fix) | C3, A1 |
| D-e | `ReferenceImageModal.tsx` + module-state → store | C1, C3 |
| D-f | Store splits: `variantActions`, `lightingActions`, `layerClipboardActions`, `layerActions` | B1 |

**Collision warning for task 09:** D-a and D-b both touch `components/Canvas/`. Run D-a first or
have D-b start only after C1 lands; do **not** schedule them in the same parallel wave.
D-c's three files are independent of everything else and are the safest parallel filler.

---

## Proposed work items

| Title | Touches (explicit files/dirs) | Depends on | Effort | Risk |
| --- | --- | --- | --- | --- |
| **W0. Green the typecheck baseline** | `client/src/components/AIInterpolateModal/AIInterpolateModal.tsx` (692,720,736,785,815) · `client/src/types/index.ts` (888,967) · `client/lib/versions/v1.ts` (210) · `client/src/components/Canvas/drawingUtils.ts` (438) · `client/src/components/ReferenceImagePanel/ReferenceImagePanel.tsx` (116) · `client/src/components/AnchorGrid/AnchorGrid.tsx` · `client/src/components/Canvas/LightingCanvas.tsx` (3) · `client/src/components/ColorPicker/ColorPicker.tsx` (198) · `client/src/components/FrameTagsModal/FrameTagsModal.tsx` (4) · `client/src/components/FrameTimeline/TimelineView.tsx` (3,305,313,583) · `client/src/components/FrameTimeline/VariantView.tsx` (4,98) · `client/src/components/HeightMapModal/HeightMapModal.tsx` (84) · `client/src/components/LayerPanel/LayerPanel.tsx` (70) · `client/src/components/PreviewModal/PreviewModal.tsx` (342) · `client/src/components/VariantSelectModal/VariantSelectModal.tsx` (4) · `client/src/utils/lightingRenderer.ts` (1) | — | M | **Real behavior change**: TS2339 on `lightGridMode` and the 5 array-rank errors are live bugs; fixing them may alter save/load and AI-accept output. Detect via round-trip fixture + manual AI-accept run |
| **W1. Delete verified dead code** | `client/src/services/aiService.ts` (3,9,86,180) · `client/src/utils/alphaBlend.ts` (11) · `client/src/components/FrameTimeline/TimelineView.tsx` (328) · `client/src/store/index.ts` (12-15) · **remove empty dir** `client/src/components/GaussianFillModal/` | W0 | S | Low. Do **not** touch `client/lib/**` (public API for exports) |
| **W2. Split `types/index.ts` behind a barrel** | `client/src/types/` (new `domain.ts`, `constants.ts`, `factories.ts`, `codecs/*`; `index.ts` → barrel) | W0 | M | Med — 35 files import from `../types`; barrel must re-export every one of the 57 symbols. Detect via `tsc` |
| **W3. Extract `variantOffset` + `coords` pure models** | `client/src/components/Canvas/model/variantOffset.ts` (new) · `client/src/components/Canvas/model/coords.ts` (new) · `client/src/components/Canvas/Canvas.tsx` (541,663,1113,1390,1915,289-365) · `client/src/components/Canvas/LightingCanvas.tsx` (164-176) · `server/src/export/maxCanvas.ts` | W0 | M | Med — the 6 copies may have silently drifted; diff each before unifying |
| **W4. Extract `canvasBackground` + dedupe `alphaBlend`** | `client/src/utils/canvasBackground.ts` (new) · `client/src/utils/alphaBlend.ts` · `client/src/utils/lightingRenderer.ts` (46) · `client/src/utils/previewRenderer.ts` (12) · `client/src/components/Canvas/Canvas.tsx` (368-491) · `client/src/components/Canvas/LightingCanvas.tsx` (255-260,298-305,322-333) | W0 | M | Med — unifying grid alpha (0.05 vs 0.08) is a deliberate **visual** change; screenshot both canvases |
| **W5. Split `server/src/routes/export.ts`** | `server/src/export/` (new: `exportRouter.ts`, `exportTypes.ts`, `naming.ts`, `compactExport.ts`, `pixelDecode.ts`, `textureWriter.ts`, `maxCanvas.ts`, `codegen/renderIndexTs.ts`) · `server/src/index.ts` (11) · delete `server/src/routes/export.ts` | — | M | Med — export output is consumed downstream; guard with a golden-file test |
| **W6. `hooks/useCanvasViewport.ts`** | `client/src/hooks/useCanvasViewport.ts` (new) · `client/src/components/Canvas/Canvas.tsx` (40-99,178-232,273-280,2625-2702,2704-2726,2820-2862,2973-2977,3006-3012) · `client/src/components/Canvas/LightingCanvas.tsx` (24-56,127-161,379-454,456-478,504-546,581-585,855-861) | W3 | M | **High** — pinch/zoom is gesture-sensitive and untestable in CI. Manual: trackpad pinch, ctrl+wheel, two-finger pan, touch pinch on both canvases |
| **W7. `hooks/useFloatingPanel.ts`** | `client/src/hooks/useFloatingPanel.ts` (new) · `client/src/components/Canvas/LightingCanvas.tsx` (713-835) · `client/src/components/FrameReferencePanel/FrameReferencePanel.tsx` (32-102,272-323) · `client/src/components/ReferenceImagePanel/ReferenceImagePanel.tsx` (32-94,130-191) | — | M | Med — each persists to a *different* `uiState` key; keep them distinct. Manual: drag + minimize + reload each panel |
| **W8. Core UI primitives** | `client/src/components/primitives/` (new: `Modal/`, `Button/`, `IconButton/`, `Slider/`, `NumberInput/`, `SliderWithNumber/`, `Toggle/`, `ConfirmDialog/`, `ColorSwatch/`, `Tooltip/`) + stories | — | L | Low to build, med to adopt. Ship primitives + Storybook first; adopt per-component later. **Skip `Tabs`** — 1 call site, extraction would be speculative |
| **W9. Adopt `Modal` across 14 modals** | `client/src/components/{AddVariantModal,AIInterpolateModal,BrowseBackupsModal,CopyFromModal,EdgeInterpolateModal,ExportPreviewModal,FrameTagsModal,HeightMapModal,ObjectSelectModal,PreviewModal,ProjectSelectModal,ReferenceImageModal,ResizeModal,VariantSelectModal}/` + their `.css` | W8 | L | Med — adds Escape+focus-trap to 12 modals that lacked them; unifies 6 z-indexes and 6 opacities. **Verify Escape doesn't conflict** with `Canvas.tsx:1741-1761` capture-phase handler. **Must resolve the `.modal-overlay` cross-file CSS dependency** (declared in `ReferenceImageModal.css`, consumed by 2 other modals) with P1-04 |
| **W10. `useDragReorder` + `ThumbnailCanvas`** | `client/src/hooks/useDragReorder.ts` (new) · `client/src/components/FrameTimeline/ThumbnailCanvas.tsx` (new) · `FramesView.tsx` (15-163,362-366,421-511) · `VariantView.tsx` (16-75,123-132,167-334) · `TimelineView.tsx` (9-128,322-326,574-602) | W8 | L | Med-high — replacing the 91-line memo comparator with a revision prop can cause stale thumbnails. Manual: reorder frames, verify thumbs update on edit |
| **W11. Split `FrameTimeline/` triplet** | `client/src/components/FrameTimeline/` (`TimelineToolbar.tsx`, `AddFrameControls.tsx`, `TimelineModals.tsx` new; `FramesView.tsx`, `VariantView.tsx`, `TimelineView.tsx` slimmed) | W10 | L | Med |
| **W12. Canvas C1-C4 — render extraction** | `client/src/components/Canvas/render/` (new: `renderScene.ts`, `renderSelectionOverlay.ts`, `renderOriginCross.ts`, `renderFrameOverlay.ts`) · `Canvas.tsx` (494-928,1024-1506) | W3, W4 | L | **High** — unifying the two frame-overlay renderers (D7) changes compositing. Golden-image tests required |
| **W13. Canvas C6 — `useCanvasKeyboard`** | `client/src/components/Canvas/useCanvasKeyboard.ts` (new) · `Canvas.tsx` (1575-1825) | W12 | M | Med — capture-phase ordering vs `FrameTimeline.tsx:171-202` is load-bearing; preserve `useCapture=true` |
| **W14. Canvas C7 — tool handlers, collapse mouse/touch** | `client/src/components/Canvas/tools/` (new: `toolHandlers.ts`, `brushStamp.ts`, `traceSampler.ts`) · `Canvas.tsx` (1961-2990) | W13 | L | **Highest in the plan** — 1,030 lines, and mouse/touch have **already drifted** (touch eraser skips bounds filtering at 2766-2772). Unifying *fixes* a bug but changes touch behavior |
| **W15. Canvas C8 — `CanvasSurface` + container** | `client/src/components/Canvas/CanvasSurface.tsx` (new) · `Canvas.tsx` · `useCanvasGeometry.ts` (new) | W14, W6 | M | Med |
| **W16. Split `LightingCanvas.tsx`** | `client/src/components/Canvas/LightingCanvas.tsx` · `LightingSurface.tsx` (new) · `useLightingPaint.ts` (new) · `render/renderLightingPreview.ts`, `renderNormalEdit.ts`, `renderBrushOverlay.ts` (new) · `components/LightingStudioPanel/LightingPreviewPanel.tsx` (new) | W6, W7, W4 | L | Med — also adopt rAF + ref-based `lastPaintPixel`; verify no dropped strokes |
| **W17. Split `AIInterpolateModal.tsx`** | `client/src/components/AIInterpolateModal/` (`steps/*`, `parts/*`, `useInterpolationJob.ts`, `applyInterpolation.ts`, `frameEncoding.ts` new) | W0, W8 | L | Med-high — AI job flow needs a live `ai-service`; keep `applyInterpolation` behind a fixture test |
| **W18. `ReferenceImageModal` → store + utils** | `client/src/store/referenceImageStore.ts` (new) · `client/src/utils/referenceImage.ts` (new) · `client/src/utils/imageEncoding.ts` (new) · `components/ReferenceImageModal/` · `client/src/App.tsx` (19) | W6, W8 | L | **High** — `App.tsx` relies on module state surviving unmount; lifetime semantics change |
| **W19. Split `variantActions.ts`** | `client/src/store/variant/` (new: `variantGroupActions.ts`, `variantCrudActions.ts`, `variantGeometryActions.ts`, `variantFrameActions.ts`, `variantHelpers.ts`) · `client/src/store/index.ts` · **removes the `store→components/AnchorGrid` import** (`variantActions.ts:14`) | W2 | L | Med |
| **W20. Split `lightingActions.ts`** | `client/src/store/lighting/` (new: `lightingSettingsActions.ts`, `normalActions.ts`, `heightActions.ts`, `flipActions.ts`, `normalCompute.ts`) · `client/src/store/index.ts` | W2 | M | Med — unifying flipH/flipV into one `flipAxis` is the risky half |
| **W21. Split `layerClipboardActions.ts` + `layerActions.ts`** | `client/src/store/layer/` (new) · `client/src/store/index.ts` | W2 | M | Med — 4 near-identical `squash*` variants should collapse to one parameterised core |

**21 work items.** W0 blocks everything. W2-W5 are parallel. W6-W8, W10 are parallel.
W12→W13→W14→W15 is strictly sequential (all in `Canvas.tsx`).

---

## Verification

Baseline commands (run from repo root). **Note W0: the client gate is red today.**

| Work item | Command(s) | Manual checks |
| --- | --- | --- |
| **W0** | `cd client && bun run build` (must exit 0 — currently exits 1 with 56 errors); `cd server && bunx tsc --noEmit` (already exits 0) | Save a project, reload it, confirm `lightGridMode` persists (the TS2339 bug). Run one AI interpolate → Accept, confirm frames land correctly (the array-rank bugs) |
| W1 | `cd client && bunx knip` shows the 6 entries gone; `bun run build` exits 0 | None |
| W2 | `cd client && bun run build`; `bunx knip` reports no new unused exports | Load a legacy project from `server/src/data/backups/` |
| W3, W4 | `cd client && bun run build` | **W4:** screenshot Canvas + LightingCanvas in light and dark `lightGridMode`; grid must now match (it does not today) |
| W5 | `cd server && bunx tsc --noEmit`; export a fixture project and diff the output tree byte-for-byte against a pre-refactor snapshot | Confirm generated `index.ts` compiles in a consuming project |
| W6 | `cd client && bun run build` | **Required, not automatable:** trackpad pinch-zoom, ctrl+wheel zoom, two-finger pan, touch pinch — on **both** Canvas and LightingCanvas. Verify zoom anchors under the cursor and does not drift/jitter |
| W7 | `cd client && bun run build` | Drag, minimize, and reload each of the 3 panels; confirm each remembers its own position (3 distinct `uiState` keys) |
| W8 | `bunx storybook build` (once Storybook lands via P1-01/P2-08); every primitive has a story | Visual review of each primitive in both themes |
| W9 | `cd client && bun run build`; grep proves one backdrop class: `grep -rhoE 'className="[a-z-]*(overlay\|backdrop)[a-z-]*"' client/src/components --include=*.tsx \| sort -u` returns ≤2 | Open all 15 modals; Escape closes each; backdrop click closes; focus is trapped; **Escape inside a modal must not also clear the Canvas selection** (`Canvas.tsx:1741` uses capture phase) |
| W10, W11 | `cd client && bun run build` | Reorder frames by drag in all 3 views; drop indicator lands correctly at start/middle/end; edit a pixel and confirm the thumbnail updates (memo-comparator regression) |
| W12 | `cd client && bun run build`; golden-image tests (see below) pass | Compare screenshots: normal mode, variant-edit, selection + marching ants, lasso, frame overlay, trace overlay |
| W13 | `cd client && bun run build` | All 12 tool hotkeys; WASD in reference-trace / frame-trace / variant modes (priority order); arrows under each `selectionBehavior`; Escape 3-level precedence; `.`/`,` frame nav |
| W14 | `cd client && bun run build`; `brushStamp` unit tests pass for mouse **and** touch paths | Draw with pixel/eraser/fill-square/line/rect/ellipse at brush size 1 and >1, circle and square, **with a mouse and on a touch device**; confirm no out-of-bounds writes at grid edges |
| W15, W16 | `cd client && bun run build` | Full paint session in both studios; confirm no dropped strokes after the rAF change |
| W17 | `cd client && bun run build`; `frameEncoding` byte-equality tests pass | Full AI interpolate → review → accept against a running `ai-service` |
| W18 | `cd client && bun run build` | Load reference image → close modal → reopen (image persists) → switch project → reopen (correct image) |
| W19, W20, W21 | `cd client && bun run build`; `bunx knip` clean | W19: make/resize/offset a variant across frames. W20: paint normals + heights, flip H and V, assert H∘H = identity. W21: copy/paste layers within and across objects; all 4 squash variants |

**Test infrastructure that must exist first** (owned by P1-01/P2-08, but this audit depends on it):

```sh
cd client && bunx vitest run          # unit tests — does not exist yet (zero tests today)
cd client && bunx storybook build     # stories — does not exist yet
```

Highest-value tests to write before any Wave D item, in priority order:
1. `compactToProject(projectToCompact(p))` round-trip (protects all persistence) — W2
2. `resolveVariantOffset` 4-level fallback (6 call sites today) — W3
3. `screenToPixel` normal/variant/out-of-bounds/half-snap (3 call sites) — W3
4. `brushStamp` mouse-vs-touch agreement (**encodes the drift bug**) — W14
5. Golden-image `renderScene` per mode — W12

---

## Open questions

| # | Question | Blocking? | Assumption to proceed under |
| --- | --- | --- | --- |
| 1 | **Should W0 (typecheck green) precede the MobX migration, or be folded into it?** The 9 real type errors include live bugs (`lightGridMode` round-trip loss; AI array-rank). Fixing them changes behavior. | **Blocking — W0, and transitively everything.** Names the item: W0 | Proceed as written: W0 first, as its own reviewable change, before any structural work. Task 09 should treat it as Wave 0 |
| 2 | Does `bun run build`'s current failure mean CI has never been green, or was it green recently? `git log` was not analyzed for when the errors appeared. | Non-blocking | Assume it has been red for some time and that no one relies on `tsc` passing. Do not treat any error as "just introduced" |
| 3 | **Is the touch/mouse drift at `Canvas.tsx:2766-2772` (eraser skips bounds filter) an intentional perf shortcut or a bug?** | Non-blocking — affects W14 | Assume **bug**. Unify to the filtered (mouse) behavior and note the change in the PR |
| 4 | Should the grid appearance be unified (Canvas `0.05` + `lightGridMode`-aware vs LightingCanvas hard-coded `0.08`)? This is a **visible design decision**, not a pure refactor. | Non-blocking — affects W4 | Assume unify to Canvas's `lightGridMode`-aware behavior; flag for owner sign-off before merge |
| 5 | `client/lib/**` has 12 unused exported types and is copied verbatim into exports (`export.ts:714-719`). Is it public API with external consumers? | Non-blocking — affects W1 | Assume **yes, public API**. Do not delete anything under `client/lib/` |
| 6 | Should `ReferenceImageModal`'s module-level state become part of `UIStore` or `SessionStore`? MASTER locks the three-store split but not this placement. | Non-blocking — affects W18 | Assume `UIStore` (it is ephemeral view state persisted into `project.uiState`). Defer to P2-06's MobX design; W18 must sequence **after** it |
| 7 | Is `RightSidebarTopControls.tsx` (403 lines, **0 hooks**, JSX depth 14) already effectively presentational? It looked like the best existing candidate for a first pure component, but its store usage was not traced in full. | Non-blocking | Assume it is a strong early Storybook candidate; P2-07 should confirm |
| 8 | The 4-level variant-offset fallback also appears in `server/src/routes/export.ts:657-665`. Should client and server share it, or is duplication across the package boundary acceptable? | Non-blocking — affects W3, W5 | Assume duplication is acceptable for now (no shared package exists); add a comment in both pointing at each other. Flag a shared `packages/domain` as a possible future item |
| 9 | JSX depth was measured with an indentation heuristic, not an AST parse. Values are directionally right but ±2. | Non-blocking | Treat depth as a triage signal only; `LayerPanel.tsx` (18) and `TimelineView.tsx`/`ObjectLibrary.tsx` (14) are genuinely the deepest |
| 10 | MASTER lists `FrameTimeline.css` (1,061 lines) among the largest offenders, but CSS is P1-04's scope. The `FrameTimeline/` splits (W10, W11) will churn class names. | Non-blocking — coordinates W11 with P1-04 | Assume P1-04 owns the CSS/BEM rewrite; W11 should land **before** or **together with** it to avoid re-doing class names twice |
| 11 | **No P1 task owns accessibility.** This audit measured a real gap (0/14 modals with `role="dialog"`/`aria-modal`/focus trap; 12/14 with no Escape; keyboard-inoperable toggles at `LayerColors.tsx:169-180`). Is a11y in scope for the refresh at all? | Non-blocking — shapes W8/W9 | Assume **yes, opportunistically**: build a11y into the primitives (W8) so adoption fixes it for free, but do not open a separate a11y workstream. Owner should confirm |
| 12 | `AddVariantModal`, `CopyFromModal`, `ObjectSelectModal`, `VariantSelectModal`, `BrowseBackupsModal`, `ProjectSelectModal` take **no `isOpen` prop** and rely on conditional parent mounting, while 8 others early-return on `isOpen`. Should the `Modal` primitive mandate one convention? | Non-blocking — affects W9 | Assume the primitive accepts `isOpen` and callers migrate to it; conditional mounting keeps working since `isOpen` defaults true. Note this changes unmount timing for the 6 |
