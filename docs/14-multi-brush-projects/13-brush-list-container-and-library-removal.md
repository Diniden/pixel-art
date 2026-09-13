# 13 — `BrushListContainer`, studio wiring, library removal

**Wave:** W4 · **Depends on:** 03, 08, 09, 11
**Touches:** `client/src/containers/BrushListContainer.tsx` (new) · `client/src/containers/__tests__/BrushListContainer.dom.test.tsx` (new) · `client/src/containers/BrushStudioContainer.tsx` · `client/src/containers/__tests__/BrushStudioContainer.dom.test.tsx` · `client/src/containers/BrushLibraryContainer.tsx` (deleted) · `client/src/ui/layouts/BrushStudioLayout/BrushStudioLayout.tsx` · `client/src/ui/layouts/BrushStudioLayout/BrushStudioLayout.stories.tsx` · `client/src/ui/components/BrushLibrary/BrushLibrary.tsx` (deleted) · `client/src/ui/components/BrushLibrary/BrushLibrary.css` (deleted) · `client/src/ui/components/BrushLibrary/BrushLibrary.stories.tsx` (deleted) · `client/src/ui/components/BrushLibrary/storyFixtures.ts` (deleted) · `client/src/ui/components/BrushLibrary/__tests__/BrushLibrary.dom.test.tsx` (deleted) · `client/src/ui/components/BrushLibrary/brushName.ts` (deleted — moved) · `client/src/ui/components/BrushSelectModal/brushName.ts` (new, moved) · `client/src/ui/components/BrushSelectModal/BrushSelectModal.tsx` · `client/src/ui/components/BrushSelectModal/BrushSelectModal.stories.tsx` · `client/src/ui/components/BrushSelectModal/__tests__/BrushSelectModal.dom.test.tsx`
**Effort:** M

## Objective
The left rail's top section is the **brush list**: `BrushListContainer` projects the open project's brushes into `BrushList` row models (with per-brush thumbnails) and maps every callback onto `BrushStructureStore` / `BrushUIStore`. `BrushStudioLayout` names the slot `brushList`. The file-list rail panel (`BrushLibrary` + its container) is deleted; the file-name validator moves next to its only remaining user, the modal, whose copy now says a project holds a set of brushes.

