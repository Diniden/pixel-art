# 04 — `drawLitComposite`: the lit composite at a real camera scale

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/canvas/render/renderLitComposite.ts` (new) · `client/src/ui/canvas/render/__tests__/renderLitComposite.test.ts` (new)
**Effort:** S

## Objective
A pure `ui/` painter that draws an already-lit composite buffer into a canvas at an arbitrary
integer `zoom` filling the whole pane — the Preview render mode's painter. Unlike the existing
thumbnail painter it does **not** letterbox into a fixed 200 px box and does **not** crop sprites
larger than the box.

## Context
- **Why not reuse `renderLightingPreview`.** `client/src/ui/canvas/render/renderLightingPreview.ts`
  (217 lines) exists to fit a sprite into the 200 px floating panel:
  `previewPlacement(objWidth, objHeight, thumbSize = 200)` at `:80-98` computes
  `zoom = max(1, floor(thumbSize / max(w, h)))` and centres with `offsetX/offsetY`; a sprite
  larger than 200 px gets factor 1 and is **cropped, not shrunk** (documented `:29-32`). The new
  pane is a real editor-sized viewport driven by the shared pixel `zoom` and its own camera, so
  the fit logic is wrong for it. Leave `renderLightingPreview.ts` **completely untouched** — the
  floating panel still uses it until task 06 retires the panel, and its golden-hash tests
  (`__tests__/renderLightingPreview.test.ts:109`) must not move.
- **The lighting maths is already done elsewhere and stays there.** `utils/lightingRenderer.ts`
  (553 lines) owns `composeLayers(frame, gridWidth, gridHeight, baseFrameIndex, variants,
  variantFrameIndices): ComposedBuffers` (`:103-108`) and
  `renderWithLighting(composed, params): ImageData` (`:351-354`, `LightingParams` `:5-10` — a
  single directional light: `lightDirection`, `lightColor`, `ambientColor`, `heightScale?`).
  Those read pixel grids, so they live in `utils/`, **not** `ui/`. This painter takes the
  **already-lit `ImageData`** as input, exactly as `renderLightingPreview` takes `lit: PixelBuffer`
  (`:100-113`). The container (task 05) runs the pipeline and hands the result over.
- **The analogue to copy is `renderNormalEdit.ts`** (135 lines) — the same "1:1 source buffer,
  nearest-neighbour upscale by `zoom`, checkerboard behind" job for the edit canvas:
  `renderNormalEdit(buffer, opts): PixelBuffer` `:75-135`, options `:46-65`
  (`source: PixelBuffer`, `gridWidth`, `gridHeight`, `zoom`, `theme: BackgroundTheme`); it calls
  `paintCheckerboard(buffer, geom, theme)` `:95` with `offsetX/offsetY = 0` `:91-92`, then the
  `floor(x / zoom)` upscale with source-over compositing `:97-132`, and leaves grid strokes to the
  caller `:23-28`. Copy that structure closely.
- `PixelBuffer` is exported from `renderLightingPreview.ts:44-48`; `BackgroundTheme` /
  `paintCheckerboard` / `backgroundTheme` come from `ui/canvas/render/canvasBackground.ts`
  (`backgroundTheme(lightGridMode)` at `:93-94`). Import types from where they already live —
  do not redeclare them.
- **Test rig:** `ui/canvas/render/__tests__/renderNormalEdit.test.ts` — golden hashes `:75`,
  property assertions `:93`, both `lightGridMode` states `:5`. Shared fixtures in
  `__tests__/fixtures.ts`. Vitest: `*.test.ts` = node lane.

## Steps
1. Create `client/src/ui/canvas/render/renderLitComposite.ts`:
   ```ts
   export interface DrawLitCompositeOptions {
     /** The already-lit composite, 1 px per object cell (`renderWithLighting`'s output). */
     source: PixelBuffer;
     /** The object's own cell dimensions — `source` is exactly this size. */
     objWidth: number;
     objHeight: number;
     /** Shared pixel scale. The pane is `objWidth * zoom` × `objHeight * zoom`. */
     zoom: number;
     theme: BackgroundTheme;
   }
   export function drawLitComposite(
     buffer: PixelBuffer,
     opts: DrawLitCompositeOptions,
   ): PixelBuffer
   ```
   Behaviour: checkerboard the full buffer via `paintCheckerboard` with `offsetX/offsetY = 0` and
   `cellsX/cellsY = objWidth/objHeight`, then nearest-neighbour upscale `source` by `zoom`
   (`floor(x / zoom)`, `floor(y / zoom)`), source-over composited so transparent lit pixels show
   the checkerboard. No letterboxing, no centring, no crop — the buffer **is**
   `objWidth * zoom` × `objHeight * zoom`. Header comment in house style: dated block name, and
   the one ⚠️ — this is deliberately **not** `renderLightingPreview`, and why (fixed-thumb fit vs.
   camera scale); grid strokes and the border are the caller's, as in `renderNormalEdit`.
2. Test `renderLitComposite.test.ts`, modelled on `renderNormalEdit.test.ts`:
   - a 2×2 source at `zoom: 3` produces 6×6 with each source pixel occupying an exact 3×3 block
     (assert corner and centre pixels of two different blocks);
   - a fully transparent source leaves the checkerboard visible (and differs between
     `backgroundTheme(true)` and `backgroundTheme(false)`);
   - a fully opaque source completely hides the checkerboard;
   - partial alpha composites over the checkerboard rather than replacing it;
   - `zoom: 1` reproduces the source 1:1;
   - a large sprite (e.g. 300×300) is **not** cropped — the output is 300·zoom wide and the
     bottom-right source pixel appears (the explicit contrast with `previewPlacement`);
   - a golden hash of one representative render, following the existing suite's hashing helper.
3. Commit: `feat(ui): drawLitComposite painter for the lighting preview pane`.

## Constraints
- Pure `ui/`: no store, MobX or API import. Do not import from `utils/lightingRenderer.ts` — that
  module reads project grids; the lit buffer arrives as a parameter.
- **Do not modify** `renderLightingPreview.ts`, `renderNormalEdit.ts`, `canvasBackground.ts`, or
  any existing golden hash.
- Do not draw grid lines or a border here; the caller owns those.
- Never run `vitest -u`.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/ui/canvas
cd client && bunx vitest run src/ui/canvas/render      # pass, incl. new file; existing goldens UNCHANGED
cd client && bun run lint:boundaries                   # OK — all 5 rules hold
cd client && bunx prettier --check src/ui/canvas/render/renderLitComposite.ts src/ui/canvas/render/__tests__/renderLitComposite.test.ts
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
**Manual:** none — this is a pure function with no UI. The visual check happens in task 05.

## Definition of done
- [ ] `drawLitComposite` exists with the signature above; tests pass.
- [ ] The large-sprite no-crop case is asserted.
- [ ] `renderLightingPreview.ts` and its goldens are untouched.
- [ ] One commit, only the two `Touches` files staged.
