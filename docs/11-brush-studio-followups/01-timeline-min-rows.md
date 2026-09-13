# 01 — Timeline rail minimum height (5 rows)

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/components/TimelineView/TimelineView.tsx` · `client/src/ui/components/TimelineView/TimelineView.stories.tsx` · `client/src/ui/components/TimelineView/__tests__/TimelineView.dom.test.tsx` (new if absent, else edited) · `client/src/ui/components/FrameTimeline/FrameTimeline.css` · `client/src/containers/BrushTimelineContainer.tsx`
**Effort:** S

## Objective
The brush studio's bottom rail is never shorter than a timeline with five layer rows, even
when the document has one layer. The pixel studio's timeline is unchanged (the new prop is
opt-in and defaults to "no floor").

## Context
- The bottom rail is **100% content-sized**: `ui/components/AppShell/AppShell.css:193-210`
  `.app__bottom { flex: 0 0 auto; min-height: 0; max-height: calc(var(--rail-base-max-height) * var(--rail-scale, 1)); }`
  (`--rail-base-max-height: 50vh`, `styles/tokens.css:322`). No layout has CSS of its own
  (`ui/layouts/*/` contain only `.tsx`). `.frame-timeline { height: 100% }`
  (`ui/components/FrameTimeline/FrameTimeline.css:1-9`) is inert against that auto-height parent.
- Every `timeline-view*` box is `flex: 1 1 auto; min-height: 0` — distributors, never creators
  (`FrameTimeline.css:711-717` `.timeline-view`, `:773-778` `__layout`, `:850-854` `__scroll`,
  `:856-862` `__grid`). Row pitch: `.timeline-view__row { height: 32px; min-height: 32px }`
  (`:865-870`) + `gap: var(--space-0-5)` (2px, `tokens.css:264`) on `__grid` = **34 px per row**.
- The pixel studio never looks collapsed because its default view is `frames` (48 px cards,
  `FrameTimeline.tsx:178`), not `timeline`. The brush timeline renders `TimelineView` directly
  inside `<div className="frame-timeline">` (`containers/BrushTimelineContainer.tsx:423-458`), so
  a 1-layer brush yields ≈ 83 px total (16 padding + ~34 header + 32 one row + 1 border).
- `TimelineView.tsx:138` hard-codes `<div className="timeline-view">` — no `className`/`style`
  prop today. `TimelineViewProps` at `:57-105`.
- Stylelint (`client/.stylelintrc.json:51-81`) token-enforces colours, z-index, shadows, radii,
  fonts, durations — **not `height`/`min-height`**, so a `32px` literal is lint-clean. BEM
  pattern permits `block--modifier` (`:102-108`).
- No test or story pins a timeline height (`ui/layouts/__tests__/layouts.dom.test.tsx` asserts
  presence/order only; `TimelineView.stories.tsx:83-89` decorator constrains width only).

## Steps
1. `TimelineView.tsx`: add `minRows?: number` to `TimelineViewProps` with a doc comment
   ("floor the grid at this many row pitches even when fewer layers exist; undefined = content
   height"). Render the root as
   `<div className={classNames("timeline-view", minRows ? "timeline-view--min-rows" : undefined)} style={minRows ? ({ "--timeline-min-rows": minRows } as CSSProperties) : undefined}>`
   (use whatever `classNames` helper the sibling components already import; grep `LayerRow.tsx`).
2. `FrameTimeline.css`, immediately after the `.timeline-view` block (`:711-717`), add the
   modifier (elements first, modifiers last is the file's convention — put it with the other
   `timeline-view--*` modifiers if any exist; otherwise directly after the block):
   ```css
   /* Floors the grid at N row pitches so a 1-layer document does not collapse the rail
      (docs/11-brush-studio-followups task 01). 32px row + 2px gap, minus the trailing gap. */
   .timeline-view--min-rows .timeline-view__scroll {
     min-height: calc(var(--timeline-min-rows) * 32px + (var(--timeline-min-rows) - 1) * var(--space-0-5));
   }
   ```
   If stylelint rejects the custom-property name pattern, rename to match `.stylelintrc.json`'s
   `custom-property-pattern` and report the name used.
3. `BrushTimelineContainer.tsx`: pass `minRows={5}` to `TimelineView`, with a one-line comment
   citing the owner's request ("fit 5 layers by default even if not present").
4. `TimelineView.stories.tsx`: add a `MinRowsOneLayer` story (one layer, `minRows: 5`) so the
   floor is visible in Storybook.
5. Test (`TimelineView/__tests__/TimelineView.dom.test.tsx`, create if absent, following the
   `LayerRow.dom.test.tsx` rig): with `minRows={5}` the root has class `timeline-view--min-rows`
   and `style.getPropertyValue("--timeline-min-rows") === "5"`; without it, neither. jsdom does
   not lay out, so do not assert pixel heights.
6. Commit: `brush-followups(01): timeline minRows floor, brush rail fits 5 rows`.

## Constraints
- Do not change the pixel timeline's rendering: `FrameTimelineContainer` / `FrameTimeline.tsx`
  are not touched and pass no `minRows`.
- Do not touch `AppShell.*`, any `ui/layouts/**`, or `tokens.css`.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/ui/components/TimelineView src/containers/BrushTimelineContainer.tsx
cd client && bunx stylelint "src/ui/components/FrameTimeline/FrameTimeline.css"   # 0 errors
cd client && bunx vitest run src/ui/components/TimelineView
cd client && bun run lint:boundaries
cd client && bunx storybook build
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Manual (owner, `bun run dev`, brush mode): with a 1-layer brush the bottom rail shows the header
plus five row-heights of grid (empty rows are blank space, not fake rows); adding a 6th layer
grows the rail; the pixel studio's rail is unchanged in both `frames` and `timeline` view modes;
`--rail-scale` compact/large steps still scale the floor with the rail.

## Definition of done
- [ ] `minRows` prop + modifier + custom property; brush container passes 5.
- [ ] Story and dom test added; stylelint 0 errors on the CSS file.
- [ ] Pixel timeline untouched; gate green; one commit with only Touches files.
