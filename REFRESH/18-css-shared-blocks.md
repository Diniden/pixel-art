# 18 — Extract the five shared CSS primitive blocks

**Wave:** W11 · **Depends on:** 12
**Touches:** `client/src/styles/blocks/btn.css` (new) · `client/src/styles/blocks/modal.css` (new) · `client/src/styles/blocks/panel.css` (new) · `client/src/styles/blocks/slider.css` (new) · `client/src/styles/blocks/confirm-dialog.css` (new) · `client/src/index.css` · `client/src/components/ObjectLibrary/ObjectLibrary.css` · `client/src/components/ProjectSelectModal/ProjectSelectModal.css` · `client/src/components/ReferenceImageModal/ReferenceImageModal.css` · `client/src/components/AddVariantModal/AddVariantModal.css` · `client/src/components/LayerPanel/LayerPanel.css` · `client/src/components/BrowseBackupsModal/BrowseBackupsModal.css` · `client/src/components/VariantSelectModal/VariantSelectModal.css` · `client/src/components/CopyFromModal/CopyFromModal.css` · `client/src/components/EdgeInterpolateModal/EdgeInterpolateModal.css` · `client/src/components/HeightMapModal/HeightMapModal.css` · `client/src/components/ObjectSelectModal/ObjectSelectModal.css` · `client/src/components/PixelStudioPanel/PixelStudioPanel.css` · `client/src/components/LightingStudioPanel/LightingStudioPanel.css` · `client/src/components/LightingStudioPanel/LightControl.css` · `client/src/components/RightSidebarTopControls/RightSidebarTopControls.css` · `client/src/components/ColorPicker/ColorPicker.css`
**Effort:** L

## Objective

After this task the five genuinely-shared CSS families live in `client/src/styles/blocks/` as named blocks, and the collisions that currently make three components render with **another component's styling** are gone. This is CSS-only: no `.tsx` file changes, no markup moves. It lands **before** the React primitives so those are built against class names that already exist.

## Objective note on ordering

Two audits both identified these five families — one as CSS primitives, one as React primitives, with the same names. **CSS first, then React, is the settled order.** Building `Modal.tsx` before `blocks/modal.css` exists means inventing class names twice. The React extraction (task 19) then becomes strictly additive.

## Context

### What is broken today — measured against the actual production bundle

Vite concatenates all component CSS into one bundle, so for any duplicated class **the last-emitted definition wins**. Emission order (byte offsets in `dist/assets/index-*.css`, 158,560 bytes total):

```
    3084  Canvas.css                 50232  AddVariantModal.css
    2416  index.css                  54860  LayerPanel.css
   12032  Toolbar.css                88703  FrameTimeline.css
   27941  ColorPicker.css           104490  ObjectLibrary.css
   32659  PaletteManager.css        111350  ProjectSelectModal.css
   35457  PixelStudioPanel.css      115627  ExportPreviewModal.css
   38653  LightControl.css          133755  ObjectSelectModal.css
   40724  LightingStudioPanel.css   142768  ReferenceImagePanel.css
                                    149321  RightSidebarTopControls.css
                                    153833+ App.css   ← emitted LAST
```

