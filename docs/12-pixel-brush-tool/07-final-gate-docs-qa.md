# 07 — Final gate, docs, QA checklist, HANDOFF close-out

**Wave:** W3 · **Depends on:** 05, 06
**Touches:** `ARCHITECTURE.md` · `docs/12-pixel-brush-tool/HANDOFF.md` · formatting-only changes to files this plan added (Prettier sweep)
**Effort:** S

## Objective
The brush tool is verified with the complete gate, `ARCHITECTURE.md` documents it (a new "Brush
tool (pixel studio)" paragraph under the "Brush documents" subsection), and the ledger closes honestly
with a consolidated manual QA checklist and open items.

## Context
- Root `bun run verify` = typecheck + lint + format:check + client test + build; it does **not** run
  server tests, `lint:boundaries`, `lint:css`, or storybook — run those explicitly.
- `format:check` covers `client/src/types/**` and config files only; sweep every file this plan
  added/edited with `bunx prettier --check` (list via `git log --name-only 8ed9c1d..HEAD`).
- `ARCHITECTURE.md` §3 "Brush documents" subsection (line ~123) ends with the plan-11 paragraphs
  ("Camera and panes", "Edge/fill deltas"). Add a **"Brush tool (pixel studio)"** bullet: the `"brush"`
  `Tool` member and `B` hotkey; `ui/canvas/tools/pixelBrushStamp.ts` (footprint = painted cells of the
  current frame's visible layers, origin `floor(w/2), floor(h/2)`; settle = base edge colour + deltas
  bottom→top, RGB in RGB space, HSL in HSL space via `colorMath`, `normal`/`heightmap` footprint-only;
  last-write-wins segment stamping); `containers/pixelBrush/usePixelBrush.ts` (calls `brushes.init()` on
  demand, memoises footprint/stamp, grids never observed); the optional `ToolContext.pixelBrushStamp` and
  `FootprintOptions.pixelBrushOffsets` seams; hidden/inert in the brush studio; nothing persisted.
- Baseline for the plan: the start commit recorded in `HANDOFF.md`.

## Steps
1. Full gate, paste every summary line: `bun run verify`;
   `cd client && bun run lint:boundaries && bunx stylelint "src/**/*.css" && bunx storybook build`;
   `cd server && bunx tsc --noEmit && bunx eslint . && bunx vitest run`; lockfile check;
   `git status --short`. Stylelint: only the pre-existing `OtherHand.css` errors (or fewer).
   Corpus safety: `git diff --stat 8ed9c1d..HEAD -- client/src/types/codecs client/src/services server/src/export`
   is empty and no `__snapshots__` file changed in `git log --name-only 8ed9c1d..HEAD`.
2. Prettier sweep (formatting-only commit if anything changed; re-run tsc + affected tests).
3. `ARCHITECTURE.md` update; commit `pixel-brush(07): document the pixel-studio brush tool in ARCHITECTURE.md`.
4. Consolidate every owed manual check from tasks 01, 04, 05, 06 into one numbered
   "Manual QA checklist (owed — none performed by executors)" table in `HANDOFF.md` (desktop / iPad
   columns) and an "Open items" list: `normal`/`heightmap` layers footprint-only; HSL scale constants
   (±255 ↔ ±360° / ±100 %) awaiting owner confirmation; fill-slot base colour; applied groups / target
   layers; brush scaling with `brushSize`, spacing, frame animation; last-used brush not remembered
   (`init()` loads `brushList[0]`); `setStudioMode` resets the tool to `"pixel"`; `B` in the brush studio
   selects an inert tool; anything executors flagged.
5. `HANDOFF.md`: W3 row, final gate output, current position, last commit; commit `docs(12): …`.

## Constraints
- No feature code changes. If the gate fails, report BLOCKED with output; do not patch.

## Verification
The step-1 commands, pasted; `ARCHITECTURE.md` diff shown.

## Definition of done
- [ ] Full gate green (stylelint ≤ baseline); corpus-sensitive paths zero diff; no snapshot changed.
- [ ] `ARCHITECTURE.md` updated; QA checklist and open items recorded; HANDOFF closed out.
