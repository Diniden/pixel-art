# 06 — Reflection panel section in the right rail

**Wave:** W2 · **Depends on:** 01, 03
**Touches:** `client/src/ui/components/PixelStudioPanel/ReflectionLinesSection.tsx` (new) · `client/src/ui/components/PixelStudioPanel/ReflectionLinesSection.css` (new) · `client/src/ui/components/PixelStudioPanel/ReflectionLinesSection.stories.tsx` (new) · `client/src/ui/components/PixelStudioPanel/__tests__/ReflectionLinesSection.dom.test.tsx` (new) · `client/src/ui/components/PixelStudioPanel/PixelStudioPanel.tsx` · `client/src/containers/PixelStudioPanelContainer.tsx`
**Effort:** M

## Objective
When the Reflection tool is selected, the pixel-studio panel shows a "Reflection" section
listing every reflection line with an ✕ button to remove it, a "Clear all" action, and a
row of preset buttons (Vertical, Horizontal, Both, Diagonals, All) that add lines for the
current grid size.

## Context
- `PixelStudioPanel.tsx` (259 lines) gates per-tool sections at `:122-125`
  (`showEraserControls = selectedTool === "eraser"` …) and renders them as
  `<div className="panel pixel-studio-panel__section">` with `panel__header--compact` /
  `panel__title` / `panel__body--dense` from `client/src/styles/blocks/panel.css`. The
  shape-button row at `:166-176` (`pixel-studio-panel__shape-btn`, `--active`) is the
  visual precedent for the preset row. The panel has no story/test of its own; the new
  sub-component gets both.
- Container: `containers/PixelStudioPanelContainer.tsx` (66 lines) is the `observer()`
  seam; it already passes `selectedTool={tool.selectedTool}` at `:42`. Read
  `app.reflection` (task 03) and `app.editableGrid` / grid dims (see how the container or
  `CanvasContainer.tsx` derive `gridWidth`/`gridHeight`; `ApplicationStore.editableGrid`
  returns `{ grid, dims }`) for presets.
- Pure-component conventions: `ui/components/CanvasViewControls/` — BEM block, tokens only,
  story with `fn()` callbacks, dom test that `composeStories` every story and asserts the
  story-name set + DOM. Icons: `X` from lucide via `ui/primitives/Icon/Icon`;
  `IconButton` primitive exists (`ui/primitives/IconButton`).
- Preset geometry belongs to `ui/canvas/model/reflection.ts` (`presetLines`, task 02);
  the **container** calls it and hands the store plain lines — the section component
  only emits `onApplyPreset(preset)`.
- `ReflectionLine` type: import the *ui* one from `ui/canvas/model/reflection.ts` in the
  component; the container may pass store lines directly (structurally identical).

## Steps
1. `ReflectionLinesSection.tsx` props:
   ```ts
   interface ReflectionLinesSectionProps {
     lines: readonly { id: string; label: string }[];
     atCapacity: boolean;                       // disables presets/add when 8 lines exist
     onRemoveLine: (id: string) => void;
     onClearAll: () => void;
     onApplyPreset: (preset: ReflectionPreset) => void;
   }
   ```
   Block `reflection-lines`; elements `__list`, `__item`, `__label`, `__remove`,
   `__presets`, `__preset`, `__empty` ("Drag on the canvas to draw a reflection line").
   Buttons need `aria-label`s (`Remove reflection line 2`).
2. CSS (tokens only, no literals, no `!important`, ≤ 2 class compounds per selector —
   stylelint `selector-max-class`).
3. Stories: Empty, TwoLines, AtCapacity. Dom test: story set, remove button fires with id,
   preset buttons fire, disabled at capacity.
4. In `PixelStudioPanel.tsx` add `showReflectionControls = selectedTool === "reflection"`
   and render the section inside the standard `panel` wrapper with title "Reflection".
   Add the five new props (pass-through) to `PixelStudioPanelProps` as **optional**
   grouped under a single `reflection?: ReflectionLinesSectionProps` prop so existing
   callers/stories keep compiling.
5. Container: map `app.reflection.lines` to `{id, label: describeLine(line)}`, wire
   `removeLine`, `clear`, and `onApplyPreset` → `app.reflection.addLines(presetLines(preset, w, h, …))`
   (ids are assigned by the store; pass `() => ""` or let `addLines` ignore ids — pick
   one and document it).
6. Commit: `feat(ui): reflection lines panel section`.

## Constraints
- No store import in `ui/`. `observer()` only in the container.
- Do not touch `CanvasContainer.tsx` or `PixelStudioTools.tsx`.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx vitest run src/ui/components/PixelStudioPanel 2>&1 | tail -6
cd client && bunx eslint src/ui/components/PixelStudioPanel src/containers/PixelStudioPanelContainer.tsx
cd client && bunx stylelint "src/ui/components/PixelStudioPanel/*.css"   # 0 errors in these files
cd client && bun run lint:boundaries && bunx storybook build 2>&1 | tail -3
```
Manual (after task 07 lands, or with the store populated via presets): select Reflection
→ section appears; click "Vertical" → one row appears; ✕ removes it; "All" adds four;
at 8 lines presets disable.

## Definition of done
- [ ] Section renders only for `selectedTool === "reflection"`.
- [ ] Rows list lines with ✕; Clear all; five presets; capacity handling.
- [ ] Story + dom test green; storybook builds; boundary check passes.
