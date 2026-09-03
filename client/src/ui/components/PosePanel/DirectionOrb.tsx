/**
 * DirectionOrb — one draggable sphere, used TWICE (pose-tool 2026-09-02,
 * task 07; MASTER D13).
 *
 * PURE. Like everything under `ui/`, this imports no store, no MobX, no API:
 * a `{x,y,z}` value comes in as a prop and a new one leaves through
 * `onChange`. It holds **no** app state — the only thing it remembers is which
 * pointer is mid-drag and where that drag started, both in refs, so a drag
 * never triggers a re-render of its own.
 *
 * ## Fully controlled, deliberately
 *
 * There is no internal "current direction". The rotation orb must also move
 * when a **viewpoint button** is clicked (Front / Top / ¾ …), and a component
 * with its own source of truth would ignore that. Every frame of a drag emits
 * `onChange` and re-renders from the prop that comes back. If the caller does
 * not feed the value back, the handle does not move — which is the correct
 * behaviour for a controlled input, and is pinned by a test.
 *
 * ## The drag mapping (yaw / pitch)
 *
 * The orb is a flat disc standing in for a sphere. A drag is read as a
 * turntable, not as a direct grab of the surface point:
 *
 *   Δyaw   = +Δx / radius * ORB_DRAG_RANGE      (drag right → turn right)
 *   Δpitch = -Δy / radius * ORB_DRAG_RANGE      (drag UP → pitch UP)
 *
 * `ORB_DRAG_RANGE` is π/2, so a drag of one radius sweeps a quarter turn:
 * crossing the whole orb left-to-right is a half turn, which is a comfortable
 * gain on both a trackpad and a fingertip. Deltas accumulate from the value
 * captured at `pointerdown` (not from the previous sample), so a slow drag and
 * a fast one covering the same distance land in the same place, and rounding
 * cannot accumulate.
 *
 * **Pitch is clamped to ±π/2** — past the pole the yaw would flip and the
 * handle would appear to jump sideways. **Yaw wraps** freely: tumbling a model
 * through more than one revolution is normal.
 *
 * ## Two value meanings, one component
 *
 * The two orbs differ only in what their `{x,y,z}` means, so the caller says
 * which with `mode`:
 *
 *   - `"direction"` — the value is a (roughly) unit vector, as the light's
 *     direction is. Yaw/pitch are read off it with `atan2`/`asin` and written
 *     back as a unit vector.
 *   - `"euler"`     — the value is euler RADIANS, as the model's rotation is.
 *     `y` is the yaw and `x` is the pitch, read and written directly; `z`
 *     (roll) is carried through untouched, because nothing in this orb can
 *     express it and silently zeroing it would discard a viewpoint's roll.
 *
 * Everything else — the drag, the clamp, the handle placement — is identical,
 * which is the point of having one component.
 *
 * ## Touch is first class
 *
 * The owner works on an iPad. This uses **pointer** events with
 * `setPointerCapture`, so a drag that leaves the orb keeps tracking (mouse
 * *and* finger), and the CSS sets **`touch-action: none`** on the orb — without
 * it the browser claims the gesture and scrolls the rail instead of dragging.
 */
import { useRef, useState } from "react";
import type { PoseVector } from "../../canvas/pose/poseTypes";
import "./PosePanel.css";

/** How the `{x,y,z}` value should be read and written. */
export type DirectionOrbMode = "direction" | "euler";

export interface DirectionOrbProps {
  /** A unit-ish direction (`mode="direction"`) or euler radians (`"euler"`). */
  value: PoseVector;
  /** Fires on every pointer sample of a drag, and never while `disabled`. */
  onChange: (value: PoseVector) => void;
  /** Visible caption under the orb, and the basis of its accessible name. */
  label: string;
  /** How to interpret `value`. Defaults to a direction vector. */
  mode?: DirectionOrbMode;
  /** Greys the orb out and suppresses every `onChange`. */
  disabled?: boolean;
}

/* ── geometry ───────────────────────────────────────────────────────────────
 *
 * The SVG uses its own tidy coordinate space and is scaled to whatever width
 * the CSS gives it, so these numbers are a viewBox, not pixels. Drag maths
 * uses the ELEMENT's measured rect, never these — the rail scales.
 */

/** viewBox is `0 0 ORB_VIEWBOX ORB_VIEWBOX`, with the sphere centred in it. */
const ORB_VIEWBOX = 100;
const ORB_CENTER = ORB_VIEWBOX / 2;
/** Leaves room for the handle to sit on the rim without being clipped. */
const ORB_RADIUS = 42;
const HANDLE_RADIUS = 7;

/** A drag of one element-radius sweeps a quarter turn. See the header. */
const ORB_DRAG_RANGE = Math.PI / 2;

/** Past the pole yaw flips and the handle jumps; clamp instead. */
const MAX_PITCH = Math.PI / 2;

/** Yaw and pitch, the orb's own internal language. */
interface Spherical {
  yaw: number;
  pitch: number;
}

/**
 * `value` as yaw/pitch.
 *
 * For a direction, yaw is measured in the XZ plane from +Z (so `{0,0,1}` — the
 * light pointing straight at the viewer — is yaw 0) and pitch is the elevation
 * out of that plane. A zero-length vector has no direction, so it reads as
 * dead ahead rather than as `NaN`.
 */
function vectorToSpherical(
  value: PoseVector,
  mode: DirectionOrbMode,
): Spherical {
  if (mode === "euler") return { yaw: value.y, pitch: value.x };

  const length = Math.hypot(value.x, value.y, value.z);
  if (!Number.isFinite(length) || length === 0) return { yaw: 0, pitch: 0 };

  return {
    yaw: Math.atan2(value.x, value.z),
    // `asin` of a value nudged past ±1 by float error is NaN — clamp first.
    pitch: Math.asin(Math.max(-1, Math.min(1, value.y / length))),
  };
}

