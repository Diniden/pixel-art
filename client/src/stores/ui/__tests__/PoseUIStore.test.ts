/**
 * PoseUIStore — defaults, every setter, the clamps, `clear()`, and the
 * project-switch reaction (pose-tool task 02).
 *
 * Pins MASTER D6: session-only state that survives everything except a fresh
 * project install, and the `observableRef` contract — `rotation`,
 * `lightDirection`, the two colours and `pan` are never MobX proxies and every
 * write produces a NEW object identity, which is what lets the overlay painter
 * decide to re-render on identity alone.
 *
 * Also pins MASTER D7 (`setMesh` resets pan), the FOV clamp, the outline
 * thickness (`edgeWidth`, E4 — integer 0–4, default OFF), and
 * — from the refinements plan, 2026-09-03 — that the model's `scale` has **no
 * upper bound** (E11), that pan is **never** clamped (E13), and that
 * `fitGeneration` / `requestFit()` form an event counter that mutates no
 * camera state (E14/E15).
 *
 * ⚠️ Plan 08 F7 (2026-09-04) added `applyCameraPreset` — a preset now sets
 * EVERY camera field and the MODEL'S ROTATION in one action, and deliberately
 * leaves `scale` and `pan` alone. That decision is pinned below; the reasoning
 * lives beside `PoseCameraPresetSpec` in `ui/canvas/pose/poseCamera.ts`.
 *
 * ⚠️ `zoom`/`setZoom`/`POSE_ZOOM_MIN_SAFE` were renamed to
 * `scale`/`setScale`/`POSE_SCALE_MIN_SAFE` on 2026-09-04 (plan 08, F6) AND
 * re-meant: the value is now a multiplier on the MODEL's own transform about
 * its own origin, not a divisor on the camera frustum. The store's arithmetic
 * is unchanged, which is why these tests survive the rename verbatim; what
 * changed is what the container does with the number.
 *
 * The last block wires a real `ApplicationStore` the way
 * `ReflectionUIStore.test.ts` does (no Zustand, no auto-save) to pin that
 * `app.pose` exists, that bumping `DomainStore.loadGeneration` clears it,
 * that `adoptTree` alone (the snapshot-undo path) does NOT, and that nothing
 * reaches the persisted wire format.
 */
import { describe, expect, it } from "vitest";
import { isObservable, isObservableProp, reaction, runInAction } from "mobx";
import {
  DEFAULT_POSE_LIGHT_COLOR,
  DEFAULT_POSE_LIGHT_DIRECTION,
  DEFAULT_POSE_MODEL_COLOR,
  DEFAULT_POSE_PAN,
  DEFAULT_POSE_ROTATION,
  POSE_FOV_MAX,
  POSE_FOV_MIN,
  DEFAULT_POSE_EDGE_WIDTH,
  POSE_EDGE_WIDTH_MAX,
  POSE_EDGE_WIDTH_MIN,
  POSE_SCALE_MIN_SAFE,
  PoseUIStore,
} from "../PoseUIStore";
import { ApplicationStore } from "@/stores/ApplicationStore";
import type { ProjectHost } from "@/stores/domain/DomainStore";
import type { DomainMirror } from "@/stores/domain/DomainMutator";
import type { SelectionSink } from "@/stores/domain/ObjectStore";
import { tinyProject } from "@/store/__tests__/storeContract";

const RED = { r: 255, g: 0, b: 0, a: 255 };
const BLUE = { r: 0, g: 0, b: 255, a: 255 };

describe("PoseUIStore — defaults", () => {
  it("starts with no mesh and the documented defaults", () => {
    const s = new PoseUIStore();
    expect(s.meshId).toBeNull();
    expect(s.hasMesh).toBe(false);
    // ⚠️ The outline is OFF by default (MASTER E4). A non-zero default would
    // put an edge around the reference of every existing project unbidden.
    expect(s.edgeWidth).toBe(0);
    expect(DEFAULT_POSE_EDGE_WIDTH).toBe(0);
    expect(s.rotation).toEqual({ x: 0, y: 0, z: 0 });
    expect(s.lightColor).toEqual({ r: 255, g: 255, b: 255, a: 255 });
    expect(s.modelColor).toEqual(DEFAULT_POSE_MODEL_COLOR);
    expect(s.projection).toBe("perspective");
    expect(s.cameraPreset).toBe("2.5d");
    expect(s.scale).toBe(1);
    expect(s.fov).toBe(50);
    expect(s.pan).toEqual({ x: 0, y: 0 });
    expect(s.fitGeneration).toBe(0);
  });

  it("the default light direction is a unit vector pointing up/left/front", () => {
    const d = DEFAULT_POSE_LIGHT_DIRECTION;
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 10);
    expect(d.x).toBeLessThan(0);
    expect(d.y).toBeGreaterThan(0);
    expect(d.z).toBeGreaterThan(0);
  });

  it("every field is observable and the ref fields are NOT deep", () => {
    const s = new PoseUIStore();
    for (const key of [
      "meshId",
      "edgeWidth",
      "rotation",
      "lightDirection",
      "lightColor",
      "modelColor",
      "projection",
      "cameraPreset",
      "scale",
      "fov",
      "pan",
      "fitGeneration",
    ] as const) {
      expect(isObservableProp(s, key)).toBe(true);
    }
    // `observableRef` means the held objects are plain, never proxies — the
    // engine compares them by identity and must never see a MobX wrapper.
    runInAction(() => s.setRotation({ x: 1, y: 2, z: 3 }));
    runInAction(() => s.setPan({ x: 4, y: 5 }));
    runInAction(() => s.setLightColor(RED));
    expect(s.rotation).toEqual({ x: 1, y: 2, z: 3 });
    expect(s.pan).toEqual({ x: 4, y: 5 });
    expect(s.lightColor).toEqual(RED);
  });
});

