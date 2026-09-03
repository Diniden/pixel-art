# 07 — Full gate, QA sweep, handoff

**Wave:** W5 · **Depends on:** 01, 02, 03, 04, 05, 06
**Touches:** `docs/07-pose-refinements/HANDOFF.md` · (bundle/QA notes only — **no application code**)
**Effort:** M

## Objective

The refinements are proven green by the real root gate, the bundle has not regressed, and the
owner is handed **one** honest, risk-ordered checklist of everything that still needs a human
at a keyboard — merged with the 30 checks still outstanding from the original pose-tool plan.

## Context

**You are the last line of verification, and you are almost certainly blind.** No agent in
either the pose-tool plan or this one has had a browser, a GPU or a device. The 30 manual
checks in `docs/06-pose-tool/HANDOFF.md` §7 are **all still unperformed**, and this plan adds
more. Your job is *not* to make that number look smaller — it is to make the list accurate,
ordered by risk, and short enough that the owner will actually work through it.

**The bar for "verified".** Do not mark a visual, gesture or GPU behaviour as verified unless
you observed it. Re-deriving a claim from source is useful and worth reporting, but it is
**evidence about the code, not about the picture** — label it that way, as the previous plan's
task 10 did.

**Rules you are checking, not just running:**

- `bun run verify` (root) must exit **0** — `typecheck && lint && format:check && test && build`.
- `git diff -- client/src/stores/ui/UIStore.ts` must be **empty** across the whole plan. This
  is the structural proof that the wire format never changed and the 151 corpus digests could
  not have shifted.
- Stylelint: **exactly 2 errors**, both pre-existing at `OtherHand.css:338` / `:359`.
- No lockfile anywhere; `bunx` recreates `client/bun.lock`, so sweep after every invocation.
- Corpus and migration snapshots pass **unchanged**; never run `vitest -u`.
- `bun run lint:boundaries` OK; nothing under `ui/` imports a store/API/MobX.
- `PoseFraming` is **gone** from the repo — grep and prove it.

**Bundle baseline to compare against** (measured 2026-09-03, end of the pose-tool plan):

| Chunk | Size |
| --- | --- |
| main | 788.56 kB / 229.15 kB gzip |
| `three.module` (lazy) | 734.33 kB / 189.46 kB gzip |
| `GLTFLoader` (lazy) | 45.56 kB / 13.70 kB gzip |

Raising the primitive segment counts (task 02) costs **nothing** in bundle size — they are
numbers — and the part segmentation (task 05) adds only code. If main has grown by more than
a few kB, find out why. **Confirm `three` still has not leaked into the main bundle**, and use
a **positive control**: a grep that finds `BufferGeometry` 0 times in main proves nothing
unless you also show it finds it in the three chunk.

## Steps

1. Read `HANDOFF.md` end to end — every task's report, deviations and owed checks.
2. Run `bun run verify` from the root. Paste the **real** output.
3. If `format:check` fails on files this plan touched, fix **only formatting** and say exactly
   what you reformatted. Note that the root prettier glob covers only
   `*.{json,md,yaml,yml}`, `client/*`, `server/*` and `client/src/types/**` — most of this
   plan's files are outside it. Do not widen the glob.
4. Run each client-side gate command and paste real output, including the stylelint **error
   count** and the boundary result.
5. Try `bun run dev` and confirm all three processes come up (vite 5173, express 3001,
   uvicorn 8100). ⚠️ A stale mprocs session of the owner's may already hold a port — **do not
   kill the owner's processes**; launch the three commands individually if needed and say
   that is what you did.
6. **Measure the bundle** before/after and record the table. Run the `three`-leak grep with a
   positive control.
7. **Grep for dead framing references** across the whole repo: `PoseFraming`,
   `MANNEQUIN_REGIONS`, `getFramingBounds`, and stale prose comments mentioning "framing" in
   `ApplicationStore.ts` / `poseEngine.ts` / `railVisibility.ts`. Code references must be
   zero. Stale comments: report them; fix only if trivially safe and say so.
8. **Verify the corpus is untouched**: the digest tests pass, no snapshot file is modified,
   and the `UIStore.ts` diff is empty.
9. **Build the consolidated checklist.** Merge this plan's owed checks with the 30 still open
   in `docs/06-pose-tool/HANDOFF.md` §7, **de-duplicate**, and order by risk into tiers.
   Suggested Tier 1 (highest risk first):
   - free zoom really is unbounded, and pan really goes off canvas (the owner's #1 complaint);
   - Fit-at-current-rotation behaves, and does not reset zoom/pan;
   - the outline is hard-edged at 1–4 px and hugs the silhouette;
   - each mannequin part loads alone and is not empty;
   - smooth shading visible; no facet banding;
   - **WebGL context leak** over ~20 tool/mesh switches (still never tested);
   - **iPad** touch pan, double-tap stamp, and slider drag without the rail scrolling;
   - stamp still one undo entry; depth-derived heights sane (still never run on a GPU).
   Mark the superseded per-task lists as such rather than deleting them.
10. **Surface the open questions** to the owner in the ledger, including any raised by task 06
    (notably the outline-vs-stamp decision) and D14's preset/projection behaviour, which the
    owner chose to keep and revisit after real use.
11. Update `HANDOFF.md`: final status, gate output, bundle table, the consolidated checklist,
    every deviation across all tasks, and a plain statement of what is and is not verified.
12. Commit the ledger.

## Constraints

- **Do not change application behaviour.** If you find a real bug, **record it clearly** in
  `HANDOFF.md` rather than fixing it — a bug found at the gate with no owner sign-off is a
  report, not a patch.
- Formatting-only fixes are permitted; behavioural ones are not.
- Do not mark this task `DONE` while manual checks are outstanding — **`PARTIAL` is the
  honest status** when the visual/gesture/GPU checks have not been performed, and it is the
  correct outcome, not a failure.
- Never run `vitest -u`. Never create a lockfile. Never touch `server/src/data/`.

## Verification

```sh
bun run verify                                                 # exit 0 — paste it
cd client && bunx stylelint "src/**/*.css"                     # exactly 2 errors
cd client && bun run lint:boundaries                           # OK
cd client && bunx storybook build                              # exit 0
git diff -- client/src/stores/ui/UIStore.ts                    # EMPTY
git status --short -- '*__snapshots__*'                        # EMPTY
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules    # EMPTY
grep -rn "PoseFraming\|MANNEQUIN_REGIONS\|getFramingBounds" client/src   # no CODE hits
```

## Definition of done

- [ ] `bun run verify` exits 0, real output pasted.
- [ ] All three dev processes confirmed up (or honestly explained).
- [ ] Bundle table recorded; `three` proven still absent from main **with a positive control**.
- [ ] Framing machinery proven gone from the codebase.
- [ ] Corpus digests unchanged; `UIStore.ts` diff empty; no snapshot touched; no lockfile.
- [ ] **One** consolidated, de-duplicated, risk-ordered manual checklist covering this plan
      **and** the 30 outstanding from the pose-tool plan.
- [ ] Open questions surfaced for the owner.
- [ ] Status recorded honestly — `PARTIAL` if the manual checks remain unperformed.
