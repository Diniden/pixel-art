# Tooling & Migration-Safety Plan

**Task:** P2-08 · **Measured:** 2026-08-16 · **Reads:** `findings/dependencies.md` (P1-01),
`findings/component-sizes.md` (P1-03) · **Toolchain:** `bun 1.3.5`, `npm`/`node` **not on PATH**

## Summary

This repo is about to run a state-library migration (Zustand → MobX), a 3,062-line component
split, a 14-modal primitive extraction, and a repo-wide BEM CSS rewrite — **with zero tests, zero
stories, zero lint enforcement, zero CI, and a red typechecker**. Every one of those changes is
invisible to the only gate that exists (`vite build`, which does not typecheck). The job of this
plan is to install the gate before the work starts, not alongside it.

Four findings drive everything below.

1. **The 29-vs-56 discrepancy is resolved: it is 29, and findings 03's "56" is wrong.** I ran both
   commands. `bunx tsc --noEmit` and `bunx tsc -b` produce **byte-identical output** — 29 errors,
   9 of them real. `diff` of the two captured outputs returns nothing. Full evidence in
   [Type-checking](#type-checking). `bun run build` exits **1** and emits **no `dist/`**.

2. **The serialization round-trip is load-bearing twice over, not once.** `projectToCompact` →
   `compactToProject` is not only the save/load path — it is also the **deep-clone mechanism for
   undo**. `store/index.ts:63-64` and `:96-97` both do
   `compactToProject(projectToCompact(project))` to snapshot history. A round-trip that drops a
   field silently loses it on **undo**, not just on reload. That is exactly the live
   `lightGridMode` bug (`types/index.ts:967`). One test file protects both subsystems.

3. **Prettier must run twice, deliberately.** A single repo-wide sweep is wrong in both
   positions. Run a **scoped sweep now** (config files and the files W0 already touches), and the
   **remainder late**, after the Canvas/FrameTimeline splits have already rewritten those files.
   Rationale in [Prettier](#prettier).

4. **Visual regression: NO for Chromatic/test-runner, YES for a 6-line canvas pixel-hash helper.**
   The CSS rewrite is a single-developer, single-reviewer change where a screenshot diff mostly
   produces noise. But the *canvas* renderers are pure pixel producers — hashing `ImageData` in
   plain Vitest gives real regression coverage for ~30 lines of helper and no browser download.

Everything installed below matches findings 01's pinned matrix exactly. No version here was
chosen independently.

---

## ESLint flat config

`client` declares `"lint": "eslint ."` (`client/package.json:9`) but has **no config file**, so
the script fails outright today. Five ESLint packages are installed and doing nothing.

### `client/eslint.config.js`

```js
// @ts-check
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  {
    // Global ignores. Must be a standalone object to apply repo-wide.
    ignores: [
      "dist/**",
      "storybook-static/**",
      "node_modules/**",
      "coverage/**",
      "*.tsbuildinfo",
      // `lib/` is copied verbatim into user exports (server/src/routes/export.ts:714-719)
      // and is public API for generated projects. Do not lint-churn it.
      "lib/**",
    ],
  },

  // ---------------------------------------------------------------- base TS
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // tsconfig already sets noUnusedLocals/noUnusedParameters, so tsc owns
      // unused detection. Leaving the ESLint rule on duplicates 19 of the
      // current 29 tsc errors as lint findings too. Off here, on in tsc.
      "@typescript-eslint/no-unused-vars": "off",

      // The codebase uses `as` casts heavily in migration code
      // (services/api.ts:68,80 `as unknown as LegacyLayer`). These are
      // deliberate and load-bearing; warn so they stay visible, don't block.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",

      // Async correctness — this DOES matter: services/api.ts and autoSave.ts
      // are full of promises, and E3/E4 in findings 05 are swallowed-error bugs.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],

      // ---- Named exports: MATCH the existing convention, do not impose one.
      // Measured: exactly ONE `export default` exists in all of client/src
      // (App.tsx:238). Every component uses `export function X()`.
      // So this rule codifies reality; it is not a new policy.
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExportDefaultDeclaration",
          message:
            "Use named exports. This codebase has exactly one default export (App.tsx) and it is grandfathered via an override below.",
        },
      ],

      // ---- Ratchet: file size. See rationale below.
      "max-lines": [
        "warn",
        { max: 400, skipBlankLines: true, skipComments: true },
      ],
      "max-lines-per-function": [
        "warn",
        { max: 150, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],

      // Console: 5 call sites today, 3 of them migration progress logs that
      // are genuinely useful. Allow warn/error, flag bare log.
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  // ------------------------------------------------------- React (src only)
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs["recommended-latest"]],
    plugins: { "react-refresh": reactRefresh },
    rules: {
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },

  // ------------------------------------ ARCHITECTURE: the ui/ import ban
  // Coordinated with P2-07 (component taxonomy) — see note below. P2-07 owns
  // the final directory names; this block owns the enforcement mechanism.
  {
    files: ["src/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/stores/**", "**/store/**", "@/stores/*", "@/store/*"],
              message:
                "ui/ must be fully divorced from state (MASTER.md locked decision). Accept data and callbacks as props; let a container in features/ do the wiring.",
            },
            {
              group: ["**/api/**", "@/api/*", "**/services/api", "**/services/aiService"],
              message:
                "ui/ must not perform I/O. Lift the call into a container and pass the result down as props.",
            },
            {
              group: ["mobx", "mobx-react-lite"],
              message:
                "ui/ components are presentational and must not observe. If it needs observe(), it is a container and belongs in features/.",
            },
          ],
        },
      ],
      // Presentational components must stay Storybook-able: no store, no I/O,
      // and therefore no reason to be over 400 lines.
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },

  // --------------------------------------------- stores must not import ui/
  // The inverse ban. Today store/variantActions.ts:14 imports getAnchorPadding
  // from components/AnchorGrid/AnchorGrid — a store depending on a UI
  // component (findings 03 §2). This rule makes that regression impossible.
  {
    files: ["src/stores/**/*.ts", "src/store/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/ui/**", "**/components/**"],
              message:
                "Stores must not import from ui/ or components/. Move the shared pure helper into src/domain/ or src/utils/.",
            },
          ],
        },
      ],
    },
  },

  // -------------------------------------------------------------- overrides
  {
    // App.tsx is the single grandfathered default export.
    files: ["src/App.tsx", "src/main.tsx"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    // Tests: long describe blocks and non-null assertions are normal.
    files: ["**/*.test.{ts,tsx}", "src/test/**/*.{ts,tsx}"],
    rules: {
      "max-lines": "off",
      "max-lines-per-function": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },
  {
    // Stories: default export IS the CSF contract. Non-negotiable exception.
    files: ["**/*.stories.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": "off",
      "react-refresh/only-export-components": "off",
      "max-lines": "off",
    },
  },
  {
    // Config files run in Node, not the browser.
    files: ["*.config.{js,ts}", ".storybook/**/*.{js,ts}"],
    languageOptions: { globals: globals.node },
    rules: { "@typescript-eslint/no-unsafe-assignment": "off" },
  },

  // MUST BE LAST — turns off every rule that would fight Prettier.
  prettierConfig,
);
```

### `server/eslint.config.js`

**Verdict: yes, `server/` gets its own config — but a thin one.**

Findings 01 recommended a shared root config as "the cheaper path". I disagree, for one measured
reason: **root has no `bun.lock` and no ESLint packages installed** (root `devDependencies` is
just `mprocs` + `sharp`). A root config means installing the entire ESLint + typescript-eslint +
`@types/*` tree at root purely to lint 2,057 lines of server code, and `typescript-eslint`'s
`projectService` needs a `tsconfig.json` adjacent to the files anyway. Two small configs are
cheaper than one shared one plus a fourth dependency tree.

```js
// @ts-check
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "data/**", "exports/**", "*.tsbuildinfo"] },
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off", // tsconfig owns this; server is already clean
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      // Express 4 does NOT auto-forward async rejections. Express 5 (findings 01
      // D9) does. Until D9 lands, an unhandled rejection in a route handler is a
      // hung request. This rule is the only thing that catches it statically.
      "@typescript-eslint/require-await": "error",
      "max-lines": ["warn", { max: 400, skipBlankLines: true, skipComments: true }],
      "no-console": "off", // server logging is intentional
    },
  },
  prettierConfig,
);
```

### Rule rationale

| Rule | Setting | Why this value, measured |
| --- | --- | --- |
| `no-restricted-imports` (ui/ → stores/, api/) | **error** | This is the locked "UI fully divorced from the store" decision made mechanical. Today **35 of ~40 client source files import `useEditorStore` directly** and `Canvas.tsx:101-149` destructures **48 store members in one call**. Without a machine check, the refactor regresses on the first convenient shortcut. Error, not warn — a warn-level architecture rule is decoration. |
| `no-restricted-imports` (stores/ → ui/) | **error** | Not requested, but the inverse violation **already exists**: `store/variantActions.ts:14` imports `getAnchorPadding` from `components/AnchorGrid/AnchorGrid`. Adding only the forward ban would leave the real, live violation unguarded. |
| `no-restricted-syntax: ExportDefaultDeclaration` | **error**, with overrides | The brief says match the convention, don't impose one. Measured: `grep -rn "export default" client/src client/lib` → **1 hit**, `App.tsx:238`. Every component is `export function X()`. This rule *is* the existing convention. Overrides for `App.tsx`, `main.tsx`, and `*.stories.tsx` (CSF requires a default export). |
| `max-lines` | **warn @ 400** (error @ 400 inside `ui/` only) | A ratchet, not a wall. At `warn`, `bunx eslint .` still exits 0, so the gate stays green while 17 files are legitimately over. Value chosen from the census: 400 puts **23 files** over threshold (everything findings 03 marked SPLIT or REVIEW, plus a handful of KEEPs like `selectionActions.ts` at 651). A 250 threshold would flag 46 files including files explicitly verdicted KEEP — noise. Inside `ui/` it is **error**, because a presentational component that is 400+ lines has failed its own definition. **Do not** set it to error globally until after Wave D; `Canvas.tsx` at 3,062 would make the gate permanently red. |
| `max-lines-per-function` | **warn @ 150** | The real pathology is function size, not file size: `Canvas()` spans lines 29-3062 as **one function**, `handleAccept` is 182 lines (`AIInterpolateModal.tsx:681-862`), `makeVariant` is 259 (`variantActions.ts:23-282`), `flipHorizontal`/`flipVertical` are 280 combined. 150 is above every function findings 03 marked cohesive and below every one it marked for splitting. |
| `@typescript-eslint/no-unused-vars` | **off** | Deliberate. `client/tsconfig.json` already sets `noUnusedLocals` + `noUnusedParameters`, which produce **19 of the current 29 tsc errors**. Leaving the ESLint rule on reports the same 19 problems in a second tool with a second severity — and lets someone "fix" lint while the build stays red. One owner per class of error. |
| `no-floating-promises` / `no-misused-promises` | **error** | Findings 05 E3/E4 are swallowed-async bugs (`api.ts:236-240` catch-all returns `createDefaultProject()` — silent data loss; `api.ts:211-219` best-effort migration backup). These rules are the static half of that fix. Requires type-aware linting, hence `projectService: true`. |
| `recommendedTypeChecked` (not plain `recommended`) | — | Costs ~3-5× lint runtime but is the only way to get the async rules and `no-unsafe-*`. Worth it on a 69-file client. |
| `no-unsafe-*` family | **warn** | Type-aware linting on a codebase with deliberate `as unknown as LegacyLayer` casts (`api.ts:68,80`) will produce a large first-run wave. Warn keeps the gate green while making the surface visible. Revisit after the migrations move to `shared/`. |

**Coordination note for task 09:** the `ui/**` glob above assumes P2-07 names the presentational
directory `src/ui/`. **P2-07 owns that name; this config owns the mechanism.** If P2-07 chooses
`src/components/ui/` or `src/design-system/`, change only the two `files:` globs — the
`no-restricted-imports` bodies are unaffected. Task 09 must reconcile the two documents before
authoring the work item; do not land two competing directory layouts.

**First-run expectation:** `eslint-plugin-react-hooks@7.1.1` ships the React Compiler ruleset and
enables more rules by default (findings 01). Expect a **large** first-run finding count across the
69 `.ts`/`.tsx` files. Triage it in one sitting and set severities deliberately — do **not**
mass-`--fix` and do **not** blanket-disable. Budget half a session for this alone.

---

## Prettier

### `.prettierrc` (repo root)

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always",
  "endOfLine": "lf",
  "overrides": [
    {
      "files": ["*.md"],
      "options": { "proseWrap": "preserve" }
    },
    {
      "files": ["server/src/data/**/*.json", "**/__fixtures__/**/*.json"],
      "options": { "requirePragma": true }
    }
  ]
}
```

These are not arbitrary. `singleQuote: false`, `semi: true`, `trailingComma: "all"` and
`printWidth: 80` are what the codebase already looks like — `types/index.ts`, `services/api.ts`,
and every store module already use double quotes, semicolons, and trailing commas. Choosing
different values would turn the "scoped" sweep below into a whole-file rewrite of every file.
(`vite.config.ts` is the exception — single quotes, no semis. It reformats; it's 27 lines.)

The `__fixtures__` override is a **hard requirement**, not a nicety: reformatting a migration
fixture changes the bytes of a file whose entire purpose is to be a frozen historical artifact.

### `.prettierignore` (repo root)

```
node_modules
dist
storybook-static
coverage
*.tsbuildinfo
bun.lock
*.gz

# Public API copied verbatim into user exports (server/src/routes/export.ts:714-719).
# Reformatting changes what ships to users' generated projects.
client/lib

# Real user data and the migration fixture corpus. NEVER reformat.
server/src/data
server/exports
**/__fixtures__

# Python service — separate lifecycle (MASTER.md line 63)
ai-service

# Generated / vendored
*.min.js
*.min.css
```

### When to run the sweep — **split it in two**

**Recommendation: a scoped sweep in the tooling wave, and the remainder after the large splits
land. Never one repo-wide sweep.**

The brief frames this as "before the refactor destroys `git blame`" vs "after, it's cheap." Both
framings are right about different files, which is why one sweep is the wrong shape.

**Sweep A — scoped, lands with the ESLint/Prettier work item (Wave 1).**

```sh
bunx prettier --write \
  "*.{json,md,yaml,yml}" \
  "client/*.{ts,js,json}" \
  "client/.storybook/**" \
  "server/*.{ts,js,json}" \
  "client/src/types/**" \
  "client/src/services/api.ts"
```

Why these and nothing else:
- Config/root files have no meaningful blame history to protect.
- `client/src/types/**` and `services/api.ts` are being **rewritten anyway** by W0
  (`types/index.ts:967` fix) and by the migration extraction. Their blame is about to churn
  regardless, so the reformat costs nothing extra — and formatting them *now* means the
  characterization tests are written against already-formatted source.

**Sweep B — the remaining ~65 files, after Wave D component splits land.**

```sh
bunx prettier --write "client/src/**/*.{ts,tsx,css}" "server/src/**/*.ts"
```

Why later:
- `Canvas.tsx` (3,062 lines), `AIInterpolateModal.tsx` (1,252), `variantActions.ts` (1,412),
  `lightingActions.ts` (1,036), the `FrameTimeline/` triplet and all 34 CSS files are all being
  **moved, split, or rewritten**. Formatting them first means formatting code that is about to be
  deleted, and it puts a whole-file reformat diff in the history immediately *before* the split
  diff — which is precisely when a reviewer most needs a clean diff to read.
- Findings 03 measures ~1,960 duplicated lines, ~1,400 mechanically removable. Reformatting 1,400
  lines that will be deleted is pure waste, and it *breaks the duplication evidence*: the
  `diff <(sed -n '212,232p' Canvas.tsx) <(sed -n '132,152p' LightingCanvas.tsx)` one-line-difference
  proof stops working once one side is reformatted.

**Non-negotiable rules for both sweeps:**
1. Each sweep is **its own commit**, containing nothing else. Commit message: `style: prettier sweep (no behavior change)`.
2. Verify with `git diff --stat` before committing; verify with `bunx tsc --noEmit` after
   (Prettier should be behavior-neutral, but `trailingComma: "all"` in a function call touching a
   pre-ES2017 target is the classic exception — this repo targets ES2020, so it is safe).
3. Record both commit SHAs in `.git-blame-ignore-revs` at repo root:
   ```
   # Prettier sweep A — config + types + api (no behavior change)
   <sha-a>
   # Prettier sweep B — remaining client/server sources (no behavior change)
   <sha-b>
   ```
   and enable it once: `git config blame.ignoreRevsFile .git-blame-ignore-revs`. This makes the
   "destroys git blame" objection **fully mitigable** — GitHub honors this file automatically.
4. Between the two sweeps, `--check` runs must be **scoped to swept paths** or CI will be red.
   Use the `format:check` script in [Scripts](#scripts), which points at an explicit path list
   that widens after Sweep B.

---

## Vitest

### `client/vitest.config.ts`

A **separate file** from `vite.config.ts`, not a `test:` block inside it. Reason: `vite.config.ts`
calls `loadEnv(mode, '..', '')` and constructs a proxy target from `VITE_API_URL`
(`vite.config.ts:5-8`). Under test, `mode` is `"test"` and there is no dev server, so the proxy
config is dead weight, and any `.env` change would silently alter test behavior. `mergeConfig`
keeps the plugin/alias half and drops the server half.

```ts
import { defineConfig, mergeConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      // Mirrors the `paths` block added to client/tsconfig.json in the same
      // work item. These two MUST be kept in sync — see Open question 3.
      "@": path.resolve(rootDir, "./src"),
      "@ui": path.resolve(rootDir, "./src/ui"),
      "@stores": path.resolve(rootDir, "./src/stores"),
      "@api": path.resolve(rootDir, "./src/api"),
      "@domain": path.resolve(rootDir, "./src/domain"),
      "@test": path.resolve(rootDir, "./src/test"),
    },
  },

  test: {
    // Two projects: pure/store tests get node (fast, no DOM cost); component
    // tests get jsdom. Roughly 80% of the safety net below is pure logic, and
    // paying jsdom setup for it is ~3-5x slower per file for no benefit.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          globals: true,
          include: [
            "src/domain/**/*.test.ts",
            "src/utils/**/*.test.ts",
            "src/types/**/*.test.ts",
            "src/stores/**/*.test.ts",
            "src/store/**/*.test.ts",
            "src/api/**/*.test.ts",
            "src/components/**/!(*.dom).test.ts", // pure helpers colocated w/ components
          ],
          setupFiles: ["./src/test/setup.unit.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          globals: true,
          include: [
            "src/**/*.test.tsx",
            "src/**/*.dom.test.ts",
          ],
          setupFiles: ["./src/test/setup.dom.ts"],
          // jsdom has no canvas. Every canvas-touching test must use the
          // OffscreenCanvas-free stub from src/test/canvasStub.ts, or run in
          // the `unit` project against a hand-rolled ImageData. See below.
          environmentOptions: {
            jsdom: { resources: "usable" },
          },
        },
      },
    ],

    // Deterministic ordering; the migration fixtures are large and IO-bound.
    pool: "forks",
    testTimeout: 15_000,
    hookTimeout: 15_000,

    reporters: process.env.CI ? ["default", "junit"] : ["default"],
    outputFile: { junit: "./coverage/junit.xml" },

    coverage: {
      provider: "v8",           // @vitest/coverage-v8@3.2.7 — no instrumentation
      reporter: ["text-summary", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.stories.{ts,tsx}",
        "src/test/**",
        "src/main.tsx",
        "src/vite-env.d.ts",
        "lib/**",
      ],
      // Enforced only on the migration-critical surface. A global threshold on
      // a 31,635-line codebase with a 3,062-line Canvas would either be
      // meaninglessly low or permanently red. See "coverage target" below.
      thresholds: {
        "src/types/**": { statements: 90, branches: 85, functions: 95, lines: 90 },
        "src/utils/alphaBlend.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/components/Canvas/drawingUtils.ts": { statements: 85, branches: 75, functions: 90, lines: 85 },
      },
    },
  },
});
```

Chosen from findings 01's matrix: `vitest@3.2.7` (the `V3` dist-tag), `@vitest/coverage-v8@3.2.7`
and `@vitest/ui@3.2.7` (Vitest pins its subpackages to an **exact** match), `jsdom@30.0.1`.
Vitest 3 requires `vite ^5 || ^6 || ^7.0.0-0`, satisfied by the pinned `vite@7.3.6`. Vitest 4 is
**not** taken — findings 01 §"Alternative stack" measured the cost (Playwright download,
exact-pinned `@vitest/*` set, Vite 8/rolldown) and the whole point of a safety net is that its own
failures are boring.

### `client/src/test/setup.unit.ts`

```ts
import { beforeEach, afterEach, vi } from "vitest";

// Deterministic ids. types/index.ts:476 generateId() uses Math.random +
// Date.now; every round-trip snapshot would otherwise differ run to run.
let idCounter = 0;
vi.mock("@/types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/types")>();
  return { ...actual, generateId: () => `test-id-${++idCounter}` };
});

beforeEach(() => {
  idCounter = 0;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
```

### `client/src/test/setup.dom.ts`

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import "./setup.unit"; // reuse the deterministic-id + fake-timer setup

// jsdom implements neither of these, and the Canvas/LightingCanvas code paths
// call both unconditionally.
beforeEach(() => {
  vi.stubGlobal(
    "requestAnimationFrame",
    (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number,
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));

  // ResizeObserver — used by the floating-panel and canvas sizing code.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
});
```

### `client/src/test/canvasStub.ts` — the pixel-hash helper

This is the whole of the "visual regression" answer (see [Visual regression](#visual-regression)).
~40 lines, zero dependencies, no browser.

```ts
import { createCanvas } from "@napi-rs/canvas"; // OR: hand-roll, see note

/**
 * Render a pure ctx-taking renderer to an offscreen surface and return a
 * stable hash of its pixels. Used to pin the output of render/* functions
 * across the Canvas.tsx split — especially the D7 unification of the two
 * near-identical frame-overlay renderers (Canvas.tsx:1024-1290 vs 1297-1506).
 */
