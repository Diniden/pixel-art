# 12 — Author the full token set and substitute every literal

**Wave:** W7 · **Depends on:** 09, 10
**Touches:** `client/src/styles/tokens.css` · all 34 `.css` files under `client/src` · `client/.stylelintrc.json` (new) · `client/package.json` (stylelint dep + scripts)
**Effort:** L

## Objective

After this task every colour, radius, transition, shadow, spacing, typography and `z-index` value in the codebase comes from a named token, the `z-index` escalation war is replaced by a layered scale, and stylelint enforces it. This is the highest visual-regression risk in the refresh, which is why Storybook (task 10) landed first.

## Context

### The danger red — SETTLED, OWNER DECISION (2026-08-16)

Two incompatible reds were in production simultaneously: the token `--accent-danger: #ff3366` and the literal `#ef4444` (12 uses across `AddVariantModal`, `FrameTagsModal`, `Header`, `LayerPanel`, `ObjectLibrary`, `ResizeModal`), appearing **in the same modals**.

**The owner chose `#ff3366` — the declared token — as correct. The 12 `#ef4444` literals are drift and must be rewritten to `var(--accent-danger)` (`--accent-danger: #ff3366`).** This is a settled decision, not an assumption: this task is **unblocked** and needs no further sign-off on the red. It is a visible change to 12 declarations — state in the completion report that the 12 literals were converted, and list the files.

### Split this task into three sequential sub-commits

It is L-effort and the substitution families are independent. Land them in this order, each with its own verification pass:

1. **Colour** (585 occurrences, 172 distinct literals) — the risky one
2. **Radius + transition** (32 + 30 occurrences)
3. **Shadow + typography + spacing + z-index**

### Colour clusters — what collapses onto what

**Cluster A — near-identical darks that should collapse onto existing tokens.** `FrameReferencePanel.css`, `LightingCanvas.css` and `ReferenceImagePanel.css` share a private hard-coded palette that **shadows the real token set with slightly-off values** — three files, ~30 declarations. This is the single highest-yield target.

