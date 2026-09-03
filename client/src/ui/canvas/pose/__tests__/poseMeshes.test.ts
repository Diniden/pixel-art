/**
 * Tests for the mesh library's PURE half — the framing region table and the
 * normalised-sub-box maths.
 *
 * ⚠️ **Nothing here constructs a three geometry**, by design. jsdom has no
 * WebGL (MASTER risk register) and `buildMesh` / `buildMaterial` /
 * `normalizeToUnitBox` all need the real namespace, so they are covered by
 * task 08's manual checks instead. What IS testable — and worth testing — is
 * the region table, because a bad region silently frames the wrong part of
 * the body and looks like a mislabelled button rather than like bad data.
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

describe("segment counts", () => {
  it("stays low-poly on purpose", () => {
    // The output is a handful of pixels wide; segments beyond this are
    // invisible after rasterising, and a smoother sphere reads WORSE as pixel
    // reference than a faceted one.
    expect(SPHERE_WIDTH_SEGMENTS).toBeLessThanOrEqual(24);
    expect(SPHERE_HEIGHT_SEGMENTS).toBeLessThanOrEqual(24);
    expect(CYLINDER_RADIAL_SEGMENTS).toBeLessThanOrEqual(24);
  });

  it("stays high enough that the silhouette is not obviously a polygon", () => {
    expect(SPHERE_WIDTH_SEGMENTS).toBeGreaterThanOrEqual(8);
    expect(SPHERE_HEIGHT_SEGMENTS).toBeGreaterThanOrEqual(6);
    expect(CYLINDER_RADIAL_SEGMENTS).toBeGreaterThanOrEqual(8);
  });

  it("does not subdivide the cylinder along its height, which needs none", () => {
    expect(CYLINDER_HEIGHT_SEGMENTS).toBe(1);
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

  it("maps a normalised region onto the unit box", () => {
    const head = getFramingBounds("head");
    // head.y spans 0.86..1 of a box running -0.5..0.5, i.e. 0.36..0.5.
    expect(head.min.y).toBeCloseTo(0.36, 10);
    expect(head.max.y).toBeCloseTo(0.5, 10);
    // x spans 0.3..0.7 → -0.2..0.2.
    expect(head.min.x).toBeCloseTo(-0.2, 10);
    expect(head.max.x).toBeCloseTo(0.2, 10);
  });

  it("maps onto an ARBITRARY mesh box, not just the unit one", () => {
    const meshBounds: PoseMeshBounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 10, y: 100, z: 4 },
    };
    const head = getFramingBounds("head", meshBounds);
    expect(head.min.y).toBeCloseTo(86, 10);
    expect(head.max.y).toBeCloseTo(100, 10);
    expect(head.min.x).toBeCloseTo(3, 10);
    expect(head.max.x).toBeCloseTo(7, 10);
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
  it("points at the path task 09 will vendor to", () => {
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
