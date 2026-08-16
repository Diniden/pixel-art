# 22 — BEM conversion: the independent components

**Wave:** W14 · **Depends on:** 18, 19
**Touches:** `client/src/components/FrameTimeline/FrameTimeline.{tsx,css}` · `client/src/components/FrameTimeline/FramesView.tsx` · `client/src/components/FrameTimeline/TimelineView.tsx` · `client/src/components/FrameTimeline/VariantView.tsx` · `client/src/components/AIInterpolateModal/AIInterpolateModal.{tsx,css}` · `client/src/components/Header/Header.{tsx,css}` · `client/src/components/FrameReferencePanel/FrameReferencePanel.{tsx,css}` · `client/src/components/EdgeInterpolateModal/EdgeInterpolateModal.{tsx,css}` · `client/src/components/HeightMapModal/HeightMapModal.{tsx,css}` · `client/src/components/PaletteManager/PaletteManager.{tsx,css}` · `client/src/components/FrameTagsModal/FrameTagsModal.{tsx,css}` · `client/src/components/PreviewModal/PreviewModal.{tsx,css}` · `client/src/components/Canvas/LightingCanvas.{tsx,css}` · `client/src/components/AnchorGrid/AnchorGrid.{tsx,css}` · `client/src/components/LayerColors/LayerColors.{tsx,css}` · `client/src/components/ResizeModal/ResizeModal.{tsx,css}` · `client/src/components/LightingStudioPanel/NormalPicker.{tsx,css}` · `client/src/components/LayerPanel/LayerPanel.{tsx,css}`
**Effort:** L

## Objective

After this task every remaining stylesheet is BEM-converted. These 15 components share **zero** classes with any other file, so each is a self-contained conversion and they can be split across parallel sessions freely — but they are grouped into one task because they share the same method and the same gate.

## Context

**The BEM convention is specified in full in task 20's Context** — read its "The BEM convention (R1-R11)", "state-word mapping table" and "Worked example" sections before starting. They apply here unchanged. This file records only what is specific to these components.

### The components, with their size and the reason each is what it is

| Component | Classes | Effort | Specifics |
| --- | ---: | --- | --- |
| `FrameTimeline` (+ `FramesView`, `TimelineView`, `VariantView`) | **94** | **L** | The largest stylesheet (1,062 lines) serving **4 consumer components**. Per R1's documented exception this file may declare **four** blocks: `frame-timeline`, `frames-view`, `timeline-view`, `variant-view`. Many dynamic `${}` sites: `even`/`odd`, `hovered`, `selected`, `variant-mode`. **Split into two sessions if needed** — grid/timeline classes first, then frames/variant classes. |
| `AIInterpolateModal` | **83** | **L** | 898 CSS lines, 1,252 TSX lines. Task 09 already deleted its 8 dead job-status classes (`.queued`, `.processing`, `.completed`, `.failed`, `.generated`, `.placeholder`, `.ai-btn-preview`, `.between`/`.keyframe`). Block name is **`ai-interpolate-modal`** per R1's acronym rule — not `a-i-interpolate-modal`. Apply R1b prefix stripping: `ai-modal-header` → `ai-interpolate-modal__header`. |
| `Header` | 41 | M | **Two runtime-concatenated families.** `Header.tsx:298` builds `` `export-status export-status-${exportStatus}` `` → `` `header__export-status header__export-status--${exportStatus}` ``. `Header.tsx:173-175` returns a class from a `switch` on `saveStatus` → the switch returns the **suffix only**, and the site becomes `` `header__save-status header__save-status--${saveStatusModifier}` ``. Both need the dynamic-class CSS comment. Also `.ai-error`/`.configured` at `Header.tsx:227` → `--error`/`--configured`. |
| `FrameReferencePanel` | 26 | S | `.different-object` → `--foreign-object` per the state-word table. |
| `EdgeInterpolateModal` | 21 | S | Near-clone of `HeightMapModal` — their first 15 CSS lines differ by **exactly one line**, the selector. Both must end up with distinct block names. |
| `HeightMapModal` | 20 | S | See above. |
| `PaletteManager` | 20 | S | `.expanded` is referenced at `PaletteManager.tsx:78` but has **no rule** — convert the className, add no rule (see Constraints). |
| `FrameTagsModal` | 19 | S | Holds the codebase's only `aria-label` (line 177) — preserve it. |
| `PreviewModal` | 18 | S | |
| `LightingCanvas` | 17 | S | |
| `AnchorGrid` | 15 | S | **Has 4 runtime-built classes.** `AnchorGrid.tsx:121` builds `` `anchor-arrow arrow-${direction} …` `` → `` `anchor-grid__arrow anchor-grid__arrow--${direction} anchor-grid__arrow--${expanding ? 'expanding' : 'shrinking'}` ``. Must carry the dynamic-class comment. |
| `LayerColors` | 13 | S | Has 3 keyboard-inaccessible toggles (`:169-180`, `:197-208`, `:254`) — **do not fix them here**; a later task adopts the `Toggle` primitive. |
| `ResizeModal` | 13 | S | |
| `NormalPicker` | 6 | S | Smallest conversion. |
| `LayerPanel` | 48 | M | **This is the worked example in task 20's Context** — follow it literally. Deepest JSX in the codebase (18 levels), so R5's two-compound cap and R6's wrapper suffixes matter most here. Task 09 already deleted its dead confirm-dialog block and task 18 folded the salvageable rules into the `confirm-dialog` primitive. |

