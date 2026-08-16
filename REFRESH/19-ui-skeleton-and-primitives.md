# 19 — The `ui/` skeleton and the 18 primitives

**Wave:** W12 · **Depends on:** 18, 10
**Touches:** `client/src/ui/primitives/` (new — 18 component folders, each `.tsx` + `.stories.tsx` + a `__tests__/*.test.tsx` snapshot) · `client/src/ui/{components,layouts,hooks}/.gitkeep` (new) · `client/src/containers/.gitkeep` (new) · `client/src/components/Icon/` (moved) · `client/src/ui/hooks/useFloatingPanel.ts` (new) · `client/src/ui/hooks/useDragReorder.ts` (new) · `client/.storybook/preview.tsx` (decorators only — the a11y addon stays at `test: "todo"` and is **not** promoted) · `client/package.json`
**Effort:** L

## Objective

After this task the four-tier directory structure exists with its boundaries enforced by ESLint, and 18 pure primitives are built, storied, and DOM-snapshot-tested. Adopting them in later tasks fixes a measured accessibility hole in 14 places at once and collapses roughly 1,400 lines of duplication.

## Context

### The four tiers, with mechanical membership rules

| Tier | Location | Membership rule (no judgement required) | May import |
| --- | --- | --- | --- |
| **Primitives** | `client/src/ui/primitives/` | **No domain type appears anywhere in the file.** If the props or body reference `Project`, `PixelObject`, `Frame`, `Layer`, `Variant`, `VariantGroup`, `VariantFrame`, `Palette`, `PixelData`, `Pixel`, `Normal`, `Tool` or `UIState`, it is not a primitive. | `react`, other primitives, `ui/hooks/`, its own `.css` |
| **Components** | `client/src/ui/components/` | Domain-aware but **pure**: every input arrives as a prop, every effect leaves as a callback. No store hook, no `observer()`, no `fetch`, no module-level mutable state. | primitives, other components, `types/`, `ui/hooks/`, pure `utils/` |
| **Layouts** | `client/src/ui/layouts/` | A **full-page composition**. Pure; 100% of its data arrives as props. | components, primitives, `types/` |
| **Containers** | `client/src/containers/` | The **only** tier that may touch MobX or the API. `observer()` lives here and nowhere else. | everything |

**The hard invariant: nothing under `client/src/ui/` may import from `client/src/stores/` or `client/src/api/`, directly or transitively.** This is what makes Storybook work at all — a story mounts a `ui/` export with literal props, and any reach for a store either crashes on an uninitialised singleton or silently renders whatever global state happens to exist.

Two corollaries, separately checkable:
- **No module-level mutable state in `ui/`.** Violated exactly once today, and load-bearing: `ReferenceImageModal.tsx:29` declares a mutable `persistentState` object that `App.tsx:14-19` imports four symbols from. That file cannot enter `ui/` until a later task moves the state.
- **No async data access in `ui/`.** `ProjectSelectModal`, `BrowseBackupsModal`, `ExportPreviewModal` and `AIInterpolateModal` call the API today. Those calls become callback props.

Task 05 already installed the ESLint blocks for `src/ui/**`, `src/ui/primitives/**` and the `observer()` restriction. This task creates the directories those globs point at.

`ui/hooks/` is deliberately **inside** the boundary: `useCanvasViewport`, `useFloatingPanel`, `useDragReorder` and `useCanvasRender` are pure DOM/gesture logic with no store access. Anything that fetches or reads a store lives in `containers/hooks/` instead — `useInterpolationJob` (which polls a job API) goes there.

### The 18 primitives, and why each exists

Counts are raw greps over `client/src/components/**/*.tsx`. There is **no** `Button`, `Modal`, `Slider`, `Tooltip` or `primitives/` directory anywhere today — `find client/src -type d \( -name ui -o -name primitives -o -name common -o -name shared \)` returns empty, and the only shared component is `Icon/Icon.tsx`.

