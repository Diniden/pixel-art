# 11 — Wire the swap control, the hex field, and the deferred follow-ups

**Wave:** W5 · **Depends on:** 02, 03, 05, 06, 07, 08, 09
**Touches:** `client/src/containers/ColorPickerContainer.tsx` · `client/src/ui/components/ColorPicker/ColorPicker.tsx` · `client/src/containers/GlobalHotkeys.tsx` · `client/src/containers/CanvasContainer.tsx` — ⚠️ only if step 3 applies
**Effort:** M

## Objective

This is the closing task. After it: the swap control that task 07 added to the color
picker is actually wired; the hex field commits on blur like every other input; there is a
keyboard shortcut for swap; and any one-line follow-up that tasks 04 or 09 deliberately
deferred (because they were forbidden from editing `CanvasContainer.tsx`) is applied.

**Read `HANDOFF.md` before starting.** Tasks 04 and 09 were instructed to record deferred
follow-ups there. Step 3 is conditional on what you find.

## Context

### What is left over, and why

**1. The swap button is unwired.** Task 07 added an optional `onSwapColors?: () => void`
prop and a swap control to `ui/components/ColorPicker/ColorPicker.tsx`, rendering it only
when the prop is supplied. It could not wire it because `ColorPickerContainer.tsx` belongs
to task 06, which ran in the same wave (W3) — see task 07's collision note. So today the
button exists in the component but the main picker never passes the callback, and the
control does not render there. The other-hand rail's swap **is** already wired
(`OtherHandRailContainer.tsx`).

Task 05 provided `app.swapEdgeAndFillColors()`, which calls `saveStateToHistory` and then
`ui.tool.swapColors()` — one undo step.

**2. The hex field still commits live.** `ColorPicker.tsx:557-563` uses `onChange`. Task
02 swept every other input in the app onto blur-commit semantics but **explicitly
excluded `ColorPicker.tsx`** to keep its `Touches` disjoint from task 03's, which was
rewriting that same file's pointer handling in the same wave. This is the last input left.

The pattern to copy is the one task 02 established, itself lifted from
`ui/components/PosePanel/CameraAdvanced.tsx:258-269`: local draft `useState`, `onChange`
updates only the draft, `onBlur` commits, Enter commits, Escape reverts, and a
`useEffect` resyncs the draft when the incoming color prop changes.

⚠️ The hex field has a wrinkle the number fields do not: a partially-typed hex string
(`#ab`) is not a valid color. Commit only when the draft parses as a valid hex color; on
blur with an invalid draft, revert to the current color rather than writing garbage.

**3. Deferred follow-ups.** Two tasks were forbidden from touching `CanvasContainer.tsx`
(task 07 owned three lines of it in W3, task 08 rewrote its touch handlers in W4):
- **Task 04** may have left `LightingCanvasContainer.tsx:363` passing no zoom floor, and
  was told to record that.
- **Task 09** step 9 was told to add a tool-aware brush-size getter to `ToolUIStore` and
  record that a one-line consumption in `CanvasContainer.tsx:4321-4391` (`getToolContext`)
  was needed in W5. If it did, apply it here: the eraser's stroke must use
  `effectiveEraserSize`, not `brushSize`.

If `HANDOFF.md` records neither, **skip step 3 entirely and remove `CanvasContainer.tsx`
from your diff.** Do not go looking for extra work in that file.

### Traps

- **`GlobalHotkeys.tsx`** currently touches color only to clear `colorAdjustment` on
  Escape (lines 25, 41, 76–79). Read the whole file before adding a binding — check how it
  guards against firing while a text input has focus. A swap shortcut that fires while the
  user is typing in the hex field or a layer-rename box is a bug. `X` is the conventional
  swap key in paint applications and is the recommendation; confirm it is not already bound.
- The swap control must be reachable on the iPad, where there is no keyboard. Task 07
  already placed a button; this task only adds the shortcut as a desktop convenience.
- `ui/` boundary: `ColorPicker.tsx` may not import a store. The callback comes in as a prop.
- `observer()` stays in `containers/`.

## Steps

1. **Wire the swap.** In `ColorPickerContainer.tsx`, pass
   `onSwapColors={() => app.swapEdgeAndFillColors()}` to `ColorPicker`. Confirm the
   control now renders. If task 07's prop name differs from `onSwapColors`, use the actual
   name — read the component's props before writing.

2. **Fix the hex field.** In `ColorPicker.tsx:557-563`, convert to draft-plus-blur
   semantics per the Context above, including the invalid-draft revert. Match the shape
   task 02 used elsewhere so the app is consistent.

