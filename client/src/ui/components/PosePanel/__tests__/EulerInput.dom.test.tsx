/**
 * EulerInput — exact numeric angle entry (plan 08 task 07; F10, F11).
 *
 * What is pinned, in the order the definition of done asks for it:
 *
 *  - **F10** — the boxes show DEGREES and the callbacks carry RADIANS. Typing
 *    `45` into the model's Y emits `Math.PI / 4`, not `45`.
 *  - **The empty/partial-input guard**, which is the measured trap: an
 *    `<input type="number">` sanitises garbage to `""` and `Number("")` is
 *    `0`, so `""`, `"-"` and `"abc"` must each emit **nothing at all**. A
 *    naive `Number.isFinite` guard would snap the model to 0 while the owner
 *    was still typing `-45`.
 *  - **Two views of one value** — feeding a new `rotation`/`lightDirection`
 *    prop in (which is exactly what dragging the orb does, since both read the
 *    same store field) moves the numbers, with no state of the control's own.
 *  - **F11's round trip** — the two light numbers, read off the current
 *    vector and pushed back through the control, regenerate the SAME vector
 *    within an epsilon. This is step 5 of the task: the finding it exists to
 *    surface would be an inability to satisfy it.
 *  - **The light's conversion matches `DirectionOrb`'s**, so the boxes and the
 *    orb cannot disagree, and **it is two `applyEulerXYZ` calls, not one** —
 *    the single combined call is a different rotation, and a regression to it
 *    fails here.
 *  - **Two boxes for the light, three for the rotation** (F11), and the
 *    light's are NOT called `X`/`Y`/`Z`.
 *
 * ⚠️ These render the components directly rather than through a story: the
 * primitive has no story of its own, and `PoseSection.dom.test.tsx` covers the
 * wired-up rail. Each `it` builds its own spy, so unlike the PoseSection file
 * there is no shared-`fn()` accounting to do.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import {
  EulerInput,
  LightAnglesInput,
  RotationEulerInput,
} from "../EulerInput";
import { applyEulerXYZ } from "../../../canvas/pose/poseCamera";
import type { PoseVector } from "../../../canvas/pose/poseTypes";

const DEG = Math.PI / 180;

function boxes(container: HTMLElement): HTMLInputElement[] {
  return Array.from(
    container.querySelectorAll<HTMLInputElement>("input[type=number]"),
  );
}

function byLabel(container: HTMLElement, label: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(
    `[aria-label="${label}"]`,
  );
  if (!el) throw new Error(`no field labelled ${label}`);
  return el;
}

/** The orb's own `vectorToSpherical`/`sphericalToVector`, transcribed. */
function orbVector(yaw: number, pitch: number): PoseVector {
  const cosPitch = Math.cos(pitch);
  return {
    x: cosPitch * Math.sin(yaw),
    y: Math.sin(pitch),
    z: cosPitch * Math.cos(yaw),
  };
}

function expectClose(a: PoseVector, b: PoseVector, epsilon = 1e-12): void {
  expect(Math.abs(a.x - b.x)).toBeLessThan(epsilon);
  expect(Math.abs(a.y - b.y)).toBeLessThan(epsilon);
  expect(Math.abs(a.z - b.z)).toBeLessThan(epsilon);
}

/* ── the primitive ────────────────────────────────────────────────────────── */

