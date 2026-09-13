/**
 * DirectionOrb — the reusable drag orb, mounted with NO store provider
 * (pose-tool task 07; MASTER D13).
 *
 * What is pinned:
 *  - it renders and reads its handle position from the PROP, not from internal
 *    state: two renders with different values put the handle in different
 *    places, and re-rendering with the same value leaves it put. This is the
 *    "fully controlled" contract the viewpoint buttons depend on — they move
 *    the rotation orb by changing its `value`, and an orb with its own source
 *    of truth would ignore them.
 *  - a `pointerdown` + `pointermove` emits `onChange` with a CHANGED value.
 *  - `disabled` suppresses `onChange` entirely.
 *  - `setPointerCapture` is called on pointerdown — the mechanism that keeps a
 *    drag alive once the cursor (or finger) leaves the orb. jsdom does not
 *    implement it, so it is installed as a spy.
 *  - both modes round-trip: `"euler"` writes yaw into `y` and pitch into `x`
 *    and preserves `z` (roll), `"direction"` writes a unit vector.
 *
 * ⚠️ jsdom gives every element a 0×0 `getBoundingClientRect()`, and the orb
 * divides by its measured radius — a zero radius is (correctly) treated as
 * "no gesture" and emits nothing. Every drag test therefore stubs the rect,
 * which is also what makes the pixel→radian gain assertable.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { DirectionOrb } from "../DirectionOrb";
import type { PoseVector } from "../../../canvas/pose/poseTypes";

/** The orb's element radius during a test drag: 100px wide → radius 50. */
const RECT_SIZE = 100;
const RADIUS = RECT_SIZE / 2;

/**
 * Give the orb a real box (jsdom reports 0×0) and a working pointer capture
 * (jsdom implements neither method). Returns the capture spy.
 */
function equip(orb: Element): { capture: ReturnType<typeof vi.fn> } {
  orb.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: RECT_SIZE,
      bottom: RECT_SIZE,
      width: RECT_SIZE,
      height: RECT_SIZE,
      toJSON: () => ({}),
    }) as DOMRect;

  const capture = vi.fn();
  Object.assign(orb, {
    setPointerCapture: capture,
    releasePointerCapture: vi.fn(),
  });
  return { capture };
}

function sphere(container: HTMLElement): SVGSVGElement {
  const el = container.querySelector<SVGSVGElement>(".direction-orb__sphere");
  if (!el) throw new Error("no orb rendered");
  return el;
}

function handle(container: HTMLElement): Element {
  const el = container.querySelector(".direction-orb__handle");
  if (!el) throw new Error("no handle rendered");
  return el;
}

const FORWARD: PoseVector = { x: 0, y: 0, z: 1 };
const ZERO: PoseVector = { x: 0, y: 0, z: 0 };

describe("DirectionOrb — renders", () => {
  it("mounts with no provider and exposes an accessible slider", () => {
    const { container } = render(
      <DirectionOrb value={FORWARD} onChange={vi.fn()} label="Light" />,
    );

    const orb = sphere(container);
    expect(orb.getAttribute("role")).toBe("slider");
    expect(orb.getAttribute("aria-label")).toBe("Light");
    expect(container.querySelector(".direction-orb__label")?.textContent).toBe(
      "Light",
    );
  });

  it("reports yaw and pitch in whole degrees for a screen reader", () => {
    // Straight up: pitch +90°, yaw 0° (atan2(0, 0) is 0).
    const { container } = render(
      <DirectionOrb
        value={{ x: 0, y: 1, z: 0 }}
        onChange={vi.fn()}
        label="Light"
      />,
    );
    expect(sphere(container).getAttribute("aria-valuetext")).toBe(
      "yaw 0°, pitch 90°",
    );
  });
});

