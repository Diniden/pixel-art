/**
 * Tests for the mesh library's PURE half — the mannequin part segmentation and
 * the tessellation/shading constants.
 *
 * ⚠️ **Nothing here constructs a three geometry or material**, by design. jsdom
 * has no WebGL (MASTER risk register) and `buildMesh` / `buildMaterial` /
 * `buildPartGeometry` / `normalizeToUnitBox` all need the real namespace. What
 * IS testable — and is where a silent error is most expensive — is the pure
 * **decision**: which triangles belong to which part. So the classifier is
 * driven two ways:
 *
 * 1. against **synthetic** vertex arrays, where a hand-placed centroid pins one
 *    rule at a time and a failure names the rule; and
 * 2. against the **real vendored asset**, whose glTF buffer is decoded here
 *    directly (the same technique pose-tool task 09 used) so that every part's
 *    triangle count is measured, not assumed.
 *
 * ## ⚠️ The regression this file exists to prevent
 *
 * **A part that builds with ZERO triangles.** Task 09 hit it: its first
 * landmark estimates put Arm and Hand over empty space, because they assumed a
 * figure with its arms hanging at its sides. This asset is a **T-pose** — the
 * arms are a horizontal bar at shoulder height and the maximum `|x|` occurs
 * there. An empty part renders as a blank canvas with no error anywhere, so
 * only a test that reads the real mesh can catch a landmark retuned into
 * emptiness. `describe("every part is non-empty")` is that test, and it is the
 * most important block in the file.
 *
 * The shading and tessellation decisions (plan 07 task 02) are asserted as
 * **exported constants** for the same no-WebGL reason — see
 * `describe("smooth shading")`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildGeometry,
  classifyMannequinTriangle,
  CYLINDER_HEIGHT_SEGMENTS,
  CYLINDER_RADIAL_SEGMENTS,
  isPosePartId,
  MANNEQUIN_LANDMARKS,
  MANNEQUIN_PART_ORDER,
  MANNEQUIN_URL,
  MannequinUnavailableError,
  normalizeTriangleCentroid,
  POSE_MATERIAL_FLAT_SHADING,
  POSE_MESH_ORDER,
  selectPartTriangles,
  SPHERE_HEIGHT_SEGMENTS,
  SPHERE_WIDTH_SEGMENTS,
  triangleCentroid,
  UNIT_BOUNDS,
  type PoseMeshBounds,
} from "@/ui/canvas/pose/poseMeshes";
import type { PoseMeshId, PosePartId, PoseVector } from "@/ui/canvas/pose/poseTypes";

const AXES = ["x", "y", "z"] as const;

/* ══ the real asset, decoded ═════════════════════════════════════════════ */

/**
 * The vendored mannequin's triangle centroids and overall bounds, decoded
 * straight out of the glTF's embedded base64 buffer.
 *
 * ⚠️ **No three, no GLTFLoader, no WebGL.** The asset is self-contained JSON
 * with a `data:` URI buffer, so its accessors can be read with `DataView`
 * arithmetic alone — which is what lets the *real* segmentation be measured in
 * the node lane. This is the technique pose-tool task 09 used to derive the
 * landmarks in the first place, so the test reads the mesh the same way the
 * numbers were produced.
 *
 * Both nodes (`mannequin_joints`, `mannequin_body`) are included and neither
 * carries a transform, so their positions are already in one shared space.
 */
