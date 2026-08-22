/**
 * CanvasInfoContainer — the only `observer()` between the stores and the
 * canvas status strip (REFRESH task 23, rewritten by task 32).
 *
 * Task 23 hoisted three computeds out of `CanvasInfo` and collapsed its two
 * legacy Zustand-hook calls into one. Task 32 finished the job: the component
 * moved to `src/ui/components/CanvasInfo/` and its last store read became
 * props, so this container now supplies every value it displays.
 *
 * ## Every read here is deliberately a SCALAR
 *
 * Reading a primitive inside an `observer()`'s render IS the subscription, so
 * destructuring `zoom`, `currentTool` and `borderRadius` individually
 * subscribes this container to exactly those three fields. Handing over
 * `project.uiState` instead would subscribe it to all 43 and re-render the
 * strip whenever the light direction changed.
 *
 * ## ⚠️ `selection.mask` never crosses the boundary
 *
 * `SelectionState.mask` is a raw `Set` holding up to 300,249 entries on the
 * owner's real project, and `SelectionUIStore` annotates the whole state
 * `observableRef` precisely so MobX never proxies it. Only three numbers and a
 * count are ever displayed, so the state is projected to a flat view-model
 * here. This is the "never pass an observable array / domain node" rule from
 * the task 32 spec's boundary table, applied to the one place it bites.
 *
 * The projection is a `useMemo` keyed on the selection's IDENTITY, not on its
 * contents — the state is replaced wholesale on every change, so reference
 * equality is the correct and cheapest comparator (the grid-comparator rule).
 */
import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { CanvasInfo } from "../ui/components/CanvasInfo/CanvasInfo";
import type { CanvasInfoSelection } from "../ui/components/CanvasInfo/CanvasInfo";
import type { ReferenceImageData } from "../types/referenceImage";
import { useStores } from "../stores/context";

interface CanvasInfoContainerProps {
  referenceImage?: ReferenceImageData | null;
}

export const CanvasInfoContainer = observer(function CanvasInfoContainer({
  referenceImage,
}: CanvasInfoContainerProps) {
  const app = useStores();

  const variantData = app.currentVariant;
  const editingVariant = app.isEditingVariant;
  const obj = app.currentObject;

  // The editable grid — the VARIANT's size while editing one, the object's
  // otherwise. Same resolution `useCanvasGeometry` performs; both derive it
  // from computeds rather than sharing a value, because they need it at
  // different times.
  const objWidth = obj?.gridSize.width ?? 32;
  const objHeight = obj?.gridSize.height ?? 32;
  const gridWidth =
    editingVariant && variantData
      ? variantData.variant.gridSize.width
      : objWidth;
  const gridHeight =
    editingVariant && variantData
      ? variantData.variant.gridSize.height
      : objHeight;

  const selectionState = app.selectionUI.selection;
  const selection: CanvasInfoSelection | null = useMemo(() => {
    if (!selectionState) return null;
    return {
      x: selectionState.bounds.x,
      y: selectionState.bounds.y,
      width: selectionState.bounds.width,
      height: selectionState.bounds.height,
      // The COUNT, never the Set.
      pixelCount: selectionState.mask.size,
    };
  }, [selectionState]);

  const currentTool = app.ui.tool.selectedTool;
  const isReferenceTraceActive =
    currentTool === "reference-trace" && referenceImage != null;

  return (
    <CanvasInfo
      gridWidth={gridWidth}
      gridHeight={gridHeight}
      editingVariant={editingVariant}
      variantName={
        editingVariant && variantData ? variantData.variant.name : null
      }
      variantOffset={
        editingVariant && variantData ? variantData.offset : { x: 0, y: 0 }
      }
      zoom={app.ui.viewport.zoom}
      currentTool={currentTool}
      borderRadius={app.ui.tool.borderRadiusOrZero}
      selectionBehavior={app.ui.tool.selectionBehavior}
      selection={selection}
      referenceImageSize={
        referenceImage
          ? { width: referenceImage.width, height: referenceImage.height }
          : null
      }
      isReferenceTraceActive={isReferenceTraceActive}
      referenceOverlayOffset={app.referenceUI.overlayOffset}
      hidden={app.ui.viewport.canvasInfoHidden ?? false}
      onToggleHidden={(hidden) => app.ui.viewport.setCanvasInfoHidden(hidden)}
    />
  );
});
