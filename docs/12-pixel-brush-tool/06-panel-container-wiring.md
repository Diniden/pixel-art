# 06 — Panel container wiring for the Brush section

**Wave:** W2 · **Depends on:** 01, 03, 04
**Touches:** `client/src/containers/PixelStudioPanelContainer.tsx` · `client/src/containers/__tests__/PixelStudioPanelContainer.dom.test.tsx` (new)
**Effort:** S

## Objective
The pixel studio's panel container feeds the Brush section from the stores (brush load state, name,
size, current frame, layer count) and its "Open Brush Studio" button switches studio mode. A test pins
that with the brush tool selected the panel shows the section **and** the colour picker.

## Context
- `client/src/containers/PixelStudioPanelContainer.tsx`: renders `<PixelStudioPanel …>` at `:141`;
  `colorPicker={<ColorPickerContainer />}` `:163`; grouped props `reflection={{…}}` `:172` and
  `pose={{…}}` `:192` are the pattern to copy. It is an `observer`.
- Props from task 04: `PixelStudioBrushInfo` exported from
  `client/src/ui/components/PixelStudioPanel/PixelStudioPanel.tsx`.
- Stores: `app.brushes.loadState` (`"idle"|"loading"|"loaded"|"failed"`), `hasBrush`, `brushName`,
  `document` (`observable.ref` — read `width/height/frames.length` only), `app.brushUI.selectedFrameIn(doc)`
  (task 03), `frame.layers.length`. Studio mode switch: find the app-level entry the toolbar uses —
  `containers/ToolbarContainer.tsx:57` (`onSetStudioMode`) — and call the same thing
  (`app.lightingUI.setStudioMode("brush")` or the app method it delegates to).
- The container does **not** call `brushes.init()` — `usePixelBrush` in `CanvasContainer` (task 05) does,
  whenever the tool is the brush. Note that in a comment.
- Test rig: `client/src/containers/__tests__/BrushStudioPanelContainer.dom.test.tsx` (constructs
  `ApplicationStore({ autoSaveEnabled: false })`, installs a document, renders inside the store provider)
  — copy its setup. Install a project with `app.domain`'s installer the way `CanvasContainer.dom.test.tsx`
  does, because `ColorPickerContainer` returns `null` without a project (`ColorPickerContainer.tsx:96`).

## Steps
1. Build `pixelBrush` inside the container (only when `ui.tool.selectedTool === "brush"` to avoid
   reading brush observables for other tools):
   ```ts
   const doc = app.brushes.document;
   const frame = app.brushUI.selectedFrameIn(doc);
   pixelBrush={{
     loadState: app.brushes.loadState,
     brushName: app.brushes.hasBrush ? app.brushes.brushName : null,
     width: doc?.width ?? null, height: doc?.height ?? null,
     frameName: frame?.name ?? null,
     frameIndex: frame && doc ? doc.frames.indexOf(frame) : null,
     frameCount: doc?.frames.length ?? 0,
     layerCount: frame?.layers.length ?? 0,
     onOpenBrushStudio: () => <the toolbar's studio-mode switch>("brush"),
   }}
   ```
2. Test (`__tests__/PixelStudioPanelContainer.dom.test.tsx`, new): with a project installed and
   `setTool("brush")`: (a) no brush document → the empty-state text and the button; (b) after
   `app.brushes.installDocument(createBrushDocument(4, 4))` + `brushName` set (use whatever the store
   exposes — read `BrushStore.ts` for the setter used by `loadBrush`, or install through a fake API as
   `BrushStore.test.ts` does) → project name, "4 × 4", "Frame 1 (1/1)", layer count 1; (c) the colour
   picker is present (`ColorPicker` root class — grep `className="color-picker"`) with the brush tool
   selected; (d) clicking "Open Brush Studio" sets `app.lightingUI.studioMode === "brush"`; (e) with
   `setTool("pixel")` the section is absent and the picker still present.
3. Commit: `pixel-brush(06): panel container feeds the Brush section; colour picker pinned for the brush tool`.

## Constraints
- Do not edit `PixelStudioPanel.tsx`, `ColorPickerContainer.tsx`, any store, `ToolbarContainer.tsx`.
- Do not call `brushes.init()` here.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/containers
cd client && bunx vitest run src/containers
cd client && bun run lint:boundaries
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Manual (owner): select the brush → the section names the loaded brush project, size, frame and layers;
the colour picker sits below it and still changes the stamp colour; "Open Brush Studio" switches mode.

## Definition of done
- [ ] `pixelBrush` prop built from the stores; button switches to the brush studio.
- [ ] Container test green incl. the colour-picker pin; one commit with only the two files.