function decodeMannequin(): {
  centroids: PoseVector[];
  bounds: PoseMeshBounds;
} {
  const path = fileURLToPath(
    new URL("../../../../../public/models/mannequin.gltf", import.meta.url),
  );
  const gltf = JSON.parse(readFileSync(path, "utf8")) as {
    meshes: { primitives: { attributes: { POSITION: number }; indices: number }[] }[];
    accessors: {
      bufferView: number;
      byteOffset?: number;
      componentType: number;
      count: number;
      type: string;
    }[];
    bufferViews: { byteOffset?: number }[];
    buffers: { uri: string }[];
  };

  const bytes = Buffer.from(gltf.buffers[0].uri.split(",")[1], "base64");
  const read = (accessorIndex: number): Float32Array | Uint16Array => {
    const a = gltf.accessors[accessorIndex];
    const offset =
      (gltf.bufferViews[a.bufferView].byteOffset ?? 0) + (a.byteOffset ?? 0);
    if (a.componentType === 5126 /* FLOAT */) {
      const stride = a.type === "VEC3" ? 3 : a.type === "VEC2" ? 2 : 1;
      const out = new Float32Array(a.count * stride);
      for (let i = 0; i < out.length; i++) out[i] = bytes.readFloatLE(offset + i * 4);
      return out;
    }
    // 5123 = UNSIGNED_SHORT — this asset's only index type.
    const out = new Uint16Array(a.count);
    for (let i = 0; i < out.length; i++) out[i] = bytes.readUInt16LE(offset + i * 2);
    return out;
  };

  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  const centroids: PoseVector[] = [];

  for (const mesh of gltf.meshes) {
    for (const primitive of mesh.primitives) {
      const position = read(primitive.attributes.POSITION) as Float32Array;
      const index = read(primitive.indices) as Uint16Array;

      for (let i = 0; i < position.length; i += 3) {
        AXES.forEach((axis, a) => {
          const value = position[i + a];
          if (value < min[axis]) min[axis] = value;
          if (value > max[axis]) max[axis] = value;
        });
      }

      const at = (vertex: number): PoseVector => ({
        x: position[vertex * 3],
        y: position[vertex * 3 + 1],
        z: position[vertex * 3 + 2],
      });
      for (let t = 0; t < index.length; t += 3) {
        centroids.push(
          triangleCentroid(at(index[t]), at(index[t + 1]), at(index[t + 2])),
        );
      }
    }
  }

  return { centroids, bounds: { min, max } };
}

/** Decoded once — reading and decoding 380 kB per test would be wasteful. */
const MESH = decodeMannequin();

/** A centroid's normalised distance from the figure's centreline. */
const axOf = (v: PoseVector): number =>
  Math.abs(normalizeTriangleCentroid(v, MESH.bounds).x - 0.5);

/** A centroid's normalised height, `0` at the soles and `1` at the crown. */
const yOf = (v: PoseVector): number =>
  normalizeTriangleCentroid(v, MESH.bounds).y;

/* ══ the asset itself ════════════════════════════════════════════════════ */

describe("the vendored mannequin", () => {
  it("decodes to the 9,636 triangles the licence file records", () => {
    // If this ever changes, the asset was replaced and every landmark below is
    // measured against a mesh that no longer exists. Fail here, loudly, rather
    // than 40 assertions later with mysterious counts.
    expect(MESH.centroids.length).toBe(9636);
  });

  it("is the T-pose the landmarks were measured on, not an arms-down figure", () => {
    const span = {
      x: MESH.bounds.max.x - MESH.bounds.min.x,
      y: MESH.bounds.max.y - MESH.bounds.min.y,
    };
    // ⚠️ THE assumption every landmark rests on. A relaxed figure with its arms
    // at its sides has an aspect near 0.3; a T-pose is near 0.9 because the
    // arms reach almost as wide as the figure is tall. Task 09's first
    // estimates were built on the wrong one of these and put two parts over
    // empty space.
    expect(span.x / span.y).toBeCloseTo(0.887, 2);
  });

  it("reaches its maximum width at shoulder height, not at the hips", () => {
    // The other half of "it is a T-pose", stated as a property rather than a
    // ratio: the widest thing on the figure is a hand, and a hand is up high.
    const widest = MESH.centroids.reduce((a, b) => (axOf(b) > axOf(a) ? b : a));
    expect(yOf(widest)).toBeGreaterThan(0.7);
    expect(yOf(widest)).toBeLessThan(0.85);
  });
});

/* ══ ⚠️ EVERY PART IS NON-EMPTY — the headline regression test ═══════════ */

