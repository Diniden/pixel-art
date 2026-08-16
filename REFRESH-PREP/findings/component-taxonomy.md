# Component Taxonomy, Layouts & Storybook Plan

**Task:** REFRESH-PREP P2-07 · **Designed:** 2026-08-16 · **Reads:** findings 03 (component-sizes), findings 04 (css), plus direct verification against `client/src`

Every structural claim below was re-verified against the working tree. Where this
document disagrees with a prerequisite finding, the disagreement is called out
explicitly with the command that settles it.

---

## Summary

| Metric | Value | How verified |
| --- | --- | --- |
| Component **directories** under `client/src/components/` | **31**, of which **1 is empty** (`GaussianFillModal/`) → **30 real** | `ls components/` + `ls -la components/GaussianFillModal/` → `total 0` |
| Component **`.tsx` files** (excluding `App.tsx`, `main.tsx`) | **39** | `find components -name '*.tsx' \| wc -l` |
| Files importing `useEditorStore` | **34** (33 components + `App.tsx`) | `grep -rl useEditorStore --include='*.tsx' src` |
| Components **already store-free** | **6** — `AnchorGrid`, `EdgeInterpolateModal`, `ExportPreviewModal`, `Icon`, `PreviewModal`, `ResizeModal` | inverse of the above |
| Verified full-page **Layouts** | **2**, not 4 — see [Layouts](#layouts) | read of `App.tsx` end to end |
| Modals | **14** (findings 03 is correct; MASTER's "15" is wrong) | mount-site grep, below |
| **Target tier counts** | Primitives **18** · Components **74** · Layouts **2** · Containers **41** | census + primitive spec below |
| Components needing **splitting before purification** (20+ props) | **5** — `Canvas`, `LayerPanel`, `RightSidebarTopControls`, `AIInterpolateModal`, `TimelineView` | destructure census, below |
| Themes in the app | **none** — single hard-coded dark palette | `grep -rn 'prefers-color-scheme\|data-theme' src/*.css` → 0 hits |

### The five decisions this document makes

1. **Four tiers with a mechanical membership rule** (§ Layer taxonomy). The rule is
   *"does the file name a domain type in its props?"* for the primitive/component
   boundary, and *"does the file import from `stores/` or `api/`?"* for the
   container boundary. Neither requires judgement.

2. **`ui/` may not import `stores/` or `api/` — enforced by ESLint, not by
   convention.** The exact `no-restricted-imports` config is given and is
   testable: adding one forbidden import must make `bunx eslint .` exit non-zero.

3. **`Modal` is the highest-value single extraction in the entire refresh.**
   It collapses 14 components' shells (~298 TSX + ~250 CSS lines, findings 03 D6),
   and it is the only change that fixes a **measured a11y hole in 14 places at
   once** — 0 of 14 modals have `role="dialog"`, 0 trap focus, 12 ignore Escape.
   It also resolves CSS finding G5 (`modal-overlay`/`modal-header`/`modal-footer`
   declared in `ReferenceImageModal.css` but consumed by two other modals).

4. **There are exactly two full-page layouts, not four.** The task brief's
   `ProjectSelectLayout` and `ObjectLibraryLayout` **do not exist as pages**:
   `ProjectSelectModal` is a modal mounted from `Header.tsx`, and `ObjectLibrary`
   is a left-sidebar region inside the one and only app shell. Verified below.
   `PixelStudioLayout` and `LightingStudioLayout` are real and are the two
   branches of `App.tsx:190` (`isLightingMode ? <LightingCanvas/> : <Canvas…/>`).

5. **Purification is sequenced *after* decomposition for the 5 flagged
   components.** Writing a 47-prop interface for `Canvas.tsx` would be a
   pathological artefact of a component that has 11 responsibilities. Split first
   (findings 03 W12–W15), purify the pieces.

### Cross-audit corrections

| Claim | Source | Correction | Evidence |
| --- | --- | --- | --- |
| "15 modals" | `MASTER.md` / findings 03 verification row for W9 | **14.** `GaussianFillModal/` is an empty directory. | `ls -la client/src/components/GaussianFillModal/` → `total 0` |
| "Canvas destructures 48 store members" | findings 03 census + line 118 | **47.** Off by one; the seam analysis is otherwise exact. | AST-style parse of the `const {…} = useEditorStore()` block at `Canvas.tsx:101-149` |
| "35 of ~40 client files import `useEditorStore`" | `MASTER.md` | **34** (33 components + `App.tsx`; `store/index.ts` defines it). | `grep -rl useEditorStore --include='*.tsx' --include='*.ts' client/src \| wc -l` |
| "`RightSidebarTopControls` may already be presentational" | findings 03 open question 7 | **Confirmed presentational in structure (0 hooks) but NOT store-free — it destructures 16 members.** It is the best *first* purification target precisely because it has no internal state to preserve. | `grep -c 'useState\|useEffect\|useRef\|useCallback\|useMemo'` → **0**; destructure block → 16 members |
| "4 candidate layouts" | task brief 07 §4 | **2.** See § Layouts. | full read of `App.tsx` (239 lines) |

---

## Layer taxonomy

Four tiers. The location is the contract: a file's directory declares what it is
allowed to do, and ESLint enforces it.

| Tier | Location | Membership rule (mechanical) | May import |
| --- | --- | --- | --- |
| **Primitives** | `client/src/ui/primitives/` | **No domain type appears anywhere in the file.** If the props interface or body references `Project`, `PixelObject`, `Frame`, `Layer`, `Variant`, `VariantGroup`, `VariantFrame`, `Palette`, `PixelData`, `Pixel`, `Normal`, `Tool`, or `UIState`, it is not a primitive. | `react`, other primitives, `ui/hooks/`, its own `.css` |
| **Components** | `client/src/ui/components/` | Domain-aware but **pure**: every input arrives as a prop, every effect leaves as a callback. No `useEditorStore`, no `observer()`, no `fetch`, no module-level mutable state. | primitives, other components, `types/`, `ui/hooks/`, pure `utils/` |
| **Layouts** | `client/src/ui/layouts/` | A **full-page composition** — it renders the regions of an entire screen and is what the user would call "a view of the app". Pure; takes 100% of its data as props. | components, primitives, `types/` |
| **Containers** | `client/src/containers/` | The **only** tier that may touch MobX or the API. `observer()` lives here and nowhere else. A container renders exactly one `ui/` element and supplies its props. | everything, including `stores/` and `api/` |

### The hard invariant

> **Nothing under `client/src/ui/` may import from `client/src/stores/` or
> `client/src/api/` — directly or transitively.**

This is what makes Storybook possible at all. A story mounts a `ui/` export with
literal props; if any `ui/` file reaches for a store, the story either crashes on
an uninitialised singleton or silently renders whatever global state happens to
exist, which defeats the purpose of isolation.

Two corollaries that are part of the invariant and are separately checkable:

- **No module-level mutable state in `ui/`.** This is currently violated exactly
  once, and it is load-bearing: `ReferenceImageModal.tsx:29` declares a mutable
  `persistentState` object that `App.tsx:14-19` imports four symbols from. That
  file cannot enter `ui/` until findings 03 W18 moves the state to `UIStore`.
- **No `async` data access in `ui/`.** `ProjectSelectModal`, `BrowseBackupsModal`,
  `ExportPreviewModal` and `AIInterpolateModal` all call `services/api.ts` or
  `services/aiService.ts` today. Those calls become callback props.

### ESLint enforcement

`client/eslint.config.js` — this is an **addition** to the flat config that
findings 01 work item D6 creates; it is not a standalone file.

```js
// client/eslint.config.js  (excerpt — merge into the flat config array)
export default [
  // … base JS/TS/react-hooks config from findings 01 D6 …

  // ── The ui/ purity boundary ──────────────────────────────────────────────
  {
    files: ["src/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: [
              "**/stores", "**/stores/**",
              "**/store",  "**/store/**",     // the legacy Zustand dir, during migration
              "**/api",    "**/api/**",
              "**/services/**",
              "mobx", "mobx-react-lite",
            ],
            message:
              "ui/ must stay pure: no store, API or MobX imports. Data comes in as props, " +
              "effects leave as callbacks. Wire it up in src/containers/ instead. " +
              "(REFRESH-PREP/findings/component-taxonomy.md § Layer taxonomy)",
          },
        ],
        paths: [
          {
            name: "react",
            importNames: ["useContext"],
            message:
              "ui/ may not read context — a context read is a hidden dependency that a " +
              "story cannot supply. Pass the value as a prop.",
          },
        ],
      }],
    },
  },

  // ── Primitives are additionally forbidden domain types ───────────────────
  {
    files: ["src/ui/primitives/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["**/stores/**", "**/store/**", "**/api/**", "**/services/**"],
            message: "Primitives are store-free (see ui/ rule)." },
          { group: ["**/types", "**/types/**"],
            message:
              "A primitive may not know a domain type. If it needs Project/Layer/Frame/" +
              "Variant/Palette it belongs in ui/components/ instead.",
          },
        ],
      }],
    },
  },

  // ── Containers are the only tier allowed to call observer() ──────────────
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/containers/**"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "mobx-react-lite",
          message: "observer() belongs in src/containers/ only.",
        }],
      }],
    },
  },
];
```

**Why `no-restricted-imports` and not `import/no-restricted-paths`:**
`eslint-plugin-import` is not in the dependency set findings 01 specifies, and
adding it drags in a resolver plus a peer-range negotiation with
`typescript-eslint@8.67`. The core rule covers the same ground here because the
banned targets are all path-shaped.

**Enforceability test** (this is the acceptance criterion, not a suggestion):

```sh
cd client
# 1. must pass on a clean tree
bunx eslint . || exit 1
# 2. must FAIL when the boundary is crossed
printf 'import { useEditorStore } from "../../stores";\nexport const x = useEditorStore;\n' \
  > src/ui/components/__boundary_probe.ts
bunx eslint src/ui/components/__boundary_probe.ts && { echo "BOUNDARY NOT ENFORCED"; exit 1; }
rm src/ui/components/__boundary_probe.ts
echo "boundary enforced"
```

### Directory shape

```
client/src/
  ui/
    primitives/         Button/ IconButton/ Modal/ ConfirmDialog/ Slider/ …
    components/         LayerPanelView/ ObjectLibraryView/ CanvasSurface/ …
    layouts/            PixelStudioLayout/ LightingStudioLayout/
    hooks/              useFloatingPanel/ useDragReorder/ useCanvasViewport/ …
  containers/           AppContainer  LayerPanelContainer  CanvasContainer  …
  stores/               MobX (P2-06 owns this)
  api/                  typed API layer (from services/api.ts)
  fixtures/             plain-object sample data — stories + tests
  styles/               tokens.css reset.css blocks/*  (findings 04)
  types/                domain types (findings 03 W2 splits this)
```

`ui/hooks/` is a deliberate fourth folder inside `ui/`. The four shared hooks
findings 03 extracts (`useCanvasViewport`, `useFloatingPanel`, `useDragReorder`,
`useCanvasRender`) are pure DOM/gesture logic with no store access, so they are
subject to the same import ban and belong inside the boundary, not outside it.

---

## Component census

Every existing `.tsx` under `client/src/components/` plus `App.tsx`, and every new
component the findings-03 decomposition proposals create. **Store-coupled** column
gives the measured count of destructured `useEditorStore` members.

Legend for **Purification effort**: **S** < 2h · **M** half day · **L** multi-day ·
**—** already pure.

### Existing files → target tier

| Current file | Lines | Tier | Target path | Store-coupled? | Purification effort |
| --- | ---: | --- | --- | --- | --- |
| `App.tsx` | 239 | Container + Layout | `containers/AppContainer.tsx` + `ui/layouts/PixelStudioLayout/` + `ui/layouts/LightingStudioLayout/` | **9 members** | **L** — splits into 2 layouts + 1 container; also owns 2 global keyboard effects |
| `components/Icon/Icon.tsx` | 25 | Primitive | `ui/primitives/Icon/Icon.tsx` | no | — (move only) |
| `components/AnchorGrid/AnchorGrid.tsx` | 202 | Component | `ui/components/AnchorGrid/` | no | — (already props-in/callbacks-out) |
| `components/ResizeModal/ResizeModal.tsx` | 110 | Component | `ui/components/ResizeModal/` | no | **S** — adopt `Modal` primitive only |
| `components/EdgeInterpolateModal/EdgeInterpolateModal.tsx` | 150 | Component | `ui/components/EdgeInterpolateModal/` | no | **S** — adopt `Modal` + `Slider` (3 hand-rolled sliders) |
| `components/PreviewModal/PreviewModal.tsx` | 473 | Component | `ui/components/PreviewModal/` | no | **S** — adopt `Modal` + `NumberInput`; owns its own rAF loop, which is fine in `ui/` |
| `components/ExportPreviewModal/ExportPreviewModal.tsx` | 537 | Component | `ui/components/ExportPreviewModal/` | no — **but calls `api` directly** | **M** — the `fetch` of the exported bundle becomes a `loadExport` prop |
| `components/Canvas/CanvasInfo.tsx` | 146 | Component | `ui/components/CanvasInfo/` | **7** (6 + `setCanvasInfoHidden`) | **S** — small, cohesive, all reads |
| `components/LayerColors/LayerColors.tsx` | 295 | Component | `ui/components/LayerColors/` | **9** | **M** — also fix the 3 keyboard-inoperable toggles (`LayerColors.tsx:169-180,197-208,254`) via `Toggle` |
| `components/LightingStudioPanel/NormalPicker.tsx` | 261 | Component | `ui/components/NormalPicker/` | **3** | **S** |
| `components/LightingStudioPanel/LightControl.tsx` | 281 | Component | `ui/components/LightControl/` | **4** | **S** — 4× `SliderWithNumber` collapses ~120 lines |
| `components/LightingStudioPanel/LightingStudioPanel.tsx` | 90 | Component | `ui/components/LightingStudioPanel/` | **4** | **S** |
| `components/PixelStudioPanel/PixelStudioPanel.tsx` | 190 | Component | `ui/components/PixelStudioPanel/` | **8** (3 + 5, two hook calls) | **S** |
| `components/PaletteManager/PaletteManager.tsx` | 167 | Component | `ui/components/PaletteManager/` | **7** | **S** |
| `components/ColorPicker/ColorPicker.tsx` | 673 | Component | `ui/components/ColorPicker/` | **6** | **M** — extract `utils/colorMath.ts` first (findings 03 verdict SPLIT) |
| `components/ObjectSelectModal/ObjectSelectModal.tsx` | 185 | Component | `ui/components/ObjectSelectModal/` | **1** (`project`) | **S** — the single easiest purification in the codebase |
| `components/CopyFromModal/CopyFromModal.tsx` | 233 | Component | `ui/components/CopyFromModal/` | **3** | **S** |
| `components/BrowseBackupsModal/BrowseBackupsModal.tsx` | 212 | Component | `ui/components/BrowseBackupsModal/` | **2** — **plus direct API calls** | **M** — backup list + restore become props |
| `components/ProjectSelectModal/ProjectSelectModal.tsx` | 188 | Component | `ui/components/ProjectSelectModal/` | **6** | **M** — 4 of the 6 are async project-lifecycle actions |
| `components/VariantSelectModal/VariantSelectModal.tsx` | 295 | Component | `ui/components/VariantSelectModal/` | **5** | **S** |
| `components/AddVariantModal/AddVariantModal.tsx` | 283 | Component | `ui/components/AddVariantModal/` | **4** | **S** — also adopts `ConfirmDialog` (CSS G2) |
| `components/FrameTagsModal/FrameTagsModal.tsx` | 266 | Component | `ui/components/FrameTagsModal/` | **5** (selector-style, not destructured) | **S** |
| `components/HeightMapModal/HeightMapModal.tsx` | 300 | Component | `ui/components/HeightMapModal/` | **5** | **S** |
| `components/Toolbar/Toolbar.tsx` | 166 | Component | `ui/components/Toolbar/` | **5** | **S** — also replaces its bespoke portal tooltip with `Tooltip` |
| `components/Toolbar/PixelStudioTools.tsx` | 139 | Component | `ui/components/PixelStudioTools/` | **4** | **S** |
| `components/Toolbar/LightingStudioTools.tsx` | 308 | Component | `ui/components/LightingStudioTools/` | **11** | **M** |
| `components/Header/Header.tsx` | 319 | Component | `ui/components/Header/` | **6** | **M** — split the AI-config popover out first (14 `useState`) |
| `components/ObjectLibrary/ObjectLibrary.tsx` | 643 | Component | `ui/components/ObjectLibrary/` | **8** | **L** — 15 `useState` = 5 inline dialogs; extract dialogs first |
| `components/FrameReferencePanel/FrameReferencePanel.tsx` | 477 | Component | `ui/components/FrameReferencePanel/` | **10** | **M** — after `useFloatingPanel` (findings 03 W7) |
| `components/ReferenceImagePanel/ReferenceImagePanel.tsx` | 434 | Component | `ui/components/ReferenceImagePanel/` | **4** | **M** — same hook dependency |
| `components/FrameTimeline/FrameTimeline.tsx` | 251 | Component | `ui/components/FrameTimeline/` | **6** | **M** — owns playback; the rAF/interval stays in `ui/` |
| `components/FrameTimeline/FramesView.tsx` | 684 | Component | `ui/components/FramesView/` | **8** | **L** — after `useDragReorder` + `ThumbnailCanvas` |
| `components/FrameTimeline/VariantView.tsx` | 617 | Component | `ui/components/VariantView/` | **9** | **L** — same |
| `components/FrameTimeline/TimelineView.tsx` | 836 | Component | `ui/components/TimelineView/` | **12** | **L** — ⚠️ **flagged**, see below |
| `components/LayerPanel/LayerPanel.tsx` | 501 | Component | `ui/components/LayerPanel/` | **22** | **L** — ⚠️ **flagged: 20+ props** |
| `components/RightSidebarTopControls/RightSidebarTopControls.tsx` | 403 | Component | `ui/components/RightSidebarTopControls/` | **16** | **M** — ⚠️ **flagged**; 0 hooks makes it the cheapest big win |
| `components/Canvas/Canvas.tsx` | 3062 | → 1 container + N components | `containers/CanvasContainer.tsx` + `ui/components/CanvasSurface/` + `ui/hooks/*` + pure `render/`+`model/`+`tools/` | **47** | **L** — ⚠️ **flagged: split first (W12–W15)** |
| `components/Canvas/LightingCanvas.tsx` | 937 | → 1 container + N components | `containers/LightingCanvasContainer.tsx` + `ui/components/LightingSurface/` | **14** | **L** — split first (W16) |
| `components/AIInterpolateModal/AIInterpolateModal.tsx` | 1252 | → 1 container + 8 components | `containers/AIInterpolateContainer.tsx` + `ui/components/AIInterpolate*/` | **whole store** (`const store = useEditorStore()` at :316) + 2× `useEditorStore.setState` at :754,:841 | **L** — ⚠️ **flagged: worst coupling in the codebase** |
| `components/ReferenceImageModal/ReferenceImageModal.tsx` | 869 | → store slice + utils + 1 container + 1 component | `stores/referenceImage` + `utils/referenceImage.ts` + `containers/ReferenceImageContainer.tsx` + `ui/components/ReferenceImageCropper/` | **3 `getState()` calls** + **module-level mutable state at :29** | **L** — ⚠️ **blocking: module state must move first (W18)** |

### Components flagged as needing splitting before purification

Rule applied: **a props interface with 20 or more entries means the component has
more than one reason to change.** Split it, then purify the pieces.

| Component | Store members | Props if purified as-is | Verdict | Split first via |
| --- | ---: | ---: | --- | --- |
| `Canvas.tsx` | **47** | ~52 (47 + 3 existing + 2 refs) | **Must split.** 11 fused responsibilities, findings 03 §1. | findings 03 **W12→W13→W14→W15** (strictly sequential) |
| `AIInterpolateModal.tsx` | **whole store object** | unbounded — it calls `useEditorStore.setState` directly twice | **Must split.** No props interface can be written until the step machine is decomposed. | findings 03 **W17** |
| `LayerPanel.tsx` | **22** | ~24 | **Must split.** 7 of the 22 are `squash*`/`move*` variants that collapse to 2 parameterised callbacks; deepest JSX in the codebase (18). | new item **T-06** below |
| `RightSidebarTopControls.tsx` | **16** | ~18 | **Borderline — split recommended.** Under 20, but it is 4 unrelated control groups sharing a file. Splitting it *reduces* total props because each group takes 3–5. | new item **T-07** below |
| `TimelineView.tsx` | **12** | ~19 (12 + 7 existing/derived) | **Borderline — split recommended.** Under 20 on store members alone, but findings 03 measures 6 responsibilities and the 91-line memo comparator lives next door. | findings 03 **W10 → W11** |

`LightingCanvas.tsx` (14 members) is **not** flagged: its members are cohesive
(one studio mode, one paint operation) and findings 03 W16 already splits it for
independent reasons.

### New components created by the decomposition proposals

Every one of these is **pure by construction** — that is the point of extracting
them. All are Storybook-able on day one.

| New component | Tier | Target path | From | Store? |
| --- | --- | --- | --- | --- |
| `CanvasSurface` | Component | `ui/components/CanvasSurface/` | `Canvas.tsx` C8 | no |
| `LightingSurface` | Component | `ui/components/LightingSurface/` | `LightingCanvas.tsx` | no |
| `LightingPreviewPanel` | Component | `ui/components/LightingPreviewPanel/` | `LightingCanvas.tsx:713-835` | no |
| `ReferenceImageCropper` | Component | `ui/components/ReferenceImageCropper/` | `ReferenceImageModal.tsx:289-869` | no |
| `ThumbnailCanvas` | Component | `ui/components/ThumbnailCanvas/` | 5 call sites (findings 03 D5) | no |
| `TimelineToolbar` | Component | `ui/components/TimelineToolbar/` | findings 03 D12 (3 copies) | no |
| `AddFrameControls` | Component | `ui/components/AddFrameControls/` | findings 03 D12 | no |
| `TimelineModals` | Component | `ui/components/TimelineModals/` | findings 03 D12 | no |
| `AIInterpolateChecking` | Component | `ui/components/AIInterpolate/steps/CheckingStep.tsx` | `AIInterpolateModal` | no |
| `AIInterpolateUnavailable` | Component | `…/steps/UnavailableStep.tsx` | ″ | no |
| `AIInterpolateSelectLayer` | Component | `…/steps/SelectLayerStep.tsx` | ″ | no |
| `AIInterpolateConfigure` | Component | `…/steps/ConfigureStep.tsx` | ″ | no |
| `AIInterpolateGenerating` | Component | `…/steps/GeneratingStep.tsx` | ″ | no |
| `AIInterpolateReview` | Component | `…/steps/ReviewStep.tsx` | ″ | no |
| `Base64Thumbnail` | Component | `…/parts/Base64Thumbnail.tsx` | `AIInterpolateModal.tsx:190-210` | no |
| `SyncedAnimatedPreview` | Component | `…/parts/SyncedAnimatedPreview.tsx` | `AIInterpolateModal.tsx:212-290` | no |
| `AiConfigPopover` | Component | `ui/components/AiConfigPopover/` | `Header.tsx` (14 `useState`) | no |
| `ObjectRenameDialog` | Component | `ui/components/ObjectLibrary/dialogs/` | `ObjectLibrary.tsx` (1 of 5 inline dialogs) | no |
| `ObjectDeleteDialog` | Component | ″ | ″ | no |
| `ObjectResizeDialog` | Component | ″ | ″ | no |
| `ObjectDuplicateDialog` | Component | ″ | ″ | no |
| `ObjectCreateDialog` | Component | ″ | ″ | no |
| `LayerList` | Component | `ui/components/LayerPanel/LayerList.tsx` | `LayerPanel.tsx` split (T-06) | no |
| `LayerRow` | Component | `ui/components/LayerPanel/LayerRow.tsx` | ″ | no |
| `LayerPanelHeader` | Component | `ui/components/LayerPanel/LayerPanelHeader.tsx` | ″ | no |
| `ZoomControls` | Component | `ui/components/RightSidebarTopControls/ZoomControls.tsx` | T-07 split | no |
| `BrushControls` | Component | ″ | ″ | no |
| `ShapeControls` | Component | ″ | ″ | no |
| `SelectionControls` | Component | ″ | ″ | no |
| `ViewModeDropdown` | Component | `ui/components/ViewModeDropdown/` | inlined at `FrameTimeline.tsx:11-76` | no |
| `TimelineGrid` | Component | `ui/components/TimelineView/TimelineGrid.tsx` | `TimelineView.tsx` split | no |
| `TimelineCell` | Component | `ui/components/TimelineView/TimelineCell.tsx` | ″ | no |

**Total new components: 32.** Combined with the 42 existing files that land in
`ui/components/`, the Components tier is **74**.

### Containers (41)

One container per store-coupled `ui/` element. Naming rule: **`<ComponentName>Container`**,
file `client/src/containers/<ComponentName>Container.tsx`, wrapped in `observer()`.

`AppContainer` · `HeaderContainer` · `ToolbarContainer` · `PixelStudioToolsContainer` ·
`LightingStudioToolsContainer` · `CanvasContainer` · `CanvasInfoContainer` ·
`LightingCanvasContainer` · `LightingPreviewPanelContainer` · `LayerPanelContainer` ·
`LayerColorsContainer` · `ObjectLibraryContainer` · `PaletteManagerContainer` ·
`ColorPickerContainer` · `PixelStudioPanelContainer` · `LightingStudioPanelContainer` ·
`LightControlContainer` · `NormalPickerContainer` · `RightSidebarTopControlsContainer`
(+ 4 sub-containers if T-07 splits it) · `FrameTimelineContainer` · `FramesViewContainer` ·
`TimelineViewContainer` · `VariantViewContainer` · `FrameReferencePanelContainer` ·
`ReferenceImagePanelContainer` · `ReferenceImageContainer` · `AIInterpolateContainer` ·
`AddVariantModalContainer` · `VariantSelectModalContainer` · `CopyFromModalContainer` ·
`ObjectSelectModalContainer` · `ProjectSelectModalContainer` · `BrowseBackupsModalContainer` ·
`FrameTagsModalContainer` · `HeightMapModalContainer` · `ExportPreviewModalContainer` ·
`EdgeInterpolateModalContainer` · `ResizeModalContainer` · `PreviewModalContainer` ·
`AnchorGridContainer` *(not needed — AnchorGrid is already pure and takes props from its parent)*.

Net: **41 containers**, of which 6 are trivial pass-throughs that exist only so the
`ui/` element never sees a store.

---

## Primitive library

18 primitives. Ordered by **call sites collapsed**, which is the only ranking that
matters for sequencing: the top four together account for 258 of the 271 raw
control elements findings 03 counted.

BEM block names follow findings 04 R1 (component name → kebab-case) and R8
(shared primitives live in `client/src/styles/blocks/`, not beside the component).
Five of the blocks — `btn`, `modal`, `panel`, `slider`, `confirm-dialog` — are
**already specified by findings 04 CSS-08…12**. This document adopts those names
verbatim so the CSS extraction and the React extraction converge rather than
compete (findings 04 Q6 asked exactly this; the answer is: same names, CSS first).

| # | Primitive | Call sites collapsed | BEM block | CSS work item that pre-creates the block |
| ---: | --- | ---: | --- | --- |
| 1 | `Button` | **197** raw `<button>` | `btn` | CSS-08 |
| 2 | `Slider` | **27** `<input type="range">` | `slider` | CSS-11 |
| 3 | `NumberInput` | **21** `<input type="number">` | `number-input` | new |
| 4 | `Modal` | **14** modal shells | `modal` | CSS-09 |
| 5 | `IconButton` | **13** verbatim close buttons | `icon-btn` | CSS-08 (modifier of `btn`) |
| 6 | `Tooltip` | **142** `title=` + 2 bespoke portals | `tooltip` | new |
| 7 | `Toggle` | **9**, in 3 incompatible idioms | `toggle` | new |
| 8 | `SliderWithNumber` | **8** range+number rows | `slider-row` | CSS-11 |
| 9 | `ThumbnailCanvas` | **5** | `thumbnail` | new |
| 10 | `ColorSwatch` | **3** implementations | `color-swatch` | new |
| 11 | `ConfirmDialog` | **3** | `confirm-dialog` | CSS-12 |
| 12 | `FloatingPanel` | **3** clones | `floating-panel` | new |
| 13 | `Panel` | **12** `panel-header` + 13 ad-hoc | `panel` | CSS-10 |
| 14 | `Dropdown` | **1** (`ViewModeDropdown`) | `dropdown` | new |
| 15 | `Icon` | already exists, 39 files | `icon` | none needed |
| 16 | `Field` | label+control pairs, ~30 sites | `field` | new |
| 17 | `EmptyState` | 3 (`.empty-state` in 3 files) | `empty-state` | new |
| 18 | `Badge` | 6 (`selected-badge`/`current-badge` ×3 each) | `badge` | new |

**Deliberately NOT extracted:**

- **`Tabs`** — 1 call site (`AIInterpolateModal.tsx:964-983`). findings 03 says
  "do not extract speculatively" and this document agrees. A `classNames(...)`
  helper in `ui/utils/` covers the `${base} ${cond ? 'active' : ''}` idiom that is
  actually widespread.
- **`ContextMenu`** — 0 call sites. Absent, not duplicated.

---

### Modal — the highest-value single extraction

Replaces the shells of all 14 modals: `AddVariantModal`, `AIInterpolateModal`,
`BrowseBackupsModal`, `CopyFromModal`, `EdgeInterpolateModal`, `ExportPreviewModal`,
`FrameTagsModal`, `HeightMapModal`, `ObjectSelectModal`, `PreviewModal`,
`ProjectSelectModal`, `ReferenceImageModal`, `ResizeModal`, `VariantSelectModal`.

```ts
// client/src/ui/primitives/Modal/Modal.tsx
export interface ModalProps {
  /** Controls visibility. Defaults to true so the 6 conditionally-mounted
   *  callers (AddVariantModal, CopyFromModal, ObjectSelectModal,
   *  VariantSelectModal, BrowseBackupsModal, ProjectSelectModal) keep working
   *  unchanged during migration. See Open question T-Q3. */
  isOpen?: boolean;
  /** Fired by: the close button, Escape, and a backdrop click that both began
   *  and ended on the backdrop. Never fired by a drag that started inside. */
  onClose: () => void;
  /** Rendered in the header. Also becomes the accessible name via
   *  aria-labelledby — so it must be supplied even when visually hidden. */
  title: React.ReactNode;
  /** Optional right-aligned header content, left of the close button. */
  headerActions?: React.ReactNode;
  /** The footer row. Omit for modals with no actions (PreviewModal). */
  footer?: React.ReactNode;
  children: React.ReactNode;

  size?: "sm" | "md" | "lg" | "fullscreen";   // 400 / 640 / 960 / 100vw
  /** Stacking tier. `nested` is for a confirm dialog opened from inside a
   *  modal — resolves the AddVariantModal z-index:1001 vs AI 99999 conflict. */
  layer?: "modal" | "nested";
  closeOnBackdrop?: boolean;                   // default true
  closeOnEscape?: boolean;                     // default true
  /** Element focused on open. Defaults to the first tabbable child, falling
   *  back to the modal panel itself. */
  initialFocusRef?: React.RefObject<HTMLElement>;
  /** Portal target. Defaults to document.body. Storybook's modal decorator
   *  passes a local element so the modal stays inside the story canvas. */
  container?: HTMLElement | null;
  className?: string;
  "data-testid"?: string;
}
```

**Variants:** `size` × 4, `layer` × 2. BEM: `modal`, `modal__backdrop`,
`modal__panel`, `modal__header`, `modal__title`, `modal__close`, `modal__body`,
`modal__footer`; modifiers `modal__panel--sm|md|lg|fullscreen`, `modal--nested`.

**a11y requirements — every one of these is currently missing in all 14 modals:**

| Requirement | Measured state today |
| --- | --- |
| `role="dialog"` + `aria-modal="true"` on the panel | **0 of 14** have it |
| `aria-labelledby` pointing at the title node | **0 of 14** |
| Focus moves into the dialog on open | **0 of 14** |
| Focus trapped (Tab/Shift+Tab cycle within) | **0 of 14** |
| Focus restored to the opener on close | **0 of 14** |
| Escape closes | **2 of 14** — `ExportPreviewModal.tsx:431-442`, `PreviewModal.tsx:393-405` (copy-paste twins). `BrowseBackupsModal.tsx:106-114` and `ProjectSelectModal.tsx:89-101` attach `onKeyDown` to a `tabIndex`-less div → **dead code** |
| Backdrop click uses a mousedown-origin guard | **1 of 14** — only `AIInterpolateModal.tsx:863-874` gets it right. Adopt its implementation as the primitive's. |
| Rendered through a portal | **11 of 14** — `BrowseBackupsModal.tsx:116`, `ProjectSelectModal.tsx:103`, `ReferenceImageModal.tsx:750` render inline |
| Background scroll locked | 0 of 14 |

**Escape-key conflict — must be handled, not discovered later.** `Canvas.tsx:1741-1761`
registers a **capture-phase** keydown listener with 3-level Escape precedence, and
`App.tsx:91-152` registers a window-level Escape handler for `colorAdjustment`.
A modal that opens over the canvas and calls `e.stopPropagation()` in the bubble
phase will **not** stop the capture-phase canvas handler. The primitive must
therefore:

1. register its Escape listener in the **capture** phase on `document`,
2. call `e.stopPropagation()` **and** `e.preventDefault()`,
3. only act if it is the **topmost** open modal — maintained by a module-level
   open-modal stack inside the primitive (this is allowed: it is primitive-local
   bookkeeping, not app state, and it is the standard implementation).

Verification for this is a manual check in findings 03's W9 row and is restated
in § Verification below.

---

### Button

```ts
// client/src/ui/primitives/Button/Button.tsx
export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: "primary" | "neutral" | "danger" | "ghost" | "accent";
  size?: "xs" | "sm" | "md";
  /** Lucide icon rendered before the label. */
  icon?: LucideIcon;
  iconSize?: number;
  /** Renders only the icon; `label` becomes aria-label. Use IconButton
   *  instead unless you need Button's variants. */
  iconOnly?: boolean;
  /** Shows a spinner and sets aria-busy. Implies disabled. */
  loading?: boolean;
  fullWidth?: boolean;
  /** Tooltip text. Rendered via the Tooltip primitive, NOT the title attribute
   *  — title= is unreliable for keyboard and screen-reader users, and there are
   *  142 of them today. */
  tooltip?: string;
  className?: string;
}
```

**Variants:** 5 × 3 sizes × {icon, iconOnly, loading, fullWidth}. BEM: `btn`,
modifiers `btn--primary|neutral|danger|ghost|accent`, `btn--xs|sm|md`,
`btn--icon-only`, `btn--full`, `btn--loading`; element `btn__icon`, `btn__label`.

The variant names come straight from findings 04's canonical state-word mapping:
`.confirm` → `--primary`, `.cancel` → `--neutral`, `.delete` → `--danger`.

**Replaces (representative measured sites):** `LayerPanel.tsx:148-160` and
`:161-173` (consecutive 13-line twins); `LayerPanel.tsx:285,339,350,361,372`;
`ReferenceImagePanel.tsx:233-309` (8 clone buttons) and `:333-403` (8 more);
the play/preview pair duplicated verbatim at `FramesView.tsx:541-554`,
`VariantView.tsx:427-440`, `TimelineView.tsx:658-671`.

**a11y:** native `<button type="button">` (never a div); `aria-busy` when
`loading`; `aria-label` mandatory when `iconOnly`; visible `:focus-visible` ring —
currently absent everywhere.

---

### IconButton

```ts
export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> {
  icon: LucideIcon;
  /** Required — becomes aria-label. There is no visible text. */
  label: string;
  size?: "xs" | "sm" | "md";      // 14 / 18 / 24 px icon
  variant?: "ghost" | "danger" | "accent";
  iconSize?: number;
  showTooltip?: boolean;          // default true
  className?: string;
}
```

BEM: `icon-btn` (+ `btn` modifiers where shared). **Replaces the 13 verbatim close
buttons** — `AddVariantModal.tsx:126`, `CopyFromModal.tsx:187`,
`ObjectSelectModal.tsx:113`, `VariantSelectModal.tsx:144`,
`EdgeInterpolateModal.tsx:47`, `HeightMapModal.tsx:201`,
`BrowseBackupsModal.tsx:125`, `ProjectSelectModal.tsx:108`,
`ReferenceImageModal.tsx:755`, plus the bespoke-class twins at
`ResizeModal.tsx:60`, `PreviewModal.tsx:417`, `ExportPreviewModal.tsx:461`,
`FrameTagsModal.tsx:175`. After the `Modal` primitive lands, 13 of these
disappear entirely — the close button becomes `Modal`'s internal concern.

---

### Slider

```ts
export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  /** Fired on pointer release / keyboard commit. Use for expensive commits
   *  (LightControl currently writes to the store on every input event). */
  onCommit?: (value: number) => void;
  min: number;
  max: number;
  step?: number;                          // default 1
  disabled?: boolean;
  /** Accessible name. Required — 27 sliders today have none. */
  label: string;
  /** Hide the label visually but keep it for AT. */
  labelHidden?: boolean;
  /** Custom track background, e.g. a hue gradient or an R/G/B channel ramp.
   *  Replaces ColorPicker's `!important` gradient override (ColorPicker.css:231). */
  trackStyle?: React.CSSProperties;
  /** Applied as a BEM modifier: slider--{channel}. Used by ColorPicker's
   *  channel-r/g/b and hue/sat/light sliders. */
  channel?: "r" | "g" | "b" | "a" | "hue" | "sat" | "light";
  className?: string;
}
```

BEM: `slider`, `slider__track`, `slider__thumb`, `slider__input`, `slider__label`;
modifiers `slider--r|g|b|a|hue|sat|light`, `slider--disabled`.

**Replaces:** `EdgeInterpolateModal.tsx:51-116` (3 consecutive 20-line copies),
`LightControl.tsx:149,169,194,254` (4×), `ColorPicker.tsx:538,559,585,620,646` (5×),
plus 15 more.

**a11y:** native `<input type="range">` keeps the built-in role/keyboard model;
add `aria-label` (or `aria-labelledby`) and `aria-valuetext` when the numeric
value is not self-describing.

⚠️ **The entire track and thumb styling for every slider in the app currently
comes from `client/src/index.css:80-162`, not from the components** (findings 04
requirement 3). The primitive must own that CSS explicitly, or every slider story
renders as a native OS control.

---

### NumberInput

```ts
export interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Clamp to [min,max] on blur/Enter rather than per-keystroke, so a user can
   *  transiently type "1" on the way to "16". This is the behaviour
   *  ResizeModal.tsx:65-85 hand-rolls and PreviewModal/ExportPreviewModal
   *  duplicate identically for FPS. */
  clampOnCommit?: boolean;          // default true
  label: string;
  labelHidden?: boolean;
  suffix?: string;                  // "px", "fps"
  disabled?: boolean;
  width?: number;
  className?: string;
}
```

BEM: `number-input`, `number-input__field`, `number-input__label`,
`number-input__suffix`.

**Replaces:** `ResizeModal.tsx:65-85` (twin clamps); the **byte-identical FPS
clamp** at `PreviewModal.tsx:449-456` and `ExportPreviewModal.tsx:506-515`;
`LightControl.tsx:160,185,211,268`; `ColorPicker.tsx:548,574,601,630,661`.

---

### SliderWithNumber

```ts
export interface SliderWithNumberProps
  extends Omit<SliderProps, "className"> {
  /** Number-field width in px. Default 48. */
  numberWidth?: number;
  showNumber?: boolean;             // default true
  suffix?: string;
  className?: string;
}
```

BEM: `slider-row`, `slider-row__label`, `slider-row__slider`, `slider-row__number`.
Composes `Slider` + `NumberInput`. **Replaces the 8 identical range+number rows**
at `LightControl.tsx:149-167` (×4) and `ColorPicker.tsx:538-661` (×5).

---

### Tooltip

```ts
export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;     // the trigger; cloned to attach handlers
  placement?: "top" | "bottom" | "left" | "right";
  /** ms before showing. Default 400 — matches the perceived delay of title=. */
  delay?: number;
  disabled?: boolean;
  /** Portal target; defaults to document.body. */
  container?: HTMLElement | null;
}
```

BEM: `tooltip`, `tooltip__arrow`; modifiers `tooltip--top|bottom|left|right`.

**Replaces three mutually incompatible mechanisms:** 142 `title=` attributes, plus
two independently written portal tooltips at `CopyFromModal.tsx:72-88` and
`Toolbar.tsx:38-45`.

**a11y:** `role="tooltip"` + `aria-describedby` on the trigger; shows on **focus**
as well as hover (a `title=` attribute does not); hides on Escape. This is a real
functional gain — 142 keyboard-inaccessible hints become accessible.

---

### Toggle

```ts
export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  labelHidden?: boolean;
  disabled?: boolean;
  /** "switch" = the sliding pill (RightSidebarTopControls.tsx:309-319 idiom);
   *  "checkbox" = the label-wrapped box (EdgeInterpolateModal.tsx:118-126 idiom). */
  appearance?: "switch" | "checkbox";
  size?: "sm" | "md";
  className?: string;
}
```

BEM: `toggle`, `toggle__input`, `toggle__track`, `toggle__thumb`, `toggle__label`;
modifiers `toggle--switch|checkbox`, `toggle--checked`, `toggle--disabled`.

**Replaces 9 sites across 3 incompatible idioms**, including the three
**keyboard-inoperable** ones at `LayerColors.tsx:169-180`, `:197-208`, `:254` —
a no-op `onChange` plus a `div onClick`, which cannot be reached by Tab and
cannot be activated by Space. The primitive uses a real `<input type="checkbox">`
with `role="switch"` when `appearance="switch"`, which fixes all three.

---

### ConfirmDialog

```ts
export interface ConfirmDialogProps {
  isOpen?: boolean;
  title: string;
  message: React.ReactNode;
  /** Extra warning line, styled distinctly. */
  warning?: React.ReactNode;
  confirmLabel?: string;            // default "Confirm"
  cancelLabel?: string;             // default "Cancel"
  variant?: "danger" | "primary";   // default "danger"
  onConfirm: () => void;
  onCancel: () => void;
  /** Undo affordance — ObjectLibrary and AddVariantModal both show one. */
  undoLabel?: string;
  onUndo?: () => void;
  busy?: boolean;
}
```

BEM: `confirm-dialog` (findings 04 CSS-12 creates this block from the 7
byte-identical `.delete-confirm-*` classes duplicated between
`AddVariantModal.css` and `ObjectLibrary.css`). Built on `Modal` with
`layer="nested"` — which is what fixes the measured stacking bug where
`AddVariantModal.css:324` puts a nested confirm at `z-index:1001` while the AI
backdrop sits at `99999`.

**Replaces:** `ObjectLibrary.tsx:608`, `AddVariantModal.tsx:248`,
`BrowseBackupsModal.tsx:181`, and `LayerPanel.css`'s complete-but-unused
`.confirm-modal-*` block (findings 04 Q8 — extract its styling here rather than
losing it).

---

### FloatingPanel

```ts
export interface FloatingPanelProps {
  title: React.ReactNode;
  children: React.ReactNode;
  /** Position as a percentage of the containing canvas area — this is the
   *  format all three existing panels already persist. */
  position: { topPercent: number; leftPercent: number };
  onPositionChange: (p: { topPercent: number; leftPercent: number }) => void;
  minimized: boolean;
  onMinimizedChange: (minimized: boolean) => void;
  /** Element the panel is constrained to. Required — the three current
   *  implementations each query a different ancestor. */
  boundsRef: React.RefObject<HTMLElement>;
  headerActions?: React.ReactNode;
  onClose?: () => void;
  width?: number;
  className?: string;
}
```

BEM: `floating-panel`, `floating-panel__header`, `floating-panel__title`,
`floating-panel__body`, `floating-panel__actions`; modifiers
`floating-panel--minimized`, `floating-panel--dragging`.

**Replaces 3 clones** (findings 03 D3, ~120 duplicated lines):
`LightingCanvas.tsx:713-835`, `FrameReferencePanel.tsx:32-102,272-323`,
`ReferenceImagePanel.tsx:32-94,130-191`.

⚠️ **Each of the three persists to a *different* `uiState` key**
(`lightingPreviewPanelPosition`, `frameReferencePanelPosition`,
`referenceImagePanelPosition` — verified in `types/index.ts:166-175`). The
primitive is position-agnostic by design: the container chooses the key. Do not
unify the keys.

The drag mechanics live in `ui/hooks/useFloatingPanel.ts` (findings 03 W7); the
primitive is its presentational shell.

---

### ThumbnailCanvas

```ts
export interface ThumbnailCanvasProps {
  /** Layers to composite, bottom-first. */
  layers: Layer[];
  gridSize: { width: number; height: number };
  /** Project-level variant groups, for resolving variant layers. */
  variants?: VariantGroup[];
  /** Base frame index — needed for the 4-level variant-offset fallback. */
  baseFrameIndex?: number;
  size: number;                     // rendered px, square
  /** Bump to force a redraw. Replaces the 91-line memo comparator at
   *  FramesView.tsx:15-163 — see the risk note in findings 03 W10. */
  revision?: number;
  showCheckerboard?: boolean;       // default true
  className?: string;
}
```

BEM: `thumbnail`, `thumbnail__canvas`. **Replaces 5 implementations** (findings 03
D5): `FramesView.tsx:15-163`, `VariantView.tsx:16-75`, `TimelineView.tsx:47-128`,
plus the ones inside `ObjectSelectModal.tsx` and `CopyFromModal.tsx`.
Internally delegates to `utils/previewRenderer.ts` — which findings 03 notes
"should absorb more callers" and `TimelineView` currently bypasses by re-blitting.

---

### ColorSwatch

```ts
export interface ColorSwatchProps {
  color: Color;                     // { r, g, b, a }
  size?: number;                    // default 20
  selected?: boolean;
  onClick?: (color: Color) => void;
  onRemove?: () => void;
  /** Tooltip format. "hex" → "#RRGGBB"; "rgba" → "R:255 G:0 B:0 A:255".
   *  Both forms exist today; pick one per call site during migration. */
  titleFormat?: "hex" | "rgba" | "none";
  showCheckerboard?: boolean;       // for alpha < 255
  className?: string;
}
```

BEM: `color-swatch`, `color-swatch__remove`; modifiers `color-swatch--selected`.
**Replaces 3 implementations**: `LayerColors.tsx:270-278` and
`ColorPicker.tsx:421-429` share both the `rgba(...)` expression **and** the
hex-`title` construction character-for-character; `PaletteManager.tsx:118-125`
uses the third (`R:/G:/B:/A:`) form. The CSS is triplicated across three files.

---

### Panel

```ts
export interface PanelProps {
  title?: React.ReactNode;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
  /** Tighter padding + smaller header. The `.compact-panel` idiom. */
  compact?: boolean;
  collapsible?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Wraps the body in an overflow:auto element. */
  scrollable?: boolean;
  className?: string;
}
```

BEM: `panel`, `panel__header`, `panel__title`, `panel__actions`, `panel__content`,
`panel__scroll`; modifiers `panel--compact`, `panel--collapsed`.

Findings 04 measured that `.panel`/`.panel-header`/`.panel-content` in `index.css`
is already "a de-facto shared component that nobody declared", used by
`LayerPanel`, `PixelStudioPanel`, `LightingStudioPanel`, `RightSidebarTopControls`,
and that `panel-header` disagrees on nesting between the container form
(`LayerPanel.tsx:145-147`) and the bare-text form (`ColorPicker.tsx:415`,
`RightSidebarTopControls.tsx:100,128`, `PixelStudioPanel.tsx:31,86,146`) — with
`LightingStudioPanel.tsx:19` and `:83` using **both forms in one file**. The
primitive resolves this by making the container form the only form.

---

### Dropdown

```ts
export interface DropdownOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: LucideIcon;
  disabled?: boolean;
}

export interface DropdownProps<T extends string> {
  value: T;
  options: readonly DropdownOption<T>[];
  onChange: (value: T) => void;
  label: string;                    // accessible name
  labelHidden?: boolean;
  placement?: "bottom-start" | "bottom-end";
  disabled?: boolean;
  className?: string;
}
```

BEM: `dropdown`, `dropdown__trigger`, `dropdown__menu`, `dropdown__option`;
modifiers `dropdown--open`, `dropdown__option--selected`.

**Replaces 1 site** — `ViewModeDropdown`, inlined at `FrameTimeline.tsx:11-76`
with its own click-outside effect. Extracted despite the single call site because
the timeline's `viewModeDropdown: ReactNode` prop (`FramesView.tsx:337`,
`TimelineView.tsx:135`, `VariantView.tsx`) already forces it to be a passable
element — the abstraction is load-bearing, not speculative.

**a11y:** `role="listbox"`/`option`, arrow-key navigation, Escape to close,
`aria-expanded` on the trigger. None of this exists today.

---

### Icon · Field · EmptyState · Badge

```ts
// Icon — already exists at components/Icon/Icon.tsx; move only, no changes.
export interface IconProps {
  icon: LucideIcon;
  size?: number;                    // default 14
  className?: string;
  strokeWidth?: number;
}

// Field — the label+control+hint row, ~30 ad-hoc sites
export interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  layout?: "row" | "column";        // default "row"
  children: React.ReactNode;
}

// EmptyState — .empty-state is defined identically in 3 stylesheets today
export interface EmptyStateProps {
  message: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
}

// Badge — .selected-badge and .current-badge, 3 call sites each,
// currently rendering in 3 different colours because of a CSS collision
export interface BadgeProps {
  children: React.ReactNode;
  variant?: "selected" | "current" | "neutral" | "accent";
  size?: "sm" | "md";
  /** Absolutely positioned in the corner of the parent (the current idiom). */
  corner?: boolean;
}
```

BEM: `icon` · `field`, `field__label`, `field__control`, `field__hint`,
`field__error` · `empty-state`, `empty-state__icon`, `empty-state__message` ·
`badge`, modifiers `badge--selected|current|neutral|accent`, `badge--corner`.

`Badge` deserves a note: findings 04 measured `.selected-badge` defined in three
stylesheets with **three different fill colours** (`#8b5cf6` violet, `#6366f1`
indigo, `#10b981` green) — and `ObjectSelectModal`'s green currently wins for all
three because it is emitted last. The primitive makes the colour an explicit
`variant` choice per call site instead of a bundle-order accident.

---

## Layouts

### Verification against the real `App.tsx` — the brief's four candidates are wrong

The task brief proposed `PixelStudioLayout`, `LightingStudioLayout`,
`ProjectSelectLayout`, `ObjectLibraryLayout`. Reading `App.tsx` (239 lines) end to
end and grepping every mount site settles it:

**The app has exactly ONE shell** (`App.tsx:169-235`), with **one binary branch**
inside the centre region:

```
App.tsx:170   <div className="app">
     :171       <Header />                                    ← always
     :173       <div className="main-content">
     :175-182     {!isFocusMode && <aside className="side-panel left-panel">   ← conditional
     :178             <ObjectLibrary />
     :179             <LayerPanel />
     :185       <main className="canvas-area">
     :186         <Toolbar … />                               ← always
     :190         {isLightingMode                             ← ★ THE ONLY BRANCH
     :191           ? <LightingCanvas />
     :193-213     : <> <Canvas … /> <FrameReferencePanel? /> <ReferenceImagePanel /> </>}
     :215         {!isLightingMode && <CanvasInfo … />}
     :216         {!isLightingMode && <LayerColors />}
     :220       <aside className="side-panel right-panel">    ← always
     :222         <RightSidebarTopControls />
     :223         {isLightingMode ? <LightingStudioPanel /> : <PixelStudioPanel />}
     :229-233   {!isFocusMode && <footer className="bottom-panel"><FrameTimeline /></footer>}
```

**`ProjectSelectLayout` does not exist.** `ProjectSelectModal` is mounted from
`Header.tsx`, not `App.tsx`:

```sh
$ grep -rl '<ProjectSelectModal' client/src --include='*.tsx'
client/src/components/Header/Header.tsx
```

There is no routing, no entry screen, and no "select a project first" gate — the
app boots straight into the editor via `initProject()` at `App.tsx:65-67`, showing
only a `loading-screen` (`App.tsx:154-164`) while it resolves. Project switching
happens *inside* the running editor through a modal.

**`ObjectLibraryLayout` does not exist.** `ObjectLibrary` is mounted exactly once,
as the top half of the left sidebar (`App.tsx:178`). It is a **region**, not a page.

**Complete modal mount-site map** (proof that no modal is a page):

| Modal | Mounted by |
| --- | --- |
| `ProjectSelectModal`, `BrowseBackupsModal`, `ExportPreviewModal` | `Header.tsx` |
| `AddVariantModal`, `CopyFromModal`, `VariantSelectModal` | `LayerPanel.tsx` |
| `AIInterpolateModal`, `FrameTagsModal`, `ResizeModal` | `FramesView.tsx`, `VariantView.tsx` |
| `PreviewModal` | `FramesView.tsx`, `TimelineView.tsx`, `VariantView.tsx` |
| `EdgeInterpolateModal`, `HeightMapModal` | `Toolbar/LightingStudioTools.tsx` |
| `ReferenceImageModal` | `Toolbar/PixelStudioTools.tsx` |
| `ObjectSelectModal` | `FrameReferencePanel.tsx` |

Reproduce:
```sh
cd client/src && for m in AddVariantModal AIInterpolateModal BrowseBackupsModal \
  CopyFromModal EdgeInterpolateModal ExportPreviewModal FrameTagsModal HeightMapModal \
  ObjectSelectModal PreviewModal ProjectSelectModal ReferenceImageModal ResizeModal \
  VariantSelectModal; do
  echo "$m <- $(grep -rl "<$m" --include='*.tsx' . | grep -v "/$m/$m.tsx" | tr '\n' ' ')"
done
```

### Conclusion: 2 layouts

`PixelStudioLayout` and `LightingStudioLayout` are the two branches of
`isLightingMode`. They share the shell chrome (Header, sidebars, timeline), which
is factored into a third, **non-layout** component — `AppShell` — that lives in
`ui/components/` because it is a region composer, not a page.

A third layout, **`LoadingLayout`**, is added: `App.tsx:154-164` is a genuine
full-screen alternative view with its own markup and no shared chrome. It is
trivial (12 lines) but it is a real page state and deserves a story so the
loading experience is reviewable. Counted separately below; the headline "2" is
the number of *editor* layouts.

---

### `AppShell` (`ui/components/AppShell/`) — the shared chrome

Not a layout: it composes regions but does not decide what the page *is*. Both
layouts render it.

```ts
export interface AppShellProps {
  header: React.ReactNode;
  toolbar: React.ReactNode;
  /** Left sidebar. Omit (or pass null) to hide — this is focus mode. */
  leftPanel?: React.ReactNode;
  rightPanel: React.ReactNode;
  /** Bottom timeline. Omit to hide — focus mode again. */
  bottomPanel?: React.ReactNode;
  /** The centre region: canvas + its floating panels + info strip. */
  children: React.ReactNode;
  /** Ref for the canvas area — FloatingPanel needs it as its drag bounds. */
  canvasAreaRef?: React.RefObject<HTMLElement>;
}
```

BEM: `app`, `app__main`, `app__side-panel`, `app__canvas-area`, `app__bottom`;
modifiers `app__side-panel--left|right`, `app--focus`. This is findings 04's
`App.css` block (CSS-19), and it is where the measured `.canvas-area` collision
with `ReferenceImageModal.css` gets resolved.

---

### `PixelStudioLayout`

**Composes:** `AppShell` ← { `Header`, `Toolbar` + `PixelStudioTools`,
left = `ObjectLibrary` + `LayerPanel`, right = `RightSidebarTopControls` +
`PixelStudioPanel` (which itself holds `ColorPicker` + `PaletteManager`),
bottom = `FrameTimeline` (→ `FramesView` | `TimelineView` | `VariantView`) },
centre = `CanvasSurface` + `FrameReferencePanel`? + `ReferenceImagePanel` +
`CanvasInfo` + `LayerColors`.

```ts
// client/src/ui/layouts/PixelStudioLayout/PixelStudioLayout.tsx
export interface PixelStudioLayoutProps {
  /** Every region is injected as an element. The layout owns arrangement and
   *  visibility, never data. This is what makes it storyable with stubs. */
  header: React.ReactNode;
  toolbar: React.ReactNode;
  objectLibrary: React.ReactNode;
  layerPanel: React.ReactNode;
  rightControls: React.ReactNode;
  studioPanel: React.ReactNode;
  timeline: React.ReactNode;
  canvas: React.ReactNode;
  canvasInfo: React.ReactNode;
  layerColors: React.ReactNode;

  /** Floating overlays inside the canvas area. */
  frameReferencePanel?: React.ReactNode;
  referenceImagePanel?: React.ReactNode;

  /** App.tsx:167 — hides left sidebar and bottom timeline. */
  focusMode: boolean;
  /** App.tsx:199 — uiState.frameReferencePanelVisible !== false */
  frameReferencePanelVisible: boolean;
  /** App.tsx:177 — canvas-info visibility. */
  canvasInfoHidden?: boolean;

  canvasAreaRef?: React.RefObject<HTMLElement>;
}
```

**Container:** `containers/PixelStudioContainer.tsx` — an `observer()` that reads
`uiStore.focusMode`, `uiStore.frameReferencePanelVisible`,
`uiStore.canvasInfoHidden` and renders each region's own container:

```tsx
export const PixelStudioContainer = observer(function PixelStudioContainer() {
  const { ui } = useStores();
  const canvasAreaRef = useRef<HTMLElement>(null);
  return (
    <PixelStudioLayout
      focusMode={ui.focusMode}
      frameReferencePanelVisible={ui.frameReferencePanelVisible}
      canvasInfoHidden={ui.canvasInfoHidden}
      canvasAreaRef={canvasAreaRef}
      header={<HeaderContainer />}
      toolbar={<ToolbarContainer />}
      objectLibrary={<ObjectLibraryContainer />}
      layerPanel={<LayerPanelContainer />}
      rightControls={<RightSidebarTopControlsContainer />}
      studioPanel={<PixelStudioPanelContainer />}
      timeline={<FrameTimelineContainer />}
      canvas={<CanvasContainer />}
      canvasInfo={<CanvasInfoContainer />}
      layerColors={<LayerColorsContainer />}
      frameReferencePanel={<FrameReferencePanelContainer boundsRef={canvasAreaRef} />}
      referenceImagePanel={<ReferenceImagePanelContainer boundsRef={canvasAreaRef} />}
    />
  );
});
```

**Why regions are `ReactNode` and not data.** The alternative — passing `project`,
`layers`, `frames`, `palettes`, `selection`, … down through the layout — would
give the layout a 40-prop interface and force every state change anywhere in the
app to re-render the whole tree. Injecting elements keeps the layout's own
interface at 14 props, keeps MobX's fine-grained `observer()` granularity intact
(each region container re-renders independently), and makes the layout story
trivially composable from stubs. This is the standard container/layout split and
it is the reason the layout tier is worth having at all.

---

### `LightingStudioLayout`

**Composes:** `AppShell` ← { `Header`, `Toolbar` + `LightingStudioTools`,
left = `ObjectLibrary` + `LayerPanel`, right = `RightSidebarTopControls` +
`LightingStudioPanel` (→ `LightControl` + `NormalPicker`),
bottom = `FrameTimeline` }, centre = `LightingSurface` + `LightingPreviewPanel`.

Note the measured asymmetries vs the pixel layout, all from `App.tsx:190-216`:
lighting mode renders **no** `CanvasInfo`, **no** `LayerColors`, **no**
`FrameReferencePanel` and **no** `ReferenceImagePanel`. It has its own floating
overlay instead (`LightingPreviewPanel`, extracted from `LightingCanvas.tsx:713-835`).

```ts
export interface LightingStudioLayoutProps {
  header: React.ReactNode;
  toolbar: React.ReactNode;
  objectLibrary: React.ReactNode;
  layerPanel: React.ReactNode;
  rightControls: React.ReactNode;
  studioPanel: React.ReactNode;
  timeline: React.ReactNode;
  canvas: React.ReactNode;

  /** The floating lighting preview. */
  previewPanel?: React.ReactNode;

  focusMode: boolean;
  canvasAreaRef?: React.RefObject<HTMLElement>;
}
```

**Container:** `containers/LightingStudioContainer.tsx` — same shape as above,
reading `ui.focusMode` and rendering `LightingCanvasContainer`,
`LightingStudioPanelContainer`, `LightingPreviewPanelContainer`.

---

### `LoadingLayout`

From `App.tsx:154-164`. A real full-screen state, worth one story so it is
reviewable rather than accidental.

```ts
export interface LoadingLayoutProps {
  title?: string;      // default "Loading Pixel Art Editor"
  message?: string;    // default "Preparing your workspace..."
}
```

BEM: `loading-screen`, `loading-screen__content`, `loading-screen__spinner`,
`loading-screen__title`, `loading-screen__message`.

---

### `AppContainer` — the top-level switch

`App.tsx` becomes a ~40-line container. Its two current `useEffect` blocks are
**not** layout concerns and must be relocated:

| `App.tsx` today | Goes to |
| --- | --- |
| `:65-67` `initProject()` on mount | `AppContainer` (a store call — correct tier) |
| `:70-88` reference-image restore from project | **`DomainStore` action**, triggered on project load. Depends on findings 03 W18. |
| `:91-152` window keydown: Escape→clearColorAdjustment, `` ` ``→focusMode, ``Shift+` ``→studioMode | `containers/GlobalHotkeys.tsx` — a headless container. Must **not** live in `ui/`: it calls three store actions. |
| `:45-63` `handleReferenceImageChange` | `UIStore` action + `DomainStore` action |

```tsx
export const AppContainer = observer(function AppContainer() {
  const { domain, ui } = useStores();
  useEffect(() => { void domain.initProject(); }, [domain]);
  if (domain.isLoading || !domain.project) return <LoadingLayout />;
  return (
    <>
      <GlobalHotkeys />
      {ui.studioMode === "lighting"
        ? <LightingStudioContainer />
        : <PixelStudioContainer />}
    </>
  );
});
```

---

## Purification plan

One subsection per store-coupled component that lands in `ui/`. Store members
below are the **measured** destructure lists, extracted mechanically:

```sh
cd client/src && python3 - <<'PY'
import re, glob
for f in sorted(glob.glob('**/*.tsx', recursive=True)):
    for m in re.finditer(r'const\s*\{([^}]*)\}\s*=\s*useEditorStore\(\)', open(f).read(), re.S):
        names = [n.strip().split(':')[0].strip() for n in m.group(1).split(',') if n.strip()]
        print(f"{f}\t{len(names)}\t{', '.join(names)}")
PY
```

Ordering is by **ascending effort**, which is also the recommended execution
order — the early ones are proof that the pattern works before the hard ones start.

**Convention used throughout:** a store *field* becomes a value prop; a store
*action* becomes an `on…`/imperative callback prop; a store *getter*
(`getCurrentObject()`, `getCurrentLayer()`, …) becomes a **resolved value prop**,
not a function prop — the container calls the getter and passes the result. This
matters: passing `getCurrentObject` through would defeat MobX's dependency
tracking and re-render the pure component on every store change.

---

### ObjectSelectModal — the reference conversion

`components/ObjectSelectModal/ObjectSelectModal.tsx` · 185 lines · **1 store member**

| Store field | → prop |
| --- | --- |
| `project` (read: `project.objects`, `project.variants`) | `objects: PixelObject[]`, `variants?: VariantGroup[]` |

No store actions. Existing props (`selectedObjectId`, `onSelect`, `onClose`) are
already correct.

```ts
export interface ObjectSelectModalProps {
  isOpen?: boolean;
  objects: PixelObject[];
  variants?: VariantGroup[];
  selectedObjectId: string | null;
  onSelect: (objectId: string | null) => void;
  onClose: () => void;
}
```

**Container:** `ObjectSelectModalContainer` · **Effort:** S · **Risk:** minimal —
one field, no actions, and it already has a proper props interface. **Do this one
first** as the pattern reference for every other conversion.

---

### CanvasInfo

`components/Canvas/CanvasInfo.tsx` · 146 lines · **7 members** (two hook calls: 6 at :12-19, 1 at :51)

| Store field / getter | → prop |
| --- | --- |
| `project` (→ `uiState.zoom`, `uiState.canvasInfoHidden`) | `zoom: number`, `hidden: boolean` |
| `selection` | `selection: SelectionBox \| null` |
| `referenceOverlayOffset` | `referenceOverlayOffset: { x: number; y: number }` |
| `getCurrentObject()` | `object: PixelObject \| null` |
| `getCurrentVariant()` | `variant: VariantContext \| null` |
| `isEditingVariant()` | `isEditingVariant: boolean` |

| Store action | → callback |
| --- | --- |
| `setCanvasInfoHidden` | `onHiddenChange: (hidden: boolean) => void` |

```ts
export interface CanvasInfoProps {
  object: PixelObject | null;
  variant: VariantContext | null;
  isEditingVariant: boolean;
  zoom: number;
  selection: SelectionBox | null;
  referenceOverlayOffset: { x: number; y: number };
  referenceImage?: ReferenceImageData | null;
  hidden: boolean;
  onHiddenChange: (hidden: boolean) => void;
}
```

**Container:** `CanvasInfoContainer` · **Effort:** S · **Risk:** low — all reads
plus one toggle.

---

### NormalPicker

`components/LightingStudioPanel/NormalPicker.tsx` · 261 lines · **3 members**

| Store | → prop |
| --- | --- |
| `project.uiState.selectedNormal` / `.lightDirection` | `normal: Normal` |
| `setSelectedNormal` / `setLightDirection` | `onChange: (normal: Normal) => void` |

The existing `isLightDirection` prop currently *selects which store field to read
and which action to call*. Purified, that decision moves to the container and the
component becomes genuinely reusable:

```ts
export interface NormalPickerProps {
  normal: Normal;
  onChange: (normal: Normal) => void;
  enableScrollControl?: boolean;
  size?: number;
  disabled?: boolean;
}
```

**Containers:** two — `SelectedNormalPickerContainer` and
`LightDirectionPickerContainer`. This is a case where purification **removes** a
prop and **adds** a container, which is the right trade.
**Effort:** S · **Risk:** low.

---

### LightControl

`components/LightingStudioPanel/LightControl.tsx` · 281 lines · **4 members**

| Store | → prop |
| --- | --- |
| `project.uiState.lightColor` | `lightColor: Color` |
| `project.uiState.ambientColor` | `ambientColor: Color` |
| `project.uiState.heightScale` | `heightScale: number` |
| `setLightColor` | `onLightColorChange: (c: Color) => void` |
| `setAmbientColor` | `onAmbientColorChange: (c: Color) => void` |
| `setHeightScale` | `onHeightScaleChange: (v: number) => void` |

```ts
export interface LightControlProps {
  lightColor: Color;
  ambientColor: Color;
  heightScale: number;
  onLightColorChange: (color: Color) => void;
  onAmbientColorChange: (color: Color) => void;
  onHeightScaleChange: (scale: number) => void;
}
```

**Container:** `LightControlContainer` · **Effort:** S · **Risk:** low.
Adopt `SliderWithNumber` in the same change — it collapses the 4 duplicated
range+number rows at `:149,169,194,254` (~120 lines).

---

### LightingStudioPanel

`components/LightingStudioPanel/LightingStudioPanel.tsx` · 90 lines · **4 members**

```ts
export interface LightingStudioPanelProps {
  brushSize: number;
  normalBrushShape: "circle" | "square";
  heightBrushValue: number;
  onBrushSizeChange: (size: number) => void;
  onNormalBrushShapeChange: (shape: "circle" | "square") => void;
  onHeightBrushValueChange: (value: number) => void;
  /** Injected regions — LightControl and NormalPicker have their own containers. */
  lightControl: React.ReactNode;
  normalPicker: React.ReactNode;
}
```

**Container:** `LightingStudioPanelContainer` · **Effort:** S · **Risk:** low.

---

### PixelStudioPanel

`components/PixelStudioPanel/PixelStudioPanel.tsx` · 190 lines · **8 members** across 2 hook calls

| Store | → prop |
| --- | --- |
| `project.uiState.brushSize / eraserShape / pencilBrushShape / pencilBrushMax / originColor` | 5 value props |
| `getCurrentObject().origin` | `origin: { x: number; y: number } \| undefined` |
| `setBrushSize`, `setEraserShape`, `setPencilBrushShape`, `setPencilBrushMax`, `setOriginColor` | 5 callbacks |

```ts
export interface PixelStudioPanelProps {
  brushSize: number;
  eraserShape: "circle" | "square";
  pencilBrushShape: "circle" | "square";
  pencilBrushMax: 8 | 16 | 32 | 64 | 128;
  originColor?: Color;
  origin?: { x: number; y: number };
  onBrushSizeChange: (size: number) => void;
  onEraserShapeChange: (shape: "circle" | "square") => void;
  onPencilBrushShapeChange: (shape: "circle" | "square") => void;
  onPencilBrushMaxChange: (max: 8 | 16 | 32 | 64 | 128) => void;
  onOriginColorChange: (color: Color) => void;
  colorPicker: React.ReactNode;
  paletteManager: React.ReactNode;
}
```

**Container:** `PixelStudioPanelContainer` · **Effort:** S · **Risk:** low.

---

### PaletteManager

`components/PaletteManager/PaletteManager.tsx` · 167 lines · **7 members**

```ts
export interface PaletteManagerProps {
  palettes: Palette[];
  selectedColor: Color;
  onColorSelect: (color: Color) => void;
  onPaletteAdd: (name: string) => void;
  onPaletteDelete: (paletteId: string) => void;
  onPaletteRename: (paletteId: string, name: string) => void;
  onColorAddToPalette: (paletteId: string, color: Color) => void;
  onColorRemoveFromPalette: (paletteId: string, colorIndex: number) => void;
}
```

**Container:** `PaletteManagerContainer` · **Effort:** S · **Risk:** low.
Adopt `ColorSwatch` here (one of its 3 implementations, `:118-125`).

---

### Toolbar / PixelStudioTools / LightingStudioTools

`components/Toolbar/Toolbar.tsx` · 166 lines · **5 members**

```ts
export interface ToolbarProps {
  studioMode: StudioMode;
  focusMode: boolean;
  lightGridMode: boolean;
  frameReferencePanelVisible: boolean;
  onStudioModeChange: (mode: StudioMode) => void;
  onFocusModeToggle: () => void;
  onLightGridModeToggle: () => void;
  onFrameReferencePanelVisibleToggle: () => void;
  /** The mode-specific tool strip. */
  tools: React.ReactNode;
}
```

`components/Toolbar/PixelStudioTools.tsx` · 139 lines · **4 members**

```ts
export interface PixelStudioToolsProps {
  selectedTool: Tool;
  hasReferenceImage: boolean;
  onToolChange: (tool: Tool) => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  onOpenReferenceImage: () => void;
}
```

`components/Toolbar/LightingStudioTools.tsx` · 308 lines · **11 members**

| Store | → prop |
| --- | --- |
| `project.uiState.selectedTool`, `.lightingDataLayerEditMode` | 2 value props |
| `getCurrentLayer()`, `getCurrentObject()`, `getCurrentFrame()`, `getCurrentVariant()`, `isEditingVariant()` | resolved into a single `target: LightingEditTarget` prop |
| `setTool`, `setNormalPixels`, `setHeightPixels`, `computeNormalsForAllFrames`, `setLightingDataLayerEditMode` | 5 callbacks |

```ts
/** The resolved edit target: which layer of which frame (base or variant) the
 *  lighting operations apply to. Replaces 5 getter calls with one value. */
export interface LightingEditTarget {
  objectId: string;
  frameIndex: number;
  layerId: string;
  gridSize: { width: number; height: number };
  isVariant: boolean;
  variantId?: string;
}

export interface LightingStudioToolsProps {
  selectedTool: Tool;
  editMode: "normals" | "height";
  target: LightingEditTarget | null;
  onToolChange: (tool: Tool) => void;
  onEditModeChange: (mode: "normals" | "height") => void;
  onApplyNormals: (params: EdgeInterpolateParams) => void;
  onApplyHeightMap: (params: HeightMapParams) => void;
  onComputeNormalsForAllFrames: () => void;
}
```

**Containers:** `ToolbarContainer`, `PixelStudioToolsContainer`,
`LightingStudioToolsContainer` · **Effort:** S / S / M · **Risk:** low, low, med.
The `LightingEditTarget` collapse is the interesting part: **5 store getters
become 1 prop**, which is the pattern that keeps the other big components from
exploding. Use it wherever `getCurrentX()` chains appear.

---

### CopyFromModal · AddVariantModal · VariantSelectModal · FrameTagsModal · HeightMapModal

Five small modals, all **S**, all the same shape.

```ts
export interface CopyFromModalProps {                    // 3 members
  isOpen?: boolean;
  objects: PixelObject[];
  variants?: VariantGroup[];
  currentObjectId: string | null;
  onCopyLayer: (fromObjectId: string, layerId: string) => void;
  onClose: () => void;
}

export interface AddVariantModalProps {                  // 4 members
  isOpen?: boolean;
  variantGroups: VariantGroup[];
  onAddVariantLayerFromExisting: (variantGroupId: string) => void;
  onDeleteVariantGroup: (variantGroupId: string) => void;
  onRenameVariantGroup: (variantGroupId: string, name: string) => void;
  onClose: () => void;
}

export interface VariantSelectModalProps {               // 5 members
  isOpen?: boolean;
  layer: Layer;
  variantGroup: VariantGroup;
  onSelectVariant: (variantId: string) => void;
  onAddVariant: (name: string) => void;
  onDeleteVariant: (variantId: string) => void;
  onRenameVariant: (variantId: string, name: string) => void;
  onResizeVariant: (variantId: string, w: number, h: number, anchor: AnchorPosition) => void;
  onClose: () => void;
}

export interface FrameTagsModalProps {                   // 5 selector-style reads
  isOpen?: boolean;
  context: FrameTagsContext;
  tags: string[];
  /** All tags used anywhere in the project, for autocomplete. */
  knownTags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onClose: () => void;
}

export interface HeightMapModalProps {                   // 5 members
  isOpen?: boolean;
  /** Preview source: the layer the height map will be derived from. */
  sourceLayer: Layer | null;
  gridSize: { width: number; height: number };
  onConfirm: (params: { channel: ChannelType; min: number; max: number }) => void;
  onClose: () => void;
}
```

`FrameTagsModal` is the only component in the codebase using selector-style
`useEditorStore((s) => …)` (5 calls at `:41-45`) — which means it is the only one
already doing fine-grained subscription correctly. Its container is a direct
translation.

**Effort:** S each · **Risk:** low each.

---

### LayerColors

`components/LayerColors/LayerColors.tsx` · 295 lines · **9 members**

| Store | → prop |
| --- | --- |
| `project` (→ `uiState.selectedColor`) | `selectedColor: Color` |
| `getCurrentLayer()`, `getCurrentObject()`, `getCurrentVariant()`, `getSelectedVariantLayer()`, `isEditingVariant()` | collapsed to `layer: Layer \| null` + `gridSize` |
| `colorAdjustment` | `adjustment: ColorAdjustmentState \| null` |
| `startColorAdjustment` | `onStartAdjustment: (color: Color) => void` |
| `clearColorAdjustment` | `onClearAdjustment: () => void` |

```ts
export interface LayerColorsProps {
  /** Distinct colours in the active layer, with their pixel counts. Derived by
   *  the container — the current component recomputes this from the layer on
   *  every render via a useMemo. */
  colors: { color: Color; count: number }[];
  selectedColor: Color;
  adjustment: ColorAdjustmentState | null;
  onStartAdjustment: (color: Color) => void;
  onClearAdjustment: () => void;
  onAdjustmentChange: (adjustment: ColorAdjustmentState) => void;
}
```

**Container:** `LayerColorsContainer` · **Effort:** M · **Risk:** med — the
container now owns the colour-extraction memo, and getting its invalidation wrong
means stale swatches. Also fix the 3 keyboard-inoperable toggles at
`:169-180`, `:197-208`, `:254` by adopting `Toggle`.

---

### ColorPicker

`components/ColorPicker/ColorPicker.tsx` · 673 lines · **6 members**

```ts
export interface ColorPickerProps {
  color: Color;
  onChange: (color: Color) => void;
  /** Fired on pointer release — the current component writes to the store on
   *  every mousemove across two canvases. */
  onCommit?: (color: Color) => void;
  history: Color[];
  onHistorySelect: (color: Color) => void;
  adjustment: ColorAdjustmentState | null;
  onAdjustColor: (adjustment: ColorAdjustmentState) => void;
  onSaveStateToHistory: () => void;
}
```

**Container:** `ColorPickerContainer` · **Effort:** M · **Risk:** med.
**Prerequisite:** extract `ui/utils/colorMath.ts` (HSL↔RGB conversion, the two
canvas gradient painters) first — findings 03 gives this a SPLIT verdict for
exactly this reason, and the extracted math is a pure unit-test target.

---

### FrameTimeline · FramesView · VariantView

`FrameTimeline.tsx` · 251 lines · **6 members**

```ts
export interface FrameTimelineProps {
  object: PixelObject | null;
  layer: Layer | null;
  variant: VariantContext | null;
  viewMode: "frames" | "timeline" | "variant";
  onViewModeChange: (mode: "frames" | "timeline" | "variant") => void;
  onSelectFrame: (frameIndex: number) => void;
  onAdvanceVariantFrames: (delta: number) => void;
  /** The active view, injected by the container. */
  view: React.ReactNode;
}
```

`FramesView.tsx` · 684 lines · **8 members** (all actions; it already takes
`project`/`obj` as props)

```ts
export interface FramesViewProps {
  project: Project;
  obj: PixelObject;
  isPlaying: boolean;
  togglePlayback: () => void;
  showPreview: boolean;
  setShowPreview: (show: boolean) => void;
  viewModeDropdown: React.ReactNode;

  onAddFrame: () => void;
  onDeleteFrame: (frameIndex: number) => void;
  onRenameFrame: (frameIndex: number, name: string) => void;
  onSelectFrame: (frameIndex: number) => void;
  onDuplicateFrame: (frameIndex: number) => void;
  onMoveFrame: (from: number, to: number) => void;
  onReorderFrame: (from: number, to: number) => void;
  onResizeObject: (w: number, h: number, anchor: AnchorPosition) => void;
}
```

`VariantView.tsx` · 617 lines · **9 members** (also all actions)

```ts
export interface VariantViewProps {
  project: Project;
  obj: PixelObject;
  layer: Layer;
  variantData: {
    variantGroup: VariantGroup;
    variant: Variant;
    variantFrame: VariantFrame;
    baseFrameIndex: number;
    offset: { x: number; y: number };
  };
  isPlaying: boolean;
  togglePlayback: () => void;
  showPreview: boolean;
  setShowPreview: (show: boolean) => void;
  viewModeDropdown: React.ReactNode;

  onSelectFrame: (frameIndex: number) => void;
  onSelectVariantFrame: (frameIndex: number) => void;
  onAddVariantFrame: () => void;
  onDuplicateVariantFrame: (frameIndex: number) => void;
  onDeleteVariantFrame: (frameIndex: number) => void;
  onMoveVariantFrame: (from: number, to: number) => void;
  onReorderFrame: (from: number, to: number) => void;
  onReorderVariantFrame: (from: number, to: number) => void;
  onResizeVariant: (w: number, h: number, anchor: AnchorPosition) => void;
}
```

**Containers:** `FrameTimelineContainer`, `FramesViewContainer`,
`VariantViewContainer` · **Effort:** M / L / L · **Risk:** med / med-high /
med-high.

**Sequencing note:** these two are already half-pure — they take `project` and
`obj` as props and reach into the store only for **actions**. That is the easiest
possible purification shape. But they must land **after** findings 03 W10
(`useDragReorder` + `ThumbnailCanvas`), because `VariantView` contains ~200 lines
of drag-reorder duplicated **against itself** and converting it twice is wasted work.

---

### FrameReferencePanel · ReferenceImagePanel

`FrameReferencePanel.tsx` · 477 lines · **10 members**

```ts
export interface FrameReferencePanelProps {
  /** Object being referenced (may differ from the edited object). */
  referenceObject: PixelObject | null;
  currentObject: PixelObject | null;
  objects: PixelObject[];
  variants?: VariantGroup[];

  position: { topPercent: number; leftPercent: number };
  minimized: boolean;
  onPositionChange: (p: { topPercent: number; leftPercent: number }) => void;
  onMinimizedChange: (minimized: boolean) => void;
  boundsRef: React.RefObject<HTMLElement>;

  frameTraceActive: boolean;
  frameTraceFrameIndex: number | null;
  onFrameTraceActiveChange: (active: boolean) => void;
  onReferenceObjectIdChange: (objectId: string | null) => void;

  overlayFrameIndex: number | null;
  onOverlayChange: (frameIndex: number | null) => void;
}
```

`ReferenceImagePanel.tsx` · 434 lines · **4 members**

```ts
export interface ReferenceImagePanelProps {
  referenceImage: ReferenceImageData | null;
  onReferenceImageChange: (data: ReferenceImageData | null) => void;
  isReferenceTraceActive: boolean;
  onToolChange: (tool: Tool) => void;
  zoom: number;

  position: { topPercent: number; leftPercent: number };
  minimized: boolean;
  onPositionChange: (p: { topPercent: number; leftPercent: number }) => void;
  onMinimizedChange: (minimized: boolean) => void;
  boundsRef: React.RefObject<HTMLElement>;
}
```

**Containers:** `FrameReferencePanelContainer`, `ReferenceImagePanelContainer` ·
**Effort:** M each · **Risk:** med each.
Both depend on `FloatingPanel` + `useFloatingPanel` (findings 03 W7). The
`position`/`minimized`/`onPositionChange`/`onMinimizedChange`/`boundsRef` quintet
is identical across all three floating panels — that repetition is intentional and
correct, because each container binds a **different** `uiState` key.

---

### ProjectSelectModal · BrowseBackupsModal · ExportPreviewModal

The three components that currently perform their own I/O.

```ts
export interface ProjectSelectModalProps {               // 6 store members + async
  isOpen?: boolean;
  projects: string[];
  currentProjectName: string;
  isLoading?: boolean;
  error?: string | null;
  onSwitchProject: (name: string) => void;
  onCreateProject: (name: string) => void;
  onDeleteProject: (name: string) => void;
  onRefresh: () => void;
  onClose: () => void;
}

export interface BrowseBackupsModalProps {               // 2 store members + direct API
  isOpen?: boolean;
  projectName: string;
  /** Loaded by the container from the API — the component never fetches. */
  backups: BackupEntry[];
  isLoading?: boolean;
  error?: string | null;
  onRestore: (backupId: string) => void;
  onClose: () => void;
}

export interface ExportPreviewModalProps {               // 0 store members, but fetches
  isOpen?: boolean;
  kebabName: string;
  /** Fully-loaded export bundle. Fetching is the container's job. */
  data: LoadedExport | null;
  isLoading?: boolean;
  error?: string | null;
  onClose: () => void;
}
```

**Containers:** `ProjectSelectModalContainer`, `BrowseBackupsModalContainer`,
`ExportPreviewModalContainer` · **Effort:** M each · **Risk:** med.
The pattern is uniform: **the three async states (`isLoading`, `error`, `data`)
become props.** That is also what makes the loading and error states storyable,
which they are not today.

---

### Header

`components/Header/Header.tsx` · 319 lines · **6 members** · **14 `useState`**

Split first (findings 03 verdict SPLIT: extract the AI-config popover), then:

```ts
export interface HeaderProps {
  projectName: string;
  projectList: string[];
  saveStatus: "idle" | "saving" | "saved" | "error";
  exportStatus: "idle" | "success" | "error";
  onRenameProject: (name: string) => void;
  onOpenProjectSelect: () => void;
  onOpenBrowseBackups: () => void;
  onExport: () => void;
  onOpenExportPreview: () => void;
  /** The AI-config popover, extracted into its own component. */
  aiConfig: React.ReactNode;
}

export interface AiConfigPopoverProps {
  serviceUrl: string;
  healthStatus: "unknown" | "ok" | "error";
  onServiceUrlChange: (url: string) => void;
  onCheckHealth: () => void;
}
```

**Containers:** `HeaderContainer`, `AiConfigPopoverContainer` · **Effort:** M ·
**Risk:** med. Note `aiServiceUrl` is flagged by findings 02 as a
**SessionStore** candidate (it is app config currently persisted per-project, so
switching projects changes the AI endpoint). Sequence after P2-06 settles this.

---

### ObjectLibrary

`components/ObjectLibrary/ObjectLibrary.tsx` · 643 lines · **8 members** · **15 `useState`**

Split the 5 inline dialogs out first (`ObjectRenameDialog`, `ObjectDeleteDialog`,
`ObjectResizeDialog`, `ObjectDuplicateDialog`, `ObjectCreateDialog`), each built
on `ConfirmDialog` or `Modal`. Then:

```ts
export interface ObjectLibraryProps {
  objects: PixelObject[];
  variants?: VariantGroup[];
  selectedObjectId: string | null;
  viewMode: "normal" | "small-rows" | "grid";
  onSelectObject: (objectId: string) => void;
  onAddObject: (name: string, width: number, height: number) => void;
  onDeleteObject: (objectId: string) => void;
  onRenameObject: (objectId: string, name: string) => void;
  onDuplicateObject: (objectId: string) => void;
  onResizeObject: (objectId: string, w: number, h: number, anchor: AnchorPosition) => void;
  onViewModeChange: (mode: "normal" | "small-rows" | "grid") => void;
}
```

**Container:** `ObjectLibraryContainer` · **Effort:** L · **Risk:** med.
The 15 `useState` are dialog open/close flags; after the dialog extraction the
component keeps ~4 of them.

---

### ⚠️ Flagged — split before purifying

These five would produce props interfaces of 19–52 entries. That is the signal
findings 03 predicted and this document confirms with measured counts. A large
props interface is not the problem; it is the *symptom*. Splitting first is
mandatory, not preferred.

---

#### `RightSidebarTopControls` — 16 members · split into 4 (do this one FIRST)

`components/RightSidebarTopControls/RightSidebarTopControls.tsx` · 403 lines ·
**0 hooks** (`grep -c 'useState\|useEffect\|useRef\|useCallback\|useMemo'` → **0**)

This resolves findings 03 open question 7 with a firm answer: it is structurally
presentational — **no internal state at all** — but it destructures 16 store
members. That combination makes it **the cheapest high-value purification in the
codebase and the best first Storybook subject**: there is no state machine to
preserve, only a mapping from 16 store members to props.

Measured members: `project`, `setZoom`, `setBrushSize`, `setPencilBrushMax`,
`setTraceNudgeAmount`, `setShapeMode`, `setBorderRadius`, `setMoveAllLayers`,
`setGaussianFillParams`, `setSelectionMode`, `setSelectionBehavior`, `selection`,
`expandSelection`, `shrinkSelection`, `clearSelection`, `frameTraceActive`.

Split into four cohesive groups, each 3–5 props:

```ts
// ui/components/RightSidebarTopControls/ZoomControls.tsx
export interface ZoomControlsProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

// ui/components/RightSidebarTopControls/BrushControls.tsx
export interface BrushControlsProps {
  brushSize: number;
  pencilBrushMax: 8 | 16 | 32 | 64 | 128;
  traceNudgeAmount: 10 | 20 | 25 | 50 | 100;
  frameTraceActive: boolean;
  onBrushSizeChange: (size: number) => void;
  onPencilBrushMaxChange: (max: 8 | 16 | 32 | 64 | 128) => void;
  onTraceNudgeAmountChange: (amount: 10 | 20 | 25 | 50 | 100) => void;
}

// ui/components/RightSidebarTopControls/ShapeControls.tsx
export interface ShapeControlsProps {
  shapeMode: ShapeMode;
  borderRadius: number;
  moveAllLayers: boolean;
  gaussianFill?: { smoothing: number; radius: number; radiusMax?: number };
  onShapeModeChange: (mode: ShapeMode) => void;
  onBorderRadiusChange: (radius: number) => void;
  onMoveAllLayersChange: (moveAll: boolean) => void;
  onGaussianFillChange: (p: { smoothing: number; radius: number; radiusMax?: number }) => void;
}

// ui/components/RightSidebarTopControls/SelectionControls.tsx
export interface SelectionControlsProps {
  selection: SelectionBox | null;
  selectionMode: SelectionMode;
  selectionBehavior: SelectionBehavior;
  onSelectionModeChange: (mode: SelectionMode) => void;
  onSelectionBehaviorChange: (behavior: SelectionBehavior) => void;
  onExpandSelection: () => void;
  onShrinkSelection: () => void;
  onClearSelection: () => void;
}

// The composer — 4 props instead of 18
export interface RightSidebarTopControlsProps {
  zoomControls: React.ReactNode;
  brushControls: React.ReactNode;
  shapeControls: React.ReactNode;
  selectionControls: React.ReactNode;
}
```

**Containers:** `ZoomControlsContainer`, `BrushControlsContainer`,
`ShapeControlsContainer`, `SelectionControlsContainer` (4), plus a trivial
`RightSidebarTopControlsContainer`.
**Effort:** M · **Risk:** low — no internal state to break. **Ship this first.**

---

#### `LayerPanel` — 22 members · split into 3

`components/LayerPanel/LayerPanel.tsx` · 501 lines · **22 members** · JSX depth **18** (deepest in the codebase)

Measured members: `project`, `getCurrentObject`, `getCurrentFrame`, `addLayer`,
`duplicateLayer`, `deleteLayer`, `renameLayer`, `toggleLayerVisibility`,
`toggleAllLayersVisibility`, `selectLayer`, `moveLayer`, `moveLayerAcrossAllFrames`,
`deleteLayerAcrossAllFrames`, `squashLayerDown`, `squashLayerUp`,
`squashLayerDownAcrossAllFrames`, `squashLayerUpAcrossAllFrames`, `makeVariant`,
`copyLayerToClipboard`, `pasteLayerFromClipboard`, `layerClipboard`,
`removeVariantLayer`.

**Seven of the 22 are parameterised variants of two operations.** Collapsing them
is a props reduction *and* a store simplification (findings 03 W21 already
proposes collapsing the 4 `squash*` actions to one parameterised core):

| Today (7 actions) | Collapsed (2 callbacks) |
| --- | --- |
| `squashLayerDown`, `squashLayerUp`, `squashLayerDownAcrossAllFrames`, `squashLayerUpAcrossAllFrames` | `onSquashLayer: (layerId: string, direction: "up" \| "down", scope: "frame" \| "all-frames") => void` |
| `moveLayer`, `moveLayerAcrossAllFrames` | `onMoveLayer: (from: number, to: number, scope: "frame" \| "all-frames") => void` |
| `deleteLayer`, `deleteLayerAcrossAllFrames` | `onDeleteLayer: (layerId: string, scope: "frame" \| "all-frames") => void` |

Split into three components:

```ts
// ui/components/LayerPanel/LayerPanelHeader.tsx
export interface LayerPanelHeaderProps {
  allVisible: boolean;
  canPaste: boolean;
  onAddLayer: () => void;
  onToggleAllVisibility: () => void;
  onPasteLayer: () => void;
}

// ui/components/LayerPanel/LayerRow.tsx  — one layer; the reusable unit
export interface LayerRowProps {
  layer: Layer;
  index: number;
  selected: boolean;
  dragging: boolean;
  variantGroup?: VariantGroup;
  onSelect: (layerId: string) => void;
  onRename: (layerId: string, name: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onDelete: (layerId: string, scope: "frame" | "all-frames") => void;
  onDuplicate: (layerId: string) => void;
  onSquash: (layerId: string, direction: "up" | "down", scope: "frame" | "all-frames") => void;
  onCopy: (layerId: string) => void;
  onMakeVariant: (layerId: string) => void;
  onOpenVariantSelect: (layerId: string) => void;
  onRemoveVariantLayer: (layerId: string) => void;
}

// ui/components/LayerPanel/LayerList.tsx — ordering + drag-reorder only
export interface LayerListProps {
  layers: Layer[];
  selectedLayerId: string | null;
  variants?: VariantGroup[];
  onReorder: (from: number, to: number, scope: "frame" | "all-frames") => void;
  renderRow: (layer: Layer, index: number) => React.ReactNode;
}

// The composer — 6 props instead of 24
export interface LayerPanelProps {
  header: React.ReactNode;
  list: React.ReactNode;
  emptyMessage?: string;
  isEmpty: boolean;
}
```

**Container:** `LayerPanelContainer` (one; the sub-components take callbacks from it).
**Effort:** L · **Risk:** med-high — drag-reorder plus the `across-all-frames`
scope flag is where behaviour can silently change. Depends on findings 03 W21
(store `squash*` collapse) landing first, or the container must fan the collapsed
callback back out to 4 store actions as an interim.

---

#### `TimelineView` — 12 members · split into 3

`components/FrameTimeline/TimelineView.tsx` · 836 lines · **12 members** · 6 responsibilities · a 91-line memo comparator next door in `FramesView`

Under the 20-prop bar on store members alone, but 12 store members **plus** the 7
existing/derived props lands at ~19, and findings 03 measures six fused
responsibilities (grid, colours, DnD, keyboard, thumbnails, cell clipboard).
Split alongside findings 03 W10/W11:

```ts
// ui/components/TimelineView/TimelineCell.tsx
export interface TimelineCellProps {
  frameId: string;
  frameIndex: number;
  layerId: string;
  layerName: string;
  layer: Layer | null;
  selected: boolean;
  hovered: boolean;
  thumbnailMode: boolean;
  onSelect: (frameIndex: number, layerId: string) => void;
  onCopy: (frameIndex: number, layerId: string) => void;
  onPaste: (frameIndex: number, layerId: string) => void;
  onDelete: (frameIndex: number, layerId: string) => void;
}

// ui/components/TimelineView/TimelineGrid.tsx
export interface TimelineGridProps {
  frames: Frame[];
  layerNames: string[];
  selectedFrameIndex: number;
  selectedLayerId: string | null;
  thumbnailMode: boolean;
  hasClipboard: boolean;
  onReorderLayer: (from: number, to: number) => void;
  onAddLayerToAllFrames: () => void;
  onAddLayerAtPosition: (index: number) => void;
  renderCell: (frameIndex: number, layerId: string) => React.ReactNode;
}

// The composer
export interface TimelineViewProps {
  project: Project;
  obj: PixelObject;
  isPlaying: boolean;
  togglePlayback: () => void;
  showPreview: boolean;
  setShowPreview: (show: boolean) => void;
  viewModeDropdown: React.ReactNode;
  toolbar: React.ReactNode;
  grid: React.ReactNode;
  thumbnailMode: boolean;
  onThumbnailModeChange: (enabled: boolean) => void;
}
```

**Container:** `TimelineViewContainer` · **Effort:** L · **Risk:** med-high.
Delete the two dead destructures while here — `moveLayer` (`:305`) and
`getCurrentObject` (`:313`) are unused (TS6133), and `gridRef` (`:328`) is
attached at `:740` but never dereferenced.

---

#### `Canvas` — 47 members · do NOT write a props interface yet

`components/Canvas/Canvas.tsx` · 3,062 lines · **47 destructured members** at `:101-149` · 11 fused responsibilities

A purified `Canvas` would need ~52 props. That number is meaningless — it is a
restatement of the fact that this one function does eleven things. **The
decomposition in findings 03 §1 (steps C1–C8, work items W12→W13→W14→W15) is a
hard prerequisite.** Only after C8 does a props interface become writable, and
then it is for `CanvasSurface`, which is small:

```ts
// ui/components/CanvasSurface/CanvasSurface.tsx — the post-C8 pure surface
export interface CanvasSurfaceProps {
  /** Logical pixel grid dimensions. */
  gridSize: { width: number; height: number };
  /** Rendered size in CSS px, derived from zoom. */
  displaySize: { width: number; height: number };
  zoom: number;
  panOffset: { x: number; y: number };
  cursor: React.CSSProperties["cursor"];

  /** Refs for the 4-canvas stack: base, overlay, frame-overlay, frame-trace.
   *  The render hooks draw into these; the surface only positions them. */
  baseCanvasRef: React.RefObject<HTMLCanvasElement>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement>;
  frameOverlayCanvasRef: React.RefObject<HTMLCanvasElement>;
  frameTraceCanvasRef: React.RefObject<HTMLCanvasElement>;
  containerRef: React.RefObject<HTMLDivElement>;

  /** Pointer + wheel handlers, supplied by useCanvasPointer / useCanvasViewport. */
  onPointerDown: React.PointerEventHandler;
  onPointerMove: React.PointerEventHandler;
  onPointerUp: React.PointerEventHandler;
  onWheel: React.WheelEventHandler;

  children?: React.ReactNode;   // floating panels rendered over the canvas
}
```

**14 props, all presentational.** This is the shape the taxonomy is aiming at, and
it is only reachable through the split.

**Container:** `CanvasContainer` — binds the store, runs `useCanvasViewport`,
`useCanvasGeometry`, `useCanvasKeyboard`, `useCanvasPointer`, `useCanvasRender`,
and renders `CanvasSurface`.
**Effort:** L (multi-session) · **Risk:** HIGH — this is the entire editing
surface and there are zero tests. Write findings 03's five characterization tests
before touching it.

---

#### `AIInterpolateModal` — the whole store object

`components/AIInterpolateModal/AIInterpolateModal.tsx` · 1,252 lines

Worst coupling measured anywhere: `const store = useEditorStore();` at `:316`
captures the **entire** store object, and `:754` and `:841` call
`useEditorStore.setState(…)` directly, bypassing every action. It also holds 5 of
the 9 real type errors (the `PixelData[]` vs `PixelData[][]` array-rank bug).

**No props interface can be written for this file as it stands** — its dependency
surface is "the store". findings 03 W17 decomposes it into 6 pure step components
plus `useInterpolationJob`, `applyInterpolation`, and `frameEncoding`. After that:

```ts
// ui/components/AIInterpolate/AIInterpolateModal.tsx — the shell
export interface AIInterpolateModalProps {
  isOpen?: boolean;
  step: "checking" | "unavailable" | "select-layer" | "configure" | "generating" | "review";
  onClose: () => void;
  /** The current step's content, chosen by the container. */
  children: React.ReactNode;
}

// Representative step — each is independently storyable
export interface ConfigureStepProps {
  keyframes: { frameIndex: number; thumbnailBase64: string }[];
  settings: InterpolationSettings;
  activeTab: "keyframes" | "settings";
  onTabChange: (tab: "keyframes" | "settings") => void;
  onSettingsChange: (settings: InterpolationSettings) => void;
  onToggleKeyframe: (frameIndex: number) => void;
  onGenerate: () => void;
  onBack: () => void;
}

export interface GeneratingStepProps {
  pairs: { pairIdx: number; status: "queued" | "processing" | "completed" | "failed"; progress: number }[];
  onCancel: () => void;
}

export interface ReviewStepProps {
  generated: { pairIdx: number; frames: string[] }[];
  previewFps: number;
  loop: boolean;
  onPreviewFpsChange: (fps: number) => void;
  onLoopChange: (loop: boolean) => void;
  onAccept: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
}
```

**Container:** `AIInterpolateContainer` — owns `useInterpolationJob`, the health
check, and `applyInterpolation`.
**Effort:** L · **Risk:** med-high. **Depends on findings 03 W0** (the type
errors must be fixed first) **and W8** (primitives).

Note: the CSS audit found 8 dead status classes here (`.queued`, `.processing`,
`.completed`, `.failed`, `.generated`, `.placeholder`, `.ai-btn-preview`,
`.between`/`.keyframe`) that the TSX uses as **data values but never emits as
classes** — likely a regression from the AI-service refactor (`c54ddcd`,
`3199fa8`). The `GeneratingStepProps.pairs[].status` field above is where those
classes should be re-attached as `ai-interpolate-modal__pair--{status}`.

---

#### `ReferenceImageModal` — blocked on the module-state move

`components/ReferenceImageModal/ReferenceImageModal.tsx` · 869 lines · **11 exports, 10 non-component** · module-level mutable `persistentState` at `:29`

This is the architectural smell named in `MASTER.md`, and it is the one file that
**cannot enter `ui/` at all** until findings 03 **W18** relocates the module state.
`App.tsx:14-19` imports four symbols from it (`ReferenceImageData`,
`restoreReferenceImageFromProject`, `getCurrentReferenceImageData`,
`saveReferenceImageToProject`), and it calls `useEditorStore.getState()` at `:235`
and `:261`.

Post-W18 target:

```ts
// ui/components/ReferenceImageCropper/ReferenceImageCropper.tsx — pure
export interface ReferenceImageCropperProps {
  image: HTMLImageElement | null;
  selection: SelectionBox | null;
  onSelectionChange: (selection: SelectionBox) => void;
  zoom: number;
  panOffset: { x: number; y: number };
  onViewportChange: (v: { zoom: number; panOffset: { x: number; y: number } }) => void;
  gridSize: { width: number; height: number };
}

// ui/components/ReferenceImageModal/ReferenceImageModal.tsx — pure shell
export interface ReferenceImageModalProps {
  isOpen?: boolean;
  imageUrl: string | null;
  selection: SelectionBox | null;
  onImageLoad: (file: File) => void;
  onImageClear: () => void;
  onSelectionChange: (selection: SelectionBox) => void;
  onConfirm: () => void;
  onClose: () => void;
  cropper: React.ReactNode;
}
```

**Container:** `ReferenceImageContainer` · **Effort:** L · **Risk:** **HIGH** —
`App.tsx` relies on module state surviving unmount; moving it to `UIStore` changes
lifetime semantics. Manual verification (load image → close modal → reopen →
switch project → reopen) is mandatory and cannot be automated.

⚠️ **Collision warning for task 09:** findings 04 **CSS-17** also touches
`ReferenceImageModal.{tsx,css}` (BEM group G5). CSS-17 only rewrites `className`
strings and does not move the file, so the two are compatible — **but they must
not run in the same parallel wave**, because W18 relocates code out of the file
that CSS-17 is renaming classes inside. Sequence CSS-17 **before** W18.

---

## Storybook configuration

**Framework:** `@storybook/react-vite@9.1.20` with `storybook@9.1.20`.

Version chosen from findings 01's compatibility matrix, not from `latest`.
`@storybook/react-vite@9.1.20` peers `vite ^5 || ^6 || ^7` and
`react ^16.8 || ^17 || ^18 || ^19.0.0-beta`, which fits the target stack (Vite 7.3.6,
React 19). Storybook 10.5.8 was rejected because it pulls in a `vite-plus` peer and
its Vitest addon requires a Playwright browser download — real cost for a project
with zero tests today. Storybook 8 is superseded (`v8: 8.6.18`).

```sh
cd client && bun add -D storybook@9.1.20 @storybook/react-vite@9.1.20 \
  @storybook/addon-a11y@9.1.20 @storybook/addon-docs@9.1.20 \
  eslint-plugin-storybook@9.1.20
```

### `.storybook/main.ts`

```ts
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: [
    // Colocated, tier-ordered so the sidebar mirrors the taxonomy.
    "../src/ui/primitives/**/*.stories.@(ts|tsx)",
    "../src/ui/components/**/*.stories.@(ts|tsx)",
    "../src/ui/layouts/**/*.stories.@(ts|tsx)",
  ],
  addons: [
    "@storybook/addon-docs",   // ships controls + viewport + toolbars in SB9
    "@storybook/addon-a11y",
  ],
  framework: { name: "@storybook/react-vite", options: {} },
  // Fonts and any future static assets. client/public exists today.
  staticDirs: ["../public"],
  typescript: {
    // react-docgen-typescript reads the props interfaces this document
    // specifies and generates the controls table automatically. Worth the
    // build cost precisely because every ui/ component now HAS an interface.
    reactDocgen: "react-docgen-typescript",
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      propFilter: (prop) => !prop.parent?.fileName.includes("node_modules"),
    },
  },
};

export default config;
```

**`stories` deliberately excludes `src/containers/**`.** A container imports the
store; a story of a container would need a live MobX tree, which is exactly what
the taxonomy exists to avoid. If a container ever needs a story, that is evidence
its `ui/` counterpart is under-specified.

### `.storybook/preview.ts`

Loads everything the app loads outside the component tree. findings 04 measured
eight requirements; all eight are covered below.

```ts
import type { Preview } from "@storybook/react-vite";

// ── 1. Tokens · 2. Reset · 3. Global element styling · 4. Scrollbars ─────────
// After findings 04 CSS-07, index.css is an import manifest
// (tokens → reset → blocks/*), so this single import covers requirements 1-4
// and 7. Before CSS-07 lands, import the individual files instead.
import "../src/index.css";

const preview: Preview = {
  parameters: {
    // ── 6. Dark background ──────────────────────────────────────────────────
    // The palette is dark-on-dark (--bg-primary:#0a0a0f,
    // --text-primary:#e8e8f0). On Storybook's default white canvas every
    // component is near-invisible.
    backgrounds: {
      default: "app",
      values: [
        { name: "app", value: "#0a0a0f" },      // === --bg-primary
        { name: "panel", value: "#12121a" },     // === --bg-secondary
        { name: "light", value: "#ffffff" },     // for contrast checking only
      ],
    },
    layout: "centered",
    controls: { expanded: true, matchers: { color: /(color|background)$/i } },
    a11y: { test: "error" },   // fail the build on a11y violations — see below
  },

  // ── 8. #root sizing ─────────────────────────────────────────────────────
  // html, body, #root { height: 100% } in index.css. Storybook's root is
  // #storybook-root, so layout-level stories need an equivalent container.
  decorators: [
    (Story, ctx) => {
      const full = ctx.parameters.layout === "fullscreen";
      return (
        <div
          style={
            full
              ? { height: "100vh", width: "100vw", display: "flex", flexDirection: "column" }
              : { padding: 24 }
          }
        >
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
```

### `.storybook/preview-head.html` — requirement 5, the one that is easiest to miss

**The web fonts are loaded by a `<link>` in `client/index.html:9-10`, not from any
CSS file.** Storybook does not read `client/index.html`, so `--font-sans` and
`--font-mono` silently fall back to `system-ui`/`monospace`. **44 declarations use
`var(--font-mono)`.**

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### Addons & rationale

Four, each justified against a measured defect. Storybook 9 folds controls,
viewport, toolbars and actions into the core, so the explicit list is short.

| Addon | Why — tied to a measurement | Not just "it exists" |
| --- | --- | --- |
| **`@storybook/addon-a11y`** | The single strongest justification in this audit. Measured: **0 of 14 modals** have `role="dialog"`/`aria-modal`/focus trap; the only `aria-label` in the whole modal set is `FrameTagsModal.tsx:177`; **3 keyboard-inoperable toggles** at `LayerColors.tsx:169-180,197-208,254`; **142 `title=`** attributes standing in for accessible names. Set `a11y: { test: "error" }` so a regression fails CI rather than being noticed later. | Without it, the a11y fixes the primitives deliver are unverified assertions. |
| **`@storybook/addon-docs`** | Carries the **controls** table (SB9 ships controls inside docs) and autodocs. Controls are what make a primitive's variant matrix explorable — `Button` has 5 variants × 3 sizes × 4 booleans; a story per combination is 240 stories, a control panel is one. | Also the delivery vehicle for the BEM block documentation each primitive needs. |
| **viewport / toolbars / actions** | **Built into Storybook 9 core** — no package to add. Viewport matters because the app has `@media` overrides (e.g. `ReferenceImageModal.css` at bundle offset 14590) that are otherwise untested. Actions log the callback props, which is how a pure component's "output" is inspected. | Listed for completeness; nothing to install. |
| **`eslint-plugin-storybook`** | Catches story-file mistakes (missing `component`, bad CSF3 shape) that otherwise surface as a broken sidebar. Pin to the same major as `storybook` — the `latest` 10.5.8 peers to `storybook ^10.5.8`. | Cheap; config-only. |

**Deliberately NOT added:**

- **`@storybook/addon-vitest`** — requires `@vitest/browser` + a Playwright browser
  download. findings 01 explicitly flags this as a real cost for a repo with zero
  tests. Revisit once Vitest is established.
- **`@storybook/addon-themes`** — **the app has no themes.** Verified:
  `grep -rn 'prefers-color-scheme\|data-theme' client/src/*.css client/src/**/*.css`
  returns zero hits; `index.css:2` comments the palette as "Dark theme inspired by
  cyberpunk aesthetics" and there is exactly one. Adding a theme switcher would be
  inventing a feature. See § Themes.
- **`storybook-addon-designs`, chromatic, etc.** — no design source to link to.

### Canvas components in isolation

`CanvasSurface` and `LightingSurface` are the hard cases: they render into
`<canvas>` elements via imperative `ctx` calls driven by hooks, and they are the
components most in need of visual review.

The taxonomy makes this tractable because **after findings 03 C1–C8 the rendering
is pure functions of `(ctx, data)`**, not component internals:
`render/renderScene.ts`, `renderSelectionOverlay.ts`, `renderOriginCross.ts`,
`renderFrameOverlay.ts`, `canvasBackground.ts`.

Three story strategies, in increasing fidelity:

**1. Static painted surface (default for most stories).** A tiny story-local
decorator paints the fixture into the canvas refs on mount, then the surface just
positions them:

```tsx
// ui/components/CanvasSurface/CanvasSurface.stories.tsx
import { fixtureProject, fixtureFrame } from "../../../fixtures";
import { renderScene } from "../../../components/Canvas/render/renderScene";

function PaintedSurface(props: Partial<CanvasSurfaceProps>) {
  const base = useRef<HTMLCanvasElement>(null);
  /* … the other three refs … */
  useEffect(() => {
    const ctx = base.current?.getContext("2d");
    if (!ctx) return;
    renderScene(ctx, {
      frame: fixtureFrame,
      gridSize: fixtureProject.objects[0].gridSize,
      variants: fixtureProject.variants,
      zoom: 10,
      panOffset: { x: 0, y: 0 },
    });
  }, []);
  return <CanvasSurface baseCanvasRef={base} /* … */ {...props} />;
}

export const Default: Story = { render: () => <PaintedSurface /> };
export const VariantEditMode: Story = { /* fixtureVariantContext */ };
export const SelectionActive: Story = { /* fixtureSelection + marching ants */ };
export const FrameOverlay: Story = { /* onion skin at 0.4 alpha */ };
export const Zoomed: Story = { /* zoom: 32, panOffset non-zero */ };
```

**2. Render-function stories.** `render/*` are pure `(ctx, data) => void`. Give
each one a story that paints a fixture at a fixed zoom onto a bare canvas. These
double as the visual side of findings 03's golden-image tests (C3's `#8`/`#9`
unification and C4's scene extraction both need this).

**3. Interaction is out of scope for stories.** Pan/zoom/pinch and the pointer
tool handlers stay in hooks (`useCanvasViewport`, `useCanvasPointer`), which are
not storyable and are explicitly called out in findings 03 W6 as
**"gesture-sensitive and untestable in CI"** — manual trackpad/touch verification
remains mandatory. Do not fake it with a story and claim coverage.

**No store is needed for any of this** — that is the entire point. The fixture
module supplies real `Layer`/`Frame`/`Variant` objects and the render functions
take them directly.

### Themes

**The app has no theme system.** One hard-coded dark palette in
`client/src/index.css:1-37` (27 custom properties, `--bg-primary:#0a0a0f`,
`--text-primary:#e8e8f0`). No `prefers-color-scheme` query, no `data-theme`
attribute, no theme toggle anywhere in the UI.

**Decision: do not add theming, and do not add a theme addon.** Configure
Storybook's `backgrounds` with the three real surface tokens (`--bg-primary`,
`--bg-secondary`, plus a white entry used **only** for contrast checking) so
reviewers can see a component against both panel and canvas backgrounds. That is
the actual variation the app has.

