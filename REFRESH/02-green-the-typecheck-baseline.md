# 02 — Green the typecheck baseline (29 errors → 0)

**Wave:** W1 · **Depends on:** 01
**Touches:** `client/src/components/AIInterpolateModal/AIInterpolateModal.tsx` · `client/src/types/index.ts` · `client/lib/versions/v1.ts` · `client/src/components/Canvas/drawingUtils.ts` · `client/src/components/ReferenceImagePanel/ReferenceImagePanel.tsx` · `client/src/components/AnchorGrid/AnchorGrid.tsx` · `client/src/components/Canvas/LightingCanvas.tsx` · `client/src/components/ColorPicker/ColorPicker.tsx` · `client/src/components/FrameTagsModal/FrameTagsModal.tsx` · `client/src/components/FrameTimeline/TimelineView.tsx` · `client/src/components/FrameTimeline/VariantView.tsx` · `client/src/components/HeightMapModal/HeightMapModal.tsx` · `client/src/components/LayerPanel/LayerPanel.tsx` · `client/src/components/PreviewModal/PreviewModal.tsx` · `client/src/components/VariantSelectModal/VariantSelectModal.tsx` · `client/src/utils/lightingRenderer.ts` · `client/src/services/aiService.ts` · `client/src/utils/alphaBlend.ts` · `client/src/store/index.ts` · `client/src/components/GaussianFillModal/` (delete)
**Effort:** M

## Objective

After this task `cd client && bun run build` exits 0 and emits `client/dist/`. There is a green baseline for the first time, so every later task can answer "did my refactor break the types?". Three live bugs hidden behind the red typechecker are fixed or explicitly characterised, and the verified-dead code is deleted.

## Context

**This is the single most important prerequisite in the whole refresh. `bun run build` currently exits 1 and emits no `dist/`.** `bunx vite build` alone exits 0 because esbuild strips types without checking them — which is why nobody noticed.

Measured (REFRESH-PREP/findings/tooling.md § Type-checking, which corrected REFRESH-PREP/findings/component-sizes.md): `bunx tsc --noEmit` and `bunx tsc -b` produce **byte-identical output**, 29 errors both ways. An earlier audit's "56" came from a stale committed `client/tsconfig.tsbuildinfo` and is superseded. **Use 29.**

Error census:

```
  19  error TS6133   declared but never read
   5  error TS2322   type not assignable
   2  error TS2367   comparison with no type overlap
   1  error TS6192   all imports unused
   1  error TS2345   argument type mismatch
   1  error TS2339   property does not exist
  ---
  29  total   (20 hygiene: 19 unused + 1 unused-imports;  9 real)
```

### The 9 real errors, verbatim

```
client/lib/versions/v1.ts(210,5): error TS2322: Type '{ id: string; name: string; variants: ... }[]'
    is not assignable to type 'ExportedVariantLayer[]'.
src/components/AIInterpolateModal/AIInterpolateModal.tsx(692,32): error TS2345: Argument of type
    'PixelData[][][]' is not assignable to parameter of type 'PixelData[][]'.
src/components/AIInterpolateModal/AIInterpolateModal.tsx(720,19): error TS2322: ... 'VariantFrame[]'
src/components/AIInterpolateModal/AIInterpolateModal.tsx(736,19): error TS2322: ... 'VariantFrame[]'
src/components/AIInterpolateModal/AIInterpolateModal.tsx(785,21): error TS2322: ... 'Layer[]'
src/components/AIInterpolateModal/AIInterpolateModal.tsx(815,21): error TS2322: ... 'Layer[]'
src/components/Canvas/drawingUtils.ts(438,17): error TS2367: This comparison appears to be
    unintentional because the types 'Pixel' and 'number' have no overlap.
src/components/ReferenceImagePanel/ReferenceImagePanel.tsx(116,24): error TS2367: This comparison
    appears to be unintentional because the types '{ r: number; g: number; b: number; a: number; }'
    and 'number' have no overlap.
src/types/index.ts(967,38): error TS2339: Property 'lightGridMode' does not exist on type
    'CompactUIState'.
```

