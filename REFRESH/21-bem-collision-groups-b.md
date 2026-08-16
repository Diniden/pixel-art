# 21 — BEM conversion, collision groups B: Brush controls, modal chrome, object pickers, App shell

**Wave:** W14 · **Depends on:** 20
**Touches:** `client/src/components/Toolbar/Toolbar.{tsx,css}` · `client/src/components/Toolbar/PixelStudioTools.tsx` · `client/src/components/Toolbar/LightingStudioTools.tsx` · `client/src/components/LightingStudioPanel/LightingStudioPanel.{tsx,css}` · `client/src/components/PixelStudioPanel/PixelStudioPanel.{tsx,css}` · `client/src/components/ReferenceImageModal/ReferenceImageModal.{tsx,css}` · `client/src/components/ProjectSelectModal/ProjectSelectModal.{tsx,css}` · `client/src/components/BrowseBackupsModal/BrowseBackupsModal.{tsx,css}` · `client/src/components/CopyFromModal/CopyFromModal.{tsx,css}` · `client/src/components/ObjectSelectModal/ObjectSelectModal.{tsx,css}` · `client/src/components/VariantSelectModal/VariantSelectModal.{tsx,css}` · `client/src/components/ExportPreviewModal/ExportPreviewModal.{tsx,css}` · `client/src/App.{tsx,css}`
**Effort:** L

## Objective

After this task the remaining five collision groups are converted to BEM, all 31 critical class collisions are resolved, and 15 of the 23 `!important` declarations are unwound. The BEM convention (R1-R11), the state-word mapping table, and the worked example are **specified in full in task 20's Context** — read that file's "The BEM convention" and "Worked example" sections before starting; they apply here unchanged.

## Context

### G4 — `Toolbar` ↔ `LightingStudioPanel` ↔ `PixelStudioPanel` (6 shared classes)

| Class | Bare definitions | What happens today |
| --- | --- | --- |
| `.brush-size-control` | `LightingStudioPanel.css:43`, `Toolbar.css:151` (+ qualified in `PixelStudioPanel.css`) | LightingStudioPanel is emitted last: `display:flex; align-items:center; gap:8px` plus `input[type=range]{flex:1; width:100%}`. **Toolbar's `input[type=range]{width:80px}` is beaten by that `width:100%`** — and this is precisely what the 15 `!important` declarations in `Toolbar.css` are compensating for |
| `.brush-size-value` | `LightingStudioPanel.css:54`, `Toolbar.css:161` | LightingStudioPanel wins; **Toolbar's version is dead code** |
| `.shape-btn`, `.shape-buttons`, `.brush-shape-control` | bare in `LightingStudioPanel.css`; `.eraser-controls .shape-btn` in `PixelStudioPanel.css` | **`PixelStudioPanel`'s eraser shape buttons are styled by `LightingStudioPanel.css`.** Converting `LightingStudioPanel` alone would break `PixelStudioPanel` — which is exactly why they are one group |

**`Toolbar.css` holds 15 of the codebase's 23 `!important` declarations** — 65% of them in one 357-line file. They exist solely to win this collision. Once the collision is gone by construction, **all 15 must be removed**, and the controls must still work.

### G5 — `ReferenceImageModal` ↔ `ProjectSelectModal` ↔ `BrowseBackupsModal` (6 shared classes)

`.modal-overlay`, `.modal-header`, `.modal-footer`, `.modal-content`, `.close-btn`, `.cancel-btn`. Task 18 extracted these into `blocks/modal.css` and `blocks/btn.css` and broke the cross-file dependency. What remains here is converting each component's **own** classes to its block name and adopting the primitive names.

⚠️ **`ReferenceImageModal.tsx` holds module-level mutable state (`persistentState`, line 29) that `App.tsx:14-19` imports four symbols from.** This task converts `className` strings and the sibling `.css` **only** — it does **not** move or restructure that file. A later task relocates the state. Do not let the two overlap.

### G6 — `CopyFromModal` ↔ `ObjectSelectModal` (+ `ObjectLibrary`, already converted in task 20) — 5 shared classes

