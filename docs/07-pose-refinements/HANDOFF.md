# HANDOFF — Pose tool refinements

**Current position:** **ALL CODE COMPLETE — W5 PARTIAL, 41 manual checks owed.**
All 7 tasks landed and `bun run verify` exits **0**. The plan is NOT marked `COMPLETE`
because 41 de-duplicated manual checks remain **unperformed** — no agent in this plan or in
`docs/06-pose-tool/` has had a browser, a GPU or a device. That is an honest outcome, not a
failure. **The owner's headline zoom fix is arithmetic that has never been rendered.**
**Branch:** `feat/07-pose-refinements`
**Last commit:** `4899666` (last CODE commit: `0ebccce`)
**Plan written:** 2026-09-03 · Planning baseline HEAD: `54d6501` (branch `feat/06-pose-tool`)

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02 | DONE | 2026-09-03 | `774b0a2` | tsc 0 · eslint 0 err/65 warn · vitest 145 files / 2755 tests pass · boundaries OK · no lockfile |
| W2 | 03, 04 | DONE | 2026-09-03 | `b5ece14` | tsc 0 · eslint 0 err · vitest 146 files / 2818 pass · boundaries OK · stylelint exactly 2 err · storybook exit 0 · no lockfile |
| W3 | 05 | DONE | 2026-09-03 | `fdb4574` | ⚠️ `tsc` RED **by design** — 3 errors, all task-06-owned, listed below · eslint 0 err · vitest 146 files / 2857 pass · boundaries OK · no lockfile |
| W4 | 06 | DONE | 2026-09-03 | `0ebccce` | **`bun run verify` exit 0** · tsc 0 (hole CLOSED) · eslint 0 err · vitest 146 files / 2866 pass · boundaries OK · stylelint exactly 2 err · UIStore diff empty · no snapshot changed · no lockfile |
| W5 | 07 | **PARTIAL** | 2026-09-03 | `4899666` | `bun run verify` **exit 0** · stylelint 2 err · boundaries OK · storybook 0 · UIStore diff empty · no snapshot · no lockfile · bundle +5.33 kB explained. **PARTIAL: 41 manual checks unperformed** |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

## Task ledger

| Task | Title | Wave | Status | Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| 01 | Free zoom/pan + Fit seam | W1 | DONE | `86f456c` | `POSE_ZOOM_MAX` deleted; `fitGeneration`/`requestFit()` added. Cap only HALF fixed — see W2/W4 |
| 02 | Smooth normals + tesselation | W1 | DONE | `774b0a2` | sphere 48×32, cyl radial 48, height segs 1 (measured); `POSE_MATERIAL_FLAT_SHADING=false` |
| 03 | Panel: colours, Fit, edge slider | W2 | DONE | `868424f` | Native pickers gone; edge width 0–4 (0=off); slider cap removed. ⚠️ Leaves a marked placeholder for task 06 |
| 04 | Outline post-pass | W2 | DONE | `b5ece14` | `applyOutline()`, Chebyshev, mutates in place, 48 tests |
| 05 | Mannequin part meshes; delete framing | W3 | DONE | `fdb4574` | Exact partition: 9,636 tris across 5 parts, none empty. ⚠️ Leaves `tsc` red for task 06 |
| 06 | Container integration | W4 | DONE | `00e5a7e`, `5e0055e`, `0ebccce` | ⭐ Found the REAL zoom cap (~1.12, not 10). Outline NOT stamped (E7) |
| 07 | Full gate, QA, handoff | W5 | **PARTIAL** | (this commit) | `bun run verify` **exit 0**; bundle +5.33 kB explained; **63 owed checks → 41** in §7.7. PARTIAL because no agent can perform them |

## Known state at planning time (2026-09-03)

**The worktree is CLEAN** at `54d6501` on `feat/06-pose-tool`, and `bun run verify` **exits 0**.
Unlike the previous plan, there is no in-flight work to work around.

**Gate baseline measured 2026-09-03:**

- `bun run verify` (root) → **exit 0**
- `bunx tsc --noEmit` → exit 0
- `bunx eslint .` → **0 errors**, 65 warnings
- `bunx vitest run` → **145 files / 2737 tests pass**
- `bun run lint:boundaries` → OK, all 5 rules
- `bunx stylelint "src/**/*.css"` → 70 problems: **2 errors** (`OtherHand.css:338`, `:359`)
  + 68 warnings. **The 2-error baseline is pre-existing.**
- No lockfile present. ⚠️ `bunx` recreates `client/bun.lock` — sweep after every invocation.

**Bundle baseline (end of plan 06):** main **788.56 kB / 229.15 kB gzip**; `three.module`
**734.33 / 189.46 gz** (lazy); `GLTFLoader` **45.56 / 13.70 gz** (lazy). `three` is **not** in
the main bundle.

## ⚠️ Carried debt from `docs/06-pose-tool/` — read before starting

**All 30 manual checks in `docs/06-pose-tool/HANDOFF.md` §7 remain UNPERFORMED.** No agent in
that plan had a browser, a GPU or a device, so **the entire GL path has never been observed
running.** In particular:

- The **depth-derived heights** were reasoned from three's `depth.glsl.js` shader source and
  **never executed on a GPU**. They share the readback path this plan adds the outline to.
- **WebGL context-leak behaviour** across repeated tool switches is untested.
- **All touch/iPad gestures** are untested.

No task in this plan may assume any of that is proven. Task 07 merges both lists into one
honest, risk-ordered checklist for the owner.

## Owner decisions carried in (do not re-open)

- **E1** Mannequin parts are **real sub-geometry**, no left/right variants.
- **E3/E4** The outline is a **post-pass** at 1:1, thickness in **whole pixels 1–4**.
- **E19** D14's preset-overrides-projection behaviour **stays as written** — the owner chose
  on 2026-09-03 to revisit it after using the tool on real work. Do not "fix" it.
- The CC0 mannequin is vendored and its licence was re-verified 2026-09-03. Do not re-download
  or modify it.

## Open questions for the owner

1. ~~**Does the outline get stamped?**~~ **CLOSED by task 06 (W4).**
   **Decision: NO — the outline is display-only and is NOT stamped** (the E7 default).
   `renderPose` calls `applyOutline` on the buffer it blits to the overlay; `poseStamp` takes
   its **own** `engine.render()` read-back and never calls it, so `buildStampCells` sees the
   pre-outline silhouette. Reasoning, written out in full at `poseStamp`'s header:
   - **An outline pixel has no surface.** Every stamped cell carries colour + normal + height.
     The outline is a 2D dilation of a silhouette — no geometry beneath it, so no normal to
     encode and no depth to normalise. Any invention (nearest model normal? face the viewer?)
     is a lie the lighting studio would shade as if real.
   - **`height: 0` is already the "no data" sentinel**, so the only honest height for an
     outline pixel means "not part of the model" — leaving a bare colour with a fabricated
     normal, which is worse than not writing it.
   - **The owner asked for a reference affordance** — silhouette readability while tracing.
     The artwork's own edge is something they draw.
   - **It stays reversible.** Adding it later is one call; un-committing edge pixels with
     invented normals from 151 real projects is not.
   ⚠️ **If the owner wants the outline stamped**, the normal/height channels must be
   *defined*, not defaulted, and E6's shared `>= 128` keeps both silhouettes in step.
2. ~~**Light colour** is not a Fill/Edge concept.~~ **CLOSED by task 03 (W2).**
   **Decision: it keeps its own control, but the native OS swatch is gone.** It is now a
   five-preset tint row — **Neutral / Warm / Cool / Amber / Moon** (`LIGHT_TINTS`) — still
   backed by `pose.lightColor` / `pose.setLightColor`, unchanged.
   **Reasoning:** Fill and Edge describe the *artwork*; a key light's tint describes the
   *studio*. Folding it behind the app picker needs either a third colour slot (**E10 forbids
   it** — "one picker, two slots, no third UI") or overloading "set the Fill colour" to
   sometimes mean "set the lamp", which is worse than the native input it replaces. Dropping
   it was explicitly disallowed. A key-light tint is realistically a choice among a handful of
   studio whites, and five buttons are touch-reachable on the iPad where an OS colour sheet
   is not. ⚠️ **If the owner dislikes the preset row, this is the decision to revisit** — the
   store field is unchanged, so a different control is a `ui/`-only change.


## W1 gate — verified by the coordinator, 2026-09-03

Run by the coordinator directly (not taken from subagent reports), from `client/`:

```
$ bunx tsc --noEmit
TSC_EXIT=0

$ bunx eslint .
✖ 65 problems (0 errors, 65 warnings)          # exactly the MASTER §4 baseline

$ bunx vitest run
 Test Files  145 passed (145)
      Tests  2755 passed (2755)               # baseline 2737 + 13 (task 01) + 5 (task 02)

$ bun run lint:boundaries
check-boundaries: OK — all 5 boundary rules hold.

$ git diff b682b61..HEAD -- client/src/stores/ui/UIStore.ts
(empty — wire format unchanged, 151 corpus digests intact)

$ find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
(empty)
```

**Diff scope:** exactly 4 files, matching the two `Touches` lists with nothing extra:
`PoseUIStore.ts`, `PoseUIStore.test.ts`, `poseMeshes.ts`, `poseMeshes.test.ts`
(+570 / −68). Boundary spot-check: `poseMeshes.ts` imports no store/MobX/services;
`three` remains `import type` only at module level.

## ⚠️ The zoom cap is only HALF fixed after W1

Task 01 removed `POSE_ZOOM_MAX` from the store, but **the owner will not see a bigger
model yet.** Two caps remain, by design and by plan sequencing:

1. **`PoseSection.tsx:317-322`** still hardcodes `min={0.1} max={10}` on the zoom slider,
   with a now-stale comment referencing the deleted constants. **Task 03 (W2) owns this.**
2. **Zoom is still folded into `fitCameraToMesh`'s padding** (E12), so the fit
   re-normalises it. **Task 06 (W4) owns this.**

Neither is a defect in task 01 — both files are outside its `Touches`. But W1 alone does
not satisfy the owner's first complaint, and no one should test zoom until W4 lands.


## W2 gate — verified by the coordinator, 2026-09-03

Run by the coordinator directly, from `client/`:

```
$ bunx tsc --noEmit
TSC_EXIT=0

$ bunx eslint .
✖ 65 problems (0 errors, 65 warnings)          # exactly the MASTER §4 baseline

$ bunx vitest run
 Test Files  146 passed (146)
      Tests  2818 passed (2818)               # W1 was 145/2755; +1 file, +63 tests

$ bun run lint:boundaries
check-boundaries: OK — all 5 boundary rules hold.

$ bunx stylelint "src/**/*.css"
✖ 70 problems (2 errors, 68 warnings)
  # The 2 errors are IDENTICAL to the baseline — verified by file:line, not just count:
  #   src/ui/components/OtherHand/OtherHand.css:338  scale-unlimited/declaration-strict-value
  #   src/ui/components/OtherHand/OtherHand.css:359  scale-unlimited/declaration-strict-value
  # Task 03 added ~90 lines of CSS and introduced ZERO new errors.

$ bunx storybook build
SB_EXIT=0                                      # storybook-static is gitignored; tree stays clean

$ git diff b682b61..HEAD -- client/src/stores/ui/UIStore.ts
(empty — wire format unchanged across the whole plan so far)

$ find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
(empty)
```

**Diff scope:** exactly 7 files (+1906 / −164) — the union of both `Touches` lists with
nothing extra. `git diff 7eb70f7..HEAD -- PoseUIStore.ts` is **empty**, confirming task 03
correctly stayed out of the store even though it needed `edgeWidth`.

## ⚠️ Task 06 MUST remove task 03's placeholder

`PixelStudioPanelContainer.tsx` carries a deliberate, clearly-marked stopgap because
`edgeWidth` does not exist on the store until task 06 adds it. **Four sites, all marked
`🚧 TEMPORARY`:**

| Line (approx) | What to remove |
| --- | --- |
| `:52` | `import { useState } from "react";` — only if nothing else uses it |
| `:91-107` | the `PLACEHOLDER_EDGE_WIDTH` constant and its doc comment |
| `:117` | `const [edgeWidth, setEdgeWidth] = useState(PLACEHOLDER_EDGE_WIDTH);` |
| `:195` | `edgeWidth,` → `pose.edgeWidth` |
| `:218` | `onSetEdgeWidth` → `pose.setEdgeWidth(width)` |

Everything else in the pose block is already fully wired to the store.


## W3 gate — verified by the coordinator, 2026-09-03

⚠️ **`tsc` is RED and that is the PLAN, not a failure** (MASTER §5). Task 05 owns the `ui/`
half of the framing deletion; task 06 owns the store/container half. W3's gate therefore
**excludes `tsc`** and requires instead: boundaries OK, task 05's suites pass, every part
proven non-empty, and the exact errors listed.

**The 3 `tsc` errors, verified by the coordinator to be confined to task-06-owned files:**

```
src/containers/CanvasContainer.tsx(282,3): error TS2305:
  Module '"../ui/canvas/pose/poseMeshes"' has no exported member 'getFramingBounds'.
src/containers/PixelStudioPanelContainer.tsx(201,50): error TS2345:
  Argument of type 'PoseMeshId' is not assignable to parameter of type 'PoseMeshId | null'.
  Type '"head"' is not assignable to type 'PoseMeshId | null'.
src/ui/components/PosePanel/PoseSection.tsx(73,3): error TS2305:
  Module '"../../canvas/pose/poseTypes"' has no exported member 'PoseFraming'.
TSC_EXIT=2
```

⚠️ **`PixelStudioPanelContainer.tsx:201` is NOT a framing error — it is union widening.**
The panel prop is still typed against the narrow union, so the wider `PoseMeshId` no longer
fits. Mirroring the union (E20) fixes it.

**Everything else, run by the coordinator from `client/`:**

```
$ bunx eslint .
✖ 65 problems (0 errors, 65 warnings)          # exactly the MASTER §4 baseline

$ bunx vitest run
 Test Files  146 passed (146)
      Tests  2857 passed (2857)               # W2 was 146/2818; +39 (task 05's suite 33 → 71)

$ bunx vitest run src/ui/canvas/pose/__tests__/poseMeshes.test.ts
 Test Files  1 passed (1)
      Tests  71 passed (71)

$ bun run lint:boundaries
check-boundaries: OK — all 5 boundary rules hold.

$ find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
(empty)
```

**Diff scope:** 3 files (+1154 / −332) — a *subset* of task 05's 5-file `Touches`.
`poseCamera.ts` and its test were correctly left alone (deviation 1 below).

**Asset integrity verified by the coordinator:**
`shasum -a 256 client/public/models/mannequin.gltf` →
`d936e4b7602147f05b4fe5a6d712eebf0a575be154e66834c9a9e0e0ebabef44` — **matches the recorded
hash exactly**, and `git diff b682b61..HEAD -- client/public/models/` is empty.

**E2 deletion verified:** no live export of `PoseFraming` / `MANNEQUIN_REGIONS` /
`getFramingBounds` remains anywhere under `ui/canvas/pose/`. `poseTypes.ts` mentions
`PoseFraming` only in prose explaining what was removed. The remaining code references are in
exactly the 3 task-06-owned files above.

## The part triangle counts — the number that mattered most

**Measured from the real vendored asset. No part is empty.** The coordinator confirmed these
are *asserted* in the suite (not merely computed), that non-emptiness carries a `> 100`
"not a sliver" guard, and that disjointness and totality are asserted separately:

| Part | Triangles | Normalised y | Normalised AX |
| --- | ---: | --- | --- |
| head | **336** | 0.838–0.996 | 0.004–0.048 |
| torso | **2,912** | 0.472–0.838 | 0.002–0.110 |
| arm | **1,062** | 0.761–0.815 | 0.105–0.395 |
| leg | **1,346** | 0.000–0.471 | 0.020–0.128 |
| hand | **3,980** | 0.775–0.795 | 0.396–0.500 |
| **sum** | **9,636** | = the whole mesh | **0 duplicates** |

The five parts are an **exact partition** — disjoint *and* total. Counts are pinned exactly,
so retuning a landmark for any reason cannot pass silently. This is the anti-regression for
pose-tool task 09's T-pose bug, which put Arm and Hand over **zero** vertices.

## The exact union text task 06 must mirror (E20)

From `poseTypes.ts`, **verbatim**:

```ts
export type PosePartId = "head" | "torso" | "arm" | "leg" | "hand";

export type PoseMeshId =
  | "cube"
  | "sphere"
  | "cylinder"
  | "mannequin"
  | PosePartId;
```

`"mannequin"` is the whole figure — what the rail labels **Full** and what the old
`PoseFraming` called `"full"`. The five part ids are spelled **identically to their old
framing names**, so a stale session value for a body part still resolves to the same body
part. Only `"full"` has no counterpart; a test asserts `isPosePartId("full")` is `false`.

## Segmentation rule

**By triangle, by centroid, exactly once.** The three positions are averaged into a centroid,
normalised once, and tested against `MANNEQUIN_LANDMARKS`. **A straddling triangle goes
wholly to the part its centroid falls in — never duplicated, never dropped.** Each cut edge
is therefore ragged by up to one triangle (sub-pixel at 32×32) and each part is open at the
cut, which `DoubleSide` already renders as surface.

⚠️ **Arm/hand are tested BEFORE the head/leg split**, because the arm bar (y 0.74–0.84)
straddles the neck line (0.838); testing head first would hand the outer shoulders to the
head. `torso` is the remainder, which makes the partition total by construction.


## W4 gate — verified by the coordinator, 2026-09-03

`tsc` is **GREEN again** — the hole task 05 deliberately left is closed.

```
$ cd client && bunx tsc --noEmit
TSC_EXIT=0                                      # all 3 W3 errors closed

$ bunx eslint .
✖ 65 problems (0 errors, 65 warnings)          # exactly the MASTER §4 baseline

$ bunx vitest run
 Test Files  146 passed (146)
      Tests  2866 passed (2866)                # W3 was 146/2857; +9 net

$ bun run lint:boundaries
check-boundaries: OK — all 5 boundary rules hold.

$ bunx stylelint "src/**/*.css"
✖ 70 problems (2 errors, 68 warnings)          # the same 2 baseline errors

$ bun run verify        (repo root — the plan's final gate)
VERIFY_EXIT=0
 Test Files  146 passed (146) / Tests 2866 passed (2866)
✓ built in 2.06s
```

**Data-safety checks, all run by the coordinator:**

```
$ git diff b682b61..HEAD -- client/src/stores/ui/UIStore.ts   → EMPTY   (wire format intact)
$ git status --short -- '*__snapshots__*'                     → EMPTY   (no snapshot changed)
$ git diff b682b61..HEAD --stat -- server/                    → EMPTY   (owner's data untouched)
$ find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules → EMPTY
```

**Diff scope:** the 7 `Touches` files + the one **pre-authorized** `ApplicationStore.ts`
stale-comment fix, committed separately as `0ebccce` exactly as instructed (+646 / −177).

**`PoseFraming` is gone from the entire repo** — verified independently by the coordinator:
`grep -rnE 'PoseFraming|MANNEQUIN_REGIONS|getFramingBounds|setFraming|onSelectFraming'`
over `client/src` and `server/src`, excluding comment lines → **no matches**.