| Primitive | Duplication it replaces | Priority |
| --- | --- | --- |
| **`Modal`** | **14 modal shells** (~298 TSX + ~250 CSS lines). All 14 share `backdrop > panel > header`. | **P0 — highest-value single extraction in the refresh** |
| `IconButton` | 13 verbatim close buttons: `className="close-btn"` + `<Icon icon={X} size={14}/>` at `AddVariantModal.tsx:126`, `CopyFromModal.tsx:187`, `ObjectSelectModal.tsx:113`, `VariantSelectModal.tsx:144`, `EdgeInterpolateModal.tsx:47`, `HeightMapModal.tsx:201`, `BrowseBackupsModal.tsx:125`, `ProjectSelectModal.tsx:108`, `ReferenceImageModal.tsx:755`; bespoke twins at `ResizeModal.tsx:60`, `PreviewModal.tsx:417`, `ExportPreviewModal.tsx:461`, `FrameTagsModal.tsx:175` | P0 |
| `Button` | **197 raw `<button>` elements**. Consecutive 13-line twins at `LayerPanel.tsx:148-160` vs `:161-173`; **8 clone buttons** at `ReferenceImagePanel.tsx:233-309` and **8 more** at `:333-403`; an identical play/preview pair at `FramesView.tsx:541-554`, `VariantView.tsx:427-440`, `TimelineView.tsx:658-671` | P0 |
| `Slider` | **27 `<input type="range">`**. Three consecutive 20-line copies at `EdgeInterpolateModal.tsx:51-116`; `LightControl.tsx:149,169,194,254`; `ColorPicker.tsx:538,559,585,620,646` | P0 |
| `NumberInput` | **21 `<input type="number">`**. Twin clamps at `ResizeModal.tsx:65-85`; an **identical FPS clamp** at `PreviewModal.tsx:449-456` and `ExportPreviewModal.tsx:506-515` | P1 |
| `SliderWithNumber` | 8 range+number rows: `LightControl.tsx:149-167` ×4 and `ColorPicker.tsx:538-661` ×5 are the same row | P0 |
| `ConfirmDialog` | `ObjectLibrary.tsx:608`, `AddVariantModal.tsx:248`, `BrowseBackupsModal.tsx:181` | P0 |
| `FloatingPanel` | 3 clones of drag + minimise + %-position persistence: `LightingCanvas.tsx:713-835`, `FrameReferencePanel.tsx:32-102,272-323`, `ReferenceImagePanel.tsx:32-94,130-191` (~120 duplicated lines) | P0 |
| `ThumbnailCanvas` | 5 sites, including a **91-line memo comparator** at `FramesView.tsx:15-163`, plus `VariantView.tsx:16-75`, `TimelineView.tsx:47-128`, `ObjectSelectModal`, `CopyFromModal` (~150 lines) | P0 |
| `Toggle` | 9 sites in **3 incompatible idioms**: a custom-slider span at `RightSidebarTopControls.tsx:309-319`; label-wrapped at `EdgeInterpolateModal.tsx:118-126`, `FramesView.tsx:571`, `VariantView.tsx:457`; and **keyboard-inaccessible** no-op `onChange` + div `onClick` at `LayerColors.tsx:169-180`, `:197-208`, `:254` | P1 |
| `Tooltip` | **142 `title=` attributes** plus two independent bespoke portal tooltips (`CopyFromModal.tsx:72-88`, `Toolbar.tsx:38-45`) — three mutually incompatible mechanisms and no shared one | P1 |
| `ColorSwatch` | 3 implementations: `LayerColors.tsx:270-278` and `ColorPicker.tsx:421-429` share the `rgba(...)` expression **and** the hex-`title` construction character-for-character; `PaletteManager.tsx:118-125` uses a third form | P1 |
| `Panel` | `index.css`'s `.panel`/`.panel-header`/`.panel-content` + 12 sites, where `panel-header` disagrees on nesting: a container form at `LayerPanel.tsx:145-147` vs bare text at `ColorPicker.tsx:415`, `RightSidebarTopControls.tsx:100,128`, `PixelStudioPanel.tsx:31,86,146` — and `LightingStudioPanel.tsx:19` and `:83` use **both** forms in one file | P2 |
| `Dropdown` | `ViewModeDropdown` inlined at `FrameTimeline.tsx:11-76` with its own click-outside effect | P2 |
| `Icon` | **move only** — `client/src/components/Icon/Icon.tsx` → `ui/primitives/Icon/` | — |
| `Field` | ~30 label+control sites | P2 |
| `EmptyState` | `.empty-state` defined identically in `LayerPanel.css:195`, `ObjectLibrary.css:237`, `PaletteManager.css:191` | P2 |
| `Badge` | `.selected-badge` ×3 (**three different fill colours**: `#8b5cf6`, `#6366f1`, `#10b981` — the green wins for all three today) and `.current-badge` ×3 (three different designs) | P2 |

**Do NOT build `Tabs`** — it has exactly one call site (`AIInterpolateModal.tsx:964-983`) and extracting it would be speculative. The widespread `${base} ${cond ? 'active' : ''}` idiom is covered by a `classNames` helper instead. **Do NOT build `ContextMenu`** — it is not implemented anywhere; it is absent, not duplicated.

### `Modal` — the details that matter

Measured accessibility state across all 14 modals: **0 have `role="dialog"`, 0 have `aria-modal`, 0 trap focus, and 12 of 14 cannot be closed with Escape.** The only `aria-label` in the entire set is at `FrameTagsModal.tsx:177`. A single `Modal` primitive fixes all 14 at once — the strongest ROI in the whole refresh.

