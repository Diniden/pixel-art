import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ColorSwatch } from "../ColorSwatch";

describe("ColorSwatch", () => {
  it("renders an opaque colour with hex name", () => {
    const { container } = render(<ColorSwatch r={0} g={217} b={255} />);
    expect(screen.getByRole("button", { name: "#00d9ff" })).toBeInTheDocument();
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders a translucent colour, selected, custom size", () => {
    const { container } = render(
      <ColorSwatch r={255} g={51} b={102} a={128} selected size={28} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders with a label override", () => {
    const { container } = render(
      <ColorSwatch r={16} g={185} b={129} label="Grass green" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