export function hashRender(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): string {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  draw(ctx);
  const { data } = ctx.getImageData(0, 0, width, height);
  // FNV-1a over the RGBA bytes — order-sensitive, collision-resistant enough
  // for regression detection, and stable across platforms (unlike PNG bytes).
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    h ^= data[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Pretty-print a small ImageData as ASCII for readable assertion failures. */
export function toAscii(data: ImageData, width: number, height: number): string {
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    let row = "";
    for (let x = 0; x < width; x++) {
      const a = data.data[(y * width + x) * 4 + 3];
      row += a === 0 ? "." : a < 128 ? "-" : "#";
    }
    rows.push(row);
  }
  return rows.join("\n");
}
```

**Note on `@napi-rs/canvas`:** it is **not** in findings 01's matrix, so treat it as an addition
requiring sign-off (Open question 4). The zero-new-dependency alternative is to keep every
`render/*` extraction taking a **plain `ImageData`-like buffer** rather than a `ctx`, and assert
on the `Uint8ClampedArray` directly — which is already how findings 03 describes
`renderFrameOverlay` (it builds an `ImageData`, zeroes it, walks layers, blits, then
`putImageData`). **Recommended: do that, and skip the dependency.** The `ctx`-shaped variants
(`renderScene`, `renderSelectionOverlay`, marching ants) then fall back to manual review, which is
appropriate — they draw chrome, not pixel data.

---

## Characterization tests  ← the safety net

The governing principle: **these tests encode what the code does today, bugs included.** Where a
known bug exists, the test asserts the buggy behavior *and* carries a `// BUG:` comment naming the
work item that will flip it. A characterization test that asserts the *desired* behavior is just a
failing test, and it will be deleted by the first person who needs a green build.

Three known live bugs must be pinned this way before W0 touches them:
`types/index.ts:967` (`lightGridMode` absent from `CompactUIState`), `drawingUtils.ts:438`, and
`ReferenceImagePanel.tsx:116`.

### Priority 1 — serialization & migrations

**This is the single highest-value test file in the plan, and it must land before anything else
moves.** Getting it wrong corrupts real user files — `server/src/data/Base Unit.json` is 1.1 MB
of the owner's actual work, and `server/src/data/backups/` holds **9 gzipped snapshots spanning
Jan–Jul 2026** that are the only surviving examples of pre-migration formats.

It is doubly load-bearing: `store/index.ts:63-64` and `:96-97` use
`compactToProject(projectToCompact(project))` as the **deep-clone for undo history**. A field that
does not survive the round-trip is silently lost on **undo**, not only on reload.

#### Step 0 — freeze the corpus (do this first, it is not a test)

```sh
mkdir -p client/src/test/__fixtures__/corpus
cp "server/src/data/Base Unit.json"  client/src/test/__fixtures__/corpus/base-unit.json
cp "server/src/data/Test Blend.json" client/src/test/__fixtures__/corpus/test-blend.json
for f in server/src/data/backups/*.gz; do
  gunzip -c "$f" > "client/src/test/__fixtures__/corpus/backup-$(basename "$f" .gz).json"
done
```

Nine `.gz` files span 01-31-2026 → 02-25-2026 plus a `07-28-2026` directory. Decompress **every**
one and dedupe by structural signature (does `objects[0].frames[0].layers[0].pixels[y][x]` type as
`number` or `array`? is `variantGroups` on objects or at project level? is `uiState.studioMode`
present?). Expect 3-4 distinct signatures covering M1/M2/M6. **`.prettierignore` and the
`requirePragma` override above both exclude `__fixtures__` — this is why.**

If a signature is missing from the corpus (e.g. no file exercising M4's `>10 base frames` path),
hand-author a minimal synthetic fixture and label it `synthetic-*.json`. Do not let a gap go
unrecorded.

#### `client/src/types/__tests__/roundtrip.test.ts`

| # | Assertion | Pins what | Note |
| --- | --- | --- | --- |
| R1 | `compactToProject(projectToCompact(p))` deep-equals `p` for `createDefaultProject()` | The base contract | Must pass today |
| R2 | Same, for a fixture with ≥2 objects, ≥3 frames, ≥4 layers, a variant group with 2 variants, frame tags, and a `referenceImage` | Full-surface round-trip | The fixture must be hand-built, not loaded — loaded fixtures have already been migrated |
| R3 | **Field-census test.** `expect(Object.keys(rt.uiState).sort()).toEqual(Object.keys(p.uiState).sort())` — and separately, a hard-coded list of all 60+ `UIState` keys from `types/index.ts:125-195` | Catches *any* new field that fails to survive | This is the test that would have caught `lightGridMode`. Write it as an explicit key list so adding a field to `UIState` without adding it to `CompactUIState` **fails** |
| R4 | **`lightGridMode` specifically**, asserted at its *current* (broken) behavior, with `// BUG: types/index.ts:967 — W0 flips this to toBe(true)` | The live data-loss bug | Set `uiState.lightGridMode = true`, round-trip, assert what actually comes back. Run it, write down the observed value, assert that. Flip in W0 in the same commit as the fix |
| R5 | `projectToCompact` output is **JSON-stable**: `JSON.parse(JSON.stringify(c))` deep-equals `c` | No `undefined`/`Map`/`Set`/`NaN` leaks into the wire format | `migrateLayerVariantOffset` sets `variantOffset: undefined` (`types/index.ts:843-864`) — this asserts it drops cleanly |
| R6 | **Idempotency:** `projectToCompact(compactToProject(c))` deep-equals `c` for every corpus fixture, *after* one normalizing pass | Double-save stability | Findings 05 preservation plan item 5 |
| R7 | Pixel codec exhaustive: `compactToPixelData(pixelDataToCompact(pd))` for `pd ∈ {EMPTY_PIXEL_DATA, color-only, normal-only, height-only, all-three, a=0, a=255}` | 519-543 | Cheap, total, high value |
| R8 | `hexToRgba(rgbaToHex(c))` for all 4 channels at 0/1/127/128/254/255 | 485-504 | Catches sign/shift bugs |
| R9 | `packedToNormal(normalToPacked(n))` for `DEFAULT_NORMAL`, `{x:-128,y:-128,z:0}`, `{x:127,y:127,z:255}`, `{x:0,y:0,z:0}` | 505-518 | Signed-byte packing is the classic off-by-one site |
| R10 | **Size guard:** `JSON.stringify(projectToCompact(baseUnit)).length` is within ±2% of the on-disk `Base Unit.json` size | Compaction did not silently stop compacting | Cheap canary for a serializer regression |

#### `client/src/types/__tests__/migrations.test.ts` — one block per migration

Findings 05 enumerates **M1–M8**, of which **M2 and M4 are outright buggy** and **M6 has two
divergent implementations**. Every one gets a named test.

| Migration | Assertions to write | Bug to pin |
| --- | --- | --- |
| **M1** expanded→compact detection (`isCompactFormat` `types/index.ts:1016-1035`) | `true` for a compact fixture; `false` for an expanded one; **`false` for `{palettes: [], uiState: {selectedColor: {r,g,b,a}}}`** | Pin the fragile heuristic: a project with **zero palettes and a non-numeric `selectedColor`** returns `false` and is returned raw (`api.ts:235`), producing hex numbers where `Color` objects are expected. Assert the current wrong answer with `// BUG:` |
| **M2** legacy pixel→tuple (`migrateLegacyPixel` `:1060-1068`) | `0 → 0`; `0xff0000 → [0xff0000, 0, 1]`; **`migrateLegacyPixel([c,n,h] as any)` returns `[[c,n,h], 0, 1]`** | **Not array-safe — re-running corrupts data.** Assert the nested-array output explicitly. This single assertion is the reason the idempotency test (R6) matters |
| **M2 detection** (`isLegacyCompactFormat` `:1039-1057`) | Legacy fixture → `true`; new fixture → `false`; **a fixture where `objects[0]` is migrated but `objects[3]` is legacy → `false`** | **Samples exactly one pixel.** The mixed fixture is synthetic and must be hand-built. Assert `false`, comment that object 3's pixels are consequently never migrated |
| **M3** lighting uiState defaults | The 7 default values match between `api.ts:90-104` and `types/index.ts:969-997`: `studioMode:"pixel"`, `eraserShape:"circle"`, `pencilBrushShape:"square"`, `pencilBrushMax:16`, `traceNudgeAmount:10`, `normalBrushShape:"circle"`, `heightScale:100` | Two duplicated constant sets that must not diverge. Write it as a **cross-module equality assertion**, so extracting one to `shared/` and forgetting the other fails |
| **M4** variant-frame `offset`→`baseFrameOffsets` (`:806-825`) | Variant with 3 frames + offsets → correct map; **a project with 14 base frames and a 3-frame variant → indices 10-13 absent** | The hard-coded `10` (`:817-820`). Assert the map's `Object.keys().length` is exactly what it is today |
| **M5** layer `variantOffset`→`variantOffsets` (`:843-864`, applied `:951`) | With `selectedVariantId` → keyed correctly, `variantOffset` becomes `undefined`; **without `selectedVariantId` → left unmigrated, offset silently ignored**; guarded no-op when `variantOffsets` already present | The dropped-offset case is a real data-loss path |
| **M6** object→project variants | Run **both** implementations (`api.ts:112-145` and the path inside `compactToProject` `:882-937`) on the same fixture and assert their outputs **differ** in the documented way — `types/index.ts:917` additionally rewrites `variantOffsets` from `baseFrameOffsets[frameIndex]` | Two divergent implementations. Pinning the difference is what makes deleting one safe. Also assert: two objects with **same `vg.id`, different content** → second is discarded (`api.ts:54-57`) |
| **M7** server `normalizePixel` (`server/src/routes/export.ts:412-418`) | `number → [n,0,1]`; **`[c,n,h] → [c,n,h]` unchanged** (array-safe) | The reference implementation M2 should have been. Lives in `server/src/__tests__/` |
| **M8** export-time variantOffset (`export.ts:576-580`) | Layer with `variantOffset` and no `selectedVariantId` → **`{"": {x,y}}`** | Empty-string key in exported JSON. Assert it, then fix in the server wave |
| **Corpus** | `it.each(corpus)` — for each fixture: `loadProject`-equivalent pipeline runs without throwing, then `expect(result).toMatchSnapshot()` | Golden snapshots of **today's** output for **every real historical file**. This is the actual regression gate. Commit the `__snapshots__` directory |
| **Corpus idempotency** | For each fixture: `migrate(migrate(x))` deep-equals `migrate(x)` | Findings 05 item 5. Catches M2's nested-array corruption on any file that re-enters the pipeline |

**Snapshot policy:** these snapshots are the contract. `vitest -u` is **forbidden** on this file
without a written note in the PR explaining every changed byte. Add to the test file header:
`// DO NOT run `vitest -u` on this file. Every diff here is a change to real user data.`

#### `client/src/services/__tests__/loadProject.test.ts`

The migration *chain*, not the individual steps. Mock `fetch`; assert order and side effects.

| # | Assertion |
| --- | --- |
| L1 | Legacy compact file → backup POST to `/api/project/backup` fires **before** any migration (`api.ts:209-220`) |
| L2 | **Backup POST rejects → migration proceeds anyway** and load succeeds. `// BUG: findings 05 E4 — best-effort backup. W-server makes this blocking` |
| L3 | Legacy pixel format → `migrateLegacyProject` runs, `migrateVariantsToProjectLevel` does **not** (`api.ts:223-229` is `if/else if`) |
| L4 | New pixel format + object-level variants → only `migrateVariantsToProjectLevel` runs |
| L5 | Neither → no backup POST at all |
| L6 | **`fetch` throws → `loadProject` returns `createDefaultProject()` and logs.** `// BUG: findings 05 E3 — highest-severity: silent data loss via the auto-save chain` — this is the assertion that makes the fix verifiable |
| L7 | 404 → `createDefaultProject()` **without** a backup POST |
| L8 | `isCompactFormat === false` → data returned raw as `Project` (`api.ts:235`) with no conversion |

### Priority 2 — pure utilities

Cheap, total, no mocking. Write these second; they are the substrate the Canvas split stands on.

| File | Function(s) | Assertions | Why it matters |
| --- | --- | --- | --- |
| `utils/alphaBlend.ts` | `alphaBlend` (`:11`), `blendPixels` (`:45`) | src `a=0` → dst unchanged; src `a=255` → src; `a=128` over opaque → known midpoint (compute once, hard-code); dst `a=0` → src; both transparent → transparent; **`blendPixels` preserves `normal` and `height` per current rules** | Findings 03 D11: alpha compositing exists **5×**, two functions literally named `alphaBlend` (`alphaBlend.ts:11` and `lightingRenderer.ts:46`). Before unifying them, assert what each does — they may not agree. **Also: `alphaBlend.ts:11` is currently dead code** (exported, never imported; only `blendPixels` is used by `layerActions.ts:3`). Test both anyway; the dedupe will pick a winner |
| `components/Canvas/drawingUtils.ts` | `getLinePixels` (`:4`) | Horizontal, vertical, both diagonals, single point (`start === end` → 1 px), steep vs shallow slopes, negative direction, **endpoint inclusivity** | Bresenham. Used by every stroke tool and by the mouse/touch paths that findings 03 D8 says have **already drifted** |
| | `getRectanglePixels` (`:141`), `getEllipsePixels` (`:190`) | outline vs fill vs both (`ShapeMode`); 1×1; zero-size; reversed corners (x2<x1); rounded-corner radius 0 and radius > half-size | 3 `ShapeMode` values × 2 functions |
| | `getSquarePixels` (`:500`), `getCirclePixels` (`:522`) | size 1 → exactly 1 px; size 2, 3, 4 (even/odd centering); **the returned set is symmetric** | These feed the brush. Findings 03 flags the touch eraser at `Canvas.tsx:2766-2772` skipping the bounds `.filter()` that the mouse path applies at `:2217-2222` |
| | `floodFill` (`:279`) | Fill a bounded region; fill from a corner; fill an already-target-colored region → empty or full (assert which); a 1-px region; a region touching all four edges; **fill starting on a transparent pixel** | The transparent case is where the `isSamePixelColor` bug lives (below) |
| | `gaussianFloodFill` (`:380`) + `isSamePixelColor` (`:355`) | **Pin the `TS2367` bug.** `isSamePixelColor` is private, so assert it through `gaussianFloodFill`: given a region of **transparent** pixels (`color: 0`), the two `ca === 0 && cb === 0` / `ca === 0 \|\| cb === 0` short-circuits at `:361-362` narrow oddly and the function falls through to `!ca \|\| !cb` → `false`. **Run it, record the actual returned region, assert that.** `// BUG: drawingUtils.ts:438 TS2367 — W0 decides whether this is dead code or a live bug` | Findings 01 Open question 2 is *blocking* on whether this is a live bug. **This test is how you answer it**: write it, observe the behavior, and the answer is empirical rather than a judgement call |
| `utils/edgeInterpolate.ts` | `computeEdgeInterpolatedNormals` (`:468`) | A 5×5 square layer → normals point outward on edges, `DEFAULT_NORMAL`-ish in the interior; empty layer → no output; single-pixel layer → defined output; **result is deterministic across runs** | 506 lines, one algorithm, verdict KEEP. It needs a pin, not a split. Assert on a **hash of the normal grid**, not every value — the spherical-mean math (`:347-412`) is not worth transcribing |
| `utils/previewRenderer.ts` | `renderFramePreview` (`:51`), `renderVariantFramePreview` (`:260`), `renderLayerPreview` (`:340`) | Output `ImageData` hash for a fixture frame at scale 1, 2, 8; hidden layer excluded; empty frame → checkerboard-only hash; **variant offset applied** | These are the reference implementation for the ~8 duplicated pixel-blit loops. `getCheckerboard` (`:12`) is 1 of the 4 checkerboard implementations (D2) |
| `utils/lightingRenderer.ts` | `composeLayers` (`:70`), `renderWithLighting` (`:299`), `renderNormalAsRGB` (`:388`), `renderHeightAsGrayscale` (`:444`) | Hash of output buffer for a fixture under a **fixed** light direction/color/ambient; light directly-on vs grazing vs behind; `calculateShadow` on/off; height 0 vs 255 | Pure buffer producers → hash assertions work without any canvas. Fixed inputs are essential: `DEFAULT_LIGHT_DIRECTION` is `{x:-64,y:-64,z:180}` (`types/index.ts:242`) |
| `store/helpers.ts` | the variant-offset resolution at `:71` | All 4 fallback levels **in priority order**: `variantOffsets[selectedVariantId]` → `variantOffset` → `variant.baseFrameOffsets[i]` → `{x:0,y:0}`; `selectedVariantId` undefined → `""` key lookup | Findings 03 D10: this exact chain is duplicated **6×** (`Canvas.tsx:541,663,1113,1390,1915` + `export.ts:657`). Diff all six against each other **before** unifying — they may have drifted. One test, six call sites protected |
| `components/AnchorGrid/AnchorGrid.tsx` | `getAnchorPadding` (`:160`) | All **9** anchor positions × grow and shrink × even and odd deltas | Called from `store/variantActions.ts:14` — the store→UI import the ESLint rule above bans. Test it before moving it to `variantHelpers.ts` |

**Explicitly not tested at this stage:** `edgeInterpolate`'s 12 private math helpers, the
`render/*` chrome renderers (marching ants, lasso, origin cross), and anything requiring a real
`CanvasRenderingContext2D`. They go to manual review — see [Visual regression](#visual-regression).

### Priority 3 — current store behavior

**Goal: write assertions that pass against the Zustand store today and against the MobX store
tomorrow, with only the setup lines changing.** This is what makes the migration verifiable rather
than hopeful.

#### The mechanism

Write every store test against a **narrow adapter interface**, not against `useEditorStore`
directly:

```ts
// client/src/store/__tests__/storeContract.ts
export interface StoreHarness {
  getProject(): Project | null;
  getUiState(): UIState;
  dispatch<K extends keyof EditorActions>(action: K, ...args: Parameters<EditorActions[K]>): void;
  getHistoryLength(): number;
  getHistoryIndex(): number;
  reset(): void;
}

// Zustand today:
export function createZustandHarness(): StoreHarness { /* wraps useEditorStore.getState() */ }

