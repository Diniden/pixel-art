# P1-01 — Dependency & Toolchain Audit

**Wave:** P1 · **Depends on:** nothing · **Output:** `REFRESH-PREP/findings/dependencies.md`

## Expert profile

You are a JavaScript/TypeScript build-and-dependency specialist. You know the
React 18→19 migration, the Vite 5→7 line, ESLint flat config, and how Bun
workspaces differ from npm. You care about *breaking changes*, not version
numbers for their own sake.

## Context

- Monorepo-ish layout: root `package.json`, `client/`, `server/`, `ai-service/` (Python).
- **Bun is the runtime.** `npm` is NOT on PATH. Use `bun`, `bunx`, and
  `bun pm` for everything. `bunx npm-check-updates` works if you need it.
- Current declared versions (verify these, don't trust this table):

| Workspace | Package | Declared |
| --- | --- | --- |
| root | mprocs | ^0.8.3 |
| root | sharp | 0.34.5 |
| client | react / react-dom | ^18.3.1 |
| client | zustand | ^4.5.2 |
| client | lucide-react | ^0.575.0 |
| client | vite | ^5.4.10 |
| client | typescript | ~5.6.2 |
| client | eslint | ^9.13.0 |
| client | @vitejs/plugin-react | ^4.3.3 |
| server | express | ^4.21.0 |
| server | sharp | ^0.33.5 |
| server | cors | ^2.8.5 |
| server | dotenv | ^17.3.1 |
| server | @types/node | ^22.9.0 |
| server | tsx | ^4.19.2 |

## Your task

1. **Establish actual installed versions** vs declared. Check `client/bun.lock`
   and each `node_modules`. Note drift.
2. **Find latest stable** for every dependency. Use `bunx npm-check-updates` or
   query the registry directly. Record `current → latest`.
3. **Classify each upgrade** as:
   - `SAFE` — patch/minor, no known breaking change.
   - `BREAKING` — major with migration work. Describe *specifically* what breaks
     in *this* codebase, with file paths.
   - `BLOCKED` — cannot upgrade yet; say what blocks it.
4. **Flag the version mismatch** between root `sharp` 0.34.5 and server `sharp`
   ^0.33.5. Determine whether both are actually used and whether they can align.
5. **React 19 assessment.** This is the big one. Determine concretely:
   - Does anything in `client/src` use patterns React 19 removes or changes
     (string refs, legacy context, `propTypes`, `defaultProps` on function
     components, implicit `ref` forwarding assumptions)?
   - Are `lucide-react`, and the Storybook/Vitest packages we plan to add,
     React-19-ready?
   - Give a clear **recommend / defer** verdict with reasoning.
6. **Missing tooling inventory.** Confirm and detail:
   - `client` has a `lint` script but no ESLint config file. Verify. What would
     the flat config need to cover (TS, React hooks, react-refresh)?
   - No Prettier, no test runner, no Storybook. Confirm.
   - Does `server` have a lint/test story at all?
7. **Compatibility matrix for the new tooling** we intend to add: Storybook 8/9,
   Vitest 2/3, `@testing-library/react`, `mobx`, `mobx-react-lite`. Record the
   exact versions that work together with the Vite and React versions you
   recommend. **This matrix is what the REFRESH tooling task will install from,
   so get it right.**
8. **Python side (`ai-service/`)**: read `requirements.txt` and
   `requirements-proxy.txt`. Note unpinned deps (there are several) and the risk
   that creates. Do not attempt to upgrade — just report.

## Output format

Write `REFRESH-PREP/findings/dependencies.md`:

```markdown
# Dependency Audit

## Summary
<3–5 sentences: overall staleness, the one or two upgrades that actually matter>

## Upgrade table
| Workspace | Package | Current | Latest | Class | Notes |

## Breaking upgrades — detail
### <package> <old> → <new>
- What breaks here: <file:line references>
- Migration effort: S / M / L
- Recommended wave: <which REFRESH wave should do this>

## React 19 verdict
<recommend or defer, with reasoning and evidence>

## New tooling compatibility matrix
| Package | Version to install | Compatible with | Notes |

## Missing tooling
<what's absent, what each addition requires>

## ai-service (Python)
<findings, report-only>

## Recommended upgrade sequencing
<ordered list, with which upgrades can be done in parallel>

## Proposed work items
| Title | Touches (explicit files/dirs) | Depends on | Effort | Risk |

## Verification
| Work item | Command(s) | Manual checks |

## Open questions
```

## Definition of done

- Every dependency in all three JS workspaces appears in the upgrade table.
- Every `BREAKING` entry names at least one concrete file that must change.
- The new-tooling compatibility matrix pins exact versions.
- A clear React 19 recommend/defer verdict is stated.
