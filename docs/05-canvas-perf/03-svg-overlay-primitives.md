# 03 — SVG overlay primitives

**Wave:** W2 · **Depends on:** 01
**Touches:** `client/src/ui/canvas/svg/gridOverlay.ts` (new) · `client/src/ui/canvas/svg/chromeOverlay.ts` (new) · `client/src/ui/canvas/svg/__tests__/gridOverlay.test.ts` (new) · `client/src/ui/canvas/svg/__tests__/chromeOverlay.test.ts` (new)
**Effort:** M

## Objective

A new `ui/canvas/svg/` module turns the existing pure geometry functions into SVG path data,
so the chrome that must stay crisp at any zoom — grid lines, brush and hover outlines,
lasso, marching ants, origin cross, reflection guides — can be rendered as vectors with
`vector-effect: non-scaling-stroke` instead of rasterised into a canvas. Pure functions and
tests only; task 04 mounts them. **Creates only new files — collides with nothing.**

## Context

### Why these overlays cannot go 1:1 (this is the whole reason the task exists)

Task 02 makes canvases 1:1 with pixel data. Every painter that draws only cell **fills** is
fine. Painters that draw **sub-cell** or **screen-constant** geometry break, and mostly
break *silently*. Audited 2026-08-30:

| Painter | What happens at 1:1 |
| --- | --- |
| `strokeGrid` (`canvasBackground.ts:186-198`) | Lines at `x*zoom + 0.5` → one line per pixel column. The grid becomes a **flat wash of colour over the whole canvas**. |
| `strokeBrushOutlines` (`renderBrushOverlay.ts:151-158`) | `width: zoom - 1` → **`strokeRect(x, y, 0, 0)`**. |
| `strokeHoverOutline` (`renderHoverMarker.ts:129-142`) | `right = left + zoom - 1` → every edge is a **zero-length segment**, which with `lineCap: "butt"` renders **nothing at all**. No error, no artifact. |
| `drawMarchingAnts` (`renderSelectionOverlay.ts:303-334`) | Inner rect inset by 1 device px = one whole cell; `width - 2` inverts for selections under 3 cells. The `[4,4]` dash spans four cells. |
| `drawLasso` (`renderSelectionOverlay.ts:242-260`) | 2px line, `[3,3]` dash, vertices at half-cell offsets, on a buffer where a cell is 1px. |
| `drawOriginCross` (`renderOriginCross.ts:91-115`) | `ORIGIN_CROSS_SIZE = 12` is **documented at `:45-50` as screen-constant** ("deliberately not scaled by zoom"). Under CSS scale it becomes 12 × 50 = 600 screen px. Also `ctx.arc(radius 3)`. |
| `drawReflectionLines` (`renderReflectionLines.ts:165-187`) | `REFLECTION_DASH = 4` **documented at `:67-72` as screen-constant**. At zoom 20 a 4px dash becomes 80px, and the animation would jump 200px per tick. |

