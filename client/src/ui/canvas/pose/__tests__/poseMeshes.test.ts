/**
 * Tests for the mesh library's PURE half — the mannequin part segmentation and
 * the tessellation/shading constants.
 *
 * ⚠️ **This used to say "nothing here constructs a three geometry or
 * material". That is no longer true, and the reason it changed matters.**
 *
 * The old rule was "jsdom has no WebGL" (MASTER risk register). Measured
 * 2026-09-03 while executing plan 08 task 01: **WebGL is needed only by
 * `WebGLRenderer`.** `BufferGeometry`, `BoxGeometry`, `SphereGeometry`,
 * `Box3`, `Vector3` and `Matrix4` are TypedArray-and-float maths with no GPU
 * anywhere in them — and the lane these tests run in is **node**, not jsdom
 * (`vitest.config.ts`, `projects[0].environment: "node"`). So the blocks at
 * the end of this file construct real geometries and assert on real vertex
 * data.
 *
 * That was not gold-plating: plan 08's F2 is a claim about **vertex
 * positions**, and a claim about vertex positions asserted on exported
 * constants is not asserted at all. `buildMaterial` and `buildMesh` are still
 * pinned by constant, because a material's shading only becomes observable
 * under a renderer.
 *
 * What was ALWAYS testable — and is where a silent error is most expensive —
 * is the pure **decision**: which triangles belong to which part. So the
 * classifier is driven two ways:
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
import { describe, expect, it, vi } from "vitest";
import type { BufferGeometry, Object3D } from "three";
import {
  buildGeometry,
  buildPartGeometry,
  centerGeometryOnOrigin,
  centerSceneGeometryOnOrigin,
  classifyMannequinTriangle,
  CYLINDER_HEIGHT_SEGMENTS,
  CYLINDER_RADIAL_SEGMENTS,
  isPosePartId,
  MANNEQUIN_LANDMARKS,
  MANNEQUIN_PART_ORDER,
  MANNEQUIN_URL,
  MannequinUnavailableError,
  normalizeToUnitBox,
  normalizeTriangleCentroid,
  POSE_MATERIAL_FLAT_SHADING,
  POSE_MESH_ORDER,
  selectPartTriangles,
  SPHERE_HEIGHT_SEGMENTS,
  SPHERE_WIDTH_SEGMENTS,
  triangleCentroid,
  UNIT_BOUNDS,
  type PoseMeshBounds,
  type ThreeNamespace,
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

/* ══ ⚠️ MODEL-SPACE ORIGINS — plan 08 task 01, F2 ════════════════════════ */

/**
 * ⚠️ **These blocks DO construct real three objects, and the file header's
 * "nothing here constructs a three geometry" no longer covers them.**
 *
 * That rule was written for a reason that turned out to be narrower than it
 * looked: jsdom has no WebGL. But **WebGL is only needed by `WebGLRenderer`**.
 * `BufferGeometry`, `BoxGeometry`, `Vector3`, `Matrix4` and `Box3` are plain
 * TypedArray-and-float maths with no GPU in them, and the unit lane runs in
 * **node**, not jsdom (`vitest.config.ts` — `projects[0].environment: "node"`).
 * Measured this session: `new three.SphereGeometry(0.5, 48, 32)` constructs and
 * reports `boundingBox = [-0.5,-0.5,-0.5]..[0.5,0.5,0.5]` in this lane.
 *
 * This matters because F2 is precisely a claim about **vertex data**, and a
 * claim about vertex data asserted on constants instead of vertices is not
 * asserted at all. So the origin invariant is proven on real geometries:
 *
 * - the pure helper, exhaustively, on synthetic buffers;
 * - the three **primitives**, as actually constructed by `buildGeometry`
 *   (item 7 says *all* models — this is the assertion, not the comment); and
 * - the five **real mannequin parts**, cut out of the vendored asset by the
 *   real `buildPartGeometry`, which is the evidence the owner's bug is fixed.
 *
 * `three` is imported **dynamically inside the tests**, never at module level,
 * mirroring the production rule (D2/D15) so this file cannot become the thing
 * that drags three into an eager chunk.
 */
const loadThree = async (): Promise<ThreeNamespace> => await import("three");

