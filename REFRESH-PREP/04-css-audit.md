# P1-04 — CSS & Styling Audit

**Wave:** P1 · **Depends on:** nothing · **Output:** `REFRESH-PREP/findings/css.md`

## Expert profile

You are a CSS architecture specialist. You know BEM cold — including where strict
BEM gets awkward (state modifiers, layout wrappers, third-party overrides) and
how to handle those cases consistently rather than by exception.

## Context

Every component ships a sibling `.css` file imported directly by the `.tsx`.
There are **no CSS modules and no scoping** — every rule is global. Class names
are flat kebab-case, not BEM:

```
.canvas-container   .canvas-info   .canvas-info-arrow   .canvas-info-panel
.header   .header-btn   .header-left   .header-right
.layer-item   .layer-name   .layer-actions   .layer-action-btn
.confirm-btn   .confirm-modal   .confirm-modal-actions   .empty-state
```

Note `.confirm-modal`, `.confirm-btn`, `.empty-state` — generic names in a global
namespace, defined in component-specific files. Collisions are likely.

Largest stylesheets: `FrameTimeline.css` 1,061 · `AIInterpolateModal.css` 898 ·
`ObjectLibrary.css` 469 · `LayerPanel.css` 465 · `Header.css` 456 ·
`ExportPreviewModal.css` 451 · `AddVariantModal.css` 410.
Plus global `index.css` (228) and `App.css` (250).

**Target: BEM for every component.**

## Your task

1. **Full class inventory.** Every selector in every `.css` file under
   `client/src`. Record: file, selector, specificity, whether it's referenced
   from any `.tsx`.

2. **Collision detection.** This is the highest-value output. Find class names
   defined in **more than one** stylesheet. Because everything is global, these
   are live bugs or latent ones. For each collision report: the name, every file
   defining it, whether the rule bodies conflict, and which components are
   actually affected at runtime.

3. **Orphan sweep.** Classes defined in CSS but never used in any `.tsx`
   (dead rules), and `className` values in `.tsx` with no CSS definition
   (broken styling). Search all of `client/src`, and account for dynamic class
   construction (template literals, `clsx`-style conditionals) before calling
   something an orphan.

4. **Design-token extraction.** Scan every stylesheet for hard-coded values and
   build the token set the refresh should adopt:
   - **Colors** — list every distinct literal (hex, rgb, hsl) with usage counts.
     Cluster near-identical values (`#1e1e1e` vs `#1E1E1E` vs `#1d1d1d`).
   - **Spacing** — every distinct padding/margin/gap value with counts.
   - **Typography** — font sizes, weights, families, line heights.
   - **Radii, borders, shadows, transitions, z-index.**

   The **z-index inventory** matters specifically: with 14 modals and multiple
   overlay panels, list every `z-index` value and the stacking contexts they sit
   in. Propose a layered scale.

   Check `index.css` and `App.css` for existing CSS custom properties first —
   report what's already tokenized versus what's ad hoc.

5. **BEM conversion plan.** Define the project's BEM convention precisely, then
   apply it. Specify:
   - Block naming (component-derived, e.g. `layer-panel`).
   - Element: `block__element`. Modifier: `block--modifier` /
     `block__element--modifier`.
   - **The state-modifier rule** — how `is-active` / `is-open` / `is-dragging`
     are handled. Pick one approach (`block--active` vs `.is-active` scoped
     under the block) and justify it; consistency matters more than which.
   - Nesting depth limit and what to do when markup nests deeper than the
     naming comfortably expresses.
   - How to name layout wrappers that aren't semantic components.

   Then produce a **per-component mapping table**: `old-class → new-bem-class`
   for every class in the codebase. This table is what the REFRESH conversion
   agents will execute against, so completeness matters more than elegance.

6. **Scoping recommendation.** Even with BEM, evaluate whether to add CSS
   Modules or keep plain global CSS with BEM discipline. Give a recommendation
   with tradeoffs, considering that Storybook is being introduced and that
   `.tsx` imports its CSS as a side effect today.

7. **Storybook implications.** Note what global CSS (resets, tokens, fonts,
   theme) must load in Storybook preview for components to render correctly in
   isolation.

8. **Enforcement.** Recommend whether to add `stylelint` with a BEM pattern rule
   to keep this from regressing, and give the config if so.

## Output format

Write `REFRESH-PREP/findings/css.md`:

```markdown
# CSS & Styling Audit

## Summary

## Stylesheet census
| File | Lines | Selectors | Max specificity | Notes |

## Collisions  ← highest priority
| Class | Defined in | Conflicting? | Runtime impact |

## Orphans
### Dead CSS (defined, never used)
### Missing CSS (used in TSX, never defined)

## Design tokens
### Colors
| Value | Count | Used in | Proposed token |
### Spacing / Typography / Radii / Shadows / Transitions
### z-index inventory & proposed scale
| Current value | Used by | Proposed layer |

## BEM convention (the project standard)
<block/element/modifier rules, state handling, nesting limit, wrapper naming>

## Class mapping table
### <ComponentName>
| Old | New | Notes |

## Scoping recommendation
<CSS Modules vs global+BEM, with tradeoffs>

## Storybook global-style requirements

## Enforcement (stylelint)

## Conversion order & parallelism
<which components convert independently; which share classes and must move together>

## Proposed work items
| Title | Touches (explicit files/dirs) | Depends on | Effort | Risk |

## Verification
| Work item | Command(s) | Manual checks |

## Open questions
```

## Definition of done

- Every `.css` file under `client/src` is in the census.
- The collision table is complete — this is the most important section.
- Every existing class appears in the mapping table with a BEM target.
- The BEM convention is specified tightly enough that ten different agents
  converting ten different components would produce consistent results.