One caveat worth recording: `uiState.lightGridMode` (`types/index.ts:137`) flips
the **canvas grid** to a light background. That is a canvas render mode, not a UI
theme — it affects `Canvas`/`LightingCanvas` only, and it becomes a story
parameter on those two components' stories (`Default` / `LightGridMode`). It is
also where findings 03 W4's measured disagreement lives (Canvas uses `0.05` alpha
and honours `lightGridMode`; LightingCanvas hard-codes `0.08` and ignores it) —
the two stories side by side make that regression visible for the first time.

### Storybook-specific hazards inherited from findings 04

Three, all measured, all needing a concrete response here:

**1. All 14 modals use `position: fixed`** and will escape the story canvas to
cover the whole Storybook iframe (findings 04 Q7, flagged to this task). **Answer:
the `Modal` primitive takes a `container?: HTMLElement | null` prop** (see its
interface above), and a shared decorator supplies a local, `position: relative`,
`transform: none` element:

```tsx
// .storybook/decorators/modalHost.tsx
export const withModalHost: Decorator = (Story) => {
  const [host, setHost] = useState<HTMLElement | null>(null);
  return (
    <div
      ref={setHost}
      style={{ position: "relative", transform: "none", minHeight: 560, minWidth: 720,
               overflow: "hidden", border: "1px dashed var(--border-primary)" }}
    >
      {host && <Story args={{ container: host }} />}
    </div>
  );
};
```

