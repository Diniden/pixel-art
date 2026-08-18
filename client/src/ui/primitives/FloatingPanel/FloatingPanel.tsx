import { useRef, type ReactNode, type RefObject } from "react";
import { Minus, Plus } from "lucide-react";
import { IconButton } from "../IconButton/IconButton";
import { classNames } from "../../classNames";
import {
  useFloatingPanel,
  type PercentPosition,
} from "../../hooks/useFloatingPanel";
import "./FloatingPanel.css";

/**
 * FloatingPanel — a draggable, minimisable panel floating over a canvas
 * (task 19).
 *
 * BEM block: `floating-panel` (local stylesheet). Replaces the 3 measured
 * clones of drag + minimise + %-position persistence:
 * `LightingCanvas.tsx:713-835`, `FrameReferencePanel.tsx:32-102,272-323`,
 * `ReferenceImagePanel.tsx:32-94,130-191` (~120 duplicated lines) — the drag
 * logic itself lives in `ui/hooks/useFloatingPanel`.
 *
 * ⚠️ Persistence stays with the CALLER: the three legacy panels persist to
 * three DIFFERENT `uiState` keys (`frameReferencePanelPosition`,
 * `referenceImagePanelPosition`, `lightingPreviewPanelPosition`), and this
 * component only reports positions through `onPositionCommit`. Unifying the
 * keys is a bug the spec names explicitly; a pure component cannot commit it.
 *
 * Minimise state is likewise controlled (`minimized` / `onMinimizedChange`)
 * because each legacy panel persists it separately too.
 */

export interface FloatingPanelProps {
  /** Panel title, in the drag-handle header. */
  title: ReactNode;
  children: ReactNode;
  /** The element the panel floats inside (its positioning context). */
  containerRef: RefObject<HTMLElement | null>;
  /** Persisted percent position for this panel's OWN key, if any. */
  position?: PercentPosition | undefined;
  /** Receives the final percent position after each drag. */
  onPositionCommit?: ((position: PercentPosition) => void) | undefined;
  /** Controlled minimise state. */
  minimized?: boolean;
  /** Minimise toggle request. Omit to hide the minimise button. */
  onMinimizedChange?: ((minimized: boolean) => void) | undefined;
  /** Extra header content, before the minimise button. */
  headerActions?: ReactNode;
  /** Pixel position used before any persisted position exists. */
  initialPosition?: { top: number; left: number };
  className?: string;
}

export function FloatingPanel({
  title,
  children,
  containerRef,
  position,
  onPositionCommit,
  minimized = false,
  onMinimizedChange,
  headerActions,
  initialPosition,
  className,
}: FloatingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const {
    position: pixelPosition,
    isDragging,
    onHandleMouseDown,
  } = useFloatingPanel({
    containerRef,
    panelRef,
    position,
    onPositionCommit,
    ...(initialPosition ? { initialPosition } : {}),
    // The legacy guard: pressing the minimise button must not start a drag.
    dragExcludeSelector: ".floating-panel__controls",
  });

  return (
    <div
      ref={panelRef}
      className={classNames(
        "floating-panel",
        minimized && "floating-panel--minimized",
        isDragging && "floating-panel--dragging",
        className,
      )}
      style={{ top: pixelPosition.top, left: pixelPosition.left }}
    >
      <div className="floating-panel__header" onMouseDown={onHandleMouseDown}>
        <span className="floating-panel__title">{title}</span>
        <span className="floating-panel__controls">
          {headerActions}
          {onMinimizedChange && (
            <IconButton
              icon={minimized ? Plus : Minus}
              label={minimized ? "Expand panel" : "Minimize panel"}
              className="floating-panel__minimize"
              onClick={() => onMinimizedChange(!minimized)}
            />
          )}
        </span>
      </div>
      {!minimized && <div className="floating-panel__body">{children}</div>}
    </div>
  );
}

export default FloatingPanel;
