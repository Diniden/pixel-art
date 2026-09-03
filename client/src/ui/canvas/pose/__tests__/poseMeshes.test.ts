/**
 * Tests for the mesh library's PURE half — the framing region table and the
 * normalised-sub-box maths.
 *
 * ⚠️ **Nothing here constructs a three geometry or material**, by design. jsdom
 * has no WebGL (MASTER risk register) and `buildMesh` / `buildMaterial` /
 * `normalizeToUnitBox` all need the real namespace, so they are covered by
 * task 08's manual checks instead. What IS testable — and worth testing — is
 * the region table, because a bad region silently frames the wrong part of
 * the body and looks like a mislabelled button rather than like bad data.
 *
 * That constraint is why the shading and tessellation decisions (plan 07 task
 * 02, 2026-09-03) are asserted as **exported constants** —
 * `POSE_MATERIAL_FLAT_SHADING` and the segment counts — rather than by
 * building a material and reading `.flatShading` off it. See
 * `describe("smooth shading")` at the bottom for what that does and does not
 * catch.
 *
 * `loadMannequin` IS exercised, because its whole contract is *failing
 * gracefully* when task 09 has not vendored the asset yet, and that path can
 * be driven without GL.
 */
import { describe, expect, it } from "vitest";
import {
  CYLINDER_HEIGHT_SEGMENTS,
  CYLINDER_RADIAL_SEGMENTS,
  getFramingBounds,
  MANNEQUIN_REGIONS,
  MANNEQUIN_URL,
  MannequinUnavailableError,
  POSE_FRAMING_ORDER,
  POSE_MATERIAL_FLAT_SHADING,
  SPHERE_HEIGHT_SEGMENTS,
  SPHERE_WIDTH_SEGMENTS,
  UNIT_BOUNDS,
  type PoseMeshBounds,
} from "@/ui/canvas/pose/poseMeshes";
import type { PoseFraming } from "@/ui/canvas/pose/poseTypes";

const AXES = ["x", "y", "z"] as const;

/* ══ the framing region table (MASTER D4) ════════════════════════════════ */

