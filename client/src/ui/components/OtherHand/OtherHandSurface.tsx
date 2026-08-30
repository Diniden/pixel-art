/**
 * OtherHandSurface — one rail section, taken over for the thumb.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THIS IS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * On an iPad the drawing hand holds the Pencil; the other hand holds the
 * device with a thumb resting along the rail. This surface replaces a rail
 * section's ordinary controls with a stage of large thumb-sized widgets
 * (`ThumbSlider`, `ThumbButtons`) that the user drags — by the grip on each
 * card — to wherever that thumb comfortably reaches. Where they end up is the
 * caller's to persist; this component only reports the drop.
 *
 * ── Positions are percentages of the stage ────────────────────────────────
 *
 * The rail can be rescaled, moved to the other side, and the iPad rotated.
 * A widget at "x: 60%, y: 30%" survives all of those in the place the thumb
 * learned; a pixel offset survives none of them. The drag maths converts the
 * pointer's pixel delta into a percentage of the stage on every move.
 *
 * ── The default placement is CSS, and is orientation-aware ────────────────
 *
 * A widget with no stored position is placed by `OtherHand.css`, not by a
 * number computed here: the row is centred in the stage's height in
 * landscape and at the 3/5 mark in portrait (where the holding thumb sits
 * lower), and the widgets are spread evenly between a 50px inset from each
 * side. Those 50px are in the rail's OWN coordinates, so a rail scaled up
 * for readability keeps the inset in proportion. Doing it in CSS means no
 * measurement, no resize listener and no orientation listener — the browser
 * re-solves it on rotation for free. `defaultWidgetSlot` supplies only the
 * row and the fraction the CSS needs.
 *
 * Once a widget has been dragged its stored position wins; "Reset layout"
 * forgets them all and the CSS placement returns.
 *
 * ── Live drag is LOCAL state; only the drop is reported ───────────────────
 *
 * Reporting every pointer move would write the layout — and, through it, the
 * project's autosave — sixty times a second for the length of a drag. The
 * in-flight position lives in this component and the caller hears about it
 * once, on release. That is also why a widget being dragged reads its
 * position from `drag` rather than from `positions`.
 *
 * `ui/` boundary: React, lucide, `classNames`, the Icon primitive, the three
 * sibling widgets and their spec types, its own CSS. No store, no MobX.
 */
import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { GripHorizontal, RotateCcw, X } from "lucide-react";
import { Icon } from "../../primitives/Icon/Icon";
import { classNames } from "../../classNames";
import { ThumbSlider } from "./ThumbSlider";
import { ThumbButtons } from "./ThumbButtons";
import { ThumbNormal } from "./ThumbNormal";
import {
  defaultWidgetSlot,
  type OtherHandSurfacePosition,
} from "./otherHandGeometry";
import type { CSSProperties } from "react";
import type { ThumbWidgetSpec } from "./thumbWidgets";
import "./OtherHand.css";

export type { OtherHandSurfacePosition } from "./otherHandGeometry";

const clamp = (value: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, value));

export interface OtherHandSurfaceProps {
  /** The section name shown in the bar: "Pencil", "Colour", … */
  title: string;
  widgets: ThumbWidgetSpec[];
  /** Stored positions by widget id. Missing ids take the default grid. */
  positions: { [widgetId: string]: OtherHandSurfacePosition };
  /** Reported once per drag, on release. */
  onPositionChange: (
    widgetId: string,
    position: OtherHandSurfacePosition,
  ) => void;
  /** Forget every stored position for this section. */
  onResetPositions: () => void;
  /** Give the rail back to its ordinary controls. */
  onExit: () => void;
  /** Section-specific controls beside the title (the colour model picker). */
  extras?: ReactNode;
  /** Shown on the stage when `widgets` is empty. */
  emptyMessage?: string;
}

interface DragState {
  id: string;
  position: OtherHandSurfacePosition;
}

