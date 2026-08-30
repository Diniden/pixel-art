import { useRef, useEffect, useCallback, type PointerEvent } from "react";
import { Normal } from "../../../types";
import { classNames } from "../../classNames";
import {
  ACCENT_PRIMARY,
  NORMAL_SPHERE_EDGE,
  NORMAL_SPHERE_GRID,
  NORMAL_SPHERE_HI,
  NORMAL_SPHERE_LO,
  NORMAL_SPHERE_MID,
  STATUS_WARN,
  WHITE,
} from "../../theme/canvasTokens";
import "./NormalPicker.css";

/**
 * NormalPicker — PURE (REFRESH task 36, W27).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE NORMAL IS A PROP NOW — THAT IS THE WHOLE POINT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This widget drives EITHER `selectedNormal` (the normal the pencil stamps)
 * OR `lightDirection` (where the preview light comes from). Task 27 gave it
 * two containers and warned that wiring the wrong field — or both containers
 * to the same field — is invisible: the picker still looks and behaves
 * correctly, the two settings simply start tracking each other.
 *
 * Before purification the component chose the field ITSELF, off
 * `isLightDirection`, by indexing into the store. Now the container passes the
 * `normal` and the `onNormalChange` callback directly, so the component
 * cannot reach the wrong field even in principle — the mistake the manual
 * check hunts for is now structurally impossible rather than merely tested.
 *
 * `isLightDirection` REMAINS, but purely as PRESENTATION: it picks the header
 * label ("Light Direction" vs "Normal Direction") and the indicator colour
 * (amber `#f59e0b` vs cyan `#00d9ff`). It no longer selects any state.
 */
interface NormalPickerProps {
  /**
   * Presentation only: header label and indicator colour. Does NOT select
   * which store field is written — see the note above.
   */
  isLightDirection?: boolean;
  /** If true, allows scroll wheel to adjust the normal */
  enableScrollControl?: boolean;
  /** The normal this picker displays and edits. */
  normal: Normal;
  /** Called with the new normal on drag or scroll. */
  onNormalChange: (normal: Normal) => void;
  /**
   * The sphere's diameter in CSS px. Defaults to 140 (the rail). Other Hand
   * Mode passes a larger one so a thumb can be precise with it.
   */
  size?: number;
  /**
   * Compact rendering for the Other Hand stage: no header, no value readout,
   * no hint — just the sphere. The stage supplies its own label.
   */
  compact?: boolean;
}

// Convert normal vector to sphere position (x, y in -1 to 1 range)
function normalToSpherePos(normal: Normal): { x: number; y: number } {
  // Normalize to -1 to 1 range
  const x = normal.x / 127;
  const y = normal.y / 127;
  return { x, y };
}

// Convert sphere position to normal vector
function spherePosToNormal(x: number, y: number): Normal {
  // Clamp to unit circle
  const len = Math.sqrt(x * x + y * y);
  if (len > 1) {
    x = x / len;
    y = y / len;
  }

  // Calculate z from the sphere equation (x^2 + y^2 + z^2 = 1)
  const zSquared = Math.max(0, 1 - x * x - y * y);
  const z = Math.sqrt(zSquared);

  // Convert to byte ranges
  return {
    x: Math.round(x * 127),
    y: Math.round(y * 127),
    z: Math.round(z * 255), // z is 0-255 (unsigned)
  };
}

