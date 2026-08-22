/**
 * CanvasInfo — the status strip under the canvas.
 *
 * Moved here from `components/Canvas/CanvasInfo.tsx` by REFRESH task 32 and
 * PURIFIED in the same change. Task 23 had already collapsed its two
 * legacy Zustand-hook calls into one and hoisted three computeds into
 * `CanvasInfoContainer`; what remained was a single destructure of `project`,
 * `selection`, `referenceOverlayOffset` and `setCanvasInfoHidden`. Those are
 * now props, so this file imports no store, no MobX and no API — which is the
 * condition of living under `src/ui/` at all (ESLint, task 05).
 *
 * ## It reads scalars, not objects — deliberately
 *
 * The container passes `zoom`, `currentTool`, `borderRadius`, … as primitives
 * rather than handing over `project.uiState`. Reading a primitive in the
 * container's render IS the MobX subscription, so the container re-renders on
 * exactly the fields this strip displays; passing the `uiState` object would
 * subscribe it to all 43.
 *
 * `selectionSummary` is the same idea one level up: `SelectionState` carries a
 * `Set` that holds up to 300,249 entries on the owner's real project. Only
 * three numbers of it are ever displayed, so the container projects it to a
 * flat view-model and the `Set` never crosses this boundary.
 *
 * ## No pixel grid, no domain node
 *
 * `variantName`/`gridWidth`/`gridHeight`/`variantOffset` arrive as values.
 * There is no `PixelObject`, no `Layer` and no grid in this interface, per the
 * observable→props table in the task 32 spec.
 */

import { Icon } from "../../primitives/Icon/Icon";
import {
  ChevronDown,
  ChevronUp,
  Hexagon,
  BoxSelect,
  Target,
  Camera,
} from "lucide-react";
import "./CanvasInfo.css";

/** The three numbers of the selection this strip shows. Never the mask. */
export interface CanvasInfoSelection {
  x: number;
  y: number;
  width: number;
  height: number;
  /** `mask.size` — the count, not the `Set`. */
  pixelCount: number;
}

export interface CanvasInfoProps {
  /* — grid — */
  /** Editable grid size: the variant's while editing a variant. */
  gridWidth: number;
  gridHeight: number;

  /* — variant edit mode — */
  editingVariant: boolean;
  /** Name of the variant being edited; `null` outside variant-edit mode. */
  variantName: string | null;
  /** Its offset in object space. `{0,0}` outside variant-edit mode. */
  variantOffset: { x: number; y: number };

  /* — view / tool — */
  zoom: number;
  currentTool: string;
  borderRadius: number;
  selectionBehavior: string;

  /* — selection — */
  /** `null` when nothing is selected. Flat: no `Set` crosses this boundary. */
  selection: CanvasInfoSelection | null;

  /* — reference image — */
  /** Size of the loaded reference image, or `null` when none is loaded. */
  referenceImageSize: { width: number; height: number } | null;
  /** True when the reference-trace tool is active AND an image is loaded. */
  isReferenceTraceActive: boolean;
  /** Where the reference overlay currently sits, in grid cells. */
  referenceOverlayOffset: { x: number; y: number };

  /* — the collapse toggle — */
  hidden: boolean;
  onToggleHidden: (hidden: boolean) => void;
}

export function CanvasInfo({
  gridWidth,
  gridHeight,
  editingVariant,
  variantName,
  variantOffset,
  zoom,
  currentTool,
  borderRadius,
  selectionBehavior,
  selection,
  referenceImageSize,
  isReferenceTraceActive,
  referenceOverlayOffset,
  hidden,
  onToggleHidden,
}: CanvasInfoProps) {
  return (
    <div className="canvas-info">
      <button
        type="button"
        className="canvas-info__arrow-toggle"
        onClick={() => onToggleHidden(!hidden)}
        title={hidden ? "Show canvas info" : "Hide canvas info"}
        aria-expanded={!hidden}
      >
        <span className="canvas-info__arrow" aria-hidden>
          <Icon icon={hidden ? ChevronDown : ChevronUp} size={10} />
        </span>
      </button>
      <div
        className="canvas-info__panel"
        data-hidden={hidden}
        aria-hidden={hidden}
      >
        <div className="canvas-info__row">
          {editingVariant && variantName !== null ? (
            <>
              <span className="canvas-info__variant">
                <Icon icon={Hexagon} size={10} /> Variant: {variantName}
              </span>
              <span className="canvas-info__separator">|</span>
              <span>
                {gridWidth} × {gridHeight}
              </span>
              <span className="canvas-info__separator">|</span>
              <span>
                Offset: ({variantOffset.x}, {variantOffset.y})
              </span>
              <span className="canvas-info__separator">|</span>
              <span>WASD to adjust offset</span>
            </>
          ) : (
            <>
              <span>
                {gridWidth} × {gridHeight}
              </span>
            </>
          )}
          <span className="canvas-info__separator">|</span>
          <span>Zoom: {Math.round(zoom)}x</span>
          <span className="canvas-info__separator">|</span>
          <span>
            ↑↓←→{" "}
            {!selection
              ? "move pixels"
              : selectionBehavior === "moveSelection"
                ? "move selection"
                : selectionBehavior === "movePixels"
                  ? "move selected pixels"
                  : "no move"}
          </span>
          {currentTool === "move" && (
            <span className="canvas-info__separator">|</span>
          )}
          {currentTool === "move" && <span>Drag to move</span>}
          {currentTool === "selection" && (
            <span className="canvas-info__separator">|</span>
          )}
          {currentTool === "selection" && (
            <span>Drag to select • Esc to clear</span>
          )}
          {selection && <span className="canvas-info__separator">|</span>}
          {selection && (
            <span className="canvas-info__selection">
              <Icon icon={BoxSelect} size={10} /> Selection: {selection.width}×
              {selection.height} at ({selection.x}, {selection.y}) •{" "}
              {selection.pixelCount}
              px
            </span>
          )}
          {currentTool === "rectangle" && (
            <span className="canvas-info__separator">|</span>
          )}
          {currentTool === "rectangle" && (
            <span>Shift+↑↓ radius: {borderRadius}</span>
          )}
          {isReferenceTraceActive && (
            <span className="canvas-info__separator">|</span>
          )}
          {isReferenceTraceActive && (
            <span className="canvas-info__trace">
              <Icon icon={Target} size={10} /> Offset: (
              {referenceOverlayOffset.x}, {referenceOverlayOffset.y})
            </span>
          )}
          {referenceImageSize && !isReferenceTraceActive && (
            <span className="canvas-info__separator">|</span>
          )}
          {referenceImageSize && !isReferenceTraceActive && (
            <span>
              <Icon icon={Camera} size={10} /> Ref: {referenceImageSize.width}×
              {referenceImageSize.height}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
