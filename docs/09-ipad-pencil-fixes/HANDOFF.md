# HANDOFF — iPad Pencil fixes

**Current position:** W1 IN PROGRESS
**Branch:** `feat/09-ipad-pencil-fixes` (created from `feat/08-pose-camera-model-space` @ 875c314)
**Last commit:** 875c314 (baseline)

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04 | IN PROGRESS | 2026-09-06 | | |
| W2 | 05 → 09 (**sequential**) | TODO | | | |
| W3 | 06, 07 | TODO | | | |
| W4 | 08, 10 | TODO | | | |
| W5 | 11 | TODO | | | |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

## Manual check ledger

Six tasks cannot be verified without the physical iPad. Record each check's result
individually — "manual checks performed" without per-item results is not a report. A task
whose device checks were skipped is **PARTIAL**, not `DONE`.

| Task | Device needed | Checks recorded |
| --- | --- | --- |
| 01 | iPad | |
| 02 | iPad + desktop | |
| 03 | iPad + Pencil | |
| 04 | owner's real project | |
| 06 | desktop or iPad | |
| 07 | iPad (other-hand rail is tablet-only) | |
| 08 | iPad + Pencil | |
| 09 | desktop + iPad + a pre-existing project | |
| 10 | iPad (rotation) | |
| 11 | iPad — full-plan regression sweep | |

## Deferred follow-ups

Tasks 04 and 09 may defer a one-line change into W5 because they are forbidden from
editing `CanvasContainer.tsx`. Record them here or task 11 will not know to apply them.

| From | What | Where it must land | Applied? |
| --- | --- | --- | --- |
| (none yet) | | | |

## Deviations

(none yet)

## Notes for the next session

- **Known latent bug, deliberately not fixed** (task 08 records it, does not touch it):
  `client/src/ui/hooks/useCanvasPointer.ts:162-171` — `endStroke` nulls
  `lastStrokePixelRef.current` and then reads it, so any future `onUp` handler receives
  `{x:0, y:0}`. No tool defines `onUp` today, so it is latent.
- **Out of scope, recorded** (task 09): the lighting studio's normal pencil shares
  `brushSize` with the pixel studio, so changing one silently resizes the other. Fixing it
  needs a third brush field; the user did not ask for it.
- `client/src/ui/primitives/ColorSwatch/` exists and is imported by nothing. Adopting it is
  not part of this plan.
- `client/src/ui/primitives/Field`, `Slider` and `SliderWithNumber` have zero production
  usages. Wholesale primitive adoption was the never-executed refresh task 36 and stays
  out of scope here.
