# 06 — Vitest + Testing Library harness

**Wave:** W4 · **Depends on:** 03, 05
**Touches:** `client/vitest.config.ts` (new) · `client/src/test/setup.unit.ts` (new) · `client/src/test/setup.dom.ts` (new) · `client/src/test/canvasStub.ts` (new) · `client/src/utils/__tests__/alphaBlend.test.ts` (new) · `client/tsconfig.json` (add `paths`) · `client/vite.config.ts` (add matching `resolve.alias`) · `client/package.json` · `server/vitest.config.ts` (new, minimal) · `server/package.json`
**Effort:** M

## Objective

After this task `bunx vitest run` exits 0 with at least one real passing test, the two test environments (fast `node` for pure logic, `jsdom` for DOM) both work, path aliases resolve identically in `tsconfig`, `vite.config.ts` and `vitest.config.ts`, and a canvas pixel-hash helper exists so pure renderers can be regression-tested without a browser.

## Context

There are **zero tests** in this repo today — no test runner, no test script, no test file in any of the three workspaces. Every claim of "no regression" made so far has been manual.

### Versions (registry-verified; dry-run-proven to resolve as a set)

```sh
cd client
bun add --exact -d vitest@3.2.7 @vitest/ui@3.2.7 @vitest/coverage-v8@3.2.7
bun add --exact -d jsdom@30.0.1
bun add --exact -d @testing-library/react@16.3.2
bun add --exact -d @testing-library/dom@10.4.1      # REQUIRED explicitly — RTL 16 no longer bundles it
bun add --exact -d @testing-library/jest-dom@7.0.1
bun add --exact -d @testing-library/user-event@14.6.4
```

- **Vitest 3.2.7, not 4.x.** Vitest 4 requires `vite ^6 || ^7 || ^8` with every `@vitest/*` subpackage pinned to an exact match, and `@storybook/addon-vitest@10` would drag in `@vitest/browser-playwright` and a ~300 MB Playwright browser download for a project that has zero tests today. 3.2.7 peers `vite ^5 || ^6 || ^7.0.0-0`, which matches the Vite 7.3.6 installed by task 03.
- `@vitest/ui` and `@vitest/coverage-v8` must be the **exact same version** as `vitest` — Vitest pins its own subpackages exactly.
- `@testing-library/dom@10.4.1` must be installed **explicitly**. RTL 16 no longer bundles it; omitting it is a common and confusing failure.

### Two projects, deliberately

Configure Vitest with two named projects:

- **`unit`** — `environment: "node"`, no jsdom, no setup beyond `setup.unit.ts`. This is where serialization, migrations, pure utilities, and store-behaviour tests run. `useEditorStore` is a plain Zustand store, so `useEditorStore.getState()` / `.setState()` work entirely outside React — those tests belong here and must not pay the jsdom cost.
- **`dom`** — `environment: "jsdom"`, `setupFiles` importing `@testing-library/jest-dom/vitest` via `setup.dom.ts`. This is where component render tests and primitive DOM snapshots run.

### Path aliases — the most likely thing to silently drift

Add the same alias set to **three** places, with identical keys: `client/tsconfig.json` `compilerOptions.paths`, `client/vite.config.ts` `resolve.alias`, and `client/vitest.config.ts` `resolve.alias`. Suggested set, matching the directory shape later waves create:

```
@/*        → src/*
@ui/*      → src/ui/*
@stores/*  → src/stores/*
@api/*     → src/api/*
@test/*    → src/test/*
```

To reduce three copies to two, put the alias map in a small shared module (e.g. `client/aliases.ts`) that both Vite configs import. The tsconfig `paths` block still has to be hand-mirrored — the proof that they agree is a test that imports via `@/` and passes under **both** `bunx tsc --noEmit` and `bunx vitest run`.

### The canvas pixel-hash helper

jsdom has **no canvas implementation**, and this plan deliberately adds **no** canvas-rendering dependency (`@napi-rs/canvas` / `canvas` are not in the verified dependency matrix). The resolution: pure renderers are structured to take and return **`ImageData`-like buffers** rather than a `CanvasRenderingContext2D`, and tests assert on a hash of the resulting `Uint8ClampedArray`.

`client/src/test/canvasStub.ts` provides:
- a factory producing a plain `{ data: Uint8ClampedArray, width, height }` buffer of a given size,
- a `hashBuffer(buf): string` function (any stable content hash — FNV-1a over the bytes is sufficient and dependency-free),
- a helper to render a fixture into a buffer and return its hash.

This is what later tasks use to prove that unifying the two frame-overlay renderers, deduplicating the four checkerboard implementations, and merging the two `alphaBlend` functions did not change output. Chrome-drawing renderers that genuinely need a `ctx` (marching ants, lasso, origin cross) fall back to manual review.

### Coverage thresholds — enforce only where corruption is possible

Set per-path thresholds in `vitest.config.ts`. Do **not** set a global threshold: a single number over a codebase containing a 3,062-line untested `Canvas.tsx` is either so low it never fails or so high it blocks every commit.

| Path | Threshold | Enforced |
| --- | --- | --- |
| `src/types/**` (serialization + all 8 migrations) | 90% statements, 95% functions | **yes** |
| `src/utils/alphaBlend.ts` | 100% | **yes** |
| `src/components/Canvas/drawingUtils.ts` | 85% | **yes** |
| everything else | measure, do not gate | no |

