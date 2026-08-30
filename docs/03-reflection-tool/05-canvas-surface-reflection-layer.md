# 05 — Sixth overlay canvas on `CanvasSurface`

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/components/CanvasSurface/CanvasSurface.tsx` · `client/src/ui/components/CanvasSurface/CanvasSurface.css` · `client/src/ui/components/CanvasSurface/CanvasSurface.stories.tsx` · `client/src/ui/components/CanvasSurface/__tests__/CanvasSurface.dom.test.tsx`
**Effort:** S

## Objective
`CanvasSurface` accepts a `reflectionCanvasRef` and always mounts a dedicated
`<canvas class="canvas__overlay canvas__overlay--reflection">` above the hover canvas,
so the animated guide lines never repaint the main surface.

## Context
- `CanvasSurface.tsx` (250 lines) mounts five canvases, documented at `:43-59`; the hover
  canvas at `:209-216` is the precedent for an **always-mounted** overlay with its own
  invalidation. Props interface at `:78-153`.
- Stacking: overlays are absolutely positioned siblings inside `.canvas__frame`; DOM order
  is z-order. Put the reflection canvas **last** in the frame so the guides stay visible
  above the hover marker and the semi-transparent trace/onion overlays. `pointer-events`
  must be `none` like the other overlays (check `.canvas__overlay` in the CSS, `:88+`).
- CSS is BEM, tokens only, no numeric z-index (`stylelint`). Add a
  `.canvas__overlay--reflection` modifier only if a rule is needed; if the base
  `.canvas__overlay` already covers it, add no CSS and say so.
- The dom test (`__tests__/CanvasSurface.dom.test.tsx`) composes the stories; read it —
  it may count canvases or assert class order. Stories at `CanvasSurface.stories.tsx`
  (412 lines) pass refs; add the new ref to every story's args/decorator the same way
  `hoverCanvasRef` is passed.

## Steps
1. Add `reflectionCanvasRef?: RefObject<HTMLCanvasElement | null>` to the props (optional — locked D9,
   documented in the header list as item 6 with the rationale: animated guide lines at
   ~12 fps must not touch the 300k-cell main render).
2. Mount the canvas last inside `.canvas__frame`, `width={canvasWidth}
   height={canvasHeight}`, className `canvas__overlay canvas__overlay--reflection`.
3. Update stories and the dom test (expected canvas count / class list).
4. Commit: `feat(ui): reflection overlay canvas on CanvasSurface`.

## Constraints
- Do not touch `CanvasContainer.tsx` (task 07 passes the ref).
- No behaviour change to the existing five canvases.

## Verification
```sh
cd client && bunx tsc --noEmit        # exit 0 — the prop is OPTIONAL (locked, D9) so CanvasContainer compiles until task 07 passes it
cd client && bunx vitest run src/ui/components/CanvasSurface 2>&1 | tail -6
cd client && bunx stylelint "src/ui/components/CanvasSurface/*.css"
cd client && bunx storybook build 2>&1 | tail -3
```
Manual: `bun run storybook:dev`, open Components/CanvasSurface — six canvases stacked,
no layout shift.

## Definition of done
- [ ] Optional `reflectionCanvasRef` prop; canvas mounted last, pointer-events none.
- [ ] Stories and dom test updated and green; storybook builds.
- [ ] `tsc` exits 0 in this task's own state (prop optional).
