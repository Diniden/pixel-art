# HANDOFF — Pose tool refinements

**Current position:** W1 DONE — W2 next
**Branch:** `feat/07-pose-refinements`
**Last commit:** `774b0a2`
**Plan written:** 2026-09-03 · Planning baseline HEAD: `54d6501` (branch `feat/06-pose-tool`)

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02 | DONE | 2026-09-03 | `774b0a2` | tsc 0 · eslint 0 err/65 warn · vitest 145 files / 2755 tests pass · boundaries OK · no lockfile |
| W2 | 03, 04 | TODO | | | |
| W3 | 05 | TODO | | | |
| W4 | 06 | TODO | | | |
| W5 | 07 | TODO | | | |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

## Task ledger

| Task | Title | Wave | Status | Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| 01 | Free zoom/pan + Fit seam | W1 | DONE | `86f456c` | `POSE_ZOOM_MAX` deleted; `fitGeneration`/`requestFit()` added. Cap only HALF fixed — see W2/W4 |
| 02 | Smooth normals + tesselation | W1 | DONE | `774b0a2` | sphere 48×32, cyl radial 48, height segs 1 (measured); `POSE_MATERIAL_FLAT_SHADING=false` |
| 03 | Panel: colours, Fit, edge slider | W2 | TODO | | |
| 04 | Outline post-pass | W2 | TODO | | |
| 05 | Mannequin part meshes; delete framing | W3 | TODO | | ⚠️ May legitimately leave `tsc` red |
| 06 | Container integration | W4 | TODO | | Closes task 05's type hole |
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
   argues otherwise, and must surface the result here.
2. **Light colour** is not a Fill/Edge concept. Task 03 decides whether it keeps a separate
   control or moves behind the same picker, and records the choice here.


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
