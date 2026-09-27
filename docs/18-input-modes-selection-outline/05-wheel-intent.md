# 05 — `interpretWheel`: per-mode wheel semantics

**Wave:** W2 · **Depends on:** 02
**Touches:** `client/src/ui/canvas/model/wheelIntent.ts` (new) · `client/src/ui/canvas/model/__tests__/wheelIntent.test.ts` (new)
**Effort:** M

## Objective

A pure function decides, for one wheel event and one `InputMode`, whether the canvas should
**pan** (by how much) or **zoom** (by what factor). It carries a small latch so a Windows
precision-touchpad scroll is never mistaken for a mouse-wheel notch mid-gesture. Task 07 replaces
the inline logic in `useCanvasViewport`'s wheel handler with a call to it.

## Context

- **Locked decisions:** MASTER D5–D9. They are the spec, so read them in full. In short:

  | mode | ctrlKey | metaKey | shiftKey (dx = 0) | notch | otherwise |
  | --- | --- | --- | --- | --- | --- |
  | `mac` | zoom | zoom | pan (native deltas) | pan | pan |
  | `ipad` | zoom | zoom | pan (native deltas) | pan | pan |
  | `windows` | zoom | pan | pan x by −dy | **zoom** | pan |

  - A **notch** is `deltaMode !== 0`, or `dx === 0 && Number.isInteger(dy) && |dy| >= 50`, and in
    windows mode only when the touchpad latch has expired.
  - The **zoom factor** (D8):
    - **mac/ipad with `ctrlKey`:** always `Math.exp(-dy * WHEEL_ZOOM_RATE)`, byte-identical to
      today.
    - **Every other zoom** (mac/ipad ⌘ without ctrl, and every windows zoom) is notch-aware:
      `NOTCH_ZOOM_STEP = 1.2` (factor 1.2 for dy < 0, 1/1.2 for dy > 0) when the event is
      notch-shaped, and the `exp` formula otherwise.
    - This matters because `containers/brush/__tests__/useBrushCamera.dom.test.ts` ("ctrl-wheel
      zooming out stops at the derived floor") sends one `ctrlKey, deltaY: 5000` and expects the
      floor. The mode there is the jsdom default, `"mac"`.
  - `WHEEL_ZOOM_RATE = 0.012` moves here from `useCanvasViewport.ts:109`. Task 07 deletes it
    there. Here you only **define and export** it.
  - The **latch**: any windows-mode plain wheel that is **not** notch-shaped sets
    `touchpadUntil = now + TOUCHPAD_LATCH_MS (250)`. While `now < touchpadUntil`, a windows plain
    wheel always pans. The latch is harmless in the other modes: carry it through unchanged.
  - **Delta normalisation happens first**, in every mode: `deltaMode` 1 means ×16, and 2 means
    ×`pageHeight`.
- **Today's behaviour, which `mac` must reproduce exactly apart from adding ⌘**, is
  `useCanvasViewport.ts:349-421`: `ctrlKey` zooms by `exp(-deltaY*0.012)`; otherwise the pan
  becomes `pan − (deltaX, deltaY)`. As an intent that is `{ kind: "pan", dx: -deltaX, dy: -deltaY }`.
  - The **only** change inside mac mode is that ⌘+wheel now zooms (notch-aware). Ctrl+wheel and
    plain wheel are byte-identical to today.
- The `InputMode` type comes from `./inputMode` (task 02, W1).
- **Real delta shapes**, for the tests and the header:
  - Chrome on macOS pinch: `ctrlKey: true`, `deltaMode: 0`, fractional `deltaY` around ±0.5–10.
  - A Windows mouse notch: `deltaY` ±100 (Chrome and Edge at 100 % scaling, ±125 or 150 at
    higher scaling), `deltaX` 0, `deltaMode` 0. In Firefox: `deltaMode: 1`, `deltaY` ±3.
  - A Windows precision touchpad two-finger scroll: many small events, often fractional, and
    often with a non-zero `deltaX`.
  - If `HANDOFF.md` has **probe results** from task 01, read them and add a test case built from
    the real numbers the owner's machine produced.
- **Analogue for style:** `ui/canvas/model/canvasTouchFilter.ts`.

## Steps

1. Create `client/src/ui/canvas/model/wheelIntent.ts`:
   ```ts
   import type { InputMode } from "./inputMode";
   export interface WheelLike { deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }
   export type WheelIntent = { kind: "pan"; dx: number; dy: number } | { kind: "zoom"; factor: number };
   export interface WheelLatch { touchpadUntil: number }
   export const INITIAL_WHEEL_LATCH: WheelLatch = { touchpadUntil: 0 };
   export const WHEEL_ZOOM_RATE = 0.012;
   export const NOTCH_ZOOM_STEP = 1.2;
   export const NOTCH_MIN_DELTA = 50;
   export const TOUCHPAD_LATCH_MS = 250;
   export const LINE_HEIGHT_PX = 16;
   export function normaliseDelta(e: WheelLike, pageHeight: number): { dx: number; dy: number };
   export function isNotchShaped(e: WheelLike, dx: number, dy: number): boolean;
   export function interpretWheel(e: WheelLike, mode: InputMode, latch: WheelLatch, now: number, pageHeight: number): { intent: WheelIntent; latch: WheelLatch };
   ```
   - A zoom with `dy === 0`, which is possible with a horizontal ctrl+scroll, returns factor `1`.
   - The header should cover: the mode table above; why notch detection is a **heuristic** and
     what can fool it; the latch; the override key (`pixelart.inputMode`, from task 02) as the
     escape hatch; and that the ⌘ zoom honours `docs/11-brush-studio-followups/HANDOFF.md:105`.
2. **Commit** as `feat(18/05): interpretWheel per-mode wheel semantics`.
3. Create `client/src/ui/canvas/model/__tests__/wheelIntent.test.ts` (unit lane, node). Cover
   **every cell of the table** and at least these cases:
   - mac, `{dx:-50, dy:-30}` → pan `(50, 30)`. This is the same as today's
     `useCanvasViewport.dom.test.ts:328+` expectation.
   - mac, ctrl, `dy: -3.2` → zoom `exp(3.2*0.012)`. The same maths as today.
   - mac, ctrl, `dy: 100` → zoom `exp(-1.2)` (≈0.301). This is **unchanged from today**, since
     ctrl on mac is never notch-stepped. Mac, ctrl, `dy: 5000` → `exp(-60)`.
   - mac, meta, `dy: -100` → zoom `1.2`.
   - windows, plain `dy: 100, dx: 0` → zoom `1/1.2`. Windows, plain `dy: -120` → zoom `1.2`.
     Firefox windows, `deltaMode: 1, dy: 3` → zoom `1/1.2`.
   - windows, plain `dy: 4.5` → pan, and the latch is set to `now + 250`. Then within the latch, a
     plain `dy: 100` → **pan**. After it expires, a plain `dy: 100` → zoom.
   - windows, `dx: 3, dy: 100` → pan, since a non-zero `dx` means a touchpad.
   - windows, shift, `dx: 0, dy: 100` → pan `(-100, 0)`. Windows, shift, `dx: 100, dy: 0` (Chrome
     already swapped) → pan `(-100, 0)`.
   - windows, ctrl, `dy: 2` → continuous zoom. Windows, meta, `dy: 100` → notch → **zoom**. Meta is
     not special on Windows, and the plain notch rule applies.
   - ipad behaves like mac. Spot-check two cases.
   - `normaliseDelta` for modes 0, 1 and 2.
   - Latch purity: the input latch object is never mutated.
4. **Commit** as `test(18/05): wheel intent table`.

## Constraints

- Pure: no DOM, no React, no store. `now` and `pageHeight` are parameters, so it is deterministic.
- Do **not** edit `useCanvasViewport.ts`. Task 07 wires this in and removes the duplicate
  constant.
- Do not change `inputMode.ts`.

## Verification

```sh
cd client
bunx tsc --noEmit
bunx vitest run src/ui/canvas/model
bunx eslint src/ui/canvas/model
bun scripts/check-boundaries.mjs
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```

Manual: none here. Task 08 covers it on devices.

## Definition of done

- [ ] `wheelIntent.ts` exports the API above and implements D5–D9 exactly.
- [ ] Every table cell and every listed case is tested and green.
- [ ] If task 01 captured probe data, a real-data case exists.
- [ ] tsc, eslint and the boundary check are clean, and there is no lockfile.
- [ ] Two commits.
