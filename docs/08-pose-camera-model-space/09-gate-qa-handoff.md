# 09 — Full gate, QA sweep, handoff

**Wave:** W7 · **Depends on:** 01, 02, 03, 04, 05, 06, 07, 08
**Touches:** `docs/08-pose-camera-model-space/HANDOFF.md` · (bundle/QA notes only — **no application code**)
**Effort:** M

## Objective

The refinements are proven green by the real root gate, the persisted wire format is proven
unharmed, the bundle has not regressed, and the owner is handed **one** honest, risk-ordered
checklist merged with the **41 checks still outstanding** from plans 06 and 07.

## Context

**You are the last line of verification, and you are almost certainly blind.** No agent in plans
06, 07 or this one has had a browser, a GPU or a device. **0 of 41** consolidated checks from
`docs/07-pose-refinements/HANDOFF.md` §7.7 have been observed, and this plan adds more.

⚠️ **This plan is unusually visual.** Six of its eleven items — the pulsing, the pan clipping,
part centring, scale-about-origin, viewpoint semantics, preset restore — **can only be confirmed
by looking**. Unit tests can prove the arithmetic is rotation-invariant; they cannot prove the
model stops breathing on screen. **Say this plainly. Do not let a green gate imply a working
feature.**

**The bar for "verified".** Do not mark a visual, gesture or GPU behaviour verified unless you
observed it. Re-deriving a claim from source is useful and worth reporting, but it is **evidence
about the code, not about the picture** — label it that way.

**Rules you are checking, not merely running:**

- `bun run verify` (root) exits **0** — `typecheck && lint && format:check && test && build`.
- ⚠️ **`git status --short -- '*__snapshots__*'` is EMPTY.** Task 08 changed the persisted wire
  format; this is the proof it did so **without** disturbing the 151 corpus digests.
- ⚠️ **`git diff -- client/src/stores/ui/UIStore.ts` is NOT empty this time** — task 08 added one
  `assign()` line. **Verify it is exactly that**: one conditional key, never `key: undefined`.
  This inverts the check every previous plan made, so read the diff rather than pattern-matching.
- Stylelint: **exactly 2 errors**, both pre-existing at `OtherHand.css:338`/`:359`.
- No lockfile anywhere; `bunx` recreates `client/bun.lock`, so sweep after every invocation.
- Corpus and migration snapshots pass **unchanged**; never run `vitest -u`.
- `bun run lint:boundaries` OK; nothing under `ui/` imports a store/API/MobX.
- **`scaleCameraParams` is gone** (task 03 deleted it) — grep and prove it.

**Bundle baseline** (measured 2026-09-03, end of plan 07):

| Chunk | Size |
| --- | --- |
| main | 793.89 kB / 231.22 kB gzip |
| `three.module` (lazy) | 734.33 kB / 189.46 kB gzip |
| `GLTFLoader` (lazy) | 45.56 kB / 13.70 kB gzip |

This plan adds UI components and store logic; a few kB is expected. **Confirm `three` still has
not leaked into main, and use a POSITIVE CONTROL** — a grep finding `BufferGeometry` *n* times in
main proves nothing unless you also show it found in the three chunk. ⚠️ Plan 07 measured
`BufferGeometry` at **1** in main (a `new n.BufferGeometry` namespace access, not library source)
and **26** in the three chunk. Compare against that, not against zero.

## Steps

1. Read `HANDOFF.md` end to end — every task's report, deviations and owed checks.
2. Run `bun run verify` from the root. Paste the **real** output.
3. If `format:check` fails on files this plan touched, fix **only formatting** and say exactly
   what you reformatted. Note the root prettier glob covers only `*.{json,md,yaml,yml}`,
   `client/*`, `server/*` and `client/src/types/**` — most of this plan's files are outside it.
   **Do not widen the glob.**
4. Run each client gate command and paste real output, including the stylelint **error count**
   and the boundary result.
5. ⚠️ **Run the data-safety block and read every line:**
   ```sh
   git status --short -- '*__snapshots__*'
   git diff -- client/src/types/__tests__/__snapshots__/
   git diff -- client/src/stores/ui/UIStore.ts        # expect EXACTLY one assign() line
   git diff --stat -- server/
   ```
   **If a corpus snapshot moved, STOP** — record it and hand it to the owner. Do not regenerate.
