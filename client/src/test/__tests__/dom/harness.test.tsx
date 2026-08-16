import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

/**
 * Smoke test for the `dom` project.
 *
 * Deliberately minimal: it proves the jsdom environment boots, that React 19
 * renders through `@testing-library/react@16`, that `@testing-library/dom` is
 * resolvable (RTL 16 no longer bundles it), that the `jest-dom` matchers from
 * `setup.dom.ts` are registered, and that `user-event` can drive an
 * interaction. Component tests belong with their components, not here.
 *
 * Without at least one file matching the `dom` project's `include` globs,
 * `vitest run --project dom` exits 1 with "No test files found" — so this file
 * is also what makes the two-project split verifiable.
 */
function Counter() {
  const [n, setN] = useState(0);
  return (
    <div>
      <span data-testid="count">{n}</span>
      <button type="button" onClick={() => setN((v) => v + 1)}>
        increment
      </button>
    </div>
  );
}

describe("dom harness", () => {
  it("runs in a jsdom environment", () => {
    expect(typeof document).toBe("object");
    expect(document.createElement("div")).toBeInstanceOf(HTMLElement);
  });

  it("renders React 19 and exposes jest-dom matchers", () => {
    render(<Counter />);
    // `toBeInTheDocument` comes from setup.dom.ts; if the setup file were not
    // wired up this line would be a TypeError, not a soft failure.
    expect(screen.getByTestId("count")).toBeInTheDocument();
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });

  it("drives an interaction with user-event", async () => {
    const user = userEvent.setup();
    render(<Counter />);
    await user.click(screen.getByRole("button", { name: "increment" }));
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });
});
