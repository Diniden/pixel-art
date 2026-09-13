# 14 — Pixel-studio wiring: hook, rail, other hand

**Wave:** W4 · **Depends on:** 01, 04, 08, 11
**Touches:** `client/src/containers/pixelBrush/usePixelBrush.ts` · `client/src/containers/pixelBrush/__tests__/usePixelBrush.dom.test.ts` · `client/src/containers/PixelStudioPanelContainer.tsx` · `client/src/containers/__tests__/PixelStudioPanelContainer.dom.test.tsx` · `client/src/containers/otherHand/pixelBrushWidgets.ts` · `client/src/containers/__tests__/pixelBrushTool.dom.test.tsx` · `client/src/containers/__tests__/OtherHandRailContainer.dom.test.tsx`
**Effort:** M

## Objective
The pixel studio's Brush tool stamps the **selected brush** of the open project: `usePixelBrush` resolves it, the rail section shows the "Brush" picker (task 04's optional props are now supplied), and Other Hand Mode gets a brush button stack. Switching to a brush of a different native size resets the stamp size to native, exactly as loading a different file does; switching to one of the same size keeps it.

## Context
- `usePixelBrush.ts` (207): reads `:147-154` (`doc`, `frameId`, `pv`, `dv`, `loadState`, `projectName`, `ui.pixelBrush` fields); the reset effect `:159-163` keyed `[app, doc?.width, doc?.height]`; the scaled memo `:165-181` (`selectedFrameIn(doc)`, `native = { doc.width, doc.height }`, `srcW/srcH`) with its dep list; footprint/stamp memos `:183-197`; return `:199-205`. `CanvasContainer.tsx:643` is the only caller and is **not** touched.
- `PixelStudioPanelContainer.tsx:152-217`: the `pixelBrush` block — `doc :162`, `selectedFrameIn :165`, `native :178`, `hasProject/projectName :200`, `doc.frames.indexOf :205`, `doc?.frames.length :206`.
- `otherHand/pixelBrushWidgets.ts`: `doc :38`, `native :43`, then the width/lock/height/scale/reset widgets (plan 13 D14). Look at the `scale` `buttons` widget spec there for the shape to copy (`kind`, `key`, `label`, options with `short`/`label`, `active`, `onSelect`). `toolWidgets.ts:402-404` dispatches to it — not touched.
- Tests: `usePixelBrush.dom.test.ts` (17; `threeByThree()/fourByFour()` builders `:52-53`, `:287-288`; the native-size reset cases), `PixelStudioPanelContainer.dom.test.tsx` (13; `installDocument(createBrushDocument(4,4)) :76`), `pixelBrushTool.dom.test.tsx` (13; `brushDocument() :60`, `installBrush :187`), `OtherHandRailContainer.dom.test.tsx` (15; `installBrush(width, height) :239-241`). Migrate the builders to brush-2 and add two-brush variants where the new cases need them (`createBrushDocument` + push a second `createBrush("brush-2", "Dot", 4, 4)`).

