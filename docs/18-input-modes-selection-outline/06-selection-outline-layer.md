# 06 — `SelectionOutlineLayer`: screen-space selection chrome in `CanvasSurface`

**Wave:** W2 · **Depends on:** 03, 04
**Touches:** `client/src/ui/components/CanvasSurface/SelectionOutlineLayer.tsx` (new) · `client/src/ui/components/CanvasSurface/__tests__/SelectionOutlineLayer.dom.test.tsx` (new) · `client/src/ui/components/CanvasSurface/CanvasSurface.tsx` · `client/src/ui/components/CanvasSurface/CanvasSurface.css` · `client/src/ui/components/CanvasSurface/CanvasSurface.stories.tsx` · `client/src/ui/components/CanvasSurface/__tests__/CanvasSurface.dom.test.tsx`
**Effort:** M

## Objective

The marching ants and the lasso rubber band render in a new **unscaled, screen-space SVG** that
sits over the canvas.

- **The ants** are the bounding box, drawn from device-snapped geometry. They are exactly
  `max(1, round(dpr))` device pixels wide (1 CSS px), on the boundary between cells, crisp at
  every zoom, with no counter-scaling and no antialiasing blur.
- **The lasso band** is 1 CSS px at every zoom, where today it is 2 cells.
- **Neither is drawn** in the cell-space `.canvas__svg` any more.
- **Both studios benefit:** the pixel canvas and the brush studio render through this component.

## Context

- **Locked decisions:** MASTER D15, D17, D18, D19, D21. Read them.
- **Inputs from W1:**
  - Task 03, `client/src/ui/canvas/svg/screenChrome.ts`: `screenSelectionRect`,
    `screenLassoPath`, `strokeCssPx`, `ANTS_DASH_PX = 4`, `LASSO_DASH_PX = 3`, `ScreenView`.
    `marchingAntsOverlay()` now returns `{ outer, inner, box }`, and `lassoOverlay()` returns
    `{ d, attrs, points }`.
  - Task 04, `client/src/ui/hooks/useScreenPixelGrid.ts`: `useScreenPixelGrid(containerRef)`
    returns `{ dpr, originX, originY }`.
- **Current structure** of `CanvasSurface.tsx`, measured on `096513f`. Anchor on the symbols.
  - `<div className="canvas__viewport" ref={containerRef} tabIndex={0}>` is at `:665`.
    `containerRef: RefObject<HTMLDivElement | null>` is the prop at `:259`.
  - `.canvas__layout` carries `transform: translate(pan) scale(combinedScale)` (`:666-677`).
  - The cell-space `<svg className="canvas__svg">` is at `:871-969`:
    - the lasso is rendered by `<OverlayPath spec={lasso}>` at `:888`;
    - the ants by the `.canvas__svg-ants` group with two `ScreenWidthPath`s at `:890-913`;
    - `hasSvgChrome` (`:653-661`) includes `hasPath(lasso)` and `!!marchingAnts`.
  - `{viewControls}` is rendered after `.canvas__layout` at `:972`, inside the viewport.
  - `ScreenWidthPath` (`:570-601`) and `ANTS_DASH` (`:604`) are **still used by the variant box**
    (`:914-934`). Keep them.
  - The props `lasso?: SvgPathSpec | null` and
    `marchingAnts?: { outer: SvgPathSpec; inner: SvgPathSpec } | null` are at `:404-411`. Retype
    them to `LassoOverlay | null` and `MarchingAntsOverlay | null` from `chromeOverlay.ts`.
    Callers already pass exactly those objects: `CanvasContainer.tsx:5949-5976` and
    `useBrushSelection.ts:292-305`, via `BrushCanvasContainer.tsx:515`. **No container edits.**
  - The file is **348 code lines**. The `ui/` `max-lines` **error** is at 400. Moving the ants and
    lasso JSX out should reduce it. Measure with
    `bunx eslint --rule '{"max-lines":["error",{"max":1,"skipBlankLines":true,"skipComments":true}]}' <file>`.
- **CSS** (`CanvasSurface.css`):
  - `.canvas__svg` has `crispEdges` (`:343-351`).
  - `.canvas__svg-ants` is in the `geometricPrecision` opt-out list (`:374-378`), with a long
    comment explaining it. Remove it from that list and from the comment: the ants no longer live
    there.
  - `.canvas__viewport` has `position: relative` and `overflow: hidden` (`:30-50`).
  - z-index tokens (`client/src/styles/tokens.css:433-434`): `--z-canvas-overlay: 20` sits below
    `--z-overlay-control: 30`, which the view controls should keep. Check that the view-controls
    element really sits above 20. If it does not use `--z-overlay-control`, make sure the new
    layer's DOM order and z-index still leave the controls clickable and visible. The layer is
    `pointer-events: none`, so clicks pass through regardless. Visual stacking is the concern.
  - **⚠️ Never add `will-change`** to `.canvas__layout` (`:53-72`).
  - The class naming is BEM, and `bunx stylelint "src/**/*.css"` enforces it.