6. **Prove the persisted key is conditional.** Show that a store with no presets builds a state
   **without** the key, and one with a preset includes it. Cite the test.
7. Try `bun run dev` and confirm all three processes come up (vite 5173, express 3001, uvicorn
   8100). ⚠️ **A stale mprocs session of the owner's may hold a port — do NOT kill the owner's
   processes.** Launch the three individually if needed and say that is what you did.
8. **Measure the bundle** and record the table, with the positive control.
9. **Grep for dead code** this plan should have removed: `scaleCameraParams`, and any remaining
   reference to pose `zoom` where it should now be `scale`. Report stale prose comments; fix only
   if trivially safe and say so.
10. **Build the consolidated checklist.** Merge this plan's owed checks with the **41** still open
    in `docs/07-pose-refinements/HANDOFF.md` §7.7, **de-duplicate**, and order by risk into tiers.
    Several will overlap (smooth shading, WebGL context leak, iPad gestures). Suggested **Tier 1**,
    highest risk first:
    - **the model does not pulse** through a full orbit (item 4 — the fix is arithmetic never rendered);
    - **panning does not clip** and stays pixel-aligned (item 3);
    - **parts are centred** and rotate about themselves (items 2/7);
    - **scale grows the model about its origin** with the camera visibly still (item 6);
    - **Left turns the model to face left** (item 11 — third time these signs have moved);
    - **save a preset, reload, restore** (item 10 — the only persistence path);
    - **stamping includes the outline, and leaves existing normals/heights intact** (item 1);
    - **iPad slider drag** no longer scrolls the rail (fixed but unverified);
    - **WebGL context leak** over ~20 tool/mesh switches (still never tested);
    - **GPU depth-derived heights** (still never executed on a GPU).
    Mark the superseded per-task lists as superseded rather than deleting them.
11. **Surface the open questions and decisions** for the owner, including: **F8 — F7 supersedes
    D14**; task 05's scale/pan-on-preset decision; task 07's light-representation decision (F11);
    and task 01's full-mannequin-centring decision if it deviated.
12. Update `HANDOFF.md`: final status, gate output, bundle table, the consolidated checklist,
    every deviation across all tasks, and a plain statement of what is and is not verified.
13. Commit the ledger.

## Constraints

- **Do not change application behaviour.** If you find a real bug, **record it clearly** in
  `HANDOFF.md` rather than fixing it — a bug found at the gate with no owner sign-off is a
  report, not a patch.
- Formatting-only fixes are permitted; behavioural ones are not.
- **Do not mark this task `DONE` while manual checks are outstanding** — **`PARTIAL` is the
  honest status**, and the correct one, when the visual/gesture/GPU checks have not been done.
- ⚠️ **Do not set the plan's Current position to `COMPLETE`** — the coordinator does that after
  verifying your work.
- Never run `vitest -u`. Never create a lockfile. Never touch `server/src/data/`.

## Verification

```sh
bun run verify                                                 # exit 0 — paste it
cd client && bunx stylelint "src/**/*.css"                     # exactly 2 errors
cd client && bun run lint:boundaries                           # OK
cd client && bunx storybook build                              # exit 0
git status --short -- '*__snapshots__*'                        # EMPTY — the critical one
git diff -- client/src/stores/ui/UIStore.ts                    # exactly one assign() line
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules    # EMPTY
grep -rn "scaleCameraParams" client/src                        # no hits — task 03 deleted it
```

## Definition of done

- [ ] `bun run verify` exits 0, real output pasted.
- [ ] ⚠️ **No corpus snapshot changed** — proven, and stated as the headline data-safety result.
- [ ] `UIStore.ts`'s diff is exactly one conditional `assign()` line, never `key: undefined`.
- [ ] The preset key is proven absent when no preset exists.
- [ ] All three dev processes confirmed up (or honestly explained).
- [ ] Bundle table recorded; `three` proven still absent from main **with a positive control**.
- [ ] `scaleCameraParams` proven gone; stale `zoom` references reported.
- [ ] **One** consolidated, de-duplicated, risk-ordered checklist covering this plan **and** the
      41 outstanding from plans 06/07.
- [ ] Open questions and superseded decisions (esp. **F8 vs D14**) surfaced for the owner.
- [ ] Status recorded honestly — `PARTIAL` if manual checks remain unperformed.