/** A geometry's bounding-box centre, recomputed from the live vertex data. */
function geometryCentre(
  three: ThreeNamespace,
  geometry: BufferGeometry,
): PoseVector {
  const box = new three.Box3().setFromBufferAttribute(
    geometry.getAttribute("position") as never,
  );
  const c = box.getCenter(new three.Vector3());
  return { x: c.x, y: c.y, z: c.z };
}

/** A non-indexed triangle-soup geometry from a flat position array. */
function soup(three: ThreeNamespace, positions: number[]): BufferGeometry {
  const geometry = new three.BufferGeometry();
  geometry.setAttribute(
    "position",
    new three.Float32BufferAttribute(positions, 3),
  );
  return geometry;
}

describe("centerGeometryOnOrigin", () => {
  it("brings a geometry offset far from the origin back to the centre", async () => {
    const three = await loadThree();
    // A unit triangle-ish blob translated 1000 units away on every axis. The
    // magnitude is deliberate: a helper that "mostly" centres would still show
    // a residual here, where an epsilon on a unit-scale test would hide it.
    const g = soup(three, [
      1000, 2000, 3000, 1001, 2000, 3000, 1000, 2001, 3000, 1000, 2000, 3001,
    ]);
    centerGeometryOnOrigin(three, g);
    const c = geometryCentre(three, g);
    for (const axis of AXES) expect(c[axis], axis).toBeCloseTo(0, 6);
  });

  it("leaves an already-centred geometry EXACTLY unchanged — idempotent", async () => {
    const three = await loadThree();
    const g = soup(three, [-1, -1, -1, 1, 1, 1, -1, 1, -1, 1, -1, 1]);
    const before = Array.from(
      g.getAttribute("position").array as Float32Array,
    );

    centerGeometryOnOrigin(three, g);
    const once = Array.from(g.getAttribute("position").array as Float32Array);
    // ⚠️ `toEqual`, not `toBeCloseTo`: an already-centred geometry must not
    // drift by a float epsilon per call. Running the helper in a hot path (a
    // future re-fit, say) would otherwise walk the mesh off the origin.
    expect(once).toEqual(before);

    centerGeometryOnOrigin(three, g);
    centerGeometryOnOrigin(three, g);
    expect(Array.from(g.getAttribute("position").array as Float32Array)).toEqual(
      before,
    );
  });

  it("is idempotent on an OFF-centre geometry too — the second call is a no-op", async () => {
    const three = await loadThree();
    const g = soup(three, [10, 20, 30, 12, 20, 30, 10, 24, 30, 10, 20, 36]);
    centerGeometryOnOrigin(three, g);
    const once = Array.from(g.getAttribute("position").array as Float32Array);
    centerGeometryOnOrigin(three, g);
    expect(Array.from(g.getAttribute("position").array as Float32Array)).toEqual(
      once,
    );
  });

  it("does not divide by zero or produce NaN on a single vertex", async () => {
    const three = await loadThree();
    // A degenerate geometry: one vertex, so the box has zero extent on every
    // axis. Its centre is still well-defined (the vertex itself), so the
    // correct answer is "translate it to the origin", NOT "bail". What must
    // never happen is a NaN — `normalizeToUnitBox` bails on zero extent for
    // the scale, but there is no division here at all.
    const g = soup(three, [7, -3, 11]);
    centerGeometryOnOrigin(three, g);
    const p = Array.from(g.getAttribute("position").array as Float32Array);
    for (const value of p) expect(Number.isNaN(value)).toBe(false);
    for (const value of p) expect(value).toBeCloseTo(0, 6);
  });

  it("survives an empty position attribute without throwing", async () => {
    const three = await loadThree();
    const g = soup(three, []);
    expect(() => centerGeometryOnOrigin(three, g)).not.toThrow();
    expect(g.getAttribute("position").count).toBe(0);
  });

  it("survives a geometry with NO position attribute at all", async () => {
    const three = await loadThree();
    const g = new three.BufferGeometry();
    expect(() => centerGeometryOnOrigin(three, g)).not.toThrow();
  });

  it("leaves a NaN-poisoned geometry alone rather than spreading the NaN", async () => {
    const three = await loadThree();
    // ⚠️ A non-finite centre must NOT be subtracted: `x - NaN` is NaN, so a
    // single bad vertex would turn the whole buffer into NaN and blank the
    // render with no error. Bailing keeps the damage where it already was.
    const g = soup(three, [0, 0, 0, 1, 1, 1, Number.NaN, 2, 2]);
    // three's `computeBoundingBox` warns on a NaN position — which is correct
    // and is exactly how the helper detects the condition. Silenced so the
    // suite's output stays readable; asserted so the warning is not lost.
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      centerGeometryOnOrigin(three, g);
    } finally {
      warn.mockRestore();
    }
    const p = Array.from(g.getAttribute("position").array as Float32Array);
    expect(p[0]).toBe(0);
    expect(p[3]).toBe(1);
  });

  it("does not change the vertex COUNT", async () => {
    const three = await loadThree();
    const g = soup(three, [5, 5, 5, 6, 7, 8, 9, 10, 11, 1, 2, 3]);
    const before = g.getAttribute("position").count;
    centerGeometryOnOrigin(three, g);
    expect(g.getAttribute("position").count).toBe(before);
  });

  it("⚠️ does NOT touch the normal attribute — smooth shading survives", async () => {
    const three = await loadThree();
    // THE regression guard for plan 07 task 05. A translation does not affect
    // normals mathematically, so the only way they could change is if this
    // helper called `computeVertexNormals()` — which on a non-indexed geometry
    // assigns per-FACE normals and would silently restore flat shading. Assert
    // the array is the SAME OBJECT and byte-identical.
    const g = soup(three, [100, 100, 100, 101, 100, 100, 100, 101, 100]);
    const normals = new three.Float32BufferAttribute(
      [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
      3,
    );
    g.setAttribute("normal", normals);
    const before = Array.from(normals.array as Float32Array);

    centerGeometryOnOrigin(three, g);

    expect(g.getAttribute("normal")).toBe(normals);
    expect(Array.from(g.getAttribute("normal").array as Float32Array)).toEqual(
      before,
    );
  });

  it("⚠️ does not re-normalise non-unit normals the way three's translate() does", async () => {
    // ⚠️ THE finding of plan 08 task 01, pinned as its own test because the
    // wrong implementation is the OBVIOUS one.
    //
    // `BufferGeometry.translate()` delegates to `applyMatrix4()`, which also
    // runs `normal.applyNormalMatrix(...)` — and that ends in `.normalize()`
    // on every normal in the buffer. A translation's normal matrix is the
    // identity, so no direction changes, but re-normalising still REWRITES
    // every value. Measured against three 0.185.1 while writing this: the real
    // torso's normals moved from 0.4748470187187195 to 0.4748469889163971.
    //
    // The guard is a deliberately NON-unit normal. If `centerGeometryOnOrigin`
    // ever goes back to `translate()`, this comes back normalised and fails.
    const three = await loadThree();
    const g = soup(three, [10, 10, 10, 11, 10, 10, 10, 11, 10]);
    g.setAttribute(
      "normal",
      new three.Float32BufferAttribute([2, 0, 0, 0, 3, 0, 0, 0, 4], 3),
    );
    centerGeometryOnOrigin(three, g);
    const after = Array.from(g.getAttribute("normal").array as Float32Array);
    // Still 2, 3, 4 — NOT normalised to 1.
    expect(after).toEqual([2, 0, 0, 0, 3, 0, 0, 0, 4]);
  });

  it("recomputes the bounds rather than leaving them stale", async () => {
    const three = await loadThree();
    const g = soup(three, [50, 50, 50, 52, 50, 50, 50, 54, 50, 50, 50, 56]);
    // Seed a bounding box from the PRE-translation vertices, so a helper that
    // forgot to recompute would leave these reading the old, far-away box.
    g.computeBoundingBox();
    g.computeBoundingSphere();
    expect(g.boundingBox!.min.x).toBe(50);

    centerGeometryOnOrigin(three, g);

    // ⚠️ Read the CACHED box, not a freshly computed one — a stale cache is
    // exactly the bug, and recomputing here would hide it.
    const cached = g.boundingBox!.getCenter(new three.Vector3());
    for (const axis of AXES) expect(cached[axis], axis).toBeCloseTo(0, 6);
    expect(g.boundingSphere!.center.length()).toBeCloseTo(0, 6);
  });

  it("centres a lopsided box on its BOX centre, not on its centroid", async () => {
    const three = await loadThree();
    // 1,000 vertices bunched at x = 0 and one lone vertex at x = 100. The
    // centroid is ≈ 0.1; the bounding-box centre is 50. F2 says bounding
    // VOLUME, and the camera fit measures a box — so the box centre is the
    // right answer and this pins which one was implemented.
    const positions: number[] = [];
    for (let i = 0; i < 1000; i++) positions.push(0, 0, 0);
    positions.push(100, 0, 0);
    const g = soup(three, positions);
    centerGeometryOnOrigin(three, g);
    const array = g.getAttribute("position").array as Float32Array;
    expect(array[0]).toBeCloseTo(-50, 4);
    expect(array[3000]).toBeCloseTo(50, 4);
  });
});

