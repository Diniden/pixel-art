# 04 — CanvasSurface: per-layer canvas stack + SVG mount

**Wave:** W3 · **Depends on:** 02, 03
**Touches:** `client/src/ui/components/CanvasSurface/CanvasSurface.tsx` · `client/src/ui/components/CanvasSurface/CanvasSurface.css` · `client/src/ui/components/CanvasSurface/CanvasSurface.stories.tsx` · `client/src/ui/components/CanvasSurface/__tests__/CanvasSurface.dom.test.tsx`
**Effort:** L

## Objective

`CanvasSurface` renders **one `<canvas>` per layer**, keyed by `layer.id`, stacked in the
transformed wrapper below the existing overlays, and mounts task 03's SVG chrome above them.
The sub-cell overlays that broke in task 02 are restored as vectors. The component still
imports no store and receives no pixel data.

## Context

### What the component is today

`CanvasSurface.tsx` is the pure markup for the canvas stack: six `<canvas>` elements, the
pan/zoom wrapper, the cursor. Its header (`:1-78`) is worth reading in full. Two parts of it
constrain this task absolutely:

**⚠️ NO PIXEL GRID CROSSES THIS BOUNDARY** (`:39-47`). There is no `pixels` prop, no
`layers` prop, no `frame` prop, and there never may be. Grids reach the canvas through an
imperative draw driven from a `reaction` on `pixelVersion`, through `canvasRef.current`.
A `PixelData[][]` prop would defeat the whole arrangement and present as "MobX is slow".

**This is the trap of this task.** You need per-layer canvases, and the obvious way to get
them is to pass the layers in. **You must not.** Pass:

```ts
/** Layer ids, bottom → top. Ids only — never layer objects, never pixels. */
layerIds: readonly string[];
/** Register/unregister a layer's canvas element by id. */
registerLayerCanvas: (id: string, el: HTMLCanvasElement | null) => void;
/** Per-layer CSS opacity (D4), keyed by layer id. */
layerOpacity?: Readonly<Record<string, number>>;
/** Per-layer visibility, keyed by layer id. */
layerVisible?: Readonly<Record<string, boolean>>;
```

Ids, numbers and booleans — no domain objects. The container owns the refs and paints
imperatively, exactly as it does today for the single canvas.

### DOM order is z-order here — deliberately

`CanvasSurface.css`'s comments (the `--hover` and `--reflection` blocks) state that the
reflection guides sit above every other overlay **by source order, not z-index**: all
overlays share `var(--z-canvas-overlay)` and the later sibling wins. Reaching for a higher
numeric z-index is called out as both redundant and a stylelint error.

So the stack, top to bottom, inside `.canvas__frame`:

```
SVG chrome            ← new (task 03): grid, brush, hover, lasso, ants, origin, reflection
reflection canvas     ← REMOVE if fully replaced by SVG (see below)
frame trace overlay   ← stays raster (D6)
frame overlay         ← stays raster (D6)
reference overlay     ← stays raster (D6)
hover canvas          ← keep for the FILL only; outline moves to SVG
layer canvases        ← new, one per layer, bottom → top
background DIV        ← task 06 (leave a placeholder slot; do not build it)
```

Layer canvases go **below** every existing overlay. Do not renumber z-indexes; use source
order, as the file already does.

### The split: fills stay raster, strokes become SVG

Per D5/D6 and the task-03 audit:

- **Stays on a 1:1 canvas**: reference trace, frame onion-skin, frame trace, selection mask
  fill, drag preview, and the brush/hover **fills**.
- **Moves to SVG**: grid lines, brush **outline**, hover **outline**, lasso, marching ants,
  origin cross, reflection guides.

The hover canvas therefore keeps its fill role and loses its outline role. The reflection
canvas may be removable entirely — check whether anything still paints into it after the
guides move; if nothing does, remove it and note that in your report.

### The single-canvas ref must survive

`canvasRef` is the pointer-event surface and the thing `screenToPixel` measures via
`getBoundingClientRect()`. **Keep exactly one full-size element carrying the pointer
handlers and `canvasRef`**, sized `cellWidth × cellHeight` like the layer canvases and
sitting above them. If you make it a transparent `<canvas>` that nothing paints into, say so
in the header — a future reader will otherwise "optimise" it away and break both input and
coordinate mapping.

### Why keying by id is enough

`Layer.id` (`types/domain.ts:25`) is stable across add, delete and reorder — `LayerStore`
has `moveLayer`, `addLayer`, `deleteLayer`, and the across-frames variants, all preserving
ids. React keyed reconciliation therefore does the canvas pooling for you: reorder moves
DOM nodes rather than recreating them. **Do not build a manual pool.** Do call
`registerLayerCanvas(id, null)` on unmount so the container can drop stale refs.

### Layer count is unbounded

There is no cap in `LayerStore`. At 1:1 this is affordable — 224 KB per layer even for
Landscapes — but note the linear growth in the header.

### Dimming via CSS (D4)