## Context
- `BrushStudioContainer.tsx:85-86` mounts `<BrushLibraryContainer />` as `brushLibrary` and `<BrushLayerPanelContainer />` as `layerPanel`. `BrushStudioLayout.tsx:52` declares `brushLibrary` ("the brush FILE list"), renders it `:120`; the header (`:20-30`) explains why the region set differs from the pixel layout — update its bullet to say the rail lists the brushes **inside** the open project. `BrushStudioLayout.stories.tsx` passes `brushLibrary`.
- `BrushLibraryContainer.tsx` (155): **move** `resolveFrameIndex :55` and `makeBrushThumbnailDraw :70-118` into the new container, generalised to `(brush: Brush, frameIndex: number)` (it reads `brush.frames[frameIndex]`, `brush.width/height`, then `renderBrushFrame(createBrushBuffer(w, h), { layers, width, height })` and the offscreen-canvas blit — keep the code and its comments). The revision formula `:134-136` (`(pixelVersion + domainVersion) * REVISION_FRAME_SLOTS + frameIndex`) and its rationale header move too. Then delete the file.
- `BrushLayerPanelContainer.tsx` is the pattern for the new container: `observer`, `useStores()`, one store method per callback, `null` without a document.
- `BrushList` props are locked in task 03 / MASTER D8: rows `{ id, name, width, height, draw }`, `selectedBrushId`, `thumbnailRevision`, seven callbacks. Row `draw`: the selected brush paints its **selected frame** (`resolveFrameIndex(brush, brushUI.selectedFrameId)`), every other brush paints frame 0 (D10).
- Callbacks → stores: `onSelect(id)` → `brushUI.selectBrush(id, brushes.document)`; `onAdd(name, w, h)` → `brushStructure.addBrush(name, w, h)`; `onRename` → `renameBrush`; `onDuplicate` → `duplicateBrush`; `onDelete` → `deleteBrush`; `onMoveUp/Down` → `moveBrush(id, "up" | "down")`.
- `brushName.ts` (`validateBrushName(name, existing)`) is imported by `BrushLibrary.tsx:26` and `BrushSelectModal.tsx:35`. Move the file (with its test if one exists under `BrushLibrary/__tests__/` — check) to `ui/components/BrushSelectModal/brushName.ts`; update the modal's import to `./brushName`.
- Modal copy (`BrushSelectModal.tsx:203-204`): replace with `Each brush project is one file holding a set of brushes — each with its own size, layers and frames. Switch, create, rename or delete brush project files here.` (MASTER D9). If `BrushSelectModal.dom.test.tsx` or the story pins the old sentence, update it. The create form keeps `W × H` (the first brush's size).
- `BrushStudioContainer.dom.test.tsx` (6): stubs `GET /api/brushes` empty `:48`, pins one GET under StrictMode `:107`, installs `createBrushDocument(4,4)` `:159`; it may assert the library's "No brush projects yet" empty state — replace with the list's behaviour (a null document renders no list panel).

## Steps
1. Create `BrushListContainer.tsx` (header explaining the row projection, the thumbnail closure rule and the revision, in the house style); move the compositor and revision code from `BrushLibraryContainer.tsx`.
2. `BrushStudioLayout.tsx` + stories: rename the prop and its doc; `BrushStudioContainer.tsx`: mount `<BrushListContainer />`.
3. Move `brushName.ts` (and its test, if any); update the modal import; update the modal copy, its story and its test.
4. Delete `BrushLibraryContainer.tsx` and the rest of `ui/components/BrushLibrary/`. Grep first: `grep -rn "BrushLibrary\|brushName\"" client/src` — the only hits left must be the modal's `./brushName` import and task-13 files.
5. `BrushListContainer.dom.test.tsx` (jsdom, real `ApplicationStore` as in `BrushLayerPanelContainer.dom.test.tsx`): renders one row per brush with `name` and `W×H`, selected row highlighted; click → `brushUI.selectedBrushId`; "+" with name/W/H → a new brush of that size appended and selected; rename → `document.brushes[i].name`; duplicate → a new row after the source; delete disabled with one brush, enabled with two and re-selects; move up/down reorders `document.brushes`; the revision changes when `pixelVersion` bumps and when the selected frame changes. Update `BrushStudioContainer.dom.test.tsx`.
6. Run the verification and the manual checks. Commit: `multi-brush(13): the rail lists the brushes in the project; BrushLibrary removed`.

## Constraints
- Do not touch `BrushLayerPanelContainer.tsx`, `BrushCanvasContainer.tsx`, `BrushTimelineContainer.tsx`, `brushPanes.ts` (task 12) or anything under `pixelBrush/` / `otherHand/` / `PixelStudioPanel` (task 14).
- `BrushSelectModalContainer.tsx` needs no change (task 01 renamed its right-hand sides); leave it.
- `ui/` purity for the layout and modal; no `Brush` type crosses into `BrushList`.

## Verification
```sh
cd client && bunx tsc --noEmit && bunx eslint . && bunx vitest run src/containers/__tests__/BrushListContainer.dom.test.tsx src/containers/__tests__/BrushStudioContainer.dom.test.tsx src/ui/components/BrushSelectModal src/ui/layouts && bun run lint:boundaries
cd client && bunx storybook build
cd client && grep -rn "BrushLibrary" src ; echo "exit $?"     # exit 1
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # prints nothing
```
Expected: tsc clean for this task's files (paste the list; mark yours); the listed suites green; storybook builds without the deleted stories; no `BrushLibrary` reference remains.

Manual (`bun run dev`, Brush Studio):
1. The rail's top panel reads **Brushes** and lists the open project's brushes with thumbnails and sizes; the header's "Brush Projects" button still opens the file modal, whose intro reads the new sentence.
2. "+" → name "Two", 4×4 → a new selected row; the canvas shows an empty 4×4; ⌘Z removes it and re-selects the first.
3. Double-click a name → rename → Enter; ↑/↓ reorder; duplicate; delete (disabled with one brush).
4. A project created before this plan (ask the owner, or create a brush-1 JSON by hand in the browser via the API — never in `server/src/data/` from the agent) opens as one brush "Brush 1" with its pixels intact.
5. Light and dark; the panel fits the narrowest rail width; the thumbnails of unselected brushes show their frame 0.
Record each observation.

## Definition of done
- [ ] `BrushListContainer` wired for all seven callbacks with per-brush thumbnails and the moved compositor.
- [ ] Layout prop renamed; `BrushLibrary` and its container deleted; validator moved; modal copy updated.
- [ ] Tests green; storybook builds; gate output pasted.
- [ ] Manual checks 1–5 performed and recorded (or PARTIAL, stated).