describe("every part is non-empty", () => {
  /**
   * ⚠️ **Measured against the vendored asset on 2026-09-03.** These are not
   * targets and not estimates: they are what the shipped landmarks actually
   * select. Pinning them exactly means that retuning a landmark — for any
   * reason, good or bad — cannot pass silently.
   *
   * `hand` is much the largest because the asset's finest detail is in the
   * fingers; `head` much the smallest because it is one smooth capsule.
   */
  const EXPECTED: Record<PosePartId, number> = {
    head: 336,
    torso: 2912,
    arm: 1062,
    leg: 1346,
    hand: 3980,
  };

  it.each(MANNEQUIN_PART_ORDER)(
    "selects a non-zero number of triangles for %s",
    (part) => {
      const selected = selectPartTriangles(part, MESH.centroids, MESH.bounds);
      // THE assertion. A part with zero triangles renders as a blank canvas
      // with no error anywhere — it looks like a broken tool rather than like
      // bad numbers, which is exactly how task 09's T-pose bug presented.
      expect(selected.length, `${part} is EMPTY`).toBeGreaterThan(0);
      // Enough to be a body part rather than a stray sliver at a boundary.
      expect(selected.length, `${part} is a sliver`).toBeGreaterThan(100);
    },
  );

  it.each(MANNEQUIN_PART_ORDER)("selects exactly the measured count for %s", (part) => {
    expect(selectPartTriangles(part, MESH.centroids, MESH.bounds).length).toBe(
      EXPECTED[part],
    );
  });

  it("accounts for every triangle exactly once — the parts are a partition", () => {
    // Disjoint AND total, in one assertion each. This is the property that
    // makes "segment by triangle" trustworthy: no triangle is duplicated into
    // two parts and none is dropped between them, so nothing can quietly
    // vanish when a landmark moves.
    const owner = new Map<number, PosePartId>();
    for (const part of MANNEQUIN_PART_ORDER) {
      for (const index of selectPartTriangles(part, MESH.centroids, MESH.bounds)) {
        expect(owner.has(index), `triangle ${index} is in two parts`).toBe(false);
        owner.set(index, part);
      }
    }
    expect(owner.size).toBe(MESH.centroids.length);
  });

  it("sums the part counts back to the whole mesh", () => {
    const total = MANNEQUIN_PART_ORDER.reduce(
      (sum, part) =>
        sum + selectPartTriangles(part, MESH.centroids, MESH.bounds).length,
      0,
    );
    expect(total).toBe(MESH.centroids.length);
  });
});

/* ══ anatomical invariants, re-expressed on the real geometry ════════════ */

