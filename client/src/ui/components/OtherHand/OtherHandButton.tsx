/**
 * OtherHandButton — the hand icon in a section's title bar that hands the
 * rail to that section.
 *
 * Sections render it only when given an `onClick`, and the containers supply
 * one only on a tablet — so a desktop never sees the button, and the
 * component needs no idea what a device class is.
 *
 * `ui/` boundary: React, lucide, the Icon primitive, its own CSS.
 */
import { Hand } from "lucide-react";
import { Icon } from "../../primitives/Icon/Icon";
import "./OtherHand.css";

export interface OtherHandButtonProps {
  onClick: () => void;
  /** What the rail will show, for the tooltip: "Pencil", "Colour", … */
  sectionLabel: string;
}

export function OtherHandButton({
  onClick,
  sectionLabel,
}: OtherHandButtonProps) {
  const title = `Other Hand Mode — ${sectionLabel}`;
  return (
    <button
      type="button"
      className="other-hand-button"
      onClick={onClick}
      aria-label={title}
      title={title}
    >
      <Icon icon={Hand} size={14} />
    </button>
  );
}
