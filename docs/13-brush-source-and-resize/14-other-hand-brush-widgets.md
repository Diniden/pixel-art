# 14 — Other-hand mode: the Brush tool's thumb widgets

**Wave:** W4 · **Depends on:** 09, 11
**Touches:** `client/src/containers/otherHand/pixelBrushWidgets.ts` (new) · `client/src/containers/otherHand/toolWidgets.ts` · `client/src/containers/__tests__/OtherHandRailContainer.dom.test.tsx`
**Effort:** S

## Objective
On a tablet in Other Hand Mode with the Brush tool selected, the rail shows thumb widgets
for **Width**, **Height**, the **ratio lock**, and the **scaling strategy** (one stack while
locked, "Scale X" / "Scale Y" stacks when unlocked) — the same rules as the rail section,
bound to the same store. Today the tool shows "Brush has no thumb controls."

## Context
- `containers/otherHand/toolWidgets.ts` (407 lines — already at the containers `max-lines`
  **warning**; put the new widgets in a **new file** so the warning count does not rise,
  MASTER D14): `TOOL_TITLES.brush = "Brush"` `:41`; `planToolSection(app)` `:58`; the
  `switch (tool.selectedTool)` `:215-403` has **no `case "brush"`** (falls to `default`).
  Eraser template `:176-196` (slider spec) and `:225-236`; the one-button toggle idiom
  `case "move"` `:306-321`.
- Widget specs: `ui/components/OtherHand/thumbWidgets.ts` — `ThumbSliderSpec` `:26-46`
  (`kind: "slider"`, `id`, `label`, `value`, `min`, `max`, `step?`, `onChange`, `format?`),
  `ThumbButtonsSpec` `:59-64` (`buttons: { id, label, active?, onClick, title? }[]`). Header
  rule `:11-15`: toggle = one-button stack; choice = N-button stack with one active. No new
  widget kind is needed.
- Store (task 11): `app.ui.pixelBrush` — `effectiveSize(native)`, `setWidth/setHeight(v, native)`,
  `lockRatio`, `setLockRatio`, `scaleX/scaleY`, `setScale`, `resetSize`; `pixelBrushSliderMax`.
  Native size: `app.brushes.document` width/height (read at the scalar level only).
  Options: `PIXEL_BRUSH_SCALE_OPTIONS` `short` labels (task 09) for the button stacks.
- Test rig: `containers/__tests__/OtherHandRailContainer.dom.test.tsx` — set
  `app.ui.layout.otherHandSection` **directly** (`:26-33`; `enterOtherHand` is a no-op off
  a tablet), drive sliders by **keyboard** (`nudgeChannel` `:60-76`), section key
  `"tool:brush"`.

## Steps
1. `pixelBrushWidgets.ts`: `export function pixelBrushWidgets(app: ApplicationStore): ThumbWidgetSpec[]`
   returning, in order: slider `width` "Width" (1..max, `format` `${v} px`), buttons `lock`
   "Ratio" (one button, label `Locked`/`Free`, `active = lockRatio`), slider `height`
   "Height", buttons `scale` "Scale" (locked; 11–12 buttons, `label: short`, `title: label`,
   `active` = current) **or** `scale-x` "Scale X" + `scale-y` "Scale Y" (unlocked), buttons
   `reset` "Size" with one action button `Native` (no `active`). With no document loaded
   return `[]` (the surface shows its empty message).
2. `toolWidgets.ts`: `case "brush": widgets.push(...pixelBrushWidgets(app)); break;` — one
   import, one case.
3. Tests: with a 4×4 brush installed and `otherHandSection = "tool:brush"`: the Width and
   Height sliders render (`getByRole("slider", { name: "Width" })`); ArrowUp on Width calls
   `setWidth` and Height follows while locked; tapping `Locked` → `Free`, then ArrowUp on
   Width leaves Height; the Scale stack marks `NN` active, tapping `BIL` sets both axes;
   unlocked shows two stacks; `Native` resets; without a document the empty message shows.
   Positions persist under `"tool:brush"` (one `setOtherHandWidgetPosition` assertion).
4. Commit: `brush-scale(14): other-hand thumb widgets for the Brush tool`.

## Constraints
- Do not touch `ui/components/OtherHand/*` (no new widget kind) or `OtherHandRailContainer.tsx`.
- Never read a brush grid in `planToolSection`'s observer — scalars only.

## Verification
```sh
cd client && bunx tsc --noEmit && bunx eslint src/containers/otherHand src/containers/__tests__/OtherHandRailContainer.dom.test.tsx && bunx vitest run src/containers/__tests__/OtherHandRailContainer.dom.test.tsx src/containers/otherHand
```
`bunx eslint src/containers/otherHand/toolWidgets.ts` must report **no more warnings than
before** (measure before and after; the file is already over the ratchet).
Manual (iPad or the tablet device class): enter Other Hand Mode on the Brush section; the
two sliders and stacks are thumb-reachable; dragging Width moves Height while locked;
`Free` releases; the scale stack fits without clipping (12 buttons); positions survive a
rail exit/re-enter.

## Definition of done
- [ ] `case "brush"` present; widgets built in the new file; store rules honoured.
- [ ] Container test green; lint warning count unchanged; manual checks performed and listed.
