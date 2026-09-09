# 05 — BrushDeltaPicker: edge/fill target tabs + swap (pure UI)

**Wave:** W1 · **Depends on:** none
**Touches:** everything under `client/src/ui/components/BrushDeltaPicker/` (`BrushDeltaPicker.tsx`, `BrushDeltaPicker.css`, `BrushDeltaPicker.stories.tsx`, `__tests__/BrushDeltaPicker.dom.test.tsx`)
**Effort:** S

## Objective
The delta picker shows the same edge/fill affordance the colour picker has: a two-tab row
(Edge / Fill) whose swatches preview each slot's colourised delta, an active tab that selects
which slot the sliders edit, and a swap button. Pure props in, callbacks out.

## Context
- Copy source, verbatim in structure: `ui/components/ColorPicker/ColorPicker.tsx:637-687` — a
  `role="tablist"` with two `role="tab"` buttons iterating
  `[["edge","Edge",edgeColor],["fill","Fill",fillColor]]` (`:645-648`), each with
  `<span className="color-picker__target-swatch">` + label; the swap button (`:678-687`,
  `aria-label="Swap edge and fill colors"`, lucide `ArrowLeftRight`) sits **beside** the tablist,
  not inside it (`:671-677` — a third non-tab child would announce "3 tabs"). `onSwapColors` is
  optional and the control renders only when supplied (`:88-96`). CSS:
  `ColorPicker.css:275-357` (`__target-row`, `__targets`, `__target`, `__target-swatch`, `__swap`,
  `__target--active`).
- Current picker props (`BrushDeltaPicker.tsx:42-49`): `channelType`, `value`, `onChange(index, value)`,
  `onReset`, `disabled?`, `className?`. Swatch via `brushCellToRgba(value, channelType)` `:127`.
  Header `:9-13`: no undo debounce, and none may be added.
- Type to export: `export type BrushDeltaTarget = "edge" | "fill";` — declare it **here in
  `ui/`** (ui may not import stores; task 03 declares the same union in the store — keep them
  structurally identical, as `ColorPicker.tsx:61` does for `ColorTarget`).
- Tests/stories: `__tests__/BrushDeltaPicker.dom.test.tsx` (12 tests) and the 8 stories exist;
  extend, don't replace.

## Steps
1. Props: add `target: BrushDeltaTarget`, `onTargetChange(target): void`, `edgeValue: BrushDelta`,
   `fillValue: BrushDelta`, `onSwap?: () => void`. `value` stays "the slot named by `target`"
   (the container resolves it, as `ColorPickerContainer` does at `:109-113`).
2. Render the target row above the sliders: tablist + two tabs (`aria-selected`, swatch coloured
   with `brushCellToRgba(edgeValue|fillValue, channelType)` — grey when `channelType` is null),
   and the swap button when `onSwap` is given (`aria-label="Swap edge and fill deltas"`).
   BEM: `brush-delta-picker__target-row`, `__targets`, `__target`, `__target--active`,
   `__target-swatch`, `__swap`. Keyboard: Left/Right arrows move between tabs (mirror ColorPicker).
3. CSS with tokens only, mirroring `ColorPicker.css:275-357`.
4. Stories: `EdgeActive`, `FillActive`, `WithSwap` (Interactive story keeps local state for both
   slots and the target).
5. Tests: clicking Fill calls `onTargetChange("fill")`; the active tab has `aria-selected="true"`;
   swap button absent without `onSwap`, present and called once with it; the two swatches carry
   the colourised deltas (`#7f7f7f` for zero); sliders still edit `value` via `onChange`.
6. Commit: `brush-followups(05): BrushDeltaPicker edge/fill tabs and swap`.

## Constraints
- No store/MobX/API/container imports; no undo debounce.
- Do not edit `ColorPicker/**` or the shared slider block.

## Prop optionality (locked)
The existing caller `containers/BrushStudioPanelContainer.tsx` is task 07's file (W2) and must
compile unchanged during W1. Therefore `target`, `onTargetChange`, `edgeValue`, `fillValue` and
`onSwap` are all **optional**: with `target`/`onTargetChange` absent the tab row is not rendered
and the picker behaves exactly as today; `edgeValue`/`fillValue` default to `value`. Document
this on the props. Task 07 passes all of them.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/ui/components/BrushDeltaPicker
cd client && bunx stylelint "src/ui/components/BrushDeltaPicker/*.css"   # 0 errors
cd client && bunx vitest run src/ui/components/BrushDeltaPicker
cd client && bun run lint:boundaries
cd client && bunx storybook build
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Manual (Storybook, owner): tabs switch, swatches update as sliders move, swap exchanges them.

## Definition of done
- [ ] Target row + swap rendered from props; BEM/tokens clean; stories and tests added.
- [ ] New props optional with defaults so existing callers compile unchanged.
- [ ] One commit with only the directory staged.
