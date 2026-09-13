# 13 — Rail: `PixelStudioBrushSection` with size sliders, ratio lock and strategy pickers

**Wave:** W4 · **Depends on:** 09, 11
**Touches:** `client/src/ui/components/PixelStudioPanel/PixelStudioBrushSection.tsx` (new) · `client/src/ui/components/PixelStudioPanel/PixelStudioBrushSection.stories.tsx` (new) · `client/src/ui/components/PixelStudioPanel/__tests__/PixelStudioBrushSection.dom.test.tsx` (new) · `client/src/ui/components/PixelStudioPanel/PixelStudioPanel.tsx` · `client/src/ui/components/PixelStudioPanel/PixelStudioPanel.css` · `client/src/ui/components/PixelStudioPanel/__tests__/PixelStudioPanel.dom.test.tsx` · `client/src/containers/PixelStudioPanelContainer.tsx` · `client/src/containers/__tests__/PixelStudioPanelContainer.dom.test.tsx`
**Effort:** M

## Objective
With the Brush tool selected, the rail's Brush section shows **Width** and **Height**
sliders (with numeric inputs), a **ratio lock** button, a **Native size** reset, and the
**scaling strategy** picker — one dropdown while locked, "Scale X" / "Scale Y" when unlocked.
The section is its own component so `PixelStudioPanel.tsx` stays under the `max-lines`
error threshold.

## Context
- `PixelStudioPanel.tsx` (463 raw / ~367 code lines — the `src/ui/**` `max-lines` limit is
  an **error at 400**): `PixelStudioBrushInfo` `:86-98`; `showBrushControls` `:214`; the
  inline Brush section `:395-440` (`panel pixel-studio-panel__section`, `<dl>` rows,
  status copy, "Open Brush Studio" button, hint). Precedent for an extracted section:
  `ReflectionLinesSection.tsx` in the same folder.
- CSS `PixelStudioPanel.css`: `__brush` `:174`, `__brush-rows/row/label/value` `:182-203`,
  `__brush-status/open/hint` `:213-224`; the size-control idiom `__size-control` `:57`,
  `__size-input-group` `:64`, `__size-value` `:75`; `__shape-btn` / `--active` `:96-108, :235`.
- Primitives (`client/src/ui/primitives/`): `SliderWithNumber` (`label`, `value`, `min`,
  `max`, `step`, `onChange`, `name`) — **use it** (MASTER D13); `IconButton` (`icon`,
  `label`, `aria-pressed` via rest props) with lucide `Link` / `Unlink`; `Dropdown<T>`
  (`options: { value, label }[]`, `value`, `onChange`, `label`); `Button`.
- Options from task 09: `PIXEL_BRUSH_SCALE_OPTIONS` (`ui/` may import
  `@/ui/canvas/tools/pixelBrushScale` — same tier). Store rules live in task 11; this
  component only reports intents.
- Container `PixelStudioPanelContainer.tsx:150-178` builds `pixelBrush` only for the brush
  tool; add the `size` group from `app.ui.pixelBrush` + the native size from the document.
  Its test `containers/__tests__/PixelStudioPanelContainer.dom.test.tsx:96-190` (rig `:44-70`).
- Existing panel test `__tests__/PixelStudioPanel.dom.test.tsx` covers the section gate and
  the Open button — keep those green after extraction.

## Steps
1. Extend the prop type (in `PixelStudioBrushSection.tsx`, re-exported from `PixelStudioPanel.tsx`
   so existing imports hold):
   ```ts
   export interface PixelStudioBrushSizeControls {
     width: number; height: number;           // effective, already resolved by the container
     nativeWidth: number; nativeHeight: number;
     max: number;                              // pixelBrushSliderMax(native)
     lockRatio: boolean;
     scaleX: PixelBrushScaleStrategy; scaleY: PixelBrushScaleStrategy;
     onWidthChange(w: number): void; onHeightChange(h: number): void;
     onLockRatioChange(locked: boolean): void;
     onScaleChange(axis: "x" | "y", id: PixelBrushScaleStrategy): void;
     onResetSize(): void;
   }
   export interface PixelStudioBrushInfo { …existing…; size?: PixelStudioBrushSizeControls }
   ```
