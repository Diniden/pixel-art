import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { X, Trash2 } from "lucide-react";
import { IconButton } from "../IconButton";

describe("IconButton", () => {
  it("renders with a required accessible name", () => {
    const { container } = render(<IconButton icon={X} label="Close" />);
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders as the modal close control", () => {
    const { container } = render(
      <IconButton icon={X} label="Close" className="modal__close" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders a custom size and explicit title", () => {
    const { container } = render(
      <IconButton icon={Trash2} label="Delete layer" title="Delete" size={16} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