describe("PoseUIStore — setters", () => {
  it("setMesh loads a mesh and flips hasMesh", () => {
    const s = new PoseUIStore();
    runInAction(() => s.setMesh("sphere"));
    expect(s.meshId).toBe("sphere");
    expect(s.hasMesh).toBe(true);
    runInAction(() => s.setMesh(null));
    expect(s.meshId).toBeNull();
    expect(s.hasMesh).toBe(false);
  });

  it("setMesh resets pan but keeps rotation, light, camera and edgeWidth", () => {
    const s = new PoseUIStore();
    runInAction(() => {
      s.setMesh("mannequin");
      s.setEdgeWidth(3);
      s.setPan({ x: 7, y: -3 });
      s.setRotation({ x: 0.5, y: 0.5, z: 0 });
      s.setScale(2);
      s.setProjection("orthographic");
    });

    runInAction(() => s.setMesh("cube"));

    expect(s.pan).toEqual({ x: 0, y: 0 });
    // The owner's working setup survives a mesh swap — the outline width
    // included: it is an outline preference, not a property of the mesh, and
    // snapping it back to Off on every part button would make comparing two
    // parts at the same thickness impossible.
    expect(s.edgeWidth).toBe(3);
    expect(s.rotation).toEqual({ x: 0.5, y: 0.5, z: 0 });
    expect(s.scale).toBe(2);
    expect(s.projection).toBe("orthographic");
  });

  /**
   * MASTER E1/E2/E20 — the part ids are MESH ids now, so `setMesh` takes them
   * directly. This is the store half of the union mirroring: the same five
   * spellings the old `PoseFraming` used, so a stale session value for a body
   * part still resolves to the same body part.
   */
  it("setMesh accepts every mannequin part id as a mesh in its own right", () => {
    const s = new PoseUIStore();
    for (const id of ["head", "torso", "arm", "leg", "hand"] as const) {
      runInAction(() => s.setMesh(id));
      expect(s.meshId).toBe(id);
      expect(s.hasMesh).toBe(true);
    }
    // `"mannequin"` is the WHOLE figure — what the rail labels Full, and what
    // the deleted framing union called `"full"`. There is no `"full"` mesh id.
    runInAction(() => s.setMesh("mannequin"));
    expect(s.meshId).toBe("mannequin");
  });

  /**
   * The initial auto-fit (E15: still runs on mesh change) is the container's
   * job, but it depends on `setMesh` continuing to recentre — so pin the store
   * half here. An unclamped pan makes this MORE important, not less: without
   * the reset, an off-canvas pan from the previous mesh would carry over and
   * the new mesh would auto-fit to a frame the owner cannot see.
   */
  it("a new mesh recentres pan even when the old pan was far off canvas", () => {
    const s = new PoseUIStore();
    runInAction(() => {
      s.setMesh("cube");
      s.setPan({ x: 4000, y: -4000 });
      s.setScale(2500);
    });
    runInAction(() => s.setMesh("sphere"));
    expect(s.pan).toEqual({ x: 0, y: 0 });
    // The owner's own scale is their working setup and survives, uncapped.
    expect(s.scale).toBe(2500);
  });



  it("setLightDirection normalises", () => {
    const s = new PoseUIStore();
    runInAction(() => s.setLightDirection({ x: 0, y: 0, z: 4 }));
    expect(s.lightDirection).toEqual({ x: 0, y: 0, z: 1 });

    runInAction(() => s.setLightDirection({ x: 3, y: 4, z: 0 }));
    expect(s.lightDirection.x).toBeCloseTo(0.6, 10);
    expect(s.lightDirection.y).toBeCloseTo(0.8, 10);
  });

  it("setLightDirection survives a zero vector rather than emitting NaN", () => {
    const s = new PoseUIStore();
    runInAction(() => s.setLightDirection({ x: 0, y: 0, z: 0 }));
    expect(s.lightDirection).toEqual({ x: 0, y: 0, z: 0 });
    expect(Number.isNaN(s.lightDirection.x)).toBe(false);
  });

  it("setLightColor and setModelColor copy the colour", () => {
    const s = new PoseUIStore();
    runInAction(() => {
      s.setLightColor(RED);
      s.setModelColor(BLUE);
    });
    expect(s.lightColor).toEqual(RED);
    expect(s.modelColor).toEqual(BLUE);
    // A copy, not the caller's object — the caller may go on mutating theirs.
    expect(s.lightColor).not.toBe(RED);
    expect(s.modelColor).not.toBe(BLUE);
  });

  it("setProjection and setCameraPreset store the choice", () => {
    const s = new PoseUIStore();
    runInAction(() => s.setProjection("orthographic"));
    expect(s.projection).toBe("orthographic");
    runInAction(() => s.setCameraPreset("iso"));
    expect(s.cameraPreset).toBe("iso");
  });

  it("setCameraPreset records the id and touches nothing else", () => {
    // ⚠️ The low-level setter, deliberately kept alongside `applyCameraPreset`
    // for callers that have already written the other fields themselves. A
    // preset BUTTON must not call this one — see the F7 block below.
    const s = new PoseUIStore();
    runInAction(() => {
      s.setScale(3);
      s.setPan({ x: 2, y: 2 });
      s.setRotation({ x: 0.1, y: 0.2, z: 0.3 });
      s.setProjection("perspective");
      s.setFov(77);
      s.setCameraPreset("top-down");
    });
    expect(s.cameraPreset).toBe("top-down");
    expect(s.scale).toBe(3);
    expect(s.pan).toEqual({ x: 2, y: 2 });
    expect(s.rotation).toEqual({ x: 0.1, y: 0.2, z: 0.3 });
    expect(s.projection).toBe("perspective");
    expect(s.fov).toBe(77);
  });

  it("setPan is absolute and nudgePan is relative", () => {
    const s = new PoseUIStore();
    runInAction(() => s.setPan({ x: 5, y: 5 }));
    expect(s.pan).toEqual({ x: 5, y: 5 });
    runInAction(() => s.nudgePan(-2, 3));
    expect(s.pan).toEqual({ x: 3, y: 8 });
  });
});

/* ── scale: sanitised, not clamped ────────────────────────────────────────────
 *
 * MASTER E11 (refinements 2026-09-03). The old `POSE_ZOOM_MAX = 10` was the cap
 * the owner hit; it is deleted and these tests pin its absence. Only a safety
 * floor survives, because a zero or negative model scale collapses or mirrors
 * the geometry — arithmetic, not taste.
 *
 * ⚠️ These tests prove the STORE stores what it is given. Plan 08 (F6) closed
 * the gap the refinements plan left open: the value is no longer folded into
 * `fitCameraToMesh`'s padding — it is written onto the MODEL as
 * `root.scale.setScalar(...)`, so what is stored here is what is rendered.
 * That composition is the CONTAINER's, and is not testable from this file.
 */
/* ── F7: a preset sets EVERYTHING ─────────────────────────────────────────────
 *
 * **The owner's words:** *"The camera preset buttons: these should CHANGE all
 * of the other settings that can be used for the camera."*
 *
 * ⚠️ F7 SUPERSEDES plan 06's D14 ("a preset overrides the projection"), which
 * was kept by owner decision on 2026-09-03 — before F7 existed. It is not being
 * dropped by accident: a preset now owns projection AND every other camera
 * field AND the model's rotation, so D14 is subsumed rather than reversed. The
 * projection assertion below is D14's own guarantee, still holding.
 *
 * The specs here are written out by hand rather than imported from
 * `poseCamera.ts`, because `stores/**` may not import `ui/` — the same boundary
 * that forces `PoseCameraPresetApplication` to be a structural duplicate.
 * `poseCamera.test.ts` pins the real table's contents; this file pins what the
 * store DOES with one.
 */
const ISO_LIKE = {
  id: "iso" as const,
  projection: "orthographic" as const,
  pitch: 0.6154797086703873,
  yaw: Math.PI / 4,
  fov: 50,
  rotation: { x: 0, y: 0, z: 0 },
  clipPolicy: "fit" as const,
};