export function NormalPicker({
  isLightDirection = false,
  enableScrollControl = false,
  normal,
  onNormalChange,
  size = 140,
  compact = false,
}: NormalPickerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Which pointer owns the drag, or null. A ref rather than state: the drag
  // never needs a re-render, and the pointer-capture API keeps the events
  // flowing to the canvas even after the finger leaves it.
  const dragPointerRef = useRef<number | null>(null);

  const setNormal = onNormalChange;

  const sphereSize = size;
  const sphereRadius = sphereSize / 2 - 10;

  // Draw the sphere and normal indicator
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const centerX = sphereSize / 2;
    const centerY = sphereSize / 2;

    ctx.clearRect(0, 0, sphereSize, sphereSize);

    // Draw sphere background with gradient for 3D effect
    const gradient = ctx.createRadialGradient(
      centerX - sphereRadius * 0.3,
      centerY - sphereRadius * 0.3,
      0,
      centerX,
      centerY,
      sphereRadius,
    );
    gradient.addColorStop(0, NORMAL_SPHERE_HI);
    gradient.addColorStop(0.7, NORMAL_SPHERE_MID);
    gradient.addColorStop(1, NORMAL_SPHERE_LO);

    ctx.beginPath();
    ctx.arc(centerX, centerY, sphereRadius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw sphere border
    ctx.strokeStyle = NORMAL_SPHERE_EDGE;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw cross-hairs (equator lines)
    ctx.strokeStyle = NORMAL_SPHERE_GRID;
    ctx.lineWidth = 1;

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(centerX - sphereRadius, centerY);
    ctx.lineTo(centerX + sphereRadius, centerY);
    ctx.stroke();

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - sphereRadius);
    ctx.lineTo(centerX, centerY + sphereRadius);
    ctx.stroke();

    // Draw the normal indicator
    const spherePos = normalToSpherePos(normal);
    const indicatorX = centerX + spherePos.x * sphereRadius;
    const indicatorY = centerY + spherePos.y * sphereRadius;

    // Draw line from center to indicator (representing the normal direction)
    const lineLength = 25;
    const normalizedZ = normal.z / 255;

    ctx.beginPath();
    ctx.moveTo(indicatorX, indicatorY);
    // Line points outward based on z component
    const lineEndX =
      indicatorX + spherePos.x * lineLength * (1 - normalizedZ * 0.5);
    const lineEndY =
      indicatorY + spherePos.y * lineLength * (1 - normalizedZ * 0.5);
    ctx.lineTo(lineEndX, lineEndY);
    ctx.strokeStyle = isLightDirection ? STATUS_WARN : ACCENT_PRIMARY;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw circle at indicator position
    ctx.beginPath();
    ctx.arc(indicatorX, indicatorY, 8, 0, Math.PI * 2);
    ctx.fillStyle = isLightDirection ? STATUS_WARN : ACCENT_PRIMARY;
    ctx.fill();
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw inner dot based on z (how much it points toward camera)
    const innerRadius = 4 * normalizedZ;
    if (innerRadius > 0.5) {
      ctx.beginPath();
      ctx.arc(indicatorX, indicatorY, innerRadius, 0, Math.PI * 2);
      ctx.fillStyle = WHITE;
      ctx.fill();
    }
  }, [normal, isLightDirection, sphereRadius, sphereSize]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Handle mouse / touch / pencil interaction — one pointer-event path.
  //
  // ⚠️ The canvas's LAYOUT size is not its bitmap size: the rail is CSS-scaled
  // (`railLayout`), so `rect.width` is `sphereSize * scale`. The contact point
  // has to be mapped through that scale or the indicator lands progressively
  // further from the finger the further it is from the centre — the "offset
  // from the point of contact" report. Mapping via the rect's actual size
  // puts the indicator exactly under the pointer on every device.
  const handleInteraction = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const scaleX = sphereSize / rect.width;
      const scaleY = sphereSize / rect.height;
      const centerX = sphereSize / 2;
      const centerY = sphereSize / 2;

      // Get position relative to sphere center, normalized to -1 to 1
      const x = ((clientX - rect.left) * scaleX - centerX) / sphereRadius;
      const y = ((clientY - rect.top) * scaleY - centerY) / sphereRadius;

      const newNormal = spherePosToNormal(x, y);
      setNormal(newNormal);
    },
    [sphereRadius, sphereSize, setNormal],
  );

  const handlePointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    // The primary button only: a two-finger tap must not start a drag.
    if (e.button !== 0) return;
    if (dragPointerRef.current !== null) return;
    e.preventDefault();
    dragPointerRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    handleInteraction(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (dragPointerRef.current !== e.pointerId) return;
    handleInteraction(e.clientX, e.clientY);
  };

  const handlePointerEnd = (e: PointerEvent<HTMLCanvasElement>) => {
    if (dragPointerRef.current !== e.pointerId) return;
    dragPointerRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  // Handle scroll wheel for normal adjustment
  useEffect(() => {
    if (!enableScrollControl) return;

    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      // Use deltaX and deltaY to adjust normal
      const sensitivity = 0.01;
      const spherePos = normalToSpherePos(normal);

      const newX = spherePos.x - e.deltaX * sensitivity;
      const newY = spherePos.y - e.deltaY * sensitivity;

      const newNormal = spherePosToNormal(newX, newY);
      setNormal(newNormal);
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [enableScrollControl, normal, setNormal]);

  // Format normal for display
  const formatNormal = (n: Normal) => {
    return `(${n.x}, ${n.y}, ${n.z})`;
  };

  return (
    <div
      className={classNames(
        "normal-picker",
        compact && "normal-picker--compact",
      )}
      ref={containerRef}
    >
      {compact ? null : (
        <div className="normal-picker__header">
          {isLightDirection ? "Light Direction" : "Normal Direction"}
        </div>
      )}
      <div className="normal-picker__canvas-frame">
        <canvas
          ref={canvasRef}
          width={sphereSize}
          height={sphereSize}
          className="normal-picker__canvas"
          role="slider"
          aria-label={isLightDirection ? "Light direction" : "Normal direction"}
          aria-valuetext={formatNormal(normal)}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        />
      </div>
      {compact ? null : (
        <div className="normal-picker__value">{formatNormal(normal)}</div>
      )}
      {!compact && enableScrollControl && (
        <div className="normal-picker__hint">Scroll to adjust</div>
      )}
    </div>
  );
}
