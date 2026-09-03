# HANDOFF — Pose tool refinements

**Current position:** W1 not started
**Branch:** (set by /plan-go — expected `feat/07-pose-refinements`)
**Last commit:** (set by /plan-go)
**Plan written:** 2026-09-03 · Planning baseline HEAD: `54d6501` (branch `feat/06-pose-tool`)

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02 | TODO | | | |
| W2 | 03, 04 | TODO | | | |
| W3 | 05 | TODO | | | |
| W4 | 06 | TODO | | | |
| W5 | 07 | TODO | | | |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

## Task ledger

| Task | Title | Wave | Status | Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| 01 | Free zoom/pan + Fit seam | W1 | TODO | | |
| 02 | Smooth normals + tesselation | W1 | TODO | | |
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

## Deviations

(none yet)

## Blocked items

(none yet)

## Manual check results

(recorded per task as waves complete — tasks 02, 03, 05, 06 and 07 all carry required manual
checks; tasks 01 and 04 are deliberately pure and carry none)

## Notes for the next session

(none yet)
