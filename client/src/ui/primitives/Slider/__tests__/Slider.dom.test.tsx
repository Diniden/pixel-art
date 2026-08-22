import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Slider } from "../Slider";

describe("Slider", () => {
  it("renders the base track", () => {
    const { container } = render(
      <Slider value={40} onChange={() => {}} label="Opacity" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders the thick variant", () => {
    const { container } = render(
      <Slider
        value={60}
        min={0}
        max={200}
        step={5}
        thick
        onChange={() => {}}
        label="Intensity"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders the hue track", () => {
    const { container } = render(
      <Slider value={180} max={360} hue onChange={() => {}} label="Hue" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("reports the parsed number", () => {
    const onChange = vi.fn();
    render(<Slider value={40} onChange={onChange} label="Opacity" />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "55" } });
    expect(onChange).toHaveBeenCalledWith(55);
  });
});