describe("anatomical invariants", () => {
  /** The normalised bounding box of a part's selected centroids. */
  function partBox(part: PosePartId): {
    y: [number, number];
    ax: [number, number];
  } {
    const selected = selectPartTriangles(part, MESH.centroids, MESH.bounds).map(
      (i) => MESH.centroids[i],
    );
    const ys = selected.map(yOf);
    const axs = selected.map(axOf);
    return {
      y: [Math.min(...ys), Math.max(...ys)],
      ax: [Math.min(...axs), Math.max(...axs)],
    };
  }

  it("puts the head above the torso, with no vertical overlap", () => {
    // The old region table asserted this on hand-written fractions. Now it is
    // asserted on the triangles actually selected, which is strictly stronger:
    // a landmark could be right on paper and still select the wrong geometry.
    expect(partBox("head").y[0]).toBeGreaterThanOrEqual(partBox("torso").y[1]);
  });

  it("keeps the head in the top sixth of the figure", () => {
    expect(partBox("head").y[0]).toBeGreaterThan(0.8);
    expect(partBox("head").y[1]).toBeGreaterThan(0.95);
  });

  it("puts the leg below the torso and in the bottom half", () => {
    expect(partBox("leg").y[1]).toBeLessThanOrEqual(partBox("torso").y[0]);
    expect(partBox("leg").y[1]).toBeLessThan(0.5);
    // It reaches the soles, so the figure stands on it.
    expect(partBox("leg").y[0]).toBeLessThan(0.01);
  });

  it("puts the hand at the OUTER end of the arm, on the same side", () => {
    const arm = partBox("arm");
    const hand = partBox("hand");
    // Outward of the arm, and reaching the fingertips at the mesh's full width.
    expect(hand.ax[0]).toBeGreaterThanOrEqual(arm.ax[1]);
    expect(hand.ax[1]).toBeGreaterThan(0.49);
    // ⚠️ "Same side" holds because AX is |x - 0.5|: both arms and both hands
    // are one part (E1, no left/right variants), so the hand cannot be on the
    // opposite side of the body from the arm — it is on both.
    expect(hand.y[0]).toBeGreaterThanOrEqual(arm.y[0]);
    expect(hand.y[1]).toBeLessThanOrEqual(arm.y[1]);
  });

  it("keeps the arm a horizontal bar at shoulder height — the T-pose", () => {
    const arm = partBox("arm");
    // Wide in x, thin in y. If a future edit ever produced an arm that was
    // taller than it is wide, the segmentation has picked up the torso.
    expect(arm.ax[1] - arm.ax[0]).toBeGreaterThan(0.25);
    expect(arm.y[1] - arm.y[0]).toBeLessThan(0.1);
    expect(arm.y[0]).toBeGreaterThan(0.7);
  });

  it("keeps head, torso and leg inboard of the shoulder", () => {
    // The three "column" parts must not stray into the arm bar's territory,
    // or the figure's silhouette has been cut in the wrong place.
    for (const part of ["head", "torso", "leg"] as const) {
      expect(partBox(part).ax[1], `${part} reaches outboard`).toBeLessThanOrEqual(
        MANNEQUIN_LANDMARKS.shoulderAX + 0.03,
      );
    }
  });

  it("makes the head the narrowest part, as a neck pinch implies", () => {
    const widths = MANNEQUIN_PART_ORDER.map(
      (part) => [part, partBox(part).ax[1]] as const,
    );
    expect(widths.reduce((a, b) => (b[1] < a[1] ? b : a))[0]).toBe("head");
  });
});

/* ══ the landmark table ══════════════════════════════════════════════════ */

describe("MANNEQUIN_LANDMARKS", () => {
  it("orders the vertical landmarks the way a body is built", () => {
    // crotch below neck, and the arm bar between them.
    expect(MANNEQUIN_LANDMARKS.crotchY).toBeLessThan(MANNEQUIN_LANDMARKS.armYMin);
    expect(MANNEQUIN_LANDMARKS.armYMin).toBeLessThan(MANNEQUIN_LANDMARKS.armYMax);
    expect(MANNEQUIN_LANDMARKS.crotchY).toBeLessThan(MANNEQUIN_LANDMARKS.neckY);
  });

  it("puts the wrist outboard of the shoulder", () => {
    expect(MANNEQUIN_LANDMARKS.shoulderAX).toBeLessThan(
      MANNEQUIN_LANDMARKS.wristAX,
    );
  });

  it("keeps every landmark a finite fraction inside the unit box", () => {
    for (const [name, value] of Object.entries(MANNEQUIN_LANDMARKS)) {
      expect(Number.isFinite(value), name).toBe(true);
      expect(value, name).toBeGreaterThanOrEqual(0);
      // AX landmarks are at most 0.5 (the centreline to the edge); Y landmarks
      // at most 1.
      expect(value, name).toBeLessThanOrEqual(1);
    }
  });

  it("keeps the AX landmarks within the half-width they measure", () => {
    expect(MANNEQUIN_LANDMARKS.shoulderAX).toBeLessThanOrEqual(0.5);
    expect(MANNEQUIN_LANDMARKS.wristAX).toBeLessThanOrEqual(0.5);
  });
});

/* ══ the classifier, on synthetic input ══════════════════════════════════ */

/**
 * A synthetic mesh box that is NOT the unit box and NOT the mannequin's, so a
 * test passing here proves the fraction→units conversion is really happening
 * rather than the raw numbers coincidentally lining up.
 *
 * ⚠️ This is the conversion MASTER §9 warns about: the landmarks are
 * normalised 0..1 fractions while a glTF is in the model's own units, and
 * comparing one against the other yields either an empty part or the whole
 * body. Every case below is written in *fractions* and converted here.
 */
