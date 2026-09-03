/**
 * Pose tool — the shared type vocabulary and pure vector maths.
 *
 * Every module under `ui/canvas/pose/` speaks these types, as do the panel
 * (task 07) and the container (task 08). Nothing here touches a store, MobX,
 * React or the DOM: plain data in, plain data out, so it is unit-testable in
 * the node lane where there is no WebGL context (MASTER risk register).
 *
 * ## ⚠️ These unions are structurally identical to `stores/ui/PoseUIStore.ts`
 *
 * `PoseMeshId`, `PoseFraming`, `PoseProjection`, `PoseCameraPreset` and
 * `PoseVector` are declared with the SAME members in the SAME order as the
 * copies in `PoseUIStore.ts`. That duplication is deliberate: the `ui/`
 * boundary forbids importing anything under `stores/` — type-only imports
 * included (MASTER D15, `scripts/check-boundaries.mjs` rule 1) — so the store
 * cannot be the single source of truth for a `ui/` module. Because TypeScript
 * unions and interfaces are structural, values cross the seam in either
 * direction with no cast and no adapter.
 *
 * **If you change a member here, change it in `PoseUIStore.ts` in the same
 * commit, and vice versa.** A silent divergence surfaces as a confusing
 * assignability error at the container, far from either declaration.
 *
 * ## Colour and normal are declared structurally
 *
 * `PoseStampCell.color` / `.normal` are written out as `{r,g,b,a}` / `{x,y,z}`
 * rather than imported from `types/domain.ts`. `ui/` should not take a domain
 * dependency it does not need, and the structural shapes are assignable to and
 * from the domain `Color` / `Normal` without a cast — the same habit the rest
 * of the pure canvas modules follow.
 */

/* ── vocabulary (mirrors PoseUIStore) ─────────────────────────────────────── */

/** The reference solids the rail offers (MASTER D1/D3). */
export type PoseMeshId = "cube" | "sphere" | "cylinder" | "mannequin";

/**
 * Which region of the mannequin the camera frames (MASTER D4). The asset is
 * unrigged, so the "body part" buttons are framing presets over one mesh
 * rather than separate meshes. Primitives only ever use `"full"`.
 */
export type PoseFraming = "full" | "head" | "torso" | "arm" | "leg" | "hand";

/** Camera projection (MASTER D14). */
export type PoseProjection = "perspective" | "orthographic";

/** The named camera angles for common pixel-game perspectives (MASTER D14). */
export type PoseCameraPreset = "2d" | "2.5d" | "iso" | "top-down" | "oblique";

/** A 3-component vector: euler radians for rotation, a direction for light. */
export interface PoseVector {
  x: number;
  y: number;
  z: number;
}

/* ── the stamp payload ────────────────────────────────────────────────────── */

/**
 * An RGBA colour in 0–255 components. Structurally identical to the domain
 * `Color`, declared here so `ui/` need not import `types/domain.ts`.
 */
export interface PoseColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * A surface normal in the project's byte encoding: `x`/`y` signed (-128..127),
 * `z` unsigned (0..255, always toward the viewer). Structurally identical to
 * the domain `Normal`.
 */
export interface PoseNormal {
  x: number;
  y: number;
  z: number;
}

/**
 * One cell of a stamp — what task 08 hands to `PixelStore.setPixelCells()`
 * (MASTER D9). Colour, normal and height travel together so the whole stamp is
 * a single undo entry; writing them through the three existing actions would
 * drop every normal and produce three undo steps.
 */
export interface PoseStampCell {
  x: number;
  y: number;
  color: PoseColor;
  normal: PoseNormal;
  height: number;
}

/* ── pure vector helpers ──────────────────────────────────────────────────── */

/**
 * Unit-length copy of `v`.
 *
 * A zero-length (or non-finite-length) vector has no meaningful direction to
 * pick, and dividing by its length would poison the scene with `NaN` — so the
 * components are returned unchanged instead. This matches `PoseUIStore`'s
 * private `normalizeVector` exactly; both must stay in step.
 */
export function normalizeVector(v: PoseVector): PoseVector {
  const length = Math.hypot(v.x, v.y, v.z);
  if (!Number.isFinite(length) || length === 0) return { x: v.x, y: v.y, z: v.z };
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/** Euclidean length of `v`. */
export function vectorLength(v: PoseVector): number {
  return Math.hypot(v.x, v.y, v.z);
}

/** Dot product of `a` and `b`. */
export function dotVector(a: PoseVector, b: PoseVector): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Component-wise `a - b`. */
export function subtractVector(a: PoseVector, b: PoseVector): PoseVector {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** `v` scaled by `s`. */
export function scaleVector(v: PoseVector, s: number): PoseVector {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}
