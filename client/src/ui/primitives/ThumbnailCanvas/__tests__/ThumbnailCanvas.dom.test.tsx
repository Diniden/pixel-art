import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ThumbnailCanvas } from "../ThumbnailCanvas";

/**
 * jsdom has no canvas implementation; getContext returns null, so `draw`
 * is never invoked here (the paint path is exercised by the Storybook
 * story). What IS testable: the DOM contract and the revision-gated memo.
 */
describe("ThumbnailCanvas", () => {
  it("renders decorative by default", () => {
    const { container } = render(
      <ThumbnailCanvas revision={1} draw={() => {}} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("renders labelled as an image with custom size", () => {
    const { container } = render(
      <ThumbnailCanvas revision={1} size={96} draw={() => {}} label="Frame 3 preview" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it("repaint effect is keyed on revision, not draw identity", () => {
    const getContext = vi.fn(() => null);
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext =
      getContext as unknown as typeof original;
    try {
      const { rerender } = render(
        <ThumbnailCanvas revision={1} draw={() => {}} />,
      );
      expect(getContext).toHaveBeenCalledTimes(1);
      // New draw closure, same revision: memo blocks the re-render entirely.
      rerender(<ThumbnailCanvas revision={1} draw={() => {}} />);
      expect(getContext).toHaveBeenCalledTimes(1);
      // Revision bump: repaint (manual check 7's automatable half).
      rerender(<ThumbnailCanvas revision={2} draw={() => {}} />);
      expect(getContext).toHaveBeenCalledTimes(2);
    } finally {
      HTMLCanvasElement.prototype.getContext = original;
    }
  });
});
