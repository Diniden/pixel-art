# 08 — Characterisation: pure utilities and the store behaviour contract

**Wave:** W5 · **Depends on:** 06
**Touches:** `client/src/utils/__tests__/alphaBlend.test.ts` · `client/src/utils/__tests__/edgeInterpolate.test.ts` (new) · `client/src/utils/__tests__/previewRenderer.test.ts` (new) · `client/src/utils/__tests__/lightingRenderer.test.ts` (new) · `client/src/components/Canvas/__tests__/drawingUtils.test.ts` (new) · `client/src/components/AnchorGrid/__tests__/getAnchorPadding.test.ts` (new) · `client/src/store/__tests__/storeContract.ts` (new) · `client/src/store/__tests__/helpers.test.ts` (new) · `client/src/store/__tests__/history.test.ts` (new) · `client/src/store/__tests__/drawing.test.ts` (new) · `client/src/store/__tests__/selection.test.ts` (new) · `client/src/store/__tests__/layers.test.ts` (new) · `client/src/store/__tests__/variants.test.ts` (new) · `client/src/store/__tests__/lighting.test.ts` (new) · `client/src/store/__tests__/autoSave.test.ts` (new)
**Effort:** L

## Objective

After this task the pure utilities that the Canvas decomposition stands on are pinned by unit tests, and the current Zustand store's *behaviour* is pinned behind a narrow harness interface that the MobX store will later satisfy unchanged. This is what makes the store migration verifiable rather than hopeful.

## Context

### Part A — pure utilities

Cheap, total, no mocking. These are the substrate every later canvas split depends on. All run in the fast `unit` (node) project — no jsdom.

