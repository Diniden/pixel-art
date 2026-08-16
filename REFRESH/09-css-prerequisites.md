# 09 — CSS prerequisites: dead classes, undefined tokens, keyframe collisions, import manifest

**Wave:** W5 · **Depends on:** 02
**Touches:** `client/src/index.css` · `client/src/App.css` · `client/src/main.tsx` · `client/src/styles/reset.css` (new) · `client/src/styles/tokens.css` (new) · `client/src/components/Toolbar/Toolbar.css` · `client/src/components/Canvas/Canvas.css` · `client/src/components/FrameTimeline/FrameTimeline.css` · `client/src/components/AIInterpolateModal/AIInterpolateModal.css` · `client/src/components/LayerPanel/LayerPanel.css` · `client/src/components/Header/Header.css` · `client/src/components/FrameReferencePanel/FrameReferencePanel.css` · `client/src/components/EdgeInterpolateModal/EdgeInterpolateModal.css` · `client/src/components/HeightMapModal/HeightMapModal.css` · `client/src/components/PreviewModal/PreviewModal.css` · `client/src/components/ProjectSelectModal/ProjectSelectModal.css` · `client/src/components/ReferenceImageModal/ReferenceImageModal.css` · `client/scripts/check-classes.mjs` (new)
**Effort:** M

## Objective

After this task 60 dead CSS classes are gone, the 6 referenced-but-undefined custom properties are defined (fixing 76 declarations that render wrong today), the 3 colliding `@keyframes` names are prefixed, `index.css` is an import manifest with the token set extracted, and `main.tsx` imports it in the correct order. This is the clean visual baseline that Storybook (task 10) then captures and the token substitution (task 11) is measured against.

## Context

All numbers below were produced by scripts run against the working tree.

### A. Six custom properties are referenced 76 times and never defined — a live rendering bug