**Bundle:** main **793.89 kB / 231.22 kB gz** (baseline 788.56 / 229.15 — **+5.33 kB,
+0.9%**). `three.module` (734.33 / 189.46 gz) and `GLTFLoader` (45.56 / 13.70 gz) are both
**still lazy chunks**; `three` is **not** in the main bundle. The coordinator confirmed this
in the `bun run verify` build output.

## ⭐ The real cause of the owner's headline complaint — found in W4, verified by the coordinator

**The cap was ≈1.12, not the `POSE_ZOOM_MAX = 10` everyone assumed.** Pose-tool task 08 folded
zoom into the fit's padding:

```ts
padding: 1 - (1 - DEFAULT_POSE_FIT_PADDING) * poseZoom,   // = 1 - 0.9 * zoom
```

`fitCameraToMesh` clamps padding to `[0, 0.95)`. The coordinator re-derived the arithmetic
independently:

| zoom | raw padding | clamped | model fills |
| ---: | ---: | ---: | ---: |
| 1.00 | 0.100 | 0.100 | 90.0% |
| 1.11 | 0.001 | 0.001 | 99.9% |
| **1.12** | −0.008 | **0.000** | **100.0%** |
| 10 | −8.000 | 0.000 | 100.0% |
| 100 | −89.00 | 0.000 | 100.0% |

**Every zoom from ≈1.12 upward framed identically at 100% fill.** This is why removing the
store clamp (task 01) and the slider cap (task 03) changed *nothing the owner could see* —
and it vindicates E12's insistence that unclamping was necessary but **not sufficient**.

**The fix — two explicit steps:**

```ts
// step 1: FIT, at a FIXED padding, at the CURRENT rotation
const fitted = fitCameraToMesh({ bounds: UNIT_BOUNDS, …, padding: DEFAULT_POSE_FIT_PADDING });
// step 2: ZOOM, as a free multiplier over the fitted frame
const params = scaleCameraParams(fitted, poseZoom);
```

`scaleCameraParams` is a new pure function returning a **new** object, scaling the **frustum**
— never the model, never the camera distance:

- **orthographic** — divides `left/right/top/bottom` by `zoom`. A dolly would change only
  clipping, not size; `near`/`far` stay untouched and still bracket a smaller frustum.
- **perspective** — `atan(tan(fov/2) / zoom) * 2`. **`tan`, not the angle**, because screen
  size is proportional to `tan(fov/2)` — halving the angle does *not* double the model.
  Clamped to a legal FOV purely as a degeneracy guard (the 1e-4° end is ~10⁶× the fitted
  size, so it is not a cap).
- Non-finite, non-positive, and `zoom === 1` return `params` unchanged.

Linear and unbounded: **zoom 100 → the model fills 9,000% of the shorter axis.**
**Fit resets neither zoom nor pan** (E15) — the effect writes neither; pan is not mentioned
in it at all. `fitGeneration` is a dependency, and its monotonicity makes two presses
idempotent.

## Deviations

**W1 — task 01 (both within latitude the spec explicitly delegated; accepted):**

1. **`POSE_ZOOM_MIN` renamed to `POSE_ZOOM_MIN_SAFE`, value `0.1` → `1e-3`.** The spec
   suggested the rename. The value changed because `0.1` was chosen as a *range endpoint*
   and would have kept acting as a real limit; `1e-3` sits far below any useful view, so it
   is a safety floor as E11 requires rather than a cap by another name.
2. **`clear()` deliberately does NOT reset `fitGeneration`.** The spec left this to the
   executor ("`fitGeneration` behaviour is defined"). It is a monotonic event counter read
   by a reaction; rewinding it to 0 is itself a change and would fire a spurious fit at the
   moment the mesh unloads. Pinned by a test. **Task 06 may rely on monotonicity.**

**W1 — task 02:**

3. **`flatShading` is passed as an exported constant `POSE_MATERIAL_FLAT_SHADING = false`**
   rather than a literal. Forced by step 7's guard-test requirement: the suite constructs no
   three objects (jsdom has no WebGL), so the value had to be assertable as a constant. The
   constant carries a comment warning against inlining it.

**W2 — task 03:**

4. **Edge width is 0–4 with `0` = "no outline", not a separate toggle.** E4 allowed either.
   Chosen because one control cannot disagree with itself (a toggle + slider can be "on" at
   width 0), and dragging to the left end is the fastest off/on. The readout shows **"Off"**
   at 0 and **"N px"** otherwise. `step={1}` plus `Math.round()` on read and write.
   ⚠️ **Task 06 must match: range 0–4 integer, default 0.** A non-zero store default would
   put an outline on every existing project unbidden.
5. **A zoom number box was added, which the spec did not ask for.** An `<input type="range">`
   needs finite ends, so removing `max={10}` alone would only move the cap to another number.
   Task 03 widened the slider *travel* to `POSE_ZOOM_SLIDER_MAX = 40` (documented as an
   affordance, **explicitly not a limit**) **and** added an uncapped `<input type="number">`
   beside it with **no `max` attribute**. Above the slider travel the thumb parks at the end
   while the number box shows the true value. It rejects empty/unparseable input rather than
   sending `0` — an `<input type=number>` sanitizes garbage to `""`, and `Number("")` is `0`,
   not `NaN`, so a naive `Number.isFinite` guard would collapse the camera mid-keystroke.
6. **The light-tint preset row is a new control shape**, not "keep it as it is" — but "as it
   is" was a native `<input type="color">`, which the definition of done forbids. See the
   closed open question 2 above.
7. **`vi.clearAllMocks()` does not reset Storybook's `fn()` spies** (measured). The four
   stories share one `handlers` object, so spies accumulate across stories. Tests needing
   "was not called" compare call counts before/after. A pre-existing property of the stories
   file that task 03's stricter assertions exposed.

**W2 — task 04:**

8. **`applyOutline` mutates in place and returns the same reference.** It runs per frame and
   the caller owns a fresh readback buffer whose only consumer is the overlay write, so there
   is no aliasing hazard; a copy would allocate every frame for nothing. `rgba.slice()` lets a
   caller opt in.
9. **Chebyshev (square) kernel.** At 1–4 px there are not enough pixels for a curve — a
   Euclidean kernel reads as a *notched* square rather than a soft one, and Chebyshev needs
   no rounding rule at the boundary (`dx=2,dy=1` is 2.236) and falls out of the clamped box
   scan for free.
10. **Holes inside the shape ARE outlined** on their inner edge. The rule is purely local;
    distinguishing inside from outside would need a flood fill plus a decision about holes
    touching the border. Pinned by a test.
11. **⚠️ `applyOutline` is NOT idempotent, and must be applied at most once per buffer.**
    Task 04's first draft claimed self-growth was impossible; it **measured otherwise** and
    corrected the header rather than papering over it: *applying width 1 twice equals width 2
    once*. Within one call a snapshot of the original alpha guarantees an exact ring, but
    **across** calls the painted outline is alpha-255 and the next call reads it as model.
    Not a live hazard (each frame reads back fresh), but it would surface as "the slider is
    one notch too thick" if a buffer were ever cached. **Task 06: call it exactly once per
    rendered buffer.**

**W3 — task 05:**

12. **`poseCamera.ts` / `poseCamera.test.ts` were NOT modified**, though they are in the
    `Touches` list. They contain **no framing code** — `fitCameraToMesh` takes `bounds`
    directly and no framing parameter was ever threaded through; the only "framing"
    occurrences are three prose uses of the ordinary camera sense. Editing them would have
    been change for its own sake. **Coordinator confirms:** W3's diff is 3 files, a subset
    of the 5-file `Touches`. Under-reaching scope is not a violation.
13. **Arm/hand/leg each cover BOTH sides.** `AX = |x - 0.5|`, so "arm" is both arms. This
    satisfies **E1's "no left/right variants"** by not offering the choice, and is what makes
    the exact partition possible. A one-sided cut was measured as viable (arm 531, hand
    1,990, leg 673 — also non-empty) but discards half the mesh and loses the partition.
14. **⚠️ An `armYMin`/`armYMax` band was ADDED beyond the recorded landmarks, and it is
    load-bearing.** Without it, `AX >= 0.105` also catches the **feet**, which splay to
    AX 0.128 — measured: the arm silently acquires two feet and the leg loses them
    (leg 876 / arm 1,538 without the band, versus leg 1,346 / arm 1,062 with it). Pinned by
    a test named "does NOT call a splayed foot an arm". This is a *new* instance of exactly
    the class of bug task 09 hit, caught by measurement rather than by eye.
15. **A `normalize` parameter was added to `loadMannequin`.** A part must be segmented on the
    **raw** scene, because `normalizeToUnitBox` writes to the transform and leaves vertex
    buffers in asset units. `buildPartMesh` passes `false`; every other caller takes the
    default, so no existing caller changes.
16. **Part geometry is non-indexed.** An indexed part would need every index renumbered and
    unreferenced vertices pruned — a mistake there is exactly the dangling-index hole this
    task exists to avoid. Cost is duplicated shared vertices across a few thousand triangles.
17. **Boundary probes use `±1e-9` rather than exact-on-the-line.** Two first-draft tests
    failed; the agent **measured rather than adjusted the code** and found the test helper's
    fraction→units→fraction round trip is not exact in IEEE 754 (`0.472` returns as
    `0.47199999999999986`). That is a property of floating point, not of the segmentation.
    **The implementation was not changed to accommodate a test** — the right call.
18. **`buildGeometry`'s parameter was narrowed** to a new exported `PosePrimitiveId`, so
    `buildGeometry(three, "head")` is a compile error rather than falling out of the switch
    as `undefined`.

