# 12 — BrushLayerPanel UI

**Wave:** W2 · **Depends on:** 01
**Touches:** `client/src/ui/components/BrushLayerPanel/BrushLayerPanel.tsx` (new) · `BrushLayerRow.tsx` (new) · `BrushChannelMenu.tsx` (new) · `BrushLayerPanel.css` (new) · `storyFixtures.ts` (new) · `BrushLayerPanel.stories.tsx` (new) · `BrushLayerRow.stories.tsx` (new) — all under `client/src/ui/components/BrushLayerPanel/`
**Effort:** M

## Objective
A pure, story-covered layer panel for brush documents: rows with visibility toggle, inline
rename, a channel-type badge that opens a portalled menu (HSL / RGB / NORMAL / HEIGHTMAP), an
applied-group sub-menu (None / existing groups / New group…), move-up/move-down (uniform across
frames — there is no per-frame scope), duplicate and delete; a header with "Add layer". No
variants, no per-frame anything.

## Context
- Analogue to copy structurally: `client/src/ui/components/LayerPanel/` — `LayerPanel.tsx:50-113`
  (props), `LayerRow.tsx:61-122` (row model + props), `:169-194` (visibility column),
  `:196-254` (label row with inline rename input and `__group-badge`/`__type-badge`),
  `:256-364` (actions column; every handler calls `e.stopPropagation()`), `LayerPanel.css`
  (BEM header comment, elements in DOM order, then modifiers), `storyFixtures.ts`,
  `LayerRow.stories.tsx:11-60` (meta shape: `title: "Components/<Dir>/<Name>"`,
  `tags: ["autodocs"]`, `fn()` callbacks, a decorator supplying `panel layer-panel` chrome).
- **Do not use `ui/primitives/Dropdown`** for the channel menu — it renders in-flow and clips
  inside the rail scroller. Copy the portalled anchor-measured pattern from
  `client/src/ui/components/Toolbar/EyedropperModeMenu.tsx` (224 lines) + its CSS.
- Shared blocks available without import: `.panel`, `.panel__header`, `.panel__header--stacked`,
  `.panel__body` (`client/src/styles/blocks/panel.css`), `.btn` (`btn.css`). Tokens in
  `client/src/styles/tokens.css`. Stylelint enforces BEM class pattern + token-only values
  (`client/.stylelintrc.json`).
- Icons: `lucide-react` through `ui/primitives/Icon` and `IconButton`; `Tooltip` primitive for hover labels.
- Types from `client/src/types/brush.ts`: `BrushChannelType`, `BRUSH_CHANNEL_TYPES`,
  `BRUSH_CHANNEL_BADGE`, `BrushAppliedGroup`.
- ui/ rules: no store/API/MobX/`useContext`; props in, callbacks out. Stories run with no provider.

## Steps
1. Define models/props in `BrushLayerRow.tsx`:
   ```ts
   export interface BrushLayerRowModel { id: string; name: string; visible: boolean; channelType: BrushChannelType; appliedGroupName: string | null }
   export interface BrushLayerRowProps {
     layer: BrushLayerRowModel; isSelected: boolean; index: number; count: number;
     appliedGroups: ReadonlyArray<BrushAppliedGroup>;
     onSelect(id): void; onToggleVisibility(id): void; onRename(id, name): void;
     onSetChannelType(id, type: BrushChannelType): void;
     onSetAppliedGroup(id, groupId: string | null): void; onCreateAppliedGroup(layerId, name: string): void;
     onMoveUp(id): void; onMoveDown(id): void; onDuplicate(id): void; onDelete(id): void;
   }
   ```
   Row layout: visibility column → main column (badge button `brush-layer-panel__channel-badge`
   showing `BRUSH_CHANNEL_BADGE[type]`, name / inline rename on double-click, optional
   `__group-badge`) → actions column (up, down, duplicate, delete). Up/down disabled at the ends.
2. `BrushChannelMenu.tsx`: portalled menu anchored to the badge button; sections "Channels"
   (four radio-style items) and "Applied group" (None, each group, "New group…" which reveals an
   inline text input + confirm). Keyboard: Escape closes, Arrow keys move, Enter selects.
   `role="menu"`/`menuitemradio`.
3. `BrushLayerPanel.tsx`:
   ```ts
   export interface BrushLayerPanelProps {
     layers: ReadonlyArray<BrushLayerRowModel>;   // top of stack first (display order)
     selectedLayerId: string | null; appliedGroups: ReadonlyArray<BrushAppliedGroup>;
     onAddLayer(channelType: BrushChannelType): void;   // header "+" opens the same channel menu to pick the type
     …every BrushLayerRowProps callback…
   }
   ```
   Header uses `panel__header--stacked` with the title "Layers" and the add button; body lists rows.
4. `BrushLayerPanel.css`: block `brush-layer-panel`, elements in DOM order, modifiers last,
   tokens only; menu styles as `brush-layer-panel__menu*` elements (mirror EyedropperModeMenu.css).
5. `storyFixtures.ts`: `BRUSH_LAYERS_TYPICAL` (4 layers, one per channel type, one grouped),
   `BRUSH_GROUPS`. Stories: `BrushLayerRow` (default, selected, grouped, long name),
   `BrushLayerPanel` (typical, empty, many).
6. Run verification; commit: `brush-studio(12): BrushLayerPanel, BrushLayerRow, BrushChannelMenu`.

## Constraints
- No per-frame move scope, no variant props, no `Dropdown` primitive for the menu.
- Do not edit `LayerPanel/**`, `EyedropperModeMenu.*`, or shared blocks/tokens.
- Keep each file ≲ 300 lines; split helpers if needed (inside this directory only).

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/ui/components/BrushLayerPanel
cd client && bunx stylelint "src/ui/components/BrushLayerPanel/*.css"   # 0 errors
cd client && bun run lint:boundaries
cd client && bunx storybook build                                        # builds; stories present
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Manual (`bun run storybook`, open http://localhost:6006): open the channel menu on a row inside
the panel story — it must render **above** the panel, not clipped; keyboard navigation works;
inline rename commits on Enter and cancels on Escape.

## Definition of done
- [ ] Panel, row, menu components with the props above; CSS block BEM/token clean.
- [ ] Stories build and show the listed variants; menu not clipped (checked visually).
- [ ] No store/MobX/context imports (boundaries OK).
- [ ] One commit with only the new directory staged.
