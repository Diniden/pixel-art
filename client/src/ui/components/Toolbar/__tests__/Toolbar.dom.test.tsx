/**
 * `Toolbar` — docking and spread.
 *
 * ⚠️ WHAT THIS PINS: the class list is the whole mechanism. `--vertical`
 * re-flows the bar into a column, and `--spread-N` sets `--toolbar-lines`,
 * which EACH TOOL GROUP reads to cluster itself into N rows (or N columns
 * when vertical). Spread applies per GROUP, not to the bar — an earlier
 * version wrapped the whole toolbar and let one group be split across a line
 * break, which is not what a group is for.
 *
 * Spread 1 carries NO modifier, so the default bar's markup is byte-for-byte
 * what it always was — the property that keeps this from changing anyone's
 * existing layout.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Toolbar } from "../Toolbar";

const base = {
  studioMode: "pixel" as const,
  isFocusMode: false,
  isLightGrid: false,
  isFrameReferenceVisible: true,
  onSetStudioMode: () => {},
  onToggleFocusMode: () => {},
  onToggleLightGridMode: () => {},
  onToggleFrameReferencePanelVisible: () => {},
  pixelStudioTools: <div data-testid="pixel-tools" />,
  lightingStudioTools: <div data-testid="lighting-tools" />,
};

const bar = (c: HTMLElement) => c.querySelector(".toolbar")!;

describe("edge docking", () => {
  it("defaults to the top, horizontal, with no spread modifier", () => {
    const { container } = render(<Toolbar {...base} />);
    expect(bar(container).className).toBe("toolbar toolbar--top");
  });

  it("⭐ left and right add --vertical; top and bottom do not", () => {
    for (const edge of ["left", "right"] as const) {
      const { container } = render(<Toolbar {...base} edge={edge} />);
      expect(bar(container).className).toContain("toolbar--vertical");
      expect(bar(container).className).toContain(`toolbar--${edge}`);
    }
    for (const edge of ["top", "bottom"] as const) {
      const { container } = render(<Toolbar {...base} edge={edge} />);
      expect(bar(container).className).not.toContain("toolbar--vertical");
    }
  });
});

describe("spread", () => {
  it("⭐ spread 1 adds NOTHING — the historical bar is untouched", () => {
    const { container } = render(<Toolbar {...base} spread={1} />);
    expect(bar(container).className).not.toContain("toolbar--spread");
  });

  it("adds the modifier for 2 and 3", () => {
    for (const spread of [2, 3] as const) {
      const { container } = render(<Toolbar {...base} spread={spread} />);
      expect(bar(container).className).toContain(`toolbar--spread-${spread}`);
    }
  });

  it("composes with a vertical dock — spread means COLUMNS there", () => {
    const { container } = render(<Toolbar {...base} edge="left" spread={3} />);
    const cls = bar(container).className;
    expect(cls).toContain("toolbar--vertical");
    expect(cls).toContain("toolbar--spread-3");
  });

  it("⭐ the modifier sits on the BAR, and the groups are what cluster", () => {
    // The bar carries the count; each `toolbar__group` reads it and wraps
    // itself. The groups' own markup is unchanged by spread — a group must
    // never be split across a line break, which is what wrapping the bar
    // itself used to allow.
    const { container } = render(<Toolbar {...base} spread={2} />);
    expect(bar(container).className).toContain("toolbar--spread-2");

    const groups = container.querySelectorAll(".toolbar__group");
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(g.className).not.toContain("spread");
    }
  });
});

describe("the studio switcher", () => {
  it("renders all three studio buttons whatever the dock", () => {
    // They stack via CSS when vertical; the markup is the same either way.
    // Three since brush-studio task 03 (pixel, lighting, brush).
    for (const edge of ["top", "left"] as const) {
      const { container } = render(<Toolbar {...base} edge={edge} />);
      expect(
        container.querySelectorAll(".toolbar__studio-mode-btn"),
      ).toHaveLength(3);
      expect(
        container.querySelector(".toolbar__studio-mode-toggle"),
      ).not.toBeNull();
    }
  });

  it("shows the tools for the active studio only", () => {
    // ⚠️ Queried through each render's OWN container. `queryByTestId`
    // searches the whole document, and both renders stay mounted for the
    // duration of the test — so the document-wide query finds the other
    // toolbar's tools and the assertion passes or fails for the wrong reason.
    const pixel = render(<Toolbar {...base} />).container;
    expect(pixel.querySelector("[data-testid=pixel-tools]")).not.toBeNull();
    expect(pixel.querySelector("[data-testid=lighting-tools]")).toBeNull();

    const lighting = render(
      <Toolbar {...base} studioMode="lighting" />,
    ).container;
    expect(
      lighting.querySelector("[data-testid=lighting-tools]"),
    ).not.toBeNull();
    expect(lighting.querySelector("[data-testid=pixel-tools]")).toBeNull();
  });
});
