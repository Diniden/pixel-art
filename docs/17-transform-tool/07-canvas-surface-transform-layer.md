# 07 — `CanvasSurface` transform layer

**Wave:** W3 · **Depends on:** 05
**Touches:** `client/src/ui/components/CanvasSurface/CanvasSurface.tsx` · `client/src/ui/components/CanvasSurface/TransformChrome.tsx` (new) · `client/src/ui/components/CanvasSurface/OverlayCanvases.tsx` (new, only if `max-lines` requires it) · `client/src/ui/components/CanvasSurface/CanvasSurface.css` · `client/src/ui/components/CanvasSurface/CanvasSurface.stories.tsx` · `client/src/ui/components/CanvasSurface/__tests__/CanvasSurface.dom.test.tsx`
**Effort:** M

## Objective
`CanvasSurface` can host the transform preview and frame: an always-mounted raster overlay canvas
(`transformCanvasRef`) placed immediately after the pose canvas, and a `transformChrome` prop
rendered last in the SVG as a counter-scaled dashed outline with eight screen-constant handles.
Both are optional so every current caller compiles untouched; a story shows the frame.

## Context
- `client/src/ui/components/CanvasSurface/CanvasSurface.tsx` (976 raw lines, **≈400 code lines — at
  the `src/ui/**` `max-lines` error limit**). Layer order `:663-975`: pose canvas `:837-843`
  (`canvas__overlay canvas__overlay--pose`, 1:1 `cellWidth × cellHeight`), reflection canvas
  `:852-858`, SVG `:871-969` with `marchingAnts` via `ScreenWidthPath` `:890-913` and `originCross`
  as a counter-scaled group `:945-967` (`inverseScale :651`, `hasSvgChrome :653-661`).
  `ScreenWidthPath :548-568` documents that `vector-effect: non-scaling-stroke` does **not** work
  under the CSS `scale()`; it counter-scales stroke width and dash by `1 / combinedScale`. Props:
  `poseCanvasRef`, `reflectionCanvasRef?`, `combinedScale :341`, chrome `:392-434`. DOM order is
  z-order; **no numeric z-index** (stylelint error).
- From task 05: `TransformFrameOverlay` (`@/ui/canvas/svg/transformOverlay`), `HANDLE_SIZE_PX`
  (`@/ui/canvas/model/transform`). Tokens `ACCENT_PRIMARY`, `WHITE`.
- `CanvasSurface.css`: check whether `.canvas__overlay--pose` has its own rule; mirror it for
  `--transform` only if one exists (the generic `.canvas__overlay` rule usually suffices).
- Stories (832): `SvgChrome :696` builds chrome from the pure spec functions with **no store** — that
  is the `ui/` purity proof; add `TransformFrame` the same way. Dom test (1078): cursor pin `:177`;
  add mount / prop assertions.
- Budget: the only lines added to `CanvasSurface.tsx` are the two props, the canvas element, and
  one `<TransformChrome …/>` mount. If `bunx eslint` reports `max-lines` on it afterwards, extract the
  three always-mounted raster overlays (pose, reflection, transform) into `OverlayCanvases.tsx` (a
  pure component taking the three refs + `cellWidth/cellHeight`) and mount it in their place —
  behaviour-neutral, and the dom test's layer-order assertions must still pass.

## Steps
1. `TransformChrome.tsx` (pure): props `{ chrome: TransformFrameOverlay; inverseScale: number }`.
   Renders the outline as a `<path>` with `strokeWidth = 1 * inverseScale` and
   `strokeDasharray = "4 4"` scaled by `inverseScale` (the `ScreenWidthPath` recipe — reuse it if it is
   exported; otherwise apply the same arithmetic inline), then one
   `<g transform={`translate(${x} ${y}) scale(${inverseScale})`}>` per handle holding a
   `<rect x={-HANDLE_SIZE_PX/2} y={-HANDLE_SIZE_PX/2} width={HANDLE_SIZE_PX} height={HANDLE_SIZE_PX} fill={ACCENT_PRIMARY} stroke={WHITE} strokeWidth={1} />`
   with `data-handle={id}` and class `canvas__transform-handle`. `pointer-events: none` on the group
   (the canvas surface receives the pointer; hit-testing is mathematical).
2. `CanvasSurface.tsx`: props `transformCanvasRef?: RefObject<HTMLCanvasElement>` and
   `transformChrome?: TransformFrameOverlay`; mount the canvas after the pose canvas (class
   `canvas__overlay canvas__overlay--transform`, same size attributes as the pose canvas); include
   `transformChrome` in `hasSvgChrome`; render `<TransformChrome>` **after** `originCross`. Run
   eslint; extract `OverlayCanvases.tsx` only if it errors.
   Commit: `transform(07): CanvasSurface transform overlay + chrome`.
3. Story `TransformFrame` in `CanvasSurface.stories.tsx`: a rotated, scaled quad from
   `transformQuad` / `transformHandles` / `transformFrameOverlay` at `combinedScale` 8 and 24 (two
   stories or one with controls) — handles must look the same size in both.
4. Dom tests: the transform canvas mounts with the given ref and sits **after** the pose canvas and
   **before** the reflection canvas in DOM order; `transformChrome` renders one `path` + 8
   `[data-handle]` rects with `transform` attributes containing `scale(<inverseScale>)`; absent props
   render neither (and `hasSvgChrome` stays false when nothing else is passed).
   Commit: `transform(07): story + dom tests`.

## Constraints
- No store, no MobX in `ui/`. No numeric z-index. No change to the existing layer order or to any
  existing prop.
- No `vector-effect` reliance.
- `CanvasSurface.tsx` must have **no** `max-lines` error after this task (extract if needed and say so).

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/ui/components/CanvasSurface        # 0 errors — max-lines included
cd client && bunx vitest run src/ui/components/CanvasSurface    # green
cd client && bunx stylelint "src/**/*.css"                       # no new errors
cd client && bunx storybook build                                # exit 0
cd client && bun run lint:boundaries                             # 5/5
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules      # prints nothing
```
**Manual (required):** `bunx storybook dev` → `TransformFrame`: the dashed outline follows the
rotated quad; the eight handles are 8 px squares at both scales; the outline stroke is 1 px at both
scales; nothing is clipped. Record it.

## Definition of done
- [ ] Props, canvas mount, `TransformChrome`, story, dom tests in place; `OverlayCanvases.tsx` only if needed and stated.
- [ ] eslint 0 errors on the folder; stylelint no new errors; storybook builds; boundaries 5/5.
- [ ] Manual story check recorded.
- [ ] Two commits `transform(07):`; no lockfile.
