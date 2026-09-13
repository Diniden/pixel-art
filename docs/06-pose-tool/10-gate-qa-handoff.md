# 10 — Full gate, QA sweep and handoff

**Wave:** W5 · **Depends on:** 01–09
**Touches:** `docs/06-pose-tool/HANDOFF.md` · `ARCHITECTURE.md` *(only if a section genuinely needs it — see Constraints)*
**Effort:** M

## Objective

The whole plan is verified end to end: the full root gate exits 0, `bun run dev` starts all
three processes, the complete QA script has been walked by hand, the bundle cost is measured
and recorded, and `HANDOFF.md` is a truthful account of what landed — including anything
partial, deviated or blocked.

## Context

**No application code is written in this task.** If you find a bug, your job is to *record*
it precisely; fix it only if it is a one-line, obviously-correct correction, and then say so
explicitly in the ledger. Anything larger becomes a follow-up item, not a silent edit here.

The house rule from `CLAUDE.md`: **"Run the gate and paste the real output. 'It passes' is
not a report."** Paste actual command output into `HANDOFF.md`, not summaries.

**Baselines you are checking against** (measured 2026-09-02, before this plan):

| Check | Baseline |
| --- | --- |
| `bunx tsc --noEmit` | exit 0, clean |
| `bunx stylelint "src/**/*.css"` | **exactly 2 errors** (`ConfirmDialog.css:15`, `IconButton.css:32`) + 67 warnings |
| `bunx eslint .` | 0 errors, ~64 warnings |
| lockfile | **none, and must stay none** |
| corpus/wire-format snapshots | pass **unchanged**, never `-u` |

⚠️ The worktree also contained **unrelated in-flight work** (an edge/fill colour split)
across `types/domain.ts`, `PixelStudioTools.tsx`, `UIStore.ts` and `CanvasContainer.tsx`.
When you assess the final state, distinguish that work from this plan's. Do not attribute it
to the plan, and do not revert it.

## Steps

1. **Run the full root gate** and paste the real output:

   ```sh
   cd /Users/diniden/Desktop/self/pixel-art
   bun run verify        # typecheck && lint && format:check && test && build
   ```

   If `format:check` fails on files this plan touched, run `bun run format` and commit the
   formatting as its **own** commit (formatting is a separate commit by house rule).

2. **Run each client gate individually** and paste the output:

   ```sh
   cd client
   bunx tsc --noEmit
   bunx eslint .
   bunx vitest run
   bun run lint:boundaries
   bunx stylelint "src/**/*.css"      # confirm EXACTLY 2 errors
   bunx storybook build
   ```

3. **Confirm the data-safety invariants:**

   ```sh
   cd /Users/diniden/Desktop/self/pixel-art
   find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # must print nothing
   git status --short -- '*__snapshots__*' '*.snap'              # must be empty
   grep -rn "frozen-lockfile" --include=*.json --include=*.md --include=*.sh . | grep -v node_modules
   ```

   Confirm no key was added to `toPersistedUIState()` by diffing
   `client/src/stores/ui/UIStore.ts` against the plan's start commit and checking the
   builder is untouched by *this plan* (the edge/fill work may have touched it — say which
   is which).

4. **Measure the bundle cost** and record it:

   ```sh
   cd client && bun run build && ls -lh dist/assets/ | sort -k5 -h
   ```

   Confirm three is in a **separate lazy chunk**, record its size, and record the main entry
   chunk's size. Note whether the main bundle grew.

5. **Start the app** and confirm all three processes come up:

   ```sh
   cd /Users/diniden/Desktop/self/pixel-art && bun run dev
   ```

6. **Walk the full QA script** below. Record a result for **every** item. "Not tested" is an
   acceptable, honest result; a silent omission is not.

7. **Write `HANDOFF.md`**: every wave's status, commit hashes, the pasted gate output, every
   deviation, every BLOCKED item, the manual-check results from tasks 01–09, and a
   "Priority checks for the owner" section listing what only they can judge (visual quality,
   iPad touch behaviour, whether the pixelation reads well as reference).

8. **Commit** the docs: `docs(06): plan complete — gate output and QA results recorded`.

## The QA script

Record a result for each. Items marked ⚠️ are the ones most likely to be quietly wrong.

**Pixelation quality — the point of the feature**
1. ⚠️ The model renders with **hard, blocky, aliased edges** at the artwork's resolution.
   No smooth silhouette, no gradient banding from a downscale.