| Class | Defined in | What happens today |
| --- | --- | --- |
| `.objects-grid` | `CopyFromModal.css`, `ObjectSelectModal.css` | identical; the minifier collapses them. Latent, not live |
| `.object-name` | `CopyFromModal.css`, `ObjectLibrary.css` | ObjectLibrary wins with `flex:1; min-width:0; font-size:.875rem`; **CopyFromModal's fixed 100px name column collapses to flex** |
| `.current`, `.current-badge` | `CopyFromModal.css:107`, `ObjectSelectModal.css:191`, `ProjectSelectModal.css:141` | **three different designs.** ObjectSelectModal wins: `position:absolute; top:6px; right:32px; background:#3b82f64d` (a blue pill). ProjectSelectModal's uppercase accent chip and CopyFromModal's inline `display:block` label both lose — **two of three components show the wrong badge** |
| `.create-btn` | resolved by task 18's `btn` block | — |

### G7 — `ObjectLibrary` (converted in task 20) ↔ `VariantSelectModal` ↔ `ExportPreviewModal` — 3 shared classes

| Class | What happens today |
| --- | --- |
| `.resize-actions` | ObjectLibrary wins with `gap:8px` over VariantSelectModal's `gap:12px`, and additionally injects `.resize-actions button{padding:6px 12px; font-size:.75rem}` which **shrinks VariantSelectModal's buttons** |
| `.resize-anchor-section` | ObjectLibrary's `display:flex; justify-content:center; margin:8px 0` beats VariantSelectModal's `margin-bottom:16px` |
| `.variant-thumb` | VariantSelectModal wins (`44×44, border:2px, cursor:pointer`); **ExportPreviewModal's thumbnails render 20px smaller than designed** (its own rule says `64×64, border:1px`) |
| `.selected-badge` | `AddVariantModal`, `ObjectSelectModal`, `VariantSelectModal` — three 20px circular badges with **different fill colours** (`#8b5cf6` violet, `#6366f1` indigo, `#10b981` green). **ObjectSelectModal's green wins for all three.** Per the state-word table these become `__badge--selected` elements. **Pick each component's intended colour deliberately** and record the choice. |

### G8 — `App` ↔ `ReferenceImageModal` — 1 class, but structurally the worst

`.canvas-area` is defined by `App.css:150` **and** `App.css:238` (layout) and by `ReferenceImageModal.css:221` (modal body), with **incompatible** intents. `App.css` is emitted **last** in the bundle with `flex-direction:column; overflow:hidden`. ReferenceImageModal's version wants `align-items:center; justify-content:center; background:repeating-conic-gradient(...)` — the checkerboard.

Result today: **the modal's checkerboard background survives** (App.css sets no `background`) **but its centring is destroyed by App.css's `flex-direction:column`.** Converting `App.css` to the `app` block with `app__canvas-area` resolves it, and **ReferenceImageModal's image becomes centred, which it is not today.**

`App.css` becomes the `app` block: `app`, `app__main`, `app__side-panel`, `app__canvas-area`, `app__bottom`, with modifiers `app__side-panel--left`, `app__side-panel--right`, `app--focus`.

### G9 — panel chrome

`index.css` ↔ `LayerPanel` ↔ `PixelStudioPanel` ↔ `RightSidebarTopControls` ↔ `LightingStudioPanel` over `.panel`, `.panel-header`, `.panel-content`. **Already resolved** by task 18's `blocks/panel.css`. Confirm no local declaration remains.

### Ordering within this task

`ObjectLibrary` was converted in task 20 (as part of G2), which is why G6 and G7 can run now. `ReferenceImageModal` appears in both G5 and G8, so **G5 must land before G8**. Suggested order: G4 → G5 → G6 → G7 → G8.

### Runtime-built classes in these components

None of the four concatenation sites falls in this task's file set (they are in `AnchorGrid`, `ColorPicker` — done in task 20 — and `Header`, done in task 22). But `ObjectSelectModal.tsx:119`, `BrowseBackupsModal.tsx:152` and `ProjectSelectModal.tsx:120` all use the `${base} ${cond ? 'active' : ''}` idiom inside template literals — those `active` strings must become the full `block__element--active` name, per R3's additive rule.

## Steps

For each group in the order G4 → G5 → G6 → G7 → G8:

1. Build the old→new class map for every class in the group's stylesheets, applying task 20's R1-R6 and the state-word table. Put the map in the commit message.
2. Rename in the `.css`, then update every `className` string in the group's `.tsx` files, **including inside `${…}` expressions**.
3. Adopt task 18's block names (`btn`, `modal`, `panel`, `slider`, `confirm-dialog`); delete the local rule rather than renaming it.
4. **For G4 specifically: delete all 15 `!important` declarations from `Toolbar.css`** and verify the brush-size and shape controls still render correctly in **both** studios.
5. **For G7 specifically: decide each component's intended `--selected` badge colour** (violet / indigo / green) rather than inheriting whichever currently wins, and record the three decisions.
6. Run `node scripts/check-classes.mjs --scope src/components/<Component>` per component: 0 dead, 0 missing.
7. Exercise every modifier state the component has.

## Constraints

- **Convert each group as a unit**, and keep the G5-before-G8 order.
- **Do not move, split, or restructure any component**, and in particular **do not touch `ReferenceImageModal.tsx`'s module-level `persistentState` or its exports** — a later task owns that, and doing both at once makes the diff unreviewable.
- **Do not fix the missing-CSS gaps.** In this task's file set that means `ai-step-layer` (referenced at `AIInterpolateModal.tsx:922`, not in scope here), `focus-mode-section` (`Toolbar.tsx:48`), `origin-controls-panel` and `brush-max-control` (`PixelStudioPanel.tsx:30,105`). Convert the `className` to its BEM name and add no rule.
- **Do not enable stylelint's `selector-class-pattern`** — `FrameTimeline`, `AIInterpolateModal`, `Header` and a dozen others are still unconverted. Task 24 turns it on.
- Do not change any token value.
- Do not run Prettier on `.css` files.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx vite build && bunx storybook build
node scripts/check-classes.mjs                          # 0 dead, 0 missing
# All 15 Toolbar !important declarations are gone:
test "$(grep -c '!important' src/components/Toolbar/Toolbar.css)" -eq 0
bunx stylelint "src/components/Toolbar/*.css" "src/components/LightingStudioPanel/LightingStudioPanel.css" \
  "src/components/PixelStudioPanel/*.css" "src/components/ReferenceImageModal/*.css" \
  "src/components/ProjectSelectModal/*.css" "src/components/BrowseBackupsModal/*.css" \
  "src/components/CopyFromModal/*.css" "src/components/ObjectSelectModal/*.css" \
  "src/components/VariantSelectModal/*.css" "src/components/ExportPreviewModal/*.css" "src/App.css"
```

Manual checks — each targets a measured defect:

1. **G4:** brush size and shape controls in **both** the Pixel and Lighting studios, with all 15 `!important` removed. Brush size slider width, brush value display, and both shape buttons.
2. **G5:** all three modals open, save and close; header, close button and footer render correctly.
3. **G6:** `CopyFromModal`'s object name column must be a **fixed 100px** again, not flex. Each of the three components' `current` badge must show **its own** design, not ObjectSelectModal's blue pill.
4. **G7:** `ExportPreviewModal`'s variant thumbnails must be **64×64**, not 44×44. `VariantSelectModal`'s resize buttons must not be shrunk by ObjectLibrary's rule. Each `--selected` badge must show its **chosen** colour.
5. **G8:** the app shell layout is unchanged, **and ReferenceImageModal's image is now centred** (it is not today).
6. Every modifier state in every converted component.

## Definition of done

- [ ] All five groups converted, in the order G4 → G5 → G6 → G7 → G8, each as a unit; the class maps are in the commit messages.
- [ ] **Zero `!important` declarations remain in `Toolbar.css`**, and the brush/shape controls work in both studios.
- [ ] All 31 critical class collisions are resolved across tasks 20 and 21 combined.
- [ ] The three `--selected` badge colour decisions are recorded.
- [ ] The four measured fixes are visually confirmed: CopyFromModal's 100px name column, ExportPreviewModal's 64×64 thumbnails, the per-component `current` badges, and ReferenceImageModal's centred image.
- [ ] `ReferenceImageModal.tsx`'s `persistentState` and exports were **not** touched.
- [ ] `check-classes.mjs` reports 0 dead and 0 missing.
- [ ] The missing-CSS gaps were not filled.