- **Why the old tests change.** `CanvasSurface.dom.test.tsx` pins the old mechanism:
  - `:928-958` "strokes the marching ants twice, out of phase" (in `.canvas__svg-ants`);
  - `:974-1001` the counter-scaled width and dash (`stroke-width * scale ≈ 1`);
  - `:1037-1077` the `shape-rendering` CSS, including `.canvas__svg-ants`.

  Those assert the **implementation** this task deliberately replaces. **Rewrite them** to assert
  the same user-facing guarantees on the new layer: drawn twice, out of phase; a width that is
  constant across zooms and equals `strokeCssPx(dpr)`; `crispEdges` on the ants. State in the
  commit message which assertions were replaced and why. **These are not snapshots. Never run
  `vitest -u`.**
- **Stories:**
  - `SvgChrome` (`CanvasSurface.stories.tsx:676-735`) already passes `marchingAnts` and `lasso`
    built by the real builders, so it should just work. Verify it visually.
  - `SelectionActive` (`:447-490`) still paints **stale canvas ants** into the 1:1 canvas
    (`strokeRect(box.x + 0.5, …)`). Replace that painting with a `marchingAnts` prop from
    `marchingAntsOverlay(...)`.

## Steps

1. Create `SelectionOutlineLayer.tsx` (pure `ui/`):
   ```tsx
   export interface SelectionOutlineLayerProps {
     containerRef: RefObject<HTMLElement | null>;
     combinedScale: number;
     viewPanOffset: { x: number; y: number };
     marchingAnts?: MarchingAntsOverlay | null;
     lasso?: LassoOverlay | null;
   }
   ```
   - Call `useScreenPixelGrid(containerRef)` and build
     `view: ScreenView = { scale: combinedScale, panX, panY, originX, originY, dpr }`.
   - Return `null` when there is nothing to draw (no ants box and fewer than 2 lasso points).
   - Otherwise render
     `<svg className="canvas__screen-chrome" aria-hidden="true" focusable="false">`, with no
     `viewBox`: user units are CSS px.
   - **Ants** (`<g className="canvas__screen-chrome-ants">`): the same `d` from
     `screenSelectionRect(marchingAnts.box, view)`, twice:
     - `stroke={SELECTION_COLOR}`, `strokeDasharray="4 4"`;
     - `stroke={WHITE}`, `strokeDasharray="4 4"`, `strokeDashoffset={4}`;
     - both with `strokeWidth={strokeCssPx(dpr)}` and `fill="none"`.
     - Import the colours from `renderSelectionOverlay` and `canvasTokens`, and the dash values
       from the `screenChrome` constants.
   - **Lasso** (`<g className="canvas__screen-chrome-lasso">`): `screenLassoPath(lasso.points, view)`,
     `stroke={SELECTION_COLOR}`, `strokeDasharray="3 3"`, `strokeWidth={strokeCssPx(dpr)}`,
     `fill="none"`.
   - Header: why screen space (quote the blur and fat-line causes from MASTER §1), and why no
     counter-scale here.
2. In `CanvasSurface.tsx`:
   - Retype the two props.
   - Remove the lasso `OverlayPath` and the ants group from `.canvas__svg`.
   - Drop `hasPath(lasso)` and `!!marchingAnts` from `hasSvgChrome`.
   - Render `<SelectionOutlineLayer containerRef={containerRef} combinedScale={combinedScale} viewPanOffset={viewPanOffset} marchingAnts={marchingAnts} lasso={lasso} />`
     immediately **after** the closing `</div>` of `.canvas__layout` and **before**
     `{viewControls}`.
   - Update the prop doc comments and the comment above `ScreenWidthPath`. It now serves only the
     variant box, and the ants moved to `SelectionOutlineLayer`.
3. In `CanvasSurface.css`, add:
   ```css
   .canvas__screen-chrome { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: hidden; z-index: var(--z-canvas-overlay); }
   .canvas__screen-chrome-ants { shape-rendering: crispEdges; }
   .canvas__screen-chrome-lasso { shape-rendering: geometricPrecision; }
   ```
   Also remove `.canvas__svg-ants` from the opt-out selector list and rewrite that comment
   paragraph. Add a comment explaining why the ants are `crispEdges` here: the geometry is
   already device-snapped, so crispEdges only removes antialiasing and cannot move the line.