Every modal story sets `decorators: [withModalHost]`. This is why `container` is
part of the primitive's public interface rather than a hard-coded `document.body`.

**2. `z-index` up to 99999** will sit above Storybook's own addon panels.
findings 04 CSS-06 replaces all 15 numeric values with a `--z-*` scale capped at
900, which fixes this as a side effect. **Storybook stories written before CSS-06
will show modals covering the toolbar** — expected, not a bug.

**3. Two components are styled by a *different* component's CSS.**
`RightSidebarTopControls`'s `.compact-slider` gets its track and thumb from
`ColorPicker.css`; `PixelStudioPanel`'s `.shape-btn` from `LightingStudioPanel.css`
(findings 04 collision groups G3 and G4). **Their stories will render broken
today** and will look like a Storybook misconfiguration when they are actually a
pre-existing collision. **Sequencing rule: convert G3 and G4 (findings 04 CSS-15,
CSS-16) before writing stories for those three components.** This is the single
most likely wild-goose chase in the whole plan.

---

## Fixtures

`client/src/fixtures/` — plain, typed sample data shared by stories and Vitest.

### Rules

1. **Plain objects only. Never MobX observables.** A fixture must be constructible
   with no store present. If a fixture ever needs `makeAutoObservable`, the
   component consuming it is not pure and the taxonomy has been violated.
