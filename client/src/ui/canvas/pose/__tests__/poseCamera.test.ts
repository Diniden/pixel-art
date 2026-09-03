/**
 * Tests for the pose camera presets and the auto-fit maths.
 *
 * This whole file runs in the **node** lane with no WebGL and no three, which
 * is the point: the framing maths is where a silent error is most expensive
 * (a model that clips at 45°, or is off-centre on a non-square grid, looks
 * like "the 3D is a bit wrong" rather than like a bug with a location), and
 * keeping it pure is what makes it reachable here at all.
 *
 * The central technique below is {@link projectToNdc} — a tiny reimplementation
 * of the projection the GPU will do, used to assert what actually matters:
 * that every corner of the rotated box lands inside the frame, and that the
 * tight axis lands exactly on the padding boundary.
 */
import { describe, expect, it } from "vitest";
import {
  applyCameraParams,
  applyEulerXYZ,
  boxCorners,
  DEFAULT_FIT_PADDING,
  fitCameraToMesh,
  getCameraPreset,
  orbitDirection,
  POSE_CAMERA_PRESETS,
  POSE_VIEWPOINT_ORDER,
  POSE_VIEWPOINT_ROTATIONS,
  radiansToDegrees,
  TRUE_ISOMETRIC_PITCH_RADIANS,
  worldToView,
  type FitCameraParams,
  type PoseBounds,
  type PoseCameraParams,
} from "@/ui/canvas/pose/poseCamera";
import type { PoseVector } from "@/ui/canvas/pose/poseTypes";

/** The unit box every primitive is normalised into. */
const UNIT: PoseBounds = {
  min: { x: -0.5, y: -0.5, z: -0.5 },
  max: { x: 0.5, y: 0.5, z: 0.5 },
};

const NO_ROTATION: PoseVector = { x: 0, y: 0, z: 0 };

function fit(overrides: Partial<FitCameraParams> = {}): PoseCameraParams {
  return fitCameraToMesh({
    bounds: UNIT,
    canvasWidth: 32,
    canvasHeight: 32,
    projection: "orthographic",
    rotation: NO_ROTATION,
    fov: 45,
    ...overrides,
  });
}

/**
 * Project a model-space point to normalised device coordinates, the way the
 * GPU will.
 *
 * Deliberately an independent reimplementation rather than a call back into
 * the module under test — a fit assertion written with the fit's own
 * arithmetic would pass no matter how wrong that arithmetic is. `|x| <= 1` and
 * `|y| <= 1` is "inside the frame"; the fraction of the frame a corner
 * occupies is `max(|x|, |y|)`.
 */
function projectToNdc(
  point: PoseVector,
  params: PoseCameraParams,
  rotation: PoseVector,
  pitch: number,
  yaw: number,
): { x: number; y: number } {
  const rotated = applyEulerXYZ(point, rotation);
  const relative: PoseVector = {
    x: rotated.x - params.target.x,
    y: rotated.y - params.target.y,
    z: rotated.z - params.target.z,
  };
  const view = worldToView(relative, pitch, yaw);

  if (params.projection === "orthographic") {
    const o = params.orthographic!;
    return { x: view.x / o.right, y: view.y / o.top };
  }

  const p = params.perspective!;
  // Camera sits at +distance along the view axis looking down −Z in view
  // space, so a point's distance in front of it is `distance − view.z`.
  const distance = Math.hypot(
    params.position.x - params.target.x,
    params.position.y - params.target.y,
    params.position.z - params.target.z,
  );
  const depth = distance - view.z;
  const halfHeightAtDepth = depth * Math.tan((p.fov * Math.PI) / 360);
  return {
    x: view.x / (halfHeightAtDepth * p.aspect),
    y: view.y / halfHeightAtDepth,
  };
}

/** The largest |NDC| any corner of `bounds` reaches, per axis and overall. */
function frameOccupancy(
  bounds: PoseBounds,
  params: PoseCameraParams,
  rotation: PoseVector = NO_ROTATION,
  pitch = 0,
  yaw = 0,
): { x: number; y: number; max: number } {
  let mx = 0;
  let my = 0;
  for (const corner of boxCorners(bounds)) {
    const ndc = projectToNdc(corner, params, rotation, pitch, yaw);
    mx = Math.max(mx, Math.abs(ndc.x));
    my = Math.max(my, Math.abs(ndc.y));
  }
  return { x: mx, y: my, max: Math.max(mx, my) };
}

