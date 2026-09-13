/**
 * PixelStudioBrushSection — every story mounts with NO store provider, and
 * the size block reports intents through its callbacks (brush-scale task 13).
 *
 * What is pinned:
 *  - The W / H sliders and their number boxes fire `onWidthChange` /
 *    `onHeightChange` with NUMBERS (the primitive parses; the section must
 *    not re-wrap the value).
 *  - The lock is a real toggle: `aria-pressed` follows `lockRatio`, a click
 *    reports the OPPOSITE state, and the icon swaps.
 *  - Locked shows ONE dropdown ("Scaling"); unlocked shows "Scale X" and
 *    "Scale Y". A pick reports `(axis, id)`; the locked pick reports `"x"`.
 *  - The menu lists every registry option in order with a disabled
 *    separator immediately before the first 2-D scaler.
 *  - "Native size" is disabled exactly when the stamp is native, and fires
 *    `onResetSize` otherwise.
 *  - Keyboard: Tab order is W → lock → H (through both W inputs first).
 *  - `Empty` / `Loading` draw no size block at all.
 *  - The "Brush" picker row (multi-brush task 04): absent without `brushes`,
 *    with `brushes: []`, without `onSelectBrush`, and when not loaded; with
 *    three brushes it is the FIRST `<dl>` row, lists `name (W×H)`, shows
 *    the selected one (falling back to the first), and a pick reports the id.
 *  - The hint reads "Stamps the selected brush's current frame …" in every
 *    state.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { composeStories } from "@storybook/react-vite";
import * as stories from "../PixelStudioBrushSection.stories";
import { PixelStudioBrushSection } from "../PixelStudioBrushSection";
import type {
  PixelStudioBrushInfo,
  PixelStudioBrushSizeControls,
} from "../PixelStudioBrushSection";
import { PIXEL_BRUSH_SCALE_OPTIONS } from "../../../canvas/tools/pixelBrushScale";

const composed = composeStories(stories);

const sizeBlock = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(".pixel-studio-panel__brush-size");
const readout = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(
    ".pixel-studio-panel__brush-size-readout",
  )?.textContent;
const slider = (name: string) => screen.getByRole("slider", { name });
const spinbutton = (name: string) => screen.getByRole("spinbutton", { name });
const lockButton = () =>
  screen.getByRole("button", { name: "Lock aspect ratio" });
const nativeButton = () =>
  screen.getByRole("button", { name: "Native size" }) as HTMLButtonElement;
const trigger = (name: string) => screen.getByRole("button", { name });
const pickerCell = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(".pixel-studio-panel__brush-picker");
const rowLabels = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll("dt.pixel-studio-panel__brush-label"),
  ).map((el) => el.textContent);
const hint = (container: HTMLElement) =>
  container.querySelector(".pixel-studio-panel__brush-hint")?.textContent;

const HINT =
  "Stamps the selected brush's current frame with the selected colour.";

/** The `Loaded` story's info (no picker props), for direct renders. */
const loadedInfo = (): PixelStudioBrushInfo => composed.Loaded.args.pixelBrush!;
/** The three brushes `WithBrushPicker` lists (ids brush-1..3, second selected). */
const BRUSH_OPTIONS = composed.WithBrushPicker.args.pixelBrush!.brushes!;

/** The spies live on the story args; the stateful wrapper forwards to them. */
function spies(story: {
  args: { pixelBrush?: PixelStudioBrushInfo };
}): PixelStudioBrushSizeControls {
  return story.args.pixelBrush!.size!;
}

