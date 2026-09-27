# HANDOFF — Multi-brush projects (plan 14)

**Current position:** PLAN COMPLETE (PARTIAL) — every wave DONE, final gate exit 0 (2026-09-27), **0 of 22 manual QA rows performed**
**Branch:** `feat/14-multi-brush-projects`
**Worktree:** `/Users/diniden/Desktop/self/pixel-art/.claude/worktrees/feat+14-multi-brush-projects`
**Base:** `origin/main @ 6f1bc44` (planned against `9007990`; the only commit between is the plan itself)
**Last commit:** `b98c2c9` task 15 docs; this ledger close follows it. Merged to `main` with `--no-ff`.

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01, 02, 03, 04 | DONE (Storybook manual checks owed: 03, 04) | 2026-09-13 | `d24bf17` 02 · `51f781f` 01 · `84d42bf` 04 · `c815d30` 03 | tsc clean · eslint 0e/66w · vitest 201 files / 4393 tests · boundaries 5/5 OK · stylelint 2 pre-existing errors / 69 warnings (unchanged) · storybook build OK · server tsc/eslint clean, vitest 5 files / 109 tests · no lockfile · no snapshot change |
| W2 | 05, 06, 07 | DONE (seam open, as designed) | 2026-09-13 | `f36da70` 06 · `f78fd8e` 07 · `4c425e3` 05 · `dfb4fea` 06 follow-up | `vitest run src/types src/api src/stores/history` 8 files / 264 tests green (corpus suites `roundtrip` 41 + `migrations` 68 unchanged) · format:check clean · no snapshot change · no lockfile · data-safety diff empty · **tsc 21 files, all in the §8 W2 seam list:** `containers/__tests__/BrushLayerPanelContainer.dom.test.tsx` · `containers/__tests__/pixelBrushTool.dom.test.tsx` · `containers/brush/__tests__/brushSelection.test.ts` · `containers/brush/__tests__/brushToolContext.test.ts` · `containers/brush/brushPanes.ts` · `containers/BrushCanvasContainer.tsx` · `containers/BrushLayerPanelContainer.tsx` · `containers/BrushLibraryContainer.tsx` · `containers/BrushTimelineContainer.tsx` · `containers/otherHand/pixelBrushWidgets.ts` · `containers/pixelBrush/__tests__/usePixelBrush.dom.test.ts` · `containers/pixelBrush/usePixelBrush.ts` · `containers/PixelStudioPanelContainer.tsx` · `stores/__tests__/brushWiring.test.ts` · `stores/domain/__tests__/BrushPixelStore.test.ts` · `stores/domain/__tests__/BrushStore.test.ts` · `stores/domain/__tests__/BrushStructureStore.test.ts` · `stores/domain/BrushPixelStore.ts` · `stores/domain/BrushStructureStore.ts` · `stores/ui/__tests__/BrushUIStore.test.ts` · `stores/ui/BrushUIStore.ts` · **vitest 13 failed / 188 passed files (161 / 4257 tests), every failing suite in the §8 W2 expected-red list:** `BrushLayerPanelContainer.dom` · `BrushStudioContainer.dom` · `BrushStudioPanelContainer.dom` · `OtherHandRailContainer.dom` · `pixelBrushTool.dom` · `PixelStudioPanelContainer.dom` · `brushSelection` · `brushToolContext` · `usePixelBrush.dom` · `brushWiring` · `BrushPixelStore` · `BrushStore` · `BrushStructureStore` (allowed but still green: `BrushUIStore`, `brushPanes`, `BrushLibrary.dom`) |
| W3 | 08, 09, 10, 11 | DONE (container seam open, as designed) | 2026-09-13 | `5677f4e` 08 · `a698b76` 10 · `326c9e7` 09 · `a8e58dc` 11 | `vitest run src/stores` **48 files / 1217 tests green** (BrushUIStore 53 · BrushStructureStore 130 · BrushPixelStore 50 · BrushStore 39 · brushWiring 16) · eslint 0e/66w · no lockfile · no snapshot change · data-safety diff empty · **tsc 13 files, all `containers/**` per the §8 W3 seam:** `containers/__tests__/BrushLayerPanelContainer.dom.test.tsx` · `containers/__tests__/pixelBrushTool.dom.test.tsx` · `containers/brush/__tests__/brushSelection.test.ts` · `containers/brush/__tests__/brushToolContext.test.ts` · `containers/brush/brushPanes.ts` · `containers/BrushCanvasContainer.tsx` · `containers/BrushLayerPanelContainer.tsx` · `containers/BrushLibraryContainer.tsx` · `containers/BrushTimelineContainer.tsx` · `containers/otherHand/pixelBrushWidgets.ts` · `containers/pixelBrush/__tests__/usePixelBrush.dom.test.ts` · `containers/pixelBrush/usePixelBrush.ts` · `containers/PixelStudioPanelContainer.tsx` · **vitest 8 failed / 193 passed files (57 / 4453 tests), every failing suite in the §8 W3 expected-red list:** `BrushLayerPanelContainer.dom` · `BrushStudioContainer.dom` · `OtherHandRailContainer.dom` · `pixelBrushTool.dom` · `PixelStudioPanelContainer.dom` · `brushSelection` · `brushToolContext` · `usePixelBrush.dom` (allowed but green: `BrushStudioPanelContainer.dom`) |
| W4 | 12, 13, 14 | DONE (manual checks owed: 12 ×5, 13 ×5, 14 ×6) | 2026-09-13 | `dc0ec19` 13 · `c0dcc24` 12 · `32f1382` 14 | **tsc clean (seam closed)** · eslint 0e/66w (≤ 66 ✓) · vitest **201 files / 4529 tests, all green** · boundaries 5/5 OK · stylelint 2 pre-existing errors / 69 warnings (unchanged) · storybook build OK · data-safety diff `6f1bc44..HEAD` empty · no snapshot change · no lockfile · `ui/components/BrushLibrary/` and `BrushLibraryContainer.tsx` gone |
| W5 | 15 | DONE (docs + gate green; every manual QA row ❌ not performed — no browser / no device in this session) | 2026-09-27 | `b98c2c9` 15 | **`bun run verify` exit 0** — tsc clean · eslint 0e/66w · format:check clean · vitest **201 files / 4529 tests passed** · vite build OK (2105 modules) · boundaries **5/5 OK** · stylelint **2 errors / 69 warnings**, both errors the pre-existing `OtherHand.css:338,359` design-token errors · `bunx storybook build` OK · server `tsc --noEmit` exit 0, `eslint .` exit 0, `vitest run` **5 files / 109 tests passed** · client `eslint . \| tail -3` = `66 problems (0 errors, 66 warnings)` (≤ 66 ✓) · no lockfile (`find` + `grep -v node_modules` prints nothing) · data-safety diff `6f1bc44..HEAD -- client/src/types/codecs client/src/services server/src/export` **empty** · `git status --porcelain \| grep __snapshots__` **prints nothing**. No application code changed by this task. Full untrimmed output under Notes. |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

