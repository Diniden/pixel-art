# 03 — `LightingSurface` gains a `viewControls` slot (and a containing block)

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/components/LightingSurface/LightingSurface.tsx` · `client/src/ui/components/LightingSurface/LightingSurface.css` · `client/src/ui/components/LightingSurface/LightingSurface.stories.tsx` · `client/src/ui/components/LightingSurface/__tests__/LightingSurface.dom.test.tsx`
**Effort:** S

## Objective
`LightingSurface` can host a floating control cluster over its viewport, exactly the way
`CanvasSurface` hosts `CanvasViewControls` — a new optional `viewControls?: ReactNode` prop
rendered as a direct child of `.lighting-canvas__viewport`, with that element made a
`position: relative` containing block so an absolutely-positioned cluster lands **inside the
pane** and not over the whole studio.

## Context
- **This is the concrete blocker measured on 2026-08-29.** `CanvasViewControls` positions itself
  `position: absolute; left: var(--space-3); bottom: var(--space-3); z-index:
  var(--z-overlay-control)` (`ui/components/CanvasViewControls/CanvasViewControls.css:20-32`). In
  the pixel studio that works because `.canvas__viewport` is `position: relative`
  (`ui/components/CanvasSurface/CanvasSurface.css:38`) and `CanvasSurface` renders
  `viewControls` as its direct child (`CanvasSurface.tsx:148` prop, `:176` destructure, `:246`
  render). **`.lighting-canvas__viewport` is NOT `position: relative`**
  (`LightingSurface.css:39-46`), and `LightingSurface` has no such slot — so without this task a
  control cluster in the lighting studio would position against `.lighting-canvas` and, once the
  region is split, would sit over the wrong pane.
- **Do not put controls inside `.lighting-canvas__surface`.** That element carries the pan/zoom
  `transform` (`LightingSurface.tsx:167-175`, `css:48-52` `will-change: transform`), so anything
  inside it is panned and scaled with the sprite. The slot goes in the **viewport**, which is
  untransformed — the same relationship `CanvasSurface` has.
- Current structure (`LightingSurface.tsx:159-218`):
  ```
  div.lighting-canvas               ref=rootRef      :160   position: relative
    div.lighting-canvas__layout                      :161
      div.lighting-canvas__viewport ref=containerRef :162-166  tabIndex={0}
        div.lighting-canvas__surface                 :167-175  ← transformed, do NOT use
          div.lighting-canvas__stack                 :176
            canvas.lighting-canvas__edit-canvas      :177-191  (7 pointer handlers)
            canvas.lighting-canvas__overlay          :192-197
    div.lighting-canvas__info                        :203-214
    {previewPanel}                                   :216
  ```
- Props today: `LightingSurfaceProps` `:56-124` — refs `:59-74`, `canvasWidth/Height` `:78-80`,
  `viewPanOffset`/`viewZoom` `:90-92`, info-bar fields `:96-101`, `empty?` `:105`,
  `previewPanel?: React.ReactNode` `:114`, seven pointer handlers `:117-123`.
- ⚠️ **The empty branch (`:149-157`) does not attach `rootRef`** and renders neither
  `previewPanel` nor a viewport. Leave that branch alone — task 05 must not expect controls when
  `empty` is true, and this task should not restructure it.
- Existing stories: `Default`, `LightGridMode`, `HeightMode`, `BrushOverlay`, `Zoomed`, `Empty`
  (`LightingSurface.stories.tsx:209-262`). Existing DOM test asserts `.lighting-canvas__viewport`
  exists (`__tests__/LightingSurface.dom.test.tsx:63`).
- `scripts/check-classes.mjs` audits declared-vs-referenced class names; every class you add to
  the CSS must be referenced in the TSX and vice versa.

## Steps
1. Add to `LightingSurfaceProps`, next to `previewPanel`:
   ```ts
   /**
    * Floating control cluster (reset view, mode/close buttons) drawn over this
    * pane. Rendered as a direct child of `.lighting-canvas__viewport`, which is
    * the containing block — so with a split region each pane's controls stay in
    * their own pane. Not rendered in the `empty` state.
    */
   viewControls?: React.ReactNode;
   ```
   Destructure it and render it as the **last child of `.lighting-canvas__viewport`**, after
   `.lighting-canvas__surface` (so it paints above the sprite without being transformed).
2. In `LightingSurface.css`, add `position: relative;` to `.lighting-canvas__viewport`
   (`:39-46`). **That is the only declaration this task adds to that rule.** Do not touch
   `.lighting-canvas__surface`, `__stack`, `__layout`, or any other rule.
3. Update the header comment to record why the viewport is now a containing block (dated block
   name, one ⚠️: controls go in the viewport, never in `__surface`, which is transformed).
4. Stories: add `WithViewControls` — reuse the `Default` args plus a `viewControls` node. Use the
   **real** `CanvasViewControls` component with `onResetView: fn()` and a `modeButton`, so the
   story shows the actual cluster the studio will render (it is a pure `ui/` component; importing
   it from a story is allowed and is what proves the positioning). Inline styles only for any
   extra stubbing — no new class names.
5. DOM test: mount `WithViewControls` via `composeStories`; assert the control cluster is a
   descendant of `.lighting-canvas__viewport` and **not** of `.lighting-canvas__surface`; assert
   the `Empty` story renders no controls; assert the existing structural expectations still pass.
6. Commit: `feat(ui): LightingSurface viewControls slot over a relative viewport`.

## Constraints
- Pure `ui/`: no store, API, MobX or `useContext` import.
- With `viewControls` omitted, the rendered DOM must be **identical to today** — same elements,
  same classes, same order. Diff against that before committing.
- Do not change the pointer handlers, the transform, the info bar, the empty branch, or the
  `previewPanel` slot.
- `max-lines` is an **error** under `src/ui/**` at 400; this file is 219 lines, stay well under.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/ui/components/LightingSurface
cd client && bunx stylelint "src/ui/components/LightingSurface/*.css"    # 0 errors
cd client && bunx vitest run src/ui/components/LightingSurface           # pass
cd client && bun run lint:boundaries                                     # OK — all 5 rules hold
cd client && bun scripts/check-classes.mjs                               # no NEW orphan/missing lighting-canvas class
cd client && bunx storybook build                                        # OK; the new story builds
cd client && bunx prettier --check src/ui/components/LightingSurface
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
**Manual:** `bun run storybook` → open `WithViewControls`; the cluster sits at the bottom-left of
the viewport, does not move when the `Zoomed` story's transform is applied, and is not clipped.
This is a manual check — report it as done or not done, never assume it.

## Definition of done
- [ ] `viewControls?: ReactNode` exists, renders inside `.lighting-canvas__viewport`.
- [ ] `.lighting-canvas__viewport` is `position: relative`; no other CSS rule changed.
- [ ] Omitting the prop produces byte-identical DOM to today.
- [ ] New story + DOM tests pass; stylelint and check-classes clean.
- [ ] One commit, only the four `Touches` files staged.
