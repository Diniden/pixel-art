/**
 * PixelStudioPanelContainer — the Brush section is fed from the stores, and
 * the colour picker stays in the rail for the brush tool (pixel-brush task 06).
 *
 * What is pinned, over the REAL `ApplicationStore` with a project installed
 * (the harness is `BrushStudioPanelContainer.dom.test.tsx`'s, plus the
 * `getContext` stub `ColorPickerContainer.dom.test.tsx` uses — the real
 * `ColorPicker` mounts here and paints its SV canvas on mount):
 *
 *   (a) brush tool + no brush document → the empty-state message and the
 *       "Open Brush Studio" button;
 *   (b) brush tool + an installed 4×4 document → project name, "4 × 4",
 *       "Frame 1 (1/1)", one layer;
 *   (c) ⭐ the colour picker (`.color-picker`) is present with the brush tool
 *       selected — MASTER §1's "the color picker available in the side rail".
 *       The component-side pin (`PixelStudioPanel.dom.test.tsx`) uses a stub
 *       element; this is the one that proves the real container renders it,
 *       which needs a project (`ColorPickerContainer` returns `null` without);
 *   (d) "Open Brush Studio" switches `lightingUI.studioMode` to `"brush"`;
 *   (e) with the pencil selected the section is absent and the picker stays.
 *
 * A project is required twice over: `PixelStudioPanelContainer` itself returns
 * `null` without one, and so does `ColorPickerContainer`.
 */
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { runInAction } from "mobx";

import { tinyProject } from "@/store/__tests__/storeContract";
import { ApplicationStore } from "@/stores/ApplicationStore";
import { StoreProvider } from "@/stores/context";
import { PixelStudioPanelContainer } from "@/containers/PixelStudioPanelContainer";
import { createBrushDocument } from "@/types";

/** jsdom has no 2D context; the picker bails on `null` but this keeps it quiet. */
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () =>
      ({
        fillRect: vi.fn(),
        createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
        set fillStyle(_v: unknown) {},
      }) as unknown as CanvasRenderingContext2D,
  ) as unknown as HTMLCanvasElement["getContext"];
});

let app: ApplicationStore;

beforeEach(() => {
  app = new ApplicationStore({ autoSaveEnabled: false });
  runInAction(() => {
    // Install a project the way `CanvasContainer.dom.test.tsx`'s `load` does:
    // both this container and `ColorPickerContainer` return `null` without one.
    app.adoptProject(tinyProject());
    app.domain.loadState = "loaded";
    app.ui.tool.setTool("brush");
  });
});

afterEach(() => {
  app.dispose();
});

/** Install a 4×4 brush as if `loadBrush("panel-brush")` had just succeeded. */
function installBrush(): void {
  runInAction(() => {
    app.brushes.brushName = "panel-brush";
    app.brushes.installDocument(createBrushDocument(4, 4));
    app.brushes.loadState = "loaded";
  });
}

function mount() {
  return render(
    <StoreProvider store={app}>
      <PixelStudioPanelContainer />
    </StoreProvider>,
  );
}

const brushSection = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(".pixel-studio-panel__brush");
const colorPicker = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(".color-picker");
const openButton = () =>
  screen.getByRole("button", { name: "Open Brush Studio" });

