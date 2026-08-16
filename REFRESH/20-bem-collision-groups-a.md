# 20 — BEM conversion, collision groups A: Canvas/ReferencePanel, AddVariant/ObjectLibrary, Sliders

**Wave:** W13 · **Depends on:** 18, 19
**Touches:** `client/src/components/Canvas/Canvas.{tsx,css}` · `client/src/components/Canvas/CanvasInfo.tsx` · `client/src/components/ReferenceImagePanel/ReferenceImagePanel.{tsx,css}` · `client/src/components/AddVariantModal/AddVariantModal.{tsx,css}` · `client/src/components/ObjectLibrary/ObjectLibrary.{tsx,css}` · `client/src/components/ColorPicker/ColorPicker.{tsx,css}` · `client/src/components/LightingStudioPanel/LightControl.{tsx,css}` · `client/src/components/RightSidebarTopControls/RightSidebarTopControls.{tsx,css}`
**Effort:** L

## Objective

After this task three collision groups are converted to BEM, and with them go 16 of the 31 critical class collisions. Each group is converted **as a unit**, because renaming one side of a shared bare class removes the definition the other side is silently relying on.

## Context

### Why these three components are grouped this way

A component that shares a **bare** class with another component cannot be converted alone. The three groups here share no component with each other, so they are safe to run as one task (or as three parallel sessions if the agent prefers) — but no group may be split.

**Group G1 — `Canvas` ↔ `ReferenceImagePanel` (8 shared classes):**

| Class | Defined in | What happens today |
| --- | --- | --- |
| `.ref-box-btn` and `-top`/`-bottom`/`-left`/`-right` | `Canvas.css:98`, `ReferenceImagePanel.css:115` | 5 identical classes duplicated; ReferenceImagePanel wins, no visible effect |
| `.reference-canvas-wrapper` | both | Canvas: `position:relative;display:inline-block`. ReferenceImagePanel: the same **plus `margin:32px`**, and it wins → **Canvas's reference wrapper gains an unintended 32px margin** |
| `.reference-navigation` | `Canvas.css:231`, `ReferenceImagePanel.css:273` | Canvas wants `display:grid; grid-template-columns:repeat(4,1fr); max-width:120px`. ReferenceImagePanel (later) wants `display:flex; max-width:200px; margin:0 auto`. **Canvas's 4-column nav grid is forced into a flex row.** |
| `.reference-nav-btn` | both | identical |

**Group G2 — `AddVariantModal` ↔ `ObjectLibrary` (7 shared classes):** the `delete-confirm-*` family. Task 18 already extracted these into `blocks/confirm-dialog.css`, so this group's remaining work is converting each component's **own** classes and adopting the primitive's names.

⚠️ **`ObjectLibrary` is a serialization point** — it appears in three collision groups (G2 here, plus G6 and G7 in task 21). It cannot be worked on by two agents at once, and **G2 must land before G6/G7**. That is why task 21 depends on this one.

**Group G3 — `ColorPicker` ↔ `LightControl` ↔ `RightSidebarTopControls` (5 shared classes):** `.compact-slider`, `.slider-input`, `.slider-label`, `.hue-slider`, `.compact-toggle`. Task 18 extracted the slider family into `blocks/slider.css` and removed the `.hue-slider` `!important`. What remains: `.compact-toggle` is bare in `RightSidebarTopControls.css:107` and applies to `ObjectLibrary`'s toggle too (`ObjectLibrary.css` narrows font-size and active colour) — **two genuinely different widgets sharing a name.**

### The BEM convention — normative, no judgement calls

**R1 — Block naming.** A block is named after the React component that owns the stylesheet, `PascalCase` → `kebab-case`, no prefix, no suffix. `LayerPanel.tsx` → `layer-panel`. `RightSidebarTopControls.tsx` → `right-sidebar-top-controls`. **Acronym rule:** consecutive capitals become one lowercase run — `AIInterpolateModal` → `ai-interpolate-modal`, not `a-i-interpolate-modal`.

One stylesheet declares exactly one block, with documented exceptions: `Canvas/Canvas.css` may declare `canvas` **and** `canvas-info` (because `Canvas.tsx` and `CanvasInfo.tsx` share a stylesheet).

**Tie-break:** if two components could plausibly own a class, the block is the component whose `.tsx` renders the outermost element carrying it.