2. **Typed against the domain types**, so a domain change breaks the fixtures at
   compile time rather than at story-render time. After findings 03 W2 splits
   `types/index.ts`, fixtures import from `types/domain`.
3. **Every export is a factory returning a fresh object**, plus a frozen
   convenience constant. Tests mutate; stories do not. Sharing one mutable object
   between them produces order-dependent test failures.
4. **Deterministic ids.** `generateId()` is random; fixtures use stable literals
   (`"fx-obj-1"`, `"fx-layer-base"`) so snapshots and golden images are stable.
5. **No `import` from `components/`, `containers/`, `stores/` or `api/`.** The
   fixtures module sits below the whole UI. Add it to the `no-restricted-imports`
   ban list.

### Module layout

```
client/src/fixtures/
  index.ts             barrel — re-exports everything below
  pixels.ts            makePixelGrid, makeCheckerPixels, makeGradientPixels,
                       makeNormalField, makeHeightField
  layers.ts            makeLayer, makeVariantLayer, layerBase, layerOutline,
                       layerEmpty, layerWithNormals
  frames.ts            makeFrame, frameSingle, frameWalkCycle (4 frames), frameTagged
  variants.ts          makeVariant, makeVariantGroup, variantGroupWeapons
                       (3 variants × 2 frames, with baseFrameOffsets populated)
  objects.ts           makeObject, objectSmall (8×8), objectTypical (32×32, 4 frames,
                       3 layers), objectDense (64×64, 12 frames, 8 layers)
  palettes.ts          makePalette, paletteDefault, paletteEmpty
  projects.ts          makeProject, projectEmpty, projectTypical, projectDense,
                       projectWithVariants, projectLegacy (pre-migration shape)
  uiState.ts           makeUiState — DEFAULT_UI_STATE with overrides
  selection.ts         selectionRect, selectionLasso, selectionEmpty
  colors.ts            colorRed, colorTransparent, colorHalfAlpha
```

