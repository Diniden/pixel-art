# 03 — `BrushList` UI component

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/components/BrushList/BrushList.tsx` (new) · `client/src/ui/components/BrushList/BrushListRow.tsx` (new) · `client/src/ui/components/BrushList/BrushList.css` (new) · `client/src/ui/components/BrushList/storyFixtures.ts` (new) · `client/src/ui/components/BrushList/BrushList.stories.tsx` (new) · `client/src/ui/components/BrushList/__tests__/BrushList.dom.test.tsx` (new)
**Effort:** M

## Objective
A pure `ui/` component renders the brushes **inside** a project as the left rail's top panel: a "Brushes" header with a "+" that opens an inline name/W/H form, and one row per brush with a thumbnail, its name, a `W×H` badge, selection highlight, inline rename on double-click, and hover actions (move up, move down, duplicate, delete). It has stories and dom tests. Nothing mounts it yet — task 13 (W4) does.

## Context
This replaces `ui/components/BrushLibrary/BrushLibrary.tsx` (257 lines), which lists **files**; read it for the create form (`:64-96` state, `:127-215` markup with `NumberInput`, defaults 16, range 1..256, `useId` for labels, Enter/Escape handling) and its CSS (`BrushLibrary.css`, 182 lines — the `brush-library__*` rules for the header button, form, list, item, thumb, name, size badge). Copy the form and the list styling under the new block name; do **not** import from `BrushLibrary` (it is deleted in task 13).

For the row affordances copy `ui/components/BrushLayerPanel/BrushLayerRow.tsx` (362 lines): inline rename input `:239-262` (double-click the name → input, Enter commits through `onRename`, Escape cancels, blur commits), the four action buttons `:280-330` (`title` + `aria-label` per button, `disabled` at the ends of the list), and `BrushLayerPanel.css` for `.brush-layer-panel__row--selected` and the hover-reveal actions. `BrushLayerPanel.tsx` shows the panel skeleton: `panel` + `panel__header panel__header--stacked` + `panel__title` + header actions + `panel__body`.

Thumbnails: `ui/primitives/ThumbnailCanvas/ThumbnailCanvas.tsx` — props `size`, `revision`, `draw`, `label`, optional `className`. The container will supply a `draw` closure per row and one shared `thumbnailRevision`; the component repaints when the revision changes and ignores closure identity (see `BrushLibrary.tsx:200-208` for the usage to copy, `BRUSH_THUMB_SIZE = 32`).

Locked props (MASTER D8):

```ts
export const BRUSH_LIST_THUMB_SIZE = 32;
export interface BrushListRowModel {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Paints this brush's thumbnail; `null` = no thumbnail (row shows name only). */
  draw: ((ctx: CanvasRenderingContext2D, size: number) => void) | null;
}
export interface BrushListProps {
  /** Display order: index 0 at the top. Never empty in practice, but render an EmptyState if it is. */
  brushes: ReadonlyArray<BrushListRowModel>;
  selectedBrushId: string | null;
  /** Changes whenever any thumbnail's content changes. */
  thumbnailRevision: number;
  onSelect: (brushId: string) => void;
  onAdd: (name: string, width: number, height: number) => void;
  onRename: (brushId: string, name: string) => void;
  onDuplicate: (brushId: string) => void;
  onDelete: (brushId: string) => void;
  onMoveUp: (brushId: string) => void;
  onMoveDown: (brushId: string) => void;
}
```

Rules: `onDelete` is never fired when `brushes.length === 1` (the button is `disabled`, `title="Cannot delete the last brush"`); move-up disabled on index 0, move-down on the last index; `onRename` is not fired for an unchanged or empty (trimmed) name; `onAdd` requires a non-empty trimmed name that is not already used by a row (case-sensitive compare on trimmed names) — show the error inline (`role="alert"`) as the library form does. The validator is local to this component (`validateBrushListName(name, existing)`), **not** `BrushLibrary/brushName.ts`, which enforces file-name rules.

BEM block `brush-list`: `brush-list`, `brush-list__header-actions`, `brush-list__header-btn` (`--active`), `brush-list__new-form`, `brush-list__label`, `brush-list__name-input`, `brush-list__size-inputs`, `brush-list__size-field`, `brush-list__size-input`, `brush-list__size-separator`, `brush-list__error`, `brush-list__form-actions`, `brush-list__list`, `brush-list__row` (`--selected`), `brush-list__thumb`, `brush-list__thumb-canvas`, `brush-list__name`, `brush-list__rename-input`, `brush-list__size`, `brush-list__actions`, `brush-list__action-btn`, `brush-list__empty`. Use the design tokens the two source stylesheets use; no new tokens.

`max-lines` is an **error** at 400 code lines under `src/ui/**` — keep the row in `BrushListRow.tsx` from the start.

## Steps
1. Create `BrushListRow.tsx`: the row (thumbnail, name / rename input, badge, actions). Props: `brush: BrushListRowModel`, `isSelected`, `index`, `count`, `thumbnailRevision`, and the six row callbacks.
2. Create `BrushList.tsx`: the panel, header with "+", the inline create form (state, validator, submit, Enter/Escape), the list or an `EmptyState` ("No brushes in this project."). Import `./BrushList.css`.
3. Create `BrushList.css` with the block above; copy the relevant rules from `BrushLibrary.css` and `BrushLayerPanel.css` and rename.
4. Create `storyFixtures.ts` (`TYPICAL_BRUSHES` ×3 with a simple `draw` that paints a coloured square, `MANY_BRUSHES` ×12, `LONG_NAME_BRUSH`) and `BrushList.stories.tsx` (Typical, Many, LongName, SingleBrush — delete disabled, WithForm open). Follow `BrushLayerPanel.stories.tsx` for the meta/decorator shape.
5. Create `__tests__/BrushList.dom.test.tsx` (jsdom lane): renders rows in order and highlights the selection; click → `onSelect`; "+" opens the form, empty name and duplicate name show the error and do not call `onAdd`, a valid submit calls `onAdd(name, w, h)` and closes the form; double-click → rename input, Enter with a new name → `onRename`, Escape → no call; actions: up/down/duplicate/delete call through with the id, up disabled at index 0, down at the end, delete disabled with one brush. Follow `BrushLayerPanel/__tests__/BrushChannelMenu.dom.test.tsx` and `BrushLibrary/__tests__/BrushLibrary.dom.test.tsx` for the rig (Testing Library + `userEvent`).
6. Run the verification. Commit: `multi-brush(03): BrushList — the brushes inside a project, as a pure rail panel`.

## Constraints
- `ui/` purity: React, lucide, primitives, `classNames`, the stylesheet. No store, no MobX, no API, no `Brush`/`BrushDocument` type (the row model is the boundary).
- Do not modify or delete `BrushLibrary/**` (task 13) and do not import from it.
- Do not touch `BrushStudioLayout` or any container.

## Verification
```sh
cd client && bunx tsc --noEmit && bunx eslint . && bunx vitest run src/ui/components/BrushList && bun run lint:boundaries
cd client && bunx stylelint "src/ui/components/BrushList/*.css"
cd client && bunx storybook build
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # prints nothing
```
Expected: tsc clean; eslint 0 errors, no new warnings (`BrushList.tsx` and `BrushListRow.tsx` each under 400 code lines); the new dom test file green; stylelint 0 errors in the new file; storybook builds with the new stories.

Manual (Storybook, `bun run storybook:dev`): the Typical story shows three rows with thumbnails and badges; hover reveals the four actions; the SingleBrush story shows delete disabled; the form opens and validates; light and dark themes both legible. Record what you saw.

## Definition of done
- [ ] Six new files; no existing file changed.
- [ ] Every prop and rule in the locked props block is implemented and tested.
- [ ] Gate output pasted; stylelint and storybook clean; boundaries 5/5.
- [ ] Storybook manual check performed and recorded.
