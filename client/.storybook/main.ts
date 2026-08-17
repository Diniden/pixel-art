import type { StorybookConfig } from "@storybook/react-vite";

/**
 * ⚠️ MEASURED 2026-08-16 (task 10): `storybook dev` DOES NOT RUN IN THIS REPO.
 * `storybook build` does. This is a real, reproducible incompatibility between
 * Storybook 9.1.20 and the standing no-lockfile policy — not a misconfiguration.
 *
 * `storybook dev` calls `JsPackageManagerFactory.getPackageManagerType()`, which
 * detects the package manager LOCKFILE-FIRST. Reading the shipped
 * `node_modules/storybook/dist/common/index.cjs`, it returns `"bun"` only when
 * `bun.lock` or `bun.lockb` is present. This repo deliberately has NO lockfile
 * of any kind (owner policy; `bunfig.toml` sets `[install.lockfile] save=false`).
 * It then falls back to `inferPackageManagerFromUserAgent()`, which recognises
 * only pnpm/npm/yarn — never bun — then to `hasNPM()`, and `npm` is not on
 * PATH. So it throws:
 *
 *     Error: Unable to find a usable package manager within NPM, PNPM, Yarn and Yarn 2
 *
 * `--preview-only` hits the same path and fails identically. There is a `force`
 * option on `getPackageManager()` but no CLI flag or env var exposing it for
 * `dev`.
 *
 * ⛔ THE FIX IS NOT TO CREATE A LOCKFILE. That would regress the highest-standing
 * project policy to gain a dev-server convenience.
 *
 * ✅ WORKING REVIEW PATH — build, then serve the static output:
 *
 *     bunx storybook build
 *     bunx vite preview --outDir storybook-static --port 6006
 *
 * Verified: manager, iframe, `index.json` (all 7 stories) and the `staticDirs`
 * favicon all return HTTP 200 that way. `bun run storybook` is wired to exactly
 * this pair. The loss versus `dev` is hot-reload, not fidelity — the built
 * preview is the same bundle, so it is a valid visual baseline.
 */

/**
 * Storybook 9.1.20 — NOT 10.x.
 *
 * `@storybook/react-vite@9.1.20` peers `vite ^5 || ^6 || ^7`, which is exactly
 * the Vite 7.3.6 this workspace runs. Storybook 10 adds a `vite-plus` peer and
 * moves its `react-vite` peer set. `storybook`, `@storybook/react-vite`,
 * `@storybook/addon-a11y`, `@storybook/addon-docs` and `eslint-plugin-storybook`
 * are all pinned to 9.1.20 and must be bumped together.
 *
 * Vite config (including the `@`, `@ui`, `@stores`, `@api`, `@test` aliases from
 * `aliases.ts`) is picked up automatically by the react-vite builder from
 * `../vite.config.ts`, so aliases are NOT re-declared here.
 *
 * ⚠️ NO visual-regression service is installed — not Chromatic, not
 * `@storybook/test-runner`, not `@storybook/addon-vitest`, not Playwright.
 * Both were evaluated and rejected on measured grounds (MASTER.md §9.10):
 * Chromatic needs a paid plan plus CI that does not exist here, and the
 * test-runner needs a ~300 MB Playwright browser download. The substitutes are
 * human review against this baseline, primitive DOM snapshot tests, and the
 * canvas pixel-hash helper. This is a re-evaluation point, not a permanent no.
 */
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],

  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],

  framework: {
    name: "@storybook/react-vite",
    options: {},
  },

  // `client/public` holds favicon.svg and any future asset a story references
  // by absolute path, exactly as the Vite dev server serves it.
  staticDirs: ["../public"],
};

export default config;
