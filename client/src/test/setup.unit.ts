/**
 * Setup for the `unit` project (node environment, no DOM).
 *
 * Intentionally minimal: this lane exists to be fast. It runs serialization,
 * the 8 schema migrations, pure utilities and plain-store behaviour tests, none
 * of which need a document. Anything requiring a DOM belongs in the `dom`
 * project instead — do not add jsdom shims here.
 */
import { afterEach, vi } from "vitest";

afterEach(() => {
  // Keep spies/stubs from leaking between test files in a shared worker.
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
