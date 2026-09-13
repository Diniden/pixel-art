# 03 — Brush layer panel: pick the colour source at creation and from the badge menu

**Wave:** W2 · **Depends on:** 01
**Touches:** `client/src/ui/components/BrushLayerPanel/BrushChannelMenu.tsx` · `client/src/ui/components/BrushLayerPanel/BrushLayerPanel.tsx` · `client/src/ui/components/BrushLayerPanel/BrushLayerRow.tsx` · `client/src/ui/components/BrushLayerPanel/BrushLayerPanel.css` · `client/src/ui/components/BrushLayerPanel/storyFixtures.ts` · `client/src/ui/components/BrushLayerPanel/BrushLayerPanel.stories.tsx` · `client/src/ui/components/BrushLayerPanel/BrushLayerRow.stories.tsx` · `client/src/ui/components/BrushLayerPanel/__tests__/BrushChannelMenu.dom.test.tsx`
**Effort:** M

## Objective
The header "+" menu lets the user choose the new layer's colour source alongside its
channel, and each layer row shows a second badge (`SEL` / `TGT`) whose menu changes the
source later. Pure UI: props in, callbacks out. The container is task 04.

## Context
- `BrushLayerPanel.tsx` (135 lines): props `:28-47` (`onAddLayer: (channelType) => void` `:35`);
  the "+" trigger `:73-89`; the creation menu `:121-132` renders `BrushChannelMenu` with
  `channelType={null}` and **no** `onSelectAppliedGroup`, and the menu **fires-and-closes on
  the channel pick** (`onSelectChannelType` → `onAddLayer(type); closeAdd()`).
- `BrushChannelMenu.tsx` (346 lines): props `:58-86`; `showGroups = onSelectAppliedGroup !== undefined`
  `:114`; the `radio()` row factory `:225-253` (`role="menuitemradio"`, BEM
  `brush-layer-panel__menu-item` / `--selected` / `__menu-check` / `__menu-text` / `__menu-label` / `__menu-detail`);
  sections `:256-341`; roving focus via `ITEM_SELECTOR` `:91-93`; the positioning
  `useLayoutEffect` deps `[anchorEl, creating]` `:137`. Portal to `document.body` `:345`.
- `BrushLayerRow.tsx` (310 lines): `BrushLayerRowModel` `:43-56`; the channel badge button
  `:158-178` (`brush-layer-panel__channel-badge`, per-type modifier, `aria-label="Channel: …"`);
  the row's menu wiring `:286-307`. Header rule `:12-15`: no `BrushLayer` crosses into the row.
- CSS `BrushLayerPanel.css`: `__label-row` `:94-99` (flex, gap), `__channel-badge` `:103-122`,
  per-type modifiers `:224-246`, `--open` ring `:248-251`.
- Types from task 01: `BrushColorSource`, `BRUSH_COLOR_SOURCES`, `BRUSH_COLOR_SOURCE_LABEL`,
  `BRUSH_COLOR_SOURCE_BADGE`. `ui/components` may import `@/types/brush` (precedent: this folder).
- The DOM test `__tests__/BrushChannelMenu.dom.test.tsx` covers panel + row + menu. Cases that
  will move: `:147` (arrow-key focus order — new radios shift it), `:302` (the "+" menu
  asserts the `onAddLayer` payload).
- Story files use `@storybook/react-vite` `Meta`/`StoryObj` with `satisfies`; fixtures in
  `storyFixtures.ts` are `BrushLayerRowModel` literals.

## Steps
1. `BrushChannelMenu`: add optional props
   `colorSource?: BrushColorSource | null` and `onSelectColorSource?: (source: BrushColorSource) => void`.
   `showColorSource = onSelectColorSource !== undefined`. Render a **"Colour source"** section
   (title `brush-layer-panel__menu-title`) **before** "Channels", built with `radio()`:
   label from `BRUSH_COLOR_SOURCE_LABEL`, detail `"Deltas apply to the colour you picked"` /
   `"Deltas apply to the pixel already on the canvas — burns, fades, tints"`. Keep the
   `radio()` factory; do not duplicate it.