const SYNTH: PoseMeshBounds = {
  min: { x: -30, y: 100, z: -2 },
  max: { x: 70, y: 300, z: 6 },
};

/** A centroid at normalised `(ax, y)` inside {@link SYNTH}, on the +x side. */
function at(ax: number, y: number): PoseVector {
  return {
    x: SYNTH.min.x + (0.5 + ax) * (SYNTH.max.x - SYNTH.min.x),
    y: SYNTH.min.y + y * (SYNTH.max.y - SYNTH.min.y),
    z: (SYNTH.min.z + SYNTH.max.z) / 2,
  };
}

/** The mirror of {@link at}, on the −x side. */
function atMirrored(ax: number, y: number): PoseVector {
  return {
    x: SYNTH.min.x + (0.5 - ax) * (SYNTH.max.x - SYNTH.min.x),
    y: SYNTH.min.y + y * (SYNTH.max.y - SYNTH.min.y),
    z: (SYNTH.min.z + SYNTH.max.z) / 2,
  };
}

describe("normalizeTriangleCentroid", () => {
  it("maps a box's min to 0, its max to 1 and its centre to 0.5", () => {
    expect(normalizeTriangleCentroid(SYNTH.min, SYNTH)).toEqual({
      x: 0,
      y: 0,
      z: 0,
    });
    expect(normalizeTriangleCentroid(SYNTH.max, SYNTH)).toEqual({
      x: 1,
      y: 1,
      z: 1,
    });
    const centre = {
      x: (SYNTH.min.x + SYNTH.max.x) / 2,
      y: (SYNTH.min.y + SYNTH.max.y) / 2,
      z: (SYNTH.min.z + SYNTH.max.z) / 2,
    };
    const n = normalizeTriangleCentroid(centre, SYNTH);
    for (const axis of AXES) expect(n[axis]).toBeCloseTo(0.5, 12);
  });

  it("scales each axis independently, not by one shared factor", () => {
    // The bug this catches: normalising by the largest span (as the *mesh*
    // normalisation does) rather than per axis. On this 100 × 200 × 8 box a
    // shared factor would put y at 0.5 where it should be 1.
    const n = normalizeTriangleCentroid(
      { x: SYNTH.max.x, y: SYNTH.max.y, z: SYNTH.min.z },
      SYNTH,
    );
    expect(n).toEqual({ x: 1, y: 1, z: 0 });
  });

  it("returns 0.5 rather than NaN on a zero-extent axis", () => {
    // A NaN would fail every comparison and drop the triangle out of EVERY
    // part, turning a degenerate asset into a blank screen. 0.5 keeps it in
    // the middle, which is where a flat mesh's flat axis genuinely is.
    const flat: PoseMeshBounds = {
      min: { x: 0, y: 0, z: 5 },
      max: { x: 1, y: 1, z: 5 },
    };
    const n = normalizeTriangleCentroid({ x: 0.25, y: 0.75, z: 5 }, flat);
    expect(n).toEqual({ x: 0.25, y: 0.75, z: 0.5 });
    expect(Number.isNaN(n.z)).toBe(false);
  });

  it("does not mutate its inputs", () => {
    const centroid = { x: 1, y: 2, z: 3 };
    const before = JSON.stringify([centroid, SYNTH]);
    normalizeTriangleCentroid(centroid, SYNTH);
    expect(JSON.stringify([centroid, SYNTH])).toBe(before);
  });
});