The thresholds will not be met until task 07 lands. Configure them now but set them to `0` with a `// RAISE IN TASK 07` comment, or configure them at target and accept that `--coverage` fails until 07 — **choose the second**, and note it in the completion report, so the number is never quietly forgotten.

### The proof-of-life test

Ship `client/src/utils/__tests__/alphaBlend.test.ts` as a **real** test, not `expect(1).toBe(1)`. It must import via the `@/` alias (proving both alias configs), and assert computed values on `blendPixels` from `client/src/utils/alphaBlend.ts`: src `a=0` leaves dst unchanged; src `a=255` yields src; dst `a=0` yields src. Note that `alphaBlend` at `alphaBlend.ts:11` was deleted by task 02 as dead code — test `blendPixels`, which `layerActions.ts:3` actually imports.

### Server

Add a **bare** `server/vitest.config.ts` with `environment: "node"` and a `test` script, solely so later tasks have somewhere to put the server-side migration test. Do not build out a server test harness beyond that in this refresh.

## Steps

1. Install the packages listed in Context, in `client`.
2. Create `client/vitest.config.ts` with the two named projects (`unit` and `dom`), the `resolve.alias` map, and the coverage `thresholds` block.
3. Create `client/src/test/setup.unit.ts` (minimal — global test config only) and `client/src/test/setup.dom.ts` (imports `@testing-library/jest-dom/vitest`).
4. Add the identical `paths` block to `client/tsconfig.json` and the identical `resolve.alias` to `client/vite.config.ts`. **Do not change the existing `server.proxy` block in `vite.config.ts`.**
5. Create `client/src/test/canvasStub.ts` as described in Context.
6. Write the proof-of-life test `client/src/utils/__tests__/alphaBlend.test.ts`, importing via `@/utils/alphaBlend`.
7. Add scripts to `client/package.json`: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:ui": "vitest --ui"`, `"coverage": "vitest run --coverage"`.
8. Add `server/vitest.config.ts` (node environment) and a `"test": "vitest run"` script to `server/package.json`.
9. Add root scripts: `"test": "bun run --cwd client test"`, `"coverage": "bun run --cwd client coverage"`, and the composite gate `"verify": "bun run typecheck && bun run lint && bun run format:check && bun run test && bun run build"`.

## Constraints

- **No lockfiles; pin exact versions.** Standing project policy (owner decision, 2026-08-16): `bunfig.toml`'s `[install.lockfile] save = false` is deliberate and must stay, the repo has no lockfile of any kind, and every dependency is written as an exact version in `package.json`. Every `bun add` in this task uses `--exact` (plain `bun add x@1.2.3` writes `"^1.2.3"`). Never create, commit or regenerate a lockfile; `--frozen-lockfile` is meaningless here.
- **Do not install `vitest@4`, `@vitest/browser`, `@vitest/browser-playwright`, `@storybook/addon-vitest`, `@storybook/test-runner`, or Playwright.** Visual regression via a hosted service or a browser runner was evaluated and rejected on measured grounds; the substitutes are Storybook (task 08), primitive DOM snapshots, and the canvas pixel hashing this task installs.
- Do not add a canvas-rendering native dependency.
- Do not write the characterisation tests here — that is task 07. This task ships the harness plus exactly one real test.
- Do not set a global coverage threshold.
- `npm` and `node` are not on PATH.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx vitest run                          # exit 0, ≥1 passing test
bunx vitest run --project unit           # exit 0
bunx vitest run --project dom            # exit 0
bunx tsc --noEmit                        # still exit 0
bunx eslint .                            # still exit 0
# ≥1 test actually passed (not just "no tests found"):
bunx vitest run --reporter=json | grep -q '"numPassedTests":[1-9]'
cd ../server && bunx vitest run          # exit 0 (may report 0 tests; the config must load)
```

Manual checks:
- Confirm the shipped test imports via `@/` and asserts a computed value — open it and read it.
- Confirm the alias keys in `client/tsconfig.json`, `client/vite.config.ts` and `client/vitest.config.ts` are **character-for-character identical**. This is the single most likely thing to drift.
- Confirm the dev server still starts and the `/api` proxy still works (the `vite.config.ts` edit is the risk).

## Definition of done

- [ ] `bunx vitest run` exits 0 with at least one real passing test that imports via `@/`.
- [ ] Both the `unit` (node) and `dom` (jsdom) projects run.
- [ ] `@testing-library/dom@10.4.1` is installed explicitly.
- [ ] Alias keys are identical across `tsconfig.json`, `vite.config.ts` and `vitest.config.ts`.
- [ ] `client/src/test/canvasStub.ts` exists and exports a buffer factory and a stable `hashBuffer`.
- [ ] Per-path coverage thresholds are configured for `src/types/**`, `alphaBlend.ts` and `drawingUtils.ts`; no global threshold is set; the fact that `--coverage` fails until task 07 is stated in the completion report.
- [ ] `bun run verify` exists as a root script (it will still fail until later waves — that is expected and must be noted).
- [ ] No Playwright, no browser runner, no canvas native dependency was installed.
