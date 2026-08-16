# 35 — Split the four oversized components: `LayerPanel`, `RightSidebarTopControls`, `TimelineView`, `ObjectLibrary`

**Wave:** W26 · **Depends on:** 34, 25, 28
**Touches:** `client/src/components/LayerPanel/LayerPanel.{tsx,css}` → `client/src/ui/components/LayerPanel/` · `client/src/components/RightSidebarTopControls/` → `client/src/ui/components/RightSidebarTopControls/` · `client/src/components/FrameTimeline/TimelineView.tsx` → `client/src/ui/components/TimelineView/` · `client/src/components/ObjectLibrary/` → `client/src/ui/components/ObjectLibrary/` · `client/src/containers/{LayerPanelContainer,RightSidebarTopControlsContainer,TimelineViewContainer,ObjectLibraryContainer}.tsx` · stories for each new component
**Effort:** L

## Objective

After this task the four components with 20-or-more store members or six-or-more responsibilities are split into focused pieces, moved into `ui/components/`, and given stories. The rule applied: **a props interface with 20+ entries means the component has more than one reason to change — split it, then purify the pieces.**

## Context

### The four, and why each is split

| Component | LOC | Store members | Props if purified as-is | Verdict |
| --- | ---: | ---: | ---: | --- |
| `LayerPanel` | 501 | **22** | ~24 | **Must split.** 7 of the 22 are `squash*`/`move*` variants that collapse to 2 parameterised callbacks. **Deepest JSX in the codebase (18 levels).** |
| `RightSidebarTopControls` | 403 | **16** | ~18 | **Split recommended.** Under 20, but it is 4 unrelated control groups sharing a file. Splitting *reduces* total props because each group takes 3-5. **0 internal hooks** — nothing stateful can break, making it the lowest-risk split in the plan. |
| `TimelineView` | 836 | **12** | ~19 | **Split recommended.** 6 responsibilities: grid, colours, drag-and-drop, keyboard, thumbnails, cell clipboard. |
| `ObjectLibrary` | 643 | 8 | — | **Split.** **15 `useState` calls = 5 inline dialogs.** JSX depth 14. |

### `LayerPanel` → 4 components

```
ui/components/LayerPanel/
  LayerPanel.tsx          — composition
  LayerPanelHeader.tsx    — the header row and its action buttons
  LayerList.tsx           — the scrollable list
  LayerRow.tsx            — one layer row
```

The 22 store members include the entire layer surface plus `makeVariant`, `removeVariantLayer` and the clipboard actions, and it installs a **global keydown handler**. The 7 `squash*`/`move*` variants (`squashLayerDown`, `squashLayerUp`, `squashLayerDownAcrossAllFrames`, `squashLayerUpAcrossAllFrames`, `moveLayer`, `moveLayerAcrossAllFrames`, `deleteLayerAcrossAllFrames`) collapse to **2 parameterised callbacks** taking a `scope: "frame" | "allFrames"` argument.

⚠️ **That collapse changes which store action fires for the `all-frames` scope.** Task 25 deliberately ported all 4 `squash*` variants faithfully so the differences were pinned first. Verify each scope explicitly.

Task 22 already BEM-converted `LayerPanel.css` — it is the plan's worked example. R5's two-compound cap and R6's wrapper suffixes matter most here given the 18-level JSX.

### `RightSidebarTopControls` → 5 components

```
ui/components/RightSidebarTopControls/
  RightSidebarTopControls.tsx   — composition
  ZoomControls.tsx
  BrushControls.tsx
  ShapeControls.tsx
  SelectionControls.tsx
```

It is the union of every tool's option surface: 16 store members including 13 setters plus `expandSelection`, `shrinkSelection` and `clearSelection`, with **zero local state**. Because it has no hooks, any behaviour change after this split is a wiring error, not a state bug.

⚠️ Its sliders were, until task 18, styled entirely by `ColorPicker.css` by accident. Task 18 fixed that and task 20 BEM-converted the group. **Confirm the sliders are pixel-identical before and after this split** — a phantom styling bug here would be chased for hours.

### `TimelineView` → 3 components

```
ui/components/TimelineView/
  TimelineView.tsx      — composition
  TimelineGrid.tsx      — the grid
  TimelineCell.tsx      — one cell
```

**Delete the 3 dead symbols while here:** `moveLayer` (line 305, destructured and unused), `getCurrentObject` (line 313, destructured and unused), and `gridRef` (line 328 — declared and attached at line 740 but **never dereferenced**; it is the natural home for a missing scroll-into-view, but it is dead today).

Per-cell rendering must use **per-item containers reading their own item**, not one `observer` over the whole grid — a 360-cell timeline re-rendering wholesale is exactly the granularity problem the MobX migration exists to fix.

### `ObjectLibrary` → 1 component + 5 dialogs

