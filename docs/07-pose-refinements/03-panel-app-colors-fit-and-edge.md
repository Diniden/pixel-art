# 03 — Panel: app colours (Fill/Edge), a Fit button, and an edge-thickness slider

**Wave:** W2 · **Depends on:** 01
**Touches:** `client/src/ui/components/PosePanel/PoseSection.tsx` · `client/src/ui/components/PosePanel/PosePanel.css` · `client/src/ui/components/PosePanel/PoseSection.stories.tsx` · `client/src/ui/components/PosePanel/__tests__/PoseSection.dom.test.tsx` · `client/src/containers/PixelStudioPanelContainer.tsx`
**Effort:** M

## Objective

The Pose rail stops using native OS colour swatches. The model colour comes from the app's
own **Fill** slot and the new outline colour from the **Edge** slot, so the picker the owner
already uses drives both. The rail gains a **Fit to canvas** button and an **edge thickness**
slider (whole pixels, 1–4).

## Context

**The owner's words:** *"The color selection is using some form of native color picker. I
want to use the current color picker to set the color. Let's use 'Fill' for setting that
color."* and *"support the 'Edge' color as well by making it do an outline around the model
in that color. It would need a thickness slider for that edge."*

**What exists now.** `PoseSection.tsx` renders two native inputs:

- `:264` — `<input type="color">` bound to `lightColor` via local `toHex`/`fromHex` helpers
  (`:130`, `:136`), transcribed from `OriginColorPicker`.
- `:274` — the same for `modelColor`.

**The seam that makes this clean** — the edge/fill colour split landed in commit `45e3c8a`:

- `ui.tool.selectedColor` is the **EDGE** colour (pencil, line, shape outline).
- `ui.tool.fillColor` is the **FILL** colour (bucket, gaussian fill, shape interior).
- ⚠️ `fillColor` is **tri-state**: `undefined` means "absent from the project file", which is
  every project saved before the field existed. **Readers must use
  `ui.tool.fillColorOrSelected`**, which falls back to `selectedColor`. **Never seed a
  default** — that would add a key to all 151 corpus snapshots and change their digests.
- `ui.tool.colorTarget` (`"edge" | "fill"`) is which slot the picker is editing. It is
  deliberately **not persisted**.

`ColorPickerContainer.tsx:105-127` is the existing wiring precedent — read it before writing
yours.

**The decision this task implements:** the pose model colour **reads the Fill slot**, and the
outline colour **reads the Edge slot**. The Pose rail therefore does **not** get its own
embedded colour picker widget — it shows the current Fill/Edge colours and lets the owner
switch which one the main picker is editing. That is the whole point of "use the current
colour picker": one picker, two slots, no third UI.

**⚠️ The `ui/` boundary is what this task is most likely to break.** `PoseSection.tsx` is
under `client/src/ui/` — it may **not** import a store, the API, `services/`, MobX, or use
`useContext`, **type-only imports included**. It stays pure: props in, callbacks out.
`PixelStudioPanelContainer.tsx` is the **only** file here that may read `app.pose` or
`ui.tool`. `observer()` only in `containers/`. Verify with `bun run lint:boundaries`.

**The panel prop shape to preserve:** `PixelStudioPanel.tsx:135` takes `pose?: PoseSectionProps`
— **one optional grouped object**, so existing callers and stories do not break. You are
extending that object, not adding sibling props to the panel. `PixelStudioPanel.tsx` itself
is **not** in your `Touches`; if the grouped object grows, that file needs no edit.

**Task 01 gives you `requestFit()`** on the store, and `fitGeneration`. The Fit button's
container callback calls `pose.requestFit()`. **The button does not compute a fit** — task 04
wires the container's reaction to `fitGeneration`. If task 01's naming differs from this
description, follow what task 01 actually shipped and note the discrepancy.

**Stylelint:** the baseline is **exactly 2 pre-existing errors** (`OtherHand.css:338` and
`:359`). Your CSS must not raise the error count, and must add **no numeric `z-index`** —
`scale-unlimited/declaration-strict-value` is what produces those 2 errors, so hard-coded
values in new CSS will add more. Use the design tokens.

## Steps

1. Read `PoseSection.tsx` in full, then `ColorPickerContainer.tsx:105-127`, then
   `PixelStudioPanelContainer.tsx`'s existing pose wiring.
2. **Replace the two native colour inputs.** In the pure component, render read-only
   **swatches** for the current Fill (model) and Edge (outline) colours plus a control that
   asks the container to switch `colorTarget` — e.g. clicking the model swatch selects the
   Fill tab in the main picker. Delete the now-unused `toHex`/`fromHex` helpers if nothing
   else uses them (grep first).
   - Props become something like `modelColor: PoseColor` (display only), `edgeColor:
     PoseColor`, `onEditModelColor: () => void`, `onEditEdgeColor: () => void`.
   - **Light colour is a separate question.** It is *not* a Fill/Edge concept. Keep it as it
     is for now, or move it behind the same picker if you can do so without inventing a third
     slot — **state which you chose and why.** Do not silently drop the control.
