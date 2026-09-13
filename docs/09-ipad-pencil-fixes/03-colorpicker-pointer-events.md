# 03 — Color picker: pointer-driven, drag-from-press, event-absorbing

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/components/ColorPicker/ColorPicker.tsx` · `client/src/ui/components/ColorPicker/ColorPicker.css` · `client/src/ui/components/ColorPicker/__tests__/ColorPicker.dom.test.tsx` (new)
**Effort:** M

## Objective

After this task, touching the saturation/value region, the hue bar, or any channel slider
in the color picker with the Apple Pencil **immediately** selects the value under the
touch and keeps following the Pencil as it drags — including when the drag leaves the
control. The color surfaces absorb their pointer events so a Pencil touch on the picker
can never fall through and draw on the canvas.

## Context

### The measured baseline (2026-09-06)

`client/src/ui/components/ColorPicker/ColorPicker.tsx` (729 lines) is **the only
interactive color surface in the app still on raw mouse events**. Every sibling widget
was already converted, and each carries a comment saying why it had to be.

Controls and their current event model:

| Control | Lines | Events |
|---|---|---|
| Edge/Fill target tabs | 422–447 | `onClick` |
| Color-history swatch row | 450–464 | `onClick` |
| SV (saturation/value) canvas | 469–500 | `onMouseDown/Move/Up/Leave` |
| Hue bar canvas | 508–541 | `onMouseDown/Move/Up/Leave` |
| Hex input | 557–563 | `onChange` |
| HSL sliders | 569–654 | `<input type="range">` + `onMouseDown/onMouseUp` |
| RGB sliders | 660–690 | same |
| Alpha slider | 694–724 | same |

The four facts that make it fail under a Pencil:

1. **Zero pointer events.** No `onPointerDown/Move/Up` anywhere in the file.
2. **No `setPointerCapture`.** Drag tracking is local `useState` (`isDraggingSV` line 98,
   `isDraggingHue` 99, `isDraggingSlider` 100) with move handlers bound **to the canvas
   element itself** (lines 485, 524), and `onMouseLeave` (493–499, 534–540) explicitly
   ends the drag. A drag that leaves the swatch dies.
3. **No `preventDefault`, no `stopPropagation`** anywhere in the file.
4. **No `touch-action` in `ColorPicker.css`.** The canvases carry only
   `cursor: crosshair; display: block` (lines 56–61, 82–87).

On mouse the press *does* act immediately — `onMouseDown` (474–484, 513–523) calls
`handleSVCanvasInteraction(e)` / `handleHueCanvasInteraction(e)` in the same handler. The
behaviour to preserve is that immediacy; what is missing is the touch path.

### The reference implementation — copy this exactly

**`client/src/ui/components/OtherHand/ThumbSlider.tsx:60-82`** is the house pattern:

```tsx
const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
  // The primary button only: a two-finger tap must not start a drag.
  if (e.button !== 0) return;
  e.preventDefault();
  e.currentTarget.setPointerCapture(e.pointerId);
  draggingRef.current = true;
  onDragStart?.();
  onChange(valueAt(e.clientY));
};

const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
  if (!draggingRef.current) return;
  onChange(valueAt(e.clientY));
};

