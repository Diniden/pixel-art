/**
 * RightSidebarTopControlsContainer (REFRESH task 24, split in task 35).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE SPLIT LANDED — THE CONTAINER IS NOW THE ONLY STORE READER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Task 24 gave the 403-line component a container and deliberately stopped
 * short of splitting it ("do not split and purify in the same session").
 * Task 35 performs the split: `ui/components/RightSidebarTopControls/` now
 * holds a composition shell plus `ZoomControls`, `BrushControls`,
 * `ShapeControls` and `SelectionControls`, none of which can reach a store.
 *
 * All 16 members are read here, from five MobX stores:
 *
 *   brushSize / shapeMode /           → `ui.tool`
 *     borderRadius / moveAllLayers /
 *     pencilBrushMax / selectionMode /
 *     selectionBehavior / gaussianFill
 *   traceNudgeAmount / frameTraceActive → `referenceUI`
 *   studioMode                        → `lightingUI`
 *   selection + expand/shrink/clear    → `selectionUI`
 *
 * ── ⚠️ THE SELECTION MASK STOPS HERE ──────────────────────────────────────
 *
 * `SelectionUIStore.selection` is `observableRef` and its `mask` is a plain
 * `Set` that MobX never observes (that store's own header states this in
 * capitals). The old component read `selection.bounds.width`,
 * `.bounds.height` and `.mask.size` directly. This container projects those
 * three numbers into a `SelectionSummary` instead, so the `Set` — which can
 * hold tens of thousands of packed indices on the owner's real project —
 * never becomes a prop. Same rule as "never pass an observable array or a
 * domain node".
 *
 * ── Two reads that are NOT simplifications ────────────────────────────────
 *
 *  - `borderRadius ?? 0`: `ToolUIStore.borderRadius` is `number | undefined`
 *    because only 26 of 151 real snapshots carry the field. The store exposes
 *    `borderRadiusOrZero` for exactly this, and it is used here.
 *  - `gaussianFill` defaults to `{1.0, 2.0, 16}` and `radiusMax` defaults
 *    again to 16 — both fallbacks copied verbatim from the pre-split file,
 *    which applied them in that order.
 *
 * `observer()` lives here and only here (ESLint, task 05).
 */
import { observer } from "mobx-react-lite";
import { RightSidebarTopControls } from "../ui/components/RightSidebarTopControls/RightSidebarTopControls";
import type { SelectionSummary } from "../ui/components/RightSidebarTopControls/SelectionControls";
import { useStores } from "../stores/context";
import { OTHER_HAND_SECTIONS } from "./otherHand/otherHandSections";

export const RightSidebarTopControlsContainer = observer(
  function RightSidebarTopControlsContainer() {
    const { ui, referenceUI, lightingUI, selectionUI } = useStores();
    const { tool } = ui;

    const selection = selectionUI.selection;
    const selectionSummary: SelectionSummary | null = selection
      ? {
          width: selection.bounds.width,
          height: selection.bounds.height,
          pixelCount: selection.mask.size,
        }
      : null;

    const gaussianFill = tool.gaussianFill ?? {
      smoothing: 1.0,
      radius: 2.0,
      radiusMax: 16,
    };

    return (
      <RightSidebarTopControls
        isPixelMode={lightingUI.studioMode !== "lighting"}
        selectedTool={tool.selectedTool}
        frameTraceActive={referenceUI.frameTraceActive}
        brushSize={tool.brushSize}
        onBrushSizeChange={(size) => tool.setBrushSize(size)}
        traceMax={tool.pencilBrushMax ?? 16}
        onTraceMaxChange={(max) =>
          tool.setPencilBrushMax(max as 8 | 16 | 32 | 64 | 128)
        }
        traceNudge={referenceUI.traceNudgeAmount ?? 10}
        onTraceNudgeChange={(nudge) =>
          referenceUI.setTraceNudgeAmount(nudge as 10 | 20 | 25 | 50 | 100)
        }
        gaussianFill={{
          smoothing: gaussianFill.smoothing,
          radius: gaussianFill.radius,
          radiusMax: gaussianFill.radiusMax ?? 16,
        }}
        onGaussianFillChange={(params) => tool.setGaussianFillParams(params)}
        shapeMode={tool.shapeMode}
        onShapeModeChange={(mode) => tool.setShapeMode(mode)}
        borderRadius={tool.borderRadiusOrZero}
        onBorderRadiusChange={(radius) => tool.setBorderRadius(radius)}
        moveAllLayers={tool.moveAllLayers}
        onMoveAllLayersChange={(moveAll) => tool.setMoveAllLayers(moveAll)}
        selectionSummary={selectionSummary}
        selectionMode={tool.selectionMode}
        onSelectionModeChange={(mode) => tool.setSelectionMode(mode)}
        selectionBehavior={tool.selectionBehavior}
        onSelectionBehaviorChange={(behavior) =>
          tool.setSelectionBehavior(behavior)
        }
        onExpandSelection={(by) => selectionUI.expandSelection(by)}
        onShrinkSelection={(by) => selectionUI.shrinkSelection(by)}
        onClearSelection={() => selectionUI.clearSelection()}
        onOtherHand={
          ui.layout.otherHandAvailable
            ? () => ui.layout.enterOtherHand(OTHER_HAND_SECTIONS.tool)
            : undefined
        }
      />
    );
  },
);