describe("PixelStudioPanelContainer — the Brush section", () => {
  it("(a) brush tool with no brush document shows the empty state and the button", () => {
    const { container } = mount();

    expect(app.brushes.hasBrush).toBe(false);
    expect(app.brushes.loadState).toBe("idle");
    expect(brushSection(container)).not.toBeNull();
    expect(
      container.querySelector(".pixel-studio-panel__brush-status")?.textContent,
    ).toBe("No brush project loaded. Create one in the Brush Studio.");
    expect(
      container.querySelector(".pixel-studio-panel__brush-rows"),
    ).toBeNull();
    expect(openButton()).toBeInTheDocument();
  });

  it("(b) an installed 4×4 brush names the project, size, frame (1/1) and layer count", () => {
    installBrush();
    const { container } = mount();

    const labels = Array.from(
      container.querySelectorAll(".pixel-studio-panel__brush-label"),
    ).map((el) => el.textContent);
    const values = Array.from(
      container.querySelectorAll(".pixel-studio-panel__brush-value"),
    ).map((el) => el.textContent);

    expect(labels).toEqual(["Project", "Size", "Frame", "Layers"]);
    expect(values).toEqual(["panel-brush", "4 × 4", "Frame 1 (1/1)", "1"]);
    expect(
      container.querySelector(".pixel-studio-panel__brush-status"),
    ).toBeNull();
  });

  it("(b) the section follows the store: installing a brush after mount swaps empty → loaded", () => {
    const { container } = mount();
    expect(
      container.querySelector(".pixel-studio-panel__brush-rows"),
    ).toBeNull();

    // Inside `act`: the observer re-render is scheduled, not synchronous.
    act(() => installBrush());

    expect(
      container.querySelector(".pixel-studio-panel__brush-status"),
    ).toBeNull();
    expect(
      Array.from(
        container.querySelectorAll(".pixel-studio-panel__brush-value"),
      ).map((el) => el.textContent),
    ).toEqual(["panel-brush", "4 × 4", "Frame 1 (1/1)", "1"]);
  });

  it("(b) a loading state with no document shows the loading message", () => {
    runInAction(() => {
      app.brushes.loadState = "loading";
    });
    const { container } = mount();
    expect(
      container.querySelector(".pixel-studio-panel__brush-status")?.textContent,
    ).toBe("Loading brush projects…");
  });

  it("(c) ⭐ the colour picker is in the rail with the brush tool selected", () => {
    installBrush();
    const { container } = mount();

    const picker = colorPicker(container);
    expect(picker).not.toBeNull();

    // And the Brush section sits ABOVE it in DOM order.
    const section = brushSection(container)!.closest(
      ".pixel-studio-panel__section",
    )!;
    expect(
      section.compareDocumentPosition(picker!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("(d) clicking Open Brush Studio switches the studio mode to brush", () => {
    mount();
    expect(app.lightingUI.studioMode).toBe("pixel");

    fireEvent.click(openButton());

    expect(app.lightingUI.studioMode).toBe("brush");
  });

  it("(e) with the pencil selected the section is absent and the picker remains", () => {
    installBrush();
    runInAction(() => {
      app.ui.tool.setTool("pixel");
    });
    const { container } = mount();

    expect(brushSection(container)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Open Brush Studio" }),
    ).toBeNull();
    expect(colorPicker(container)).not.toBeNull();
    // The pencil's own section is what shows instead.
    expect(
      Array.from(container.querySelectorAll(".panel__title")).map(
        (el) => el.textContent,
      ),
    ).toContain("Pencil");
  });
});

/**
 * The stamp-size controls (brush-scale task 13) over the REAL
 * `PixelBrushUIStore` at `app.ui.pixelBrush`: the section shows the resolved
 * effective size, every intent lands on the store, and the store's lock /
 * 2-D rules (D11) show back through the section.
 *
 * ⚠️ The sliders are driven with `fireEvent.change`, not ArrowRight: jsdom
 * does not step a native `<input type="range">` on arrow keys, so a keydown
 * would never reach `onChange`. The keyboard path is the browser's own.
 */
describe("PixelStudioPanelContainer — the stamp-size controls", () => {
  const readout = (container: HTMLElement) =>
    container.querySelector(".pixel-studio-panel__brush-size-readout")
      ?.textContent;
  const sizeBlock = (container: HTMLElement) =>
    container.querySelector(".pixel-studio-panel__brush-size");
  const widthSlider = () => screen.getByRole("slider", { name: "Width" });
  const lockButton = () =>
    screen.getByRole("button", { name: "Lock aspect ratio" });
  const nativeButton = () =>
    screen.getByRole("button", { name: "Native size" }) as HTMLButtonElement;
  const pick = (dropdown: string, option: string) => {
    fireEvent.click(screen.getByRole("button", { name: dropdown }));
    fireEvent.click(screen.getByRole("option", { name: option }));
  };

  it("with no document there is no size block", () => {
    const { container } = mount();
    expect(sizeBlock(container)).toBeNull();
    // By name: the colour picker below has sliders of its own.
    expect(screen.queryByRole("slider", { name: "Width" })).toBeNull();
  });

  it("a 4×4 brush shows 4 × 4 at native, the slider max of 64, and Native size disabled", () => {
    installBrush();
    const { container } = mount();

    expect(readout(container)).toBe("4 × 4 (native 4 × 4)");
    expect(widthSlider()).toHaveAttribute("max", "64");
    expect(widthSlider()).toHaveValue("4");
    expect(lockButton()).toHaveAttribute("aria-pressed", "true");
    expect(nativeButton().disabled).toBe(true);
    expect(app.ui.pixelBrush.isNative).toBe(true);
  });

  it("nudging W calls setWidth and, locked, H follows at the native ratio", () => {
    installBrush();
    const { container } = mount();

    fireEvent.change(widthSlider(), { target: { value: "8" } });

    expect(app.ui.pixelBrush.width).toBe(8);
    expect(app.ui.pixelBrush.height).toBe(8);
    expect(readout(container)).toBe("8 × 8 (native 4 × 4)");
    expect(screen.getByRole("slider", { name: "Height" })).toHaveValue("8");
    expect(nativeButton().disabled).toBe(false);

    fireEvent.click(nativeButton());
    expect(app.ui.pixelBrush.isNative).toBe(true);
    expect(readout(container)).toBe("4 × 4 (native 4 × 4)");
  });

  it("choosing bilinear while locked sets both store axes", () => {
    installBrush();
    mount();

    pick("Scaling", "Bilinear");

    expect(app.ui.pixelBrush.scaleX).toBe("bilinear");
    expect(app.ui.pixelBrush.scaleY).toBe("bilinear");
    expect(
      screen.getByRole("button", { name: "Scaling" }).textContent,
    ).toContain("Bilinear");
  });

  it("unlock, then choose on X: only that axis changes and the sliders move independently", () => {
    installBrush();
    const { container } = mount();
    pick("Scaling", "Bilinear");

    fireEvent.click(lockButton());
    expect(app.ui.pixelBrush.lockRatio).toBe(false);
    expect(lockButton()).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "Scaling" })).toBeNull();

    pick("Scale X", "Lanczos 3");
    expect(app.ui.pixelBrush.scaleX).toBe("lanczos3");
    expect(app.ui.pixelBrush.scaleY).toBe("bilinear");

    fireEvent.change(widthSlider(), { target: { value: "12" } });
    expect(app.ui.pixelBrush.width).toBe(12);
    expect(app.ui.pixelBrush.height).toBeNull();
    expect(readout(container)).toBe("12 × 4 (native 4 × 4)");
  });

  it("a 2-D pick on one axis while unlocked takes both axes (D11)", () => {
    installBrush();
    mount();
    fireEvent.click(lockButton());

    pick("Scale Y", "EPX / Scale2x");
    expect(app.ui.pixelBrush.scaleX).toBe("epx");
    expect(app.ui.pixelBrush.scaleY).toBe("epx");
    expect(
      screen.getByRole("button", { name: "Scale X" }).textContent,
    ).toContain("EPX / Scale2x");
  });
});
