# HANDOFF — iPad Pencil fixes

**Current position:** W1 IN PROGRESS
**Branch:** `feat/09-ipad-pencil-fixes` (created from `feat/08-pose-camera-model-space` @ 875c314)
**Last commit:** 875c314 (baseline)

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04 | PARTIAL | 2026-09-06 | 26b2ef6 | typecheck 0 · lint 65w/0e (baseline) · test 151 files / 3172 passed (was 148/3139; corpus unchanged) · build 0 · stylelint 71/2 (baseline) · boundaries OK |
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

## W1 notes (coordinator-verified 2026-09-06)

Gate run by the coordinator, not taken on trust:

```
bun run typecheck  → exit 0
bun run lint       → 65 problems (0 errors, 65 warnings)   [baseline, not raised]
bun run test       → 151 files, 3172 tests, all passed     [was 148/3139]
bun run build      → built in 2.14s
cd client && bun run lint:css        → 71 problems (2 errors, 69 warnings)  [baseline]
cd client && bun run lint:boundaries → OK — all 5 boundary rules hold
find . -maxdepth 2 -name 'bun.lock*' → none
```

Corpus golden digests all pass unchanged. No `vitest -u` was run.

**Infrastructure event:** all four W1 agents were killed by a 600s stream watchdog
mid-verification. No uncommitted work was lost — ten commits had already landed and the
tree was clean. Tasks 01, 03, 04 were complete at kill time; **task 02 was not** (it died
entering step 5) and was finished by a follow-up agent.

**Commit-boundary blur:** because the four agents shared one worktree, commit `95b0870`
(task 02's) also swept in task 01's `index.html`, `main.tsx`, `reset.css` and
`useSuppressBrowserZoom.ts`. Content is correct and correctly attributed per task; only
the commit boundary is imprecise. Not rewritten — history is already pushed-shaped.

Per-task verification against each Definition of done:

- **01** — viewport meta has `maximum-scale=1.0`/`minimum-scale=1.0`; `reset.css` sets
  `touch-action: none` on `html, body, #root` inside `@media (pointer: coarse)` with a
  long comment deriving why scroll rails survive (the `touch-action` walk terminates at
  the first scrolling ancestor); `useSuppressBrowserZoom.ts` imports only `react` and is
  mounted in `main.tsx`; `WebView.swift:88-89` pins both zoom scales. ✅ code-complete.
- **03** — SV region and hue bar on pointer events with `setPointerCapture`; no
  `onMouseLeave` survives; 4 `touch-action: none` declarations in the CSS with rationale.
  The remaining `onMouseDown`/`onMouseUp` pairs are on the RGBA **range sliders**, bound
  deliberately alongside `onPointerDown` — not leftovers. ✅ code-complete.
- **04** — `viewZoomFloor()` + `MIN_CANVAS_SCREEN_PX = 50` exported from
  `useCanvasViewport.ts`; clamp is `Math.min(1, 50 / longest)`; both stores' `setViewZoom`
  take `floor` as a parameter defaulting to `0.25` and read no DOM.
  **`CanvasContainer.tsx` is NOT in the diff** (only `LightingCanvasContainer.tsx`, which
  is in Touches). ✅ code-complete.

## Deferred follow-ups

Tasks 04 and 09 may defer a one-line change into W5 because they are forbidden from
editing `CanvasContainer.tsx`. Record them here or task 11 will not know to apply them.

| From | What | Where it must land | Applied? |
| --- | --- | --- | --- |
| 04 | Pass the derived floor into the commit call: `onCommitViewZoom: (z) => camera.setViewZoom(z, viewZoomFloor(contentWidth, contentHeight))`. Without it the **pixel studio's main canvas still clamps at the legacy 0.25** and the zoom-out fix is only half-delivered (the lighting canvas already has it). Task 04 was forbidden from `CanvasContainer.tsx`, so it correctly left the default at `0.25` and deferred this. | `containers/CanvasContainer.tsx:1087` | **NO — task 11** |

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
