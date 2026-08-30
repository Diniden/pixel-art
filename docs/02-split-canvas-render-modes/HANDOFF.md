# HANDOFF — Split Canvas Render Modes

**Current position:** W3 IN PROGRESS
**Branch:** `feat/02-split-canvas-render-modes` (from `main` @ `d1fc2ac`, clean tree — the dirty-worktree caveat in MASTER §4 no longer applies)
**Last commit:** `a8a0ada`

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04 | DONE | 2026-08-29 | `e347b83` (03), `ba5b5af` (04), `e8f475e` (02), `df12b59` (01) | tsc clean · eslint 0 errors/64 warnings (= baseline) · vitest 117 files / 1984 tests pass (68.7 s; baseline 113/1948 + 4 new suites; corpus digests unchanged) · lint:boundaries `OK — all 5 boundary rules hold` · stylelint 2 errors = pre-existing `OtherHand.css:267,288`, 66 warnings · storybook `✓ built in 5.52s` · no lockfile | |
| W2 | 05 | DONE | 2026-08-29 | `d040af7`, `de7a086`, `a8a0ada` | tsc clean · eslint 0 errors (CanvasContainer: same 1 pre-existing max-lines warning) · vitest 117 files / 1984 tests pass (68.8 s; corpus unchanged) · lint:boundaries OK · prettier clean · no lockfile. Only `CanvasContainer.tsx` in the diff (+166/−34). |
| W3 | 06 | TODO | | | |

## Deviations
- **Start state:** plan was written against `feat/rail-layout-controls` @ `37a4bce` with a dirty tree; executed from `main` @ `d1fc2ac` (owner committed the in-flight work). All cited line numbers verified still accurate. MASTER §4's dirty-worktree caveat is moot.
- **03 (CSS-only):** divider selector is `.canvas-split__pane + .canvas-split__pane` (spec's `--dual >` compound form raised stylelint `selector-max-*` warnings; a lone pane has no sibling so behaviour is identical). Added a top-level `.canvas-split--dual { flex-direction: row }` so `check-classes.mjs` (which ignores `@media`-nested selectors) does not flag the modifier as orphaned.
- **02:** `__btn--arrow` carries one declaration (`flex: none`) purely so check-classes sees it declared.
- **05 (substantive, correct):** the task claimed `isEditingVariantResolved` alone routes everything. Not true — `editableGrid` fill sampling and the eyedropper use it to pick *which grid to read* (data, not view). Forcing it false in Layer mode would have made fills/eyedropper read the base layer. Executor split it: `hasVariantData = Boolean(editingVariant && variantData)` for those three data sites; `isEditingVariantResolved = !layerMode && hasVariantData` is the view switch. In Full mode both equal the old value.
- **Untracked, not ours:** `docs/plans/reflection-tool.md` (modified) and `docs/03-reflection-tool/` appeared during W1 — another session is planning in parallel. Left untouched, never staged.

## Notes for the next session
- **W2 manual checks (task 05):** executor drove headless Chrome against a scratchpad COPY of the server (port 3002, copied `data/`; real `server/src/data/` never written). Full mode 16/17 automated checks passed (the one "fail" was the pre-existing pan clamp at 2.08× view zoom — reproduced identically on the baseline file); temporary Layer-mode check 10/10 passed (variant grid 15×15 at zoom, no outline/offset; pencil at (0,0) lands at `variantOffset` when back in Full; independent layer camera). NOT done: touch/pinch, human-eye visual pass.
- **Follow-up (not in plan):** the Layer camera mounts at `panOffset {0,0}` so a freshly opened Layer pane sits top-left until its reset is pressed. The Full pane behaves the same on a brand-new project (`constants.ts:35`), so this is consistent, but auto-centring on first open would be a nicer default. Would need a `CanvasContainer` change.
- **Pre-existing, unrelated:** React warning on "New Layer" click — `Cannot update a component (ObjectLibraryContainer) while rendering a different component (LayerPanelContainer)`.
- **Manual checks owed from W1 (nobody performed):** `bun run storybook` visual pass on `CanvasViewControls` (4 stories: square/equal buttons, mode button top of stack, arrows as a bottom row right of the stack) and `CanvasSplit` (Dual = two equal halves + 1px divider; portrait → stacked). Task 01's `bun run dev` start check is folded into the W2/W3 gates.
