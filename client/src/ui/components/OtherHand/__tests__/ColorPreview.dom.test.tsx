/**
 * ColorPreview — the composed-colour square at the top of the Other Hand rail.
 *
 * Reported 2026-08-31: the colour sections drive three or four INDEPENDENT
 * channel sliders, so the rail could show every component of a colour and
 * never the colour itself. These pin the square that closes that gap.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ColorPreview } from "../ColorPreview";

afterEach(cleanup);

/** The painted layer — the one carrying the composed rgba().
 *
 * ⚠️ jsdom normalises a FULLY OPAQUE `rgba(r, g, b, 1)` back to `rgb(r, g, b)`
 * when reading it off `style.background`, so the opaque expectations below are
 * written in that form. The component always writes `rgba()`; this is the
 * reader's normalisation, not a difference in what is painted. */
function chipColor(container: HTMLElement, i = 0) {
  const el = container.querySelectorAll(".other-hand__preview-color")[i];
  return (el as HTMLElement).style.background;
}

describe("the composed colour", () => {
  it("⭐ paints the ACTUAL colour, not a channel", () => {
    // The whole point: three sliders each show one channel; this shows what
    // they add up to.
    const { container } = render(
      <ColorPreview colors={[{ r: 255, g: 128, b: 0 }]} />,
    );
    expect(chipColor(container)).toBe("rgb(255, 128, 0)");
  });

  it("⭐ renders alpha as translucency over a checkerboard", () => {
    // A half-alpha colour must not read as a darker opaque colour, which is
    // exactly what it would do without the checkerboard behind it.
    const { container } = render(
      <ColorPreview colors={[{ r: 0, g: 0, b: 255, a: 128 }]} />,
    );
    // jsdom rounds the serialised alpha to 3 decimals (128/255 = 0.50196…).
    expect(chipColor(container)).toBe("rgba(0, 0, 255, 0.502)");
    expect(container.querySelector(".other-hand__preview-bg")).toBeTruthy();
  });

  it("defaults alpha to fully opaque", () => {
    const { container } = render(<ColorPreview colors={[{ r: 1, g: 2, b: 3 }]} />);
    expect(chipColor(container)).toBe("rgb(1, 2, 3)");
  });

  it("renders nothing at all for an empty list", () => {
    const { container } = render(<ColorPreview colors={[]} />);
    expect(container.querySelector(".other-hand__previews")).toBeNull();
  });
});

describe("⭐ it is a READOUT, never a control", () => {
  it("renders no button, and nothing focusable", () => {
    // In Other Hand Mode the thumb works by feel on a rail it is not looking
    // at. A square that looks tappable but does nothing costs a misplaced tap.
    const { container } = render(
      <ColorPreview colors={[{ r: 10, g: 20, b: 30 }]} />,
    );
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("[tabindex]")).toBeNull();
    expect(container.querySelector("[aria-pressed]")).toBeNull();
  });

  it("announces itself as an image with the hex value", () => {
    render(<ColorPreview colors={[{ r: 255, g: 128, b: 0 }]} />);
    expect(screen.getByRole("img", { name: "Selected colour: #ff8000" })).toBeTruthy();
  });

  it("announces opacity only when alpha is actually doing something", () => {
    const { rerender } = render(
      <ColorPreview colors={[{ r: 0, g: 0, b: 0, a: 255 }]} />,
    );
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Selected colour: #000000",
    );

    rerender(<ColorPreview colors={[{ r: 0, g: 0, b: 0, a: 51 }]} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Selected colour: #000000, 20% opaque",
    );
  });
});

describe("more than one colour", () => {
  it("⭐ labels each square, so Light is distinguishable from Ambient", () => {
    // The light section's sliders drive two colours. Unlabelled, the pair
    // would be a guess.
    const { container } = render(
      <ColorPreview
        colors={[
          { r: 255, g: 255, b: 255, label: "Light" },
          { r: 32, g: 32, b: 64, label: "Amb" },
        ]}
      />,
    );
    expect(chipColor(container, 0)).toBe("rgb(255, 255, 255)");
    expect(chipColor(container, 1)).toBe("rgb(32, 32, 64)");

    expect(screen.getByRole("img", { name: "Light: #ffffff" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Amb: #202040" })).toBeTruthy();

    const labels = [...container.querySelectorAll(".other-hand__preview-label")];
    expect(labels.map((l) => l.textContent)).toEqual(["Light", "Amb"]);
  });

  it("omits the label element entirely for a single unlabelled colour", () => {
    const { container } = render(
      <ColorPreview colors={[{ r: 0, g: 0, b: 0 }]} />,
    );
    expect(container.querySelector(".other-hand__preview-label")).toBeNull();
  });
});

describe("the hex in the accessible name", () => {
  it("zero-pads each channel to two digits", () => {
    // Asserted through the rendered label rather than by importing the
    // helper: `react-refresh/only-export-components` keeps it file-local.
    for (const [rgb, hex] of [
      [[0, 0, 0], "#000000"],
      [[255, 255, 255], "#ffffff"],
      [[1, 2, 3], "#010203"],
    ] as const) {
      const { unmount } = render(
        <ColorPreview colors={[{ r: rgb[0], g: rgb[1], b: rgb[2] }]} />,
      );
      expect(
        screen.getByRole("img", { name: `Selected colour: ${hex}` }),
      ).toBeTruthy();
      unmount();
    }
  });
});
