# 07 — Other-hand color, eyedropper, and the swap control

**Wave:** W3 · **Depends on:** 05
**Touches:** `client/src/containers/OtherHandRailContainer.tsx` · `client/src/containers/CanvasContainer.tsx` · `client/src/ui/components/ColorPicker/ColorPicker.tsx` · `client/src/ui/components/ColorPicker/ColorPicker.css` · `client/src/containers/otherHand/toolWidgets.ts` · `client/src/containers/__tests__/OtherHandRailContainer.dom.test.tsx` (new or extended)
**Effort:** L

## Objective

After this task: the other-hand (iPad thumb rail) color section has an Edge/Fill selector
and every color it sets honours that target; the eyedropper writes the targeted slot
instead of always the edge; and a visible **swap** control exchanges the edge and fill
colors from both the main color picker and the other-hand rail.

## Context

### The three remaining hardcoded-edge sites

1. **`client/src/containers/OtherHandRailContainer.tsx`** (271 lines) — the iPad thumb
   rail. Dispatches on `ui.layout.otherHandSection` at lines 257–271; `ColorSection` is
   lines 65–149. It is **edge-only**:
   - line 74: `const color = ui.tool.selectedColor;`
   - lines 88–91: `apply()` → `app.setColorAndAddToHistory(next)` / `app.adjustColor`

   There is **no `colorTarget` read and no `setFillColor` call anywhere in the
   other-hand tree.** The section renders 3–4 vertical `ThumbSlider`s, a `ColorPreview`
   square (127–136) and `ColorModelExtras` (HSL/RGB toggle + alpha toggle, 137–144).

   Availability: `LayoutUIStore.ts:391-393` — `otherHandAvailable` is
   `deviceClass === "tablet"` only; `enterOtherHand` (401–404) is a no-op elsewhere.
   Mounted at `PixelStudioContainer.tsx:203` and `LightingStudioContainer.tsx:87`.

2. **`client/src/containers/CanvasContainer.tsx:4527, 4540, 4554`** — the eyedropper, for
   the variant layer, the normal layers and the reference image respectively. All three
   call `app.setColorAndAddToHistory(pixel)`, so eyedropping while the Fill tab is active
   writes the **edge** slot.

3. **No swap action or control exists anywhere.** Grep for `swap` across `client/src` and
   `server/src` returns only rail/layout swapping (`ui/layout/railLayout.ts:277-293`,
   `layoutPresets.ts:118-133`), pane swapping (`CanvasViewControls.tsx:62-65,102`), row
   swapping in `poseEngine.ts:160-168`, and axis swapping in `reflection.test.ts`. Nothing
   color-related, and no keyboard shortcut — `GlobalHotkeys.tsx` touches color only to
   clear `colorAdjustment` on Escape (lines 25, 41, 76–79).

### What task 05 gave you

`app.setActiveColor(color)`, `app.activeColor`, `app.swapEdgeAndFillColors()`, and
`ui.tool.setColorTarget(target)` (which already existed at `ToolUIStore.ts:311-313`).

### The existing Edge/Fill selector to imitate

`client/src/ui/components/ColorPicker/ColorPicker.tsx:422-447` renders the Edge/Fill tabs
for the main picker. The other-hand rail needs the same choice in thumb-reachable form.
Its widget vocabulary is defined in `client/src/containers/otherHand/toolWidgets.ts` (367
lines) — read the existing button-group builders there (e.g. the selection Mode/Drag
groups at lines 282–342) and **build the Edge/Fill selector with the same widget kind**
rather than inventing a new one.

Also note `containers/otherHand/colorSliders.ts` (175 lines): `useColorSliderHistory`
(43–83) replicates the ColorPicker's 300 ms undo contract, and `colorChannelSliders`
(92–175) builds the HSL/RGB + alpha slider specs. The target change is in the container's
read/write, not in these builders.

### Traps

- **`CanvasContainer.tsx` is 5,848 lines and is also touched by task 08 — but in a
  different wave.** 07 is W3, 08 is W4. They must not run concurrently. Keep your edit to
  the three eyedropper lines: change `app.setColorAndAddToHistory(pixel)` to
  `app.setActiveColor(pixel)` at 4527, 4540 and 4554 and **nothing else in that file.**
- **The other-hand rail is `deviceClass === "tablet"` only.** You cannot see it on
  desktop. Manual verification of this task genuinely requires the iPad; if you cannot
  reach one, the task is **PARTIAL**.
- **Do not put `observer()` in `ui/`.** The swap **button** goes in `ColorPicker.tsx`
  (pure, props in and callbacks out — it takes an `onSwapColors` callback); the wiring
  goes in `ColorPickerContainer.tsx`. But `ColorPickerContainer.tsx` belongs to **task
  06**, which is in the same wave. To keep `Touches` disjoint, this task adds the button
  and the prop to `ColorPicker.tsx` with the prop **optional** (`onSwapColors?: () =>
  void`), rendering the control only when it is supplied. Task 06's file is untouched.
  ⚠️ **Consequence: after W3 the main picker's swap button exists but is not yet wired.**
  Task 11 (W5) wires it. Say so in `HANDOFF.md`. The other-hand swap **is** wired here,
  because `OtherHandRailContainer.tsx` is yours.
- The undo contract: a swap is one history step. `app.swapEdgeAndFillColors()` already
  calls `saveStateToHistory` — do not add a second history entry around it.

## Steps

