import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { EmptyState } from "../EmptyState";

describe("EmptyState", () => {
  it("renders text only", () => {
    const { container } = render(<EmptyState>No layers yet.</EmptyState>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders with an icon", () => {
    const { container } = render(
      <EmptyState icon={<svg data-testid="icon" />}>
        No palettes saved.
      </EmptyState>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
