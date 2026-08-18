import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toggle } from "../Toggle";

describe("Toggle", () => {
  it("renders unchecked with a visible label", () => {
    const { container } = render(
      <Toggle checked={false} onChange={() => {}} label="Move all layers" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders checked and disabled", () => {
    const { container } = render(
      <Toggle checked disabled onChange={() => {}} label="Locked" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders unlabelled with an aria-label", () => {
    const { container } = render(
      <Toggle checked={false} onChange={() => {}} ariaLabel="Layer visibility" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("is keyboard-operable: Tab reaches it, Space flips it (manual check 5)", async () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Colors" />);
    const input = screen.getByRole("switch", { name: "Colors" });
    await userEvent.tab();
    expect(input).toHaveFocus();
    await userEvent.keyboard(" ");
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