(Task 09 already moved `index.css` to the front by reordering `main.tsx`'s imports; the component order above is otherwise unchanged.)

The five families and exactly what is wrong:

**1. `btn` — three components render the wrong button.**

| Class | Bare definitions | What actually happens |
| --- | --- | --- |
| `.cancel-btn` | `ObjectLibrary.css:70`, `ProjectSelectModal.css:226`, `ReferenceImageModal.css:289` (+ a qualified one in `AddVariantModal.css`) | 10 rule blocks in the bundle. `ProjectSelectModal`'s wins: `background:transparent; border:1px solid var(--border-secondary); color:var(--text-secondary)`. **ReferenceImageModal's cancel button loses its `--bg-secondary` background and `--border-primary` border.** |
| `.confirm-btn` | `LayerPanel.css:435`, `ReferenceImageModal.css:300` | LayerPanel is emitted **after** ReferenceImageModal and sets `padding:8px 16px; font-weight:500`, clobbering ReferenceImageModal's `padding:10px 20px; background:var(--accent-primary); color:#000; font-weight:600`. **ReferenceImageModal's primary confirm button is visually broken today** — it renders as LayerPanel's neutral button. Highest-impact single collision. |
| `.create-btn` | `ObjectLibrary.css:74`, `ProjectSelectModal.css:237` | ProjectSelectModal wins; **ObjectLibrary's flat accent button silently renders as a gradient.** |
| `.delete-btn` | bare in `ProjectSelectModal.css:262`; qualified in `AddVariantModal.css`, `ObjectLibrary.css` | ProjectSelectModal's outlined danger button leaks globally. |
| `.add-variant-btn` | bare in `VariantSelectModal.css:212`; compound `.header-btn.add-variant-btn` in `LayerPanel.css` | The full-width dashed CTA is global; LayerPanel's compound wins locally. |
| `.header-btn` | bare in `PaletteManager.css:8`; `.layer-panel .header-btn` in `LayerPanel.css` | PaletteManager's 24×24 accent button is the base for LayerPanel's; LayerPanel narrows to 18×18. **Works by accident.** |

Also fold in the (now-deleted) `button.primary` / `button.danger` from `index.css`.

**2. `modal` — 9-way name reuse, plus a cross-file dependency.**

`.modal-overlay`, `.modal-header`, `.modal-footer`, `.modal-content` and `.close-btn` are **declared in `ReferenceImageModal.css`** but **consumed by `BrowseBackupsModal.tsx:117,123,168` and `ProjectSelectModal.tsx:104,106,174`**. Those two modals break outright if `ReferenceImageModal.css` is ever unimported.

`.modal-overlay` is also bare in `ProjectSelectModal.css:9`, which wins with `background:#000000b3` + `backdrop-filter:blur(4px)` — so **ReferenceImageModal's overlay now blurs, which was never authored**.

`.close-btn` is bare in `ReferenceImageModal.css:57` and qualified (`.x-header .close-btn`) in **8** other modals. The bare one applies to all 9; the qualified ones win where they exist — so any *new* modal silently inherits ReferenceImageModal's styling.

**3. `panel` — a de-facto shared component nobody declared.**

`.panel`, `.panel-header`, `.panel-content` are defined in `index.css:171,184` and narrowed by `LayerPanel`, `PixelStudioPanel`, `RightSidebarTopControls` and `LightingStudioPanel` via higher-specificity selectors. Task 09's `main.tsx` reorder already changed the emission order here; this task makes the sharing explicit instead of accidental.

**4. `slider` — a cross-component dependency that will break if handled naively.**

`.compact-slider` is defined in `ColorPicker.css:178` (full styling: track, `::-webkit-slider-thumb`, `::-moz-range-thumb`) and in `RightSidebarTopControls.css:71` (**only** `{flex:1}`). **RightSidebarTopControls' sliders are therefore styled almost entirely by `ColorPicker.css`, by accident.** Removing `ColorPicker.css` would unstyle a different component.

`.slider-input`, `.slider-label` and `.hue-slider` show the same ColorPicker↔LightControl pairing; `LightControl.css` re-implements every ColorPicker slider class under a `.color-slider-row` ancestor instead of sharing a block. `.hue-slider` uses **`!important`** on its gradient purely to beat LightControl — one of the 23 `!important` declarations, caused entirely by this collision.

**5. `confirm-dialog` — 7 byte-identical duplicated classes.**

`.delete-confirm-modal`, `-backdrop`, `-content`, `-header`, `-actions`, `-undo`, `-warning` are **byte-identical** between `AddVariantModal.css:317-374` and `ObjectLibrary.css:245-302`. Proof: the minifier collapsed each pair to a single rule in the output bundle. They are harmless *because* they are identical — which makes them a latent bug: the first person to tweak one modal silently restyles the other. `BrowseBackupsModal`'s `.confirm-*` family joins them.

Also fold in `LayerPanel.css`'s **dead but complete** confirm-dialog block (`.confirm-modal`, `.confirm-modal-content`, `.confirm-modal-header`, `.confirm-modal-actions`, `.confirm-warning`, `.modal-backdrop`). Task 09 deleted it but was instructed to **record its rules first** — recover them from that task's notes and fold anything worth keeping into this primitive, so a complete, coherent, well-styled dialog is not lost.

### The block convention

A shared primitive is a normal BEM block living in its own file under `client/src/styles/blocks/`, imported by `index.css`. **It is never declared inside a component stylesheet.** A component may add a modifier to a primitive it uses, but the modifier is declared in the **primitive's** file: `.panel__header--compact { }` in `blocks/panel.css` is correct; `.layer-panel .panel__header { }` in `LayerPanel.css` is forbidden.

Name the block classes in full BEM now (`btn`, `btn--neutral`, `btn--primary`, `btn--danger`, `modal`, `modal__header`, `modal__body`, `modal__footer`, `modal__close`, `panel`, `panel__header`, `panel__body`, `slider`, `slider__input`, `slider__label`, `slider__row`, `confirm-dialog`, `confirm-dialog__header`, …) so task 19's React primitives and tasks 20-22's conversions all target the same names.

`index.css` grows to five `@import` lines after `tokens.css` and `reset.css`, in this order: `tokens` → `reset` → `blocks/*`.

Note the state-word renames this plan uses throughout: `.delete` (on an action button) → `--danger`, `.cancel` → `--neutral`, `.confirm` → `--primary`. `delete`/`cancel`/`confirm` describe the handler; `danger`/`neutral`/`primary` describe the appearance.

## Steps

1. Create `client/src/styles/blocks/` and add the five `@import` lines to `index.css` after `reset.css`.
2. **`btn`** — author `blocks/btn.css` from the union of the six button families above, with `--primary`/`--neutral`/`--danger`/`--ghost` modifiers. Delete the local rules from the 7 consumer stylesheets and update the `className` strings in their `.tsx` files **only where a class name changes**. ⚠️ Three components currently receive the *wrong* styling; after this they receive the correct one. **That is a deliberate visible change** — in particular ReferenceImageModal's confirm button becomes the accent-primary button it was authored as.
3. **`modal`** — author `blocks/modal.css` covering overlay, header, body, footer and close button. Delete the local rules from all 9 consumer stylesheets. **Resolve the cross-file dependency**: `BrowseBackupsModal` and `ProjectSelectModal` must stop depending on `ReferenceImageModal.css` being loaded. Decide the overlay's blur explicitly (ProjectSelectModal's blur currently wins by accident) and state the decision.
4. **`panel`** — author `blocks/panel.css` from `index.css`'s `.panel`/`.panel-header`/`.panel-content`, plus any modifier the four consumers need. Remove the local narrowings.
5. **`slider`** — author `blocks/slider.css` from `ColorPicker.css`'s full implementation. ⚠️ **`RightSidebarTopControls` currently gets its entire slider styling from `ColorPicker.css`**; getting this wrong un-styles it. Verify before/after pixel equality on that component specifically. Removing the `.hue-slider` `!important` becomes possible here — do it, and confirm the gradient still wins.
6. **`confirm-dialog`** — author `blocks/confirm-dialog.css` from the byte-identical duplicate plus `BrowseBackupsModal`'s `.confirm-*` and the recovered `LayerPanel` block. Delete all duplicates.

