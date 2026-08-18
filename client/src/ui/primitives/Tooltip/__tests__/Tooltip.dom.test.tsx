import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tooltip } from "../Tooltip";

let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  host.remove();
});

describe("Tooltip", () => {
  it("renders only the trigger while hidden", () => {
    const { container } = render(
      <Tooltip content="Focus Mode (`)" container={host}>
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    expect(container.firstChild).toMatchSnapshot();
    expect(host.firstChild).toBeNull();
  });

  it("shows the bubble on hover and snapshots it", async () => {
    render(
      <Tooltip content="Focus Mode (`)" container={host}>
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    await userEvent.hover(screen.getByRole("button", { name: "Trigger" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Focus Mode (`)");
    expect(host.firstChild).toMatchSnapshot();
  });

  it("shows on keyboard focus and hides on Escape (manual check 6 / WCAG 1.4.13)", async () => {
    render(
      <Tooltip content="Delete layer" container={host}>
        <button type="button">Trigger</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole("button", { name: "Trigger" });
    await userEvent.tab();
    expect(trigger).toHaveFocus();
    const tooltip = screen.getByRole("tooltip");
    expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
