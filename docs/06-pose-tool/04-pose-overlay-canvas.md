# 04 — The pose overlay canvas in `CanvasSurface`

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/components/CanvasSurface/CanvasSurface.tsx` · `client/src/ui/components/CanvasSurface/CanvasSurface.css` · `client/src/ui/components/CanvasSurface/CanvasSurface.stories.tsx` · `client/src/ui/components/CanvasSurface/__tests__/CanvasSurface.dom.test.tsx`
**Effort:** S

## Objective

`CanvasSurface` mounts one additional always-present `<canvas className="canvas__overlay
canvas__overlay--pose">` above the layer stack and below the reflection overlay, exposed
through a new **optional** `poseCanvasRef` prop. Nothing paints into it yet — task 08 does
that. Because the prop is optional, this task compiles and ships on its own.

## Context

`client/src/ui/components/CanvasSurface/CanvasSurface.tsx` is 780 lines and **pure**: no
store, no MobX, no `observer()`, no `useContext` (header `:20-29`), and **no pixel grid may
cross its boundary** (`:31-53`) — it takes `layerIds`, a `registerLayerCanvas` callback and
plain records, never a grid.

### The stacking rule — read this before placing anything

**DOM order IS z-order here, deliberately** (header `:58-74`). Every absolutely-positioned
block inside `.canvas__frame` shares `var(--z-canvas-overlay)` (`styles/tokens.css:433`,
value `20`), so the **later sibling wins**. Do **not** add a numeric `z-index` — it is
redundant and is a **stylelint error** (`declaration-strict-value`).

Current source order inside `.canvas__frame` (JSX `:556-773`):

| # | Element | Line |
| --- | --- | --- |
| 1 | `div.canvas__background` (checkerboard) | `:582` |
| 2 | `div.canvas__layers` → N × `canvas.canvas__layer` | `:608` |
| 3 | `canvas.canvas__surface` — **pointer surface** | `:632` |
| 4 | `canvas.canvas__overlay--hover` | `:652` |
| 5 | `canvas.canvas__overlay` — reference trace *(conditional)* | `:660` |
| 6 | `canvas.canvas__overlay` — onion skin *(conditional)* | `:669` |
| 7 | `canvas.canvas__overlay` — frame trace *(conditional)* | `:679` |
| 8 | `canvas.canvas__overlay--reflection` — always mounted | `:695` |
| 9 | `svg.canvas__svg` — all vector chrome, topmost | `:714` |

**MASTER D10 places the pose overlay immediately BEFORE the reflection overlay** — i.e.
between #7 and #8. That puts it above every layer and every trace overlay, and below the
reflection guides and the SVG chrome.

### Sizing

Backing stores are **1:1 with the pixel data** — `width={cellWidth} height={cellHeight}`,
never multiplied by zoom (header `:248-260`). Copy the reflection overlay's JSX (`:695-701`)
verbatim in shape; it is the closest precedent and is also always-mounted.

⚠️ Setting `canvas.width` **clears the backing store and resets `imageSmoothingEnabled` to
`true`**. That matters for the painter (task 08), not for you, but do not add any smoothing
attribute here.

### Why the ref prop is optional

`reflectionCanvasRef?` is optional for exactly this reason — task 05 of that plan landed
before its container wiring, and every existing caller and story predates it. Do the same:
`poseCanvasRef?: RefObject<HTMLCanvasElement | null>`. **Do not** make it required; that
would break `LightingCanvasContainer` (which renders the same component), the stories, and
the DOM tests at compile time.

⚠️ Note that `reflectionCanvasRef` is currently **not passed** by `CanvasContainer` (JSX
comment `:4257-4263`) — its raster painter was retired in favour of SVG chrome and the
canvas mounts blank. Pose is different: it **is** a raster overlay and task 08 **will** pass
its ref. Do not copy the "deliberately not passed" comment.

### Constraints on the CSS

`CanvasSurface.css` is 415 lines. The shared `.canvas__overlay` rule at `:370` already
supplies positioning and `--z-canvas-overlay`; your `--pose` modifier should add **only**
what differs (likely `image-rendering: pixelated` if the base rule does not already set it —
check `:370` and the `.canvas__layer` rule at `:288` first, and do not duplicate).

⚠️ **Never add `will-change: transform`** to anything in this stack (`:53-72`): promotion
makes the subtree rasterise at 1:1 then GPU-bilinear-scale, defeating `pixelated`. This is a
documented past regression.

