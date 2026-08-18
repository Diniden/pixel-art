import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Badge } from "../Badge";

describe("Badge", () => {
  it("renders selected (default green, decorative)", () => {
    const { container } = render(<Badge variant="selected">✓</Badge>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders selected violet with an accessible name", () => {
    const { container } = render(
      <Badge variant="selected" tone="violet" ariaLabel="Selected" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders the current pill", () => {
    const { container } = render(<Badge variant="current">Current</Badge>);
    expect(container.firstChild).toMatchSnapshot();
  });
});
