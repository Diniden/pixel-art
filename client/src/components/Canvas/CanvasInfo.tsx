import { useEditorStore } from "../../store";
import type { ReferenceImageData } from "../../types/referenceImage";
import type { PixelObject } from "../../types";
import type { CurrentVariant } from "../../stores/ApplicationStore";
import { Icon } from "../../ui/primitives/Icon/Icon";
import { ChevronDown, ChevronUp, Hexagon, BoxSelect, Target, Camera } from "lucide-react";
import "./Canvas.css";

interface CanvasInfoProps {
  referenceImage?: ReferenceImageData | null;
  /** Resolved computeds, from CanvasInfoContainer (REFRESH task 23). */
  object: PixelObject | null;
  variantData: CurrentVariant | null;
  editingVariant: boolean;
}

export function CanvasInfo({
  referenceImage,
  object: obj,
  variantData,
  editingVariant,
}: CanvasInfoProps) {
  // ONE store call, not two: `setCanvasInfoHidden` used to be read from a
  // second `useEditorStore()` mid-body (task 23 collapsed it here).
  const {
    project,
    selection,
    referenceOverlayOffset,
    setCanvasInfoHidden,
  } = useEditorStore();

  // Get grid dimensions - use variant size if editing a variant
  const objWidth = obj?.gridSize.width ?? 32;
  const objHeight = obj?.gridSize.height ?? 32;

  // When editing variant, use variant's grid size for the editable area
  const gridWidth =
    editingVariant && variantData
      ? variantData.variant.gridSize.width
      : objWidth;
  const gridHeight =
    editingVariant && variantData
      ? variantData.variant.gridSize.height
      : objHeight;

  const zoom = project?.uiState.zoom ?? 10;
  const isCanvasInfoHidden = project?.uiState.canvasInfoHidden ?? false;
  const currentTool = project?.uiState.selectedTool ?? "pixel";
  const borderRadius = project?.uiState.borderRadius ?? 0;
  const selectionBehavior = project?.uiState.selectionBehavior ?? "movePixels";
  const isReferenceTraceActive =
    currentTool === "reference-trace" && referenceImage != null;

  // Get variant offset if editing variant
  const variantOffset =
    editingVariant && variantData ? variantData.offset : { x: 0, y: 0 };

  return (
    <div className="canvas-info">
      <button
        type="button"
        className="canvas-info__arrow-toggle"
        onClick={() => setCanvasInfoHidden(!isCanvasInfoHidden)}
        title={isCanvasInfoHidden ? "Show canvas info" : "Hide canvas info"}
        aria-expanded={!isCanvasInfoHidden}
      >
        <span className="canvas-info__arrow" aria-hidden>
          <Icon icon={isCanvasInfoHidden ? ChevronDown : ChevronUp} size={10} />
        </span>
      </button>
      <div
        className="canvas-info__panel"
        data-hidden={isCanvasInfoHidden}
        aria-hidden={isCanvasInfoHidden}
      >
        <div className="canvas-info__row">
          {editingVariant && variantData ? (
            <>
              <span className="canvas-info__variant">
                <Icon icon={Hexagon} size={10} /> Variant: {variantData.variant.name}
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
          {currentTool === "move" && <span className="canvas-info__separator">|</span>}
          {currentTool === "move" && <span>Drag to move</span>}
          {currentTool === "selection" && <span className="canvas-info__separator">|</span>}
          {currentTool === "selection" && (
            <span>Drag to select • Esc to clear</span>
          )}
          {selection && <span className="canvas-info__separator">|</span>}
          {selection && (
            <span className="canvas-info__selection">
              <Icon icon={BoxSelect} size={10} /> Selection: {selection.bounds.width}×{selection.bounds.height} at
              ({selection.bounds.x}, {selection.bounds.y}) •{" "}
              {selection.mask.size}
              px
            </span>
          )}
          {currentTool === "rectangle" && <span className="canvas-info__separator">|</span>}
          {currentTool === "rectangle" && (
            <span>Shift+↑↓ radius: {borderRadius}</span>
          )}
          {isReferenceTraceActive && <span className="canvas-info__separator">|</span>}
          {isReferenceTraceActive && (
            <span className="canvas-info__trace">
              <Icon icon={Target} size={10} /> Offset: ({referenceOverlayOffset.x}, {referenceOverlayOffset.y}
              )
            </span>
          )}
          {referenceImage && !isReferenceTraceActive && (
            <span className="canvas-info__separator">|</span>
          )}
          {referenceImage && !isReferenceTraceActive && (
            <span>
              <Icon icon={Camera} size={10} /> Ref: {referenceImage.width}×{referenceImage.height}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