### The dynamic-class comment format

Any class built by string concatenation never appears as a literal, so a purge tool or a naive orphan detector would delete it. Each such CSS block needs a comment:

```css
/* dynamic: anchor-grid__arrow--{up|down|left|right} built at AnchorGrid.tsx:121 */
/* dynamic: header__export-status--{success|error} built at Header.tsx:298 */
/* dynamic: header__save-status--{saving|saved|error} built at Header.tsx:173-175 */
```

### The missing-CSS gaps in this file set

Referenced in TSX, no rule anywhere. **Convert the className to its BEM name and add no rule.**

| Token | Site |
| --- | --- |
| `ai-step-layer` | `AIInterpolateModal.tsx:922` (`.ai-step-title`/`.ai-step-desc` exist) |
| `frame-drop-indicator-variant` | `VariantView.tsx:490` — **the highest-confidence real bug in the set**; `.frame-drop-indicator` and `.frame-drop-indicator-base` both exist, the `-variant` sibling does not, so the variant view's drop indicator renders unstyled |
| `expanded` | `PaletteManager.tsx:78` — the accordion has no visual open state |
| `odd` | `TimelineView.tsx:761` — `.even` is styled, `.odd` is emitted with no rule (currently fine since odd is the default, but the pair is asymmetric) |

## Steps

Per component (they are independent — parallelise freely):

1. Build the old→new class map applying task 20's R1-R6 and the state-word table. Put the map in the commit message.
2. Rename in the `.css`, then update every `className` string in every consuming `.tsx`, **including inside `${…}` expressions**. Note `FrameTimeline.css` serves four `.tsx` files.
3. Adopt task 18's block names (`btn`, `modal`, `panel`, `slider`, `confirm-dialog`) — delete the local rule rather than renaming it.
4. Add the dynamic-class comments for `AnchorGrid` and `Header`.
5. `node scripts/check-classes.mjs --scope src/components/<Component>` → 0 dead, 0 missing.
6. Exercise **every** modifier state the component has.

## Constraints

- **Do not restructure, split, or move any component.** This task edits `className` strings and CSS selectors only. `FrameTimeline`, `TimelineView`, `LayerPanel`, `AIInterpolateModal` and `LightingCanvas` are all scheduled for decomposition in later tasks, and doing both at once makes "nothing changed visually" unverifiable.
- **Do not fix the four missing-CSS gaps.**
- **Do not fix `LayerColors`' keyboard-inaccessible toggles.**
- Do not change any token value; do not run Prettier on `.css`.
- `FrameTimeline.css` legitimately declares four blocks — that is R1's documented exception, not a violation.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx vite build && bunx storybook build
node scripts/check-classes.mjs                    # 0 dead, 0 missing
bunx stylelint "src/components/**/*.css" "src/App.css"
# Every class in every component stylesheet matches the R11 BEM regex:
for f in src/components/**/*.css src/App.css; do
  grep -hoE '^\.[a-z][A-Za-z0-9_-]*' "$f" | \
  grep -vE '^\.[a-z][a-z0-9]*(-[a-z0-9]+)*(__[a-z][a-z0-9]*(-[a-z0-9]+)*)?(--[a-z][a-z0-9]*(-[a-z0-9]+)*)?$' \
  && { echo "NON-BEM in $f"; exit 1; }
done
```

Manual checks:
1. **All 3 timeline views** (Frames, Timeline, Variant): row striping (`--even`/`--odd`), layer-header hover, drag-and-drop with the drop indicator landing correctly at start, middle and end, and play/pause in each.
2. **`Header`:** trigger a save and an export, and confirm **both** status indicators colour correctly — these are the runtime-concatenated families.
3. **`AnchorGrid`:** open the resize dialog and confirm all four arrow directions render and the expand/shrink states animate.
4. **`AIInterpolateModal`:** open it and walk every step of the flow.
5. **`EdgeInterpolateModal` and `HeightMapModal`:** both must still render distinctly — they were near-clones.
6. Every modifier state in every converted component.

## Definition of done

- [ ] All 15 components converted; every class in every component stylesheet matches the R11 regex.
- [ ] `FrameTimeline.css`'s four blocks are named `frame-timeline`, `frames-view`, `timeline-view`, `variant-view`.
- [ ] `AIInterpolateModal`'s block is `ai-interpolate-modal` (acronym rule) with R1b prefix stripping applied.
- [ ] The 7 runtime-built classes in `AnchorGrid` and `Header` are converted and carry dynamic-class comments.
- [ ] Task 18's block names are adopted everywhere; no local copies remain.
- [ ] `check-classes.mjs` reports 0 dead and 0 missing across the whole tree.
- [ ] The four missing-CSS gaps were **not** filled, and `LayerColors`' toggles were **not** fixed.
- [ ] No component was split, moved, or restructured.
