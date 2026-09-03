# HANDOFF — Pose tool refinements

**Current position:** W4 IN PROGRESS
**Branch:** `feat/07-pose-refinements`
**Last commit:** `fdb4574`
**Plan written:** 2026-09-03 · Planning baseline HEAD: `54d6501` (branch `feat/06-pose-tool`)

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02 | DONE | 2026-09-03 | `774b0a2` | tsc 0 · eslint 0 err/65 warn · vitest 145 files / 2755 tests pass · boundaries OK · no lockfile |
| W2 | 03, 04 | DONE | 2026-09-03 | `b5ece14` | tsc 0 · eslint 0 err · vitest 146 files / 2818 pass · boundaries OK · stylelint exactly 2 err · storybook exit 0 · no lockfile |
| W3 | 05 | DONE | 2026-09-03 | `fdb4574` | ⚠️ `tsc` RED **by design** — 3 errors, all task-06-owned, listed below · eslint 0 err · vitest 146 files / 2857 pass · boundaries OK · no lockfile |
| W4 | 06 | IN PROGRESS | 2026-09-03 | | |
| W5 | 07 | TODO | | | |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

## Task ledger

| Task | Title | Wave | Status | Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| 01 | Free zoom/pan + Fit seam | W1 | DONE | `86f456c` | `POSE_ZOOM_MAX` deleted; `fitGeneration`/`requestFit()` added. Cap only HALF fixed — see W2/W4 |
| 02 | Smooth normals + tesselation | W1 | DONE | `774b0a2` | sphere 48×32, cyl radial 48, height segs 1 (measured); `POSE_MATERIAL_FLAT_SHADING=false` |
| 03 | Panel: colours, Fit, edge slider | W2 | DONE | `868424f` | Native pickers gone; edge width 0–4 (0=off); slider cap removed. ⚠️ Leaves a marked placeholder for task 06 |
| 04 | Outline post-pass | W2 | DONE | `b5ece14` | `applyOutline()`, Chebyshev, mutates in place, 48 tests |
| 05 | Mannequin part meshes; delete framing | W3 | DONE | `fdb4574` | Exact partition: 9,636 tris across 5 parts, none empty. ⚠️ Leaves `tsc` red for task 06 |
| 06 | Container integration | W4 | IN PROGRESS | | Closes task 05's type hole |
| 07 | Full gate, QA, handoff | W5 | TODO | | Likely ends `PARTIAL` |

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

1. **Does the outline get stamped?** Default per **E7** is **no** — display-only, because an
   edge pixel has no meaningful normal or height. Task 06 implements the default unless it
   argues otherwise, and must surface the result here. **STILL OPEN — task 06 (W4) answers it.**
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

These compound with the **30 still-unperformed checks from `docs/06-pose-tool/`**, including
the GPU depth-derived heights that share the readback path this plan adds the outline to.
Task 07 merges both lists into one risk-ordered checklist.

## Notes for the next session

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
