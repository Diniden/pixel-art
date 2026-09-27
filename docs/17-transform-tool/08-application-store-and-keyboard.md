# 08 — `ApplicationStore` lifecycle + keyboard

**Wave:** W3 · **Depends on:** 04, 06
**Touches:** `client/src/stores/ApplicationStore.ts` · `client/src/stores/__tests__/transformWiring.test.ts` (new) · `client/src/ui/hooks/useCanvasKeyboard.ts` · `client/src/ui/hooks/__tests__/useCanvasKeyboard.dom.test.ts`
**Effort:** M

## Objective
`app.transform` exists; a pending transform is committed as one history entry whenever its session
must end (selection replaced or cleared — including by Escape — tool switched, frame / layer / object
changed), dropped on project load, reset by ⌘Z while pending, applied by Enter with the selection
following the result, and nudged by the arrow keys. All of it is pinned by a wiring test.

## Context
- `client/src/stores/ApplicationStore.ts` (≈911 code lines, already over the `max-lines` warning —
  keep additions compact): fields `reflection :461`, `pose :482`; construction + `loadGeneration`
  reactions `:606-627` (the pattern: `reaction(() => this.domain.loadGeneration, () => this.pose.clear())`,
  disposer fields documented `:464-491`, disposed in `dispose()`); `undo :1904-1912` (project path
  through `historyOps`, brush path direct), `redo :1914`; `selectionUI`, `pixels`, `ui.tool.selectedTool`,
  `ui.timeline.selectedObjectId/FrameId/LayerId` all reachable.
- From task 06: `TransformUIStore` (`@/stores/ui/TransformUIStore`). From task 04:
  `pixels.setPixelCellsAt(target, cells, options, label)`. From task 02: `transformCommitWrites`.
- `client/src/ui/hooks/useCanvasKeyboard.ts` (362): `CanvasKeyboardOptions :118-157`
  (`hasSelection`, `selectionBehavior`, `undo`, `clearSelection`, `moveSelection`,
  `moveSelectedPixels`, `moveLayerPixels` …); `handleCanvasKeyDown :181-325` — dialog yield `:192`
  (must stay first), `Delete` `:205-218`, hotkeys `:221-230`, arrows `:276-287`, **Escape `:291-316`**
  (level 1: `hasSelection` → `clearSelection()`; unchanged by this task). Registered on `window` with
  capture `:339-344`. Test (455): Escape levels, arrows per behaviour.
- Wiring test rig precedent: `client/src/stores/__tests__/brushWiring.test.ts` (real `ApplicationStore`
  with a small project; asserts store interplay).
- The container passes the new keyboard options in task 10; this task adds them with tests against
  the hook alone.

## Steps
1. `ApplicationStore`: `readonly transform: TransformUIStore` (after `pose`), constructed after the
   pose reaction; reaction A (`loadGeneration` → `this.transform.end()`) with its disposer; reaction B
   per MASTER D10 — expression returns the tuple
   `[this.selectionUI.selection, this.ui.tool.selectedTool, this.ui.timeline.selectedObjectId, this.ui.timeline.selectedFrameId, this.ui.timeline.selectedLayerId] as const`
   with `{ equals: comparer.structural }`; effect: `const s = this.transform.session; if (!s) return;`
   then commit (`selectFollows: false`) when `selection !== s.selectionRef || tool !== "transform" || objectId !== s.target.objectId || frameId !== s.target.frameId || layerId !== s.target.layerId`.
   Both disposed in `dispose()`.
2. `commitTransform({ selectFollows }: { selectFollows: boolean }): boolean` per D10 — read
   `session`, `isPending`, `result`; `this.transform.end()` **first**; if pending and result:
   `this.pixels.setPixelCellsAt(session.target, transformCommitWrites(result, session.source), {}, "Transform selection")`;
   if `selectFollows` and the target is still the current object/frame/layer:
   `this.selectionUI.setSelectionMask(new Set(result.cells.keys()), { width: session.gridWidth, height: session.gridHeight })`;
   return whether a write happened. Wrap in `runInAction` as the store's other cross-store methods do.
3. `undo()`: before routing, `if (target === this.history && this.transform.isPending) { this.transform.reset(); return; }`.
   Commit: `transform(08): app.transform lifecycle, commitTransform, undo intercept`.
4. `useCanvasKeyboard.ts`: options `transformActive: boolean`, `commitTransform: () => void`,
   `nudgeTransform: (dx: number, dy: number) => void`. `Enter` (no ctrl/meta/alt, not from a dialog or
   text field — reuse the existing `isFromDialog` / input guard) with `transformActive` →
   `preventDefault`, `commitTransform()`. Arrow keys with `transformActive` → `nudgeTransform(dx, dy)`
   and return, placed **before** the selection / layer nudge branch. Escape untouched.
   Update the dom test: Enter calls `commitTransform` only when active; arrows route to
   `nudgeTransform` when active and to the existing targets when not; Escape with a selection still
   calls `clearSelection` (unchanged) even when `transformActive`.
   Commit: `transform(08): Enter commits, arrows nudge a pending transform`.
5. `transformWiring.test.ts` (real `ApplicationStore`, a 6×6 one-layer object with a few coloured
   cells, two frames, a rect selection over the coloured cells; build a session by hand with
   `liftTransformSource`-equivalent code local to the test — task 09's module is not available yet —
   and `app.transform.begin(...)`):
   - `setParams` with a translate of (+2, 0) then `commitTransform({ selectFollows: true })` →
     grid shows the cells moved, sources empty, **one** history entry labelled `"Transform selection"`,
     selection mask equals the result keys, `transform.session === null`; `undo()` restores the grid.
   - pending + `selectionUI.clearSelection()` (Escape's effect) → one entry, selection null, session
     null; pending + `selectionUI.setSelection(otherBox)` → one entry, the new selection stands.
   - pending + `ui.tool.setTool("pixel")` (or the equivalent setter) → one entry.
   - pending + `ui.timeline.selectFrame(frame2)` → the write lands on **frame 1's** layer (the
     captured target), frame 2 untouched.
   - session active but identity + any trigger → no entry, session null.
   - `undo()` while pending → params identity, session kept, history length unchanged; `undo()`
     while identity → normal undo runs.
   - `loadGeneration` bump (install a new project through the store's normal path) → session null,
     nothing written.
   Commit: `transform(08): wiring tests`.

## Constraints
- No edits to `SelectionUIStore.ts`, `PixelStore.ts`, `HistoryStore.ts`, `GlobalHotkeys.tsx`,
  `CanvasContainer.tsx`. Escape's branch in the keyboard hook is not modified.
- The eslint warning count must not rise (ApplicationStore already warns; no new file warns).
- `commitTransform` never opens a transaction and never runs while a stroke is open (the transform
  tool never opens one).

## Verification
```sh
cd client && bunx vitest run src/stores src/ui/hooks          # green
cd client && bunx vitest run src/types                        # green, snapshots unchanged
cd client && bunx tsc --noEmit && bunx eslint src/stores src/ui/hooks   # clean; warnings ≤ 66 overall (paste the count)
cd client && bun run lint:boundaries                          # 5/5
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # prints nothing
```
Manual: none (end-to-end in task 10).

## Definition of done
- [ ] `app.transform`, reactions A/B, `commitTransform`, undo intercept per D10.
- [ ] Keyboard options per D11 with tests; Escape unchanged and pinned.
- [ ] Wiring tests listed above green; corpus suites unchanged.
- [ ] Three commits `transform(08):`; no lockfile.