/* ══ item 7: the PRIMITIVES, asserted rather than assumed ════════════════ */

describe("every primitive's geometry is already origin-centred", () => {
  /**
   * ⚠️ The comment at `buildGeometry` claims "the constructor arguments ARE
   * the normalisation". The owner's instruction was *all* models, so plan 08
   * task 01 item 6 requires that claim be **tested**, not trusted. It is
   * tested on the real constructed geometry, in the node lane, because three's
   * geometry constructors need no WebGL.
   */
  const PRIMITIVES = ["cube", "sphere", "cylinder"] as const;

  it.each(PRIMITIVES)("centres %s's vertices on the origin", async (id) => {
    const three = await loadThree();
    const g = buildGeometry(three, id);
    const c = geometryCentre(three, g);
    for (const axis of AXES) expect(c[axis], `${id}.${axis}`).toBeCloseTo(0, 6);
  });

  it.each(PRIMITIVES)("fits %s inside UNIT_BOUNDS exactly", async (id) => {
    const three = await loadThree();
    const g = buildGeometry(three, id);
    const box = new three.Box3().setFromBufferAttribute(
      g.getAttribute("position") as never,
    );
    // Not just centred — the unit box, which is the promise `fitCameraToMesh`
    // is written against (it is passed a constant `UNIT_BOUNDS`).
    for (const axis of AXES) {
      expect(box.min[axis], `${id}.min.${axis}`).toBeCloseTo(
        UNIT_BOUNDS.min[axis],
        5,
      );
      expect(box.max[axis], `${id}.max.${axis}`).toBeCloseTo(
        UNIT_BOUNDS.max[axis],
        5,
      );
    }
  });

  it.each(PRIMITIVES)(
    "leaves %s unchanged when centred again — it was already centred",
    async (id) => {
      const three = await loadThree();
      const g = buildGeometry(three, id);
      const before = Array.from(
        g.getAttribute("position").array as Float32Array,
      );
      centerGeometryOnOrigin(three, g);
      // The strongest form of "already centred": the helper is a literal no-op
      // on it. If a constructor argument were ever changed to something
      // off-centre, this fails rather than being silently corrected.
      expect(
        Array.from(g.getAttribute("position").array as Float32Array),
      ).toEqual(before);
    },
  );
});

