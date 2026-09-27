# 05 — Preview painter, frame chrome spec, cursors

**Wave:** W2 · **Depends on:** 02
**Touches:** `client/src/ui/canvas/render/renderTransformPreview.ts` (new) · `client/src/ui/canvas/render/__tests__/renderTransformPreview.test.ts` (new) · `client/src/ui/canvas/svg/transformOverlay.ts` (new) · `client/src/ui/canvas/svg/__tests__/transformOverlay.test.ts` (new)
**Effort:** M

## Objective
Two pure presentation modules exist: a raster painter that draws a transform's live result (vacated
source cells dimmed, result cells at full opacity) onto a 1:1 overlay canvas, and an SVG chrome spec
for the transformed frame (dashed outline + eight handle positions) plus the cursor resolver and the
curved-arrow rotate cursor. Nothing mounts them yet (tasks 07, 10).

## Context
- Painter precedent: `client/src/ui/canvas/render/renderReflectionLines.ts` (193) + its test (270)
  and `renderSelectionOverlay.ts` (`paintDragPreview :172`, `DRAG_SHADE`, `MASK_FILL_LIMIT = 20000 :50`).
  The test convention (`src/test/canvasStub.ts`): the stub records `ctx.calls` and does not
  rasterise, so geometry must be a **separately exported data function** and only the calls are
  asserted structurally.
- Chrome precedent: `client/src/ui/canvas/svg/chromeOverlay.ts` (627) — `SvgPathSpec`, `HALF_PIXEL :141`,
  `marchingAntsOverlay :354` (closed rect path), `originCrossOverlay :503` (geometry in **screen px**
  about a counter-scaled group). Its test (647) shows the spec-assertion style. Do **not** add to
  `chromeOverlay.ts` — new file.
- Colours only from `client/src/ui/theme/canvasTokens.ts` (a parity test enforces it): `BLACK_12`,
  `ACCENT_PRIMARY`, `WHITE`. Result cells are painted with their own colour as `rgba(r, g, b, a/255)`.
- From task 02: `TransformResult`, `TransformSource`, `TransformHandle`, `TransformZone`,
  `TransformParams`, `HANDLE_SIZE_PX`. `Point` from `@/types`.
- `ui/` boundary applies; `max-lines` is an error under `src/ui/**`.

## Steps
1. `renderTransformPreview.ts`:
   - `transformPreviewCells(result, source): { vacated: Point[]; painted: TransformPreviewCell[] }` —
     unpack `result.vacated` keys against `source.width`, and `result.cells` against the destination
     grid width (pass `gridWidth` — add it to the signature: `transformPreviewCells(result, source, gridWidth)`;
     record the final signature in your report). `painted[i].css` is the cell's colour string.
     Skip the vacated list when `result.vacated.size > MASK_FILL_LIMIT` (import it from
     `renderSelectionOverlay.ts`) — the same guard as the mask fill.
   - `drawTransformPreview(ctx, cells, viewMinX, viewMinY, cellWidth, cellHeight)`: `clearRect(0, 0, cellWidth, cellHeight)`,
     `save`, `translate(-viewMinX, -viewMinY)`, vacated → `fillStyle = BLACK_12` + `fillRect(x, y, 1, 1)`
     each, painted → per-cell `fillStyle = css` + `fillRect`, `restore`. Group consecutive cells of the
     same colour to reduce `fillStyle` churn (optional, but keep the call order deterministic).
   - Tests: data function unpacks keys correctly; guard drops the vacated list past the limit;
     draw records `clearRect` first, one `fillRect` per cell, `BLACK_12` for vacated, the cell colour
     for painted, translate applied.
   Commit: `transform(05): renderTransformPreview`.
2. `transformOverlay.ts`:
   - `transformFrameOverlay(quad, handles): TransformFrameOverlay` — `outline` = closed path
     `M x0 y0 L x1 y1 L x2 y2 L x3 y3 Z` through the quad's four points (cell units, no half-pixel
     shift — the stroke is counter-scaled by the renderer), `attrs` `{ stroke: ACCENT_PRIMARY, fill: "none", strokeDasharray: "4 4" }`
     in the `SvgPathSpec` shape `marchingAntsOverlay` uses; `handles` passed through.
   - `ROTATE_CURSOR`: a 20×20 SVG (a circular arc with an arrowhead, 2 px white stroke with a 1 px
     dark outline for contrast) URL-encoded into `url("data:image/svg+xml;utf8,…") 10 10, crosshair`.
     Keep the SVG source as a readable constant and build the URL with `encodeURIComponent`.
   - `transformCursor(zone, params)`: `inside` → `"move"`; `rotate` → `ROTATE_CURSOR`; `outside` →
     `"crosshair"`; `handle` → the handle's outward unit direction (`n` = (0, −1), `ne` = (1, −1)/√2,
     …) rotated by `params.rotation` (and mirrored per the sign of each scale), snapped to the nearest
     of 8 directions → `ns-resize` (N/S), `ew-resize` (E/W), `nesw-resize` (NE/SW), `nwse-resize` (NW/SE).
   - Tests: outline path string for an identity quad; handles pass-through; cursor table for all 8
     handles at rotation 0, `π/2` (`n` becomes `ew-resize`), `π/4` (`n` becomes `nesw-resize` or
     `nwse-resize` — pin whichever your convention yields and document it); `ROTATE_CURSOR` starts
     with `url("data:image/svg+xml` and ends with `, crosshair`.
   Commit: `transform(05): transformOverlay spec + cursors`.

## Constraints
- No React, no stores. No edits to `chromeOverlay.ts`, `renderSelectionOverlay.ts`, `canvasTokens.ts`
  (if a token is missing, use an existing one — `ACCENT_PRIMARY` / `WHITE` / `BLACK_12` suffice).
- No `vector-effect` reliance; the renderer counter-scales (task 07).

## Verification
```sh
cd client && bunx vitest run src/ui/canvas/render src/ui/canvas/svg   # green
cd client && bunx tsc --noEmit && bunx eslint src/ui/canvas             # clean, no max-lines error
cd client && bun run lint:boundaries                                    # 5/5
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules             # prints nothing
```
Manual: none (visual check in task 07's story).

## Definition of done
- [ ] Both modules export MASTER §3's block (with the recorded `gridWidth` signature note).
- [ ] Tests green; canvas colours only from tokens.
- [ ] Boundaries 5/5; no `max-lines` error.
- [ ] Two commits `transform(05):`; no lockfile.