| Literal | Count | Replace with |
| --- | ---: | --- |
| `#2a2a3a` | 7 | `var(--bg-hover)` (is exactly this) |
| `#1a1a25` | 5 | `var(--bg-tertiary)` (is exactly this) |
| `#3a3a4a` | 4 | `var(--bg-active)` (task 09 defined it as this value) |
| `#0a0a15` | 3 | `var(--bg-primary)` (#0a0a0f) |
| `#e0e0ff` | 8 | `var(--text-primary)` (#e8e8f0) |
| `#a0a0b0` | 4 | `var(--text-secondary)` (#a0a0b8) |
| `#333333` | 12 | new `--swatch-border: #333` |
| `#222230` | 2 | new `--canvas-checker-b` |
| `#1a1a2e` / `#16213e` | 5 / 3 | new `--modal-gradient-a` / `--modal-gradient-b` (a second, warmer dark palette) |
| `#888888` / `#d0d0d0` / `#f0f0f0` | 6 / 6 / 3 | `var(--text-muted)` / `var(--text-secondary)` / `var(--text-primary)` |

The Cluster A collapses are sub-perceptual on a dark UI (differences of 1-6 in a channel), but flag them in the review for visual sign-off.

**Cluster B — the violet "variant" accent has 71 colour declarations and zero tokens.** "Variant" is a first-class domain concept in this app.

| Literal | Count | New token |
| --- | ---: | --- |
| `#8b5cf6` | **31** (most-used literal in the codebase) | `--accent-variant` |
| `rgba(139,92,246,0.3)` | 9 | `--accent-variant-30` |
| `rgba(139,92,246,0.2)` | 8 | `--accent-variant-20` |
| `rgba(139,92,246,0.4)` | 6 | `--accent-variant-40` |
| `rgba(139,92,246,0.15)` | 4 | `--accent-variant-15` |
| `#a78bfa` | 7 | `--accent-variant-light` |
| `#9d6cfd` | 4 | collapse to `#a78bfa` |
| `#6366f1` | 7 | collapse to `--accent-variant` |
| `#a855f7` | 5 | collapse to `--accent-variant` |

**Cluster C — the red family.** The base red is settled: **`#ff3366`** (owner decision, 2026-08-16 — see "The danger red" above). `#dc2626` (4) → `--accent-danger-hover`; `#ff6b6b` (5) → collapse; `rgba(239,68,68,0.2/0.3)` (6/3) and `rgba(255,51,102,0.1/0.3)` (5/3) → a single alpha ramp derived from **`#ff3366`** (i.e. `rgba(255,51,102,…)`), since that is the red that wins.

**Cluster D — alpha ramps (158 literal occurrences → 18 tokens).**

| Family | Values and counts | Tokens |
| --- | --- | --- |
| Black | `rgba(0,0,0,X)` at 0.5 (20), 0.3 (14), 0.4 (12), 0.2 (10), 0.6 (8), 0.7 (6), 0.85 (4) | `--overlay-50/-30/-40/-20/-60/-70/-85` |
| Cyan | `rgba(0,217,255,X)` at 0.1 (20), 0.3 (14), 0.2 (13), 0.4 (5), 0.15 (4), 0.08 (4), 0.05 (4) | `--accent-primary-10/-30/-20/-40/-15/-08/-05` |
| White | `rgba(255,255,255,X)` at 0.1 (17), 0.05 (9), 0.15 (4), 0.2 (4) | `--white-10/-05/-15/-20` |
| Plain | `#ffffff` (26), `#000000` (6) | `--white`, `--black` |

Use **explicit literal tokens**, not `color-mix()`. Simpler to grep, simpler to lint, no browser-support caveats. (Revisit only if the palette is ever themed — there is no theming today: `grep -rn 'prefers-color-scheme\|data-theme' src/*.css` returns 0 hits.)

**Cluster E — status colours.** `#10b981` (9) → `--status-ok`; `#f59e0b` (4) → `--status-warn`; `#ffab00` (7) and `#ff8800` (6) → collapse to `--status-warn`.

### Spacing — the scale already exists implicitly

9 values account for 852 of 883 occurrences (96.5%). Counts: `8px` 168, `12px` 126, `4px` 92, `16px` 82, `6px` 75, `20px` 65, `10px` 65, `2px` 52, `24px` 17.

```css
--space-px:   1px;   --space-0-5:  2px;   --space-1:    4px;
--space-1-5:  6px;   --space-2:    8px;   --space-2-5: 10px;
--space-3:   12px;   --space-4:   16px;   --space-5:   20px;
--space-6:   24px;   --space-8:   32px;   --space-10:  40px;
--space-12:  48px;
```

Snap the 36 outlier occurrences: `14px`→16px, `3px`→4px, `18px`→16px or 20px, `5px`→4px. `-4px` becomes `calc(-1 * var(--space-1))`.

### Typography — 30 distinct sizes → 7 tokens

The codebase mixes `rem` and `px` for the same visual size. Counts include `0.75rem` 45, `0.7rem` 33, `0.85rem` 32, `0.875rem` 30, `0.8rem` 26, `12px` 24, `0.9rem` 20, `14px` 17, `1rem` 15, `0.65rem` 14.

```css
--text-2xs: 0.625rem;  --text-xs:  0.75rem;   --text-sm:  0.875rem;
--text-base:1rem;      --text-lg:  1.125rem;  --text-xl:  1.25rem;
--text-2xl: 1.5rem;
```

Weights: `600` (71) → `--weight-semibold`, `500` (49) → `--weight-medium`, `700` (8) and `bold` (5) → `--weight-bold`, `400` (2) → `--weight-normal`.
Line heights: `1` (16) → `--leading-none`, `1.4` (4) and `1.3` (1) → `--leading-snug`, `1.5` (6) → `--leading-normal`.
Fonts: 2 escapee `'Courier New', monospace` declarations → `var(--font-mono)`; drop the redundant `var(--font-mono, monospace)` fallback.

### Radii — add two tokens and the system is complete

`var(--radius-sm)` 103, `var(--radius-md)` 61, `var(--radius-lg)` 16 are already tokenised. **32 literal declarations exactly duplicate an existing token**: `4px` (13) = `--radius-sm`, `8px` (12) = `--radius-md`, `12px` (7) = `--radius-lg`. Add `--radius-xs: 3px` (covers `3px` ×9 and `2px` ×9) and `--radius-base: 6px` (covers `6px` ×10). Keep `50%` literal (39 uses).

### Shadows — the worst-tokenised property: 57 distinct values for 4 tokens

`--shadow-sm/md/lg/glow` are referenced **3 times total**. Propose 8 tokens replacing all 57:

| Value | Count | Token |
| --- | ---: | --- |
| `0 4px 12px rgba(0,217,255,0.3)` | 6 | `--shadow-accent` |
| `0 20px 50px rgba(0,0,0,0.5)` + `0 20px 60px rgba(0,0,0,0.5)` | 4 + 3 | `--shadow-modal` |
| `0 2px 6px rgba(0,217,255,0.3)` | 4 | `--shadow-accent-sm` |
| `0 8px 32px rgba(0,0,0,0.4)` | 3 | `--shadow-lg` (**note the existing token is `0 8px 24px rgba(0,0,0,0.5)` — close but not equal; redefine it to the measured dominant value**) |
| `0 12px 48px rgba(0,0,0,0.6)` | 3 | `--shadow-xl` |
| `0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(0,217,255,0.1)` | 3 | `--shadow-modal-glow` |
| `0 0 0 2px rgba(0,217,255,0.2)` | 3 | `--ring-accent` (focus ring) |
| remaining 49 | 1-2 each | collapse into the 8 above |

### Transitions — nearly done already

93 of 143 uses (65%) already use `var(--transition-fast)`. Add **`--transition-base: 0.2s ease`** (0.2s is the second-most-common duration, 17 uses, and has no token). Replace the 6 literal `all 0.15s ease` (= `--transition-fast`) and 2 `max-height 0.25s ease` (= `--transition-normal`). That takes tokenised transitions from 65% to ~97%.

### z-index — 15 magic numbers from `-1` to `99999`

**22 elements use `position: fixed`**, so they escape every ancestor stacking context and compete directly in the root context. That is why the top values escalated: each new modal author picked a number higher than the last one they saw. `99999` vs `10000` vs `9999` vs `1000` encode **no design intent** — four modals at four values that are all conceptually "a modal".

Replace with this scale, defined in `tokens.css`:

```css
--z-behind:            -1;   /* decorative ::before / bg grids            */
--z-base:               0;
--z-hover-lift:         1;   /* :hover raise above siblings               */
--z-raised:             2;   /* badges, per-card action buttons           */
--z-canvas-overlay:    20;   /* overlay canvases, playhead, drop markers  */
--z-overlay-control:   30;   /* floating buttons over a canvas            */
--z-shell:            100;   /* side panels, bottom panel, header         */
--z-chrome:           110;   /* shell affordances                         */
--z-dropdown:         300;   /* select menus anchored to a control        */
--z-floating-panel:   400;   /* reference / lighting preview panels       */
--z-popover:          500;   /* ai-config popover                         */
--z-modal:            600;   /* modal backdrop + dialog                   */
--z-modal-nested:     700;   /* a confirm dialog opened FROM a modal      */
--z-tooltip:          800;   /* always above everything it explains       */
--z-toast:            900;   /* reserved — no toasts today                */
```

Mapping of the current values:

| Current | Sites | New |
| --- | --- | --- |
| **99999** (6) | `AIInterpolateModal.css:6`, `EdgeInterpolateModal.css:8`, `ExportPreviewModal.css:10`, `HeightMapModal.css:8`, `PreviewModal.css:8` backdrops; `Toolbar.css:321 .toolbar-fixed-tooltip` | `--z-modal` for the 5 backdrops; `--z-tooltip` for the tooltip |
| **10001** (1) | `CopyFromModal.css:184 .copy-tooltip` | `--z-tooltip` |
| **10000** (4) | `FrameTagsModal.css:8`, `ResizeModal.css:8` backdrops; `VariantSelectModal.css:274 .resize-dialog-backdrop`; `ObjectLibrary.css:435 .compact-tooltip` | `--z-modal`; `--z-modal-nested` for the nested resize dialog; `--z-tooltip` for the tooltip |
| **9999** (4) | `CopyFromModal.css:11`, `ObjectSelectModal.css:11`, `VariantSelectModal.css:11` backdrops (`LayerPanel.css:377 .modal-backdrop` was deleted as dead by task 09) | `--z-modal` |
| **1100** (1) | `BrowseBackupsModal.css:194 .confirm-overlay` | `--z-modal-nested` |
| **1001** (2) | `AddVariantModal.css:324`, `ObjectLibrary.css:252` `.delete-confirm-backdrop` | `--z-modal-nested` |
| **1000** (4) | `AddVariantModal.css:8`, `ProjectSelectModal.css:9`, `ReferenceImageModal.css:8` backdrops; `Header.css:347 .ai-config-popover` | `--z-modal`; `--z-popover` for the popover |
| **900** (3) | `FrameReferencePanel.css:7`, `LightingCanvas.css:93`, `ReferenceImagePanel.css:7` | `--z-floating-panel` |
| **102** / **101** (2 each) | `Canvas.css:98`/`ReferenceImagePanel.css:115` `.ref-box-btn`; `Canvas.css:231`/`ReferenceImagePanel.css:273` `.reference-navigation` | `--z-overlay-control` |
| **100** (1) | `FrameTimeline.css:650 .view-mode-dropdown-menu` | `--z-dropdown` |
| **10** (6) | `App.css:65 .side-panel`, `App.css:164 .bottom-panel` (shell) vs `AnchorGrid.css:58`, `Canvas.css:55 .reference-overlay-canvas`, `FrameTimeline.css:205 .frame-drop-indicator`, `FrameTimeline.css:1003 .timeline-playhead` (content overlays) | **two different meanings share one value**: shell → `--z-shell`; overlays → `--z-canvas-overlay` |
| **2** (2) / **1** (8) / **-1** (3) | badges; `:hover` lifts; `::before` grids | `--z-raised` / `--z-hover-lift` / `--z-behind` |

Rules that come with the scale: never write a numeric `z-index` again; a modal backdrop and its dialog **share** `--z-modal` (the dialog is a child and only needs `position: relative`); a dialog opened from another dialog uses `--z-modal-nested`; `--z-tooltip` deliberately outranks `--z-modal-nested`.

**One real ordering bug this fixes:** `.ai-config-popover` (`Header.css:347`, `z-index:1000`) currently sits at the same level as four modal backdrops, so if the popover is open when a modal opens, the winner is decided by DOM order rather than design.

### stylelint

Install and configure in this task, but **enable only the token/keyframe/important rules now**. The BEM `selector-class-pattern` rule stays off until the conversions land (task 21 turns it on).

```sh
cd client && bun add --exact -D stylelint stylelint-config-standard stylelint-declaration-strict-value
```

Enable now in `client/.stylelintrc.json`: `scale-unlimited/declaration-strict-value` over `/color$/`, `background-color`, `fill`, `stroke`, `z-index`, `box-shadow`, `border-radius`, `font-family`, `transition-duration` (ignoring `transparent`, `inherit`, `currentColor`, `none`, `0`, `50%`, `auto`, `initial`, `unset`); `keyframes-name-pattern` requiring a prefix; `declaration-no-important`; `color-hex-length: short`; `declaration-block-no-duplicate-properties`; `no-duplicate-selectors`. Override all of these off for `src/styles/reset.css` and `src/styles/tokens.css`.

Add scripts: `"lint:css": "stylelint \"src/**/*.css\""` and `"lint:css:fix"`.

⚠️ `declaration-no-important` will fail on the 23 existing `!important` declarations, **15 of which are in `Toolbar.css` alone** compensating for a collision that task 16 fixes. Set `declaration-no-important` to `warn` in this task with a `// promote to error in task 21` note, or scope it to an allowlist. Do not delete a `!important` here — removing it without fixing the underlying collision changes rendering.

## Steps

1. **Confirm the owner's answer on the two reds.** Do not proceed without it.
2. Extend `client/src/styles/tokens.css` with every token family above. This is purely additive; nothing renders differently yet.
3. Verify the build, then **sub-commit 1 — colour.** Substitute Cluster A, B, C, D and E across all 34 stylesheets. Verify against Storybook after each stylesheet group.
4. **Sub-commit 2 — radius + transition.** Substitute the 32 radius literals and the 30 transition literals; add `--radius-xs`, `--radius-base`, `--transition-base`.
5. **Sub-commit 3 — shadow + typography + spacing + z-index.** Redefine `--shadow-lg` to the measured dominant value. Replace all 15 numeric `z-index` values per the mapping table.
6. Install and configure stylelint with the rule set above (BEM pattern rule **off**).

## Constraints

- **No lockfiles; pin exact versions.** Standing project policy (owner decision, 2026-08-16): `bunfig.toml`'s `[install.lockfile] save = false` is deliberate and must stay, the repo has no lockfile of any kind, and every dependency is written as an exact version in `package.json`. Every `bun add` in this task uses `--exact` (plain `bun add x@1.2.3` writes `"^1.2.3"`). Never create, commit or regenerate a lockfile; `--frozen-lockfile` is meaningless here.
- **Do not rename a single class.** No BEM conversion here. Tasks 13-20 own that, and doing both at once makes "nothing changed visually" unverifiable.
- **Do not delete any `!important`.** 15 of the 23 exist because of a real collision that a later task fixes.
- **Do not fix the 9 missing-CSS gaps.**
- **Do not enable `selector-class-pattern`** — it would fail on every file.
- Do not use `color-mix()`.
- Do not run Prettier on any `.css` file.
- Cluster A/B/C/E deliberately collapse near-identical values, so **some pixels genuinely change**. Each such change must be individually accepted against the Storybook baseline, not bulk-approved.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx vite build         # both exit 0
bunx stylelint "src/**/*.css"                # exit 0 with the enabled rule set
bunx storybook build                          # exit 0
# Almost no raw hex outside the token files:
test "$(grep -rhoE '#[0-9a-fA-F]{3,8}\b' src --include='*.css' --exclude-dir=styles | wc -l)" -lt 20
# No numeric z-index anywhere:
test "$(grep -rhoE 'z-index:\s*-?[0-9]+' src --include='*.css' | wc -l)" -eq 0
# No undefined custom property in the built bundle (same check as task 09):
node -e "const fs=require('fs'),g=require('glob');const c=fs.readFileSync(g.sync('dist/assets/*.css')[0],'utf8');const def=new Set([...c.matchAll(/--[a-z0-9-]+(?=\s*:)/g)].map(m=>m[0]));const used=[...c.matchAll(/var\((--[a-z0-9-]+)/g)].map(m=>m[1]);const miss=[...new Set(used)].filter(u=>!def.has(u));if(miss.length){console.error('undefined:',miss);process.exit(1)}"
```

Manual checks — **the z-index pass requires manual verification; no automated check covers stacking**:

Open, in this order, and confirm each renders above what it should: each of the 14 modals; the nested delete-confirm in `AddVariantModal` **and** in `ObjectLibrary`; the resize dialog in `VariantSelectModal`; the restore-confirm in `BrowseBackupsModal`; the Toolbar tooltip; the ObjectLibrary compact tooltip; the CopyFromModal tooltip; the FrameTimeline view-mode dropdown; and **the Header AI-config popover while a modal is open** (this is the ordering bug the scale fixes).

For colour: compare every component against the Storybook baseline captured in task 10. Cluster A/B/C/E collapses will show small differences — accept each individually and list them in the completion report.

## Definition of done

- [ ] All 12 `#ef4444` literals were rewritten to `var(--accent-danger)` (`#ff3366`, the owner-confirmed value), across `AddVariantModal`, `FrameTagsModal`, `Header`, `LayerPanel`, `ObjectLibrary` and `ResizeModal`, and the change is listed in the completion report.
- [ ] The token set covers colour (incl. the variant, danger, alpha and status families), spacing, typography, radii, shadows, transitions and z-index.
- [ ] Landed as three sequential sub-commits (colour / radius+transition / shadow+type+space+z).
- [ ] Fewer than 20 raw hex literals remain outside `src/styles/`.
- [ ] **Zero** numeric `z-index` declarations remain; all 15 former values map per the table.
- [ ] `--shadow-lg` redefined to the measured dominant value.
- [ ] stylelint installed and passing, with `selector-class-pattern` **off** and `declaration-no-important` at `warn`.
- [ ] No class was renamed and no `!important` was deleted.
- [ ] The full manual stacking pass was performed in the listed order.
- [ ] Every deliberately-collapsed colour difference is listed in the completion report.