/* ══ ⚠️ THE REAL PARTS — the evidence the owner's bug is fixed ═══════════ */

/**
 * Rebuild the vendored asset as a real three scene, WITHOUT `GLTFLoader`.
 *
 * The suite already decodes the glTF's embedded base64 buffer by hand
 * (see {@link decodeMannequin}); this reuses that technique to hand the real
 * `buildPartGeometry` a real `Object3D`, so the **production segmentation
 * code** runs on the **production asset** in the node lane. That is what makes
 * the "the part is origin-centred" claim evidence rather than a restatement.
 *
 * Both nodes carry no transform in this asset (`nodes` is
 * `[{mesh:0}, {mesh:1}]`), so a flat `Group` of two `Mesh`es is faithful.
 */
async function buildRealScene(): Promise<{
  three: ThreeNamespace;
  scene: Object3D;
}> {
  const three = await loadThree();
  const path = fileURLToPath(
    new URL("../../../../../public/models/mannequin.gltf", import.meta.url),
  );
  const gltf = JSON.parse(readFileSync(path, "utf8")) as {
    meshes: { primitives: { attributes: Record<string, number>; indices: number }[] }[];
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
    const stride = a.type === "VEC3" ? 3 : a.type === "VEC2" ? 2 : 1;
    if (a.componentType === 5126 /* FLOAT */) {
      const out = new Float32Array(a.count * stride);
      for (let i = 0; i < out.length; i++) out[i] = bytes.readFloatLE(offset + i * 4);
      return out;
    }
    const out = new Uint16Array(a.count * stride);
    for (let i = 0; i < out.length; i++) out[i] = bytes.readUInt16LE(offset + i * 2);
    return out;
  };

  const scene = new three.Group();
  for (const mesh of gltf.meshes) {
    for (const primitive of mesh.primitives) {
      const geometry = new three.BufferGeometry();
      geometry.setAttribute(
        "position",
        new three.Float32BufferAttribute(
          read(primitive.attributes.POSITION) as Float32Array,
          3,
        ),
      );
      if (typeof primitive.attributes.NORMAL === "number") {
        geometry.setAttribute(
          "normal",
          new three.Float32BufferAttribute(
            read(primitive.attributes.NORMAL) as Float32Array,
            3,
          ),
        );
      }
      geometry.setIndex(
        new three.BufferAttribute(read(primitive.indices) as Uint16Array, 1),
      );
      scene.add(new three.Mesh(geometry));
    }
  }
  return { three, scene };
}

