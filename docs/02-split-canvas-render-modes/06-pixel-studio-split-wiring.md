# 06 — Wire the split into `PixelStudioContainer` and finish the feature

**Wave:** W3 · **Depends on:** 03, 05
**Touches:** `client/src/containers/PixelStudioContainer.tsx` · `client/src/ui/components/CanvasInfo/CanvasInfo.tsx`
**Effort:** M

## Objective
The pixel studio's canvas region renders `CanvasSplit` with one `CanvasContainer` per open
render mode, in `app.canvasViews.openModes` order. Opening the other mode splits the region;
swap reorders the panes without remounting; close returns to a single pane. The whole feature
is now reachable from the UI and passes the full gate plus the manual checklist below.

## Context
- `client/src/containers/PixelStudioContainer.tsx` (199 lines) is an `observer()` that renders
  `PixelStudioLayout` and passes `canvas={<CanvasContainer referenceImage=… onReferenceImageChange=…
  overlayFrameIndex=… />}` at `:177-181`. The header comment explains the two `useState`s
  (`referenceImage`, `overlayFrameIndex`) — both are props the **Full** pane needs; pass them to
  every pane (the Layer pane ignores overlays per task 05, but keeping the props uniform keeps
  the map trivial).
- `CanvasSplit` (task 03): `panes: ReadonlyArray<{ key: string; node: ReactNode }>`. Pane identity
  is the key — use the mode string.
- `app.canvasViews.openModes` (task 01) is a computed `CanvasRenderMode[]` in left→right order.
  Reading it here is what makes this container re-render on open/close/swap — and *only* then
  (it already re-renders on `focusMode`, `frameReferencePanelVisible`, `canvasInfoHidden`).
- `client/src/ui/components/CanvasInfo/CanvasInfo.tsx:125-140` shows, for a variant,
  `Offset: (x, y)` and the literal hint `<span>WASD to adjust offset</span>` (`:139`). Update the
  hint to `WASD / arrows to adjust offset` — the arrows are now a discoverable control. Nothing
  else in that file changes.
- Reference-image / frame-reference panels position themselves via
  `document.querySelector(".canvas-area")` (8 sites, e.g. `ReferenceImagePanel.tsx:95,123,219`).
  That element is the single `<main>` and is unchanged by the split; they keep positioning
  against the whole region. **Expected and accepted** (D9).

## Steps
1. In `PixelStudioContainer.tsx` import `CanvasSplit` and build:
   ```tsx
   const views = app.canvasViews;
   const panes = views.openModes.map((mode) => ({
     key: mode,
     node: (
       <CanvasContainer
         renderMode={mode}
         referenceImage={referenceImage}
         onReferenceImageChange={handleReferenceImageChange}
         overlayFrameIndex={overlayFrameIndex}
       />
     ),
   }));
   … canvas={<CanvasSplit panes={panes} />}
   ```
   Add a short comment block in the file's house style: why the key is the mode (swap = reorder,
   never remount) and why the split state is session-only.
2. Update the `CanvasInfo` hint text.
3. Run the full gate (below). Commit: `feat(studio): split canvas into Full and Layer render
   modes`.
4. Perform the **manual checklist** and paste the results in the report.

## Constraints
- Do not touch `PixelStudioLayout`, `AppShell`, `LightingStudioContainer` or `CanvasContainer`.
- No persistence of the split state (D3).

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint .                                  # 0 errors
cd client && bunx vitest run                                # all pass; corpus unchanged
cd client && bun run lint:boundaries                        # OK
cd client && bunx stylelint "src/**/*.css"                  # no errors beyond the 2 known in OtherHand.css
cd client && bunx storybook build                           # OK
cd server && bunx tsc --noEmit
bun run verify                                              # (repo root) exit 0
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules # nothing
```

### Manual checklist (all required — mouse on desktop; touch on the iPad if available)
1. Fresh load → single Full pane, identical to before; bottom-left shows `[Open Layer view]`
   above `[reset]`; with a **variant** layer selected the `← ↑ ↓ →` row appears at the bottom.
2. Click **Open Layer view** → region splits; Full left, Layer right; Layer pane shows only the
   variant/layer grid; each pane's stack now reads `[Swap] [Close] [reset]`.
3. Draw a pixel in the Layer pane → it appears in the Full pane at the variant's offset on the
   same frame; draw in the Full pane → appears in the Layer pane. Undo (⌘Z) once undoes once.
4. Pan and ctrl+wheel-zoom one pane → the other does not move. Reset in one pane recentres
   only that pane. Pinch (touch) in each pane independently.
5. **Swap** → panes exchange sides; neither canvas flashes/remounts (art stays, pan stays).
6. Click an arrow in the Full pane → the variant moves 1 cell in the Full pane, the Layer pane
   is unchanged (its view is offset-free), `CanvasInfo`'s `Offset:` readout changes; shift-click
   → the readout changes and stepping to another frame shows the same offset there. WASD does
   the same, and **exactly once per keypress** with two panes open.
7. **Close** in either pane → back to a single pane with `[Open … view]` above `[reset]`.
   Close is not offered when only one pane is open.
8. Reload the page → single Full pane again (split not persisted); Full pan/zoom restored as
   before the feature.
9. Select a non-variant layer with both panes open → Layer pane shows the object-sized grid with
   just that layer; arrows disappear from the Full pane.
10. Focus mode (hide rails) with both panes open → split still fills the region. Rotate an iPad
    to portrait (if available) → panes stack vertically.
11. StrictMode (`bun run dev` is StrictMode in dev): no doubled keyboard actions, no console
    errors on open/swap/close.

## Definition of done
- [ ] `PixelStudioContainer` renders `CanvasSplit` with one `CanvasContainer` per open mode.
- [ ] `CanvasInfo` hint updated.
- [ ] Full gate green with real output pasted; corpus snapshots unchanged.
- [ ] All 11 manual checks performed and reported individually (pass/fail, with notes).
- [ ] One commit, only the two `Touches` files staged.
