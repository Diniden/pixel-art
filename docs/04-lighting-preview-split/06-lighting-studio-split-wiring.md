# 06 — Wire the split into `LightingStudioContainer` and retire the floating panel

**Wave:** W3 · **Depends on:** 05
**Touches:** `client/src/containers/LightingStudioContainer.tsx` · `client/src/containers/LightingCanvasContainer.tsx` · `client/src/ui/components/LightingSurface/LightingSurface.tsx` · `client/src/ui/components/LightingSurface/LightingSurface.stories.tsx` · `client/src/ui/components/LightingSurface/__tests__/LightingSurface.dom.test.tsx` · `client/src/ui/layouts/LightingStudioLayout/LightingStudioLayout.tsx` · `client/src/containers/LightingPreviewPanelContainer.tsx` (deleted) · `client/src/ui/components/LightingPreviewPanel/LightingPreviewPanel.tsx` (deleted) · `client/src/ui/components/LightingPreviewPanel/LightingPreviewPanel.css` (deleted) · `client/src/ui/components/LightingPreviewPanel/LightingPreviewPanel.stories.tsx` (deleted) · `client/src/ui/components/LightingPreviewPanel/__tests__/LightingPreviewPanel.dom.test.tsx` (deleted)
**Effort:** M

## Objective
The lighting studio's canvas region renders `CanvasSplit` with one `LightingCanvasContainer` per
open render mode, in `app.lightingViews.openModes` order. Opening Preview splits the region; swap
reorders without remounting; close returns to one pane. The old floating 200 px **Lighting
Preview panel is removed** — the pane replaces it. The feature is reachable from the UI and
passes the full gate plus the manual checklist.

## Context
- **The owner's decision (2026-08-29), locked as D7:** the preview becomes a workspace pane and
  the floating panel is **retired entirely**. Its persisted keys stay in the wire format but stop
  being read — see "Persistence" below.
- `containers/LightingStudioContainer.tsx` (80 lines) is an `observer()` rendering
  `LightingStudioLayout` with `canvas={<LightingCanvasContainer />}` at `:76`. It reads only
  `ui.viewport.focusMode` and `ui.layout.otherHandActive`. ⚠️ `previewPanel` is deliberately **not**
  passed here today — the panel mounts *inside* `LightingCanvasContainer` (`:697-703`), and the
  layout's optional `previewPanel?` slot (`LightingStudioLayout.tsx:60`) is unused. Both the slot
  and the header comments explaining the arrangement (`LightingStudioContainer.tsx:11-25`,
  `LightingStudioLayout.tsx:33-44`) go away with the panel.
- `CanvasSplit` (`ui/components/CanvasSplit/CanvasSplit.tsx`, from plan 02) takes
  `panes: ReadonlyArray<{ key: string; node: ReactNode }>`; `key` is typed `string`, so it never
  learns the mode union. **Pane identity is the key** — use the mode string; a swap must reorder
  DOM nodes, never remount (its test pins this).
- `app.lightingViews.openModes` (task 01) is a computed `LightingRenderMode[]` in left→right
  order. Reading it here is what re-renders this container on open/close/swap.
- The precedent to copy, almost line for line, is `containers/PixelStudioContainer.tsx:156-167`
  (the `panes` map) and `:203` (`canvas={<CanvasSplit panes={panes} />}`).
- **Persistence.** `ui.viewport.panels.lightingPreview` (`stores/ui/ViewportUIStore.ts:37` the
  `PanelName` union, `:96-99` the record, `:194-199` `setPanel`) is flattened onto the wire as
  `lightingPreviewPanelPosition` / `lightingPreviewPanelMinimized` (`:227-228`, `:258-259`).
  ⚠️ **Do not remove those fields, the `PanelName` member, or anything in the codecs.** Deleting a
  persisted key changes `toPersistedUIState()`'s output and would move the 151-snapshot corpus
  digests — real user data. The keys simply stop being read. Say so in your report; a future
  cleanup needs its own plan and owner sign-off.
- `LightingSurface`'s `previewPanel?: React.ReactNode` prop (`:114`, rendered `:216`) and the
  `handlePanelMinimizedChange` / `invalidatePreview` plumbing in `LightingCanvasContainer`
  (`:509-512`, `:673-678`, `:697-703`) exist only for the floating panel. Remove them with it.
- `PREVIEW_THUMB_SIZE` and `PREVIEW_BORDER` are imported by the deleted panel
  (`LightingPreviewPanel.tsx:48`) and by `LightingCanvasContainer`'s old `renderPreview`.
  ⚠️ **Do not delete `ui/canvas/render/renderLightingPreview.ts` itself** in this task — check its
  remaining importers first (`grep -rn "renderLightingPreview\|PREVIEW_THUMB_SIZE" client/src`).
  If nothing imports it after your deletions, say so in the report and **leave the file**; removing
  a module with golden-hash tests is a separate decision for the owner.