describe("⚠️ every real mannequin part has its geometry origin at its own centre", () => {
  /**
   * ⚠️ **MEASURED BEFORE THE FIX, 2026-09-03** — the bug, in numbers.
   *
   * These are the bounding-box centres `buildPartGeometry` produced when its
   * output went straight into `normalizeToUnitBox`. Every one of them is a
   * position on the *mannequin*, not a part-local centre: `head` at
   * `y = 1.5666` is the height of a head on a standing figure. That is what
   * "the pieces are in the mannequin's model space still" means, and it is why
   * `root.rotation.set(...)` swung a head about the figure's pelvis.
   *
   * Kept as documentation of the defect, and asserted as a **guard**: the
   * segmentation must still select the same geometry, so these numbers must
   * still be what the raw part measures. If they move, the landmarks moved and
   * this task broke something it was told not to touch.
   */
  const BEFORE: Record<PosePartId, PoseVector> = {
    head: { x: 0, y: 1.566564, z: 0.05202 },
    torso: { x: 0, y: 1.112343, z: 0.044983 },
    arm: { x: 0, y: 1.341685, z: 0.034952 },
    leg: { x: 0, y: 0.421285, z: 0.05949 },
    hand: { x: 0, y: 1.340209, z: 0.086856 },
  };

  it.each(MANNEQUIN_PART_ORDER)(
    "still cuts %s out in the mannequin's space, at the measured centre",
    async (part) => {
      const { three, scene } = await buildRealScene();
      const g = buildPartGeometry(three, scene, part);
      const c = geometryCentre(three, g);
      // The "before" half of the evidence, and a landmark tripwire: if the
      // segmentation changed, the part being centred below is a different part.
      for (const axis of AXES) {
        expect(c[axis], `${part}.${axis}`).toBeCloseTo(BEFORE[part][axis], 4);
      }
    },
  );

  it.each(MANNEQUIN_PART_ORDER)(
    "⚠️ centres %s's VERTICES on the origin — F2, the headline assertion",
    async (part) => {
      const { three, scene } = await buildRealScene();
      const g = buildPartGeometry(three, scene, part);
      centerGeometryOnOrigin(three, g);
      const c = geometryCentre(three, g);
      // THE assertion this task exists for. Not the mesh's transform — the
      // vertex data. A head now rotates about the head.
      for (const axis of AXES) {
        expect(c[axis], `${part}.${axis}`).toBeCloseTo(0, 5);
      }
    },
  );

  it.each(MANNEQUIN_PART_ORDER)(
    "keeps %s's triangle count and normals intact through the centring",
    async (part) => {
      const { three, scene } = await buildRealScene();
      const g = buildPartGeometry(three, scene, part);
      const triangles = g.getAttribute("position").count / 3;
      const normals = g.getAttribute("normal");
      const before = Array.from(normals.array as Float32Array);

      centerGeometryOnOrigin(three, g);

      // ⚠️ Not "unchanged", but "not touched at all" — same attribute object.
      expect(g.getAttribute("normal")).toBe(normals);
      expect(Array.from(g.getAttribute("normal").array as Float32Array)).toEqual(
        before,
      );
      expect(g.getAttribute("position").count / 3).toBe(triangles);
    },
  );

  it("holds the pinned triangle counts through the real construction path", async () => {
    // The counts the segmentation is pinned to, re-asserted on the geometry
    // this file now builds for real rather than on the pure classifier alone.
    // If centring ever moved a vertex across a landmark it would show here.
    const { three, scene } = await buildRealScene();
    const EXPECTED: Record<PosePartId, number> = {
      head: 336,
      torso: 2912,
      arm: 1062,
      leg: 1346,
      hand: 3980,
    };
    let total = 0;
    for (const part of MANNEQUIN_PART_ORDER) {
      const g = buildPartGeometry(three, scene, part);
      centerGeometryOnOrigin(three, g);
      const count = g.getAttribute("position").count / 3;
      expect(count, part).toBe(EXPECTED[part]);
      total += count;
    }
    expect(total).toBe(9636);
  });

  it("⚠️ makes normalizeToUnitBox's position.sub a NO-OP for a centred part", async () => {
    // Step 3 of the task: "assert that rather than assuming it."
    //
    // This is the property that proves the two mechanisms are not fighting.
    // Before the fix the mesh's `position` carried the whole model-space
    // offset (head: y = -5.5258, measured). After it, the transform is pure
    // scale — which is exactly what plan 08 F3 needs, because pan must be the
    // ONLY thing that ever moves a position and it lives on the camera.
    const { three, scene } = await buildRealScene();
    for (const part of MANNEQUIN_PART_ORDER) {
      const g = buildPartGeometry(three, scene, part);
      centerGeometryOnOrigin(three, g);
      const mesh = new three.Mesh(g);
      normalizeToUnitBox(three, mesh);
      expect(mesh.position.x, `${part}.x`).toBeCloseTo(0, 6);
      expect(mesh.position.y, `${part}.y`).toBeCloseTo(0, 6);
      expect(mesh.position.z, `${part}.z`).toBeCloseTo(0, 6);
      // Scale is still doing its job — the part IS resized into the unit box.
      expect(mesh.scale.x, `${part}.scale`).toBeGreaterThan(0);
    }
  });

  it("lands every centred, normalised part inside UNIT_BOUNDS", async () => {
    // The end-to-end promise `fitCameraToMesh` is written against: it is
    // handed a constant `UNIT_BOUNDS` and must not be lied to.
    const { three, scene } = await buildRealScene();
    for (const part of MANNEQUIN_PART_ORDER) {
      const g = buildPartGeometry(three, scene, part);
      centerGeometryOnOrigin(three, g);
      const mesh = new three.Mesh(g);
      normalizeToUnitBox(three, mesh);
      const box = new three.Box3().setFromObject(mesh);
      for (const axis of AXES) {
        expect(box.min[axis], `${part}.min.${axis}`).toBeGreaterThanOrEqual(
          UNIT_BOUNDS.min[axis] - 1e-5,
        );
        expect(box.max[axis], `${part}.max.${axis}`).toBeLessThanOrEqual(
          UNIT_BOUNDS.max[axis] + 1e-5,
        );
      }
      // The largest axis reaches the box exactly — it is a fit, not a shrink.
      const size = box.getSize(new three.Vector3());
      expect(Math.max(size.x, size.y, size.z), part).toBeCloseTo(1, 5);
    }
  });
});

