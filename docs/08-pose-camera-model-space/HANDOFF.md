# HANDOFF — Pose camera, model space, and presets

**Current position:** W1 not started
**Branch:** (set by /plan-go — expected `feat/08-pose-camera-model-space`)
**Last commit:** (set by /plan-go)
**Plan written:** 2026-09-03 · Planning baseline HEAD: `494b5b4` (branch `feat/07-pose-refinements`)

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02 | TODO | | | |
| W2 | 03 | TODO | | | |
| W3 | 04 | TODO | | | |
| W4 | 05 | TODO | | | |
| W5 | 06, 07 | TODO | | | |
| W6 | 08 | TODO | | | ⚠️ the persistence wave — data-safety gate |
| W7 | 09 | TODO | | | |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

## Task ledger

| Task | Title | Wave | Status | Commit | Notes |
| --- | --- | --- | --- | --- | --- |
| 01 | Model-space origins | W1 | TODO | | Foundation — 03 depends on it |
| 02 | Outline in the stamp | W1 | TODO | | Reverses plan 07's E7, per owner |
| 03 | Camera holds still: fit → scale | W2 | TODO | | The heart of the plan (items 4 + 6) |
| 04 | Camera-space pan | W3 | TODO | | |
| 05 | Presets + viewpoint semantics | W4 | TODO | | ⚠️ Records F8: F7 supersedes D14 |
| 06 | Advanced camera mode | W5 | TODO | | Ships a component; 08 mounts it |
| 07 | Exact Euler entry | W5 | TODO | | ⚠️ F11 decision required for the light |
| 08 | Saved scene presets, persisted | W6 | TODO | | ⚠️ **The only wire-format change** |
| 09 | Full gate, QA, handoff | W7 | TODO | | Likely ends `PARTIAL` |

## Known state at planning time (2026-09-03)

**The worktree is CLEAN** at `494b5b4` on `feat/07-pose-refinements`, and `bun run verify`
**exits 0**. Plan 07 is code-complete.

**Gate baseline measured 2026-09-03:**

- `bun run verify` (root) → **exit 0**
- `bunx tsc --noEmit` → exit 0
- `bunx eslint .` → **0 errors**, 65 warnings
- `bunx vitest run` → **146 files / 2866 tests pass**
- `bun run lint:boundaries` → OK, all 5 rules
- `bunx stylelint "src/**/*.css"` → 70 problems: **2 errors** (`OtherHand.css:338`, `:359`),
  both pre-existing
- `bunx storybook build` → exit 0
- No lockfile. ⚠️ `bunx` recreates `client/bun.lock` — sweep after every invocation.

**Bundle baseline:** main **793.89 kB / 231.22 kB gz**; `three.module` **734.33 / 189.46 gz**
(lazy); `GLTFLoader` **45.56 / 13.70 gz** (lazy). `three` is **not** in the main bundle.
⚠️ `BufferGeometry` appears **1×** in main (a namespace access, not library source) and **26×**
in the three chunk — that is the positive-control baseline, not zero.

## ⚠️ Carried debt — read before starting

**All 41 consolidated manual checks from `docs/07-pose-refinements/HANDOFF.md` §7.7 remain
UNPERFORMED — 0 of 41 observed.** No agent in plans 06, 07 or this one has had a browser, a GPU
or a device. In particular:

- The **depth-derived heights** were reasoned from three's shader source and **never executed on
  a GPU**. Task 02 adds a second outline pass alongside that readback path.
- **WebGL context-leak behaviour** across repeated tool switches is untested.
- **All touch/iPad gestures** are untested.

⚠️ **This plan is unusually visual.** Six of its eleven items can only be confirmed by looking.
A green gate here proves the arithmetic, not the picture. Task 09 must say so plainly.

**A confirmed, unfixed defect carried in:** `.pose-panel__slider` has **no `touch-action: none`**
while `.direction-orb__sphere` (`PosePanel.css:257`) has it under a comment calling it "THE TOUCH
FIX, not a nicety". **Task 08 fixes it** (this plan adds more sliders), but it stays unverifiable
without a device.

## Owner decisions carried in (do not re-open)

- **F1** The stamped outline writes **colour only** — normal and height **untouched**.
- **F4/F6** The camera **holds still**; `fit()` solves for the **model scale**; `zoom` → `scale`.
- **F7** A camera preset sets **everything, including the model's rotation**.
- **F9** **`left` = the model turns to face left** (you see its RIGHT flank) — this **inverts**
  today's left/right. `top`/`bottom`/`front`/`back` are unchanged.
- **F12** Presets are **persisted to the project file**, following `layoutPresets` exactly.

⚠️ **A correction the owner should know about, recorded for honesty:** during planning the
coordinator first warned that persisting presets would force a schema migration and shift all 151
corpus digests. **That was wrong**, and the owner was told so before confirming. Measured: the
digest pipeline is `digest(compactToProject(rawJSON))` and never calls `toPersistedUIState()`, so
a **conditionally-emitted** key shifts nothing and needs no migration (F13/F14). Seven keys were
added this way before. The remaining real risks are the three traps in task 08's Context.

## ⚠️ Decisions this plan SUPERSEDES

- **F8 — F7 supersedes plan 06's D14** ("preset overrides projection"). D14 was kept by owner
  decision on 2026-09-03, *before* F7 existed; F7 subsumes it because a preset now owns
  projection **and** every other camera field **and** the model's rotation. **Task 05 must record
  this explicitly** — do not let a later reader think D14 was dropped by accident.
- **F1 supersedes plan 07's E7** ("the outline is display-only, NOT stamped"). The owner reversed
  it directly: *"Stamping should definitely include the outline"*.

## Open questions for the owner

1. **Does a camera preset also reset scale and pan?** Task 05 decides and records. Recommended:
   no — a preset restores orientation and projection, leaving the owner's framing alone.
2. **How are the light's angles represented?** (F11) The light is a **unit vector** with no Euler
   form today, and vector → Euler is **not unique** (roll is unconstrained). Task 07 decides;
   recommended is a two-field azimuth/elevation control, honestly labelled.
3. **Is the full mannequin's geometry centred too, or only the parts?** (Task 01, step 5.) A glTF
   scene is a node tree, so centring it may mean baking node transforms — task 01 may reasonably
   judge that disproportionate and record it as a deviation.
4. **What does a saved preset contain?** Task 08 decides `pan` / `lightDirection` / `lightColor` /
   `edgeWidth` / `meshId` inclusion. Recommended: include light and mesh, exclude pan.

## Deviations

(none yet)

## Blocked items

(none yet)

## Manual check results

(recorded per task as waves complete — **every task in this plan carries owed visual checks**;
none of the eleven owner items can be fully confirmed without a browser)

## Notes for the next session

(none yet)
