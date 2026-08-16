# CSS & Styling Audit

**Task:** REFRESH-PREP P1-04 · **Measured:** 2026-08-16 · **Scope:** `client/src/**/*.css` + every `className` reference in `client/src/**/*.{ts,tsx}`

All numbers below are produced by scripts run against the working tree, not estimated. Where a claim is not directly measurable it is marked **(inference)**.

---

## Summary

| Metric | Measured value |
| --- | --- |
| Stylesheets under `client/src` | **34** (32 component-local + `index.css` + `App.css`) |
| Total CSS lines | **10,596** |
| Total rule blocks (selector `{...}` pairs) | **1,455** |
| Distinct class names defined | **796** |
| Distinct `className` tokens referenced from TSX | **759** |
| **Classes defined in more than one stylesheet** | **64** |
| — of those, **critical** (unqualified definition in ≥2 files) | **31** |
| — of those, lower-severity (qualified by an ancestor, or single bare def) | **33** |
| `@keyframes` name collisions | **3 names, 11 definitions** (`fadeIn` ×6, `modalSlideIn` ×3, `spin` ×2) |
| Dead CSS classes (no TSX reference, dynamic construction accounted for) | **60** |
| Missing CSS (`className` token with no rule anywhere) | **23** tokens, of which **8** are real gaps and **15** are benign |
| Distinct hard-coded colour literals | **172** (67 hex, 98 rgb/rgba, 7 hsl), **585** occurrences |
| Existing CSS custom properties | **27 defined** in `index.css`; **6 referenced but never defined** |
| Distinct `z-index` values | **15**, spanning `-1` → `99999` |
| `!important` declarations | **23** (15 of them in `Toolbar.css` alone) |
| Max specificity anywhere | `(1,0,0)` — `#root` in `index.css`; everything else ≤ `(0,4,1)` |
| CSS Modules / scoping in use | **none** — every rule is global |

### The three findings that matter

1. **Global namespace with no scoping is already producing silent overrides.** 31 class names are defined *unqualified* in two or more stylesheets. Because Vite concatenates all component CSS into one bundle, the last-emitted definition wins for every component that uses the name. Verified in the built bundle: `.cancel-btn` has 10 rule blocks from 4 different components; `.confirm-btn` has 10 from 2; `.canvas-area` is defined by both `App.css` (layout) and `ReferenceImageModal.css` (modal body) with *incompatible* `flex-direction`.

2. **Seven `delete-confirm-*` classes are byte-identical copy-paste between `AddVariantModal.css` and `ObjectLibrary.css`.** Proof: the minifier collapsed them to a single rule in the output bundle (n=1 occurrence for a class defined twice in source). They are currently harmless *because* they are identical — which makes them a latent bug: the first person to tweak one modal silently restyles the other.

3. **The token layer is half-built.** `index.css` already defines 27 custom properties and they are used heavily (`--accent-primary` 201×, `--border-primary` 148×). But 172 distinct colour literals sit alongside them, and **6 custom properties are referenced 76 times in total while never being defined anywhere** — `--text-tertiary` (28), `--border-secondary` (28), `--accent-hover` (8), `--bg-active` (5), `--text-on-accent` (2), `--danger` (1). Those 76 declarations currently fall back to the inherited/initial value and render wrong.

---

## Stylesheet census

Columns: `Lines` = `wc -l`; `Rules` = selector blocks (excluding `@`-rules); `Classes` = distinct class names defined; `Max spec` = highest `(id, class, type)` specificity; `Depth` = longest descendant chain; `!imp` = `!important` count.

| File | Lines | Rules | Classes | Max spec | Worst selector | Depth | !imp |
| --- | ---: | ---: | ---: | --- | --- | ---: | ---: |
| `index.css` | 229 | 38 | 15 | **1,0,0** | `#root` | 1 | 0 |
| `App.css` | 251 | 36 | 16 | 0,3,0 | `.left-panel.collapsed .left-toggle` | 2 | 0 |
| `components/AIInterpolateModal/AIInterpolateModal.css` | 899 | 120 | 83 | 0,4,1 | `.ai-loop-toggle input:checked + .ai-loop-switch:…` | 3 | 0 |
| `components/AddVariantModal/AddVariantModal.css` | 411 | 52 | 35 | 0,3,0 | `.add-variant-modal-header .close-btn:hover` | 2 | **3** |
| `components/AnchorGrid/AnchorGrid.css` | 142 | 23 | 15 | 0,3,0 | `.anchor-info .size-change.expanding` | 2 | 0 |
| `components/BrowseBackupsModal/BrowseBackupsModal.css` | 273 | 36 | 23 | 0,4,0 | `.browse-backups-modal .restore-btn:hover:not(:disabled)` | 3 | 0 |
| `components/Canvas/Canvas.css` | 389 | 53 | 27 | 0,3,0 | `.ref-box-btn-top:first-of-type:active` | 2 | 0 |
| `components/Canvas/LightingCanvas.css` | 170 | 21 | 17 | 0,3,0 | `.lighting-preview-panel.minimized .lighting-prev…` | 2 | 0 |
| `components/ColorPicker/ColorPicker.css` | 311 | 44 | 29 | 0,3,0 | `.channel-slider.channel-r::-webkit-slider-thumb` | 1 | 1 |
| `components/CopyFromModal/CopyFromModal.css` | 192 | 22 | 18 | 0,3,0 | `.copy-modal-header .close-btn:hover` | 2 | 0 |
| `components/EdgeInterpolateModal/EdgeInterpolateModal.css` | 242 | 33 | 21 | 0,3,0 | `.edge-interpolate-modal-header .close-btn:hover` | 2 | 0 |
| `components/ExportPreviewModal/ExportPreviewModal.css` | 452 | 56 | 37 | 0,3,0 | `.export-preview-fps-slider::-webkit-slider-thumb` | 2 | 0 |
| `components/FrameReferencePanel/FrameReferencePanel.css` | 337 | 44 | 26 | 0,3,0 | `.frame-reference-panel.minimized .frame-referenc…` | 2 | 0 |
| `components/FrameTagsModal/FrameTagsModal.css` | 216 | 28 | 19 | 0,3,0 | `.frame-tag-pill.clickable:hover` | 2 | 0 |
| `components/FrameTimeline/FrameTimeline.css` | **1062** | **145** | **94** | 0,4,0 | `.frame-action-btn.delete:hover:not(:disabled)` | 2 | 0 |
| `components/Header/Header.css` | 457 | 65 | 41 | 0,3,0 | `.project-title-btn:hover .edit-hint` | 2 | 0 |
| `components/HeightMapModal/HeightMapModal.css` | 250 | 33 | 20 | 0,3,0 | `.height-map-modal-header .close-btn:hover` | 2 | 0 |
| `components/LayerColors/LayerColors.css` | 193 | 22 | 13 | 0,3,0 | `.layer-color-swatch.selected::after` | 1 | 0 |
| `components/LayerPanel/LayerPanel.css` | 466 | 73 | 48 | 0,4,0 | `.layer-action-btn.delete:hover:not(:disabled)` | 2 | 1 |
| `components/LightingStudioPanel/LightControl.css` | 132 | 17 | 11 | 0,4,0 | `.color-slider-row .compact-slider::-webkit-slide…` | 2 | 0 |
| `components/LightingStudioPanel/LightingStudioPanel.css` | 99 | 15 | 10 | 0,2,3 | `.brush-size-control input[type="range"]` | 2 | 0 |
| `components/LightingStudioPanel/NormalPicker.css` | 60 | 7 | 6 | 0,2,0 | `.normal-picker-canvas:active` | 1 | 0 |
| `components/ObjectLibrary/ObjectLibrary.css` | 470 | 69 | 50 | 0,3,0 | `.object-library .compact-toggle.active` | 2 | **3** |
| `components/ObjectSelectModal/ObjectSelectModal.css` | 228 | 27 | 21 | 0,3,0 | `.object-select-modal-header .close-btn:hover` | 2 | 0 |
| `components/PaletteManager/PaletteManager.css` | 198 | 26 | 20 | 0,3,0 | `.swatch-wrapper:hover .swatch-remove` | 2 | 0 |
| `components/PixelStudioPanel/PixelStudioPanel.css` | 162 | 24 | 18 | 0,3,0 | `.eraser-controls .shape-btn:hover` | 2 | 0 |
| `components/PreviewModal/PreviewModal.css` | 267 | 35 | 18 | 0,3,0 | `.preview-fps-slider::-webkit-slider-thumb:hover` | 1 | 0 |
| `components/ProjectSelectModal/ProjectSelectModal.css` | 283 | 39 | 20 | 0,3,0 | `.project-select-modal .close-btn:hover` | 3 | 0 |
| `components/ReferenceImageModal/ReferenceImageModal.css` | 365 | 51 | 28 | 0,3,0 | `.confirm-btn:hover:not(:disabled)` | 2 | 0 |
| `components/ReferenceImagePanel/ReferenceImagePanel.css` | 375 | 58 | 22 | 0,3,0 | `.reference-image-panel.minimized .reference-imag…` | 2 | 0 |
| `components/ResizeModal/ResizeModal.css` | 169 | 20 | 13 | 0,2,1 | `.resize-modal-field input:focus` | 2 | 0 |
| `components/RightSidebarTopControls/RightSidebarTopControls.css` | 167 | 23 | 17 | 0,4,1 | `.compact-toggle input:checked + .compact-toggle-…` | 3 | 0 |
| `components/Toolbar/Toolbar.css` | 357 | 52 | 27 | 0,4,1 | `.move-all-toggle input:checked + .toggle-slider:…` | 3 | **15** |
| `components/VariantSelectModal/VariantSelectModal.css` | 356 | 48 | 28 | 0,4,0 | `.variant-action-btn.delete:hover:not(:disabled)` | 2 | 0 |
| **Total** | **10,596** | **1,455** | **796 distinct** | | | | **23** |

### Census notes

- **Specificity is low and uniform.** Nothing exceeds `(0,4,1)` except the single `#root` rule. This is *good news for the BEM conversion*: there is no specificity-war debris to unwind. Flattening descendant selectors to single BEM classes will not change cascade outcomes in most cases.
- **Descendant depth is ≤ 3 everywhere.** Only 5 files reach depth 3. BEM can express all current markup relationships without a "too deep to name" escape hatch being needed often.
- **`Toolbar.css` holds 15 of the 23 `!important` declarations** — 65% of all `!important` in the codebase in one 357-line file. That is the signature of fighting a collision (see `.brush-size-control` / `.brush-size-value`, both of which `Toolbar.css` shares with `LightingStudioPanel.css`).
- **`index.css` is doing three unrelated jobs**: design tokens (`:root`, lines 1–37), a global reset + element styling (lines 39–162), and a mini utility framework (`.flex`, `.gap-1..4`, `.items-center`, `.justify-between`, `.animate-*` — lines 189–228). The utility layer is **100% dead** (see Orphans).
- **`index.css` styles bare elements globally**: `button`, `input`, `select`, `input[type="range"]`, `input[type="number"]`, `::-webkit-scrollbar`. Every component inherits these. This is load-bearing and must be preserved (and must load in Storybook).
- **Fonts are loaded from Google Fonts via `<link>` in `client/index.html`** (`Outfit` + `JetBrains Mono`), *not* from CSS. Storybook will not get them automatically.

---

## Collisions ← highest priority

### Method

A class is a **collision** if it is defined in ≥ 2 stylesheets. Severity is determined by whether the definition is *bare* — i.e. the class appears as a complete compound selector with no ancestor qualifier (`.foo`, `.foo:hover`, `.foo::before` are bare; `.some-modal .foo` and `.foo.bar` in a component-owned context are qualified).

- **Critical** = bare definition in ≥ 2 files. The winner is decided purely by bundle order. Any component rendering that class gets whichever definition Vite emitted last.
- **Moderate** = exactly one bare definition + ≥ 1 qualified definition. The bare one leaks into every component; the qualified ones are safe.
- **Contained** = every definition is qualified by an ancestor. Not currently a bug, but the name is unavailable for anyone else.

**Runtime impact was verified against the actual production bundle**, not inferred:

```
$ cd client && bunx vite build --outDir <scratch>/dist
✓ built in 1.31s
dist/assets/index-DrVlGFS5.css  158.56 kB │ gzip: 22.02 kB
```