The last two are the clearest: their own comments state an invariant ("same visual size at
every zoom level") that CSS scaling **inverts**. `vector-effect: non-scaling-stroke` restores
exactly that invariant, natively.

### Why SVG and not a viewport-sized raster overlay

Measured. A raster overlay big enough to stay crisp costs, per canvas:

- scaled to the grid: **546 MB** at Landscapes/zoom 50 — the bug being fixed
- sized to the viewport: 4.9–22.7 MB each, **24–113 MB for five**, and it must be repainted
  on every pan and zoom, which defeats the point of moving to a GPU transform

SVG costs no raster memory, is composited by the GPU, and needs no repaint on zoom.

### The seam that makes this cheap

**Every one of these painters already separates pure geometry from stroking.** That split
was made for testability (the test stub cannot rasterise strokes), and it is exactly what
you need. The geometry functions already exist and are already tested:

| Geometry function | File |
| --- | --- |
| `gridLinePath(geom)` | `canvasBackground.ts:165-179` |
| `brushCellOutlines(cells, zoom)` | `renderBrushOverlay.ts:131-141` |
| `markerPerimeter(cells, zoom)` | `renderHoverMarker.ts:95-127` |
| `lassoPath(points, zoom, ox, oy)` | `renderSelectionOverlay.ts:226-236` |
| `marchingAntsRects(box, zoom, ...)` | `renderSelectionOverlay.ts:277-295` |
| `originCrossGeometry(origin, zoom)` | `renderOriginCross.ts:63-79` |
| `reflectionSegments(lines, draft, zoom, ox, oy)` | `renderReflectionLines.ts:107-120` |

**Do not modify them.** Import them, call them with **`zoom = 1`** (coordinates are now in
cell space, and the SVG's `viewBox` handles the mapping), and format the result as path data.

### Coordinate model

The SVG element sits **inside** `.canvas__layout`, so it inherits the same
`scale(zoom * viewZoom)` as the canvases. Give it:

- `viewBox="0 0 {cellWidth} {cellHeight}"` and `width={cellWidth} height={cellHeight}`, so
  one SVG user unit = one grid cell, matching the 1:1 canvases exactly
- `vector-effect="non-scaling-stroke"` on every stroked element, so `stroke-width="1"` is
  **1 screen pixel at any zoom**
- `shape-rendering="crispEdges"` on the grid, so lines land on pixel boundaries

Under `non-scaling-stroke`, `stroke-dasharray` is also in screen units — so
`REFLECTION_DASH = 4` and the marching-ants `[4,4]` keep their documented meaning for free.

⚠️ **Drop the `+ 0.5` half-pixel offsets.** They exist to centre a 1px canvas stroke on a
device pixel (`canvasBackground.ts:167-169`). SVG with `non-scaling-stroke` handles this;
keeping them shifts everything half a cell.

### Purity — this is `ui/`

No store, no MobX, no API, no React. **Emit data — path strings and attribute objects — not
JSX.** Task 04 renders it. That keeps these testable as pure functions, matching every other
module under `ui/canvas/`.

Follow `ui/canvas/render/renderLayerView.ts` for house style: a header explaining *why*,
pure exported functions, cells opaque via callbacks.

### Two modules

- **`gridOverlay.ts`** — the pixel grid only. Its own module because the grid is static per
  geometry and task 06 may serve it from CSS instead; keeping it separate means task 06 can
  drop it without disturbing the chrome. Build on `gridLinePath`.
- **`chromeOverlay.ts`** — brush outline, hover outline, lasso, marching ants, origin cross,
  reflection guides. One exported function per overlay, each returning path data plus the
  stroke attributes (colour, width, dash, dash-offset) taken from the **existing style
  constants** — `BRUSH_OVERLAY_STYLE`, `HOVER_MARKER_STYLE`, `SELECTION_COLOR`,
  `ORIGIN_CROSS_SIZE`, `REFLECTION_DASH`, and the tokens in `ui/theme/canvasTokens.ts`.
  **Do not invent new colours or widths.**

The origin cross needs a `<circle>` (radius 3, screen-constant) as well as two lines — model
that in your returned shape rather than forcing everything into one path string.

The reflection guides animate: `renderReflectionLines.ts` drives `lineDashOffset` from a
~12 fps ticker. Expose `dashOffset` as a parameter so task 04 can keep driving it (a CSS
`stroke-dashoffset` animation would also work and is worth noting, but **do not build it
here** — keep this module pure and let task 04 choose).

## Steps

1. Create `ui/canvas/svg/gridOverlay.ts`. Export a function taking `{cellWidth, cellHeight}`
   and returning the grid path data plus stroke attributes. Reuse `gridLinePath` with
   `zoom = 1`; drop the `+ 0.5`. Preserve the measured alpha rule documented at
   `canvasBackground.ts:19-24`: **black 8% in light mode, white 5% in dark mode**
   (`BLACK_08` / `WHITE_05` in `ui/theme/canvasTokens.ts`).
2. Create `ui/canvas/svg/chromeOverlay.ts` with one exported function per overlay, each
   importing the corresponding existing geometry function and its existing style constants.
3. Commit after step 2.
4. Write `__tests__/gridOverlay.test.ts`: correct line count (`cells + 1` per axis — see
   `canvasBackground.ts:163`), no `+ 0.5`, correct alpha per mode.
5. Write `__tests__/chromeOverlay.test.ts`, one block per overlay. Assert the path data, and
   assert **`vector-effect: non-scaling-stroke` is present on every stroked element** — that
   is the property the whole task depends on.
6. Add a test proving the geometry is **zoom-independent**: the same input produces identical
   path data regardless of any zoom value in scope. This is the regression guard against
   someone reintroducing a `* zoom`.
7. Run the gate. Commit.

## Constraints

- **Do not modify anything under `ui/canvas/render/`.** Import from it only. Those modules
  keep working for the fill-only paths (D6) and their golden-hash tests must stay green.
- **Do not modify `ui/theme/canvasTokens.ts`.** It has a parity test against `tokens.css`
  (`ui/theme/__tests__/canvasTokens.test.ts`).
- **Do not touch `CanvasSurface.tsx` or any container.** Task 02 is editing `CanvasSurface`
  in parallel — touching it breaks the collision matrix.
- **No React, no JSX, no store, no MobX, no API.** Data out only.
- Do not invent colours, widths or dash patterns; reuse the existing constants.
- Do not build the reflection animation here.

## Verification

```sh
bun run --cwd client typecheck
cd client && bunx vitest run
bun run --cwd client lint
bun run --cwd client lint:boundaries
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # must print nothing
```

All exit 0, corpus snapshots unchanged. Paste real output.

Confirm explicitly in your report:

1. Existing `ui/canvas/render/` tests still pass **unchanged** — you imported, did not modify.
2. Every stroked element carries `vector-effect="non-scaling-stroke"`.
3. The zoom-independence test passes.

No manual app checks in this task — nothing is mounted yet. That is task 04.

## Definition of done

- [ ] `ui/canvas/svg/gridOverlay.ts` exists, pure, built on `gridLinePath`, alpha rule preserved.
- [ ] `ui/canvas/svg/chromeOverlay.ts` covers all six chrome overlays.
- [ ] Every geometry function imported unmodified; nothing under `ui/canvas/render/` edited.
- [ ] All existing style constants reused; no new colours, widths or dashes.
- [ ] `+ 0.5` offsets dropped; `viewBox` model documented in the module header.
- [ ] Origin cross returns its circle as well as its lines.
- [ ] Reflection guides accept `dashOffset` as a parameter; no animation built.
- [ ] Both test files written; `non-scaling-stroke` asserted on every stroked element.
- [ ] Zoom-independence test passes.
- [ ] No React/JSX/store/MobX/API in either module.
- [ ] All four gate commands exit 0; output pasted.
- [ ] No lockfile.
- [ ] Two commits (step 3, step 7).
