# HANDOFF — iPad Pencil fixes

**Current position:** W1 IN PROGRESS
**Branch:** `feat/09-ipad-pencil-fixes` (created from `feat/08-pose-camera-model-space` @ 875c314)
**Last commit:** 875c314 (baseline)

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04 | PARTIAL (code complete; device checks owed) | 2026-09-06 | cb27aa0 | typecheck 0 · lint 65w/0e (baseline) · test 151 files / 3176 passed (was 148/3139; corpus unchanged, no snapshot changed) · build 0 · stylelint 71/2 (baseline) · boundaries OK |
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
| 01 | iPad | ❌ **0 of 6 performed** — no device. Page must not zoom on double-tap / pinch / palm rest; canvas pinch-zoom must still work; rails, panels, timeline and modal bodies must still scroll. |
| 02 | iPad + desktop | ❌ **0 of 6 performed** — no device/browser session. Clear a field → stays empty; over-max → clamps on blur; Escape reverts; Enter commits; iPad keyboard commits once on dismiss; undo/redo refreshes displayed values. ⚠️ Also eyeball the Pose **Elevation** clamp (deviation 1). |
| 03 | iPad + Pencil | ❌ **0 of 7 performed** — no device. Pencil must select on contact in the SV grid and hue bar, track past the control's edge, and must NOT draw through onto the canvas. |
| 04 | owner's real project | ❌ **0 of 6 performed** — no device/project. ⚠️ Zoom-out on the **pixel studio** canvas is still capped at 0.25 until task 11 applies the deferred line; only the lighting canvas has the new floor today. Re-check after W5. |
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

### Task 02 — completed by follow-up agent (commit `cb27aa0`)

Step 4 finished (`PoseCameraGroup` Scale box; `EulerInput`'s shared angle primitive and
`ScaleAxisInput`). **Step 5 required no code change** — all five `type="text"` sites
already had draft/blur/Enter/Escape semantics. Coordinator-verified sweep: the only raw
`type="number"` left in `ui/` + `containers/` is `ColorPicker.tsx` (task 03's file, task
11's hex/number work) and `CameraAdvanced.tsx:259`, the reference implementation itself.

**Spec correction:** `EulerInput.tsx` has **2** real inputs, not 3 — the third grep hit was
inside a doc comment. The spec's "lines 261, 362" was right.

**🔴 A real bug was found in W1's already-committed primitive and fixed here.**
`NumberInput.commit` did `Number(raw)`, and **`Number("") === 0`, not `NaN`** — so clearing
a box and blurring committed `clamp(0, min, max)`, i.e. the minimum. That is precisely the
"clearing a field writes a value" defect this task exists to end, and it was **invisible in
any field whose minimum is 0**. It affected **all nine call sites migrated earlier in W1**,
not just the Pose ones. Empty/whitespace drafts are now rejected before the parse, with 2
regression tests. Found because the Pose scale box's floor is `1e-3`, so clearing it
collapsed the model rather than no-opping.

**Two clamp traps avoided.** `NumberInput` *enforces* `min`/`max` on commit where the raw
attribute was only advisory, so moving bounds across mechanically would have capped values
the store accepts. `PoseCameraGroup`'s box declared the **slider's** floor (0.1) while the
store's real floor is `1e-3`; it now passes the store floor as a local constant (`ui/` may
not import a store). `ScaleAxisInput`'s slider min already equalled the store's, so it was
safe unchanged.

**Deviations:**
1. **One user-visible behaviour change — worth eyeballing on the device.** Pose light
   **Elevation** now genuinely clamps to the ±90 it always declared. Previously `100`
   passed through, putting the light past the pole, and the box redisplayed it as `80`
   with the azimuth swung 180°. Coordinator-reviewed: `Math.asin` cannot return outside
   ±90 regardless, so this makes a declared bound true rather than changing reachable
   state. Azimuth stays unbounded (it wraps). Documented in the file header.
2. **Two test files edited outside `Touches`** — `EulerInput.dom.test.tsx`,
   `PoseSection.dom.test.tsx`. 12 tests asserted the live-commit semantics the task
   removes; per step 2's own guidance the assertions were rewritten to commit via blur
   rather than worked around. Accepted by the coordinator: rewriting a test that pins the
   behaviour you are deliberately changing is the intended move, not scope creep.
   **No snapshot was updated anywhere in W1** (`git diff` over `__snapshots__` is empty) —
   independent confirmation `vitest -u` was never run.

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