4. **Commit** as `feat(18/06): screen-space selection outline layer`.
5. Create `__tests__/SelectionOutlineLayer.dom.test.tsx`. Stub `devicePixelRatio = 2` and the
   container's `getBoundingClientRect` (`left: 100.3, top: 40.5`). Then check:
   - With `box {x:3, y:2, width:4, height:5}`, `combinedScale 7.3`, pan `(10.25, 3.5)`, the path's
     `d` equals the hand-computed snapped rect. Compute it in the test comments from D16, not by
     calling `screenSelectionRect`.
   - Two ant paths exist, the second with `stroke-dashoffset` 4, and both have `stroke-width` 1
     at DPR 2 (2 device px / 2).
   - Changing `combinedScale` to 50 leaves `stroke-width` unchanged.
   - With DPR 1, the stroke width is 1. With DPR 3, it is 1.
   - The lasso draws with `stroke-width = strokeCssPx(dpr)`, **not** 2.
   - Nothing renders with no ants and no lasso.
6. Rewrite the old `CanvasSurface.dom.test.tsx` blocks named in Context:
   - ants are no longer inside `.canvas__svg`, and **are** inside `.canvas__screen-chrome`, which
     is a child of `.canvas__viewport` and **not** a descendant of `.canvas__layout`;
   - screen-constant width across zooms;
   - the CSS `shape-rendering` assertions: `.canvas__screen-chrome-ants` is crispEdges,
     `.canvas__screen-chrome-lasso` is geometricPrecision, and the remaining opt-outs are the
     origin and the guides.

   Keep the variant-box assertions as they are.
7. Update the `SelectionActive` story (step in Context). Check that `SvgChrome` renders.
8. **Commit** as `test(18/06): screen-space outline tests, stories`.

## Constraints

- **No container edits** (D19). If a container change seems necessary, stop and report it.
- Do not move `variantBox`, `brushOutline`, `hoverOutline`, `grid` or `originCross` (D21).
- Do not change `.canvas__layout`'s transform or add any layer-promotion hint.
- `CanvasSurface.tsx` stays under 400 code lines. Measure and paste the number.
- Pure `ui/`: no store, no `observer`.

## Verification

```sh
cd client
bunx tsc --noEmit
bunx vitest run src/ui/components/CanvasSurface src/ui/canvas/svg src/containers/brush/__tests__/useBrushSelection.dom.test.ts
bunx vitest run                                   # full suite — needs the corpus fixtures copied in the worktree
bunx eslint .
bunx stylelint "src/**/*.css"
bun scripts/check-boundaries.mjs
bunx eslint --rule '{"max-lines":["error",{"max":1,"skipBlankLines":true,"skipComments":true}]}' src/ui/components/CanvasSurface/CanvasSurface.tsx   # paste N; must be < 400
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```

**Manual checks (required; run `bun run dev` and open the pixel studio):**

1. Make a rect selection. At zoom 1, around 7, and at max zoom, the outline is a crisp dashed
   cyan/white line of the same thin width at all three. It is not blurry and does not get thicker.
2. It sits exactly on the boundary between selected and unselected cells. Check a corner at high
   zoom: the line straddles the edge and does not cover half a cell.
3. Drag-pan slowly and pinch or ctrl-zoom. The line stays crisp throughout. It may shimmer by one
   device pixel as it re-snaps, but it never blurs. It stays glued to the artwork, with no
   visible lag.
4. Draw a lasso at high zoom. The rubber band is thin, not fat. Commit it. The bounding-box ants
   appear.
5. Magic wand and colour select: the ants are the bounding box, and crisp.
6. Brush studio: make a selection. Same crisp result.
7. Move a selection (drag pixels). The ants follow the drag offset.
8. Storybook: `SvgChrome` and `SelectionActive` render the new outline.

Record each result in your report. Any check not done means the task is **PARTIAL**.

## Definition of done

- [ ] The ants and lasso render only in `.canvas__screen-chrome`, outside `.canvas__layout`.
- [ ] The width is `strokeCssPx(dpr)` at every zoom. The ants are `crispEdges` and device-snapped.
- [ ] No container file changed.
- [ ] The new and rewritten tests are green, and no snapshot was updated.
- [ ] `CanvasSurface.tsx` is under 400 code lines (number pasted).
- [ ] tsc, eslint, stylelint and the boundary check are clean, and there is no lockfile.
- [ ] All eight manual checks are recorded.
- [ ] Two commits.
