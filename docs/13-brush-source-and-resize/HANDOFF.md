# HANDOFF — Brush colour source and resizable brushes (plan 13)

**Current position:** PLAN COMPLETE (PARTIAL) — every wave DONE, final gate exit 0 (coordinator re-ran it 2026-09-13), **0 of 12 manual QA rows performed**
**Branch:** `feat/13-brush-source-and-resize`
**Worktree:** `/Users/diniden/Desktop/self/pixel-art/.claude/worktrees/feat+13-brush-source-and-resize`
**Base:** `origin/main @ 33266af`
**Last commit:** `b118941` task 15 docs; this ledger close follows it

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 07, 08 | DONE | 2026-09-13 | `5ae84e4` 01 · `505a794` 08 · `ede8319` 07 | tsc clean · eslint 0e/66w · vitest 195 files / 4179 tests · boundaries 5/5 OK · format:check clean · no lockfile · no snapshot change |
| W2 | 02, 03, 05, 09 | DONE (tsc seam closed by 04 in W3) | 2026-09-13 | `d85bec0` 02 · `1b6b995` 09 · `39a234e` 05 · `02ed705` 03 | tsc **2 errors** (`BrushLayerPanelContainer.tsx:80,96` — `colorSource` / `onSetColorSource` missing; task 04's files) · eslint 0e/66w · vitest 196 files / 4248 tests · boundaries 5/5 OK · stylelint 2 pre-existing errors only, panel CSS clean · storybook build OK · no lockfile · no snapshot change |
| W3 | 04, 06, 10, 11 | DONE (manual checks owed: 04 ×5, 06 ×4) | 2026-09-13 | `f46e0c8` 04 · `be79eb2` 11 · `3286ac1` 06 · `94a018a` 10 | tsc clean · eslint 0e/66w · vitest 199 files / 4322 tests · boundaries 5/5 OK · `git diff --stat 33266af..HEAD -- client/src/types/codecs client/src/services server/src/export` empty · no snapshot change · no lockfile |
| W4 | 12, 13, 14 | DONE (manual checks owed: 12 ×4, 13 ×8, 14 ×4) | 2026-09-13 | `8f91c67` 14 · `e378801` 12 · `2e98340` 13 | tsc clean · eslint 0e/66w (≤ 66 ✓) · vitest 200 files / 4361 tests · boundaries 5/5 OK · stylelint 2 pre-existing errors / 69 warnings (unchanged from W2) · storybook build OK · no lockfile · no snapshot change |
| W5 | 15 | PARTIAL (gate green; all 12 manual QA rows not performed — no browser / no device) | 2026-09-13 | `b118941` 15 | `bun run verify` exit 0: client tsc clean · server tsc clean · eslint 0e/66w client, 0e/0w server · format:check clean · vitest 200 files / 4361 tests · vite build OK · boundaries 5/5 OK · stylelint 71 problems = 2 pre-existing errors (`OtherHand.css:338,359`) / 69 warnings · storybook build OK · server tsc clean / eslint clean / vitest 4 files / 102 tests · no lockfile · data-safety diff `33266af..HEAD` empty · no snapshot change |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

## Manual QA (MASTER §11 — filled by task 15)

Filled 2026-09-13 by task 15. **No row was performed** — the session had no browser and no tablet, so nothing below was observed. The "Automated coverage" column lists the jsdom / node tests that exercise the same mechanism; they are evidence the code path works, **not** a substitute for the check (none renders in a real browser, none sees the marker, a theme, a rail width, StrictMode or a Pencil). The plan stays **PARTIAL** until every row is performed and its observation recorded here.

| # | Where | Check | Status | Observed | Automated coverage (jsdom / node) |
| --- | --- | --- | --- | --- | --- |
| 1 | Brush Studio | "+" shows Colour source above Channels; picking a source keeps the menu open; picking a channel creates and closes; the new row shows the chosen badge | ❌ not performed | — (no browser / no device in this session) | `BrushChannelMenu.dom.test.tsx` "the add button opens a source-then-channel menu and reports onAddLayer(type, 'selected') by default", "picking Target pixel ticks and KEEPS the menu open; the channel pick then reports 'target'", "focuses the first ticked row on open and the arrows traverse source, channels, then groups" (DOM order only); `BrushLayerPanelContainer.dom.test.tsx` "the '+' flow — Target pixel, then RGB — creates a layer with colorSource 'target' in every frame" |
| 2 | Brush Studio | Row badge menu changes `SEL`↔`TGT`; ⌘Z reverts; timeline add-layer inherits the selected layer's source | ❌ not performed | — (no browser / no device in this session) | `BrushLayerPanelContainer.dom.test.tsx` "the SEL badge → Target pixel reaches setLayerColorSource: every frame gains the key, one history entry" (asserts the row re-reads `TGT`), "the TGT badge → Selected colour drops the key in every frame". ⌘Z as a keystroke and the timeline add-layer inheritance have **no** automated coverage |
| 3 | Pixel studio | HSL L −60 Target brush darkens paint, skips empty canvas; back-and-forth in one stroke darkens once; second stroke compounds; ⌘Z one step | ❌ not performed | — (no browser / no device in this session) | `pixelBrushTool.dom.test.tsx` "a press on a red cell darkens it from ITS colour; a press on an empty cell writes nothing", "a back-and-forth drag in ONE stroke burns a cell once; a second stroke burns it again", "app.undo() restores the pre-burn pixel in one step" — with an **rgb −100 red** target fixture, not the HSL L −60 brush the row names; the HSL path is covered only at the pure level (`pixelBrushStamp.test.ts`) |
| 4 | Pixel studio | Reflection lines on: the mirrored side is burned too | ❌ not performed | — (no browser / no device in this session) | **None** for the brush tool with reflection on (`pixelBrushTool.dom.test.tsx` has no reflection case; mirroring is the pre-existing `setPixels` funnel) |
| 5 | Pixel studio | Mixed brush (target centre + selected ring) shows both behaviours in one press | ❌ not performed | — (no browser / no device in this session) | `pixelBrushTool.dom.test.tsx` "a mixed brush shows both semantics in one press: the target cell burns the canvas, the selected cell paints the base" — a 3×1 fixture (target at (0,0), selected beside it), not a centre + ring |
| 6 | Rail | W slider moves H at the native ratio; marker grows; lock → independent; re-lock captures the new ratio | ❌ not performed | — (no browser / no device in this session) | `PixelStudioPanelContainer.dom.test.tsx` "nudging W calls setWidth and, locked, H follows at the native ratio" (driven with `fireEvent.change`, not a real drag), "unlock, then choose on X: only that axis changes and the sliders move independently"; `PixelBrushUIStore.test.ts` "re-locking at 32×8 captures ratio 0.25 → setWidth(64) → height 16"; `usePixelBrush.dom.test.ts` "setWidth(6) on a 3×3 brush (locked → 6×6) gives a nearest footprint of 4 × \|painted\| cells" (the footprint grows; the marker itself is never rendered) |
| 7 | Rail | EPX → both axes EPX, crisp 2× marker; unlocked Lanczos 3 on X with EPX on Y → Y becomes Nearest | ❌ not performed | — (no browser / no device in this session) | `PixelStudioPanelContainer.dom.test.tsx` "a 2-D pick on one axis while unlocked takes both axes (D11)"; `PixelBrushUIStore.test.ts` "unlocked: a kernel on x demotes a 2-D y to nearest", "locked: a 2-D scaler sets both axes"; `pixelBrushScale/__tests__/` pins EPX's output numerically. "Crisp" is visual — not covered |
| 8 | Rail | "Native size" restores; loading a brush with other dimensions resets to its native size | ❌ not performed | — (no browser / no device in this session) | `PixelStudioBrushSection.dom.test.tsx` "is disabled at native and enabled once the size differs"; `usePixelBrush.dom.test.ts` "installing a 4×4 document after a 3×3 resets width/height to null; strategies are kept", "installing another document with the SAME native size keeps the chosen size"; `OtherHandRailContainer.dom.test.tsx` "Native resets the size back to the brush's own" |
| 9 | Rail | Section fits the narrowest rail width; light and dark themes | ❌ not performed | — (no browser / no device in this session) | **None** — layout and theme are not observable in jsdom (`PixelStudioBrushSection.stories.tsx` exists for the visual pass; `bunx storybook build` OK) |
| 10 | Performance | A 64×64 brush at 256×256 with Lanczos 3: no visible lag on drag vs `main`; native size unchanged | ❌ not performed | — (no browser / no device in this session) | `usePixelBrush.dom.test.ts` "at native size `size` is the document's own and the layers pass through unscaled", "the SAME stamp reference survives a re-render with an EQUAL base colour", "at a scaled size the stamp reference is still stable across a re-render with an equal colour" (reference stability, not timing). No timing measurement exists |
| 11 | Other hand (tablet) | Brush section shows Width, Ratio, Height, Scale, Size widgets; Width drags Height while Locked; `Free` releases; 12-button stack fits; positions persist | ❌ not performed | — (no browser / no device in this session) | `OtherHandRailContainer.dom.test.tsx` "renders Width, Ratio, Height, Scale and Size widgets at the native size", "ArrowUp on Width calls setWidth, and Height follows while locked" (keyboard, not a thumb drag), "tapping Locked → Free releases the ratio: Width then leaves Height alone", "the Scale stack marks NN active; tapping BIL sets both axes while locked", "unlocked shows Scale X and Scale Y stacks, each bound to its own axis", "persists a dragged position under the tool:brush key" (pointer events + stubbed `getBoundingClientRect`). Whether the 12-button stack **fits** a real thumb reach is not covered |
| 12 | StrictMode | `bun run dev`: switching to the Brush tool calls `init()` once; no duplicate-reset warning on the native-size effect | ❌ not performed | — (no browser / no device in this session) | `usePixelBrush.dom.test.ts` "calls brushes.init() from an effect when enabled", "calls init() once the tool becomes enabled on a later render"; `pixelBrushTool.dom.test.tsx` "calls brushes.init() on selecting the tool, so a fresh load gets a brush". **Neither suite renders under `<StrictMode>`**; the reset effect's idempotence is reasoned (task 12 deviation), not observed |

Summary: **0 of 12 rows ✅, 12 of 12 ❌** (not performed). The plan is **PARTIAL**, not COMPLETE.

## Deviations
- **W2 gate / plan layout** — task 03 (W2) makes `BrushLayerRowModel.colorSource` and `onSetColorSource` required while the container that supplies them is task 04 (W3), so tsc cannot be clean between W2 and W3 as planned. Every other W2 check is green. W2 is marked PARTIAL and W3 proceeds; the W3 gate (tsc clean) closes it.
- **02** — Step 3 (register as a MobX action) is moot: `BrushStructureStore` deliberately has no `makeObservable` (writes happen inside `BrushStore.commit`); the setter follows `setLayerChannelType`'s plain-method pattern.
- **03** — Two badge element states + `anchorEl` (not one generalised `badgeEl`) so each badge carries its own `aria-expanded`/ring; initial row-menu focus lands on the ticked source row; `--target` tint uses the `accent-success` tokens. Manual Storybook checks not performed (no browser): portal position, tint/ring appearance, un-clipped rendering above the rail scroller.
- **05** — None. Selected-seeded cells are built without a `targetDeltas` key (pinned with `toStrictEqual`).
- **04** — None in code. Manual (not performed, no browser): "+" with Target pixel → row shows `TGT`; ⌘Z removes the layer; badge changes the source; ⌘Z reverts the badge; timeline add-layer inherits the selected layer's source.
- **06** — None in code (`CanvasContainer.tsx` +25 lines). Manual (not performed): HSL L −60 Target brush darkens paint and skips empty canvas; back-and-forth in one stroke burns once; ⌘Z one step; reflection lines burn the mirrored side.
- **10** — hq2x **registered** (12 options). `PixelBrushScaler.id` in `pixelArt.ts` is a closed union, so `PIXEL_BRUSH_HQ2X` is typed `PixelBrushHqxScaler` and `index.ts` gains `PixelBrush2DStrategy` / `PIXEL_BRUSH_2D_STRATEGY_IDS`. "Different" = `cellDistance > 48` (the original's Y tolerance as one L1 budget). Blends only among painted cells; otherwise the heaviest cell is copied. **Owner awareness:** the 256-case table in `hqxTable.ts` was transcribed (by a validating script) from the reference hq2x source, which is LGPL; the owner should decide whether that provenance is acceptable for this repo.
- **11** — `setLockRatio(true)` while locked is a no-op (ratio captured only on false→true); driven side clamped first, derived side computed from the clamped value; non-finite input clamps to 1; native ratio uses the clamped native (no divide-by-zero); `PixelBrushAxis` type alias added.
- **12** — Reset effect deps are `[app, nativeWidth, nativeHeight]` (consts of `doc?.width/height`) to avoid an `exhaustive-deps` complex-expression warning; same behaviour. Manual (not performed): W slider grows the marker; press writes the scaled footprint; no added lag at native size vs `main`; StrictMode double-run of the reset effect (reasoned idempotent, not observed).
- **13** — Container test drives the W slider with `fireEvent.change` (jsdom does not step a native range input on arrow keys; the keyboard path would need the `Slider` primitive, outside `Touches`). Picker label uses `__brush-scale-label` (not `__brush-label`) so existing four-row assertions hold. Lock hover restated so the `IconButton` primitive's danger-red hover does not apply. Manual (none performed): W → H follows + marker grows; lock → independent; re-lock captures ratio; EPX → both + crisp 2×; Lanczos 3 on X with EPX on Y → Y flips to Nearest; Native size; narrowest rail width; light/dark.
- **14** — `toolWidgets.ts` had 0 lint warnings before and after (its 407 raw lines are under 400 code lines). Position-persist test drives the grip with pointer events + stubbed `getBoundingClientRect` (no keyboard path for the grip; copies `OtherHand.dom.test.tsx` precedent). Stale comment at `toolWidgets.ts:60-61` left untouched (scope). Manual (tablet, none performed): thumb reach; Width drags Height while Locked; `Free` releases; 12-button stack fits; positions survive exit/re-enter.
- **09** — Zero-sized source returns `[]`; `dstW`/`dstH` normalised with `max(1, floor)` so identity detection matches what the kernels would produce; read-only grids cast at the `resamplePixelBrushGrid` call sites rather than editing `kernels.ts`.
- **01** — `isColorSource` is exported (task's DoD lists it; `isChannelType` stays private). Extra normaliser cases (`"TARGET"`, non-string) added; all additive.
- **07** — Lanczos-3 step pin: the task-agent's first pin (`−255` at i=0) was wrong; the true value is `−240` (third lobe reaches across the step). Pinned with the derivation. Task's bilinear numbers (`100, 75, 25, 0`) were correct. `box`/`nearest` use the half-open box `(−0.5, 0.5]` so ties match `floor(u+0.5)`.
- **08** — xBR tie rule: the published `d(E,F) <= d(E,H) ? F : H` is not transpose-symmetric on ties, so ties are resolved symmetrically (equal cells → that cell; different cells → keep `E`); documented in the header and pinned. Extra exports `cellDistance`, `XBR_PAINT_PENALTY` (4096), `PixelBrushGrid` for task 10's reuse (MASTER D9).

## Notes for the next session
- **Coordinator's own final-gate run (2026-09-13, after `b118941`)**: `bun run verify` → client tsc clean · eslint 0e/66w · prettier clean · vitest 200 files / 4361 tests · vite build ✓ 2104 modules; server tsc clean · eslint clean · vitest 4 files / 102 tests; boundaries 5/5 OK; stylelint 71 problems = 2 pre-existing errors (`OtherHand.css:338,359`) / 69 warnings; storybook ✓ built; data-safety diff `33266af..HEAD` empty; no snapshot change; no lockfile. 20 commits on `feat/13-brush-source-and-resize` above `origin/main @ 33266af`.
- **To finish the plan**: perform the 12 manual QA rows above in a browser (rows 11 needs a tablet), record observations, then set Current position to COMPLETE. Merge from the launch checkout with `git merge --no-ff feat/13-brush-source-and-resize`.
- **Corpus fixtures**: `client/src/test/__fixtures__/corpus/*.json` is gitignored and absent in a fresh worktree; `server/src/data/` (the regenerate source) is absent too. The 11 JSONs were copied read-only from the launch checkout's corpus dir into this worktree (2026-09-13); corpus suites then pass (`src/types/__tests__/` 3 files / 139 tests, digests unchanged). A new worktree needs the same copy.
- `bun run install:all` and any `bunx` in `client/` write gitignored `client/bun.lock` / `server/bun.lock` (no `bunfig.toml` in those dirs). Delete before every commit.
- Baseline gate on `main @ 9df1e72`: tsc clean · eslint 0e/66w · vitest 193 files / 4027 tests · build OK · no lockfile.
- Task 10 (hq2x) has an explicit deferral rule: if its symmetry test cannot pass, commit nothing from it and record the attempt here.
- **hq2x table provenance (owner decision pending):** `client/src/ui/canvas/tools/pixelBrushScale/hqxTable.ts` was transcribed (by a validating script; the 8-transform symmetry suite proves the transcription) from the reference hq2x implementation, which is **LGPL**. Task 10's deviation entry above records it; `ARCHITECTURE.md` now points here. The owner should decide whether that provenance is acceptable for this repo before merging to `main`.
- **W5 final gate (task 15, 2026-09-13)** — run from the worktree, each command separately, no application code changed by task 15 (`Touches`: `ARCHITECTURE.md`, this file). In this worktree no `bun.lock` was created by any of the `bunx` calls below; `rm -f client/bun.lock server/bun.lock` was still run before committing.

  ```
  $ bun run verify                                   # root: typecheck → lint → format:check → test → build
    client  tsc --noEmit                              clean
    server  tsc --noEmit                              clean
    client  eslint .                                  ✖ 66 problems (0 errors, 66 warnings)   [baseline 66 ✓]
    server  eslint .                                  clean (no output)
    prettier --check                                  All matched files use Prettier code style!
    client  vitest run                                Test Files  200 passed (200) · Tests  4361 passed (4361)
                                                      (corpus golden digests: every backup file "round-trip stability holds")
    client  tsc --noEmit && vite build                ✓ 2104 modules transformed · ✓ built in 2.28s
  EXIT=0

  $ cd client && bun run lint:boundaries
    check-boundaries: OK — all 5 boundary rules hold.
  EXIT=0

  $ cd client && bunx stylelint "src/**/*.css"
    src/ui/components/OtherHand/OtherHand.css
      338:3  ✖  Use a design token from src/styles/tokens.css (task 12)  scale-unlimited/declaration-strict-value
      359:3  ✖  Use a design token from src/styles/tokens.css (task 12)  scale-unlimited/declaration-strict-value
    ✖ 71 problems (2 errors, 69 warnings)             [the 2 pre-existing errors from the main baseline; unchanged since W2]
  EXIT=2  (pre-existing; not a regression of this plan)

  $ cd client && bunx storybook build
    ✓ built in 6.20s
    info => Output directory: …/client/storybook-static   (213 asset lines; not committed)
  EXIT=0

  $ cd server && bunx tsc --noEmit                    EXIT=0 (clean)
  $ cd server && bunx eslint .                        EXIT=0 (no output)
  $ cd server && bunx vitest run                      Test Files  4 passed (4) · Tests  102 passed (102)   EXIT=0

  $ find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
    (nothing)                                         EXIT=1 (grep found nothing)
  $ git diff --stat 33266af..HEAD -- client/src/types/codecs client/src/services server/src/export
    (empty)                                           EXIT=0
  $ git status --short | grep __snapshots__
    (nothing)                                         EXIT=1 (grep found nothing)
  ```

  `bun run verify`'s `format:check` stage ran before task 15's `ARCHITECTURE.md` edit; `bunx prettier --check ARCHITECTURE.md` and a second `bun run format:check` were run on the edited file afterwards (see the task-15 report / commit).
