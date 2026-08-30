/**
 * Other Hand Mode — the pure surface and its thumb slider.
 *
 * jsdom has no layout, so every rect is stubbed: the stage is 400×800 at the
 * origin, a card is 80×300, a slider track is 44×200 at y=100. The pointer
 * maths is then exact.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OtherHandSurface } from "../OtherHandSurface";
import { ThumbSlider } from "../ThumbSlider";
import type { ThumbWidgetSpec } from "../thumbWidgets";

afterEach(cleanup);

/** jsdom lacks pointer capture; the components guard on these existing. */
function stubPointerCapture(el: Element) {
  Object.assign(el, {
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    hasPointerCapture: () => false,
  });
}

const rect = (x: number, y: number, w: number, h: number) =>
  ({
    left: x,
    top: y,
    width: w,
    height: h,
    right: x + w,
    bottom: y + h,
    x,
    y,
    toJSON: () => ({}),
  }) as DOMRect;

describe("ThumbSlider", () => {
  it("⭐ maps the pointer's Y to the range — bottom is min, top is max", () => {
    const onChange = vi.fn();
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    render(
      <ThumbSlider
        label="Size"
        value={4}
        min={1}
        max={16}
        onChange={onChange}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />,
    );
    const track = screen.getByRole("slider", { name: "Size" });
    stubPointerCapture(track);
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue(
      rect(0, 100, 44, 200),
    );

    fireEvent.pointerDown(track, { button: 0, clientY: 300, pointerId: 1 });
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(1);

    fireEvent.pointerMove(track, { clientY: 100, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(16);

    fireEvent.pointerMove(track, { clientY: 200, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(9); // 1 + 0.5 * 15 = 8.5 → 9

    fireEvent.pointerUp(track, { pointerId: 1 });
    expect(onDragEnd).toHaveBeenCalledTimes(1);

    // A move with no button down changes nothing.
    onChange.mockClear();
    fireEvent.pointerMove(track, { clientY: 150, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("arrow keys step, wrapped in the same start/end hooks", () => {
    const onChange = vi.fn();
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    render(
      <ThumbSlider
        label="Radius"
        value={2}
        min={0.5}
        max={16}
        step={0.5}
        onChange={onChange}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />,
    );
    const track = screen.getByRole("slider", { name: "Radius" });
    fireEvent.keyDown(track, { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith(2.5);
    fireEvent.keyDown(track, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith(0.5);
    expect(onDragStart).toHaveBeenCalledTimes(2);
    expect(onDragEnd).toHaveBeenCalledTimes(2);
    expect(screen.getByText("2.0")).toBeTruthy();
  });
});

const widgets: ThumbWidgetSpec[] = [
  {
    kind: "slider",
    id: "size",
    label: "Size",
    value: 3,
    min: 1,
    max: 16,
    onChange: () => {},
  },
  {
    kind: "buttons",
    id: "shape",
    label: "Shape",
    buttons: [
      { id: "circle", label: "Circle", active: true, onClick: () => {} },
      { id: "square", label: "Square", active: false, onClick: () => {} },
    ],
  },
];

describe("OtherHandSurface", () => {
  it("unarranged widgets take the CSS placement; stored positions win", () => {
    const { container } = render(
      <OtherHandSurface
        title="Pencil"
        widgets={widgets}
        positions={{ shape: { x: 60, y: 40 } }}
        onPositionChange={() => {}}
        onResetPositions={() => {}}
        onExit={() => {}}
      />,
    );
    const cards = container.querySelectorAll<HTMLElement>(
      ".other-hand__widget",
    );
    expect(cards).toHaveLength(2);
    // Unarranged: the CSS does the placing from the two custom properties.
    expect(cards[0].className).toContain("other-hand__widget--auto");
    expect(cards[0].style.getPropertyValue("--other-hand-fraction")).toBe("0");
    expect(cards[0].style.getPropertyValue("--other-hand-row")).toBe("0");
    expect(cards[0].style.left).toBe("");
    // Arranged: an inline percent position, and no auto class.
    expect(cards[1].className).not.toContain("other-hand__widget--auto");
    expect(cards[1].style.left).toBe("60%");
    expect(cards[1].style.top).toBe("40%");
  });

  it("exit and reset reach their callbacks; an empty section explains itself", () => {
    const onExit = vi.fn();
    const onResetPositions = vi.fn();
    render(
      <OtherHandSurface
        title="Line"
        widgets={[]}
        positions={{}}
        onPositionChange={() => {}}
        onResetPositions={onResetPositions}
        onExit={onExit}
        emptyMessage="Nothing here."
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Leave Other Hand Mode" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset layout" }));
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onResetPositions).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Nothing here.")).toBeTruthy();
  });

  it("⭐ a grip drag reports ONE clamped percent position, on release only", () => {
    const onPositionChange = vi.fn();
    const { container } = render(
      <OtherHandSurface
        title="Pencil"
        widgets={widgets}
        positions={{}}
        onPositionChange={onPositionChange}
        onResetPositions={() => {}}
        onExit={() => {}}
      />,
    );
    const stage = container.querySelector<HTMLElement>(".other-hand__stage")!;
    const card = container.querySelector<HTMLElement>(".other-hand__widget")!;
    const grip = screen.getByRole("button", { name: "Move Size" });
    stubPointerCapture(grip);
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue(
      rect(0, 0, 400, 800),
    );
    vi.spyOn(card, "getBoundingClientRect").mockReturnValue(
      rect(0, 0, 80, 300),
    );

    fireEvent.pointerDown(grip, {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    });
    // +100px right, +200px down → 25% / 25%.
    fireEvent.pointerMove(grip, { clientX: 110, clientY: 210, pointerId: 1 });
    expect(onPositionChange).not.toHaveBeenCalled();
    expect(card.style.left).toBe("25%");
    expect(card.style.top).toBe("25%");
    expect(card.className).toContain("other-hand__widget--dragging");

    // Way off the stage: clamped so the card stays fully inside
    // (400 − 80 = 320px → 80%; 800 − 300 = 500px → 62.5%).
    fireEvent.pointerMove(grip, { clientX: 2000, clientY: 2000, pointerId: 1 });
    fireEvent.pointerUp(grip, { pointerId: 1 });
    expect(onPositionChange).toHaveBeenCalledTimes(1);
    expect(onPositionChange).toHaveBeenCalledWith("size", { x: 80, y: 62.5 });
    expect(card.className).not.toContain("other-hand__widget--dragging");
  });
});
