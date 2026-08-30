/**
 * RightSidebarTopControls — composition only (REFRESH task 35).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  403 LINES → FOUR FOCUSED GROUPS + THIS SHELL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The pre-split file was the union of every tool's option surface: 16 store
 * members (13 of them setters), four unrelated control groups, and **zero
 * internal hooks**. The zero-hooks property is why the spec sequenced it
 * first — nothing stateful can break, so any behaviour change after this
 * split is a wiring error rather than a state bug, and it validates the
 * pattern for the three harder splits.
 *
 * All this file decides is *which* group is visible. The `show*` predicates
 * are the pre-split booleans verbatim, including the two subtleties worth
 * naming:
 *
 *  - `showTraceBrush` is true for the `reference-trace` tool **or** whenever
 *    `frameTraceActive` — a trace can be live while another tool is picked.
 *  - Every predicate is gated on `isPixelMode` (`studioMode !== "lighting"`),
 *    so the whole Tool Options panel disappears in the lighting studio.
 *
 * ⚠️ **The Zoom stepper was REMOVED on 2026-08-28** (owner request). It used
 * to render outside the `isPixelMode` guard so it survived into the lighting
 * studio — that is why the note above once said "while Zoom stays". Zoom is
 * now driven by gesture (pinch / ctrl+wheel), and `CanvasViewControls` in the
 * canvas's bottom-left corner is the way back to 100% and centre. Do not
 * reintroduce a stepper here without checking that it does not duplicate
 * those.
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 * Imports: its own four sibling components (and their types) plus this file's
 * stylesheet. No React import, no domain type of its own, no store, no MobX,
 * no API. `RightSidebarTopControlsContainer` supplies every value.
 */
import { BrushControls, type GaussianFillParams } from "./BrushControls";
import { ShapeControls } from "./ShapeControls";
import { SelectionControls, type SelectionSummary } from "./SelectionControls";
import type { ShapeControlsProps } from "./ShapeControls";
import type { SelectionControlsProps } from "./SelectionControls";
import { OtherHandButton } from "../OtherHand/OtherHandButton";
import "./RightSidebarTopControls.css";

export interface RightSidebarTopControlsProps {
  /** `studioMode !== "lighting"` — hides the whole Tool Options panel. */
  isPixelMode: boolean;
  /** `uiState.selectedTool`. */
  selectedTool: string;
  /** `frameTraceActive` — forces the trace group on regardless of the tool. */
  frameTraceActive: boolean;


  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  traceMax: number;
  onTraceMaxChange: (max: number) => void;
  traceNudge: number;
  onTraceNudgeChange: (nudge: number) => void;
  gaussianFill: GaussianFillParams;
  onGaussianFillChange: (params: GaussianFillParams) => void;

  shapeMode: ShapeControlsProps["shapeMode"];
  onShapeModeChange: ShapeControlsProps["onShapeModeChange"];
  borderRadius: number;
  onBorderRadiusChange: (radius: number) => void;
  moveAllLayers: boolean;
  onMoveAllLayersChange: (moveAll: boolean) => void;

  /** Flat projection of the live selection — never the mask itself. */
  selectionSummary: SelectionSummary | null;
  selectionMode: SelectionControlsProps["selectionMode"];
  onSelectionModeChange: SelectionControlsProps["onSelectionModeChange"];
  selectionBehavior: SelectionControlsProps["selectionBehavior"];
  onSelectionBehaviorChange: SelectionControlsProps["onSelectionBehaviorChange"];
  onExpandSelection: (by: number) => void;
  onShrinkSelection: (by: number) => void;
  onClearSelection: () => void;
  /** Hands the rail to these options in Other Hand Mode (tablets only). */
  onOtherHand?: () => void;
}

export function RightSidebarTopControls({
  isPixelMode,
  selectedTool,
  frameTraceActive,
  brushSize,
  onBrushSizeChange,
  traceMax,
  onTraceMaxChange,
  traceNudge,
  onTraceNudgeChange,
  gaussianFill,
  onGaussianFillChange,
  shapeMode,
  onShapeModeChange,
  borderRadius,
  onBorderRadiusChange,
  moveAllLayers,
  onMoveAllLayersChange,
  selectionSummary,
  selectionMode,
  onSelectionModeChange,
  selectionBehavior,
  onSelectionBehaviorChange,
  onExpandSelection,
  onShrinkSelection,
  onClearSelection,
  onOtherHand,
}: RightSidebarTopControlsProps) {
  const showBrushSize = isPixelMode && selectedTool === "fill-square";
  const showTraceBrush =
    isPixelMode && (selectedTool === "reference-trace" || frameTraceActive);
  const showGaussianFill = isPixelMode && selectedTool === "gaussian-fill";
  const showShapeMode =
    isPixelMode && ["rectangle", "ellipse"].includes(selectedTool);
  const showBorderRadius = isPixelMode && selectedTool === "rectangle";
  const showMoveAllLayers = isPixelMode && selectedTool === "move";
  const showSelectionOptions = isPixelMode && selectedTool === "selection";

  const showToolOptions =
    showBrushSize ||
    showTraceBrush ||
    showGaussianFill ||
    showShapeMode ||
    showBorderRadius ||
    showMoveAllLayers ||
    showSelectionOptions;

  return (
    <div className="right-sidebar-top-controls">
      {showToolOptions && (
        <div className="panel right-sidebar-top-controls__panel">
          <div className="panel__header panel__header--compact">
            <span className="panel__title">Tool Options</span>
            {onOtherHand ? (
              <OtherHandButton
                onClick={onOtherHand}
                sectionLabel="Tool Options"
              />
            ) : null}
          </div>
          <div className="panel__body right-sidebar-top-controls__body">
            <BrushControls
              showBrushSize={showBrushSize}
              showTraceBrush={showTraceBrush}
              showGaussianFill={showGaussianFill}
              brushSize={brushSize}
              onBrushSizeChange={onBrushSizeChange}
              traceMax={traceMax}
              onTraceMaxChange={onTraceMaxChange}
              traceNudge={traceNudge}
              onTraceNudgeChange={onTraceNudgeChange}
              gaussianFill={gaussianFill}
              onGaussianFillChange={onGaussianFillChange}
            />

            <ShapeControls
              showShapeMode={showShapeMode}
              showBorderRadius={showBorderRadius}
              showMoveAllLayers={showMoveAllLayers}
              shapeMode={shapeMode}
              onShapeModeChange={onShapeModeChange}
              borderRadius={borderRadius}
              onBorderRadiusChange={onBorderRadiusChange}
              moveAllLayers={moveAllLayers}
              onMoveAllLayersChange={onMoveAllLayersChange}
            />

            {showSelectionOptions && (
              <SelectionControls
                summary={selectionSummary}
                selectionMode={selectionMode}
                onSelectionModeChange={onSelectionModeChange}
                selectionBehavior={selectionBehavior}
                onSelectionBehaviorChange={onSelectionBehaviorChange}
                onExpand={onExpandSelection}
                onShrink={onShrinkSelection}
                onClear={onClearSelection}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
