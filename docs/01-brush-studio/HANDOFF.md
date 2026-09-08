# HANDOFF — Brush Studio

**Current position:** W3 IN PROGRESS (W1–W2 code-complete; manual checks owed, see Notes)
**Branch:** `feat/01-brush-studio` (cut 2026-09-08 from `feat/09-ipad-pencil-fixes` @ `3845480`)
**Last commit:** `226da76` (W2)

Planned 2026-08-29 from `feat/rail-layout-controls` @ `37a4bce` with a dirty worktree (103
uncommitted files of unrelated in-flight work — see MASTER §4). Executors stage only their
`Touches` files.

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 05 | PARTIAL (code DONE, gate green; task 03 manual checks owed) | 2026-09-08 | `f1d0e0b` | client: tsc clean · eslint 0 err/65 warn · vitest 165 files, 3394 tests pass (baseline 164/3362), no snapshot diff · boundaries OK · server: tsc clean · vitest 102 pass (52+50) · eslint clean · no lockfile |
| W2 | 04, 06, 12, 13, 14, 15 | PARTIAL (code DONE, gate green; Storybook visual checks owed for 12/13/14) | 2026-09-08 | `226da76` | tsc clean · eslint 0 err/65 warn · vitest 170 files, 3480 tests pass (W1: 165/3394), no snapshot diff · boundaries OK · stylelint 2 errors = pre-existing `OtherHand.css:338,359` baseline, 0 new · storybook ✓ built in 6.02s · no lockfile |
| W3 | 07, 10 | IN PROGRESS | 2026-09-08 | | |
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
- **W2/15 — prop shape:** `hiddenRails?: ReadonlySet<"left"|"right"|"bottom">` instead of the task's
  `focusMode: boolean` (both existing layouts dropped `focusMode` on 2026-08-30; `useRailLayout()`
  returns `hiddenRails`, and task 19 spreads it). Also passes through `canvasOverlay?`/`railDismiss?`.
  **Follow-up for 19/22:** `ui/layouts/__tests__/layouts.dom.test.tsx` mounts every story of the
  three older layouts; add a `BrushStudioLayout` block there.
- **W2/06 —** `PixelBuffer` imported from `./renderNormalEdit` — `renderScene.ts` no longer exists
  (deleted by plan 05). `renderBrushLayer` paints regardless of `visible` (thumbnails show hidden
  layers' content); `renderBrushFrame` skips hidden layers. Digest pinned: `16x16:682f7e4d`.
- **W2/12 —** extra `BrushChannelMenu.css` (kept the sheet under ~300 lines), `BrushLayerRowModel`
  gained optional `appliedGroupId?: string | null` (menu needs the id to tick the active group;
  falls back to name match), 19-test jsdom suite added under `__tests__/`.
- **W2/13 —** extra `BrushLibrary/brushName.ts` (shared validator), `storyFixtures.ts`, two jsdom
  suites (25 tests); `BrushSelectModal` built on the `Modal` + `ConfirmDialog` primitives (not
  `ProjectSelectModal`'s hand-rolled overlay) and gained optional `container?: HTMLElement | null`.
- **W2/14 —** composed `Slider` + `NumberInput` directly (zero tick needs a positioned track wrapper;
  `SliderWithNumber` doesn't forward `disabled`); swatch is a `div role="img"`, not `ColorSwatch`;
  optional `className?` prop; 12-test jsdom suite. Positive values show no `+` prefix.
- **W2/04 —** `brushApi.save` sends no `syncOriginHeaders()` (D12: no broadcast); `notFoundHandlers()`
  gained a `*/api/brush` 404 entry.
- **Coordinator —** cut `feat/01-brush-studio` from `feat/09-ipad-pencil-fixes` instead of staying
  on the 09 branch: every prior plan in this repo has its own `feat/NN-*` branch.

## Notes for the next session
- **Manual checks owed for W1/03 (no browser available to executors):** (1) three studio buttons
  render, stacked when the toolbar is vertical, active state on current; (2) Brush → placeholder
  with working "Back to Pixel Studio", project intact; (3) hotkey from pixel↔lighting, from brush →
  pixel; (4) reload while in brush mode boots into the placeholder and Back works; (5) iPad: the
  new button is tappable.
- **Manual checks owed for W2 (Storybook, `bun run storybook` → http://localhost:6006):**
  12 — channel menu renders *above* the panel un-clipped (jsdom proves the portal, not layout);
  keyboard nav and inline rename felt in a real browser. 13 — visual look only (name validation,
  Escape/backdrop close, delete confirm are jsdom-covered). 14 — slider drag updates the swatch
  live; **iPad numeric keyboard accepts a leading minus** (plain `type="number"`, no `inputMode`).
- **Start-state (2026-09-08):** the tree was dirty with the owner's in-flight thumbnail-cache
  work (18 modified files incl. `stores/ApplicationStore.ts` +73, `containers/CanvasContainer.tsx`,
  `LayerPanelContainer.tsx`, `ThumbnailCanvas`, plus untracked `ui/canvas/thumbnailCache.ts` and
  two `__tests__` dirs). None of it overlaps W1–W4 `Touches`. **Task 11 (W5) touches
  `ApplicationStore.ts`, which is dirty** — before dispatching W5, check whether the owner has
  committed that work; if not, stop and ask rather than let an executor stage a mixed file.
- MASTER §4 line numbers were measured at `37a4bce`; nine plans have landed since (e.g.
  `StudioMode` is now `types/domain.ts:480`, not `:279`). Executors must grep, not trust lines.