3. **Wire the container.** In `PixelStudioPanelContainer.tsx`, feed `modelColor` from
   `ui.tool.fillColorOrSelected` and `edgeColor` from `ui.tool.selectedColor`, and implement
   the "edit this slot" callbacks as `ui.tool.setColorTarget("fill" | "edge")`.
   ⚠️ **Convert between the app's `Color` and the pose module's `PoseColor` explicitly** at
   the container boundary — `ui/` cannot import the domain `Color` type from `stores/`, which
   is why `PoseColor` exists. Do not "simplify" by importing across the boundary.
4. **Add the Fit button** to the rail. Label it clearly (e.g. "Fit to canvas"). Its callback
   is `onRequestFit: () => void`, wired in the container to `pose.requestFit()`. Place it
   near the camera/zoom controls, since that is what it affects.
5. **Add the edge-thickness slider.** Integer **1–4**, whole pixels. It needs a store field —
   ⚠️ **`PoseUIStore.ts` is NOT in your `Touches`.** Task 04 owns the store field and the
   render. **Coordinate by shipping the prop and the callback here** (`edgeWidth: number`,
   `onSetEdgeWidth: (n: number) => void`) and having the container call the store action task
   04 adds. If that action does not exist yet when you run, **stop and report** rather than
   editing the store — the wave order exists for this reason. (If you are executing after
   task 04, it will be there.)
   - **The slider must be disabled or hidden when edge width is meaningless** — decide and
     document (e.g. width 0 = no outline, or a separate toggle). Prefer 0–4 with 0 meaning
     "no outline" if that reads better than a separate checkbox; say what you chose.
6. **Update the stories** so all four states are visible: no mesh, primitive with outline
   off, primitive with a thick outline, mannequin part. Stories mount at the rail's real
   width (240 px) — keep that.
7. **Update the DOM tests.** The existing tests assert the native colour inputs; they will
   fail. Replace them with tests for the new surface: swatches reflect the passed colours,
   the edit callbacks fire, the Fit button fires `onRequestFit`, the slider is integer-only
   and clamps to its range, and the disabled/zero state behaves.
8. Run stylelint and **compare the error count to 2** before committing.
9. Commit.

## Constraints

- **No store, API, `services/`, MobX or `useContext` import under `client/src/ui/`** —
  type-only included. `observer()` only in `containers/`.
- **Do not edit** `PoseUIStore.ts` (task 04), `poseStamp.ts`/`poseEngine.ts` (task 04),
  `PixelStudioPanel.tsx` (the grouped prop absorbs your additions), `ColorPicker.tsx` or
  `ColorPickerContainer.tsx` (the main picker is already correct — you are consuming it).
- **Do not seed a default `fillColor`.** Always read through `fillColorOrSelected`.
- **Do not add a numeric `z-index`.** No new stylelint errors — the count stays at 2.
- The `framing` buttons still exist at this point. **Task 05 removes them.** Leave them.

## Verification

From `client/`:

```sh
bunx tsc --noEmit                 # exit 0
bunx eslint .                     # 0 errors
bunx vitest run                   # all pass
bun run lint:boundaries           # OK — this is the rule most at risk here
bunx stylelint "src/**/*.css"     # EXACTLY 2 errors
bunx storybook build              # exit 0
```

Root: lockfile sweep after every `bunx`.

**Manual checks — list every one you cannot perform:**

1. Select Pose: the rail shows Fill and Edge swatches matching the main picker's colours.
2. Clicking the model swatch switches the main picker to its **Fill** tab; changing the
   colour there recolours the model.
3. Clicking the outline swatch switches the picker to **Edge**; changing it recolours the
   outline (visible only after task 04 lands the render).
4. A project saved before the fill/edge split still shows a sensible model colour — the
   `fillColorOrSelected` fallback (do **not** test this by editing a real project file).
5. The Fit button re-frames the model at its current rotation (needs task 04).
6. The thickness slider moves in whole steps and its extremes look right.
7. Rail layout at 240 px with the new controls; nothing overflows or wraps badly.
8. Touch: the slider and buttons are usable on the iPad, and the rail does not scroll while
   dragging the slider.

## Definition of done

- [ ] No `<input type="color">` remains in `PoseSection.tsx`.
- [ ] Model colour reads Fill (`fillColorOrSelected`), outline colour reads Edge.
- [ ] Clicking a swatch switches the main picker's `colorTarget`.
- [ ] The light-colour decision is made and documented.
- [ ] Fit button present, wired to `requestFit()`.
- [ ] Edge-thickness slider present, integer, range documented (incl. the "no outline" state).
- [ ] `PoseSection.tsx` imports no store/MobX/API — boundaries pass.
- [ ] Stories cover all four states; DOM tests rewritten.
- [ ] Stylelint still exactly 2 errors; no new `z-index`.
- [ ] Gate green, no lockfile.