describe("PoseUIStore — applyCameraPreset sets the whole scene (F7)", () => {
  it("writes the id, the projection, the FOV and the model's ROTATION", () => {
    const s = new PoseUIStore();
    runInAction(() => {
      // A deliberately messy starting state: nothing here may survive except
      // the two fields F7 exempts.
      s.setCameraPreset("2d");
      s.setProjection("perspective");
      s.setFov(113);
      s.setRotation({ x: 1.1, y: 2.2, z: 3.3 });
      s.applyCameraPreset(ISO_LIKE);
    });
    expect(s.cameraPreset).toBe("iso");
    expect(s.projection).toBe("orthographic");
    expect(s.fov).toBe(50);
    expect(s.rotation).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("OVERWRITES a rotation the orb or a viewpoint button had set", () => {
    // ⚠️ This is the behaviour change, stated as a test so nobody "fixes" it
    // back. Owner-decided: a preset is a fully known scene state, and a scene
    // state that inherits an arbitrary orientation is not known.
    const s = new PoseUIStore();
    runInAction(() => s.setRotation({ x: 0, y: Math.PI / 2, z: 0 }));
    runInAction(() =>
      s.applyCameraPreset({ ...ISO_LIKE, rotation: { x: 0.25, y: 0.5, z: 0 } }),
    );
    expect(s.rotation).toEqual({ x: 0.25, y: 0.5, z: 0 });
  });

  it("leaves SCALE and PAN alone — open question 1, decided 2026-09-04", () => {
    // ⚠️ The decision, not an oversight. After tasks 03/04 neither is a camera
    // setting: `scale` is a MODEL transform (F6) and `pan` is framing rather
    // than orientation. A preset restores which way the scene points; losing
    // your zoom on every angle change is hostile.
    const s = new PoseUIStore();
    runInAction(() => {
      s.setScale(7.5);
      s.setPan({ x: -12, y: 34 });
      s.applyCameraPreset(ISO_LIKE);
    });
    expect(s.scale).toBe(7.5);
    expect(s.pan).toEqual({ x: -12, y: 34 });
  });

  it("leaves the mesh, the light and the outline alone", () => {
    // A preset is about the CAMERA and the model's orientation. It is not a
    // reset button, and it must not behave like one.
    const s = new PoseUIStore();
    runInAction(() => {
      s.setMesh("head");
      s.setEdgeWidth(3);
      s.setLightDirection({ x: 1, y: 0, z: 0 });
      s.setLightColor(RED);
      s.applyCameraPreset(ISO_LIKE);
    });
    expect(s.meshId).toBe("head");
    expect(s.edgeWidth).toBe(3);
    expect(s.lightDirection).toEqual({ x: 1, y: 0, z: 0 });
    expect(s.lightColor).toEqual(RED);
  });

  it("is IDEMPOTENT — applying the same preset twice changes nothing", () => {
    const s = new PoseUIStore();
    runInAction(() => s.applyCameraPreset(ISO_LIKE));
    const after = { ...s };
    runInAction(() => s.applyCameraPreset(ISO_LIKE));
    expect({ ...s }).toEqual(after);
  });

  it("clamps a preset's FOV exactly as setFov would", () => {
    // A preset must not be the one path that can get an out-of-range FOV into
    // the store — the readout and the stored value would disagree.
    const s = new PoseUIStore();
    runInAction(() => s.applyCameraPreset({ ...ISO_LIKE, fov: 500 }));
    expect(s.fov).toBe(POSE_FOV_MAX);
    runInAction(() => s.applyCameraPreset({ ...ISO_LIKE, fov: 1 }));
    expect(s.fov).toBe(POSE_FOV_MIN);
    runInAction(() => s.applyCameraPreset({ ...ISO_LIKE, fov: Number.NaN }));
    expect(s.fov).toBe(POSE_FOV_MIN);
  });

  it("COPIES the rotation rather than holding the preset table's object", () => {
    // ⚠️ `rotation` is an `observableRef` whose contract is wholesale
    // replacement with a plain object. Storing a shared module constant by
    // reference would let a future in-place write corrupt the preset table.
    const spec = { ...ISO_LIKE, rotation: { x: 0.1, y: 0.2, z: 0.3 } };
    const s = new PoseUIStore();
    runInAction(() => s.applyCameraPreset(spec));
    expect(s.rotation).toEqual(spec.rotation);
    expect(s.rotation).not.toBe(spec.rotation);
  });

  it("is ONE action — no reaction can observe a torn half-applied camera", () => {
    // Five separate setter calls would be five observable writes, and a
    // reaction reading two of them would run against an intermediate state
    // (new projection, old rotation) that is a real frame, not a theory.
    const s = new PoseUIStore();
    const seen: string[] = [];
    const stop = reaction(
      () => `${s.cameraPreset}|${s.projection}|${s.fov}|${s.rotation.y}`,
      (v) => seen.push(v),
    );
    runInAction(() =>
      s.applyCameraPreset({ ...ISO_LIKE, rotation: { x: 0, y: 1.25, z: 0 } }),
    );
    stop();
    expect(seen).toEqual(["iso|orthographic|50|1.25"]);
  });
});

describe("PoseUIStore — model-scale sanitising (no upper bound)", () => {
  it("accepts a huge scale verbatim — there is no cap", () => {
    const s = new PoseUIStore();
    runInAction(() => s.setScale(5000));
    expect(s.scale).toBe(5000);
  });

  it("accepts ordinary and very large scales unchanged", () => {
    const s = new PoseUIStore();
    for (const z of [POSE_SCALE_MIN_SAFE, 0.25, 1, 2.5, 10, 11, 250, 1e6]) {
      runInAction(() => s.setScale(z));
      expect(s.scale).toBe(z);
    }
  });

  it("floors zero and negatives — a non-positive scale collapses or mirrors", () => {
    const s = new PoseUIStore();
    runInAction(() => s.setScale(0));
    expect(s.scale).toBe(POSE_SCALE_MIN_SAFE);
    runInAction(() => s.setScale(-5));
    expect(s.scale).toBe(POSE_SCALE_MIN_SAFE);
    runInAction(() => s.setScale(-0));
    expect(s.scale).toBe(POSE_SCALE_MIN_SAFE);
  });

  it("floors a positive value below the safety floor", () => {
    const s = new PoseUIStore();
    runInAction(() => s.setScale(1e-9));
    expect(s.scale).toBe(POSE_SCALE_MIN_SAFE);
  });

  it("rejects NaN and BOTH infinities — the camera needs a finite scale", () => {
    const s = new PoseUIStore();
    // Unlike `setFov`, `+Infinity` cannot clamp to an upper bound here because
    // there is no longer one; a non-finite scale yields NaN matrices exactly as
    // NaN itself would, so it is rejected outright.
    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      runInAction(() => s.setScale(2));
      runInAction(() => s.setScale(bad));
      expect(s.scale).toBe(POSE_SCALE_MIN_SAFE);
      expect(Number.isFinite(s.scale)).toBe(true);
    }
  });

  it("the safety floor is a floor, not a range — it is far below any useful view", () => {
    expect(POSE_SCALE_MIN_SAFE).toBeGreaterThan(0);
    expect(POSE_SCALE_MIN_SAFE).toBeLessThan(0.01);
  });
});

/* ── the outline's thickness (MASTER E4) ───────────────────────────────────
 *
 * Session state like everything else in this store — the "not persisted" block
 * at the bottom of this file covers it with the rest.
 */
describe("PoseUIStore — edgeWidth (the outline thickness)", () => {
  it("defaults to 0 — the outline is OFF until asked for", () => {
    // ⚠️ The single most consequential value in this task. The pose tool
    // shipped without an outline, so a non-zero default would put one around
    // the reference of every existing project the first time its owner opened
    // the tool, unbidden and unattributable.
    expect(new PoseUIStore().edgeWidth).toBe(0);
    expect(DEFAULT_POSE_EDGE_WIDTH).toBe(POSE_EDGE_WIDTH_MIN);
  });

  it("stores each whole width in range", () => {
    const s = new PoseUIStore();
    for (const w of [0, 1, 2, 3, 4]) {
      runInAction(() => s.setEdgeWidth(w));
      expect(s.edgeWidth).toBe(w);
    }
  });

  it("clamps at both ends", () => {
    const s = new PoseUIStore();
    runInAction(() => s.setEdgeWidth(99));
    expect(s.edgeWidth).toBe(POSE_EDGE_WIDTH_MAX);
    runInAction(() => s.setEdgeWidth(-5));
    expect(s.edgeWidth).toBe(POSE_EDGE_WIDTH_MIN);
  });

  it("rounds — the outline dilates by WHOLE pixels at 1:1", () => {
    // `poseOutline.ts` floors whatever it is handed, so a stored 1.9 would
    // draw a 1-px outline while every readout said 2.
    const s = new PoseUIStore();
    for (const [input, expected] of [
      [1.4, 1],
      [1.5, 2],
      [2.6, 3],
      [3.49, 3],
    ] as const) {
      runInAction(() => s.setEdgeWidth(input));
      expect(s.edgeWidth).toBe(expected);
      expect(Number.isInteger(s.edgeWidth)).toBe(true);
    }
  });

  it("sends NaN to the OFF end, not to a random width", () => {
    const s = new PoseUIStore();
    runInAction(() => s.setEdgeWidth(2));
    runInAction(() => s.setEdgeWidth(Number.NaN));
    expect(s.edgeWidth).toBe(POSE_EDGE_WIDTH_MIN);
  });

  it("clamps both infinities to the bound they meet", () => {
    const s = new PoseUIStore();
    runInAction(() => s.setEdgeWidth(Number.POSITIVE_INFINITY));
    expect(s.edgeWidth).toBe(POSE_EDGE_WIDTH_MAX);
    runInAction(() => s.setEdgeWidth(Number.NEGATIVE_INFINITY));
    expect(s.edgeWidth).toBe(POSE_EDGE_WIDTH_MIN);
  });

  it("the range mirrors the rail's slider bounds exactly (E4)", () => {
    // ⚠️ Duplicated on purpose — `ui/` may not import `stores/`. The rail's
    // `POSE_EDGE_WIDTH_MIN`/`MAX` in `PoseSection.tsx` carry these same two
    // numbers, and the two change together. Pinned so a silent drift fails.
    expect(POSE_EDGE_WIDTH_MIN).toBe(0);
    expect(POSE_EDGE_WIDTH_MAX).toBe(4);
  });

  it("is reset by clear() — it is pose state, not a global preference", () => {
    const s = new PoseUIStore();
    runInAction(() => s.setEdgeWidth(4));
    runInAction(() => s.clear());
    expect(s.edgeWidth).toBe(DEFAULT_POSE_EDGE_WIDTH);
  });
});

describe("PoseUIStore — FOV clamping", () => {
  it("setFov clamps at both ends", () => {
    const s = new PoseUIStore();
    runInAction(() => s.setFov(400));
    expect(s.fov).toBe(POSE_FOV_MAX);
    runInAction(() => s.setFov(0));
    expect(s.fov).toBe(POSE_FOV_MIN);
    runInAction(() => s.setFov(75));
    expect(s.fov).toBe(75);
  });

  it("NaN cannot poison the render — it falls back to the minimum", () => {
    const s = new PoseUIStore();
    runInAction(() => s.setFov(Number.NaN));
    expect(s.fov).toBe(POSE_FOV_MIN);
  });

  it("infinities clamp to the bound they run into — FOV still HAS both", () => {
    const s = new PoseUIStore();
    runInAction(() => s.setFov(Number.POSITIVE_INFINITY));
    expect(s.fov).toBe(POSE_FOV_MAX);
    runInAction(() => s.setFov(Number.NEGATIVE_INFINITY));
    expect(s.fov).toBe(POSE_FOV_MIN);
  });
});

/* ── pan: never clamped ────────────────────────────────────────────────────── */

describe("PoseUIStore — pan is unbounded (E13)", () => {
  it("setPan accepts a pan far outside any plausible canvas", () => {
    const s = new PoseUIStore();
    runInAction(() => s.setPan({ x: 100000, y: -99999 }));
    expect(s.pan).toEqual({ x: 100000, y: -99999 });
  });

  it("nudgePan keeps accumulating past the frame in both directions", () => {
    const s = new PoseUIStore();
    runInAction(() => {
      for (let i = 0; i < 100; i += 1) s.nudgePan(50, -50);
    });
    expect(s.pan).toEqual({ x: 5000, y: -5000 });
    // Dragging back retraces the same path — nothing was discarded on the way.
    runInAction(() => {
      for (let i = 0; i < 100; i += 1) s.nudgePan(-50, 50);
    });
    expect(s.pan).toEqual({ x: 0, y: 0 });
  });
});

/* ── the fit seam ──────────────────────────────────────────────────────────── */

describe("PoseUIStore — fitGeneration / requestFit (E14/E15)", () => {
  it("starts at 0", () => {
    const s = new PoseUIStore();
    expect(s.fitGeneration).toBe(0);
  });

  it("is observable, so a reaction can watch it", () => {
    const s = new PoseUIStore();
    expect(isObservableProp(s, "fitGeneration")).toBe(true);
  });

  it("increments once per request — two presses are two events", () => {
    const s = new PoseUIStore();
    runInAction(() => s.requestFit());
    expect(s.fitGeneration).toBe(1);
    runInAction(() => s.requestFit());
    expect(s.fitGeneration).toBe(2);
    runInAction(() => {
      s.requestFit();
      s.requestFit();
      s.requestFit();
    });
    expect(s.fitGeneration).toBe(5);
  });

  it("mutates NOTHING else — the fit happens at the CURRENT settings", () => {
    const s = new PoseUIStore();
    runInAction(() => {
      s.setMesh("mannequin");
      s.setEdgeWidth(3);
      s.setRotation({ x: 0.3, y: 0.6, z: 0.9 });
      s.setLightDirection({ x: 1, y: 0, z: 0 });
      s.setLightColor(RED);
      s.setModelColor(BLUE);
      s.setProjection("orthographic");
      s.setCameraPreset("iso");
      s.setScale(42);
      s.setFov(88);
      s.setPan({ x: -17, y: 23 });
    });

    const before = { ...s };
    const rotationRef = s.rotation;
    const panRef = s.pan;

    runInAction(() => s.requestFit());

    // Every field except the counter is byte-for-byte what it was, and the ref
    // fields keep their identity too — a re-fit must not look like a new pose.
    //
    // ⚠️ This stays true after plan 08 (F4), where a fit sets the model's
    // SCALE. The STORE still only bumps the counter; the CONTAINER observes it
    // and calls `setScale(1)`, because only the container knows what fitting
    // means (it holds the bounds, the canvas size and the model root). Keeping
    // the reset out of `requestFit()` is what lets this assertion stay exact.
    expect({ ...s }).toEqual({ ...before, fitGeneration: before.fitGeneration + 1 });
    expect(s.rotation).toBe(rotationRef);
    expect(s.pan).toBe(panRef);
    expect(s.scale).toBe(42);
  });

  it("clear() deliberately does NOT reset the counter", () => {
    const s = new PoseUIStore();
    runInAction(() => {
      s.requestFit();
      s.requestFit();
    });
    runInAction(() => s.clear());
    // Monotonic on purpose: rewinding it to 0 is a change like any other, so a
    // reaction watching it would fire a fit at the moment the mesh was
    // unloaded. Everything else resets; this only ever counts up.
    expect(s.fitGeneration).toBe(2);
    expect(s.meshId).toBeNull();
    expect(s.scale).toBe(1);
  });
});

describe("PoseUIStore — the observableRef contract", () => {
  it("setRotation REPLACES the vector rather than mutating it", () => {
    const s = new PoseUIStore();
    runInAction(() => s.setRotation({ x: 1, y: 1, z: 1 }));
    const previous = s.rotation;
    runInAction(() => s.setRotation({ x: 2, y: 1, z: 1 }));
    expect(s.rotation).not.toBe(previous);
    // The old object is untouched — a reader holding it sees the old value.
    expect(previous).toEqual({ x: 1, y: 1, z: 1 });
  });

  it("setRotation copies the caller's object rather than storing it", () => {
    const s = new PoseUIStore();
    const input = { x: 1, y: 2, z: 3 };
    runInAction(() => s.setRotation(input));
    expect(s.rotation).not.toBe(input);
    input.x = 99;
    expect(s.rotation.x).toBe(1);
  });

  it("nudgePan and setPan replace the pan wholesale", () => {
    const s = new PoseUIStore();
    const first = s.pan;
    runInAction(() => s.nudgePan(1, 1));
    expect(s.pan).not.toBe(first);
    const second = s.pan;
    runInAction(() => s.setPan({ x: 0, y: 0 }));
    expect(s.pan).not.toBe(second);
  });
});

describe("PoseUIStore — clear()", () => {
  it("restores every default, including unloading the mesh", () => {
    const s = new PoseUIStore();
    runInAction(() => {
      s.setMesh("cylinder");
      s.setEdgeWidth(2);
      s.setRotation({ x: 1, y: 2, z: 3 });
      s.setLightDirection({ x: 1, y: 0, z: 0 });
      s.setLightColor(RED);
      s.setModelColor(BLUE);
      s.setProjection("orthographic");
      s.setCameraPreset("iso");
      s.setScale(4);
      s.setFov(90);
      s.setPan({ x: 9, y: 9 });
    });

    runInAction(() => s.clear());

    expect(s.meshId).toBeNull();
    expect(s.hasMesh).toBe(false);
    expect(s.edgeWidth).toBe(DEFAULT_POSE_EDGE_WIDTH);
    expect(s.rotation).toEqual(DEFAULT_POSE_ROTATION);
    expect(s.lightDirection).toEqual(DEFAULT_POSE_LIGHT_DIRECTION);
    expect(s.lightColor).toEqual(DEFAULT_POSE_LIGHT_COLOR);
    expect(s.modelColor).toEqual(DEFAULT_POSE_MODEL_COLOR);
    expect(s.projection).toBe("perspective");
    expect(s.cameraPreset).toBe("2.5d");
    expect(s.scale).toBe(1);
    expect(s.fov).toBe(50);
    expect(s.pan).toEqual(DEFAULT_POSE_PAN);
  });

  it("a fresh store and a cleared store agree field for field", () => {
    const fresh = new PoseUIStore();
    const used = new PoseUIStore();
    runInAction(() => {
      used.setMesh("cube");
      used.setScale(7);
      used.clear();
    });
    expect({ ...used }).toEqual({ ...fresh });
  });
});

/* ── ApplicationStore wiring ─────────────────────────────────────────────── */

/* ══════════════════════════════════════════════════════════════════════════
 *  SAVED SCENE PRESETS (plan 08 task 08 — F12/F13/F15)
 *
 *  ⚠️ THE ORDER OF THESE BLOCKS IS THE ORDER OF THEIR IMPORTANCE TO THE
 *  OWNER'S DATA. The serializer's `undefined` return comes first because it
 *  is the single mechanism that keeps 151 real backup snapshots
 *  byte-identical, and everything else here is a feature test.
 * ══════════════════════════════════════════════════════════════════════════ */

describe("PoseUIStore — toPersistedPosePresets is the DIGEST GUARD (F13)", () => {
  it("⭐ returns undefined when NO preset has been saved", () => {
    const pose = new PoseUIStore();
    expect(pose.toPersistedPosePresets()).toBeUndefined();
  });

  it("⭐ still returns undefined after a REJECTED save — an empty name saves nothing", () => {
    const pose = new PoseUIStore();
    runInAction(() => {
      pose.saveCurrentAsPosePreset("");
      pose.saveCurrentAsPosePreset("   ");
      pose.saveCurrentAsPosePreset("\t\n ");
    });
    expect(pose.posePresets).toEqual([]);
    expect(pose.toPersistedPosePresets()).toBeUndefined();
  });

  it("⭐ returns undefined again once the LAST preset is deleted", () => {
    const pose = new PoseUIStore();
    runInAction(() => pose.saveCurrentAsPosePreset("Only one"));
    expect(pose.toPersistedPosePresets()).toBeDefined();
    runInAction(() => pose.deletePosePreset(pose.posePresets[0].id));
    // A project the owner saved a preset in and then removed must go back to
    // having NO key, not to `posePresets: []`.
    expect(pose.toPersistedPosePresets()).toBeUndefined();
  });

  it("returns the array once one exists", () => {
    const pose = new PoseUIStore();
    runInAction(() => pose.saveCurrentAsPosePreset("Hero"));
    const persisted = pose.toPersistedPosePresets();
    expect(persisted).toHaveLength(1);
    expect(persisted?.[0].name).toBe("Hero");
  });
});

describe("PoseUIStore — saveCurrentAsPosePreset", () => {
  it("trims the name", () => {
    const pose = new PoseUIStore();
    runInAction(() => pose.saveCurrentAsPosePreset("  Hero 3/4  "));
    expect(pose.posePresets[0].name).toBe("Hero 3/4");
  });

  it("no-ops on an empty or whitespace-only name — the layoutPresets precedent", () => {
    const pose = new PoseUIStore();
    const before = pose.posePresets;
    runInAction(() => pose.saveCurrentAsPosePreset("   "));
    // Same IDENTITY, not merely the same length: a no-op must not churn the
    // ref, or `persistedUIVersion` would bump and schedule a save for nothing.
    expect(pose.posePresets).toBe(before);
  });

  it("snapshots the whole scene — open question 4's field list", () => {
    const pose = new PoseUIStore();
    runInAction(() => {
      pose.setMesh("torso");
      pose.setRotation({ x: 0.1, y: 0.2, z: 0.3 });
      pose.setProjection("orthographic");
      pose.setCameraPreset("iso");
      pose.setFov(77);
      pose.setScale(3.5);
      pose.setLightDirection({ x: 0, y: 1, z: 0 });
      pose.setLightColor(RED);
      pose.setEdgeWidth(3);
      pose.setPan({ x: 9, y: -9 });
      pose.saveCurrentAsPosePreset("Everything");
    });
    const preset = pose.posePresets[0];
    expect(preset.meshId).toBe("torso");
    expect(preset.rotation).toEqual({ x: 0.1, y: 0.2, z: 0.3 });
    expect(preset.projection).toBe("orthographic");
    expect(preset.cameraPreset).toBe("iso");
    expect(preset.fov).toBe(77);
    expect(preset.scale).toBe(3.5);
    expect(preset.lightDirection).toEqual({ x: 0, y: 1, z: 0 });
    expect(preset.lightColor).toEqual(RED);
    expect(preset.edgeWidth).toBe(3);
    // ⚠️ `pan` is EXCLUDED — open question 4, decided 2026-09-04. It is
    // measured in grid cells of whatever canvas was open, so it does not
    // survive the trip to a different sprite size. See `PersistedPosePreset`.
    expect(preset).not.toHaveProperty("pan");
  });

  it("⭐ snapshots BY VALUE — a later edit cannot reach into the saved preset", () => {
    const pose = new PoseUIStore();
    runInAction(() => {
      pose.setRotation({ x: 1, y: 2, z: 3 });
      pose.saveCurrentAsPosePreset("Frozen");
      pose.setRotation({ x: 9, y: 9, z: 9 });
      pose.setLightColor(BLUE);
      pose.setScale(42);
    });
    const preset = pose.posePresets[0];
    expect(preset.rotation).toEqual({ x: 1, y: 2, z: 3 });
    expect(preset.lightColor).toEqual(DEFAULT_POSE_LIGHT_COLOR);
    expect(preset.scale).toBe(1);
  });

  it("omits meshId entirely when nothing is loaded, rather than writing null", () => {
    const pose = new PoseUIStore();
    runInAction(() => pose.saveCurrentAsPosePreset("Empty stage"));
    expect(pose.posePresets[0]).not.toHaveProperty("meshId");
  });

  it("generates a fresh id per save, and never reuses one after a delete", () => {
    const pose = new PoseUIStore();
    runInAction(() => {
      pose.saveCurrentAsPosePreset("a");
      pose.saveCurrentAsPosePreset("b");
      pose.saveCurrentAsPosePreset("c");
    });
    expect(pose.posePresets.map((p) => p.id)).toEqual([
      "pose-1",
      "pose-2",
      "pose-3",
    ]);
    runInAction(() => {
      // Remove the MIDDLE one, then save: `existing.length + 1` would collide
      // with `pose-3` if it did not walk past taken ids.
      pose.deletePosePreset("pose-2");
      pose.saveCurrentAsPosePreset("d");
    });
    const ids = pose.posePresets.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("pose-3");
  });

  it("replaces the array wholesale — the observableRef contract", () => {
    const pose = new PoseUIStore();
    const before = pose.posePresets;
    runInAction(() => pose.saveCurrentAsPosePreset("x"));
    expect(pose.posePresets).not.toBe(before);
    expect(before).toEqual([]);
  });
});

describe("PoseUIStore — deletePosePreset", () => {
  it("removes the named preset and leaves the others", () => {
    const pose = new PoseUIStore();
    runInAction(() => {
      pose.saveCurrentAsPosePreset("a");
      pose.saveCurrentAsPosePreset("b");
      pose.deletePosePreset("pose-1");
    });
    expect(pose.posePresets.map((p) => p.name)).toEqual(["b"]);
  });

  it("⭐ is a no-op for an unknown id — same identity, so no save is scheduled", () => {
    const pose = new PoseUIStore();
    runInAction(() => pose.saveCurrentAsPosePreset("a"));
    const before = pose.posePresets;
    runInAction(() => pose.deletePosePreset("nope"));
    expect(pose.posePresets).toBe(before);
  });

  it("is a no-op on an empty list", () => {
    const pose = new PoseUIStore();
    const before = pose.posePresets;
    runInAction(() => pose.deletePosePreset("pose-1"));
    expect(pose.posePresets).toBe(before);
  });
});

describe("PoseUIStore — applyPosePreset", () => {
  /** A store with one preset saved off a deliberately distinctive scene. */
  function withPreset(): PoseUIStore {
    const pose = new PoseUIStore();
    runInAction(() => {
      pose.setMesh("head");
      pose.setRotation({ x: 0.5, y: 1.5, z: -0.25 });
      pose.setProjection("orthographic");
      pose.setCameraPreset("top-down");
      pose.setFov(95);
      pose.setScale(6.25);
      pose.setLightDirection({ x: 1, y: 0, z: 0 });
      pose.setLightColor(BLUE);
      pose.setEdgeWidth(4);
      pose.saveCurrentAsPosePreset("Saved");
      // Now move EVERYTHING away, so a restore is unambiguous.
      pose.clear();
    });
    return pose;
  }

  it("⭐ restores every field the preset carries", () => {
    const pose = withPreset();
    runInAction(() => pose.applyPosePreset("pose-1"));
    expect(pose.meshId).toBe("head");
    expect(pose.rotation).toEqual({ x: 0.5, y: 1.5, z: -0.25 });
    expect(pose.projection).toBe("orthographic");
    expect(pose.cameraPreset).toBe("top-down");
    expect(pose.fov).toBe(95);
    expect(pose.scale).toBe(6.25);
    expect(pose.lightDirection).toEqual({ x: 1, y: 0, z: 0 });
    expect(pose.lightColor).toEqual(BLUE);
    expect(pose.edgeWidth).toBe(4);
  });

  it("⭐ is ONE action — no reaction can observe a torn half-restored scene", () => {
    const pose = withPreset();
    const seen: string[] = [];
    const dispose = reaction(
      () => `${pose.meshId}|${pose.projection}|${pose.rotation.y}|${pose.scale}`,
      (value) => seen.push(value),
    );
    try {
      runInAction(() => pose.applyPosePreset("pose-1"));
      // ONE observation, not nine — the same guarantee `applyCameraPreset`
      // gives, and for the same reason: `CanvasContainer`'s fit effect reads
      // several of these together.
      expect(seen).toEqual(["head|orthographic|1.5|6.25"]);
    } finally {
      dispose();
    }
  });

  it("leaves the PAN alone — a preset carries none (open question 4)", () => {
    const pose = withPreset();
    runInAction(() => pose.setPan({ x: 11, y: -4 }));
    runInAction(() => pose.applyPosePreset("pose-1"));
    // ⚠️ And specifically NOT via `setMesh`, which resets the pan (MASTER D7).
    expect(pose.pan).toEqual({ x: 11, y: -4 });
  });

  it("is a no-op for an unknown id", () => {
    const pose = withPreset();
    const before = {
      meshId: pose.meshId,
      rotation: pose.rotation,
      scale: pose.scale,
    };
    runInAction(() => pose.applyPosePreset("nope"));
    expect(pose.meshId).toBe(before.meshId);
    expect(pose.rotation).toBe(before.rotation);
    expect(pose.scale).toBe(before.scale);
  });

  it("COPIES the vectors rather than holding the preset's objects", () => {
    const pose = withPreset();
    runInAction(() => pose.applyPosePreset("pose-1"));
    expect(pose.rotation).not.toBe(pose.posePresets[0].rotation);
    expect(pose.lightColor).not.toBe(pose.posePresets[0].lightColor);
  });

  it("re-NORMALISES the light exactly as setLightDirection would", () => {
    const pose = new PoseUIStore();
    runInAction(() => {
      pose.posePresets = [
        // A hand-edited or drifted file: length 3, not 1.
        { id: "p", name: "drifted", lightDirection: { x: 0, y: 3, z: 0 } },
      ];
      pose.applyPosePreset("p");
    });
    expect(pose.lightDirection).toEqual({ x: 0, y: 1, z: 0 });
  });

  it("⭐ clamps and sanitises through the SETTERS' OWN rules (F15)", () => {
    const pose = new PoseUIStore();
    runInAction(() => {
      pose.posePresets = [
        {
          id: "p",
          name: "illegal",
          // Every one of these is a value the matching setter would reject.
          fov: 1e9,
          scale: -4,
          edgeWidth: 99,
        },
      ];
      pose.applyPosePreset("p");
    });
    expect(pose.fov).toBe(POSE_FOV_MAX);
    expect(pose.scale).toBe(POSE_SCALE_MIN_SAFE);
    expect(pose.edgeWidth).toBe(POSE_EDGE_WIDTH_MAX);
  });

  it("⭐ SKIPS what it cannot understand and leaves that field untouched", () => {
    const pose = new PoseUIStore();
    runInAction(() => {
      pose.setMesh("cube");
      pose.setScale(7);
      pose.posePresets = [
        {
          id: "p",
          name: "from a newer build",
          // A mesh and a camera preset this build has never heard of, and a
          // projection that is not one of the two.
          meshId: "dragon",
          projection: "isometric",
          cameraPreset: "worm's-eye",
          // Structurally wrong values, the kind a truncated file produces.
          rotation: { x: 1, y: 2 } as never,
          lightColor: "red" as never,
        },
      ];
      pose.applyPosePreset("p");
    });
    // Nothing was reset to a default — the current scene simply survived.
    expect(pose.meshId).toBe("cube");
    expect(pose.projection).toBe("perspective");
    expect(pose.cameraPreset).toBe("2.5d");
    expect(pose.scale).toBe(7);
    expect(pose.rotation).toEqual(DEFAULT_POSE_ROTATION);
    expect(pose.lightColor).toEqual(DEFAULT_POSE_LIGHT_COLOR);
  });

  it("⭐ survives NaN, Infinity and null in every numeric slot without throwing", () => {
    const pose = new PoseUIStore();
    runInAction(() => {
      pose.posePresets = [
        {
          id: "p",
          name: "poison",
          rotation: { x: NaN, y: 0, z: 0 },
          lightDirection: { x: Infinity, y: 0, z: 0 },
          lightColor: null as never,
          fov: NaN,
          scale: NaN,
          edgeWidth: -Infinity,
        },
      ];
      expect(() => pose.applyPosePreset("p")).not.toThrow();
    });
    // ⚠️ A `NaN` rotation would poison the render with NaN matrices — a blank
    // frame with no error, the exact failure the validators exist to prevent.
    expect(pose.rotation).toEqual(DEFAULT_POSE_ROTATION);
    expect(pose.lightDirection).toEqual(DEFAULT_POSE_LIGHT_DIRECTION);
    expect(pose.lightColor).toEqual(DEFAULT_POSE_LIGHT_COLOR);
    expect(Number.isFinite(pose.fov)).toBe(true);
    expect(Number.isFinite(pose.scale)).toBe(true);
    expect(Number.isFinite(pose.edgeWidth)).toBe(true);
  });
});

describe("PoseUIStore — hydratePosePresets (the validator, F15)", () => {
  it("⭐ is assigned UNCONDITIONALLY — absent stays absent across a project switch", () => {
    const pose = new PoseUIStore();
    runInAction(() => pose.saveCurrentAsPosePreset("from project A"));
    expect(pose.posePresets).toHaveLength(1);
    // Project B has no `posePresets` key at all.
    runInAction(() => pose.hydratePosePresets({}));
    // ⚠️ NOT project A's preset. Inheriting it would write one project's
    // presets into another's file on the next autosave.
    expect(pose.posePresets).toEqual([]);
    expect(pose.toPersistedPosePresets()).toBeUndefined();
  });

  it("round-trips a saved preset through the wire shape", () => {
    const pose = new PoseUIStore();
    runInAction(() => {
      pose.setMesh("leg");
      pose.setScale(2.5);
      pose.saveCurrentAsPosePreset("Round trip");
    });
    const wire = JSON.parse(
      JSON.stringify({ posePresets: pose.toPersistedPosePresets() }),
    );
    const other = new PoseUIStore();
    runInAction(() => {
      other.hydratePosePresets(wire);
      other.applyPosePreset("pose-1");
    });
    expect(other.posePresets).toEqual(pose.posePresets);
    expect(other.meshId).toBe("leg");
    expect(other.scale).toBe(2.5);
  });

  it("drops entries with no usable id or name — they are unusable in a keyed list", () => {
    const pose = new PoseUIStore();
    runInAction(() =>
      pose.hydratePosePresets({
        posePresets: [
          { id: "ok", name: "keep me" },
          { name: "no id" } as never,
          { id: "no name" } as never,
          { id: 7, name: "numeric id" } as never,
          null as never,
          "a string" as never,
        ],
      }),
    );
    expect(pose.posePresets.map((p) => p.id)).toEqual(["ok"]);
  });

  it("⭐ KEEPS an entry whose other fields are nonsense — applyPosePreset skips them", () => {
    const pose = new PoseUIStore();
    runInAction(() =>
      pose.hydratePosePresets({
        posePresets: [
          { id: "p", name: "half broken", fov: "wide" as never, scale: null as never },
        ],
      }),
    );
    // Losing one setting is better than losing the preset the owner named.
    expect(pose.posePresets).toHaveLength(1);
    expect(pose.posePresets[0].name).toBe("half broken");
  });

  it("⭐ PRESERVES unknown fields — a newer build's preset must survive an older one", () => {
    const pose = new PoseUIStore();
    runInAction(() =>
      pose.hydratePosePresets({
        posePresets: [
          {
            id: "p",
            name: "from 2027",
            scale: 3,
            fromTheFuture: { depthOfField: 2.8 },
          } as never,
        ],
      }),
    );
    // Dropping it would silently downgrade the owner's file the first time an
    // older version opened it.
    expect(
      (pose.posePresets[0] as unknown as Record<string, unknown>)
        .fromTheFuture,
    ).toEqual({ depthOfField: 2.8 });
  });

  it("survives a non-array, null and undefined without throwing", () => {
    const pose = new PoseUIStore();
    for (const bad of [undefined, null, 42, "nope", {}]) {
      runInAction(() =>
        pose.hydratePosePresets({ posePresets: bad as never }),
      );
      expect(pose.posePresets).toEqual([]);
    }
  });
});

describe("PoseUIStore — presets vs clear() and the observableRef contract", () => {
  it("⭐⭐ clear() does NOT drop the presets — the LOAD ORDER depends on it", () => {
    const pose = new PoseUIStore();
    runInAction(() => {
      pose.setMesh("cube");
      pose.saveCurrentAsPosePreset("survives");
      pose.clear();
    });
    // ⚠️ On a real load the sequence is hydrate THEN clear (the
    // `loadGeneration` reaction fires after `adoptProject`), so a `clear()`
    // that reset the presets would wipe the ones the load had just restored
    // — every single time. See the store's header.
    expect(pose.meshId).toBeNull();
    expect(pose.posePresets.map((p) => p.name)).toEqual(["survives"]);
  });

  it("posePresets is observable and NOT deep — no entry is a MobX proxy", () => {
    const pose = new PoseUIStore();
    expect(isObservableProp(pose, "posePresets")).toBe(true);
    runInAction(() => pose.saveCurrentAsPosePreset("a"));
    const rotation = pose.posePresets[0].rotation;
    expect(isObservable(rotation)).toBe(false);
    expect(isObservable(pose.posePresets)).toBe(false);
  });
});

/**
 * The cheapest possible real `ApplicationStore` — same recipe as
 * `ReflectionUIStore.test.ts`: no auto-save, no Zustand, a host that just
 * holds the project in a local.
 */
function makeApp() {
  const project = tinyProject();
  let current = project;
  const host: ProjectHost = {
    getProject: () => current,
    installProject: (p) => {
      current = p;
    },
    replaceProject: (p) => {
      current = p;
    },
    snapshotToHistory: () => {},
  };
  const mirror: DomainMirror = {
    publish: (p) => {
      current = p;
    },
    snapshot: () => {},
  };
  const selectionSink: SelectionSink = { selectObjectTree: () => {} };
  const app = new ApplicationStore({
    autoSaveEnabled: false,
    projectHost: host,
    domainMirror: mirror,
    selectionSink,
  });
  runInAction(() => app.domain.adoptTree(project));
  return app;
}

describe("ApplicationStore — app.pose", () => {
  it("exposes a PoseUIStore that survives an adoptTree (the undo path)", () => {
    const app = makeApp();
    try {
      expect(app.pose).toBeInstanceOf(PoseUIStore);
      runInAction(() => app.pose.setMesh("cube"));
      // `adoptProject`/`adoptTree` also runs on snapshot undo/redo — hooking
      // it would wipe the pose on every undo (locked D6).
      runInAction(() => app.domain.adoptTree(tinyProject()));
      expect(app.pose.meshId).toBe("cube");
    } finally {
      app.dispose();
    }
  });

  it("clears the pose when a fresh project is installed (loadGeneration)", () => {
    const app = makeApp();
    try {
      runInAction(() => {
        app.pose.setMesh("mannequin");
        app.pose.setEdgeWidth(4);
        app.pose.setPan({ x: 3, y: 3 });
        app.pose.setScale(5);
      });
      expect(app.pose.hasMesh).toBe(true);

      runInAction(() => {
        app.domain.loadGeneration += 1;
      });

      expect(app.pose.meshId).toBeNull();
      expect(app.pose.edgeWidth).toBe(DEFAULT_POSE_EDGE_WIDTH);
      expect(app.pose.pan).toEqual({ x: 0, y: 0 });
      expect(app.pose.scale).toBe(1);
    } finally {
      app.dispose();
    }
  });

  it("dispose() stops the reaction — a later load leaves the pose alone", () => {
    const app = makeApp();
    runInAction(() => app.pose.setMesh("sphere"));
    app.dispose();
    runInAction(() => {
      app.domain.loadGeneration += 1;
    });
    expect(app.pose.meshId).toBe("sphere");
  });

  it("is NOT part of the persisted wire format", () => {
    const app = makeApp();
    try {
      runInAction(() => {
        app.pose.setMesh("cube");
        app.pose.setCameraPreset("iso");
      });
      const persisted = app.ui.toPersistedUIState() as unknown as Record<
        string,
        unknown
      >;
      expect(Object.keys(persisted)).not.toContain("pose");
      expect(Object.keys(persisted)).not.toContain("poseMesh");
      expect(JSON.stringify(persisted)).not.toContain("mannequin");
      expect(JSON.stringify(persisted)).not.toContain("cameraPreset");
    } finally {
      app.dispose();
    }
  });
});

/**
 * The presets against a REAL `ApplicationStore` (plan 08 task 08).
 *
 * ⚠️ **These exist because the unit tests above cannot see the ORDER.** On a
 * real project load the sequence is
 * `installTree()` → `host.installProject()` → `adoptProject()` →
 * `ui.hydrate(uiState)` → **then** `DomainStore.loadGeneration += 1` → the
 * reaction → `pose.clear()`. The clear runs AFTER the hydrate, so a `clear()`
 * that reset `posePresets` would wipe the presets the load had just restored,
 * every single time, and present to the owner as *"my presets do not survive
 * a reload"* — the exact thing the feature exists to do. No unit test of
 * `clear()` alone can catch that; only wiring the real reaction can.
 */
describe("ApplicationStore — pose presets and the load order", () => {
  it("⭐⭐ a preset SURVIVES the loadGeneration clear, while the live pose does not", () => {
    const app = makeApp();
    try {
      runInAction(() => {
        app.pose.setMesh("mannequin");
        app.pose.setScale(6);
        app.pose.saveCurrentAsPosePreset("keep me");
      });

      // The reaction the real load fires last.
      runInAction(() => {
        app.domain.loadGeneration += 1;
      });

      expect(app.pose.meshId).toBeNull();
      expect(app.pose.scale).toBe(1);
      // ⚠️ THE ASSERTION THIS WHOLE BLOCK EXISTS FOR.
      expect(app.pose.posePresets.map((p) => p.name)).toEqual(["keep me"]);
    } finally {
      app.dispose();
    }
  });

  it("⭐ hydrate-then-clear, in the real order, keeps the hydrated presets", () => {
    const app = makeApp();
    try {
      // Exactly what `adoptProject` does, then exactly what the reaction does.
      runInAction(() => {
        app.ui.hydrate({
          ...tinyProject().uiState,
          posePresets: [{ id: "pose-1", name: "from the file", scale: 3 }],
        });
        app.domain.loadGeneration += 1;
      });
      expect(app.pose.posePresets.map((p) => p.name)).toEqual([
        "from the file",
      ]);
      runInAction(() => app.pose.applyPosePreset("pose-1"));
      expect(app.pose.scale).toBe(3);
    } finally {
      app.dispose();
    }
  });

  it("⭐ a saved preset REACHES the persisted wire format", () => {
    const app = makeApp();
    try {
      runInAction(() => {
        app.pose.setMesh("torso");
        app.pose.saveCurrentAsPosePreset("Hero");
      });
      const persisted = app.ui.toPersistedUIState();
      expect(persisted.posePresets).toHaveLength(1);
      expect(persisted.posePresets?.[0].name).toBe("Hero");
      expect(persisted.posePresets?.[0].meshId).toBe("torso");
    } finally {
      app.dispose();
    }
  });

  it("⭐ `app.pose` and the store `UIStore` reads are the SAME instance (R6)", () => {
    const app = makeApp();
    try {
      // A second `PoseUIStore` inside `UIStore` would be one nobody writes
      // to, and the presets would silently never reach the file.
      runInAction(() => app.pose.saveCurrentAsPosePreset("one"));
      expect(app.ui.toPersistedUIState().posePresets).toHaveLength(1);
      runInAction(() => app.ui.hydrate({ ...tinyProject().uiState }));
      expect(app.pose.posePresets).toEqual([]);
    } finally {
      app.dispose();
    }
  });
});
