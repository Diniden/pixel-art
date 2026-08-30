# 03 — `CanvasSplit`: the pure side-by-side pane container

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/components/CanvasSplit/CanvasSplit.tsx` (new) · `client/src/ui/components/CanvasSplit/CanvasSplit.css` (new) · `client/src/ui/components/CanvasSplit/CanvasSplit.stories.tsx` (new) · `client/src/ui/components/CanvasSplit/__tests__/CanvasSplit.dom.test.tsx` (new)
**Effort:** S

## Objective
A pure `ui/` component that takes one or two keyed panes and lays them out to fill the canvas
region: one pane = full width (visually identical to today); two panes = an equal side-by-side
split with a 1px divider, each pane an independent overflow-hidden flex box so a `CanvasSurface`
inside it gets its own `.canvas__viewport` (and therefore its own containing block for its
floating controls). Pane order follows the array order; pane identity follows the `key`.

## Context
- There is **no split-pane pattern anywhere in `client/src`** (measured 2026-08-29). This is
  the first one. Keep it minimal: no draggable divider, no persisted ratio (D7).
- Where it will be mounted: `PixelStudioLayout` passes its `canvas` prop as the first child of
  `AppShell`'s `.app__canvas-stack` (`AppShell.css:160-168`: `flex: 1; display: flex;
  flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; position: relative`).
  `CanvasSurface`'s root `.canvas` is `flex: 1; display: flex; flex-direction: column; min-*: 0;
  width: 100%` (`CanvasSurface.css`). So each pane must be a **flex column** with `flex: 1 1 0;
  min-width: 0; min-height: 0; display: flex; overflow: hidden` for the surface inside it to size
  correctly.
- The floating reference panels, `CanvasInfo` and `LayerColors` are **siblings** of the canvas
  in `.app__canvas-stack`, positioned against `.app__canvas-area` — they are unaffected by the
  split and must remain so (do not give the split block `position: relative` expectations they
  would inherit — it may be `position: relative` for its own divider only).
- **Pane identity is the React `key`.** Task 06 will map `["full","layer"]` or
  `["layer","full"]` to panes; a swap must re-order DOM nodes, **not remount** them — remounting
  would throw away each pane's offscreen caches and re-run its native listener binding. Render
  the panes with `key={pane.key}` and nothing else that could change identity.
- Precedents: `client/src/ui/components/CanvasSurface/` (pure component + stories + `composeStories`
  DOM test with no provider); region stubs for stories at `client/src/ui/layouts/regionStubs.tsx`
  (inline styles only — they must not introduce class names; `scripts/check-classes.mjs` audits
  declared-vs-referenced classes).
- Tokens: `--border-primary` for the divider, `--space-*` for gaps. No literals.

## Steps
1. Create `CanvasSplit.tsx`:
   ```ts
   export interface CanvasSplitPane { key: string; node: ReactNode }
   export interface CanvasSplitProps {
     /** 1 or 2 panes, in left→right order. */
     panes: ReadonlyArray<CanvasSplitPane>;
   }
   export function CanvasSplit({ panes }: CanvasSplitProps)
   ```
   Markup: `<div className={classNames("canvas-split", panes.length > 1 && "canvas-split--dual")}>`
   › one `<div className="canvas-split__pane" data-pane={pane.key} key={pane.key}>` per pane.
   (Use the shared helper: `import { classNames } from "../../classNames";` — the same import
   `AppShell.tsx:96` and `Toolbar.tsx:33` use.)
2. Create `CanvasSplit.css`: block `canvas-split` (`flex: 1; display: flex; flex-direction: row;
   min-width: 0; min-height: 0; overflow: hidden; width: 100%`); `canvas-split__pane` (`flex: 1 1
   0; display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden;
   position: relative`); `.canvas-split--dual > .canvas-split__pane + .canvas-split__pane`
   gets `border-left: 1px solid var(--border-primary)`. Add
   `@media (orientation: portrait) { .canvas-split--dual { flex-direction: column } … border-top
   instead of border-left }` so the iPad in portrait stacks the panes. Header comment in house
   style (dated, block name, the one ⚠️: pane identity is the key; a swap reorders, never
   remounts).
3. Stories: `Single` and `Dual` using two coloured inline-styled stub boxes labelled
   "Full" / "Layer" (inline styles only), and `DualSwapped` with the array reversed.
4. DOM test: mount the three stories via `composeStories` with no provider; assert `Single` has
   one `.canvas-split__pane` and no `--dual` class; `Dual` has two panes with `data-pane` in the
   given order; `DualSwapped` reverses that order. Add a re-render test: render `panes` A,B then
   re-render B,A with the same keys and assert the **same DOM element instances** (`===` on the
   nodes captured before/after) are still present — that pins the no-remount contract.
5. Commit: `feat(ui): CanvasSplit pane container`.

## Constraints
- Pure `ui/`: no store, API, MobX, `useContext`. No `types/` needed.
- No draggable divider, no ratio state, no persistence.
- Do not touch `AppShell`, `PixelStudioLayout`, `CanvasSurface`, or any container.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/ui/components/CanvasSplit
cd client && bunx stylelint "src/ui/components/CanvasSplit/*.css"          # 0 errors
cd client && bunx vitest run src/ui/components/CanvasSplit                 # pass
cd client && bun run lint:boundaries                                       # OK
cd client && bunx storybook build                                          # OK; 3 new stories
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules                # nothing
```
Manual: `bun run storybook` → `Dual` shows two equal halves with a 1px divider; narrow the
browser to portrait → they stack.

## Definition of done
- [ ] Component, CSS, 3 stories, DOM tests (including the same-element-after-swap test) exist and pass.
- [ ] stylelint clean; no orphan classes.
- [ ] One commit, only the four `Touches` files staged.
