/**
 * PoseSection — every story mounts with NO store provider, and each control
 * fires the right callback with the right value (pose-tool task 07).
 *
 * What is pinned:
 *  - each mesh button calls `onSelectMesh` with its own id, not its index.
 *  - framing is DISABLED for a primitive and ENABLED for the mannequin —
 *    MASTER D4, and the reason it is disabled rather than hidden is that the
 *    row must not vanish and shuffle the rail.
 *  - the FOV slider is disabled in orthographic and live in perspective.
 *  - each camera preset button calls `onSelectCameraPreset` with its id.
 *  - each viewpoint button calls `onSetRotation` with the angles FROM
 *    `poseCamera.ts`. This is the anti-drift check: the test reads the same
 *    table the component does, so a re-declared copy in the component would
 *    fail here rather than silently disagree with task 08's camera maths.
 *  - the two orbs are two instances of ONE component (MASTER D13), labelled
 *    Rotation and Light.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { composeStories } from "@storybook/react-vite";
import * as stories from "../PoseSection.stories";
import {
  POSE_CAMERA_PRESETS,
  POSE_VIEWPOINT_ORDER,
  POSE_VIEWPOINT_ROTATIONS,
} from "../../../canvas/pose/poseCamera";

const composed = composeStories(stories);

function buttons(container: HTMLElement, groupLabel: string): HTMLButtonElement[] {
  const group = Array.from(
    container.querySelectorAll(".pose-panel__group"),
  ).find(
    (g) =>
      g.querySelector(".pose-panel__group-label")?.textContent === groupLabel,
  );
  if (!group) throw new Error(`no group labelled ${groupLabel}`);
  return Array.from(group.querySelectorAll<HTMLButtonElement>(".pose-panel__btn"));
}

function byLabel(container: HTMLElement, label: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(`[aria-label="${label}"]`);
  if (!el) throw new Error(`no control labelled ${label}`);
  return el;
}

describe("PoseSection — mounts every story with no provider", () => {
  it("exposes exactly the four stories the task requires", () => {
    expect(Object.keys(composed).sort()).toEqual(
      ["NoMesh", "Primitive", "Mannequin", "Orthographic"].sort(),
    );
  });

  it("renders all six control groups", () => {
    const { container } = render(<composed.Primitive />);
    expect(
      Array.from(container.querySelectorAll(".pose-panel__group-label")).map(
        (el) => el.textContent,
      ),
    ).toEqual(["Model", "Framing", "Rotation & light", "Colours", "Camera"]);
  });

  it("shows the hint and no Clear with no mesh, and the reverse with one", () => {
    const empty = render(<composed.NoMesh />);
    expect(empty.container.querySelector(".pose-panel__hint")).not.toBeNull();
    expect(
      Array.from(empty.container.querySelectorAll("button")).map(
        (b) => b.textContent,
      ),
    ).not.toContain("Clear pose");

    const loaded = render(<composed.Primitive />);
    expect(loaded.container.querySelector(".pose-panel__hint")).toBeNull();
    expect(
      Array.from(loaded.container.querySelectorAll("button")).map(
        (b) => b.textContent,
      ),
    ).toContain("Clear pose");
  });
});

describe("PoseSection — the mesh buttons", () => {
  it("offers the four reference solids and fires each own id", () => {
    const { container } = render(<composed.NoMesh />);
    const onSelectMesh = composed.NoMesh.args.onSelectMesh;
    const row = buttons(container, "Model");

    expect(row.map((b) => b.textContent)).toEqual([
      "Cube",
      "Sphere",
      "Cylinder",
      "Mannequin",
    ]);

    const ids = ["cube", "sphere", "cylinder", "mannequin"];
    row.forEach((button, index) => {
      fireEvent.click(button);
      expect(onSelectMesh).toHaveBeenLastCalledWith(ids[index]);
    });
    expect(onSelectMesh).toHaveBeenCalledTimes(4);
  });

  it("marks the loaded mesh active and no other", () => {
    const { container } = render(<composed.Primitive />);
    const active = buttons(container, "Model").filter((b) =>
      b.className.includes("pose-panel__btn--active"),
    );
    expect(active.map((b) => b.textContent)).toEqual(["Cube"]);
  });
});

describe("PoseSection — framing is mannequin-only (MASTER D4)", () => {
  it("disables every framing button for a primitive, without hiding them", () => {
    const { container } = render(<composed.Primitive />);
    const row = buttons(container, "Framing");

    expect(row.map((b) => b.textContent)).toEqual([
      "Full",
      "Head",
      "Torso",
      "Arm",
      "Leg",
      "Hand",
    ]);
    for (const button of row) expect(button.disabled).toBe(true);
  });

  it("disables them with no mesh at all", () => {
    const { container } = render(<composed.NoMesh />);
    for (const button of buttons(container, "Framing")) {
      expect(button.disabled).toBe(true);
    }
  });

  it("enables them for the mannequin and fires each own id", () => {
    const { container } = render(<composed.Mannequin />);
    const onSelectFraming = composed.Mannequin.args.onSelectFraming;
    const row = buttons(container, "Framing");

    for (const button of row) expect(button.disabled).toBe(false);

    const ids = ["full", "head", "torso", "arm", "leg", "hand"];
    row.forEach((button, index) => {
      fireEvent.click(button);
      expect(onSelectFraming).toHaveBeenLastCalledWith(ids[index]);
    });
  });

  it("marks the selected region active", () => {
    const { container } = render(<composed.Mannequin />);
    const active = buttons(container, "Framing").filter((b) =>
      b.className.includes("pose-panel__btn--active"),
    );
    expect(active.map((b) => b.textContent)).toEqual(["Head"]);
  });
});

describe("PoseSection — the orbs and the viewpoint snaps", () => {
  it("renders TWO instances of the one orb component", () => {
    const { container } = render(<composed.Primitive />);
    expect(
      Array.from(container.querySelectorAll(".direction-orb__sphere")).map((o) =>
        o.getAttribute("aria-label"),
      ),
    ).toEqual(["Rotation", "Light"]);
  });

  it("each viewpoint button fires onSetRotation with poseCamera's angles", () => {
    // ⚠️ The anti-drift check: the expectation is read from the SAME table the
    // component imports. A component that re-declared the angles would pass a
    // hand-written expectation and quietly disagree with task 08.
    const { container } = render(<composed.Primitive />);
    const onSetRotation = composed.Primitive.args.onSetRotation;
    const row = buttons(container, "Rotation & light");

    expect(row).toHaveLength(POSE_VIEWPOINT_ORDER.length);
    expect(row.map((b) => b.textContent)).toEqual([
      "Front",
      "Back",
      "Left",
      "Right",
      "Top",
      "Bottom",
      "3/4",
    ]);

    POSE_VIEWPOINT_ORDER.forEach((id, index) => {
      fireEvent.click(row[index]);
      expect(onSetRotation).toHaveBeenLastCalledWith(
        POSE_VIEWPOINT_ROTATIONS[id],
      );
    });
  });

  it("the rotation orb's handle reflects the incoming rotation prop", () => {
    // Mannequin's rotation is the 3/4 viewpoint: yaw 45°, so the handle sits
    // right of centre rather than at it. This is the controlled contract the
    // viewpoint buttons rely on.
    const three = render(<composed.Mannequin />);
    const front = render(<composed.Primitive />);

    const cx = (c: HTMLElement) =>
      Number(c.querySelector(".direction-orb__handle")?.getAttribute("cx"));

    expect(cx(front.container)).toBeCloseTo(50, 6);
    expect(cx(three.container)).toBeGreaterThan(50);
  });
});

describe("PoseSection — the colour inputs", () => {
  it("shows each colour as hex and emits an opaque RGBA on change", () => {
    const { container } = render(<composed.Primitive />);
    const args = composed.Primitive.args;

    const light = byLabel(container, "Light colour");
    const model = byLabel(container, "Model colour");
    expect(light.value).toBe("#ffffff");
    expect(model.value).toBe("#a0a0a0");

    fireEvent.change(light, { target: { value: "#ff8000" } });
    expect(args.onSetLightColor).toHaveBeenCalledWith({
      r: 255,
      g: 128,
      b: 0,
      a: 255,
    });

    fireEvent.change(model, { target: { value: "#204060" } });
    expect(args.onSetModelColor).toHaveBeenCalledWith({
      r: 32,
      g: 64,
      b: 96,
      a: 255,
    });
  });
});

describe("PoseSection — the camera group", () => {
  it("offers both projections and fires each own id", () => {
    const { container } = render(<composed.Primitive />);
    const onSetProjection = composed.Primitive.args.onSetProjection;
    const row = buttons(container, "Camera");

    const projections = row.slice(0, 2);
    expect(projections.map((b) => b.textContent)).toEqual([
      "Perspective",
      "Orthographic",
    ]);
    expect(projections[0].className).toContain("pose-panel__btn--active");

    fireEvent.click(projections[1]);
    expect(onSetProjection).toHaveBeenLastCalledWith("orthographic");
    fireEvent.click(projections[0]);
    expect(onSetProjection).toHaveBeenLastCalledWith("perspective");
  });

  it("each preset button fires onSelectCameraPreset with poseCamera's id", () => {
    const { container } = render(<composed.Primitive />);
    const onSelectCameraPreset = composed.Primitive.args.onSelectCameraPreset;
    // The camera group is projections (2) then presets (5).
    const presets = buttons(container, "Camera").slice(2);

    expect(presets.map((b) => b.textContent)).toEqual(
      POSE_CAMERA_PRESETS.map((p) => p.label),
    );

    POSE_CAMERA_PRESETS.forEach((preset, index) => {
      fireEvent.click(presets[index]);
      expect(onSelectCameraPreset).toHaveBeenLastCalledWith(preset.id);
    });
    expect(onSelectCameraPreset).toHaveBeenCalledTimes(
      POSE_CAMERA_PRESETS.length,
    );
  });

  it("marks the active preset, from the imported table", () => {
    const { container } = render(<composed.Orthographic />);
    const active = buttons(container, "Camera").filter((b) =>
      b.className.includes("pose-panel__btn--active"),
    );
    expect(active.map((b) => b.textContent)).toEqual([
      "Orthographic",
      "Isometric",
    ]);
  });

  it("the zoom slider is live and reports its value", () => {
    const { container } = render(<composed.Orthographic />);
    const zoom = byLabel(container, "Zoom");
    expect(zoom.disabled).toBe(false);
    expect(zoom.value).toBe("2.5");
    expect(
      container.querySelector(".pose-panel__slider-value")?.textContent,
    ).toBe("2.5×");

    fireEvent.change(zoom, { target: { value: "4" } });
    expect(composed.Orthographic.args.onSetZoom).toHaveBeenCalledWith(4);
  });

  it("disables the FOV slider in orthographic and enables it in perspective", () => {
    const ortho = render(<composed.Orthographic />);
    expect(byLabel(ortho.container, "Field of view").disabled).toBe(true);

    const persp = render(<composed.Primitive />);
    const fov = byLabel(persp.container, "Field of view");
    expect(fov.disabled).toBe(false);
    expect(fov.value).toBe("50");

    fireEvent.change(fov, { target: { value: "75" } });
    expect(composed.Primitive.args.onSetFov).toHaveBeenCalledWith(75);
  });
});

describe("PoseSection — clear", () => {
  it("Clear pose fires onClear", () => {
    const { container } = render(<composed.Primitive />);
    const clear = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Clear pose",
    );
    fireEvent.click(clear!);
    expect(composed.Primitive.args.onClear).toHaveBeenCalledTimes(1);
  });
});