/* ══ the five presets (MASTER D14) ═══════════════════════════════════════ */

describe("POSE_CAMERA_PRESETS", () => {
  it("declares exactly the five ids D14 names, in order", () => {
    expect(POSE_CAMERA_PRESETS.map((p) => p.id)).toEqual([
      "2d",
      "2.5d",
      "iso",
      "top-down",
      "oblique",
    ]);
  });

  it("makes every preset orthographic except oblique", () => {
    const byProjection = Object.fromEntries(
      POSE_CAMERA_PRESETS.map((p) => [p.id, p.projection]),
    );
    expect(byProjection).toEqual({
      "2d": "orthographic",
      "2.5d": "orthographic",
      iso: "orthographic",
      "top-down": "orthographic",
      oblique: "perspective",
    });
  });

  it("puts 2D front-on: pitch 0, yaw 0", () => {
    const preset = getCameraPreset("2d")!;
    expect(preset.pitch).toBe(0);
    expect(preset.yaw).toBe(0);
  });

  it("tilts 2.5D to 30 degrees of pitch with no yaw", () => {
    const preset = getCameraPreset("2.5d")!;
    expect(radiansToDegrees(preset.pitch)).toBeCloseTo(30, 10);
    expect(preset.yaw).toBe(0);
  });

  it("uses the TRUE isometric angle, not the 2:1 dimetric one", () => {
    const preset = getCameraPreset("iso")!;
    expect(radiansToDegrees(preset.pitch)).toBeCloseTo(35.264389682754654, 10);
    expect(radiansToDegrees(preset.yaw)).toBeCloseTo(45, 10);
    // The 2:1 "pixel isometric" angle is atan(1/2) ≈ 26.565° — a DIFFERENT
    // projection, and the one this is most likely to be confused with.
    expect(radiansToDegrees(preset.pitch)).not.toBeCloseTo(26.565, 2);
  });

  it("derives the isometric pitch as atan(1/sqrt(2))", () => {
    expect(TRUE_ISOMETRIC_PITCH_RADIANS).toBeCloseTo(Math.atan(Math.SQRT1_2), 15);
  });

  it("proves the isometric angle foreshortens all three axes equally", () => {
    // The defining property of a true isometric view: the three unit world
    // axes project to screen segments of equal length.
    const { pitch, yaw } = getCameraPreset("iso")!;
    const screenLength = (v: PoseVector) => {
      const view = worldToView(v, pitch, yaw);
      return Math.hypot(view.x, view.y);
    };
    const lx = screenLength({ x: 1, y: 0, z: 0 });
    const ly = screenLength({ x: 0, y: 1, z: 0 });
    const lz = screenLength({ x: 0, y: 0, z: 1 });
    expect(lx).toBeCloseTo(ly, 10);
    expect(ly).toBeCloseTo(lz, 10);
  });

  it("points top-down straight down", () => {
    expect(radiansToDegrees(getCameraPreset("top-down")!.pitch)).toBeCloseTo(90, 10);
  });

  it("gives oblique a 45 degree yaw", () => {
    expect(radiansToDegrees(getCameraPreset("oblique")!.yaw)).toBeCloseTo(45, 10);
  });

  it("returns undefined for an unknown id", () => {
    // Deliberately outside the union — the runtime guard matters because the
    // id can arrive from persisted or hand-edited state.
    expect(getCameraPreset("nope" as never)).toBeUndefined();
  });

  it("gives every preset a non-empty label for the rail", () => {
    for (const preset of POSE_CAMERA_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });
});

/* ══ the viewpoint rotations ═════════════════════════════════════════════ */

describe("POSE_VIEWPOINT_ROTATIONS", () => {
  it("declares the seven viewpoints the request names", () => {
    expect(POSE_VIEWPOINT_ORDER).toEqual([
      "front",
      "back",
      "left",
      "right",
      "top",
      "bottom",
      "three-quarter",
    ]);
    for (const id of POSE_VIEWPOINT_ORDER) {
      expect(POSE_VIEWPOINT_ROTATIONS[id]).toBeDefined();
    }
  });

  it("makes front the identity rotation", () => {
    expect(POSE_VIEWPOINT_ROTATIONS.front).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("makes back a half turn", () => {
    expect(radiansToDegrees(POSE_VIEWPOINT_ROTATIONS.back.y)).toBeCloseTo(180, 10);
  });

  it("makes left and right opposite quarter turns", () => {
    expect(POSE_VIEWPOINT_ROTATIONS.left.y).toBeCloseTo(
      -POSE_VIEWPOINT_ROTATIONS.right.y,
      10,
    );
    expect(Math.abs(radiansToDegrees(POSE_VIEWPOINT_ROTATIONS.left.y))).toBeCloseTo(
      90,
      10,
    );
  });

  it("brings the model's +Y face toward the camera for 'top'", () => {
    // Rotating the model by `top` must swing its up-axis toward +Z (the
    // camera). This is the assertion that catches a sign flip.
    const rotated = applyEulerXYZ({ x: 0, y: 1, z: 0 }, POSE_VIEWPOINT_ROTATIONS.top);
    expect(rotated.z).toBeCloseTo(1, 10);
    expect(rotated.y).toBeCloseTo(0, 10);
  });

  it("brings the model's -Y face toward the camera for 'bottom'", () => {
    const rotated = applyEulerXYZ(
      { x: 0, y: -1, z: 0 },
      POSE_VIEWPOINT_ROTATIONS.bottom,
    );
    expect(rotated.z).toBeCloseTo(1, 10);
  });

  it("shows the model's -X side for 'left'", () => {
    const rotated = applyEulerXYZ({ x: -1, y: 0, z: 0 }, POSE_VIEWPOINT_ROTATIONS.left);
    expect(rotated.z).toBeCloseTo(1, 10);
  });

  it("makes three-quarter show two faces plus a hint of the top", () => {
    const r = POSE_VIEWPOINT_ROTATIONS["three-quarter"];
    expect(radiansToDegrees(r.y)).toBeCloseTo(45, 10);
    // The tip must bring the top surface INTO view, i.e. the model's up-axis
    // must acquire a positive Z (toward the camera). Asserting the visible
    // effect rather than the sign of `r.x` is what makes this test survive a
    // convention change instead of merely restating the data.
    const up = applyEulerXYZ({ x: 0, y: 1, z: 0 }, r);
    expect(up.z).toBeGreaterThan(0);
    // And two side faces stay visible — the yaw has not degenerated to a
    // straight top-down.
    expect(up.y).toBeGreaterThan(0.9);
  });
});

/* ══ applyEulerXYZ / worldToView / orbitDirection ════════════════════════ */

describe("applyEulerXYZ", () => {
  it("leaves a point alone under the identity rotation", () => {
    const v = { x: 1, y: 2, z: 3 };
    const r = applyEulerXYZ(v, NO_ROTATION);
    expect(r.x).toBeCloseTo(1, 12);
    expect(r.y).toBeCloseTo(2, 12);
    expect(r.z).toBeCloseTo(3, 12);
  });

  it("rotates +X to -Z under a +90 degree yaw", () => {
    const r = applyEulerXYZ({ x: 1, y: 0, z: 0 }, { x: 0, y: Math.PI / 2, z: 0 });
    expect(r.x).toBeCloseTo(0, 12);
    expect(r.z).toBeCloseTo(-1, 12);
  });

  it("preserves length", () => {
    const r = applyEulerXYZ({ x: 1, y: 2, z: 3 }, { x: 0.3, y: -1.1, z: 2.2 });
    expect(Math.hypot(r.x, r.y, r.z)).toBeCloseTo(Math.hypot(1, 2, 3), 10);
  });

  it("applies X before Y before Z (order is observable for combined angles)", () => {
    // XYZ and ZYX disagree here; this pins that the module matches three's
    // default Euler order, which is what the model's `rotation` uses.
    const r = applyEulerXYZ(
      { x: 0, y: 0, z: 1 },
      { x: Math.PI / 2, y: Math.PI / 2, z: 0 },
    );
    // Verified against three 0.185.1: Rx(90°) takes (0,0,1) → (0,-1,0), then
    // Ry(90°) leaves that -Y vector alone... in ZYX order. In three's XYZ
    // order the composite is Rz·Ry·Rx, giving (1,0,0). This assertion is the
    // one that distinguishes the two, and it is pinned against the library
    // rather than against a hand derivation.
    expect(r.x).toBeCloseTo(1, 12);
    expect(r.y).toBeCloseTo(0, 12);
    expect(r.z).toBeCloseTo(0, 12);
  });
});

describe("orbitDirection", () => {
  it("puts the camera on +Z at pitch 0, yaw 0", () => {
    const d = orbitDirection(0, 0);
    expect(d.x).toBeCloseTo(0, 12);
    expect(d.y).toBeCloseTo(0, 12);
    expect(d.z).toBeCloseTo(1, 12);
  });

  it("puts the camera overhead at pitch 90", () => {
    const d = orbitDirection(Math.PI / 2, 0);
    expect(d.y).toBeCloseTo(1, 12);
    expect(d.z).toBeCloseTo(0, 12);
  });

  it("swings toward +X for a positive yaw", () => {
    expect(orbitDirection(0, Math.PI / 2).x).toBeCloseTo(1, 12);
  });

  it("always returns a unit vector", () => {
    for (const [pitch, yaw] of [
      [0, 0],
      [0.4, 1.2],
      [-1.1, -2.7],
      [Math.PI / 2, Math.PI / 4],
    ]) {
      const d = orbitDirection(pitch, yaw);
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 12);
    }
  });
});

describe("worldToView", () => {
  it("is the identity at pitch 0, yaw 0", () => {
    const v = worldToView({ x: 1, y: 2, z: 3 }, 0, 0);
    expect(v.x).toBeCloseTo(1, 12);
    expect(v.y).toBeCloseTo(2, 12);
    expect(v.z).toBeCloseTo(3, 12);
  });

  it("maps the orbit direction onto the view's +Z (straight at the camera)", () => {
    for (const [pitch, yaw] of [
      [0.3, 0.9],
      [TRUE_ISOMETRIC_PITCH_RADIANS, Math.PI / 4],
      [Math.PI / 2, 0],
    ]) {
      const view = worldToView(orbitDirection(pitch, yaw), pitch, yaw);
      expect(view.x).toBeCloseTo(0, 10);
      expect(view.y).toBeCloseTo(0, 10);
      expect(view.z).toBeCloseTo(1, 10);
    }
  });

  it("preserves length", () => {
    const v = worldToView({ x: 1, y: -2, z: 0.5 }, 0.7, -1.3);
    expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(Math.hypot(1, -2, 0.5), 10);
  });
});

/* ══ fitCameraToMesh — the auto-fit (MASTER D7) ══════════════════════════ */

describe("fitCameraToMesh", () => {
  it("centres a centred unit box on the origin", () => {
    const params = fit();
    expect(params.target).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("targets the centre of an OFF-centre box, not the origin", () => {
    const params = fit({
      bounds: { min: { x: 2, y: 4, z: -1 }, max: { x: 4, y: 6, z: 1 } },
    });
    expect(params.target.x).toBeCloseTo(3, 12);
    expect(params.target.y).toBeCloseTo(5, 12);
    expect(params.target.z).toBeCloseTo(0, 12);
  });

  it("fills exactly 90% of the frame at the default padding (D7)", () => {
    const params = fit();
    expect(DEFAULT_FIT_PADDING).toBe(0.1);
    const occ = frameOccupancy(UNIT, params);
    expect(occ.max).toBeCloseTo(0.9, 10);
  });

  it("keeps the model INSIDE the frame at 45 degrees of yaw", () => {
    // The regression this whole design exists to prevent: fitting the
    // axis-aligned box and rotating afterwards clips a cube's corners here,
    // because its silhouette is sqrt(2) wide at 45°.
    const rotation = { x: 0, y: Math.PI / 4, z: 0 };
    const params = fit({ rotation });
    const occ = frameOccupancy(UNIT, params, rotation);
    expect(occ.max).toBeLessThanOrEqual(0.9 + 1e-9);
    expect(occ.max).toBeCloseTo(0.9, 10);
  });

  it("keeps the model inside the frame at a fully arbitrary rotation", () => {
    const rotation = { x: 0.83, y: -2.1, z: 0.44 };
    const params = fit({ rotation });
    const occ = frameOccupancy(UNIT, params, rotation);
    expect(occ.max).toBeLessThanOrEqual(0.9 + 1e-9);
  });

  it("grows the frustum for a rotated box rather than clipping it", () => {
    const straight = fit();
    const diagonal = fit({ rotation: { x: 0, y: Math.PI / 4, z: 0 } });
    // A cube at 45° is sqrt(2) wider on screen, so the frustum must widen by
    // the same factor — this is the numeric fingerprint of fitting AS ROTATED.
    expect(diagonal.orthographic!.right / straight.orthographic!.right).toBeCloseTo(
      Math.SQRT2,
      6,
    );
  });

  it("fits the limiting axis on a WIDE canvas", () => {
    const params = fit({ canvasWidth: 64, canvasHeight: 32 });
    const occ = frameOccupancy(UNIT, params);
    // Height is the shorter axis, so it is the one pinned at 90%; width gets
    // the slack and must be comfortably inside.
    expect(occ.y).toBeCloseTo(0.9, 10);
    expect(occ.x).toBeLessThan(0.9);
    expect(occ.x).toBeCloseTo(0.45, 10);
  });

  it("fits the limiting axis on a TALL canvas", () => {
    const params = fit({ canvasWidth: 32, canvasHeight: 64 });
    const occ = frameOccupancy(UNIT, params);
    expect(occ.x).toBeCloseTo(0.9, 10);
    expect(occ.y).toBeLessThan(0.9);
    expect(occ.y).toBeCloseTo(0.45, 10);
  });

  it("never overflows either axis, across a sweep of aspects and rotations", () => {
    for (const [w, h] of [
      [16, 16],
      [64, 16],
      [16, 64],
      [37, 41],
      [128, 9],
    ]) {
      for (const yaw of [0, 0.3, Math.PI / 4, 1.9, -2.6]) {
        const rotation = { x: 0.2, y: yaw, z: 0 };
        const params = fit({ canvasWidth: w, canvasHeight: h, rotation });
        const occ = frameOccupancy(UNIT, params, rotation);
        expect(occ.max).toBeLessThanOrEqual(0.9 + 1e-9);
      }
    }
  });

  it("fits a NON-CUBIC box (a tall thin figure) on its limiting axis", () => {
    const figure: PoseBounds = {
      min: { x: -0.15, y: -0.5, z: -0.1 },
      max: { x: 0.15, y: 0.5, z: 0.1 },
    };
    const params = fitCameraToMesh({
      bounds: figure,
      canvasWidth: 32,
      canvasHeight: 32,
      projection: "orthographic",
      rotation: NO_ROTATION,
      fov: 45,
    });
    const occ = frameOccupancy(figure, params);
    expect(occ.y).toBeCloseTo(0.9, 10);
    expect(occ.x).toBeLessThan(0.9);
  });

  it("changes the fit monotonically with padding", () => {
    const sizes = [0, 0.1, 0.25, 0.5].map(
      (padding) => fit({ padding }).orthographic!.right,
    );
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
    }
    // Zero padding means a perfect fill.
    expect(frameOccupancy(UNIT, fit({ padding: 0 })).max).toBeCloseTo(1, 10);
    // Half padding means half the frame.
    expect(frameOccupancy(UNIT, fit({ padding: 0.5 })).max).toBeCloseTo(0.5, 10);
  });

  it("defaults padding to 10% when it is omitted or non-finite", () => {
    const expected = fit({ padding: DEFAULT_FIT_PADDING }).orthographic!.right;
    expect(fit().orthographic!.right).toBeCloseTo(expected, 12);
    expect(fit({ padding: Number.NaN }).orthographic!.right).toBeCloseTo(expected, 12);
  });

  it("clamps an absurd padding instead of dividing by zero", () => {
    const params = fit({ padding: 1 });
    expect(Number.isFinite(params.orthographic!.right)).toBe(true);
    expect(params.orthographic!.right).toBeGreaterThan(0);
  });

  it("produces a symmetric orthographic frustum matching the canvas aspect", () => {
    const params = fit({ canvasWidth: 48, canvasHeight: 32 });
    const o = params.orthographic!;
    expect(o.right).toBeCloseTo(-o.left, 12);
    expect(o.top).toBeCloseTo(-o.bottom, 12);
    expect(o.right / o.top).toBeCloseTo(48 / 32, 10);
  });

  it("populates only the orthographic parameters when orthographic", () => {
    const params = fit({ projection: "orthographic" });
    expect(params.projection).toBe("orthographic");
    expect(params.orthographic).toBeDefined();
    expect(params.perspective).toBeUndefined();
  });

  it("populates only the perspective parameters when perspective", () => {
    const params = fit({ projection: "perspective", fov: 50 });
    expect(params.projection).toBe("perspective");
    expect(params.perspective).toEqual({ fov: 50, aspect: 1 });
    expect(params.orthographic).toBeUndefined();
  });

  it("fits a perspective camera to 90% too", () => {
    const params = fit({ projection: "perspective", fov: 45 });
    const occ = frameOccupancy(UNIT, params);
    // Perspective makes near corners larger than far ones, so the fit is
    // conservative rather than exact — but it must never overflow, and must
    // not be so conservative the model becomes a speck.
    expect(occ.max).toBeLessThanOrEqual(1);
    expect(occ.max).toBeGreaterThan(0.5);
  });

  it("moves a perspective camera further out for a narrower FOV", () => {
    const distance = (fov: number) => {
      const p = fit({ projection: "perspective", fov });
      return Math.hypot(
        p.position.x - p.target.x,
        p.position.y - p.target.y,
        p.position.z - p.target.z,
      );
    };
    expect(distance(20)).toBeGreaterThan(distance(60));
  });

  it("clamps a nonsense FOV into a usable range", () => {
    expect(fit({ projection: "perspective", fov: 0 }).perspective!.fov).toBeGreaterThan(0);
    expect(fit({ projection: "perspective", fov: 1e6 }).perspective!.fov).toBeLessThan(180);
    expect(
      Number.isFinite(fit({ projection: "perspective", fov: Number.NaN }).perspective!.fov),
    ).toBe(true);
  });

  it("places the camera along the orbit direction at the preset's angles", () => {
    const { pitch, yaw } = getCameraPreset("iso")!;
    const params = fit({ pitch, yaw });
    const offset = {
      x: params.position.x - params.target.x,
      y: params.position.y - params.target.y,
      z: params.position.z - params.target.z,
    };
    const distance = Math.hypot(offset.x, offset.y, offset.z);
    const dir = orbitDirection(pitch, yaw);
    expect(offset.x / distance).toBeCloseTo(dir.x, 10);
    expect(offset.y / distance).toBeCloseTo(dir.y, 10);
    expect(offset.z / distance).toBeCloseTo(dir.z, 10);
  });

  it("frames correctly under EVERY preset's angles", () => {
    for (const preset of POSE_CAMERA_PRESETS) {
      const params = fit({
        projection: preset.projection,
        pitch: preset.pitch,
        yaw: preset.yaw,
      });
      const occ = frameOccupancy(UNIT, params, NO_ROTATION, preset.pitch, preset.yaw);
      expect(occ.max, `preset ${preset.id} overflows`).toBeLessThanOrEqual(1 + 1e-9);
      expect(occ.max, `preset ${preset.id} is too small`).toBeGreaterThan(0.4);
    }
  });

  it("keeps the whole box between the near and far planes", () => {
    for (const projection of ["orthographic", "perspective"] as const) {
      const params = fit({ projection, pitch: 0.5, yaw: 1.2 });
      expect(params.near).toBeGreaterThan(0);
      expect(params.far).toBeGreaterThan(params.near);

      const distance = Math.hypot(
        params.position.x - params.target.x,
        params.position.y - params.target.y,
        params.position.z - params.target.z,
      );
      for (const corner of boxCorners(UNIT)) {
        const view = worldToView(corner, 0.5, 1.2);
        const depth = distance - view.z;
        expect(depth, `${projection} corner in front of near`).toBeGreaterThanOrEqual(
          params.near,
        );
        expect(depth, `${projection} corner behind far`).toBeLessThanOrEqual(params.far);
      }
    }
  });

  it("survives a degenerate zero-volume box without producing NaN", () => {
    const point: PoseBounds = { min: { x: 1, y: 1, z: 1 }, max: { x: 1, y: 1, z: 1 } };
    const params = fitCameraToMesh({
      bounds: point,
      canvasWidth: 32,
      canvasHeight: 32,
      projection: "orthographic",
      rotation: NO_ROTATION,
      fov: 45,
    });
    for (const v of [
      params.near,
      params.far,
      params.position.x,
      params.orthographic!.right,
    ]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(params.orthographic!.right).toBeGreaterThan(0);
    expect(params.far).toBeGreaterThan(params.near);
  });

  it("survives a zero-area canvas by falling back to square", () => {
    const params = fit({ canvasWidth: 0, canvasHeight: 0 });
    expect(Number.isFinite(params.orthographic!.right)).toBe(true);
    expect(params.orthographic!.right).toBeCloseTo(params.orthographic!.top, 12);
  });

  it("is pure — repeated calls with the same input agree exactly", () => {
    expect(fit({ rotation: { x: 0.1, y: 0.2, z: 0.3 } })).toEqual(
      fit({ rotation: { x: 0.1, y: 0.2, z: 0.3 } }),
    );
  });

  it("does not mutate the bounds it is handed", () => {
    const bounds: PoseBounds = {
      min: { x: -1, y: -2, z: -3 },
      max: { x: 1, y: 2, z: 3 },
    };
    const snapshot = JSON.stringify(bounds);
    fit({ bounds });
    expect(JSON.stringify(bounds)).toBe(snapshot);
  });
});

/* ══ applyCameraParams — the one object-touching seam ════════════════════ */

describe("applyCameraParams", () => {
  /** A stand-in three camera: structural, so no GL and no three import. */
  function fakeCamera() {
    const calls: { lookAt: number[][]; updates: number } = { lookAt: [], updates: 0 };
    const camera = {
      position: {
        x: 0,
        y: 0,
        z: 0,
        set(x: number, y: number, z: number) {
          camera.position.x = x;
          camera.position.y = y;
          camera.position.z = z;
        },
      },
      near: 0,
      far: 0,
      fov: undefined as number | undefined,
      aspect: undefined as number | undefined,
      left: undefined as number | undefined,
      right: undefined as number | undefined,
      top: undefined as number | undefined,
      bottom: undefined as number | undefined,
      lookAt(x: number, y: number, z: number) {
        calls.lookAt.push([x, y, z]);
      },
      updateProjectionMatrix() {
        calls.updates += 1;
      },
    };
    return { camera, calls };
  }

  it("writes position, clip planes and the orthographic frustum", () => {
    const { camera, calls } = fakeCamera();
    const params = fit({ canvasWidth: 64, canvasHeight: 32 });
    applyCameraParams(camera, params);

    expect(camera.position.z).toBeCloseTo(params.position.z, 12);
    expect(camera.near).toBe(params.near);
    expect(camera.far).toBe(params.far);
    expect(camera.left).toBe(params.orthographic!.left);
    expect(camera.right).toBe(params.orthographic!.right);
    expect(camera.top).toBe(params.orthographic!.top);
    expect(camera.bottom).toBe(params.orthographic!.bottom);
    // Perspective fields left alone.
    expect(camera.fov).toBeUndefined();
    expect(calls.lookAt).toEqual([[0, 0, 0]]);
    expect(calls.updates).toBe(1);
  });

  it("writes fov and aspect for a perspective camera and leaves the frustum alone", () => {
    const { camera } = fakeCamera();
    applyCameraParams(camera, fit({ projection: "perspective", fov: 50, canvasWidth: 40, canvasHeight: 20 }));
    expect(camera.fov).toBeCloseTo(50, 10);
    expect(camera.aspect).toBeCloseTo(2, 10);
    expect(camera.left).toBeUndefined();
    expect(camera.right).toBeUndefined();
  });

  it("aims at the target, not the origin, for an off-centre box", () => {
    const { camera, calls } = fakeCamera();
    applyCameraParams(
      camera,
      fit({ bounds: { min: { x: 2, y: 2, z: 2 }, max: { x: 3, y: 3, z: 3 } } }),
    );
    expect(calls.lookAt[0][0]).toBeCloseTo(2.5, 12);
    expect(calls.lookAt[0][1]).toBeCloseTo(2.5, 12);
  });

  it("updates the projection matrix AFTER writing the frustum", () => {
    // A camera whose matrix is refreshed before its planes change renders the
    // previous frame's framing — a one-frame lag that is very hard to see.
    const order: string[] = [];
    const camera = {
      position: { set: () => order.push("position") },
      near: 0,
      far: 0,
      set left(_v: number) {
        order.push("left");
      },
      lookAt: () => order.push("lookAt"),
      updateProjectionMatrix: () => order.push("update"),
    };
    applyCameraParams(camera as never, fit());
    expect(order.indexOf("left")).toBeLessThan(order.indexOf("update"));
    expect(order.indexOf("lookAt")).toBeLessThan(order.indexOf("update"));
  });
});