### Representative content

```ts
// client/src/fixtures/layers.ts
import type { Layer, PixelData } from "../types";
import { makePixelGrid, makeCheckerPixels } from "./pixels";

export function makeLayer(overrides: Partial<Layer> = {}): Layer {
  return {
    id: "fx-layer-base",
    name: "Base",
    pixels: makePixelGrid(32, 32),
    visible: true,
    ...overrides,
  };
}

/** A variant layer wired to fixtureVariantGroup. Exercises the 4-level
 *  variant-offset fallback that Canvas.tsx repeats 5× and export.ts once. */
export function makeVariantLayer(overrides: Partial<Layer> = {}): Layer {
  return makeLayer({
    id: "fx-layer-variant",
    name: "Weapon",
    isVariant: true,
    variantGroupId: "fx-vg-weapons",
    selectedVariantId: "fx-variant-sword",
    variantOffsets: { "fx-variant-sword": { x: 4, y: -2 } },
    ...overrides,
  });
}

export const layerBase: Readonly<Layer> = Object.freeze(makeLayer());
```

```ts
// client/src/fixtures/projects.ts
export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    version: "1.1.0",
    objects: [makeObject()],
    palettes: [makePalette()],
    variants: [makeVariantGroup()],
    uiState: makeUiState(),
    ...overrides,
  };
}

/** The three canonical shapes every layout story uses. */
export const projectEmpty   = makeProject({ objects: [], variants: [] });
export const projectTypical = makeProject();
export const projectDense   = makeProject({
  objects: Array.from({ length: 12 }, (_, i) =>
    makeObject({ id: `fx-obj-${i}`, name: `Object ${i}`,
                 gridSize: { width: 64, height: 64 }, frames: makeFrames(12) })),
});
```

