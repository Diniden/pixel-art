# 02 — 1:1 geometry and the combined CSS transform

**Wave:** W2 · **Depends on:** 01
**Touches:** `client/src/ui/hooks/useCanvasGeometry.ts` · `client/src/ui/hooks/useCanvasViewport.ts` · `client/src/ui/hooks/__tests__/useCanvasViewport.dom.test.ts` · `client/src/ui/components/CanvasSurface/CanvasSurface.tsx` · `client/src/ui/components/CanvasSurface/CanvasSurface.stories.tsx`
**Effort:** L

## Objective

Canvas backing stores stop being multiplied by `zoom`. `useCanvasGeometry` returns
`cellWidth`/`cellHeight` in **grid cells**, and `.canvas__layout` carries
`scale(zoom * viewZoom)` so the GPU does all magnification. Every site that assumed the
backing store was already scaled — pan clamping, wheel/pinch anchoring, view centring — is
converted to the new content size. This is the memory fix: a Landscapes canvas goes from
546 MB at zoom 50 to 224 KB.

## Context

### What changes, precisely

`ui/hooks/useCanvasGeometry.ts:149-150` today:

```ts
const canvasWidth  = editingVariant ? viewWidth  * zoom : gridWidth  * zoom;
const canvasHeight = editingVariant ? viewHeight * zoom : gridHeight * zoom;
```

becomes (note the conditional **survives** — D1):

```ts
const cellWidth  = editingVariant ? viewWidth  : gridWidth;
const cellHeight = editingVariant ? viewHeight : gridHeight;
```

⚠️ **Do not collapse the `editingVariant` branch.** In variant-edit mode the canvas covers
the union of the object and the variant rectangle, which is larger than `gridWidth`.
Dropping it truncates the object. The header at `:24-25` documents this.

### The rename is deliberate — do it

`canvasWidth` → `cellWidth`, `canvasHeight` → `cellHeight`. This is not cosmetic: a stale
`* zoom` that survives the refactor is invisible if the name still reads "canvasWidth", and
the compiler will find every site for you if the name changes. Add a third derived pair:

```ts
/** On-screen CSS size: what the transform actually produces. */
const contentWidth  = cellWidth  * zoom * viewZoom;
```

`contentWidth`/`contentHeight` is what pan clamping and centring must use.

### The two scales stay separate (D2) — this is a data-safety rule

`zoom` ∈ [1,50] (`ViewportUIStore.ts:135`, default 10) is the shared pixel scale.
`viewZoom` ∈ [0.25,4] (`:144`), tri-state `undefined`, is the per-pane gesture scale.

**Do not merge them, renormalise either range, or drop a field.** `panOffset` is persisted
in post-transform CSS pixels against a content box of `gridWidth * zoom`. Keeping both
fields multiplicative keeps that box the same size, so **every saved `panOffset` stays valid
with no migration**. There is no migration hook for `zoom` — `ViewportUIStore.ts:230`
hydrates it straight in. Renormalising would load every existing project off-screen.

`zoom` is shared across panes, `viewZoom` is per-pane (`CanvasCameraStore.ts:23-26`). Since
they already multiply, `scale(zoom * viewZoom)` preserves both invariants exactly.

### Helpful: nothing can change `zoom` at runtime

**No production code calls `viewport.setZoom`.** The Zoom stepper was removed 2026-08-28
(`RightSidebarTopControls.tsx:24-30`); only tests call it. `zoom` is fixed for a session at
whatever the project file holds. No gesture can change it mid-drag, which makes the anchor
math below safe.

### Every site to convert

**`useCanvasGeometry.ts`**
- `:149-150` the two computations
- `:157-161` `bgCacheKey` embeds `zoom` in both branches — **remove it**. After this task
  `zoom` no longer affects the background bitmap; leaving it thrashes the cache on every
  zoom step. (Task 06 deletes this cache entirely; still remove it here.)
- `:183` `zoom` into `bgGeom` — becomes 1
- `:90-91`, `:177-178`, `:193-194` the returned interface and objects
- `:24-25` the header comment, now wrong
- `:208` the memo dep array

**`useCanvasViewport.ts`**
- `:339-340` — **the one that will silently break panning**:
  ```ts
  const displayedW = state.canvasWidth * state.viewZoom;
  ```
  must become the full content size including `zoom`. Without this, clamping thinks content
  is 10× smaller than it renders and large sprites cannot be panned.
- `:277-294` `wheelStateRef` caches the dimensions — both the initializer and the
  render-phase write.
- `:80-82` the options doc and types.
- `:258-274` `clampPanToViewport` itself is pure — it trusts the caller's `contentWidth`.
  Leave its body alone; fix its callers.

⚠️ **Anchor math at `:322-331` and `:437-446` stays as-is.** Both compute
`ratio = newViewZoom / oldViewZoom` and re-anchor with `anchor * (1 - ratio) + pan * ratio`.
That is correct *because* `zoom` is constant during a gesture (nothing can change it) and
`transformOrigin` is `0 0`. Do not "fix" it.

**`CanvasSurface.tsx`**
- `:205-213` the transform — `scale(viewZoom)` → `scale(combinedScale)`. Keep
  `transformOrigin: "0 0"`; `useCanvasViewport`'s math assumes it.
- `:129-132`, `:144-145`, `:185-188` props and docs.
- The six `<canvas width={canvasWidth} height={canvasHeight}>` at `:215-218`, `:233-236`,
  `:242-245`, `:251-254`, `:261-264`, `:278-281`.

⚠️ **Overlay sizing is task 04's problem, not yours.** In this task, point all six at the
new 1:1 dimensions so the app compiles and the artwork is correct. Task 04 splits artwork
from chrome. Expect the sub-cell overlays (hover outline, reflection guides, marching ants)
to look **wrong or invisible** after this task — that is known and expected; task 03 builds
their replacement and task 04 installs it. Say so in your report rather than trying to fix
it here.

