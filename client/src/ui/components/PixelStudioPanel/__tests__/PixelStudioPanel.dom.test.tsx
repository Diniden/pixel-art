/**
 * PixelStudioPanel — the Brush section (pixel-brush task 04).
 *
 * The panel is pure, so it mounts with no provider and stub callbacks. What
 * is pinned:
 *  - The section is gated on BOTH `selectedTool === "brush"` AND a `pixelBrush`
 *    prop: a pencil with brush info draws nothing, and a brush tool with no
 *    info (every pre-existing caller) draws nothing and does not throw.
 *  - The loaded state names the project, size, frame `(index+1/count)` and
 *    layer count; each of `idle` / `loading` / `failed` shows its own message.
 *  - "Open Brush Studio" fires `onOpenBrushStudio` exactly once per click.
 *  - The colour picker element is rendered for the brush tool AND the pencil
 *    (MASTER §1: "the color picker available in the side rail" is satisfied by
 *    the picker being unconditional — this test is what keeps it so).
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import {
  PixelStudioPanel,
  type PixelStudioBrushInfo,
} from "../PixelStudioPanel";

const COLOR_PICKER_ID = "color-picker-stub";
const PALETTE_ID = "palette-manager-stub";

function baseProps(selectedTool: string) {
  return {
    selectedTool,
    brushSize: 1,
    eraserShape: "square" as const,
    pencilBrushShape: undefined,
    pencilBrushMax: undefined,
    eraserBrushSize: 1,
    eraserBrushMax: 16 as const,
    originColor: { r: 255, g: 0, b: 0, a: 255 },
    originPos: null,
    onBrushSizeChange: vi.fn(),
    onEraserShapeChange: vi.fn(),
    onPencilBrushShapeChange: vi.fn(),
    onPencilBrushMaxChange: vi.fn(),
    onEraserBrushSizeChange: vi.fn(),
    onEraserBrushMaxChange: vi.fn(),
    onOriginColorChange: vi.fn(),
    colorPicker: <div data-testid={COLOR_PICKER_ID} />,
    paletteManager: <div data-testid={PALETTE_ID} />,
  };
}

function loadedBrush(
  overrides: Partial<PixelStudioBrushInfo> = {},
): PixelStudioBrushInfo {
  return {
    loadState: "loaded",
    brushName: "soft-round",
    width: 8,
    height: 6,
    frameName: "Frame B",
    frameIndex: 1,
    frameCount: 3,
    layerCount: 4,
    onOpenBrushStudio: vi.fn(),
    ...overrides,
  };
}

function emptyBrush(
  loadState: PixelStudioBrushInfo["loadState"],
): PixelStudioBrushInfo {
  return {
    loadState,
    brushName: null,
    width: null,
    height: null,
    frameName: null,
    frameIndex: null,
    frameCount: 0,
    layerCount: 0,
    onOpenBrushStudio: vi.fn(),
  };
}

function sectionTitles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".panel__title")).map(
    (el) => el.textContent ?? "",
  );
}

function brushSection(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(".pixel-studio-panel__brush");
}

describe("PixelStudioPanel — Brush section gating", () => {
  it("(a) selectedTool=pixel with a pixelBrush prop renders no Brush section", () => {
    const { container } = render(
      <PixelStudioPanel {...baseProps("pixel")} pixelBrush={loadedBrush()} />,
    );
    expect(sectionTitles(container)).toEqual(["Pencil"]);
    expect(brushSection(container)).toBeNull();
    expect(container.textContent).not.toContain("Open Brush Studio");
  });

  it("(b) selectedTool=brush with no pixelBrush prop renders nothing and does not throw", () => {
    let container: HTMLElement | undefined;
    expect(() => {
      ({ container } = render(<PixelStudioPanel {...baseProps("brush")} />));
    }).not.toThrow();
    expect(sectionTitles(container!)).toEqual([]);
    expect(brushSection(container!)).toBeNull();
    expect(
      container!.querySelectorAll(".pixel-studio-panel__section"),
    ).toHaveLength(0);
  });

  it("selectedTool=brush with a pixelBrush prop renders exactly one section titled Brush", () => {
    const { container } = render(
      <PixelStudioPanel {...baseProps("brush")} pixelBrush={loadedBrush()} />,
    );
    expect(sectionTitles(container)).toEqual(["Brush"]);
    expect(brushSection(container)).not.toBeNull();
  });
});

describe("PixelStudioPanel — Brush section states", () => {
  it("(c) loaded shows project name, size, frame (2/3) and layer count", () => {
    const { container } = render(
      <PixelStudioPanel {...baseProps("brush")} pixelBrush={loadedBrush()} />,
    );

    const labels = Array.from(
      container.querySelectorAll(".pixel-studio-panel__brush-label"),
    ).map((el) => el.textContent);
    const values = Array.from(
      container.querySelectorAll(".pixel-studio-panel__brush-value"),
    ).map((el) => el.textContent);

    expect(labels).toEqual(["Project", "Size", "Frame", "Layers"]);
    expect(values).toEqual(["soft-round", "8 × 6", "Frame B (2/3)", "4"]);
    expect(
      container.querySelector(".pixel-studio-panel__brush-status"),
    ).toBeNull();
  });

  it("(d) idle shows the empty message and no rows", () => {
    const { container } = render(
      <PixelStudioPanel
        {...baseProps("brush")}
        pixelBrush={emptyBrush("idle")}
      />,
    );
    expect(
      container.querySelector(".pixel-studio-panel__brush-status")?.textContent,
    ).toBe("No brush project loaded. Create one in the Brush Studio.");
    expect(
      container.querySelector(".pixel-studio-panel__brush-rows"),
    ).toBeNull();
  });

  it("(d) loading shows the loading message", () => {
    const { container } = render(
      <PixelStudioPanel
        {...baseProps("brush")}
        pixelBrush={emptyBrush("loading")}
      />,
    );
    expect(
      container.querySelector(".pixel-studio-panel__brush-status")?.textContent,
    ).toBe("Loading brush projects…");
    expect(
      container.querySelector(".pixel-studio-panel__brush-rows"),
    ).toBeNull();
  });

  it("(d) failed shows the failure message", () => {
    const { container } = render(
      <PixelStudioPanel
        {...baseProps("brush")}
        pixelBrush={emptyBrush("failed")}
      />,
    );
    expect(
      container.querySelector(".pixel-studio-panel__brush-status")?.textContent,
    ).toBe("Could not load brush projects.");
    expect(
      container.querySelector(".pixel-studio-panel__brush-rows"),
    ).toBeNull();
  });

  it("loaded with no brushName falls back to the empty message", () => {
    const { container } = render(
      <PixelStudioPanel
        {...baseProps("brush")}
        pixelBrush={emptyBrush("loaded")}
      />,
    );
    expect(
      container.querySelector(".pixel-studio-panel__brush-status")?.textContent,
    ).toBe("No brush project loaded. Create one in the Brush Studio.");
  });

  it("the hint line is present in every state", () => {
    for (const info of [
      loadedBrush(),
      emptyBrush("idle"),
      emptyBrush("loading"),
      emptyBrush("failed"),
    ]) {
      const { container, unmount } = render(
        <PixelStudioPanel {...baseProps("brush")} pixelBrush={info} />,
      );
      expect(
        container.querySelector(".pixel-studio-panel__brush-hint")?.textContent,
      ).toBe(
        "Stamps the current frame of the open brush project with the selected colour.",
      );
      unmount();
    }
  });
});

describe("PixelStudioPanel — Open Brush Studio", () => {
  it("(e) the button calls onOpenBrushStudio once per click, in every state", () => {
    for (const info of [
      loadedBrush(),
      emptyBrush("idle"),
      emptyBrush("failed"),
    ]) {
      const { container, unmount } = render(
        <PixelStudioPanel {...baseProps("brush")} pixelBrush={info} />,
      );
      const button = container.querySelector<HTMLButtonElement>(
        ".pixel-studio-panel__brush-open",
      );
      expect(button).not.toBeNull();
      expect(button!.textContent).toBe("Open Brush Studio");
      expect(button!.type).toBe("button");

      fireEvent.click(button!);
      expect(info.onOpenBrushStudio).toHaveBeenCalledTimes(1);
      unmount();
    }
  });
});

describe("PixelStudioPanel — the colour picker is always in the rail", () => {
  it("(f) renders colorPicker and paletteManager for selectedTool=brush", () => {
    const { container, getByTestId } = render(
      <PixelStudioPanel {...baseProps("brush")} pixelBrush={loadedBrush()} />,
    );
    expect(getByTestId(COLOR_PICKER_ID)).toBeTruthy();
    expect(getByTestId(PALETTE_ID)).toBeTruthy();

    // The Brush section sits ABOVE the picker in DOM order.
    const section = brushSection(container)!.closest(
      ".pixel-studio-panel__section",
    )!;
    const picker = getByTestId(COLOR_PICKER_ID);
    expect(
      section.compareDocumentPosition(picker) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("(f) renders colorPicker and paletteManager for selectedTool=pixel", () => {
    const { getByTestId } = render(
      <PixelStudioPanel {...baseProps("pixel")} />,
    );
    expect(getByTestId(COLOR_PICKER_ID)).toBeTruthy();
    expect(getByTestId(PALETTE_ID)).toBeTruthy();
  });

  it("(f) renders colorPicker for selectedTool=brush even with no pixelBrush prop", () => {
    const { getByTestId } = render(
      <PixelStudioPanel {...baseProps("brush")} />,
    );
    expect(getByTestId(COLOR_PICKER_ID)).toBeTruthy();
  });
});