### Why the three sizes matter

`projectEmpty` / `projectTypical` / `projectDense` are not decoration — they are
the three states every layout story must cover (see § Story coverage). `Dense`
in particular is the only cheap way to surface the performance characteristics
findings 03 measured: `LightingCanvas`'s uncached O(w·h) `fillRect` checkerboard
(`:298-305`), `FramesView`'s 91-line memo comparator, and `TimelineView`'s
re-blitting instead of using `previewRenderer`.

### Reuse in Vitest

The same module backs the unit tests findings 03 prioritises:

```ts
// example — the highest-value test in the repo, per findings 03
import { projectWithVariants } from "../fixtures";
import { projectToCompact, compactToProject } from "../types/codecs";

it("round-trips a project with variants, tags and legacy layers", () => {
  expect(compactToProject(projectToCompact(projectWithVariants)))
    .toEqual(projectWithVariants);
});
```

This is the reason fixtures are a shared module and not story-local literals:
`resolveVariantOffset`'s 4-level fallback, `screenToPixel`'s snapping modes, and
`brushStamp`'s mouse-vs-touch agreement all need the *same* fixture shapes the
stories use, or the visual and the unit evidence describe different data.

---

## Story coverage targets by wave

Story file convention: **colocated `Component.stories.tsx`** beside the component,
CSF3, default export naming the tier (`title: "Primitives/Button"`,
`"Components/LayerPanel"`, `"Layouts/PixelStudio"`).

### Definition of "done" per tier

| Tier | Done means |
| --- | --- |
| **Primitive** | Every `variant` × `size` combination reachable through controls, **plus** one explicit story per state that controls cannot express (`disabled`, `loading`, `error`, `open`); **a11y addon reports zero violations at `test: "error"`**; the BEM block documented in the autodocs page; keyboard operation demonstrated in at least one story (Tab / Enter / Space / Escape / arrows as applicable). |
| **Component** | At least **three** stories: *empty* (no data / zero items), *typical*, and *edge* (long names, many items, or the error state). Every callback prop wired to `fn()` so the Actions panel shows the output contract. Any component with a `--modifier` in findings 04's mapping table has a story for that modifier. |
| **Layout** | At least **three**: *empty* (`projectEmpty`), *typical* (`projectTypical`), *dense* (`projectDense`), each at `layout: "fullscreen"`. Regions supplied as **stub elements**, not real containers — a layout story must not need the store. Plus one *focus mode* story per layout (it hides two regions). |

### Wave assignment

Waves here are relative to the REFRESH execution plan task 09 will author. They are
expressed as dependencies, not as fixed wave numbers.

| Wave | Stories written | Gate before starting | Count |
| --- | --- | --- | ---: |
| **S0** | Storybook harness + **one** proof story (`Button`) | findings 01 D8 (Storybook installed); findings 04 CSS-07 (index.css is a manifest) | 1 |
| **S1** | All 18 primitives | findings 03 **W8** (primitives built); findings 04 **CSS-08…12** (the 5 shared blocks extracted) | 18 |
| **S2** | The 6 already-pure components — `AnchorGrid`, `Icon`, `ResizeModal`, `EdgeInterpolateModal`, `PreviewModal`, `ExportPreviewModal` | S1 | 6 |
| **S3** | The 10 **S-effort** purified components — `ObjectSelectModal` (first, as the reference), `CanvasInfo`, `NormalPicker`, `LightControl`, `LightingStudioPanel`, `PixelStudioPanel`, `PaletteManager`, `Toolbar`, `PixelStudioTools`, plus the 5 small modals (`CopyFromModal`, `AddVariantModal`, `VariantSelectModal`, `FrameTagsModal`, `HeightMapModal`) | their purification items | 15 |
| **S4** | The **M-effort** components — `LayerColors`, `ColorPicker`, `LightingStudioTools`, `Header` + `AiConfigPopover`, `FrameReferencePanel`, `ReferenceImagePanel`, `ProjectSelectModal`, `BrowseBackupsModal`, `FrameTimeline` | S3; findings 03 W7 (`useFloatingPanel`); findings 04 **CSS-15/16** (G3/G4 — **mandatory before** `ColorPicker`, `LightingStudioPanel`, `RightSidebarTopControls`, `PixelStudioPanel` stories, see hazard 3) | 10 |
| **S5** | The split products — `RightSidebarTopControls` ×5, `LayerPanel` ×4, `TimelineView` ×3, `ObjectLibrary` + 5 dialogs, `FramesView`, `VariantView`, `ThumbnailCanvas`, `TimelineToolbar`, `AddFrameControls`, `TimelineModals`, `ViewModeDropdown` | T-06, T-07; findings 03 W10, W11 | 22 |
| **S6** | Canvas-family — `CanvasSurface` (5 stories), `LightingSurface`, `LightingPreviewPanel`, `ReferenceImageCropper`, plus one story per `render/*` pure function | findings 03 W12–W16, W18 | 9 |
| **S7** | `AIInterpolate` — shell + 6 steps + 2 parts | findings 03 W17 | 9 |
| **S8** | **Layouts** — `PixelStudioLayout`, `LightingStudioLayout`, `LoadingLayout`, `AppShell` | everything above | 4 |

**Total story files: 94.** Primitives 18 · Components 71 · Layouts 4 · plus the S0 proof.

**S1 is the load-bearing wave.** Every later wave depends on the primitives
existing, and S1 is also where the a11y gate first has teeth — 18 primitives
passing `a11y: { test: "error" }` is what makes the "0 of 14 modals are
accessible" finding actually get fixed rather than merely documented.

---

## Directory migration map

Old path → new path for every file that moves. Executable mechanically.

### Primitives (new files, extracted from many call sites)

| New | Extracted from |
| --- | --- |
| `client/src/ui/primitives/Icon/Icon.tsx` | `client/src/components/Icon/Icon.tsx` (**move, unchanged**) |
| `client/src/ui/primitives/Button/Button.tsx` | 197 `<button>` sites |
| `client/src/ui/primitives/IconButton/IconButton.tsx` | 13 close-button sites |
| `client/src/ui/primitives/Modal/Modal.tsx` | 14 modal shells |
| `client/src/ui/primitives/ConfirmDialog/ConfirmDialog.tsx` | `ObjectLibrary.tsx:608`, `AddVariantModal.tsx:248`, `BrowseBackupsModal.tsx:181`, `LayerPanel.css` `.confirm-modal-*` |
| `client/src/ui/primitives/Slider/Slider.tsx` | 27 `type="range"` sites |
| `client/src/ui/primitives/NumberInput/NumberInput.tsx` | 21 `type="number"` sites |
| `client/src/ui/primitives/SliderWithNumber/SliderWithNumber.tsx` | `LightControl.tsx:149-167` ×4, `ColorPicker.tsx:538-661` ×5 |
| `client/src/ui/primitives/Toggle/Toggle.tsx` | 9 sites, 3 idioms |
| `client/src/ui/primitives/Tooltip/Tooltip.tsx` | 142 `title=`, `CopyFromModal.tsx:72-88`, `Toolbar.tsx:38-45` |
| `client/src/ui/primitives/ColorSwatch/ColorSwatch.tsx` | `LayerColors.tsx:270-278`, `ColorPicker.tsx:421-429`, `PaletteManager.tsx:118-125` |
| `client/src/ui/primitives/FloatingPanel/FloatingPanel.tsx` | `LightingCanvas.tsx:713-835`, `FrameReferencePanel.tsx:32-102,272-323`, `ReferenceImagePanel.tsx:32-94,130-191` |
| `client/src/ui/primitives/Panel/Panel.tsx` | `index.css` `.panel`/`.panel-header`/`.panel-content` + 12 sites |
| `client/src/ui/primitives/Dropdown/Dropdown.tsx` | `FrameTimeline.tsx:11-76` |
| `client/src/ui/primitives/ThumbnailCanvas/ThumbnailCanvas.tsx` | `FramesView.tsx:15-163`, `VariantView.tsx:16-75`, `TimelineView.tsx:47-128`, + 2 |
| `client/src/ui/primitives/Field/Field.tsx` | ~30 label+control sites |
| `client/src/ui/primitives/EmptyState/EmptyState.tsx` | `.empty-state` in `LayerPanel.css:195`, `ObjectLibrary.css:237`, `PaletteManager.css:191` |
| `client/src/ui/primitives/Badge/Badge.tsx` | `.selected-badge` ×3, `.current-badge` ×3 |