2. `BrushLayerPanel`: `onAddLayer: (channelType: BrushChannelType, colorSource: BrushColorSource) => void`.
   Hold `const [addSource, setAddSource] = useState<BrushColorSource>("selected")` beside
   `addOpen`. In the creation menu pass `colorSource={addSource}` and
   `onSelectColorSource={setAddSource}` (ticks, **does not close** — MASTER D3), and
   `onSelectChannelType={(type) => { onAddLayer(type, addSource); closeAdd(); }}`. Reset
   `addSource` to `"selected"` when the menu closes. Set the menu `label` to
   `"New layer — colour source, then channel"` so the two-step reading is announced.
3. `BrushLayerRow`: `BrushLayerRowModel.colorSource: BrushColorSource` (required on the
   row model — the container projects it; fixtures updated in step 5). New prop
   `onSetColorSource: (layerId: string, source: BrushColorSource) => void` on the row and
   on the panel (`BrushLayerPanelProps`). Render a second badge button right after the
   channel badge: class `brush-layer-panel__source-badge` +
   `brush-layer-panel__source-badge--{selected|target}`, `aria-label="Colour source: SEL|TGT"`,
   `title="Where the brush takes its colour"`, text from `BRUSH_COLOR_SOURCE_BADGE`. Both
   badges open the **same** row menu (one `menuOpen` state); pass `colorSource={layer.colorSource}`
   and `onSelectColorSource={(s) => { onSetColorSource(layer.id, s); closeMenu(); }}` into
   the existing `BrushChannelMenu` at `:286-307`. Anchor the menu on whichever badge was
   pressed (track `anchorEl` in state; the existing `badgeEl` state generalises).
4. CSS: `.brush-layer-panel__source-badge` copies `__channel-badge`'s chip rules (share via a
   comma selector rather than duplicating), `--selected` muted, `--target` an accent tint
   from the existing token set; reuse the `--open` ring rule via a comma selector.
5. Fixtures and stories: add `colorSource` to every `BrushLayerRowModel` literal in
   `storyFixtures.ts` (make at least one `"target"`), and a story `WithTargetSource` in
   `BrushLayerRow.stories.tsx`; the panel story gains `onSetColorSource: fn()`.
6. Tests in `BrushChannelMenu.dom.test.tsx`: update `:147` for the new focus order; update
   `:302` to assert `onAddLayer("normal", "selected")` by default and
   `onAddLayer("normal", "target")` after clicking the "Target pixel" radio first (and that
   the menu stayed open between the two clicks); add a row test: the `TGT`/`SEL` badge
   opens the menu, choosing the other source fires `onSetColorSource(id, source)` once and
   closes. Keep the portal and rename tests untouched.
7. Commit: `brush-source(03): colour-source section in the layer menu + row badge`.

## Constraints
- `ui/` purity: no store, API, MobX, `useContext`. ESLint enforces; run it.
- `max-lines` is an **error** at 400 code lines under `src/ui/**`. `BrushChannelMenu.tsx` is
  346 raw lines; if the new section pushes it over, extract the section builders (the
  "Colour source" and "Applied group" sections) into `BrushChannelMenuSections.tsx` in the
  same folder and add that file to `Touches` in your report.
- Do not change `BrushLayerPanelContainer.tsx` or any store (task 04).

## Verification
```sh
cd client && bunx tsc --noEmit && bunx eslint src/ui/components/BrushLayerPanel && bunx vitest run src/ui/components/BrushLayerPanel && bun run lint:boundaries && bunx stylelint "src/ui/components/BrushLayerPanel/*.css" && bunx storybook build
```
Manual (Storybook, `bunx vite preview --outDir storybook-static --port 6006`): the "+" menu
shows "Colour source" above "Channels"; picking a source keeps the menu open; picking a
channel closes it; the row shows `RGB` then `SEL`/`TGT`; the source badge opens the menu
anchored on itself; arrow keys traverse source rows, then channel rows, then groups.

## Definition of done
- [ ] Creation menu = colour source (sticky tick, no close) then channel (creates and closes).
- [ ] Row shows the source badge; its menu changes the source; `onSetColorSource` fired once per pick.
- [ ] Stories build; DOM tests updated and green; stylelint no new errors; `lint:boundaries` OK.
- [ ] Manual checks above performed and listed in the report.
