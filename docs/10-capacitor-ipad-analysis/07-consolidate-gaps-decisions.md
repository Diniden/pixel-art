# 07 — Consolidate: GAPS, decisions, synthesis

**Wave:** W2 · **Depends on:** 01, 02, 03, 04, 05, 06
**Touches:** `docs/10-capacitor-ipad-analysis/GAPS.md` · `docs/10-capacitor-ipad-analysis/DECISIONS-NEEDED.md` (new) · `docs/10-capacitor-ipad-analysis/findings/00-synthesis.md` (new)
**Effort:** M

## Objective
The six findings documents are reconciled into three keystone artifacts: the final
`GAPS.md` (every gap from every findings file, deduplicated, final-numbered, with the
cross-reference table filled), `DECISIONS-NEEDED.md` (the short list the owner must
sign off before implementation), and `findings/00-synthesis.md` (the 20-minute
executive read that task 08 builds the implementation plan from).

## Context
You are the only task permitted to edit `GAPS.md` (MASTER D7). It arrives seeded with
G-01…G-15 (plan-time, evidence-backed); the findings files carry locally-numbered gaps
(G-1xx…G-6xx). Expect overlap (several tasks will have hit the same wall from
different sides) and contradictions (e.g. task 01's adapter sketch vs task 05's fs
naming; task 02's platform verdicts vs assumptions others made before 02 landed —
MASTER D5 says findings cite 02 by question ID, so chase those references).

## Steps
1. Read all six findings files and the seeded GAPS.md completely.
2. **Reconcile contradictions first.** Where two findings disagree, decide which is
   right (prefer measured over cited over reasoned), and record the reconciliation in
   `00-synthesis.md` under "Conflicts resolved" — do not silently pick one. Where a
   task's assumption was invalidated by task 02's measurements, mark the dependent
   recommendation accordingly in the synthesis (the findings files themselves stay
   untouched — they are the record of what each task concluded).
3. Rebuild `GAPS.md`: merge findings gaps into the seeded set — update seeded entries'
   Status (`MEASURED` where a task verified them, with the reference), add new final-
   numbered entries (G-16+) for genuinely new gaps, dedupe overlaps into one entry
   citing all sources, and complete the cross-reference table (every local G-xxx maps
   to a final ID or an explicit "duplicate of"). Zero `TBD`/`TODO` markers remain.
4. Write `DECISIONS-NEEDED.md`: one section per owner decision — every
   PRODUCT-DECISION gap plus anything the findings elevated. Each: the question, the
   options with one-line consequences, the analysis's recommendation, and which gaps/
   findings it unblocks. Expect at least: G-14 (export byte-identity), G-15
   (ios-companion), encryption recovery policy, no-auth LAN mode coexistence, and
   device↔device sync scope for v1.
5. Write `findings/00-synthesis.md`: the port in one page (what's portable, the seams,
   the architecture that emerged); the recommended target architecture as a diagram-in-
   text; effort shape (what's cheap, what's expensive, what's a product); conflicts
   resolved; and an ordered "what the implementation plan must contain" list for
   task 08 — phases, not tasks.
6. Re-read the final `GAPS.md` top to bottom once, as the owner would.

## Constraints
- You may edit only your three Touches files. Findings 01–06 are read-only history.
- Do not soften gaps to make the project look more feasible; do not decide
  PRODUCT-DECISIONs — surface them.
- Keep D6 format for every GAPS entry; keep the seeded IDs stable (G-01 stays G-01).

## Verification
```sh
grep -nE 'TBD|TODO' docs/10-capacitor-ipad-analysis/GAPS.md && echo FAIL || echo OK
test -s docs/10-capacitor-ipad-analysis/DECISIONS-NEEDED.md
test -s docs/10-capacitor-ipad-analysis/findings/00-synthesis.md
# every local gap ID from findings appears in the xref table:
for id in $(grep -hoE '^### G-[1-6][0-9]{2}' docs/10-capacitor-ipad-analysis/findings/0[1-6]-*.md | grep -oE 'G-[0-9]+'); do
  grep -q "$id" docs/10-capacitor-ipad-analysis/GAPS.md || echo "MISSING $id"
done
git status --porcelain | grep -v 'docs/10-capacitor-ipad-analysis' | grep . && echo DIRTY || echo CLEAN
```
Expect `OK`, no `MISSING` lines, `CLEAN`. Manual: DECISIONS-NEEDED covers every
PRODUCT-DECISION gap in GAPS.md (grep the severity and cross off).

## Definition of done
- [ ] GAPS.md merged, deduped, statuses updated, xref table complete
- [ ] Every findings-file gap accounted for (script above clean)
- [ ] DECISIONS-NEEDED.md covers all PRODUCT-DECISION gaps with recommendations
- [ ] 00-synthesis.md includes conflicts-resolved section and the phase list for task 08
- [ ] Tree clean outside this folder
