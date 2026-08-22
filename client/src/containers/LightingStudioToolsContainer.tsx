/**
 * LightingStudioToolsContainer (REFRESH task 27; PURIFIED task 36, W27).
 *
 * Task 27 created this as a thin `observer()` seam and noted it was "CREATED
 * BUT NOT YET WIRED", because its render site (`Toolbar`) was outside that
 * task's `Touches`. Task 36 owns `Toolbar`, so the container is now both
 * purified and actually wired: `ToolbarContainer` injects it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THE TWO CONFIRM HANDLERS ARE PIXEL WORK — THAT IS WHY THEY ARE HERE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Both resolve the current layer/object/frame/variant, compute a full grid of
 * values, and write it back. R2 bars that from `ui/`; W26 set the precedent
 * of moving it into the container tier.
 *
 * Every branch is transcribed verbatim:
 *
 *  - **`applyToAllFrames` short-circuits.** It delegates to
 *    `computeNormalsForAllFrames` (a `flow` since task 27) and RETURNS —
 *    it does not also run the single-frame path. Running both would apply the
 *    current frame's normals twice.
 *  - **The variant branch retargets BOTH the grid size and the layer.** When
 *    editing a variant it uses the VARIANT's `gridSize` and
 *    `variantFrame.layers[0]`, not the object's. Using the object's grid
 *    against a variant layer writes normals at the wrong coordinates.
 *  - **`targetLayer` may be missing** on a variant frame with no layers; the
 *    early return is preserved.
 *  - **An empty `computeHeightMap` result means "no coloured pixels"** and is
 *    dropped before reaching the store, which treats it as nothing to write.
 */
import { observer } from "mobx-react-lite";
import { LightingStudioTools } from "../ui/components/Toolbar/LightingStudioTools";
import type {
  EdgeInterpolateParams,
  HeightMapParams,
} from "../ui/components/Toolbar/LightingStudioTools";
import { HeightMapModalContainer } from "./HeightMapModalContainer";
import { computeEdgeInterpolatedNormals } from "../utils/edgeInterpolate";
import { computeHeightMap } from "../utils/normalCompute";
import { useStores } from "../stores/context";
import type { Layer, Normal } from "../types";

export const LightingStudioToolsContainer = observer(
  function LightingStudioToolsContainer() {
    const app = useStores();
    const { domain, ui, lightingUI, pixels } = app;

    // Transcribed from the component's pre-purification `if (!project) return null`.
    if (!domain.hasProject) return null;

    /**
     * Resolves the grid the compute should run against. Shared by both
     * handlers — they had byte-identical copies of this block.
     */
    const resolveTarget = (): {
      layer: Layer;
      gridWidth: number;
      gridHeight: number;
    } | null => {
      const layer = app.currentLayer;
      const obj = app.currentObject;
      const frame = app.currentFrame;
      if (!layer || !obj || !frame) return null;

      if (app.isEditingVariant) {
        const variantData = app.currentVariant;
        if (!variantData) {
          return {
            layer,
            gridWidth: obj.gridSize.width,
            gridHeight: obj.gridSize.height,
          };
        }
        // ⚠️ Variant grid AND variant layer — see the note above.
        const targetLayer = variantData.variantFrame.layers[0];
        if (!targetLayer) return null;
        return {
          layer: targetLayer,
          gridWidth: variantData.variant.gridSize.width,
          gridHeight: variantData.variant.gridSize.height,
        };
      }

      return {
        layer,
        gridWidth: obj.gridSize.width,
        gridHeight: obj.gridSize.height,
      };
    };

    const handleEdgeInterpolateConfirm = (params: EdgeInterpolateParams) => {
      // ⚠️ Short-circuits — must NOT fall through to the single-frame path.
      if (params.applyToAllFrames) {
        pixels.computeNormalsForAllFrames({
          startAngle: params.startAngle,
          smoothing: params.smoothing,
          radius: params.radius,
        });
        return;
      }

      const target = resolveTarget();
      if (!target) return;
      const { layer, gridWidth, gridHeight } = target;

      const normals = computeEdgeInterpolatedNormals(
        layer,
        gridWidth,
        gridHeight,
        params.startAngle,
        params.smoothing,
        params.radius,
      );

      const pixelsToUpdate = normals.map((normal, index) => {
        const y = Math.floor(index / gridWidth);
        const x = index % gridWidth;
        return { x, y, normal: (normal || 0) as Normal | 0 };
      });

      pixels.setNormalPixels(pixelsToUpdate);
    };

    const handleHeightMapConfirm = (params: HeightMapParams) => {
      const target = resolveTarget();
      if (!target) return;
      const { layer, gridWidth, gridHeight } = target;

      // Task 27 (§9.5): the 60 lines of arithmetic this used to inline are
      // `computeHeightMap` now — same maths, same quirks, unit tested.
      const pixelsToUpdate = computeHeightMap(
        layer,
        gridWidth,
        gridHeight,
        params,
      );
      // An empty result means "no coloured pixels" — nothing to write.
      if (pixelsToUpdate.length === 0) return;

      pixels.setHeightPixels(pixelsToUpdate);
    };

    return (
      <LightingStudioTools
        selectedTool={ui.tool.selectedTool}
        editMode={lightingUI.lightingDataLayerEditMode ?? "normals"}
        onSelectTool={(tool) => ui.tool.setTool(tool)}
        onEditModeChange={(mode) =>
          lightingUI.setLightingDataLayerEditMode(mode)
        }
        onEdgeInterpolateConfirm={handleEdgeInterpolateConfirm}
        onHeightMapConfirm={handleHeightMapConfirm}
        heightMapModal={(props) => <HeightMapModalContainer {...props} />}
      />
    );
  },
);