⚠️ **No borders.** Five elements previously carried `2px solid transparent` compensation and
all were removed 2026-08-31 (`:85-102`).

⚠️ The stylelint baseline is **exactly 2 pre-existing errors** (`ConfirmDialog.css:15`,
`IconButton.css:32`). Your CSS must not raise that count.

⚠️ `CanvasSurface.tsx` and `.css` may have uncommitted edits from the in-flight edge/fill
work — check `git diff` and stage only your hunks with `git add -p`.

## Steps

1. Add `poseCanvasRef?: RefObject<HTMLCanvasElement | null>` to the props interface
   (`:161-402`), documented like the other refs, with a comment noting it is optional so
   the component compiles ahead of its container wiring, and that unlike
   `reflectionCanvasRef` it **is** intended to be driven.
2. Add the `<canvas>` element inside `.canvas__frame`, **immediately before** the reflection
   overlay at `:695`, with `className="canvas__overlay canvas__overlay--pose"`,
   `ref={poseCanvasRef}`, `width={cellWidth}`, `height={cellHeight}`. Match the reflection
   overlay's attribute style exactly. Add a short comment naming its stacking position and
   why (above layers and traces, below reflection guides and SVG chrome).
3. Add the `.canvas__overlay--pose` rule to `CanvasSurface.css` — only the declarations that
   differ from the shared `.canvas__overlay` base. No `z-index`, no border, no
   `will-change`.
4. Update `CanvasSurface.stories.tsx` so at least one story exercises the new overlay's
   presence (following whatever pattern the existing stories use for the reflection canvas).
5. Extend `__tests__/CanvasSurface.dom.test.tsx` with an assertion that the pose overlay is
   **always rendered** (not conditional), that it carries both class names, and that its
   `width`/`height` attributes equal `cellWidth`/`cellHeight`. Also assert its **DOM
   position**: it must appear after the frame-trace overlay and before the reflection
   overlay — order is the z-order contract and deserves a real assertion.
6. Run the full verification. **Commit after step 6**:
   `feat(pose): mount the pose overlay canvas above the layer stack`.

## Constraints

- **No numeric `z-index`** in the new CSS. DOM order is the mechanism.
- **No `will-change`**, no borders, no smoothing attributes.
- The ref prop **must be optional**. Do not touch any existing prop's optionality.
- Do not paint anything. Do not import three, a store, or MobX. This file is pure `ui/`.
- Do not reorder any existing element in `.canvas__frame`.
- Do not touch `CanvasContainer.tsx` (task 08) or `LightingCanvasContainer.tsx` (out of
  scope — it renders this same component and must keep compiling untouched, which the
  optional prop guarantees).

## Verification

From `client/`:

```sh
bunx tsc --noEmit                                   # exit 0
bunx eslint .                                       # 0 errors
bunx vitest run                                     # all pass, incl. your new assertions
bun run lint:boundaries                             # OK
bunx stylelint "src/**/*.css"                       # EXACTLY 2 errors — count them
bunx storybook build                                # succeeds
```

From the repo root:

```sh
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules    # nothing
```

**Manual checks:**

1. `bun run dev` starts. The canvas renders exactly as before — **no visual change at all**,
   because the overlay is transparent and empty. Any visual difference means you disturbed
   the stack.
2. In devtools, inspect `.canvas__frame` and confirm the child order is: background, layers,
   surface, hover, [conditional overlays], **pose**, reflection, svg.
3. Confirm the pose canvas's `width`/`height` attributes match the object's grid size, and
   change with a resize.
4. Draw normally with the pencil, and check the selection marching ants and origin cross
   still render **above** the artwork — proving nothing was buried.
5. Open the lighting studio (which reuses `CanvasSurface`) and confirm it still renders
   correctly.

## Definition of done

- [ ] `poseCanvasRef` is an **optional** prop, documented.
- [ ] The pose overlay is **always mounted**, positioned between the frame-trace overlay and
      the reflection overlay.
- [ ] It carries `canvas__overlay canvas__overlay--pose` and 1:1 `width`/`height`.
- [ ] The CSS modifier adds no `z-index`, no border, no `will-change`.
- [ ] A DOM test asserts presence, classes, dimensions **and sibling order**.
- [ ] A story covers it; `bunx storybook build` succeeds.
- [ ] Stylelint reports **exactly 2** errors (unchanged baseline).
- [ ] Full gate green; no lockfile.
- [ ] All 5 manual checks performed and recorded.
- [ ] One commit, containing only this task's hunks.