**R1b — Prefix stripping.** Where a legacy class already carries an abbreviation of its own block (`ai-modal-header` under block `ai-interpolate-modal`), strip the redundant prefix: the result is `ai-interpolate-modal__header`, not `ai-interpolate-modal__ai-modal-header`. Apply the strip only when the result stays unique within the file.

**R2 — Elements: `block__element`, exactly one `__`, single level.** Elements are **flat, not nested**, regardless of DOM depth. `.layer-panel__item-name` is correct; `.layer-panel__item__name` is forbidden. Multi-word element names use single hyphens.

**R3 — Modifiers: `block--modifier` or `block__element--modifier`, exactly one `--`, always at the end.** Modifiers are **always additive** — the base class stays in the markup:

```tsx
// correct
<div className={`layer-panel__item ${isSelected ? "layer-panel__item--selected" : ""}`}>
// forbidden
<div className={isSelected ? "layer-panel__item--selected" : "layer-panel__item"}>
```

A modifier never appears alone in a selector. Write `.layer-panel__item--selected`, never `.selected` and never `.layer-panel__item.selected`.

**R4 — State words become modifiers, not global classes.** This is the decision that removes the collision problem by construction, because the generic state words *are* the problem: `.active` is defined in **11 files**, `.selected` in **9**, `.dragging` in **6**, `.delete` in 4, `.current`/`.minimized`/`.cancel` in 3 each. An `.is-active` convention would rename the problem rather than remove it.

Canonical mapping — use this table so every agent produces identical results:

| Old generic state class | New modifier suffix |
| --- | --- |
| `.active` | `--active` |
| `.selected` | `--selected` |
| `.dragging` | `--dragging` |
| `.minimized` | `--minimized` |
| `.collapsed` | `--collapsed` |
| `.expanded` / `.expanding` | `--expanded` / `--expanding` |
| `.disabled` | `--disabled` *(prefer the `:disabled` pseudo-class on a real `<button>`/`<input>`)* |
| `.current` | `--current` |
| `.hovered` | `--hovered` *(prefer `:hover` unless driven by React state)* |
| `.highlighted` | `--highlighted` |
| `.visible` / `.all-visible` | `--visible` / `--all-visible` |
| `.empty` / `.empty-selected` | `--empty` / `--empty-selected` |
| `.even` / `.odd` | `--even` / `--odd` |
| `.playing` | `--playing` |
| `.clickable` | `--clickable` |
| `.delete` (action button) | **`--danger`** — `delete` names the handler, `danger` names the appearance |
| `.cancel` (action button) | **`--neutral`** |
| `.confirm` (action button) | **`--primary`** |
| `.variant` / `.variant-mode` | `--variant` |
| `.different-object` | `--foreign-object` |
| `.configured` / `.ai-error` / `.has-error` | `--configured` / `--error` / `--error` |
| `.status-saving` / `.status-saved` / `.status-error` | `--saving` / `--saved` / `--error` |
| `.export-status-success` / `.export-status-error` | `--success` / `--error` |
| `.no-change` / `.shrinking` | `--no-change` / `--shrinking` |
| `.with-thumbnail` | `--with-thumbnail` |
| `.selected-badge` / `.current-badge` | become **elements** (`__badge`) with modifiers (`__badge--selected`, `__badge--current`) |

**R5 — At most TWO class compounds in a selector; ninety percent should have exactly one.** The only legitimate reason for a second compound is a **parent's state** changing a child:

```css
.layer-panel__item { }                                    /* 1 compound — the norm      */
.layer-panel__item--selected { }                          /* 1 compound                 */
.layer-panel__item:hover .layer-panel__actions { }        /* 2 — parent-state           */
.layer-panel__item--dragging .layer-panel__handle { }     /* 2 — parent-state           */
.layer-panel .layer-list .layer-item .layer-name { }      /* ILLEGAL — 4 compounds      */
.layer-panel__list .layer-panel__item { }                 /* ILLEGAL — redundant        */
```

When markup nests deeper than the naming comfortably expresses, in priority order: (1) **flatten the name, not the selector** — DOM depth is irrelevant to BEM; (2) if the inner subtree is genuinely reusable, promote it to its own block; (3) otherwise it is a layout wrapper — see R6. **Hard cap: a rule needing three compounds means the markup is wrong.**