describe("classifyMannequinTriangle", () => {
  const L = MANNEQUIN_LANDMARKS;

  /**
   * How far off a landmark a "just inside" / "just outside" probe is placed.
   *
   * ⚠️ **Not `Number.EPSILON`, and deliberately so.** {@link at} converts a
   * fraction into {@link SYNTH}'s model units and the classifier converts it
   * back, and that round trip is not exact in binary floating point — measured,
   * `0.472` returns as `0.47199999999999986` and `0.105` as
   * `0.10499999999999998`. A probe placed exactly *on* a landmark therefore
   * lands on whichever side the rounding put it, which is a property of IEEE
   * 754 and not of the segmentation.
   *
   * That is harmless in practice — a triangle centroid falling within 1e-15 of
   * a landmark is a measure-zero event, and either answer is correct at that
   * distance — so the tests probe `±1e-9` instead: far enough out to be
   * unambiguous, far closer than any real triangle. What is worth asserting is
   * that each boundary separates the two parts *sharply*, and that is what
   * these cases do.
   */
  const NUDGE = 1e-9;

  it("calls a centroid above the neck a head", () => {
    expect(classifyMannequinTriangle(at(0.02, 0.95), SYNTH)).toBe("head");
    expect(classifyMannequinTriangle(at(0.02, L.neckY + NUDGE), SYNTH)).toBe("head");
  });

  it("calls a centroid just below the neck a torso, not a head", () => {
    // The boundary is `>=`, so one ulp below it must fall the other way.
    expect(classifyMannequinTriangle(at(0.02, L.neckY - NUDGE), SYNTH)).toBe("torso");
  });

  it("calls a centroid below the crotch a leg", () => {
    expect(classifyMannequinTriangle(at(0.05, 0.1), SYNTH)).toBe("leg");
    expect(classifyMannequinTriangle(at(0.05, L.crotchY - NUDGE), SYNTH)).toBe("leg");
  });

  it("calls a centroid at the crotch line a torso, not a leg", () => {
    expect(classifyMannequinTriangle(at(0.05, L.crotchY + NUDGE), SYNTH)).toBe("torso");
  });

  it("calls an outboard centroid in the arm band an arm", () => {
    expect(classifyMannequinTriangle(at(0.2, 0.78), SYNTH)).toBe("arm");
    expect(classifyMannequinTriangle(at(L.shoulderAX + NUDGE, 0.78), SYNTH)).toBe(
      "arm",
    );
  });

  it("calls a centroid past the wrist a hand", () => {
    expect(classifyMannequinTriangle(at(0.48, 0.78), SYNTH)).toBe("hand");
    expect(classifyMannequinTriangle(at(L.wristAX + NUDGE, 0.78), SYNTH)).toBe(
      "hand",
    );
  });

  it("calls a centroid just inboard of the wrist an arm, not a hand", () => {
    expect(classifyMannequinTriangle(at(L.wristAX - NUDGE, 0.78), SYNTH)).toBe("arm");
  });

  it("calls a centroid inboard of the shoulder a torso even inside the arm band", () => {
    // The arm band alone is not enough — the shoulder threshold is what keeps
    // the chest out of the arm.
    expect(classifyMannequinTriangle(at(L.shoulderAX - NUDGE, 0.78), SYNTH)).toBe(
      "torso",
    );
  });

  it("⚠️ does NOT call a splayed foot an arm, because of the arm band", () => {
    // THE reason `armYMin`/`armYMax` exist. This asset's feet reach AX 0.128,
    // outboard of the 0.105 shoulder threshold. Without the vertical band the
    // "arm" part quietly acquires two feet and the "leg" part loses them —
    // measured: leg 876 / arm 1538 without it, leg 1346 / arm 1062 with it.
    expect(classifyMannequinTriangle(at(0.128, 0.005), SYNTH)).toBe("leg");
    expect(classifyMannequinTriangle(at(0.45, 0.005), SYNTH)).toBe("leg");
  });

  it("does not call a wide centroid above the arm band a hand", () => {
    // Nothing is out there on this asset, but the rule must still be the rule:
    // outboard of the wrist but above the band is head, not hand.
    expect(classifyMannequinTriangle(at(0.45, 0.95), SYNTH)).toBe("head");
  });

  it("is mirror-symmetric — no left/right variants (E1)", () => {
    // AX is |x - 0.5|, so a centroid and its mirror must classify identically.
    for (const [ax, y] of [
      [0.2, 0.78],
      [0.48, 0.78],
      [0.05, 0.1],
      [0.02, 0.95],
      [0.05, 0.6],
    ] as const) {
      expect(classifyMannequinTriangle(atMirrored(ax, y), SYNTH)).toBe(
        classifyMannequinTriangle(at(ax, y), SYNTH),
      );
    }
  });

  it("always returns one of the five part ids, never undefined", () => {
    // `torso` is the remainder branch, which is what makes the partition total
    // by construction. Sweep the whole normalised box to prove nothing escapes.
    for (let ax = 0; ax <= 0.5; ax += 0.01) {
      for (let y = 0; y <= 1; y += 0.01) {
        expect(MANNEQUIN_PART_ORDER).toContain(
          classifyMannequinTriangle(at(ax, y), SYNTH),
        );
      }
    }
  });

  it("is pure and deterministic — the same centroid always classifies the same", () => {
    const centroid = at(0.2, 0.78);
    const snapshot = JSON.stringify([centroid, SYNTH]);
    const first = classifyMannequinTriangle(centroid, SYNTH);
    for (let i = 0; i < 5; i++) {
      expect(classifyMannequinTriangle(centroid, SYNTH)).toBe(first);
    }
    expect(JSON.stringify([centroid, SYNTH])).toBe(snapshot);
  });

  it("gives the SAME answer on the unit box as on an arbitrary one", () => {
    // ⚠️ The conversion test. Fractions are box-relative, so the same
    // normalised position must classify identically whatever units the mesh is
    // authored in — that is the whole reason the landmarks are fractions.
    const unitAt = (ax: number, y: number): PoseVector => ({
      x: 0.5 + ax,
      y,
      z: 0.5,
    });
    for (const [ax, y] of [
      [0.2, 0.78],
      [0.48, 0.78],
      [0.05, 0.1],
      [0.02, 0.95],
    ] as const) {
      const unitBounds: PoseMeshBounds = {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 1, y: 1, z: 1 },
      };
      expect(classifyMannequinTriangle(unitAt(ax, y), unitBounds)).toBe(
        classifyMannequinTriangle(at(ax, y), SYNTH),
      );
    }
  });
});