| File | Function(s) | Assertions to write | Why |
| --- | --- | --- | --- |
| `client/src/utils/alphaBlend.ts` | `blendPixels` (`:45`) | src `a=0` → dst unchanged; src `a=255` → src; `a=128` over opaque → a known midpoint (compute once, hard-code it); dst `a=0` → src; both transparent → transparent; **`normal` and `height` preserved per current rules** | Alpha compositing exists **5×** in this codebase, and two functions were literally named `alphaBlend` (`utils/alphaBlend.ts:11` — deleted as dead by task 02 — and `utils/lightingRenderer.ts:46`). Before anything unifies them, assert what each does; they may not agree. |
| `client/src/components/Canvas/drawingUtils.ts` | `getLinePixels` (`:4`) | horizontal, vertical, both diagonals, single point (`start === end` → 1 px), steep vs shallow slope, negative direction, **endpoint inclusivity** | Bresenham. Used by every stroke tool and by the mouse and touch paths, which have **already drifted** from each other. |
| | `getRectanglePixels` (`:141`), `getEllipsePixels` (`:190`) | outline vs fill vs both (all 3 `ShapeMode` values); 1×1; zero-size; reversed corners (x2 < x1); corner radius 0 and radius > half-size | 3 modes × 2 functions |
| | `getSquarePixels` (`:500`), `getCirclePixels` (`:522`) | size 1 → exactly 1 px; sizes 2, 3, 4 (even/odd centring); the returned set is **symmetric** | These feed the brush. The touch eraser at `Canvas.tsx:2766-2772` skips the bounds `.filter()` that the mouse path applies at `:2217-2222` — a latent out-of-bounds write. |
| | `floodFill` (`:279`) | fill a bounded region; fill from a corner; fill an already-target-coloured region (assert which of empty/full it returns); a 1-px region; a region touching all four edges; **fill starting on a transparent pixel** | The transparent case is where the comparison bug lives. |
| | `gaussianFloodFill` (`:380`) + `isSamePixelColor` (`:355`) | **Pin the behaviour at the former `TS2367` site (`drawingUtils.ts:438`).** `isSamePixelColor` is private, so assert through `gaussianFloodFill`: given a region of **transparent** pixels (`color: 0`), run it, **record the actual returned region, and assert that.** | Task 02 fixed the always-false comparison at that line. This test records what the behaviour is **after** that fix and locks it in, so any later refactor of the fill path is checked against a real baseline. |
| `client/src/utils/edgeInterpolate.ts` | `computeEdgeInterpolatedNormals` (`:468`) | a 5×5 square layer → normals point outward on edges and are `DEFAULT_NORMAL`-ish in the interior; empty layer → no output; single-pixel layer → defined output; **deterministic across runs** | 506 lines, one algorithm. Assert on a **hash of the normal grid**, not every value — the spherical-mean math at `:347-412` is not worth transcribing. |
| `client/src/utils/previewRenderer.ts` | `renderFramePreview` (`:51`), `renderVariantFramePreview` (`:260`), `renderLayerPreview` (`:340`) | buffer hash for a fixture frame at scale 1, 2, 8; hidden layer excluded; empty frame → checkerboard-only hash; **variant offset applied** | The reference implementation for ~8 duplicated pixel-blit loops. `getCheckerboard` (`:12`) is one of 4 checkerboard implementations. |
| `client/src/utils/lightingRenderer.ts` | `composeLayers` (`:70`), `renderWithLighting` (`:299`), `renderNormalAsRGB` (`:388`), `renderHeightAsGrayscale` (`:444`) | output-buffer hash under a **fixed** light direction / colour / ambient; light directly-on vs grazing vs behind; `calculateShadow` on and off; height 0 vs 255 | Pure buffer producers. Fixed inputs are essential: `DEFAULT_LIGHT_DIRECTION` is `{x:-64, y:-64, z:180}` (`types/index.ts:242`). |
| `client/src/store/helpers.ts` | the variant-offset resolution at `:71` | all 4 fallback levels **in priority order**: `variantOffsets[selectedVariantId]` → `variantOffset` → `variant.baseFrameOffsets[i]` → `{x:0,y:0}`; `selectedVariantId` undefined → the `""` key lookup | **This exact chain is duplicated 6×** — `Canvas.tsx:541,663,1113,1390,1915` and `server/src/routes/export.ts:657`. One test protects six call sites. Diff all six against each other before anything unifies them; they may have drifted. |
| `client/src/components/AnchorGrid/AnchorGrid.tsx` | `getAnchorPadding` (`:160`) | all **9** anchor positions × grow and shrink × even and odd deltas | It is imported by `client/src/store/variantActions.ts:14` — a store→UI-component import, and a layering violation a later task removes. Test it before it moves. |

Use the `canvasStub.ts` buffer-hash helper installed by task 06 for every hash assertion. **Do not add a canvas-rendering native dependency** — jsdom has no canvas, and the plan deliberately structures renderers around `ImageData`-like buffers instead.

**Explicitly out of scope here:** `edgeInterpolate`'s 12 private math helpers, and the chrome renderers that genuinely need a `CanvasRenderingContext2D` (marching ants, lasso, origin cross). Those go to manual review.

### Part B — the store behaviour contract

**Goal: write assertions that pass against the Zustand store today and against the MobX store tomorrow, with only the setup lines changing.**

Write every store test against a **narrow adapter interface**, never against `useEditorStore` directly:

```ts
// client/src/store/__tests__/storeContract.ts
export interface StoreHarness {
  getProject(): Project | null;
  getUiState(): UIState;
  dispatch<K extends keyof EditorActions>(action: K, ...args: Parameters<EditorActions[K]>): void;
  getHistoryLength(): number;
  getHistoryIndex(): number;
  reset(): void;
}

// Today:
export function createZustandHarness(): StoreHarness { /* wraps useEditorStore.getState() */ }

// Later, added alongside by the MobX tasks; the Zustand one is deleted last:
// export function createMobxHarness(): StoreHarness { /* wraps new ApplicationStore() */ }
```

Every behaviour test is then `describe.each([["zustand", createZustandHarness]])`. During the migration a second entry is added and **both** run. When the Zustand harness is finally deleted, the assertions are untouched — that is the proof of parity.

