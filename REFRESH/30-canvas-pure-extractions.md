# 30 — Canvas decomposition step 1: pure models, background, and render extraction

**Wave:** W22 · **Depends on:** 29, 08
**Touches:** `client/src/components/Canvas/Canvas.tsx` · `client/src/ui/canvas/model/coords.ts` (new) · `client/src/ui/canvas/model/variantOffset.ts` (new) · `client/src/ui/canvas/render/canvasBackground.ts` (new) · `client/src/ui/canvas/render/renderScene.ts` (new) · `client/src/ui/canvas/render/renderSelectionOverlay.ts` (new) · `client/src/ui/canvas/render/renderOriginCross.ts` (new) · `client/src/ui/canvas/render/renderFrameOverlay.ts` (new) · `client/src/utils/alphaBlend.ts` · `client/src/utils/lightingRenderer.ts` · `client/src/utils/previewRenderer.ts` · `client/src/components/Canvas/LightingCanvas.tsx` (call sites only) · `client/src/ui/canvas/**/__tests__/` (new)
**Effort:** L

## Objective

After this task the pure, testable parts of `Canvas.tsx` are extracted: coordinate mapping, the 4-level variant-offset rule, the checkerboard/grid background, and all four scene renderers — including the **unification of two near-verbatim frame-overlay renderers**. `Canvas.tsx` shrinks by roughly 1,000 lines and every extracted piece is unit-testable and Storybook-able.

## Context

`client/src/components/Canvas/Canvas.tsx` is **3,062 lines — one function**, `Canvas()`, spanning lines 29-3062, with **11 distinct fused responsibilities**:

| # | Concern | Lines | Size |
| --- | --- | --- | --- |
| 1 | Store binding — 47 members from one `useEditorStore()` | 101-149 | 49 |
| 2 | Grid/view geometry — variant-aware bounds, `canvasWidth/Height`, cache keys | 151-285 | 135 |
| 3 | Pan/zoom viewport — `viewPanOffset`, `scheduleCommitPan`, `clampPanToViewport`, `viewZoom`, pinch/anchor refs | 40-99, 178-232, 273-280 | ~120 |
| 4 | Coordinate mapping — `getPixelCoords`, `getOriginCoords` | 289-365 | 77 |
| 5 | Static-layer caching — `ensureBgCanvas` (checkerboard), `ensureGridCanvas` | 368-491 | 124 |
| 6 | **Main render** — layers, variants, preview, selection mask, lasso, marching ants, origin cross | 494-928 | **435** |
| 7 | Reference-image overlay render | 950-1020 | 71 |
| 8 | Frame overlay render (alpha-composited `ImageData`) | 1024-1290 | 267 |
| 9 | Frame-trace overlay render — **near-verbatim clone of #8** | 1297-1506 | 210 |
| 10 | Keyboard shortcuts | 1575-1825 | 251 |
| 11 | Pointer interaction — mouse + touch + wheel | 1961-2990 | **1030** |

**This task takes concerns 4, 5, 6, 7, 8 and 9.** Concerns 3, 10 and 11 are the next task; concerns 1 and 2 are the one after.

### What this task extracts, and the duplication each removes

**`model/variantOffset.ts` — the 4-level fallback, currently duplicated 6×.**

```ts
l.variantOffsets?.[l.selectedVariantId ?? ""] ?? l.variantOffset ??
  variant.baseFrameOffsets?.[baseFrameIndex] ?? { x: 0, y: 0 }
```

Verbatim copies at `Canvas.tsx:541`, `:663`, `:1113`, `:1390`, `:1915`, plus one in the server export path. **This is domain logic living in a view file; every copy is a place the rule can drift.** ⚠️ **Diff all five Canvas copies against each other before unifying** — they may already have drifted. Task 08 tested all four levels in priority order.

**`model/coords.ts` — `screenToPixel` and the snapping modes.** `getPixelCoords` (289-325) and `getOriginCoords` (328-365) repeat the same rect math with different snapping (`getOriginCoords` rounds to `.5` at line 348). ~30 duplicated lines. Task 08 tested normal mode, variant mode with negative offsets, out-of-bounds → `null`, and half-pixel snapping.