// MobX tomorrow — same file, added alongside; the Zustand one is deleted last:
export function createMobxHarness(): StoreHarness { /* wraps new ApplicationStore() */ }
```

Then every behavior test is `describe.each([["zustand", createZustandHarness], ["mobx", createMobxHarness]])`.
During the migration **both** run. When the Zustand harness is deleted, the assertions are
untouched — that is the proof of parity.

`useEditorStore` is a plain Zustand store, so `useEditorStore.getState()` / `.setState()` work
outside React entirely: **these run in the fast `node` project, no jsdom, no React**.

#### What to assert (behavior, not shape)

| Area | Assertions | Source |
| --- | --- | --- |
| **Undo/redo** | Edit → undo restores prior pixels; redo re-applies; undo at index 0 is a no-op; **a new edit after undo truncates the redo tail** (`index.ts:69` `slice(0, historyIndex + 1)`); history caps at `MAX_HISTORY` and **shifts from the front** (`index.ts:72-74`) | `store/index.ts:52-86` |
| **History cloning** | After an edit, mutating `getProject()` in place does **not** change `projectHistory[historyIndex]` | `index.ts:63-64` — the round-trip clone. Directly couples P3 to P1 |
| **`trackHistory` discipline** | For each action, whether it snapshots. Findings 02 flags `setReferenceImage` as `trackHistory=false` — assert that, so a MobX port that "helpfully" tracks it is caught | `referenceActions.ts:41` |
| **Auto-save scheduling** | Every mutating action calls `scheduleAutoSave` exactly once (spy on the module); debounce coalesces N rapid edits into 1 save | `index.ts:84` |
| **Save-status lifecycle** | `saveStatus` goes `saving → saved → idle` with the 2s timeout (`index.ts:41-47`); use fake timers | `index.ts:37-48` |
| **Drawing gates** | `setPixel`/`setPixels` respect `selection.mask` + `uiState.selectionBehavior`; masked pixel outside the mask is **not** written | `drawingActions.ts:11-24` — findings 02 §5 calls this the hottest UI→domain coupling |
| **Variant frame indices** | `uiState.variantFrameIndices` is read on the pixel-write path in 6 modules; assert a write lands on the right variant frame | findings 02 |
| **Selection** | rect/flood/lasso/color modes produce the expected mask for a fixture; `movePixels` vs `moveSelection` vs `editMask` on the same drag | `selectionActions.ts` (651 lines, verdict KEEP) |
| **Layer ops** | add/delete/reorder/toggle-visibility/duplicate; all **4 `squash*` variants** on the same fixture (they are near-identical and W21 collapses them — pin the differences first) | `layerActions.ts` |
| **Clipboard** | copy → paste within an object; paste across objects; paste with a size mismatch | `layerClipboardActions.ts` — 3 actions of 143/406/288 lines |
| **Variants** | `makeVariant` on a 2-frame/3-layer fixture (round-trip the result); `resizeVariant` for all **9** anchor positions; `setVariantOffset` clamping | `variantActions.ts`, findings 03 §2 |
| **Lighting** | Normals from a known height field (hash); **`flipHorizontal ∘ flipHorizontal = identity`**; H and V agree modulo transpose | `lightingActions.ts:485-621, 756-1035`; findings 03 §5 |

**Do not** assert on `EditorState`'s shape — it has **206 top-level keys** (`storeTypes.ts`) and
the MobX design (P2-06) will re-shape all of them into `SessionStore`/`DomainStore`/`UIStore`. A
shape assertion guarantees a rewrite. Assert only through `dispatch` + `getProject`/`getUiState`.

**Memory note:** findings 02 measured **6.9 MB per undo snapshot** and **~680 MB at
`MAX_HISTORY=100`**. Do **not** write a test that fills history to 100 with a realistic project —
it will OOM the worker. Use a **tiny** fixture (1 object, 1 frame, 1 layer, 4×4 grid) and, for the
cap test, temporarily lower `MAX_HISTORY` via the harness.

### The honest coverage target

**Target: ~35% overall line coverage, ≥90% on the migration-critical surface. 100% is not the
goal and would be actively harmful here.**

Concretely:

| Surface | Lines (approx) | Target | Enforced? |
| --- | --- | --- | --- |
| `src/types/**` (serialization + all 8 migrations) | 1,086 | **90%+ statements, 95% functions** | **Yes** — `thresholds` in `vitest.config.ts` |
| `src/utils/alphaBlend.ts` | 77 | **100%** | **Yes** |
| `src/components/Canvas/drawingUtils.ts` | 546 | **85%** | **Yes** |
| `src/utils/{edgeInterpolate,previewRenderer,lightingRenderer}.ts` | 1,383 | 50-60% (hash-level, not branch-level) | No — measure, don't gate |
| `src/store/**` (behavior via harness) | ~4,500 | 40-50% of *actions*, not lines | No |
| `src/services/api.ts` | 427 | 70% (the load/migrate chain) | No |
| `src/components/**` (TSX) | ~14,000 | **<10%, and that is correct** | No |
| **Overall** | 31,635 | **~35%** | No global threshold |

Why no global threshold: a single number over a codebase containing a 3,062-line untested Canvas
is either set so low it never fails or so high it blocks every commit. Per-path thresholds on the
surface that can silently corrupt user data are the only thresholds that mean anything.

Why component coverage stays under 10%: rendering `Canvas.tsx` in jsdom tests almost nothing —
jsdom has no canvas, and 100% of the component's value is pixels. Its safety net is the **pure
extractions** (`render/*`, `tools/brushStamp.ts`, `model/coords.ts`, `model/variantOffset.ts`) that
findings 03's C1–C8 sequence creates. **Coverage of Canvas rises as a side effect of splitting it,
not as a precondition** — that is the intended order.

### Sequencing — what must exist before what moves

```
BEFORE any code moves:
  P1  roundtrip.test.ts + migrations.test.ts + corpus frozen   ← blocks W0, W2, and the MobX port
  P2  drawingUtils + alphaBlend + store/helpers variant-offset  ← blocks Canvas C1-C4 (W12)
BEFORE the MobX port:
  P3  storeContract.ts + undo/history + drawing-gate tests      ← blocks the store migration
BEFORE Canvas C7 (W14, the highest-risk item):
  brushStamp mouse-vs-touch agreement test                      ← encodes the known drift bug
```

**One caveat that must be stated plainly:** P1 and P2 tests import from `client/src/types` and
`client/src/components/Canvas/drawingUtils.ts`, which W0 is about to edit. That is not a conflict —
it is the point. Write the tests **against the red baseline**, using `--typecheck=false` behavior
(Vitest does not typecheck by default, so tests run even while `tsc` is red). W0 then flips exactly
the assertions it intends to change, in the same commit as the fix. **The tests do not wait for a
green typecheck; the green typecheck is validated by them.**

---

## Visual regression

**Recommendation: NO to Storybook test-runner and NO to Chromatic. YES to in-Vitest pixel hashing
of the pure renderers. Manual review is the right tool for the CSS/BEM conversion at this scale.**

### Cost/benefit

| Option | Setup cost | Running cost | What it actually catches here | Verdict |
| --- | --- | --- | --- | --- |
| **Chromatic** (hosted) | ~2h + account + CI token | Per-snapshot billing; a paid plan once stories exist for 31 components + 10 primitives | Cross-browser pixel diffs on stories. Requires a **CI runner**, which does not exist (no `.github/`) | **No.** Paying a subscription and standing up CI to review your own CSS refactor, solo, is a poor trade |
| **Storybook test-runner** (`@storybook/test-runner` + Playwright) | ~3h | Playwright browser download (~300 MB), per-run browser boot | Story smoke-tests (does it render without throwing) + optional `toMatchImageSnapshot` | **No, not now.** Findings 01 explicitly rejected the Vitest-4/`@storybook/addon-vitest` stack partly to avoid the Playwright download for a project with **zero tests today**. Adding it via a different door defeats that reasoning. **Revisit after the primitives land** — see below |
| **`vitest` + jsdom + `toMatchSnapshot()` on rendered DOM** | ~0 (already in the harness) | ~0 | Class-name and structure changes. **This is what a BEM rename is** | **Yes, targeted** — on the 10 primitives only |
| **Pixel hashing of pure renderers in plain Vitest** | ~40 lines (`canvasStub.ts` above) | ~0 | Canvas render regressions: the D7 frame-overlay unification, the D2 checkerboard dedupe, the D11 `alphaBlend` merge, the grid-alpha `0.05` vs `0.08` decision | **Yes — highest value per hour in this whole section** |

### Why manual review is sufficient for the CSS conversion specifically

- **One developer, one reviewer.** Visual regression tooling earns its keep when a change author
  and a change reviewer are different people, or when a shared component library has many
  consumers. Neither holds.
- **The CSS conversion is a rename, and renames are greppable.** Findings 03 already ships the
  verification command for W9: `grep -rhoE 'className="[a-z-]*(overlay|backdrop)[a-z-]*"' ... | sort -u`
  must return ≤2. A grep that exits non-zero is a better gate than a screenshot diff a human has
  to eyeball, and it is **already specified**.
- **The measured CSS problems are structural, not perceptual.** 14 backdrop class names, 6
  z-indexes (1000/1001/9999/10000/99999), 6 backdrop opacities, `@keyframes fadeIn` defined 3×, and
  a cross-file dependency where `.modal-overlay` is declared in `ReferenceImageModal.css:1` but
  consumed by `BrowseBackupsModal.tsx:117` and `ProjectSelectModal.tsx:104`. **A screenshot diff
  catches none of those** — it shows two modals that look the same while one is one unimport away
  from breaking. A CSS-declaration grep catches all of them.
- **The genuinely perceptual decisions are deliberate, not accidental.** Unifying grid alpha
  (Canvas `0.05` + `lightGridMode`-aware vs LightingCanvas hard-coded `0.08`) is a **design
  decision requiring owner sign-off** (findings 03 Open question 4). A visual-regression tool would
  flag it as a failure and someone would re-bless it. That is a manual review with extra steps.

### What to do instead — concretely

1. **`canvasStub.ts` pixel hashing** (config section above) applied to every `render/*` extraction.
   Non-negotiable for W12 (D7 unification) and W4 (checkerboard/alphaBlend dedupe).
2. **DOM structure snapshots for the 10 primitives only** (`Modal`, `Button`, `IconButton`,
   `Slider`, `NumberInput`, `SliderWithNumber`, `Toggle`, `ConfirmDialog`, `ColorSwatch`,
   `Tooltip`). ~10 tiny `.test.tsx` files, each `expect(container.firstChild).toMatchSnapshot()`
   across 2-3 prop combinations. This catches BEM class regressions at the source, where fixing one
   file fixes 14 modals — the highest-leverage place to put a snapshot.
3. **A written manual checklist**, committed as part of the CSS work item, listing the 15 modals,
   both canvases, both studio modes, and the 3 floating panels. Findings 03's Verification table
   already enumerates most of it. A checklist a human runs once beats tooling nobody maintains.
4. **Re-evaluate after the primitives exist.** If the primitive set grows past ~15 components with
   multiple variants each, `@storybook/test-runner` becomes worth its 3 hours. Flag this as a
   deliberate re-evaluation point, not a permanent "no".

---

## Type-checking

### Current state — the 29-vs-56 reconciliation

**Both commands report 29 errors. Their output is byte-identical. Findings 03's "56" is
incorrect.** Findings 01's 29 stands.

```
$ cd client && bunx tsc --noEmit
EXIT=2
$ grep -c "error TS" tsc-noemit.txt
29

$ cd client && bunx tsc -b
EXIT=1
$ grep -c "error TS" tsc-b.txt
29

$ diff tsc-noemit.txt tsc-b.txt
(no output — IDENTICAL)
```

Error census, identical for both commands:

```
  19  error TS6133   declared but never read
   5  error TS2322   type not assignable
   2  error TS2367   comparison with no type overlap
   1  error TS6192   all imports unused
   1  error TS2345   argument type mismatch
   1  error TS2339   property does not exist
  ---
  29  total   (19 unused + 1 unused-imports = 20 hygiene; 9 real)
```

The 9 real errors, verbatim (truncated on the right):

```
lib/versions/v1.ts(210,5): error TS2322: Type '{ id: string; name: string; variants: ... }[]'
    is not assignable to type 'ExportedVariantLayer[]'.
src/components/AIInterpolateModal/AIInterpolateModal.tsx(692,32): error TS2345: Argument of type
    'PixelData[][][]' is not assignable to parameter of type 'PixelData[][]'.
src/components/AIInterpolateModal/AIInterpolateModal.tsx(720,19): error TS2322: ... 'VariantFrame[]'
src/components/AIInterpolateModal/AIInterpolateModal.tsx(736,19): error TS2322: ... 'VariantFrame[]'
src/components/AIInterpolateModal/AIInterpolateModal.tsx(785,21): error TS2322: ... 'Layer[]'
src/components/AIInterpolateModal/AIInterpolateModal.tsx(815,21): error TS2322: ... 'Layer[]'
src/components/Canvas/drawingUtils.ts(438,17): error TS2367: This comparison appears to be
    unintentional because the types 'Pixel' and 'number' have no overlap.
src/components/ReferenceImagePanel/ReferenceImagePanel.tsx(116,24): error TS2367: This comparison
    appears to be unintentional because the types '{ r: number; g: number; b: number; a: number; }'
    and 'number' have no overlap.
src/types/index.ts(967,38): error TS2339: Property 'lightGridMode' does not exist on type
    'CompactUIState'.
```

**`bun run build` confirmed failing, with no artifact:**

```
$ cd client && bun run build      # = "tsc -b && vite build"
EXIT=1
error: script "build" exited with code 1
$ ls -d client/dist
NO dist
```

`vite build` alone exits 0 because esbuild strips types without checking them — which is exactly
why nobody noticed. Findings 03's core claim ("no green baseline to refactor against") is
**correct**; only its error count was wrong. `server` typechecks clean.

**Where the 56 probably came from:** `tsc -b` is incremental and reads `client/tsconfig.tsbuildinfo`
(committed to git, 1,883 bytes). A run against a **stale or absent** buildinfo can report a
different set than a run against a current one, and running `tsc -b` twice without cleaning between
can double-report. I ran `--noEmit` first, then `-b`, then restored the original buildinfo byte-for-byte
(md5 `0866b368…` before and after; `git status` clean). Whatever produced 56, it is not reproducible
today from a clean tree.

### Two structural defects in the current setup

1. **`tsc -b` on a non-composite project.** `client/package.json:8` is `"build": "tsc -b && vite build"`,
   but `client/tsconfig.json` declares **no `references`**, no `composite: true`, and there is no
   `tsconfig.node.json`. Build mode on a single non-composite root project is a misuse that happens
   to work. Fix in the same item: either add real project references, or switch to `tsc --noEmit`.
   **Recommend `tsc --noEmit`** — it is what the config actually describes, it removes the buildinfo
   entirely, and it makes `typecheck` and `build`'s type step the same command.
2. **`client/tsconfig.tsbuildinfo` is committed to git** (`git ls-files` confirms it is tracked) and
   is **not** in `.gitignore`. A machine-generated incremental cache in version control produces
   spurious diffs on every build and is very likely the source of the 56-vs-29 confusion. **Delete
   it from the index and gitignore it.** Also gitignore `client/dist`, `client/coverage`, and
   `client/storybook-static` — none of the three is currently ignored.

### Recommended strictness, by wave

`client/tsconfig.json` already has `strict: true`, `noUnusedLocals`, `noUnusedParameters`,
`noFallthroughCasesInSwitch`, `isolatedModules`. That is a good baseline. The additions:

| Flag | Wave | Rationale |
| --- | --- | --- |
| `"noEmit": true` + drop `tsc -b` for `tsc --noEmit` | **Wave 0 (with W0)** | Free. Removes the buildinfo and the composite misuse |
| `paths` (`@/*`, `@ui/*`, `@stores/*`, `@api/*`, `@domain/*`, `@test/*`) | **Wave 1 (tooling)** | Must land **with** the Vitest `resolve.alias` block so the two never drift. Also makes the `no-restricted-imports` patterns unambiguous |
| `noImplicitOverride` | **Wave 1** | Zero cost — no classes in `client/src` today. Free insurance before MobX introduces store classes |
| `noPropertyAccessFromIndexSignature` | **Wave 1** | Low cost; catches `uiState[k]` typos |
| `verbatimModuleSyntax` | **Wave 2** | Requires mechanically adding `type` to type-only imports across ~69 files. Mostly `--fix`-able via `@typescript-eslint/consistent-type-imports`. Do it as its own commit, right after Prettier Sweep A, so the two mechanical passes are adjacent |
| **`noUncheckedIndexedAccess`** | **Wave 4 — after the Canvas split, NOT before** | **The expensive one.** This codebase is 2D-pixel-grid indexing end to end: `pixels[y][x]` appears in every renderer, `drawingUtils.ts`, `previewRenderer.ts`, `lightingRenderer.ts`, `edgeInterpolate.ts`, and Canvas's ~1,000-line pointer section. Enabling it makes every one of those `PixelData \| undefined`. Realistic estimate: **several hundred new errors**, concentrated in exactly the files being split. Enabling it mid-refactor means every Canvas split step fights it. **Enable it after Wave D, file by file**, using per-directory tsconfig overrides if needed — `src/domain/` and `src/types/` first (where it is cheap and most valuable), `src/components/Canvas/render/` last |
| **`exactOptionalPropertyTypes`** | **Wave 5 — or never; owner call** | Interacts badly with this specific codebase. `migrateLayerVariantOffset` (`types/index.ts:843-864`) **deliberately sets `variantOffset: undefined`** as its migration signal, and `layerToCompact:702` relies on `if (layer.variantOffset)` dropping it. Under `exactOptionalPropertyTypes`, `{ variantOffset?: Point }` no longer accepts an explicit `undefined`, so that pattern becomes a type error and the migration must be rewritten to `delete` the key — a **behavior-affecting change to migration code**. The `Compact*` interfaces (`:544-684`) are optional-property-heavy for the same reason. **Recommend: do not adopt during this refresh.** Revisit once the migrations live in `shared/` with the corpus tests green |
| `noUncheckedSideEffectImports` | Wave 5 | Nice-to-have; CSS side-effect imports (`main.tsx:4`, `App.tsx:23`) need `declare module "*.css"` first |

**The rule for all of the above: never enable a strictness flag in the same commit as a refactor.**
Each flag gets its own commit, whose entire diff is "add flag + fix the errors it produced." That is
what makes it reviewable and revertable.

---

## Scripts

Bun-flavored throughout. `npm` and `node` are not on PATH.

| Workspace | Script | Command |
| --- | --- | --- |
| **root** | `dev` | `CFG="$PWD/mprocs.yaml" && cd "$(mktemp -d)" && exec mprocs --config "$CFG"` *(unchanged)* |
| root | `dev:client` | `cd client && bun run dev` *(unchanged)* |
| root | `dev:server` | `cd server && bun run dev` *(unchanged)* |
| root | `build` | `bun run --cwd client build && bun run --cwd server build` |
| root | `test` | `bun run --cwd client test` |
| root | `test:watch` | `bun run --cwd client test:watch` |
| root | `coverage` | `bun run --cwd client coverage` |
| root | `lint` | `bun run --cwd client lint && bun run --cwd server lint` |
| root | `lint:fix` | `bun run --cwd client lint:fix && bun run --cwd server lint:fix` |
| root | `format` | `bunx prettier --write .` |
| root | `format:check` | `bunx prettier --check .` |
| root | `typecheck` | `bun run --cwd client typecheck && bun run --cwd server typecheck` |
| root | `storybook` | `bun run --cwd client storybook` |
| root | `build-storybook` | `bun run --cwd client build-storybook` |
| root | **`verify`** | `bun run typecheck && bun run lint && bun run format:check && bun run test && bun run build` |
| root | `install:all` | `bun install && cd client && bun install && cd ../server && bun install` *(unchanged)* |
| root | `ai:*` | *(unchanged)* |
| **client** | `dev` | `vite` *(unchanged)* |
| client | `build` | `tsc --noEmit && vite build` ← **was `tsc -b && vite build`** |
| client | `typecheck` | `tsc --noEmit` |
| client | `typecheck:watch` | `tsc --noEmit --watch` |
| client | `test` | `vitest run` |
| client | `test:watch` | `vitest` |
| client | `test:ui` | `vitest --ui` |
| client | `test:unit` | `vitest run --project unit` |
| client | `test:dom` | `vitest run --project dom` |
| client | `coverage` | `vitest run --coverage` |
| client | `lint` | `eslint .` |
| client | `lint:fix` | `eslint . --fix` |
| client | `format` | `bunx prettier --write "src/**/*.{ts,tsx,css}"` |
| client | `storybook` | `storybook dev -p 6006` |
| client | `build-storybook` | `storybook build` |
| client | `preview` | `vite preview` *(unchanged)* |
| **server** | `dev` | `bun --watch src/index.ts` *(unchanged)* |
| server | `build` | `tsc` *(unchanged — server is composite-free and clean)* |
| server | `start` | `bun dist/index.js` ← **was `node dist/index.js`; `node` is not on PATH** (findings 01 Open question 5) |
| server | `typecheck` | `tsc --noEmit` |
| server | `lint` | `eslint .` |
| server | `lint:fix` | `eslint . --fix` |
| server | `test` | `vitest run` *(only after the server gets a Vitest config — defer)* |

