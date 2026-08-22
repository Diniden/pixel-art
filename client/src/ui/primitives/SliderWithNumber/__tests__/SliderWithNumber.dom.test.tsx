import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SliderWithNumber } from "../SliderWithNumber";

describe("SliderWithNumber", () => {
  it("renders the labelled row", () => {
    const { container } = render(
      <SliderWithNumber
        label="R"
        value={128}
        min={0}
        max={255}
        onChange={() => {}}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders the thick muted variant with boxed input", () => {
    const { container } = render(
      <SliderWithNumber
        label="Intensity"
        labelMuted
        thick
        value={60}
        onChange={() => {}}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders without a label", () => {
    const { container } = render(
      <SliderWithNumber value={10} onChange={() => {}} name="Opacity" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("both controls drive the same onChange", () => {
    const onChange = vi.fn();
    render(
      <SliderWithNumber
        label="R"
        value={128}
        min={0}
        max={255}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole("slider"), { target: { value: "200" } });
    expect(onChange).toHaveBeenCalledWith(200);
  });
});