describe("triangleCentroid", () => {
  it("averages the three corners", () => {
    expect(
      triangleCentroid({ x: 0, y: 0, z: 0 }, { x: 3, y: 6, z: 9 }, { x: 6, y: 0, z: 3 }),
    ).toEqual({ x: 3, y: 2, z: 4 });
  });

  it("returns the point itself for a degenerate triangle", () => {
    const p = { x: 1.5, y: -2, z: 0.25 };
    expect(triangleCentroid(p, p, p)).toEqual(p);
  });
});

describe("selectPartTriangles", () => {
  it("returns TRIANGLE indices, not vertex indices", () => {
    // ⚠️ The distinction that keeps the geometry watertight. Selecting vertices
    // and keeping whichever indices survive leaves dangling indices and tears
    // holes along every seam; a triangle is the atom here.
    const centroids = [at(0.02, 0.95), at(0.05, 0.1), at(0.02, 0.96)];
    expect(selectPartTriangles("head", centroids, SYNTH)).toEqual([0, 2]);
  });

  it("returns an empty array for a part with no triangles, not undefined", () => {
    expect(selectPartTriangles("hand", [at(0.02, 0.95)], SYNTH)).toEqual([]);
  });

  it("preserves input order", () => {
    const centroids = [at(0.05, 0.1), at(0.02, 0.95), at(0.05, 0.2)];
    expect(selectPartTriangles("leg", centroids, SYNTH)).toEqual([0, 2]);
  });

  it("does not mutate the triangles it is handed", () => {
    const centroids = [at(0.02, 0.95), at(0.05, 0.1)];
    const snapshot = JSON.stringify(centroids);
    selectPartTriangles("head", centroids, SYNTH);
    expect(JSON.stringify(centroids)).toBe(snapshot);
  });
});

/* ══ the mesh id vocabulary ══════════════════════════════════════════════ */

