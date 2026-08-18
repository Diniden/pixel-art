import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "../Field";

describe("Field", () => {
  it("renders label wired to the control by generated id", () => {
    const { container } = render(
      <Field label="Width">
        <input type="text" />
      </Field>,
    );
    const input = screen.getByLabelText("Width");
    expect(input).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders a hint via aria-describedby", () => {
    const { container } = render(
      <Field label="Width" hint="1-512 pixels.">
        <input type="text" />
      </Field>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders an error: aria-invalid + error hint, inline layout", () => {
    const { container } = render(
      <Field label="Width" error="Out of range." inline>
        <input type="text" />
      </Field>,
    );
    expect(screen.getByLabelText("Width")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