For W2 and W3 the gate column must carry the actual `tsc` file list and the actual failing vitest suites, each stated as a subset of MASTER §8's allowed lists.

## Manual QA (MASTER §5 W4/W5 — consolidated by task 15)

Consolidated from the manual checks of tasks 03, 04, 12, 13 and 14. **Every row is
`❌ not performed`** for one reason: this session had **no browser and no tablet** —
Storybook and Vite were only ever *built*, never opened, and Other Hand Mode needs a
touch device. Nothing in this table was observed; no row states an observation that was
not made. The "automated coverage" column names the jsdom / node suite that exercises the
same mechanism where one exists, so the owner can see which rows are merely *unseen* and
which are genuinely *unverified*.

| # | Where | Check | Status | Observed | Automated coverage |
| --- | --- | --- | --- | --- | --- |
| 1 | 03 · Storybook `BrushList` | Typical story: three rows, each with a thumbnail and a `W×H` badge, in array order | ❌ not performed | — (no browser / no device in this session) | `ui/components/BrushList/__tests__/BrushList.dom.test.tsx` — "renders one row per brush in array order, each with a thumbnail and a W×H badge", "highlights only the selected brush", "a row with `draw: null` shows the name without a thumbnail" |
| 2 | 03 · Storybook `BrushList` | Hover reveals the four actions (up / down / duplicate / delete); `SingleBrush` shows delete disabled | ❌ not performed | — (no browser / no device in this session) | `BrushList.dom.test.tsx` — "up / down / duplicate / delete call through with the row's id, never selecting", "up is disabled at index 0 and down at the last index", "delete is disabled with one brush and onDelete never fires". **Hover *visibility* itself is CSS and has no test.** |
| 3 | 03 · Storybook `BrushList` | The "+" form opens and validates (empty, duplicate, 1..256) | ❌ not performed | — (no browser / no device in this session) | `BrushList.dom.test.tsx` — "+ opens the form with the 16×16 defaults", the empty / duplicate / case / trim validator cases, "a valid submit calls onAdd(trimmed name, w, h)", "Enter … submits; Escape cancels" |
| 4 | 03 · Storybook `BrushList` | Light **and** dark theme both legible; the panel fits the narrowest rail | ❌ not performed | — (no browser / no device in this session) | none — a visual-regression check with no harness in this repo. `bunx stylelint "src/**/*.css"` adds no new error for `BrushList.css`, which is the only automated signal. |
| 5 | 04 · Storybook `PixelStudioBrushSection` | `WithBrushPicker`: the **Brush** row is first, the dropdown opens and lists three options with sizes | ❌ not performed | — (no browser / no device in this session) | `ui/components/PixelStudioPanel/__tests__/PixelStudioBrushSection.dom.test.tsx` — picker-present / picker-absent cases and the `name (W×H)` option labels |
| 6 | 04 · Storybook `PixelStudioBrushSection` | The older stories look unchanged; light and dark | ❌ not performed | — (no browser / no device in this session) | `PixelStudioBrushSection.dom.test.tsx` + `PixelStudioPanel.dom.test.tsx` pin the non-picker branches' labels and the updated hint sentence; the *visual* comparison has no harness. |
| 7 | 12 · `bun run dev`, Brush Studio | Two brushes of different sizes: switching resizes and repaints **both** panes; no stale image; the Layer pane shows the new brush's selected layer | ❌ not performed | — (no browser / no device in this session) | `containers/brush/__tests__/brushPanes.test.ts` pins the switch at the `brushPaneScene(brushIn(doc, id), …)` expression level (node lane — jsdom has no 2d context), and `BrushCanvasContainer`'s `resyncKey` carries `selectedBrushId`. **The actual repaint is not asserted anywhere.** |
| 8 | 12 · `bun run dev`, Brush Studio | The timeline strip shows the new brush's frames and cell thumbnails; play loops **within** that brush | ❌ not performed | — (no browser / no device in this session) | `BrushTimelineContainer` resolves `selectedBrushIn(doc)` / `brushIn(doc, selectedBrushId)` in the play loop; no dom suite drives the strip's paint |
| 9 | 12 · `bun run dev`, Brush Studio | The layer panel lists the new brush's layers; "+" adds to **that brush only** | ❌ not performed | — (no browser / no device in this session) | `containers/__tests__/BrushLayerPanelContainer.dom.test.tsx` (container over a real `ApplicationStore`) + `stores/domain/__tests__/BrushStructureStore.test.ts` (every op resolves the selected brush; the R3 aliasing `it.each` over 19 ops × 2 selections) |
| 10 | 12 · `bun run dev`, Brush Studio | Paint in brush A → switch to B → paint → switch back: A intact; ⌘Z steps through both in order | ❌ not performed | — (no browser / no device in this session) | `BrushPixelStore.test.ts` (brush-scoped `resolveTarget` / `replaceLayerGrid` / `applyPatch`, spine-copy assertions) + `stores/history/__tests__/brushCommands.test.ts` (`BrushPixelTarget.brushId`, `estimateBrushBytes` over brushes) |
| 11 | 12 · `bun run dev`, Brush Studio | StrictMode: no doubled reaction, no console warning on a brush switch | ❌ not performed | — (no browser / no device in this session) | none — StrictMode double-invocation semantics under a real React root are not reproduced by any suite here (CLAUDE.md names this explicitly as non-automatable) |
| 12 | 13 · `bun run dev`, Brush Studio | The rail's top panel reads **Brushes** and lists the project's brushes with thumbnails and sizes; the header's "Brush Projects" button still opens the file modal, whose intro reads the new sentence | ❌ not performed | — (no browser / no device in this session) | `containers/__tests__/BrushListContainer.dom.test.tsx`, `BrushStudioContainer.dom.test.tsx` (the list is mounted in the `brushList` slot), `ui/components/BrushSelectModal/__tests__/BrushSelectModal.dom.test.tsx` (the new intro copy) |
| 13 | 13 · `bun run dev`, Brush Studio | "+" → name "Two", 4×4 → a new **selected** row; the canvas shows an empty 4×4; ⌘Z removes it and re-selects the first | ❌ not performed | — (no browser / no device in this session) | `BrushStructureStore.test.ts` (`addBrush` appends, selects, one snapshot commit; undo restores the previous selection) + `BrushListContainer.dom.test.tsx` (`onAdd` → `addBrush`). The **canvas** showing an empty 4×4 is not asserted. |
| 14 | 13 · `bun run dev`, Brush Studio | Double-click a name → rename → Enter; ↑/↓ reorder; duplicate; delete (disabled with one brush) | ❌ not performed | — (no browser / no device in this session) | `BrushList.dom.test.tsx` (the rename / move / duplicate / delete affordances) + `BrushStructureStore.test.ts` (`renameBrush`, `moveBrush` toward index 0, `duplicateBrush` inserting after its source with deep-copied grids, `deleteBrush` refusing the last) |
| 15 | 13 · `bun run dev`, Brush Studio | A **pre-plan brush-1 project** opens as one brush "Brush 1" with its pixels intact | ❌ not performed | — (no browser / no device in this session) | `types/__tests__/brush.test.ts` pins the legacy wrap (`normalizeBrushDocument` on a brush-1 fixture → one brush, id `brush-1`, name "Brush 1", lossless round trip). **No real owner file was opened — R1 is the reason the owner must back up `server/src/data/brushes/` first.** |
| 16 | 13 · `bun run dev`, Brush Studio | Light and dark; the panel fits the narrowest rail width; unselected brushes' thumbnails show their **frame 0** | ❌ not performed | — (no browser / no device in this session) | `BrushListContainer.dom.test.tsx` pins the frame-index choice (selected brush → its selected frame, every other → frame 0) and the `(pixelVersion + domainVersion) * 65536 + selectedFrameIndex` revision; the theme and width are visual only |
| 17 | 14 · `bun run dev`, pixel studio | Press `B`: the rail section's first row is **Brush** with a dropdown listing both brushes with sizes; the marker under the cursor is the selected brush's footprint | ❌ not performed | — (no browser / no device in this session) | `containers/__tests__/PixelStudioPanelContainer.dom.test.tsx` (the picker is supplied whenever a document is loaded; label order starts with "Brush") + `containers/__tests__/pixelBrushTool.dom.test.tsx` (footprint from the selected brush). The **on-canvas marker** is not asserted. |
| 18 | 14 · `bun run dev`, pixel studio | Pick the other brush: the marker changes immediately; the Size row and the W/H sliders show the new native size; "Native size" is disabled | ❌ not performed | — (no browser / no device in this session) | `containers/pixelBrush/__tests__/usePixelBrush.dom.test.ts` (the scaled memo re-runs on `selectedBrushId`; the reset effect keyed on the selected brush's `width`/`height`) + `PixelStudioPanelContainer.dom.test.tsx` (the Size / W-H / Native readouts) |
| 19 | 14 · `bun run dev`, pixel studio | Set W to 2× native → picking a **same-size** brush keeps it; picking a **different-size** brush resets to native | ❌ not performed | — (no browser / no device in this session) | `usePixelBrush.dom.test.ts` — the R4 pair: switch to a brush of another size → `resetSize` called; a pixel write → not called; same-size switch → kept |
| 20 | 14 · `bun run dev`, pixel studio | Stamp with each brush; colours settle per that brush's layers; ⌘Z is one step per drag | ❌ not performed | — (no browser / no device in this session) | `pixelBrushTool.dom.test.tsx` (the stamp resolves through the selected brush) + `ui/canvas/tools/__tests__/pixelBrushStamp` settling tests. The **one-undo-per-drag** behaviour through a real pointer drag is not driven here. |
| 21 | 14 · Other Hand Mode (tablet) | The Brush stack shows `B1`/`B2`; tapping switches; the Width widget's range follows | ❌ not performed | — **no tablet in this session**; Other Hand Mode is a touch surface and the owner's iPad is the only device for it | `containers/__tests__/OtherHandRailContainer.dom.test.tsx` + `containers/otherHand/pixelBrushWidgets.ts`'s spec (`B<i+1>` labels, brush name as `title`, ≥ 2 brushes, tap → `selectBrush(id, document)`, every widget's native size from the selected brush). Touch/Pencil behaviour is explicitly non-automatable here. |
| 22 | 14 · `bun run dev`, pixel studio | StrictMode: switching to the Brush tool calls `init()` once — Network tab shows **one** `GET /api/brushes` | ❌ not performed | — (no browser / no device in this session) | none — needs the browser Network tab under a real StrictMode root; `usePixelBrush.dom.test.ts` asserts the effect's *shape* but not the request count |