## Constraints

- **This task is CSS-only plus the minimum `className` string edits.** Do not move, split, or restructure any component; do not extract any React component.
- **Do not convert the component stylesheets to BEM.** Only the five extracted blocks are BEM-named here. Tasks 20-22 convert the components.
- Do not enable stylelint's `selector-class-pattern`.
- Do not re-introduce any `!important` — and remove only the ones whose underlying collision this task actually fixes (the `.hue-slider` one). Toolbar's 15 belong to task 21's collision group.
- Do not change any token value.
- Do not run Prettier on `.css` files.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx vite build && bunx stylelint "src/**/*.css" && bunx storybook build
node scripts/check-classes.mjs                       # 0 dead, 0 new missing
# Each family is now declared in exactly one place:
test "$(grep -rn '\.cancel-btn\|\.confirm-btn\|\.create-btn' src/components --include='*.css' | wc -l)" -eq 0
test "$(grep -rn '^\.close-btn\|^\.modal-overlay\|^\.modal-header\|^\.modal-footer' src/components --include='*.css' | wc -l)" -eq 0
test "$(grep -rn '\.panel-header\|\.panel-content' src/components --include='*.css' | wc -l)" -eq 0
test "$(grep -rn '\.compact-slider\|\.slider-input\|\.slider-label' src/components --include='*.css' | wc -l)" -eq 0
test "$(grep -rn 'delete-confirm-' src/components --include='*.css' | wc -l)" -eq 0
```

Manual checks — required, and each targets a specific measured collision:

1. **Every dialog footer** — `ObjectLibrary`, `ProjectSelectModal`, `ReferenceImageModal`, `AddVariantModal`, `LayerPanel`, `BrowseBackupsModal`, `VariantSelectModal`. **ReferenceImageModal's confirm button must now be the accent-primary button** — this is a fix, not a regression. ObjectLibrary's create button must be flat, not a gradient.
2. **All 9 modals** — header, close button, footer, and the backdrop blur behaving as decided in step 3.
3. **The four panel headers** (`LayerPanel`, `PixelStudioPanel`, `RightSidebarTopControls`, `LightingStudioPanel`) must render unchanged.
4. **`RightSidebarTopControls`' sliders must look pixel-identical before and after.** This is the highest-risk check in the task. Also verify `ColorPicker` and `LightControl` sliders.
5. **The delete-confirm flow** in `AddVariantModal` and in `ObjectLibrary`, and the restore-confirm in `BrowseBackupsModal`.

Compare each against the Storybook baseline from task 10 and the post-token state from task 12.

## Definition of done

- [ ] `client/src/styles/blocks/{btn,modal,panel,slider,confirm-dialog}.css` exist and are imported by `index.css` after `tokens.css` and `reset.css`.
- [ ] The five families are declared in exactly one place each; all five grep checks return 0.
- [ ] The block classes use full BEM names, so tasks 19-22 target the same names.
- [ ] `BrowseBackupsModal` and `ProjectSelectModal` no longer depend on `ReferenceImageModal.css` being loaded.
- [ ] `RightSidebarTopControls`' sliders are pixel-identical before and after.
- [ ] The `.hue-slider` `!important` is gone and the gradient still wins.
- [ ] The recovered `LayerPanel` confirm-dialog rules were considered and either folded in or explicitly discarded, with the decision recorded.
- [ ] The three deliberate appearance fixes (ReferenceImageModal confirm button, ObjectLibrary create button, ReferenceImageModal cancel button) are listed in the completion report as intentional.
- [ ] No component was split, moved, or BEM-converted in this task.
