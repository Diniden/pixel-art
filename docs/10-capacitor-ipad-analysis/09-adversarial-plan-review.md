# 09 — Adversarial review of the generated plan

**Wave:** W4 · **Depends on:** 08
**Touches:** `docs/10-capacitor-ipad-analysis/REVIEW.md` (new) · `docs/11-capacitor-ipad-port/` (fix-in-place edits) · `docs/10-capacitor-ipad-analysis/GAPS.md` (Status column only)
**Effort:** M

## Objective
The generated plan at `docs/11-capacitor-ipad-port/` has survived a hostile review: every
factual claim spot-verified against the repo, every structural promise (disjoint waves,
real gates, executable tasks) checked, every hole either fixed in place or recorded as a
gap. `REVIEW.md` documents the findings and ends with zero rows in state `OPEN`.

## Context
You are reviewing a plan written by a different agent from analysis documents written by
six more. The known failure modes you are hunting (from this folder's risk register):
cited paths/lines that don't exist or don't say what's claimed; fake parallelism
(overlapping Touches in one wave); gate commands that were never confirmed to run;
tasks unexecutable by a fresh agent (missing context, references to "the analysis"
without a path); owner decisions silently pre-decided; carried gaps softened or
dropped; oversized tasks (>L) that will fail mid-wave; violations of house rules baked
into task steps (a `bun add` without `--exact`, a step that would break `bun run dev`
mid-wave, snapshot updates near the corpus suites).

Review with the reader's incentives inverted: for each task file ask "how would this
fail?", not "does this look right?".

## Steps
1. Mechanical verification first, and log it in REVIEW.md:
   - Every `Touches` path in every docs/11 task exists on disk or is marked `(new)`.
   - Every `file:line` citation in docs/11 MASTER §4 and task Contexts: open and check.
   - Every wave-gate command: confirm it exists (script present in package.json / file
     on disk). Do not run heavy builds; existence + a `--help`/`--version`-grade check
     suffices, but say which level you did.
   - Collision matrix: recompute pairwise intersections of same-wave Touches yourself.
   - Dependency graph: no task depends on a later wave; every Depends-on exists.
2. Semantic review: fresh-agent executability (pick every task, skim as a stranger),
   decision gates vs DECISIONS-NEEDED coverage, gap completeness (diff docs/10 GAPS.md
   open items against docs/11 GAPS.md — every BLOCKER/DESIGN-RISK is either CARRIED
   with an owning task or explicitly closed with evidence).
3. Fix small defects directly in docs/11 (typos, wrong line numbers, a missing
   `(new)` marker, a gate typo) — log each fix in REVIEW.md. Structural defects
   (fake parallelism, an unexecutable task, a missing phase) get fixed if you can do it
   without redesigning the analysis; otherwise record as `OPEN → ESCALATE` with what
   task 08's re-run needs to change — an ESCALATE row is the one legitimate reason this
   task ends PARTIAL, reported honestly in HANDOFF.
4. Update docs/10 `GAPS.md` Status column: `CARRIED` for gaps now owned by docs/11
   tasks (cite the task number), and note any gap docs/11 closed outright.
5. Write `REVIEW.md`: findings table (ID, severity, location, claim, what you found,
   resolution, state ∈ {FIXED, GAP-RECORDED, ESCALATE, OPEN}), then a verdict
   paragraph: is docs/11 executable by `/plan-go` as it stands?

## Constraints
- You may edit docs/11 (fixes), REVIEW.md, and GAPS.md Status entries — nothing else,
  and never application code.
- Fixes must not change the plan's intent or resolve owner decisions.
- No finding is deleted from REVIEW.md once logged — resolution changes its state.

## Verification
```sh
test -s docs/10-capacitor-ipad-analysis/REVIEW.md
grep -c '| OPEN |' docs/10-capacitor-ipad-analysis/REVIEW.md   # expect 0
grep -q 'Verdict' docs/10-capacitor-ipad-analysis/REVIEW.md
git status --porcelain | grep -v 'docs/1[01]-' | grep . && echo DIRTY || echo CLEAN
```
Manual: re-open three findings you marked FIXED and confirm the fix landed in docs/11;
confirm every ESCALATE (if any) appears in HANDOFF.md's Deviations with a next action.

## Definition of done
- [ ] Mechanical checks (paths, lines, gates, matrix, graph) all logged with results
- [ ] Gap-coverage diff docs/10 ↔ docs/11 complete; Status column updated
- [ ] Findings table has zero OPEN rows; ESCALATEs (if any) mirrored into HANDOFF
- [ ] Verdict states plainly whether /plan-go can run docs/11
- [ ] Tree clean outside docs/10 and docs/11
