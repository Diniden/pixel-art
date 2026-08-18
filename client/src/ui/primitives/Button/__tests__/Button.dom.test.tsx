import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Button } from "../Button";

/**
 * DOM snapshots — the deliberate substitute for visual-regression tooling
 * (MASTER.md §9.10). A BEM rename IS a DOM structure change; catching it on
 * the primitive catches it for every adopter at once.
 */
describe("Button", () => {
  it("renders the bare block", () => {
    const { container } = render(<Button>Save</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders variant + size modifiers", () => {
    const { container } = render(
      <Button variant="primary" size="lg">
        Confirm
      </Button>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders danger-outline disabled", () => {
    // className passthrough is exercised by IconButton's modal__close test;
    // an invented class here would trip check-classes.mjs's missing audit.
    const { container } = render(
      <Button variant="danger-outline" disabled>
        Delete
      </Button>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