**Smooth normals (task 02) survive on parts — verified.** `buildPartGeometry` **copies the
source `NORMAL` attribute** triangle by triangle (transformed by the node's normal matrix).
`computeVertexNormals()` is a **fallback only**, for a source carrying no normals at all —
deliberate, because on a *non-indexed* geometry it assigns each vertex its own face normal
and would **silently reintroduce exactly the flat faceting task 02 removed**. A test asserts
the asset really does carry `NORMAL` accessors, so swapping in one without them is loud
rather than quietly flat. Task 02's segment counts and `POSE_MATERIAL_FLAT_SHADING = false`
are untouched and its pinning tests are carried forward verbatim.

**W4 — task 06:**

19. **`PoseSection.tsx` imports `MANNEQUIN_PART_ORDER` from `poseMeshes.ts`** rather than
    re-declaring the six labels — what MASTER §8 asks for ("part ids exactly as task 05
    reports them"), the same anti-drift device the viewpoint table already uses.
    ⚠️ **Cost: it pulls `poseMeshes.ts` (~900 lines of pure JS) into the main bundle — the
    +5.33 kB.** `three` is `import type` only there and `GLTFLoader` is dynamic, so nothing
    heavy follows. **A bundle-conscious follow-up could invert this by moving
    `MANNEQUIN_PART_ORDER` into `poseTypes.ts`.**
20. **The Model row offers three primitives, not four.** `"mannequin"` moved to the new
    Mannequin row as its **Full** button, beside the five parts.
21. **`setMesh` deliberately KEEPS `edgeWidth`.** It is an outline preference, not a property
    of the mesh; snapping it to Off on every part button would make comparing two parts at the
    same thickness impossible. Pinned by a test.
22. **⚠️ `pose.modelColor` is now DEAD STATE.** The container reads
    `ui.tool.fillColorOrSelected` instead (E8). Task 06 kept the field, its action and its
    `clear()` line rather than removing them — deleting an `observableRef` field is a
    store-shape change with its own risk. Documented in the store header with a "do not wire
    a new reader to it" warning. **Flagged for task 07 as an optional cleanup.**
23. **`poseModelColor`/`poseEdgeColor` are `useMemo`'d on their four channels.** A fresh
    literal per render would re-materialise the mesh on every unrelated re-render of this
    5,300-line container. Not a `useState`, not on a pointer path — **D11 holds.**
24. **One deliberately redundant assertion** in the part-order DOM test (derived list *and*
    literal list): the derived form catches drift, the literal form catches both sides
    drifting together.

**Guard added against the unverified GPU ground (as the task asked).** The `applyOutline`
call site states explicitly that it touches **only the colour read-back**, and that the depth
and normal passes render their own frames with their own materials and are unreachable from
it — so the outline **cannot perturb the never-GPU-verified depth-derived heights**.
⚠️ That is still *reasoning, not observation*.

**W1 — process incident (task 02, disclosed by the agent, independently verified by the
coordinator):** the agent ran `git stash push`/`pop` on its own two files; the pop resolved
against a **pre-existing unrelated stash** from `feat/03-reflection-tool` and left conflict
markers in 5 files it did not own (`LightingCanvasContainer.tsx`, `ApplicationStore.ts`,
`coords.ts`, `CanvasSurface.tsx`, `CanvasSurface.stories.tsx`). The agent caught it and
restored all 5 with `git checkout --force HEAD --`.

**Coordinator verification of the recovery (not taken on trust):**
- `grep -rnE '^(<{7}|>{7}|={7})' client/src` → **no matches**; no conflict markers remain.
- `git diff b682b61..HEAD -- <the 5 files>` → **empty**; all 5 are byte-identical to their
  pre-wave state.
- `git stash list` → **both original stashes intact** (`feat/03-reflection-tool`, `main`).
- Final `git status --short` → **clean**.

No trace remains. ⚠️ **Lesson for later waves: agents must not use `git stash` in this repo**
— it has pre-existing stashes and a pop can resolve against the wrong one. Future dispatches
say so explicitly.

**W2 — process incident (a COMMIT RACE between the two parallel agents, both disclosed,
fully recovered, verified by the coordinator).** Neither agent used `git stash` — the W1
lesson held. The two agents interleaved `git add` and `git commit`:

- Task 03's `git add` + separate `git commit` produced a commit containing **only task 04's
  two untracked files** and none of its own, because task 04 staged and reset the index
  between those two commands. Task 03 recovered with `git reset --soft HEAD~1` + `git reset`,
  then re-committed atomically with `git commit --only <five explicit paths>`.
- Task 04's subsequent `--amend` consequently landed on the **HANDOFF commit `7eb70f7`** and
  squashed it. It recovered via `git reset --soft 7eb70f7` from the reflog.

**Coordinator verification (not taken on trust):**
- `git log` → all 7 commits present and correctly ordered.
- `git show 7eb70f7 --stat` → **intact**, original message, original 4-insertion/4-deletion stat.
- `git show 868424f --stat` → exactly task 03's **5** `Touches` files.
- `git show b5ece14 --stat` → exactly task 04's **2** new files. **No cross-contamination.**
- `grep -rnE '^(<{7}|>{7}|={7})' client/src` → no conflict markers.
- `git worktree list` → only the main tree (task 04's temporary probe worktree was pruned).
- `git stash list` → both pre-existing stashes intact. `git status` → clean.

⚠️ **Lesson for W3+ (single-task waves, so the race cannot recur — but it will if a future
plan parallelises again): `git add` followed by a separate `git commit` is NOT safe in a
shared worktree. Use `git commit --only <explicit paths>`.**


## Blocked items

(none yet)

## Manual check results

> ⚠️ **ALL THE PER-TASK LISTS IN THIS SECTION ARE SUPERSEDED by §7.7**, the one
> consolidated, de-duplicated, risk-ordered checklist built by task 07. They are **kept for
> provenance only** — do not work through them separately, and do not count them twice.
> **§7.7 is the list to take to the keyboard.**

**W1 — task 01: none required, none skipped.** Pure store logic with no UI surface yet;
the spec says so explicitly and the coordinator confirms it. Everything in its definition
of done is covered by automated tests.

**W1 — task 02: all 5 OWED, none performed.** The agent had no browser and no GPU:

1. A sphere shades as a **smooth gradient**, not a ring of flat facets.
2. Its silhouette reads as **round, not polygonal**, at 32×32.
3. The cylinder's curved side shades smoothly around its circumference.
4. Dragging the light orb sweeps the gradient **continuously, with no banding**.
5. ⚠️ **Highest value — E18:** a stamp taken after this change writes **smoothly varying**
   normals. Open the lighting studio and confirm stamped pixels shade like a curved
   surface, not a faceted one. This is the check that proves the change reached the stamp.

⚠️ **E18 — stamped normals now differ from pre-change stamps.** The normal pass writes
interpolated rather than faceted normals. This is **intended** and is the point of task 02,
but a stamp taken after this change will not match one taken before it on the same mesh at
the same rotation. The owner must know.

**W2 — task 03: all 8 OWED, none performed.** No browser, no GPU, no device:

1. The rail shows Fill and Edge swatches matching the main picker's colours.
2. Clicking the model swatch switches the picker to its **Fill** tab; changing the colour
   there recolours the model.
3. Clicking the outline swatch switches to **Edge**; changing it recolours the outline
   (needs task 06's render).
4. A project saved **before** the fill/edge split shows a sensible model colour via the
   `fillColorOrSelected` fallback. ⚠️ **Do not test this by editing a real project file.**
5. The Fit button re-frames at the current rotation (needs task 06).
6. The thickness slider moves in whole steps and its extremes look right.
7. ⚠️ **Highest risk of the eight — rail layout at 240 px.** The Colours group, the
   five-button tint row and the zoom number box are all new width consumers in a 240 px
   rail. The Storybook decorator mounts at exactly 240 px, so this one is at least
   *reviewable* without the app.
8. ⚠️ **Touch/iPad.** The two new sliders have **no `touch-action: none`** — `DirectionOrb`
   needed that line to stop the rail stealing finger drags. Whether a native
   `<input type="range">` needs the same is **untested, and is the most likely iPad defect.**

**W2 — task 04: none required, none skipped.** Deliberately pure so it needs none; the
visual result is verified in task 06 once wired. The coordinator confirms the module imports
only a type.

**W3 — task 05: all 5 OWED, none performed.** No browser, no GPU:

1. Each part button loads only that part, centred and fitted.
2. ⚠️ **Highest risk of the five** — the head looks like a head, the arm like an arm. **The
   T-pose makes "arm" a horizontal bar reaching to BOTH sides**; confirm that reads correctly
   when framed alone. The segmentation is proven correct *numerically*, but **nobody has
   looked at it.**
3. A part rotates, lights, pans and stamps exactly like a primitive.
4. Parts still shade smoothly (task 02 not undone) — the normal-copying path is reasoned and
   tested for *presence*, but never rendered.
5. "Full" still loads the whole mannequin.

⚠️ **Checks 1–4 cannot be exercised at all until task 06 lands**, since the container half of
the wiring does not yet exist.

**W4 — task 06: all 15 OWED, none performed.** No browser, no GPU, no device:

1. ⚠️ **HIGHEST VALUE — zoom past the old cap.** The model can be made much larger than the
   canvas and keeps going, nothing clamping it. **This is the owner's headline complaint, and
   the fix is arithmetic that has never been rendered.**
2. **Pan fully off canvas** in every direction; the model may leave entirely.
3. **Fit to canvas** re-frames at the *current* rotation without resetting zoom or pan; two
   presses idempotent.
4. **Initial load still auto-fits** with padding — the behaviour the owner liked.
5. **Resize the object** — the render target follows and the model re-fits.
6. Model colour follows **Fill**; changing Fill in the main picker recolours it live.
7. Outline colour follows **Edge**.
8. Thickness slider 1→4 gives a visibly thicker, **hard-edged** outline with no soft
   fringing; 0 removes it.
9. The outline hugs the silhouette exactly — no gap, no overlap onto the model.
10. **Each part button** (Head/Torso/Arm/Leg/Hand/Full) loads that part alone, centred.
11. A part rotates/lights/pans/stamps like a primitive.
12. Smooth shading visible on sphere, cylinder and the mannequin parts.
13. **Stamp** — still one undo entry, and the outline is **absent** from it (the documented
    decision above).
14. **Touch/iPad** — pan and double-tap still work; the sliders are usable; the rail does not
    scroll while dragging.
15. **WebGL** — switch tools and meshes ~20× with no `Too many active WebGL contexts`.

These compound with the **30 still-unperformed checks from `docs/06-pose-tool/`**, including
the GPU depth-derived heights that share the readback path this plan adds the outline to.
**Running total owed by this plan: 33** (5 + 8 + 5 + 15), plus plan 06's 30.

✅ **DONE by task 07: both lists are merged in §7.7** — 63 raw checks de-duplicated to **41
distinct**, ordered into four risk tiers. **Everything above this line is superseded by it.**

## Notes for the next session

> ⚠️ **HISTORICAL — written at the end of W1.** All five waves have since landed. **The
> current forward-looking note is §7.13, at the very bottom of this file.** Kept for
> provenance.

**W1 landed clean; W2 is next (tasks 03 + 04, two agents in parallel).**

Facts W2 executors need, established by W1:

- **Task 03 must delete the zoom slider's hardcoded `max={10}`** at `PoseSection.tsx:317-322`
  and the stale comment above it that references the now-deleted `POSE_ZOOM_MIN/MAX`. This
  is one of the two remaining caps on the owner's first complaint.
- **The store seam task 03 wires to is exactly:** `fitGeneration = 0` (observable),
  `requestFit(): void` (action, no args, mutates nothing else),
  `setZoom(zoom: number): void` (unbounded above, floored at `POSE_ZOOM_MIN_SAFE = 1e-3`).
  Panel callback name is `onRequestFit` per MASTER §8.
- **`POSE_ZOOM_MAX` no longer exists** — anything importing it will not compile.
- **Agents must NOT use `git stash`** in this repo (see the W1 process incident above).

---

# W5 — Task 07: full gate, QA sweep, handoff (2026-09-03)

**Status: `PARTIAL`** — the tree is gate-green and every automatable claim is verified, but
**not one visual, gesture or GPU behaviour has been observed by anybody**, across either
plan. That is the honest outcome, and §7.6 below is the reason this task exists.

Run against the settled tree at `35627cd`, worktree **clean**, branch `feat/07-pose-refinements`.
No application code was changed by this task. `format:check` passed, so **nothing was
reformatted** either.

## 7.1 The real root gate — `bun run verify` → **exit 0**

Actual terminal output, elided only where a 172,000-line log repeats itself:

```
$ bun run verify
$ bun run typecheck && bun run lint && bun run format:check && bun run test && bun run build

$ bun run --cwd client typecheck && bun run --cwd server typecheck
$ tsc --noEmit          (client — clean, no output)
$ tsc --noEmit          (server — clean, no output)

$ bun run --cwd client lint && bun run --cwd server lint
$ eslint .
✖ 65 problems (0 errors, 65 warnings)
  0 errors and 1 warning potentially fixable with the `--fix` option.
$ eslint .              (server — clean, no output)

$ bunx prettier --check "*.{json,md,yaml,yml}" "client/*.{ts,js,json}" "server/*.{ts,js,json}" "client/src/types/**/*.{ts,tsx}"
Checking formatting...
All matched files use Prettier code style!

$ bun run --cwd client test
$ vitest run
 RUN  v3.2.7 /Users/diniden/Desktop/self/pixel-art/client
 Test Files  146 passed (146)
      Tests  2866 passed (2866)
   Duration  69.09s (transform 3.05s, setup 15.57s, collect 11.91s, tests 123.91s,
                     environment 25.70s, prepare 7.63s)

$ cd client && bun run build
$ tsc --noEmit && vite build
vite v7.3.6 building client environment for production...
✓ 2041 modules transformed.
dist/index.html                         0.76 kB │ gzip:   0.42 kB
dist/assets/index-NAWcuvlU.css        217.99 kB │ gzip:  27.63 kB
dist/assets/GLTFLoader--NCVAYW2.js     45.56 kB │ gzip:  13.70 kB
dist/assets/three.module-PDSP0dbZ.js  734.33 kB │ gzip: 189.46 kB
dist/assets/index-xjY-C2eP.js         793.89 kB │ gzip: 231.22 kB
✓ built in 2.03s

=== VERIFY EXIT CODE: 0 ===
```

**eslint is at exactly the MASTER §4 baseline** — 0 errors, 65 warnings. The test count is
**2866**, up **+129** from the planning baseline's 2737, across **+1** file.

**`format:check` PASSED with no changes needed — nothing was reformatted and no formatting
commit was made.** ⚠️ Note honestly that the root prettier glob covers only
`*.{json,md,yaml,yml}`, `client/*`, `server/*` and `client/src/types/**`. **Every file this
plan touched is outside that glob.** `format:check` therefore passed on a narrower set than
"everything this plan wrote". That is the repo's pre-existing configuration; per the task
spec it was **flagged, not widened**.

## 7.2 The individual client gates

```
$ cd client && bunx stylelint "src/**/*.css"
✖ 70 problems (2 errors, 68 warnings)
  2 errors potentially fixable with the "--fix" option.

  # EXACTLY 2 ERRORS — identified by file:line, not just counted:
  #   src/ui/components/OtherHand/OtherHand.css:338:3  scale-unlimited/declaration-strict-value
  #   src/ui/components/OtherHand/OtherHand.css:359:3  scale-unlimited/declaration-strict-value
  # Both are `border-radius: 22px` (read from source to confirm), both PRE-EXISTING.
  # Task 03 added ~90 lines of CSS and introduced ZERO new errors.

$ cd client && bun run lint:boundaries
$ bun scripts/check-boundaries.mjs
check-boundaries: OK — all 5 boundary rules hold.

$ cd client && bunx storybook build
SB_EXIT=0
storybook-static/assets/iframe-C6933QGi.js   1,541.95 kB │ gzip: 442.97 kB
✓ built in 5.76s
info => Output directory: client/storybook-static      (gitignored; tree stayed clean)
```

`tsc`, `eslint` and `vitest` are not repeated — the root gate above runs the identical
commands and its real output is pasted in full.

## 7.3 Data-safety invariants — all hold

```
$ git diff b682b61..HEAD -- client/src/stores/ui/UIStore.ts   → EMPTY (0 bytes)
$ git status --short -- '*__snapshots__*' '*.snap'            → EMPTY (0 bytes)
$ git diff b682b61..HEAD --stat -- server/                    → EMPTY (0 bytes)
$ find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules → EMPTY
$ git status --short                                          → EMPTY (tree clean)
$ grep -in 'pose' client/src/stores/ui/UIStore.ts             → only `proposed`/`dispose`
                                                                 substrings; NO pose key
```

**The `UIStore.ts` line is the strongest single proof in this plan.** The file has **no diff
at all** across the entire refinement, so `toPersistedUIState()` provably gained no key, the
wire format is unchanged, and the **151 corpus digests could not have shifted.** It is a
structural guarantee, not a passing assertion.

**Corpus and migration snapshots pass UNCHANGED**, from the real vitest run above — all 8
backup files digest-frozen *and* round-trip stable, plus the count assertion:

```
✓ corpus golden digests — the real regression gate > backup-01-31-2026.json: the migration
    pipeline is a no-op and the result digest is frozen                             8662ms
✓ … 7 more backup files, each digest-frozen …
✓ corpus golden digests > the corpus carries exactly 149 backup snapshots plus 2 standalone
    projects                                                                          752ms
✓ corpus golden digests > backup-01-31-2026.json: round-trip stability holds for every
    snapshot in the file                                                            13540ms
✓ … 7 more round-trip files … + base-unit.json                                       336ms
```

**Snapshots were never updated — the forbidden update flag was never passed to vitest.** The
lockfile sweep was repeated after **every** `bunx` invocation in this task (stylelint ×3,
storybook) and came back empty every time.

## 7.4 Bundle — measured, with a positive control

Measured from the **freshly built artefacts** of the `bun run verify` run above.

| Chunk | Baseline (end of plan 06) | Now (`35627cd`) | Δ |
| --- | --- | --- | --- |
| **main entry** `index-*.js` | 788.56 kB / 229.15 kB gz | **793.89 kB / 231.22 kB gz** | **+5.33 kB / +2.07 kB gz (+0.9%)** |
| CSS `index-*.css` | 217.15 kB / 27.55 kB gz | 217.99 kB / 27.63 kB gz | +0.84 kB / +0.08 kB gz |
| `three.module-*.js` (lazy) | 734.33 kB / 189.46 kB gz | **734.33 kB / 189.46 kB gz** | **unchanged** |
| `GLTFLoader-*.js` (lazy) | 45.56 kB / 13.70 kB gz | **45.56 kB / 13.70 kB gz** | **unchanged** |

**The +5.33 kB is confirmed and explained**, exactly as deviation 19 predicted:
`PoseSection.tsx:71` imports `MANNEQUIN_PART_ORDER` from `poseMeshes.ts`, which pulls that
~900-line pure-JS module into the main bundle. `three` is `import type`-only there and
`GLTFLoader` is dynamic, so nothing heavy follows it. Task 02's raised segment counts cost
**nothing** — they are numbers. The CSS growth is task 03's ~90 lines of rail styling.

**`three` has NOT leaked into the main bundle — proven by grep, WITH A POSITIVE CONTROL.**
A grep finding 0 proves nothing unless the same grep can find something, so both columns are
shown:

| Identifier | main `index-xjY-C2eP.js` | `three.module-PDSP0dbZ.js` (lazy) |
| --- | ---: | ---: |
| `BufferGeometry` | **1** ⚠️ | **26** |
| `THREE.WebGLProgram` | **0** | **1** |
| `ShaderMaterial` | **0** | **20** |
| `WebGLRenderer` | 1 | 39 |
| `WebGLRenderTarget` | 1 | 6 |
| `MeshNormalMaterial` | 1 | 6 |
| `MeshLambertMaterial` | 1 | 16 |
| `PerspectiveCamera` | 4 | 7 |

**Every one of the main-bundle hits was read in context, and every one is a property access
on the dynamically-imported namespace — not inlined library source:**

```
const g=new n.BufferGeometry;return g.setAttribute("position",…   ← `n` = the imported ns
this.renderer=new e.WebGLRenderer({antialias:!1,alpha:!0,…        ← `e` = the imported ns
this.target=new this.three.WebGLRenderTarget(s,r,{minFilter:this.three.NearestFilter,…
Ae=new F.MeshNormalMaterial({flatShading:!0,side:F.DoubleSide})
return new n.CylinderGeometry(.5,.5,1,HO,BO) … new n.MeshLambertMaterial({color:new n.Color(…
```

⚠️ **One honest difference from plan 06's measurement, recorded rather than smoothed over:**
plan 06 reported `BufferGeometry` **0** in main; it is now **1**. The new hit is
`new n.BufferGeometry` inside task 05's `buildPartGeometry` — the part-segmentation code
that deviation 19 dragged into the main chunk. It is a *namespace property access*, not
library source, so **D2 still holds**. Two further confirmations:

```
$ grep -o 'import("\./[a-zA-Z0-9._-]*\.js")' index-xjY-C2eP.js | sort -u
import("./GLTFLoader--NCVAYW2.js")
import("./three.module-PDSP0dbZ.js")      ← both split points intact; three is still lazy

$ grep -c "three/src\|Three.js\|__THREE__\|REVISION" index-xjY-C2eP.js  → 0
  (positive control: REVISION appears 1× in the three chunk)
```

## 7.5 The framing machinery is gone — proven

```
$ grep -rn "PoseFraming\|MANNEQUIN_REGIONS\|getFramingBounds" client/src
$ grep -rnE "PoseFraming|MANNEQUIN_REGIONS|getFramingBounds|setFraming|onSelectFraming" \
    --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=docs --exclude-dir=dist .
```

**CODE references: ZERO, repo-wide.** All 10 surviving textual matches are one of:

- **prose comments** explaining what was removed (`poseTypes.ts:38/39/61`,
  `PoseUIStore.ts:83/97`, `PoseUIStore.test.ts:143`, `PixelStudioPanelContainer.tsx:178`);
- **negative assertions in a test** — `PoseSection.dom.test.tsx:265/266` assert the props
  `onSelectFraming` and `framing` are *absent*. Those are the anti-regression, not a leak.

**Stale prose reported, not fixed** (per the task's constraint — these are outside this
task's documentation-only `Touches` and are cosmetic, so they are **recorded, not patched**):

| File:line | The stale text | Why it is stale |
| --- | --- | --- |
| `poseEngine.ts:205` | "A placeholder perspective camera. **Task 06 owns** the presets, framing and auto-fit; this exists only so the engine can render something at all." | Task 06 has **landed**. The comment reads as if the work is still pending. The *code* is correct — the container really does install the camera — only the tense is wrong. |
| `poseEngine.ts:266` | "Placeholder only — **task 06 replaces** the framing entirely." | Same: task 06 already did. |

Neither is a defect and neither misleads about behaviour, only about *when*. A future editor
should rewrite them in the past tense. **Deliberately left alone by this task.**

Checked and found **CORRECT, needing no change**: `ApplicationStore.ts:424` (already fixed in
`0ebccce`), `railVisibility.ts:14` (uses "framing" in the ordinary English sense, nothing to
do with the pose feature), `poseCamera.ts` ×3 and `CanvasContainer.tsx` ×4 (all the ordinary
*camera* sense of framing, which is correct usage).

## 7.6 ⚠️ What was actually verified, and what was not

**Read this before reading §7.7.** This task had **no browser, no GPU and no device** — the
same wall every agent in both plans hit. jsdom has no WebGL.

**0 of the visual, gesture and GL behaviours were observed.** What could be done headlessly
was done: the arithmetic and structure underlying the highest-risk claims were **re-derived
independently from source**, rather than taken from the previous agents' reports. That is
**evidence about the code. It is not evidence about the picture.** A green gate proves the
code compiles, lints, tests and builds; it proves nothing whatsoever about what appears on
screen.

**Re-derived independently by this task (✅ = the code claim checks out):**

| Claim | Result |
| --- | --- |
| `POSE_ZOOM_MAX` is deleted | ✅ Zero code references repo-wide; 7 surviving mentions are all comments explaining the deletion. |
| Zoom is no longer folded into the fit's padding (E12) | ✅ `CanvasContainer.tsx:2841` now passes the **fixed constant** `padding: DEFAULT_POSE_FIT_PADDING` (`= 0.1`, `:376`), and `:2845` applies `scaleCameraParams(fitted, poseZoom)` **afterwards**. The two steps really are separated. |
| Zoom is unbounded in practice, not merely unclamped | ✅ **Re-derived numerically.** Orthographic divides the frustum by `zoom` — exactly linear, unbounded (zoom 1e8 → 1e8× magnification). Perspective's `atan(tan(fov/2)/zoom)` is linear to **~474,000× magnification** before the `1e-4°` degeneracy guard bites. That guard is **not a practical cap.** |
| Pan is never clamped (E13) | ✅ `PoseUIStore.setPan` (`:470`) and `nudgePan` (`:481`) both do wholesale replacement with **no bound on either axis**, with comments saying "do not add one". |
| The outline is applied exactly once per buffer (deviation 11) | ✅ Exactly **one** live `applyOutline` call site (`CanvasContainer.tsx:2518`), guarded by an "EXACTLY ONCE — deliberately NOT idempotent" comment at `:2499`. |
| The outline is NOT stamped (E7) | ✅ `poseStamp` does not import or call `applyOutline`; the only call site is on the overlay blit path. |
| `pose.modelColor` is dead state (deviation 22) | ✅ Confirmed: the container reads `tool.fillColorOrSelected` (`PixelStudioPanelContainer.tsx:163`); nothing reads `pose.modelColor`. The field, its action and its `clear()` line remain. |
| The +5.33 kB is `MANNEQUIN_PART_ORDER` (deviation 19) | ✅ `PoseSection.tsx:71` imports it from `poseMeshes.ts`. Confirmed in the built artefact. |
| ⚠️ **The new sliders have no `touch-action: none`** | ✅ **CONFIRMED — and it is a real, unresolved iPad risk.** The *only* `touch-action: none` in `PosePanel.css` is at `:257`, on `.direction-orb__sphere`. `.pose-panel__slider` (`:187`) has none. See Tier 1 check 6. |

**Everything about how it LOOKS and how it FEELS is unobserved.** §7.7 is that list.

## 7.7 ⚠️ THE ONE CONSOLIDATED CHECKLIST FOR THE OWNER

This merges **this plan's 33 owed checks** (task 02: 5, task 03: 8, task 05: 5, task 06: 15)
with **plan 06's 30** (`docs/06-pose-tool/HANDOFF.md` §7), de-duplicated and re-ordered by
risk. **63 raw → 41 distinct checks**, because 22 were genuine duplicates or were subsumed
(smooth shading appeared in both task 02's and task 06's lists; the WebGL leak, the iPad
gestures, the stamp-undo check and the mannequin-part checks each appeared in both plans).

⚠️ **All of the per-plan lists above are SUPERSEDED by this section** — they are kept above
only for provenance. **Nobody has performed any of these.** No agent in *either* plan had a
browser, a GPU or a device.

### 🔴 Tier 1 — start here. The plan exists because of #1 and #2.

| # | Check | Why it leads |
| --- | --- | --- |
| **1** | **Zoom the model far past the old cap.** It should keep growing, much larger than the canvas, with nothing clamping it. | ⭐ **THE OWNER'S HEADLINE COMPLAINT, and the fix is arithmetic that has NEVER BEEN RENDERED.** The real cap was **≈1.12**, not the `POSE_ZOOM_MAX = 10` everyone assumed — every zoom above it framed identically at 100% fill. Removing the store clamp *and* the slider cap changed nothing visible; only W4's `scaleCameraParams` split does. If any single thing in this plan is broken, it is most likely here. |
| **2** | **Pan the model entirely OFF the canvas**, in every direction, and drag it back. It may leave completely. | The other half of the headline complaint. `setPan`/`nudgePan` are provably unclamped in source, but no one has dragged one. |
| **3** | **Press Fit to canvas** after rotating and zooming: it re-frames at the **current** rotation and **does not reset zoom or pan**. Press it twice — the second press does nothing new. | E15 + E14. The counter-not-boolean design makes two presses two events; the "doesn't reset zoom/pan" half is the part that is easy to get subtly wrong. |
| **4** | **Initial load still auto-fits with padding** — the behaviour the owner explicitly liked and asked to keep. | A regression here would trade one complaint for another. |
| **5** | ⚠️ **WebGL context leak.** Select Pose, then switch tools ~20× and change meshes ~20×. Watch the console for `Too many active WebGL contexts`. | **STILL NEVER TESTED, across BOTH plans.** Browsers cap contexts at ~16; exhausting them crashes the tab. Argued safe (one context per mount, disposed only on unmount) but never observed. This plan added mesh *parts*, so there are now more mesh switches to make. |
| **6** | ⚠️ **iPad: drag the two new sliders** (zoom, edge thickness) with a finger. **The rail must not scroll.** | **CONFIRMED RISK, not speculation.** `.pose-panel__slider` has **no `touch-action: none`** — the exact line `DirectionOrb` needed for precisely this problem. Whether a native `<input type="range">` needs it too is untested. **The most likely iPad defect in the plan.** |
| **7** | ⚠️ **iPad: finger-drag on the canvas pans the model**, the rail does not scroll, and nothing draws. **Double-tap stamps.** | The owner's primary device. Verified by *reading line numbers*, never by touching glass. |
| **8** | ⚠️ **Stamp, then open the lighting studio.** Do the stamped pixels shade like the 3D model did? Are the heights sensible — not uniform, not inverted? | **The depth-derived heights were reasoned from three's `depth.glsl.js` source and NEVER RUN ON A GPU.** They share the readback path this plan added the outline to. If heights come back uniform or inverted, the depth pass is the first place to look. |
| **9** | ⚠️ **E18 — smooth normals changed what the stamp writes.** A stamp taken now writes **interpolated** normals where it used to write faceted ones. Confirm in the lighting studio that stamped pixels shade like a *curved* surface. | **INTENDED and the whole point of task 02** — but a stamp taken now **will not match one taken before** on the same mesh at the same rotation. The owner must know. This is the check that proves the change reached the stamp. |
| **10** | **StrictMode (dev): select Pose.** Exactly one renderer, one overlay, no mount/unmount error. | Double-mount is the classic way the "one context" guarantee in #5 silently becomes two. |
| **11** | **Variant-edit mode: pan, then stamp.** Do the pixels land exactly under the model? | A `variantOffset`-vs-`viewMin` bug was found and fixed pre-commit in plan 06. The algebra re-checks out, but this path is invisible everywhere **except** inside a variant. |

### 🟠 Tier 2 — the new features. Judge whether they actually work.

| # | Check |
| --- | --- |
| 12 | **Each part button — Head / Torso / Arm / Leg / Hand / Full — loads that piece ALONE**, centred and auto-fitted. None is empty. |
| 13 | ⚠️ **The head looks like a head and the arm looks like an arm.** **The mesh is a T-POSE, so "arm" is a horizontal bar reaching to BOTH sides** (there are no left/right variants — E1). Confirm that reads correctly framed alone. The segmentation is proven correct *numerically* (9,636 triangles, exact partition, none empty) — **but nobody has looked at it.** |
| 14 | A part **rotates, lights, pans and stamps** exactly like a cube. |
| 15 | **Smooth shading is visible** on the sphere, the cylinder **and** the mannequin parts — a smooth gradient, **not** a ring of flat facets, and no banding as the light orb sweeps. Silhouettes read **round, not polygonal**, at 32×32. *(Merged: task 02's checks 1–4 + task 05's check 4 + task 06's check 12.)* |
| 16 | **The outline is HARD-EDGED at 1, 2, 3 and 4 px** — crisp, no soft fringing, no partial alpha — and **hugs the silhouette exactly**: no gap, no overlap onto the model. Setting the slider to **0 removes it entirely**. |
| 17 | **The model colour follows the Fill slot** and the **outline colour follows Edge**. Changing either in the app's main picker recolours it **live**. No native OS colour swatch appears anywhere in the rail. |
| 18 | Clicking the model swatch switches the main picker to its **Fill** tab; clicking the outline swatch switches it to **Edge**. |
| 19 | **Stamp: still ONE undo entry**, one redo — and **the outline is ABSENT from the stamp** (the documented E7 decision; see the open question below). |
| 20 | **Resize the object** — the render target follows and the model re-fits. Pan **survives** a resize and **resets** on a mesh change. |
| 21 | The **light-tint preset row** (Neutral / Warm / Cool / Amber / Moon) visibly changes the key light. *(This replaced a native colour input — see closed question 2.)* |
| 22 | ⚠️ **Rail layout at 240 px.** The Colours group, the five-button tint row, the zoom number box and the thickness slider are all **new width consumers** in a 240 px rail. *(Reviewable in Storybook without the app — the decorator mounts at exactly 240 px.)* |
| 23 | **Time a full-canvas stamp on the largest object you have** and note the wall clock. **Never measured**, and the parts raised the triangle counts. |

### 🟡 Tier 3 — the rest of the rail, and the older pose behaviours

| # | Check |
| --- | --- |
| 24 | The model renders with **hard, blocky, aliased edges** — no smooth silhouette, no downscale banding. **This is the feature; if it looks smooth, it failed.** |
| 25 | It stays crisp and grid-aligned at **every canvas zoom level**. |
| 26 | On 32×32 it reads as genuinely chunky and useful as reference; on 256×224 it still renders **1:1** without stretching. |
| 27 | Non-square grids fit the limiting axis without clipping; a **45°-rotated** model does not clip at the frame edges. |
| 28 | Mouse: drag pans, does **not** rotate, does **not** draw. Double-click stamps. |
| 29 | With a selection active, the stamp is **masked** to it. |
| 30 | Selecting Pose swaps the rail to the Pose section; Pencil/Eraser swap it back. |
| 31 | Cube / Sphere / Cylinder each load and appear pixelated. *(The Model row now offers **three** primitives — "Mannequin" moved to the Mannequin row as its **Full** button. Deviation 20.)* |
| 32 | **Drag both orbs with a mouse**, including moving the cursor off the orb mid-drag (the `setPointerCapture` contract). **And by TOUCH — the rail must not scroll** (`.direction-orb__sphere` *does* have `touch-action: none`; the sliders do not — see #6). |
| 33 | Each viewpoint button (Front/Back/Left/Right/Top/Bottom/3-4) snaps the model **and** visibly moves the rotation orb's handle. |
| 34 | Each camera preset changes the projection; **Iso reads as true isometric**. Perspective ↔ Orthographic toggles visibly; FOV affects perspective only and is disabled in orthographic. ⚠️ **See open question D14 below — a preset overrides the toggle, by the owner's own decision.** |
| 35 | The **Clear pose** button unloads the mesh (it is the only way to). |
| 36 | Switching projects clears the pose. |

### 🟢 Tier 4 — regressions: nothing else may have changed

| # | Check |
| --- | --- |
| 37 | **No visual change anywhere in the pixel studio while Pose is NOT selected.** The overlay is always mounted; any difference means the canvas stack was disturbed. |
| 38 | **Drawing performance on a large sprite is unchanged while pose is not selected.** |
| 39 | Pencil, eraser, both fills, line, rectangle, ellipse, move, selection, eyedropper and origin all behave as before. **Reflection still mirrors and its guides still draw.** Marching ants, origin cross and reflection guides still render **above** the artwork. |
| 40 | Lighting studio opens and its normal/height tools work; onion skin / frame trace / reference overlays still layer correctly; undo/redo across a mixed session is normal and autosave fires. |
| 41 | Split canvas still works and correctly does **NOT** get the pose overlay; export output is still correct. |

**Score: 0 of 41 observed.** Roughly a dozen had their underlying *structural* claim
independently re-derived from source or the built bundle (§7.6). **The distinction matters
and must not be blurred.**

## 7.8 Open questions and decisions to surface

**Closed during this plan, recorded so they are not re-opened:**

1. **Does the outline get stamped? — NO.** Closed by task 06 per **E7**: the outline is
   **display-only**. `renderPose` calls `applyOutline` on the overlay buffer; `poseStamp`
   takes its own read-back and never calls it, so `buildStampCells` sees the **pre-outline**
   silhouette. The reasoning is written out in full at `poseStamp`'s header: an outline pixel
   **has no surface** — no geometry beneath it, so no honest normal and no depth to
   normalise; `height: 0` is already the "no data" sentinel; and it stays **reversible**
   (adding it later is one call, un-committing invented normals from 151 real projects is
   not). ⚠️ **If the owner wants it stamped**, the normal/height channels must be *defined*,
   not defaulted — and E6's shared `>= 128` threshold keeps both silhouettes in step.
   **Verified by this task: exactly one `applyOutline` call site, on the overlay path only.**
2. **Light colour — it keeps its own control**, but the native OS swatch is gone: a
   five-preset tint row (Neutral / Warm / Cool / Amber / Moon), still backed by
   `pose.lightColor`. Folding it behind the app picker would need a third colour slot, which
   **E10 forbids**. ⚠️ **If the owner dislikes the preset row, this is the decision to
   revisit** — the store field is unchanged, so a different control is a `ui/`-only change.

**⚠️ STILL OPEN — for the owner, after real use:**

3. **D14: a camera preset overrides the store's `projection`.** Consequence: the rail's
   Perspective/Orthographic toggle **has no visible effect** while a preset with a different
   projection is selected (four of the five presets are orthographic). **The owner decided on
   2026-09-03 to KEEP this as-is and revisit after using the tool on real work** (E19). It is
   a deliberate decision, **not a defect** — recorded here only so it is not mistaken for a
   bug during the QA pass, and so the owner is prompted to revisit it now that there is a
   tool to use. **Tier 3 check 34 is where it will show up.**
4. **In variant-edit mode the overlay spans the expanded view while the stamp targets the
   smaller variant grid.** Cells outside the variant are filtered by `setPixelCells`, so the
   model stamps **cropped**: the visible reference is larger than the stampable area. Correct
   per the plan, **likely surprising in use.** Tier 1 check 11.
5. **The root `format:check` glob does not cover any file this plan touched**
   (`client/src/ui/**`, `client/src/stores/**`, `client/src/containers/**` are all outside
   it). It passed, but on a narrower set than "everything this plan wrote". Pre-existing
   configuration — **flagged rather than silently widened.**

## 7.9 Bugs, discrepancies and follow-ups — RECORDED, NOT FIXED

**No behavioural bug was found, and no application code was changed by this task.** Every
structural claim re-derived in §7.6 agreed with what the earlier waves reported.

Four items are recorded for the owner. **None was patched** — per the task's constraint, a
finding at the gate with no owner sign-off is a report, not a patch.

| # | Item | Severity | Notes |
| --- | --- | --- | --- |
| A | **Two stale prose comments in `poseEngine.ts` (`:205`, `:266`)** say "task 06 owns / task 06 replaces" as though the work were pending. Task 06 landed. | Cosmetic | The **code is correct**; only the tense is wrong. Outside this task's documentation-only `Touches`. A future editor should rewrite them in the past tense. |
| B | **`.pose-panel__slider` has no `touch-action: none`** while `.direction-orb__sphere` does. | ⚠️ **Real iPad risk** | Not a proven defect — whether a native `<input type="range">` needs the line is genuinely untested. **This is Tier 1 check 6**, and it is the single most likely iPad failure. Needs a device before anyone changes CSS. |
| C | **Optional follow-up — bundle inversion (deviation 19).** `MANNEQUIN_PART_ORDER` lives in `poseMeshes.ts`, so importing it from the rail drags ~900 lines into the main chunk (**the whole +5.33 kB**). Moving the constant into `poseTypes.ts` would invert it. | Low | ⚠️ **NOT DONE by this task** — it is application code and needs owner sign-off. Cost is 0.9% of the main bundle. |
| D | **Optional follow-up — dead state (deviation 22).** `pose.modelColor`, its action and its `clear()` line are now unread; the container uses `tool.fillColorOrSelected` (E8). | Low | ⚠️ **NOT DONE by this task.** Task 06 kept them deliberately — deleting an `observableRef` field is a store-shape change with its own risk. The store header already carries a "do not wire a new reader to it" warning. |

**Two honest gaps in this task's own coverage**, neither a code defect:

- **`bun run dev` was verified by launching the three `mprocs.yaml` commands individually**,
  not through the mprocs TUI, which cannot be read from a non-interactive shell. All three
  bound their real default ports and answered live HTTP. **The mprocs *wrapper* is therefore
  inferred, not observed; the three processes it supervises are observed.** (Unlike plan 06's
  run, **no stale session of the owner's was holding any port** — all three were free before
  launch, and nothing of the owner's was touched or killed.)
- **The 41 checks in §7.7 cannot be closed by any agent.** That is why this task is
  `PARTIAL`.

## 7.10 `bun run dev` — all three processes came up ✓

All three ports (5173 / 3001 / 8100) were **confirmed free** before launching; **no process
of the owner's was killed or touched.** The three `mprocs.yaml` commands were launched
directly and individually.

```
=== live HTTP probes ===
-- 1. client (vite, 5173)         /              HTTP 200
-- 2. server (express, 3001)      /api/projects  HTTP 200
-- 3. ai-service (uvicorn, 8100)  /health        HTTP 200
   {"status":"ok","mode":"proxy","remote_configured":false}

=== listening ports ===
   bun       15120  *:3001
   node      15123  *:5173
   python3.1 15141  *:8100

=== their own startup banners ===
client:  VITE v7.3.6  ready in 111 ms   ➜  Local: http://localhost:5173/
server:  🎨 Pixel Art server running on http://localhost:3001
         🔌 Sync websocket listening on /ws
         📡 Advertising _pixelart._tcp on port 5173 for the iPad companion
ai:      INFO: Application startup complete.
         INFO: Uvicorn running on http://0.0.0.0:8100 (Press CTRL+C to quit)
```

**Every module this plan wrote or changed was served and transformed by the REAL dev client
with ZERO errors in the vite log:**

```
src/ui/canvas/pose/poseOutline.ts              HTTP 200   ← new in this plan (task 04)
src/ui/canvas/pose/poseMeshes.ts               HTTP 200   ← tasks 02 + 05
src/ui/canvas/pose/poseTypes.ts                HTTP 200   ← task 05
src/ui/canvas/pose/poseCamera.ts               HTTP 200
src/ui/canvas/pose/poseEngine.ts               HTTP 200
src/ui/canvas/pose/poseStamp.ts                HTTP 200
src/stores/ui/PoseUIStore.ts                   HTTP 200   ← tasks 01 + 06
src/containers/CanvasContainer.tsx             HTTP 200   ← task 06
src/containers/PixelStudioPanelContainer.tsx   HTTP 200   ← tasks 03 + 06
src/ui/components/PosePanel/PoseSection.tsx    HTTP 200   ← task 03
/models/mannequin.gltf                         HTTP 200, size=380956   ← matches the
                                                            recorded checksum size exactly
```

All three processes were then shut down cleanly by pid; **no listener of mine remains** and
the repo is clean. **`bun run dev` is not broken by this plan.**

## 7.11 Diff scope for the whole plan

14 files, **+4,206 / −671**, all within the union of the six tasks' `Touches` lists plus the
one pre-authorized `ApplicationStore.ts` stale-comment fix:

```
CanvasContainer.tsx  279+ · PixelStudioPanelContainer.tsx  98+ · ApplicationStore.ts  8+
PoseUIStore.ts  287+ · PoseUIStore.test.ts  333+
poseMeshes.ts  759+ · poseMeshes.test.ts  944+ · poseTypes.ts  42+
poseOutline.ts  325+ (new) · poseOutline.test.ts  700+ (new)
PosePanel.css  90+ · PoseSection.tsx  404+ · PoseSection.stories.tsx  89+
PoseSection.dom.test.tsx  519+
```

## 7.12 Definition of done — honest status

- [x] `bun run verify` exits **0**; real output pasted (§7.1).
- [x] All three dev processes confirmed up, with the mprocs-wrapper caveat stated (§7.10).
- [x] Bundle table recorded; `three` proven still absent from main **with a positive
      control**, and the one changed count (`BufferGeometry` 0 → 1) explained in context
      rather than smoothed over (§7.4).
- [x] Framing machinery proven gone — **zero code references repo-wide**; two stale prose
      comments reported, not fixed (§7.5).
- [x] Corpus digests unchanged; `UIStore.ts` diff **empty**; no snapshot touched; no
      lockfile; `server/` untouched (§7.3).
- [x] Stylelint **exactly 2** errors, confirmed by file:line and by reading the source lines.
- [x] **One** consolidated, de-duplicated, risk-ordered checklist — **63 raw → 41 distinct**,
      covering this plan **and** the 30 outstanding from the pose-tool plan (§7.7).
- [x] Open questions surfaced, including the closed outline-vs-stamp decision and **D14's
      preset-overrides-projection**, which the owner chose to keep and revisit (§7.8).
- [x] Every deviation across all tasks recorded (24 in the Deviations section above, plus
      this task's four findings in §7.9).
- [x] **No application behaviour changed. Nothing reformatted** (`format:check` passed).
- [ ] ⚠️ **The 41 manual checks themselves — CANNOT be closed by any agent in either plan.**
      **This is why task 07 is `PARTIAL`, not `DONE`.** The plan is code-complete and
      gate-green. It is **not verified as working software** until a human runs §7.7.

## 7.13 Notes for the next session

**All five waves have landed and the tree is gate-green at `bun run verify` exit 0.** The
plan is **code-complete**. It is **not verified as working software.**

**The single most valuable next action is not writing code — it is the owner spending
twenty minutes on §7.7 Tier 1.** Eleven checks, ordered so the first two are the reason the
plan exists. Everything below Tier 1 is worth doing but will not change the verdict.

**If Tier 1 check 1 or 2 fails** (zoom still caps, or pan still clamps), the place to look is
`CanvasContainer.tsx` — `scaleCameraParams` at `:403` and the two-step fit at `:2841-2845`.
The store side (`POSE_ZOOM_MAX` deleted, `setPan` unclamped) is proven correct by test and by
inspection; the container arithmetic is the part that has never been rendered.

**Three things are deliberately left undone**, each needing owner sign-off because each is
application code and this task was documentation-only:

1. **Two stale prose comments** in `poseEngine.ts:205` / `:266` (finding A, §7.9) — cosmetic.
2. **The bundle inversion** — move `MANNEQUIN_PART_ORDER` from `poseMeshes.ts` into
   `poseTypes.ts` to reclaim the +5.33 kB (finding C, deviation 19).
3. **The dead `pose.modelColor` state** — field, action and `clear()` line (finding D,
   deviation 22).

None is urgent. **Do not bundle them into an unrelated change**, and note that #2 and #3 both
touch files the corpus digests depend on transitively, so each wants its own commit and its
own gate run.

**⚠️ Process lessons carried forward from this plan, for whoever writes the next one:**

- **Agents must NOT use `git stash` in this repo** — it has pre-existing stashes from other
  branches and a pop can resolve against the wrong one (W1 incident).
- **`git add` followed by a separate `git commit` is NOT safe in a shared worktree.** Use
  `git commit --only <explicit paths>` (W2 commit race).
- **`bunx` recreates `client/bun.lock`.** Sweep after every single invocation.
- **A wave may legitimately end with a red `tsc`** when a deletion is split across two waves
  (W3). Say so in the plan, or a coordinator will read it as failure.
