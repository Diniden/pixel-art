# 04 — Pixel-rail brush picker UI

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/components/PixelStudioPanel/PixelStudioBrushSection.tsx` · `client/src/ui/components/PixelStudioPanel/PixelStudioBrushSection.stories.tsx` · `client/src/ui/components/PixelStudioPanel/__tests__/PixelStudioBrushSection.dom.test.tsx` · `client/src/ui/components/PixelStudioPanel/PixelStudioPanel.css`
**Effort:** S

## Objective
The pixel studio's Brush rail section can show a **"Brush"** dropdown as the first row of its loaded state, listing the brushes of the open project (`name (W×H)`) and reporting a pick through `onSelectBrush`. The three new members of `PixelStudioBrushInfo` are optional, so nothing else changes until task 14 supplies them; the stories and dom tests cover both the with-picker and without-picker states.

## Context
`PixelStudioBrushSection.tsx` (plan 13 task 13) is the pure section; `PixelStudioBrushInfo` is at `:78-92` and the loaded-state JSX at `:249-319` (a `<dl class="pixel-studio-panel__brush-rows">` of Project / Size / Frame / Layers rows, then the size controls, the "Open Brush Studio" button and the hint). `PixelStudioPanel.tsx:81-88` re-exports the prop types, so `PixelStudioPanelContainer` keeps importing from the panel. The `Dropdown` primitive (`ui/primitives/Dropdown/Dropdown.tsx`, `DropdownOption`) is already imported and used at `:157-` (`BrushSizeControls`, the "Scaling" picker) — copy that usage, including its `className`/trigger pattern.

Locked additions (MASTER D11):

```ts
export interface PixelStudioBrushOption {
  id: string;
  name: string;
  width: number;
  height: number;
}
export interface PixelStudioBrushInfo {
  …existing members unchanged…
  /** The brushes in the open project (plan 14). Absent or empty = no picker row. */
  brushes?: ReadonlyArray<PixelStudioBrushOption>;
  selectedBrushId?: string | null;
  onSelectBrush?: (brushId: string) => void;
}
```

Render rule: the picker row appears only when `loaded && brushes && brushes.length > 0 && onSelectBrush`. It is the **first** row inside the `<dl>` (before "Project"): `<dt>Brush</dt><dd><Dropdown …/></dd>`, option label `${name} (${width}×${height})`, value = id, selected = `selectedBrushId ?? brushes[0].id`. BEM: `pixel-studio-panel__brush-picker` on the `dd` and `pixel-studio-panel__brush-picker-trigger` on the trigger (mirror `__brush-scale-picker` / `__brush-scale-trigger` at `PixelStudioPanel.css:278-286`). Change the hint text (`:314-317`) to `Stamps the selected brush's current frame with the selected colour.`

Why optional: task 01 owns `PixelStudioPanelContainer.tsx` in this same wave, so the container cannot be updated here; `size?` (plan 13) set the precedent.

## Steps
1. Add `PixelStudioBrushOption` and the three optional members; export the new type from `PixelStudioPanel.tsx`'s re-export block too (that file is **not** in `Touches` — if the re-export is needed for the container in task 14, task 14 adds it; here, export from the section file only).
2. Add the picker row and the hint change to the JSX; add the two CSS rules.
3. Stories: add `WithBrushPicker` (three brushes, second selected) and keep the existing stories unchanged (they must still render without the new props).
4. Dom tests: no picker without `brushes`; no picker with `brushes: []`; with three brushes the dropdown lists `name (W×H)` labels, shows the selected one, and a pick calls `onSelectBrush(id)`; the hint text is updated (update the existing assertion if one pins the old sentence).
5. Run the verification. Commit: `multi-brush(04): PixelStudioBrushSection — optional Brush picker row`.

## Constraints
- All three new props optional; every existing story and test keeps passing without them.
- `ui/` purity; no store import. Section file stays under 400 code lines (it is ~320 now — if the row pushes it over, extract the picker into `PixelStudioBrushPicker.tsx` in the same folder and add it to your report as a `Touches` addition).
- Do not touch `PixelStudioPanel.tsx`, `PixelStudioPanelContainer.tsx`, or anything under `containers/`.

## Verification
```sh
cd client && bunx tsc --noEmit && bunx eslint . && bunx vitest run src/ui/components/PixelStudioPanel && bun run lint:boundaries
cd client && bunx stylelint "src/ui/components/PixelStudioPanel/*.css"
cd client && bunx storybook build
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # prints nothing
```
Expected: tsc clean; eslint 0 errors / no new warnings; the three PixelStudioPanel suites green (17 + new in the section suite); stylelint no new errors; storybook builds.

Manual (Storybook): `WithBrushPicker` shows the Brush row first, the dropdown opens and lists three options with sizes; the older stories look unchanged. Light and dark.

## Definition of done
- [ ] `PixelStudioBrushOption` exported; three optional members added; picker renders per the rule.
- [ ] Hint text updated; CSS rules added.
- [ ] Stories and dom tests cover with/without picker; gate output pasted.
- [ ] Storybook manual check performed and recorded.