2. `PixelStudioBrushSection.tsx`: move the section JSX out of `PixelStudioPanel.tsx`
   verbatim (same classes), then add below the `<dl>` a `pixel-studio-panel__brush-size`
   block: `SliderWithNumber` "W" (1..max) and "H"; between them an `IconButton`
   `label="Lock aspect ratio"` `aria-pressed={lockRatio}` icon `Link`/`Unlink`; a row
   with the `Dropdown` (locked: one, `label="Scaling"`; unlocked: two, "Scale X" /
   "Scale Y"), options `label` = option label, grouped visually by a disabled separator
   item `"— pixel-art (both axes) —"` before the first 2-D option; a `Button` "Native size"
   disabled when `width === nativeWidth && height === nativeHeight`. Readout line
   `"{width} × {height} (native {nativeWidth} × {nativeHeight})"`.
   `PixelStudioPanel.tsx` renders `<PixelStudioBrushSection pixelBrush={…} onOtherHand={…} />`.
3. CSS: `__brush-size`, `__brush-size-row`, `__brush-lock` (+ `--active` ring reusing the
   `--active` shape-btn tokens), `__brush-scale`. No new colours outside the token set.
4. Story `PixelStudioBrushSection.stories.tsx`: `Loaded`, `LoadedUnlocked`, `PixelArtScaler`,
   `Empty`, `Loading` with `fn()` callbacks and a `useState` wrapper for the sliders.
5. Tests: `PixelStudioBrushSection.dom.test.tsx` — sliders fire the callbacks with numbers;
   lock button toggles and reports; locked shows one dropdown, unlocked two; choosing an
   option fires `onScaleChange("x", id)`; "Native size" disabled at native; keyboard: Tab
   order W → lock → H. Update `PixelStudioPanel.dom.test.tsx` only where the extraction
   changed a selector. Container test: with a 4×4 brush the section shows `4 × 4`;
   nudging W (keyboard ArrowRight on the slider) calls `ui.pixelBrush.setWidth` and, locked,
   H follows; choosing `bilinear` sets both store axes; unlock then choose sets one.
6. Commit: `brush-scale(13): rail brush size sliders, ratio lock, strategy pickers`.

## Constraints
- `ui/` purity; `max-lines` error at 400 code lines for **both** components — the new one
  must also stay under. Do not touch `usePixelBrush.ts` (task 12) or the other-hand files (task 14).
- The colour picker below the section stays unconditional (plan 12 D10).

## Verification
```sh
cd client && bunx tsc --noEmit && bunx eslint src/ui/components/PixelStudioPanel src/containers/PixelStudioPanelContainer.tsx && bunx vitest run src/ui/components/PixelStudioPanel src/containers/__tests__/PixelStudioPanelContainer.dom.test.tsx && bun run lint:boundaries && bunx stylelint "src/ui/components/PixelStudioPanel/*.css" && bunx storybook build
```
Manual (`bun run dev`, desktop): select B with a brush loaded; slide W — H follows at the
native ratio and the marker grows; click the lock — sliders move independently; re-lock
at a new ratio and slide again; pick "EPX" — both axes show EPX and the marker is the
crisp 2× shape; pick "Lanczos 3" on X while unlocked with EPX on Y — Y flips to Nearest;
"Native size" returns to the document size; the section fits the rail at its narrowest
width without horizontal overflow; light and dark themes.

## Definition of done
- [ ] Section extracted; panel under the line limit; all controls wired through props.
- [ ] Stories build; component, panel and container tests green; stylelint no new errors.
- [ ] Manual checks performed and listed.
