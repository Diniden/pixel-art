# 06 — Background and grid → CSS DIV

**Wave:** W5 · **Depends on:** 05
**Touches:** `client/src/ui/components/CanvasSurface/CanvasSurface.tsx` · `client/src/ui/components/CanvasSurface/CanvasSurface.css` · `client/src/styles/tokens.css` · `client/src/containers/CanvasContainer.tsx` · `client/src/ui/canvas/render/canvasBackground.ts` · `client/src/ui/canvas/render/__tests__/canvasBackground.test.ts` · `client/src/ui/canvas/svg/gridOverlay.ts`
**Effort:** M

## Objective

The checkerboard and pixel grid stop being painted into offscreen canvases and become a
single CSS DIV behind the layer stack, using `repeating-linear-gradient` (checkerboard) and
`repeating-linear-gradient` borders (grid). Two offscreen canvases, their cache-key
machinery, and an O(w·h) buffer fill disappear. This is the owner's "CSS border tricks"
requirement.

## Context

### What exists today

Two cached offscreen canvases in `CanvasContainer`:

- `ensureBgCanvas` (`:824-849`) — allocates a canvas, `createImageData(cellW, cellH)`, calls
  `paintCheckerboard`, `putImageData`, caches by `bgCacheKey`.
- `ensureGridCanvas` (`:851-869`) — allocates a canvas, `clearRect`, `strokeGrid`, caches.

`render` blits both with `drawImage` on every repaint. Both are deleted here.

`paintCheckerboard` (`canvasBackground.ts:104-147`) writes a base colour across the entire
buffer, then each cell's block. `strokeGrid`/`gridLinePath` (`:165-198`) stroke `cells + 1`
lines per axis at `x*zoom + 0.5`.

### Why CSS wins

The DIV is one element, GPU-composited, allocating no raster. It lives **inside**
`.canvas__layout`, so it inherits `scale(zoom * viewZoom)` and needs no repaint on zoom or
pan. A `--z-behind: -1` token already exists in `tokens.css:394`, documented for
"decorative ::before / bg grids" — exactly this slot.

### The checkerboard in CSS

At 1:1, one cell is 1px in the untransformed DIV, so the checker is a 2×2px pattern scaled
up by the transform. Two `repeating-linear-gradient`s at 45°/-45°, or the classic
four-stop `conic-gradient` with `background-size: 2px 2px`, both work.

⚠️ **`image-rendering: pixelated` is essential.** A 2px pattern scaled 50× with default
smoothing is grey mush. It is already on the canvases; the DIV needs it too.

⚠️ **Parity must be preserved** — checker phase depends on world position:
`paintCheckerboard:139` computes `(offsetX + px + offsetY + py) % 2`, so a variant view
scrolled by an odd number of cells keeps its object-space phase. Reproduce with a
`background-position` offset of `offsetX % 2` / `offsetY % 2` pixels. Test both parities.

### The grid in CSS

Two `repeating-linear-gradient`s (vertical + horizontal), each a 1px line every 1px at 1:1.

⚠️ At 1:1 a "1px line every 1px" is a solid fill — the exact failure mode described in task
03. **The grid line width must be expressed in *screen* pixels, not cell units**, i.e.
`calc(1px / var(--combined-scale))` in the transformed space, with `--combined-scale` passed
as a CSS custom property from the container.

**If that does not render cleanly, keep the grid in task 03's SVG** (`gridOverlay.ts`),
where `non-scaling-stroke` solves it natively, and use CSS for the checkerboard only. Both
satisfy the owner's requirement — neither is raw per-pixel compute. **Try CSS first; fall
back to SVG and say which you shipped and why.** Do not ship a grid that renders as a wash.

### Colours (D11)

`tokens.css` already has `--bg-hover` and `--canvas-checker-b` per theme (`:213`, `:528`,
and the light palettes at `:537+`). Dark checker = those two. The base is `--bg-tertiary`.

`LIGHT_THEME` (`canvasBackground.ts:81-88`) uses **hardcoded** `#c8c8c8` / `#cccccc` /
`#eeeeee` with no CSS counterpart. Add three tokens for them.

⚠️ **Grid alpha, measured and documented at `canvasBackground.ts:19-24`** — this corrected an
earlier spec, so preserve it exactly: **black 8% in light mode, white 5% in dark mode**
(`BLACK_08` / `WHITE_05`).

⚠️ `lightGridMode` is a **separate toggle from `data-theme`** and is tri-state
(`ViewportUIStore.ts:76`, `undefined` = absent from the project file, read as
`lightGridMode ?? false`). Express it as a class or `data-` attribute on the DIV, preserving
the tri-state — do not collapse `undefined` to `false` anywhere that persists.

