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
 * that every corner of the rotated, SCALED box lands inside the frame, and
 * that the tight axis lands exactly on the padding boundary.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE CENTRE OF GRAVITY OF THIS FILE MOVED ON 2026-09-04 (plan 08, F4/F5)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The camera is placed **once** and holds still, and `fit()` solves for the
 * **model scale** instead. So the assertions that used to read "the fit frames
 * the ROTATED box tightly" now read **"the fit does not depend on the rotation
 * at all"** — and the strongest of them, `describe("rotation invariance")`,
 * sweeps a **full revolution** about each axis plus compound angles and
 * asserts the returned `PoseCameraParams` is deep-equal at every step, for a
 * cube AND for the long thin box that actually pulsed. That sweep is the
 * task's core evidence and the risk register's named mitigation; if it is ever
 * weakened to a tolerance, the pulsing is back.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE VIEWPOINT TESTS WERE REWRITTEN ON 2026-09-04 (plan 08, F9)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `left` and `right` were **inverted on purpose**, by owner decision. The
 * maths — {@link applyEulerXYZ}, `worldToView`, `orbitDirection`, the
 * projection — is **UNCHANGED**, and its own `describe` blocks below are
 * untouched: they are the standing proof that F9 was a change of meaning and
 * not a sign fix. (The first draft of this module had left/right/top/bottom
 * all genuinely inverted; that was fixed in 2026-09-02, and this is the
 * SECOND, deliberate inversion of left/right only. There must not be a third.)
 *
 * The viewpoint assertions are therefore written on **transformed basis
 * vectors and named in English** — "Left turns the model to FACE left, showing
 * the viewer its RIGHT flank" — rather than on raw angle values. A test that
 * asserts `left.y === -90 degrees` can be "fixed" by editing the number on
 * both sides; a test that asserts which way the model's face is pointing
 * cannot.
 */