### Components (1:1 moves)

| Old | New |
| --- | --- |
| `client/src/components/AnchorGrid/` | `client/src/ui/components/AnchorGrid/` |
| `client/src/components/ResizeModal/` | `client/src/ui/components/ResizeModal/` |
| `client/src/components/EdgeInterpolateModal/` | `client/src/ui/components/EdgeInterpolateModal/` |
| `client/src/components/HeightMapModal/` | `client/src/ui/components/HeightMapModal/` |
| `client/src/components/PreviewModal/` | `client/src/ui/components/PreviewModal/` |
| `client/src/components/ExportPreviewModal/` | `client/src/ui/components/ExportPreviewModal/` |
| `client/src/components/ObjectSelectModal/` | `client/src/ui/components/ObjectSelectModal/` |
| `client/src/components/CopyFromModal/` | `client/src/ui/components/CopyFromModal/` |
| `client/src/components/AddVariantModal/` | `client/src/ui/components/AddVariantModal/` |
| `client/src/components/VariantSelectModal/` | `client/src/ui/components/VariantSelectModal/` |
| `client/src/components/FrameTagsModal/` | `client/src/ui/components/FrameTagsModal/` |
| `client/src/components/BrowseBackupsModal/` | `client/src/ui/components/BrowseBackupsModal/` |
| `client/src/components/ProjectSelectModal/` | `client/src/ui/components/ProjectSelectModal/` |
| `client/src/components/ColorPicker/` | `client/src/ui/components/ColorPicker/` (+ `ui/utils/colorMath.ts`) |
| `client/src/components/PaletteManager/` | `client/src/ui/components/PaletteManager/` |
| `client/src/components/LayerColors/` | `client/src/ui/components/LayerColors/` |
| `client/src/components/PixelStudioPanel/` | `client/src/ui/components/PixelStudioPanel/` |
| `client/src/components/LightingStudioPanel/LightingStudioPanel.{tsx,css}` | `client/src/ui/components/LightingStudioPanel/` |
| `client/src/components/LightingStudioPanel/LightControl.{tsx,css}` | `client/src/ui/components/LightControl/` |
| `client/src/components/LightingStudioPanel/NormalPicker.{tsx,css}` | `client/src/ui/components/NormalPicker/` |
| `client/src/components/Toolbar/Toolbar.{tsx,css}` | `client/src/ui/components/Toolbar/` |
| `client/src/components/Toolbar/PixelStudioTools.tsx` | `client/src/ui/components/PixelStudioTools/` |
| `client/src/components/Toolbar/LightingStudioTools.tsx` | `client/src/ui/components/LightingStudioTools/` |
| `client/src/components/Header/Header.{tsx,css}` | `client/src/ui/components/Header/` (+ `ui/components/AiConfigPopover/`) |
| `client/src/components/ObjectLibrary/` | `client/src/ui/components/ObjectLibrary/` (+ `dialogs/` ×5) |
| `client/src/components/FrameReferencePanel/` | `client/src/ui/components/FrameReferencePanel/` |
| `client/src/components/ReferenceImagePanel/` | `client/src/ui/components/ReferenceImagePanel/` |
| `client/src/components/Canvas/CanvasInfo.tsx` | `client/src/ui/components/CanvasInfo/` |
| `client/src/components/FrameTimeline/FrameTimeline.{tsx,css}` | `client/src/ui/components/FrameTimeline/` |
| `client/src/components/FrameTimeline/FramesView.tsx` | `client/src/ui/components/FramesView/` |
| `client/src/components/FrameTimeline/VariantView.tsx` | `client/src/ui/components/VariantView/` |

### Components (split — old file becomes several)

| Old | New |
| --- | --- |
| `client/src/components/LayerPanel/LayerPanel.tsx` | `ui/components/LayerPanel/{LayerPanel,LayerPanelHeader,LayerList,LayerRow}.tsx` |
| `client/src/components/RightSidebarTopControls/RightSidebarTopControls.tsx` | `ui/components/RightSidebarTopControls/{RightSidebarTopControls,ZoomControls,BrushControls,ShapeControls,SelectionControls}.tsx` |
| `client/src/components/FrameTimeline/TimelineView.tsx` | `ui/components/TimelineView/{TimelineView,TimelineGrid,TimelineCell}.tsx` |
| `client/src/components/AIInterpolateModal/AIInterpolateModal.tsx` | `ui/components/AIInterpolate/{AIInterpolateModal,steps/*,parts/*}.tsx` + `containers/AIInterpolateContainer.tsx` + `ui/utils/frameEncoding.ts` + `stores/…/applyInterpolation.ts` + `ui/hooks/useInterpolationJob.ts` |
| `client/src/components/Canvas/Canvas.tsx` | `ui/components/CanvasSurface/CanvasSurface.tsx` + `containers/CanvasContainer.tsx` + `ui/hooks/{useCanvasViewport,useCanvasGeometry,useCanvasKeyboard,useCanvasPointer,useCanvasRender}.ts` + `ui/canvas/render/*` + `ui/canvas/tools/*` + `ui/canvas/model/*` |
| `client/src/components/Canvas/LightingCanvas.tsx` | `ui/components/LightingSurface/LightingSurface.tsx` + `ui/components/LightingPreviewPanel/` + `containers/LightingCanvasContainer.tsx` + `ui/hooks/useLightingPaint.ts` + `ui/canvas/render/{renderLightingPreview,renderNormalEdit,renderBrushOverlay}.ts` |
| `client/src/components/ReferenceImageModal/ReferenceImageModal.tsx` | `ui/components/ReferenceImageModal/` + `ui/components/ReferenceImageCropper/` + `containers/ReferenceImageContainer.tsx` + `stores/referenceImage*` + `utils/referenceImage.ts` + `utils/imageEncoding.ts` |
| `client/src/App.tsx` | `containers/AppContainer.tsx` + `containers/GlobalHotkeys.tsx` + `ui/layouts/PixelStudioLayout/` + `ui/layouts/LightingStudioLayout/` + `ui/layouts/LoadingLayout/` + `ui/components/AppShell/` |

### Deleted

| Path | Reason |
| --- | --- |
| `client/src/components/GaussianFillModal/` | **Empty directory**, zero references. `ls -la` → `total 0`. (findings 03 W1) |
| `client/src/components/Icon/` | Contents moved to `ui/primitives/Icon/` |
| `client/src/components/` | Empty once every subdirectory above has moved |

### Unchanged (out of this task's scope)

`client/src/store/` → `client/src/stores/` is **P2-06's** call, not this
document's. `client/src/services/api.ts` → `client/src/api/` is the locked "single
typed API layer" decision; findings 03 rates `services/api.ts` **KEEP** ("matches
the locked API decision"), so it is a directory rename only. `client/src/utils/`
keeps its pure helpers; only the ones this document names explicitly move.

**Import-path churn:** 39 component files change location. Every one of them is
imported by path today (`grep -c 'from "\.\./' client/src/**/*.tsx`). The moves
must be done with a codemod or `tsc` will produce hundreds of errors per step —
and note findings 03's finding that **`bun run build` is red today with 56
errors** (W0), so "did I break the imports?" is unanswerable until W0 lands.
**W0 is a hard prerequisite for every item in this document.**

---

## Proposed work items

Sized to roughly one agent-session. `Touches` is an **explicit file/directory
list** so task 09 can detect collisions between parallel tasks.

Prefix `T-` (taxonomy) to distinguish from findings 03's `W-` and findings 04's
`CSS-` items. Cross-audit dependencies are named with their own prefixes.