const handlePointerEnd = (e: PointerEvent<HTMLDivElement>) => {
  if (!draggingRef.current) return;
  draggingRef.current = false;
  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
    e.currentTarget.releasePointerCapture(e.pointerId);
  }
  onDragEnd?.();
};
```

And its header states the CSS half of the contract:

> "`touch-action: none` on the track (in the CSS) is required: without it the first
> vertical move is claimed by the rail's scroll and the slider never sees the drag."

Same pattern at `NormalPicker.tsx:242` + `NormalPicker.css:34`, `DirectionOrb.tsx:240`,
`OtherHandSurface.tsx:131`.

### Traps

- **Pointer capture makes `onPointerMove` fire on the captured element even outside its
  bounds — that is the point.** Once you capture, **delete the `onMouseLeave` drag-end
  handlers** (lines 493–499, 534–540); with capture they are wrong, not merely redundant.
- **Do not convert the `<input type="range">` sliders to `ThumbSlider`.** That is a layout
  change and out of scope. Instead give each range input `touch-action: none` in the CSS
  and keep its native `onChange`; a range input handles its own drag once the browser
  isn't stealing the gesture. Keep the existing `onMouseDown`/`onMouseUp` undo-grouping
  and add the pointer equivalents so the 300 ms history contract still fires on touch.
- **The undo-grouping contract is load-bearing.** `isDraggingSlider` (line 100) and the
  window `mouseup` listener (217–235) exist to group a drag into one undo step, and
  `containers/otherHand/colorSliders.ts:43-83` (`useColorSliderHistory`) replicates the
  same 300 ms contract. Preserve it: a pointer drag must produce **one** history entry,
  not one per move.
- **`onDoubleClick` on `CurrentPalette` is a separate component** — not in scope here.
- **Do not change the hex input's commit semantics in this task** — task 02 owns input
  blur semantics and explicitly excludes this file to avoid a collision. Leave
  `ColorPicker.tsx:557-563` alone; task 11 picks it up.
- **`ui/` boundary**: this file may not import a store, the API, or MobX.

## Steps

1. **SV canvas (lines 469–500).** Replace `onMouseDown/Move/Up/Leave` with
   `onPointerDown/Move/Up/Cancel` following the `ThumbSlider` shape: guard
   `e.button !== 0`, `e.preventDefault()`, `setPointerCapture(e.pointerId)`, then call
   `handleSVCanvasInteraction(e)` immediately on down and on every move while dragging.
   Release capture on up/cancel. Replace the `isDraggingSV` `useState` with a `useRef`
   (a re-render per move is wasted work and the state is never rendered).
   **Delete the `onMouseLeave` handler.**

2. **Hue bar (lines 508–541).** Identical treatment for `handleHueCanvasInteraction`.

3. **Absorb the events.** On both canvases and on the picker's root container, add
   `onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}`-equivalent
   behaviour — in practice the `preventDefault()` + `stopPropagation()` belong in the
   pointer-down handlers you just wrote, plus a `stopPropagation` on the root so a stray
   Pencil contact anywhere in the picker never reaches the canvas beneath. Verify by
   manual check 4 below.

4. **`ColorPicker.css`.** Add `touch-action: none` to the SV canvas rule (lines 56–61),
   the hue bar rule (82–87), every `input[type="range"]` inside the picker, and the
   picker root. Follow the house comment style — see `OtherHand.css:7` and
   `PosePanel.css:210` for the tone; state that this is the CSS half of the two-part
   touch fix and that it is required, not cosmetic.

5. **Sliders (569–724).** Add `onPointerDown`/`onPointerUp` alongside the existing
   `onMouseDown`/`onMouseUp` undo grouping, and extend the window listener at 217–235 to
   listen for `pointerup` as well as `mouseup`. Do not restructure the markup.

6. **Commit** ("fix(ipad): color picker drags from the press on Pencil").

7. **New test `client/src/ui/components/ColorPicker/__tests__/ColorPicker.dom.test.tsx`.**
   There is currently **no test and no story** for this component. Cover, with
   `@testing-library/react` and `fireEvent.pointerDown/pointerMove/pointerUp`:
   - a `pointerDown` on the SV canvas calls `onSetColor` immediately (one call, on the
     press itself);
   - a `pointerMove` after that press calls it again;
   - a `pointerMove` **without** a preceding `pointerDown` does not;
   - `pointerUp` ends the drag so a later `pointerMove` is inert.
   jsdom does not implement `setPointerCapture` on all elements — stub it in the test
   (`Element.prototype.setPointerCapture = vi.fn()` / `hasPointerCapture = () => false`)
   and note why in a comment. Canvas 2D context is also absent in jsdom; if the component
   throws on mount, mock `HTMLCanvasElement.prototype.getContext`.

8. **Commit** ("test(ui): cover ColorPicker pointer drag").

## Constraints

- Do not change the hex input (lines 557–563) — task 09 owns it.
- Do not change the Edge/Fill tabs' behaviour (422–447) — task 05 owns the edge/fill
  model; this task only makes the surfaces pointer-driven.
- Do not convert the range inputs to `ThumbSlider` or otherwise change the picker's
  layout, spacing or DOM structure beyond swapping event props.
- Do not change `ColorPickerContainer.tsx` — task 05 owns it.
- Do not break the one-undo-entry-per-drag contract.
- Nothing under `client/src/ui/` may import a store, the API, or MobX.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art
bun run typecheck        # expect exit 0
bun run lint             # 0 errors; warnings ≤ 65
bun run test             # 0 failures
bun run build
```

Prove the mouse events are gone:
```sh
cd client && grep -n "onMouse" src/ui/components/ColorPicker/ColorPicker.tsx
```
Expect no matches on the SV canvas or hue bar (slider `onMouseDown`/`onMouseUp` may
remain alongside their pointer equivalents).

This task adds CSS. Stylelint is **not** part of `bun run verify` and fails today with 2
pre-existing errors — run it and confirm you have not raised the count:
```sh
cd client && bun run lint:css   # baseline: 71 problems (2 errors, 69 warnings)
```

**Manual checks — items 1–5 require the iPad and the Pencil:**

1. Touch the SV region with the Pencil → the color changes **on contact**, no second tap
   needed.
2. Drag across the SV region → the selection follows continuously.
3. Drag off the edge of the SV region and back → the drag keeps tracking and does not
   die at the boundary.
4. Touch anywhere in the color picker with the Pencil while the pencil tool is active →
   **nothing is drawn on the canvas.**
5. Drag the hue bar and each channel slider with the Pencil → same immediate-and-continuous
   behaviour.
6. On desktop with a mouse, all of the above still behaves exactly as it did before.
7. A single slider drag produces **one** undo step, not one per pixel of movement.

## Definition of done

- [ ] SV canvas and hue bar use pointer events with `setPointerCapture`; the `onMouseLeave` drag-end handlers are deleted.
- [ ] Every color surface and slider in `ColorPicker.css` has `touch-action: none`, with a comment saying why.
- [ ] Pointer-down on the picker calls `preventDefault()` and `stopPropagation()`.
- [ ] A test file exists covering press-to-select, drag-to-follow, and drag-end.
- [ ] `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build` all exit 0, real output pasted into `HANDOFF.md`.
- [ ] All seven manual checks performed and recorded. Checks 1–5 without an iPad ⇒ mark the task **PARTIAL**, not done.