Two notes. **`format:check` during the two-sweep window** must be scoped, or it will fail on the
not-yet-swept files. Between Sweep A and Sweep B, use:

```json
"format:check": "bunx prettier --check \"*.{json,md,yaml,yml}\" \"client/*.{ts,js,json}\" \"server/*.{ts,js,json}\" \"client/src/types/**\" \"client/src/services/api.ts\""
```

and widen it to plain `bunx prettier --check .` in the same commit as Sweep B. **`bun run --cwd`**
is used at root rather than `cd X && bun run` so a failure in the first workspace still returns a
non-zero exit and does not leave the shell in a moved directory.

---

## CI

**There is no CI today. Verified:**

```sh
$ ls -la .github
NO .github directory
$ find . -maxdepth 2 -name "*.yml" -o -maxdepth 2 -name "*.yaml" | grep -v node_modules
./mprocs.yaml          # the local dev process runner — not CI
```

**This is a question for the owner, not an assumption.** For a solo project where the developer
runs `bun run verify` locally, CI adds a GitHub dependency, a runner minute budget, and a place for
things to be red that nobody is looking at. It is genuinely defensible to say no.

**My recommendation: yes, but only because of this specific refactor.** The whole point of this
document is that the refresh is a regression factory. A gate that runs on every push is worth more
during a three-month rewrite than it will be afterward. Frame it as scaffolding with a review date.

