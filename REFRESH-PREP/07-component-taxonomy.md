# P2-07 — Component Taxonomy, Layouts & Storybook Plan

**Wave:** P2 · **Depends on:** 03 (component-sizes), 04 (css)
**Output:** `REFRESH-PREP/findings/component-taxonomy.md`

## Expert profile

You are a design-systems engineer. You've built component libraries where every
component renders in isolation, and you know the discipline that requires:
props-in / callbacks-out, no store imports, no data fetching, no module-level
mutable state.

## Prerequisites

Read before starting:
- `REFRESH-PREP/findings/component-sizes.md` — decomposition proposals and the
  missing-primitives list.
- `REFRESH-PREP/findings/css.md` — BEM convention and class mapping.

## Locked decisions

- UI **completely divorced** from state — Storybook must run with no store.
- **BEM** CSS for every component.
- Stories bubble up: primitives → components → **full-page Layouts** representing
  major app features.

## Your task

1. **Define the layer taxonomy.** Four tiers, with a crisp membership rule for
   each — a rule another agent can apply without judgment calls:

   | Tier | Location | Rule |
   | --- | --- | --- |
   | Primitives | `client/src/ui/primitives/` | No app domain concepts. Button, Modal, Slider… |
   | Components | `client/src/ui/components/` | Domain-aware but **pure**: props in, callbacks out. No store. |
   | Layouts | `client/src/ui/layouts/` | Full-page compositions. Pure. Take all data as props. |
   | Containers | `client/src/containers/` | The **only** tier that touches MobX. `observer()` lives here. |

   State the hard invariant plainly: **nothing in `ui/` may import from
   `stores/` or `api/`.** Recommend enforcing it with an ESLint
   `no-restricted-imports` rule and give the config.

2. **Full component census with target tier.** Every one of the 31 existing
   components plus everything the decomposition proposals in findings 03 create.
   For each: current file, target tier, target path, whether it's currently
   store-coupled, and the work needed to purify it.

3. **Primitive library spec.** From the missing-primitives list in findings 03,
   specify each primitive: name, props interface (actual TypeScript), variants,
   BEM block name, a11y requirements. Prioritize by how many call sites collapse
   into it. The `Modal` primitive is likely the highest-value single item —
   there are 14 modal components.

4. **Layout inventory.** Identify the full-page layouts. Based on the app
   structure, likely candidates — **verify against `App.tsx` and the actual
   component tree, don't assume**:
   - `PixelStudioLayout` — main editing view (canvas + toolbar + layers + timeline)
   - `LightingStudioLayout` — the lighting studio mode
   - `ProjectSelectLayout` — project selection / entry
   - `ObjectLibraryLayout` — object browsing

   For each: which regions it composes, its complete props interface, and which
   containers will supply those props.

5. **Purification plan per coupled component.** Findings 02 identified 35
   store-coupled files. For each that lands in `ui/`, specify:
   - Which store fields it reads → become props.
   - Which store actions it calls → become callback props.
   - Its resulting props interface (write the actual TypeScript).
   - The container that will wrap it, and that container's name.
   - Effort and risk.

   Flag any component whose store usage is so pervasive that a props interface
   would be unreasonably large (20+ props) — that's a signal the component needs
   splitting first, and it should be sequenced accordingly.

6. **Storybook configuration plan.** Concretely:
   - Framework: `@storybook/react-vite`. Version per findings 01's compatibility
     matrix.
   - `.storybook/main.ts` and `preview.ts` contents, including the global CSS /
     token imports that findings 04 says are required.
   - Story file convention: colocated `Component.stories.tsx`.
   - Which addons and why (a11y, controls, viewport, interactions) — justify each,
     don't list everything available.
   - How canvas-heavy components (`Canvas`, `LightingCanvas`) get realistic
     fixture data without a store.
   - Dark/light theme handling if the app has themes (check first).

7. **Fixture strategy.** Pure components need realistic data. Specify a
   `client/src/fixtures/` module exporting sample projects, objects, frames,
   layers, variants, and palettes — typed against the domain types, reusable by
   both stories and Vitest tests. Note that fixtures must be plain objects, never
   MobX observables.

8. **Story coverage targets.** Which components get stories in which REFRESH
   wave, and what "done" means per tier (e.g. every primitive: all variants +
   a11y check; every layout: at least empty / typical / dense states).

9. **Directory migration map.** Old path → new path for every file being moved,
   so the REFRESH agents can execute mechanically.

## Output format

Write `REFRESH-PREP/findings/component-taxonomy.md`:

```markdown
# Component Taxonomy, Layouts & Storybook Plan

## Summary

## Layer taxonomy
<tiers, membership rules, the import invariant + ESLint config>

## Component census
| Current file | Tier | Target path | Store-coupled? | Purification effort |

## Primitive library
### <Primitive>
- Props: ```ts … ```
- Variants / BEM block / a11y
- Replaces: <call sites>

## Layouts
### <LayoutName>
- Composes: …
- Props: ```ts … ```
- Container: …

## Purification plan
### <Component>
| Store field | → prop |
| Store action | → callback |
- Resulting props: ```ts … ```
- Container: … · Effort: … · Risk: …

## Storybook configuration
### main.ts / preview.ts
### Addons & rationale
### Canvas components in isolation
### Themes

## Fixtures
<module layout, exports, typing rules>

## Story coverage targets by wave

## Directory migration map
| Old | New |

## Proposed work items
| Title | Touches (explicit files/dirs) | Depends on | Effort | Risk |

## Verification
| Work item | Command(s) | Manual checks |

## Open questions
```

## Definition of done

- Every existing component and every proposed new one has a target tier and path.
- Every store-coupled component in `ui/` has a written props interface.
- The `ui/` → `stores/` import ban has an enforceable ESLint rule.
- Layouts are verified against the real `App.tsx` structure, not assumed.