1. **`OtherHandRailContainer.tsx` — make `ColorSection` target-aware.**
   - Line 74: read `const color = app.activeColor;` instead of `ui.tool.selectedColor`.
   - Lines 88–91: `apply()` calls `app.setActiveColor(next)`. For the adjust path, mirror
     what `ColorPickerContainer.tsx:121-130` does for fill (`setFillColor`) versus edge
     (`app.adjustColor`), so the two surfaces agree.
   - Add an Edge/Fill selector widget to the section, built with the same widget kind the
     selection Mode group uses in `toolWidgets.ts:282-317`. It reads `ui.tool.colorTarget`
     and writes `ui.tool.setColorTarget(...)`.
   - Add a **Swap** button to the section calling `app.swapEdgeAndFillColors()`.

2. **`containers/otherHand/toolWidgets.ts`** — add whatever widget spec the Edge/Fill
   selector and Swap button need, following the file's existing builder conventions. If
   the existing button-group spec already covers both, this file may need no change at
   all; in that case remove it from your diff and note that in `HANDOFF.md`.

3. **Commit** ("feat(ipad): other-hand color honours the edge/fill target").

4. **`CanvasContainer.tsx`** — at lines 4527, 4540 and 4554, replace
   `app.setColorAndAddToHistory(pixel)` with `app.setActiveColor(pixel)`. Three lines.
   Change nothing else in this file.

5. **Commit** ("fix(color): eyedropper writes the targeted slot").

6. **`ColorPicker.tsx` + `ColorPicker.css`** — add an optional `onSwapColors?: () => void`
   prop and render a swap control beside the Edge/Fill tabs (422–447) when it is
   supplied. Use an existing icon from `lucide-react` (the project already depends on it —
   `ArrowLeftRight` or `Repeat` are the natural choices) and style it as a BEM element of
   the existing picker block, using tokens from `styles/tokens.css`. No color literals,
   no numeric `z-index`, no `!important`. Give it a `title`/`aria-label` of "Swap edge
   and fill colors" and a touch target of at least 44 px on coarse pointers.
   ⚠️ Coordinate with task 03, which also edits these two files — **03 is W1 and this is
   W3, so 03 has already landed.** Rebase onto it and keep its pointer-event changes intact.

7. **Commit** ("feat(color): swap control in the color picker").

8. **Test.** Extend or create `client/src/containers/__tests__/OtherHandRailContainer.dom.test.tsx`
   following the conventions of the sibling suites. Cover:
   - with `colorTarget === "fill"`, an other-hand slider change writes `fillColor`, not
     `selectedColor`;
   - with `colorTarget === "edge"`, it writes `selectedColor`;
   - the swap button calls through and exchanges the two slots in one history step.
   If the other-hand rail is hard to mount in jsdom, test the container's callbacks
   directly rather than through a full render, and say so in a comment.

9. **Commit** ("test(ipad): other-hand color target and swap").

## Constraints

- **Do not touch `ColorPickerContainer.tsx` or `PaletteManagerContainer.tsx`** — task 06
  owns both, in this same wave.
- In `CanvasContainer.tsx`, change **only** lines 4527, 4540 and 4554. Task 08 rewrites
  the touch handlers in that file in the next wave; an unrelated edit here will collide.
- Do not add `observer()` to any `ui/` file. The swap button is a pure component taking a
  callback.
- Do not change `ThumbSlider`, `ColorPreview`, or the `useColorSliderHistory` 300 ms
  contract.
- Do not deep-observe a pixel grid.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art
bun run typecheck        # expect exit 0
bun run lint             # 0 errors; warnings ≤ 65
bun run test             # 0 failures
bun run build
cd client && bun run lint:boundaries    # ui/ must not import a store
```

Confirm the eyedropper edit is exactly three lines:
```sh
cd /Users/diniden/Desktop/self/pixel-art && git diff --stat client/src/containers/CanvasContainer.tsx
```

This task adds CSS. Stylelint is **not** part of `bun run verify` and fails today with 2
pre-existing errors — run it and confirm you have not raised the count:
```sh
cd client && bun run lint:css   # baseline: 71 problems (2 errors, 69 warnings)
```

**Manual checks — 1–5 require the iPad:**

1. Enter other-hand mode, open the Color section → an Edge/Fill selector is visible and
   thumb-reachable.
2. With **Fill** selected, drag a channel slider → the fill color changes and the edge
   color does not.
3. With **Edge** selected, drag a slider → the edge color changes.
4. Tap **Swap** in the other-hand rail → edge and fill exchange; one undo restores both.
5. Use the eyedropper with the Fill tab active → the sampled color lands in the **fill**
   slot.
6. On desktop, the color picker shows the swap control. It does nothing yet — task 10
   wires it. Confirm it does not throw.

## Definition of done

- [ ] The other-hand Color section has an Edge/Fill selector and a Swap button.
- [ ] `OtherHandRailContainer.tsx` reads `app.activeColor` and writes via `app.setActiveColor`.
- [ ] The three eyedropper call sites use `app.setActiveColor`; `git diff --stat` shows only those lines changed in `CanvasContainer.tsx`.
- [ ] `ColorPicker.tsx` renders a swap control when `onSwapColors` is supplied, styled with BEM + tokens, ≥44 px target on coarse pointers.
- [ ] Task 03's pointer-event work in `ColorPicker.tsx`/`.css` is preserved, not reverted.
- [ ] `ColorPickerContainer.tsx` and `PaletteManagerContainer.tsx` are **not** in the diff.
- [ ] Container tests cover both targets and the swap.
- [ ] `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build`, `bun run lint:boundaries` all exit 0, real output pasted into `HANDOFF.md`.
- [ ] All six manual checks performed and recorded. Checks 1–5 without an iPad ⇒ **PARTIAL**.
