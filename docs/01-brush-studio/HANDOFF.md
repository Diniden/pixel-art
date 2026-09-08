# HANDOFF — Brush Studio

**Current position:** W2 IN PROGRESS (W1 code-complete; 5 manual checks owed)
**Branch:** `feat/01-brush-studio` (cut 2026-09-08 from `feat/09-ipad-pencil-fixes` @ `3845480`)
**Last commit:** `f1d0e0b` (W1)

Planned 2026-08-29 from `feat/rail-layout-controls` @ `37a4bce` with a dirty worktree (103
uncommitted files of unrelated in-flight work — see MASTER §4). Executors stage only their
`Touches` files.

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 05 | PARTIAL (code DONE, gate green; task 03 manual checks owed) | 2026-09-08 | `f1d0e0b` | client: tsc clean · eslint 0 err/65 warn · vitest 165 files, 3394 tests pass (baseline 164/3362), no snapshot diff · boundaries OK · server: tsc clean · vitest 102 pass (52+50) · eslint clean · no lockfile |
| W2 | 04, 06, 12, 13, 14, 15 | IN PROGRESS | 2026-09-08 | | |
| W3 | 07, 10 | TODO | | | |
| W4 | 08, 09 | TODO | | | |
| W5 | 11 | TODO | | | |
| W6 | 16, 17, 18 | TODO | | | |
| W7 | 19 | TODO | | | |
| W8 | 20 | TODO | | | |
| W9 | 21 | TODO | | | |
| W10 | 22 | TODO | | | |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

## Deviations
- **W1/03 — one file outside `Touches` edited:** `ui/components/Toolbar/__tests__/Toolbar.dom.test.tsx`
  (committed after the plan baseline; consumed the removed `isLightingMode` prop, so tsc went red).
  Minimal prop rename + switcher count 2→3. No other W1 task touches `Toolbar/`; matrix unaffected.
- **W1/03 —** `Toolbar.tsx` tool-group routing was an unlisted boolean site; made an exhaustive
  `switch` (`"brush"` → pixel tools per D19). Frame Reference button is now pixel-only. Studio
  buttons are data-driven with `--pixel/--lighting/--brush` modifiers (attribute selector dropped).
- **W1/02 —** `create` returns 200 (matches `routes/project.ts`), arrays rejected as documents,
  `listBrushes` also filters stems through `isValidProjectName`, extra export `getBrushPrevFilePath`.
- **W1/02 — residue on the owner's disk:** the curl overwrite check left
  `server/src/data/brushes/.prev/zz-plan-test.json` (~100 B). Harmless (listing ignores `.prev`);
  no API removes `.prev` files; owner may delete by hand.
- **W1/05 —** `DomainStore` diff is 4 added lines (Prettier formats the getter to 3 + blank), not ≤3.
- **W1/01 —** `clampDelta` folds `-0` → `+0`; `normalizeBrushDocument` floors fractional
  width/height and fills missing frame/layer ids by index (spec said "lenient", gave no rule).
- **Coordinator —** cut `feat/01-brush-studio` from `feat/09-ipad-pencil-fixes` instead of staying
  on the 09 branch: every prior plan in this repo has its own `feat/NN-*` branch.

## Notes for the next session
- **Manual checks owed for W1/03 (no browser available to executors):** (1) three studio buttons
  render, stacked when the toolbar is vertical, active state on current; (2) Brush → placeholder
  with working "Back to Pixel Studio", project intact; (3) hotkey from pixel↔lighting, from brush →
  pixel; (4) reload while in brush mode boots into the placeholder and Back works; (5) iPad: the
  new button is tappable.
- **Start-state (2026-09-08):** the tree was dirty with the owner's in-flight thumbnail-cache
  work (18 modified files incl. `stores/ApplicationStore.ts` +73, `containers/CanvasContainer.tsx`,
  `LayerPanelContainer.tsx`, `ThumbnailCanvas`, plus untracked `ui/canvas/thumbnailCache.ts` and
  two `__tests__` dirs). None of it overlaps W1–W4 `Touches`. **Task 11 (W5) touches
  `ApplicationStore.ts`, which is dirty** — before dispatching W5, check whether the owner has
  committed that work; if not, stop and ask rather than let an executor stage a mixed file.
- MASTER §4 line numbers were measured at `37a4bce`; nine plans have landed since (e.g.
  `StudioMode` is now `types/domain.ts:480`, not `:279`). Executors must grep, not trust lines.
