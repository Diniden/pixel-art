import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dropdown } from "../Dropdown";

const options = [
  { value: "frames", label: "Frames" },
  { value: "timeline", label: "Timeline" },
  { value: "variant", label: "Variant" },
] as const;

describe("Dropdown", () => {
  it("renders the closed trigger", () => {
    const { container } = render(
      <Dropdown
        options={options}
        value="frames"
        onChange={() => {}}
        label="View mode"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders the open listbox with the selected option", async () => {
    const { container } = render(
      <Dropdown
        options={options}
        value="timeline"
        onChange={() => {}}
        label="View mode"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "View mode" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders disabled", () => {
    const { container } = render(
      <Dropdown
        options={options}
        value="frames"
        onChange={() => {}}
        label="View mode"
        disabled
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("keyboard: opens with ArrowDown, navigates, commits with Enter", async () => {
    const onChange = vi.fn();
    render(
      <Dropdown
        options={options}
        value="frames"
        onChange={onChange}
        label="View mode"
      />,
    );
    const trigger = screen.getByRole("button", { name: "View mode" });
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("timeline");
    // Menu closed and the trigger holds focus again.
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
