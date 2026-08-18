import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { X, Sun } from "lucide-react";
import { Icon } from "../Icon";

describe("Icon", () => {
  it("renders the default 14px icon with the icon class", () => {
    const { container } = render(<Icon icon={X} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders a custom size, class and stroke width", () => {
    const { container } = render(
      <Icon icon={Sun} size={20} className="tool-icon" strokeWidth={1.5} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