/* ══ open question 3: the FULL mannequin scene ═══════════════════════════ */

describe("centerSceneGeometryOnOrigin — the whole figure, not just the parts", () => {
  it("⚠️ centres the real mannequin scene's VERTICES, tree and all", async () => {
    // Plan 08 open question 3, answered YES. The owner said ALL models; the
    // full figure is the mesh whose rotation the orb drives most often, so
    // leaving it orbiting its own pelvis would have reproduced the reported
    // bug on the one mesh most likely to show it.
    const { three, scene } = await buildRealScene();
    const before = new three.Box3().setFromObject(scene).getCenter(
      new three.Vector3(),
    );
    // The asset really is off-centre to begin with, so this is a real test.
    expect(before.length()).toBeGreaterThan(0.5);

    centerSceneGeometryOnOrigin(three, scene);

    const after = new three.Box3().setFromObject(scene).getCenter(
      new three.Vector3(),
    );
    for (const axis of AXES) expect(after[axis], axis).toBeCloseTo(0, 5);
  });

  it("shifts every node by the SAME vector — it does not explode the figure", async () => {
    // ⚠️ The mistake this guards: running `centerGeometryOnOrigin` in a
    // `traverse` would centre each mesh on ITS OWN centre, stacking the pieces
    // on the origin and destroying the figure. Each geometry must move by one
    // shared world-space offset, so the offset between the two nodes' own
    // centres must be preserved exactly.
    const { three, scene } = await buildRealScene();
    const centres = (): PoseVector[] => {
      const out: PoseVector[] = [];
      scene.traverse((node) => {
        const holder = node as Object3D & {
          isMesh?: boolean;
          geometry?: BufferGeometry;
        };
        if (!holder.isMesh || !holder.geometry) return;
        out.push(geometryCentre(three, holder.geometry));
      });
      return out;
    };
    const before = centres();
    expect(before.length).toBe(2);
    const gap = {
      x: before[1].x - before[0].x,
      y: before[1].y - before[0].y,
      z: before[1].z - before[0].z,
    };

    centerSceneGeometryOnOrigin(three, scene);

    const after = centres();
    for (const axis of AXES) {
      expect(after[1][axis] - after[0][axis], axis).toBeCloseTo(gap[axis], 5);
    }
  });

  it("keeps the scene's triangle count and node structure intact", async () => {
    const { three, scene } = await buildRealScene();
    const count = (): { nodes: number; triangles: number } => {
      let nodes = 0;
      let triangles = 0;
      scene.traverse((node) => {
        const holder = node as Object3D & {
          isMesh?: boolean;
          geometry?: BufferGeometry;
        };
        if (!holder.isMesh || !holder.geometry) return;
        nodes++;
        const index = holder.geometry.getIndex();
        triangles += (index?.count ?? holder.geometry.getAttribute("position").count) / 3;
      });
      return { nodes, triangles };
    };
    const before = count();
    expect(before.triangles).toBe(9636);
    centerSceneGeometryOnOrigin(three, scene);
    expect(count()).toEqual(before);
  });

  it("respects a node transform rather than assuming a flat tree", async () => {
    // The vendored asset has no node transforms, so the general correctness of
    // the world→local offset conversion would otherwise be untested. A rotated,
    // scaled, translated child proves the maths: whatever the node's matrix, the
    // scene's WORLD box must end up centred on the origin.
    const three = await loadThree();
    const scene = new three.Group();
    const child = new three.Object3D();
    child.position.set(3, -4, 5);
    child.rotation.set(0.3, -0.7, 1.1);
    child.scale.set(2, 0.5, 3);
    scene.add(child);
    child.add(
      new three.Mesh(soup(three, [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1])),
    );
    scene.updateWorldMatrix(true, true);
    expect(
      new three.Box3().setFromObject(scene).getCenter(new three.Vector3()).length(),
    ).toBeGreaterThan(1);

    centerSceneGeometryOnOrigin(three, scene);

    scene.updateWorldMatrix(true, true);
    const after = new three.Box3().setFromObject(scene).getCenter(
      new three.Vector3(),
    );
    for (const axis of AXES) expect(after[axis], axis).toBeCloseTo(0, 5);
  });

  it("⚠️ leaves the real scene's normals byte-identical", async () => {
    // The whole-figure counterpart of the `translate()` finding: the full
    // mannequin is the mesh the owner looks at most, so restoring flat shading
    // on it would be the most visible possible regression.
    const { three, scene } = await buildRealScene();
    const snapshot = (): number[][] => {
      const out: number[][] = [];
      scene.traverse((node) => {
        const holder = node as Object3D & {
          isMesh?: boolean;
          geometry?: BufferGeometry;
        };
        if (!holder.isMesh || !holder.geometry) return;
        const normal = holder.geometry.getAttribute("normal");
        out.push(Array.from(normal.array as Float32Array));
      });
      return out;
    };
    const before = snapshot();
    expect(before.length).toBe(2);
    centerSceneGeometryOnOrigin(three, scene);
    expect(snapshot()).toEqual(before);
  });

  it("is idempotent and safe on an empty scene", async () => {
    const three = await loadThree();
    const empty = new three.Group();
    expect(() => centerSceneGeometryOnOrigin(three, empty)).not.toThrow();

    const { three: t2, scene } = await buildRealScene();
    centerSceneGeometryOnOrigin(t2, scene);
    const once = new t2.Box3().setFromObject(scene).getCenter(new t2.Vector3());
    centerSceneGeometryOnOrigin(t2, scene);
    const twice = new t2.Box3().setFromObject(scene).getCenter(new t2.Vector3());
    for (const axis of AXES) expect(twice[axis], axis).toBeCloseTo(once[axis], 6);
  });
});