describe("the mesh id vocabulary", () => {
  it("names the five parts in rail order", () => {
    expect(MANNEQUIN_PART_ORDER).toEqual(["head", "torso", "arm", "leg", "hand"]);
  });

  it("offers the primitives, the whole mannequin, then its parts", () => {
    expect(POSE_MESH_ORDER).toEqual([
      "cube",
      "sphere",
      "cylinder",
      "mannequin",
      "head",
      "torso",
      "arm",
      "leg",
      "hand",
    ]);
  });

  it("has no duplicate ids", () => {
    expect(new Set(POSE_MESH_ORDER).size).toBe(POSE_MESH_ORDER.length);
  });

  it("identifies exactly the parts as parts", () => {
    for (const part of MANNEQUIN_PART_ORDER) expect(isPosePartId(part)).toBe(true);
    for (const id of ["cube", "sphere", "cylinder", "mannequin"] as PoseMeshId[]) {
      expect(isPosePartId(id), id).toBe(false);
    }
  });

  it("no longer knows anything called 'full'", () => {
    // ⚠️ E2: framing is DELETED, not deprecated. `"full"` was the framing id
    // for the whole figure; the whole figure is now `"mannequin"`, which is
    // what the rail labels **Full**. A stale `"full"` must NOT quietly read as
    // a part.
    expect(isPosePartId("full" as PoseMeshId)).toBe(false);
    expect(POSE_MESH_ORDER).not.toContain("full");
    expect(MANNEQUIN_PART_ORDER).not.toContain("full" as PosePartId);
  });

  it("keeps `buildGeometry` unable to be handed a mannequin id", () => {
    // A compile-time guarantee, asserted at runtime as documentation: passing
    // "head" or "mannequin" is a `tsc` error, and `buildGeometry` therefore
    // needs no runtime branch for them. The three primitives are all it takes.
    expect(typeof buildGeometry).toBe("function");
    expect(buildGeometry.length).toBe(2);
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

  it("is what a PART normalises into too, so a head frames like a cube", () => {
    // `buildPartMesh` runs the same `normalizeToUnitBox` every primitive gets.
    // Constructing it needs three, so this pins the CONTRACT: there is one
    // target box and parts are not special-cased against it. The visual proof
    // is manual check 1.
    expect(UNIT_BOUNDS.max.x - UNIT_BOUNDS.min.x).toBe(1);
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

  it("⚠️ applies to PARTS too — the asset carries the normals a part copies", () => {
    // `buildPartGeometry` copies the source NORMAL attribute triangle by
    // triangle rather than calling `computeVertexNormals()`, precisely so a
    // part keeps the smooth authored normals task 02's change relies on. On a
    // NON-INDEXED geometry `computeVertexNormals()` assigns each vertex its own
    // face normal, which would silently reintroduce the flat faceting task 02
    // removed — so it is a fallback for a source with no normals at all, not
    // the normal path.
    //
    // The asset really does carry normals: accessors 1 and 5 are the NORMAL
    // attributes of `joints` and `body`. Asserted here so that swapping in an
    // asset without them is loud rather than quietly flat.
    const path = fileURLToPath(
      new URL("../../../../../public/models/mannequin.gltf", import.meta.url),
    );
    const gltf = JSON.parse(readFileSync(path, "utf8")) as {
      meshes: { primitives: { attributes: Record<string, number> }[] }[];
    };
    for (const mesh of gltf.meshes) {
      for (const primitive of mesh.primitives) {
        expect(primitive.attributes.NORMAL).toBeTypeOf("number");
      }
    }
  });
});

/* ══ the mannequin loading seam ══════════════════════════════════════════ */

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

  it("reuses that error for an empty part, so a blank render is never silent", () => {
    // `buildPartMesh` rejects with this rather than returning a mesh with zero
    // triangles. Constructing it needs three, so what is pinned here is that
    // the empty case has an error to throw at all — the counts above are what
    // actually prove no part IS empty.
    const error = new MannequinUnavailableError(
      'the mannequin part "hand" segmented to zero triangles',
    );
    expect(error).toBeInstanceOf(MannequinUnavailableError);
    expect(error.message).toContain("zero triangles");
  });
});