Escape is currently handled in only two places, and they are copy-paste twins (`ExportPreviewModal.tsx:431-442`, `PreviewModal.tsx:393-405`). Two more (`BrowseBackupsModal.tsx:106-114`, `ProjectSelectModal.tsx:89-101`) put `onKeyDown` on a `tabIndex`-less div, which is **dead code**. Three modals skip `createPortal` entirely (`BrowseBackupsModal.tsx:116`, `ProjectSelectModal.tsx:103`, `ReferenceImageModal.tsx:750`).

Backdrop-close is implemented **two incompatible ways with no rationale**: 7 modals use `stopPropagation` on the panel, 7 use an `e.target === e.currentTarget` guard, and **5 do both redundantly** (`EdgeInterpolateModal.tsx:37+44`, `HeightMapModal.tsx:191+198`, `FrameTagsModal.tsx:160+170`, `ResizeModal.tsx:50+57`). Only `AIInterpolateModal.tsx:863-874` gets it right, tracking the mousedown origin so a drag-release outside does not close the modal. **Adopt that implementation.**

Required props:
- `isOpen?: boolean` — **optional, defaulting to `true`**. Measured: 8 modals early-return on `isOpen` while **6 take no `isOpen` prop at all** and rely on conditional parent mounting (`AddVariantModal`, `CopyFromModal`, `ObjectSelectModal`, `VariantSelectModal`, `BrowseBackupsModal`, `ProjectSelectModal`). Defaulting to `true` keeps all 6 working unchanged. ⚠️ **Migrating any of those 6 to `isOpen` changes its unmount timing** — state it currently discards on unmount would persist. Review each individually when it migrates.
- `container?: HTMLElement | null` — so the Storybook modal-host decorator (task 10) can constrain a `position: fixed` modal to the story canvas instead of covering the whole iframe.

⚠️ **The Escape handler must not fight the existing capture-phase listeners.** `Canvas.tsx:1741-1761` uses a capture-phase Escape handler with 3-level precedence, and `App.tsx:91-152` has a window-level keydown handler where Escape clears `colorAdjustment`. The acceptance criterion is the Escape-precedence matrix in Verification.

### Stories and tests

Every primitive gets:
- **A story file** (`Component.stories.tsx`, CSF3, `title: "Primitives/<Name>"`), colocated. Done means every `variant` × `size` combination reachable through controls, **plus** one explicit story per state controls cannot express (`disabled`, `loading`, `error`, `open`), the BEM block documented in the autodocs page, and keyboard operation demonstrated in at least one story.
- **A DOM snapshot test** (`__tests__/<Name>.test.tsx`, `dom` project): `expect(container.firstChild).toMatchSnapshot()` across 2-3 prop combinations. **This is the deliberate substitute for visual-regression tooling.** A BEM rename is a DOM structure change, and catching it here — where fixing one file fixes 14 modals — is the highest-leverage place to put a snapshot. Snapshot churn during later BEM conversions is expected and correct; each change must be reviewed, never blanket `-u`'d.

**Do NOT promote the Storybook a11y addon. It stays at `test: "todo"`, permanently.**

An earlier draft of this plan promoted it to `test: "error"` at the end of this task. **OWNER DECISION (2026-08-16): that promotion is cancelled — the addon remains advisory indefinitely, and no build anywhere in this plan fails on an accessibility violation.**

The accessibility work in this task is **unchanged and still mandatory**: every primitive builds in its accessible behaviour — `role="dialog"` and `aria-modal` on `Modal`, a focus trap, Escape handling, real `<button>`/`<input>` semantics on `Toggle`, labelled `Tooltip`s. Adopting them still fixes **14 modals, 9 toggles and 142 tooltips** at once, which is the whole ROI argument. Run the a11y checks and report the results as information; just do not make them a gate.

**Do run the checks:** confirm all 18 primitives report **zero** violations in Storybook and record that in the completion report. It is a quality bar for this task's own output, enforced by review rather than by the build.

### Two shared hooks land here

`useFloatingPanel` (from the 3 clones) and `useDragReorder` (from `FramesView.tsx:362-366,421-478,480-511`, `VariantView.tsx:123-132,167-273,275-334` — **duplicated twice within that one file** — and `TimelineView.tsx:322-326,574-602`, ~265 lines total). Both are pure DOM/gesture logic and belong in `ui/hooks/`.

⚠️ **The three floating panels persist to three *different* `uiState` keys** — `frameReferencePanelPosition`, `referenceImagePanelPosition`, `lightingPreviewPanelPosition` (`types/index.ts:166-175`). `useFloatingPanel` must take the key as a parameter. **Unifying them into one key is a bug.**

## Steps

