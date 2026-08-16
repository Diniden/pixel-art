/**
 * Setup for the `dom` project (jsdom environment).
 *
 * Adds the `@testing-library/jest-dom` matchers (`toBeInTheDocument`,
 * `toHaveAttribute`, …) to Vitest's `expect`, and unmounts every React tree
 * between tests so a leaked component cannot affect the next one.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