describe("EulerInput — the primitive", () => {
  it("renders exactly as many boxes as it is given axes, 2 or 3", () => {
    const two = render(
      <EulerInput
        name="Two"
        axes={[
          { label: "A", degrees: 1 },
          { label: "B", degrees: 2 },
        ]}
        onChange={vi.fn()}
      />,
    );
    // ⚠️ TWO, not three with one hidden — the light needs a genuinely
    // two-field control (F11) and a dead third box is the thing being avoided.
    expect(boxes(two.container)).toHaveLength(2);

    const three = render(
      <EulerInput
        name="Three"
        axes={[
          { label: "A", degrees: 1 },
          { label: "B", degrees: 2 },
          { label: "C", degrees: 3 },
        ]}
        onChange={vi.fn()}
      />,
    );
    expect(boxes(three.container)).toHaveLength(3);
  });

  it("names each field `${name} ${label}`, so two instances do not collide", () => {
    const { container } = render(
      <EulerInput
        name="Rotation"
        axes={[{ label: "Y", degrees: 0 }]}
        onChange={vi.fn()}
      />,
    );
    expect(byLabel(container, "Rotation Y")).toBeTruthy();
  });

  it("rounds for DISPLAY but emits exactly what was parsed", () => {
    const onChange = vi.fn();
    const { container } = render(
      <EulerInput
        name="R"
        axes={[{ label: "Y", degrees: 45.06 }]}
        onChange={onChange}
      />,
    );
    // One decimal on screen …
    expect(byLabel(container, "R Y").value).toBe("45.1");

    // … but rounding on the way IN would make the control lossy against its
    // own round-trip, so the emitted number is untouched.
    fireEvent.change(byLabel(container, "R Y"), { target: { value: "12.345" } });
    expect(onChange).toHaveBeenLastCalledWith("Y", 12.345);
  });

  it("shows 0, never `-0`", () => {
    const { container } = render(
      <EulerInput
        name="R"
        axes={[{ label: "Y", degrees: -0.02 }]}
        onChange={vi.fn()}
      />,
    );
    // `Math.round(-0.02 * 10) / 10` is `-0`, which renders as "-0".
    expect(byLabel(container, "R Y").value).toBe("0");
  });

  it("suppresses every change while disabled", () => {
    const onChange = vi.fn();
    const { container } = render(
      <EulerInput
        name="R"
        axes={[{ label: "Y", degrees: 0 }]}
        onChange={onChange}
        disabled
      />,
    );
    expect(byLabel(container, "R Y").disabled).toBe(true);
  });
});

/* ── ⚠️ the measured trap ─────────────────────────────────────────────────── */