`layerFocusMode` values are `"normal" | "transparent" | "onion"`
(`ViewportUIStore.ts:87`, default `"transparent"`). The `normal`→1 / `transparent`→0.5 /
variant-other→0.7 multipliers become the `layerOpacity` prop applied as CSS `opacity`.
Constants live at `renderScene.ts:76-80` (`VARIANT_EDIT_REGULAR_DIM`,
`VARIANT_EDIT_OTHER_DIM`); the container computes them in task 05.

⚠️ **`onion` is not an opacity** — it is an outline-only mode driven by `isOutlineCell`
neighbour tests. It stays a paint-time decision in task 05. Do not try to express it as CSS.

## Steps

1. Rework `CanvasSurface.tsx`:
   - add the four layer props above; **do not add any prop carrying pixels or layer objects**
   - render `layerIds.map(...)` into a `.canvas__layers` wrapper below the overlays, each
     `<canvas key={id} ref={el => registerLayerCanvas(id, el)} width={cellWidth} height={cellHeight}>`
     with `opacity` and `display` from the two record props
   - mount task 03's SVG as the last child of `.canvas__frame`
   - keep `canvasRef` as the pointer surface
   - update the header: the new stack order, why ids not layers, why the pointer canvas stays
2. Update `CanvasSurface.css`: a `.canvas__layers` block and a `.canvas__svg` block. Both
   absolutely positioned, matching `.canvas__overlay`'s placement including the **2px
   transparent border** that compensates for `.canvas__surface`'s visible one — the existing
   comments warn that a 2px drift makes an overlay point at the wrong seam. `image-rendering:
   pixelated` on the layer canvases. `pointer-events: none` on the SVG and the layer stack.
3. Commit after step 2.
4. Update the stories. Add one showing a multi-layer stack with differing opacities. Every
   story must still mount with **no store provider** — that is the boundary proof and one of
   this component's stated gates.
5. Update `__tests__/CanvasSurface.dom.test.tsx`: N ids render N canvases; reordering ids
   reorders DOM nodes **without remounting** (assert element identity — this is the pooling
   proof); `registerLayerCanvas` is called with the element on mount and `null` on unmount;
   opacity and visibility map correctly.
6. Run the gate. Commit.

## Constraints

- **No pixel data, no layer objects, no frame objects as props.** Ids, numbers, booleans,
  callbacks. This is the hard rule of the file.
- **No store, API, MobX, `observer()` or `useContext`.** ESLint enforces it; the stories
  mounting bare is the proof.
- **Do not add z-index values.** Use source order, as the file's comments require. A new
  z-index here is also a stylelint error.
- **Do not build the background DIV** — task 06. Leave the slot.
- Do not modify anything under `ui/canvas/` or any container.
- Do not remove `image-rendering: pixelated` from anything.

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

**Manual checks — mandatory, and this is the wave's real gate.** `bun run dev`. Task 05 has
not yet taught the container to paint per layer, so **the artwork may be blank or partial —
that is expected**. What you are verifying is the *chrome*, which task 02 broke and task 03
replaced. Check each, at **default zoom and again at high zoom**:

1. **Grid lines** — visible as a true grid, lines stay ~1px on screen at every zoom, no grey
   wash. (Wash = the `strokeGrid` failure.)
2. **Hover marker outline** — visible. It rendered *nothing* after task 02; this is the
   silent-failure check.
3. **Brush outline** — visible with a real outline, not dots.
4. **Marching ants** — make a selection: dashes crawl, both colours interleave, and a
   1–2 cell selection still draws.
5. **Origin cross** — the same *screen* size at every zoom, with its circle. If it grows with
   zoom, `non-scaling-stroke` is missing.
6. **Reflection guides** — with the reflection tool active, dashes are screen-constant and
   still animate.
7. **Layer stack** — in devtools, one `<canvas>` per layer in the right order, each
   `cellWidth × cellHeight`. Toggle a layer's visibility: the right node hides.
8. **Drawing still registers** at the right cell (the pointer canvas survived).

## Definition of done

- [ ] One `<canvas>` per layer, keyed by `layer.id`, below all overlays.
- [ ] Props carry ids/numbers/booleans/callbacks only — **no pixel or layer data**.
- [ ] SVG chrome mounted last in `.canvas__frame`.
- [ ] `canvasRef` still the pointer surface; rationale documented in the header.
- [ ] Reflection canvas removed if now unused, and the finding reported.
- [ ] CSS: `.canvas__layers` and `.canvas__svg`, 2px transparent border preserved, no new z-index.
- [ ] `image-rendering: pixelated` on layer canvases.
- [ ] Stories updated, including a multi-layer story, all mounting with no store provider.
- [ ] DOM tests cover count, reorder-without-remount (element identity), register/unregister, opacity, visibility.
- [ ] All six gate commands exit 0; output pasted.
- [ ] All eight manual checks done at two zoom levels and reported individually.
- [ ] No lockfile.
- [ ] Two commits (step 3, step 6).