- `bun scripts/check-classes.mjs` will flag the deleted `lighting-preview-panel` CSS as gone —
  that is correct, but confirm no other sheet references those classes before deleting.

## Steps
1. **`LightingStudioContainer.tsx`:** import `CanvasSplit`, build the panes and pass them as the
   `canvas` slot:
   ```tsx
   const panes = app.lightingViews.openModes.map((mode) => ({
     key: mode,
     node: <LightingCanvasContainer renderMode={mode} />,
   }));
   … canvas={<CanvasSplit panes={panes} />}
   ```
   Replace the now-wrong header comment about the preview panel with a short block in house style:
   why the key is the mode (swap reorders, never remounts) and why the split state is session-only.
2. **Delete the floating panel:** the five `(deleted)` files in `Touches`. Remove the
   `previewPanel` prop from `LightingSurface` (prop, destructure, render site, stories, DOM test)
   and the `previewPanel?` slot from `LightingStudioLayout`. Remove `previewCanvasRef`,
   `renderPreview`, `invalidatePreview`, `handlePanelMinimizedChange` and the `previewPanel={…}`
   prop from `LightingCanvasContainer` — everything that existed solely to serve the panel.
   ⚠️ Keep the Preview **pane**'s render path from task 05 intact; only the floating-panel path goes.
3. Run the full gate (below). **Commit:** `feat(lighting): split the studio into Edit and Preview
   render modes`.
4. Perform the **manual checklist** and paste the results in the report.

## Constraints
- Do not touch `AppShell`, `PixelStudioContainer`, `CanvasContainer`, `CanvasSplit`,
  `CanvasViewControls`, or any codec / `ViewportUIStore` persisted field.
- No persistence of the split state or either camera.
- If removing the panel forces a change to a file not in `Touches`, **stop and report**.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint .                                  # 0 errors
cd client && bunx vitest run                                # all pass; corpus digests UNCHANGED
cd client && bun run lint:boundaries                        # OK — all 5 rules hold
cd client && bunx stylelint "src/**/*.css"                  # no errors beyond the 2 known in OtherHand.css
cd client && bun scripts/check-classes.mjs                  # no orphan beyond the deleted panel's
cd client && bunx storybook build                           # OK
cd server && bunx tsc --noEmit
bun run verify                                              # (repo root) exit 0
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules # nothing
```

### Manual checklist (all required)
⚠️ **Never run against the owner's real data.** Copy `server/src` and its `data/` into the
scratchpad, serve on port 3002 with `DISABLE_BONJOUR=1`, point `VITE_API_URL` at it.
`server/src/data/` must not be written.

1. Fresh load of the lighting studio → a single Edit pane, identical to before (minus the floating
   preview panel); bottom-left shows `[Open Preview view]` above `[reset]`.
2. Click **Open Preview view** → the region splits; Edit left, Preview right; the Preview pane
   shows the lit composite of the whole object at the shared pixel `zoom`; each pane's stack reads
   `[Swap] [Close] [reset]`.
3. Paint normals in the Edit pane → the Preview pane updates within a frame. Switch to height mode,
   paint → the Preview updates (lighting responds to the new heights).
4. **Click and drag on the Preview pane → nothing is painted** and no history entry is created
   (check by pressing ⌘Z afterwards: the previous stroke is what disappears).
5. **One undo per stroke** (task 02): drag across ~10 cells in the Edit pane, press ⌘Z **once** →
   the whole stroke disappears. With both panes open, ⌘Z still undoes exactly once, not twice.
6. Pan and ctrl+wheel-zoom one pane → the other does not move. Reset in one pane recentres only
   that pane. Pinch each pane independently (touch device) if available.
7. **Swap** → panes exchange sides; neither canvas flashes or remounts (art and pan survive).
8. **Close** on either pane → back to a single pane with `[Open … view]` above `[reset]`; Close is
   not offered when only one pane is open.
9. `.` and `,` step frames exactly once per press with both panes open, and both panes follow.
10. Reload → single Edit pane (split not persisted); the lighting view transform starts at 1× as it
    always has.
11. The floating Lighting Preview panel is **gone** — not draggable, not minimisable, absent from
    the DOM. Focus mode with both panes open → the split still fills the region. No console errors
    on open / swap / close, and no doubled keyboard actions under StrictMode.

## Definition of done
- [ ] `LightingStudioContainer` renders `CanvasSplit` with one `LightingCanvasContainer` per open mode.
- [ ] The floating panel and all of its plumbing are removed; no persisted key or codec changed.
- [ ] `renderLightingPreview.ts`'s remaining importers reported (file left in place if orphaned).
- [ ] Full gate green with real output pasted; corpus snapshots unchanged.
- [ ] All 11 manual checks performed and reported individually (pass / fail / not performed).
- [ ] One commit, only the `Touches` files staged.