/**
 * Yaw/pitch back to a `{x,y,z}`, inverting `vectorToSpherical`.
 *
 * `roll` is the euler `z` the orb cannot express; it is carried through
 * untouched so a viewpoint that set a roll keeps it.
 */
function sphericalToVector(
  { yaw, pitch }: Spherical,
  mode: DirectionOrbMode,
  roll: number,
): PoseVector {
  if (mode === "euler") return { x: pitch, y: yaw, z: roll };

  const cosPitch = Math.cos(pitch);
  return {
    x: cosPitch * Math.sin(yaw),
    y: Math.sin(pitch),
    z: cosPitch * Math.cos(yaw),
  };
}

/**
 * Where the handle sits in viewBox space for a given yaw/pitch.
 *
 * This is the orthographic projection of the point on the sphere: `x` is the
 * horizontal component of the direction, `y` its elevation (negated, because
 * SVG's y axis grows downward). A direction pointing away from the viewer
 * projects to the same disc position as its mirror, so `facing` reports which
 * hemisphere it is in and the handle is drawn hollow when it is behind.
 */
function handlePosition({ yaw, pitch }: Spherical): {
  x: number;
  y: number;
  facing: boolean;
} {
  const cosPitch = Math.cos(pitch);
  return {
    x: ORB_CENTER + Math.sin(yaw) * cosPitch * ORB_RADIUS,
    y: ORB_CENTER - Math.sin(pitch) * ORB_RADIUS,
    facing: Math.cos(yaw) * cosPitch >= 0,
  };
}

/** What a drag needs to remember; refs only, so no sample re-renders. */
interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  /** The value's yaw/pitch at `pointerdown` — deltas accumulate from here. */
  origin: Spherical;
  /** The element radius in CSS pixels, measured once at `pointerdown`. */
  radius: number;
}

export function DirectionOrb({
  value,
  onChange,
  label,
  mode = "direction",
  disabled = false,
}: DirectionOrbProps) {
  const dragRef = useRef<DragState | null>(null);
  /* The ONLY state: whether a drag is in flight, purely so the handle can be
     styled as active. It changes twice per drag (down, up), never per sample. */
  const [dragging, setDragging] = useState(false);

  const spherical = vectorToSpherical(value, mode);
  const handle = handlePosition(spherical);

  const emit = (clientX: number, clientY: number) => {
    const drag = dragRef.current;
    if (!drag || drag.radius <= 0) return;

    const yaw =
      drag.origin.yaw + ((clientX - drag.startX) / drag.radius) * ORB_DRAG_RANGE;
    const pitch = Math.max(
      -MAX_PITCH,
      Math.min(
        MAX_PITCH,
        drag.origin.pitch -
          ((clientY - drag.startY) / drag.radius) * ORB_DRAG_RANGE,
      ),
    );

    onChange(sphericalToVector({ yaw, pitch }, mode, value.z));
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (disabled) return;

    const rect = event.currentTarget.getBoundingClientRect();
    /* Half the SHORTER side: the SVG has a 1:1 viewBox but CSS could give it a
       non-square box, and the gain should not differ per axis. */
    const radius = Math.min(rect.width, rect.height) / 2;
    if (radius <= 0) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: spherical,
      radius,
    };
    setDragging(true);

    /* ⚠️ The capture is what makes a drag survive leaving the orb — and on
       touch, what stops the gesture being stolen mid-flick. jsdom does not
       implement it, so it is guarded rather than assumed. */
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (disabled) return;
    if (dragRef.current?.pointerId !== event.pointerId) return;
    emit(event.clientX, event.clientY);
  };

  const endDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  return (
    <div className="direction-orb">
      <svg
        className={`direction-orb__sphere${
          disabled ? " direction-orb__sphere--disabled" : ""
        }`}
        viewBox={`0 0 ${ORB_VIEWBOX} ${ORB_VIEWBOX}`}
        role="slider"
        aria-label={label}
        aria-disabled={disabled}
        /* A 2-axis control has no single value; the readout is the pair, in
           whole degrees, which is what a screen reader can usefully say. */
        aria-valuetext={`yaw ${Math.round((spherical.yaw * 180) / Math.PI)}°, pitch ${Math.round(
          (spherical.pitch * 180) / Math.PI,
        )}°`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <circle
          className="direction-orb__globe"
          cx={ORB_CENTER}
          cy={ORB_CENTER}
          r={ORB_RADIUS}
        />
        {/* Two great circles read as a sphere rather than as a flat disc, and
            give the handle something to be positioned against. The vertical
            one narrows with yaw so the globe visibly turns. */}
        <ellipse
          className="direction-orb__meridian"
          cx={ORB_CENTER}
          cy={ORB_CENTER}
          rx={Math.abs(Math.cos(spherical.yaw)) * ORB_RADIUS}
          ry={ORB_RADIUS}
        />
        <ellipse
          className="direction-orb__equator"
          cx={ORB_CENTER}
          cy={ORB_CENTER}
          rx={ORB_RADIUS}
          ry={Math.abs(Math.sin(spherical.pitch)) * ORB_RADIUS}
        />
        <circle
          className={`direction-orb__handle${
            handle.facing ? "" : " direction-orb__handle--behind"
          }`}
          cx={handle.x}
          cy={handle.y}
          r={HANDLE_RADIUS}
          data-dragging={dragging ? "true" : undefined}
        />
      </svg>
      <span className="direction-orb__label">{label}</span>
    </div>
  );
}