**`render/canvasBackground.ts` — the checkerboard, implemented 4× in the codebase.** `Canvas.tsx:368-491` (cached, `ImageData`-based), `LightingCanvas.tsx:255-260,298-305,322-333` (uncached, O(w·h) `fillRect`), and `utils/previewRenderer.ts:12`.

⚠️ **The grid alpha differs today: `Canvas.tsx` uses `0.05` and is `lightGridMode`-aware; `LightingCanvas.tsx:322` hard-codes `0.08` and ignores `lightGridMode` entirely.** The two canvases visibly disagree.

**SETTLED — OWNER DECISION (2026-08-16): unify onto `Canvas`'s behaviour.** Both canvases use alpha **`0.05`** and both **honour `lightGridMode`**. `LightingCanvas.tsx:322`'s hard-coded `0.08` goes away. This task is **unblocked** and needs no further sign-off on the choice — but it is a **visible change to `LightingCanvas`**, so it must still be screenshotted: capture **both canvases in both `lightGridMode` states** and record the result in the completion report.

**`render/renderFrameOverlay.ts` — ONE parameterised implementation replacing #8 AND #9.** Lines 1024-1290 and 1297-1506 have the same structure: size the overlay to the canvas, build a temp canvas, zero an `ImageData`, walk layers, resolve the 4-level variant-offset fallback, blit, `putImageData`, draw at `globalAlpha`, stroke a dashed border. **~200 duplicated lines.** They differ only in: compositing (#8 alpha-blends at 1173-1196, #9 overwrites at 1422-1431), opacity (0.4 vs 0.5), border colour, and #9 honouring `frameOverlayOffset`. **Parameterise those four differences.**

**Deduplicate `alphaBlend` while here.** Alpha compositing exists **5×**: `utils/lightingRenderer.ts:46` (a private function also named `alphaBlend`), `Canvas.tsx:1177-1193`, `AIInterpolateModal.tsx:90-99`, the server export path, and `utils/alphaBlend.ts`'s `blendPixels`. (`utils/alphaBlend.ts:11`'s exported `alphaBlend` was deleted as dead by task 02.) Task 08 pinned each implementation's behaviour **before** unifying, precisely because they may not agree. Unify onto one, and if two implementations genuinely differ, report which behaviour was chosen.

**`render/renderScene.ts`, `renderSelectionOverlay.ts`, `renderOriginCross.ts`** — split concern #6's 435 lines: layers + preview + variant chrome; mask fill, drag preview, lasso, marching ants; and the origin cross (854-890).

### The renderers take buffers, not a `ctx`

jsdom has no canvas and this plan deliberately adds **no** canvas native dependency. Structure every extracted renderer to take and return **`ImageData`-like buffers** (`{data: Uint8ClampedArray, width, height}`) rather than a `CanvasRenderingContext2D`, and assert on a **hash** of the resulting `Uint8ClampedArray` using the `canvasStub.ts` helper task 06 installed.

Renderers that genuinely need a `ctx` for chrome drawing — marching ants, lasso, the origin cross — cannot be hash-tested and fall back to manual review. Structure them so the *computation* is separable from the *stroking* where possible.

### Where the extracted files live

`client/src/ui/canvas/{model,render}/` — inside the `ui/` boundary, since these are pure and store-free. Task 05's ESLint rule forbids them from importing `stores/`, `api/` or `mobx`. If an extraction needs store data, it takes it as a **parameter**.

## Steps

Land each step as its own commit so a regression is bisectable.