3. **Apply the deferred follow-ups**, if and only if `HANDOFF.md` records them:
   - task 09's tool-aware brush size, consumed in `getToolContext`
     (`CanvasContainer.tsx:4321-4391`) — the eraser's context `brushSize` becomes the
     eraser's effective size;
   - task 04's lighting-pane zoom floor, if it was left with the default.
   Keep each to the smallest possible edit. If neither is recorded, drop
   `CanvasContainer.tsx` from `Touches` and say so in `HANDOFF.md`.

4. **Commit** ("feat(color): wire the edge/fill swap control" — and separate commits for
   the hex field and each follow-up; these are distinct changes and the project commits at
   task granularity).

5. **Add the keyboard shortcut.** In `GlobalHotkeys.tsx`, bind `X` to
   `app.swapEdgeAndFillColors()`, guarded so it does not fire while an input, textarea or
   contenteditable has focus. Follow whatever guard convention the file already uses for
   its other bindings.

6. **Commit** ("feat(color): X swaps edge and fill").

7. **Extend the tests.** Add to the existing `ColorPicker` test file (created by task 03)
   a case asserting the hex field does not call its callback while typing and does on blur
   with a valid value, and reverts on blur with an invalid one. Add to the
   `ColorPickerContainer` coverage that `onSwapColors` calls through to
   `swapEdgeAndFillColors`.

8. **Commit** ("test(color): hex blur commit and swap wiring").

9. **Run the full gate one final time** and paste the complete real output into
   `HANDOFF.md`. This is the plan's exit gate — every wave's work is now in the tree
   together for the first time.

## Constraints

- Do not re-open any earlier task's decisions. If you disagree with one, record it in
  `HANDOFF.md` under Deviations; do not silently change it.
- Do not touch `CanvasContainer.tsx` beyond the specific follow-ups recorded in
  `HANDOFF.md`.
- Do not change the swap's history behaviour — `swapEdgeAndFillColors` already produces
  exactly one undo step. Do not wrap it in a second one.
- Nothing under `client/src/ui/` may import a store, the API, or MobX.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art
bun run verify           # typecheck + lint + format:check + test + build — the full gate
```

If `bun run verify` fails on `format:check`, run `bun run format` and re-run — the
formatter's scope is narrow (see the root `package.json`) and a formatting fix is its own
commit.

Also confirm no lockfile was created at any point in this plan:
```sh
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Expect **no output**. If a `bunx` invocation created one, delete it — do not commit it and
do not change `bunfig.toml`.

**Manual checks — the full-plan acceptance pass. Run every one on the iPad:**

1. The color picker shows a swap control; tapping it exchanges edge and fill, and one undo
   restores both.
2. Pressing `X` on a desktop keyboard swaps; pressing `X` while typing in the hex field
   types an `x` and does **not** swap.
3. The hex field: type a partial value, blur → it reverts. Type a full valid value,
   blur → it commits. Escape reverts.
4. **End-to-end regression sweep of the whole plan**, since this is the first time all of
   it is in the tree together:
   - pinch/double-tap outside the canvas does not zoom the page (task 01);
   - number fields commit on blur (02);
   - the color picker drags from the Pencil's first contact (03);
   - the canvas zooms out to a ~50 px thumbnail on the owner's real project (04);
   - palette clicks honour the Fill tab (06);
   - the eyedropper writes the targeted slot (07);
   - rect and lasso selection work with the Pencil (08);
   - pencil and eraser sizes are independent (09);
   - rotating the iPad swaps to the other saved layout (10).
5. `bun run dev` starts all three processes and the app loads.
6. Save and reload the owner's real project → nothing is lost, nothing is corrupted.

## Definition of done

- [ ] The swap control is wired in the main color picker and works.
- [ ] `X` swaps on desktop and is suppressed while a text field has focus.
- [ ] The hex field commits on blur/Enter, reverts on Escape, and rejects invalid drafts.
- [ ] Deferred follow-ups are either applied or explicitly recorded as not required.
- [ ] `bun run verify` exits 0, with the **complete real output** pasted into `HANDOFF.md`.
- [ ] No `bun.lock*` exists anywhere in the repo.
- [ ] The full-plan regression sweep (manual check 4) is performed and each of its nine
      items recorded pass/fail in `HANDOFF.md`. Any item that cannot be checked is named
      explicitly rather than assumed to pass.
- [ ] `HANDOFF.md` records the final state of every wave, honestly, including anything left PARTIAL.