### `image-rendering: pixelated` becomes load-bearing

Already present on `.canvas__surface` and `.canvas__overlay`
(`CanvasSurface.css:66-68, 85-86`). Today crispness comes from the backing store already
being 10×; after this task it comes **only** from that CSS. Verify it is present; do not
remove it. (You are not editing the CSS file in this task.)

### What must NOT change

`ui/canvas/model/coords.ts` — **already correct.** `screenToPixel` maps through
`getBoundingClientRect()` *ratios*, never `zoom`, and its header (`:9-15`) says this is
deliberate because a CSS transform is already applied. `rect.width` picks up the combined
scale automatically. **Verify by test; do not rewrite.**

`LightingCanvasContainer.tsx` — out of scope (R7). It has its own `viewCellsX * zoom` at
`:282-283` and keeps it until task 08. Your `useCanvasViewport` change *does* reach it
(shared hook), which is correct and desirable: its pan clamp gets fixed for free. Do not
change its sizing.

## Steps

1. Rename and rework `useCanvasGeometry.ts`: `cellWidth`/`cellHeight`, add
   `contentWidth`/`contentHeight`, strip `zoom` from `bgCacheKey`, set `bgGeom.zoom` to 1,
   update the header comment. Let the compiler list the call sites.
2. Convert `useCanvasViewport.ts`: `:339-340` and the `wheelStateRef` pair. Update the
   options doc at `:80`. Leave `clampPanToViewport`'s body and both anchor blocks alone.
3. Update `CanvasSurface.tsx`: the transform to `scale(combinedScale)`, the props, and the
   six canvas size attributes. Add a `combinedScale` prop rather than passing `zoom` and
   `viewZoom` separately — one value, computed once, per the alignment guide.
4. Commit after step 3.
5. Update `CanvasSurface.stories.tsx` (`:210-211`, `:289-290` use `GRID.width * ZOOM`).
   Stories mount with no store provider — that is the `ui/` boundary proof and must stay.
6. Update `useCanvasViewport.dom.test.ts` (`:49-50` `canvasWidth: 400`, and the anchor
   assertions at `:63-149`). These assertions encode real gesture behaviour — re-derive the
   expected numbers under the new content size; **do not delete an assertion to make it
   pass**.
7. Add a regression test for R1: given `zoom: 10` and a saved `panOffset`, the centring in
   `handleResetView` produces the same value before and after. Put it with the viewport
   tests.
8. Run the gate. Commit.

## Constraints

- **Do not merge, renormalise or drop `zoom` or `viewZoom`.** No change to their ranges,
  defaults, persistence, or tri-state.
- **Do not touch any wire type, codec, migration or fixture.**
- **Do not modify `ui/canvas/model/coords.ts`.** Verify it; changing it is the bug.
- **Do not touch `LightingCanvasContainer.tsx`** or anything under `ui/canvas/render/`.
- **Do not touch `CanvasSurface.css`** — task 04 and 06 own it.
- **Do not create `ui/canvas/svg/`** — that is task 03, running in parallel.
- Preserve the `editingVariant` conditional (D1).
- No store, API or MobX import under `ui/`.

## Verification

```sh
bun run --cwd client typecheck
cd client && bunx vitest run
bun run --cwd client lint
bun run --cwd client lint:css
bun run --cwd client lint:boundaries
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # must print nothing
```

All must exit 0, corpus snapshots **unchanged**. Paste real output.

**Manual checks — not optional.** `bun run dev`, then:

1. Open **Base Unit**. The sprite renders at the right size and position, indistinguishable
   from before at default zoom.
2. **Draw.** Pixels land under the cursor. This proves `coords.ts` still maps correctly
   through the new transform. If they are offset, the transform or `transformOrigin` is wrong.
3. **Pinch / ctrl+wheel.** Zooming anchors under the pointer, not the corner.
4. **Pan at high view zoom.** The sprite can be dragged fully; it does not lock. This is the
   `:339-340` fix. Compare against `main` if unsure.
5. **Reset view.** Sprite centres in the viewport.
6. Open **Landscapes** (256×224 — the target case). It loads, renders, and draws. In the
   browser's memory profiler the canvas allocation is **KB, not MB**.
7. Select a variant layer and enter variant-edit mode. The expanded view still covers the
   union of object and variant (D1 check).

Record in your report: the sub-cell overlays (hover outline, reflection guides, marching
ants, origin cross) are expected to be wrong or invisible after this task. Note what you
observed; do not fix it here.

## Definition of done

- [ ] `cellWidth`/`cellHeight` are grid cells; `contentWidth`/`contentHeight` derived.
- [ ] `editingVariant` conditional preserved.
- [ ] `zoom` removed from `bgCacheKey`.
- [ ] `.canvas__layout` carries `scale(zoom * viewZoom)` with `transformOrigin: "0 0"`.
- [ ] `useCanvasViewport.ts:339-340` and `wheelStateRef` use the full content size.
- [ ] Anchor math and `clampPanToViewport`'s body unchanged.
- [ ] `coords.ts` unmodified and verified by a passing draw test.
- [ ] `zoom`/`viewZoom` ranges, defaults, persistence and tri-state unchanged; R1 regression test added.
- [ ] Stories updated and still mount with no store provider.
- [ ] Viewport tests re-derived, none deleted.
- [ ] All five gate commands exit 0; corpus snapshots unchanged; output pasted.
- [ ] All seven manual checks performed and reported, including the Landscapes memory observation.
- [ ] No lockfile.
- [ ] Two commits (step 4, step 8).
