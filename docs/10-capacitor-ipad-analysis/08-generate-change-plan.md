# 08 — Generate the implementation plan (docs/11-capacitor-ipad-port/)

**Wave:** W3 · **Depends on:** 07
**Touches:** `docs/11-capacitor-ipad-port/` (new — MASTER.md, HANDOFF.md, GAPS.md, numbered task files) · `docs/10-capacitor-ipad-analysis/HANDOFF.md` (folder-number note only, if 11 is taken)
**Effort:** L

## Objective
A complete, executable implementation plan exists at `docs/11-capacitor-ipad-port/` in
the same `/plan-steps` format as this folder (MASTER.md with request/outcome/locked
decisions/ground truth/wave table/dependency graph/collision matrix/alignment
guide/risk register/executor rules/task index; numbered task files with
Wave/Depends/Touches/Effort/Objective/Context/Steps/Constraints/Verification/Definition
of done; a seeded HANDOFF.md; **and its own GAPS.md**). A fresh `/plan-go` session can
execute it without this conversation or this analysis in context — everything needed is
inside docs/11 or explicitly referenced by path.

## Context
Your inputs, in priority order: `findings/00-synthesis.md` (the phase list is your
skeleton), `GAPS.md` + `DECISIONS-NEEDED.md`, then the six findings files for detail.
The analysis was designed to make this task mechanical-ish: seams, adapter interface,
storage spec, encoder options, sync design, and platform pins are all decided or
explicitly gated on owner decisions.

Rules the generated plan must itself encode (its executors won't have read this
folder): Bun-only, no lockfiles (`--exact` on every `bun add`), never break
`bun run dev`, corpus/golden protections for `client/src/types|services|stores/domain`
and `server/src/export`, `observable.ref` pixel grids, the `ui/` boundary, honest
reporting. Its confirmed gate command is `bun run verify` (measured real at plan time —
re-verify it still exists) plus the ungated-but-real extras (`lint:boundaries`,
`lint:css`, `build-storybook`, server vitest) where a task warrants them.

Structural guidance:
- **Phase the plan.** The synthesis orders the work; expect something like: adapter
  extraction + dual entrypoints (pure refactor, everything still green) → client
  transport seam behind the barrel → Capacitor iOS shell + storage VFS → local-mode
  export → mode-selection UX → sync/accounts/encryption phases. Owner-undecided items
  (DECISIONS-NEEDED) must be **gated tasks**: the wave that needs a decision states it
  in its gate ("blocked until owner signs off D-x in DECISIONS-NEEDED.md"), and
  earlier waves must not silently depend on an unmade decision.
- **Honest parallelism only:** tasks share a wave only with pairwise-disjoint Touches
  and no cross-dependencies. Refactors of `server/src/` serialize with anything else
  touching it. Single-task waves are fine.
- **Split anything larger than L.** Sync+accounts+encryption is a product; the risk
  register here (MASTER §9) predicts you'll be tempted to under-slice it.
- Every task file names its verification (real commands + the manual checks: on-device
  gesture/Pencil behavior cannot be automated — say so per task, the house rule is
  that skipped manual checks mean not-done).
- **docs/11 GAPS.md:** carry over every open gap from docs/10's GAPS.md that the plan
  must live with (mark them `CARRIED` there is task 09's job — you build the docs/11
  side: each carried gap says which implementation task mitigates it or why none can),
  plus any new gaps the act of planning exposes.

## Steps
1. Read the inputs (above). Run `ls -d docs/[0-9][0-9]-*` — confirm `11` is free; if
   not, take the next free number and record the deviation in
   `docs/10-capacitor-ipad-analysis/HANDOFF.md` under Deviations.
2. Verify the ground-truth claims you copy into docs/11's MASTER §4 still hold (spot-
   check the load-bearing ones: `bun run verify` in root package.json, the api barrel,
   `raster.ts` line numbers — the repo may have moved since the analysis ran).
3. Write MASTER.md (all 11 sections), then the task files in execution order, then
   GAPS.md, then the seeded HANDOFF.md.
4. Build the collision matrix from the actual Touches lists you wrote — do not
   assert disjointness you haven't checked.
5. Self-review pass: every path in every Touches exists or is marked `(new)`; every
   cited `file:line` opens to what you claim; every wave's gate is a command you
   confirmed exists; every DECISIONS-NEEDED item maps to an explicit gate in some wave.

## Constraints
- Write only under `docs/11-capacitor-ipad-port/` (+ the HANDOFF note here if
  renumbering). **No application code, ever** — including "helpful" scaffolding.
- Do not resolve PRODUCT-DECISIONs by fiat; encode them as gates.
- Do not water down carried gaps; docs/11's GAPS.md must be at least as honest as
  docs/10's.
- The generated plan's tasks must respect the same Touches discipline this one does.

## Verification
```sh
ls docs/11-capacitor-ipad-port/MASTER.md docs/11-capacitor-ipad-port/HANDOFF.md docs/11-capacitor-ipad-port/GAPS.md
ls docs/11-capacitor-ipad-port/[0-9][0-9]-*.md | wc -l   # expect ≥ 8
grep -q 'Collision matrix' docs/11-capacitor-ipad-port/MASTER.md
grep -q 'DECISIONS-NEEDED' docs/11-capacitor-ipad-port/MASTER.md
git status --porcelain | grep -v '^?? docs/1[01]-' | grep -v '^ M docs/10-' | grep . && echo DIRTY || echo CLEAN
```
Manual: pick two generated task files at random and check a stranger could execute
them from the file + docs/11 MASTER + CLAUDE.md alone; pick one multi-task wave and
hand-verify Touches disjointness.

## Definition of done
- [ ] docs/11 has MASTER (11 sections), HANDOFF (seeded), GAPS, ≥8 task files in the
      required structure
- [ ] Every owner decision is an explicit wave gate; none silently pre-decided
- [ ] All carried gaps present in docs/11 GAPS.md with owning task or rationale
- [ ] Self-review pass done: paths, lines, gates, collision matrix all verified
- [ ] Tree clean outside docs/10 and docs/11