2. ⚠️ It stays crisp at every canvas zoom level, and stays aligned to the pixel grid.
3. On a **small** grid (e.g. 32×32) the model reads as genuinely chunky and useful as
   reference.
4. On a **large** grid (e.g. 256×224) it still renders at 1:1 without stretching.

**Framing**
5. Every mesh auto-centres with visible padding on load.
6. Non-square grids fit the limiting axis without clipping.
7. ⚠️ A 45°-rotated model does not clip at the frame edges.

**Controls** — every control in the rail changes the render as expected (mesh, framing,
rotation orb, viewpoints, light orb, both colours, projection, all five presets, zoom, FOV).
8. Record any control that does nothing or does the wrong thing.

**Gestures**
9. Mouse drag pans; does not draw; does not rotate.
10. ⚠️ **Touch** drag pans (real device if possible, else emulation); the rail does not
    scroll; the canvas does not draw.
11. Double-click stamps; ⚠️ **double-tap** stamps.

**Stamp**
12. Stamped pixels land exactly where the model appeared.
13. ⚠️ **One** undo removes the whole stamp; one redo restores it.
14. A selection masks the stamp.
15. ⚠️ Normals are correct — the lighting studio's lit preview shades the stamped pixels as
    the 3D model was shaded. Note if the depth/height fallback was used.
16. Record the wall-clock time of a full-canvas stamp on the largest available object.

**Lifecycle**
17. ⚠️ Switch tools and change meshes ~20× each; the console shows **no** WebGL context
    warnings.
18. ⚠️ StrictMode: no doubled renderer, no doubled overlay, no mount/unmount errors.
19. Switching projects clears the pose.
20. Resizing the object resizes the overlay and re-fits the model; pan survives a resize and
    resets on a mesh change.

**Regressions — nothing else may have changed**
21. Pencil, eraser, both fills, line, rectangle, ellipse, move, selection, eyedropper,
    origin all behave as before.
22. ⚠️ The **reflection** tool still mirrors correctly and its guides still draw.
23. The **lighting studio** opens, its normal/height tools work, and the preview thumbnail
    renders.
24. Onion skin, frame trace and reference-image overlays still render in the right order.
25. ⚠️ Marching ants, origin cross and reflection guides still render **above** the artwork.
26. Undo/redo across a mixed session behaves normally; autosave still fires.
27. Split canvas still works (it does **not** get the pose overlay — that is correct).
28. Export still produces correct output.
29. ⚠️ Drawing performance on a large sprite is unchanged **while the pose tool is not
    selected**.

## Constraints

- **Write no application code**, beyond a one-line obviously-correct fix that you then
  declare explicitly in the ledger.
- **Never `vitest -u`.** If a snapshot differs, that is a finding to report, not to accept.
- Do not "tidy" anything. Do not revert the unrelated edge/fill work.
- Only edit `ARCHITECTURE.md` if the pose tool genuinely warrants a line in an existing
  section (e.g. the overlay list or the "How to make a change" guidance). Keep it to a few
  lines; do not restructure the document.
- Do not merge to `main` or open a PR unless the owner asks.
- Do not mark a wave DONE whose manual checks were skipped — mark it PARTIAL and say which.

## Verification

Everything in Steps 1–5 is the verification. The task is complete when:

- `bun run verify` exits **0** and its real output is pasted into `HANDOFF.md`.
- Stylelint reports **exactly 2** errors.
- **No lockfile** and **no updated snapshots**.
- `bun run dev` starts all three processes.
- Every one of the 29 QA items has a recorded result.

## Definition of done

- [ ] `bun run verify` exits 0; **real output pasted** into `HANDOFF.md`.
- [ ] Every individual client gate command run and its output recorded.
- [ ] Stylelint **exactly 2** errors; no lockfile; no snapshot files modified; no
      `toPersistedUIState()` key added by this plan.
- [ ] Bundle sizes recorded, with three confirmed in a **separate lazy chunk**.
- [ ] `bun run dev` starts all three processes.
- [ ] All **29** QA items have a recorded result, including honest "not tested" entries.
- [ ] `HANDOFF.md` records every wave's status, commits, deviations, BLOCKED items and the
      manual-check results from tasks 01–09.
- [ ] A "Priority checks for the owner" section lists what only they can judge.
- [ ] Docs committed.