1. Create `client/src/ui/{primitives,components,layouts,hooks}/` and `client/src/containers/` with `.gitkeep` files. Run task 05's boundary probes to confirm the ESLint rules now actually match something.
2. Move `client/src/components/Icon/Icon.tsx` → `client/src/ui/primitives/Icon/Icon.tsx` unchanged, and update its importers.
3. Build the **6 P0 primitives** first: `Modal`, `Button`, `IconButton`, `Slider`, `NumberInput`, `ConfirmDialog`. Each consumes the block CSS from task 18 (`blocks/btn.css`, `blocks/modal.css`, `blocks/slider.css`, `blocks/confirm-dialog.css`) — **do not invent new class names**.
4. Build `useFloatingPanel` and `useDragReorder` in `ui/hooks/`.
5. Build the remaining 12: `SliderWithNumber`, `Toggle`, `Tooltip`, `ColorSwatch`, `FloatingPanel`, `Panel`, `Dropdown`, `ThumbnailCanvas`, `Field`, `EmptyState`, `Badge` (plus `Icon`, moved in step 2).
6. Write a story file and a DOM snapshot test for each.
7. Confirm all 18 primitives report **zero** a11y violations in Storybook and record the result in the completion report. **Leave the addon at `test: "todo"`** — the promotion to `"error"` is cancelled (owner decision, 2026-08-16).

## Constraints

- **A primitive may not import a domain type.** ESLint enforces it; if a component needs `Project`/`Layer`/`Frame`/`Variant`/`Palette`, it belongs in `ui/components/` instead.
- **Nothing in `ui/` may import from `stores/`, `store/`, `api/`, `services/`, `mobx` or `mobx-react-lite`, or call `useContext`.**
- **Do not adopt the primitives in any existing component in this task.** Building and adopting are separate; adoption happens per-component in later tasks. Ship primitives + stories, then adopt.
- **Do not unify the three floating panels' persistence keys.**
- **Do not build `Tabs` or `ContextMenu`.**
- Do not create new CSS class names — use the block names task 18 established.
- Do not move any existing component into `ui/components/` here.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx eslint . && bun run build
bunx storybook build                         # exit 0
bunx vitest run --project dom                # primitive snapshots
bunx vitest run                              # full suite
# The boundary is real (task 05's probes, re-run now that ui/ exists):
printf 'import { useEditorStore } from "../../store";\nexport const x = useEditorStore;\n' > src/ui/components/__probe.ts
bunx eslint src/ui/components/__probe.ts && { echo "BOUNDARY NOT ENFORCED"; exit 1; }
rm src/ui/components/__probe.ts
# No primitive knows a domain type:
! grep -rn "Project\|PixelObject\|VariantGroup\|PixelData\|UIState" src/ui/primitives --include='*.tsx' --include='*.ts'
```

Manual checks — **the Escape matrix cannot be automated and is the acceptance criterion for `Modal`**:

1. Open a modal over the canvas **with an active selection**. Escape must close the modal, and must **not** clear the canvas selection (`Canvas.tsx:1741-1761` is capture-phase) and must **not** clear `colorAdjustment` (`App.tsx:91-95`).
2. With **no** modal open, Escape must still do both of those things.
3. Open a `ConfirmDialog` from **inside** a modal — Escape must close only the confirm dialog.
4. Tab must cycle within the topmost dialog only.
5. **`Toggle`:** Tab to each of the 3 previously keyboard-inoperable toggles in `LayerColors` and press Space — all three must respond. They cannot today.
6. **`Tooltip`:** focus a tool button with the keyboard — the tooltip must appear. A `title=` attribute does not do this.
7. **`ThumbnailCanvas`:** the `revision` prop replaces a 91-line memo comparator — edit a pixel in a story and confirm the thumbnail updates.
8. Every primitive story renders **styled** and on the dark background.

## Definition of done

- [ ] `client/src/ui/{primitives,components,layouts,hooks}/` and `client/src/containers/` exist; task 05's boundary probes fail ESLint as intended.
- [ ] All 18 primitives exist, each with a story file and a DOM snapshot test.
- [ ] `Modal` provides `role="dialog"`, `aria-modal`, a focus trap, Escape handling, `createPortal`, `isOpen` (optional, default `true`) and `container`; its backdrop-close tracks the mousedown origin.
- [ ] The Escape-precedence matrix (checks 1-4) passes.
- [ ] `useFloatingPanel` takes the persistence key as a parameter; the three panels' keys remain distinct.
- [ ] The Storybook a11y addon is **still at `test: "todo"`** (never promoted — owner decision, 2026-08-16), and all 18 primitives were checked and report zero violations, recorded in the completion report as information rather than as a gate.
- [ ] No primitive imports a domain type; nothing in `ui/` imports a store, the API, or MobX.
- [ ] **No existing component was migrated to use a primitive in this task.**
- [ ] `Tabs` and `ContextMenu` were not built.
