# HANDOFF — iPad Pencil fixes

**Current position:** W2 COMPLETE (code); W3 (06, 07) is next
**Branch:** `feat/09-ipad-pencil-fixes` (created from `feat/08-pose-camera-model-space` @ 875c314)
**Last commit:** c3bc5dd

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04 | PARTIAL (code complete; device checks owed) | 2026-09-06 | cb27aa0 | typecheck 0 · lint 65w/0e (baseline) · test 151 files / 3176 passed (was 148/3139; corpus unchanged, no snapshot changed) · build 0 · stylelint 71/2 (baseline) · boundaries OK |
| W2 | 05 → 09 (**sequential**) | PARTIAL (code complete; task 09's device/project checks owed) | 2026-09-06 | c3bc5dd | typecheck 0 · lint 65w/0e (baseline) · test 153 files / 3209 passed (was 151/3176; corpus digests unchanged, no snapshot changed) · build 0 · boundaries OK · no lockfile |
| W3 | 06, 07 | PARTIAL (code complete; device checks owed) | 2026-09-06 | fa085e0 | typecheck 0 · lint 65w/0e (baseline) · test 155 files / 3223 passed · build 0 · stylelint 71/2 (baseline) · boundaries OK · no snapshot changed |
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
| 06 | desktop or iPad | ❌ **0 of 6 performed**. Fill tab + palette swatch → fill changes not edge; same on Current Palette; edge tab → edge changes AND enters recent-colours; double-tap adjustment still toggles; Fill tab + add-current-colour adds the fill colour; draw with pencil and fill tool. |
| 07 | iPad (other-hand rail is tablet-only) | ❌ **0 of 6 performed** — rail is `deviceClass === "tablet"` only. Edge/Fill selector thumb-reachable; Fill slider hits fill not edge; Edge slider hits edge; rail Swap exchanges and one undo restores (⚠️ see the fillColor undo finding — it will NOT fully restore); eyedropper with Fill active lands in fill. ⚠️ Check 6 (desktop picker shows swap) **cannot pass until task 11 wires it** — see R8. |
| 08 | iPad + Pencil | ❌ **0 of 8 device checks performed** — no iPad, no Pencil, no running app. Check 9 (desktop mouse regression) ✅ **covered automatically instead** — see the W4 task 08 notes. Owed: rect drag; lasso draw; flood/color tap; two-finger pinch must zoom and not select; draw with a finger resting; `touchcancel` mid-gesture; both other-hand-mode states; Grow/Shrink/Clear after committing. |
| 09 | desktop + iPad + a pre-existing project | ❌ **0 of 9 performed** — no device, no running app, no pre-existing project opened. See the W2 notes for the per-check list. |
| 10 | iPad (rotation) | ❌ **0 of 8 performed** — no iPad, no running app, no pre-existing project. Owed: (1) arrange in landscape, rotate → portrait keeps its own; (2) arrange in portrait, rotate back → landscape intact; (3) rotate repeatedly → no drift; (4) save, reload, rotate → both survive; (5) open a project saved BEFORE this change → its one layout appears in both orientations and editing one no longer clobbers the other (R11); (6) **desktop** resize wide↔tall → layout must NOT swap; (7) **StrictMode** `bun run dev`, rotate → swaps once not twice, no duplicate-listener warning (R10); (8) other-hand mode positions correctly in both orientations. ⚠️ Checks 1–6 and 8 have automated analogues in `orientationLayout.test.ts`; check 7 is the one nothing can cover — StrictMode double-mount is not reproducible in the node lane. |
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

## W2 notes (2026-09-06)

W2 is the plan's one deliberately non-parallel wave: tasks 05 and 09 both edit
`stores/ui/ToolUIStore.ts`. They were run **sequentially, 05 first**, by a single
agent — never concurrently, and never in one combined commit.

Gate run after each task, full output pasted below.

### Task 05 — color target store API · commits `49488b3`, `5e1af2b`

Files changed (exactly its `Touches`, nothing more):

- `client/src/stores/ui/ToolUIStore.ts` — `swapColors()`, registered `action`
- `client/src/stores/ApplicationStore.ts` — `setActiveColor()`, `activeColor`
  (registered `computed`), `swapEdgeAndFillColors()`
- `client/src/stores/ui/__tests__/colorTarget.test.ts` (new, 13 tests)

```
bun run typecheck  → exit 0
bun run lint       → 65 problems (0 errors, 65 warnings)   [baseline, not raised]
bun run test       → 152 files, 3189 tests, all passed     [was 151/3176]
bun run build      → built in 2.13s
```

**Corpus golden digests passed unchanged. No snapshot was updated** (`git diff`
over `__snapshots__` is empty for the whole wave). No `vitest -u` was run.
No lockfile appeared.

Locked decisions honoured: single entry point `ApplicationStore.setActiveColor`;
edge adds to `colorHistory`, **fill does not**; `selectedColor` NOT renamed;
`colorTarget` still unpersisted; `toPersistedUIState()` untouched; the swap
materialises `fillColor`; `swapEdgeAndFillColors()` snapshots **once**.

**Finding worth carrying into 06/07.** The two colour slots have DIFFERENT
write paths, which is why `setActiveColor` is not a one-line ternary. The edge
slot has a ride-along copy in the hosted project's `uiState` and must go through
`setColorAndAddToHistory` (which calls `colorSink`); `fillColor` is MobX-only and
is written directly. `ColorPickerContainer.tsx:100-105` carries the original
note. `swapEdgeAndFillColors` therefore also calls `colorSink` after the swap.
Call sites should use `app.setActiveColor` / `app.activeColor` and never
re-derive the branch.

### Task 09 — split pencil/eraser settings · commits `e17ea11`, `d9da671`, `c3bc5dd`

**The sharpest task in the plan — it adds two wire keys.** Both are tri-state,
`undefined` by default, and emitted through `assign()`, per the
`UIStore.ts:539-547` precedent.

Files changed:

- `client/src/stores/ui/ToolUIStore.ts` — `eraserBrushSize`, `eraserBrushMax`,
  their setters, `effectiveEraserSize` / `effectiveEraserMax`,
  `activeToolBrushSize`, hydrate
- `client/src/types/domain.ts`, `client/src/types/codecs/compactTypes.ts` — both
  keys **optional**. `types/constants.ts` deliberately UNCHANGED: the fields are
  optional, so `DEFAULT_UI_STATE` needs no entry, and adding one would have made
  them defined.
- `client/src/stores/ui/UIStore.ts` — slots 50/51, conditional, via `assign()`
- `client/src/ui/components/PixelStudioPanel/PixelStudioPanel.tsx` — the Eraser
  section binds the eraser's own size/max and gains a Max button row identical
  to the Pencil's, with the same displayed-value clamp
- `client/src/containers/PixelStudioPanelContainer.tsx` — supplies the props
- `client/src/containers/otherHand/toolWidgets.ts` — `case "eraser"` gets its
  own size slider and Max row; `case "pixel"` unchanged
- `client/src/stores/ui/__tests__/eraserBrush.test.ts` (new, 20 tests)
- `client/src/stores/ui/__tests__/persistedUIState.test.ts` — **deviation, see
  below**

```
bun run typecheck  → exit 0
bun run lint       → 65 problems (0 errors, 65 warnings)   [baseline, not raised]
bun run test       → 153 files, 3209 tests, all passed     [was 152/3189]
bun run build      → built in 2.10s
cd client && bun run lint:boundaries → OK — all 5 boundary rules hold
find . -maxdepth 2 -name 'bun.lock*' → none
```

**🔴 Corpus golden digests passed UNCHANGED with both new keys in place** —
which is the proof they are genuinely conditional. **No snapshot was updated
anywhere in W2**; `git diff cb27aa0..HEAD -- '*__snapshots__*'` is empty. No
`vitest -u` was run.

**The guard test was PROVED to bite, not assumed to.** `eraserBrushSize` was
temporarily made unconditional (`persisted.eraserBrushSize = ...` instead of
`assign(...)`) and the suites re-run:

- `eraserBrush.test.ts` → **2 of 20 failed** (the emits-neither-key case and the
  after-`setEraserBrushSize`-only-that-key case)
- `persistedUIState.test.ts`'s *R3 — the builder against the real corpus* →
  **15 failed**, one per corpus file

The change was then reverted and `git diff` over `UIStore.ts` confirmed clean
before proceeding. Both layers of defence work.

`CanvasContainer.tsx`, `toolHandlers.ts` and `toolFootprint.ts` are **NOT** in
the diff — verified by name against the full wave diff.

### Manual checks — per item, as required

**Task 05** has ONE manual check and it was **NOT performed** (no running app):

1. ❌ Open the colour picker, switch Edge/Fill tabs, pick colours → behaviour must be
   *exactly* as before, because this task adds API without rewiring anything. Code-level
   confirmation stands in for it as far as it can: `git diff` shows **no container and no
   `ui/` file** in task 05's commits, so no call site changed and no behaviour can have.

**Task 09** has NINE and **none were performed** — no iPad, no running app, no
pre-existing project:

1. ❌ Pencil to size 12, switch to eraser → eraser at its own size (inherits 12 fresh).
2. ❌ Eraser to size 3, back to pencil → pencil still 12.
3. ❌ Back to eraser → still 3; the two no longer track each other.
4. ❌ Eraser panel has a Max row identical to the Pencil's; the two maxes are independent.
5. ❌ Eraser max to 8 while its size is 32 → size clamps to 8, pencil's size untouched.
6. ❌ Hover footprint matches the ACTIVE tool's size. ⚠️ **This one is EXPECTED TO FAIL
   until the W5 follow-up lands** — see the step-9 deferral above. It is not a defect in
   what shipped; it is the deferred line.
7. ❌ Same checks in the other-hand rail on the iPad.
8. ❌ Save and reload → both tools' sizes and maxes come back correctly.
9. ❌ **Open a pre-existing project** → the eraser inherits the saved `brushSize` and
   nothing is lost. This is the most important of the nine and the only one that
   exercises real owner data.

Checks 1-5 and 7-9 are covered *at the store and wire level* by the 20 tests in
`eraserBrush.test.ts` (including the hydrate round-trip and the absent-key cases that
stand behind checks 8 and 9), and the corpus suite passing unchanged is strong evidence
for check 9. **That is not the same as running them on the device**, and per plan rule 14
this leaves W2 **PARTIAL**, not DONE.

### Deviation (task 09) — one file edited outside `Touches`

`client/src/stores/ui/__tests__/persistedUIState.test.ts`. It asserts
`expect(declared).toHaveLength(53)` against `CompactUIState`'s declared field
list read from source, so **any** new wire key fails it by construction — that
is the mechanism working as designed, not a regression. Bumped to 55, and the
running ledger of deliberate extensions above the assertion was extended with a
`+2 (2026-09-06)` entry in the established house style. Its
`fullyPopulatedProject()` fixture also had to gain both keys, or the
every-field-reachable assertion would read the two new builder lines as missing.
The eraser's fixture values are deliberately DIFFERENT from the pencil's
(`eraserBrushSize: 3` / `eraserBrushMax: 8` vs `brushSize: 7` /
`pencilBrushMax: 64`) — the whole point of the pair is that they are its own.
This edit is unavoidable for any new key and is not scope creep.

### Task 09 step 9 — the draw path, resolved as a DEFERRAL (not a blocker)

Step 9 asked whether `ctx.brushSize` can be made tool-aware from within
`ToolUIStore` alone. **Answer: yes, via a getter — but the consumption is a
`CanvasContainer.tsx` edit, which task 09 is forbidden from making.**

Measured: `CanvasContainer.tsx:607` reads `tool.brushSize` into ONE local that
feeds four consumers — the hover footprint (`:2228`), `brushStampOptions`
(`:4264`), `getToolContext` (`:4325`), and `fill-square` (`:4372`, `:4818`).
Because `fill-square` must keep the PENCIL's size, `:607` cannot simply be
swapped wholesale; the tool-aware getter must be consumed at the three
tool-aware sites only.

`ToolUIStore.activeToolBrushSize` is therefore **added and tested but not yet
consumed**. It branches on `"eraser"` only — deliberately, since `fill-square`
and reference-trace keep the pencil's size and giving them their own would mean
more wire keys the user never asked for. The follow-up is in the table below.

**User-visible consequence until W5 applies it:** the eraser's PANEL and RAIL
sliders are already independent, but the eraser's actual DRAW size and its hover
footprint still follow `brushSize`. So manual checks 1-5 and 7 will show the
controls behaving correctly while check 6 (the footprint) will not, and erasing
will use the pencil's width. **Task 09 is not fully delivered until that line
lands.**

### W2 — coordinator's independent verification (2026-09-06)

Gate re-run by the coordinator on the post-W2 tree:

```
bun run typecheck  → exit 0
bun run lint       → 65 problems (0 errors, 65 warnings)   [baseline held]
bun run test       → 153 files, 3209 tests, all passed
bun run build      → built in 2.10s
git diff cb27aa0..HEAD -- '*__snapshots__*'  → empty (no snapshot changed anywhere)
find . -maxdepth 2 -name 'bun.lock*'         → none
```

**The R1 guard was re-proved by the coordinator, not taken on trust.** I temporarily
rewrote slot 50 as an unconditional `persisted.eraserBrushSize = …`, re-ran, and restored
from a scratchpad copy (`git status` clean afterwards, `assign()` form confirmed back).
Result:

| Suite | With the key unconditional |
| --- | --- |
| `eraserBrush.test.ts` | **FAILED 2 of 20** ✅ catches it |
| `persistedUIState.test.ts` (R3 real-corpus builder) | **FAILED** ✅ catches it |
| `corpus golden digests` (23 tests) | **PASSED** ⚠️ does NOT catch it |

**🔴 Correction to a plan assumption worth carrying forward.** MASTER §8 E1 and R1 both
say "the corpus suite is the only thing that catches it". **That is not what the corpus
suite actually does.** The golden digests hash snapshots as they exist on disk; they do
not re-serialize through `toPersistedUIState()` with a mutated store, so an unconditional
new key sails straight past them. The suites that genuinely bite are
**`eraserBrush.test.ts`'s emits-NEITHER-key test** and **`persistedUIState.test.ts`'s R3
builder**. Task 10 adds richer `railLayouts` keys under the same risk — **it must ship an
equivalent emits-nothing test; a green corpus run is NOT sufficient evidence.**

Both keys verified conditional at `UIStore.ts:612-613` via `assign()`, with an inline
comment citing the measured `fillColor` incident (where a `key: undefined` form changed
all 11 digests). `CanvasContainer.tsx` confirmed absent from the W2 diff.

**Deviation accepted:** `persistedUIState.test.ts` was edited outside `Touches`
(`toHaveLength(53)` → `55`). It asserts the declared field count by construction, so any
new wire key fails it — the mechanism working as designed, not scope creep.

### W3 — task 06 verified by the coordinator (2026-09-06)

Commits `4983574` (fix), `7a3c416` (test). Diff scope confirmed: exactly its three
`Touches` files, nothing under `ui/`.

**Delegation verified by reading the source, not the report.** All three sites call the
task-05 API — `onSelectColor={(color) => app.setActiveColor(color)}` and
`selectedColor={app.activeColor}` in `PaletteManagerContainer`, `onSetColor` likewise in
`ColorPickerContainer`, whose old inline branch is now a comment pointing at
`setActiveColor`. No call site re-derives the edge/fill branch.

**Accepted judgement call.** `PaletteManagerContainer:217` `currentPickerColor` still reads
`ui.tool.selectedColor` deliberately. It only draws the ✎ colour-**adjustment** marker, and
adjustment is edge-only-gated (`ColorPickerContainer` gates `colorAdjustment` to
`colorTarget === "edge"`); following the target would put the marker on a swatch no
adjustment could act on. Documented inline. Coordinator agrees.

**The new test was proved to discriminate.** Its author reverted the container and measured
**5 of 7 failing**; the 2 survivors are labelled in the file header as negative controls
(edge-target cases where correct and broken agree by construction) rather than counted as
coverage. The header also records two near-miss test bugs that were caught and fixed —
a MobX write outside `act()` that captured the first render regardless of store state, and
a seeding path where two defects masked each other exactly. This is the standard the
remaining waves' tests should meet.

### Task 07 — eyedropper bound held

`52f2a00` changes **exactly 3 lines** of the 5,848-line `CanvasContainer.tsx`
(`3 insertions, 3 deletions`), all `setColorAndAddToHistory(…)` → `setActiveColor(…)`.
That bound matters because task 08 rewrites the touch handlers in the same file next wave.

### W3 — task 07 verified by the coordinator (2026-09-06)

Commits `f6b0d99`, `52f2a00`, `33d9fa6`, `fa085e0`. Full wave gate re-run by me:

```
bun run typecheck                    → exit 0
bun run lint                         → 65 problems (0 errors, 65 warnings)  [baseline]
bun run test                         → 155 files, 3223 tests, all passed
bun run build                        → built in 2.14s
cd client && bun run lint:css        → 71 problems (2 errors, 69 warnings)  [baseline]
cd client && bun run lint:boundaries → OK — all 5 boundary rules hold
git diff 9d6173a..HEAD -- '*__snapshots__*'  → empty
```

**R6 (a later wave reverting an earlier one's work in `ColorPicker.tsx`) — checked, holds,
but the report's evidence was imprecise.** Task 07 reported "zero removed lines" since task
03. That is **not true**: `git diff 26b2ef6..HEAD` removes **21 lines**. What matters is
*which* — and **zero of the 21 mention pointer, capture or touch-action**. The removals are
the edge/fill tablist markup being restructured into the new `__target-row`, i.e. task 07's
own earlier markup. All 4 `setPointerCapture` calls and all 5 `touch-action: none`
declarations survive. **Task 03's pointer work is intact — verified by grep over the
removed lines, not by the summary claim.**

`toolWidgets.ts` needed no change at all (the existing `buttons` spec already covered both
new controls), so task 09's W2 work there is trivially preserved.

### 🔴 Latent bug found by task 07 — pinned as characterisation, NOT fixed

**One undo after a swap restores `selectedColor` but leaves `fillColor` where the swap put
it.** Verified independent of the swap with a throwaway probe (bare `saveStateToHistory()`
→ `setFillColor` → `undo()` reproduces it), so it is the snapshot/restore path, not the
rail and not task 05.

Cause, confirmed by the coordinator at `ApplicationStore.ts:1793-1797`: `selectedColor` has
a ride-along copy in the hosted project's `uiState` and goes through
`setColorAndAddToHistory`, which patches it; **`fillColor` is MobX-only with no equivalent
sink**, so it has been outside the undo stack for *every* writer since the edge/fill split —
this predates plan 09 entirely.

Pinned at `OtherHandRailContainer.dom.test.tsx:205` as observed-behaviour characterisation,
correctly labelled "CHARACTERISATION, NOT A DESIRED-BEHAVIOUR ASSERTION". Not fixed because
the fix is a new sink on `ApplicationStore` — outside task 07's `Touches` and on the
persistence perimeter. **This is owner-visible: swapping and undoing will half-revert.**
Not in this plan's scope; worth a follow-up plan.

### R8 — the swap control ships UNWIRED (expected, but note the spec conflict)

`onSwapColors?: () => void` is optional and the button renders only when supplied. Nothing
supplies it yet: `ColorPickerContainer.tsx` is task 06's and the `X` shortcut is task 11's.
**So the desktop picker today shows no swap button at all.** The other-hand rail's swap
**is** wired and works.

⚠️ **Spec conflict recorded:** task 07's manual check 6 says "the color picker shows the
swap control", but its own Constraints mandate the optional-render form. The executor
followed the Constraints. Check 6 as literally written cannot pass until task 11 — this is
exactly R8 and task 11 must not skip it.

## W4 notes — task 08 (2026-09-06)

### Task 08 — selection touch support · commits `ab02e61`, `8292732`

**R4, the plan's highest-likelihood risk — where the branch went, and why.**

`"selection"` is a member of `isGestureTool`, and every touch handler that
consults that predicate returns for every member of it. A selection branch
written *after* that bail is never reached, and it fails **silently**: no
error, no warning, just a Pencil that does nothing. Placement, per handler:

| Handler | Placement | Guard it sits ahead of |
| --- | --- | --- |
| `handleTouchStart` | after `getPixelCoords`, **before** the `!coords \|\| !layer` guard **and** before the `isGestureTool` bail | both |
| `handleTouchMove` | after the `isDraggingPixels` branch, **before** `if (!isDrawing) return;` and before the `isGestureTool` bail | both |
| `handleTouchEnd` | immediately after `posePointerUp()`, before every early return | — (**this handler has no `isGestureTool` bail at all**) |
| `handleTouchCancel` | before `clearPreviewPixels`, calling `commitSelection(false)` | — |

**The predicate was NOT narrowed.** `isGestureTool` still contains
`"selection"`, deliberately. It is consulted in three places and means "this
tool is arbitrated ahead of `toolHandlers`, never dispatched through it" —
still true of selection, whose `toolHandlers` entry is deliberately `{}`.
Removing the member would change its meaning at all three sites to fix one,
and would let a selection touch fall through to `pointer.beginStroke` and
paint pixels. The comment written into the code says exactly this.

`handleTouchStart`'s split of the `!coords || !layer` guard is the other
deliberate call: selection needs coords (nothing to select without a cell)
but **not** a layer (a mask is object geometry, and selecting on an empty or
layerless object is meaningful). `move` stays after the full guard because it
drags pixels and genuinely does need one.

### Step 7 / R5 — what was extracted

Three local helpers in `CanvasContainer.tsx`, called by **both** devices:

- `beginSelectionAt(coords)` — press. All four modes (`rect`, `flood`,
  `color`, lasso fallthrough) **and** the drag-an-existing-selection branch.
- `updateSelectionAt(coords)` — drag. Rect preview box, lasso accumulation
  (with the jitter filter) **and** the existing-selection drag.
- `commitSelection(commit = true)` — release. `commit: false` abandons
  instead, which is the `touchcancel` path the mouse has no equivalent of.

⚠️ **The existing-selection drag was pulled in deliberately, beyond the
task's literal three-helper list.** `beginSelectionAt` can *open* that drag,
and before this task only the mouse handlers could advance or close it — so
leaving it out would have meant a Pencil press inside a selection opening a
drag touch can never finish: `isDraggingSelection` stuck true, every later
touch swallowed. A helper that opens a gesture has to be able to close it.

Net effect on the file: the mouse handlers lost ~95 lines of inline body and
the touch handlers gained **no copy of it**. `CanvasContainer.tsx` went
5,848 → 6,033 lines (+185), and every one of those lines is comment or helper
header — the four placement rationales R4 demanded be written down, plus the
three helper doc-blocks. The executable logic shrank; had the gesture been
copy-pasted per the literal step order, the file would have taken ~95 lines
of duplicated logic on top.

### The tests were proven by reverting the fix

`containers/__tests__/selectionTouch.dom.test.tsx` — 18 tests, mounting the
**real** `CanvasContainer` and firing real touch events at the same
`<canvas>` the Pencil hits. Each of the five ways this task could have been
got wrong was re-injected and the suite re-run:

| Injected mistake | Failures, of 18 |
| --- | --- |
| **R4** — touchstart branch moved BELOW the `isGestureTool` bail | **10** |
| `handleTouchEnd`'s commit branch deleted | 6 |
| `handleTouchMove`'s `updateSelectionAt` call deleted | 5 |
| `handleTouchCancel`'s abandon deleted | 2 |
| `"selection"` put back into `MOUSE_ONLY_TOOLS` | 1 |

🔴 **One round of tests was thrown away as worthless.** The two `touchcancel`
tests, written store-first ("nothing was committed", "the next gesture is
clean"), scored **ZERO** failures against a deleted abandon. Both passed for
the same wrong reason: `beginSelectionAt` replaces `previewSelection` on
every press, so the next gesture papers over whatever the cancel failed to
clear, and a cancel commits nothing either way. What a botched cancel
actually leaks is **visible, not stored** — a marching-ants box or lasso band
left drawn with no gesture left to remove it. They were rewritten to read the
rendered SVG chrome against a pre-gesture baseline, and now fail 2.

Two further false-pass traps are documented in the file's header: jsdom's
zero-size `getBoundingClientRect` (which makes `screenToPixel` return `null`
for every touch, so every assertion would pass for exactly the broken
reason), and `touchType: "stylus"` on the fixtures, without which the
pencil-plus-resting-finger case tests a different gesture entirely.

### Gate — real output, run by the executing agent

```
$ bun run typecheck        → exit 0 (client tsc --noEmit, server tsc --noEmit)
$ bun run lint             → ✖ 65 problems (0 errors, 65 warnings)   ← baseline held
$ bun run test             → Test Files 158 passed (158)
                             Tests      3276 passed (3276)
                             ✓ corpus golden digests — the real regression gate
                               backup-02-24-2026.json / base-unit.json both pass
$ bun run build            → ✓ built in 2.09s
$ cd client && bun run lint:boundaries → OK — all 5 boundary rules hold.
$ find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules → (nothing)
```

No `vitest -u` was run; no snapshot changed. `stylelint` not run — this task
touched no CSS.

⚠️ The 158/3276 figures include task 10's tests, which landed in the same
working tree concurrently. Task 08 alone contributes
`selectionTouch.dom.test.tsx` (18 tests). Mid-task runs showed 5 failures in
`LayoutUIStore` / `orientationLayout` / `persistedUIState` — all task 10's
work-in-progress, none in task 08's files; they were green by the final run.

### Deviations

1. **`ui/hooks/__tests__/useCanvasPointer.dom.test.ts` edited, and it is not
   in `Touches`.** Its "touch does NOT dispatch the four mouse-only tools"
   case asserted the exact behaviour this task was commissioned to change,
   and failed the moment `"selection"` left `MOUSE_ONLY_TOOLS`. Updated to
   three tools, with a comment pointing at the new suite. It is the test file
   belonging to a file that IS in `Touches`; no other task owns it.
2. **Steps 6 and 8 are one commit (`ab02e61`), not two.** The task asks for
   the gesture to be written twice and then extracted. It was written
   extracted from the start — the duplication step would have added ~95
   duplicated lines to a 5,848-line file only to delete them in the next
   commit, and `ARCHITECTURE.md` §6 argues against creating it in the first
   place. The commit message records both halves. Reported rather than
   papered over.
3. **The existing-selection drag was folded into the helpers** — see step 7
   above. Beyond the literal instruction, required for correctness.

### Recorded, not fixed

- The `endStroke` latent bug (`useCanvasPointer.ts:162-171`) is **already in
  the Notes section below**, added when the plan was written. Confirmed still
  present and still untouched. No tool defines `onUp`, so it stays latent.
- `SelectionUIStore.selectLasso` commits a **1-cell mask** for a single
  point (`:463-466`); the task file describes it as committing nothing. Both
  are true of the system as a whole because `commitSelection` guards
  `lassoPoints.length > 1`, so the container never hands the store one point.
  The guard is the container's and is tested there. Store untouched.

### W4 — task 08 verified by the coordinator (2026-09-06)

Commits `ab02e61` (feat), `8292732` (test), `e6a31c1` (docs).

**R4 — the plan's highest-likelihood risk — verified by reading the file, not the report.**
The selection touch branch sits at `CanvasContainer.tsx:5305`; the `isGestureTool` bail is
at `:5367`. **Ahead of the bail**, matching the reflection/pose precedent at `:5277`/`:5292`.
The placement decision is written into the code as the spec required, and it also records
the subtler call: **the predicate was NOT narrowed.** `isGestureTool` still contains
`"selection"` because it is consulted in three places and means "arbitrated ahead of
`toolHandlers`, never dispatched through it" — still true of selection, whose
`toolHandlers` entry is deliberately `{}`. Removing the member would have changed its
meaning at three sites to fix it at one, and would let a selection touch fall through to
`pointer.beginStroke` **and paint pixels**. A branch ahead of the bail is the local fix.

**R5 — extraction confirmed.** `beginSelectionAt` / `updateSelectionAt` /
`commitSelection` at `:4462`, `:4538`, `:4600`, with **7 call sites** shared between mouse
and touch. The gesture body is not duplicated. File grew 5,848 → 6,033 lines, but the
executable logic shrank — the growth is comment and helper headers.

**`MOUSE_ONLY_TOOLS` correctly reduced to exactly `["eyedropper", "origin",
"reference-trace"]`** — only `"selection"` removed, as locked.

**Task 07's 3 eyedropper lines survived** task 08's rewrite of the same file
(`grep -c "app.setActiveColor"` → 3).

**🔴 The test quality here is the standard for the rest of the plan.** The executor proved
the suite by re-injecting each of five possible mistakes (of 18 tests): branch below the
bail → **10 fail**; `handleTouchEnd` commit deleted → 6; `handleTouchMove` update deleted →
5; `handleTouchCancel` abandon deleted → 2; `"selection"` back in `MOUSE_ONLY_TOOLS` → 1.

**It also threw away a round of its own tests as worthless.** Two store-first `touchcancel`
tests scored **ZERO failures** against a deleted abandon — both passed for the same wrong
reason. Rewritten to read the rendered SVG against a pre-gesture baseline; they now fail 2.
The file header additionally documents a jsdom trap: without a `getBoundingClientRect`
stub, `screenToPixel` returns `null` for every touch and every assertion would pass **for
exactly the broken reason** the tests exist to catch.

**Deviations, all accepted:**
1. `useCanvasPointer.dom.test.ts` edited though not in `Touches` — it asserted "four
   mouse-only tools", the exact behaviour the task was commissioned to change. It is the
   test file of a file that IS in `Touches`, and no other task owns it.
2. Steps 6 and 8 landed as one commit — written extracted from the start rather than
   duplicating ~95 lines only to delete them next commit. `ARCHITECTURE.md` §6 argues
   against creating the duplication at all.
3. The existing-selection drag was folded into the helpers, beyond the literal three-helper
   list. Required for correctness: `beginSelectionAt` can *open* that drag and only the
   mouse handlers could previously close it, so omitting it would leave a Pencil press
   inside a selection stuck with `isDraggingSelection` true, swallowing every later touch.

**Recorded, not fixed:** `SelectionUIStore.selectLasso` commits a **1-cell mask** for a
single point (`:463-466`), contra the task file's "commits nothing". Both statements hold
for the system because `commitSelection` guards `lassoPoints.length > 1` — the guard is the
container's and is tested there. Store untouched. The `endStroke` latent bug was already in
Notes; confirmed present and untouched.

## W4 notes — task 10 (2026-09-06)

### Task 10 — orientation-aware layout · commits `3fd9049`, `a00091f`

**Status: PARTIAL** — code complete, gate green, **0 of 8 device checks performed** (no
iPad, no running app, no pre-existing project). Per MASTER rule 14 that is PARTIAL, not
DONE.

**Files changed** (all inside `Touches`, plus three test files — see Deviations):

| File | What |
| --- | --- |
| `client/src/ui/layout/deviceClass.ts` | **Appended only.** `Orientation`, `PORTRAIT_QUERY`, `detectOrientation()`, `layoutKey()`. `detectDeviceClass` and its two breakpoints are **byte-for-byte untouched** — verified in the diff. |
| `client/src/stores/ui/LayoutUIStore.ts` | Observable `orientation`; `setOrientation` action; `listenForOrientation()` + `disposeOrientation` + `dispose()`; `get layoutKey`; `get layout()` reads the composite key and falls back to the bare `deviceClass`; `write()` writes the composite key. `hydrate()` and `toPersistedRailLayouts()` structurally unchanged. |
| `client/src/stores/ui/__tests__/orientationLayout.test.ts` (new) | 24 unit tests: keying, the two-orientation round trip, the legacy migration, the desktop exception, `layoutPresets`, and the wire-format invariant. |
| `client/src/stores/ui/__tests__/orientationLayout.dom.test.ts` (new) | 11 jsdom tests: `detectOrientation`, the unchanged short-edge `detectDeviceClass`, and the listener lifecycle. |

### 🔴 THE CORPUS DIGEST SUITE DOES NOT CATCH AN UNCONDITIONAL KEY — MEASURED, TWICE

MASTER §8 E1 and R1 both state "the corpus suite is the only thing that catches" it.
**That is wrong, and this task reproduced the coordinator's W2 measurement exactly.**

With the composite key made deliberately unconditional (desktop included) *and* a hydrate
that rewrote legacy keys into composite ones — i.e. both forbidden shapes at once:

| Suite | Result under sabotage | Catches it? |
| --- | --- | --- |
| `corpus golden digests` (26 tests) | **26 passed, 0 failed** | ❌ **NO** |
| `orientationLayout.test.ts` | **7 failed / 17 passed** | ✅ yes |
| `persistedUIState.test.ts` | **18 failed / 25 passed** (incl. **all 11 real-corpus builder tests**) | ✅ yes |

The digests hash the snapshots as they sit on disk; they never re-serialize through
`toPersistedUIState()` with a mutated store. **A green corpus run is NOT evidence of wire
safety.** Any future task adding a wire key must ship its own emits-nothing test and rely
on `persistedUIState.test.ts` — not on the digests.

The sabotage was then reverted and both files confirmed **byte-identical** to their
pre-sabotage state (`diff` clean, both sabotage markers gone). The full suite returned to
158 files / 3276 passed.

**The emits-nothing test** is `orientationLayout.test.ts` → "⭐⭐ THE WIRE-FORMAT INVARIANT
— an untouched store emits NOTHING", five cases. It asserts with `in` and `Object.keys()`,
never truthiness, because "present but undefined" still counts as a key to the digest. Its
sharpest case is **"merely ROTATING an untouched store still emits nothing"** — the failure
mode this task newly makes reachable, since rotation is the one thing that now changes the
key mid-session.

### The locked decisions, as implemented

- **`detectDeviceClass` UNCHANGED** — still short-edge, still the same two breakpoints. A
  test stubs an 820×1180 screen both ways round and asserts `"tablet"` both times.
- **Legacy migration in the GETTER** (R11). `get layout()` does
  `railLayouts[composite] ?? railLayouts[deviceClass]`. Nothing rewrites the map on
  hydrate; `write()` is the only writer and only runs because the user acted. Pinned by
  "hydrating a LEGACY map does not rewrite it" and "once landscape is edited, PORTRAIT is
  still the legacy layout".
- **Desktop keyed by class alone.** `layoutKey("desktop", …)` returns `"desktop"` in both
  orientations, so no desktop user's saved layout moves and a tall window does not swap it.
- **`layoutPresets` stays `deviceClass`-only** — a preset saved in portrait is offered in
  landscape, pinned by a test.

### R10 — the StrictMode disposer

`listenForOrientation()` returns a disposer; `dispose()` calls it. Three paths, each with a
matching removal, each tested: `matchMedia` + `addEventListener` (primary), `addListener`
(Safari < 14 — the iPad is exactly the device this is for), and `window.resize` (the
`matchMedia`-less fallback). The key test asserts `removeEventListener` was called with the
**same handler reference** that was added — removing a different reference silently removes
nothing, which is the actual failure mode.

⚠️ **`LayoutUIStore.dispose()` is NOT yet called by anything — see the blocker below.**

### 🔴 BLOCKER — `UIStore.dispose()` does not call `this.layout.dispose()`

`client/src/stores/ui/UIStore.ts:710` is the only construction site of `LayoutUIStore`
(`:348`) and the natural place to release the listener, but **`UIStore.ts` is not in task
10's `Touches`** (it belongs to task 09, W2). Per MASTER rule 11 the file was left
untouched and this is recorded instead of edited.

**One line is owed, in `UIStore.dispose()`:**

```ts
dispose(): void {
  this.disposeVersionReaction();
  this.layout.dispose();   // ← task 10 (R10): releases the orientation listener
}
```

**Exposure until then:** the listener outlives a discarded `UIStore`. It holds only a
reference to the dead store and sets an observable nobody reads, so it leaks a listener
rather than corrupting anything — but under React 19 StrictMode's double mount it is
precisely the R10 double-fire the disposer exists to prevent. The disposer itself is built
and fully tested; only the call site is missing. **Task 11 should apply it.**

### Gate — real output, run by the executing agent

```
$ bun run typecheck
$ bun run --cwd client typecheck && bun run --cwd server typecheck
$ tsc --noEmit
$ tsc --noEmit
                                                          → exit 0

$ bun run lint
✖ 65 problems (0 errors, 65 warnings)
  0 errors and 1 warning potentially fixable with the `--fix` option.
                                                          → exit 0, baseline HELD

$ bun run test
 Test Files  158 passed (158)
      Tests  3276 passed (3276)
                                                          → exit 0

$ bun run build
dist/index.html                         1.01 kB │ gzip:   0.54 kB
dist/assets/index-BS3cuvzW.css        221.89 kB │ gzip:  28.08 kB
dist/assets/index-D2SDQe0b.js         817.27 kB │ gzip: 238.25 kB
✓ built in 2.24s                                          → exit 0

$ cd client && bun run lint:boundaries
check-boundaries: OK — all 5 boundary rules hold.         → exit 0

$ find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
(no output — no lockfile)
```

**Corpus digests passed unchanged; no snapshot was updated anywhere.** `vitest -u` was
never run. `bun run lint:css` was not run — this task adds **no CSS**.

⚠️ The test counts overlap task 08, which ran in parallel in the same tree. Task 10's own
contribution is **+2 files / +35 tests**. The 155/3223 baseline was measured mid-flight as
155 files / 3222 passing **+ 1 pre-existing failure in task 08's
`useCanvasPointer.dom.test.ts`**, which task 08 fixed during the wave.

### Deviations

1. **`persistedUIState.test.ts` edited outside `Touches`** — "emits railLayouts once a rail
   actually moves" asserted `built.railLayouts?.tablet`, the exact key this task changes.
   Same mechanism, same file, and the same accepted deviation as task 09's. Now asserts
   `["tablet:landscape"]` with the orientation pinned, and carries a comment explaining the
   second dimension. **The corpus-protecting case beside it is untouched.**
2. **`LayoutUIStore.test.ts` and `LayoutUIStore.otherHand.test.ts` edited outside
   `Touches`** — 5 sites constructed `new LayoutUIStore("tablet")` and read a key the store
   **wrote**. They now pin the orientation and read the composite key. ⚠️ Sites that read a
   **hydrated legacy** `tablet` key were deliberately left alone: that fallback is the
   migration and must keep working. These are the test files of a file that IS in
   `Touches`, and no other task owns them.
3. **The new test is TWO files, not one.** The spec named
   `orientationLayout.test.ts`; the `unit` lane runs in **node with no `window`**, so
   `detectOrientation` and the whole listener lifecycle cannot run there. Split following
   `ReferenceUIStore.dom.test.ts`, which sits in the same directory and is split from its
   unit sibling for exactly this reason. All six cases the spec listed are covered.

### Recorded, not fixed

- `hydrate()` still assigns `railLayouts` verbatim, so a project can carry **both** a
  legacy `tablet` key and composite keys indefinitely. Deliberate: the composite key wins
  in the getter (pinned by a test), and pruning the legacy key would be exactly the
  on-load rewrite R11 forbids. It costs one stale map entry in the project file.
- `deviceClass` is still measured **once** at construction and orientation is now the only
  live dimension. Moving a browser window between a laptop and an external display still
  will not reclassify it — unchanged behaviour, and out of scope.

## Deferred follow-ups

Tasks 04 and 09 may defer a one-line change into W5 because they are forbidden from
editing `CanvasContainer.tsx`. Record them here or task 11 will not know to apply them.

| From | What | Where it must land | Applied? |
| --- | --- | --- | --- |
| 04 | Pass the derived floor into the commit call: `onCommitViewZoom: (z) => camera.setViewZoom(z, viewZoomFloor(contentWidth, contentHeight))`. Without it the **pixel studio's main canvas still clamps at the legacy 0.25** and the zoom-out fix is only half-delivered (the lighting canvas already has it). Task 04 was forbidden from `CanvasContainer.tsx`, so it correctly left the default at `0.25` and deferred this. | `containers/CanvasContainer.tsx:1087` | **NO — task 11** |
| 09 | Consume the tool-aware brush size: replace `brushSize` with `tool.activeToolBrushSize` at the THREE tool-aware sites only — the footprint memo (`:2228`), `brushStampOptions` (`:4264`) and `getToolContext` (`:4325`). ⚠️ **Do NOT change `:607` itself and do NOT touch `fill-square`'s two sites (`:4372`, `:4818`)** — `fill-square` must keep reading the PENCIL's size. Without this the eraser's controls are independent but its actual draw width and hover footprint still follow the pencil, and task 09's manual check 6 cannot pass. | `containers/CanvasContainer.tsx` (~`:2228`, `:4264`, `:4325`) | **NO — task 11** |

## Deviations

- **W2 / task 09** — `stores/ui/__tests__/persistedUIState.test.ts` edited outside
  `Touches`. Unavoidable for any new wire key; full reasoning in the W2 notes.

## Notes for the next session

- **Known latent bug, deliberately not fixed** (task 08 records it, does not touch it):
  `client/src/ui/hooks/useCanvasPointer.ts:162-171` — `endStroke` nulls
  `lastStrokePixelRef.current` and then reads it, so any future `onUp` handler receives
  `{x:0, y:0}`. No tool defines `onUp` today, so it is latent.
- **Out of scope, recorded and CONFIRMED STILL TRUE after W2** (task 09): the lighting
  studio's normal pencil shares `brushSize` with the pixel studio
  (`LightingCanvasContainer.tsx:257, 439`; `LightingStudioPanelContainer.tsx:46, 51`), so
  changing one silently resizes the other. Task 09 deliberately left those four call sites
  reading `brushSize`. Fixing it needs a THIRD brush field — and therefore a third
  conditional wire key — and the user did not ask for it. Recorded, not fixed.
- **`brushSize` now means specifically THE PENCIL'S size** (W2/09). It keeps slot 9 and its
  unconditional emission; the eraser falls back to it via
  `ToolUIStore.effectiveEraserSize`. That `?? brushSize` fallback IS the migration — there
  is no migration code and none should be written.
- **The two colour slots have different write paths** (W2/05). `selectedColor` needs
  `colorSink`; `fillColor` is MobX-only. Tasks 06 and 07 should call
  `app.setActiveColor` / `app.activeColor` rather than re-deriving the branch.
- `client/src/ui/primitives/ColorSwatch/` exists and is imported by nothing. Adopting it is
  not part of this plan.
- `client/src/ui/primitives/Field`, `Slider` and `SliderWithNumber` have zero production
  usages. Wholesale primitive adoption was the never-executed refresh task 36 and stays
  out of scope here.
