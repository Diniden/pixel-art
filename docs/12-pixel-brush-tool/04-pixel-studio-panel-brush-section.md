# 04 — `PixelStudioPanel` "Brush" section (pure UI)

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/components/PixelStudioPanel/PixelStudioPanel.tsx` · `client/src/ui/components/PixelStudioPanel/PixelStudioPanel.css` · `client/src/ui/components/PixelStudioPanel/__tests__/PixelStudioPanel.dom.test.tsx` (new)
**Effort:** S

## Objective
When the selected tool is `"brush"`, the pixel studio's right-rail panel shows a "Brush" section
above the colour picker that names the loaded brush project, its size, its current frame and layer
count — or a loading / failed / empty state with an "Open Brush Studio" button. The colour picker and
palette manager remain exactly where they are for every tool. Pure props in, callbacks out; the
container (task 06) supplies the data.

## Context
- `client/src/ui/components/PixelStudioPanel/PixelStudioPanel.tsx`: `selectedTool: string` `:80`
  (a plain string — comparing to `"brush"` compiles regardless of task 01); gates `:176-180`
  (`showPencilControls = selectedTool === "pixel"`, …); each section is
  `<div className="panel pixel-studio-panel__section"> … </div>` (`:185-345`, copy the pencil section's
  header/label markup at `:189-256`); grouped **optional** props for big sections: `reflection?` `:137`,
  `pose?` `:150` (the comments there say why: every existing caller/story predates the prop);
  `{colorPicker}{paletteManager}` unconditional at `:358-359`. `PixelStudioPanel.css` sits beside it.
- Primitives available under `client/src/ui/primitives/` (`Button`, `EmptyState`, `Panel`) — use
  `Button` for the action; look at how `BrushDeltaPicker.tsx` uses `EmptyState` for a small empty state.
- Tokens: `client/src/styles/tokens.css` (`--text-secondary`, `--text-sm`, `--space-*`). Stylelint
  token-enforces colour, z-index, shadow, radius, font, duration (`client/.stylelintrc.json:51-81`);
  BEM `block__element--modifier`.
- No story and no dom test exist for `PixelStudioPanel` itself (`__tests__/` holds only
  `ReflectionLinesSection.dom.test.tsx` — copy its rig). Do not add a story (out of scope; the panel has
  none today).
- `ui/` purity: no store, no MobX, no `containers/` import.

## Steps
1. Export from `PixelStudioPanel.tsx`:
   ```ts
   export type PixelStudioBrushLoadState = "idle" | "loading" | "loaded" | "failed";
   export interface PixelStudioBrushInfo {
     loadState: PixelStudioBrushLoadState;
     /** Filename stem of the loaded brush project, or null when none is loaded. */
     brushName: string | null;
     width: number | null;
     height: number | null;
     frameName: string | null;
     /** 0-based; null when no frame. */
     frameIndex: number | null;
     frameCount: number;
     layerCount: number;
     onOpenBrushStudio: () => void;
   }
   ```
   and add `pixelBrush?: PixelStudioBrushInfo` to the props with a doc comment explaining the grouping.
2. `const showBrushControls = selectedTool === "brush" && !!pixelBrush;` beside the other gates. Render
   the section **before** `{colorPicker}` in the same position pattern as the pencil section:
   - header text "Brush";
   - when `loadState === "loaded" && brushName`: rows `Project: <name>`, `Size: <w> × <h>`,
     `Frame: <frameName> (<frameIndex+1>/<frameCount>)`, `Layers: <layerCount>` as
     `pixel-studio-panel__brush-row` / `__brush-label` / `__brush-value` (or a `<dl>` — pick one and keep
     it consistent with the pencil section's label markup);
   - `loading` → text "Loading brush projects…"; `failed` → "Could not load brush projects."; `idle` or
     `loaded` with no brush → "No brush project loaded. Create one in the Brush Studio.";
   - always a `Button` "Open Brush Studio" calling `onOpenBrushStudio` (so the user can also change frame
     or layers there); a one-line hint "Stamps the current frame of the open brush project with the selected colour."
3. CSS: `.pixel-studio-panel__brush-*` rules with tokens only, placed in DOM order among the section
   element rules.
4. Test (`__tests__/PixelStudioPanel.dom.test.tsx`, new): render the panel with the minimal required
   props (read the interface; pass stubs) and assert: (a) with `selectedTool="pixel"` and a `pixelBrush`
   prop no "Brush" section renders; (b) with `selectedTool="brush"` and no `pixelBrush` prop nothing
   renders and nothing throws; (c) loaded state shows the project name, size, frame `(2/3)` and layer
   count; (d) each of `idle`/`loading`/`failed` shows its message; (e) the button calls
   `onOpenBrushStudio` once; (f) the `colorPicker` node is rendered for `selectedTool="brush"` **and**
   `"pixel"` (pin the requirement "the colour picker is available in the side rail").
5. Commit: `pixel-brush(04): PixelStudioPanel Brush section (pure UI)`.

## Constraints
- Do not move or gate `colorPicker` / `paletteManager`; do not touch other sections' markup.
- No new required prop (existing callers and any story must compile unchanged).
- Do not edit `PixelStudioPanelContainer.tsx` (task 06).

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/ui/components/PixelStudioPanel
cd client && bunx stylelint "src/ui/components/PixelStudioPanel/*.css"   # 0 errors
cd client && bunx vitest run src/ui/components/PixelStudioPanel
cd client && bun run lint:boundaries
cd client && bunx storybook build
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Manual (owner, after task 06): with the brush tool selected the section appears above the colour
picker and the picker still works; with the pencil selected the section is gone.

## Definition of done
- [ ] `PixelStudioBrushInfo` exported; section renders only for `"brush"` with a `pixelBrush` prop; all four states covered.
- [ ] Tokens-only CSS, stylelint 0 errors; dom test green incl. the colour-picker pin; one commit with only Touches files.
