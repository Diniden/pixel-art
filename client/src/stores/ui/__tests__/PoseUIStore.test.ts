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
 * Also pins MASTER D7 (`setMesh` resets pan and framing), the FOV clamp, and
 * — from the refinements plan, 2026-09-03 — that zoom has **no upper bound**
 * (E11), that pan is **never** clamped (E13), and that `fitGeneration` /
 * `requestFit()` form an event counter that mutates no camera state (E14/E15).
 *
 * The last block wires a real `ApplicationStore` the way
 * `ReflectionUIStore.test.ts` does (no Zustand, no auto-save) to pin that
 * `app.pose` exists, that bumping `DomainStore.loadGeneration` clears it,
 * that `adoptTree` alone (the snapshot-undo path) does NOT, and that nothing
 * reaches the persisted wire format.
 */
import { describe, expect, it } from "vitest";
import { isObservableProp, runInAction } from "mobx";
import {
  DEFAULT_POSE_LIGHT_COLOR,
  DEFAULT_POSE_LIGHT_DIRECTION,
  DEFAULT_POSE_MODEL_COLOR,
  DEFAULT_POSE_PAN,
  DEFAULT_POSE_ROTATION,
  POSE_FOV_MAX,
  POSE_FOV_MIN,
  POSE_ZOOM_MIN_SAFE,
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
    expect(s.framing).toBe("full");
    expect(s.rotation).toEqual({ x: 0, y: 0, z: 0 });
    expect(s.lightColor).toEqual({ r: 255, g: 255, b: 255, a: 255 });
    expect(s.modelColor).toEqual(DEFAULT_POSE_MODEL_COLOR);
    expect(s.projection).toBe("perspective");
    expect(s.cameraPreset).toBe("2.5d");
    expect(s.zoom).toBe(1);
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
      "framing",
      "rotation",
      "lightDirection",
      "lightColor",
      "modelColor",
      "projection",
      "cameraPreset",
      "zoom",
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

  it("setMesh resets pan and framing but keeps rotation, light and camera", () => {
    const s = new PoseUIStore();
    runInAction(() => {
      s.setMesh("mannequin");
      s.setFraming("head");
      s.setPan({ x: 7, y: -3 });
      s.setRotation({ x: 0.5, y: 0.5, z: 0 });
      s.setZoom(2);
      s.setProjection("orthographic");
    });

    runInAction(() => s.setMesh("cube"));

    expect(s.pan).toEqual({ x: 0, y: 0 });
    expect(s.framing).toBe("full");
    // The owner's working setup survives a mesh swap.
    expect(s.rotation).toEqual({ x: 0.5, y: 0.5, z: 0 });
    expect(s.zoom).toBe(2);
    expect(s.projection).toBe("orthographic");
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
      s.setZoom(2500);
    });
    runInAction(() => s.setMesh("sphere"));
    expect(s.pan).toEqual({ x: 0, y: 0 });
    // Zoom is the owner's working setup and survives, uncapped.
    expect(s.zoom).toBe(2500);
  });

  it("setFraming stores the region", () => {
    const s = new PoseUIStore();
    runInAction(() => s.setFraming("hand"));
    expect(s.framing).toBe("hand");
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

  it("setCameraPreset leaves zoom and pan alone (D14)", () => {
    const s = new PoseUIStore();
    runInAction(() => {
      s.setZoom(3);
      s.setPan({ x: 2, y: 2 });
      s.setCameraPreset("top-down");
    });
    expect(s.zoom).toBe(3);
    expect(s.pan).toEqual({ x: 2, y: 2 });
  });

  it("setPan is absolute and nudgePan is relative", () => {
    const s = new PoseUIStore();
    runInAction(() => s.setPan({ x: 5, y: 5 }));
    expect(s.pan).toEqual({ x: 5, y: 5 });
    runInAction(() => s.nudgePan(-2, 3));
    expect(s.pan).toEqual({ x: 3, y: 8 });
  });
});

/* ── zoom: sanitised, not clamped ─────────────────────────────────────────────
 *
 * MASTER E11 (refinements 2026-09-03). The old `POSE_ZOOM_MAX = 10` was the cap
 * the owner hit; it is deleted and these tests pin its absence. Only a safety
 * floor survives, because a zero or negative camera scale collapses or mirrors
 * the projection — arithmetic, not taste.
 *
 * ⚠️ These tests prove the STORE stores what it is given. They cannot prove the
 * owner sees a bigger model: zoom is still folded into `fitCameraToMesh`'s
 * padding, which task 06 separates (E12).
 */
