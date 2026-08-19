/**
 * The origin cross — the marker showing an object's origin point.
 *
 * Extracted from `Canvas.tsx:854-890`.
 *
 * ## Why this file is split in two
 *
 * The cross is drawn with `moveTo`/`lineTo`/`arc`/`stroke`. The test rasteriser
 * (`src/test/canvasStub.ts`) does NOT rasterise paths or arcs — it records them
 * on `ctx.calls` and leaves the pixel buffer untouched, and `hashContext` throws
 * on a blank buffer precisely so a meaningless hash cannot pass silently
 * (MASTER.md §9.10).
 *
 * So the GEOMETRY is computed by `originCrossGeometry`, which is pure data and
 * fully unit-testable, and the STROKING is `drawOriginCross`, which is asserted
 * structurally via `ctx.calls`. This is the "separate the computation from the
 * stroking" shape the task-30 spec asks for.
 *
 * Pure: no store, no MobX, no API.
 */

/** An RGBA colour, 0-255 per channel. */
export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Where the cross's parts land, in canvas pixels. */
export interface OriginCrossGeometry {
  /** Centre of the cross. */
  centerX: number;
  centerY: number;
  /** Horizontal arm endpoints. */
  hx1: number;
  hx2: number;
  /** Vertical arm endpoints. */
  vy1: number;
  vy2: number;
  /** Radius of the centre dot. */
  radius: number;
}

/**
 * Half-length of each arm, in SCREEN pixels. Deliberately not scaled by zoom —
 * the marker stays the same visual size at every zoom level, which is what makes
 * it usable when zoomed far out. Verbatim from the original.
 */
export const ORIGIN_CROSS_SIZE = 12;

/** Radius of the small circle at the cross's centre. */
export const ORIGIN_CROSS_RADIUS = 3;

/**
 * Compute where the origin cross renders.
 *
 * ⚠️ The origin is a HALF-pixel-snapped grid coordinate (see `model/coords.ts`,
 * `"origin"` mode), so `origin.x * zoom` legitimately lands on a half pixel and
 * is NOT rounded here. That half-pixel position is exactly what the manual check
 * "the origin cross renders at the correct half-pixel position" verifies.
 */
export function originCrossGeometry(
  origin: { x: number; y: number },
  zoom: number,
): OriginCrossGeometry {
  const centerX = origin.x * zoom;
  const centerY = origin.y * zoom;

  return {
    centerX,
    centerY,
    hx1: centerX - ORIGIN_CROSS_SIZE,
    hx2: centerX + ORIGIN_CROSS_SIZE,
    vy1: centerY - ORIGIN_CROSS_SIZE,
    vy2: centerY + ORIGIN_CROSS_SIZE,
    radius: ORIGIN_CROSS_RADIUS,
  };
}

/**
 * Stroke the origin cross. Cannot be hash-tested — assert on `ctx.calls`.
 *
 * Wrapped in `save`/`restore` and clears any dash pattern, exactly as the
 * original did: the selection box drawn just before it leaves a dash set, and
 * without the reset the cross would render dashed.
 */
export function drawOriginCross(
  ctx: CanvasRenderingContext2D,
  origin: { x: number; y: number },
  zoom: number,
  color: RgbaColor,
): void {
  const g = originCrossGeometry(origin, zoom);

  ctx.save();
  ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.moveTo(g.hx1, g.centerY);
  ctx.lineTo(g.hx2, g.centerY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(g.centerX, g.vy1);
  ctx.lineTo(g.centerX, g.vy2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(g.centerX, g.centerY, g.radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}