`useEditorStore` is a plain Zustand store, so `useEditorStore.getState()` / `.setState()` work entirely outside React: **these run in the fast `unit` project, no jsdom, no React.**

What to assert:

| Area | Assertions | Source of truth |
| --- | --- | --- |
| **Undo** | edit → undo restores prior pixels; undo at index 0 is a no-op; **a new edit after undo truncates the redo tail** (`store/index.ts:69`, `slice(0, historyIndex + 1)`); history caps at `MAX_HISTORY` and **shifts from the front** (`index.ts:72-74`) | `store/index.ts:52-86` |
| **History cloning** | after an edit, mutating `getProject()` in place does **not** change `projectHistory[historyIndex]` | `index.ts:63-64` — the round-trip clone |
| **`trackHistory` discipline** | for each action, whether it snapshots. The current census: **74 `true`, 47 `false`, 8 `!_strokeActive`, 129 total.** All 33 `toolActions` mutations and all 5 `paletteActions` mutations are `false`; `referenceActions.setReferenceImage` (`:41`) is `false`. Assert those, so a MobX port that "helpfully" starts tracking them is caught. | the 129 call sites |
| **Stroke batching** | one continuous drag over 50 pixels produces **exactly one** new history entry. `drawingActions.ts:10` holds `let _strokeActive = false`; `beginStroke` (`:27-30`) snapshots once then sets the flag. | `drawingActions.ts` |
| **Auto-save scheduling** | every mutating action calls `scheduleAutoSave` exactly once (spy on the module); the 500 ms debounce coalesces N rapid edits into 1 save | `index.ts:84`, `services/autoSave.ts:10` |
| **Save-status lifecycle** | `saveStatus` goes `saving → saved → idle` with the 2 s timeout; use fake timers | `index.ts:37-48` |
| **The 8 lighting setters that never autosave** | `setStudioMode`, `setLightingDataLayerEditMode`, `setSelectedNormal`, `setLightDirection`, `setLightColor`, `setAmbientColor`, `setHeightBrushValue`, `setHeightScale` (`lightingActions.ts:11-129`) write `project` via raw `set({project: {...}})` and schedule **no** save. **Assert the current broken behaviour** with `// BUG: lightingActions.ts:11-129 — task 15 fixes this` | `lightingActions.ts` does not import `services/autoSave` at all |
| **Drawing gates** | `setPixel`/`setPixels` respect `selection.mask` + `uiState.selectionBehavior`; a pixel outside the mask is **not** written when behaviour is `"editMask"` | `drawingActions.ts:11-24` |
| **Variant frame indices** | `uiState.variantFrameIndices` is read on the pixel-write path; assert a write lands on the right variant frame | `drawingActions.ts:73,217` |
| **Selection** | rect / flood / lasso / colour modes produce the expected mask for a fixture; `movePixels` vs `moveSelection` vs `editMask` on the same drag | `selectionActions.ts` |
| **Layer ops** | add / delete / reorder / toggle-visibility / duplicate; **all 4 `squash*` variants** on the same fixture — they are near-identical and a later task collapses them, so pin the differences first | `layerActions.ts` |
| **Clipboard** | copy → paste within an object; paste across objects; paste with a size mismatch; **and copy in project A → switch project → paste in project B still works** (nothing in `projectActions` clears the clipboards, and that cross-project survival is load-bearing behaviour) | `layerClipboardActions.ts` |
| **Variants** | `makeVariant` on a 2-frame / 3-layer fixture (round-trip the result); `resizeVariant` for all **9** anchor positions; `setVariantOffset` clamping | `variantActions.ts` |
| **Lighting** | normals from a known height field (hash); **`flipHorizontal ∘ flipHorizontal = identity`** on an **asymmetric** fixture; H and V agree modulo transpose | `lightingActions.ts:485-621, 756-1035` |
| **AI modal history bypass** | `AIInterpolateModal.tsx:754-763` and `:841-850` reimplement the history splice via `useEditorStore.setState()` **without** the `if (newHistory.length > MAX_HISTORY) newHistory.shift()` guard that `store/index.ts:72-74` applies. Assert that repeated interpolation grows `projectHistory` past 100. `// BUG: unbounded history — task 15 fixes this` | as cited |
| **Rename race** | `renameCurrentProject` (`projectActions.ts:111-129`) does **not** call `cancelPendingSave()`, unlike its three siblings at `:58,85,141,178`. Assert the current behaviour. `// BUG: task 15 fixes this` | as cited |