1. **`model/variantOffset.ts`.** Diff all five `Canvas.tsx` copies (lines 541, 663, 1113, 1390, 1915) against each other first and **report any drift**. Extract one implementation, replace all five call sites. Task 08's tests must pass.
2. **`model/coords.ts`.** Extract `screenToPixel` with an explicit snapping mode, subsuming both `getPixelCoords` and `getOriginCoords`. Replace both call sites.
3. **`render/canvasBackground.ts`.** Extract from `Canvas.tsx:368-491` (the cached `ImageData` version — it is the better implementation). Replace `LightingCanvas.tsx`'s uncached `fillRect` version and `previewRenderer.ts`'s copy. **Resolve the grid-alpha question first.**
4. **Deduplicate `alphaBlend`** onto one implementation in `client/src/utils/alphaBlend.ts`; update `lightingRenderer.ts` and the `Canvas.tsx` inline copy.
5. **`render/renderFrameOverlay.ts`.** Unify #8 and #9 into one parameterised function (`{composite: "blend"|"overwrite", opacity, borderColor, offset?}`) and replace both call sites. **This is the riskiest step; write the golden-hash tests before making the switch.**
6. **`render/renderScene.ts` + `renderSelectionOverlay.ts` + `renderOriginCross.ts`** from concern #6.
7. Write golden-hash tests for each renderer: one per mode — normal, variant-edit, selection active, lasso, frame overlay, trace overlay.

## Constraints

- **Extract, do not redesign.** Behaviour must be identical except where a difference is called out and approved (grid alpha, and the #8/#9 unification's parameterisation).
- **Do not touch concerns 1, 2, 3, 10 or 11** — store binding, geometry, viewport, keyboard and pointer belong to the next two tasks.
- **Do not convert `Canvas.tsx` into a container or move it into `ui/components/`** here.
- Nothing in `client/src/ui/` may import from `stores/`, `store/`, `api/`, `services/` or `mobx`.
- Do not add a canvas-rendering native dependency.
- Do not change `LightingCanvas.tsx` beyond swapping its background call site.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx eslint . && bun run build && bunx storybook build
bunx vitest run src/ui/canvas                 # golden-hash tests per render mode
bunx vitest run                               # full suite, incl. task 08's utils tests
# The 4-level fallback exists in exactly one client place now:
test "$(grep -rn 'baseFrameOffsets?\.\[' src/components src/ui | wc -l)" -le 1
```

Manual checks — screenshot-compare each against the Storybook baseline:
1. Normal mode; variant-edit mode; selection active with marching ants; lasso in progress; frame overlay; trace overlay. **These six are exactly what the #8/#9 unification could break.**
2. The origin cross renders at the correct half-pixel position.
3. **Required:** screenshot **both** `Canvas` and `LightingCanvas` in **both** `lightGridMode` states. The grids must now agree — alpha `0.05`, `lightGridMode` honoured on both. `LightingCanvas`'s appearance changes; attach the before/after to the completion report.
4. Draw at brush size 1 and > 1 to confirm coordinate mapping is unchanged.
5. A variant layer with each of the four offset fallback levels renders in the same place as before.

## Definition of done

- [ ] `model/variantOffset.ts` and `model/coords.ts` exist; all 5 Canvas copies of the fallback and both coordinate functions are replaced; any drift found between the copies is reported.
- [ ] `render/canvasBackground.ts` replaces the Canvas, LightingCanvas and previewRenderer implementations, at alpha `0.05` with `lightGridMode` honoured on both canvases (owner decision, 2026-08-16); the four screenshots (2 canvases × 2 grid states) are attached to the completion report.
- [ ] **One parameterised `renderFrameOverlay.ts` replaces both #8 and #9** (~200 lines removed).
- [ ] `renderScene.ts`, `renderSelectionOverlay.ts` and `renderOriginCross.ts` exist.
- [ ] `alphaBlend` is deduplicated onto one implementation; if the implementations differed, the chosen behaviour is reported.
- [ ] Golden-hash tests exist for all six render modes and pass.
- [ ] Every extracted file lives under `client/src/ui/canvas/` and imports no store, API or MobX.
- [ ] `Canvas.tsx` is roughly 1,000 lines smaller and still behaves identically.
- [ ] Concerns 1, 2, 3, 10 and 11 were not touched.