describe("DirectionOrb — the handle is driven by the prop, not internal state", () => {
  it("places the handle differently for different values", () => {
    // Dead ahead → dead centre of the 100-unit viewBox.
    const ahead = render(
      <DirectionOrb value={FORWARD} onChange={vi.fn()} label="Rotation" />,
    );
    expect(handle(ahead.container).getAttribute("cx")).toBe("50");
    expect(handle(ahead.container).getAttribute("cy")).toBe("50");

    // Straight up → centre horizontally, at the top of the 42-unit radius.
    const up = render(
      <DirectionOrb
        value={{ x: 0, y: 1, z: 0 }}
        onChange={vi.fn()}
        label="Rotation"
      />,
    );
    expect(Number(handle(up.container).getAttribute("cx"))).toBeCloseTo(50, 6);
    expect(Number(handle(up.container).getAttribute("cy"))).toBeCloseTo(8, 6);

    // To the right → right of centre, vertically level.
    const right = render(
      <DirectionOrb
        value={{ x: 1, y: 0, z: 0 }}
        onChange={vi.fn()}
        label="Rotation"
      />,
    );
    expect(Number(handle(right.container).getAttribute("cx"))).toBeCloseTo(92, 6);
    expect(Number(handle(right.container).getAttribute("cy"))).toBeCloseTo(50, 6);
  });

  it("does NOT move the handle when a drag's onChange is ignored", () => {
    // The controlled contract: a caller that drops `onChange` gets no motion.
    // If the orb kept its own direction this would move and the viewpoint
    // buttons could never drive it.
    const { container } = render(
      <DirectionOrb value={FORWARD} onChange={vi.fn()} label="Rotation" />,
    );
    const orb = sphere(container);
    equip(orb);

    fireEvent.pointerDown(orb, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(orb, { pointerId: 1, clientX: 90, clientY: 20 });

    expect(handle(container).getAttribute("cx")).toBe("50");
    expect(handle(container).getAttribute("cy")).toBe("50");
  });

  it("marks a handle pointing away from the viewer as behind", () => {
    const front = render(
      <DirectionOrb value={FORWARD} onChange={vi.fn()} label="L" />,
    );
    expect(handle(front.container).getAttribute("class")).toBe(
      "direction-orb__handle",
    );

    const back = render(
      <DirectionOrb value={{ x: 0, y: 0, z: -1 }} onChange={vi.fn()} label="L" />,
    );
    expect(handle(back.container).getAttribute("class")).toContain(
      "direction-orb__handle--behind",
    );
  });
});

describe("DirectionOrb — dragging", () => {
  it("emits a changed value on pointerdown + pointermove", () => {
    const onChange = vi.fn();
    const { container } = render(
      <DirectionOrb value={FORWARD} onChange={onChange} label="Light" />,
    );
    const orb = sphere(container);
    equip(orb);

    fireEvent.pointerDown(orb, { pointerId: 1, clientX: 50, clientY: 50 });
    expect(onChange).not.toHaveBeenCalled();

    // Drag right by one full radius → +π/2 of yaw → the +X axis exactly.
    fireEvent.pointerMove(orb, { pointerId: 1, clientX: 50 + RADIUS, clientY: 50 });

    expect(onChange).toHaveBeenCalledTimes(1);
    const emitted = onChange.mock.calls[0][0] as PoseVector;
    expect(emitted.x).toBeCloseTo(1, 6);
    expect(emitted.y).toBeCloseTo(0, 6);
    expect(emitted.z).toBeCloseTo(0, 6);
  });

  it("takes pointer capture so a drag survives leaving the orb", () => {
    const onChange = vi.fn();
    const { container } = render(
      <DirectionOrb value={FORWARD} onChange={onChange} label="Light" />,
    );
    const orb = sphere(container);
    const { capture } = equip(orb);

    fireEvent.pointerDown(orb, { pointerId: 7, clientX: 50, clientY: 50 });
    expect(capture).toHaveBeenCalledWith(7);

    // Far outside the 0..100 box — with capture, still our gesture.
    fireEvent.pointerMove(orb, { pointerId: 7, clientX: 900, clientY: 50 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("accumulates from the pointerdown value, not from the previous sample", () => {
    // Two samples at the same place emit the same value: a slow drag and a
    // fast one covering the same distance must land identically.
    const onChange = vi.fn();
    const { container } = render(
      <DirectionOrb value={FORWARD} onChange={onChange} label="Light" />,
    );
    const orb = sphere(container);
    equip(orb);

    fireEvent.pointerDown(orb, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(orb, { pointerId: 1, clientX: 70, clientY: 50 });
    fireEvent.pointerMove(orb, { pointerId: 1, clientX: 60, clientY: 50 });
    fireEvent.pointerMove(orb, { pointerId: 1, clientX: 70, clientY: 50 });

    const first = onChange.mock.calls[0][0] as PoseVector;
    const third = onChange.mock.calls[2][0] as PoseVector;
    expect(third.x).toBeCloseTo(first.x, 12);
    expect(third.z).toBeCloseTo(first.z, 12);
  });

  it("drags UP to pitch UP, and clamps pitch at the pole", () => {
    const onChange = vi.fn();
    const { container } = render(
      <DirectionOrb value={FORWARD} onChange={onChange} label="Light" />,
    );
    const orb = sphere(container);
    equip(orb);

    fireEvent.pointerDown(orb, { pointerId: 1, clientX: 50, clientY: 50 });
    // Up by a quarter radius → +π/8 of pitch → positive Y.
    fireEvent.pointerMove(orb, { pointerId: 1, clientX: 50, clientY: 50 - RADIUS / 4 });
    expect((onChange.mock.calls[0][0] as PoseVector).y).toBeGreaterThan(0);

    // Far past the pole: clamped to exactly +Y, never wrapped over the top.
    fireEvent.pointerMove(orb, { pointerId: 1, clientX: 50, clientY: -5000 });
    const clamped = onChange.mock.calls[1][0] as PoseVector;
    expect(clamped.y).toBeCloseTo(1, 6);
    expect(Math.hypot(clamped.x, clamped.y, clamped.z)).toBeCloseTo(1, 6);
  });

  it("ignores pointermove from a pointer that did not start the drag", () => {
    const onChange = vi.fn();
    const { container } = render(
      <DirectionOrb value={FORWARD} onChange={onChange} label="Light" />,
    );
    const orb = sphere(container);
    equip(orb);

    fireEvent.pointerMove(orb, { pointerId: 1, clientX: 90, clientY: 20 });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.pointerDown(orb, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(orb, { pointerId: 2, clientX: 90, clientY: 20 });
    expect(onChange).not.toHaveBeenCalled();

    // …and after pointerup the original pointer is finished too.
    fireEvent.pointerUp(orb, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(orb, { pointerId: 1, clientX: 90, clientY: 20 });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("DirectionOrb — disabled", () => {
  it("suppresses onChange for the whole gesture", () => {
    const onChange = vi.fn();
    const { container } = render(
      <DirectionOrb value={FORWARD} onChange={onChange} label="Light" disabled />,
    );
    const orb = sphere(container);
    const { capture } = equip(orb);

    fireEvent.pointerDown(orb, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(orb, { pointerId: 1, clientX: 90, clientY: 20 });

    expect(onChange).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect(orb.getAttribute("aria-disabled")).toBe("true");
    expect(orb.getAttribute("class")).toContain("direction-orb__sphere--disabled");
  });
});

describe("DirectionOrb — the two value meanings", () => {
  it("euler mode writes yaw into y, pitch into x, and preserves roll", () => {
    const onChange = vi.fn();
    const { container } = render(
      <DirectionOrb
        value={{ x: 0, y: 0, z: 0.25 }}
        onChange={onChange}
        label="Rotation"
        mode="euler"
      />,
    );
    const orb = sphere(container);
    equip(orb);

    fireEvent.pointerDown(orb, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(orb, { pointerId: 1, clientX: 50 + RADIUS, clientY: 50 });

    const emitted = onChange.mock.calls[0][0] as PoseVector;
    expect(emitted.y).toBeCloseTo(Math.PI / 2, 6); // yaw
    expect(emitted.x).toBeCloseTo(0, 6); // pitch, untouched
    expect(emitted.z).toBe(0.25); // roll carried through, not zeroed
  });

  it("direction mode always emits a unit vector", () => {
    const onChange = vi.fn();
    const { container } = render(
      <DirectionOrb value={FORWARD} onChange={onChange} label="Light" />,
    );
    const orb = sphere(container);
    equip(orb);

    fireEvent.pointerDown(orb, { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(orb, { pointerId: 1, clientX: 83, clientY: 31 });

    const emitted = onChange.mock.calls[0][0] as PoseVector;
    expect(Math.hypot(emitted.x, emitted.y, emitted.z)).toBeCloseTo(1, 12);
  });

  it("treats a zero-length direction as dead ahead rather than NaN", () => {
    const { container } = render(
      <DirectionOrb value={ZERO} onChange={vi.fn()} label="Light" />,
    );
    expect(handle(container).getAttribute("cx")).toBe("50");
    expect(sphere(container).getAttribute("aria-valuetext")).toBe(
      "yaw 0°, pitch 0°",
    );
  });
});