**One hard blocker to flag before writing any workflow:** `vite@7.3.6` declares
`engines: node ^20.19.0 || >=22.12.0` and `vitest@3.2.7` declares `node ^18 || ^20 || >=22`, but
**this machine has no `node` at all** — everything runs on Bun. A CI workflow must therefore either
use `oven-sh/setup-bun` **only** (and accept that the engines fields go unchecked), or install both.
Recommend Bun-only, matching the actual dev environment; a CI that tests a runtime nobody uses is
worse than no CI.

### Proposed `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

# Cancel superseded runs on the same ref.
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.5   # matches the measured local toolchain

      # Requires bunfig.toml's [install.lockfile] save = false to be REMOVED
      # first (findings 01 D1). Without lockfiles, --frozen-lockfile cannot
      # work and CI installs are not reproducible.
      - name: Install (client)
        run: bun install --frozen-lockfile
        working-directory: client

      - name: Install (server)
        run: bun install --frozen-lockfile
        working-directory: server

      - name: Typecheck
        run: bun run typecheck

      - name: Lint
        run: bun run lint

      - name: Format check
        run: bun run format:check

      - name: Test
        run: bun run --cwd client test

      - name: Build
        run: bun run --cwd client build

      - name: Build Storybook
        run: bun run --cwd client build-storybook

      - name: Upload coverage
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: client/coverage/
          retention-days: 7