Locked (MASTER D12, D13):
- `usePixelBrush`: `const brushId = app.brushUI.selectedBrushId; const brush = app.brushUI.selectedBrushIn(doc);` — the reset effect is keyed `[app, brush?.width, brush?.height]`; the scaled memo uses `brush.width/height/frames` (`selectedFrameIn(doc)` already resolves through the brush) and adds `brushId` to its deps; `native` is the brush's size. Return unchanged (`projectName`).
- `PixelStudioPanelContainer`: `brush = app.brushUI.selectedBrushIn(doc)`; `native`, `width/height`, `frameIndex` (`brush.frames.indexOf(frame)`), `frameCount` from the brush; new members `brushes: doc.brushes.map(b => ({ id: b.id, name: b.name, width: b.width, height: b.height }))`, `selectedBrushId: brush?.id ?? null`, `onSelectBrush: (id) => app.brushUI.selectBrush(id, app.brushes.document)` — supplied only when `doc` is non-null (spread like `size`). `PixelStudioBrushOption` is imported from `../ui/components/PixelStudioPanel/PixelStudioBrushSection` (or add it to `PixelStudioPanel.tsx`'s re-export block — that file is not in `Touches`; import from the section directly).
- `pixelBrushWidgets`: when `doc.brushes.length >= 2`, **prepend** one `buttons` widget `{ key: "brush", label: "Brush", options: brushes.map((b, i) => ({ id: b.id, short: `B${i + 1}`, label: b.name })), active: selectedId, onSelect: (id) => app.brushUI.selectBrush(id, app.brushes.document) }` in the spec shape the file already uses. Native size for the other widgets = the selected brush's.

## Steps
1. `usePixelBrush.ts`: the brush resolution, memo deps, reset-effect keys; update the header block that documents the memo keys (D12).
2. `PixelStudioPanelContainer.tsx`: the brush-scoped block and the three new members.
3. `pixelBrushWidgets.ts`: the brush stack + brush-scoped native.
4. Tests — migrate, then add: `usePixelBrush.dom.test.ts`: with two brushes (3×3 and 4×4), `selectBrush("brush-2")` → the footprint is brush 2's cells and `resetSize` was invoked (assert `ui.pixelBrush.width === null` after having set it); switching to a same-size brush keeps a set width; a `pixelVersion` bump does **not** reset. `PixelStudioPanelContainer.dom.test.tsx`: the Brush row lists both brushes with sizes, shows the selected one, and a pick calls `selectBrush` (assert `brushUI.selectedBrushId`); the Size row follows the pick. `pixelBrushTool.dom.test.tsx`: a press after picking brush 2 writes brush 2's footprint. `OtherHandRailContainer.dom.test.tsx`: no brush stack with one brush; with two, `B1`/`B2` render, the active one marked, tapping `B2` selects it and the Width widget's max follows the new native.
5. Run the verification and the manual checks. Commit: `multi-brush(14): the Brush tool stamps the selected brush; rail and other-hand pickers`.

## Constraints
- Do not touch `CanvasContainer.tsx`, `toolWidgets.ts` (both at the `max-lines` warning limit — R6), `PixelStudioPanel.tsx`, `PixelStudioBrushSection.tsx` (task 04), `PixelBrushUIStore.ts`.
- No grid read outside the memos; never at pointer rate.
- Nothing persisted.

## Verification
```sh
cd client && bunx tsc --noEmit && bunx eslint . && bunx vitest run src/containers/pixelBrush src/containers/__tests__/PixelStudioPanelContainer.dom.test.tsx src/containers/__tests__/pixelBrushTool.dom.test.tsx src/containers/__tests__/OtherHandRailContainer.dom.test.tsx && bun run lint:boundaries
cd client && bunx eslint . 2>&1 | tail -3      # warning count ≤ 66
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # prints nothing
```
Expected: tsc clean for this task's files (paste the list); the listed suites green; eslint warnings ≤ 66.

Manual (`bun run dev`, pixel studio, a project with two brushes of different sizes — create them in the Brush Studio via task 13's rail):
1. Press `B`: the rail section's first row is **Brush** with a dropdown listing both brushes with sizes; the marker under the cursor is the selected brush's footprint.
2. Pick the other brush: the marker changes immediately; the Size row and the W/H sliders show the new native size; "Native size" is disabled.
3. Set W to 2× native, pick a same-size brush → W stays; pick a different-size brush → W resets to native.
4. Stamp with each brush; colours settle per the brush's layers; ⌘Z one step per drag.
5. Other Hand Mode: the Brush stack shows `B1`/`B2`; tapping switches; the Width widget's range follows.
6. StrictMode: switching to the Brush tool calls `init()` once (Network tab: one `GET /api/brushes`).
Record each observation.

## Definition of done
- [ ] Hook, panel container and other-hand widgets resolve the selected brush per D12/D13.
- [ ] Tests migrated + the new cases green; warning count ≤ 66; gate output pasted.
- [ ] Manual checks 1–6 performed and recorded (or PARTIAL, stated).