```
ui/components/ObjectLibrary/
  ObjectLibrary.tsx
  dialogs/ObjectCreateDialog.tsx
  dialogs/ObjectRenameDialog.tsx
  dialogs/ObjectDeleteDialog.tsx
  dialogs/ObjectDuplicateDialog.tsx
  dialogs/ObjectResizeDialog.tsx
```

The 15 `useState` calls drop to roughly 4. The dialogs use the `Modal` and `ConfirmDialog` primitives from task 19.

⚠️ Task 28 already rewrote or removed `ObjectLibrary`'s custom `React.memo` comparators (which threaded `project` internals). **Confirm thumbnails still update on a variant-frame change** — that is the regression this component is prone to.

⚠️ `ObjectLibrary` appeared in three CSS collision groups (G2, G6, G7) and was a serialization point. Tasks 20 and 21 resolved all three. Do not reintroduce a shared class name.

### Purity requirements

Everything landing in `ui/components/` must be **pure**: every input arrives as a prop, every effect leaves as a callback, no store hook, no `observer()`, no `fetch`, no module-level mutable state. Domain types **are** allowed here (that is what distinguishes a component from a primitive) — only `ui/primitives/` bans them.

Each container reads observables and renders exactly one presentational element with plain props plus bound callbacks. **Never pass an observable array or a domain node** — project it to a flat view-model (`{id, name, visible, thumbnailUrl, isSelected}`).

### Stories

Each new component needs at least **three** stories: *empty* (no data / zero items), *typical*, and *edge* (long names, many items, or the error state). Every callback prop wired to `fn()` so the Actions panel shows the output contract. Any component with a `--modifier` in its BEM mapping needs a story for that modifier.

Use the shared fixtures from task 10 — `projectEmpty`, `projectTypical`, `projectDense`.

## Steps

Land each component as its own commit; they are independent and can be parallelised across sessions.

1. **`RightSidebarTopControls` first** — it has 0 hooks and is the lowest-risk split, so it validates the pattern.
2. **`LayerPanel`** — split into 4, collapse the 7 callbacks to 2 with a `scope` parameter.
3. **`TimelineView`** — split into 3, delete the 3 dead symbols.
4. **`ObjectLibrary`** — extract the 5 dialogs onto the `Modal`/`ConfirmDialog` primitives.
5. Move each into `ui/components/`, create or update its container, and write its stories.

## Constraints

- **Everything in `ui/components/` must be pure** — ESLint enforces the import ban.
- **Do not change any store action's behaviour.** The `squash*` collapse is a *call-site* parameterisation, not a rewrite of the store actions themselves.
- Do not reintroduce a shared/global CSS class name — the BEM conversions are done.
- Do not restructure the timeline's sibling views (`FramesView`, `VariantView`) here.
- Per-cell rendering uses per-item containers, not one big `observer`.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run build && bunx storybook build
! grep -rn "useEditorStore\|from \"mobx\|stores/\|api/" src/ui/components/LayerPanel src/ui/components/RightSidebarTopControls src/ui/components/TimelineView src/ui/components/ObjectLibrary
! grep -rn "gridRef" src/ui/components/TimelineView
node scripts/check-classes.mjs            # 0 dead, 0 missing
```

Manual checks:
1. **`LayerPanel`:** delete, move and squash a layer in **both** `frame` and `all-frames` scope, and verify **every frame** updates for the all-frames variants. Drag-reorder layers. Copy and paste a layer within and across objects. Confirm the global keydown handler still works.
2. **`RightSidebarTopControls`:** zoom, brush size, shape mode, border radius, selection expand/shrink/clear all still work, and **the sliders are pixel-identical to before**.
3. **`TimelineView`:** copy and paste a timeline cell within a row and across rows; add a layer to all frames and at a specific position; row striping still alternates; keyboard navigation across the grid.
4. **`ObjectLibrary`:** exercise all 5 dialogs — create, rename, delete (with undo), duplicate, resize. The delete-confirm must render **above** the object library. **Thumbnails must update when a variant frame changes.**
5. Every new component's stories render with **no store provider**.

## Definition of done

- [ ] `LayerPanel` → 4 components with the 7 callbacks collapsed to 2 parameterised by scope, and both scopes verified.
- [ ] `RightSidebarTopControls` → 5 components; sliders pixel-identical.
- [ ] `TimelineView` → 3 components; the 3 dead symbols (`moveLayer`, `getCurrentObject`, `gridRef`) deleted.
- [ ] `ObjectLibrary` → 1 component + 5 dialogs on the `Modal`/`ConfirmDialog` primitives; `useState` count down from 15 to about 4; thumbnails update on a variant-frame change.
- [ ] All four live under `ui/components/`, are pure, and import no store/API/MobX.
- [ ] Each new component has at least 3 stories (empty / typical / edge) plus modifier stories.
- [ ] Per-cell timeline rendering uses per-item containers.
- [ ] No shared/global CSS class name was reintroduced.