### What each real error means

- **The 5 `AIInterpolateModal` errors are an array-rank bug.** `PixelData[]` is being used where `PixelData[][]` is required. `handleAccept` (lines 681-862) is a 182-line commit routine that writes interpolated frames back into the project; the wrong rank means frames land malformed. Fixing this changes AI-accept output — it is a behaviour fix, not a typing tweak.

- **`types/index.ts:967` (`lightGridMode`) is a live round-trip data-loss bug.** `compactToProject` reads `compact.uiState.lightGridMode ?? false` at line 967, but `lightGridMode` is **not declared** on the `CompactUIState` interface (lines 612-663). It compiles today only because `projectToCompact` spreads `...project.uiState` (line 754), bypassing TypeScript's excess-property checking. This matters twice over: `projectToCompact` → `compactToProject` is not only the save/load path, it is **also the deep-clone used for undo** (`client/src/store/index.ts:63-64` and `:96-97` both do `compactToProject(projectToCompact(project))`). A field that does not survive the round trip is silently lost **on undo**, not just on reload. The fix is to add `lightGridMode?: boolean` to `CompactUIState`.

- **The 2 `TS2367` comparisons are always-false at runtime** (comparing a struct to a number). Whether they are dead code or live bugs is **answered empirically by task 07's characterisation tests**, not by judgement — see Constraints.

### Verified dead code to delete (from REFRESH-PREP/findings/component-sizes.md § Dead code, each confirmed by `bunx knip` plus a manual grep)

| Path | What |
| --- | --- |
| `client/src/components/GaussianFillModal/` | **Empty directory**, zero files, zero references. The `gaussian-fill` tool is handled inline in `Canvas.tsx:2241-2261`. |
| `client/src/services/aiService.ts:86` | `checkAiHeartbeat` — exported, zero call sites |
| `client/src/services/aiService.ts:180` | `interpolateFrames` — exported, zero call sites |
| `client/src/services/aiService.ts:3,9` | `HeartbeatResult`, `InterpolateResult` — types for the two dead functions |
| `client/src/utils/alphaBlend.ts:11` | `alphaBlend` — exported, never imported (`layerActions.ts:3` imports only `blendPixels`) |
| `client/src/components/FrameTimeline/TimelineView.tsx:328` | `gridRef` — declared, attached at :740, never dereferenced |
| `client/src/store/index.ts:12-15` | `SaveStatus`, `ColorAdjustmentState`, `LayerClipboard`, `TimelineCellClipboard` re-exported but never imported from here (the originals in `storeTypes.ts` are what consumers use) |

## Steps

1. Run `cd client && bunx tsc --noEmit 2>&1 | tee /tmp/baseline-29.txt` and confirm 29 errors. Keep this file for comparison.
2. **Delete the verified dead code** listed in the Context table above. Remove the empty `client/src/components/GaussianFillModal/` directory entirely.
3. **Fix the 20 hygiene errors** (TS6133 / TS6192) by removing the unused local or import at each site. Sites: `AnchorGrid.tsx`, `LightingCanvas.tsx:3`, `ColorPicker.tsx:198`, `FrameTagsModal.tsx:4` (whole import declaration), `HeightMapModal.tsx:84`, `LayerPanel.tsx:70`, `PreviewModal.tsx:342`, `TimelineView.tsx:3,305,313,583`, `VariantView.tsx:4,98`, `VariantSelectModal.tsx:4`, `types/index.ts:888`, `lightingRenderer.ts:1`. Do **not** silence any of them with `// @ts-expect-error` or by prefixing with an underscore — delete the dead binding.
4. **Fix `types/index.ts:967`**: add `lightGridMode?: boolean;` to the `CompactUIState` interface (lines 612-663). Do not change `projectToCompact` or `compactToProject` behaviour — the field is already written and read; only the declaration was missing.
5. **Fix the 5 array-rank errors in `AIInterpolateModal.tsx`** (692, 720, 736, 785, 815). The correct type is `PixelData[][]` (a 2D grid). Trace the actual value at each site and correct the *value*, not the annotation — if a `PixelData[]` is being passed where a grid is wanted, the producing expression is wrong. After the fix, `pixels` on every `Layer` and `VariantFrame` written by `handleAccept` must be `PixelData[][]`.
6. **Fix `client/lib/versions/v1.ts:210`** (TS2322, `ExportedVariantLayer[]`). ⚠️ `client/lib/**` is copied verbatim into exports (`server/src/routes/export.ts:714-719`) and is **public API for generated projects**. Fix the type mismatch minimally; do not delete or restructure anything under `client/lib/`.
7. **For the two `TS2367` comparisons** (`drawingUtils.ts:438`, `ReferenceImagePanel.tsx:116`): fix the *comparison*, not the type — compare the struct's field (e.g. `.a`) or use the existing equality helper, whichever makes the surrounding code's evident intent true. **Write a one-paragraph note in the commit message for each, stating what the code was comparing and what you changed it to.** Both are always-false today, so any fix changes runtime behaviour.
8. Re-run `cd client && bun run build`. It must exit 0 and produce `client/dist/`.

