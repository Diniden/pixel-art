# 08 — Lighting studio follow-on

**Wave:** W7 · **Depends on:** 07
**Touches:** `client/src/containers/LightingCanvasContainer.tsx` · `client/src/ui/components/LightingSurface/LightingSurface.tsx` · `client/src/ui/components/LightingSurface/LightingSurface.css` · `client/src/ui/components/LightingSurface/LightingSurface.stories.tsx` · `client/src/ui/canvas/render/renderNormalEdit.ts` · `client/src/ui/canvas/render/renderLitComposite.ts` · `client/src/ui/components/LightingSurface/__tests__/LightingSurface.dom.test.tsx`
**Effort:** M

## Objective

The lighting studio moves onto the same 1:1 + CSS-transform model as the pixel editor,
closing Risk R7 — the window in which `zoom` means "CSS scale factor" in one canvas engine
and "backing-store multiplier" in the other. After this task both engines interpret the
shared `ViewportUIStore.zoom` identically.

## Context

### Why this is a separate wave

`LightingCanvasContainer` (847 lines) is a **second, parallel canvas engine**. It shares
`ViewportUIStore.zoom` and `useCanvasViewport`, but has its own inline geometry, its own
render callbacks, and its own surface component. Waves 1–7 deliberately left it alone to keep
the main refactor reviewable. The cost is R7: from task 02 until this task, the two engines
read the same `zoom` and do different things with it.

That divergence is **contained** — the lighting studio is a separate mode, so both cannot be
on screen at once — but it must not be left permanently.

### What it does today

- `:234` — `const zoom = viewport.zoom;` (shared pixel scale, both lighting panes, `:227-229`)
- `:279-283` — its own sizing, duplicating `useCanvasGeometry`:
  ```ts
  const viewCellsX = previewMode ? objWidth : gridWidth;
  const canvasWidth  = viewCellsX * zoom;
  const canvasHeight = viewCellsY * zoom;
  ```
- `:472-473`, `:535-536`, `:587-588` — three `canvas.width = canvasWidth` assignments
- `:486`, `:555`, `:596` — three `createImageData(canvasWidth, canvasHeight)`
- `:327-339` — its own `handleResetView`, carrying the **same broken assumption** as the main
  one: *"At view zoom 1 the content is exactly `canvasWidth × canvasHeight`"*
- `LightingSurface.tsx:183` — its own `transform: translate(...) scale(viewZoom)`
- `LightingSurface.tsx:190-194`, `:205-209` — two `<canvas>` at the scaled size

### Already handled for you

- **`useCanvasViewport` is shared**, so task 02's pan-clamp fix at `:339-340` already applies
  here. There is no separate clamp to fix — `LightingCanvasContainer` never calls
  `clampPanToViewport` itself; only the shared wheel listener does.
- **Coordinate mapping is already correct.** `getPixelCoordsFromClient` (`:446-458`) maps
  through `getBoundingClientRect()` ratios, with a note at `:442-445` explaining it is
  rect-relative precisely because the canvas lives under a CSS `scale()`. Verify; do not
  rewrite.
- `image-rendering: pixelated` is already on `.lighting-canvas__surface`
  (`LightingSurface.css:82-83`).

### The renderers

`renderNormalEdit.ts` and `renderLitComposite.ts` are nearest-neighbour upscalers that
iterate **canvas** pixels and divide:

```ts
const sy = Math.floor(y / zoom);
const sx = Math.floor(x / zoom);
```

At 1:1 these collapse to an identity copy — mechanically safe, and a large simplification.

⚠️ `renderNormalEdit.ts:18-21` documents the invariant `canvasWidth === gridWidth * zoom`
as the reason the mapping is drift-free. **That comment must be rewritten, not just the
code** — it will otherwise mislead the next reader.

Both also call `paintCheckerboard` (kept by task 06 precisely for these) and stroke a grid at
the call site (`LightingCanvasContainer.tsx:507`), which inherits the `strokeGrid` failure
described in task 03 and needs the same CSS/SVG treatment.

### Scope boundary

`renderLightingPreview.ts` is **out of scope** (D12). Its `zoom` is an internally-computed
fit-to-thumbnail scale for a fixed 200×200 canvas
(`previewPlacement`, `:80-98`), not the view zoom. Leave it entirely alone.

