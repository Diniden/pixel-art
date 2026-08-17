import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { aliases } from "./aliases";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: aliases,
  },
  test: {
    globals: true,
    // ── Two projects, deliberately ────────────────────────────────────────
    //
    // `unit` is the fast lane: node environment, no jsdom. Serialization, the
    // 8 schema migrations, pure utilities and store-behaviour tests live here.
    // `dom` pays the jsdom cost and is only for component render tests and
    // primitive DOM snapshots.
    projects: [
      {
        plugins: [react()],
        resolve: { alias: aliases },
        test: {
          name: "unit",
          globals: true,
          environment: "node",
          // setup.msw.ts (task 15) starts the MSW server for the whole lane
          // with `onUnhandledRequest: "error"` — no unit test may hit a real
          // network. Tests that stub `fetch` themselves simply bypass it.
          setupFiles: ["./src/test/setup.unit.ts", "./src/test/setup.msw.ts"],
          include: [
            "src/**/__tests__/**/*.test.{ts,tsx}",
            "src/**/*.test.{ts,tsx}",
          ],
          exclude: [
            "**/node_modules/**",
            "**/dist/**",
            "src/**/*.dom.test.{ts,tsx}",
            "src/**/__tests__/dom/**",
          ],
        },
      },
      {
        plugins: [react()],
        resolve: { alias: aliases },
        test: {
          name: "dom",
          globals: true,
          environment: "jsdom",
          setupFiles: ["./src/test/setup.dom.ts"],
          include: [
            "src/**/*.dom.test.{ts,tsx}",
            "src/**/__tests__/dom/**/*.test.{ts,tsx}",
          ],
          exclude: ["**/node_modules/**", "**/dist/**"],
        },
      },
    ],
    coverage: {
      // ⚠️ MEASURED 2026-08-16 (task 06): `provider: "v8"` CANNOT RUN HERE.
      // `@vitest/coverage-v8` imports `node:inspector`, which Bun has not
      // implemented (oven-sh/bun#2445), so `bunx vitest run --coverage` dies
      // with `NotImplementedError` before a single test executes. `node` is not
      // on PATH, so there is no runtime that could use the v8 provider.
      // Task 06's spec named the v8 package; istanbul is the only provider that
      // works under Bun. `@vitest/coverage-v8@3.2.7` is left installed (the
      // spec pinned it, and it becomes usable the moment Bun ships the module)
      // but it is NOT the configured provider.
      provider: "istanbul",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/__tests__/**",
        "src/test/**",
        "src/vite-env.d.ts",
        "src/main.tsx",
      ],
      // ── Per-path thresholds only. NO global threshold. ──────────────────
      //
      // A single global number over a codebase containing a 3,062-line
      // untested Canvas.tsx is either so low it never fails or so high it
      // blocks every commit. Gate only the paths where a silent regression
      // corrupts the owner's real project data.
      //
      // ⚠️ These are set AT TARGET, per task 06's instruction to choose the
      // second option. `bunx vitest run --coverage` therefore FAILS until
      // task 07 lands the characterisation tests. That is deliberate and
      // documented, so the numbers are never quietly forgotten. Plain
      // `bunx vitest run` (no `--coverage`) is unaffected and exits 0.
      thresholds: {
        "src/types/**": {
          statements: 90,
          functions: 95,
        },
        "src/utils/alphaBlend.ts": {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        "src/components/Canvas/drawingUtils.ts": {
          statements: 85,
        },
      },
    },
  },
});