```

**Do not enable this until findings 01's D1 (re-enable lockfiles) has landed.** `bunfig.toml` sets
`[install.lockfile] save = false`, root has no lockfile at all, and the two committed `bun.lock`
files are frozen snapshots that no longer track `package.json`. `--frozen-lockfile` against that
state either fails or silently installs something other than what the developer has. **CI without
reproducible installs is a random-number generator.**

**Ordering within the job is deliberate:** typecheck first because it is the fastest signal and the
one that is red today; `build-storybook` last because it is the slowest and least likely to catch a
regression the earlier steps missed.

### Questions for the owner

1. Do you want CI at all, or is a local `bun run verify` pre-push habit sufficient?
2. Is this repo on GitHub? (No `.github/` and no remote was inspected — I did not check `git remote`
   as that is outside a read-only audit's remit.)
3. Should CI block merges (branch protection), or just report? For a solo repo, "report only" gets
   most of the value with none of the friction.

---

## Pre-commit hooks

**Recommendation: NO to husky. YES to a single native `.git/hooks/pre-push` that the developer
opts into.**

Verified absent: no `.husky/`, no `lint-staged`, no custom hooks in `.git/hooks/` (only `.sample`
files).

**The case against husky + lint-staged here:**

| Reason | Detail |
| --- | --- |
| Two more dependencies for a solo repo | `husky` + `lint-staged` + their trees, plus a `prepare` script that must run in every workspace. The value proposition of husky is *team* consistency — enforcing on contributors who did not read the README. There are no contributors |
| It fights the two-sweep Prettier plan | `lint-staged` runs `prettier --write` on staged files. During the Sweep A → Sweep B window that would format not-yet-swept files piecemeal, producing exactly the scattered reformat noise the sequencing exists to prevent, spread across dozens of unrelated commits |
| Commit-time is the wrong moment for a slow gate | Type-aware ESLint (`recommendedTypeChecked` + `projectService`) on a 69-file client is measured in seconds, not milliseconds. A commit that pauses is a commit that gets `--no-verify`'d, and a hook that is routinely bypassed is worse than none — it produces false confidence |
| `bun run verify` already exists | The full gate is one command. A hook that runs a subset of it adds a second, weaker definition of "green" |

**What to do instead** — a hand-installed, ~10-line `pre-push` hook. Push is a natural checkpoint
(infrequent, already network-latency-bound, so seconds do not register), and it catches the thing
that actually matters: pushing a red build.

```sh
#!/bin/sh
# .git/hooks/pre-push  —  install manually: chmod +x .git/hooks/pre-push
# Bypass deliberately with: git push --no-verify
set -e
echo "pre-push: typecheck + test"
bun run typecheck
bun run --cwd client test
```

Ship this as a **documented snippet in the README**, not as an automated install. The developer
opts in; nothing in the repo silently rewrites their git config.

**Revisit if a second developer joins.** At that point husky + lint-staged becomes the right answer,
and the Prettier sweeps will be long done so the objection above evaporates.

---

## Wave gates

Every gate is a command that exits 0 on pass and non-zero on fail. Wave numbering is **indicative**
— task 09 owns the final wave structure; these gates attach to the work, not to a fixed wave count.

| Wave | Gate | Verifying command |
| --- | --- | --- |
| **0 — Baseline** | Client typechecks clean | `cd client && bunx tsc --noEmit` |
| 0 | Server still typechecks clean | `cd server && bunx tsc --noEmit` |
| 0 | Full build produces an artifact | `cd client && bun run build && test -d dist` |
| 0 | Lockfiles reproducible (findings 01 D1) | `cd client && bun install --frozen-lockfile && cd ../server && bun install --frozen-lockfile` |
| 0 | Build artifacts are not tracked | `! git ls-files --error-unmatch client/tsconfig.tsbuildinfo 2>/dev/null` |
| **1 — Tooling** | ESLint config exists and passes | `cd client && bunx eslint . && cd ../server && bunx eslint .` |
| 1 | Prettier clean on swept paths | `bun run format:check` |
| 1 | Test harness runs and has ≥1 real passing test | `cd client && bunx vitest run --reporter=json \| grep -q '"numPassedTests":[1-9]'` |
| 1 | Aliases agree between tsconfig and vitest | `cd client && bunx tsc --noEmit && bunx vitest run --project unit` (a test importing via `@/` proves both) |
| **2 — Safety net** | Round-trip + migration suites green | `cd client && bunx vitest run src/types/__tests__/` |
| 2 | Every corpus fixture has a committed snapshot | `test "$(ls client/src/test/__fixtures__/corpus/*.json \| wc -l)" -le "$(grep -c 'exports\[' client/src/types/__tests__/__snapshots__/migrations.test.ts.snap)"` |
| 2 | Migration-critical coverage thresholds met | `cd client && bunx vitest run --coverage` (thresholds in `vitest.config.ts` fail the run) |
| 2 | Pure-utility suites green | `cd client && bunx vitest run --project unit` |
| **3 — Store migration** | Both harnesses pass the same assertions | `cd client && bunx vitest run src/store/__tests__/` (the `describe.each` covers both) |
| 3 | Zustand fully removed | `! grep -rq "zustand" client/src && ! grep -q '"zustand"' client/package.json` |
| 3 | No store→UI imports | `cd client && bunx eslint src/stores src/store` (the `no-restricted-imports` rule is `error`) |
| **4 — Components** | Storybook builds | `cd client && bunx storybook build && test -d storybook-static` |
| 4 | ui/ has no store or api imports | `cd client && bunx eslint src/ui` |
| 4 | Canvas render hashes unchanged | `cd client && bunx vitest run src/components/Canvas/render/` |
| 4 | Primitive DOM snapshots unchanged | `cd client && bunx vitest run src/ui/**/*.test.tsx` |
| 4 | One backdrop class remains (findings 03 W9) | `test "$(grep -rhoE 'className="[a-z-]*(overlay\|backdrop)[a-z-]*"' client/src --include='*.tsx' \| sort -u \| wc -l)" -le 2` |
| **5 — Hardening** | `max-lines` findings below a declining budget | `cd client && test "$(bunx eslint . -f json \| grep -o 'max-lines' \| wc -l)" -le "$BUDGET"` (ratchet `$BUDGET` down each wave) |
| 5 | Everything, in one command | `bun run verify` |

**The universal gate**, runnable at any point:

```sh
bun run verify
# = typecheck && lint && format:check && test && build
```

Red today. Making it green is Wave 0's entire definition of done.

---

## Install order

Sequenced. Findings 01's STEP 0 is a hard prerequisite: **nothing below is reproducible until
lockfiles are re-enabled**, because `bunfig.toml` currently sets `[install.lockfile] save = false`
and root has no lockfile at all. Every version matches findings 01's matrix exactly.

```sh
# ─── STEP 0 — reproducibility (findings 01 D1). BLOCKING. ────────────────────
# Manually edit bunfig.toml: delete the [install.lockfile] save = false block.
# Then regenerate all three lockfiles and commit them.
bun install                       # root — creates the missing root bun.lock
cd client && bun install && cd ..
cd server && bun install && cd ..
git add bun.lock client/bun.lock server/bun.lock bunfig.toml

# Also in step 0: stop tracking the build cache.
git rm --cached client/tsconfig.tsbuildinfo
# add to .gitignore: client/tsconfig.tsbuildinfo, client/dist,
#                    client/coverage, client/storybook-static

# ─── STEP 1 — foundation: React 19 + Vite 7 + TS 5.9 (findings 01 D3/D4/D5) ──
# Must precede the harness so Vitest/Storybook are authored against final
# versions and never need re-validation.
cd client
bun add react@19.2.8 react-dom@19.2.8
bun add -d @types/react@19.2.18 @types/react-dom@19.2.4
bun add -d vite@7.3.6 @vitejs/plugin-react@5.2.0      # NOT plugin-react@6 (peers vite ^8 only)
bun add -d typescript@5.9.3                           # NOT TS 6/7 (ts-eslint caps <6.1.0)
bunx tsc --noEmit                                     # must be 0 errors before continuing
cd ../server && bun add -d typescript@5.9.3 && bunx tsc --noEmit && cd ..

# ─── STEP 2 — lint + format ──────────────────────────────────────────────────
cd client
bun add -d eslint@9.39.5 @eslint/js@9.39.5 typescript-eslint@8.67.0
bun add -d eslint-plugin-react-hooks@7.1.1 eslint-plugin-react-refresh@0.5.4
bun add -d globals@17.11.0 eslint-config-prettier@10.1.8
cd ../server
bun add -d eslint@9.39.5 @eslint/js@9.39.5 typescript-eslint@8.67.0
bun add -d globals@17.11.0 eslint-config-prettier@10.1.8
cd ..
bun add -d prettier@3.9.6                             # ROOT — one Prettier for the repo
# Write: client/eslint.config.js, server/eslint.config.js, .prettierrc, .prettierignore
# Then Prettier Sweep A (scoped) as its own commit.

# ─── STEP 3 — Vitest + Testing Library (needs Vite 7 from step 1) ────────────
cd client
bun add -d vitest@3.2.7 @vitest/ui@3.2.7 @vitest/coverage-v8@3.2.7
bun add -d jsdom@30.0.1
bun add -d @testing-library/react@16.3.2
bun add -d @testing-library/dom@10.4.1                # REQUIRED explicitly — RTL 16 no longer bundles it
bun add -d @testing-library/jest-dom@7.0.1
bun add -d @testing-library/user-event@14.6.4
# Write: vitest.config.ts, src/test/setup.unit.ts, src/test/setup.dom.ts
# Ship at least one REAL passing test in this commit, not expect(1).toBe(1).

# ─── STEP 4 — the safety net (no installs; this is the test-writing wave) ────
# Freeze the corpus, then write P1 → P2 → P3 in that order.

# ─── STEP 5 — Storybook (needs React 19 + Vite 7) ────────────────────────────
cd client
bunx storybook@9.1.20 init --builder vite --no-dev
bun add -d eslint-plugin-storybook@9.1.20             # MUST match `storybook` major
# .storybook/preview.ts MUST import ../src/index.css and ../src/App.css —
# all 34 CSS files are global, so stories render unstyled otherwise.

