# 02 — `CanvasViewControls`: mode button, close, and variant-offset arrows

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/components/CanvasViewControls/CanvasViewControls.tsx` · `client/src/ui/components/CanvasViewControls/CanvasViewControls.css` · `client/src/ui/components/CanvasViewControls/CanvasViewControls.stories.tsx` (new) · `client/src/ui/components/CanvasViewControls/__tests__/CanvasViewControls.dom.test.tsx` (new)
**Effort:** S

## Objective
The floating control cluster over a canvas pane can show, purely from props: (a) a **mode
button** directly above the zoom-reset button — either "open the other mode" or "swap sides";
(b) an optional **close** button between them (only meaningful when two panes are open); and
(c) an optional row of four small **arrow buttons** along the bottom that nudge the variant
offset (mimicking WASD; shift-click = all frames). Every button is the same size as the
existing zoom-reset button. The component stays pure (`ui/`), and the existing single-button
rendering is unchanged when the new props are omitted.

## Context
- Current file: `client/src/ui/components/CanvasViewControls/CanvasViewControls.tsx` (57 lines),
  one prop `onResetView`, block `canvas-view-controls`, elements `__btn` and `__icon`, lucide
  `Locate` icon at size 14 via `Icon` (`ui/primitives/Icon`). The CSS
  (`CanvasViewControls.css`) positions the block `position: absolute; left: var(--space-3);
  bottom: var(--space-3); z-index: var(--z-overlay-control)` as a **column** (`flex-direction:
  column; gap: var(--space-2)`), `pointer-events: none` on the block and `auto` on children.
  The header comment says it positions against `.app__canvas-area`; **at runtime the
  containing block is `.canvas__viewport`** (`CanvasSurface.tsx:246` renders `viewControls` as a
  direct child of it, and `.canvas__viewport` is `position: relative`). Correct that comment —
  it is what makes per-pane controls work in the split.
- **Layout target** (D8): the block becomes a bottom-anchored **row** of two groups:
  ```
  ┌ canvas-view-controls (row, align-items: flex-end) ───────────────┐
  │ ┌ __stack (column) ┐  ┌ __offsets (row, only when onNudgeOffset) ┐│
  │ │ [mode]           │  │ [←] [↑] [↓] [→]                          ││
  │ │ [close]?         │  └──────────────────────────────────────────┘│
  │ │ [reset]          │                                              │
  │ └──────────────────┘                                              │
  └──────────────────────────────────────────────────────────────────┘
  ```
  The mode button is **always directly above** the reset button when no close button is shown,
  and above the close button otherwise — it is always the top of the stack (the request:
  "always above the zoom reset button"). Arrow order left-to-right: `←`, `↑`, `↓`, `→`.
- Icons (all exist in `lucide-react@0.575.0`): open-other → `Columns2`; swap → `ArrowLeftRight`;
  close → `X`; arrows → `ArrowLeft`, `ArrowUp`, `ArrowDown`, `ArrowRight`. Size 14, matching `Locate`.
- Shift-click on an arrow mirrors Shift+WASD: `useCanvasKeyboard.ts:208-232` passes
  `setVariantOffset(dx, dy, e.shiftKey)` — the third argument reaches
  `VariantStore.setVariantOffset(dx, dy, allFrames)` and means **apply to all frames**, not a
  larger step. The arrow buttons pass `e.shiftKey` the same way.
- `ui/` boundary: React, `lucide-react`, `Icon`, own CSS. No store, no MobX, no `types/` needed
  (labels arrive as strings, so this component never learns the mode union).
- Story precedent: `client/src/ui/components/CanvasSurface/CanvasSurface.stories.tsx` (no
  provider; `composeStories` mounted in `__tests__/CanvasSurface.dom.test.tsx`). Copy that pair.
  `scripts/check-classes.mjs` audits declared-vs-referenced class names — every class in the CSS
  must be referenced in the TSX and vice-versa.

## Steps
1. Extend the props:
   ```ts
   export interface CanvasViewControlsProps {
     onResetView: () => void;
     /** The button ABOVE reset: open the other render mode, or swap pane sides. */
     modeButton?: {
       kind: "open" | "swap";
       /** e.g. "Open Layer view" / "Swap panes" — used as title + aria-label. */
       label: string;
       onClick: () => void;
     };
     /** Close THIS pane. Only passed when two panes are open. */
     onClose?: { label: string; onClick: () => void };
     /** Variant-offset arrows (Full mode, variant layer selected). `allFrames` = shift held. */
     onNudgeOffset?: (dx: number, dy: number, allFrames: boolean) => void;
   }
   ```
2. Restructure the JSX into `canvas-view-controls` › `canvas-view-controls__stack` (mode →
   close → reset, all `canvas-view-controls__btn`) and, when `onNudgeOffset` is given,
   `canvas-view-controls__offsets` with four `canvas-view-controls__btn
   canvas-view-controls__btn--arrow` buttons. Arrow `onClick={(e) => onNudgeOffset(dx, dy,
   e.shiftKey)}`; `aria-label`s: "Nudge variant left/up/down/right (shift: all frames)". Add
   `data-kind="open" | "swap"` on the mode button for tests.
3. CSS: keep every existing declaration for `__btn`; add `__stack` (the old column rules),
   `__offsets` (row, `gap: var(--space-2)`), and change the block itself to
   `flex-direction: row; align-items: flex-end; gap: var(--space-3)`. Tokens only, no numeric
   z-index, no `!important`. Fix the header comment about the containing block (see Context).
4. Write `CanvasViewControls.stories.tsx` with four stories: `ResetOnly` (props as today),
   `OpenOtherMode`, `SwapAndClose` (both open), `FullModeWithOffsetArrows` (mode + arrows).
   Actions via `fn()` from `storybook/test`.
5. Write `__tests__/CanvasViewControls.dom.test.tsx`: mount every story with `composeStories`
   (no provider); assert the DOM order inside `__stack` is mode → (close) → reset by
   `aria-label`; arrow click calls `onNudgeOffset(-1, 0, false)` for `←`, and shift-click calls
   `(0, -1, true)` for `↑` (use `fireEvent.click(btn, { shiftKey: true })`); `ResetOnly`
   renders exactly one button.
6. Commit: `feat(ui): CanvasViewControls gains mode/close buttons and variant-offset arrows`.

## Constraints
- Rendering with only `onResetView` must produce exactly the button it produces today
  (same class, same title/aria-label, same icon).
- No store, API, MobX or `useContext` import — ESLint will refuse, and `bun run
  lint:boundaries` must still say all rules hold.
- Do not touch `CanvasSurface`, `CanvasContainer`, or any container.
- `max-lines` is an **error** under `src/ui/**` at 400 — stay well under it.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/ui/components/CanvasViewControls
cd client && bunx stylelint "src/ui/components/CanvasViewControls/*.css"     # 0 errors
cd client && bunx vitest run src/ui/components/CanvasViewControls            # pass
cd client && bun run lint:boundaries                                          # OK — all 5 rules hold
cd client && bunx storybook build                                             # OK; 4 new stories
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules                   # nothing
```
Manual: `bun run storybook` → open the four stories; confirm buttons are square, equal in size,
the mode button is the top of the stack, arrows are a bottom row to the right of the stack.

## Definition of done
- [ ] Props extended exactly as above; default rendering unchanged.
- [ ] Four stories build and mount without a provider; DOM tests pass.
- [ ] stylelint clean for the component; `check-classes` (part of `lint:boundaries`/build
      scripts) reports no orphan class.
- [ ] Comment about the containing block corrected.
- [ ] One commit, only the four `Touches` files staged.