## Steps

1. Write the Part A utility tests first — they are cheap, have no dependencies on each other, and unblock the canvas work.
2. For the `gaussianFloodFill` transparent-region test: **run it, observe, then assert what you observed.** Do not guess.
3. Write `storeContract.ts` with the `StoreHarness` interface and `createZustandHarness`.
4. Write the Part B behaviour tests as `describe.each` over the harness list.
5. Run `bunx vitest run --coverage` and confirm the enforced thresholds from task 06 now pass: `alphaBlend.ts` 100%, `drawingUtils.ts` 85%.

## Constraints

- **Do not assert on `EditorState`'s shape.** It has ~206 top-level keys and the MobX design re-homes every one of them across `SessionStore` / `DomainStore` / `UIStore`. A shape assertion guarantees a rewrite. Assert only through `dispatch` + `getProject` / `getUiState` / `getHistoryLength` / `getHistoryIndex`.
- **Memory:** never fill history to `MAX_HISTORY = 100` with a realistic project. A runtime `Project` snapshot of the real `Base Unit.json` measures **6.9 MB**, so 100 of them is ~680 MB and **will OOM the worker**. Use a tiny fixture (1 object, 1 frame, 1 layer, 4×4 grid), and for the cap test lower `MAX_HISTORY` through the harness.
- **Assert observed behaviour, not desired behaviour.** Every known bug listed above gets a `// BUG:` comment naming the task that will flip it.
- **Do not fix any bug in this task.** No source file under `client/src` outside `__tests__` directories may be edited.
- Do not add a canvas or browser dependency.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx vitest run --project unit                    # exit 0
bunx vitest run src/store/__tests__/              # exit 0 against createZustandHarness
bunx vitest run --coverage                        # alphaBlend 100%, drawingUtils 85% thresholds pass
bunx tsc --noEmit && bunx eslint .                # both still exit 0
```

Manual checks:
- Confirm no test asserts on `EditorState` shape (grep the test files for `EditorState`).
- Confirm the history-cap test uses a small fixture — grep for `MAX_HISTORY` and check the fixture dimensions next to it.
- Confirm `flipHorizontal ∘ flipHorizontal = identity` is asserted on an **asymmetric** fixture (a symmetric one passes trivially and proves nothing).
- Record the observed `gaussianFloodFill` transparent-region behaviour in the completion report — later canvas tasks are checked against it.

## Definition of done

- [ ] Every Part A utility listed in Context has a test file, using buffer hashes (not per-pixel assertions) for the renderers.
- [ ] `storeContract.ts` exists with the `StoreHarness` interface and `createZustandHarness`, and every store test runs through `describe.each` over the harness list.
- [ ] The `trackHistory` census is asserted: the 33 `toolActions` and 5 `paletteActions` non-tracking sites, and `setReferenceImage`.
- [ ] Stroke batching asserted: one 50-pixel drag = exactly one history entry.
- [ ] The 8 no-autosave lighting setters, the AI-modal unbounded history, and the rename race are each pinned as **current broken behaviour** with a `// BUG:` comment naming task 15.
- [ ] Cross-project clipboard survival is asserted.
- [ ] `alphaBlend.ts` at 100% and `drawingUtils.ts` at 85% coverage.
- [ ] No source file outside `__tests__` was edited.
- [ ] The observed `gaussianFloodFill` transparent-region behaviour is recorded in the completion report.
