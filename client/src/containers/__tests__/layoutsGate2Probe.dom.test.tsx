/**
 * The falsifiability probe for GATE 2 of REFRESH task 37.
 *
 * `src/ui/layouts/__tests__/layouts.dom.test.tsx` mounts every layout story
 * with no `StoreProvider` and asserts each renders. That claim is only worth
 * something if the harness would NOTICE a store dependency — otherwise the
 * whole file passes regardless of what the layouts import, exactly the failure
 * class W3 found in task 05's boundary blocks (a rule matching nothing looks
 * exactly like a rule that passes).
 *
 * This is the other half: the same `render()` with no provider, applied to a
 * component that DOES call `useStores()`. It must throw.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ WHY THIS FILE IS IN `containers/` AND NOT NEXT TO THE TEST IT SERVES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Because ESLint would not allow it next to that test. `src/ui/**` may not
 * import a store — the task-05 `no-restricted-imports` blocks apply to every
 * file under that tree, test files included — and this probe's entire purpose
 * is to import one. Measured: keeping it in `src/ui/layouts/__tests__/` failed
 * `bunx eslint .` with
 *
 *   '../../../stores/context' import is restricted from being used by a
 *   pattern. ui/ must stay pure: no store, API or MobX imports.
 *
 * That is the boundary working. `containers/` is the tier where touching a
 * store is legal, so the probe lives here and the layout test points at it.
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useStores } from "../../stores/context";

describe("GATE 2 probe — the no-provider harness detects a store dependency", () => {
  it("a component that calls useStores() DOES throw when mounted with no provider", () => {
    function StoreToucher() {
      useStores();
      return null;
    }

    // React logs the error boundary trace; silence it so a PASSING test does
    // not print a stack that reads like a failure.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => render(<StoreToucher />)).toThrow(
        /useStores must be used inside/,
      );
    } finally {
      spy.mockRestore();
    }
  });
});
