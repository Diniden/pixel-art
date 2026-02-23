import { useEditorStore } from "../../store";
import { ReferenceImageData } from "../ReferenceImageModal/ReferenceImageModal";
import "./Canvas.css";

interface CanvasInfoProps {
  referenceImage?: ReferenceImageData | null;
}

export function CanvasInfo({ referenceImage }: CanvasInfoProps) {
  const {
    project,
    selection,
    referenceOverlayOffset,
    getCurrentObject,
    getCurrentVariant,
    isEditingVariant,
  } = useEditorStore();

  const obj = getCurrentObject();
  const variantData = getCurrentVariant();
  const editingVariant = isEditingVariant();

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

  const { setCanvasInfoHidden } = useEditorStore();

  return (
    <div className="canvas-info-wrap">
      <button
        type="button"
        className="canvas-info-arrow-toggle"
        onClick={() => setCanvasInfoHidden(!isCanvasInfoHidden)}
        title={isCanvasInfoHidden ? "Show canvas info" : "Hide canvas info"}
        aria-expanded={!isCanvasInfoHidden}
      >
        <span className="canvas-info-arrow" aria-hidden>
          {isCanvasInfoHidden ? "▼" : "▲"}
        </span>
      </button>
      <div
        className="canvas-info-panel"
        data-hidden={isCanvasInfoHidden}
        aria-hidden={isCanvasInfoHidden}
      >
        <div className="canvas-info">
          {editingVariant && variantData ? (
            <>
              <span className="variant-indicator">
                ⬡ Variant: {variantData.variant.name}
              </span>
              <span className="separator">|</span>
              <span>
                {gridWidth} × {gridHeight}
              </span>
              <span className="separator">|</span>
              <span>
                Offset: ({variantOffset.x}, {variantOffset.y})
              </span>
              <span className="separator">|</span>
              <span>WASD to adjust offset</span>
            </>
          ) : (
            <>
              <span>
                {gridWidth} × {gridHeight}
              </span>
            </>
          )}
          <span className="separator">|</span>
          <span>Zoom: {Math.round(zoom)}x</span>
          <span className="separator">|</span>
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
          {currentTool === "move" && <span className="separator">|</span>}
          {currentTool === "move" && <span>Drag to move</span>}
          {currentTool === "selection" && <span className="separator">|</span>}
          {currentTool === "selection" && (
            <span>Drag to select • Esc to clear</span>
          )}
          {selection && <span className="separator">|</span>}
          {selection && (
            <span className="selection-info">
              ⬚ Selection: {selection.bounds.width}×{selection.bounds.height} at
              ({selection.bounds.x}, {selection.bounds.y}) •{" "}
              {selection.mask.size}
              px
            </span>
          )}
          {currentTool === "rectangle" && <span className="separator">|</span>}
          {currentTool === "rectangle" && (
            <span>Shift+↑↓ radius: {borderRadius}</span>
          )}
          {isReferenceTraceActive && <span className="separator">|</span>}
          {isReferenceTraceActive && (
            <span className="trace-info">
              🎯 Offset: ({referenceOverlayOffset.x}, {referenceOverlayOffset.y}
              )
            </span>
          )}
          {referenceImage && !isReferenceTraceActive && (
            <span className="separator">|</span>
          )}
          {referenceImage && !isReferenceTraceActive && (
            <span>
              📷 Ref: {referenceImage.width}×{referenceImage.height}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