## Constraints

- **Preserve the wire format and the 8 schema migrations.** `client/src/types/index.ts` contains the compact serializer and several migration paths (`isCompactFormat`, `isLegacyCompactFormat`, `migrateLegacyPixel`, `migrateLegacyLayer`, `migrateLayerVariantOffset`, and a variant-hoisting migration inside `compactToProject`). Adding `lightGridMode?: boolean` to `CompactUIState` is **additive and backward-compatible** — it declares a field that is already being written. Do not change any migration's detector, transform, or order. Losing one silently corrupts the owner's real project files, which include gzipped backups spanning Jan–Jul 2026.
- **Do not restructure any file.** No splitting, no moving, no renaming. Tasks later in the plan own decomposition; this task only makes the typechecker green.
- Do not delete anything under `client/lib/` beyond the minimal type fix at `v1.ts:210`.
- Do not run `prettier --write` — formatting is task 05's, in its own commit.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit                 # must exit 0
bun run build                     # must exit 0
test -d dist                      # must exist
cd ../server && bunx tsc --noEmit  # must still exit 0
# The dead code is gone:
cd /Users/diniden/Desktop/self/pixel-art
test ! -d client/src/components/GaussianFillModal
! grep -q "checkAiHeartbeat\|interpolateFrames" client/src/services/aiService.ts
```

Manual checks (all required — the fixes change runtime behaviour):

1. **`lightGridMode` persistence:** toggle the light grid in the app, wait 2 s for autosave, hard-reload. The setting must survive. (It does not today.)
2. **AI accept:** run one AI interpolation end to end against a running `ai-service` and accept the result. Confirm the generated frames land as real frames with correct pixel content — this is what the array-rank fix changes.
3. **Flood fill:** use the gaussian-fill tool on a region of transparent pixels and on a region of solid colour. Record what happens. This is the `drawingUtils.ts:438` site.
4. **Reference panel:** load a reference image and use the panel's nudge/resize buttons. This is the `ReferenceImagePanel.tsx:116` site.
5. **Canvas smoke:** draw, erase, undo, switch layers, open the lighting studio, scrub the timeline.

## Definition of done

- [ ] `cd client && bunx tsc --noEmit` exits 0.
- [ ] `cd client && bun run build` exits 0 and `client/dist/` exists.
- [ ] `cd server && bunx tsc --noEmit` still exits 0.
- [ ] `lightGridMode?: boolean` is declared on `CompactUIState`; no migration detector, transform, or ordering was changed.
- [ ] All 5 `AIInterpolateModal` array-rank errors fixed at the value, not the annotation.
- [ ] Both `TS2367` comparisons fixed, each with a commit-message note explaining the behaviour change.
- [ ] `client/src/components/GaussianFillModal/` and all 7 dead-code entries are removed.
- [ ] Nothing under `client/lib/` was deleted or restructured.
- [ ] All 5 manual checks performed and their outcomes recorded in the completion report.