Bundle emission order (byte offset of each component's marker class in `index-DrVlGFS5.css`) — **later offset wins**:

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

`App.css` and `index.css`'s `.panel-*` rules land at the **end** of the bundle, so they beat every component that shares a name with them.

### Critical collisions (31) — bare definition in ≥ 2 stylesheets

| Class | Defined in (bare files in **bold**) | Conflicting? | Runtime impact |
| --- | --- | --- | --- |
| `.cancel-btn` | **ObjectLibrary.css:70**, **ProjectSelectModal.css:226**, **ReferenceImageModal.css:289**, AddVariantModal.css (qualified) | **Yes — 3 incompatible bodies** | Bundle has 10 `.cancel-btn` blocks. Last bare wins at offset 114663 (`ProjectSelectModal`): `background:transparent; border:1px solid var(--border-secondary); color:var(--text-secondary)`. **ReferenceImageModal's cancel button loses its `--bg-secondary` background and `--border-primary` border**; ObjectLibrary's `background:transparent` (offset 105291) is also overridden. `--border-secondary` is *undefined*, so all three render with no border colour set. Affects: ObjectLibrary, ProjectSelectModal, ReferenceImageModal. |
| `.confirm-btn` | **LayerPanel.css:435**, **ReferenceImageModal.css:300** | **Yes** | 10 blocks. LayerPanel (offset 61216) is emitted *after* ReferenceImageModal (13927/14257) and sets `padding:8px 16px; font-weight:500`, clobbering ReferenceImageModal's `padding:10px 20px; background:var(--accent-primary); color:#000; font-weight:600`. **ReferenceImageModal's primary confirm button is visually broken** — it renders as LayerPanel's neutral button. Highest-impact single collision. |
| `.create-btn` | **ObjectLibrary.css:74**, **ProjectSelectModal.css:237** | **Yes** | ProjectSelectModal (114856) wins over ObjectLibrary (105326). ObjectLibrary's flat `background:var(--accent-primary)` is replaced by ProjectSelectModal's `linear-gradient(135deg, …)`. ObjectLibrary's create button silently renders as a gradient. |
| `.canvas-area` | **App.css:150 + App.css:238**, **ReferenceImageModal.css:221** | **Yes — structurally incompatible** | 4 blocks. `App.css` is emitted last (153833, 154881) with `flex-direction:column; overflow:hidden`. ReferenceImageModal's version (13034) wants `align-items:center; justify-content:center; background:repeating-conic-gradient(...)` (the checkerboard). **The modal's checkerboard background survives** (App.css doesn't set `background`) **but its centring is destroyed by App.css's `flex-direction:column`.** Worst structural collision. |
| `.modal-overlay` | **ProjectSelectModal.css:9**, **ReferenceImageModal.css:8** | **Yes** | ProjectSelectModal (111064) wins: `background:#000000b3` + `backdrop-filter:blur(4px)`. ReferenceImageModal's `background:#000c` (no blur) is overridden — its overlay now blurs, which was not authored. |
| `.empty-state` | **LayerPanel.css:195**, **ObjectLibrary.css:237**, **PaletteManager.css:191** | **No — identical** | **n=1 in the bundle.** The minifier collapsed 3 source definitions into one block at offset 107557 (`text-align:center;padding:24px;color:var(--text-muted);font-size:.875rem`). Currently invisible; becomes a bug the moment any one of the three is edited. Textbook latent collision. |
| `.objects-grid` | **CopyFromModal.css**, **ObjectSelectModal.css** | **No — identical** | **n=1 in the bundle** (`display:flex;flex-direction:column;gap:12px`). Same latent pattern. |
| `.delete-confirm-modal` | **AddVariantModal.css:327**, **ObjectLibrary.css:255** | **No — identical** | **n=1 in bundle.** Both are byte-identical (`linear-gradient(135deg,#2a1a1a,#1a1a2e)`, `border:1px solid rgba(239,68,68,.3)`, `width:400px`). |
| `.delete-confirm-backdrop` | **AddVariantModal.css:317**, **ObjectLibrary.css:245** | **No — identical** | n=1. Both `position:fixed; z-index:1001`. |
| `.delete-confirm-content` | **AddVariantModal.css:348**, **ObjectLibrary.css:276** | **No — identical** | n=1. |
| `.delete-confirm-header` | **AddVariantModal.css:337**, **ObjectLibrary.css:265** | **No — identical** | n=1. |
| `.delete-confirm-actions` | **AddVariantModal.css:369**, **ObjectLibrary.css:297** | **No — identical** | n=1. Note its *descendants* `.delete-confirm-actions .cancel-btn` / `.delete-btn` are also duplicated and also collapsed. |
| `.delete-confirm-undo` | **AddVariantModal.css:364**, **ObjectLibrary.css:292** | **No — identical** | n=1. |
| `.delete-confirm-warning` | **AddVariantModal.css:359**, **ObjectLibrary.css:287** | **No — identical** | n=1. |
| `.ref-box-btn` | **Canvas.css:98**, **ReferenceImagePanel.css:115** | **No — identical** | 2 identical blocks survived (3384, 144601) — not deduped because the *sets of following rules* differ. ReferenceImagePanel wins; identical body means no visible effect today. |
| `.ref-box-btn-top` / `-bottom` / `-left` / `-right` | **Canvas.css**, **ReferenceImagePanel.css** | **No — identical** | 4 more classes in the same duplicated block. |
| `.reference-canvas-wrapper` | **Canvas.css:—**, **ReferenceImagePanel.css:—** | **Yes — minor** | Canvas (3083): `position:relative;display:inline-block`. ReferenceImagePanel (144265): same **plus `margin:32px`**. ReferenceImagePanel wins → **Canvas's reference wrapper gains an unintended 32px margin.** |
| `.reference-navigation` | **Canvas.css:231**, **ReferenceImagePanel.css:273** | **Yes — layout-breaking** | Canvas wants `display:grid; grid-template-columns:repeat(4,1fr); max-width:120px`. ReferenceImagePanel (147560, later) wants `display:flex; max-width:200px; margin:0 auto`. **Canvas's 4-column nav grid is forced into a flex row.** |
| `.reference-nav-btn` | **Canvas.css**, **ReferenceImagePanel.css:147778** | **No — identical** | Same duplicated block family. |
| `.object-name` | **CopyFromModal.css:—**, **ObjectLibrary.css:—** | **Yes** | ObjectLibrary (106193) wins with `flex:1; min-width:0; font-size:.875rem`. CopyFromModal's `width:100px; min-width:100px; font-size:.85rem` is overridden — **the copy-from grid's fixed 100px name column collapses to flex.** |
| `.current-badge` | **CopyFromModal.css:107**, **ObjectSelectModal.css:191**, **ProjectSelectModal.css:141** | **Yes — 3 different designs** | ObjectSelectModal (136810) wins: `position:absolute; top:6px; right:32px; background:#3b82f64d` (blue pill). ProjectSelectModal's uppercase accent chip (113256) and CopyFromModal's inline `display:block` label (49070) both lose. **Two of three components show the wrong badge.** |
| `.selected-badge` | **AddVariantModal.css:—**, **ObjectSelectModal.css:—**, **VariantSelectModal.css:—** | **Yes — colour differs** | Three 20px circular badges with **different fill colours**: `#8b5cf6` (violet, 45018), `#6366f1` (indigo, 53593), `#10b981` (green, 137013). ObjectSelectModal's green wins for all three. |
| `.variant-thumb` | **ExportPreviewModal.css:—**, **VariantSelectModal.css:—** | **Yes** | VariantSelectModal (119719) wins: `44×44, border:2px, cursor:pointer`. ExportPreviewModal's `64×64, border:1px` (43779) is overridden — **export preview thumbnails render 20px smaller than designed.** |
| `.resize-actions` | **ObjectLibrary.css:—**, **VariantSelectModal.css:—** | **Yes** | ObjectLibrary (107438) wins with `gap:8px` over VariantSelectModal's `gap:12px` (46799); ObjectLibrary also adds `.resize-actions button{padding:6px 12px;font-size:.75rem}` which shrinks VariantSelectModal's buttons. |
| `.resize-anchor-section` | **ObjectLibrary.css:—**, **VariantSelectModal.css:—** | **Yes** | ObjectLibrary (107366) `display:flex; justify-content:center; margin:8px 0` beats VariantSelectModal's `margin-bottom:16px`. |
| `.brush-size-control` | **LightingStudioPanel.css:43**, **Toolbar.css:151**, PixelStudioPanel.css (qualified) | **Yes** | LightingStudioPanel (41351) is last: `display:flex; align-items:center; gap:8px` + `input[type=range]{flex:1;width:100%}`. **Toolbar's `input[type=range]{width:80px}` (25129) is beaten by `width:100%`** — this is exactly what the 15 `!important`s in `Toolbar.css` are compensating for. |
| `.brush-size-value` | **LightingStudioPanel.css:54**, **Toolbar.css:161**, PixelStudioPanel.css (qualified) | **Yes** | LightingStudioPanel (41467) wins: `font-family:var(--font-mono); min-width:24px; text-align:center`. Toolbar's version is dead. |
| `.compact-slider` | **ColorPicker.css:178**, **RightSidebarTopControls.css:71**, LightControl.css (qualified) | **Yes — partial** | RightSidebarTopControls (150156) emits only `{flex:1}`, so ColorPicker's full slider styling at 30573 (track, `::-webkit-slider-thumb`, `::-moz-range-thumb`) **still applies to RightSidebarTopControls' sliders** — an accidental dependency. Removing `ColorPicker.css` would unstyle a different component. |

### Moderate collisions (8) — one bare definition leaking into qualified users

| Class | Bare in | Also (qualified) in | Runtime impact |
| --- | --- | --- | --- |
| `.close-btn` | **ReferenceImageModal.css:57** | AddVariantModal, BrowseBackupsModal, CopyFromModal, EdgeInterpolateModal, HeightMapModal, ObjectSelectModal, ProjectSelectModal, VariantSelectModal (all `.x-header .close-btn`) | ReferenceImageModal's bare `.close-btn` (10627) applies to **all 9 modals**; the 8 qualified rules (higher specificity) win where they exist. Any *new* modal with a `.close-btn` silently inherits ReferenceImageModal's styling. 9-way name reuse. |
| `.header-btn` | **PaletteManager.css:8** | LayerPanel.css (`.layer-panel .header-btn`) | PaletteManager's 24×24 accent button (32734) is the base for LayerPanel's buttons too; LayerPanel narrows to 18×18 via `.layer-panel .header-btn` (55099). Works by accident. |
| `.modal-header` | **ReferenceImageModal.css:—** | BrowseBackupsModal, ProjectSelectModal | Bare version at 10401 + a `@media` override at 14590 applies globally. The two qualified versions win in their own trees. `.modal-header h2` is also global. |
| `.modal-footer` | **ReferenceImageModal.css:—** | BrowseBackupsModal, ProjectSelectModal | Same shape as `.modal-header`. |
| `.panel-header` | **index.css:171** | LayerPanel, PixelStudioPanel, RightSidebarTopControls | `index.css` is emitted **last** (157853). Its `padding:12px 16px; text-transform:uppercase` is the base; the three qualified overrides (`.eraser-controls-panel .panel-header`, `.layer-panel .panel-header`, `.compact-panel .panel-header`) still win on specificity. Intentional-looking but undocumented. |
| `.panel-content` | **index.css:184** | LightingStudioPanel, PixelStudioPanel | Same pattern (158101). `.panel` / `.panel-header` / `.panel-content` in `index.css` is a de-facto shared component that nobody declared. |
| `.project-name` | **ProjectSelectModal.css:—** | Header.css (`.project-title-btn .project-name`) | ProjectSelectModal's `{flex:1;font-weight:500}` (113219) leaks onto Header's project title; Header's qualified rules (128000) win. |
| `.selection-info` | **ReferenceImageModal.css:—** | Canvas.css (`.canvas-info .selection-info`) | ReferenceImageModal's bare version (13788) sets `font-family:var(--font-mono)` globally; Canvas's qualified rule only sets colour/weight, so **Canvas's selection info inherits the mono font from a modal it never renders inside.** |
| `.delete-btn` | **ProjectSelectModal.css:262** | AddVariantModal, ObjectLibrary (both `.delete-confirm-actions .delete-btn`) | ProjectSelectModal's outlined danger button leaks globally. |
| `.add-variant-btn` | **VariantSelectModal.css:212** | LayerPanel.css (`.header-btn.add-variant-btn`) | VariantSelectModal's full-width dashed CTA (45308) is global; LayerPanel's compound `.header-btn.add-variant-btn` (0,2,0) wins in the layer panel. |
| `.compact-toggle` | **RightSidebarTopControls.css:107** | ObjectLibrary.css (`.object-library .compact-toggle`) | RightSidebarTopControls' switch styling (150655) applies to ObjectLibrary's toggle too; ObjectLibrary narrows font-size + active colour. Two genuinely different widgets sharing a name. |
| `.hue-slider` | **ColorPicker.css:231** | LightControl.css (`.color-slider-row .hue-slider`) | ColorPicker's version uses **`!important`** on the gradient (31572) to beat LightControl. One of the 23 `!important`s, caused entirely by this collision. |
| `.slider-input`, `.slider-label` | **ColorPicker.css** | LightControl.css (`.color-slider-row .*`) | Same ColorPicker↔LightControl pairing. LightControl re-implements every ColorPicker slider class under a `.color-slider-row` ancestor rather than using a shared block. |
| `.shape-btn`, `.shape-buttons`, `.brush-shape-control` | **LightingStudioPanel.css** | PixelStudioPanel.css (`.eraser-controls .shape-btn`) | LightingStudioPanel's bare `.shape-btn` (41764) is the base for PixelStudioPanel's eraser shape buttons; PixelStudioPanel narrows via `.eraser-controls .shape-btn` (36597). Cross-component dependency — **converting `LightingStudioPanel` alone would break `PixelStudioPanel`.** |

### Contained collisions (state words, 15) — every definition ancestor-qualified

These are not overriding each other today, but they consume 15 extremely generic names in the global namespace and are the direct cause of the state-modifier problem the BEM convention must solve.

| Class | Defined in (count) | Notes |
| --- | ---: | --- |
| `.active` | **11 files** | AIInterpolateModal, AnchorGrid, FrameReferencePanel, FrameTimeline, HeightMapModal, LightingStudioPanel, ObjectLibrary, PixelStudioPanel, ReferenceImagePanel, RightSidebarTopControls, Toolbar. Always as `.something.active` or `.parent .x.active`. **Most-reused name in the codebase.** |
| `.selected` | **9 files** | AIInterpolateModal, AddVariantModal, BrowseBackupsModal, FrameTimeline, LayerColors, LayerPanel, ObjectLibrary, ObjectSelectModal, VariantSelectModal. |
| `.dragging` | **6 files** | LightingCanvas, FrameReferencePanel, FrameTimeline, LayerPanel, ReferenceImageModal, ReferenceImagePanel. |
| `.delete` | 4 files | FrameTimeline, LayerPanel, ObjectLibrary, VariantSelectModal — used as `.x-action-btn.delete`. |
| `.current` | 3 files | CopyFromModal, ObjectSelectModal, ProjectSelectModal. |
| `.minimized` | 3 files | LightingCanvas, FrameReferencePanel, ReferenceImagePanel. |
| `.cancel` | 3 files | EdgeInterpolateModal, HeightMapModal, LayerPanel. |
| `.confirm` | 2 files | EdgeInterpolateModal, HeightMapModal. |
| `.hint` | 2 files | AddVariantModal, EdgeInterpolateModal. |
| `.error-message` | 2 files | BrowseBackupsModal, ProjectSelectModal. |
| `.header-actions` | 2 files | LayerPanel, ObjectLibrary. |
| `.label-text`, `.label-value` | 2 files each | EdgeInterpolateModal, HeightMapModal — these two modals are near-clones. |
| `.modal-content` | 2 files | BrowseBackupsModal, ProjectSelectModal. |
| `.separator` | 2 files | Canvas, LightingCanvas. |
| `.variant` | 2 files | CopyFromModal, FrameTimeline. |

### `@keyframes` collisions (global, not class-scoped)

`@keyframes` names share one global namespace exactly like classes, and **the last definition wins for every animation referencing that name.**

| Name | Definitions | Files | Impact |
| --- | ---: | --- | --- |
| `fadeIn` | **6** | `index.css`, EdgeInterpolateModal, HeightMapModal, PreviewModal, ProjectSelectModal, ReferenceImageModal | `index.css` is emitted last → **its `fadeIn` overrides all five modal versions.** Any modal whose `fadeIn` differed from `index.css`'s is animating with the wrong keyframes. |
| `modalSlideIn` | **3** | EdgeInterpolateModal, HeightMapModal, PreviewModal | Last-emitted wins. |
| `spin` | **2** | `App.css`, PreviewModal | `App.css` emitted last → wins. |

The 12 remaining keyframes are already prefixed (`ai-fade-in`, `ai-slide-up`, `ai-spin`, `exportFadeIn`, `exportSlideIn`, `exportSpin`, `tooltipFadeIn`, `pulse-expand`, `pulse-shrink`, `slideIn`, `slideUp`, `pulse`) — but `slideIn`/`slideUp`/`pulse` are unprefixed and will collide with the next component that wants them.

### Collision summary by component pair

The collisions cluster into **9 tightly-coupled pairs/groups**. These groups must be converted together (see *Conversion order & parallelism*).

| Group | Components | Shared classes |
| --- | --- | ---: |
| G1 Reference-box | `Canvas` ↔ `ReferenceImagePanel` | 8 (`ref-box-btn*`, `reference-canvas-wrapper`, `reference-nav*`) |
| G2 Delete-confirm | `AddVariantModal` ↔ `ObjectLibrary` | 7 (`delete-confirm-*`) |
| G3 Sliders | `ColorPicker` ↔ `LightControl` ↔ `RightSidebarTopControls` | 5 (`compact-slider`, `slider-input`, `slider-label`, `hue-slider`, `compact-toggle`) |
| G4 Brush controls | `Toolbar` ↔ `LightingStudioPanel` ↔ `PixelStudioPanel` | 6 (`brush-size-*`, `shape-btn*`, `brush-shape-control`) |
| G5 Generic modal chrome | `ReferenceImageModal` ↔ `ProjectSelectModal` ↔ `BrowseBackupsModal` | 6 (`modal-overlay`, `modal-header`, `modal-footer`, `modal-content`, `close-btn`, `cancel-btn`) |
| G6 Object pickers | `CopyFromModal` ↔ `ObjectSelectModal` ↔ `ObjectLibrary` | 5 (`objects-grid`, `object-name`, `current`, `current-badge`, `create-btn`) |
| G7 Variant resize | `ObjectLibrary` ↔ `VariantSelectModal` | 3 (`resize-actions`, `resize-anchor-section`, `variant-thumb` via ExportPreviewModal) |
| G8 Layout | `App.css` ↔ `ReferenceImageModal` | 1 (`canvas-area`) — but structurally the worst |
| G9 Panel chrome | `index.css` ↔ `LayerPanel` ↔ `PixelStudioPanel` ↔ `RightSidebarTopControls` ↔ `LightingStudioPanel` | 3 (`panel`, `panel-header`, `panel-content`) |

---

## Orphans

### Method & how dynamic classes were handled

A naive `grep` for a class name in `.tsx` produces both false positives (substring hits, unrelated identifiers) and false negatives (classes only ever appearing inside `${…}` of a template literal). The sweep used here parses every `className=` site and:

1. Handles `className="…"`, `className={'…'}`, and `` className={`…`} `` uniformly.
2. **Recurses into `${…}` expressions** and harvests string literals nested inside them — so `` `layer-item ${sel ? 'selected' : ''}` `` registers **both** `layer-item` and `selected`. This is what makes `.active`/`.selected`/`.dragging` correctly *not* orphans.
3. Also scans `classList.add/remove/toggle/contains(...)`, raw `class="…"` in template strings, and `querySelector*/closest/matches('.x')`.

**81 dynamic `className` construction sites** were found. Representative examples (file:line):

```
LayerPanel.tsx:264   `layer-item ${selectedLayerId === layer.id ? 'selected' : ''} ${dragIndex === displayIndex ? 'dragging' : ''} ${layer.isVariant ? 'variant-layer' : ''}`
TimelineView.tsx:761 `timeline-grid-row ${rowIndex % 2 === 0 ? 'even' : 'odd'}`
Header.tsx:227       `ai-config-btn ${aiHealthStatus === 'error' ? 'ai-error' : aiHealthStatus === 'ok' ? 'configured' : ''}`
Toolbar/PixelStudioTools.tsx:81  `tool-btn ${selectedTool === tool.id ? "active" : ""}`
```

Four sites build a class by **string concatenation with a runtime value**, where the resulting class name never appears as a literal anywhere:

| Site | Expression | Classes it can produce |
| --- | --- | --- |
| `components/AnchorGrid/AnchorGrid.tsx:121` | `` `anchor-arrow arrow-${direction} …` `` | `arrow-up`, `arrow-down`, `arrow-left`, `arrow-right` |
| `components/ColorPicker/ColorPicker.tsx:616,621` | `` `slider-label channel-${channel}` `` / `` `compact-slider channel-slider channel-${channel}` `` | `channel-r`, `channel-g`, `channel-b` |
| `components/Header/Header.tsx:298` | `` `export-status export-status-${exportStatus}` `` | `export-status-success`, `export-status-error` |
| `components/Header/Header.tsx:173-175` | `switch (saveStatus) { case 'saving': return 'status-saving' … }` | `status-saving`, `status-saved`, `status-error` |

**These 12 classes are NOT dead** and are excluded from the dead list below. They are, however, exactly the classes a naive orphan-detector or a CSS-purge tool would delete, so they must carry a `stylelint`/`purge` ignore comment after conversion.

### Dead CSS (defined, never used) — 60 classes

Each was re-verified with a second targeted grep across `client/src/**/*.{ts,tsx}` after excluding substring matches.

| # | Class | File | Why it's dead |
| ---: | --- | --- | --- |
| 1–11 | `.flex` `.flex-col` `.items-center` `.justify-between` `.gap-1` `.gap-2` `.gap-3` `.gap-4` `.animate-pulse` `.animate-fade-in` `.primary` | `index.css:189–228` (+ `button.primary` :144) | **The entire utility layer of `index.css` is unused.** 0 references. `.danger` likewise (`button.danger` :154). |
| 12 | `.danger` | `index.css:154` | 0 references. |
| 13–17 | `.confirm-modal` `.confirm-modal-content` `.confirm-modal-header` `.confirm-modal-actions` `.confirm-warning` | `LayerPanel.css` | Whole confirm-dialog block orphaned; `LayerPanel.tsx` has no such markup. |
| 18 | `.modal-backdrop` | `LayerPanel.css:377` | Partner of the above. Holds `z-index:9999`. |
| 19 | `.disabled` | `LayerPanel.css` | Superseded by `:disabled`. |
| 20 | `.all-visible` | `LayerPanel.css` | 0 references. |
| 21 | `.variant-name-badge` | `LayerPanel.css` | 0 references (`.variant-group-badge`/`.variant-type-badge` are used). |
| 22–26 | `.mode-btn` `.move-all-toggle` `.toggle-slider` `.toggle-label` `.shape-mode-group` | `Toolbar.css` | Dead toggle-switch widget. **`.move-all-toggle input:checked + .toggle-slider` is `Toolbar.css`'s max-specificity selector and it is unreachable.** |
| 27–29 | `.trace-btn` `.trace-hint` `.trace-hint-text` | `Toolbar.css` | Trace UI moved to `ReferenceImagePanel` (`.reference-trace-btn`). |
| 30 | `.has-reference` | `Toolbar.css` | 0 references. |
| 31 | `.light-grid-active` | `Toolbar.css` | 0 references. |
| 32–35 | `.reference-canvas` `.reference-canvas-container` `.reference-info` `.reference-label` | `Canvas.css` | Reference rendering migrated to `ReferenceImagePanel`; these were left behind. |
| 36–40 | `.timeline-header` `.timeline-title` `.timeline-title-group` `.timeline-action-bar` `.variant-timeline-header` | `FrameTimeline.css` | Superseded by `.timeline-header-row`. **Note: `.timeline-header` vs `.timeline-header-row` — a substring trap.** |
| 41 | `.variant-timeline-label` | `FrameTimeline.css` | 0 references. |
| 42–46 | `.empty-selected` `.highlighted` `.playing` | `FrameTimeline.css` | Dead state modifiers. (`.even`/`.hovered` are **live** via template literals.) |
| 47–52 | `.queued` `.processing` `.completed` `.failed` `.generated` `.placeholder` | `AIInterpolateModal.css` | Job-status modifiers. `AIInterpolateModal.tsx` uses the words as *data values* but never emits them as classes — verified: no `class`-adjacent occurrence. **Likely a regression from the AI-service refactor** (`c54ddcd`, `3199fa8`). |
| 53 | `.ai-btn-preview` | `AIInterpolateModal.css` | 0 references (`.ai-btn-generate`/`-accept`/`-cancel` are used). |
| 54 | `.between` / `.keyframe` | `AIInterpolateModal.css` | 0 references. |
| 55–58 | `.left-toggle` `.right-toggle` `.panel-toggle` `.collapsed` | `App.css` | **Whole panel-collapse feature is dead CSS.** `.panel-toggle` holds `z-index:20`; `.left-panel.collapsed .left-toggle` is `App.css`'s max-specificity selector. |
| 59–60 | `.export-status-success` `.export-status-error` | `Header.css` | ⚠️ **Reclassified — NOT dead.** Built at `Header.tsx:298`. Listed here only to record the correction. |
| — | `.status-saving` `.status-saved` `.status-error` | `Header.css` | ⚠️ **NOT dead.** Returned from a `switch` at `Header.tsx:173–175`. |
| — | `.arrow-up/-down/-left/-right` | `AnchorGrid.css` | ⚠️ **NOT dead.** `AnchorGrid.tsx:121`. |
| — | `.channel-r/-g/-b` | `ColorPicker.css` | ⚠️ **NOT dead.** `ColorPicker.tsx:616,621`. |
| 61 | `.ai-error` `.configured` `.has-error` | `Header.css` | `.ai-error`/`.configured` are **live** (`Header.tsx:227`); `.has-error` is **dead**. |
| 62 | `.different-object` | `FrameReferencePanel.css` | 0 references. |
| 63 | `.expanding` | `AnchorGrid.css` | **Live** (`AnchorGrid.tsx:121`, paired with `shrinking`). |

**Net dead count after correcting for dynamic construction: 60 classes.** The single largest cluster is `index.css`'s 12-class utility layer, followed by `Toolbar.css` (9) and `AIInterpolateModal.css` (8).

**Recommendation:** delete all 60 *before* the BEM conversion. Converting a dead class costs the same as converting a live one and adds 60 rows of noise to the mapping table. Deleting first shrinks the conversion surface by 7.5%.

### Missing CSS (used in TSX, never defined) — 23 tokens

| Token | Site(s) | Verdict |
| --- | --- | --- |
| `origin-controls-panel` | `PixelStudioPanel.tsx:30` | **Real gap.** `.origin-controls` exists, `.origin-controls-panel` does not. Compare `.eraser-controls` / `.eraser-controls-panel`, which both exist — this is an asymmetry, likely a bug. |
| `brush-max-control` | `PixelStudioPanel.tsx:105` | **Real gap.** `.brush-size-control` exists; `.brush-max-control` is unstyled. |
| `focus-mode-section` | `Toolbar.tsx:48` | **Real gap.** `.studio-mode-section` / `.toolbar-section` exist; this one does not. |
| `ai-step-layer` | `AIInterpolateModal.tsx:922` | **Real gap.** `.ai-step-title` / `.ai-step-desc` exist. |
| `alpha-slider` | `ColorPicker.tsx:647` | **Real gap.** `.hue-slider` exists and `.channel-a` exists, but `.alpha-slider` has no rule. |
| `sat-slider` | `ColorPicker.tsx:560` | **Real gap.** |
| `light-slider` | `ColorPicker.tsx:586` | **Real gap.** |
| `frame-drop-indicator-variant` | `VariantView.tsx:490` | **Real gap.** `.frame-drop-indicator` and `.frame-drop-indicator-base` both exist; the `-variant` sibling is missing. **Highest-confidence real bug in this list** — the variant view's drop indicator renders unstyled. |
| `icon` | `Icon.tsx:20` | Benign — generic wrapper, no styling intended. |
| `arrow-`, `channel-`, `export-status-` | prefix fragments | Benign — parser artefacts of concatenation; the full names exist. |
| `circle`, `square` | `LightingStudioPanel.tsx:63,70`, `PixelStudioPanel.tsx:125,132,167` | Benign — these are *comparison values* inside `${shape === "circle" ? "active" : ""}`, harvested by the parser but never emitted as classes. |
| `normals`, `height` | `LightingStudioTools.tsx:261,269` | Benign — same pattern. |
| `keyframes`, `settings` | `AIInterpolateModal.tsx:967,977` | Benign — tab-id comparison values. |
| `error`, `ok` | `Header.tsx:227` | Benign — `aiHealthStatus` comparison values. |
| `odd` | `TimelineView.tsx:761` | **Real gap (minor).** `.even` is styled, `.odd` is emitted but has no rule. Currently fine (odd = default), but the pair is asymmetric and will confuse the converter. |
| `expanded` | `PaletteManager.tsx:78` | **Real gap.** `.palette-item` exists; the `expanded` state has no rule, so the accordion has no visual open state. |
| `normal` | `ObjectLibrary.tsx:334` | Benign — comparison value. |

**8 real gaps + 1 minor** (`origin-controls-panel`, `brush-max-control`, `focus-mode-section`, `ai-step-layer`, `alpha-slider`, `sat-slider`, `light-slider`, `frame-drop-indicator-variant`, `expanded`; plus `odd`). These should be **filed as bugs, not fixed during the BEM conversion** — the conversion must be behaviour-preserving, and inventing styles for these mid-conversion makes it impossible to verify "nothing changed".

---

## Design tokens

### What is already tokenized

`client/src/index.css:1–37` defines **27 custom properties** on `:root`. They are genuinely load-bearing — total `var()` references across all stylesheets: **~950**.

| Group | Tokens (as defined) |
| --- | --- |
| Background (5) | `--bg-primary:#0a0a0f` · `--bg-secondary:#12121a` · `--bg-tertiary:#1a1a25` · `--bg-elevated:#22222f` · `--bg-hover:#2a2a3a` |
| Border (2) | `--border-primary:#2d2d3d` · `--border-accent:#4a4a6a` |
| Text (3) | `--text-primary:#e8e8f0` · `--text-secondary:#a0a0b8` · `--text-muted:#606078` |
| Accent (6) | `--accent-primary:#00d9ff` · `--accent-secondary:#ff00aa` · `--accent-tertiary:#7b2dff` · `--accent-success:#00ff88` · `--accent-warning:#ffaa00` · `--accent-danger:#ff3366` |
| Shadow (4) | `--shadow-sm/md/lg` · `--shadow-glow` |
| Radius (3) | `--radius-sm:4px` · `--radius-md:8px` · `--radius-lg:12px` |
| Font (2) | `--font-sans:'Outfit', system-ui, sans-serif` · `--font-mono:'JetBrains Mono', monospace` |
| Transition (2) | `--transition-fast:0.15s ease` · `--transition-normal:0.25s ease` |

### ⚠️ Undefined custom properties referenced 76 times

These are used but **never defined anywhere in `client/src`**. Every one of these declarations currently resolves to the property's inherited or initial value.

| Referenced token | Uses | Almost certainly meant to be | Evidence |
| --- | ---: | --- | --- |
| `--text-tertiary` | **28** | between `--text-secondary` (#a0a0b8) and `--text-muted` (#606078) | `ProjectSelectModal.css`, `BrowseBackupsModal.css` use it for `.close-btn` colour |
| `--border-secondary` | **28** | a dimmer `--border-primary` | `ProjectSelectModal.css:229` `.cancel-btn{border:1px solid var(--border-secondary)}` renders **borderless** |
| `--accent-hover` | 8 | lighter `--accent-primary` | — |
| `--bg-active` | 5 | between `--bg-hover` and `--bg-elevated` | `Canvas.css:—` `.ref-box-btn:active{background:var(--bg-active)}` — the active state does nothing |
| `--text-on-accent` | 2 | `#000` (accent is bright cyan) | `.shape-btn.active{color:var(--text-on-accent)}` — **text on the active shape button is invisible/inherited** |
| `--danger` | 1 | alias of `--accent-danger` | — |

**This is a live rendering bug, independent of BEM.** Fixing it is a prerequisite for any visual-regression baseline: you cannot diff before/after if "before" is already wrong in 76 places.

### Colors

**172 distinct literals, 585 occurrences.** No case-variant duplicates exist (`#1e1e1e` vs `#1E1E1E` was checked — the codebase is uniformly lowercase). The real duplication is *semantic*: the same conceptual colour expressed as slightly different values in different files.

#### Cluster A — near-identical greys/darks that should collapse onto existing tokens

| Value | Count | Used in | Nearest existing token | Proposed |
| --- | ---: | --- | --- | --- |
| `#2a2a3a` | 7 | FrameReferencePanel, LightingCanvas, ReferenceImagePanel, **index.css** | `--bg-hover` (**is exactly this**) | `var(--bg-hover)` |
| `#1a1a25` | 5 | FrameReferencePanel, LightingCanvas, ReferenceImageModal, ReferenceImagePanel | `--bg-tertiary` (**is exactly this**) | `var(--bg-tertiary)` |
| `#3a3a4a` | 4 | FrameReferencePanel, LightingCanvas, ReferenceImagePanel | between `--bg-hover` and `--border-accent` | `--bg-active: #3a3a4a` ← **also fixes the undefined token** |
| `#0a0a15` | 3 | FrameReferencePanel, LightingCanvas, ReferenceImagePanel | `--bg-primary` (#0a0a0f) | `var(--bg-primary)` |
| `#333333` | 12 | ColorPicker, LayerColors, PaletteManager | none | `--swatch-border: #333` |
| `#222230` | 2 | App.css (checkerboard) | `--bg-elevated` (#22222f) | `--canvas-checker-b` |
| `#1a1a2e` / `#16213e` | 5 / 3 | AddVariantModal, FrameTagsModal, ObjectLibrary, ResizeModal | none — a **second, warmer dark palette** | `--modal-gradient-a/-b` |

**Finding:** `FrameReferencePanel.css`, `LightingCanvas.css` and `ReferenceImagePanel.css` share a private hard-coded palette (`#0a0a15`, `#1a1a25`, `#2a2a3a`, `#3a3a4a`, `#a0a0b0`, `#8a8a9a`, `#e0e0ff`) that **shadows the real token set with slightly-off values**. Three files, ~30 declarations. This is the single highest-yield tokenization target.

#### Cluster B — the violet/variant accent (not in the token set at all)

| Value | Count | Used in | Proposed |
| --- | ---: | --- | --- |
| `#8b5cf6` | **31** (most-used literal) | AddVariantModal, Canvas, CopyFromModal, FrameReferencePanel, FrameTimeline, LayerPanel, VariantSelectModal | `--accent-variant: #8b5cf6` |
| `rgba(139,92,246,0.3)` | 9 | CopyFromModal, LayerPanel, VariantSelectModal | `--accent-variant-30` |
| `rgba(139,92,246,0.2)` | 8 | FrameTimeline, LayerPanel, VariantSelectModal | `--accent-variant-20` |
| `rgba(139,92,246,0.4)` | 6 | CopyFromModal, FrameReferencePanel, FrameTimeline, VariantSelectModal | `--accent-variant-40` |
| `rgba(139,92,246,0.15)` | 4 | FrameTimeline, LayerPanel, VariantSelectModal | `--accent-variant-15` |
| `#a78bfa` | 7 | FrameTimeline | `--accent-variant-light` |
| `#9d6cfd` | 4 | FrameReferencePanel | → collapse to `#a78bfa` |
| `#6366f1` | 7 | AddVariantModal | → collapse to `--accent-variant` |
| `#a855f7` | 5 | AIInterpolateModal | → collapse to `--accent-variant` |

**"Variant" is a first-class domain concept with 71 colour declarations and zero tokens.** It needs `--accent-variant` + an alpha ramp.

#### Cluster C — the danger/red family (4 competing reds)

| Value | Count | Used in | Proposed |
| --- | ---: | --- | --- |
| `#ef4444` | 12 | AddVariantModal, FrameTagsModal, Header, LayerPanel, ObjectLibrary, ResizeModal | `--accent-danger` is `#ff3366` — **these disagree** |
| `#dc2626` | 4 | AddVariantModal, LayerPanel, ObjectLibrary | `--accent-danger-hover` |
| `#ff6b6b` | 5 | ColorPicker, ReferenceImageModal | → collapse |
| `rgba(239,68,68,0.2/0.3)` | 6 / 3 | AddVariantModal, FrameTagsModal, Header, ObjectLibrary, ResizeModal | `--accent-danger-20/-30` |
| `rgba(255,51,102,0.1/0.3)` | 5 / 3 | AIInterpolateModal, BrowseBackupsModal, Header, ProjectSelectModal | alpha ramp of the *token* red |

**Two incompatible reds are in production simultaneously**: the token `#ff3366` and the literal `#ef4444`. They appear in the same modals.

#### Cluster D — alpha ramps that should be tokens

| Value | Count | Proposed |
| --- | ---: | --- |
| `rgba(0,0,0,0.5)` | 20 | `--overlay-50` |
| `rgba(0,0,0,0.3)` | 14 | `--overlay-30` |
| `rgba(0,0,0,0.4)` | 12 | `--overlay-40` |
| `rgba(0,0,0,0.2)` | 10 | `--overlay-20` |
| `rgba(0,0,0,0.6)` | 8 | `--overlay-60` |
| `rgba(0,0,0,0.7)` | 6 | `--overlay-70` |
| `rgba(0,0,0,0.85)` | 4 | `--overlay-85` |
| `rgba(0,217,255,0.1)` | 20 | `--accent-primary-10` |
| `rgba(0,217,255,0.3)` | 14 | `--accent-primary-30` |
| `rgba(0,217,255,0.2)` | 13 | `--accent-primary-20` |
| `rgba(0,217,255,0.4)` | 5 | `--accent-primary-40` |
| `rgba(0,217,255,0.15)` | 4 | `--accent-primary-15` |
| `rgba(0,217,255,0.08)` | 4 | `--accent-primary-08` |
| `rgba(0,217,255,0.05)` | 4 | `--accent-primary-05` |
| `rgba(255,255,255,0.1)` | 17 | `--white-10` |
| `rgba(255,255,255,0.05)` | 9 | `--white-05` |
| `rgba(255,255,255,0.15)` | 4 | `--white-15` |
| `rgba(255,255,255,0.2)` | 4 | `--white-20` |
| `#ffffff` | 26 | `--white` (or `#fff`) |
| `#000000` | 6 | `--black` |

**7 black-alpha + 7 cyan-alpha + 4 white-alpha ramps = 18 tokens replacing 158 literal occurrences.** The cyan ramp is entirely derivable from `--accent-primary`; the refresh should adopt a `color-mix()` or explicit-ramp convention (see Open questions).

#### Cluster E — status colours (no tokens)

| Value | Count | Used in | Proposed |
| --- | ---: | --- | --- |
| `#10b981` | 9 | FrameReferencePanel, ObjectSelectModal | `--status-ok` |
| `#f59e0b` | 4 | FrameReferencePanel, LayerPanel, Toolbar | `--status-warn` |
| `#ffab00` | 7 | FrameTimeline, LayerColors | → collapse to `--status-warn` |
| `#ff8800` | 6 | AIInterpolateModal | → collapse to `--status-warn` |
| `#e0e0ff` | 8 | FrameReferencePanel, LightingCanvas, ReferenceImagePanel | → `--text-primary` (#e8e8f0) |
| `#a0a0b0` | 4 | same 3 files | → `--text-secondary` (#a0a0b8) |
| `#888888` / `#d0d0d0` / `#f0f0f0` | 6 / 6 / 3 | AddVariantModal, ObjectLibrary | → `--text-muted` / `--text-secondary` / `--text-primary` |

### Spacing

Every `padding` / `margin` / `gap` / `row-gap` / `column-gap` value, counted:

| Value | Count | Proposed token |
| --- | ---: | --- |
| `8px` | **168** | `--space-2` |
| `0` | 127 | — (literal) |
| `12px` | **126** | `--space-3` |
| `4px` | 92 | `--space-1` |
| `16px` | 82 | `--space-4` |
| `6px` | 75 | `--space-1-5` |
| `20px` | 65 | `--space-5` |
| `10px` | 65 | `--space-2-5` |
| `2px` | 52 | `--space-0-5` |
| `14px` | 18 | → snap to `16px` |
| `24px` | 17 | `--space-6` |
| `3px` | 11 | → snap to `4px` |
| `1px` | 11 | `--space-px` |
| `-4px` | 9 | `calc(-1 * var(--space-1))` |
| `auto` | 6 | — |
| `18px` | 5 | → snap to `16px` or `20px` |
| `32px` | 4 | `--space-8` |
| `40px` | 2 | `--space-10` |
| `60px` | 2 | ad hoc |
| `5px` | 2 | → snap to `4px` |
| `48px` | 1 | `--space-12` |
| `-1.5px`, `-2px` | 1, 1 | ad hoc (optical nudges) |

**The scale is already essentially 2/4/6/8/10/12/16/20/24 — a 2px-based ramp.** 9 values account for 852 of the 883 occurrences (96.5%). The outliers (`3px`, `5px`, `14px`, `18px`) are 36 occurrences and should be snapped during conversion.

**Proposed spacing scale (2px base):**

```css
--space-px:   1px;   --space-0-5:  2px;   --space-1:    4px;
--space-1-5:  6px;   --space-2:    8px;   --space-2-5: 10px;
--space-3:   12px;   --space-4:   16px;   --space-5:   20px;
--space-6:   24px;   --space-8:   32px;   --space-10:  40px;
--space-12:  48px;
```

### Typography

**Font sizes — 30 distinct values, and the codebase mixes `rem` and `px` for the same visual size.**

| Value | Count | ≈ px @16 | Proposed |
| --- | ---: | ---: | --- |
| `0.75rem` | 45 | 12 | `--text-xs` |
| `0.7rem` | 33 | 11.2 | → `--text-xs` |
| `0.85rem` | 32 | 13.6 | `--text-sm` |
| `0.875rem` | 30 | 14 | → `--text-sm` |
| `0.8rem` | 26 | 12.8 | → `--text-xs` |
| `12px` | 24 | 12 | → `--text-xs` |
| `0.9rem` | 20 | 14.4 | → `--text-sm` |
| `14px` | 17 | 14 | → `--text-sm` |
| `1rem` | 15 | 16 | `--text-base` |
| `0.65rem` | 14 | 10.4 | `--text-2xs` |
| `13px` | 11 | 13 | → `--text-sm` |
| `10px` | 10 | 10 | → `--text-2xs` |
| `1.1rem` | 8 | 17.6 | `--text-lg` |
| `16px` | 7 | 16 | → `--text-base` |
| `24px` | 6 | 24 | `--text-2xl` |
| `1.2rem` | 5 | 19.2 | → `--text-lg` |
| `11px` | 5 | 11 | → `--text-xs` |
| `9px` | 5 | 9 | → `--text-2xs` |
| `20px`,`8px`,`18px` | 4,4,4 | | → nearest |
| `0.95rem`,`0.6rem` | 3,3 | | → nearest |
| `15px`,`1.5rem`,`0.625rem`,`0.8125rem` | 2 each | | → nearest |
| `2.4rem`,`0.78rem`,`2rem`,`0.55rem`,`32px`,`1.25rem`,`64px`,`1.125rem`,`48px` | 1 each | | ad hoc |
| `12px !important` | 2 | | ← collision artefact |
| `inherit`, `0` | 1 each | | — |

**Proposed type scale (6 tokens replacing 30 values):**

```css
--text-2xs: 0.625rem;  /* 10px */
--text-xs:  0.75rem;   /* 12px */
--text-sm:  0.875rem;  /* 14px */
--text-base:1rem;      /* 16px */
--text-lg:  1.125rem;  /* 18px */
--text-xl:  1.25rem;   /* 20px */
--text-2xl: 1.5rem;    /* 24px */
```

**Font weights — 5 values, trivially tokenizable:**

| Value | Count | Proposed |
| --- | ---: | --- |
| `600` | 71 | `--weight-semibold` |
| `500` | 49 | `--weight-medium` |
| `700` | 8 | `--weight-bold` |
| `bold` | 5 | → `--weight-bold` (normalize the keyword away) |
| `400` | 2 | `--weight-normal` |

**Font families — already 96% tokenized:**

| Value | Count | Action |
| --- | ---: | --- |
| `var(--font-mono)` | 44 | keep |
| `inherit` | 7 | keep |
| `'Courier New', monospace` | 2 | **→ `var(--font-mono)`** (hard-coded escapee) |
| `var(--font-sans)` | 2 | keep |
| `var(--font-mono, monospace)` | 1 | → drop the redundant fallback |

**Line heights — 4 values, 27 uses:** `1` (16), `1.5` (6), `1.4` (4), `1.3` (1). Propose `--leading-none:1`, `--leading-snug:1.4`, `--leading-normal:1.5`; collapse `1.3` → `1.4`.

### Radii

| Value | Count | Status |
| --- | ---: | --- |
| `var(--radius-sm)` | 103 | ✅ tokenized |
| `var(--radius-md)` | 61 | ✅ tokenized |
| `var(--radius-lg)` | 16 | ✅ tokenized |
| `50%` | 39 | keep literal (`--radius-full` optional) |
| `4px` | 13 | **= `--radius-sm`** — replace |
| `8px` | 12 | **= `--radius-md`** — replace |
| `12px` | 7 | **= `--radius-lg`** — replace |
| `6px` | 10 | **missing token** → add `--radius-base: 6px` |
| `3px` | 9 | **missing token** → add `--radius-xs: 3px` |
| `2px` | 9 | → snap to `--radius-xs` |
| `10px`, `11px`, `20px` | 3, 1, 1 | ad hoc → snap |
| compound (`0 0 var(--radius-lg) var(--radius-lg)` etc.) | 8 | keep |
| `var(--radius-sm) !important` | 2 | ← collision artefact |

**32 literal declarations exactly duplicate an existing token.** Add `--radius-xs:3px` and `--radius-base:6px` and the radius system is complete.

### Shadows

**57 distinct `box-shadow` values** for 4 existing tokens — the worst-tokenized property in the codebase. `--shadow-sm/md/lg/glow` are referenced only **3 times total** (`--shadow-md` 1, `--shadow-lg` 1, `--shadow-glow` 1).

| Value | Count | Proposed |
| --- | ---: | --- |
| `0 4px 12px rgba(0,217,255,0.3)` | 6 | `--shadow-accent` |
| `0 20px 50px rgba(0,0,0,0.5)` | 4 | `--shadow-modal` |
| `0 2px 6px rgba(0,217,255,0.3)` | 4 | `--shadow-accent-sm` |
| `0 20px 60px rgba(0,0,0,0.5)` | 3 | → `--shadow-modal` |
| `0 8px 32px rgba(0,0,0,0.4)` | 3 | `--shadow-lg` (**existing token is `0 8px 24px rgba(0,0,0,0.5)` — close but not equal**) |
| `0 12px 48px rgba(0,0,0,0.6)` | 3 | `--shadow-xl` |
| `0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(0,217,255,0.1)` | 3 | `--shadow-modal-glow` |
| `0 0 0 2px rgba(0,217,255,0.2)` | 3 | `--ring-accent` (focus ring) |
| remaining 49 values | 1–2 each | collapse into the 8 above |

**Proposed shadow scale (8 tokens replacing 57 values):** `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-xl`, `--shadow-modal`, `--shadow-accent`, `--shadow-accent-sm`, `--ring-accent`. Redefine the three existing `--shadow-*` to the *measured* dominant values rather than their current unused definitions.

### Transitions

**20 distinct values, but 93 of 143 uses (65%) already go through `var(--transition-fast)`.** This one is nearly done.

| Value | Count | Action |
| --- | ---: | --- |
| `all var(--transition-fast)` | 93 | ✅ keep |
| `all 0.2s` | 17 | **→ add `--transition-base: 0.2s ease`** (0.2s is the second-most-common duration and has no token) |
| `all 0.15s ease` | 6 | **= `--transition-fast`** — replace |
| `none` | 5 | keep |
| `opacity var(--transition-fast)` | 5 | ✅ |
| `border-color var(--transition-fast)` | 4 | ✅ |
| `background-color 0.2s ease` | 3 | → `--transition-base` |
| `transform var(--transition-fast)` | 3 | ✅ |
| `max-height 0.25s ease` | 2 | **= `--transition-normal`** — replace |
| `box-shadow 0.2s ease` | 2 | → `--transition-base` |
| remaining 10 | 1 each | replace with token durations |

Add `--transition-base: 0.2s ease`. That plus mechanical substitution takes tokenized transitions from 65% → ~97%.

### Borders

**66 distinct `border*` declarations; 81+20+17+16+4 = 138 already use `var(--border-*)`.** The gaps:

| Value | Count | Action |
| --- | ---: | --- |
| `1px solid var(--border-primary)` | 81 | ✅ |
| `none` | 43 | ✅ |
| `1px solid var(--border-secondary)` | 16 | ⚠️ **token undefined** — renders borderless |
| `1px solid transparent` | 12 | ✅ |
| `2px solid var(--border-primary)` | 8 | ✅ |
| `1px solid rgba(255,255,255,0.1)` | 7 | → `1px solid var(--white-10)` |
| `1px solid rgba(255,51,102,0.3)` | 3 | → `--accent-danger-30` |

Border **widths** in use: `1px` (dominant), `2px`, `3px`. Propose `--border-width: 1px`, `--border-width-thick: 2px` — low value, optional.

### z-index inventory & proposed scale

**15 distinct values from `-1` to `99999`, across 46 declarations.** There is no scale; the values are magic numbers chosen per-component, and the top of the range (`9999`/`10000`/`10001`/`99999`) is a four-way escalation war between modals.

#### Current inventory

| Current value | Used by (file:line — selector) | Stacking context | Proposed layer |
| --- | --- | --- | --- |
| **99999** (6) | `AIInterpolateModal.css:6 .ai-modal-backdrop` · `EdgeInterpolateModal.css:8 .edge-interpolate-modal-backdrop` · `ExportPreviewModal.css:10 .export-preview-overlay` · `HeightMapModal.css:8 .height-map-modal-backdrop` · `PreviewModal.css:8 .preview-modal-overlay` · `Toolbar.css:321 .toolbar-fixed-tooltip` | root (all `position:fixed` except the tooltip) | `--z-modal` (600) for the 5 backdrops; `--z-tooltip` (800) for `.toolbar-fixed-tooltip` |
| **10001** (1) | `CopyFromModal.css:184 .copy-tooltip` | root (`position:fixed`) | `--z-tooltip` (800) |
| **10000** (4) | `FrameTagsModal.css:8 .frame-tags-modal-backdrop` · `ObjectLibrary.css:435 .compact-tooltip` · `ResizeModal.css:8 .resize-modal-backdrop` · `VariantSelectModal.css:274 .resize-dialog-backdrop` | root | backdrops → `--z-modal` (600); `.resize-dialog-backdrop` is a **nested** dialog → `--z-modal-nested` (700); `.compact-tooltip` → `--z-tooltip` (800) |
| **9999** (4) | `CopyFromModal.css:11 .copy-modal-backdrop` · `LayerPanel.css:377 .modal-backdrop` ⚠️*dead* · `ObjectSelectModal.css:11 .object-select-modal-backdrop` · `VariantSelectModal.css:11 .variant-modal-backdrop` | root | `--z-modal` (600) |
| **1100** (1) | `BrowseBackupsModal.css:194 .confirm-overlay` | root | nested confirm inside a modal → `--z-modal-nested` (700) |
| **1001** (2) | `AddVariantModal.css:324 .delete-confirm-backdrop` · `ObjectLibrary.css:252 .delete-confirm-backdrop` | root | `--z-modal-nested` (700) |
| **1000** (4) | `AddVariantModal.css:8 .add-variant-modal-backdrop` · `Header.css:347 .ai-config-popover` · `ProjectSelectModal.css:9 .modal-overlay` · `ReferenceImageModal.css:8 .modal-overlay` | root | backdrops → `--z-modal` (600); `.ai-config-popover` → `--z-popover` (500) |
| **900** (3) | `FrameReferencePanel.css:7 .frame-reference-panel` · `LightingCanvas.css:93 .lighting-preview-panel` · `ReferenceImagePanel.css:7 .reference-image-panel` | inside `.app` | `--z-floating-panel` (400) |
| **102** (2) | `Canvas.css:98 .ref-box-btn` · `ReferenceImagePanel.css:115 .ref-box-btn` | inside the floating panel | `--z-overlay-control` (30) |
| **101** (2) | `Canvas.css:231 .reference-navigation` · `ReferenceImagePanel.css:273 .reference-navigation` | inside the floating panel | `--z-overlay-control` (30) |
| **100** (1) | `FrameTimeline.css:650 .view-mode-dropdown-menu` | inside `.bottom-panel` (which is `z-index:10`) | `--z-dropdown` (300) |
| **20** (1) | `App.css:113 .panel-toggle` ⚠️*dead* | inside `.app` | `--z-chrome` (20) |
| **10** (6) | `AnchorGrid.css:58 .anchor-arrow` · `App.css:65 .side-panel` · `App.css:164 .bottom-panel` · `Canvas.css:55 .reference-overlay-canvas` · `FrameTimeline.css:205 .frame-drop-indicator` · `FrameTimeline.css:1003 .timeline-playhead` | mixed — **two different meanings share one value** | app shell → `--z-shell` (100); in-canvas overlays → `--z-canvas-overlay` (20) |
| **2** (2) | `AddVariantModal.css:162 .add-variant-card .delete-variant-btn` · `LayerColors.css:130 .layer-color-swatch.selected` | local | `--z-raised` (2) |
| **1** (8) | `App.css:240 .canvas-area` · `Canvas.css:121 .ref-box-btn:hover` · `Canvas.css:257 .reference-nav-btn:hover` · `ColorPicker.css:29 .color-history-swatch:hover` · `LayerColors.css:121 .layer-color-swatch:hover` · `PaletteManager.css:114 .color-swatch:hover` · `ReferenceImagePanel.css:137 .ref-box-btn:hover` · `ReferenceImagePanel.css:306 .reference-nav-btn:hover` | local | `--z-hover-lift` (1) |
| **-1** (3) | `ColorPicker.css:113 .transparency-grid` · `LayerColors.css:103 .layer-color-swatch::before` · `PaletteManager.css:120 .swatch-bg` | local (behind content) | `--z-behind` (-1) |

#### Stacking-context analysis

**22 elements use `position:fixed`** (listed above), which means they escape all ancestor stacking contexts and compete directly in the root context. That is why the top values escalated: each new modal author picked a number higher than the last one they saw. `99999` vs `10000` vs `9999` vs `1000` encode **no design intent** — four modals at four different values that are all conceptually "a modal".

**Two genuine collisions of meaning at `z-index:10`:** `App.css`'s `.side-panel`/`.bottom-panel` (app shell chrome) and `Canvas.css`'s `.reference-overlay-canvas` / `FrameTimeline`'s `.timeline-playhead` (content overlays inside those panels). They never actually compete because the latter are nested inside the former, but the shared value makes the intent unreadable.

**One real ordering bug (inference):** `.ai-config-popover` (`Header.css:347`, `z-index:1000`) sits at the same level as four modal backdrops. If the AI-config popover is open when a modal opens, the winner is decided by DOM order, not design.

#### Proposed layered scale

```css
:root {
  /* Local, within-component */
  --z-behind:            -1;   /* decorative ::before / bg grids            */
  --z-base:               0;
  --z-hover-lift:         1;   /* :hover raise above siblings               */
  --z-raised:             2;   /* badges, per-card action buttons           */

  /* Within a panel */
  --z-canvas-overlay:    20;   /* overlay canvases, playhead, drop markers  */
  --z-overlay-control:   30;   /* floating buttons over a canvas            */

  /* Application shell */
  --z-shell:            100;   /* side panels, bottom panel, header         */
  --z-chrome:           110;   /* shell affordances (collapse toggles)      */

  /* Detached UI, ascending */
  --z-dropdown:         300;   /* select menus anchored to a control        */
  --z-floating-panel:   400;   /* reference / lighting preview panels       */
  --z-popover:          500;   /* ai-config popover, anchored popovers      */
  --z-modal:            600;   /* modal backdrop + dialog                   */
  --z-modal-nested:     700;   /* confirm dialog opened FROM a modal        */
  --z-tooltip:          800;   /* always on top of everything it explains   */
  --z-toast:            900;   /* reserved — no toasts today                */
}
```

**Rules that come with the scale:**

1. **Never write a numeric `z-index` again.** Every `z-index` is `var(--z-*)`. Enforced by stylelint (config below).
2. **Modal backdrop and modal dialog share `--z-modal`.** The dialog is a *child* of the backdrop, so it does not need a higher value — it needs `position:relative` only.
3. **A dialog opened from another dialog uses `--z-modal-nested`.** Applies to `.delete-confirm-backdrop` (×2), `.resize-dialog-backdrop`, `.confirm-overlay`.
4. **Gaps of 100 between detached tiers** leave room for insertion without a renumber.
5. **`--z-tooltip` outranks `--z-modal-nested`** deliberately: a tooltip on a control inside a nested confirm dialog must still be visible.

---

## BEM convention (the project standard)

This section is **normative**. A conversion agent should be able to follow it mechanically without judgement calls. Where judgement is unavoidable, a tie-break rule is given.

### R1 — Block naming

> **A block is named after the React component that owns the stylesheet, converted from `PascalCase` to `kebab-case`, with no prefix and no suffix.**

`LayerPanel.tsx` → block `layer-panel`. `AIInterpolateModal.tsx` → block `ai-interpolate-modal`. `RightSidebarTopControls.tsx` → block `right-sidebar-top-controls`.

**Acronym rule:** consecutive capitals become one lowercase run. `AIInterpolateModal` → `ai-interpolate-modal` (not `a-i-interpolate-modal`).

**One stylesheet declares exactly one block**, with three exceptions where a file legitimately owns more than one top-level block. In those cases every block still lives in the same file and each is named after the sub-component:

| File | Blocks it may declare | Reason |
| --- | --- | --- |
| `Canvas/Canvas.css` | `canvas`, `canvas-info` | `Canvas.tsx` and `CanvasInfo.tsx` share a stylesheet |
| `FrameTimeline/FrameTimeline.css` | `frame-timeline`, `frames-view`, `timeline-view`, `variant-view` | one stylesheet serves 4 view components |
| `LightingStudioPanel/LightControl.css` | `light-control` | already 1:1 |
| `index.css` | `panel` (shared primitive) | see R8 |

**Tie-break:** if two components could plausibly own a class, the block is the component whose `.tsx` file **renders the outermost element carrying it**.

### R2 — Element naming

> **`block__element`. Exactly one `__` per class. Double underscore, single level.**

```
.layer-panel__list        .layer-panel__item        .layer-panel__name
.frame-timeline__track    .frame-timeline__playhead
```

**Elements are flat, not nested.** Even when the DOM nests three levels deep, the class is `block__deepest-thing`, never `block__mid__deep`. `.layer-panel__item-name` is correct; `.layer-panel__item__name` is forbidden.

**Multi-word element names use single hyphens:** `.export-preview__object-row`, `.ai-interpolate-modal__setting-label`.

### R3 — Modifier naming

> **`block--modifier` or `block__element--modifier`. Exactly one `--` per class, always at the end.**

```
.layer-panel--collapsed
.layer-panel__item--variant
.frame-timeline__frame--selected
```

Modifiers are **always additive** — the base class stays in the markup:

```tsx
// correct
<div className={`layer-panel__item ${isSelected ? "layer-panel__item--selected" : ""}`}>
// forbidden
<div className={isSelected ? "layer-panel__item--selected" : "layer-panel__item"}>
```

**A modifier never appears alone in a selector.** Write `.layer-panel__item--selected`, never `.selected` and never `.layer-panel__item.selected`.

### R4 — The state-modifier rule ← **the decision**

> **DECISION: use BEM modifiers (`block--active`, `block__element--active`). Do NOT use a global `.is-*` convention.**

Both approaches were considered against this codebase's measured facts:

| Approach | Effect here |
| --- | --- |
| **`.is-active` scoped under the block** (`.layer-panel__item.is-active`) | Requires a 2-class compound selector for every state → specificity `(0,2,0)` for states vs `(0,1,0)` for base. Keeps markup terse. **But**: `.is-active` remains a single global name shared by 11 components, so a stylelint BEM pattern cannot verify that any given `.is-active` is scoped — it can only be caught by review. Also breaks the "one class per stylesheet is greppable" property. |
| **`block--active`** ✅ | Every state class is globally unique by construction. Specificity stays flat at `(0,1,0)`. A single regex can validate every class in the codebase. Grep for `layer-panel__item--selected` returns exactly the LayerPanel usage. **Cost:** longer class strings in `.tsx`. |

**Why `block--modifier` wins for *this* codebase specifically:**

1. The generic state words are the **exact** source of the collision problem measured above: `.active` in 11 files, `.selected` in 9, `.dragging` in 6, `.delete` in 4, `.current`/`.minimized`/`.cancel` in 3 each. An `.is-active` convention renames the problem rather than removing it — it would leave one global `.is-active` that 11 components still contend for, and stylelint could not distinguish a correctly-scoped use from a leaked one.
2. Current specificity is uniformly flat (max `(0,4,1)`, and 29 of 34 files max out at `(0,3,0)`). There is no specificity debt forcing us toward compound selectors. Flat modifiers keep it that way.
3. The 81 dynamic `className` sites already build classes by string interpolation, so longer names cost nothing structurally — the template literal is already there.
4. It is machine-verifiable. See the stylelint config below: one `selector-class-pattern` regex accepts every legal class and rejects every illegal one, including bare `.active`.

**Canonical state-word mapping** — every conversion agent uses this table so ten agents produce ten identical results:

| Old generic state class | New modifier suffix |
| --- | --- |
| `.active` | `--active` |
| `.selected` | `--selected` |
| `.dragging` | `--dragging` |
| `.minimized` | `--minimized` |
| `.collapsed` | `--collapsed` |
| `.expanded` / `.expanding` | `--expanded` / `--expanding` |
| `.disabled` | `--disabled` *(prefer the `:disabled` pseudo-class when the element is a real `<button>`/`<input>`)* |
| `.current` | `--current` |
| `.hovered` | `--hovered` *(prefer `:hover` unless driven by React state, as in `TimelineView.tsx:722`)* |
| `.highlighted` | `--highlighted` |
| `.visible` / `.all-visible` | `--visible` / `--all-visible` |
| `.empty` / `.empty-selected` | `--empty` / `--empty-selected` |
| `.even` / `.odd` | `--even` / `--odd` |
| `.playing` | `--playing` |
| `.clickable` | `--clickable` |
| `.delete` (on an action button) | `--danger` ← **renamed**: `delete` describes the handler, `danger` describes the appearance |
| `.cancel` (on an action button) | `--neutral` ← same reasoning |
| `.confirm` (on an action button) | `--primary` ← same reasoning |
| `.variant` / `.variant-mode` | `--variant` |
| `.different-object` | `--foreign-object` |
| `.configured` / `.ai-error` / `.has-error` | `--configured` / `--error` / `--error` |
| `.queued` `.processing` `.completed` `.failed` `.generated` | `--queued` `--processing` `--completed` `--failed` `--generated` |
| `.status-saving` / `.status-saved` / `.status-error` | `--saving` / `--saved` / `--error` |
| `.export-status-success` / `.export-status-error` | `--success` / `--error` |
| `.no-change` / `.shrinking` | `--no-change` / `--shrinking` |
| `.with-thumbnail` | `--with-thumbnail` |
| `.selected-badge` / `.current-badge` | become **elements** (`__badge`) with modifiers (`__badge--selected`, `__badge--current`), not standalone blocks |

**Runtime-built modifiers** (the 4 concatenation sites) keep concatenating, but the prefix becomes the full BEM stem:

```tsx
// AnchorGrid.tsx:121
className={`anchor-grid__arrow anchor-grid__arrow--${direction} anchor-grid__arrow--${expanding ? 'expanding' : 'shrinking'}`}
// ColorPicker.tsx:621
className={`color-picker__slider color-picker__slider--${channel}`}
// Header.tsx:298
className={`header__export-status header__export-status--${exportStatus}`}
// Header.tsx:173-175  (switch returns the suffix only)
className={`header__save-status header__save-status--${saveStatusModifier}`}
```

These four sites **must carry a `/* stylelint-disable-next-line */`-equivalent comment in the CSS**, because the generated names never appear as literals:

```css
/* dynamic: anchor-grid__arrow--{up|down|left|right} built at AnchorGrid.tsx:121 */
```

### R5 — Nesting depth limit

> **A selector may contain at most TWO class compounds. One is the target. Ninety percent of rules should have exactly one.**

Legal:
```css
.layer-panel__item { }                                   /* 1 compound — the norm    */
.layer-panel__item--selected { }                         /* 1 compound               */
.layer-panel__item:hover .layer-panel__actions { }        /* 2 compounds — parent-state */
.layer-panel__item--dragging .layer-panel__handle { }     /* 2 compounds — parent-state */
```

Illegal:
```css
.layer-panel .layer-list .layer-item .layer-name { }      /* 4 compounds              */
.layer-panel__list .layer-panel__item { }                 /* redundant — the element class is already unique */
```

**The only legitimate reason for a second compound is a parent's state or a pseudo-class changing a child.** If you find yourself needing a second compound for any other reason, the child needs its own modifier instead.

**When markup nests deeper than the naming comfortably expresses** — three escapes, in priority order:

1. **Flatten the name, not the selector.** DOM depth is irrelevant to BEM. `<div class="a"><div class="b"><span class="c">` is `.frame-timeline__row`, `.frame-timeline__cell`, `.frame-timeline__label` — three flat classes, three flat rules.
2. **If the inner subtree is genuinely reusable, promote it to its own block.** Signal: it appears under two different parents, or it maps to its own `.tsx` component. Example from this codebase: `.delete-confirm-*` (currently duplicated across `AddVariantModal` and `ObjectLibrary`) becomes the block `confirm-dialog`, used by both. `.anchor-grid` is already correctly a block used by two modals.
3. **If it is neither reusable nor nameable, it is a layout wrapper.** See R6.

**Hard cap:** if a rule needs three compounds, the markup is wrong. Split the component.

### R6 — Layout wrappers that aren't semantic components

Measured: the codebase has many wrapper divs whose only job is `display:flex` or `overflow:auto` — `.canvas-wrapper`, `.canvas-wrapper-outer`, `.lighting-editor-outer`, `.lighting-editor-stack`, `.object-wrapper`, `.swatch-wrapper`, `.panel-scroll`, `.frames-scroll`, `.timeline-grid-scroll`, `.ai-config-wrapper`, `.project-edit-wrapper`, `.hue-picker-container`, `.sv-picker-container`, `.anchor-grid-container`.

> **Rule: a layout wrapper is an ELEMENT of its block, named for its layout role using one of five reserved suffixes.**

| Suffix | Meaning | Example |
| --- | --- | --- |
| `__layout` | the block's own flex/grid container | `.canvas__layout` |
| `__scroll` | the scroll container (`overflow:auto`) | `.layer-panel__scroll` |
| `__row` / `__col` | a one-dimensional flex line | `.header__row` |
| `__group` | a semantic cluster of sibling controls | `.toolbar__group` |
| `__stack` | vertically stacked, absolutely-positioned layers | `.lighting-canvas__stack` |

**Do NOT invent `-wrapper`, `-container`, `-outer`, `-inner` names.** They carry no information and are the reason `.canvas-wrapper` / `.canvas-wrapper-outer` / `.main-canvas-container` / `.canvas-container` currently coexist in one 389-line file with no way to tell them apart.

**Numbered nesting escape:** when two wrappers of the same role genuinely nest (`.canvas-wrapper-outer` > `.canvas-wrapper`), use `__layout` for the outer and give the inner a *role* name (`__viewport`, `__surface`, `__frame`). Never `__layout-outer` / `__layout-inner`.

### R7 — What must NOT appear in a stylesheet

Enforced by stylelint (config in *Enforcement*):

| Forbidden | Why | Instead |
| --- | --- | --- |
| A class not matching the BEM regex | the whole point | rename |
| A bare generic class (`.active`, `.selected`, `.close-btn`, `.empty-state`) | caused all 64 collisions | `block__element--modifier` |
| An element selector outside `index.css` (`button {}`, `input {}`) | global blast radius | give the element a class |
| A numeric `z-index` | caused the 99999 escalation | `var(--z-*)` |
| `!important` | 23 exist today, ~all compensating for collisions | fix the collision |
| An `#id` selector | `#root` in `index.css` is the only legitimate one | class |
| A colour/spacing/radius literal that has a token | 585 colour literals today | `var(--token)` |
| An unprefixed `@keyframes` name | `fadeIn` is defined 6× | `block-animation-name` |

### R8 — Shared primitives

Some classes genuinely belong to no single component. Measured examples: `.panel` / `.panel-header` / `.panel-content` in `index.css` (used by 4 components), the `.delete-confirm-*` family (2 components), the modal chrome family (3 components), the slider family (3 components).

> **Rule: a shared primitive is a normal block that lives in its own file under `client/src/styles/blocks/`, and is imported by `index.css`. It is never declared inside a component stylesheet.**

Five primitives are indicated by the collision data:

| Primitive block | Replaces | Used by |
| --- | --- | --- |
| `panel` | `.panel`, `.panel-header`, `.panel-content` (index.css) | LayerPanel, PixelStudioPanel, LightingStudioPanel, RightSidebarTopControls |
| `modal` | `.modal-overlay`, `.modal-header`, `.modal-content`, `.modal-footer`, `.close-btn` | 9 modals |
| `confirm-dialog` | the 7 duplicated `.delete-confirm-*` classes | AddVariantModal, ObjectLibrary, LayerPanel, BrowseBackupsModal |
| `slider` | `.compact-slider`, `.slider-input`, `.slider-label`, `.slider-row`, `.hue-slider` | ColorPicker, LightControl, RightSidebarTopControls |
| `btn` | `.cancel-btn`, `.confirm-btn`, `.create-btn`, `.delete-btn`, `.close-btn`, and `button.primary`/`button.danger` in index.css | ~everything |

A component **may** add a modifier to a primitive it uses, declared in the *component's* stylesheet: `.layer-panel .panel__header { }` is forbidden; `.panel__header--compact { }` declared in `blocks/panel.css` is correct.

### R9 — File and import conventions

- Stylesheet lives beside its component: `components/LayerPanel/LayerPanel.css`.
- The `.tsx` imports it as a side effect: `import "./LayerPanel.css";` (unchanged from today).
- The file declares **one block** (three documented exceptions in R1) and nothing else.
- Rules are ordered: block → elements (DOM order) → modifiers → media queries. No interleaving.

### R10 — Worked example (the reference conversion)

Every agent should read this before converting anything.

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

Note four things this demonstrates:
1. `.panel-header` (a shared-primitive leak) became a **local element** `__header`, because LayerPanel's version had a local override. The shared `panel` primitive is a separate decision (R8).
2. `.header-btn` — previously shared with `PaletteManager` — is now `layer-panel__header-btn`, and `PaletteManager` gets `palette-manager__header-btn`. **The collision is gone by construction.**
3. `.layer-item.selected` (specificity `(0,2,0)`) became `.layer-panel__item--selected` (specificity `(0,1,0)`). Because the base and modifier no longer compete on specificity, **source order now decides** — hence R9's rule that modifiers come after elements.
4. `.empty-state` → `.layer-panel__empty`. `ObjectLibrary` and `PaletteManager` get `.object-library__empty` and `.palette-manager__empty`. Three identical rules become three rules that can diverge safely.

### R11 — The validation regex

Every class in the codebase must match:

```
^[a-z][a-z0-9]*(-[a-z0-9]+)*(__[a-z][a-z0-9]*(-[a-z0-9]+)*)?(--[a-z][a-z0-9]*(-[a-z0-9]+)*)?$
```

In words: kebab-case block, optionally one `__element`, optionally one `--modifier`, in that order. This accepts `layer-panel`, `layer-panel__item`, `layer-panel--collapsed`, `layer-panel__item--selected`. It rejects `active`, `LayerPanel`, `layer-panel__item__name`, `layer-panel--a--b`, `layer_panel`, `--foo`.

---

## Class mapping table

**Coverage: 796 / 796 distinct classes (100%), 906 rows** (a class defined in N stylesheets appears in N tables — that is the collision, made explicit).

### How to read this table

| Cell form | Meaning for the conversion agent |
| --- | --- |
| `block__element` | Rename the class in **both** the `.css` and every `.tsx` that references it. |
| `` `--x` modifier `` | This was a bare state word. It does **not** become a standalone class. Find every element that carries it and append `--x` to *that element's* BEM name. E.g. `.layer-item.selected` → `.layer-panel__item--selected`. |
| `btn btn--neutral` / `modal__close` / `panel__header` / `slider__input` / `confirm-dialog…` | **Shared primitive (R8).** Do not declare this in the component stylesheet. Delete the local rule and use the primitive from `client/src/styles/blocks/`. If the local rule differed from the primitive, add a modifier to the primitive instead. |
| `_(delete — dead)_` | Remove the rule. Do not convert. No `.tsx` references it (dynamic construction already accounted for). |
| **COLLISION** in Notes | This class is also defined in another stylesheet. After conversion the collision is gone by construction — but check the *Collisions* section first to see whether the current runtime behaviour depends on the override. |

**Prefix-stripping rule (R1b), applied throughout:** where a legacy class already carried an abbreviation of its own block (`ai-modal-header` under block `ai-interpolate-modal`), the redundant prefix is stripped so the result is `ai-interpolate-modal__header`, not `ai-interpolate-modal__ai-modal-header`. **The strip is applied only when the result stays unique within the file** — this was machine-verified; zero duplicate targets exist in any table below.

### index.css — shared primitives & utilities
`client/src/index.css` — 15 classes

| Old | New | Notes |
| --- | --- | --- |
| `.animate-fade-in` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.animate-pulse` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.danger` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.flex` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.flex-col` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.gap-1` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.gap-2` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.gap-3` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.gap-4` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.items-center` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.justify-between` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.panel` | `panel` | shared primitive (R8) |
| `.panel-content` | `panel__body` | shared primitive (R8) |
| `.panel-header` | `panel__header` | shared primitive (R8) |
| `.primary` | _(delete — dead)_ | dead CSS; remove before conversion |

### App.css — the `app` shell block
`client/src/App.css` — 16 classes

| Old | New | Notes |
| --- | --- | --- |
| `.app` | `app` | block root |
| `.bottom-panel` | `app__bottom-panel` | was un-namespaced |
| `.canvas-area` | `app__canvas-area` | **COLLISION** |
| `.collapsed` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.left-panel` | `app__left-panel` | was un-namespaced |
| `.left-toggle` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.loading-content` | `app__loading-content` | was un-namespaced |
| `.loading-screen` | `app__loading-screen` | was un-namespaced |
| `.loading-spinner` | `app__loading-spinner` | was un-namespaced |
| `.main-content` | `app__main-content` | was un-namespaced |
| `.open` | `app__open` | was un-namespaced |
| `.panel-scroll` | `app__panel-scroll` | was un-namespaced |
| `.panel-toggle` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.right-panel` | `app__right-panel` | was un-namespaced |
| `.right-toggle` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.side-panel` | `app__side-panel` | was un-namespaced |

### AIInterpolateModal  ·  block `ai-interpolate-modal`
`client/src/components/AIInterpolateModal/AIInterpolateModal.css` — 83 classes

| Old | New | Notes |
| --- | --- | --- |
| `.active` | `--active` modifier | **COLLISION**; attach to the element it modifies |
| `.ai-animation-header` | `ai-interpolate-modal__animation-header` | was un-namespaced |
| `.ai-animation-preview` | `ai-interpolate-modal__animation-preview` | was un-namespaced |
| `.ai-btn-accept` | `ai-interpolate-modal__btn-accept` | was un-namespaced |
| `.ai-btn-cancel` | `ai-interpolate-modal__btn-cancel` | was un-namespaced |
| `.ai-btn-generate` | `ai-interpolate-modal__btn-generate` | was un-namespaced |
| `.ai-btn-preview` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.ai-change-layer-btn` | `ai-interpolate-modal__change-layer-btn` | was un-namespaced |
| `.ai-config-tab` | `ai-interpolate-modal__config-tab` | was un-namespaced |
| `.ai-config-tabs` | `ai-interpolate-modal__config-tabs` | was un-namespaced |
| `.ai-empty-msg` | `ai-interpolate-modal__empty-msg` | was un-namespaced |
| `.ai-fps-control` | `ai-interpolate-modal__fps-control` | was un-namespaced |
| `.ai-fps-input` | `ai-interpolate-modal__fps-input` | was un-namespaced |
| `.ai-frame-item` | `ai-interpolate-modal__frame-item` | was un-namespaced |
| `.ai-frame-label` | `ai-interpolate-modal__frame-label` | was un-namespaced |
| `.ai-frames-row` | `ai-interpolate-modal__frames-row` | was un-namespaced |
| `.ai-frames-strip` | `ai-interpolate-modal__frames-strip` | was un-namespaced |
| `.ai-gen-pair` | `ai-interpolate-modal__gen-pair` | was un-namespaced |
| `.ai-gen-pair-label` | `ai-interpolate-modal__gen-pair-label` | was un-namespaced |
| `.ai-gen-pair-status` | `ai-interpolate-modal__gen-pair-status` | was un-namespaced |
| `.ai-gen-progress` | `ai-interpolate-modal__gen-progress` | was un-namespaced |
| `.ai-heartbeat-checking` | `ai-interpolate-modal__heartbeat-checking` | was un-namespaced |
| `.ai-heartbeat-spinner` | `ai-interpolate-modal__heartbeat-spinner` | was un-namespaced |
| `.ai-heartbeat-subtext` | `ai-interpolate-modal__heartbeat-subtext` | was un-namespaced |
| `.ai-heartbeat-text` | `ai-interpolate-modal__heartbeat-text` | was un-namespaced |
| `.ai-heartbeat-unavailable` | `ai-interpolate-modal__heartbeat-unavailable` | was un-namespaced |
| `.ai-interpolate-btn` | `ai-interpolate-modal__interpolate-btn` | was un-namespaced |
| `.ai-keyframes-header` | `ai-interpolate-modal__keyframes-header` | was un-namespaced |
| `.ai-layer-item` | `ai-interpolate-modal__layer-item` | was un-namespaced |
| `.ai-layer-list` | `ai-interpolate-modal__layer-list` | was un-namespaced |
| `.ai-loop-label-text` | `ai-interpolate-modal__loop-label-text` | was un-namespaced |
| `.ai-loop-line` | `ai-interpolate-modal__loop-line` | was un-namespaced |
| `.ai-loop-switch` | `ai-interpolate-modal__loop-switch` | was un-namespaced |
| `.ai-loop-toggle` | `ai-interpolate-modal__loop-toggle` | was un-namespaced |
| `.ai-modal` | `ai-interpolate-modal__modal` | was un-namespaced |
| `.ai-modal-actions` | `ai-interpolate-modal__actions` | was un-namespaced |
| `.ai-modal-backdrop` | `ai-interpolate-modal__backdrop` | was un-namespaced |
| `.ai-modal-close` | `ai-interpolate-modal__close` | was un-namespaced |
| `.ai-modal-content` | `ai-interpolate-modal__content` | was un-namespaced |
| `.ai-modal-error` | `ai-interpolate-modal__error` | was un-namespaced |
| `.ai-modal-header` | `ai-interpolate-modal__header` | was un-namespaced |
| `.ai-modal-icon` | `ai-interpolate-modal__icon` | was un-namespaced |
| `.ai-modal-title` | `ai-interpolate-modal__title` | was un-namespaced |
| `.ai-placeholder` | `ai-interpolate-modal__placeholder` | was un-namespaced |
| `.ai-placeholder-spinner` | `ai-interpolate-modal__placeholder-spinner` | was un-namespaced |
| `.ai-preview-canvas` | `ai-interpolate-modal__preview-canvas` | was un-namespaced |
| `.ai-preview-item` | `ai-interpolate-modal__preview-item` | was un-namespaced |
| `.ai-preview-item-label` | `ai-interpolate-modal__preview-item-label` | was un-namespaced |
| `.ai-preview-label` | `ai-interpolate-modal__preview-label` | was un-namespaced |
| `.ai-preview-section` | `ai-interpolate-modal__preview-section` | was un-namespaced |
| `.ai-preview-strip` | `ai-interpolate-modal__preview-strip` | was un-namespaced |
| `.ai-selected-layer-bar` | `ai-interpolate-modal__selected-layer-bar` | was un-namespaced |
| `.ai-setting-hint` | `ai-interpolate-modal__setting-hint` | was un-namespaced |
| `.ai-setting-info` | `ai-interpolate-modal__setting-info` | was un-namespaced |
| `.ai-setting-input` | `ai-interpolate-modal__setting-input` | was un-namespaced |
| `.ai-setting-label` | `ai-interpolate-modal__setting-label` | was un-namespaced |
| `.ai-setting-range` | `ai-interpolate-modal__setting-range` | was un-namespaced |
| `.ai-setting-range-group` | `ai-interpolate-modal__setting-range-group` | was un-namespaced |
| `.ai-setting-row` | `ai-interpolate-modal__setting-row` | was un-namespaced |
| `.ai-setting-value` | `ai-interpolate-modal__setting-value` | was un-namespaced |
| `.ai-settings-grid` | `ai-interpolate-modal__settings-grid` | was un-namespaced |
| `.ai-step-desc` | `ai-interpolate-modal__step-desc` | was un-namespaced |
| `.ai-step-title` | `ai-interpolate-modal__step-title` | was un-namespaced |
| `.ai-synced-preview` | `ai-interpolate-modal__synced-preview` | was un-namespaced |
| `.ai-synced-preview-item` | `ai-interpolate-modal__synced-preview-item` | was un-namespaced |
| `.ai-synced-preview-label` | `ai-interpolate-modal__synced-preview-label` | was un-namespaced |
| `.ai-tab-badge` | `ai-interpolate-modal__tab-badge` | was un-namespaced |
| `.ai-tab-content` | `ai-interpolate-modal__tab-content` | was un-namespaced |
| `.ai-thumb-canvas` | `ai-interpolate-modal__thumb-canvas` | was un-namespaced |
| `.ai-unavailable-detail` | `ai-interpolate-modal__unavailable-detail` | was un-namespaced |
| `.ai-unavailable-hint` | `ai-interpolate-modal__unavailable-hint` | was un-namespaced |
| `.ai-unavailable-icon` | `ai-interpolate-modal__unavailable-icon` | was un-namespaced |
| `.ai-unavailable-title` | `ai-interpolate-modal__unavailable-title` | was un-namespaced |
| `.ai-warning` | `ai-interpolate-modal__warning` | was un-namespaced |
| `.between` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.completed` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.failed` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.generated` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.keyframe` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.placeholder` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.processing` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.queued` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.selected` | `--selected` modifier | **COLLISION**; attach to the element it modifies |

### AddVariantModal  ·  block `add-variant-modal`
`client/src/components/AddVariantModal/AddVariantModal.css` — 35 classes

| Old | New | Notes |
| --- | --- | --- |
| `.add-to-all-frames-toggle` | `add-variant-modal__add-to-all-frames-toggle` | was un-namespaced |
| `.add-variant-actions` | `add-variant-modal__actions` | was un-namespaced |
| `.add-variant-card` | `add-variant-modal__card` | was un-namespaced |
| `.add-variant-confirm-btn` | `add-variant-modal__confirm-btn` | was un-namespaced |
| `.add-variant-count` | `add-variant-modal__count` | was un-namespaced |
| `.add-variant-grid` | `add-variant-modal__grid` | was un-namespaced |
| `.add-variant-info` | `add-variant-modal__info` | was un-namespaced |
| `.add-variant-modal` | `add-variant-modal` | block root |
| `.add-variant-modal-backdrop` | `add-variant-modal__backdrop` |  |
| `.add-variant-modal-content` | `add-variant-modal__content` |  |
| `.add-variant-modal-header` | `add-variant-modal__header` |  |
| `.add-variant-name` | `add-variant-modal__name` | was un-namespaced |
| `.add-variant-name-input` | `add-variant-modal__name-input` | was un-namespaced |
| `.add-variant-section-title` | `add-variant-modal__section-title` | was un-namespaced |
| `.add-variant-thumb` | `add-variant-modal__thumb` | was un-namespaced |
| `.add-variant-thumb-canvas` | `add-variant-modal__thumb-canvas` | was un-namespaced |
| `.cancel-btn` | `btn btn--neutral` | shared primitive (R8) |
| `.check` | `add-variant-modal__check` | was un-namespaced |
| `.close-btn` | `modal__close` | shared primitive (R8) |
| `.delete-btn` | `btn btn--danger` | shared primitive (R8) |
| `.delete-confirm-actions` | `confirm-dialog__footer` | shared primitive (R8) |
| `.delete-confirm-backdrop` | `confirm-dialog__overlay` | shared primitive (R8) |
| `.delete-confirm-content` | `confirm-dialog__body` | shared primitive (R8) |
| `.delete-confirm-header` | `confirm-dialog__header` | shared primitive (R8) |
| `.delete-confirm-modal` | `confirm-dialog` | shared primitive (R8) |
| `.delete-confirm-undo` | `confirm-dialog__undo` | shared primitive (R8) |
| `.delete-confirm-warning` | `confirm-dialog__warning` | shared primitive (R8) |
| `.delete-variant-btn` | `add-variant-modal__delete-variant-btn` | was un-namespaced |
| `.hint` | `add-variant-modal__hint` | **COLLISION** |
| `.no-variants-message` | `add-variant-modal__no-variants-message` | was un-namespaced |
| `.selected` | `--selected` modifier | **COLLISION**; attach to the element it modifies |
| `.selected-badge` | `add-variant-modal__selected-badge` | **COLLISION** |
| `.variant-type-name` | `add-variant-modal__variant-type-name` | was un-namespaced |
| `.variant-type-option` | `add-variant-modal__variant-type-option` | was un-namespaced |
| `.variant-type-picker` | `add-variant-modal__variant-type-picker` | was un-namespaced |

### AnchorGrid  ·  block `anchor-grid`
`client/src/components/AnchorGrid/AnchorGrid.css` — 15 classes

| Old | New | Notes |
| --- | --- | --- |
| `.active` | `--active` modifier | **COLLISION**; attach to the element it modifies |
| `.anchor-arrow` | `anchor-grid__anchor-arrow` | was un-namespaced |
| `.anchor-cell` | `anchor-grid__anchor-cell` | was un-namespaced |
| `.anchor-dot` | `anchor-grid__anchor-dot` | was un-namespaced |
| `.anchor-grid` | `anchor-grid` | block root |
| `.anchor-grid-container` | `anchor-grid__container` |  |
| `.anchor-info` | `anchor-grid__anchor-info` | was un-namespaced |
| `.arrow-down` | `anchor-grid__arrow-down` | dynamic |
| `.arrow-left` | `anchor-grid__arrow-left` | dynamic |
| `.arrow-right` | `anchor-grid__arrow-right` | dynamic |
| `.arrow-up` | `anchor-grid__arrow-up` | dynamic |
| `.expanding` | `--expanding` modifier | dynamic; attach to the element it modifies |
| `.no-change` | `--no-change` modifier | state word; attach to the element it modifies |
| `.shrinking` | `--shrinking` modifier | state word; attach to the element it modifies |
| `.size-change` | `anchor-grid__size-change` | was un-namespaced |

### BrowseBackupsModal  ·  block `browse-backups-modal`
`client/src/components/BrowseBackupsModal/BrowseBackupsModal.css` — 23 classes

| Old | New | Notes |
| --- | --- | --- |
| `.backup-date-group` | `browse-backups-modal__backup-date-group` | was un-namespaced |
| `.backup-date-label` | `browse-backups-modal__backup-date-label` | was un-namespaced |
| `.backup-filename` | `browse-backups-modal__backup-filename` | was un-namespaced |
| `.backup-item` | `browse-backups-modal__backup-item` | was un-namespaced |
| `.backup-list` | `browse-backups-modal__backup-list` | was un-namespaced |
| `.backup-time` | `browse-backups-modal__backup-time` | was un-namespaced |
| `.backup-time-icon` | `browse-backups-modal__backup-time-icon` | was un-namespaced |
| `.backups-empty` | `browse-backups-modal__backups-empty` | was un-namespaced |
| `.backups-loading` | `browse-backups-modal__backups-loading` | was un-namespaced |
| `.browse-backups-modal` | `browse-backups-modal` | block root |
| `.close-btn` | `modal__close` | shared primitive (R8) |
| `.confirm-buttons` | `confirm-dialog__footer` | shared primitive (R8) |
| `.confirm-cancel-btn` | `btn btn--neutral` | shared primitive (R8) |
| `.confirm-dialog` | `confirm-dialog` | shared primitive (R8) |
| `.confirm-overlay` | `confirm-dialog__overlay` | shared primitive (R8) |
| `.confirm-restore-btn` | `btn btn--primary` | shared primitive (R8) |
| `.confirm-undo-hint` | `confirm-dialog__undo` | shared primitive (R8) |
| `.error-message` | `browse-backups-modal__error-message` | **COLLISION** |
| `.modal-content` | `modal__body` | shared primitive (R8) |
| `.modal-footer` | `modal__footer` | shared primitive (R8) |
| `.modal-header` | `modal__header` | shared primitive (R8) |
| `.restore-btn` | `btn btn--primary` | shared primitive (R8) |
| `.selected` | `--selected` modifier | **COLLISION**; attach to the element it modifies |

### Canvas  ·  block `canvas`
`client/src/components/Canvas/Canvas.css` — 27 classes

| Old | New | Notes |
| --- | --- | --- |
| `.canvas-container` | `canvas__container` |  |
| `.canvas-info` | `canvas__info` |  |
| `.canvas-info-arrow` | `canvas__info-arrow` |  |
| `.canvas-info-arrow-toggle` | `canvas__info-arrow-toggle` |  |
| `.canvas-info-panel` | `canvas__info-panel` |  |
| `.canvas-info-wrap` | `canvas__info-wrap` |  |
| `.canvas-wrapper` | `canvas__wrapper` |  |
| `.canvas-wrapper-outer` | `canvas__wrapper-outer` |  |
| `.main-canvas-container` | `canvas__main-canvas-container` | was un-namespaced |
| `.pixel-canvas` | `canvas__pixel-canvas` | was un-namespaced |
| `.ref-box-btn` | `canvas__ref-box-btn` | **COLLISION** |
| `.ref-box-btn-bottom` | `canvas__ref-box-btn-bottom` | **COLLISION** |
| `.ref-box-btn-left` | `canvas__ref-box-btn-left` | **COLLISION** |
| `.ref-box-btn-right` | `canvas__ref-box-btn-right` | **COLLISION** |
| `.ref-box-btn-top` | `canvas__ref-box-btn-top` | **COLLISION** |
| `.reference-canvas` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.reference-canvas-container` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.reference-canvas-wrapper` | `canvas__reference-canvas-wrapper` | **COLLISION** |
| `.reference-info` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.reference-label` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.reference-nav-btn` | `canvas__reference-nav-btn` | **COLLISION** |
| `.reference-navigation` | `canvas__reference-navigation` | **COLLISION** |
| `.reference-overlay-canvas` | `canvas__reference-overlay-canvas` | was un-namespaced |
| `.selection-info` | `canvas__selection-info` | **COLLISION** |
| `.separator` | `canvas__separator` | **COLLISION** |
| `.trace-info` | `canvas__trace-info` | was un-namespaced |
| `.variant-indicator` | `canvas__variant-indicator` | was un-namespaced |

### LightingCanvas  ·  block `lighting-canvas`
`client/src/components/Canvas/LightingCanvas.css` — 17 classes

| Old | New | Notes |
| --- | --- | --- |
| `.dragging` | `--dragging` modifier | **COLLISION**; attach to the element it modifies |
| `.lighting-canvas-container` | `lighting-canvas__container` |  |
| `.lighting-canvas-empty` | `lighting-canvas__empty` |  |
| `.lighting-canvas-info` | `lighting-canvas__info` |  |
| `.lighting-edit-canvas` | `lighting-canvas__lighting-edit-canvas` | was un-namespaced |
| `.lighting-edit-overlay` | `lighting-canvas__lighting-edit-overlay` | was un-namespaced |
| `.lighting-editor-container` | `lighting-canvas__lighting-editor-container` | was un-namespaced |
| `.lighting-editor-outer` | `lighting-canvas__lighting-editor-outer` | was un-namespaced |
| `.lighting-editor-stack` | `lighting-canvas__lighting-editor-stack` | was un-namespaced |
| `.lighting-editor-wrapper` | `lighting-canvas__lighting-editor-wrapper` | was un-namespaced |
| `.lighting-preview-content` | `lighting-canvas__lighting-preview-content` | was un-namespaced |
| `.lighting-preview-header` | `lighting-canvas__lighting-preview-header` | was un-namespaced |
| `.lighting-preview-minimize` | `lighting-canvas__lighting-preview-minimize` | was un-namespaced |
| `.lighting-preview-panel` | `lighting-canvas__lighting-preview-panel` | was un-namespaced |
| `.lighting-preview-title` | `lighting-canvas__lighting-preview-title` | was un-namespaced |
| `.minimized` | `--minimized` modifier | **COLLISION**; attach to the element it modifies |
| `.separator` | `lighting-canvas__separator` | **COLLISION** |

### ColorPicker  ·  block `color-picker`
`client/src/components/ColorPicker/ColorPicker.css` — 29 classes

| Old | New | Notes |
| --- | --- | --- |
| `.channel-a` | `color-picker__channel-a` | was un-namespaced |
| `.channel-b` | `color-picker__channel-b` | dynamic |
| `.channel-g` | `color-picker__channel-g` | dynamic |
| `.channel-r` | `color-picker__channel-r` | dynamic |
| `.channel-slider` | `slider__input--channel` | shared primitive (R8) |
| `.color-history` | `color-picker__color-history` | was un-namespaced |
| `.color-history-swatch` | `color-picker__color-history-swatch` | was un-namespaced |
| `.color-picker` | `color-picker` | block root |
| `.color-picker-area` | `color-picker__area` |  |
| `.color-preview` | `color-picker__color-preview` | was un-namespaced |
| `.color-preview-row` | `color-picker__color-preview-row` | was un-namespaced |
| `.compact-slider` | `slider__input` | shared primitive (R8) |
| `.hex-input` | `color-picker__hex-input` | was un-namespaced |
| `.hsl-h` | `color-picker__hsl-h` | was un-namespaced |
| `.hsl-l` | `color-picker__hsl-l` | was un-namespaced |
| `.hsl-s` | `color-picker__hsl-s` | was un-namespaced |
| `.hue-canvas` | `color-picker__hue-canvas` | was un-namespaced |
| `.hue-picker-container` | `color-picker__hue-picker-container` | was un-namespaced |
| `.hue-picker-handle` | `color-picker__hue-picker-handle` | was un-namespaced |
| `.hue-slider` | `slider__input--hue` | shared primitive (R8) |
| `.slider-input` | `slider__value` | shared primitive (R8) |
| `.slider-label` | `slider__label` | shared primitive (R8) |
| `.slider-row` | `slider` | shared primitive (R8) |
| `.slider-section` | `slider-group` | shared primitive (R8) |
| `.slider-section-label` | `slider-group__label` | shared primitive (R8) |
| `.sv-canvas` | `color-picker__sv-canvas` | was un-namespaced |
| `.sv-picker-container` | `color-picker__sv-picker-container` | was un-namespaced |
| `.sv-picker-handle` | `color-picker__sv-picker-handle` | was un-namespaced |
| `.transparency-grid` | `color-picker__transparency-grid` | was un-namespaced |

### CopyFromModal  ·  block `copy-from-modal`
`client/src/components/CopyFromModal/CopyFromModal.css` — 18 classes

| Old | New | Notes |
| --- | --- | --- |
| `.close-btn` | `modal__close` | shared primitive (R8) |
| `.copy-layer-cell` | `copy-from-modal__layer-cell` | was un-namespaced |
| `.copy-modal` | `copy-from-modal__modal` | was un-namespaced |
| `.copy-modal-backdrop` | `copy-from-modal__backdrop` | was un-namespaced |
| `.copy-modal-content` | `copy-from-modal__content` | was un-namespaced |
| `.copy-modal-header` | `copy-from-modal__header` | was un-namespaced |
| `.copy-modal-hint` | `copy-from-modal__hint` | was un-namespaced |
| `.copy-thumb-canvas` | `copy-from-modal__thumb-canvas` | was un-namespaced |
| `.copy-tooltip` | `copy-from-modal__tooltip` | was un-namespaced |
| `.current` | `--current` modifier | **COLLISION**; attach to the element it modifies |
| `.current-badge` | `copy-from-modal__current-badge` | **COLLISION** |
| `.layers-row` | `copy-from-modal__layers-row` | was un-namespaced |
| `.no-layers` | `copy-from-modal__no-layers` | was un-namespaced |
| `.object-name` | `copy-from-modal__object-name` | **COLLISION** |
| `.object-row` | `copy-from-modal__object-row` | was un-namespaced |
| `.objects-grid` | `copy-from-modal__objects-grid` | **COLLISION** |
| `.variant` | `--variant` modifier | **COLLISION**; attach to the element it modifies |
| `.variant-badge` | `copy-from-modal__variant-badge` | was un-namespaced |

### EdgeInterpolateModal  ·  block `edge-interpolate-modal`
`client/src/components/EdgeInterpolateModal/EdgeInterpolateModal.css` — 21 classes

| Old | New | Notes |
| --- | --- | --- |
| `.cancel` | `--neutral` modifier | **COLLISION**; attach to the element it modifies |
| `.close-btn` | `modal__close` | shared primitive (R8) |
| `.confirm` | `--primary` modifier | **COLLISION**; attach to the element it modifies |
| `.edge-interpolate-btn` | `edge-interpolate-modal__btn` | was un-namespaced |
| `.edge-interpolate-checkbox` | `edge-interpolate-modal__checkbox` | was un-namespaced |
| `.edge-interpolate-checkbox-label` | `edge-interpolate-modal__checkbox-label` | was un-namespaced |
| `.edge-interpolate-checkbox-text` | `edge-interpolate-modal__checkbox-text` | was un-namespaced |
| `.edge-interpolate-control` | `edge-interpolate-modal__control` | was un-namespaced |
| `.edge-interpolate-description` | `edge-interpolate-modal__description` | was un-namespaced |
| `.edge-interpolate-hints` | `edge-interpolate-modal__hints` | was un-namespaced |
| `.edge-interpolate-label` | `edge-interpolate-modal__label` | was un-namespaced |
| `.edge-interpolate-modal` | `edge-interpolate-modal` | block root |
| `.edge-interpolate-modal-actions` | `edge-interpolate-modal__actions` |  |
| `.edge-interpolate-modal-backdrop` | `edge-interpolate-modal__backdrop` |  |
| `.edge-interpolate-modal-content` | `edge-interpolate-modal__content` |  |
| `.edge-interpolate-modal-header` | `edge-interpolate-modal__header` |  |
| `.edge-interpolate-slider` | `edge-interpolate-modal__slider` | was un-namespaced |
| `.edge-interpolate-slider-container` | `edge-interpolate-modal__slider-container` | was un-namespaced |
| `.hint` | `edge-interpolate-modal__hint` | **COLLISION** |
| `.label-text` | `edge-interpolate-modal__label-text` | **COLLISION** |
| `.label-value` | `edge-interpolate-modal__label-value` | **COLLISION** |

### ExportPreviewModal  ·  block `export-preview-modal`
`client/src/components/ExportPreviewModal/ExportPreviewModal.css` — 37 classes

| Old | New | Notes |
| --- | --- | --- |
| `.export-object-canvas-wrap` | `export-preview-modal__export-object-canvas-wrap` | was un-namespaced |
| `.export-object-frame-counter` | `export-preview-modal__export-object-frame-counter` | was un-namespaced |
| `.export-object-info` | `export-preview-modal__export-object-info` | was un-namespaced |
| `.export-object-max-canvas` | `export-preview-modal__export-object-max-canvas` | was un-namespaced |
| `.export-object-meta` | `export-preview-modal__export-object-meta` | was un-namespaced |
| `.export-object-name` | `export-preview-modal__export-object-name` | was un-namespaced |
| `.export-object-origin` | `export-preview-modal__export-object-origin` | was un-namespaced |
| `.export-object-row` | `export-preview-modal__export-object-row` | was un-namespaced |
| `.export-object-row-left` | `export-preview-modal__export-object-row-left` | was un-namespaced |
| `.export-preview-close` | `export-preview-modal__close` | was un-namespaced |
| `.export-preview-content` | `export-preview-modal__content` | was un-namespaced |
| `.export-preview-controls` | `export-preview-modal__controls` | was un-namespaced |
| `.export-preview-error` | `export-preview-modal__error` | was un-namespaced |
| `.export-preview-error-icon` | `export-preview-modal__error-icon` | was un-namespaced |
| `.export-preview-error-msg` | `export-preview-modal__error-msg` | was un-namespaced |
| `.export-preview-fps` | `export-preview-modal__fps` | was un-namespaced |
| `.export-preview-fps-label` | `export-preview-modal__fps-label` | was un-namespaced |
| `.export-preview-fps-slider` | `export-preview-modal__fps-slider` | was un-namespaced |
| `.export-preview-fps-value` | `export-preview-modal__fps-value` | was un-namespaced |
| `.export-preview-header` | `export-preview-modal__header` | was un-namespaced |
| `.export-preview-header-left` | `export-preview-modal__header-left` | was un-namespaced |
| `.export-preview-list` | `export-preview-modal__list` | was un-namespaced |
| `.export-preview-loading` | `export-preview-modal__loading` | was un-namespaced |
| `.export-preview-modal` | `export-preview-modal` | block root |
| `.export-preview-overlay` | `export-preview-modal__overlay` | was un-namespaced |
| `.export-preview-spinner` | `export-preview-modal__spinner` | was un-namespaced |
| `.export-preview-stat` | `export-preview-modal__stat` | was un-namespaced |
| `.export-preview-stat-value` | `export-preview-modal__stat-value` | was un-namespaced |
| `.export-preview-stats` | `export-preview-modal__stats` | was un-namespaced |
| `.export-preview-subtitle` | `export-preview-modal__subtitle` | was un-namespaced |
| `.export-preview-title` | `export-preview-modal__title` | was un-namespaced |
| `.export-variant-layer-name` | `export-preview-modal__export-variant-layer-name` | was un-namespaced |
| `.export-variant-panel` | `export-preview-modal__export-variant-panel` | was un-namespaced |
| `.export-variant-row` | `export-preview-modal__export-variant-row` | was un-namespaced |
| `.export-variant-thumbs` | `export-preview-modal__export-variant-thumbs` | was un-namespaced |
| `.variant-thumb` | `export-preview-modal__variant-thumb` | **COLLISION** |
| `.variant-thumb-selected` | `export-preview-modal__variant-thumb-selected` | was un-namespaced |

### FrameReferencePanel  ·  block `frame-reference-panel`
`client/src/components/FrameReferencePanel/FrameReferencePanel.css` — 26 classes

| Old | New | Notes |
| --- | --- | --- |
| `.active` | `--active` modifier | **COLLISION**; attach to the element it modifies |
| `.different-object` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.dragging` | `--dragging` modifier | **COLLISION**; attach to the element it modifies |
| `.frame-reference-ahead-behind` | `frame-reference-panel__ahead-behind` | was un-namespaced |
| `.frame-reference-btn` | `frame-reference-panel__btn` | was un-namespaced |
| `.frame-reference-content` | `frame-reference-panel__content` | was un-namespaced |
| `.frame-reference-controls` | `frame-reference-panel__controls` | was un-namespaced |
| `.frame-reference-go-current-btn` | `frame-reference-panel__go-current-btn` | was un-namespaced |
| `.frame-reference-header` | `frame-reference-panel__header` | was un-namespaced |
| `.frame-reference-index` | `frame-reference-panel__index` | was un-namespaced |
| `.frame-reference-info` | `frame-reference-panel__info` | was un-namespaced |
| `.frame-reference-invalid` | `frame-reference-panel__invalid` | was un-namespaced |
| `.frame-reference-minimize` | `frame-reference-panel__minimize` | was un-namespaced |
| `.frame-reference-name` | `frame-reference-panel__name` | was un-namespaced |
| `.frame-reference-number` | `frame-reference-panel__number` | was un-namespaced |
| `.frame-reference-object-btn` | `frame-reference-panel__object-btn` | was un-namespaced |
| `.frame-reference-object-info` | `frame-reference-panel__object-info` | was un-namespaced |
| `.frame-reference-object-label` | `frame-reference-panel__object-label` | was un-namespaced |
| `.frame-reference-object-name` | `frame-reference-panel__object-name` | was un-namespaced |
| `.frame-reference-overlay-btn` | `frame-reference-panel__overlay-btn` | was un-namespaced |
| `.frame-reference-panel` | `frame-reference-panel` | block root |
| `.frame-reference-preview` | `frame-reference-panel__preview` | was un-namespaced |
| `.frame-reference-sync-row` | `frame-reference-panel__sync-row` | was un-namespaced |
| `.frame-reference-title` | `frame-reference-panel__title` | was un-namespaced |
| `.frame-reference-trace-btn` | `frame-reference-panel__trace-btn` | was un-namespaced |
| `.minimized` | `--minimized` modifier | **COLLISION**; attach to the element it modifies |

### FrameTagsModal  ·  block `frame-tags-modal`
`client/src/components/FrameTagsModal/FrameTagsModal.css` — 19 classes

| Old | New | Notes |
| --- | --- | --- |
| `.clickable` | `--clickable` modifier | state word; attach to the element it modifies |
| `.frame-tag-pill` | `frame-tags-modal__frame-tag-pill` | was un-namespaced |
| `.frame-tag-pill-remove` | `frame-tags-modal__frame-tag-pill-remove` | was un-namespaced |
| `.frame-tags-add-btn` | `frame-tags-modal__add-btn` | was un-namespaced |
| `.frame-tags-input` | `frame-tags-modal__input` | was un-namespaced |
| `.frame-tags-input-row` | `frame-tags-modal__input-row` | was un-namespaced |
| `.frame-tags-modal` | `frame-tags-modal` | block root |
| `.frame-tags-modal-backdrop` | `frame-tags-modal__backdrop` |  |
| `.frame-tags-modal-close` | `frame-tags-modal__close` |  |
| `.frame-tags-modal-content` | `frame-tags-modal__content` |  |
| `.frame-tags-modal-header` | `frame-tags-modal__header` |  |
| `.frame-tags-pills` | `frame-tags-modal__pills` | was un-namespaced |
| `.frame-tags-project-empty` | `frame-tags-modal__project-empty` | was un-namespaced |
| `.frame-tags-project-group` | `frame-tags-modal__project-group` | was un-namespaced |
| `.frame-tags-project-group-label` | `frame-tags-modal__project-group-label` | was un-namespaced |
| `.frame-tags-project-group-pills` | `frame-tags-modal__project-group-pills` | was un-namespaced |
| `.frame-tags-project-list` | `frame-tags-modal__project-list` | was un-namespaced |
| `.frame-tags-project-section` | `frame-tags-modal__project-section` | was un-namespaced |
| `.frame-tags-project-title` | `frame-tags-modal__project-title` | was un-namespaced |

### FrameTimeline  ·  block `frame-timeline`
`client/src/components/FrameTimeline/FrameTimeline.css` — 94 classes

| Old | New | Notes |
| --- | --- | --- |
| `.active` | `--active` modifier | **COLLISION**; attach to the element it modifies |
| `.add-frame-btn` | `frame-timeline__add-frame-btn` | was un-namespaced |
| `.add-layer-btn` | `frame-timeline__add-layer-btn` | was un-namespaced |
| `.base-frame-index` | `frame-timeline__base-frame-index` | was un-namespaced |
| `.base-frame-item` | `frame-timeline__base-frame-item` | was un-namespaced |
| `.base-frame-thumbnail` | `frame-timeline__base-frame-thumbnail` | was un-namespaced |
| `.base-frames-header` | `frame-timeline__base-frames-header` | was un-namespaced |
| `.base-frames-list` | `frame-timeline__base-frames-list` | was un-namespaced |
| `.base-frames-list-droppable` | `frame-timeline__base-frames-list-droppable` | was un-namespaced |
| `.base-frames-offset` | `frame-timeline__base-frames-offset` | was un-namespaced |
| `.base-frames-scroll` | `frame-timeline__base-frames-scroll` | was un-namespaced |
| `.base-frames-section` | `frame-timeline__base-frames-section` | was un-namespaced |
| `.base-frames-title` | `frame-timeline__base-frames-title` | was un-namespaced |
| `.canvas-size-btn` | `frame-timeline__canvas-size-btn` | was un-namespaced |
| `.copy-previous-label` | `frame-timeline__copy-previous-label` | was un-namespaced |
| `.delete` | `--danger` modifier | **COLLISION**; attach to the element it modifies |
| `.dragging` | `--dragging` modifier | **COLLISION**; attach to the element it modifies |
| `.empty` | `--empty` modifier | state word; attach to the element it modifies |
| `.empty-selected` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.even` | `--even` modifier | state word; attach to the element it modifies |
| `.frame-action-btn` | `frame-timeline__frame-action-btn` | was un-namespaced |
| `.frame-actions` | `frame-timeline__frame-actions` | was un-namespaced |
| `.frame-drop-indicator` | `frame-timeline__frame-drop-indicator` | was un-namespaced |
| `.frame-drop-indicator-base` | `frame-timeline__frame-drop-indicator-base` | was un-namespaced |
| `.frame-index` | `frame-timeline__frame-index` | was un-namespaced |
| `.frame-info` | `frame-timeline__frame-info` | was un-namespaced |
| `.frame-item` | `frame-timeline__frame-item` | was un-namespaced |
| `.frame-move-btn` | `frame-timeline__frame-move-btn` | was un-namespaced |
| `.frame-move-controls` | `frame-timeline__frame-move-controls` | was un-namespaced |
| `.frame-name` | `frame-timeline__frame-name` | was un-namespaced |
| `.frame-name-input` | `frame-timeline__frame-name-input` | was un-namespaced |
| `.frame-tag-dot` | `frame-timeline__frame-tag-dot` | was un-namespaced |
| `.frame-tags-btn` | `frame-timeline__frame-tags-btn` | was un-namespaced |
| `.frame-tags-icon` | `frame-timeline__frame-tags-icon` | was un-namespaced |
| `.frame-thumb-canvas` | `frame-timeline__frame-thumb-canvas` | was un-namespaced |
| `.frame-thumbnail` | `frame-timeline__frame-thumbnail` | was un-namespaced |
| `.frame-timeline` | `frame-timeline` | block root |
| `.frames-list` | `frame-timeline__frames-list` | was un-namespaced |
| `.frames-list-droppable` | `frame-timeline__frames-list-droppable` | was un-namespaced |
| `.frames-scroll` | `frame-timeline__frames-scroll` | was un-namespaced |
| `.highlighted` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.hovered` | `--hovered` modifier | state word; attach to the element it modifies |
| `.new-frame-input` | `frame-timeline__new-frame-input` | was un-namespaced |
| `.play-btn` | `frame-timeline__play-btn` | was un-namespaced |
| `.playing` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.preview-btn` | `frame-timeline__preview-btn` | was un-namespaced |
| `.selected` | `--selected` modifier | **COLLISION**; attach to the element it modifies |
| `.timeline-action-bar` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.timeline-action-btn` | `frame-timeline__action-btn` | was un-namespaced |
| `.timeline-action-buttons` | `frame-timeline__action-buttons` | was un-namespaced |
| `.timeline-cell` | `frame-timeline__cell` | was un-namespaced |
| `.timeline-cell-dot` | `frame-timeline__cell-dot` | was un-namespaced |
| `.timeline-cell-thumbnail` | `frame-timeline__cell-thumbnail` | was un-namespaced |
| `.timeline-controls` | `frame-timeline__controls` | was un-namespaced |
| `.timeline-grid` | `frame-timeline__grid` | was un-namespaced |
| `.timeline-grid-container` | `frame-timeline__grid-container` | was un-namespaced |
| `.timeline-grid-row` | `frame-timeline__grid-row` | was un-namespaced |
| `.timeline-grid-scroll` | `frame-timeline__grid-scroll` | was un-namespaced |
| `.timeline-header` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.timeline-header-row` | `frame-timeline__header-row` | was un-namespaced |
| `.timeline-layer-dot` | `frame-timeline__layer-dot` | was un-namespaced |
| `.timeline-layer-header` | `frame-timeline__layer-header` | was un-namespaced |
| `.timeline-layer-headers` | `frame-timeline__layer-headers` | was un-namespaced |
| `.timeline-layer-name` | `frame-timeline__layer-name` | was un-namespaced |
| `.timeline-new-layer` | `frame-timeline__new-layer` | was un-namespaced |
| `.timeline-new-layer-input` | `frame-timeline__new-layer-input` | was un-namespaced |
| `.timeline-playback-controls` | `frame-timeline__playback-controls` | was un-namespaced |
| `.timeline-playhead` | `frame-timeline__playhead` | was un-namespaced |
| `.timeline-title` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.timeline-title-group` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.timeline-toggle-btn` | `frame-timeline__toggle-btn` | was un-namespaced |
| `.timeline-view` | `frame-timeline__view` | was un-namespaced |
| `.variant` | `--variant` modifier | **COLLISION**; attach to the element it modifies |
| `.variant-frame-action-btn` | `frame-timeline__variant-frame-action-btn` | was un-namespaced |
| `.variant-frame-actions` | `frame-timeline__variant-frame-actions` | was un-namespaced |
| `.variant-frame-index` | `frame-timeline__variant-frame-index` | was un-namespaced |
| `.variant-frame-info` | `frame-timeline__variant-frame-info` | was un-namespaced |
| `.variant-frame-item` | `frame-timeline__variant-frame-item` | was un-namespaced |
| `.variant-frame-tags-btn` | `frame-timeline__variant-frame-tags-btn` | was un-namespaced |
| `.variant-frame-thumbnail` | `frame-timeline__variant-frame-thumbnail` | was un-namespaced |
| `.variant-frames-list` | `frame-timeline__variant-frames-list` | was un-namespaced |
| `.variant-frames-list-droppable` | `frame-timeline__variant-frames-list-droppable` | was un-namespaced |
| `.variant-frames-scroll` | `frame-timeline__variant-frames-scroll` | was un-namespaced |
| `.variant-mode` | `--variant` modifier | state word; attach to the element it modifies |
| `.variant-option` | `--variant` modifier | state word; attach to the element it modifies |
| `.variant-timeline` | `frame-timeline__variant-timeline` | was un-namespaced |
| `.variant-timeline-header` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.variant-timeline-label` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.view-mode-dropdown` | `frame-timeline__view-mode-dropdown` | was un-namespaced |
| `.view-mode-dropdown-arrow` | `frame-timeline__view-mode-dropdown-arrow` | was un-namespaced |
| `.view-mode-dropdown-item` | `frame-timeline__view-mode-dropdown-item` | was un-namespaced |
| `.view-mode-dropdown-menu` | `frame-timeline__view-mode-dropdown-menu` | was un-namespaced |
| `.view-mode-dropdown-trigger` | `frame-timeline__view-mode-dropdown-trigger` | was un-namespaced |
| `.with-thumbnail` | `--with-thumbnail` modifier | state word; attach to the element it modifies |

### Header  ·  block `header`
`client/src/components/Header/Header.css` — 41 classes

| Old | New | Notes |
| --- | --- | --- |
| `.ai-config-btn` | `header__ai-config-btn` | was un-namespaced |
| `.ai-config-error` | `header__ai-config-error` | was un-namespaced |
| `.ai-config-hint` | `header__ai-config-hint` | was un-namespaced |
| `.ai-config-input` | `header__ai-config-input` | was un-namespaced |
| `.ai-config-label` | `header__ai-config-label` | was un-namespaced |
| `.ai-config-popover` | `header__ai-config-popover` | was un-namespaced |
| `.ai-config-row` | `header__ai-config-row` | was un-namespaced |
| `.ai-config-save-btn` | `header__ai-config-save-btn` | was un-namespaced |
| `.ai-config-wrapper` | `header__ai-config-wrapper` | was un-namespaced |
| `.ai-error` | `--error` modifier | state word; attach to the element it modifies |
| `.ai-icon` | `header__ai-icon` | was un-namespaced |
| `.backups-icon` | `header__backups-icon` | was un-namespaced |
| `.browse-backups-btn` | `header__browse-backups-btn` | was un-namespaced |
| `.configured` | `--configured` modifier | state word; attach to the element it modifies |
| `.edit-error` | `header__edit-error` | was un-namespaced |
| `.edit-hint` | `header__edit-hint` | was un-namespaced |
| `.export-btn` | `header__export-btn` | was un-namespaced |
| `.export-icon` | `header__export-icon` | was un-namespaced |
| `.export-status` | `header__export-status` | was un-namespaced |
| `.export-status-error` | `header__export-status-error` | dynamic |
| `.export-status-success` | `header__export-status-success` | dynamic |
| `.folder-icon` | `header__folder-icon` | was un-namespaced |
| `.has-error` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.header` | `header` | block root |
| `.header-center` | `header__center` |  |
| `.header-left` | `header__left` |  |
| `.header-right` | `header__right` |  |
| `.logo` | `header__logo` | was un-namespaced |
| `.logo-icon` | `header__logo-icon` | was un-namespaced |
| `.logo-text` | `header__logo-text` | was un-namespaced |
| `.project-edit-wrapper` | `header__project-edit-wrapper` | was un-namespaced |
| `.project-name` | `header__project-name` | **COLLISION** |
| `.project-title-btn` | `header__project-title-btn` | was un-namespaced |
| `.project-title-container` | `header__project-title-container` | was un-namespaced |
| `.project-title-input` | `header__project-title-input` | was un-namespaced |
| `.save-status` | `header__save-status` | was un-namespaced |
| `.status-dot` | `header__status-dot` | was un-namespaced |
| `.status-error` | `header__status-error` | dynamic |
| `.status-saved` | `header__status-saved` | dynamic |
| `.status-saving` | `header__status-saving` | dynamic |
| `.switch-project-btn` | `header__switch-project-btn` | was un-namespaced |

### HeightMapModal  ·  block `height-map-modal`
`client/src/components/HeightMapModal/HeightMapModal.css` — 20 classes

| Old | New | Notes |
| --- | --- | --- |
| `.active` | `--active` modifier | **COLLISION**; attach to the element it modifies |
| `.cancel` | `--neutral` modifier | **COLLISION**; attach to the element it modifies |
| `.channel-btn` | `height-map-modal__channel-btn` | was un-namespaced |
| `.close-btn` | `modal__close` | shared primitive (R8) |
| `.confirm` | `--primary` modifier | **COLLISION**; attach to the element it modifies |
| `.height-map-btn` | `height-map-modal__btn` | was un-namespaced |
| `.height-map-channel-buttons` | `height-map-modal__channel-buttons` | was un-namespaced |
| `.height-map-control` | `height-map-modal__control` | was un-namespaced |
| `.height-map-description` | `height-map-modal__description` | was un-namespaced |
| `.height-map-label` | `height-map-modal__label` | was un-namespaced |
| `.height-map-modal` | `height-map-modal` | block root |
| `.height-map-modal-actions` | `height-map-modal__actions` |  |
| `.height-map-modal-backdrop` | `height-map-modal__backdrop` |  |
| `.height-map-modal-content` | `height-map-modal__content` |  |
| `.height-map-modal-header` | `height-map-modal__header` |  |
| `.height-map-preview` | `height-map-modal__preview` | was un-namespaced |
| `.height-map-slider` | `height-map-modal__slider` | was un-namespaced |
| `.height-map-slider-container` | `height-map-modal__slider-container` | was un-namespaced |
| `.label-text` | `height-map-modal__label-text` | **COLLISION** |
| `.label-value` | `height-map-modal__label-value` | **COLLISION** |

### LayerColors  ·  block `layer-colors`
`client/src/components/LayerColors/LayerColors.css` — 13 classes

| Old | New | Notes |
| --- | --- | --- |
| `.layer-color-swatch` | `layer-colors__layer-color-swatch` | was un-namespaced |
| `.layer-colors` | `layer-colors` | block root |
| `.layer-colors-center` | `layer-colors__center` |  |
| `.layer-colors-checkbox` | `layer-colors__checkbox` |  |
| `.layer-colors-empty` | `layer-colors__empty` |  |
| `.layer-colors-hint` | `layer-colors__hint` |  |
| `.layer-colors-label` | `layer-colors__label` |  |
| `.layer-colors-left` | `layer-colors__left` |  |
| `.layer-colors-right` | `layer-colors__right` |  |
| `.layer-colors-swatches` | `layer-colors__swatches` |  |
| `.layer-colors-toggle` | `layer-colors__toggle` |  |
| `.layer-colors-toggle-label` | `layer-colors__toggle-label` |  |
| `.selected` | `--selected` modifier | **COLLISION**; attach to the element it modifies |

### LayerPanel  ·  block `layer-panel`
`client/src/components/LayerPanel/LayerPanel.css` — 48 classes

| Old | New | Notes |
| --- | --- | --- |
| `.add-variant-btn` | `layer-panel__add-variant-btn` | **COLLISION** |
| `.all-visible` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.cancel` | `--neutral` modifier | **COLLISION**; attach to the element it modifies |
| `.confirm-btn` | `btn btn--primary` | shared primitive (R8) |
| `.confirm-modal` | `confirm-dialog` | shared primitive (R8) |
| `.confirm-modal-actions` | `confirm-dialog__footer` | shared primitive (R8) |
| `.confirm-modal-content` | `confirm-dialog__body` | shared primitive (R8) |
| `.confirm-modal-header` | `confirm-dialog__header` | shared primitive (R8) |
| `.confirm-warning` | `confirm-dialog__warning` | shared primitive (R8) |
| `.copy-from-btn` | `layer-panel__copy-from-btn` | was un-namespaced |
| `.copy-layer-btn` | `layer-panel__copy-layer-btn` | was un-namespaced |
| `.delete` | `--danger` modifier | **COLLISION**; attach to the element it modifies |
| `.delete-all-frames-btn` | `layer-panel__delete-all-frames-btn` | was un-namespaced |
| `.disabled` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.dragging` | `--dragging` modifier | **COLLISION**; attach to the element it modifies |
| `.empty-state` | `layer-panel__empty-state` | **COLLISION** |
| `.header-actions` | `layer-panel__header-actions` | **COLLISION** |
| `.header-btn` | `layer-panel__header-btn` | **COLLISION** |
| `.layer-action-btn` | `layer-panel__layer-action-btn` | was un-namespaced |
| `.layer-actions` | `layer-panel__layer-actions` | was un-namespaced |
| `.layer-content-row` | `layer-panel__layer-content-row` | was un-namespaced |
| `.layer-item` | `layer-panel__layer-item` | was un-namespaced |
| `.layer-label-row` | `layer-panel__layer-label-row` | was un-namespaced |
| `.layer-list` | `layer-panel__layer-list` | was un-namespaced |
| `.layer-main-column` | `layer-panel__layer-main-column` | was un-namespaced |
| `.layer-name` | `layer-panel__layer-name` | was un-namespaced |
| `.layer-name-input` | `layer-panel__layer-name-input` | was un-namespaced |
| `.layer-panel` | `layer-panel` | block root |
| `.layer-visibility-column` | `layer-panel__layer-visibility-column` | was un-namespaced |
| `.make-variant-btn` | `layer-panel__make-variant-btn` | was un-namespaced |
| `.modal-backdrop` | `confirm-dialog__overlay` | shared primitive (R8) |
| `.move-all-frames-btn` | `layer-panel__move-all-frames-btn` | was un-namespaced |
| `.new-layer-form` | `layer-panel__new-layer-form` | was un-namespaced |
| `.panel-header` | `panel__header` | shared primitive (R8) |
| `.panel-header-title` | `layer-panel__panel-header-title` | was un-namespaced |
| `.selected` | `--selected` modifier | **COLLISION**; attach to the element it modifies |
| `.squash-all-frames-btn` | `layer-panel__squash-all-frames-btn` | was un-namespaced |
| `.squash-btn` | `layer-panel__squash-btn` | was un-namespaced |
| `.variant-group-badge` | `layer-panel__variant-group-badge` | was un-namespaced |
| `.variant-icon` | `layer-panel__variant-icon` | was un-namespaced |
| `.variant-layer` | `--variant` modifier | state word; attach to the element it modifies |
| `.variant-name-badge` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.variant-select-btn` | `layer-panel__variant-select-btn` | was un-namespaced |
| `.variant-select-in-column` | `layer-panel__variant-select-in-column` | was un-namespaced |
| `.variant-type-badge` | `layer-panel__variant-type-badge` | was un-namespaced |
| `.visibility-btn` | `layer-panel__visibility-btn` | was un-namespaced |
| `.visibility-toggle` | `layer-panel__visibility-toggle` | was un-namespaced |
| `.visible` | `--visible` modifier | state word; attach to the element it modifies |

### LightControl  ·  block `light-control`
`client/src/components/LightingStudioPanel/LightControl.css` — 11 classes

| Old | New | Notes |
| --- | --- | --- |
| `.color-slider-header` | `light-control__color-slider-header` | was un-namespaced |
| `.color-slider-label` | `light-control__color-slider-label` | was un-namespaced |
| `.color-slider-preview` | `light-control__color-slider-preview` | was un-namespaced |
| `.color-slider-row` | `light-control__color-slider-row` | was un-namespaced |
| `.color-slider-section` | `light-control__color-slider-section` | was un-namespaced |
| `.compact-slider` | `slider__input` | shared primitive (R8) |
| `.hue-slider` | `slider__input--hue` | shared primitive (R8) |
| `.light-control` | `light-control` | block root |
| `.light-control-section` | `light-control__section` |  |
| `.slider-input` | `slider__value` | shared primitive (R8) |
| `.slider-label` | `slider__label` | shared primitive (R8) |

### LightingStudioPanel  ·  block `lighting-studio-panel`
`client/src/components/LightingStudioPanel/LightingStudioPanel.css` — 10 classes

| Old | New | Notes |
| --- | --- | --- |
| `.active` | `--active` modifier | **COLLISION**; attach to the element it modifies |
| `.brush-shape-control` | `lighting-studio-panel__brush-shape-control` | **COLLISION** |
| `.brush-size-control` | `lighting-studio-panel__brush-size-control` | **COLLISION** |
| `.brush-size-value` | `lighting-studio-panel__brush-size-value` | **COLLISION** |
| `.lighting-panel-section` | `lighting-studio-panel__section` | was un-namespaced |
| `.lighting-studio-panel` | `lighting-studio-panel` | block root |
| `.normal-brush-controls` | `lighting-studio-panel__normal-brush-controls` | was un-namespaced |
| `.panel-content` | `panel__body` | shared primitive (R8) |
| `.shape-btn` | `lighting-studio-panel__shape-btn` | **COLLISION** |
| `.shape-buttons` | `lighting-studio-panel__shape-buttons` | **COLLISION** |

### NormalPicker  ·  block `normal-picker`
`client/src/components/LightingStudioPanel/NormalPicker.css` — 6 classes

| Old | New | Notes |
| --- | --- | --- |
| `.normal-picker` | `normal-picker` | block root |
| `.normal-picker-canvas` | `normal-picker__canvas` |  |
| `.normal-picker-canvas-container` | `normal-picker__canvas-container` |  |
| `.normal-picker-header` | `normal-picker__header` |  |
| `.normal-picker-hint` | `normal-picker__hint` |  |
| `.normal-picker-value` | `normal-picker__value` |  |

### ObjectLibrary  ·  block `object-library`
`client/src/components/ObjectLibrary/ObjectLibrary.css` — 50 classes

| Old | New | Notes |
| --- | --- | --- |
| `.active` | `--active` modifier | **COLLISION**; attach to the element it modifies |
| `.apply-btn` | `btn btn--primary` | shared primitive (R8) |
| `.cancel-btn` | `btn btn--neutral` | shared primitive (R8) |
| `.compact-object-item` | `object-library__compact-object-item` | was un-namespaced |
| `.compact-toggle` | `object-library__compact-toggle` | **COLLISION** |
| `.compact-tooltip` | `object-library__compact-tooltip` | was un-namespaced |
| `.create-btn` | `btn btn--primary` | shared primitive (R8) |
| `.delete` | `--danger` modifier | **COLLISION**; attach to the element it modifies |
| `.delete-btn` | `btn btn--danger` | shared primitive (R8) |
| `.delete-confirm-actions` | `confirm-dialog__footer` | shared primitive (R8) |
| `.delete-confirm-backdrop` | `confirm-dialog__overlay` | shared primitive (R8) |
| `.delete-confirm-content` | `confirm-dialog__body` | shared primitive (R8) |
| `.delete-confirm-header` | `confirm-dialog__header` | shared primitive (R8) |
| `.delete-confirm-modal` | `confirm-dialog` | shared primitive (R8) |
| `.delete-confirm-undo` | `confirm-dialog__undo` | shared primitive (R8) |
| `.delete-confirm-warning` | `confirm-dialog__warning` | shared primitive (R8) |
| `.empty-state` | `object-library__empty-state` | **COLLISION** |
| `.form-actions` | `object-library__form-actions` | was un-namespaced |
| `.header-actions` | `object-library__header-actions` | **COLLISION** |
| `.new-object-form` | `object-library__new-object-form` | was un-namespaced |
| `.obj-thumb-canvas` | `object-library__obj-thumb-canvas` | was un-namespaced |
| `.object-action-btn` | `object-library__object-action-btn` | was un-namespaced |
| `.object-actions` | `object-library__object-actions` | was un-namespaced |
| `.object-actions-row` | `object-library__object-actions-row` | was un-namespaced |
| `.object-content` | `object-library__object-content` | was un-namespaced |
| `.object-details` | `object-library__object-details` | was un-namespaced |
| `.object-grid` | `object-library__object-grid` | was un-namespaced |
| `.object-item` | `object-library__object-item` | was un-namespaced |
| `.object-item-small` | `object-library__object-item-small` | was un-namespaced |
| `.object-library` | `object-library` | block root |
| `.object-list` | `object-library__object-list` | was un-namespaced |
| `.object-list-small` | `object-library__object-list-small` | was un-namespaced |
| `.object-metrics-row` | `object-library__object-metrics-row` | was un-namespaced |
| `.object-name` | `object-library__object-name` | **COLLISION** |
| `.object-name-input` | `object-library__object-name-input` | was un-namespaced |
| `.object-name-input-small` | `object-library__object-name-input-small` | was un-namespaced |
| `.object-name-row` | `object-library__object-name-row` | was un-namespaced |
| `.object-name-small` | `object-library__object-name-small` | was un-namespaced |
| `.object-thumbnail` | `object-library__object-thumbnail` | was un-namespaced |
| `.object-thumbnail-small` | `object-library__object-thumbnail-small` | was un-namespaced |
| `.object-wrapper` | `object-library__object-wrapper` | was un-namespaced |
| `.resize-actions` | `object-library__resize-actions` | **COLLISION** |
| `.resize-anchor-section` | `object-library__resize-anchor-section` | **COLLISION** |
| `.resize-panel` | `object-library__resize-panel` | was un-namespaced |
| `.selected` | `--selected` modifier | **COLLISION**; attach to the element it modifies |
| `.size-field` | `object-library__size-field` | was un-namespaced |
| `.size-inputs` | `object-library__size-inputs` | was un-namespaced |
| `.size-separator` | `object-library__size-separator` | was un-namespaced |
| `.tooltip-details` | `object-library__tooltip-details` | was un-namespaced |
| `.tooltip-name` | `object-library__tooltip-name` | was un-namespaced |

### ObjectSelectModal  ·  block `object-select-modal`
`client/src/components/ObjectSelectModal/ObjectSelectModal.css` — 21 classes

| Old | New | Notes |
| --- | --- | --- |
| `.close-btn` | `modal__close` | shared primitive (R8) |
| `.current` | `--current` modifier | **COLLISION**; attach to the element it modifies |
| `.current-badge` | `object-select-modal__current-badge` | **COLLISION** |
| `.current-object-icon` | `object-select-modal__current-object-icon` | was un-namespaced |
| `.current-object-option` | `object-select-modal__current-object-option` | was un-namespaced |
| `.object-select-card` | `object-select-modal__card` | was un-namespaced |
| `.object-select-details` | `object-select-modal__details` | was un-namespaced |
| `.object-select-divider` | `object-select-modal__divider` | was un-namespaced |
| `.object-select-empty` | `object-select-modal__empty` | was un-namespaced |
| `.object-select-info` | `object-select-modal__info` | was un-namespaced |
| `.object-select-modal` | `object-select-modal` | block root |
| `.object-select-modal-backdrop` | `object-select-modal__backdrop` |  |
| `.object-select-modal-content` | `object-select-modal__content` |  |
| `.object-select-modal-header` | `object-select-modal__header` |  |
| `.object-select-name` | `object-select-modal__name` | was un-namespaced |
| `.object-select-subtitle` | `object-select-modal__subtitle` | was un-namespaced |
| `.object-select-thumb` | `object-select-modal__thumb` | was un-namespaced |
| `.object-select-thumb-canvas` | `object-select-modal__thumb-canvas` | was un-namespaced |
| `.objects-grid` | `object-select-modal__objects-grid` | **COLLISION** |
| `.selected` | `--selected` modifier | **COLLISION**; attach to the element it modifies |
| `.selected-badge` | `object-select-modal__selected-badge` | **COLLISION** |

### PaletteManager  ·  block `palette-manager`
`client/src/components/PaletteManager/PaletteManager.css` — 20 classes

| Old | New | Notes |
| --- | --- | --- |
| `.add-color-btn` | `palette-manager__add-color-btn` | was un-namespaced |
| `.color-swatch` | `palette-manager__color-swatch` | was un-namespaced |
| `.color-swatches` | `palette-manager__color-swatches` | was un-namespaced |
| `.delete-palette-btn` | `palette-manager__delete-palette-btn` | was un-namespaced |
| `.empty-state` | `palette-manager__empty-state` | **COLLISION** |
| `.expand-icon` | `palette-manager__expand-icon` | was un-namespaced |
| `.header-btn` | `palette-manager__header-btn` | **COLLISION** |
| `.new-palette-form` | `palette-manager__new-palette-form` | was un-namespaced |
| `.palette-actions` | `palette-manager__actions` | was un-namespaced |
| `.palette-content` | `palette-manager__content` | was un-namespaced |
| `.palette-count` | `palette-manager__count` | was un-namespaced |
| `.palette-header` | `palette-manager__header` | was un-namespaced |
| `.palette-item` | `palette-manager__item` | was un-namespaced |
| `.palette-list` | `palette-manager__list` | was un-namespaced |
| `.palette-manager` | `palette-manager` | block root |
| `.palette-name` | `palette-manager__name` | was un-namespaced |
| `.palette-name-input` | `palette-manager__name-input` | was un-namespaced |
| `.swatch-bg` | `palette-manager__swatch-bg` | was un-namespaced |
| `.swatch-remove` | `palette-manager__swatch-remove` | was un-namespaced |
| `.swatch-wrapper` | `palette-manager__swatch-wrapper` | was un-namespaced |

### PixelStudioPanel  ·  block `pixel-studio-panel`
`client/src/components/PixelStudioPanel/PixelStudioPanel.css` — 18 classes

| Old | New | Notes |
| --- | --- | --- |
| `.active` | `--active` modifier | **COLLISION**; attach to the element it modifies |
| `.brush-shape-control` | `pixel-studio-panel__brush-shape-control` | **COLLISION** |
| `.brush-size-control` | `pixel-studio-panel__brush-size-control` | **COLLISION** |
| `.brush-size-input-group` | `pixel-studio-panel__brush-size-input-group` | was un-namespaced |
| `.brush-size-value` | `pixel-studio-panel__brush-size-value` | **COLLISION** |
| `.eraser-controls` | `pixel-studio-panel__eraser-controls` | was un-namespaced |
| `.eraser-controls-panel` | `pixel-studio-panel__eraser-controls-panel` | was un-namespaced |
| `.origin-color-control` | `pixel-studio-panel__origin-color-control` | was un-namespaced |
| `.origin-color-input` | `pixel-studio-panel__origin-color-input` | was un-namespaced |
| `.origin-controls` | `pixel-studio-panel__origin-controls` | was un-namespaced |
| `.origin-hint` | `pixel-studio-panel__origin-hint` | was un-namespaced |
| `.origin-position-display` | `pixel-studio-panel__origin-position-display` | was un-namespaced |
| `.origin-position-value` | `pixel-studio-panel__origin-position-value` | was un-namespaced |
| `.panel-content` | `panel__body` | shared primitive (R8) |
| `.panel-header` | `panel__header` | shared primitive (R8) |
| `.pixel-studio-panel` | `pixel-studio-panel` | block root |
| `.shape-btn` | `pixel-studio-panel__shape-btn` | **COLLISION** |
| `.shape-buttons` | `pixel-studio-panel__shape-buttons` | **COLLISION** |

### PreviewModal  ·  block `preview-modal`
`client/src/components/PreviewModal/PreviewModal.css` — 18 classes

| Old | New | Notes |
| --- | --- | --- |
| `.preview-canvas` | `preview-modal__canvas` | was un-namespaced |
| `.preview-canvas-container` | `preview-modal__canvas-container` | was un-namespaced |
| `.preview-fps-control` | `preview-modal__fps-control` | was un-namespaced |
| `.preview-fps-input` | `preview-modal__fps-input` | was un-namespaced |
| `.preview-fps-label` | `preview-modal__fps-label` | was un-namespaced |
| `.preview-fps-slider` | `preview-modal__fps-slider` | was un-namespaced |
| `.preview-frame-counter` | `preview-modal__frame-counter` | was un-namespaced |
| `.preview-info` | `preview-modal__info` | was un-namespaced |
| `.preview-loading` | `preview-modal__loading` | was un-namespaced |
| `.preview-loading-spinner` | `preview-modal__loading-spinner` | was un-namespaced |
| `.preview-modal` | `preview-modal` | block root |
| `.preview-modal-close` | `preview-modal__close` |  |
| `.preview-modal-content` | `preview-modal__content` |  |
| `.preview-modal-controls` | `preview-modal__controls` |  |
| `.preview-modal-header` | `preview-modal__header` |  |
| `.preview-modal-overlay` | `preview-modal__overlay` |  |
| `.preview-modal-title` | `preview-modal__title` |  |
| `.preview-size` | `preview-modal__size` | was un-namespaced |

### ProjectSelectModal  ·  block `project-select-modal`
`client/src/components/ProjectSelectModal/ProjectSelectModal.css` — 20 classes

| Old | New | Notes |
| --- | --- | --- |
| `.cancel-btn` | `btn btn--neutral` | shared primitive (R8) |
| `.close-btn` | `modal__close` | shared primitive (R8) |
| `.create-btn` | `btn btn--primary` | shared primitive (R8) |
| `.create-project-form` | `project-select-modal__create-project-form` | was un-namespaced |
| `.current` | `--current` modifier | **COLLISION**; attach to the element it modifies |
| `.current-badge` | `project-select-modal__current-badge` | **COLLISION** |
| `.delete-btn` | `btn btn--danger` | shared primitive (R8) |
| `.error-message` | `project-select-modal__error-message` | **COLLISION** |
| `.form-buttons` | `project-select-modal__form-buttons` | was un-namespaced |
| `.modal-content` | `modal__body` | shared primitive (R8) |
| `.modal-footer` | `modal__footer` | shared primitive (R8) |
| `.modal-header` | `modal__header` | shared primitive (R8) |
| `.modal-overlay` | `modal__overlay` | shared primitive (R8) |
| `.new-project-btn` | `project-select-modal__new-project-btn` | was un-namespaced |
| `.plus-icon` | `project-select-modal__plus-icon` | was un-namespaced |
| `.project-icon` | `project-select-modal__project-icon` | was un-namespaced |
| `.project-item` | `project-select-modal__project-item` | was un-namespaced |
| `.project-list` | `project-select-modal__project-list` | was un-namespaced |
| `.project-name` | `project-select-modal__project-name` | **COLLISION** |
| `.project-select-modal` | `project-select-modal` | block root |

### ReferenceImageModal  ·  block `reference-image-modal`
`client/src/components/ReferenceImageModal/ReferenceImageModal.css` — 28 classes

| Old | New | Notes |
| --- | --- | --- |
| `.cancel-btn` | `btn btn--neutral` | shared primitive (R8) |
| `.canvas-area` | `reference-image-modal__canvas-area` | **COLLISION** |
| `.canvas-pan-container` | `reference-image-modal__canvas-pan-container` | was un-namespaced |
| `.change-image-btn` | `reference-image-modal__change-image-btn` | was un-namespaced |
| `.clear-image-btn` | `reference-image-modal__clear-image-btn` | was un-namespaced |
| `.close-btn` | `modal__close` | shared primitive (R8) |
| `.confirm-btn` | `btn btn--primary` | shared primitive (R8) |
| `.dragging` | `--dragging` modifier | **COLLISION**; attach to the element it modifies |
| `.editor-toolbar` | `reference-image-modal__editor-toolbar` | was un-namespaced |
| `.image-editor` | `reference-image-modal__image-editor` | was un-namespaced |
| `.image-info` | `reference-image-modal__image-info` | was un-namespaced |
| `.modal-actions` | `modal__footer` | shared primitive (R8) |
| `.modal-body` | `modal__body` | shared primitive (R8) |
| `.modal-footer` | `modal__footer` | shared primitive (R8) |
| `.modal-header` | `modal__header` | shared primitive (R8) |
| `.modal-overlay` | `modal__overlay` | shared primitive (R8) |
| `.reference-modal` | `reference-image-modal__reference-modal` | was un-namespaced |
| `.reset-btn` | `reference-image-modal__reset-btn` | was un-namespaced |
| `.select-all-btn` | `reference-image-modal__select-all-btn` | was un-namespaced |
| `.selection-hint` | `reference-image-modal__selection-hint` | was un-namespaced |
| `.selection-info` | `reference-image-modal__selection-info` | **COLLISION** |
| `.toolbar-btn` | `reference-image-modal__toolbar-btn` | was un-namespaced |
| `.upload-hint` | `reference-image-modal__upload-hint` | was un-namespaced |
| `.upload-icon` | `reference-image-modal__upload-icon` | was un-namespaced |
| `.upload-text` | `reference-image-modal__upload-text` | was un-namespaced |
| `.upload-zone` | `reference-image-modal__upload-zone` | was un-namespaced |
| `.zoom-controls` | `reference-image-modal__zoom-controls` | was un-namespaced |
| `.zoom-level` | `reference-image-modal__zoom-level` | was un-namespaced |

### ReferenceImagePanel  ·  block `reference-image-panel`
`client/src/components/ReferenceImagePanel/ReferenceImagePanel.css` — 22 classes

| Old | New | Notes |
| --- | --- | --- |
| `.active` | `--active` modifier | **COLLISION**; attach to the element it modifies |
| `.dragging` | `--dragging` modifier | **COLLISION**; attach to the element it modifies |
| `.minimized` | `--minimized` modifier | **COLLISION**; attach to the element it modifies |
| `.ref-box-btn` | `reference-image-panel__ref-box-btn` | **COLLISION** |
| `.ref-box-btn-bottom` | `reference-image-panel__ref-box-btn-bottom` | **COLLISION** |
| `.ref-box-btn-decrease` | `reference-image-panel__ref-box-btn-decrease` | was un-namespaced |
| `.ref-box-btn-increase` | `reference-image-panel__ref-box-btn-increase` | was un-namespaced |
| `.ref-box-btn-left` | `reference-image-panel__ref-box-btn-left` | **COLLISION** |
| `.ref-box-btn-right` | `reference-image-panel__ref-box-btn-right` | **COLLISION** |
| `.ref-box-btn-top` | `reference-image-panel__ref-box-btn-top` | **COLLISION** |
| `.reference-canvas-wrapper` | `reference-image-panel__reference-canvas-wrapper` | **COLLISION** |
| `.reference-image-content` | `reference-image-panel__content` | was un-namespaced |
| `.reference-image-header` | `reference-image-panel__header` | was un-namespaced |
| `.reference-image-info` | `reference-image-panel__info` | was un-namespaced |
| `.reference-image-minimize` | `reference-image-panel__minimize` | was un-namespaced |
| `.reference-image-panel` | `reference-image-panel` | block root |
| `.reference-image-preview` | `reference-image-panel__preview` | was un-namespaced |
| `.reference-image-title` | `reference-image-panel__title` | was un-namespaced |
| `.reference-nav-btn` | `reference-image-panel__reference-nav-btn` | **COLLISION** |
| `.reference-nav-group` | `reference-image-panel__reference-nav-group` | was un-namespaced |
| `.reference-navigation` | `reference-image-panel__reference-navigation` | **COLLISION** |
| `.reference-trace-btn` | `reference-image-panel__reference-trace-btn` | was un-namespaced |

### ResizeModal  ·  block `resize-modal`
`client/src/components/ResizeModal/ResizeModal.css` — 13 classes

| Old | New | Notes |
| --- | --- | --- |
| `.resize-modal` | `resize-modal` | block root |
| `.resize-modal-actions` | `resize-modal__actions` |  |
| `.resize-modal-anchor` | `resize-modal__anchor` |  |
| `.resize-modal-anchor-label` | `resize-modal__anchor-label` |  |
| `.resize-modal-apply` | `resize-modal__apply` |  |
| `.resize-modal-backdrop` | `resize-modal__backdrop` |  |
| `.resize-modal-cancel` | `resize-modal__cancel` |  |
| `.resize-modal-close` | `resize-modal__close` |  |
| `.resize-modal-content` | `resize-modal__content` |  |
| `.resize-modal-field` | `resize-modal__field` |  |
| `.resize-modal-header` | `resize-modal__header` |  |
| `.resize-modal-inputs` | `resize-modal__inputs` |  |
| `.resize-modal-separator` | `resize-modal__separator` |  |

### RightSidebarTopControls  ·  block `right-sidebar-top-controls`
`client/src/components/RightSidebarTopControls/RightSidebarTopControls.css` — 17 classes

| Old | New | Notes |
| --- | --- | --- |
| `.active` | `--active` modifier | **COLLISION**; attach to the element it modifies |
| `.compact-btn` | `right-sidebar-top-controls__compact-btn` | was un-namespaced |
| `.compact-control` | `right-sidebar-top-controls__compact-control` | was un-namespaced |
| `.compact-label` | `right-sidebar-top-controls__compact-label` | was un-namespaced |
| `.compact-panel` | `right-sidebar-top-controls__compact-panel` | was un-namespaced |
| `.compact-panel-content` | `right-sidebar-top-controls__compact-panel-content` | was un-namespaced |
| `.compact-row` | `right-sidebar-top-controls__compact-row` | was un-namespaced |
| `.compact-segment` | `right-sidebar-top-controls__compact-segment` | was un-namespaced |
| `.compact-segmented` | `right-sidebar-top-controls__compact-segmented` | was un-namespaced |
| `.compact-slider` | `slider__input` | shared primitive (R8) |
| `.compact-slider-row` | `right-sidebar-top-controls__compact-slider-row` | was un-namespaced |
| `.compact-toggle` | `right-sidebar-top-controls__compact-toggle` | **COLLISION** |
| `.compact-toggle-label` | `right-sidebar-top-controls__compact-toggle-label` | was un-namespaced |
| `.compact-toggle-slider` | `right-sidebar-top-controls__compact-toggle-slider` | was un-namespaced |
| `.compact-value` | `right-sidebar-top-controls__compact-value` | was un-namespaced |
| `.panel-header` | `panel__header` | shared primitive (R8) |
| `.right-sidebar-top-controls` | `right-sidebar-top-controls` | block root |

### Toolbar  ·  block `toolbar`
`client/src/components/Toolbar/Toolbar.css` — 27 classes

| Old | New | Notes |
| --- | --- | --- |
| `.active` | `--active` modifier | **COLLISION**; attach to the element it modifies |
| `.brush-size-control` | `toolbar__brush-size-control` | **COLLISION** |
| `.brush-size-value` | `toolbar__brush-size-value` | **COLLISION** |
| `.clear-reference-btn` | `toolbar__clear-reference-btn` | was un-namespaced |
| `.has-reference` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.light-grid-active` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.mode-btn` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.move-all-toggle` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.reference-btn` | `toolbar__reference-btn` | was un-namespaced |
| `.reference-group` | `toolbar__reference-group` | was un-namespaced |
| `.shape-mode-group` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.studio-mode-btn` | `toolbar__studio-mode-btn` | was un-namespaced |
| `.studio-mode-section` | `toolbar__studio-mode-section` | was un-namespaced |
| `.studio-mode-toggle` | `toolbar__studio-mode-toggle` | was un-namespaced |
| `.toggle-label` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.toggle-slider` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.tool-btn` | `toolbar__tool-btn` | was un-namespaced |
| `.tool-hotkey` | `toolbar__tool-hotkey` | was un-namespaced |
| `.tool-icon` | `toolbar__tool-icon` | was un-namespaced |
| `.toolbar` | `toolbar` | block root |
| `.toolbar-divider` | `toolbar__divider` |  |
| `.toolbar-fixed-tooltip` | `toolbar__fixed-tooltip` |  |
| `.toolbar-group` | `toolbar__group` |  |
| `.toolbar-section` | `toolbar__section` |  |
| `.trace-btn` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.trace-hint` | _(delete — dead)_ | dead CSS; remove before conversion |
| `.trace-hint-text` | _(delete — dead)_ | dead CSS; remove before conversion |

### VariantSelectModal  ·  block `variant-select-modal`
`client/src/components/VariantSelectModal/VariantSelectModal.css` — 28 classes

| Old | New | Notes |
| --- | --- | --- |
| `.add-options` | `variant-select-modal__add-options` | was un-namespaced |
| `.add-variant-btn` | `variant-select-modal__add-variant-btn` | **COLLISION** |
| `.add-variant-section` | `variant-select-modal__add-variant-section` | was un-namespaced |
| `.anchor-label` | `variant-select-modal__anchor-label` | was un-namespaced |
| `.close-btn` | `modal__close` | shared primitive (R8) |
| `.delete` | `--danger` modifier | **COLLISION**; attach to the element it modifies |
| `.resize-actions` | `variant-select-modal__resize-actions` | **COLLISION** |
| `.resize-anchor-section` | `variant-select-modal__resize-anchor-section` | **COLLISION** |
| `.resize-dialog` | `variant-select-modal__resize-dialog` | was un-namespaced |
| `.resize-dialog-backdrop` | `variant-select-modal__resize-dialog-backdrop` | was un-namespaced |
| `.resize-inputs` | `variant-select-modal__resize-inputs` | was un-namespaced |
| `.selected` | `--selected` modifier | **COLLISION**; attach to the element it modifies |
| `.selected-badge` | `variant-select-modal__selected-badge` | **COLLISION** |
| `.variant-action-btn` | `variant-select-modal__variant-action-btn` | was un-namespaced |
| `.variant-actions` | `variant-select-modal__variant-actions` | was un-namespaced |
| `.variant-card` | `variant-select-modal__variant-card` | was un-namespaced |
| `.variant-group-name` | `variant-select-modal__variant-group-name` | was un-namespaced |
| `.variant-info` | `variant-select-modal__variant-info` | was un-namespaced |
| `.variant-modal` | `variant-select-modal__variant-modal` | was un-namespaced |
| `.variant-modal-backdrop` | `variant-select-modal__backdrop` | was un-namespaced |
| `.variant-modal-content` | `variant-select-modal__content` | was un-namespaced |
| `.variant-modal-header` | `variant-select-modal__header` | was un-namespaced |
| `.variant-name` | `variant-select-modal__variant-name` | was un-namespaced |
| `.variant-name-input` | `variant-select-modal__variant-name-input` | was un-namespaced |
| `.variant-size` | `variant-select-modal__variant-size` | was un-namespaced |
| `.variant-thumb` | `variant-select-modal__variant-thumb` | **COLLISION** |
| `.variant-thumb-canvas` | `variant-select-modal__variant-thumb-canvas` | was un-namespaced |
| `.variants-grid` | `variant-select-modal__variants-grid` | was un-namespaced |
---

## Scoping recommendation

**Recommendation: keep plain global CSS with BEM discipline. Do NOT adopt CSS Modules.** Enforce the discipline with stylelint rather than with the bundler.

### Why not CSS Modules

| Consideration | Measured evidence | Verdict |
| --- | --- | --- |
| **Does BEM already solve the collision problem?** | Yes, completely. All 64 collisions are name collisions; after R1–R3 every class is `block__element--modifier` where `block` is the component name, so two components cannot produce the same class. | CSS Modules would solve the same problem twice. |
| **Migration cost** | CSS Modules requires renaming 34 files to `*.module.css`, changing 34 import statements, **and rewriting all 81 dynamic `className` construction sites** from `` `layer-item ${x ? 'selected' : ''}` `` to `` `${s.layerItem} ${x ? s.selected : ''}` ``. | The 81 dynamic sites make this the expensive option. |
| **The 4 runtime-concatenated class sites** | `AnchorGrid.tsx:121`, `ColorPicker.tsx:616,621`, `Header.tsx:298`, `Header.tsx:173` build names from a variable. | **CSS Modules breaks these outright.** `` `arrow-${direction}` `` cannot be looked up in the module map without an index type and a fallback. Each needs a hand-written lookup object. This is a real, concrete regression risk. |
| **Interop with the 5 shared primitives (R8)** | `btn`, `modal`, `panel`, `slider`, `confirm-dialog` are used by 9, 9, 4, 3 and 4 components respectively. | CSS Modules requires `composes:` or `:global()` for every one. Both are friction; `:global()` reopens the exact global namespace we are trying to leave. |
| **Global element styling in `index.css`** | `button`, `input`, `select`, `input[type=range]`, `::-webkit-scrollbar` are styled globally and every component depends on it. | Must stay global regardless. A hybrid (global reset + modular components) is the *most* confusing outcome, not the least. |
| **Debuggability** | Today a class in DevTools greps directly to its rule. | CSS Modules yields `_layerItem_1a2b3`. With BEM, `layer-panel__item` still greps to exactly one place — arguably better than today. |
| **Storybook** | Storybook 8 supports both transparently via the Vite builder. | Neutral — not a deciding factor. |
| **Tooling enforcement** | stylelint's `selector-class-pattern` can validate BEM mechanically (regex in R11). | BEM is *machine-enforceable*; CSS Modules is enforced by the bundler but permits any naming, so it does not give the consistency this refresh wants. |

### The one thing CSS Modules gives that BEM does not

**Compile-time detection of a typo'd class.** With BEM, `className="layer-panel__itm"` silently renders unstyled. With CSS Modules, `s.itm` is `undefined` and TypeScript flags it if `typescript-plugin-css-modules` is configured.

**Mitigation without CSS Modules:** the "Missing CSS" check already built for this audit (23 tokens found, 8 real gaps) can run in CI as a script. That closes the gap at a fraction of the migration cost, and it also catches the *reverse* direction (dead CSS) which CSS Modules does not.

### Recommended structure

```
client/src/
  styles/
    tokens.css          # :root custom properties ONLY (colors, space, type, z, …)
    reset.css           # * box-sizing, html/body, scrollbars, element defaults
    blocks/
      btn.css           # shared primitive blocks (R8)
      modal.css
      panel.css
      slider.css
      confirm-dialog.css
    index.css           # @import the four above, in that order. Nothing else.
  components/
    LayerPanel/
      LayerPanel.tsx    # import "./LayerPanel.css";  (unchanged pattern)
      LayerPanel.css    # declares exactly the `layer-panel` block
```

`index.css` becomes an import manifest. `main.tsx` continues to `import './index.css'` — no change to the entry point.

**Import-order guarantee:** because `index.css` is imported from `main.tsx` *after* `App.tsx`, its content currently lands **last** in the bundle (verified: `.panel-header` at byte 157853 out of 158560). Once `index.css` only contains tokens, reset and primitives, that ordering becomes actively wrong — component rules should override primitives, not the reverse. **Move the `import './index.css'` to the top of `main.tsx`, before `import App`.** This is a one-line change and is required for R8 to behave correctly.

---

## Storybook global-style requirements

For a component to render in Storybook exactly as it does in the app, `.storybook/preview.ts` must load everything the app loads outside the component tree. Measured list:

| # | Requirement | Source in the app today | Why it is required |
| --- | --- | --- | --- |
| 1 | **Design tokens** (`:root` custom properties) | `client/src/index.css:1–37` | **~950 `var()` references across all stylesheets.** Without this every component renders with unset colors, radii, fonts and transitions. Non-negotiable. |
| 2 | **The reset** (`* { box-sizing }`, `html, body, #root`) | `client/src/index.css:39–59` | Components assume `box-sizing:border-box` throughout. Without it, every padded element is the wrong size. |
| 3 | **Global element styling** — `button`, `input`, `select`, `input[type=number]`, `input[type=range]` + its `::-webkit-slider-thumb` | `client/src/index.css:80–162` | Heavily depended upon. `ColorPicker`, `LightControl`, `RightSidebarTopControls`, `Toolbar`, `PixelStudioPanel` all render `<input type="range">` whose *entire* track and thumb styling comes from `index.css`, not from the component. **A `ColorPicker` story without this renders native OS sliders.** |
| 4 | **Custom scrollbars** (`::-webkit-scrollbar*`) | `client/src/index.css:61–78` | Cosmetic, but any story with a scroll container will look wrong without it. |
| 5 | **Web fonts — `Outfit` + `JetBrains Mono`** | ⚠️ **`client/index.html:9–10`, a `<link>` tag — NOT in any CSS file** | `--font-sans` and `--font-mono` name these families. Storybook does **not** read `client/index.html`, so fonts will silently fall back to `system-ui`/`monospace`. **44 declarations use `var(--font-mono)`.** Must be added to `.storybook/preview-head.html` (or self-hosted). This is the single easiest thing to miss. |
| 6 | **Dark background** | `body { background: var(--bg-primary) }` — `index.css:51–56` | The entire palette is dark-on-dark (`--bg-primary:#0a0a0f`, `--text-primary:#e8e8f0`). **On Storybook's default white canvas every component is near-invisible.** Set `parameters.backgrounds.default` to the token value and register a `dark` background. |
| 7 | **Shared primitive blocks** (post-R8) | `styles/blocks/*.css` | Once `btn`/`modal`/`panel`/`slider`/`confirm-dialog` are extracted, a component story that renders a `.btn` needs them loaded. |
| 8 | **`#root` sizing** | `index.css:45–49` (`html, body, #root { height:100% }`) | Layout-level stories (`App`, `FrameTimeline`) assume a full-height ancestor. Needs a decorator supplying an equivalent container. |

**Concrete `preview.ts`:**

```ts
import "../src/styles/tokens.css";
import "../src/styles/reset.css";
import "../src/styles/blocks/btn.css";
import "../src/styles/blocks/modal.css";
import "../src/styles/blocks/panel.css";
import "../src/styles/blocks/slider.css";
import "../src/styles/blocks/confirm-dialog.css";
// or simply: import "../src/index.css";  once index.css is the manifest described above

export const parameters = {
  backgrounds: {
    default: "app",
    values: [{ name: "app", value: "#0a0a0f" }], // === --bg-primary
  },
  layout: "fullscreen",
};
```

**`.storybook/preview-head.html`** (requirement 5):
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### Storybook-specific hazards found in this audit

- **14 modals use `position:fixed`.** In a story they will escape the canvas and cover the whole Storybook iframe. Modal stories need a decorator that either renders the modal inline or constrains it. This is a *taxonomy* decision — flagged to task 07 in Open questions.
- **`z-index` up to 99999** will sit above Storybook's own UI in some addon panels. The proposed scale (max 900) fixes this as a side effect.
- **Two components depend on a *different* component's CSS being loaded** (measured, see Collisions G3/G4): `RightSidebarTopControls`'s `.compact-slider` is styled almost entirely by `ColorPicker.css`, and `PixelStudioPanel`'s `.shape-btn` by `LightingStudioPanel.css`. **Their stories will render broken today** and would appear to be a Storybook configuration problem when they are actually a pre-existing collision. Converting G3 and G4 before writing their stories avoids a wild-goose chase.

---

## Enforcement (stylelint)

**Recommendation: yes, add stylelint.** Without it the convention decays: the codebase already demonstrates what happens over ~7 months without a linter (64 collisions, 23 `!important`, `z-index:99999`, 172 colour literals). The rules below are all mechanically checkable, and each one directly encodes a defect this audit measured.

Install (Bun):

```sh
cd client && bun add -D stylelint stylelint-config-standard stylelint-declaration-strict-value
```

`client/.stylelintrc.json`:

```json
{
  "extends": ["stylelint-config-standard"],
  "plugins": ["stylelint-declaration-strict-value"],
  "rules": {
    "selector-class-pattern": [
      "^[a-z][a-z0-9]*(-[a-z0-9]+)*(__[a-z][a-z0-9]*(-[a-z0-9]+)*)?(--[a-z][a-z0-9]*(-[a-z0-9]+)*)?$",
      {
        "message": "Class must be BEM: block, block__element, block--modifier, or block__element--modifier (see REFRESH-PREP/findings/css.md R1-R3)",
        "resolveNestedSelectors": true
      }
    ],
    "selector-max-class": [2, { "message": "Max 2 class compounds (R5). A second compound is only for a parent's state changing a child." }],
    "selector-max-compound-selectors": 2,
    "selector-max-id": 0,
    "selector-max-type": [0, { "ignoreTypes": ["/^input$/", "/^button$/", "/^canvas$/"] }],
    "declaration-no-important": true,
    "scale-unlimited/declaration-strict-value": [
      ["/color$/", "background-color", "fill", "stroke", "z-index", "box-shadow", "border-radius", "font-family", "transition-duration"],
      {
        "ignoreValues": ["transparent", "inherit", "currentColor", "none", "0", "50%", "auto", "initial", "unset"],
        "message": "Use a design token (var(--…)) — see the token set in REFRESH-PREP/findings/css.md"
      }
    ],
    "keyframes-name-pattern": [
      "^[a-z][a-z0-9]*(-[a-z0-9]+)+$",
      { "message": "@keyframes must be prefixed with its block name (fadeIn is currently defined 6 times globally)" }
    ],
    "no-descending-specificity": true,
    "color-hex-length": "short",
    "declaration-block-no-duplicate-properties": true,
    "no-duplicate-selectors": true
  },
  "overrides": [
    {
      "files": ["src/styles/reset.css", "src/index.css"],
      "rules": {
        "selector-max-type": null,
        "selector-max-id": null,
        "selector-class-pattern": null,
        "scale-unlimited/declaration-strict-value": null
      }
    },
    {
      "files": ["src/styles/tokens.css"],
      "rules": { "scale-unlimited/declaration-strict-value": null }
    }
  ]
}
```

`client/package.json` scripts:

```json
"lint:css": "stylelint \"src/**/*.css\"",
"lint:css:fix": "stylelint \"src/**/*.css\" --fix"
```

### What each rule prevents, tied to a measured defect

| Rule | Defect it prevents | Count today |
| --- | --- | ---: |
| `selector-class-pattern` | bare generic classes → collisions | 64 collisions, 31 critical |
| `selector-max-class` / `-compound-selectors` | descendant-chain creep | max depth 3 today; keeps it ≤ 2 |
| `selector-max-id` | `#root`-style specificity spikes | 1 (allowed via override) |
| `selector-max-type` | global element styling leaking out of the reset | element rules currently only in `index.css` — locks that in |
| `declaration-no-important` | `!important` used to win collisions | 23 (15 in `Toolbar.css`) |
| `declaration-strict-value` on colour | hard-coded colour literals | 585 occurrences, 172 distinct |
| `declaration-strict-value` on `z-index` | the `99999` escalation war | 15 distinct values |
| `declaration-strict-value` on `border-radius` | literals duplicating existing tokens | 32 |
| `declaration-strict-value` on `font-family` | `'Courier New'` escapees | 2 |
| `keyframes-name-pattern` | global keyframes collisions | `fadeIn` ×6, `modalSlideIn` ×3, `spin` ×2 |
| `no-duplicate-selectors` | in-file copy-paste | — |

### Rollout order (important)

Turning all of this on at once produces thousands of errors and the team disables it. Enable in three stages, matching the work items:

1. **After tokenization:** enable `declaration-strict-value`, `keyframes-name-pattern`, `color-hex-length`, `declaration-no-important`.
2. **After each component's BEM conversion:** add that file to a stylelint `files` allowlist. Grow the allowlist per conversion so a converted file can never regress.
3. **After the last conversion:** drop the allowlist and lint `src/**/*.css` wholesale, then add `lint:css` to CI.

### Companion script (catches what stylelint cannot)

stylelint sees only CSS. The class-usage checks in this audit — dead CSS and missing CSS — require reading `.tsx` too. Land the audit script as `client/scripts/check-classes.mjs` (it must exit non-zero on a new orphan) and run it in CI. It must reproduce the `${…}`-recursion and prefix-concatenation handling described in *Orphans*, or it will produce false positives on the 12 dynamically-built classes.

---

## Conversion order & parallelism

Two hard constraints, both derived from measurement:

1. A component that shares a bare class with another component **cannot be converted alone** — renaming one side removes the definition the other side is silently relying on. The 9 collision groups (G1–G9) are the atomic units.
2. Shared primitives must exist **before** the components that use them are converted, or each converting agent will re-invent them.

### Dependency-ordered phases

**Phase 0 — Prerequisites (must be sequential, must be first)**

| Step | Why it must precede everything |
| --- | --- |
| 0a. Delete the 60 dead classes | Removes 7.5% of the conversion surface. Also removes `.modal-backdrop`, `.panel-toggle` and the whole `LayerPanel` confirm-dialog block, which would otherwise be converted for nothing. |
| 0b. Define the 6 undefined custom properties | 76 declarations currently render wrong. Any visual baseline captured before this is a baseline of a bug. |
| 0c. Extract the token set into `styles/tokens.css` and substitute literals | Every subsequent conversion touches colours; doing it per-component means 34 agents each making token decisions. Doing it once means they make none. |
| 0d. Move `import './index.css'` to the top of `main.tsx` | Required for shared primitives to be overridable by components (see *Scoping*). |
| 0e. Rename the 3 colliding `@keyframes` | Independent of class conversion; cheap; removes a whole class of bug. |

**Phase 1 — Shared primitives (parallel, 5 agents, after Phase 0)**

Each primitive is independent of the others. All must land before Phase 2.

| Agent | Primitive | Extracted from |
| --- | --- | --- |
| P-1 | `btn` | `.cancel-btn`/`.confirm-btn`/`.create-btn`/`.delete-btn`/`.apply-btn`/`.restore-btn` + `button.primary`/`button.danger` |
| P-2 | `modal` | `.modal-overlay`/`.modal-header`/`.modal-content`/`.modal-footer`/`.close-btn` |
| P-3 | `panel` | `index.css`'s `.panel`/`.panel-header`/`.panel-content` |
| P-4 | `slider` | `.compact-slider`/`.slider-input`/`.slider-label`/`.slider-row`/`.hue-slider` |
| P-5 | `confirm-dialog` | the 7 duplicated `.delete-confirm-*` + `LayerPanel`'s dead `.confirm-modal-*` + `BrowseBackupsModal`'s `.confirm-*` |

**Phase 2 — Collision groups (must convert as units; groups are parallel with each other)**

| Group | Components (convert together) | Shared classes | Effort |
| --- | --- | ---: | --- |
| G1 | `Canvas` + `ReferenceImagePanel` | 8 | M |
| G2 | `AddVariantModal` + `ObjectLibrary` | 7 | M (both are large) |
| G3 | `ColorPicker` + `LightControl` + `RightSidebarTopControls` | 5 | M |
| G4 | `Toolbar` + `LightingStudioPanel` + `PixelStudioPanel` | 6 | M (Toolbar has 15 `!important` to unwind) |
| G5 | `ReferenceImageModal` + `ProjectSelectModal` + `BrowseBackupsModal` | 6 | M |
| G6 | `CopyFromModal` + `ObjectSelectModal` (+`ObjectLibrary` from G2) | 5 | S — **but G2 must land first** |
| G7 | `ObjectLibrary` + `VariantSelectModal` + `ExportPreviewModal` | 3 | S — **G2 must land first** |
| G8 | `App` + `ReferenceImageModal` | 1 | S — **G5 must land first** |
| G9 | `index.css` + `LayerPanel` + `PixelStudioPanel` + `RightSidebarTopControls` + `LightingStudioPanel` | 3 | resolved by primitive P-3 |

⚠️ **`ObjectLibrary` appears in G2, G6 and G7; `RightSidebarTopControls` in G3 and G9; `PixelStudioPanel` in G4 and G9; `ReferenceImageModal` in G5 and G8.** These four components are **serialization points** — they cannot be worked on by two agents at once. Safe ordering:

```
Phase 0 (sequential)
   ↓
Phase 1: P-1 P-2 P-3 P-4 P-5           (5 parallel)
   ↓
Phase 2a: G1  G2  G3  G4  G5           (5 parallel — no shared component)
   ↓
Phase 2b: G6  G7  G8                   (3 parallel — each depends on a 2a group)
   ↓
Phase 3: the 15 independent components  (fully parallel, any grouping)
```

**Phase 3 — Independent components (fully parallel, no collisions, any order)**

These 15 stylesheets share **zero** classes with any other file. Each is a self-contained one-agent task.

| Component | Classes | Effort |
| --- | ---: | --- |
| `FrameTimeline` (+`FramesView`,`TimelineView`,`VariantView`) | 94 | **L** — largest stylesheet, 4 consumer components |
| `AIInterpolateModal` | 83 | **L** |
| `Header` | 41 | M |
| `FrameReferencePanel` | 26 | S |
| `ObjectSelectModal` *(after G6)* | 21 | S |
| `EdgeInterpolateModal` | 21 | S |
| `HeightMapModal` | 20 | S |
| `PaletteManager` | 20 | S |
| `FrameTagsModal` | 19 | S |
| `PreviewModal` | 18 | S |
| `LightingCanvas` | 17 | S |
| `AnchorGrid` | 15 | S — has 4 dynamic `arrow-${direction}` classes |
| `LayerColors` | 13 | S |
| `ResizeModal` | 13 | S |
| `NormalPicker` | 6 | S |

**Total: 5 prerequisite steps + 5 primitives + 8 collision groups + 15 independent components.**

### What makes a conversion "safe to parallelize"

An agent converting component X may proceed alone iff:
1. No class in `X.css` appears in the *Collisions* table, **or** every collision partner is already converted.
2. All 5 shared primitives exist.
3. Phase 0 is complete.

Condition 1 is mechanically checkable against the collision table in this document — a conversion agent should verify it before starting rather than trusting the phase assignment.

---

## Proposed work items

Sized to roughly one agent-session each. `Touches` lists explicit files/directories so task 09 can detect collisions between parallel tasks.

| # | Title | Touches (explicit files/dirs) | Depends on | Effort | Risk |
| --- | --- | --- | --- | --- | --- |
| **CSS-01** | Delete the 60 dead CSS classes | `client/src/index.css` · `client/src/App.css` · `client/src/components/Toolbar/Toolbar.css` · `client/src/components/Canvas/Canvas.css` · `client/src/components/FrameTimeline/FrameTimeline.css` · `client/src/components/AIInterpolateModal/AIInterpolateModal.css` · `client/src/components/LayerPanel/LayerPanel.css` · `client/src/components/Header/Header.css` · `client/src/components/FrameReferencePanel/FrameReferencePanel.css` | — | **S** | A class is deleted that is actually built dynamically. **Detection:** the 12 dynamically-constructed classes are enumerated in *Orphans*; re-run the orphan script after the change and diff. Visual smoke-test of AnchorGrid, ColorPicker RGB sliders, Header save/export status. |
| **CSS-02** | Define the 6 undefined custom properties (`--text-tertiary`, `--border-secondary`, `--accent-hover`, `--bg-active`, `--text-on-accent`, `--danger`) | `client/src/index.css` | — | **S** | 76 declarations change appearance — **that is the point** (they are currently broken), but it is a visible diff. **Detection:** grep for `var(--)` with no matching definition must return empty; screenshot ProjectSelectModal cancel button, `.shape-btn.active`, `.ref-box-btn:active`. |
| **CSS-03** | Rename the 3 colliding `@keyframes` (`fadeIn`×6, `modalSlideIn`×3, `spin`×2) to block-prefixed names | `client/src/index.css` · `client/src/App.css` · `client/src/components/EdgeInterpolateModal/EdgeInterpolateModal.css` · `client/src/components/HeightMapModal/HeightMapModal.css` · `client/src/components/PreviewModal/PreviewModal.css` · `client/src/components/ProjectSelectModal/ProjectSelectModal.css` · `client/src/components/ReferenceImageModal/ReferenceImageModal.css` | — | **S** | An `animation:` shorthand still references the old name → animation silently stops. **Detection:** grep every `animation`/`animation-name` value against the set of defined `@keyframes` names; must be a subset. Manually open each of the 5 modals and confirm the entrance animation plays. |
| **CSS-04** | Author `styles/tokens.css`: the full token set (colours + spacing + type + radii + shadows + transitions + z-index) | **new:** `client/src/styles/tokens.css` · `client/src/index.css` (extract `:root` out) | CSS-02 | **M** | Purely additive if no substitution happens yet; the risk lands in CSS-05/06. **Detection:** `bunx vite build` succeeds; bundle `:root` block contains every token. |
| **CSS-05** | Substitute colour, radius, transition and font literals with tokens across all 34 stylesheets | all 34 `.css` files under `client/src` | CSS-04 | **L** — split into 3 sequential sub-items by property family (colour / radius+transition / font+shadow) if it exceeds one session | Highest visual-regression risk in the whole plan: 585 colour + 32 radius + 30 transition substitutions. Cluster A/B/C/E deliberately *collapse* near-identical values, so some pixels genuinely change. **Detection:** per-file screenshot diff; `bunx stylelint` with `declaration-strict-value` enabled must pass. **Do this against a captured visual baseline, not from memory.** |
| **CSS-06** | Replace all 15 numeric `z-index` values with the proposed `--z-*` scale | `client/src/App.css` + the 20 component `.css` files listed in the z-index inventory | CSS-04 | **M** | Stacking order regresses; a modal renders behind its backdrop or a tooltip disappears. **Detection:** manual pass opening every one of the 14 modals, both nested confirm dialogs, both tooltips, and the view-mode dropdown, in that order. This one **requires** manual verification — no automated check covers stacking. |
| **CSS-07** | Move `import './index.css'` above `import App` in `main.tsx`; restructure `index.css` into an import manifest (`tokens` → `reset` → `blocks`) | `client/src/main.tsx` · `client/src/index.css` · **new:** `client/src/styles/reset.css` | CSS-04 | **S** | Reverses the emission order of `index.css` relative to component CSS. **The `.panel-header`/`.panel-content` overrides currently depend on `index.css` landing last** — after this change component rules win instead. **Detection:** verify `.panel-header` renders identically in LayerPanel, PixelStudioPanel, RightSidebarTopControls; diff the built CSS ordering. |
| **CSS-08** | Extract shared primitive block `btn` | **new:** `client/src/styles/blocks/btn.css` · `client/src/index.css` · consumers: `ObjectLibrary.css`, `ProjectSelectModal.css`, `ReferenceImageModal.css`, `AddVariantModal.css`, `LayerPanel.css`, `BrowseBackupsModal.css`, `VariantSelectModal.css` | CSS-07 | **M** | Resolves the `.cancel-btn`/`.confirm-btn`/`.create-btn` collisions — **components currently receiving the *wrong* button styling will change appearance to the correct one.** Expected, but must be reviewed as intentional. **Detection:** screenshot every dialog footer. |
| **CSS-09** | Extract shared primitive block `modal` | **new:** `client/src/styles/blocks/modal.css` · consumers: `ReferenceImageModal.css`, `ProjectSelectModal.css`, `BrowseBackupsModal.css`, `AddVariantModal.css`, `CopyFromModal.css`, `EdgeInterpolateModal.css`, `HeightMapModal.css`, `ObjectSelectModal.css`, `VariantSelectModal.css` | CSS-07 | **M** | 9-way `.close-btn` consolidation; `.modal-overlay` blur behaviour changes for ReferenceImageModal. **Detection:** open all 9 modals, check header/close/footer and the backdrop blur. |
| **CSS-10** | Extract shared primitive block `panel` | **new:** `client/src/styles/blocks/panel.css` · `client/src/index.css` · consumers: `LayerPanel.css`, `PixelStudioPanel.css`, `LightingStudioPanel.css`, `RightSidebarTopControls.css` | CSS-07 | **S** | Resolves G9. Depends on CSS-07's ordering fix being correct. **Detection:** the 4 panel headers render unchanged. |
| **CSS-11** | Extract shared primitive block `slider` | **new:** `client/src/styles/blocks/slider.css` · consumers: `ColorPicker.css`, `LightingStudioPanel/LightControl.css`, `RightSidebarTopControls.css` | CSS-07 | **M** | **`RightSidebarTopControls` currently gets its entire slider styling from `ColorPicker.css` by accident.** Getting this wrong un-styles its sliders. **Detection:** compare RightSidebarTopControls sliders before/after; they must be identical. |
| **CSS-12** | Extract shared primitive block `confirm-dialog` | **new:** `client/src/styles/blocks/confirm-dialog.css` · consumers: `AddVariantModal.css`, `ObjectLibrary.css`, `BrowseBackupsModal.css`, `LayerPanel.css` | CSS-01, CSS-07 | **S** | Consolidates the 7 byte-identical duplicated classes. Low risk precisely *because* they are identical. **Detection:** open the delete-confirm flow in AddVariantModal and ObjectLibrary. |
| **CSS-13** | BEM-convert collision group **G1**: `Canvas` + `ReferenceImagePanel` | `client/src/components/Canvas/Canvas.{tsx,css}` · `client/src/components/Canvas/CanvasInfo.tsx` · `client/src/components/ReferenceImagePanel/ReferenceImagePanel.{tsx,css}` | CSS-08…12 | **M** | 8 shared classes; `Canvas.tsx` is 3,062 lines. `.reference-navigation` currently renders wrong in Canvas — fixing it is a visible change. **Detection:** `bunx tsc -b`; the class-usage script reports 0 missing; screenshot Canvas + reference panel. |
| **CSS-14** | BEM-convert **G2**: `AddVariantModal` + `ObjectLibrary` | `client/src/components/AddVariantModal/AddVariantModal.{tsx,css}` · `client/src/components/ObjectLibrary/ObjectLibrary.{tsx,css}` | CSS-08…12 | **M** | 7 shared classes + 6 `!important`. **Serialization point** — CSS-17 and CSS-18 both need this done. |
| **CSS-15** | BEM-convert **G3**: `ColorPicker` + `LightControl` + `RightSidebarTopControls` | `client/src/components/ColorPicker/ColorPicker.{tsx,css}` · `client/src/components/LightingStudioPanel/LightControl.{tsx,css}` · `client/src/components/RightSidebarTopControls/RightSidebarTopControls.{tsx,css}` | CSS-11 | **M** | The cross-component slider dependency. **Detection:** all three components' sliders pixel-identical. |
| **CSS-16** | BEM-convert **G4**: `Toolbar` + `LightingStudioPanel` + `PixelStudioPanel` | `client/src/components/Toolbar/Toolbar.{tsx,css}` · `client/src/components/Toolbar/PixelStudioTools.tsx` · `client/src/components/Toolbar/LightingStudioTools.tsx` · `client/src/components/LightingStudioPanel/LightingStudioPanel.{tsx,css}` · `client/src/components/PixelStudioPanel/PixelStudioPanel.{tsx,css}` | CSS-10 | **M** | **Unwinds 15 of the 23 `!important` declarations.** `.shape-btn` cross-dependency. **Detection:** `bunx stylelint` with `declaration-no-important` passes on these 3 files; brush-size and shape controls work in both studios. |
| **CSS-17** | BEM-convert **G5**: `ReferenceImageModal` + `ProjectSelectModal` + `BrowseBackupsModal` | `client/src/components/ReferenceImageModal/ReferenceImageModal.{tsx,css}` · `client/src/components/ProjectSelectModal/ProjectSelectModal.{tsx,css}` · `client/src/components/BrowseBackupsModal/BrowseBackupsModal.{tsx,css}` | CSS-09 | **M** | ⚠️ `ReferenceImageModal.tsx` also exports **module-level mutable state** consumed by `App.tsx` (see MASTER.md). Coordinate with the store work — do not move the file. **Detection:** all 3 modals open, save, close. |
| **CSS-18** | BEM-convert **G6+G7**: `CopyFromModal` + `ObjectSelectModal` + `VariantSelectModal` + `ExportPreviewModal` | `client/src/components/CopyFromModal/CopyFromModal.{tsx,css}` · `client/src/components/ObjectSelectModal/ObjectSelectModal.{tsx,css}` · `client/src/components/VariantSelectModal/VariantSelectModal.{tsx,css}` · `client/src/components/ExportPreviewModal/ExportPreviewModal.{tsx,css}` | CSS-14 | **M** | `.current-badge` (3-way), `.selected-badge` (3-way, 3 different colours), `.variant-thumb`, `.objects-grid`. Badge colours **will** change — pick the intended one per component deliberately. |
| **CSS-19** | BEM-convert **G8**: `App` shell + resolve `.canvas-area` | `client/src/App.{tsx,css}` | CSS-17 | **S** | The structurally worst collision. `App.css`'s `flex-direction:column` currently breaks ReferenceImageModal's centring. **Detection:** app layout unchanged; ReferenceImageModal's image is centred (it currently is not). |
| **CSS-20** | BEM-convert `FrameTimeline` + its 3 view components | `client/src/components/FrameTimeline/FrameTimeline.{tsx,css}` · `client/src/components/FrameTimeline/FramesView.tsx` · `client/src/components/FrameTimeline/TimelineView.tsx` · `client/src/components/FrameTimeline/VariantView.tsx` | CSS-08…12 | **L** | 94 classes, 1,062 lines, 4 consumers, many dynamic `${}` sites (`even`/`odd`, `hovered`, `selected`, `variant-mode`). Largest single conversion. **Split into 2 sessions if needed** (grid/timeline classes, then frames/variant classes). |
| **CSS-21** | BEM-convert `AIInterpolateModal` | `client/src/components/AIInterpolateModal/AIInterpolateModal.{tsx,css}` | CSS-08…12 | **L** | 83 classes, 898 CSS lines, 1,252 TSX lines. 8 dead status classes removed by CSS-01 first. |
| **CSS-22** | BEM-convert `Header` | `client/src/components/Header/Header.{tsx,css}` | CSS-08…12 | **M** | 41 classes incl. two runtime-concatenated families (`export-status-*`, `status-*`). **Detection:** trigger save + export and confirm both status indicators still colour correctly. |
| **CSS-23** | BEM-convert the 12 remaining independent components | `client/src/components/{FrameReferencePanel,EdgeInterpolateModal,HeightMapModal,PaletteManager,FrameTagsModal,PreviewModal,AnchorGrid,LayerColors,ResizeModal}/` · `client/src/components/Canvas/LightingCanvas.{tsx,css}` · `client/src/components/LightingStudioPanel/NormalPicker.{tsx,css}` · `client/src/components/LayerPanel/LayerPanel.{tsx,css}` | CSS-08…12 | **M** — split into 3 parallel sessions of 4 components | No collisions; low risk. `AnchorGrid` has the `arrow-${direction}` dynamic family — must add the documentation comment. |
| **CSS-24** | Add stylelint + the class-usage CI script | **new:** `client/.stylelintrc.json` · **new:** `client/scripts/check-classes.mjs` · `client/package.json` | CSS-05, CSS-06 (rules staged per *Rollout order*) | **M** | False positives block CI. Land with an allowlist and grow it per conversion (see *Rollout order*). |
| **CSS-25** | File the 9 missing-CSS gaps as bugs (do **not** fix during conversion) | *(no source files — issue tracker only)* | — | **S** | If fixed inside a conversion, "nothing changed visually" becomes unverifiable. Keep separate. |

**Total: 25 work items** — 5 prerequisites (CSS-01…03, 07, 25), 3 token items (04–06), 5 primitives (08–12), 11 conversions (13–23), 1 enforcement (24).

---

## Verification

Every command is runnable from the repo root and exits non-zero on failure.

| Work item | Command(s) | Manual checks |
| --- | --- | --- |
| **All items (gate)** | `cd client && bunx tsc -b && bunx vite build` | — |
| **CSS-01** | `cd client && node scripts/check-classes.mjs --dead` (must report 0 new dead classes and **must not** flag the 12 dynamic ones) · `grep -rn "animate-fade-in\|gap-1\|panel-toggle" client/src --include='*.tsx' \| wc -l` → must be `0` | Open AnchorGrid resize dialog (arrows animate), ColorPicker RGB sliders (channel colours), Header during save + export (status colours). |
| **CSS-02** | `cd client && bunx vite build && node -e "const c=require('fs').readFileSync(process.argv[1],'utf8');const def=new Set([...c.matchAll(/--[a-z0-9-]+(?=\s*:)/g)].map(m=>m[0]));const used=[...c.matchAll(/var\((--[a-z0-9-]+)/g)].map(m=>m[1]);const miss=[...new Set(used)].filter(u=>!def.has(u));if(miss.length){console.error('undefined tokens:',miss);process.exit(1)}" dist/assets/*.css` | ProjectSelectModal cancel button has a visible border; active shape button text is legible; `.ref-box-btn:active` shows a pressed state. |
| **CSS-03** | `cd client && node -e "const fs=require('fs'),g=require('glob');let d=new Set(),u=[];for(const f of g.sync('src/**/*.css')){const s=fs.readFileSync(f,'utf8');for(const m of s.matchAll(/@keyframes\s+([\w-]+)/g))d.add(m[1]);for(const m of s.matchAll(/animation(?:-name)?\s*:\s*([^;]+)/g))u.push([f,m[1]]);}process.exit(0)"` — simplest reliable form: `test $(grep -rhoE '@keyframes\s+[\w-]+' client/src --include='*.css' \| sort \| uniq -d \| wc -l) -eq 0` | Open EdgeInterpolateModal, HeightMapModal, PreviewModal, ProjectSelectModal, ReferenceImageModal — each must still fade/slide in. |
| **CSS-04** | `cd client && bunx vite build` · `grep -c -- '--' src/styles/tokens.css` | — |
| **CSS-05** | `cd client && bunx stylelint "src/**/*.css"` (with `declaration-strict-value` on) · `test $(grep -rhoE '#[0-9a-fA-F]{3,8}\b' src --include='*.css' --exclude-dir=styles \| wc -l) -lt 20` | **Screenshot diff against a baseline captured before CSS-05.** Cluster A/B/C/E collapse near-identical values, so a small number of intentional pixel changes are expected — each must be individually accepted, not bulk-approved. |
| **CSS-06** | `cd client && test $(grep -rhoE 'z-index:\s*-?[0-9]+' src --include='*.css' \| wc -l) -eq 0` · `bunx stylelint "src/**/*.css"` | **Required, no automated substitute.** Open in order: each of the 14 modals; the nested delete-confirm in AddVariantModal and ObjectLibrary; the resize dialog in VariantSelectModal; the restore-confirm in BrowseBackupsModal; the Toolbar tooltip; the ObjectLibrary compact tooltip; the CopyFromModal tooltip; the FrameTimeline view-mode dropdown; the Header AI-config popover **while a modal is open**. |
| **CSS-07** | `cd client && bunx vite build && node -e "const fs=require('fs'),g=require('glob');const c=fs.readFileSync(g.sync('dist/assets/*.css')[0],'utf8');const t=c.indexOf('--bg-primary'),p=c.indexOf('.layer-panel');if(t>p){console.error('tokens emitted after components');process.exit(1)}"` | `.panel-header` renders identically in LayerPanel, PixelStudioPanel and RightSidebarTopControls. |
| **CSS-08** | `cd client && bunx tsc -b && node scripts/check-classes.mjs` · `test $(grep -rn '\.cancel-btn\|\.confirm-btn\|\.create-btn' src/components --include='*.css' \| wc -l) -eq 0` | Every dialog footer: ObjectLibrary, ProjectSelectModal, ReferenceImageModal, AddVariantModal, LayerPanel, BrowseBackupsModal, VariantSelectModal. **ReferenceImageModal's confirm button should now be the accent primary button it was authored as** — this is a fix, not a regression. |
| **CSS-09** | `test $(grep -rn '^\.close-btn\|^\.modal-overlay\|^\.modal-header\|^\.modal-footer' client/src/components --include='*.css' \| wc -l) -eq 0` | All 9 modals: header, close button, footer, backdrop blur. |
| **CSS-10** | `test $(grep -rn '\.panel-header\|\.panel-content' client/src/components --include='*.css' \| wc -l) -eq 0` | 4 panel headers unchanged. |
| **CSS-11** | `test $(grep -rn '\.compact-slider\|\.slider-input\|\.slider-label' client/src/components --include='*.css' \| wc -l) -eq 0` | **Critical:** RightSidebarTopControls sliders must look identical before/after (they are currently styled by `ColorPicker.css` by accident). Also ColorPicker and LightControl. |
| **CSS-12** | `test $(grep -rn 'delete-confirm-' client/src/components --include='*.css' \| wc -l) -eq 0` | Delete-confirm flow in AddVariantModal and ObjectLibrary; restore-confirm in BrowseBackupsModal. |
| **CSS-13…23** (each conversion) | `cd client && bunx tsc -b && bunx vite build` · `bunx stylelint "src/components/<Component>/*.css"` · `node scripts/check-classes.mjs --scope src/components/<Component>` (0 dead, 0 missing) · `test $(grep -rhoE '(^\|[^-\w])\.[a-z][\w-]*' src/components/<Component>/*.css \| grep -vE '__\|--' \| grep -vE '^\.<block>$' \| wc -l) -eq 0` (no un-namespaced classes remain) | Exercise the component's primary interaction and **every state in its modifier list** (selected, dragging, active, minimized, …). A conversion that only checks the default state is not verified. |
| **CSS-13** | as above | Canvas reference navigation renders as a **4-column grid** (currently forced to flex by ReferenceImagePanel); reference wrapper has **no** stray 32px margin. |
| **CSS-16** | as above, plus `test $(grep -c '!important' client/src/components/Toolbar/Toolbar.css) -eq 0` | Brush size + shape controls in both Pixel and Lighting studios. |
| **CSS-18** | as above | Selected/current badges: confirm each of the 4 components shows its **intended** badge colour, not ObjectSelectModal's green. |
| **CSS-19** | as above | App shell layout unchanged; ReferenceImageModal's image is centred. |
| **CSS-20** | as above | All 3 timeline views (Frames, Timeline, Variant); row striping (`--even`/`--odd`); layer-header hover; drag-and-drop. |
| **CSS-22** | as above | Save status (saving → saved → error) and export status (success → error) both colour correctly — these are the runtime-concatenated families. |
| **CSS-24** | `cd client && bunx stylelint "src/**/*.css"` · `cd client && node scripts/check-classes.mjs` · both wired into CI | Confirm CI fails when a deliberately-introduced bare `.active` is added, and passes when reverted. |
| **Final gate (all items complete)** | `cd client && bunx tsc -b && bunx vite build && bunx stylelint "src/**/*.css" && node scripts/check-classes.mjs` · **collision check must return empty:** `node scripts/check-classes.mjs --collisions` | Full manual pass of the app: every modal, both studios, all timeline views, drag-and-drop, save/export. |

### The one verification asset this plan depends on

**A visual baseline must be captured before CSS-02.** Not after — CSS-02 deliberately changes 76 declarations that are currently broken, so a baseline taken later bakes in the wrong pixels for the collision fixes to be compared against. Baseline = a screenshot of every component in every state, either via Storybook (if task 08 lands the harness first) or by manual capture.

**This is a cross-audit dependency:** if the tooling plan (task 08) schedules Storybook + a visual-regression tool early, CSS-05/06/08–23 all become dramatically safer to verify. If it does not, every conversion falls back to manual screenshot comparison. Flagged in Open questions.

---

## Open questions

| # | Question | Blocking? | Assumption to proceed under |
| --- | --- | --- | --- |
| **Q1** | **Should the colour-alpha ramps be literal tokens or `color-mix()`?** The cyan ramp (`rgba(0,217,255,0.05…0.4)`, 7 values, 64 uses) is entirely derivable from `--accent-primary`. `color-mix(in srgb, var(--accent-primary) 10%, transparent)` keeps one source of truth; explicit `--accent-primary-10` is simpler and has no browser caveats. | **Non-blocking** | Proceed with **explicit literal tokens** (`--accent-primary-10`, etc.). Simpler to grep, simpler to lint, no `color-mix` support questions. Revisit if the palette is ever themed. |
| **Q2** | **Is `#ef4444` (12 uses) or `--accent-danger: #ff3366` (token) the intended red?** Both are in production in the same modals. This is a design decision, not a technical one. | **Blocking CSS-05** | Assume **`--accent-danger: #ff3366`** (the declared token) is intended and `#ef4444` is drift. **Must be confirmed by the project owner before CSS-05 runs** — it changes 12 visible declarations. |
| **Q3** | **Are the 8 "missing CSS" gaps intentional or bugs?** `frame-drop-indicator-variant`, `alpha-slider`, `sat-slider`, `light-slider`, `origin-controls-panel`, `brush-max-control`, `focus-mode-section`, `ai-step-layer`. Some may be deliberately unstyled. | **Non-blocking** | Proceed by **preserving current behaviour exactly** — convert the `className` to its BEM name and add no rule. Filed as CSS-25. Do not invent styles mid-conversion. |
| **Q4** | **Do the 3 collapsed near-identical dark palettes matter visually?** `FrameReferencePanel`/`LightingCanvas`/`ReferenceImagePanel` use `#0a0a15` vs token `#0a0a0f`, `#e0e0ff` vs `#e8e8f0`, `#a0a0b0` vs `#a0a0b8`. Differences are 1–6 in a channel — invisible in isolation, possibly deliberate in context. | **Non-blocking** | Proceed with **collapsing them onto the tokens**. Differences are below the perceptual threshold on a dark UI. Flag in the CSS-05 review for a visual sign-off. |
| **Q5** | **Will Storybook + visual-regression land before the conversions?** This determines whether CSS-05/06/08–23 are verified automatically or by hand. | **Non-blocking for this audit, but it changes the risk profile of 15 work items** | Assume **manual screenshot verification**. If task 08 (tooling) schedules Storybook in an early wave, task 09 should re-order to put it before CSS-05 — that is the single highest-leverage sequencing decision available. **Recommend task 09 do exactly that.** |
| **Q6** | **Do the 5 shared primitives belong to this audit or to the component taxonomy (task 07)?** `btn`, `modal`, `panel`, `slider`, `confirm-dialog` are CSS primitives here, but they are also obvious *component* primitives, and MASTER.md says stories bubble up "primitives → components → Layouts". | **Non-blocking; cross-cutting** | Proceed with **CSS-only extraction** (CSS-08…12) — extract the stylesheets, leave the markup where it is. If task 07 decides these become real React primitives, the CSS is already extracted and correctly named, so that work becomes strictly additive. **Flagged to task 07.** |
| **Q7** | **How should the 14 modals be rendered in Storybook?** All use `position:fixed` and will escape the story canvas. | **Non-blocking; belongs to task 07** | Assume a shared decorator that renders modals inside a `position:relative; transform:none` container. **Flagged to task 07** — it is a taxonomy decision, not a CSS one. |
| **Q8** | **Is `LayerPanel`'s dead confirm-dialog block (`.confirm-modal*`, `.modal-backdrop`, 6 classes) dead code or an unshipped feature?** It is a complete, coherent, well-styled dialog with no markup. | **Non-blocking** | Proceed with **deletion** (CSS-01) but extract its styling into the `confirm-dialog` primitive (CSS-12) first, so nothing is lost if the feature returns. |
| **Q9** | **Should `.delete`/`.cancel`/`.confirm` really be renamed to `--danger`/`--neutral`/`--primary`?** The rename decouples appearance from handler name, but it makes the mapping non-obvious for anyone grepping. | **Non-blocking** | Proceed with the rename. It is recorded in the state-word mapping table (R4), so the conversion is mechanical, and it prevents `.delete` (4 files today) from being re-introduced as a generic name. |
| **Q10** | **`ReferenceImageModal.tsx` holds module-level mutable state consumed by `App.tsx`** (noted in MASTER.md). CSS-17 converts that file. | **Non-blocking, but needs sequencing** | CSS-17 touches only `className` strings and the sibling `.css` — it does **not** move or restructure the file. Safe to run in parallel with store work **provided the store task does not relocate the file in the same wave.** **Flagged to task 09 as a collision risk on `client/src/components/ReferenceImageModal/ReferenceImageModal.tsx`.** |
| **Q11** | **Does anything outside `client/src` reference these class names?** | **Non-blocking — effectively resolved** | **Verified: no.** `grep -rn "className\|class=" server/src` returns 5 hits, all in `server/src/routes/export.ts:721–878`, and all are **TypeScript class-name generation** in a code generator (`` const className = `${pascalName}Pixels` ``), not CSS classes. `ai-service/` is Python with no templates. **Every CSS class reference in this repo lives under `client/src`.** The conversions are therefore complete by construction. |