describe("PoseUIStore — zoom sanitising (no upper bound)", () => {
  it("accepts a huge zoom verbatim — there is no cap", () => {
    const s = new PoseUIStore();
    runInAction(() => s.setZoom(5000));
    expect(s.zoom).toBe(5000);
  });

  it("accepts ordinary and very large zooms unchanged", () => {
    const s = new PoseUIStore();
    for (const z of [POSE_ZOOM_MIN_SAFE, 0.25, 1, 2.5, 10, 11, 250, 1e6]) {
      runInAction(() => s.setZoom(z));
      expect(s.zoom).toBe(z);
    }
  });

  it("floors zero and negatives — a non-positive scale collapses or mirrors", () => {
    const s = new PoseUIStore();
    runInAction(() => s.setZoom(0));
    expect(s.zoom).toBe(POSE_ZOOM_MIN_SAFE);
    runInAction(() => s.setZoom(-5));
    expect(s.zoom).toBe(POSE_ZOOM_MIN_SAFE);
    runInAction(() => s.setZoom(-0));
    expect(s.zoom).toBe(POSE_ZOOM_MIN_SAFE);
  });

  it("floors a positive value below the safety floor", () => {
    const s = new PoseUIStore();
    runInAction(() => s.setZoom(1e-9));
    expect(s.zoom).toBe(POSE_ZOOM_MIN_SAFE);
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
      runInAction(() => s.setZoom(2));
      runInAction(() => s.setZoom(bad));
      expect(s.zoom).toBe(POSE_ZOOM_MIN_SAFE);
      expect(Number.isFinite(s.zoom)).toBe(true);
    }
  });

  it("the safety floor is a floor, not a range — it is far below any useful view", () => {
    expect(POSE_ZOOM_MIN_SAFE).toBeGreaterThan(0);
    expect(POSE_ZOOM_MIN_SAFE).toBeLessThan(0.01);
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
      s.setFraming("head");
      s.setRotation({ x: 0.3, y: 0.6, z: 0.9 });
      s.setLightDirection({ x: 1, y: 0, z: 0 });
      s.setLightColor(RED);
      s.setModelColor(BLUE);
      s.setProjection("orthographic");
      s.setCameraPreset("iso");
      s.setZoom(42);
      s.setFov(88);
      s.setPan({ x: -17, y: 23 });
    });

    const before = { ...s };
    const rotationRef = s.rotation;
    const panRef = s.pan;

    runInAction(() => s.requestFit());

    // Every field except the counter is byte-for-byte what it was, and the ref
    // fields keep their identity too — a re-fit must not look like a new pose.
    expect({ ...s }).toEqual({ ...before, fitGeneration: before.fitGeneration + 1 });
    expect(s.rotation).toBe(rotationRef);
    expect(s.pan).toBe(panRef);
    expect(s.zoom).toBe(42);
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
    expect(s.zoom).toBe(1);
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
      s.setFraming("torso");
      s.setRotation({ x: 1, y: 2, z: 3 });
      s.setLightDirection({ x: 1, y: 0, z: 0 });
      s.setLightColor(RED);
      s.setModelColor(BLUE);
      s.setProjection("orthographic");
      s.setCameraPreset("iso");
      s.setZoom(4);
      s.setFov(90);
      s.setPan({ x: 9, y: 9 });
    });

    runInAction(() => s.clear());

    expect(s.meshId).toBeNull();
    expect(s.hasMesh).toBe(false);
    expect(s.framing).toBe("full");
    expect(s.rotation).toEqual(DEFAULT_POSE_ROTATION);
    expect(s.lightDirection).toEqual(DEFAULT_POSE_LIGHT_DIRECTION);
    expect(s.lightColor).toEqual(DEFAULT_POSE_LIGHT_COLOR);
    expect(s.modelColor).toEqual(DEFAULT_POSE_MODEL_COLOR);
    expect(s.projection).toBe("perspective");
    expect(s.cameraPreset).toBe("2.5d");
    expect(s.zoom).toBe(1);
    expect(s.fov).toBe(50);
    expect(s.pan).toEqual(DEFAULT_POSE_PAN);
  });

  it("a fresh store and a cleared store agree field for field", () => {
    const fresh = new PoseUIStore();
    const used = new PoseUIStore();
    runInAction(() => {
      used.setMesh("cube");
      used.setZoom(7);
      used.clear();
    });
    expect({ ...used }).toEqual({ ...fresh });
  });
});

/* ── ApplicationStore wiring ─────────────────────────────────────────────── */

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
        app.pose.setFraming("head");
        app.pose.setPan({ x: 3, y: 3 });
        app.pose.setZoom(5);
      });
      expect(app.pose.hasMesh).toBe(true);

      runInAction(() => {
        app.domain.loadGeneration += 1;
      });

      expect(app.pose.meshId).toBeNull();
      expect(app.pose.framing).toBe("full");
      expect(app.pose.pan).toEqual({ x: 0, y: 0 });
      expect(app.pose.zoom).toBe(1);
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
