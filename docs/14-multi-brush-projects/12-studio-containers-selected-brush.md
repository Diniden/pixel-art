# 12 — Brush-studio containers on the selected brush

**Wave:** W4 · **Depends on:** 08, 09, 10, 11
**Touches:** `client/src/containers/brush/brushPanes.ts` · `client/src/containers/brush/__tests__/brushPanes.test.ts` · `client/src/containers/brush/__tests__/brushToolContext.test.ts` · `client/src/containers/brush/__tests__/brushSelection.test.ts` · `client/src/containers/brush/__tests__/useBrushSelection.dom.test.ts` · `client/src/containers/brush/__tests__/useBrushPointerHandlers.dom.test.ts` (the last two only if they build documents) · `client/src/containers/BrushCanvasContainer.tsx` · `client/src/containers/BrushTimelineContainer.tsx` · `client/src/containers/BrushStudioPanelContainer.tsx` · `client/src/containers/BrushLayerPanelContainer.tsx` · `client/src/containers/__tests__/BrushLayerPanelContainer.dom.test.tsx` · `client/src/containers/__tests__/BrushStudioPanelContainer.dom.test.tsx`
**Effort:** L

## Objective
The Brush Studio's canvas panes, timeline, layer panel and studio panel all read the **selected brush** (`brushUI.selectedBrushIn(document)`) for size, frames, layers and applied groups, and repaint when the selection changes. Their tests are migrated to brush-2 and extended with a brush-switch case each.

## Context
Every read site is measured (MASTER §4 "Containers"):
- `BrushCanvasContainer.tsx`: `doc?.width/height :139-140` → `brush?.width/height`; `selectedLayerIn(doc) :142` (already brush-scoped via task 08 — no change); `resyncKey :198` is `` `${renderMode}:${brushName}:${selectedFrameId ?? ""}` `` — it must become `` `${renderMode}:${projectName}:${selectedBrushId ?? ""}:${selectedFrameId ?? ""}` `` (MASTER §8 mistake 4: a switch to a brush of another size must re-sync the backing store).
- `containers/brush/brushPanes.ts`: `BrushPaneDocument :90` is the structural `{ frames }` slice — rename it `BrushPaneBrush` (a `Brush` fits); `brushPaneScene(brush, frameId, layerId) :104` keeps its **strict** frame lookup (no fallback — that is deliberate, see the header at `:16-30`); `BrushPaneRenderArgs :117` gains `selectedBrushId: string | null` and the paint-time call `:162` becomes `brushPaneScene(brushIn(source.document, selectedBrushId), selectedFrameId, layerId)`; add `selectedBrushId` to the reaction/effect deps the same way `selectedFrameId` is listed (`:185`).
- `BrushTimelineContainer.tsx`: `doc?.frames :98` → `brush?.frames`; the playback advance `:182-188` reads the live document inside the interval — resolve the brush there too (`brushIn(brushes.document, brushUI.selectedBrushId)`); `:372-377` cell thumbnails use `brush.width/height`. `selectedLayerIn(doc) :267` unchanged.
- `BrushLayerPanelContainer.tsx`: `:70` frame lookup → `brushUI.selectedFrameIn(doc)` (it now exists and is brush-scoped; drop the inline `find ?? frames[0]`); `doc.appliedGroups :73` → `brush.appliedGroups`; `:110` layer count → `brush.frames[0]?.layers.length`. Return `null` when `brush` is null.
- `BrushStudioPanelContainer.tsx`: `channelTypeIn(brushes.document) :161` — signature unchanged; verify it compiles and its test passes; likely no edit beyond the comment.
- `containers/brush/__tests__/brushToolContext.test.ts:1050-1052` and `brushSelection.test.ts:13` build documents with `createBrushDocument` + `frames` overrides → brush-2 (`doc.brushes[0]`). `useBrushSelection.dom.test.ts` / `useBrushPointerHandlers.dom.test.ts`: grep for `createBrushDocument` / `installDocument`; migrate only if present.
- `BrushLayerPanelContainer.dom.test.tsx` (5): `twoLayerDocument() :43-52` literal → brush-2; `doc() :89-90`. `BrushStudioPanelContainer.dom.test.tsx` (8): `installDocument(createBrushDocument(4,4)) :51` — unchanged call, but assertions on `document.frames` move.

Pattern: in every observer, `const doc = brushes.document; const brush = brushUI.selectedBrushIn(doc);` — reading `brushUI.selectedBrushId` inside `selectedBrushIn` subscribes the observer to the selection. `document` is `observable.ref`; nothing below it is observed.

## Steps
1. `brushPanes.ts` + its test: rename the slice type, add `selectedBrushId`, resolve at paint time; test that switching `selectedBrushId` re-composites from the other brush's layers and that the strict frame lookup still returns `null` for an unknown frame id.
2. `BrushCanvasContainer.tsx`: brush-scoped size; the new `resyncKey`; pass `selectedBrushId` to `useBrushPaneRender`.
3. `BrushTimelineContainer.tsx`: frames/layers/thumbnail size from the brush; playback resolves the brush inside the tick.
4. `BrushLayerPanelContainer.tsx`: `selectedFrameIn`, `brush.appliedGroups`, layer count; header comment updated (the frame rule now lives in the UI store).
5. `BrushStudioPanelContainer.tsx`: confirm; comment only.
6. Migrate the tests; add: `BrushLayerPanelContainer.dom.test.tsx` — with a two-brush document, `brushUI.selectBrush("brush-2", doc)` re-renders the rows to brush 2's layers, and "+" adds a layer to brush 2 only (brush 1's frame object identity unchanged); `brushPanes.test.ts` as in step 1.
7. Run the verification, then the manual checks. Commit: `multi-brush(12): Brush Studio panes, timeline and layer panel follow the selected brush`.

## Constraints
- Do not touch `BrushStudioContainer.tsx`, `BrushListContainer.tsx`, `BrushLibraryContainer.tsx` (task 13) or anything under `pixelBrush/` / `otherHand/` (task 14).
- No `observer` on grid contents; no new `reaction` without a dispose.
- `brushPaneScene` stays strict on the frame id.

## Verification
```sh
cd client && bunx tsc --noEmit && bunx eslint . && bunx vitest run src/containers/brush src/containers/__tests__/BrushLayerPanelContainer.dom.test.tsx src/containers/__tests__/BrushStudioPanelContainer.dom.test.tsx && bun run lint:boundaries
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # prints nothing
```
Expected: tsc **clean for every file in this task's `Touches`** (other W4 tasks may still be red until they land — paste the tsc list and mark which files are yours); the listed suites green; no new lint warning.

Manual (`bun run dev`, Brush Studio, after task 13 has landed so the list exists — if you run before it, use the browser console `app.brushStructure.addBrush("Two", 4, 4)` and `app.brushUI.selectBrush(id, app.brushes.document)`):
1. Two brushes of different sizes: switch — both panes resize and repaint to the new brush; no stale image; the Layer pane shows the new brush's selected layer.
2. The timeline strip shows the new brush's frames and its cell thumbnails; play loops within that brush.
3. The layer panel lists the new brush's layers; "+" adds to it only.
4. Paint in brush A, switch to B, paint, switch back — A is intact; ⌘Z steps through both in order.
5. StrictMode (`bun run dev` is StrictMode): no doubled reaction, no console warnings on switch.
Record each observation.

## Definition of done
- [ ] All five containers/hooks read the selected brush; `resyncKey` includes the brush id.
- [ ] Tests migrated + the two new cases; gate output and tsc list pasted.
- [ ] Manual checks 1–5 performed and recorded (or the task is PARTIAL and says so).
