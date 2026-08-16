# P2-08 — Tooling & Migration-Safety Plan

**Wave:** P2 · **Depends on:** 01 (dependencies), 03 (component-sizes)
**Output:** `REFRESH-PREP/findings/tooling.md`

## Expert profile

You are a build/DX engineer. Your instinct on a refactor this size is: *what
catches it when we break something?* You know that a codebase with zero tests
undergoing a state-library migration plus a 3,000-line component split is a
regression factory without a safety net.

## Prerequisites

Read before starting:
- `REFRESH-PREP/findings/dependencies.md` — the compatibility matrix and
  React 19 verdict.
- `REFRESH-PREP/findings/component-sizes.md` — what's being refactored and its
  regression risk.

## Locked decision

Add **Storybook + Vitest + Testing Library + ESLint (flat) + Prettier**.

## Context

- **Bun** is the runtime. `npm` is not on PATH. All commands use `bun` / `bunx`.
- `client` declares a `lint` script but **has no ESLint config file**.
- No Prettier, no test runner, no CI.
- Zero tests and zero stories exist today.
- Root `dev` runs `mprocs` (see `mprocs.yaml`) across client/server/ai.

## Your task

1. **ESLint flat config.** Author the actual `client/eslint.config.js`:
   - TypeScript, React hooks, react-refresh (deps are already declared).
   - The `ui/` → `stores/`|`api/` import ban from findings 07, via
     `no-restricted-imports`.
   - A rule discouraging default exports if the project prefers named (check
     current convention and match it — do not impose a new one).
   - Decide on `max-lines` / `max-lines-per-function`. Given files at 3,062
     lines, a warn-level threshold is useful as a ratchet; recommend a value and
     say whether it's `warn` or `error` initially.
   - Whether `server/` gets its own config.

2. **Prettier setup.** Config file, ignore file, and — importantly — a
   recommendation on **when** to run the initial format sweep. A repo-wide
   reformat before the refactor destroys `git blame` and creates enormous
   diffs that hide real changes; after, it's cheap. Recommend a sequencing and
   justify it.

3. **Vitest setup.** Author the config:
   - `vitest.config.ts` (or Vite config integration), jsdom environment,
     setup file with `@testing-library/jest-dom`.
   - Coverage provider and reporters.
   - How store tests (no React) and component tests (jsdom) coexist — separate
     projects/environments if warranted.
   - Path aliases matching `tsconfig.json`.

4. **The characterization-test strategy.** This is the highest-value part of
   this task. Before `Canvas.tsx` (3,062 lines) is split and before Zustand
   becomes MobX, we need tests that pin down *current* behavior — not ideal
   behavior. Specify:
   - Which pure utilities to test first (`utils/alphaBlend.ts`,
     `utils/edgeInterpolate.ts`, `utils/lightingRenderer.ts`,
     `utils/previewRenderer.ts`, `components/Canvas/drawingUtils.ts`) — these are
     pure, high-value, and cheap to cover.
   - How to characterize the **serialization round-trip**
     (`projectToCompact` → `compactToProject`) and every legacy migration path.
     Getting these wrong corrupts real user project files, so they need coverage
     before anything else moves.
   - How to test the current Zustand store's behavior so the MobX port can be
     verified against it — the same assertions should pass against both.
   - A realistic coverage target for the pre-refactor safety net. Be honest:
     100% is not the goal; covering the migration-critical paths is.

5. **Snapshot/visual-regression assessment.** Should we add Storybook test-runner
   or Chromatic-style visual regression for the BEM CSS conversion? The CSS
   rewrite is exactly the kind of change unit tests don't catch. Give a
   cost/benefit and a recommendation — including the option of "no, manual
   review is sufficient at this scale."

6. **Type-checking gate.** `client` runs `tsc -b` in build. Confirm the codebase
   currently type-checks clean (run it; report actual errors if any). Recommend a
   `typecheck` script and whether stricter flags (`noUncheckedIndexedAccess`,
   `exactOptionalPropertyTypes`) should be adopted — and if so, in which wave,
   since enabling them mid-refactor could add hundreds of errors.

7. **Scripts.** The complete `scripts` block for root, `client`, and `server`:
   `dev`, `build`, `test`, `test:watch`, `coverage`, `lint`, `lint:fix`,
   `format`, `typecheck`, `storybook`, `build-storybook`. Bun-flavored.

8. **CI recommendation.** Is there CI today? (Check for `.github/`.) Propose a
   minimal GitHub Actions workflow — typecheck, lint, test, build-storybook — and
   note whether the owner wants it. Flag this as a question rather than assuming.

9. **Pre-commit hooks.** Recommend for/against husky + lint-staged, with
   reasoning for a solo-developer project.

10. **Wave-gating criteria.** Define the objective checks that must pass before
    each REFRESH wave is considered complete — the quality gates the MASTER
    plan will reference. Make them mechanically verifiable (a command that
    exits 0), not subjective.

## Output format

Write `REFRESH-PREP/findings/tooling.md`:

```markdown
# Tooling & Migration-Safety Plan

## Summary

## ESLint flat config
```js
<the actual config>
```
<rule rationale, especially the ui/ import ban and max-lines>

## Prettier
<config + when to run the sweep, with justification>

## Vitest
```ts
<the actual config>
```
<setup file, environments, aliases>

## Characterization tests  ← the safety net
### Priority 1 — serialization & migrations
### Priority 2 — pure utilities
### Priority 3 — current store behavior
<what to assert, and the honest coverage target>

## Visual regression
<recommendation + cost/benefit>

## Type-checking
<current state — actual tsc output — + recommended strictness by wave>

## Scripts
| Workspace | Script | Command |

## CI
<proposal, flagged as a question for the owner>

## Pre-commit hooks
<recommendation>

## Wave gates
| Wave | Gate | Verifying command |

## Install order
<exact bun commands, sequenced>

## Proposed work items
| Title | Touches (explicit files/dirs) | Depends on | Effort | Risk |

## Verification
| Work item | Command(s) | Manual checks |

## Open questions
```

## Definition of done

- ESLint, Prettier, and Vitest configs are written out in full, ready to drop in.
- The characterization-test strategy names specific files and specific assertions.
- Wave gates are mechanically verifiable commands.
- Every version installed matches findings 01's compatibility matrix.