describe("MANNEQUIN_REGIONS", () => {
  it("declares all six framings D4 names, and only those", () => {
    expect(Object.keys(MANNEQUIN_REGIONS).sort()).toEqual(
      ["arm", "full", "hand", "head", "leg", "torso"].sort(),
    );
  });

  it("orders them for the rail with 'full' first", () => {
    expect(POSE_FRAMING_ORDER).toEqual([
      "full",
      "head",
      "torso",
      "arm",
      "leg",
      "hand",
    ]);
    // The order list and the table must not drift apart.
    expect([...POSE_FRAMING_ORDER].sort()).toEqual(
      Object.keys(MANNEQUIN_REGIONS).sort(),
    );
  });

  it("makes 'full' exactly the whole normalised box", () => {
    expect(MANNEQUIN_REGIONS.full).toEqual({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 1, y: 1, z: 1 },
    });
  });

  it("keeps every region inside the unit box on every axis", () => {
    for (const [name, region] of Object.entries(MANNEQUIN_REGIONS)) {
      for (const axis of AXES) {
        expect(region.min[axis], `${name}.min.${axis}`).toBeGreaterThanOrEqual(0);
        expect(region.min[axis], `${name}.min.${axis}`).toBeLessThanOrEqual(1);
        expect(region.max[axis], `${name}.max.${axis}`).toBeGreaterThanOrEqual(0);
        expect(region.max[axis], `${name}.max.${axis}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("has min strictly below max on every axis of every region", () => {
    // A region with min >= max on any axis is a zero- or negative-volume
    // frame, which `fitCameraToMesh` would resolve to a degenerate camera.
    for (const [name, region] of Object.entries(MANNEQUIN_REGIONS)) {
      for (const axis of AXES) {
        expect(region.min[axis], `${name}.${axis}`).toBeLessThan(region.max[axis]);
      }
    }
  });

  it("gives every region full depth, since none of them crops front-to-back", () => {
    // Framing a body part narrows x and y; cropping z would slice the figure
    // in half and show its interior.
    for (const [name, region] of Object.entries(MANNEQUIN_REGIONS)) {
      expect(region.min.z, `${name}.min.z`).toBe(0);
      expect(region.max.z, `${name}.max.z`).toBe(1);
    }
  });

  it("puts the head at the top and the leg at the bottom", () => {
    expect(MANNEQUIN_REGIONS.head.max.y).toBe(1);
    expect(MANNEQUIN_REGIONS.head.min.y).toBeGreaterThan(0.8);
    expect(MANNEQUIN_REGIONS.leg.min.y).toBe(0);
    expect(MANNEQUIN_REGIONS.leg.max.y).toBeLessThan(0.5);
  });

  it("orders the body vertically: leg below torso below head", () => {
    expect(MANNEQUIN_REGIONS.leg.max.y).toBeLessThanOrEqual(
      MANNEQUIN_REGIONS.torso.max.y,
    );
    expect(MANNEQUIN_REGIONS.torso.max.y).toBeLessThan(MANNEQUIN_REGIONS.head.max.y);
  });

  it("makes the hand the smallest region and 'full' the largest", () => {
    const volume = (b: PoseMeshBounds) =>
      (b.max.x - b.min.x) * (b.max.y - b.min.y) * (b.max.z - b.min.z);
    const volumes = Object.entries(MANNEQUIN_REGIONS).map(
      ([name, b]) => [name, volume(b)] as const,
    );
    const smallest = volumes.reduce((a, b) => (b[1] < a[1] ? b : a));
    const largest = volumes.reduce((a, b) => (b[1] > a[1] ? b : a));
    expect(smallest[0]).toBe("hand");
    expect(largest[0]).toBe("full");
    expect(largest[1]).toBe(1);
  });

  it("puts the hand at the end of the arm's span, on the same side", () => {
    // Switching between Arm and Hand should not jump across the body.
    expect(MANNEQUIN_REGIONS.hand.min.x).toBeLessThanOrEqual(
      MANNEQUIN_REGIONS.arm.max.x,
    );
    expect(MANNEQUIN_REGIONS.hand.min.y).toBeLessThanOrEqual(
      MANNEQUIN_REGIONS.arm.max.y,
    );
  });

  it("keeps every region a plain finite number, with no NaN slipping in", () => {
    for (const [name, region] of Object.entries(MANNEQUIN_REGIONS)) {
      for (const axis of AXES) {
        expect(Number.isFinite(region.min[axis]), `${name}.min.${axis}`).toBe(true);
        expect(Number.isFinite(region.max[axis]), `${name}.max.${axis}`).toBe(true);
      }
    }
  });
});

/* ══ UNIT_BOUNDS and the segment counts ══════════════════════════════════ */

describe("UNIT_BOUNDS", () => {
  it("is the origin-centred unit box every primitive normalises into", () => {
    expect(UNIT_BOUNDS).toEqual({
      min: { x: -0.5, y: -0.5, z: -0.5 },
      max: { x: 0.5, y: 0.5, z: 0.5 },
    });
    for (const axis of AXES) {
      expect(UNIT_BOUNDS.max[axis] - UNIT_BOUNDS.min[axis]).toBe(1);
      expect(UNIT_BOUNDS.max[axis] + UNIT_BOUNDS.min[axis]).toBe(0);
    }
  });
});

/**
 * ⚠️ **These bounds were raised deliberately on 2026-09-03, not regenerated.**
 *
 * The previous version of this block asserted `<= 24` on all three rounded
 * counts under the heading "stays low-poly on purpose", reasoning that
 * segments beyond ~16 are invisible after rasterising and that a faceted
 * sphere reads *better* as pixel reference than a smooth one.
 *
 * The owner overruled that reasoning: *"we need to do normal blending at the
 * vertices so the light blends better. Also, you can up the polys for the
 * rounded primitives. We're dealing with barely any pixels."* The old argument
 * was an argument about **silhouettes under flat shading**, where each facet is
 * one flat tone and segment count is purely a silhouette knob. With
 * `flatShading` off, segment count is also the sampling rate of the light
 * **gradient**, and that lands in pixel *values* rather than in the outline —
 * so it does survive rasterising to 32×32, and 16×12 visibly bands across the
 * terminator.
 *
 * The bounds below therefore invert their intent: the lower bound is now the
 * interesting one (high enough for a smooth gradient) and the upper bound is
 * only a runaway guard.
 */
describe("segment counts", () => {
  it("is tessellated finely enough for a smooth light gradient", () => {
    // This is the assertion that carries the owner's instruction. With smooth
    // normals the facet width sets how coarsely the Lambert falloff is
    // sampled: at 16 around (22.5° per segment) the terminator bands visibly
    // even at 32×32. 32 around (11.25°) is roughly where that stops being
    // readable as steps, so it is the floor; the shipped value is 48 (7.5°).
    expect(SPHERE_WIDTH_SEGMENTS).toBeGreaterThanOrEqual(32);
    expect(SPHERE_HEIGHT_SEGMENTS).toBeGreaterThanOrEqual(24);
    expect(CYLINDER_RADIAL_SEGMENTS).toBeGreaterThanOrEqual(32);
  });

  it("keeps the rounded silhouettes from reading as polygons", () => {
    // Distinct from the gradient bound above: this one is about the OUTLINE,
    // which is the constraint the old `>= 8/6/8` floor encoded. Kept as a
    // separate, weaker assertion so that if the gradient floor is ever
    // revisited, the silhouette requirement does not vanish with it.
    expect(SPHERE_WIDTH_SEGMENTS).toBeGreaterThanOrEqual(8);
    expect(SPHERE_HEIGHT_SEGMENTS).toBeGreaterThanOrEqual(6);
    expect(CYLINDER_RADIAL_SEGMENTS).toBeGreaterThanOrEqual(8);
  });

  it("matches the sphere's and cylinder's resolution to each other", () => {
    // The two solids sit side by side in the rail; if one is markedly finer
    // than the other they read as different-quality objects rather than as the
    // same reference kit.
    expect(CYLINDER_RADIAL_SEGMENTS).toBe(SPHERE_WIDTH_SEGMENTS);
  });

  it("still has an upper bound, so nobody ships 512 segments by accident", () => {
    // Smooth normals removed the reason to stay LOW; they did not remove the
    // reason to stay FINITE. Nothing here would look wrong at 512 segments —
    // it would just quietly waste vertices — so only this assertion stops it.
    // 96 is two doublings of headroom above the shipped 48, which is room to
    // re-tune without room to be absurd.
    expect(SPHERE_WIDTH_SEGMENTS).toBeLessThanOrEqual(96);
    expect(SPHERE_HEIGHT_SEGMENTS).toBeLessThanOrEqual(96);
    expect(CYLINDER_RADIAL_SEGMENTS).toBeLessThanOrEqual(96);
  });

  it("keeps the segment counts multiples of 4, to land seams on the axes", () => {
    // A multiple of 4 puts a vertex seam on each cardinal axis instead of a
    // facet centred on it, so a front-on view never shows a flat plate aimed
    // straight at the camera.
    expect(SPHERE_WIDTH_SEGMENTS % 4).toBe(0);
    expect(SPHERE_HEIGHT_SEGMENTS % 4).toBe(0);
    expect(CYLINDER_RADIAL_SEGMENTS % 4).toBe(0);
  });

  it("does not subdivide the cylinder along its height, which provably needs none", () => {
    // Kept at 1, and the reason is measured rather than assumed. This cylinder
    // is straight (both radii equal), so three's side normal is (sinθ, 0, cosθ)
    // — independent of y. Measured against three 0.185.1 at 8 radial segments,
    // height segments of 1, 2 and 4 all yield exactly 9 distinct side-normal
    // directions while vertex count grows 52 → 61 → 79. Lambert is evaluated
    // per fragment from the interpolated normal, and interpolating between two
    // identical normals gives that same normal, so the side is uniform along
    // its length whatever the light does. Subdividing buys nothing observable.
    expect(CYLINDER_HEIGHT_SEGMENTS).toBe(1);
  });
});

/* ══ the shading decision (owner, 2026-09-03) ════════════════════════════ */

describe("smooth shading", () => {
  it("does not flat-shade the reference material", () => {
    // The regression this guards: `flatShading: true` makes three discard the
    // geometry's per-vertex normals and use one face normal per triangle —
    // the "normals orthogonal to the face" the owner asked us to stop doing.
    // With it false, three interpolates the per-vertex normals across each
    // triangle, which IS the requested vertex-normal blending.
    //
    // ⚠️ This asserts the exported CONSTANT, not a constructed material. jsdom
    // has no WebGL and this suite constructs no three objects by design (see
    // the file header), so `new three.MeshLambertMaterial(...)` is not
    // available to read `.flatShading` back off. The constant is what
    // `buildMaterial` passes, so the two cannot drift without an edit to the
    // constructor call itself — which a reviewer sees.
    expect(POSE_MATERIAL_FLAT_SHADING).toBe(false);
  });

  it("keeps the flag a boolean, not a truthy stand-in", () => {
    // `flatShading: undefined` would also disable flat shading today, by
    // falling through to three's default — but it would do so by accident and
    // would silently change meaning if that default ever moved. Pin the type.
    expect(typeof POSE_MATERIAL_FLAT_SHADING).toBe("boolean");
  });
});

/* ══ getFramingBounds ════════════════════════════════════════════════════ */

describe("getFramingBounds", () => {
  it("returns the mesh's own bounds for 'full'", () => {
    expect(getFramingBounds("full")).toEqual(UNIT_BOUNDS);
  });

  it("defaults the mesh bounds to the unit box", () => {
    expect(getFramingBounds("head")).toEqual(getFramingBounds("head", UNIT_BOUNDS));
  });

  // ⚠️ These assert the MAPPING ARITHMETIC, not the region values themselves.
  // Expectations are derived from MANNEQUIN_REGIONS rather than hardcoded, so
  // that re-tuning a region against the real mesh (task 09 did exactly that,
  // and the T-pose moved almost every one) cannot break a test whose subject
  // is the fraction→world-space transform. The region VALUES are pinned by the
  // invariant tests above instead.
  it("maps a normalised region onto the unit box", () => {
    const region = MANNEQUIN_REGIONS.head;
    const head = getFramingBounds("head");
    // The unit box runs -0.5..0.5, so a fraction f maps to f - 0.5.
    expect(head.min.y).toBeCloseTo(region.min.y - 0.5, 10);
    expect(head.max.y).toBeCloseTo(region.max.y - 0.5, 10);
    expect(head.min.x).toBeCloseTo(region.min.x - 0.5, 10);
    expect(head.max.x).toBeCloseTo(region.max.x - 0.5, 10);
  });

  it("maps onto an ARBITRARY mesh box, not just the unit one", () => {
    const meshBounds: PoseMeshBounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 10, y: 100, z: 4 },
    };
    const region = MANNEQUIN_REGIONS.head;
    const head = getFramingBounds("head", meshBounds);
    // Spans are 10 / 100 / 4 from an origin of 0, so a fraction f maps to
    // f * span — a different scale factor per axis, which is the point.
    expect(head.min.y).toBeCloseTo(region.min.y * 100, 10);
    expect(head.max.y).toBeCloseTo(region.max.y * 100, 10);
    expect(head.min.x).toBeCloseTo(region.min.x * 10, 10);
    expect(head.max.x).toBeCloseTo(region.max.x * 10, 10);
    // z is full-depth for every region, so it survives unchanged.
    expect(head.min.z).toBe(0);
    expect(head.max.z).toBe(4);
  });

  it("returns the mesh box unchanged for 'full' on an arbitrary box", () => {
    const meshBounds: PoseMeshBounds = {
      min: { x: -3, y: 2, z: -7 },
      max: { x: 5, y: 9, z: 1 },
    };
    expect(getFramingBounds("full", meshBounds)).toEqual(meshBounds);
  });

  it("keeps every framing inside the mesh box", () => {
    const meshBounds: PoseMeshBounds = {
      min: { x: -2, y: -6, z: -1 },
      max: { x: 2, y: 6, z: 1 },
    };
    for (const framing of POSE_FRAMING_ORDER) {
      const b = getFramingBounds(framing, meshBounds);
      for (const axis of AXES) {
        expect(b.min[axis], `${framing}.min.${axis}`).toBeGreaterThanOrEqual(
          meshBounds.min[axis],
        );
        expect(b.max[axis], `${framing}.max.${axis}`).toBeLessThanOrEqual(
          meshBounds.max[axis],
        );
        expect(b.min[axis]).toBeLessThan(b.max[axis]);
      }
    }
  });

  it("falls back to 'full' for an unknown framing rather than going degenerate", () => {
    // The framing can arrive from hand-edited or stale session state.
    expect(getFramingBounds("elbow" as PoseFraming)).toEqual(UNIT_BOUNDS);
  });

  it("does not mutate the mesh bounds it is handed", () => {
    const meshBounds: PoseMeshBounds = {
      min: { x: -1, y: -1, z: -1 },
      max: { x: 1, y: 1, z: 1 },
    };
    const snapshot = JSON.stringify(meshBounds);
    getFramingBounds("torso", meshBounds);
    expect(JSON.stringify(meshBounds)).toBe(snapshot);
  });

  it("is pure — repeated calls agree exactly", () => {
    expect(getFramingBounds("leg")).toEqual(getFramingBounds("leg"));
  });
});

/* ══ the mannequin loading seam (task 09 supplies the asset) ═════════════ */

describe("loadMannequin", () => {
  it("points at the vendored asset path", () => {
    expect(MANNEQUIN_URL).toBe("/models/mannequin.gltf");
  });

  it("exposes a distinct error class the caller can branch on", () => {
    const error = new MannequinUnavailableError("nope");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("MannequinUnavailableError");
    // Distinguishing "the asset is missing, grey the button out" from a real
    // bug is the reason this is a class rather than a bare Error.
    expect(error).toBeInstanceOf(MannequinUnavailableError);
    expect(new Error("nope")).not.toBeInstanceOf(MannequinUnavailableError);
  });

  it("carries the cause through, so a real failure is still diagnosable", () => {
    const cause = new Error("404");
    expect(new MannequinUnavailableError("wrapped", { cause }).cause).toBe(cause);
  });
});