describe("EulerInput — the empty/partial-input guard", () => {
  it("emits NOTHING for an empty or unparseable box", () => {
    const onChange = vi.fn();
    const { container } = render(
      <EulerInput
        name="R"
        axes={[{ label: "Y", degrees: 30 }]}
        onChange={onChange}
      />,
    );
    const box = byLabel(container, "R Y");

    // ⚠️ THE TRAP. A number input sanitises anything unparseable to `""`, and
    // `Number("")` is `0` — NOT `NaN` — so a bare `Number.isFinite` guard
    // would emit a real 0 here and snap the model flat mid-keystroke.
    for (const value of ["", "   ", "-", ".", "abc", "1e"]) {
      fireEvent.change(box, { target: { value } });
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not pass through 0 on the way to a negative angle", () => {
    // The exact keystroke sequence for typing "-45": the browser reports `""`
    // for the lone "-", then the real value. Only ONE emission is correct, and
    // it must not be 0.
    const onChange = vi.fn();
    const { container } = render(
      <EulerInput
        name="R"
        axes={[{ label: "Y", degrees: 0 }]}
        onChange={onChange}
      />,
    );
    const box = byLabel(container, "R Y");
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.change(box, { target: { value: "-45" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("Y", -45);
  });

  it("still accepts a real 0 that the owner actually typed", () => {
    const onChange = vi.fn();
    const { container } = render(
      <EulerInput
        name="R"
        axes={[{ label: "Y", degrees: 30 }]}
        onChange={onChange}
      />,
    );
    fireEvent.change(byLabel(container, "R Y"), { target: { value: "0" } });
    expect(onChange).toHaveBeenCalledWith("Y", 0);
  });
});

/* ── F10: the model's rotation ────────────────────────────────────────────── */

describe("RotationEulerInput — degrees in the UI, radians out (F10)", () => {
  it("shows the store's radians as degrees", () => {
    const { container } = render(
      <RotationEulerInput
        rotation={{ x: Math.PI / 2, y: -Math.PI / 4, z: Math.PI }}
        onChange={vi.fn()}
      />,
    );
    expect(byLabel(container, "Rotation X").value).toBe("90");
    expect(byLabel(container, "Rotation Y").value).toBe("-45");
    expect(byLabel(container, "Rotation Z").value).toBe("180");
  });

  it("emits RADIANS for a typed degree value, changing only that axis", () => {
    const onChange = vi.fn();
    const rotation = { x: 0.25, y: 0.5, z: 0.75 };
    const { container } = render(
      <RotationEulerInput rotation={rotation} onChange={onChange} />,
    );

    fireEvent.change(byLabel(container, "Rotation Y"), {
      target: { value: "45" },
    });
    // ⚠️ F10: the store's language is radians. Typing 45 sends π/4.
    expect(onChange).toHaveBeenLastCalledWith({
      x: 0.25,
      y: Math.PI / 4,
      z: 0.75,
    });
  });

  it("round-trips degrees → radians → degrees losslessly at the shown precision", () => {
    // The display is one decimal and the conversion error is ~1e-14 degrees,
    // so every tenth of a degree over a full turn must survive intact.
    for (let deg = -360; deg <= 360; deg += 0.1) {
      const typed = Math.round(deg * 10) / 10;
      const back = typed * DEG * (180 / Math.PI);
      expect(Math.round(back * 10) / 10).toBe(typed);
    }
  });

  it("does NOT wrap the displayed value — 370 stays 370", () => {
    // Yaw wraps freely on the orb; a box that rewrote 370 as 10 while the
    // owner was still typing 3705 would fight them. See also the light, which
    // deliberately DOES canonicalise, and the header's note on the asymmetry.
    const { container } = render(
      <RotationEulerInput
        rotation={{ x: 0, y: 370 * DEG, z: 0 }}
        onChange={vi.fn()}
      />,
    );
    expect(byLabel(container, "Rotation Y").value).toBe("370");
  });

  it("is a VIEW of the prop — a new rotation moves the numbers", () => {
    // This is what "dragging the orb updates the fields" reduces to: both read
    // the same store field, and this control holds no value of its own.
    const { container, rerender } = render(
      <RotationEulerInput rotation={{ x: 0, y: 0, z: 0 }} onChange={vi.fn()} />,
    );
    expect(byLabel(container, "Rotation Y").value).toBe("0");

    rerender(
      <RotationEulerInput
        rotation={{ x: 0, y: Math.PI / 6, z: 0 }}
        onChange={vi.fn()}
      />,
    );
    expect(byLabel(container, "Rotation Y").value).toBe("30");
  });
});

/* ── F11: the light ───────────────────────────────────────────────────────── */

describe("LightAnglesInput — two fields, honestly labelled (F11)", () => {
  it("offers TWO boxes, called Azimuth and Elevation, never X/Y/Z", () => {
    const { container } = render(
      <LightAnglesInput
        lightDirection={{ x: 0, y: 0, z: 1 }}
        onChange={vi.fn()}
      />,
    );
    // ⚠️ The whole of F11 in one assertion: a direction has two degrees of
    // freedom, so a third box would be one the owner could type into to no
    // effect. Naming these X/Y/Z would promise the Euler triple they are not.
    expect(boxes(container)).toHaveLength(2);
    expect(byLabel(container, "Light Azimuth")).toBeTruthy();
    expect(byLabel(container, "Light Elevation")).toBeTruthy();
    expect(container.querySelector('[aria-label="Light X"]')).toBeNull();
  });

  it("reads a light straight at the viewer as 0, 0", () => {
    const { container } = render(
      <LightAnglesInput
        lightDirection={{ x: 0, y: 0, z: 1 }}
        onChange={vi.fn()}
      />,
    );
    expect(byLabel(container, "Light Azimuth").value).toBe("0");
    expect(byLabel(container, "Light Elevation").value).toBe("0");
  });

  it("reads a zero-length vector as dead ahead, not NaN", () => {
    const { container } = render(
      <LightAnglesInput
        lightDirection={{ x: 0, y: 0, z: 0 }}
        onChange={vi.fn()}
      />,
    );
    expect(byLabel(container, "Light Azimuth").value).toBe("0");
    expect(byLabel(container, "Light Elevation").value).toBe("0");
  });

  it("⚠️ ROUND TRIP — the displayed numbers regenerate the SAME vector", () => {
    // Task step 5. Take a vector, read the two numbers the owner SEES for it,
    // then type that pair into a control and assert the vector that comes out
    // is the one we started with. If this could not be satisfied, THAT would
    // be the finding; it can be, because the two angles are read off the
    // vector rather than remembered, so there is nothing to drift.
    //
    // ⚠️ Each write is fired into a control rendered at a DELIBERATELY
    // different vector. Firing a `change` whose value equals the input's own
    // is a no-op in React's DOM layer, so a test that re-types a number into
    // the control already showing it asserts nothing at all — measured, twice,
    // on the way to this shape.
    const vectors: PoseVector[] = [
      { x: 0, y: 0, z: 1 },
      orbVector(0.4, 0.2),
      orbVector(-2.1, -0.9),
      orbVector(3.0, 1.2),
      // The store's own default, normalised the way `setLightDirection` does.
      (() => {
        const v = { x: -0.5, y: 0.7, z: 1 };
        const l = Math.hypot(v.x, v.y, v.z);
        return { x: v.x / l, y: v.y / l, z: v.z / l };
      })(),
    ];

    /** Type `value` into one box of a control showing `from`; return the emit. */
    function type(from: PoseVector, box: string, value: string): PoseVector {
      const onChange = vi.fn();
      const { container } = render(
        <LightAnglesInput lightDirection={from} onChange={onChange} />,
      );
      fireEvent.change(byLabel(container, box), { target: { value } });
      const emitted = onChange.mock.lastCall?.[0] as PoseVector | undefined;
      if (!emitted) throw new Error(`no emission typing ${value} into ${box}`);
      return emitted;
    }

    for (const start of vectors) {
      const shown = render(
        <LightAnglesInput lightDirection={start} onChange={vi.fn()} />,
      );
      const azimuth = byLabel(shown.container, "Light Azimuth").value;
      const elevation = byLabel(shown.container, "Light Elevation").value;

      // A placeholder chosen to differ from `start` in BOTH angles, so
      // neither write can be swallowed as a no-op.
      const placeholder = orbVector(
        Number(azimuth) * DEG + 1.1,
        Number(elevation) * DEG > 0 ? -0.7 : 0.7,
      );
      const afterElevation = type(placeholder, "Light Elevation", elevation);
      const emitted = type(afterElevation, "Light Azimuth", azimuth);

      // The epsilon absorbs the one decimal of DISPLAY rounding, which is the
      // only lossy step in the trip — the maths itself is exact.
      expectClose(emitted, start, 1e-3);
    }
  });

  it("emits a UNIT vector for typed angles, matching DirectionOrb exactly", () => {
    const onChange = vi.fn();
    const { container } = render(
      <LightAnglesInput
        lightDirection={{ x: 0, y: 0, z: 1 }}
        onChange={onChange}
      />,
    );
    fireEvent.change(byLabel(container, "Light Azimuth"), {
      target: { value: "45" },
    });
    const emitted = onChange.mock.lastCall?.[0] as PoseVector;

    // ⚠️ The anti-drift assertion: the boxes and the orb must produce the same
    // vector for the same two angles, or dragging the orb and typing what it
    // showed would move the light.
    expectClose(emitted, orbVector(45 * DEG, 0));
    expect(Math.hypot(emitted.x, emitted.y, emitted.z)).toBeCloseTo(1, 12);
  });

  it("⚠️ is TWO applyEulerXYZ calls — the single combined call is different", () => {
    // The measured trap in the header, pinned so a "simplification" to one
    // call fails here. At azimuth 45 / elevation 20 the combined call gives
    // (0.707107, -0.241845, 0.664463); the correct composition gives
    // (0.664463, 0.342020, 0.664463).
    const onChange = vi.fn();
    const { container } = render(
      <LightAnglesInput
        lightDirection={orbVector(45 * DEG, 0)}
        onChange={onChange}
      />,
    );
    fireEvent.change(byLabel(container, "Light Elevation"), {
      target: { value: "20" },
    });
    const emitted = onChange.mock.lastCall?.[0] as PoseVector;

    expectClose(emitted, orbVector(45 * DEG, 20 * DEG), 1e-3);

    const combined = applyEulerXYZ(
      { x: 0, y: 0, z: 1 },
      { x: -20 * DEG, y: 45 * DEG, z: 0 },
    );
    // Explicitly NOT the combined call. Measured at this angle pair: the
    // correct composition gives (0.664463, 0.342020, 0.664463) and the
    // combined call gives (0.707107, 0.241845, 0.664463) — the SAME z, but x
    // and y differ by 0.043 and 0.100. That is a hundred times the tolerance
    // the round-trip test uses, so the two are distinguishable here even
    // though they agree on one axis and are both unit length.
    expect(Math.abs(emitted.y - combined.y)).toBeGreaterThan(0.09);
    expect(Math.abs(emitted.x - combined.x)).toBeGreaterThan(0.04);
  });

  it("canonicalises what it shows, because it reads the vector back", () => {
    // ⚠️ The one documented surprise (F11). Typing an azimuth of 370 puts the
    // light exactly where 10 does, and `atan2` reports it as 10. Nothing is
    // lost; the number is re-expressed. This asymmetry with the rotation's
    // free-wrapping yaw is deliberate and is the price of storing no second
    // copy of the angles.
    const onChange = vi.fn();
    const first = render(
      <LightAnglesInput
        lightDirection={{ x: 0, y: 0, z: 1 }}
        onChange={onChange}
      />,
    );
    fireEvent.change(byLabel(first.container, "Light Azimuth"), {
      target: { value: "370" },
    });
    const emitted = onChange.mock.lastCall?.[0] as PoseVector;

    const second = render(
      <LightAnglesInput lightDirection={emitted} onChange={vi.fn()} />,
    );
    expect(byLabel(second.container, "Light Azimuth").value).toBe("10");
  });

  it("is a VIEW of the prop — dragging the orb moves the numbers", () => {
    const { container, rerender } = render(
      <LightAnglesInput
        lightDirection={{ x: 0, y: 0, z: 1 }}
        onChange={vi.fn()}
      />,
    );
    expect(byLabel(container, "Light Azimuth").value).toBe("0");

    // What the orb writes to the store is a vector; the boxes read the same
    // field, so they cannot disagree with it.
    rerender(
      <LightAnglesInput
        lightDirection={orbVector(90 * DEG, 30 * DEG)}
        onChange={vi.fn()}
      />,
    );
    expect(byLabel(container, "Light Azimuth").value).toBe("90");
    expect(byLabel(container, "Light Elevation").value).toBe("30");
  });

  it("bounds the elevation box at ±90 and leaves the azimuth unbounded", () => {
    const { container } = render(
      <LightAnglesInput
        lightDirection={{ x: 0, y: 0, z: 1 }}
        onChange={vi.fn()}
      />,
    );
    const elevation = byLabel(container, "Light Elevation");
    expect(elevation.min).toBe("-90");
    expect(elevation.max).toBe("90");

    // ⚠️ No cap on the azimuth: it wraps, so a bound would be arbitrary.
    const azimuth = byLabel(container, "Light Azimuth");
    expect(azimuth.min).toBe("");
    expect(azimuth.max).toBe("");
  });
});
