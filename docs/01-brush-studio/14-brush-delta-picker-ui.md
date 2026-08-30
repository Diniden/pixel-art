# 14 — BrushDeltaPicker UI

**Wave:** W2 · **Depends on:** 01
**Touches:** `client/src/ui/components/BrushDeltaPicker/BrushDeltaPicker.tsx` (new) · `BrushDeltaPicker.css` (new) · `BrushDeltaPicker.stories.tsx` (new)
**Effort:** S

## Objective
A pure component that replaces the colour picker in brush mode: one slider-with-number per
channel of the selected layer's channel type, each −255..255, a live swatch showing the
colourised result, and a "Reset" button. Editing the delta is UI state — no undo contract.

## Context
- Primitives: `ui/primitives/SliderWithNumber` (read its props), `Slider`, `NumberInput`,
  `ColorSwatch`, `Button`, `Panel`. Shared `.slider` block in `styles/blocks/slider.css`.
- Channel table: `BRUSH_CHANNELS[type]` (task 01) gives the labels; `brushCellToRgba(delta, type)`
  gives the swatch colour; `BRUSH_DELTA_MIN/MAX` the range.
- Unlike `ColorPicker` (`ui/components/ColorPicker/ColorPicker.tsx:2-19`), there is **no**
  300 ms undo debounce here: the delta is not document data.

## Steps
1. `BrushDeltaPicker.tsx`:
   ```ts
   export interface BrushDeltaPickerProps {
     channelType: BrushChannelType | null;   // null when no layer selected → EmptyState "Select a layer"
     value: BrushDelta;
     onChange(index: number, value: number): void;
     onReset(): void;
     disabled?: boolean;
   }
   ```
   Render `BRUSH_CHANNELS[channelType].length` sliders (labels H/S/L/A etc.), min −255 max 255
   step 1, each bound to `value[i]`; a swatch (`ColorSwatch` or a plain `div` with tokens) fed
   by `brushCellToRgba(value, channelType)`; the numeric readout shows the signed value.
   Mark the zero point on the track (a `::after` tick or a modifier) so 0 is findable.
2. CSS block `brush-delta-picker`.
3. Stories for each channel type + disabled + null.
4. Commit: `brush-studio(14): BrushDeltaPicker`.

## Constraints
- No store/MobX/API imports. Do not edit `ColorPicker/**` or slider block CSS.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/ui/components/BrushDeltaPicker
cd client && bunx stylelint "src/ui/components/BrushDeltaPicker/*.css"
cd client && bun run lint:boundaries
cd client && bunx storybook build
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Manual in Storybook: dragging a slider updates the swatch; typing −300 clamps to −255; the
number input accepts a leading minus on touch (test with the numeric keyboard on iPad if
available, else note it as unverified).

## Definition of done
- [ ] Component with props above; per-channel sliders and swatch; reset.
- [ ] Stories build; manual checks reported.
- [ ] One commit, only the new directory staged.
