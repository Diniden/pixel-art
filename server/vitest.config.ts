import { defineConfig } from "vitest/config";

/**
 * Bare server test harness.
 *
 * Deliberately minimal (task 06): it exists solely so later tasks — the
 * server-side migration test in particular — have somewhere to put a file. Do
 * not build this out further during the refresh.
 *
 * `passWithNoTests` is on because there are no server tests yet and
 * `bunx vitest run` must still exit 0; remove it once real tests land.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "src/data/**"],
    passWithNoTests: true,
  },
});
