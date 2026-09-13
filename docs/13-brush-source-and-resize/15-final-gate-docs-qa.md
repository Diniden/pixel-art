# 15 — Final gate, `ARCHITECTURE.md`, consolidated manual QA

**Wave:** W5 · **Depends on:** 04, 06, 10, 12, 13, 14
**Touches:** `ARCHITECTURE.md` · `docs/13-brush-source-and-resize/HANDOFF.md`
**Effort:** S

## Objective
The whole plan is verified as one tree: the full gate exits 0, the corpus and lockfile
checks are clean, `ARCHITECTURE.md`'s brush section documents colour sources, the target
sampler and the scaling pipeline, and `HANDOFF.md` carries the consolidated manual QA
checklist with each row's actual status.

## Context
- `ARCHITECTURE.md` "Brush documents" section (`:124-240`): the "Edge/fill deltas" and
  "Brush tool (pixel studio)" bullets are where the new behaviour belongs. Match the voice
  and density of the existing bullets; cite file paths, not line numbers.
- Gate commands (all confirmed to run on `main @ 9df1e72`): see MASTER §10.

## Steps
1. Run the full gate from MASTER §10 and paste the real output (counts, not "passes") into
   `HANDOFF.md`.
2. `ARCHITECTURE.md`: add (a) `colorSource` on `BrushLayer` (absent = selected; `TGT`
   badge; `setLayerColorSource`), (b) the seed rule and the per-stroke `touched` set with
   the `ToolContext.pixelBrushTarget` sampler bound over `editableGrid()`, (c) the
   `pixelBrushScale/` folder — kernels, pixel-art scalers, hq2x (if landed), the coverage
   model, the identity short-circuit, and `PixelBrushUIStore` (session-only, never
   persisted) with the lock/strategy rules, (d) the rail section and other-hand widgets.
3. `HANDOFF.md`: the consolidated manual QA table (MASTER §11) with per-row status —
   performed rows with what was observed, un-performed rows marked ❌ with the reason.
   A row with a skipped manual check keeps the plan **PARTIAL**.
4. Commit docs: `docs(13): ARCHITECTURE brush colour source + scaling; final gate; QA ledger`.

## Constraints
- No application code changes in this task. If the gate fails, the fix belongs to the
  owning task's files and is reported as a deviation.

## Verification
The MASTER §10 gate, verbatim, exit 0; `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` prints nothing;
`git diff --stat 9df1e72..HEAD -- client/src/types/codecs client/src/services server/src/export` is empty;
`git status --short | grep __snapshots__` prints nothing.

## Definition of done
- [ ] Gate output pasted; corpus, snapshot and lockfile checks clean.
- [ ] `ARCHITECTURE.md` updated; QA table filled honestly; plan status set (`COMPLETE` only if every manual row was performed).
