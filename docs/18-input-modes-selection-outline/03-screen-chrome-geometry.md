# 03 — Screen-space outline geometry

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/canvas/svg/screenChrome.ts` (new) · `client/src/ui/canvas/svg/__tests__/screenChrome.test.ts` (new) · `client/src/ui/canvas/svg/chromeOverlay.ts` · `client/src/ui/canvas/svg/__tests__/chromeOverlay.test.ts`
**Effort:** M

## Objective

Pure functions turn a selection rectangle given in **cell** coordinates into an SVG path in
**viewport-local screen CSS px**, with every edge snapped so a line exactly
`max(1, round(dpr))` device pixels wide covers whole device pixels on the boundary between cells.
They also turn lasso vertices into an unsnapped screen path. `marchingAntsOverlay` and
`lassoOverlay` additionally expose the cell-space geometry they already compute (`box`,
`points`), so task 06 can render from it without any container changing.

## Context

- **Locked decisions:** MASTER D16 (the snapping formula), D17 (ants look), D18 (lasso), D19
  (keep the prop API: add `box` and `points`).
- **Why this is needed.** The current ants are a cell-unit SVG path inside `.canvas__layout`,
  which carries `transform: translate(pan) scale(combinedScale)` (`CanvasSurface.tsx:666-677`).
  - The 1 px width is faked by counter-scaling (`ScreenWidthPath`, `CanvasSurface.tsx:570-601`).
  - The line lands at arbitrary sub-pixel screen positions and is antialiased
    (`CanvasSurface.css:374-378`), which is the blur.
  - The lasso is `stroke-width: 2` **cells** (`chromeOverlay.ts:281-307`), which is the fat line.
  - Task 06 moves both into an **unscaled** screen-space SVG. This task supplies its geometry.
- **Coordinate facts:**
  - `.canvas__frame` sits at `.canvas__layout`'s origin with no border or padding
    (`CanvasSurface.css:81-83`). Viewport-local CSS px for cell coordinate `c` on an axis is
    therefore `pan + c * scale`, where `scale = combinedScale = zoom * viewZoom`.
  - `origin` is the viewport element's client offset (`getBoundingClientRect().left/top`), which
    task 04's hook supplies. It is needed because device pixels are aligned to the **window**, not
    the viewport. A rail of fractional width shifts everything by a fraction.
- **Current builders** (`client/src/ui/canvas/svg/chromeOverlay.ts`):
  - `marchingAntsOverlay(box, offsetX, offsetY, dragDx=0, dragDy=0)` at `:354-397` already
    computes `outer` via `marchingAntsRects(box, CELL_SPACE_ZOOM, ...)`, the offset- and
    drag-applied cell rect. Expose it as `box`.
  - `lassoOverlay(points, offsetX, offsetY)` at `:281-307` builds its path from
    `lassoPath(points, CELL_SPACE_ZOOM, offsetX, offsetY)` (`renderSelectionOverlay.ts`), which
    already yields cell **centres** (+0.5). Expose those as `points`.
  - `chromeOverlay.ts` is 251 code lines. The `ui/` `max-lines` error is at 400.
- **Colours:** `SELECTION_COLOR` from `@/ui/canvas/render/renderSelectionOverlay`, `WHITE` from
  `@/ui/theme/canvasTokens`. Never hard-code a hex value (a parity test guards canvas colours).
- **The pattern:** `ui/canvas/svg/` emits **data** (`SvgPathSpec`-like objects) and never JSX
  (`chromeOverlay.ts` header; `OverlayPath` in `CanvasSurface.tsx:544`).

## Steps

1. Create `client/src/ui/canvas/svg/screenChrome.ts`:
   ```ts
   export interface ScreenView {
     scale: number;   // combinedScale (CSS px per cell)
     panX: number; panY: number;      // viewPanOffset, viewport-local CSS px
     originX: number; originY: number; // viewport client offset, CSS px
     dpr: number;     // window.devicePixelRatio (>0; treat non-finite/<=0 as 1)
   }
   export function deviceStrokePx(dpr: number): number;   // max(1, round(dpr))
   export function strokeCssPx(dpr: number): number;      // deviceStrokePx(dpr) / dpr
   /** Line CENTRE, viewport-local CSS px, for cell-edge coordinate `c` on one axis. */
   export function snapEdge(c: number, pan: number, scale: number, origin: number, dpr: number): number;
   export interface ScreenPath { d: string; strokeWidth: number }
   export function screenSelectionRect(box: {x;y;width;height}, view: ScreenView): ScreenPath & { x0; y0; x1; y1 };
   export function screenLassoPath(points: ReadonlyArray<{x;y}>, view: ScreenView): ScreenPath; // "" when < 2 points
   export const ANTS_DASH_PX = 4;   // CSS px, used directly — no counter-scale
   export const LASSO_DASH_PX = 3;
   ```
   - `snapEdge`, per D16: `local = pan + c*scale`; `E = Math.round((origin + local) * dpr)`;
     `w = deviceStrokePx(dpr)`; return `(E + (w % 2) / 2) / dpr - origin`.
   - `screenSelectionRect`: snap `x`, `x + width`, `y` and `y + height`. The path is
     `M x0 y0 H x1 V y1 H x0 Z`. Format numbers so floating-point noise does not leak into `d`:
     round to 4 decimals.
   - `screenLassoPath`: `pan + p*scale` per vertex, **no snapping**, as `M…L…`, with the same
     4-decimal formatting. The stroke width is `strokeCssPx(dpr)`.
   - Header: why screen space, the snapping maths with a worked example, why the lasso is not
     snapped, and a pointer to MASTER D15–D18.
2. In `chromeOverlay.ts`:
   - `marchingAntsOverlay` returns `MarchingAntsOverlay = { outer: SvgPathSpec; inner: SvgPathSpec; box: SelectionBounds }`,
     where `box` is `outer` from `marchingAntsRects` (already computed). Export the type.
   - `lassoOverlay` returns `LassoOverlay = SvgPathSpec & { points: Array<{ x: number; y: number }> }`,
     where `points` are the `lassoPath(...)` vertices, or `[]` when there are fewer than 2. Export
     the type.
   - Leave `d` and `attrs` on both unchanged, byte for byte. Existing tests and plan 17 read them.
   - Update the `ANTS_STROKE` / `marchingAntsOverlay` doc comments: say the rendered ants now come
     from `box` via `screenChrome.ts` (task 06), and that `d`/`attrs` are kept for compatibility.
3. **Commit** as `feat(18/03): screen-space selection outline geometry`.
4. Create `client/src/ui/canvas/svg/__tests__/screenChrome.test.ts`, with values **worked out by
   hand in the test's comments**, not re-derived by calling the code:
   - `deviceStrokePx`: 1→1, 1.25→1, 1.5→2, 2→2, 3→3; 0/NaN→1.
   - `snapEdge(3, 10.25, 7.3, 100.3, 2)` → `32.2`. Working: local 32.15, global 132.45, ×2 =
     264.9, E = 265, w = 2, (265 + 0)/2 − 100.3 = 32.2. The line covers device px 264–266.
   - `snapEdge(3, 10.25, 7.3, 100.3, 1)` → `32.2`. Working: E = 132, w = 1, 132.5 − 100.3.
   - DPR 1.5 case: work it out and assert that `(centre + origin) * dpr ± w/2` are **integers**.
   - A property loop over many random `(c, pan, scale, origin, dpr ∈ {1, 1.25, 1.5, 2, 3})`: both
     stroke edges land on integers within 1e-6, and `|centre − (pan + c*scale)| ≤ (1 + w/2)/dpr`.
   - Zoom independence: `screenSelectionRect(...).strokeWidth` is identical for scale 1, 7.3 and 50.
   - A lasso with fewer than 2 points gives `d === ""`. Lasso vertices are unsnapped.
5. Extend `chromeOverlay.test.ts`:
   - `marchingAntsOverlay(...).box` equals the offset + drag-applied rect. Use the existing
     offset/drag cases.
   - `lassoOverlay(...).points` equals the cell-centre vertices.
   - The existing `d`/`attrs` assertions still pass **unedited**.
6. **Commit** as `test(18/03): screenChrome + overlay geometry exposure`.

## Constraints

- Pure `ui/`: no React, no DOM reads, no store.
- `chromeOverlay.ts`'s existing exports keep their names and current `d`/`attrs` output. **Do not
  edit any existing assertion** in `chromeOverlay.test.ts`. Only add.
- Do not touch `CanvasSurface.tsx` or any container. That is task 06, and D19 says containers do
  not change.

## Verification

```sh
cd client
bunx tsc --noEmit                                  # exit 0 (the new fields are additive)
bunx vitest run src/ui/canvas/svg                  # all green; the pre-existing chromeOverlay tests unchanged
bunx vitest run src/containers/brush/__tests__/useBrushSelection.dom.test.ts   # still green
bunx eslint src/ui/canvas/svg
bun scripts/check-boundaries.mjs
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```

Manual: none. There is no visual change until task 06.

## Definition of done

- [ ] `screenChrome.ts` exports the API above, and the snapping follows D16 exactly.
- [ ] The hand-computed cases and the integer-edge property test pass.
- [ ] `marchingAntsOverlay().box` and `lassoOverlay().points` exist and are tested. Old
      assertions are untouched.
- [ ] tsc, eslint and the boundary check are clean, and there is no lockfile.
- [ ] Two commits.