| Token | Uses | Almost certainly meant to be | Evidence |
| --- | ---: | --- | --- |
| `--text-tertiary` | **28** | between `--text-secondary` (#a0a0b8) and `--text-muted` (#606078) | `ProjectSelectModal.css`, `BrowseBackupsModal.css` use it for `.close-btn` colour |
| `--border-secondary` | **28** | a dimmer `--border-primary` | `ProjectSelectModal.css:229` `.cancel-btn{border:1px solid var(--border-secondary)}` renders **borderless** |
| `--accent-hover` | 8 | a lighter `--accent-primary` | — |
| `--bg-active` | 5 | between `--bg-hover` and `--bg-elevated` | `.ref-box-btn:active{background:var(--bg-active)}` — the active state does nothing |
| `--text-on-accent` | 2 | `#000` (the accent is bright cyan) | `.shape-btn.active{color:var(--text-on-accent)}` — text on the active shape button is inherited/illegible |
| `--danger` | 1 | an alias of `--accent-danger` | — |

**Every one of those 76 declarations currently resolves to the property's inherited or initial value.** Fixing them is a prerequisite for any visual baseline: you cannot diff before/after if "before" is already wrong in 76 places.

Concrete values to define, chosen to match measured usage: `--bg-active: #3a3a4a` (that literal already appears 4× in `FrameReferencePanel.css`, `LightingCanvas.css`, `ReferenceImagePanel.css`), `--text-on-accent: #000`, `--danger: var(--accent-danger)`. For `--text-tertiary`, `--border-secondary` and `--accent-hover`, pick values interpolating the existing ramp and **state the chosen hex in the completion report** so the owner can adjust one line.

### B. The 27 existing tokens (already load-bearing — ~950 `var()` references)

Defined at `client/src/index.css:1-37`:

| Group | Tokens |
| --- | --- |
| Background (5) | `--bg-primary:#0a0a0f` · `--bg-secondary:#12121a` · `--bg-tertiary:#1a1a25` · `--bg-elevated:#22222f` · `--bg-hover:#2a2a3a` |
| Border (2) | `--border-primary:#2d2d3d` · `--border-accent:#4a4a6a` |
| Text (3) | `--text-primary:#e8e8f0` · `--text-secondary:#a0a0b8` · `--text-muted:#606078` |
| Accent (6) | `--accent-primary:#00d9ff` · `--accent-secondary:#ff00aa` · `--accent-tertiary:#7b2dff` · `--accent-success:#00ff88` · `--accent-warning:#ffaa00` · `--accent-danger:#ff3366` |
| Shadow (4) | `--shadow-sm/md/lg/glow` |
| Radius (3) | `--radius-sm:4px` · `--radius-md:8px` · `--radius-lg:12px` |
| Font (2) | `--font-sans:'Outfit', system-ui, sans-serif` · `--font-mono:'JetBrains Mono', monospace` |
| Transition (2) | `--transition-fast:0.15s ease` · `--transition-normal:0.25s ease` |

### C. 60 dead classes to delete

Each was verified twice: once by a parser that recurses into `${…}` template-literal expressions and also scans `classList.*` and `querySelector*`, and again by a targeted grep excluding substring matches.

| Cluster | Classes | File |
| --- | --- | --- |
| **The entire utility layer (12)** | `.flex` `.flex-col` `.items-center` `.justify-between` `.gap-1` `.gap-2` `.gap-3` `.gap-4` `.animate-pulse` `.animate-fade-in` `.primary` (also `button.primary`) `.danger` (also `button.danger`) | `index.css:144,154,189–228` |
| Dead confirm dialog (6) | `.confirm-modal` `.confirm-modal-content` `.confirm-modal-header` `.confirm-modal-actions` `.confirm-warning` `.modal-backdrop` (holds `z-index:9999`) | `LayerPanel.css` |
| LayerPanel misc (3) | `.disabled` (superseded by `:disabled`) `.all-visible` `.variant-name-badge` | `LayerPanel.css` |
| Dead toggle widget (5) | `.mode-btn` `.move-all-toggle` `.toggle-slider` `.toggle-label` `.shape-mode-group` — note `.move-all-toggle input:checked + .toggle-slider` is `Toolbar.css`'s max-specificity selector and is **unreachable** | `Toolbar.css` |
| Trace UI moved away (4) | `.trace-btn` `.trace-hint` `.trace-hint-text` `.has-reference` | `Toolbar.css` |
| Toolbar misc (1) | `.light-grid-active` | `Toolbar.css` |
| Reference rendering moved away (4) | `.reference-canvas` `.reference-canvas-container` `.reference-info` `.reference-label` | `Canvas.css` |
| Superseded timeline headers (5) | `.timeline-header` `.timeline-title` `.timeline-title-group` `.timeline-action-bar` `.variant-timeline-header` — ⚠️ `.timeline-header` vs the live `.timeline-header-row` is a **substring trap** | `FrameTimeline.css` |
| Timeline misc (4) | `.variant-timeline-label` `.empty-selected` `.highlighted` `.playing` | `FrameTimeline.css` |
| AI job-status modifiers (8) | `.queued` `.processing` `.completed` `.failed` `.generated` `.placeholder` `.ai-btn-preview` `.between`/`.keyframe` | `AIInterpolateModal.css` |
| Dead panel-collapse feature (4) | `.left-toggle` `.right-toggle` `.panel-toggle` (holds `z-index:20`) `.collapsed` | `App.css` |
| Header (1) | `.has-error` | `Header.css` |
| FrameReferencePanel (1) | `.different-object` | `FrameReferencePanel.css` |

### D. 12 classes that look dead but are NOT — do not delete

These are built by string concatenation at runtime, so their names never appear as literals:

| Site | Expression | Classes produced |
| --- | --- | --- |
| `client/src/components/AnchorGrid/AnchorGrid.tsx:121` | `` `anchor-arrow arrow-${direction} …` `` | `arrow-up` `arrow-down` `arrow-left` `arrow-right` |
| `client/src/components/ColorPicker/ColorPicker.tsx:616,621` | `` `slider-label channel-${channel}` `` / `` `compact-slider channel-slider channel-${channel}` `` | `channel-r` `channel-g` `channel-b` |
| `client/src/components/Header/Header.tsx:298` | `` `export-status export-status-${exportStatus}` `` | `export-status-success` `export-status-error` |
| `client/src/components/Header/Header.tsx:173-175` | `switch (saveStatus) { case 'saving': return 'status-saving' … }` | `status-saving` `status-saved` `status-error` |

Also live: `.expanding` / `.shrinking` (`AnchorGrid.tsx:121`), `.ai-error` / `.configured` (`Header.tsx:227`), `.even` / `.hovered` (`TimelineView.tsx`). Each of these must gain a CSS comment recording where it is built, e.g.:

```css
/* dynamic: arrow-{up|down|left|right} built at AnchorGrid.tsx:121 */
```

### E. `@keyframes` collisions — 3 names, 11 definitions

`@keyframes` share one global namespace exactly like classes, and the **last** definition wins for every animation referencing that name.

| Name | Definitions | Files | Current impact |
| --- | ---: | --- | --- |
| `fadeIn` | **6** | `index.css`, `EdgeInterpolateModal.css`, `HeightMapModal.css`, `PreviewModal.css`, `ProjectSelectModal.css`, `ReferenceImageModal.css` | `index.css` is emitted **last**, so its `fadeIn` overrides all five modal versions |
| `modalSlideIn` | **3** | `EdgeInterpolateModal.css`, `HeightMapModal.css`, `PreviewModal.css` | last-emitted wins |
| `spin` | **2** | `App.css`, `PreviewModal.css` | `App.css` wins |

Rename each to a block-prefixed name (e.g. `edge-interpolate-modal-fade-in`) and update every `animation` / `animation-name` reference in the same file. Also prefix the three currently-unprefixed survivors `slideIn`, `slideUp`, `pulse`, which will collide with the next component that wants them.

### F. `index.css` is doing three unrelated jobs, and its emission order is about to become wrong

`index.css` currently holds: design tokens (`:root`, lines 1-37), a global reset plus element styling (lines 39-162), and the now-dead utility framework (lines 189-228).

Its element styling is **load-bearing and must be preserved**: `button`, `input`, `select`, `input[type="range"]`, `input[type="number"]`, and `::-webkit-scrollbar` are styled globally and every component depends on it. In particular `ColorPicker`, `LightControl`, `RightSidebarTopControls`, `Toolbar` and `PixelStudioPanel` all render `<input type="range">` whose **entire** track and thumb styling comes from `index.css`.

Restructure to:

```
client/src/styles/
  tokens.css     # :root custom properties ONLY
  reset.css      # * box-sizing, html/body/#root, scrollbars, element defaults
client/src/index.css   # @import tokens.css; @import reset.css;  — nothing else yet
```

(The `styles/blocks/` directory arrives in task 12. `index.css` grows those imports then.)

**The import-order fix:** because `index.css` is imported from `main.tsx` *after* `App.tsx`, its content currently lands **last** in the bundle (verified: `.panel-header` sits at byte 157853 of a 158560-byte bundle). That is why `index.css`'s `.panel-header` currently acts as the base for four components' overrides. Once `index.css` contains only tokens, reset and (later) shared primitives, landing last becomes **actively wrong** — component rules must override primitives, not the reverse. **Move `import './index.css'` to the top of `client/src/main.tsx`, above `import App`.**

⚠️ This reverses emission order for `.panel-header` / `.panel-content`, which four components (`LayerPanel`, `PixelStudioPanel`, `RightSidebarTopControls`, `LightingStudioPanel`) currently narrow via higher-specificity selectors. Those overrides win on specificity either way, so the visual result should be identical — **verify it explicitly** (see Verification).

### G. The class-usage script

Land `client/scripts/check-classes.mjs` in this task. It must:
- parse every `className=` site handling `"…"`, `{'…'}` and `` {`…`} `` uniformly,
- **recurse into `${…}` expressions** and harvest nested string literals, so `` `layer-item ${sel ? 'selected' : ''}` `` registers **both** names,
- also scan `classList.add/remove/toggle/contains`, raw `class="…"` in template strings, and `querySelector*/closest/matches('.x')`,
- support `--dead`, `--missing` and `--collisions` modes,
- **exit non-zero** when a new orphan appears.

Without the `${…}` recursion it will produce false positives on the 12 dynamically-built classes in section D. Verified: no CSS class name is referenced from outside `client/src` — `grep -rn "className\|class=" server/src` returns 5 hits, all TypeScript class-name *generation* inside the export code generator, and `ai-service/` is Python with no templates.

## Steps

1. Write `client/scripts/check-classes.mjs` and run it to reproduce the 60-dead / 23-missing baseline before changing anything. Record the counts.
2. Delete the 60 dead classes listed in section C. **Cross-check every deletion against section D first.**
3. Add the documentation comments from section D to the CSS blocks that own the dynamically-built classes.
4. Create `client/src/styles/tokens.css` containing the 27 existing tokens **plus** the 6 newly-defined ones from section A. Do not add any other token yet — the full scale arrives in task 11.
5. Create `client/src/styles/reset.css` containing lines 39-162 of the old `index.css` (reset, `html/body/#root`, scrollbars, and all global element styling), moved verbatim.
6. Reduce `client/src/index.css` to two `@import` statements, in order: `tokens.css`, then `reset.css`.
7. Move `import './index.css'` to the **top** of `client/src/main.tsx`, above `import App`.
8. Rename the 3 colliding `@keyframes` families plus the 3 unprefixed survivors, updating every `animation` / `animation-name` reference in the same file.
9. Re-run `check-classes.mjs` and confirm 0 new orphans and that none of the 12 dynamic classes is flagged.

## Constraints

- **This task is behaviour-preserving except where it is explicitly fixing a bug.** Defining the 6 tokens deliberately changes 76 declarations' appearance — that is the point, and it must be reviewed as intentional.
- **Do not convert any class to BEM here.** No `block__element--modifier` renames. Tasks 13 onward own that.
- **Do not substitute any colour, spacing, radius or shadow literal with a token here.** That is task 11, which needs a Storybook baseline first.
- **Do not fix the 9 "missing CSS" gaps** (`origin-controls-panel`, `brush-max-control`, `focus-mode-section`, `ai-step-layer`, `alpha-slider`, `sat-slider`, `light-slider`, `frame-drop-indicator-variant`, `expanded`). Inventing styles mid-conversion makes "nothing changed" unverifiable. They are filed as a separate item.
- Do not delete `LayerPanel.css`'s confirm-dialog block until its styling has been read and recorded — task 12 extracts a `confirm-dialog` primitive and should not lose a complete, coherent, well-styled dialog. Copy the rules into the task-12 notes before deleting.
- Do not run Prettier on any `.css` file.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx vite build              # both exit 0
node scripts/check-classes.mjs --dead             # 0 new dead classes; the 12 dynamic ones NOT flagged
# The dead utility layer is really gone:
test "$(grep -rn 'animate-fade-in\|gap-1\|panel-toggle' src --include='*.tsx' | wc -l)" -eq 0
# No undefined custom property remains in the built bundle:
bunx vite build && node -e "
const fs=require('fs'),g=require('glob');
const c=fs.readFileSync(g.sync('dist/assets/*.css')[0],'utf8');
const def=new Set([...c.matchAll(/--[a-z0-9-]+(?=\s*:)/g)].map(m=>m[0]));
const used=[...c.matchAll(/var\((--[a-z0-9-]+)/g)].map(m=>m[1]);
const miss=[...new Set(used)].filter(u=>!def.has(u));
if(miss.length){console.error('undefined tokens:',miss);process.exit(1)}"
# No duplicate @keyframes name anywhere:
test "$(grep -rhoE '@keyframes\s+[\w-]+' src --include='*.css' | sort | uniq -d | wc -l)" -eq 0
# Tokens are emitted BEFORE component rules:
node -e "
const fs=require('fs'),g=require('glob');
const c=fs.readFileSync(g.sync('dist/assets/*.css')[0],'utf8');
const t=c.indexOf('--bg-primary'), p=c.indexOf('.layer-panel');
if(t>p){console.error('tokens emitted after components');process.exit(1)}"
```

Manual checks — required:
1. **The 6 newly-defined tokens:** the ProjectSelectModal cancel button now has a visible border; the active shape button's text is legible; `.ref-box-btn:active` shows a pressed state.
2. **The 12 dynamic classes still work:** open the AnchorGrid resize dialog (arrows animate); the ColorPicker RGB sliders (channel colours); the Header during a save and during an export (both status colours).
3. **Keyframes:** open `EdgeInterpolateModal`, `HeightMapModal`, `PreviewModal`, `ProjectSelectModal`, `ReferenceImageModal` — each must still fade or slide in.
4. **Emission-order reversal:** `.panel-header` must render identically in `LayerPanel`, `PixelStudioPanel` and `RightSidebarTopControls`. This is the one thing the `main.tsx` change could break.
5. **Global element styling survived the move:** every `<input type="range">` in `ColorPicker`, `LightControl`, `RightSidebarTopControls`, `Toolbar` and `PixelStudioPanel` must still render the custom track and thumb, not native OS sliders.

## Definition of done

- [ ] All 60 dead classes deleted; none of the 12 dynamically-built classes was touched.
- [ ] The 12 dynamic classes each carry a CSS comment naming their construction site.
- [ ] All 6 previously-undefined custom properties are defined in `styles/tokens.css`, and the chosen hex values are stated in the completion report.
- [ ] `styles/tokens.css` and `styles/reset.css` exist; `index.css` is two `@import` lines; all global element styling was moved verbatim, not rewritten.
- [ ] `import './index.css'` is the **first** import in `main.tsx`.
- [ ] All 3 keyframe collisions renamed, plus the 3 unprefixed survivors; no duplicate `@keyframes` name remains.
- [ ] `client/scripts/check-classes.mjs` exists, supports `--dead`/`--missing`/`--collisions`, recurses into `${…}`, and exits non-zero on a new orphan.
- [ ] No class was converted to BEM and no literal was replaced by a token in this task.
- [ ] `LayerPanel.css`'s confirm-dialog rules were recorded before deletion.
- [ ] All 5 manual checks performed and recorded.
