# 07 — Studio panel wiring for edge/fill deltas + `X` swap in brush mode

**Wave:** W2 · **Depends on:** 03, 05
**Touches:** `client/src/containers/BrushStudioPanelContainer.tsx` · `client/src/containers/__tests__/BrushStudioPanelContainer.dom.test.tsx` (new) · `client/src/containers/GlobalHotkeys.tsx` · `client/src/containers/__tests__/GlobalHotkeys.dom.test.tsx`
**Effort:** S

## Objective
The brush studio panel drives the new picker props from `brushUI` (active slot, both swatches,
target switch, swap), and the `X` hotkey swaps deltas in brush mode instead of the pixel
studio's colours.

## Context
- Container today: `containers/BrushStudioPanelContainer.tsx:164-178` passes
  `channelType`, `value={brushUI.selectedDelta}`, `onChange → setDeltaChannel`, `onReset → resetDelta`,
  `disabled`. `isDeltaIndex` guard at `:58-59`.
- Pixel precedent: `containers/ColorPickerContainer.tsx:99-150` — `target={ui.tool.colorTarget}`,
  `onTargetChange`, `edgeColor`, `fillColor`, `selectedColor` resolved by target (`:109-113`),
  `onSwapColors={() => app.swapEdgeAndFillColors()}` (`:144`); `:140-143` says never bracket
  swap with a history save.
- Store (task 03): `brushUI.deltaTarget`, `activeDelta`, `fillDelta`, `selectedDelta` (edge),
  `setDeltaTarget`, `setActiveDeltaChannel`, `resetActiveDelta`, `swapDeltas`.
- Picker (task 05): optional `target`, `onTargetChange`, `edgeValue`, `fillValue`, `onSwap`.
- Hotkey: `containers/GlobalHotkeys.tsx:134-144` — bare `x`/`X` (no modifiers, not in a text
  field) → `app.swapEdgeAndFillColors()`, unconditional on studio mode. Rationale `:113-133`.
  The studio mode is read in this file already (`lightingUI.studioMode`, grep). Tests:
  `containers/__tests__/GlobalHotkeys.dom.test.tsx:145-236` (10 tests on `X`).

## Steps
1. Panel container: `target={brushUI.deltaTarget}`, `onTargetChange={(t) => brushUI.setDeltaTarget(t)}`,
   `edgeValue={brushUI.selectedDelta}`, `fillValue={brushUI.fillDelta}`, `value={brushUI.activeDelta}`,
   `onChange → setActiveDeltaChannel`, `onReset → resetActiveDelta`, `onSwap={() => brushUI.swapDeltas()}`.
2. `GlobalHotkeys.tsx`: in the `X` branch, `if (studioMode === "brush") app.brushUI.swapDeltas(); else app.swapEdgeAndFillColors();`
   — keep the typing-target guard and `preventDefault` exactly as they are. Update the comment.
3. Tests: new `BrushStudioPanelContainer.dom.test.tsx` (construct `ApplicationStore` with
   `autoSaveEnabled: false` like `BrushStudioContainer.dom.test.tsx`, install a document,
   click Fill → `brushUI.deltaTarget === "fill"`, move a slider → `fillDelta` changes and
   `selectedDelta` does not, swap → exchanged). `GlobalHotkeys.dom.test.tsx`: add "X in brush mode
   swaps deltas and leaves `ui.tool` colours untouched" and "X in pixel mode is unchanged".
4. Commit: `brush-followups(07): panel wires edge/fill deltas; X swaps deltas in brush mode`.

## Constraints
- Do not edit `ColorPickerContainer.tsx`, `OtherHandRailContainer.tsx` (Other-Hand delta slot is
  an open item, not this task), any store, or any `ui/` file.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/containers
cd client && bunx vitest run src/containers
cd client && bun run lint:boundaries
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Manual (owner): in brush mode the panel shows Edge/Fill tabs with swatches; editing under Fill
leaves Edge alone; `X` swaps; in pixel mode `X` still swaps colours.

## Definition of done
- [ ] Panel passes every new picker prop from `brushUI`; hotkey branches by studio mode.
- [ ] Tests added; gate green; one commit with only Touches files.