| # | Title | Touches (explicit files/dirs) | Depends on | Effort | Risk |
| --- | --- | --- | --- | --- | --- |
| **T-01** | Create the `ui/` skeleton + the ESLint boundary rule | **new:** `client/src/ui/{primitives,components,layouts,hooks}/.gitkeep` · `client/src/containers/.gitkeep` · `client/src/fixtures/.gitkeep` · `client/eslint.config.js` (add the 3 config blocks from § Layer taxonomy) · `client/package.json` (lint script) | findings 01 **D6** (flat config exists), findings 03 **W0** (green typecheck) | **S** | Rule is too broad and blocks a legitimate import (e.g. `types/`). Detect: `bunx eslint .` exits 0 on the untouched tree, and non-zero on the boundary probe in § ESLint enforcement. |
| **T-02** | Author `client/src/fixtures/` | **new:** `client/src/fixtures/{index,pixels,layers,frames,variants,objects,palettes,projects,uiState,selection,colors}.ts` | findings 03 **W2** (types split; fixtures import `types/domain`) | **M** | Fixtures drift from the real domain shape and stories pass while the app breaks. Detect: `bunx tsc -b` — fixtures are typed against the domain types, so drift is a compile error. Also assert `compactToProject(projectToCompact(projectTypical))` deep-equals. |
| **T-03** | Storybook 9.1.20 install + `main.ts`/`preview.ts`/`preview-head.html` + modal decorator + one `Button` proof story | `client/package.json` · **new:** `client/.storybook/{main.ts,preview.tsx,preview-head.html,decorators/modalHost.tsx}` · **new:** `client/src/ui/primitives/Button/Button.stories.tsx` | findings 01 **D8**, findings 04 **CSS-07** (index.css is a manifest), **T-01** | **M** | Stories render unstyled (global CSS not imported) or with fallback fonts (the `<link>` lives in `client/index.html`, which Storybook does not read). Detect: `bunx storybook build` exits 0; visually confirm `var(--font-mono)` resolves to JetBrains Mono, not `monospace`. |
| **T-04** | Build the 6 P0 primitives: `Modal`, `Button`, `IconButton`, `Slider`, `NumberInput`, `ConfirmDialog` + stories | **new:** `client/src/ui/primitives/{Modal,Button,IconButton,Slider,NumberInput,ConfirmDialog}/` (`.tsx` + `.stories.tsx` each) · consumes `client/src/styles/blocks/{btn,modal,slider,confirm-dialog}.css` | findings 04 **CSS-08, CSS-09, CSS-11, CSS-12** · **T-03** | **L** | The `Modal` Escape handler must not fight `Canvas.tsx:1741-1761`'s capture-phase listener or `App.tsx:91-152`'s window listener. Detect: a11y addon zero violations; the manual Escape-precedence check in § Verification. |
| **T-05** | Build the remaining 12 primitives: `SliderWithNumber`, `Toggle`, `Tooltip`, `ColorSwatch`, `FloatingPanel`, `Panel`, `Dropdown`, `ThumbnailCanvas`, `Icon` (move), `Field`, `EmptyState`, `Badge` + stories | **new:** `client/src/ui/primitives/{SliderWithNumber,Toggle,Tooltip,ColorSwatch,FloatingPanel,Panel,Dropdown,ThumbnailCanvas,Icon,Field,EmptyState,Badge}/` · **move:** `client/src/components/Icon/Icon.tsx` · consumes `client/src/styles/blocks/panel.css` | findings 04 **CSS-10** · findings 03 **W7** (`useFloatingPanel`) · **T-04** | **L** | `ThumbnailCanvas`'s `revision` prop replaces the 91-line memo comparator — stale thumbnails are the failure mode. `Panel` depends on CSS-07's emission-order fix being correct. Detect: stories for both; manual thumbnail-update check. |
| **T-06** | Split `LayerPanel` into `LayerPanelHeader` + `LayerList` + `LayerRow` | `client/src/components/LayerPanel/LayerPanel.{tsx,css}` → `client/src/ui/components/LayerPanel/{LayerPanel,LayerPanelHeader,LayerList,LayerRow}.tsx` | **T-04**, **T-05**, findings 03 **W21** (store `squash*` collapse), findings 04 **CSS-23** (LayerPanel BEM) | **L** | 22 store members → 3 components; the 7→3 callback collapse changes which store action fires for `across-all-frames` scope. Detect: `bunx tsc -b`; manual — delete/move/squash a layer in both `frame` and `all-frames` scope and confirm every frame updates. |
| **T-07** | Split `RightSidebarTopControls` into `ZoomControls` + `BrushControls` + `ShapeControls` + `SelectionControls` | `client/src/components/RightSidebarTopControls/RightSidebarTopControls.{tsx,css}` → `client/src/ui/components/RightSidebarTopControls/{RightSidebarTopControls,ZoomControls,BrushControls,ShapeControls,SelectionControls}.tsx` | **T-04**, **T-05**, findings 04 **CSS-15** (G3 — its sliders are styled by `ColorPicker.css` today) | **M** | Lowest-risk split in the plan — **0 internal hooks**, so nothing stateful can break. The real risk is doing it *before* CSS-15 and chasing a phantom styling bug. Detect: sliders pixel-identical before/after. |
| **T-08** | Purify + containerise the 6 already-pure components and the reference conversion `ObjectSelectModal` | **move:** `client/src/components/{AnchorGrid,ResizeModal,EdgeInterpolateModal,PreviewModal,ExportPreviewModal,ObjectSelectModal}/` → `client/src/ui/components/` · **new:** `client/src/containers/{ExportPreviewModalContainer,ObjectSelectModalContainer}.tsx` | **T-01**, **T-04** | **M** | `ExportPreviewModal` currently fetches its own data; moving the fetch to the container changes when it fires. Detect: `bunx tsc -b`; open the export preview and confirm it still loads. |
| **T-09** | Purify the 9 **S-effort** components (batch 1) — `CanvasInfo`, `NormalPicker`, `LightControl`, `LightingStudioPanel`, `PixelStudioPanel`, `PaletteManager`, `Toolbar`, `PixelStudioTools`, `CopyFromModal` + their containers + stories | `client/src/components/{Canvas/CanvasInfo.tsx,LightingStudioPanel/{NormalPicker,LightControl,LightingStudioPanel}.{tsx,css},PixelStudioPanel/,PaletteManager/,Toolbar/{Toolbar,PixelStudioTools}.{tsx,css},CopyFromModal/}` → `client/src/ui/components/` · **new:** 10 files in `client/src/containers/` | **T-08** · findings 04 **CSS-16** (G4 — `PixelStudioPanel`'s `.shape-btn` is styled by `LightingStudioPanel.css`) · P2-06 (store field names) | **L** | `NormalPicker` loses its `isLightDirection` prop and gains 2 containers — an easy place to wire the wrong store field. Detect: `bunx tsc -b`; manual — change the selected normal AND the light direction, confirm they stay independent. |
| **T-10** | Purify the 5 **S-effort** modals (batch 2) — `AddVariantModal`, `VariantSelectModal`, `FrameTagsModal`, `HeightMapModal`, `LayerColors` + containers + stories | `client/src/components/{AddVariantModal,VariantSelectModal,FrameTagsModal,HeightMapModal,LayerColors}/` → `client/src/ui/components/` · **new:** 5 files in `client/src/containers/` | **T-08** · findings 04 **CSS-14** (G2 — `AddVariantModal` shares 7 classes with `ObjectLibrary`) | **M** | `LayerColors` moves the colour-extraction memo into its container; wrong invalidation → stale swatches. Also fixes 3 keyboard-inoperable toggles. Detect: manual — paint a new colour, confirm it appears in the layer colour list immediately; Tab to each toggle and press Space. |
| **T-11** | Purify the **M-effort** components — `ColorPicker` (+ `ui/utils/colorMath.ts`), `LightingStudioTools`, `Header` (+ `AiConfigPopover`), `ProjectSelectModal`, `BrowseBackupsModal` + containers + stories | `client/src/components/{ColorPicker,Toolbar/LightingStudioTools.tsx,Header,ProjectSelectModal,BrowseBackupsModal}/` → `client/src/ui/components/` · **new:** `client/src/ui/utils/colorMath.ts` · **new:** 6 files in `client/src/containers/` | **T-09**, **T-10** · findings 04 **CSS-15, CSS-17, CSS-22** · P2-06 (`aiServiceUrl` placement) | **L** | `Header`'s AI-config popover holds 14 `useState`; extracting it can change popover open/close timing. `aiServiceUrl` may move to `SessionStore` (findings 02) — if P2-06 has not settled this, the container binds the wrong store. Detect: manual — save a project, switch project, confirm the AI URL behaves as P2-06 specifies. |
| **T-12** | Purify the two floating panels — `FrameReferencePanel`, `ReferenceImagePanel` + containers + stories | `client/src/components/{FrameReferencePanel,ReferenceImagePanel}/` → `client/src/ui/components/` · **new:** 2 files in `client/src/containers/` · consumes `client/src/ui/primitives/FloatingPanel/` | **T-05** · findings 03 **W7** | **M** | All three floating panels persist to **different** `uiState` keys (`frameReferencePanelPosition`, `referenceImagePanelPosition`, `lightingPreviewPanelPosition` — `types/index.ts:166-175`). Unifying them is a bug. Detect: drag + minimize + reload **each** panel; each must remember its own position. |
| **T-13** | Purify `ObjectLibrary` + extract its 5 inline dialogs | `client/src/components/ObjectLibrary/ObjectLibrary.{tsx,css}` → `client/src/ui/components/ObjectLibrary/` + `dialogs/{ObjectCreate,ObjectRename,ObjectDelete,ObjectDuplicate,ObjectResize}Dialog.tsx` · **new:** `client/src/containers/ObjectLibraryContainer.tsx` | **T-04** (`ConfirmDialog`), **T-10** · findings 04 **CSS-14** (G2 serialization point) | **L** | `ObjectLibrary` is a findings-04 **serialization point** — it appears in collision groups G2, G6 **and** G7 and cannot be worked by two agents at once. 15 `useState` → ~4. Detect: exercise all 5 dialogs. |
| **T-14** | Purify the timeline family — `FrameTimeline`, `FramesView`, `VariantView` + containers + stories | `client/src/components/FrameTimeline/{FrameTimeline.{tsx,css},FramesView.tsx,VariantView.tsx}` → `client/src/ui/components/{FrameTimeline,FramesView,VariantView}/` · **new:** 3 files in `client/src/containers/` | findings 03 **W10, W11** · findings 04 **CSS-20** · **T-05** (`ThumbnailCanvas`, `Dropdown`) | **L** | These are already half-pure (they take `project`/`obj` as props and use the store only for actions) — the easiest big purification. But **must land after W10** or `VariantView`'s self-duplicated drag-reorder gets converted twice. Detect: reorder frames in all 3 views; edit a pixel and confirm the thumbnail updates. |
| **T-15** | Split + purify `TimelineView` → `TimelineGrid` + `TimelineCell` | `client/src/components/FrameTimeline/TimelineView.tsx` → `client/src/ui/components/TimelineView/{TimelineView,TimelineGrid,TimelineCell}.tsx` · **new:** `client/src/containers/TimelineViewContainer.tsx` | **T-14** | **L** | 836 lines, 6 responsibilities, cell clipboard. Delete the 3 dead symbols while here (`moveLayer` :305, `getCurrentObject` :313, `gridRef` :328). Detect: `bunx tsc -b`; copy/paste a timeline cell; keyboard nav across the grid. |
| **T-16** | Extract `CanvasSurface` + `CanvasContainer` | `client/src/components/Canvas/Canvas.tsx` → `client/src/ui/components/CanvasSurface/CanvasSurface.tsx` + `client/src/containers/CanvasContainer.tsx` · `client/src/ui/canvas/{render,tools,model}/` (relocated from `components/Canvas/`) · `client/src/ui/hooks/{useCanvasViewport,useCanvasGeometry,useCanvasKeyboard,useCanvasPointer,useCanvasRender}.ts` | findings 03 **W12→W13→W14→W15** (all four, in order) · **T-05** | **L** | **Highest risk in this document.** The entire editing surface, zero tests today. Do not start before findings 03's five characterization tests exist. Detect: golden-image tests per mode; the full manual matrix in findings 03 W13/W14. |
| **T-17** | Extract `LightingSurface` + `LightingPreviewPanel` + `LightingCanvasContainer` | `client/src/components/Canvas/LightingCanvas.{tsx,css}` → `client/src/ui/components/{LightingSurface,LightingPreviewPanel}/` + `client/src/containers/{LightingCanvasContainer,LightingPreviewPanelContainer}.tsx` · `client/src/ui/canvas/render/{renderLightingPreview,renderNormalEdit,renderBrushOverlay}.ts` · `client/src/ui/hooks/useLightingPaint.ts` | findings 03 **W16** · **T-16** (both touch `components/Canvas/` — **must not run in parallel**, see findings 03's collision warning) · **T-05** | **L** | Also adopts rAF coalescing and the ref-based `lastPaintPixel` fix. Detect: full paint session in the lighting studio; confirm no dropped strokes. |
| **T-18** | `ReferenceImageModal` → `ReferenceImageCropper` + container (after the module-state move) | `client/src/components/ReferenceImageModal/ReferenceImageModal.{tsx,css}` → `client/src/ui/components/{ReferenceImageModal,ReferenceImageCropper}/` · **new:** `client/src/containers/ReferenceImageContainer.tsx` · `client/src/App.tsx` (drops the 4 imports at :14-19) | findings 03 **W18** (module state → store) · findings 04 **CSS-17** (must land **first**) · **T-04** | **L** | **HIGH.** `App.tsx` relies on module state surviving unmount; moving it changes lifetime semantics. ⚠️ Collision: CSS-17 also edits this file — sequence CSS-17 → W18 → T-18, never in parallel. Detect: manual — load image → close → reopen → switch project → reopen. |
| **T-19** | Decompose `AIInterpolateModal` into shell + 6 steps + 2 parts + container | `client/src/components/AIInterpolateModal/AIInterpolateModal.{tsx,css}` → `client/src/ui/components/AIInterpolate/{AIInterpolateModal.tsx,steps/*.tsx,parts/*.tsx}` · **new:** `client/src/containers/AIInterpolateContainer.tsx` · `client/src/ui/hooks/useInterpolationJob.ts` · `client/src/ui/utils/frameEncoding.ts` | findings 03 **W0** (the 5 array-rank type errors), **W17** · findings 04 **CSS-21** · **T-04** | **L** | Worst coupling in the codebase (`const store = useEditorStore()` + 2 direct `setState` calls). AI job flow needs a live `ai-service` to verify end to end. Re-attach the 8 dead status classes as `--{status}` modifiers. Detect: full interpolate → review → accept against a running `ai-service`. |
| **T-20** | Author the 3 layouts + `AppShell` + `AppContainer` + `GlobalHotkeys`; retire `App.tsx` | `client/src/App.{tsx,css}` → `client/src/ui/layouts/{PixelStudioLayout,LightingStudioLayout,LoadingLayout}/` + `client/src/ui/components/AppShell/` + `client/src/containers/{AppContainer,GlobalHotkeys}.tsx` · `client/src/main.tsx` | **T-16**, **T-17**, **T-18**, **T-19**, **T-11**, **T-12**, **T-13**, **T-14**, **T-15** · findings 04 **CSS-19** | **L** | The two `useEffect` blocks in `App.tsx` (`:65-88` project init + reference restore, `:91-152` global hotkeys) move to different homes. The `` ` `` / ``Shift+` `` / Escape hotkeys interact with `Canvas.tsx:1741`'s capture-phase handler. Detect: manual — focus mode toggle, studio-mode cycle, Escape while a modal is open. |
| **T-21** | Delete the empty `components/` tree and add the layer-boundary CI gate | **delete:** `client/src/components/GaussianFillModal/` and `client/src/components/` (once empty) · `client/package.json` (add `lint:boundaries`) · **new:** `client/scripts/check-boundaries.mjs` | **T-20** | **S** | A stale import survives the move and `components/` cannot be deleted. Detect: `test ! -d client/src/components` and `bunx tsc -b` both pass. |

**21 work items.** T-01 → T-03 are strictly sequential prerequisites. T-04/T-05
gate everything after. T-08 → T-15 are largely parallel (disjoint folders).
T-16 → T-17 are **strictly sequential** (both touch `components/Canvas/`). T-20 is
the join point.

### Collision warnings for task 09

| Path | Contended by | Rule |
| --- | --- | --- |
| `client/src/components/Canvas/` | **T-16**, **T-17**, findings 03 W12–W16 | Never parallel. Order: W12→W13→W14→W15→T-16→W16→T-17. |
| `client/src/components/ReferenceImageModal/ReferenceImageModal.tsx` | **T-18**, findings 03 W18, findings 04 CSS-17 | Order: CSS-17 → W18 → T-18. |
| `client/src/components/ObjectLibrary/` | **T-13**, findings 04 CSS-14/G2, G6, G7 | `ObjectLibrary` is a findings-04 serialization point. CSS-14 first. |
| `client/src/components/RightSidebarTopControls/` | **T-07**, findings 04 CSS-15 (G3), CSS-23 (G9) | CSS-15 → T-07. |
| `client/src/components/PixelStudioPanel/` | **T-09**, findings 04 CSS-16 (G4), CSS-23 (G9) | CSS-16 → T-09. |
| `client/src/components/FrameTimeline/` | **T-14**, **T-15**, findings 03 W10/W11, findings 04 CSS-20 | Order: W10 → W11 → CSS-20 → T-14 → T-15. |
| `client/eslint.config.js` | **T-01**, findings 01 D6 | D6 creates the file; T-01 appends three config blocks. Sequential. |
| `client/src/index.css` | **T-03**, findings 04 CSS-01/02/04/07/10 | T-03 only *imports* it. Safe in parallel, but CSS-07 must land first or `preview.ts` imports the wrong shape. |

---

## Verification

Every command runs from the repo root and exits non-zero on failure.
**Baseline caveat:** findings 03 measured that `cd client && bun run build`
**currently fails with 56 errors**. Until findings 03 **W0** lands, no command
below is a meaningful gate. W0 is a hard prerequisite for this entire document.

| Work item | Command(s) | Manual checks |
| --- | --- | --- |
| **All items (gate)** | `cd client && bunx tsc -b && bunx vite build && bunx eslint . && bunx storybook build` | — |
| **T-01** | `cd client && bunx eslint .` (exit 0) — then the **boundary probe**, which MUST fail: <br>`printf 'import { useEditorStore } from "../../stores";\nexport const x = useEditorStore;\n' > src/ui/components/__probe.ts && ! bunx eslint src/ui/components/__probe.ts; rc=$?; rm -f src/ui/components/__probe.ts; exit $rc` <br>Repeat with `import type { Layer } from "../../types"` under `src/ui/primitives/` — must also fail. | Read the ESLint error message; it must name the taxonomy doc so the next agent knows why. |
| **T-02** | `cd client && bunx tsc -b` · `bunx vitest run src/fixtures` (round-trip assertion) · `! grep -rn "makeAutoObservable\|observable\|from \"mobx\"" src/fixtures` (must find nothing) | Eyeball `projectDense` in a story — 12 objects × 12 frames × 8 layers must actually render, not silently truncate. |
| **T-03** | `cd client && bunx storybook build` (exit 0, emits `storybook-static/`) | **Required, not automatable:** open `bunx storybook dev`; confirm (a) the Button story is **styled**, not a native button; (b) a `var(--font-mono)` element renders in JetBrains Mono, not fallback `monospace` (this is the `preview-head.html` check — the easiest thing to miss); (c) the canvas background is `#0a0a0f`, not white. |
| **T-04** | `bunx storybook build` · a11y addon reports **0 violations** at `test: "error"` for all 6 · `test $(grep -rn '<button' client/src/ui/components --include='*.tsx' \| wc -l) -eq 0` once adoption completes | **The Escape-precedence matrix — this is the one that cannot be automated.** Open a modal over the canvas with an active selection: Escape must close the modal and **must not** clear the canvas selection (`Canvas.tsx:1741-1761` is capture-phase) and **must not** clear `colorAdjustment` (`App.tsx:91-95`). Then with no modal open, Escape must still do both. Also: open a `ConfirmDialog` from inside a modal — Escape closes only the confirm. Tab must cycle within the topmost dialog only. |
| **T-05** | `bunx storybook build` · a11y 0 violations for all 12 · `test $(grep -rn 'type="range"\|type="number"' client/src/ui/components --include='*.tsx' \| wc -l) -eq 0` after adoption | `Toggle`: Tab to each of the 3 previously-inoperable toggles in `LayerColors` and press Space — all three must respond (they cannot today). `Tooltip`: focus a tool button with the keyboard — the tooltip must appear (a `title=` attribute does not do this). `ThumbnailCanvas`: edit a pixel, confirm the thumbnail updates (the `revision` prop replacing the 91-line comparator is the regression risk). |
| **T-06** | `cd client && bunx tsc -b && bunx eslint . && bunx storybook build` | Delete, move and squash a layer in **both** `frame` and `all-frames` scope; verify every frame updates for the all-frames variants. Drag-reorder layers. Copy/paste a layer within and across objects. |
| **T-07** | `cd client && bunx tsc -b && bunx storybook build` | Sliders in `RightSidebarTopControls` must look **identical** before and after (they are styled by `ColorPicker.css` today — see findings 04 CSS-11/CSS-15). Zoom, brush size, shape mode, border radius, selection expand/shrink/clear all still work. |
| **T-08** | `cd client && bunx tsc -b && bunx eslint .` · `test ! -d client/src/components/AnchorGrid` (etc. per moved dir) | Open the export preview and confirm it loads (its fetch moved to the container). Resize an object via `ResizeModal` with all 9 anchor positions. |
| **T-09** | `cd client && bunx tsc -b && bunx eslint . && bunx storybook build` | Change the **selected normal** and the **light direction** independently — `NormalPicker` now has two containers and wiring the wrong store field is the failure mode. Brush size, eraser shape, pencil brush max, origin colour all round-trip. |
| **T-10** | as above | Paint a new colour → it must appear in the `LayerColors` list immediately (the extraction memo moved to the container). Tab+Space each of the 3 `LayerColors` toggles. Add/remove a frame tag. Apply a height map. |
| **T-11** | as above | `ColorPicker`: drag across both the SV square and the hue strip; the store must be written on release, not on every mousemove. `Header`: trigger save and export, confirm both status indicators colour correctly (these are the runtime-concatenated class families, findings 04 CSS-22). AI URL: set it, switch project, confirm the behaviour P2-06 specifies. |
| **T-12** | as above | Drag, minimize and **reload** each of the 3 floating panels independently; each must remember **its own** position (3 distinct `uiState` keys). Dragging one must not move another. |
| **T-13** | as above | Exercise all 5 extracted dialogs: create, rename, delete (with undo), duplicate, resize. Confirm the delete-confirm renders **above** the object library, not behind it (the `z-index:1001` vs `99999` bug). |
| **T-14** | as above | Reorder frames by drag in all 3 timeline views; the drop indicator must land correctly at start, middle and end. Edit a pixel and confirm the thumbnail updates. Play/pause in each view. |
| **T-15** | as above · `! grep -n 'gridRef' client/src/ui/components/TimelineView/*.tsx` | Copy and paste a timeline cell within a row and across rows. Add a layer to all frames, and at a specific position. Row striping (`--even`/`--odd`) still alternates. |
| **T-16** | `cd client && bunx tsc -b && bunx vitest run` (golden-image tests per mode must pass) · `bunx storybook build` | The full findings-03 W13/W14 matrix: all 12 tool hotkeys; WASD under all three priority modes (reference-trace > frame-trace > variant); arrows under each `selectionBehavior`; Escape's 3-level precedence; `.`/`,` frame nav. Draw with pixel/eraser/fill-square/line/rect/ellipse at brush size 1 and >1, circle and square, **with a mouse and on a touch device** — confirm no out-of-bounds writes at grid edges (the measured touch-eraser drift). Trackpad pinch, ctrl+wheel, two-finger pan. |
| **T-17** | `cd client && bunx tsc -b && bunx storybook build` | Full paint session in the lighting studio; no dropped strokes after the rAF change. Normal paint and height paint round-trip. Compare the `Default` and `LightGridMode` stories of `CanvasSurface` and `LightingSurface` side by side — the grids must now **agree** (they do not today: 0.05 + `lightGridMode`-aware vs hard-coded 0.08). |
| **T-18** | `cd client && bunx tsc -b && bunx eslint .` · `! grep -n 'ReferenceImageModal' client/src/App.tsx` (the 4 imports at :14-19 must be gone) | **Mandatory, no automated substitute:** load a reference image → close the modal → reopen (image persists) → switch project → reopen (correct image). This is exactly what the module-level `persistentState` exists for, and the whole risk of the item. |
| **T-19** | `cd client && bunx tsc -b` · `bunx vitest run` (`frameEncoding` byte-equality + `applyInterpolation` asserts `pixels` is `PixelData[][]`) · `bunx storybook build` | Full AI interpolate → review → accept against a **running** `ai-service`. Confirm the per-pair status styling now renders (the 8 dead status classes re-attached as modifiers). |
| **T-20** | `cd client && bunx tsc -b && bunx eslint . && bunx vite build && bunx storybook build` | Full app pass: both studios; focus mode (`` ` ``) hides left + bottom panels; ``Shift+` `` cycles studio mode; Escape clears `colorAdjustment` when no modal is open and does **not** when one is; the loading screen renders on a cold start. Layout stories at empty / typical / dense must each render without a store. |
| **T-21** | `test ! -d client/src/components` · `cd client && bunx tsc -b && bunx eslint . && node scripts/check-boundaries.mjs` | None. |
| **Final gate** | `cd client && bunx tsc -b && bunx vite build && bunx eslint . && bunx stylelint "src/**/*.css" && bunx storybook build && bunx vitest run` · **boundary proof:** `! grep -rn "useEditorStore\|from \"mobx\|from \"../stores\|from \"../api" client/src/ui --include='*.tsx' --include='*.ts'` | Every story in the sidebar renders. a11y addon: 0 violations across all 94 stories. |

### The one verification asset this plan depends on

**Storybook must land before the CSS conversions, not after.** findings 04 Q5
states this explicitly and asks task 09 to decide: *"if task 08 schedules
Storybook in an early wave, task 09 should re-order to put it before CSS-05 —
that is the single highest-leverage sequencing decision available."*

**This document's recommendation: yes, do exactly that.** T-03 (Storybook harness)
should be scheduled immediately after findings 04 CSS-01/02/07 and **before**
CSS-05 (the 585-literal token substitution). The reason is measured: CSS-05 is the
highest visual-regression risk in the entire refresh, and the alternative to a
Storybook baseline is manual screenshot comparison of 34 components in every state.

There is a genuine ordering tension to record: `preview.ts` imports
`../src/index.css`, whose shape CSS-07 changes. The resolution is that **T-03
depends on CSS-07 only** (a one-line `main.tsx` change plus an import manifest),
not on the full token substitution. That gives a working Storybook before CSS-05
without importing a half-converted stylesheet.

---

## Open questions

| # | Question | Blocking? | Assumption to proceed under |
| --- | --- | --- | --- |
| **T-Q1** | **Should `ui/` be forbidden from importing `types/` entirely, or only `ui/primitives/`?** This document bans domain types in primitives but allows them in `ui/components/` and `ui/layouts/` — that is what makes the Components tier "domain-aware but pure". A stricter reading of "fully divorced from state" might ban the domain types everywhere in `ui/`. | **Non-blocking — shapes T-01** | Proceed as written: **primitives ban domain types, components and layouts do not.** Banning `Layer`/`Frame` from `ui/components/` would force every component to re-declare structural clones of the domain types, which is strictly worse. The locked decision is about *state*, not *types*. |
| **T-Q2** | **Do layouts take regions as `ReactNode`, or as data?** This document chooses `ReactNode` injection (14 props for `PixelStudioLayout` instead of ~40), which preserves MobX's per-region `observer()` granularity. The cost is that a layout story shows stubs, not the real thing. | **Non-blocking** | Proceed with `ReactNode` injection. A layout story's job is to verify *arrangement* (focus mode hides two regions; the canvas area is the flex-grow child), not to re-verify every child. Full-fidelity screens are covered by the app itself and by the region stories. |
| **T-Q3** | **Should the `Modal` primitive mandate `isOpen`, or accept both conventions?** Measured: 8 modals early-return on `isOpen`; **6 take no `isOpen` prop at all** and rely on conditional parent mounting (`AddVariantModal`, `CopyFromModal`, `ObjectSelectModal`, `VariantSelectModal`, `BrowseBackupsModal`, `ProjectSelectModal`). findings 03 open question 12 raises the same point. | **Non-blocking — affects T-04, T-08…T-13** | Proceed with **`isOpen` optional, defaulting to `true`**, so the 6 conditionally-mounted callers keep working unchanged and can migrate individually. **This changes unmount timing for those 6** once they do migrate — state they currently discard on unmount would persist. Each migration must be reviewed for that. |
| **T-Q4** | **Where does `ui/hooks/` sit relative to the store boundary?** `useCanvasViewport`, `useFloatingPanel`, `useDragReorder` are pure DOM/gesture logic, so this document puts them **inside** `ui/` and under the import ban. But `useInterpolationJob` polls a job API — it cannot be inside. | **Non-blocking** | Proceed: pure DOM/gesture hooks live in `ui/hooks/` and obey the ban; anything that fetches or reads a store lives in `containers/hooks/` and does not. `useInterpolationJob` goes to `containers/hooks/`. If a hook is ambiguous, the ESLint rule decides it — a hook that trips the rule belongs outside. |
| **T-Q5** | **Is `AppShell` a component or a layout?** It composes five page regions, which sounds like a layout, but it does not decide *what page this is* — both layouts render it. | **Non-blocking** | Proceed with **component**. The membership rule is "is this a full page?"; `AppShell` is chrome that two pages share. It still gets stories (it is the `app` BEM block and owns the `.canvas-area` collision fix, findings 04 CSS-19). |
| **T-Q6** | **Should the 5 CSS primitives from findings 04 (`btn`, `modal`, `panel`, `slider`, `confirm-dialog`) become React primitives, and in what order?** findings 04 Q6 flagged this to this task explicitly. | **Non-blocking — cross-cutting, resolved** | **Answered: yes, same names, CSS first.** findings 04 CSS-08…12 extract the stylesheets under exactly the block names this document's primitives use, so the React extraction (T-04, T-05) is strictly additive. Do **not** reverse the order — building `Modal.tsx` before `blocks/modal.css` exists means inventing class names twice. |
| **T-Q7** | **How are the 14 `position: fixed` modals rendered in Storybook?** findings 04 Q7 flagged this here as a taxonomy decision. | **Non-blocking — resolved** | **Answered:** the `Modal` primitive takes `container?: HTMLElement \| null` and a `withModalHost` decorator supplies a local `position: relative; transform: none` element. Config given in § Storybook. This is why `container` is in the primitive's public interface rather than hard-coded to `document.body`. |
| **T-Q8** | **Does `ReferenceImageModal`'s state belong in `UIStore` or `SessionStore`?** findings 03 open question 6 defers this to P2-06; T-18 cannot be written until it is settled. | **Blocking T-18** | Assume **`UIStore`** (it is ephemeral view state persisted into `project.uiState`), per findings 03's assumption. **T-18 must sequence after P2-06's design is final.** If P2-06 chooses otherwise, only T-18's container changes — the `ui/` components are unaffected, which is the point of the boundary. |
| **T-Q9** | **Is a11y in scope for the refresh?** findings 03 open question 11 asks the same and notes no P1 task owns it. This document bakes it into every primitive (`role="dialog"`, focus trap, `aria-label`, keyboard operation) and sets the Storybook a11y addon to `test: "error"`, which will **fail CI** on a violation. | **Non-blocking, but the CI gate needs owner sign-off** | Proceed with **a11y built into the primitives** — adoption then fixes 14 modals, 9 toggles and 142 tooltips for free, at no extra workstream cost. **But start the a11y addon at `test: "todo"` and promote to `"error"` only after T-05 lands**, or the first story fails the build on pre-existing debt. Owner should confirm the eventual `"error"` gate. |
| **T-Q10** | **Should containers be one-per-component (41 of them) or coarser?** 6 of the 41 are trivial pass-throughs. A coarser design (one container per region) would be fewer files but would re-render more. | **Non-blocking** | Proceed with **one-per-component**. MobX's `observer()` granularity is the whole performance argument for the migration; coarse containers throw it away. The 6 trivial ones cost ~10 lines each and keep the rule uniform — "every store-coupled component has exactly one container" needs no exceptions. |
| **T-Q11** | **Is the 94-story target realistic, or should coverage be narrowed?** 94 story files is substantial for a codebase with zero tests today. | **Non-blocking** | Proceed with the target, but treat **S1 (18 primitives) as the only mandatory wave**. Primitives are where stories pay for themselves — one `Button` story replaces 197 call sites' worth of visual review. Component and layout stories (S2–S8) are valuable but individually droppable if a wave runs long. Do not drop S1. |
| **T-Q12** | **`uiState.lightGridMode` is written but not declared in `CompactUIState`** (`types/index.ts:967`, TS2339) — a real round-trip data-loss bug findings 03 assigns to W0. It is also a story parameter for the two canvas components. | **Non-blocking — depends on W0** | Assume W0 fixes it. The `LightGridMode` stories for `CanvasSurface` and `LightingSurface` are the first place the fix becomes *visible*, so write them and use them as the manual verification for W0's persistence claim. |
| **T-Q13** | **Storybook 9 vs 10.** findings 01 recommends 9.1.20 with Vite 7; 10.5.8 also resolves but pulls a `vite-plus` peer and a Playwright download. If the project later wants `@storybook/addon-vitest` for component testing, 10 becomes more attractive. | **Non-blocking** | Proceed with **9.1.20**, per findings 01. Revisit only if component-level interaction testing becomes a requirement. Note the upgrade path is real but not free — it changes the Vite major too. |