export function OtherHandSurface({
  title,
  widgets,
  positions,
  onPositionChange,
  onResetPositions,
  onExit,
  extras,
  emptyMessage = "Nothing to arrange for this tool.",
}: OtherHandSurfaceProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  // Everything a move needs, captured on pointer-down so a move is pure
  // arithmetic and never re-measures the DOM mid-drag.
  const dragOrigin = useRef<{
    startX: number;
    startY: number;
    leftPx: number;
    topPx: number;
    stageW: number;
    stageH: number;
    widgetW: number;
    widgetH: number;
  } | null>(null);

  /** Inline placement for a widget that has been dragged (or is being). */
  const placedStyle = (id: string): CSSProperties | null => {
    const position = drag?.id === id ? drag.position : positions[id];
    return position ? { left: `${position.x}%`, top: `${position.y}%` } : null;
  };

  const handleGripDown = (e: PointerEvent<HTMLDivElement>, id: string) => {
    if (e.button !== 0) return;
    const stage = stageRef.current;
    const card = e.currentTarget.parentElement;
    if (!stage || !card) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    const stageRect = stage.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    dragOrigin.current = {
      startX: e.clientX,
      startY: e.clientY,
      leftPx: cardRect.left - stageRect.left,
      topPx: cardRect.top - stageRect.top,
      stageW: stageRect.width,
      stageH: stageRect.height,
      widgetW: cardRect.width,
      widgetH: cardRect.height,
    };
    setDrag({
      id,
      position: {
        x: (dragOrigin.current.leftPx / stageRect.width) * 100,
        y: (dragOrigin.current.topPx / stageRect.height) * 100,
      },
    });
  };

  const handleGripMove = (e: PointerEvent<HTMLDivElement>) => {
    const origin = dragOrigin.current;
    if (!origin || !drag) return;
    if (origin.stageW <= 0 || origin.stageH <= 0) return;
    // The card stays entirely inside the stage — a thumb slider half off the
    // rail is a thumb slider the thumb cannot reach.
    const left = clamp(
      origin.leftPx + (e.clientX - origin.startX),
      0,
      Math.max(0, origin.stageW - origin.widgetW),
    );
    const top = clamp(
      origin.topPx + (e.clientY - origin.startY),
      0,
      Math.max(0, origin.stageH - origin.widgetH),
    );
    setDrag({
      id: drag.id,
      position: {
        x: (left / origin.stageW) * 100,
        y: (top / origin.stageH) * 100,
      },
    });
  };

  const handleGripEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    onPositionChange(drag.id, drag.position);
    dragOrigin.current = null;
    setDrag(null);
  };

  return (
    <section className="other-hand" aria-label={`${title} — Other Hand Mode`}>
      <div className="other-hand__bar">
        <button
          type="button"
          className="other-hand__exit"
          onClick={onExit}
          aria-label="Leave Other Hand Mode"
          title="Leave Other Hand Mode"
        >
          <Icon icon={X} size={16} />
        </button>
        <span className="other-hand__title">{title}</span>
        {extras ? <div className="other-hand__extras">{extras}</div> : null}
        <button
          type="button"
          className="other-hand__reset"
          onClick={onResetPositions}
          aria-label="Reset layout"
          title="Reset layout — put every control back on the grid"
        >
          <Icon icon={RotateCcw} size={14} />
        </button>
      </div>

      <div ref={stageRef} className="other-hand__stage">
        {widgets.length === 0 ? (
          <p className="other-hand__empty">{emptyMessage}</p>
        ) : null}
        {widgets.map((widget, index) => {
          const placed = placedStyle(widget.id);
          const slot = defaultWidgetSlot(index, widgets.length);
          return (
            <div
              key={widget.id}
              className={classNames(
                "other-hand__widget",
                placed === null && "other-hand__widget--auto",
                drag?.id === widget.id && "other-hand__widget--dragging",
              )}
              style={
                placed ??
                ({
                  "--other-hand-fraction": slot.fraction,
                  "--other-hand-row": slot.row,
                } as CSSProperties)
              }
            >
              <div
                className="other-hand__grip"
                role="button"
                aria-label={`Move ${widget.label}`}
                title={`Drag to move ${widget.label}`}
                onPointerDown={(e) => handleGripDown(e, widget.id)}
                onPointerMove={handleGripMove}
                onPointerUp={handleGripEnd}
                onPointerCancel={handleGripEnd}
              >
                <Icon icon={GripHorizontal} size={16} />
              </div>
              {widget.kind === "slider" ? (
                <ThumbSlider
                  label={widget.label}
                  value={widget.value}
                  min={widget.min}
                  max={widget.max}
                  step={widget.step}
                  onChange={widget.onChange}
                  onDragStart={widget.onDragStart}
                  onDragEnd={widget.onDragEnd}
                  trackBackground={widget.trackBackground}
                  format={widget.format}
                />
              ) : widget.kind === "normal" ? (
                <ThumbNormal
                  label={widget.label}
                  normal={widget.normal}
                  onChange={widget.onChange}
                  isLightDirection={widget.isLightDirection}
                />
              ) : (
                <ThumbButtons label={widget.label} buttons={widget.buttons} />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