# ─── STEP 6 — MobX (dependency-only; migration is P2-06's) ───────────────────
cd client
bun add mobx@7.0.0 mobx-react-lite@5.0.0              # mobx-react-lite MUST be v5 (v4 pairs w/ mobx 6)
# Remove zustand ONLY when the MobX store exists — store/index.ts:1 is its sole importer.
```

**Never install:** `zustand@5` (being deleted), `@vitejs/plugin-react@6` (forces Vite 8),
`typescript@6`/`@7` (outside typescript-eslint's `<6.1.0` window), `vitest@4` (drags Vite 8 +
Playwright), `storybook@10` (peers `vite-plus`; its `react-vite` peer set moves too).

---

## Proposed work items

| Title | Touches (explicit files/dirs) | Depends on | Effort | Risk |
| --- | --- | --- | --- | --- |
| **T1 — Repo hygiene: untrack build artifacts, fix `tsc -b` misuse** | `.gitignore` · `client/tsconfig.tsbuildinfo` (`git rm --cached`) · `client/package.json` (`build` script → `tsc --noEmit && vite build`; add `typecheck`) · `client/tsconfig.json` (confirm `noEmit`) · `server/package.json` (`start` → `bun dist/index.js`; add `typecheck`) | — (can run before or parallel to findings 01 D1/D2) | **S** | Low. `tsc --noEmit` could theoretically report differently than `tsc -b` — **it does not**, verified byte-identical (29 errors both ways). Detect: `cd client && bunx tsc --noEmit` reports the same 29 errors as before the change; `git status --short` shows no `tsbuildinfo` |
| **T2 — ESLint flat configs (client + server)** | `client/eslint.config.js` (new) · `server/eslint.config.js` (new) · `client/package.json` (deps + `lint`/`lint:fix` scripts) · `server/package.json` (same) | findings 01 D5 (typescript-eslint pins TS `<6.1.0`); **P2-07** for the `ui/**` directory name | **M** | `eslint-plugin-react-hooks@7` first run produces a **large** finding set across 69 files. Risk is over-reacting: mass `--fix` or blanket-disabling. Also risks colliding with P2-07 if the two documents disagree on the `ui/` path. Detect: `bunx eslint .` exits 0 in both workspaces; review the first report by hand before setting any severity |
| **T3 — Prettier config + Sweep A (scoped)** | `.prettierrc` (new, root) · `.prettierignore` (new, root) · `.git-blame-ignore-revs` (new, root) · `package.json` (root: `prettier` dep + `format`/`format:check`) · reformatted: `*.{json,md,yaml,yml}`, `client/*.{ts,js,json}`, `server/*.{ts,js,json}`, `client/src/types/**`, `client/src/services/api.ts` | T2 (`eslint-config-prettier` must be last in the flat array) | **S** | The sweep must be **its own commit with nothing else in it**. If mixed with T2, the ESLint findings become unreviewable. Detect: `bunx prettier --check <swept paths>` exits 0; `bunx tsc --noEmit` error count is **unchanged at 29** (Prettier must be behavior-neutral) |
| **T4 — Vitest harness + first real test** | `client/vitest.config.ts` (new) · `client/src/test/setup.unit.ts` (new) · `client/src/test/setup.dom.ts` (new) · `client/tsconfig.json` (add `paths`) · `client/package.json` (deps + `test`/`test:watch`/`test:ui`/`coverage` scripts) · `client/src/utils/__tests__/alphaBlend.test.ts` (new — the proof-of-life test) | findings 01 D3 (React 19) + D4 (Vite 7) — Vitest 3 peers exclude Vite 5 | **M** | The `paths` block in tsconfig and `resolve.alias` in vitest.config **will drift** if edited separately. Ship a test that imports via `@/` so both are exercised. Detect: `bunx vitest run` exits 0 with ≥1 passing test; `bunx tsc --noEmit` still 0 |
| **T5 — Freeze the migration fixture corpus** | `client/src/test/__fixtures__/corpus/` (new; copies of `server/src/data/Base Unit.json`, `server/src/data/Test Blend.json`, and one decompressed `.json` per `.gz` in `server/src/data/backups/` — **9 archives**) · `.prettierignore` (already excludes `**/__fixtures__`) · a `README.md` in the corpus dir recording each file's structural signature | T3 (so `.prettierignore` protects them from the moment they land) | **S** | The corpus may not cover every historical format — M4's `>10 base frames` path in particular has no known real example. Mitigate by hand-authoring `synthetic-*.json` for gaps and **recording the gaps explicitly**. Detect: `ls client/src/test/__fixtures__/corpus/*.json \| wc -l` ≥ 11; `bunx prettier --check` does not touch them |
| **T6 — P1 characterization: serialization round-trip** | `client/src/types/__tests__/roundtrip.test.ts` (new) · `client/src/test/fixtures/projects.ts` (new — hand-built `Project` fixtures) | T4, T5 | **M** | These tests are written against a **red typechecker** by design (Vitest does not typecheck). Risk is writing aspirational assertions instead of characterizing assertions — R4 (`lightGridMode`) must assert the **observed broken** value, not the desired one. Detect: `bunx vitest run src/types/__tests__/roundtrip.test.ts` exits 0 **today, before W0** |
| **T7 — P1 characterization: all 8 migrations + load chain** | `client/src/types/__tests__/migrations.test.ts` (new) · `client/src/types/__tests__/__snapshots__/` (new, committed) · `client/src/services/__tests__/loadProject.test.ts` (new) · `server/src/__tests__/normalizePixel.test.ts` (new — M7) | T6 | **L** | **The highest-value and highest-effort item here.** 8 migrations, 3 of which (M2, M4, M6) must have their *bugs* pinned rather than fixed. Getting a snapshot wrong bakes in corruption. Detect: `bunx vitest run src/types/__tests__/migrations.test.ts` exits 0; every corpus fixture has a snapshot entry; `migrate(migrate(x)) === migrate(x)` holds for all |
| **T8 — P2 characterization: pure utilities** | `client/src/utils/__tests__/{alphaBlend,edgeInterpolate,previewRenderer,lightingRenderer}.test.ts` (new) · `client/src/components/Canvas/__tests__/drawingUtils.test.ts` (new) · `client/src/store/__tests__/helpers.test.ts` (new) · `client/src/components/AnchorGrid/__tests__/getAnchorPadding.test.ts` (new) · `client/src/test/canvasStub.ts` (new) | T4 (T5/T6/T7 not required — fully parallel with them) | **M** | The `gaussianFloodFill`/`isSamePixelColor` test **answers findings 01's blocking Open question 2** empirically. If it turns out the transparent-region behavior is load-bearing, W0's fix changes user-visible flood-fill behavior. Detect: `bunx vitest run --project unit` exits 0; coverage thresholds for `alphaBlend.ts` (100%) and `drawingUtils.ts` (85%) met |
| **T9 — P3 characterization: store contract harness** | `client/src/store/__tests__/storeContract.ts` (new — the `StoreHarness` interface + `createZustandHarness`) · `client/src/store/__tests__/{history,drawing,selection,layers,variants,lighting}.test.ts` (new) | T4, T8; **P2-06** (MobX design must be known before the harness interface is frozen) | **L** | The harness interface is the contract the MobX port must satisfy. If it leaks Zustand-specific shape (all 206 `EditorState` keys), the port becomes a rewrite. Assert only through `dispatch`/`getProject`/`getUiState`. **Memory:** never fill history to `MAX_HISTORY=100` with a realistic project — 6.9 MB × 100 ≈ 680 MB will OOM the worker; use a 4×4 fixture. Detect: `bunx vitest run src/store/__tests__/` exits 0 against the Zustand harness |
| **T10 — Storybook 9.1.20 install & configure** | `client/.storybook/main.ts` (new) · `client/.storybook/preview.ts` (new) · `client/package.json` (deps + `storybook`/`build-storybook`) · `client/eslint.config.js` (add `eslint-plugin-storybook`, `*.stories` override) · `.gitignore` (`client/storybook-static`) | findings 01 D3 + D4; T2 (for the stories override) | **M** | All 34 CSS files are global — stories render **unstyled** unless `preview.ts` imports both `../src/index.css` and `../src/App.css`. Detect: `bunx storybook build` exits 0 and emits `storybook-static/`; open `storybook dev` and confirm one story renders **with styles** |
| **T11 — Prettier Sweep B (remaining sources)** | `client/src/**/*.{ts,tsx,css}` · `server/src/**/*.ts` · `package.json` (root: widen `format:check` to `bunx prettier --check .`) · `.git-blame-ignore-revs` (append sweep B sha) | **After** the Canvas/FrameTimeline/AIInterpolateModal splits land (findings 03 Wave D) | **S** | Enormous diff by construction (~65 files). Mitigated by: own commit, blame-ignore entry, and `bunx tsc --noEmit` unchanged before/after. Landing it **early** would waste effort on ~1,400 lines that get deleted and would **break findings 03's duplication evidence** (the `diff <(sed -n ...)` proofs). Detect: `bunx prettier --check .` exits 0; `bunx tsc --noEmit` error count unchanged; `bunx vitest run` still green |
| **T12 — CI workflow (owner sign-off required)** | `.github/workflows/ci.yml` (new) · `README.md` (badge + the pre-push hook snippet) | findings 01 D1 (lockfiles — `--frozen-lockfile` is meaningless without them); T2, T3, T4, T10 | **S** | **Do not land before D1.** `bunfig.toml` disables lockfile writes and root has none; `--frozen-lockfile` against that either fails or installs something other than what the dev has. Also: `node` is absent locally, so a Node-based CI would test a runtime nobody uses. Detect: the workflow's own first green run |
| **T13 — Strictness ratchet A: `paths` + `noImplicitOverride` + `noPropertyAccessFromIndexSignature`** | `client/tsconfig.json` · `client/vitest.config.ts` (aliases must mirror `paths`) · whatever files the new flags break | T4 | **S** | Low — no classes exist today, so `noImplicitOverride` is free. `noPropertyAccessFromIndexSignature` may flag a handful of `uiState[k]` accesses. Detect: `bunx tsc --noEmit` exits 0 |
| **T14 — Strictness ratchet B: `verbatimModuleSyntax` + `consistent-type-imports`** | `client/tsconfig.json` · `client/eslint.config.js` (add `@typescript-eslint/consistent-type-imports`) · ~69 files in `client/src` (mechanical `import type` additions, mostly `--fix`-able) | T13, T3 (land immediately after Sweep A so the two mechanical passes are adjacent) | **M** | Touches nearly every file — same diff-noise hazard as a Prettier sweep, so it gets the same treatment: own commit, blame-ignore entry. Detect: `bunx tsc --noEmit && bunx eslint .` both exit 0 |
| **T15 — Strictness ratchet C: `noUncheckedIndexedAccess`, incrementally** | `client/tsconfig.json` (or per-directory overrides) · `client/src/types/**`, `client/src/domain/**` first · `client/src/utils/**` · `client/src/components/Canvas/render/**` **last** | **After findings 03's Wave D (Canvas split) completes** | **L** | **Several hundred new errors** expected — this codebase indexes `pixels[y][x]` in every renderer, `drawingUtils.ts`, `previewRenderer.ts`, `lightingRenderer.ts`, `edgeInterpolate.ts`, and Canvas's ~1,000-line pointer section. Enabling mid-refactor makes every split step fight it. Propose as **several sequential per-directory items**, not one. Detect: `bunx tsc --noEmit` exits 0 after each directory |
| **T16 — Primitive DOM snapshot tests (replaces visual regression)** | `client/src/ui/*/__tests__/*.test.tsx` (new — one per primitive: Modal, Button, IconButton, Slider, NumberInput, SliderWithNumber, Toggle, ConfirmDialog, ColorSwatch, Tooltip) · `client/src/ui/*/__tests__/__snapshots__/` (committed) | T4, T10, and findings 03's W8 (primitives must exist) | **M** | Snapshot churn during BEM conversion is expected and correct — each change must be reviewed, never blanket `-u`'d. Detect: `bunx vitest run --project dom` exits 0 |

**16 work items.** T1 is independent and can land immediately. T2→T3 and T4→{T5→T6→T7, T8} are the
two main chains; T8 is parallel with T5-T7. T9 needs P2-06. T11, T15 are deliberately **late**.
T12 is gated on owner sign-off. T10 and T16 are the Storybook chain.

---

## Verification

| Work item | Command(s) | Manual checks |
| --- | --- | --- |
| **T1** | `cd client && bunx tsc --noEmit; test $? -eq 2` (still 29 errors — this item changes tooling, not code) · `git status --short \| grep -q tsbuildinfo && exit 1 \|\| exit 0` · `! git ls-files --error-unmatch client/tsconfig.tsbuildinfo 2>/dev/null` | Confirm `.gitignore` now covers `client/dist`, `client/coverage`, `client/storybook-static`, `client/tsconfig.tsbuildinfo`. Confirm `bun run --cwd server start` at least *resolves* (it will still need `dist/`) |
| **T2** | `cd client && bunx eslint .` (exit 0) · `cd server && bunx eslint .` (exit 0) | **Read the first `eslint-plugin-react-hooks@7` report end to end before setting any severity.** Confirm with P2-07 that the `ui/**` glob matches its chosen directory name. Confirm `no-restricted-imports` actually fires: temporarily add `import { useEditorStore } from "../../store"` to a file under `src/ui/` and verify eslint errors |
| **T3** | `bun run format:check` (exit 0) · `cd client && bunx tsc --noEmit \| grep -c "error TS"` **must still print 29** | Inspect `git diff --stat` for the sweep commit — it should touch only the listed paths. Verify `client/lib/`, `server/src/data/`, and `__fixtures__` are untouched |
| **T4** | `cd client && bunx vitest run` (exit 0, ≥1 passing) · `cd client && bunx vitest run --project unit` and `--project dom` both exit 0 · `cd client && bunx tsc --noEmit` unchanged | Confirm the shipped test is real (imports `@/utils/alphaBlend`, asserts a computed value) — not `expect(1).toBe(1)`. Confirm `@/` resolves in **both** tsc and vitest |
| **T5** | `test "$(ls client/src/test/__fixtures__/corpus/*.json \| wc -l)" -ge 11` · `bunx prettier --check client/src/test/__fixtures__/` (exit 0 — because ignored) · `for f in client/src/test/__fixtures__/corpus/*.json; do bun -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" \|\| exit 1; done` | **Decompress every `.gz` and classify it by structural signature** (pixel type `number` vs array; `variantGroups` on object vs project; `uiState.studioMode` present). Record the signature table in the corpus README. Explicitly note which migrations have **no** real-file coverage |
| **T6** | `cd client && bunx vitest run src/types/__tests__/roundtrip.test.ts` (exit 0) **while `tsc` is still red** | R4 requires running the code and **recording what actually happens** to `lightGridMode` before asserting. Do not guess. R3's key list must be transcribed from `types/index.ts:125-195`, not from memory |
| **T7** | `cd client && bunx vitest run src/types/__tests__/migrations.test.ts` (exit 0) · `cd client && bunx vitest run src/services/__tests__/loadProject.test.ts` (exit 0) · `cd server && bunx vitest run src/__tests__/normalizePixel.test.ts` (exit 0) · idempotency assertion present for every fixture | **Each `// BUG:` comment must name the work item that will flip it.** For M6, run both implementations and record the concrete diff in the test as a comment. Review every committed snapshot by eye once — after that they are frozen and `-u` is forbidden |
| **T8** | `cd client && bunx vitest run --project unit` (exit 0) · `cd client && bunx vitest run --coverage` — the `alphaBlend.ts` (100%) and `drawingUtils.ts` (85%) thresholds must pass | **The `gaussianFloodFill` transparent-region test answers findings 01 Open question 2.** Run it, record the observed behavior, and report the answer to the owner — it determines whether W0's `drawingUtils.ts:438` fix is a no-op or a behavior change. Same for `ReferenceImagePanel.tsx:116` |
| **T9** | `cd client && bunx vitest run src/store/__tests__/` (exit 0 against `createZustandHarness`) · after the MobX port, the identical command passes with `describe.each` covering both harnesses | Confirm no test asserts on `EditorState` shape. Confirm the history-cap test uses a small fixture (grep the test for `MAX_HISTORY` and check the fixture size). Verify `flipHorizontal ∘ flipHorizontal = identity` on an **asymmetric** fixture |
| **T10** | `cd client && bunx storybook build` (exit 0) · `test -d client/storybook-static` · `cd client && bunx eslint .` still exits 0 with the stories override | `bunx storybook dev`, open one story, confirm **styles are applied** (both `index.css` and `App.css` imported in `preview.ts`). Unstyled = the import is missing |
| **T11** | `bunx prettier --check .` (exit 0) · `cd client && bunx tsc --noEmit \| grep -c "error TS"` unchanged before/after · `cd client && bunx vitest run` still exits 0 | Confirm the commit contains **only** formatting. Confirm the sha is appended to `.git-blame-ignore-revs`. Spot-check 3 files' diffs for accidental semantic change (`trailingComma` in a call, template-literal reflow) |
| **T12** | The workflow's first run on a PR, all steps green | **Owner must answer the three questions in the CI section first.** Verify `bun install --frozen-lockfile` succeeds locally in all three workspaces *before* pushing the workflow — if it fails locally it will fail in CI |
| **T13** | `cd client && bunx tsc --noEmit` (exit 0) · a test importing via `@/` passes under **both** `bunx tsc --noEmit` and `bunx vitest run` | Verify `paths` in `client/tsconfig.json` and `resolve.alias` in `client/vitest.config.ts` list **identical** keys. This is the single most likely thing to silently drift |
| **T14** | `cd client && bunx tsc --noEmit && bunx eslint .` (both exit 0) · `bunx vitest run` green | Own commit; blame-ignore entry. Verify `eslint . --fix` did the mechanical work and that no runtime import was accidentally converted to `import type` (that would be a runtime `undefined`, and tsc **will** catch it — confirm tsc ran) |
| **T15** | Per directory: `cd client && bunx tsc --noEmit` (exit 0) after each | Each directory is its own commit and its own review. Track the remaining error count per directory so the ratchet is visible. **Stop if a directory produces >100 errors** — split it further rather than pushing through |
| **T16** | `cd client && bunx vitest run --project dom` (exit 0) | Review every snapshot diff during BEM conversion by hand. `vitest -u` on this suite requires naming the class rename in the commit message |

**Universal gate**, run before and after every item:

```sh
bun run verify   # typecheck && lint && format:check && test && build
```

Red today. T1 + findings 01's D1/D2 (≡ findings 03's W0) are what make it usable.

---

## Open questions

| # | Question | Blocking? | Assumption to proceed under |
| --- | --- | --- | --- |
| 1 | **Why does findings 03 report 56 `tsc -b` errors when both `tsc -b` and `tsc --noEmit` produce byte-identical 29-error output today?** My best explanation is a stale/absent `client/tsconfig.tsbuildinfo` (which is committed to git and not gitignored) during that measurement. I could not reproduce 56 from a clean tree. | **Non-blocking** — the *conclusion* (no green baseline) is identical either way, and 29 is the reproducible number | Proceed with **29 errors, 9 real**, as verified above. Task 09 should cite 29 and treat findings 03's 56 as superseded. T1 removes the buildinfo from git so this cannot recur |
| 2 | **Which directory name does P2-07 choose for presentational components** — `src/ui/`, `src/components/ui/`, or `src/design-system/`? My ESLint `no-restricted-imports` block is keyed to `src/ui/**`. | **Blocking for T2** — the rule silently matches nothing if the glob is wrong, which is the worst possible failure mode for an architecture rule | Assume **`src/ui/`**. Task 09 **must** reconcile this document with `findings/component-taxonomy.md` before authoring the work item. Add a verification step to T2 that deliberately introduces a violation and confirms eslint errors — a rule that matches nothing looks exactly like a rule that passes |
| 3 | **Should the `paths` aliases live in `client/tsconfig.json` + `client/vitest.config.ts`, or should `vite.config.ts` get them too?** Vite currently resolves everything relatively; adding aliases only to the test config means tests and the app resolve differently. | Non-blocking — affects T4, T13 | Assume **all three** get identical aliases (`tsconfig.json` `paths`, `vitest.config.ts` `resolve.alias`, `vite.config.ts` `resolve.alias`). Three places is unfortunate; a shared `aliases.ts` imported by both configs reduces it to two. Verify by importing via `@/` in an app file, a test, and a story |
| 4 | **Is a canvas-rendering dependency (`@napi-rs/canvas` or `canvas`) acceptable?** It is **not** in findings 01's matrix, and jsdom has no canvas implementation. Without it, `ctx`-taking renderers cannot be unit-tested at all. | Non-blocking — affects T8's scope | Assume **no new dependency**. Structure the `render/*` extractions to take and return **`ImageData`-like buffers** rather than a `ctx` (which is already how findings 03 describes `renderFrameOverlay`), and assert on the `Uint8ClampedArray`. Chrome-drawing renderers (marching ants, lasso, origin cross) fall back to manual review. Revisit if that proves too restrictive |
| 5 | **Does the owner want CI?** No `.github/` exists. For a solo repo with a `bun run verify` habit, CI is defensible to skip. | **Blocking for T12 only** | Assume **yes for the duration of the refresh, with a review date**. Land it only after findings 01's D1 (lockfiles), Bun-only (no `node` on PATH), report-only rather than merge-blocking. If the owner declines, the wave gates all still work locally — nothing else depends on T12 |
| 6 | **Is `client/tsconfig.tsbuildinfo` committed deliberately?** It is tracked (`git ls-files` confirms) and not gitignored. | Non-blocking — affects T1 | Assume **accidental**. `git rm --cached` + gitignore. Trivially reversible, and it likely caused Open question 1 |
| 7 | **How much of the corpus actually covers the pre-migration formats?** 9 `.gz` archives span 01-31-2026 → 02-25-2026 plus a `07-28-2026` directory. Whether any of them predates the lighting-studio migration (M2) or the object→project variant move (M6) is unknown until they are decompressed and classified. | **Blocking for T7** — a migration with no fixture has no characterization test, only a synthetic one | Assume the corpus covers **M2 and M6** (the Jan/Feb archives predate the July work) but **not M4's `>10 base frames` edge**. T5 must classify every archive and record gaps explicitly; hand-author `synthetic-*.json` for whatever is missing and label it as such |
| 8 | **Is the `gaussianFloodFill` transparent-region behavior (the `drawingUtils.ts:438` TS2367) load-bearing?** This is findings 01's blocking Open question 2, restated. | **Blocking for W0/D2, non-blocking for me** | **T8 answers it empirically** rather than by judgement — write the test, observe, report. Proceed under findings 01's assumption (treat as a real bug) but do not fix it until T8 has recorded the current behavior |
| 9 | **Should `server/` get a Vitest config in this refresh?** It has no tests, no test script, and no ESLint packages. Only M7 (`normalizePixel`) and the export golden-file test (findings 03 W5) need one. | Non-blocking | Assume **yes, minimal** — a bare `server/vitest.config.ts` with `environment: "node"`, added as part of T7 solely to host `normalizePixel.test.ts`. Do not build out a server test harness beyond that in this refresh |
| 10 | **`max-lines: warn @ 400` — should it become `error` at some point, and when?** I set it to warn globally (error inside `ui/` only) so the gate stays green while 23 files are legitimately over. | Non-blocking | Assume the **ratchet** approach in the Wave 5 gate: track the max-lines finding count as a budget, decrement it each wave, flip to `error` only when the count reaches zero. Do not flip it during Wave D — `Canvas.tsx` at 3,062 would make the gate permanently red mid-split |
| 11 | **Does Prettier Sweep B belong before or after the CSS/BEM rewrite?** I sequenced it after findings 03's Wave D (component splits) but the CSS rewrite is P1-04's scope and its timing is not fixed here. | Non-blocking — affects T11 | Assume Sweep B runs **after both** the component splits and the BEM conversion, since all 34 CSS files are in scope for the latter. If the CSS rewrite slips past the component splits, slip Sweep B with it — the cost of waiting is zero, the cost of sweeping early is a wasted reformat of files about to be rewritten |
| 12 | **The React 19 StrictMode risk has no automated gate.** Findings 01's one caveat is ref-cleanup/double-invocation semantics across **111 `useRef` sites in 23 files**, concentrated in canvas code. jsdom cannot exercise pinch-zoom, trackpad gestures, or touch. | Non-blocking, but worth stating plainly | Assume **manual smoke test remains the only gate** for gesture and StrictMode behavior, as findings 01 concluded. Nothing in this plan changes that. The written manual checklist (visual-regression item 3) should include a StrictMode section: draw, undo/redo, layer toggle, lighting studio, timeline scrub, and pinch-zoom on **both** canvases |