⚠️ `ui/theme/canvasTokens.ts` has a **parity test** against `tokens.css`
(`ui/theme/__tests__/canvasTokens.test.ts`) that fails the build on drift. Adding tokens to
`tokens.css` may require mirroring them. Change the CSS token first; the mirror follows.

### What to delete vs. keep

- **Delete**: `ensureBgCanvas`, `ensureGridCanvas`, their refs and cache keys, both
  `drawImage` blits, and `bgCacheKey` from `useCanvasGeometry` if now unused.
- **Delete from `canvasBackground.ts`**: `strokeGrid` and `gridLinePath` **only if** the CSS
  grid ships. If you fall back to SVG, `gridOverlay.ts` still imports `gridLinePath` — keep it.
- **Keep**: `paintCheckerboard`, `backgroundTheme`, and the theme constants — still used by
  `renderNormalEdit.ts` and `renderLitComposite.ts` in the **lighting studio**, which is out
  of scope until task 08. **Deleting them breaks the lighting canvas.** Verify with
  `grep -rn "paintCheckerboard\|backgroundTheme\|strokeGrid" client/src` before deleting anything.

## Steps

1. Add the three light-checker tokens to `styles/tokens.css`; mirror in `canvasTokens.ts` if
   the parity test requires it.
2. Add the background DIV to `CanvasSurface.tsx` as the **first** child of `.canvas__frame`
   (below the layer stack), driven by a `lightGridMode` prop and the `--combined-scale`
   custom property.
3. Write the CSS: checkerboard gradient with parity offset, grid lines with screen-constant
   width, `image-rendering: pixelated`, `--z-behind`, `pointer-events: none`.
4. If the CSS grid does not render cleanly, revert to `gridOverlay.ts` from task 03 and keep
   CSS for the checkerboard only. Record the decision.
5. Commit after step 4.
6. Delete `ensureBgCanvas`, `ensureGridCanvas`, their refs/keys and the blits from
   `CanvasContainer`. Remove `bgCacheKey` from `useCanvasGeometry` if unused.
7. Run the grep from the Context section. Delete `strokeGrid`/`gridLinePath` **only** if
   nothing references them. Update `canvasBackground.test.ts` accordingly.
8. Run the gate. Commit.

## Constraints

- **Do not delete `paintCheckerboard` or `backgroundTheme`** — the lighting studio uses them.
- Preserve the measured grid alpha rule exactly (black 8% light / white 5% dark).
- Preserve checker parity for variant views.
- Preserve `lightGridMode`'s tri-state.
- **Do not touch `LightingCanvasContainer` or the lighting renderers.**
- No new z-index values — use `--z-behind`.
- No store/MobX/API under `ui/`.
- Do not regress `image-rendering: pixelated` anywhere.

## Verification

```sh
bun run --cwd client typecheck
cd client && bunx vitest run
bun run --cwd client lint
bun run --cwd client lint:css
bun run --cwd client lint:boundaries
bun run --cwd client build-storybook
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # must print nothing
```

All exit 0, corpus snapshots unchanged. Paste real output.

**Manual checks — mandatory.** `bun run dev`:

1. **Checkerboard** looks as it does today — same colours, same cell size, crisp not blurry.
2. **Grid lines** form a true grid, ~1px on screen at **every** zoom, no wash, no drift from
   the artwork.
3. **Toggle `lightGridMode`** — both palettes correct, grid alpha correct in each (black 8%
   light, white 5% dark).
4. **Variant-edit with an odd offset** — the checker phase matches today's. Compare against
   `git stash` if unsure. This is the parity check.
5. **Zoom to 50 and to minimum** — background and grid stay correct and crisp at both.
6. **Pan** — the background moves with the artwork, locked to it.
7. **Lighting studio still renders its own checkerboard and grid** — proof you did not delete
   a shared function it needs.
8. Devtools: confirm the two offscreen canvases are gone and the DIV is a single element.

## Definition of done

- [ ] Background DIV is the first child of `.canvas__frame`, at `--z-behind`.
- [ ] Checkerboard in CSS with correct colours and preserved parity.
- [ ] Grid is screen-constant at every zoom — via CSS, or via SVG fallback with the decision recorded.
- [ ] Three light-checker tokens added; parity test passing.
- [ ] Grid alpha rule preserved exactly.
- [ ] `lightGridMode` tri-state preserved.
- [ ] `ensureBgCanvas`, `ensureGridCanvas`, refs, cache keys and blits deleted.
- [ ] `paintCheckerboard`/`backgroundTheme` retained; grep evidence in the report.
- [ ] All six gate commands exit 0; output pasted.
- [ ] All eight manual checks done and reported, especially #4 (parity) and #7 (lighting).
- [ ] No lockfile.
- [ ] Two commits (step 5, step 8).
