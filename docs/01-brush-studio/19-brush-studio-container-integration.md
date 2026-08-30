# 19 — BrushStudioContainer & mode integration

**Wave:** W7 · **Depends on:** 03, 15, 16, 17, 18
**Touches:** `client/src/containers/BrushStudioContainer.tsx` (new) · `client/src/containers/AppContainer.tsx` · `client/src/ui/components/Header/Header.tsx` · `client/src/containers/HeaderContainer.tsx` · `client/src/containers/ToolbarContainer.tsx` · `client/src/containers/PixelStudioToolsContainer.tsx` · `client/src/ui/components/Toolbar/PixelStudioTools.tsx`
**Effort:** M

## Objective
Brush mode is a real studio: `AppContainer` renders `BrushStudioContainer`, which composes
`BrushStudioLayout` with the header, toolbar, brush library, layer panel, right controls, studio
panel, timeline and canvas; entering the mode calls `brushes.init()`; the Header button reads
**Brushes** and opens `BrushSelectModal`; the toolbar shows the pixel tool set minus
`origin`/`reference-trace`, and undo/redo/flip act on the brush document.

## Context
- `containers/LightingStudioContainer.tsx` (80 lines) is the template: one layout, one child per slot.
  `containers/PixelStudioContainer.tsx:142-197` shows `{...railLayout}` from `useRailLayout()`
  (must be called inside `observer`), `rightControls`/`studioPanel` switching on
  `ui.layout.otherHandActive` (`:165-174`) — mirror that switch so the Other-Hand rail keeps working.
- `AppContainer.tsx` — task 03 left a `case "brush"` placeholder; replace with `<BrushStudioContainer />` and delete the placeholder markup.
- Header: `ui/components/Header/Header.tsx:58-115` props; `:353-362` the button; `:383` the
  modal render-prop; `:68-72, 206` inline project rename; `containers/HeaderContainer.tsx:220`
  passes `projectModal`. Add `projectButtonLabel?: string` (default `"Projects"`) and
  `documentName?: string` override used by the title/rename UI when provided. `HeaderContainer`
  in brush mode passes `projectButtonLabel="Brushes"`, `documentName={brushes.brushName || "No brush"}`,
  `projectModal={(p) => <BrushSelectModalContainer {...p} />}`, and makes inline rename call
  `brushes.renameBrush`. Save-status dot keeps reading `session.saveStatus` (shared — fine).
- Toolbar: `containers/ToolbarContainer.tsx` renders `PixelStudioToolsContainer` for pixel mode
  (`:60-66`); for `"brush"` render the same element. `containers/PixelStudioToolsContainer.tsx`
  reads `app.history.canUndo/canRedo` and `app.pixels.flipHorizontal/flipVertical` — switch to
  `app.activeHistory` (task 11) and, when `studioMode === "brush"`, `app.brushPixels.flip*`.
  `ui/components/Toolbar/PixelStudioTools.tsx:46-88` props + tool table `:90-118`: add
  `hiddenTools?: ReadonlySet<Tool>` and filter the table; container passes
  `new Set(["origin", "reference-trace"])` in brush mode. Keep the exhaustiveness gate intact.
- `useRailLayout`'s `RAIL_LABELS` ("Objects & Layers") are hard-coded in
  `containers/hooks/useRailLayout.tsx:37-42` — **out of Touches**; leave and note it as cosmetic debt.
- `GlobalHotkeys` undo/redo call `app.undo()/redo()` — already routed by task 11; verify, don't edit.

## Steps
1. `BrushStudioContainer`: `useEffect(() => { void app.brushes.init(); }, [app])` (StrictMode-safe
   because `init()` guards on `loadState`); compose the layout with
   `HeaderContainer`, `ToolbarContainer`, `BrushLibraryContainer`, `BrushLayerPanelContainer`,
   `RightSidebarTopControlsContainer` / `OtherHandRailContainer`, `BrushStudioPanelContainer`,
   `BrushTimelineContainer`, `BrushCanvasContainer`, `focusMode` from `ui.viewport.focusMode`.
2. `AppContainer` brush case. Commit: `brush-studio(19): mount BrushStudioContainer`.
3. Header label/modal/rename. Commit: `brush-studio(19): Header shows Brushes in brush mode`.
4. Toolbar: hidden tools, `activeHistory`, brush flips. Commit: `brush-studio(19): toolbar routes history and flips by studio mode`.

## Constraints
- Do not edit `useRailLayout.tsx`, `GlobalHotkeys.tsx`, stores, or any W2 component.
- Pixel and lighting studios must behave exactly as before (same containers, same props).

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint .
cd client && bunx vitest run
cd client && bun run lint:boundaries
cd client && bunx stylelint "src/**/*.css"
cd client && bunx storybook build
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
**Manual (mandatory, `bun run dev`, mouse and iPad if available):**
1. Pixel → Brush: header says **Brushes**; with no brushes, library shows the empty state; create
   "Test Brush" 16×16 from the rail form → it loads, layer panel shows "Layer 1 · RGB", timeline
   shows 1×1.
2. Paint with pencil at delta 0 → grey cells; set R=+255 in the studio panel → red-ish; eraser clears.
3. Add layer (HSL) → appears in every frame; add frame (copy) → 2 columns; move layer up/down
   reorders in both columns; play cycles the two frames; stop.
4. ⌘Z / ⇧⌘Z undo/redo brush edits; switch to Pixel → ⌘Z undoes the **project's** last change (or nothing), not the brush.
5. Wait 1 s → save dot goes pending→saved; `curl 'localhost:3001/api/brush?name=Test%20Brush'` shows the painted cells; reload → identical state, brush mode restored.
6. Brushes modal: rename → header updates; delete → next brush or empty state; the project list in Pixel mode never shows brushes.
7. Focus mode hides rails; Other-Hand rail toggles in brush mode; toolbar shows no origin/trace tools.
8. StrictMode: no duplicate `init()` network calls (Network tab shows one `GET /api/brushes`).
Report each numbered check with observations; any failure = PARTIAL.

## Definition of done
- [ ] Brush studio fully composed and reachable; placeholder deleted.
- [ ] Header label/modal/rename; toolbar hidden tools + history/flip routing.
- [ ] All eight manual checks performed and reported; gate green including stylelint/storybook.
- [ ] Three commits with only Touches files.