**Summary: 22 rows · 0 ✅ · 22 ❌ not performed.** 16 rows have a named jsdom/node suite
covering the same mechanism; 6 (rows 4, 6, 11, 21, 22, and the hover-visibility half of
row 2) have **none** and are genuinely unverified: theme/visual regression, StrictMode
double-invocation, and touch-device behaviour are the three classes CLAUDE.md names as
not automatable in this repo. Per MASTER §5 and the task's step 4 the plan's status is
therefore **PLAN COMPLETE (PARTIAL)** — every gate green, 0 of 22 QA rows observed.

## Deviations
- **01** — Four files beyond the named `Touches`, all revealed by the step-1 grep and inside the allowed `stores/**`/`containers/**` scope: `stores/ApplicationStore.ts` (two comment lines), `stores/domain/__tests__/BrushStructureStore.test.ts:124`, `containers/__tests__/BrushStudioPanelContainer.dom.test.tsx:50`, `containers/__tests__/BrushLayerPanelContainer.dom.test.tsx:70`. Local variables and `describe` labels renamed alongside the members; no assertion changed.
- **04** — `Touches` addition (coordinator-authorised): `ui/components/PixelStudioPanel/__tests__/PixelStudioPanel.dom.test.tsx`, one assertion updated from the old hint sentence to the D11 one; no other W1 task owned the file. The commit was amended to include it while it was still HEAD. `PixelStudioBrushOption` is exported from the section file only (the panel re-export is task 14's if needed). Manual Storybook checks not performed (no browser).
- **03** — `validateBrushListName` is module-private (exporting it trips `react-refresh/only-export-components`, an error); its rules are pinned through the form's DOM tests. Rename input ref is a stable `useCallback` (an inline ref re-ran `select()` per keystroke and clobbered the draft) — **note for the owner:** `BrushLayerRow.tsx` uses the inline form and may carry the same latent bug in a real browser; out of scope, untouched. Header uses the stacked panel skeleton to match the layer panel below it. Extra `Empty` story. Manual Storybook checks not performed (no browser).
- **05** — `LEGACY_BRUSH_DOCUMENT_VERSION` is exported but not read (D2's "version never read" followed over D1's wording). `brushes` "absent" = `!("brushes" in raw)`, so `{ brushes: null }` is rejected as present-but-wrong (pinned).
- **06** — Committed before task 05 landed (verified against 05's in-flight file, then re-verified after). The new contract test typed the raw `brushApi.get()` payload as `unknown` → 3 tsc errors caught by the W2 gate; fixed in a follow-up commit `dfb4fea` (cast to `BrushDocument`).
- **07** — None. Constants confirmed (`BYTES_PER_BRUSH_CELL` 10, `BYTES_SNAPSHOT_BASE` 256); the worked example pins to 696.
- **08** — Private `clearSelection()` helper for the two clear branches of `adoptDocument`; no new public surface. 42 → 53 tests.
- **09** — Brush ops use the document-level `commit` asserting `assertBrushDocument` (stronger than the task text; catches duplicate ids); `addBrush` returns `""` on non-integer/<1 dimensions; `duplicateBrush` copies applied-group objects. Every existing label and `bumpPixels` value byte-identical (asserted). File already carried one `max-lines` warning (475 → 621 code lines; still one warning, repo-wide count 66), so the optional helper split was not done. 46 → 130 tests (R3 aliasing is an `it.each` over all 19 ops × 2 selections).
- **10** — None. 39 → 50 tests.
- **11** — The pre-existing "honours a custom size" case was replaced by the mandated 3×5 case (37 → 39, not 40). Adapter is the locked snippet verbatim at `ApplicationStore.ts:984-986`.
- **12** — The "switching `selectedBrushId` re-composites" check is pinned at the `brushPaneScene(brushIn(doc, id), …)` expression level (jsdom has no 2d context; `brushPanes.test.ts` is node-lane), not by rendering the hook. `useBrushSelection.dom.test.ts` / `useBrushPointerHandlers.dom.test.ts` build no documents — untouched. `BrushStudioPanelContainer.dom.test.tsx` needed no edit. Manual (not performed, no browser): pane resize/repaint on switch; timeline follows; layer panel "+" adds to the selected brush only; paint A → B → A intact with ⌘Z; StrictMode no doubled reaction.
- **13** — `grep -rn "BrushLibrary" src` cannot reach exit 1 within `Touches`: three prose-comment mentions remain in task 03's `ui/components/BrushList/BrushList.tsx:5,19` and `BrushList.css:9` (no import, no runtime reference). Left as-is. Manual (not performed): rail "Brushes" panel + modal intro copy; "+" → 4×4 selected row + ⌘Z; rename/reorder/duplicate/delete; a pre-plan brush-1 project opens as "Brush 1" with pixels intact; light/dark + narrowest rail + frame-0 thumbnails.
- **14** — A single-brush project also shows the Brush row (D11 says ≥ 1 brush; the container supplies it whenever a document is loaded) — the panel test's label order now starts with "Brush". Manual (not performed): Brush dropdown + marker; pick → marker/Size/W-H/Native; 2× width kept vs reset across same/different-size brushes; stamp per brush + ⌘Z; Other Hand `B1`/`B2` + Width range (tablet); StrictMode single `GET /api/brushes`.
- **02** — None. Tests pin the full shape with `toStrictEqual` and a JSON round trip beyond the listed assertions.

## Notes for the next session
- 🔴 **READ FIRST — owner-facing (MASTER R1): back up `server/src/data/brushes/` before
  running the app on this branch.** The app on this branch rewrites every legacy brush-1
  file in that directory as brush-2 on its first autosave. The server keeps **one**
  `.prev/<name>.json` copy per file and nothing deeper — there is no second chance and no
  rotation, so a second save after a bad one loses the brush-1 bytes for good. The wrap
  itself is lossless and pinned by a legacy fixture round trip in
  `client/src/types/__tests__/brush.test.ts`, but QA row 15 was **not** performed against
  a real file, so nothing in this session observed the owner's own data surviving. Agents
  never read or write that directory. An older client cannot read a rewritten file.
- Worktree setup done 2026-09-13: `bun run install:all`, corpus JSONs (11) copied read-only from the launch checkout, gitignored `client/bun.lock`/`server/bun.lock` deleted (they reappear after every `bunx` in those dirs — delete before every commit).
- Baseline on `main @ 9007990`: tsc clean · eslint 0e/66w · vitest 200 files / 4361 tests · build OK · stylelint 2 pre-existing errors (`OtherHand.css:338,359`) · storybook OK · boundaries 5/5 · server 4 files / 102 tests · no lockfile.
- ⚠️ `client/src/test/__fixtures__/corpus/*.json` (11 files) is gitignored and absent in a fresh worktree — copy it from the launch checkout before the first gate or `src/types/__tests__/` fails (MASTER R7).
- Plan 13's 12 manual QA rows remain unperformed (`docs/13-brush-source-and-resize/HANDOFF.md`); they are not this plan's debt but the brush-tool rows overlap with task 14's checks — note any you happen to observe.

### W5 final gate — full output (2026-09-27, task 15)

Every command was run from the worktree as its own invocation (no compound commands), in
the order below. `ARCHITECTURE.md` was Prettier-formatted **before** `bun run verify`, so
the `format:check` inside it covers the edited file.

```
$ bun run verify                                     # from the worktree root
# typecheck → lint → format:check → client test → build
 Test Files  201 passed (201)
      Tests  4529 passed (4529)
   Duration  73.80s
$ cd client && bun run build
$ tsc --noEmit && vite build
vite v7.3.6 building client environment for production...
✓ 2105 modules transformed.
dist/index.html                         1.01 kB │ gzip:   0.53 kB
dist/assets/index-CPTEybTV.css        243.78 kB │ gzip:  30.42 kB
dist/assets/GLTFLoader--NCVAYW2.js     45.56 kB │ gzip:  13.70 kB
dist/assets/three.module-PDSP0dbZ.js  734.33 kB │ gzip: 189.46 kB
dist/assets/index-COoXs1fN.js         927.56 kB │ gzip: 271.08 kB
✓ built in 2.38s
EXIT=0
# (the only remaining stderr is the long-standing jsdom "HTMLCanvasElement's
#  getContext() … without installing the canvas npm package" notice, unchanged)

$ cd client && bunx eslint . 2>&1 | tail -3
✖ 66 problems (0 errors, 66 warnings)
  0 errors and 1 warning potentially fixable with the `--fix` option.
# 66 ≤ 66 ✓ (R6 held: neither toolWidgets.ts nor CanvasContainer.tsx was touched)

$ cd client && bun run lint:boundaries
$ bun scripts/check-boundaries.mjs
check-boundaries: OK — all 5 boundary rules hold.
EXIT=0

$ cd client && bunx stylelint "src/**/*.css"
src/ui/components/OtherHand/OtherHand.css
  338:3  ✖  Use a design token from src/styles/tokens.css (task 12)  scale-unlimited/declaration-strict-value
  359:3  ✖  Use a design token from src/styles/tokens.css (task 12)  scale-unlimited/declaration-strict-value
✖ 71 problems (2 errors, 69 warnings)
EXIT=0
# Both errors are the pre-existing OtherHand.css baseline; 69 warnings, unchanged.
# No BrushList.css or PixelStudioPanel.css error.

$ cd client && bunx storybook build
✓ built in 6.41s
info => Output directory: …/client/storybook-static
EXIT=0
# storybook-static/ is gitignored and was NOT staged.

$ cd server && bunx tsc --noEmit
EXIT=0

$ cd server && bunx eslint .
EXIT=0

$ cd server && bunx vitest run
 RUN  v3.2.7 …/.claude/worktrees/feat+14-multi-brush-projects/server
 ✓ src/__tests__/export-golden.test.ts (30 tests) 4ms
 ✓ src/__tests__/brushFiles.test.ts (50 tests) 46ms
 ✓ src/__tests__/debugLogGate.test.ts (4 tests) 2ms
 ✓ src/__tests__/brushRoutes.test.ts (7 tests) 6ms
 ✓ src/__tests__/normalizePixel.test.ts (18 tests) 3ms
 Test Files  5 passed (5)
      Tests  109 passed (109)
EXIT=0
# `server/src/data/` is absent in this worktree and NO suite needed it — the server gate
# is genuinely green here, not environmentally excused.

$ rm -f client/bun.lock server/bun.lock          # from the worktree root
$ find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
EXIT=1                                            # no match → no lockfile ✓

$ git diff --stat 6f1bc44..HEAD -- client/src/types/codecs client/src/services server/src/export
                                                  # no output → empty ✓

$ git status --porcelain | grep __snapshots__
EXIT=1                                            # no match → no snapshot change ✓
```

**Data safety.** No application code was changed by task 15 — its only two files are
`ARCHITECTURE.md` and this ledger. `client/src/types/codecs/`, `client/src/services/` and
`server/src/export/` are untouched across the whole branch (the diff above), no
`__snapshots__` file is modified, `vitest -u` was never run, and the 68-test migration
suite plus the 41-test round-trip suite passed **unchanged** inside `bun run verify`
against the 11 corpus fixtures (149 snapshots + 2 standalone projects).
