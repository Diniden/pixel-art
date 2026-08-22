import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumberInput } from "../NumberInput";

describe("NumberInput", () => {
  it("renders the slider__input styling", () => {
    const { container } = render(
      <NumberInput
        value={12}
        min={1}
        max={60}
        onChange={() => {}}
        label="FPS"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders the boxed variant", () => {
    const { container } = render(
      <NumberInput
        value={5}
        min={0}
        max={10}
        boxed
        onChange={() => {}}
        label="Radius"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("clamps on Enter — the duplicated FPS clamp, centralised", async () => {
    const onChange = vi.fn();
    render(
      <NumberInput
        value={12}
        min={1}
        max={60}
        onChange={onChange}
        label="FPS"
      />,
    );
    const input = screen.getByRole("spinbutton", { name: "FPS" });
    await userEvent.clear(input);
    await userEvent.type(input, "999{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(60);
  });

  it("clamps on blur", async () => {
    const onChange = vi.fn();
    render(
      <NumberInput
        value={12}
        min={1}
        max={60}
        onChange={onChange}
        label="FPS"
      />,
    );
    const input = screen.getByRole("spinbutton", { name: "FPS" });
    await userEvent.clear(input);
    await userEvent.type(input, "0");
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith(1);
  });
});
