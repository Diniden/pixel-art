# 13 — BrushLibrary & BrushSelectModal UI

**Wave:** W2 · **Depends on:** 01
**Touches:** `client/src/ui/components/BrushLibrary/BrushLibrary.tsx` (new) · `BrushLibrary.css` (new) · `BrushLibrary.stories.tsx` (new) · `client/src/ui/components/BrushSelectModal/BrushSelectModal.tsx` (new) · `BrushSelectModal.css` (new) · `BrushSelectModal.stories.tsx` (new)
**Effort:** M

## Objective
Two pure components: `BrushLibrary`, the left-rail brush selector (list of brush file names,
current one highlighted, thumbnail for the loaded brush, inline "new brush" form with
width/height), and `BrushSelectModal`, the Header-button modal that lists / creates / renames /
deletes brush files (the brush counterpart of `ProjectSelectModal`).

## Context
- Rail analogue: `client/src/ui/components/ObjectLibrary/ObjectLibrary.tsx:58-101` (props with
  `makeThumbnailDraw` + `thumbnailRevision`), `ObjectThumbnail.tsx`, `dialogs/` (create dialog
  with width/height), its CSS and stories. `ThumbnailCanvas` primitive
  (`ui/primitives/ThumbnailCanvas`, props `draw`, `revision`, `size`).
- Modal analogue: `client/src/ui/components/ProjectSelectModal/ProjectSelectModal.tsx:6-16` props,
  name regex `/^[a-zA-Z0-9\s\-_]+$/` at `:57-68`, `Modal` primitive usage, `.stories.tsx`.
- Shared blocks: `.panel*`, `.btn`, `.modal*`, `.confirm-dialog*`; `EmptyState` primitive for
  "No brushes yet"; `Field`, `NumberInput`, `ConfirmDialog` primitives.
- Only the **loaded** brush has data in memory; other rows show name only (no thumbnail).

## Steps
1. `BrushLibrary.tsx`:
   ```ts
   export interface BrushLibraryProps {
     brushes: ReadonlyArray<string>;            // sorted names
     currentBrush: string | null;
     currentSize: { width: number; height: number } | null;
     thumbnailDraw: ((ctx: CanvasRenderingContext2D, size: number) => void) | null;  // loaded brush only
     thumbnailRevision: number;
     isLoading: boolean;
     onSelectBrush(name: string): void;
     onCreateBrush(name: string, width: number, height: number): void;
   }
   ```
   Rows: name + (for current) `ThumbnailCanvas` + `W×H`. Header "Brushes" with a "+" that
   toggles an inline create form (name, width 1–256 default 16, height same, Create/Cancel);
   client-side name validation with the same regex; disable Create while `isLoading`.
   `EmptyState` when `brushes` is empty.
2. `BrushLibrary.css`: block `brush-library`, tokens only.
3. `BrushSelectModal.tsx`:
   ```ts
   export interface BrushSelectModalProps {
     onClose(): void; brushName: string | null; brushList: ReadonlyArray<string>;
     onSwitchBrush(name): Promise<boolean>; onCreateBrush(name, width, height): Promise<boolean>;
     onRenameBrush(newName): Promise<boolean>; onDeleteBrush(): Promise<boolean>; onRefreshBrushList(): Promise<void>;
   }
   ```
   Mirror `ProjectSelectModal`'s local state (`isLoading`, `error`, new-name input) and add
   width/height inputs and a Rename row for the current brush. Delete asks via `ConfirmDialog`.
4. `BrushSelectModal.css`: block `brush-select-modal`.
5. Stories: `BrushLibrary` (typical with a drawn thumbnail via a synthetic `thumbnailDraw`, empty,
   loading), `BrushSelectModal` (typical, empty, error). `title: "Components/BrushLibrary/BrushLibrary"` etc.
6. Commit: `brush-studio(13): BrushLibrary and BrushSelectModal`.

## Constraints
- No store/API/MobX imports; no container imports (a `ui/` file importing a container drags MobX across the boundary).
- Do not edit `ObjectLibrary/**` or `ProjectSelectModal/**`.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/ui/components/BrushLibrary src/ui/components/BrushSelectModal
cd client && bunx stylelint "src/ui/components/BrushLibrary/*.css" "src/ui/components/BrushSelectModal/*.css"
cd client && bun run lint:boundaries
cd client && bunx storybook build
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Manual in Storybook: create form validates names; modal Escape/backdrop closes; delete shows a confirm.

## Definition of done
- [ ] Both components with the props above, CSS blocks clean, stories building.
- [ ] Manual story checks done.
- [ ] One commit, only the two new directories staged.