### Do the layer split here?

**No.** The lighting studio edits a single normal/height surface, not a stack of layers.
Apply the 1:1 backing, the combined transform, and the CSS/SVG grid. Per-layer canvases and
dirty-region tracking do not apply.

## Steps

1. Convert `LightingCanvasContainer`'s sizing (`:279-283`) to cells; add
   `contentWidth`/`contentHeight` for centring. Follow `useCanvasGeometry`'s post-task-02
   shape — consider extracting the shared derivation rather than duplicating it a second
   time, but **do not refactor `useCanvasGeometry` itself** this late.
2. Fix `handleResetView` (`:327-339`) to centre against `cellWidth * zoom`, matching the
   main container's post-task-02 form.
3. Update the three `canvas.width` assignments and three `createImageData` calls.
4. Update `LightingSurface.tsx`: `scale(zoom * viewZoom)` at `:183`, the two canvas sizes,
   and the prop docs at `:90-93`.
5. Commit after step 4.
6. Simplify `renderNormalEdit.ts` and `renderLitComposite.ts` for 1:1 and **rewrite the stale
   invariant comment** at `renderNormalEdit.ts:18-21`.
7. Replace the call-site grid stroke (`:507`) with the CSS or SVG grid task 06 shipped.
   Reuse it; do not write a third grid implementation.
8. Update the surface stories and DOM tests (`LightingSurface.stories.tsx:126-253` has
   several `viewZoom` and size values).
9. Run the full gate, including `bun run verify`. Commit.

## Constraints

- **Do not touch `renderLightingPreview.ts`** (D12).
- **Do not refactor `useCanvasGeometry`, `useCanvasViewport`, `CanvasSurface` or
  `CanvasContainer`** — waves 1–7 are done and verified. Reuse them; do not reopen them.
- **Do not modify `paintCheckerboard` or `backgroundTheme`** beyond what 1:1 requires.
- Do not add per-layer canvases or dirty tracking here.
- Do not change `zoom`/`viewZoom` ranges, defaults or persistence.
- Do not rewrite `getPixelCoordsFromClient` — verify it.
- No store/MobX/API under `ui/`.

## Verification

```sh
bun run --cwd client typecheck
cd client && bunx vitest run
bun run --cwd client lint
bun run --cwd client lint:css
bun run --cwd client lint:boundaries
bun run --cwd client build-storybook
bun run verify
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # must print nothing
```

All exit 0, corpus snapshots unchanged. `bun run verify` is the full gate — paste its real
output.

**Manual checks — mandatory.** `bun run dev`, enter the lighting studio:

1. **Normal edit mode** renders correctly — the normal map reads as it did, crisp not blurry.
2. **Height edit mode** renders correctly.
3. **Paint a normal** — it lands under the cursor at several zoom levels (coordinate mapping).
4. **Preview render mode** — the lit composite is correct.
5. **Both panes open** — each pans and pinches independently; the shared pixel scale is
   consistent between them.
6. **Reset view** in each pane centres correctly.
7. **Checkerboard and grid** match the pixel editor's, at low and high zoom.
8. **Memory** — the lighting canvases are KB, not MB, at high zoom.
9. **Switch between pixel and lighting studio repeatedly** — both render correctly every
   time. This is the R7 closure check: one shared `zoom`, one meaning.
10. **Lighting preview thumbnail** (the 200×200 panel) is unchanged — proof D12 was respected.

## Definition of done

- [ ] Lighting canvases are 1:1 with pixel data.
- [ ] `LightingSurface` carries `scale(zoom * viewZoom)`.
- [ ] `handleResetView` centres against the content size.
- [ ] `renderNormalEdit`/`renderLitComposite` simplified; **the stale invariant comment rewritten**.
- [ ] Grid reuses task 06's implementation; no third grid.
- [ ] `renderLightingPreview.ts` untouched.
- [ ] No wave 1–7 file reopened.
- [ ] Stories and DOM tests updated.
- [ ] All seven gate commands exit 0, **including `bun run verify`**; output pasted.
- [ ] All ten manual checks done and reported, especially #9 (R7 closure) and #10 (D12).
- [ ] **R7 marked closed in `HANDOFF.md`.**
- [ ] No lockfile.
- [ ] Two commits (step 5, step 9).
