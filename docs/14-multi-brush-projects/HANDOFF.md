# HANDOFF — Multi-brush projects (plan 14)

**Current position:** W3 IN PROGRESS (2026-09-13)
**Branch:** `feat/14-multi-brush-projects`
**Worktree:** `/Users/diniden/Desktop/self/pixel-art/.claude/worktrees/feat+14-multi-brush-projects`
**Base:** `origin/main @ 6f1bc44` (planned against `9007990`; the only commit between is the plan itself)
**Last commit:** `dfb4fea` (W2 complete — seam open by design)

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04 | DONE (Storybook manual checks owed: 03, 04) | 2026-09-13 | `d24bf17` 02 · `51f781f` 01 · `84d42bf` 04 · `c815d30` 03 | tsc clean · eslint 0e/66w · vitest 201 files / 4393 tests · boundaries 5/5 OK · stylelint 2 pre-existing errors / 69 warnings (unchanged) · storybook build OK · server tsc/eslint clean, vitest 5 files / 109 tests · no lockfile · no snapshot change |
| W2 | 05, 06, 07 | DONE (seam open, as designed) | 2026-09-13 | `f36da70` 06 · `f78fd8e` 07 · `4c425e3` 05 · `dfb4fea` 06 follow-up | `vitest run src/types src/api src/stores/history` 8 files / 264 tests green (corpus suites `roundtrip` 41 + `migrations` 68 unchanged) · format:check clean · no snapshot change · no lockfile · data-safety diff empty · **tsc 21 files, all in the §8 W2 seam list:** `containers/__tests__/BrushLayerPanelContainer.dom.test.tsx` · `containers/__tests__/pixelBrushTool.dom.test.tsx` · `containers/brush/__tests__/brushSelection.test.ts` · `containers/brush/__tests__/brushToolContext.test.ts` · `containers/brush/brushPanes.ts` · `containers/BrushCanvasContainer.tsx` · `containers/BrushLayerPanelContainer.tsx` · `containers/BrushLibraryContainer.tsx` · `containers/BrushTimelineContainer.tsx` · `containers/otherHand/pixelBrushWidgets.ts` · `containers/pixelBrush/__tests__/usePixelBrush.dom.test.ts` · `containers/pixelBrush/usePixelBrush.ts` · `containers/PixelStudioPanelContainer.tsx` · `stores/__tests__/brushWiring.test.ts` · `stores/domain/__tests__/BrushPixelStore.test.ts` · `stores/domain/__tests__/BrushStore.test.ts` · `stores/domain/__tests__/BrushStructureStore.test.ts` · `stores/domain/BrushPixelStore.ts` · `stores/domain/BrushStructureStore.ts` · `stores/ui/__tests__/BrushUIStore.test.ts` · `stores/ui/BrushUIStore.ts` · **vitest 13 failed / 188 passed files (161 / 4257 tests), every failing suite in the §8 W2 expected-red list:** `BrushLayerPanelContainer.dom` · `BrushStudioContainer.dom` · `BrushStudioPanelContainer.dom` · `OtherHandRailContainer.dom` · `pixelBrushTool.dom` · `PixelStudioPanelContainer.dom` · `brushSelection` · `brushToolContext` · `usePixelBrush.dom` · `brushWiring` · `BrushPixelStore` · `BrushStore` · `BrushStructureStore` (allowed but still green: `BrushUIStore`, `brushPanes`, `BrushLibrary.dom`) |
| W3 | 08, 09, 10, 11 | IN PROGRESS | 2026-09-13 | | |
| W4 | 12, 13, 14 | TODO | | | |
| W5 | 15 | TODO | | | |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

For W2 and W3 the gate column must carry the actual `tsc` file list and the actual failing vitest suites, each stated as a subset of MASTER §8's allowed lists.

## Manual QA (MASTER §5 W4/W5 — consolidated by task 15)

| # | Where | Check | Status | Observed |
| --- | --- | --- | --- | --- |
| (filled by task 15 from tasks 03, 04, 12, 13, 14) | | | | |

## Deviations
- **01** — Four files beyond the named `Touches`, all revealed by the step-1 grep and inside the allowed `stores/**`/`containers/**` scope: `stores/ApplicationStore.ts` (two comment lines), `stores/domain/__tests__/BrushStructureStore.test.ts:124`, `containers/__tests__/BrushStudioPanelContainer.dom.test.tsx:50`, `containers/__tests__/BrushLayerPanelContainer.dom.test.tsx:70`. Local variables and `describe` labels renamed alongside the members; no assertion changed.
- **04** — `Touches` addition (coordinator-authorised): `ui/components/PixelStudioPanel/__tests__/PixelStudioPanel.dom.test.tsx`, one assertion updated from the old hint sentence to the D11 one; no other W1 task owned the file. The commit was amended to include it while it was still HEAD. `PixelStudioBrushOption` is exported from the section file only (the panel re-export is task 14's if needed). Manual Storybook checks not performed (no browser).
- **03** — `validateBrushListName` is module-private (exporting it trips `react-refresh/only-export-components`, an error); its rules are pinned through the form's DOM tests. Rename input ref is a stable `useCallback` (an inline ref re-ran `select()` per keystroke and clobbered the draft) — **note for the owner:** `BrushLayerRow.tsx` uses the inline form and may carry the same latent bug in a real browser; out of scope, untouched. Header uses the stacked panel skeleton to match the layer panel below it. Extra `Empty` story. Manual Storybook checks not performed (no browser).
- **05** — `LEGACY_BRUSH_DOCUMENT_VERSION` is exported but not read (D2's "version never read" followed over D1's wording). `brushes` "absent" = `!("brushes" in raw)`, so `{ brushes: null }` is rejected as present-but-wrong (pinned).
- **06** — Committed before task 05 landed (verified against 05's in-flight file, then re-verified after). The new contract test typed the raw `brushApi.get()` payload as `unknown` → 3 tsc errors caught by the W2 gate; fixed in a follow-up commit `dfb4fea` (cast to `BrushDocument`).
- **07** — None. Constants confirmed (`BYTES_PER_BRUSH_CELL` 10, `BYTES_SNAPSHOT_BASE` 256); the worked example pins to 696.
- **02** — None. Tests pin the full shape with `toStrictEqual` and a JSON round trip beyond the listed assertions.

## Notes for the next session
- Worktree setup done 2026-09-13: `bun run install:all`, corpus JSONs (11) copied read-only from the launch checkout, gitignored `client/bun.lock`/`server/bun.lock` deleted (they reappear after every `bunx` in those dirs — delete before every commit).
- Baseline on `main @ 9007990`: tsc clean · eslint 0e/66w · vitest 200 files / 4361 tests · build OK · stylelint 2 pre-existing errors (`OtherHand.css:338,359`) · storybook OK · boundaries 5/5 · server 4 files / 102 tests · no lockfile.
- ⚠️ `client/src/test/__fixtures__/corpus/*.json` (11 files) is gitignored and absent in a fresh worktree — copy it from the launch checkout before the first gate or `src/types/__tests__/` fails (MASTER R7).
- ⚠️ Owner-facing (MASTER R1): the app on this branch rewrites brush-1 files under `server/src/data/brushes/` as brush-2 on first autosave (the server keeps one `.prev/` copy). Back that directory up before running the app on the branch. Agents never read or write it.
- Plan 13's 12 manual QA rows remain unperformed (`docs/13-brush-source-and-resize/HANDOFF.md`); they are not this plan's debt but the brush-tool rows overlap with task 14's checks — note any you happen to observe.