**R6 — Layout wrappers get one of five reserved element suffixes.** The codebase has many wrapper divs whose only job is `display:flex` or `overflow:auto`: `.canvas-wrapper`, `.canvas-wrapper-outer`, `.object-wrapper`, `.swatch-wrapper`, `.panel-scroll`, `.frames-scroll`, `.hue-picker-container`, `.anchor-grid-container` and more.

| Suffix | Meaning | Example |
| --- | --- | --- |
| `__layout` | the block's own flex/grid container | `.canvas__layout` |
| `__scroll` | the scroll container (`overflow:auto`) | `.layer-panel__scroll` |
| `__row` / `__col` | a one-dimensional flex line | `.header__row` |
| `__group` | a semantic cluster of sibling controls | `.toolbar__group` |
| `__stack` | vertically stacked, absolutely-positioned layers | `.lighting-canvas__stack` |

**Do NOT invent `-wrapper` / `-container` / `-outer` / `-inner` names** — they carry no information and are exactly why `.canvas-wrapper`, `.canvas-wrapper-outer`, `.main-canvas-container` and `.canvas-container` currently coexist in one 389-line file with no way to tell them apart. When two wrappers of the same role genuinely nest, use `__layout` for the outer and give the inner a **role** name (`__viewport`, `__surface`, `__frame`) — never `__layout-outer`/`__layout-inner`.

**R7 — Forbidden in any stylesheet:** a class not matching the BEM regex; a bare generic class; an element selector outside `reset.css`; a numeric `z-index`; `!important`; an `#id` selector; a colour/spacing/radius literal that has a token; an unprefixed `@keyframes` name.

**R9 — Rule order within a file:** block → elements (in DOM order) → modifiers → media queries. No interleaving. This matters because `.layer-item.selected` had specificity `(0,2,0)` while `.layer-panel__item--selected` has `(0,1,0)` — base and modifier no longer compete on specificity, so **source order decides**.

**R11 — The validation regex.** Every class must match:

```
^[a-z][a-z0-9]*(-[a-z0-9]+)*(__[a-z][a-z0-9]*(-[a-z0-9]+)*)?(--[a-z][a-z0-9]*(-[a-z0-9]+)*)?$
```

Accepts `layer-panel`, `layer-panel__item`, `layer-panel--collapsed`, `layer-panel__item--selected`. Rejects `active`, `LayerPanel`, `layer-panel__item__name`, `layer-panel--a--b`, `layer_panel`.

### Worked example — read this before converting anything

**Before** (`LayerPanel.css`, real excerpt):
```css
.layer-panel { }
.layer-panel .panel-header { flex-direction: column; }
.header-actions { }
.header-btn { }
.layer-panel .header-btn { width: 18px; }
.layer-list { }
.layer-item { }
.layer-item.selected { }
.layer-item.dragging { }
.layer-item.variant-layer { }
.layer-name { }
.layer-actions { }
.layer-action-btn { }
.layer-action-btn.delete:hover:not(:disabled) { }
.empty-state { }
```

**After:**
```css
/* block */
.layer-panel { }
/* elements, DOM order */
.layer-panel__header { }
.layer-panel__header-actions { }
.layer-panel__header-btn { width: 18px; }
.layer-panel__list { }
.layer-panel__item { }
.layer-panel__name { }
.layer-panel__actions { }
.layer-panel__action-btn { }
.layer-panel__empty { }
/* modifiers */
.layer-panel__item--selected { }
.layer-panel__item--dragging { }
.layer-panel__item--variant { }
.layer-panel__action-btn--danger:hover:not(:disabled) { }
```

Four things this demonstrates: (1) `.panel-header`, a shared-primitive leak, became a **local element** because LayerPanel had a local override; (2) `.header-btn` — previously shared with `PaletteManager` — is now `layer-panel__header-btn`, and PaletteManager gets `palette-manager__header-btn`, so **the collision is gone by construction**; (3) `.layer-item.selected` `(0,2,0)` became `.layer-panel__item--selected` `(0,1,0)`, hence R9's ordering rule; (4) `.empty-state` → three separate `__empty` classes that can now diverge safely.

### The 12 runtime-built classes in these components

`ColorPicker.tsx:616,621` builds `` `slider-label channel-${channel}` `` and `` `compact-slider channel-slider channel-${channel}` ``. After conversion:

```tsx
className={`color-picker__slider color-picker__slider--${channel}`}
```

and the CSS must carry a comment, because the generated names never appear as literals:

```css
/* dynamic: color-picker__slider--{r|g|b} built at ColorPicker.tsx:621 */
```

## Steps

For each of the three groups, independently:

1. Build the old→new class map for every class in the group's stylesheets, applying R1-R6 and the R4 state-word table. Write the map into the commit message.
2. Rename in the `.css` first, then update **every** `className` string in the group's `.tsx` files, including inside `${…}` template expressions.
3. Adopt the task-18 block names (`btn`, `modal`, `panel`, `slider`, `confirm-dialog`) wherever the component was using a local copy — delete the local rule rather than renaming it.
4. Add the dynamic-class comments for any runtime-built name.
5. Run `node scripts/check-classes.mjs --scope src/components/<Component>` and confirm 0 dead and 0 missing.
6. Exercise **every state in the component's modifier list** — a conversion that only checks the default state is not verified.

## Constraints

- **Convert each group as a unit.** Never convert one member of G1, G2 or G3 alone.
- **Do not restructure, split, or move any component.** This task edits `className` strings and CSS selectors only. Component decomposition happens later and deliberately does not overlap these files.
- **Do not fix the missing-CSS gaps.** In these components that means `alpha-slider`, `sat-slider` and `light-slider` (`ColorPicker.tsx:647,560,586` reference them; no rule exists). Convert the `className` to its BEM name and **add no rule**. Preserving current behaviour exactly is what makes "nothing changed" verifiable.
- **Do not enable stylelint's `selector-class-pattern` yet** — other components are still unconverted. Task 24 turns it on.
- Do not delete the `!important` declarations in files outside this task's groups.
- Do not change any token value.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx vite build && bunx storybook build
node scripts/check-classes.mjs               # 0 dead, 0 missing
bunx stylelint "src/components/Canvas/*.css" "src/components/ReferenceImagePanel/*.css" \
  "src/components/AddVariantModal/*.css" "src/components/ObjectLibrary/*.css" \
  "src/components/ColorPicker/*.css" "src/components/LightingStudioPanel/LightControl.css" \
  "src/components/RightSidebarTopControls/*.css"
# Every class in a converted file matches the BEM regex (spot-check with the R11 pattern):
grep -rhoE '^\.[a-z][A-Za-z0-9_-]*' src/components/ColorPicker/ColorPicker.css | \
  grep -vE '^\.[a-z][a-z0-9]*(-[a-z0-9]+)*(__[a-z][a-z0-9]*(-[a-z0-9]+)*)?(--[a-z][a-z0-9]*(-[a-z0-9]+)*)?$' \
  && echo "NON-BEM CLASS FOUND" && exit 1
```

Manual checks — required, and each targets a measured defect this task fixes:

1. **G1:** Canvas's reference navigation must now render as a **4-column grid** (it is currently forced into a flex row by ReferenceImagePanel). The reference canvas wrapper must have **no** stray 32px margin.
2. **G1:** exercise all the reference-box nudge and resize buttons on both the canvas overlay and the panel.
3. **G2:** the delete-confirm flow in `AddVariantModal` and in `ObjectLibrary`; the confirm must render **above** the object library, not behind it.
4. **G3:** `ColorPicker`, `LightControl` and `RightSidebarTopControls` sliders must all look identical before and after. Drag across the SV square and the hue strip.
5. **G3:** the `.compact-toggle` widgets in `RightSidebarTopControls` and in `ObjectLibrary` must now be independently styled.
6. Every modifier state in each converted component: selected, dragging, active, minimized, current, and so on.

## Definition of done

- [ ] All three groups converted, each as a unit; the old→new class map for each is in the commit message.
- [ ] All classes in the seven converted stylesheets match the R11 regex; no bare state word remains.
- [ ] The task-18 block names are adopted; no local copy of `btn`/`modal`/`panel`/`slider`/`confirm-dialog` rules remains in these files.
- [ ] The 3 runtime-built `channel-${channel}` classes are converted and carry the dynamic-class comment.
- [ ] `check-classes.mjs` reports 0 dead and 0 missing.
- [ ] Canvas's 4-column reference nav grid and the absent 32px margin are visually confirmed as **fixed**.
- [ ] `RightSidebarTopControls`' sliders are unchanged.
- [ ] The 3 missing-CSS gaps in `ColorPicker` were **not** filled.
- [ ] No component was split, moved, or restructured.
