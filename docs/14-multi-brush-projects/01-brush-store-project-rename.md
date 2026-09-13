# 01 — `BrushStore` project-level rename

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/stores/domain/BrushStore.ts` · `client/src/containers/HeaderContainer.tsx` · `client/src/containers/BrushSelectModalContainer.tsx` · `client/src/containers/BrushLibraryContainer.tsx` · `client/src/containers/BrushCanvasContainer.tsx` · `client/src/containers/PixelStudioPanelContainer.tsx` · `client/src/containers/pixelBrush/usePixelBrush.ts` · `client/src/stores/domain/__tests__/BrushStore.test.ts` · `client/src/stores/__tests__/brushWiring.test.ts` · `client/src/containers/__tests__/BrushStudioContainer.dom.test.tsx` · `client/src/containers/__tests__/pixelBrushTool.dom.test.tsx` · `client/src/containers/__tests__/PixelStudioPanelContainer.dom.test.tsx` · `client/src/containers/pixelBrush/__tests__/usePixelBrush.dom.test.ts` · `client/src/containers/__tests__/OtherHandRailContainer.dom.test.tsx` · plus any other file under `client/src/stores/**` or `client/src/containers/**` the grep in step 1 reveals (record each in your report)
**Effort:** S

## Objective
`BrushStore`'s file-level API says **project**: `projectName`, `projectList`, `hasProject`, `loadProject`, `createProject`, `switchProject`, `renameProject`, `deleteProject`. Every caller and test uses the new names. Nothing else changes — same flows, same bodies, same wire calls — so the full gate is green at the end of this task.

## Context
Today one brush file is one brush, so `BrushStore` calls the file a "brush" (`brushName :107`, `brushList :109`, `hasBrush :181`, `loadBrush :314`, `createBrush :354`, `switchBrush`, `renameBrush`, `deleteBrush`). Plan 14 nests many brushes inside one file and adds `BrushStructureStore.addBrush / deleteBrush / renameBrush(id, …)` for the brushes **inside** the file (MASTER D5). Without this rename, `brushes.deleteBrush()` (deletes the file) and `brushStructure.deleteBrush(id)` (deletes one brush) would sit side by side. MASTER D3 fixes the names; this task lands them first, alone, so the later store tasks (W3) arrive on a renamed base and the rename itself is a green, mechanical commit.

The rename map (D3), exhaustively:

| Old | New |
| --- | --- |
| `brushName` (field) | `projectName` |
| `brushList` (field) | `projectList` |
| `hasBrush` (computed) | `hasProject` |
| `loadBrush(name)` | `loadProject(name)` |
| `createBrush(name, width, height)` | `createProject(name, width, height)` |
| `switchBrush(name)` | `switchProject(name)` |
| `renameBrush(newName)` | `renameProject(newName)` |
| `deleteBrush()` | `deleteProject()` |
| `usePixelBrush` → `PixelBrushState.brushName` | `projectName` |

Unchanged: `refreshList`, `init`, `document`, `domainVersion`/`pixelVersion`/`loadGeneration`, `history`, `saveName` (its body becomes `return this.projectName`), `serialize`, `adoptDocument`/`installDocument`/`replaceDocument`/`commit`/`bumpPixelVersion`, `BrushApiLike` (the API names files: `list/get/save/create/rename/remove` stay), the `app.brushes` field, `brushApi`. `BrushSelectModal`'s **props** (`brushName`, `brushList`, `onSwitchBrush`, …) are `ui/` and are **not** renamed here — only the container's right-hand side changes (`brushName={brushes.hasProject ? brushes.projectName : null}`). Same for `PixelStudioBrushInfo.brushName` (the UI prop keeps its name; the container reads `brushes.projectName`).

Known call sites (measured): `HeaderContainer.tsx:226,230,233-234`; `BrushSelectModalContainer.tsx:44-51`; `BrushLibraryContainer.tsx:126-149` (`brushList`, `hasBrush`, `brushName`, `switchBrush`, `createBrush`); `BrushCanvasContainer.tsx:198` (`resyncKey` uses `brushName`); `PixelStudioPanelContainer.tsx:200`; `usePixelBrush.ts:152,204`. Tests: `BrushStore.test.ts` (37 tests, the fake api at `:57-65` is unaffected; the store member names are), `brushWiring.test.ts`, `BrushStudioContainer.dom.test.tsx`, `pixelBrushTool.dom.test.tsx`, `PixelStudioPanelContainer.dom.test.tsx`, `usePixelBrush.dom.test.ts` (asserts `brushName` on the returned state), `OtherHandRailContainer.dom.test.tsx` (may install through `brushes`).

MobX: the `makeObservable` map in the constructor (`:151-176`) names each member — rename there too (`projectName: observable`, `projectList: observableShallow`, `hasProject: computed`, `loadProject: flow`, …) or MobX throws at construction.

## Steps
1. From `client/`, run the grep and keep its output for the report:
   ```sh
   grep -rnE "brushes\.(brushName|brushList|hasBrush|loadBrush|createBrush|switchBrush|renameBrush|deleteBrush)\b|\.(brushName|brushList|hasBrush)\b" src --include='*.ts' --include='*.tsx' | grep -v "src/ui/"
   ```
   Every hit under `stores/` or `containers/` that refers to `BrushStore` members is in scope (hits on `BrushSelectModal` props, `PixelStudioBrushInfo.brushName`, or `PixelBrushState` consumers in `ui/` are not).
2. Rename in `BrushStore.ts`: the fields, the computed, the flows, the `makeObservable` map, every internal reference, and every doc comment that names them. Update the module header's wording where it says "brush" for the file ("the loaded brush **project**").
3. Rename in every caller from step 1. In `usePixelBrush.ts` rename the returned `brushName` to `projectName` (type `PixelBrushState` and the return object).
4. Update the tests listed in `Touches` (and any the grep revealed). Do not change what they assert; only the member names.
5. Run the verification below. Commit: `multi-brush(01): rename BrushStore file-level API to *Project`.

## Constraints
- No behaviour change. No new members. No `ui/` file is touched.
- Do not touch `brushApi.ts`, `BrushSelectModal.tsx`, `PixelStudioBrushSection.tsx`, `ARCHITECTURE.md` (task 15 updates the docs).
- Do not start on D1–D2 (types) or D4–D6 (selection) — W2/W3 own those.

## Verification
```sh
cd client && bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run lint:boundaries
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # prints nothing
cd client && grep -rnE "brushes\.(brushName|brushList|hasBrush|loadBrush|createBrush|switchBrush|renameBrush|deleteBrush)\b" src ; echo "exit $?"   # exit 1 (no hits)
```
Expected: tsc clean; eslint 0 errors and ≤ 66 warnings; vitest 200 files / 4361 tests green (same counts as baseline); boundaries 5/5; the final grep finds nothing.

Manual: none (pure rename).

## Definition of done
- [ ] Every member in the rename map is renamed in `BrushStore.ts`, including the `makeObservable` map and comments.
- [ ] The step-1 grep returns no hits on the old names outside `src/ui/`.
- [ ] Full client gate green with baseline counts; no lockfile.
- [ ] The report lists every file touched, including any beyond the `Touches` list, and pastes the gate output.
