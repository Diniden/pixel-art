/**
 * ThumbNormal — the direction sphere as an Other Hand widget.
 *
 * The rail's `NormalPicker`, rendered compact (no header or readout — the
 * card carries the label) and larger than the rail's 140px so a thumb can be
 * precise with it. The picker already speaks pointer events with capture, so
 * a Pencil, a finger and a mouse all drive it the same way.
 *
 * `ui/` boundary: React, the sibling picker and spec type.
 */
import { NormalPicker } from "../LightingStudioPanel/NormalPicker";
import type { ThumbNormalSpec } from "./thumbWidgets";

export type ThumbNormalProps = Omit<ThumbNormalSpec, "kind" | "id">;

/** Sphere diameter on the stage — a comfortable thumb sweep. */
const THUMB_SPHERE_SIZE = 160;

export function ThumbNormal({
  label,
  normal,
  onChange,
  isLightDirection = false,
}: ThumbNormalProps) {
  return (
    <div className="thumb-normal">
      <NormalPicker
        compact
        size={THUMB_SPHERE_SIZE}
        isLightDirection={isLightDirection}
        normal={normal}
        onNormalChange={onChange}
      />
      <span className="thumb-normal__label">{label}</span>
    </div>
  );
}