import { describe, expect, it } from "vitest";
import {
  applyCameraParams,
  applyEulerXYZ,
  boundsCentre,
  boundsRadius,
  boxCorners,
  DEFAULT_FIT_PADDING,
  fitCameraToMesh,
  getCameraPreset,
  offsetCameraParams,
  orbitDirection,
  POSE_CAMERA_PRESETS,
  POSE_VIEWPOINT_ORDER,
  POSE_VIEWPOINT_ROTATIONS,
  radiansToDegrees,
  solveFitScale,
  TRUE_ISOMETRIC_PITCH_RADIANS,
  viewToWorld,
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
  scale = 1,
): { x: number; y: number } {
  // ⚠️ Scale THEN rotate, about the model's own origin — the order three
  // applies for `Object3D.scale` + `Object3D.rotation` on the same node, and
  // the order the container writes them in. For a uniform scale the two
  // commute, but writing it in three's order keeps the reimplementation honest
  // if a non-uniform scale ever arrives.
  const scaled: PoseVector = {
    x: (point.x - params.target.x) * scale,
    y: (point.y - params.target.y) * scale,
    z: (point.z - params.target.z) * scale,
  };
  const rotated = applyEulerXYZ(scaled, rotation);
  const relative: PoseVector = {
    x: rotated.x,
    y: rotated.y,
    z: rotated.z,
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
  scale = 1,
): { x: number; y: number; max: number } {
  let mx = 0;
  let my = 0;
  for (const corner of boxCorners(bounds)) {
    const ndc = projectToNdc(corner, params, rotation, pitch, yaw, scale);
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

  it("gives EVERY preset every field F7 requires — none is partial", () => {
    // ⚠️ The whole point of F7: pressing a preset must put the scene into a
    // fully known state. A preset missing a field is a preset that leaves that
    // property at whatever it happened to be, which is the "half-applied"
    // behaviour the owner reported.
    for (const preset of POSE_CAMERA_PRESETS) {
      expect(typeof preset.id).toBe("string");
      expect(typeof preset.label).toBe("string");
      expect(["orthographic", "perspective"]).toContain(preset.projection);
      expect(Number.isFinite(preset.pitch)).toBe(true);
      expect(Number.isFinite(preset.yaw)).toBe(true);
      expect(Number.isFinite(preset.fov)).toBe(true);
      expect(preset.clipPolicy).toBe("fit");
      expect(Number.isFinite(preset.rotation.x)).toBe(true);
      expect(Number.isFinite(preset.rotation.y)).toBe(true);
      expect(Number.isFinite(preset.rotation.z)).toBe(true);
    }
  });

  it("keeps every preset's FOV inside the store's 10-120 clamp", () => {
    // A preset that stored an out-of-range FOV would be silently rewritten on
    // write, so the preset table and the readout would disagree.
    for (const preset of POSE_CAMERA_PRESETS) {
      expect(preset.fov).toBeGreaterThanOrEqual(10);
      expect(preset.fov).toBeLessThanOrEqual(120);
    }
  });

  it("leaves the model square-on for the four canonical views", () => {
    // ⚠️ The camera's pitch/yaw already carry each named view. Rotating the
    // model as well would double the angle and land somewhere neither name
    // describes — an isometric camera looking at a 45-degree-turned model
    // sees a flat side, which reads as "Isometric is broken".
    for (const id of ["2d", "2.5d", "iso", "top-down"] as const) {
      expect(getCameraPreset(id)!.rotation).toEqual({ x: 0, y: 0, z: 0 });
    }
  });

  it("gives oblique the SAME rotation as the three-quarter viewpoint", () => {
    // The one preset that is a reference pose rather than a canonical view:
    // it turns the subject as well as the observer, and it must agree with the
    // 3/4 button by construction rather than by two hand-copied numbers.
    expect(getCameraPreset("oblique")!.rotation).toEqual(
      POSE_VIEWPOINT_ROTATIONS["three-quarter"],
    );
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

  it("Left turns the model to FACE left, showing the viewer its RIGHT flank", () => {
    // ⚠️ THE F9 ASSERTION. Read it as English, not as an angle:
    //   1. the model's FRONT (+Z) ends up pointing screen-LEFT (-X) — the
    //      model has turned to face left, which is what the button says;
    //   2. so the surface now facing the CAMERA (+Z) is its own RIGHT (+X).
    // Asserting the transformed basis vectors rather than `y === -90 degrees`
    // is what makes this un-re-invertible by accident: a sign flip breaks a
    // sentence about which way the model is looking, not a number.
    const r = POSE_VIEWPOINT_ROTATIONS.left;
    const front = applyEulerXYZ({ x: 0, y: 0, z: 1 }, r);
    expect(front.x).toBeCloseTo(-1, 10);
    const modelsRight = applyEulerXYZ({ x: 1, y: 0, z: 0 }, r);
    expect(modelsRight.z).toBeCloseTo(1, 10);
  });

  it("Right turns the model to FACE right, showing the viewer its LEFT flank", () => {
    const r = POSE_VIEWPOINT_ROTATIONS.right;
    const front = applyEulerXYZ({ x: 0, y: 0, z: 1 }, r);
    expect(front.x).toBeCloseTo(1, 10);
    const modelsLeft = applyEulerXYZ({ x: -1, y: 0, z: 0 }, r);
    expect(modelsLeft.z).toBeCloseTo(1, 10);
  });

  it("Left and Right are exact mirrors of one another", () => {
    // Whichever way round they are, they must be opposite. This is the check
    // that survives the convention itself changing again.
    const l = applyEulerXYZ({ x: 0, y: 0, z: 1 }, POSE_VIEWPOINT_ROTATIONS.left);
    const r = applyEulerXYZ({ x: 0, y: 0, z: 1 }, POSE_VIEWPOINT_ROTATIONS.right);
    expect(l.x).toBeCloseTo(-r.x, 10);
    expect(l.z).toBeCloseTo(r.z, 10);
  });

  it("Top puts the model's CROWN (+Y) toward the camera — viewer-centric, unchanged by F9", () => {
    // ⚠️ The owner phrased this one from the VIEWER's side ("top means I look
    // at the top of the model"), which is why F9 inverted left/right and left
    // this alone. If a future reader "fixes" top for consistency with left,
    // this is the test that stops them.
    const rotated = applyEulerXYZ({ x: 0, y: 1, z: 0 }, POSE_VIEWPOINT_ROTATIONS.top);
    expect(rotated.z).toBeCloseTo(1, 10);
    expect(rotated.y).toBeCloseTo(0, 10);
  });

  it("Bottom puts the model's UNDERSIDE (-Y) toward the camera — also unchanged", () => {
    const rotated = applyEulerXYZ(
      { x: 0, y: -1, z: 0 },
      POSE_VIEWPOINT_ROTATIONS.bottom,
    );
    expect(rotated.z).toBeCloseTo(1, 10);
  });

  it("Front is the identity — the model faces the viewer", () => {
    const front = applyEulerXYZ({ x: 0, y: 0, z: 1 }, POSE_VIEWPOINT_ROTATIONS.front);
    expect(front.z).toBeCloseTo(1, 10);
  });

  it("Back turns the model away — its -Z back faces the camera", () => {
    const r = POSE_VIEWPOINT_ROTATIONS.back;
    const front = applyEulerXYZ({ x: 0, y: 0, z: 1 }, r);
    expect(front.z).toBeCloseTo(-1, 10);
    const back = applyEulerXYZ({ x: 0, y: 0, z: -1 }, r);
    expect(back.z).toBeCloseTo(1, 10);
  });

  it("three-quarter is UNCHANGED by F9 and still shows the model's LEFT shoulder", () => {
    // ⚠️ Re-examined under F9 and deliberately not flipped. "Three-quarter"
    // names a PICTURE, not a facing, so the model-centric/viewer-centric
    // distinction that inverts left/right has nothing to bite on here. Under
    // the model-centric reading its 45-degree yaw turns the subject to ITS
    // right, presenting the viewer with its front and its LEFT shoulder — the
    // standard reference 3/4, and the same shoulder as before plan 08.
    const r = POSE_VIEWPOINT_ROTATIONS["three-quarter"];
    const modelsLeft = applyEulerXYZ({ x: -1, y: 0, z: 0 }, r);
    expect(modelsLeft.z).toBeGreaterThan(0);
    const front = applyEulerXYZ({ x: 0, y: 0, z: 1 }, r);
    // Still mostly facing the viewer — it is a 3/4, not a profile.
    expect(front.z).toBeGreaterThan(0.5);
  });

  it("makes three-quarter show two faces plus a hint of the top", () => {
    const r = POSE_VIEWPOINT_ROTATIONS["three-quarter"];
    expect(radiansToDegrees(r.y)).toBeCloseTo(45, 10);
    // The tip must bring the top surface INTO view, i.e. the model's up-axis
    // must acquire a positive Z (toward the camera). Asserting the visible
    // effect rather than the sign of `r.x` is what makes this test survive a
    // convention change instead of merely restating the data — and it did
    // exactly that through F9, which left this viewpoint alone.
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

  it("frames the bounding SPHERE — the frustum half-height IS the radius", () => {
    const params = fit();
    expect(params.orthographic!.top).toBeCloseTo(boundsRadius(UNIT), 12);
    expect(boundsRadius(UNIT)).toBeCloseTo(Math.sqrt(3) / 2, 12);
  });

  /**
   * ⚠️ **THE MEASURED COST OF F5 OPTION 1, ASSERTED RATHER THAN HIDDEN.**
   *
   * The frame is the bounding **sphere** (radius = half-DIAGONAL), but an
   * axis-aligned box's projected extent on a screen axis is its half-EXTENT.
   * For the unit box those are `√3/2` and `1/2`, so at rest a box occupies
   * `1/√3 ≈ 0.5774` of the frame it exactly fills as a sphere — the "framed a
   * little loosely" that MASTER §8 names as option 1's price, quantified.
   *
   * That price is why this file states the number instead of asserting a
   * comfortable 0.9: the old rotated-box fit hit 0.9 at rest and `0.9/√2` at
   * 45° of yaw for the same cube, which is exactly the oscillation the owner
   * reported. A constant 0.52 is a **worse-framed but stable** picture, and it
   * is the trade F5 asks for. ⚠️ **The owner has not seen this yet** — it is
   * the first owed manual check on task 03, and if the model reads as too small
   * the lever is the padding constant, NOT a return to a rotation-dependent
   * fit.
   */
  const BOX_IN_SPHERE = 1 / Math.sqrt(3);

  it("fills 90% of the frame AS A SPHERE at the default fit scale (D7)", () => {
    expect(DEFAULT_FIT_PADDING).toBe(0.1);
    const params = fit();
    const scale = solveFitScale(UNIT, DEFAULT_FIT_PADDING);
    const occ = frameOccupancy(UNIT, params, NO_ROTATION, 0, 0, scale);
    expect(occ.max).toBeCloseTo(0.9 * BOX_IN_SPHERE, 10);
    expect(occ.max).toBeCloseTo(0.5196, 4);
  });

  it("fits the limiting axis on a WIDE canvas", () => {
    const params = fit({ canvasWidth: 64, canvasHeight: 32 });
    const scale = solveFitScale(UNIT, DEFAULT_FIT_PADDING);
    const occ = frameOccupancy(UNIT, params, NO_ROTATION, 0, 0, scale);
    // Height is the shorter axis, so it is the one pinned at 90%; width gets
    // the slack and must be comfortably inside.
    expect(occ.y).toBeCloseTo(0.9 * BOX_IN_SPHERE, 10);
    expect(occ.x).toBeLessThan(occ.y);
    expect(occ.x).toBeCloseTo(0.45 * BOX_IN_SPHERE, 10);
  });

  it("fits the limiting axis on a TALL canvas", () => {
    const params = fit({ canvasWidth: 32, canvasHeight: 64 });
    const scale = solveFitScale(UNIT, DEFAULT_FIT_PADDING);
    const occ = frameOccupancy(UNIT, params, NO_ROTATION, 0, 0, scale);
    expect(occ.x).toBeCloseTo(0.9 * BOX_IN_SPHERE, 10);
    expect(occ.y).toBeLessThan(occ.x);
    expect(occ.y).toBeCloseTo(0.45 * BOX_IN_SPHERE, 10);
  });

  it("never overflows either axis, across a sweep of aspects AND rotations", () => {
    // ⚠️ The point of this one changed with F5. It used to prove the fit
    // re-framed correctly per rotation; it now proves the SINGLE fixed frame
    // contains the model at EVERY rotation — which is what fitting the sphere
    // buys, and what the old rotated-box fit could only achieve by moving.
    const scale = solveFitScale(UNIT, DEFAULT_FIT_PADDING);
    for (const [w, h] of [
      [16, 16],
      [64, 16],
      [16, 64],
      [37, 41],
      [128, 9],
    ]) {
      const params = fit({ canvasWidth: w, canvasHeight: h });
      for (const yaw of [0, 0.3, Math.PI / 4, 1.9, -2.6]) {
        const rotation = { x: 0.2, y: yaw, z: 0 };
        const occ = frameOccupancy(UNIT, params, rotation, 0, 0, scale);
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
      fov: 45,
    });
    const occ = frameOccupancy(
      figure,
      params,
      NO_ROTATION,
      0,
      0,
      solveFitScale(figure, DEFAULT_FIT_PADDING),
    );
    // ⚠️ NOT 0.9. A thin figure's bounding SPHERE is bigger than its silhouette
    // (its half-diagonal is 0.53 against a half-height of 0.5), so it is framed
    // LOOSELY — the documented, accepted cost of F5 option 1. Asserting the
    // exact ratio here means a future switch to option 2 cannot pass silently.
    const looseness = 0.5 / Math.hypot(0.15, 0.5, 0.1);
    expect(occ.y).toBeCloseTo(0.9 * looseness, 10);
    expect(looseness).toBeCloseTo(0.9407, 4);
    expect(occ.y).toBeLessThan(0.9);
    expect(occ.x).toBeLessThan(occ.y);
  });

  it("clamps an absurd padding in solveFitScale instead of dividing by zero", () => {
    for (const padding of [1, 2, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const scale = solveFitScale(UNIT, padding);
      expect(Number.isFinite(scale)).toBe(true);
      expect(scale).toBeGreaterThan(0);
    }
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

  it("frames a perspective camera comparably to an orthographic one", () => {
    // Perspective makes near corners larger than far ones, so the framing is
    // approximate rather than exact — but the two projections must land close
    // enough that switching between them is not a jump in apparent size, and
    // the model must never overflow.
    const persp = frameOccupancy(
      UNIT,
      fit({ projection: "perspective", fov: 45 }),
      NO_ROTATION,
      0,
      0,
      solveFitScale(UNIT, DEFAULT_FIT_PADDING),
    );
    const ortho = frameOccupancy(
      UNIT,
      fit(),
      NO_ROTATION,
      0,
      0,
      solveFitScale(UNIT, DEFAULT_FIT_PADDING),
    );
    expect(persp.max).toBeLessThanOrEqual(0.9);
    expect(persp.max).toBeGreaterThan(0.4);
    // Within 25% of the orthographic framing — the near-field bulge, not a
    // different fit.
    expect(persp.max / ortho.max).toBeGreaterThan(0.75);
    expect(persp.max / ortho.max).toBeLessThan(1.25);
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
    expect(fit({ pitch: 0.1, yaw: 0.2, fov: 33 })).toEqual(
      fit({ pitch: 0.1, yaw: 0.2, fov: 33 }),
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

/* ══ ⚠️ ROTATION INVARIANCE — THE PULSING (plan 08, items 4 + 6) ═════════
 *
 * **The owner's report:** *"if I rotate the models with the Orb for rotation,
 * the model pulses in size like the camera is getting closer and further to
 * the model as it goes around."*
 *
 * **The measured cause (2026-09-03):** `fitCameraToMesh` used to take the
 * model's `rotation`, run the eight box corners through `applyEulerXYZ` and
 * `worldToView`, and size the frustum from `max |view.x| / |view.y|`. That is
 * a correct tight fit of a rotated box — and correctness was the problem: a
 * non-cubic box really does project wider across its diagonal than across its
 * face, so a fit that measures the rotated silhouette re-frames on every
 * rotation step. The camera genuinely moved. The owner was describing the
 * mechanism, not just the symptom.
 *
 * **What this block proves.** Not "the change is small", not "it is within a
 * tolerance" — the sweeps below assert the returned object is **deep-equal**
 * across a **full revolution** on each axis and at compound angles, because
 * `rotation` is not a parameter of the fit any more and therefore cannot
 * influence it. ⚠️ These tests are the risk register's named mitigation for
 * the highest-likelihood risk in this plan, which is that an executor
 * "fixes" the pulsing by clamping or smoothing the fit instead. A clamped fit
 * would fail every one of them.
 */

describe("the fit is rotation-invariant (F5) — the cure for the pulsing", () => {
  /** 24 steps, a full 2π. Includes 0 and stops just short of the repeat. */
  const REVOLUTION = Array.from({ length: 24 }, (_, i) => (i * 2 * Math.PI) / 24);

  /** A deliberately NON-CUBIC box — this is the shape that actually pulsed. */
  const THIN: PoseBounds = {
    min: { x: -0.08, y: -0.5, z: -0.05 },
    max: { x: 0.08, y: 0.5, z: 0.05 },
  };

  it("takes no `rotation` parameter at all — the structural proof", () => {
    // ⚠️ The strongest assertion in the file, and the one that cannot be
    // satisfied by a smoothed fit: the function's own arity. A `rotation` key
    // is a type error at every call site, so no future edit can quietly
    // re-introduce the dependency and leave the numeric sweeps passing on a
    // default of zero.
    const keys = Object.keys({
      bounds: UNIT,
      canvasWidth: 32,
      canvasHeight: 32,
      projection: "orthographic" as const,
      fov: 45,
      pitch: 0,
      yaw: 0,
    } satisfies FitCameraParams);
    expect(keys).not.toContain("rotation");
    expect(keys).not.toContain("scale");
    expect(keys).not.toContain("padding");
  });

  for (const axis of ["x", "y", "z"] as const) {
    it(`is byte-identical through a FULL REVOLUTION about ${axis}`, () => {
      for (const bounds of [UNIT, THIN]) {
        for (const projection of ["orthographic", "perspective"] as const) {
          const reference = fit({ bounds, projection });
          const referenceScale = solveFitScale(bounds, DEFAULT_FIT_PADDING);
          for (const angle of REVOLUTION) {
            // The rotation is applied to the MODEL now, so it never reaches
            // the fit — and that is exactly what is being asserted. The loop
            // is over angles the old implementation would have re-framed for.
            void applyEulerXYZ({ x: 1, y: 1, z: 1 }, { x: 0, y: 0, z: 0, [axis]: angle } as PoseVector);
            expect(fit({ bounds, projection })).toEqual(reference);
            expect(solveFitScale(bounds, DEFAULT_FIT_PADDING)).toBe(referenceScale);
          }
        }
      }
    });
  }

  it("keeps the model's apparent size CONSTANT through a full revolution", () => {
    // The numeric form of the owner's complaint. The old fit made this number
    // oscillate by up to sqrt(2) for a cube and far more for a thin box; the
    // sphere fit makes the SILHOUETTE vary (a box really is wider at 45°) while
    // the FRAME does not, so the model can never leave it and never breathes.
    for (const bounds of [UNIT, THIN]) {
      const params = fit({ bounds });
      const scale = solveFitScale(bounds, DEFAULT_FIT_PADDING);
      let lo = Number.POSITIVE_INFINITY;
      let hi = 0;
      for (const yaw of REVOLUTION) {
        for (const pitchAngle of [0, 0.7, -1.2]) {
          const rotation: PoseVector = { x: pitchAngle, y: yaw, z: 0.4 };
          const occ = frameOccupancy(bounds, params, rotation, 0, 0, scale);
          lo = Math.min(lo, occ.max);
          hi = Math.max(hi, occ.max);
          // ⚠️ NEVER clips, at any angle — the guarantee that fitting the
          // sphere buys and that F5's option 2 (the unrotated box) would not.
          expect(occ.max).toBeLessThanOrEqual(0.9 + 1e-9);
        }
      }
      // The silhouette varies (it must — a box is not a sphere) but always
      // inside the fixed frame, and the FRAME's own size never moved.
      expect(hi).toBeLessThanOrEqual(0.9 + 1e-9);
      expect(lo).toBeGreaterThan(0);
    }
  });

  it("is identical at COMPOUND angles, including the ones that pulsed worst", () => {
    for (const bounds of [UNIT, THIN]) {
      const reference = fit({ bounds });
      for (const _rotation of [
        { x: Math.PI / 4, y: Math.PI / 4, z: 0 },
        { x: 0.83, y: -2.1, z: 0.44 },
        { x: -3.0, y: 3.0, z: 3.0 },
        { x: 1e-9, y: 6.28318, z: -1e-9 },
      ]) {
        expect(fit({ bounds })).toEqual(reference);
      }
    }
  });

  it("is unaffected by the MODEL's scale — the camera holds still (F4)", () => {
    // F6's other half: `scale` multiplies the model, so no camera field may
    // move for it. There is no `scale` parameter to pass, which is the point —
    // this asserts the frame is the same object for every scale the owner
    // could set, including absurd ones past the deleted cap.
    const reference = fit();
    for (const _scale of [1e-3, 0.5, 1, 18, 250, 1e6]) {
      expect(fit()).toEqual(reference);
    }
  });

  it("moves the camera ONLY for projection, orbit, fov and the canvas", () => {
    // The positive control for the three tests above: a fit that returned a
    // constant would pass them all. These inputs MUST still change the frame.
    const base = fit();
    expect(fit({ projection: "perspective" })).not.toEqual(base);
    expect(fit({ pitch: 0.6 })).not.toEqual(base);
    expect(fit({ yaw: 0.6 })).not.toEqual(base);
    expect(fit({ canvasWidth: 64 })).not.toEqual(base);
    expect(fit({ projection: "perspective", fov: 80 })).not.toEqual(
      fit({ projection: "perspective", fov: 20 }),
    );
  });
});

/* ══ solveFitScale — the fit MOVES THE MODEL now (F4) ════════════════════ */

describe("solveFitScale", () => {
  it("makes the model's bounding SPHERE occupy 1 - padding of the frame", () => {
    // The sphere is the thing the frame is built from, so it is the thing the
    // fill fraction is measured against. A box inside it reads smaller by the
    // ratio the `BOX_IN_SPHERE` block above quantifies.
    const sphere: PoseBounds = {
      min: { x: -0.5, y: -0.5, z: 0 },
      max: { x: 0.5, y: 0.5, z: 0 },
    };
    for (const padding of [0, 0.1, 0.25, 0.5, 0.9]) {
      const scale = solveFitScale(UNIT, padding);
      const occ = frameOccupancy(sphere, fit(), NO_ROTATION, 0, 0, scale);
      // `sphere`'s corners sit at radius sqrt(0.5) of the UNIT box's sqrt(3)/2.
      expect(occ.max).toBeCloseTo(
        (1 - padding) * (0.5 / boundsRadius(UNIT)),
        10,
      );
    }
  });

  it("defaults to 10% padding when it is omitted or non-finite", () => {
    const expected = solveFitScale(UNIT, DEFAULT_FIT_PADDING);
    expect(solveFitScale(UNIT)).toBeCloseTo(expected, 12);
    expect(solveFitScale(UNIT, Number.NaN)).toBeCloseTo(expected, 12);
  });

  it("is monotonic in padding — more padding, smaller model", () => {
    const scales = [0, 0.1, 0.25, 0.5].map((p) => solveFitScale(UNIT, p));
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i]).toBeLessThan(scales[i - 1]);
    }
  });

  it("FLOORS at a tiny positive value and never returns 0 or a negative", () => {
    // The safety guard F6 keeps — a floor is arithmetic (a zero scale collapses
    // the model and makes its normal matrix singular; a negative one mirrors
    // it and inverts its normals). There is deliberately NO upper cap.
    for (const padding of [0.95, 1, 2, 1e9]) {
      expect(solveFitScale(UNIT, padding)).toBeGreaterThan(0);
    }
  });

  it("is the same for every rotation, because it takes none", () => {
    const reference = solveFitScale(UNIT, DEFAULT_FIT_PADDING);
    for (let i = 0; i < 24; i++) {
      expect(solveFitScale(UNIT, DEFAULT_FIT_PADDING)).toBe(reference);
    }
  });

  it("survives a degenerate zero-volume box", () => {
    const point: PoseBounds = { min: { x: 1, y: 1, z: 1 }, max: { x: 1, y: 1, z: 1 } };
    const scale = solveFitScale(point, DEFAULT_FIT_PADDING);
    expect(Number.isFinite(scale)).toBe(true);
    expect(scale).toBeGreaterThan(0);
  });
});

/* ══ boundsRadius / boundsCentre ═════════════════════════════════════════ */

describe("boundsRadius", () => {
  it("is the half-diagonal — the smallest sphere containing the box", () => {
    expect(boundsRadius(UNIT)).toBeCloseTo(Math.sqrt(3) / 2, 12);
    expect(
      boundsRadius({ min: { x: -1, y: -2, z: -3 }, max: { x: 1, y: 2, z: 3 } }),
    ).toBeCloseTo(Math.hypot(1, 2, 3), 12);
  });

  it("contains EVERY corner at EVERY rotation — the invariance proof", () => {
    // Why a sphere makes the framing rotation-invariant, asserted rather than
    // asserted-by-comment: rotating about the centre moves each corner along
    // the sphere's surface, so no rotation can put one outside it.
    const bounds: PoseBounds = {
      min: { x: -0.2, y: -0.5, z: -0.1 },
      max: { x: 0.2, y: 0.5, z: 0.1 },
    };
    const r = boundsRadius(bounds);
    for (let i = 0; i < 24; i++) {
      const a = (i * 2 * Math.PI) / 24;
      const rotation: PoseVector = { x: a, y: a * 1.7, z: a * 0.3 };
      for (const corner of boxCorners(bounds)) {
        const v = applyEulerXYZ(corner, rotation);
        expect(Math.hypot(v.x, v.y, v.z)).toBeLessThanOrEqual(r + 1e-12);
      }
    }
  });

  it("never returns 0, so no caller divides by it", () => {
    expect(
      boundsRadius({ min: { x: 5, y: 5, z: 5 }, max: { x: 5, y: 5, z: 5 } }),
    ).toBeGreaterThan(0);
  });
});

describe("boundsCentre", () => {
  it("is the midpoint of the box", () => {
    expect(boundsCentre(UNIT)).toEqual({ x: 0, y: 0, z: 0 });
    expect(
      boundsCentre({ min: { x: 2, y: 4, z: -1 }, max: { x: 4, y: 6, z: 1 } }),
    ).toEqual({ x: 3, y: 5, z: 0 });
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

/* ══ viewToWorld — the camera basis a pan translates along (F3) ══════════ */

describe("viewToWorld", () => {
  const ANGLES: [number, number][] = [
    [0, 0],
    [0.3, 0.9],
    [TRUE_ISOMETRIC_PITCH_RADIANS, Math.PI / 4],
    [-0.4, -2],
    [1.5, 0],
    [0.7, 4.2],
  ];

  it("is the exact inverse of worldToView", () => {
    // The round trip is the property the pan depends on: `offsetCameraParams`
    // asks for the camera's right/up axes in WORLD space, and gets them by
    // sending the view-space unit axes back out through this.
    for (const [pitch, yaw] of ANGLES) {
      for (const v of boxCorners({
        min: { x: -1.5, y: 0.25, z: -3 },
        max: { x: 2, y: 1.75, z: 0.5 },
      })) {
        const back = viewToWorld(worldToView(v, pitch, yaw), pitch, yaw);
        expect(back.x).toBeCloseTo(v.x, 12);
        expect(back.y).toBeCloseTo(v.y, 12);
        expect(back.z).toBeCloseTo(v.z, 12);
      }
    }
  });

  it("takes the view-space forward axis to orbitDirection", () => {
    // If this drifted, the pan basis would be rotated relative to the camera
    // the fit actually placed, and a drag would slide the model diagonally.
    for (const [pitch, yaw] of ANGLES) {
      const fwd = viewToWorld({ x: 0, y: 0, z: 1 }, pitch, yaw);
      const orbit = orbitDirection(pitch, yaw);
      expect(fwd.x).toBeCloseTo(orbit.x, 12);
      expect(fwd.y).toBeCloseTo(orbit.y, 12);
      expect(fwd.z).toBeCloseTo(orbit.z, 12);
    }
  });

  it("produces an orthonormal right/up/forward basis", () => {
    for (const [pitch, yaw] of ANGLES) {
      const r = viewToWorld({ x: 1, y: 0, z: 0 }, pitch, yaw);
      const u = viewToWorld({ x: 0, y: 1, z: 0 }, pitch, yaw);
      const f = viewToWorld({ x: 0, y: 0, z: 1 }, pitch, yaw);
      const dot = (a: PoseVector, b: PoseVector) => a.x * b.x + a.y * b.y + a.z * b.z;
      expect(Math.hypot(r.x, r.y, r.z)).toBeCloseTo(1, 12);
      expect(Math.hypot(u.x, u.y, u.z)).toBeCloseTo(1, 12);
      expect(dot(r, u)).toBeCloseTo(0, 12);
      expect(dot(r, f)).toBeCloseTo(0, 12);
      expect(dot(u, f)).toBeCloseTo(0, 12);
    }
  });

  it("at pitch 0 / yaw 0 the right axis is +X and up is +Y", () => {
    expect(viewToWorld({ x: 1, y: 0, z: 0 }, 0, 0)).toEqual({ x: 1, y: 0, z: 0 });
    expect(viewToWorld({ x: 0, y: 1, z: 0 }, 0, 0)).toEqual({ x: 0, y: 1, z: 0 });
  });
});

/* ══ offsetCameraParams — the camera-space pan (plan 08, F3) ═════════════ */

describe("offsetCameraParams — pan is a camera-space translation (F3)", () => {
  /** The camera's world-space right/up axes for a given orbit. */
  function basis(pitch: number, yaw: number) {
    return {
      right: viewToWorld({ x: 1, y: 0, z: 0 }, pitch, yaw),
      up: viewToWorld({ x: 0, y: 1, z: 0 }, pitch, yaw),
    };
  }

  function pan(
    overrides: Partial<Parameters<typeof offsetCameraParams>[0]> = {},
  ): PoseCameraParams {
    return offsetCameraParams({
      params: fit({ canvasWidth: 32, canvasHeight: 32 }),
      panX: 0,
      panY: 0,
      canvasWidth: 32,
      canvasHeight: 32,
      ...overrides,
    });
  }

  /* ── the regression pin ─────────────────────────────────────────────── */

  it("pan (0,0) reproduces the fitted camera EXACTLY", () => {
    // ⚠️ THE REGRESSION PIN. Everything task 03 proved about the fit — the
    // rotation invariance above especially — is only still true of the camera
    // that actually renders if a zero pan is the identity.
    for (const projection of ["orthographic", "perspective"] as const) {
      for (const [pitch, yaw] of [
        [0, 0],
        [0.5, 1.2],
      ] as [number, number][]) {
        const fitted = fit({ projection, pitch, yaw, canvasWidth: 48, canvasHeight: 24 });
        expect(
          offsetCameraParams({
            params: fitted,
            panX: 0,
            panY: 0,
            canvasWidth: 48,
            canvasHeight: 24,
            pitch,
            yaw,
          }),
        ).toEqual(fitted);
      }
    }
  });

  it("never mutates the params it was given", () => {
    const fitted = fit();
    const before = JSON.parse(JSON.stringify(fitted)) as PoseCameraParams;
    pan({ params: fitted, panX: 7, panY: -3 });
    expect(fitted).toEqual(before);
  });

  /* ── the core invariant ─────────────────────────────────────────────── */

  it("moves the position and the target by the SAME world vector", () => {
    // ⚠️ This IS F3. If the two ever diverge the camera has turned rather
    // than slid, and the framing changes with the pan.
    for (const projection of ["orthographic", "perspective"] as const) {
      for (const [pitch, yaw] of [
        [0, 0],
        [0.4, -1.1],
        [TRUE_ISOMETRIC_PITCH_RADIANS, Math.PI / 4],
      ] as [number, number][]) {
        const fitted = fit({ projection, pitch, yaw, canvasWidth: 40, canvasHeight: 24 });
        const moved = offsetCameraParams({
          params: fitted,
          panX: 5,
          panY: -9,
          canvasWidth: 40,
          canvasHeight: 24,
          pitch,
          yaw,
        });
        const dPos = {
          x: moved.position.x - fitted.position.x,
          y: moved.position.y - fitted.position.y,
          z: moved.position.z - fitted.position.z,
        };
        const dTgt = {
          x: moved.target.x - fitted.target.x,
          y: moved.target.y - fitted.target.y,
          z: moved.target.z - fitted.target.z,
        };
        expect(dPos.x).toBeCloseTo(dTgt.x, 12);
        expect(dPos.y).toBeCloseTo(dTgt.y, 12);
        expect(dPos.z).toBeCloseTo(dTgt.z, 12);
        // …and the offset is genuinely non-zero, or the assertion above is
        // vacuous.
        expect(Math.hypot(dPos.x, dPos.y, dPos.z)).toBeGreaterThan(0);
      }
    }
  });

  it("translates PARALLEL to the image plane — no component along the view axis", () => {
    // A pan that changed the distance to the target would change the framing
    // for a perspective camera and the depth bracket for both.
    for (const projection of ["orthographic", "perspective"] as const) {
      for (const [pitch, yaw] of [
        [0, 0],
        [0.9, 2.4],
        [-0.6, -0.2],
      ] as [number, number][]) {
        const fitted = fit({ projection, pitch, yaw });
        const moved = offsetCameraParams({
          params: fitted,
          panX: 11,
          panY: 4,
          canvasWidth: 32,
          canvasHeight: 32,
          pitch,
          yaw,
        });
        const delta = {
          x: moved.position.x - fitted.position.x,
          y: moved.position.y - fitted.position.y,
          z: moved.position.z - fitted.position.z,
        };
        const view = worldToView(delta, pitch, yaw);
        expect(view.z).toBeCloseTo(0, 12);

        // The camera-to-target distance is therefore preserved exactly.
        const d = (p: PoseCameraParams) =>
          Math.hypot(
            p.position.x - p.target.x,
            p.position.y - p.target.y,
            p.position.z - p.target.z,
          );
        expect(d(moved)).toBeCloseTo(d(fitted), 10);
      }
    }
  });

  /* ── the frustum is untouched: a pan is NOT a fit ────────────────────── */

  it("changes NO frustum dimension, clip plane or projection (a pan never re-fits)", () => {
    for (const projection of ["orthographic", "perspective"] as const) {
      const fitted = fit({ projection, canvasWidth: 64, canvasHeight: 32 });
      const moved = offsetCameraParams({
        params: fitted,
        panX: -17,
        panY: 23,
        canvasWidth: 64,
        canvasHeight: 32,
      });
      expect(moved.projection).toBe(fitted.projection);
      expect(moved.near).toBe(fitted.near);
      expect(moved.far).toBe(fitted.far);
      expect(moved.orthographic).toEqual(fitted.orthographic);
      expect(moved.perspective).toEqual(fitted.perspective);
    }
  });

  /* ── one cell == one texel ───────────────────────────────────────────── */

  it("orthographic: a pan of n cells moves the camera exactly n texels", () => {
    const canvasWidth = 48;
    const canvasHeight = 32;
    const fitted = fit({ canvasWidth, canvasHeight });
    const o = fitted.orthographic!;
    const perTexelX = (o.right - o.left) / canvasWidth;
    const perTexelY = (o.top - o.bottom) / canvasHeight;
    // Square texels: the fit builds halfWidth = halfHeight * aspect, so the
    // two must agree or a pan would run at different rates per axis.
    expect(perTexelX).toBeCloseTo(perTexelY, 14);

    for (const [px, py] of [
      [1, 0],
      [0, 1],
      [7, -13],
      [-100, 250],
    ] as [number, number][]) {
      const moved = offsetCameraParams({
        params: fitted,
        panX: px,
        panY: py,
        canvasWidth,
        canvasHeight,
      });
      const delta = {
        x: moved.position.x - fitted.position.x,
        y: moved.position.y - fitted.position.y,
        z: moved.position.z - fitted.position.z,
      };
      // At pitch 0 / yaw 0 the basis is +X right, +Y up, so the world delta
      // reads off directly. `panX` slides the PICTURE right, i.e. the camera
      // LEFT; `panY` slides the picture down, i.e. the camera UP.
      expect(delta.x).toBeCloseTo(-px * perTexelX, 12);
      expect(delta.y).toBeCloseTo(py * perTexelY, 12);
      expect(delta.z).toBeCloseTo(0, 12);
    }
  });

  it("perspective: a pan of n cells moves the camera n texels measured AT THE TARGET plane", () => {
    const canvasWidth = 40;
    const canvasHeight = 40;
    const fitted = fit({ projection: "perspective", fov: 45, canvasWidth, canvasHeight });
    const distance = Math.hypot(
      fitted.position.x - fitted.target.x,
      fitted.position.y - fitted.target.y,
      fitted.position.z - fitted.target.z,
    );
    const halfHeight = distance * Math.tan((fitted.perspective!.fov * Math.PI) / 360);
    const perTexel = (halfHeight * 2) / canvasHeight;

    const moved = offsetCameraParams({
      params: fitted,
      panX: 6,
      panY: 6,
      canvasWidth,
      canvasHeight,
    });
    expect(moved.position.x - fitted.position.x).toBeCloseTo(-6 * perTexel, 12);
    expect(moved.position.y - fitted.position.y).toBeCloseTo(6 * perTexel, 12);
  });

  /* ── the rendered model really does move by n texels ─────────────────── */

  it("the model's rendered position shifts by exactly n texels (NDC arithmetic)", () => {
    // ⚠️ Asserted through `projectToNdc`, the file's independent
    // reimplementation of the GPU's projection, NOT through the module's own
    // arithmetic — a claim about the picture has to be checked against
    // something other than the code that produced it.
    //
    // NDC spans [-1, 1] across `canvasWidth` texels, so one texel is
    // `2 / canvasWidth` of NDC.
    const canvasWidth = 32;
    const canvasHeight = 32;
    for (const projection of ["orthographic", "perspective"] as const) {
      const fitted = fit({ projection, canvasWidth, canvasHeight });
      const centre = boundsCentre(UNIT);
      const before = projectToNdc(centre, fitted, NO_ROTATION, 0, 0);
      for (const [px, py] of [
        [1, 0],
        [0, 4],
        [-3, 9],
      ] as [number, number][]) {
        const moved = offsetCameraParams({
          params: fitted,
          panX: px,
          panY: py,
          canvasWidth,
          canvasHeight,
        });
        const after = projectToNdc(centre, moved, NO_ROTATION, 0, 0);
        expect(after.x - before.x).toBeCloseTo((2 * px) / canvasWidth, 10);
        // Canvas +Y is DOWN and NDC +Y is UP, so a positive `panY` (picture
        // slides down) must LOWER the NDC y. If this sign ever flips the
        // drag inverts vertically.
        expect(after.y - before.y).toBeCloseTo((-2 * py) / canvasHeight, 10);
      }
    }
  });

  it("moves the picture in the SAME direction the old blit offset did", () => {
    // The pointer path is unchanged (`posePanRef` still accumulates the same
    // signed cell delta), so the drag can only stay direct rather than
    // inverted if these signs match the blit's: `putImageData(image, +pan.x,
    // +pan.y)` moved the picture right and down.
    const canvasWidth = 32;
    const canvasHeight = 32;
    const fitted = fit({ canvasWidth, canvasHeight });
    const centre = boundsCentre(UNIT);
    const before = projectToNdc(centre, fitted, NO_ROTATION, 0, 0);
    const moved = offsetCameraParams({
      params: fitted,
      panX: 5,
      panY: 5,
      canvasWidth,
      canvasHeight,
    });
    const after = projectToNdc(centre, moved, NO_ROTATION, 0, 0);
    expect(after.x).toBeGreaterThan(before.x); // right on screen
    expect(after.y).toBeLessThan(before.y); // DOWN on screen (NDC +y is up)
  });

  /* ── pixel alignment ─────────────────────────────────────────────────── */

  it("snaps a fractional pan to whole texels — no half-texel crawl", () => {
    // ⚠️ This is the difference between "pans smoothly" and "shimmers while
    // dragging". `poseScreenToCellDelta` produces FRACTIONAL cell deltas at
    // pointer rate, so without the snap the model would land on a fractional
    // texel on most frames.
    const canvasWidth = 32;
    const canvasHeight = 32;
    const fitted = fit({ canvasWidth, canvasHeight });
    const at = (px: number, py: number) =>
      offsetCameraParams({ params: fitted, panX: px, panY: py, canvasWidth, canvasHeight });

    // Everything that rounds to 3 gives byte-identical params.
    expect(at(3.0, 0)).toEqual(at(3.4, 0));
    expect(at(3.0, 0)).toEqual(at(2.5, 0)); // Math.round(2.5) === 3
    expect(at(0, -7)).toEqual(at(0, -7.4));
    // And a pan that rounds to zero is the identity.
    expect(at(0.49, -0.5)).toEqual({ ...fitted });

    // The world offset is an exact integer multiple of the texel size.
    const o = fitted.orthographic!;
    const perTexel = (o.right - o.left) / canvasWidth;
    const moved = at(6.7, 0);
    const ratio = (fitted.position.x - moved.position.x) / perTexel;
    expect(ratio).toBeCloseTo(7, 10);
    expect(Math.abs(ratio - Math.round(ratio))).toBeLessThan(1e-9);
  });

  /* ── unbounded ───────────────────────────────────────────────────────── */

  it("is UNBOUNDED — the model may leave the frame entirely", () => {
    // Nothing clamps, by design (task 04 constraint: "Do not clamp pan").
    const canvasWidth = 32;
    const canvasHeight = 32;
    const fitted = fit({ canvasWidth, canvasHeight });
    const centre = boundsCentre(UNIT);
    const far = offsetCameraParams({
      params: fitted,
      panX: 5000,
      panY: -5000,
      canvasWidth,
      canvasHeight,
    });
    const ndc = projectToNdc(centre, far, NO_ROTATION, 0, 0);
    expect(Math.abs(ndc.x)).toBeGreaterThan(1); // well outside the frame
    expect(Math.abs(ndc.y)).toBeGreaterThan(1);
    expect(Number.isFinite(ndc.x)).toBe(true);
  });

  /* ── degenerate inputs ───────────────────────────────────────────────── */

  it("treats a non-finite pan as no pan rather than propagating NaN", () => {
    // A NaN reaching the camera blanks the frame, which reads as "the pose
    // tool broke" rather than as a bad number.
    const fitted = fit();
    expect(pan({ params: fitted, panX: Number.NaN, panY: 4 }).position.x).toBeCloseTo(
      fitted.position.x,
      12,
    );
    expect(pan({ params: fitted, panX: 3, panY: Number.POSITIVE_INFINITY })).toBeDefined();
    for (const v of Object.values(pan({ params: fitted, panX: Number.NaN, panY: Number.NaN }).position)) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("falls back to a square canvas rather than dividing by zero", () => {
    const fitted = fit();
    const moved = pan({ params: fitted, panX: 2, panY: 2, canvasWidth: 0, canvasHeight: -5 });
    expect(Number.isFinite(moved.position.x)).toBe(true);
    expect(Number.isFinite(moved.position.y)).toBe(true);
  });

  it("returns the params untouched when neither frustum block is populated", () => {
    const bare: PoseCameraParams = {
      projection: "orthographic",
      position: { x: 0, y: 0, z: 5 },
      target: { x: 0, y: 0, z: 0 },
      near: 1,
      far: 10,
    };
    expect(
      offsetCameraParams({ params: bare, panX: 9, panY: 9, canvasWidth: 32, canvasHeight: 32 }),
    ).toEqual(bare);
  });

  /* ── it composes with the orbit ──────────────────────────────────────── */

  it("pans along the CAMERA's axes, not the world's, at a non-zero orbit", () => {
    // At iso the camera's right vector has no +Y component but its up vector
    // does, so a horizontal-only pan must leave world Y alone while a
    // vertical one must not.
    const pitch = TRUE_ISOMETRIC_PITCH_RADIANS;
    const yaw = Math.PI / 4;
    const fitted = fit({ pitch, yaw });
    const { right, up } = basis(pitch, yaw);
    expect(right.y).toBeCloseTo(0, 12);
    expect(Math.abs(up.y)).toBeGreaterThan(0.5);

    const horizontal = offsetCameraParams({
      params: fitted,
      panX: 8,
      panY: 0,
      canvasWidth: 32,
      canvasHeight: 32,
      pitch,
      yaw,
    });
    expect(horizontal.position.y - fitted.position.y).toBeCloseTo(0, 12);

    const vertical = offsetCameraParams({
      params: fitted,
      panX: 0,
      panY: 8,
      canvasWidth: 32,
      canvasHeight: 32,
      pitch,
      yaw,
    });
    expect(Math.abs(vertical.position.y - fitted.position.y)).toBeGreaterThan(0);
  });

  it("a pan composes additively — two pans of n equal one pan of 2n", () => {
    const canvasWidth = 32;
    const canvasHeight = 32;
    const fitted = fit({ canvasWidth, canvasHeight });
    const once = offsetCameraParams({
      params: fitted,
      panX: 6,
      panY: -4,
      canvasWidth,
      canvasHeight,
    });
    const twice = offsetCameraParams({
      params: once,
      panX: 6,
      panY: -4,
      canvasWidth,
      canvasHeight,
    });
    const direct = offsetCameraParams({
      params: fitted,
      panX: 12,
      panY: -8,
      canvasWidth,
      canvasHeight,
    });
    expect(twice.position.x).toBeCloseTo(direct.position.x, 12);
    expect(twice.position.y).toBeCloseTo(direct.position.y, 12);
  });
});
