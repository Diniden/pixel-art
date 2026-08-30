/**
 * RailDismissButton — the rail's inner border, as a drawer handle.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE BORDER IS THE BUTTON (owner, 2026-08-30)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This began as a × in the rail's top-right corner and became this: a thin
 * strip running the full length of the rail's canvas-facing edge, which
 * collapses the rail when clicked. The corner button had to float over
 * whatever the first panel already drew up there — `ObjectLibrary` and
 * `TimelineView` both have controls in that spot — so it was always going to
 * be either in something's way or hard to find.
 *
 * The edge has neither problem. Nothing else lives there, it is the longest
 * hit target the rail can offer, and it is exactly where a drawer handle
 * belongs: on the seam the drawer closes along.
 *
 * ── ⚠️ IT REPLACES THE RAIL'S BORDER RATHER THAN SITTING BESIDE IT ────────
 *
 * `AppShell.css` draws a 1px border on the rail's inner edge. This strip sits
 * ON that line and is 2px thicker, and the shell suppresses its own border
 * wherever a handle is rendered — otherwise the two would stack into a
 * double rule. The strip carries the border colour at rest, so a rail with a
 * handle looks like a rail with a slightly heavier border until it is
 * hovered, at which point it lights up to say it does something.
 *
 * ── Which edge, and why the prop is the SIDE not the rail ─────────────────
 *
 * The handle goes on the edge facing the canvas: a left-placed rail collapses
 * rightward, so its handle is on its right. `edge` is therefore a placement,
 * and the caller must pass the rail's CURRENT side rather than its name —
 * the rail called `left` may well be sitting on the right (`railLayout.ts`
 * opens on that distinction).
 *
 * `ui/` boundary: React, lucide icons, `classNames`, own CSS. No store.
 */
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { Icon } from "../../primitives/Icon/Icon";
import { classNames } from "../../classNames";
import "./RailDismissButton.css";

/** Which edge of the workspace the handle's rail is against. */
export type RailHandleEdge = "left" | "right" | "bottom" | "top";

/**
 * The chevron each edge shows — it points the way the rail will go.
 *
 * ⚠️ Toward the rail's own edge, not toward the canvas. A rail on the left
 * collapses leftward, so its handle points left: the arrow shows where the
 * panel is about to disappear to, which is the thing worth predicting.
 */
const EDGE_CHEVRON = {
  left: ChevronLeft,
  right: ChevronRight,
  bottom: ChevronDown,
  top: ChevronUp,
} as const;

export interface RailDismissButtonProps {
  /** What the rail is called, for the label — "Hide Objects & Layers". */
  label: string;
  /**
   * Which edge of the workspace the rail is against. Decides which side of
   * the rail the strip runs along, and which way its chevron points.
   *
   * ⚠️ A PLACEMENT, not a rail name. Pass the side the rail is currently on.
   */
  edge: RailHandleEdge;
  onDismiss: () => void;
}

export function RailDismissButton({
  label,
  edge,
  onDismiss,
}: RailDismissButtonProps) {
  return (
    <button
      type="button"
      className={classNames("rail-handle", `rail-handle--${edge}`)}
      onClick={onDismiss}
      aria-label={`Hide ${label}`}
      title={`Hide ${label}`}
    >
      {/* The chevron only appears on hover — see the CSS. At rest the strip
          reads as the rail's border, which is the point: it adds no visual
          furniture until the pointer says the user is looking for it. */}
      <span className="rail-handle__grip">
        <Icon icon={EDGE_CHEVRON[edge]} size={12} />
      </span>
    </button>
  );
}