describe("PixelStudioBrushSection — stories", () => {
  it("exposes exactly the six stories the tasks require", () => {
    expect(Object.keys(composed).sort()).toEqual(
      [
        "Loaded",
        "LoadedUnlocked",
        "PixelArtScaler",
        "Empty",
        "Loading",
        "WithBrushPicker",
      ].sort(),
    );
  });

  it("Empty and Loading draw the status line and no size block", () => {
    for (const [Story, message] of [
      [
        composed.Empty,
        "No brush project loaded. Create one in the Brush Studio.",
      ],
      [composed.Loading, "Loading brush projects…"],
    ] as const) {
      const { container, unmount } = render(<Story />);
      expect(
        container.querySelector(".pixel-studio-panel__brush-status")
          ?.textContent,
      ).toBe(message);
      expect(sizeBlock(container)).toBeNull();
      expect(screen.queryByRole("slider")).toBeNull();
      unmount();
    }
  });

  it("Loaded keeps the four info rows above the size block and the Open button below it", () => {
    const { container } = render(<composed.Loaded />);
    const labels = Array.from(
      container.querySelectorAll("dt.pixel-studio-panel__brush-label"),
    ).map((el) => el.textContent);
    expect(labels).toEqual(["Project", "Size", "Frame", "Layers"]);

    const rows = container.querySelector(".pixel-studio-panel__brush-rows")!;
    const block = sizeBlock(container)!;
    const open = container.querySelector(".pixel-studio-panel__brush-open")!;
    expect(
      rows.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      block.compareDocumentPosition(open) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("PixelStudioBrushSection — the Brush picker row", () => {
  it("is absent when `brushes` is not supplied (every pre-existing loaded story)", () => {
    for (const Story of [
      composed.Loaded,
      composed.LoadedUnlocked,
      composed.PixelArtScaler,
    ]) {
      const { container, unmount } = render(<Story />);
      expect(pickerCell(container)).toBeNull();
      expect(screen.queryByRole("button", { name: "Brush" })).toBeNull();
      expect(rowLabels(container)).toEqual([
        "Project",
        "Size",
        "Frame",
        "Layers",
      ]);
      unmount();
    }
  });

  it("is absent with `brushes: []`, and absent without `onSelectBrush`", () => {
    const empty = render(
      <PixelStudioBrushSection
        pixelBrush={{ ...loadedInfo(), brushes: [], onSelectBrush: vi.fn() }}
      />,
    );
    expect(pickerCell(empty.container)).toBeNull();
    expect(rowLabels(empty.container)).toEqual([
      "Project",
      "Size",
      "Frame",
      "Layers",
    ]);
    empty.unmount();

    const noHandler = render(
      <PixelStudioBrushSection
        pixelBrush={{ ...loadedInfo(), brushes: BRUSH_OPTIONS }}
      />,
    );
    expect(pickerCell(noHandler.container)).toBeNull();
    expect(screen.queryByRole("button", { name: "Brush" })).toBeNull();
  });

  it("is absent while nothing is loaded, even with brushes and a handler", () => {
    const { container } = render(
      <PixelStudioBrushSection
        pixelBrush={{
          ...composed.Empty.args.pixelBrush!,
          brushes: BRUSH_OPTIONS,
          selectedBrushId: "brush-2",
          onSelectBrush: vi.fn(),
        }}
      />,
    );
    expect(pickerCell(container)).toBeNull();
    expect(screen.queryByRole("button", { name: "Brush" })).toBeNull();
  });

  it("WithBrushPicker leads the rows with Brush, in the dd with the BEM classes", () => {
    const { container } = render(<composed.WithBrushPicker />);
    expect(rowLabels(container)).toEqual([
      "Brush",
      "Project",
      "Size",
      "Frame",
      "Layers",
    ]);
    const cell = pickerCell(container)!;
    expect(cell.tagName).toBe("DD");
    expect(cell.closest(".pixel-studio-panel__brush-rows")).not.toBeNull();
    expect(cell.contains(trigger("Brush"))).toBe(true);
    expect(trigger("Brush").className).toContain(
      "pixel-studio-panel__brush-picker-trigger",
    );
  });

  it("shows the selected brush as `name (W×H)` and lists all three in order", () => {
    render(<composed.WithBrushPicker />);
    expect(trigger("Brush").textContent).toContain("Hard Square (8×8)");

    fireEvent.click(trigger("Brush"));
    const items = screen.getAllByRole("option") as HTMLButtonElement[];
    expect(items.map((el) => el.textContent)).toEqual([
      "Soft Round (16×16)",
      "Hard Square (8×8)",
      "Splatter (32×24)",
    ]);
    expect(items.map((el) => el.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "false",
    ]);
    expect(items.some((el) => el.disabled)).toBe(false);
  });

  it("a pick calls onSelectBrush(id) and the trigger follows", () => {
    render(<composed.WithBrushPicker />);
    const onSelectBrush = vi.mocked(
      composed.WithBrushPicker.args.pixelBrush!.onSelectBrush!,
    );
    onSelectBrush.mockClear();

    fireEvent.click(trigger("Brush"));
    fireEvent.click(screen.getByRole("option", { name: "Splatter (32×24)" }));
    expect(onSelectBrush).toHaveBeenCalledTimes(1);
    expect(onSelectBrush).toHaveBeenCalledWith("brush-3");
    expect(trigger("Brush").textContent).toContain("Splatter (32×24)");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("falls back to the first brush when selectedBrushId is null or absent", () => {
    const onSelectBrush = vi.fn();
    const nulled = render(
      <PixelStudioBrushSection
        pixelBrush={{
          ...loadedInfo(),
          brushes: BRUSH_OPTIONS,
          selectedBrushId: null,
          onSelectBrush,
        }}
      />,
    );
    expect(trigger("Brush").textContent).toContain("Soft Round (16×16)");
    nulled.unmount();

    render(
      <PixelStudioBrushSection
        pixelBrush={{ ...loadedInfo(), brushes: BRUSH_OPTIONS, onSelectBrush }}
      />,
    );
    expect(trigger("Brush").textContent).toContain("Soft Round (16×16)");
    fireEvent.click(trigger("Brush"));
    fireEvent.click(screen.getByRole("option", { name: "Hard Square (8×8)" }));
    expect(onSelectBrush).toHaveBeenCalledWith("brush-2");
  });

  it("keeps the size block and the Open button below the rows", () => {
    const { container } = render(<composed.WithBrushPicker />);
    const rows = container.querySelector(".pixel-studio-panel__brush-rows")!;
    const block = sizeBlock(container)!;
    const open = container.querySelector(".pixel-studio-panel__brush-open")!;
    expect(
      rows.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      block.compareDocumentPosition(open) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(readout(container)).toBe("8 × 8 (native 8 × 8)");
  });
});

describe("PixelStudioBrushSection — the hint", () => {
  it("reads the multi-brush sentence in every story", () => {
    for (const Story of Object.values(composed)) {
      const { container, unmount } = render(<Story />);
      expect(hint(container)).toBe(HINT);
      unmount();
    }
  });
});

describe("PixelStudioBrushSection — sliders", () => {
  it("W and H sliders fire their callbacks with numbers, bounded 1..max", () => {
    const { container } = render(<composed.Loaded />);
    const { onWidthChange, onHeightChange } = spies(composed.Loaded);

    expect(slider("Width")).toHaveAttribute("min", "1");
    expect(slider("Width")).toHaveAttribute("max", "64");
    expect(readout(container)).toBe("16 × 16 (native 16 × 16)");

    fireEvent.change(slider("Width"), { target: { value: "32" } });
    expect(onWidthChange).toHaveBeenCalledWith(32);
    expect(typeof vi.mocked(onWidthChange).mock.calls[0]![0]).toBe("number");
    // The stateful story follows the lock: H moved with W at ratio 1.
    expect(readout(container)).toBe("32 × 32 (native 16 × 16)");

    fireEvent.change(slider("Height"), { target: { value: "8" } });
    expect(onHeightChange).toHaveBeenCalledWith(8);
  });

  it("the number boxes commit on Enter and report the same callbacks", () => {
    render(<composed.LoadedUnlocked />);
    const { onWidthChange } = spies(composed.LoadedUnlocked);

    const box = spinbutton("Width");
    fireEvent.change(box, { target: { value: "40" } });
    expect(onWidthChange).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onWidthChange).toHaveBeenCalledWith(40);
  });
});

describe("PixelStudioBrushSection — the ratio lock", () => {
  it("is pressed while locked and reports the opposite state on click", () => {
    render(<composed.Loaded />);
    const { onLockRatioChange } = spies(composed.Loaded);

    expect(lockButton()).toHaveAttribute("aria-pressed", "true");
    expect(lockButton().className).toContain(
      "pixel-studio-panel__brush-lock--active",
    );
    fireEvent.click(lockButton());
    expect(onLockRatioChange).toHaveBeenCalledWith(false);
    expect(lockButton()).toHaveAttribute("aria-pressed", "false");
    expect(lockButton().className).not.toContain(
      "pixel-studio-panel__brush-lock--active",
    );

    fireEvent.click(lockButton());
    expect(onLockRatioChange).toHaveBeenLastCalledWith(true);
    expect(lockButton()).toHaveAttribute("aria-pressed", "true");
  });

  it("unlocked starts unpressed and reports true on click", () => {
    render(<composed.LoadedUnlocked />);
    expect(lockButton()).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(lockButton());
    expect(
      spies(composed.LoadedUnlocked).onLockRatioChange,
    ).toHaveBeenCalledWith(true);
  });
});

describe("PixelStudioBrushSection — strategy pickers", () => {
  it("locked shows one Scaling dropdown; unlocked shows Scale X and Scale Y", () => {
    const { unmount } = render(<composed.Loaded />);
    expect(trigger("Scaling")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scale X" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Scale Y" })).toBeNull();
    expect(trigger("Scaling").textContent).toContain("Nearest");
    unmount();

    render(<composed.LoadedUnlocked />);
    expect(screen.queryByRole("button", { name: "Scaling" })).toBeNull();
    expect(trigger("Scale X").textContent).toContain("Lanczos 3");
    expect(trigger("Scale Y").textContent).toContain("Bilinear");
  });

  it("unlocking swaps the one dropdown for two, and re-locking swaps back", () => {
    render(<composed.Loaded />);
    fireEvent.click(lockButton());
    expect(screen.queryByRole("button", { name: "Scaling" })).toBeNull();
    expect(trigger("Scale X")).toBeInTheDocument();
    expect(trigger("Scale Y")).toBeInTheDocument();
    fireEvent.click(lockButton());
    expect(trigger("Scaling")).toBeInTheDocument();
  });

  it("lists every registry option in order with a disabled separator before the first 2-D scaler", () => {
    render(<composed.Loaded />);
    fireEvent.click(trigger("Scaling"));

    const items = screen.getAllByRole("option") as HTMLButtonElement[];
    const labels = items.map((el) => el.textContent);
    const firstTwoD = PIXEL_BRUSH_SCALE_OPTIONS.findIndex(
      (o) => o.group === "pixel-art",
    );
    const expected = PIXEL_BRUSH_SCALE_OPTIONS.map((o) => o.label);
    expected.splice(firstTwoD, 0, "— pixel-art (both axes) —");
    expect(labels).toEqual(expected);
    expect(items[firstTwoD]!.disabled).toBe(true);
    expect(items.filter((el) => el.disabled)).toHaveLength(1);
    // Nearest is the selected option.
    expect(items[0]).toHaveAttribute("aria-selected", "true");
  });

  it("choosing an option while locked fires onScaleChange('x', id)", () => {
    render(<composed.Loaded />);
    const { onScaleChange } = spies(composed.Loaded);

    fireEvent.click(trigger("Scaling"));
    fireEvent.click(screen.getByRole("option", { name: "Bilinear" }));
    expect(onScaleChange).toHaveBeenCalledWith("x", "bilinear");
    expect(trigger("Scaling").textContent).toContain("Bilinear");
  });

  it("choosing on Scale Y while unlocked fires onScaleChange('y', id)", () => {
    render(<composed.LoadedUnlocked />);
    const { onScaleChange } = spies(composed.LoadedUnlocked);

    fireEvent.click(trigger("Scale Y"));
    fireEvent.click(screen.getByRole("option", { name: "Box (area)" }));
    expect(onScaleChange).toHaveBeenCalledWith("y", "box");
    expect(trigger("Scale Y").textContent).toContain("Box (area)");
    expect(trigger("Scale X").textContent).toContain("Lanczos 3");
  });

  it("the separator cannot be chosen", () => {
    render(<composed.Loaded />);
    // The story's spies are module-level and outlive earlier tests.
    const onScaleChange = vi.mocked(spies(composed.Loaded).onScaleChange);
    onScaleChange.mockClear();
    fireEvent.click(trigger("Scaling"));
    fireEvent.click(
      screen.getByRole("option", { name: "— pixel-art (both axes) —" }),
    );
    expect(onScaleChange).not.toHaveBeenCalled();
  });

  it("PixelArtScaler shows EPX on the locked picker", () => {
    render(<composed.PixelArtScaler />);
    expect(trigger("Scaling").textContent).toContain("EPX / Scale2x");
  });
});

describe("PixelStudioBrushSection — Native size and the readout", () => {
  it("is disabled at native and enabled once the size differs", () => {
    const { container } = render(<composed.Loaded />);
    expect(nativeButton().disabled).toBe(true);

    fireEvent.change(slider("Width"), { target: { value: "20" } });
    expect(nativeButton().disabled).toBe(false);
    expect(readout(container)).toBe("20 × 20 (native 16 × 16)");

    fireEvent.click(nativeButton());
    expect(spies(composed.Loaded).onResetSize).toHaveBeenCalledTimes(1);
    expect(readout(container)).toBe("16 × 16 (native 16 × 16)");
    expect(nativeButton().disabled).toBe(true);
  });

  it("LoadedUnlocked is off-native, so the button is live and the readout says so", () => {
    const { container } = render(<composed.LoadedUnlocked />);
    expect(nativeButton().disabled).toBe(false);
    expect(readout(container)).toBe("24 × 12 (native 16 × 16)");
  });
});

describe("PixelStudioBrushSection — keyboard", () => {
  it("Tab order is W (slider, box) → lock → H (slider, box)", async () => {
    const user = userEvent.setup();
    render(<composed.Loaded />);

    slider("Width").focus();
    expect(slider("Width")).toHaveFocus();
    await user.tab();
    expect(spinbutton("Width")).toHaveFocus();
    await user.tab();
    expect(lockButton()).toHaveFocus();
    await user.tab();
    expect(slider("Height")).toHaveFocus();
    await user.tab();
    expect(spinbutton("Height")).toHaveFocus();
  });
});
