# 04 — `drawLayerView` (pure) and an `enabled` gate on `useCanvasKeyboard`

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/canvas/render/renderLayerView.ts` (new) · `client/src/ui/canvas/render/__tests__/renderLayerView.test.ts` (new) · `client/src/ui/hooks/useCanvasKeyboard.ts` · `client/src/ui/hooks/__tests__/useCanvasKeyboard.dom.test.ts`
**Effort:** S

## Objective
Two pure `ui/` pieces the Layer Render Mode container (task 05) needs: (1) `drawLayerView`, a
`ctx.fillRect` painter that draws a list of layers' cells into a canvas at `zoom` **with no
offset, no dimming and no view-union** — the layer's own canvas at its own size; (2) an
`enabled?: boolean` option on `useCanvasKeyboard` so that when two canvas containers are
mounted, exactly one of them handles WASD / undo / delete / tool hotkeys instead of both
firing on every keypress.

## Context
- **Why a second painter instead of reusing the Full render:** `CanvasContainer.tsx:698-707`
  documents that the main render is `fillRect`-based and was deliberately NOT swapped onto the
  buffer compositor `renderScene.ts` because alpha compositing differs visibly. The Layer view
  is a *new* view with no visual baseline, but for consistency with what the user sees in the
  Full view it uses the **same `fillRect` + `rgba()` technique**. Analogues: the regular-layer
  loop inside `render` at `CanvasContainer.tsx:~870-900` (normal branch) and the pure painter
  `client/src/ui/canvas/render/renderOriginCross.ts` (`drawOriginCross(ctx, …)`), whose test
  `__tests__/renderOriginCross.test.ts` uses a fake `ctx` that records calls — copy that rig.
  Shared test fixtures: `__tests__/fixtures.ts` (`getPixelColor`, `RED`, `TestCell`).
- Cell type: `PixelData` cells are `unknown` to `ui/canvas/render` — every painter takes a
  `getPixelColor: (cell: unknown) => RgbaPixel | null` callback (`renderScene.ts:108`). Reuse
  the `RgbaPixel` type exported from `renderScene.ts`.
- Keyboard hook: `client/src/ui/hooks/useCanvasKeyboard.ts`. Options interface
  `CanvasKeyboardOptions` at `:104-136`; the handler `handleCanvasKeyDown(e, o)` at `:151`;
  registration on `window` with `useCapture = true` at `:306-320` **must stay** (the capture
  order relative to `FrameTimeline` and `GlobalHotkeys` is documented as load-bearing). Options
  are read through `useLatest`, so an `enabled` flag read at event time costs nothing and
  needs no re-registration. Existing tests: `__tests__/useCanvasKeyboard.dom.test.ts` (WASD
  pins at `:220`, `:235`).
- Two containers each calling `useCanvasKeyboard` would otherwise register two capture
  listeners and **double every WASD nudge and every ⌘Z** (each is a history entry).

## Steps
1. Create `client/src/ui/canvas/render/renderLayerView.ts`:
   ```ts
   export interface LayerViewLayer { visible: boolean; pixels?: ReadonlyArray<ReadonlyArray<unknown>> | undefined; id?: string | undefined }
   export interface DrawLayerViewOptions {
     layers: ReadonlyArray<LayerViewLayer>;   // painted in array order (bottom → top)
     gridWidth: number; gridHeight: number;   // the layer's OWN canvas size
     zoom: number;
     getPixelColor: (cell: unknown) => RgbaPixel | null;
     /** Move-tool live preview: shift cells of layers for which `movesWithDrag(layer)` is true. */
     moveDx?: number; moveDy?: number;
     movesWithDrag?: (layer: LayerViewLayer) => boolean;
   }
   export function drawLayerView(ctx: CanvasRenderingContext2D, opts: DrawLayerViewOptions): void
   ```
   For each visible layer, for `y < gridHeight`, `x < gridWidth`: skip `null`/`a === 0`; apply
   the drag shift if `movesWithDrag?.(layer)`; drop cells that leave the grid; `ctx.fillStyle =
   \`rgba(r, g, b, a/255)\``; `ctx.fillRect(x*zoom, y*zoom, zoom, zoom)`. Full opacity always —
   no `layerFocusMode` dimming (the Layer view shows one canvas, there is nothing to dim
   against). Header comment in house style stating exactly that and pointing at task 05's
   render branch as the caller.
2. Test `renderLayerView.test.ts` with a recording fake ctx: paints only visible layers;
   respects `gridWidth/gridHeight` (a 3×3 grid with a 4-wide row paints 3 cells per row);
   `moveDx` shifts only the layer the predicate selects and drops cells shifted off-grid;
   transparent cells produce no `fillRect`; rows beyond `pixels.length` are skipped.
3. In `useCanvasKeyboard.ts` add to `CanvasKeyboardOptions`:
   ```ts
   /** When false the handler ignores every key. Exactly one canvas container may be enabled at a time. */
   enabled?: boolean;
   ```
   and as the **first line** of `handleCanvasKeyDown`: `if (o.enabled === false) return;`.
   Default (`undefined`) is enabled — no existing call site changes behaviour.
4. Add a test: with `enabled: false`, `w` does not call `setVariantOffset` and ⌘Z does not
   call `undo`; with `enabled` omitted, the existing `:220` expectation still holds.
5. Commit: `feat(ui): drawLayerView painter and an enabled gate for useCanvasKeyboard`.

## Constraints
- `ui/` purity: no store, MobX, API imports.
- Do not change the `window` capture registration in `useCanvasKeyboard`.
- Do not modify `renderScene.ts` or the main render in `CanvasContainer`.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/ui/canvas src/ui/hooks
cd client && bunx vitest run src/ui/canvas/render src/ui/hooks      # pass, incl. new tests
cd client && bun run lint:boundaries
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules         # nothing
```

## Definition of done
- [ ] `drawLayerView` exists with the signature above and its tests pass.
- [ ] `enabled: false` silences the keyboard map; default behaviour unchanged; tests pass.
- [ ] One commit, only the four `Touches` files staged.
