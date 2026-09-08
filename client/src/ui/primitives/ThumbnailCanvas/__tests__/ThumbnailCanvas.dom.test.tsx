import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ThumbnailCanvas } from "../ThumbnailCanvas";
import {
  MAX_THUMBNAIL_SIZE,
  clearThumbnailCache,
  thumbnailCacheKey,
} from "../../../canvas/thumbnailCache";

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
      <ThumbnailCanvas
        revision={1}
        size={96}
        draw={() => {}}
        label="Frame 3 preview"
      />,
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

/**
 * The `cacheKey` opt-in. jsdom has no canvas, so a stub context is installed:
 * what is asserted is that a SECOND mount with the same key does not re-run
 * `draw`, which is the whole point of the shared LRU — the siderail and the
 * timeline show the same layers and must not each walk the pixel grid.
 */
describe("ThumbnailCanvas cacheKey", () => {
  const original = HTMLCanvasElement.prototype.getContext;

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = original;
    clearThumbnailCache();
  });

  function stubContext() {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    })) as unknown as typeof original;
  }

  it("a second mount with the same key does not re-run draw", () => {
    stubContext();
    clearThumbnailCache();
    const draw = vi.fn();
    const key = thumbnailCacheKey("layer-1", 7, 32);

    render(
      <ThumbnailCanvas revision={7} size={32} cacheKey={key} draw={draw} />,
    );
    expect(draw).toHaveBeenCalledTimes(1);

    // A separate component instance — the effect re-fires on mount, and only
    // the cache can stop the repaint.
    render(
      <ThumbnailCanvas revision={7} size={32} cacheKey={key} draw={draw} />,
    );
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it("without a cacheKey, each mount repaints", () => {
    stubContext();
    const draw = vi.fn();
    render(<ThumbnailCanvas revision={7} size={32} draw={draw} />);
    render(<ThumbnailCanvas revision={7} size={32} draw={draw} />);
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it("clamps an over-large size onto the canvas element itself", () => {
    const { container } = render(
      <ThumbnailCanvas revision={1} size={4096} draw={() => {}} />,
    );
    const canvas = container.querySelector("canvas");
    expect(canvas?.getAttribute("width")).toBe(String(MAX_THUMBNAIL_SIZE));
  });
});
