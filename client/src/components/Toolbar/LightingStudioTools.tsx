import { useState } from "react";
import { useEditorStore } from "../../store";
import { Tool, Normal } from "../../types";
import { EdgeInterpolateModal } from "../EdgeInterpolateModal/EdgeInterpolateModal";
import { HeightMapModalContainer } from "../../containers/HeightMapModalContainer";
import { computeEdgeInterpolatedNormals } from "../../utils/edgeInterpolate";
import { computeHeightMap, type HeightChannel } from "../../utils/normalCompute";
import { Icon } from "../../ui/primitives/Icon/Icon";
import type { LucideIcon } from "lucide-react";
import { Sun, Wrench, Mountain } from "lucide-react";

const lightingTools: {
  id: Tool;
  icon: LucideIcon;
  label: string;
  hotkey: string;
}[] = [
  { id: "normal-pencil", icon: Sun, label: "Normal Pencil", hotkey: "1" },
  { id: "auto-normal", icon: Wrench, label: "Auto Normal", hotkey: "2" },
  { id: "height-map", icon: Mountain, label: "Height Map", hotkey: "3" },
];

/**
 * ⚠️ Task 27 (§9.5): `rgbToHsl`, `getChannelValue` and the whole height-map
 * normalisation used to live HERE, as 90 lines of pure arithmetic inside a
 * React component. They are now `utils/normalCompute.ts`, unit-tested
 * independently of React and of any store — that extraction is exactly what
 * §9.5 asked for. The behaviour is unchanged; see the module's header.
 */
type ChannelType = HeightChannel;

export function LightingStudioTools() {
  const {
    project,
    setTool,
    getCurrentLayer,
    getCurrentObject,
    getCurrentFrame,
    isEditingVariant,
    getCurrentVariant,
    setNormalPixels,
    computeNormalsForAllFrames,
    setHeightPixels,
    setLightingDataLayerEditMode,
  } = useEditorStore();
  const [showEdgeInterpolateModal, setShowEdgeInterpolateModal] =
    useState(false);
  const [showHeightMapModal, setShowHeightMapModal] = useState(false);

  if (!project) return null;

  const { selectedTool } = project.uiState;
  const editMode = project.uiState.lightingDataLayerEditMode ?? "normals";

  const handleToolClick = (toolId: Tool) => {
    if (toolId === "auto-normal") {
      setShowEdgeInterpolateModal(true);
    } else if (toolId === "height-map") {
      setShowHeightMapModal(true);
    } else {
      setTool(toolId);
    }
  };

  const handleEdgeInterpolateConfirm = (params: {
    startAngle: number;
    smoothing: number;
    radius: number;
    applyToAllFrames: boolean;
  }) => {
    const layer = getCurrentLayer();
    const obj = getCurrentObject();
    const frame = getCurrentFrame();
    const editingVariant = isEditingVariant();
    const variantData = getCurrentVariant();

    if (!layer || !obj || !frame) return;

    // If applying to all frames, use the store function that computes normals per-frame
    if (params.applyToAllFrames) {
      computeNormalsForAllFrames({
        startAngle: params.startAngle,
        smoothing: params.smoothing,
        radius: params.radius,
      });
      return;
    }

    // For single frame, compute and apply normals here
    // Determine grid dimensions and target layer
    let gridWidth: number;
    let gridHeight: number;
    let targetLayer = layer;

    if (editingVariant && variantData) {
      gridWidth = variantData.variant.gridSize.width;
      gridHeight = variantData.variant.gridSize.height;
      targetLayer = variantData.variantFrame.layers[0];
      if (!targetLayer) return;
    } else {
      gridWidth = obj.gridSize.width;
      gridHeight = obj.gridSize.height;
    }

    // Compute normals using the algorithm
    const normals = computeEdgeInterpolatedNormals(
      targetLayer,
      gridWidth,
      gridHeight,
      params.startAngle,
      params.smoothing,
      params.radius,
    );

    // Apply normals using setNormalPixels
    const pixelsToUpdate = normals.map((normal, index) => {
      const y = Math.floor(index / gridWidth);
      const x = index % gridWidth;
      return { x, y, normal: (normal || 0) as Normal | 0 };
    });

    setNormalPixels(pixelsToUpdate);
  };

  const handleHeightMapConfirm = (params: {
    channel: ChannelType;
    min: number;
    max: number;
  }) => {
    const layer = getCurrentLayer();
    const obj = getCurrentObject();
    const frame = getCurrentFrame();
    const editingVariant = isEditingVariant();
    const variantData = getCurrentVariant();

    if (!layer || !obj || !frame) return;

    // Determine grid dimensions and target layer
    let gridWidth: number;
    let gridHeight: number;
    let targetLayer = layer;

    if (editingVariant && variantData) {
      gridWidth = variantData.variant.gridSize.width;
      gridHeight = variantData.variant.gridSize.height;
      targetLayer = variantData.variantFrame.layers[0];
      if (!targetLayer) return;
    } else {
      gridWidth = obj.gridSize.width;
      gridHeight = obj.gridSize.height;
    }

    // ⚠️ Task 27 (§9.5): 60 lines of pure arithmetic used to be inlined
    // here. It is `computeHeightMap` now — same maths, same quirks, unit
    // tested in `utils/__tests__/normalCompute.test.ts`. An empty result
    // means "no coloured pixels", which the store treats as nothing to write.
    const pixelsToUpdate = computeHeightMap(
      targetLayer,
      gridWidth,
      gridHeight,
      params,
    );
    if (pixelsToUpdate.length === 0) return;

    setHeightPixels(pixelsToUpdate);
  };

  return (
    <>
      {/* Lighting data layer edit target */}
      <div className="toolbar__section toolbar__section--studio-mode">
        <div className="toolbar__studio-mode-toggle" title="Lighting edit target">
          <button
            className={`toolbar__studio-mode-btn ${editMode === "normals" ? "toolbar__studio-mode-btn--active" : ""}`}
            onClick={() => setLightingDataLayerEditMode("normals")}
            aria-label="Edit Normals"
            title="Edit Normals"
          >
            <span className="toolbar__tool-icon"><Icon icon={Sun} /></span>
          </button>
          <button
            className={`toolbar__studio-mode-btn ${editMode === "height" ? "toolbar__studio-mode-btn--active" : ""}`}
            onClick={() => setLightingDataLayerEditMode("height")}
            aria-label="Edit Height Map"
            title="Edit Height Map"
          >
            <span className="toolbar__tool-icon"><Icon icon={Mountain} /></span>
          </button>
        </div>
      </div>

      <div className="toolbar__section">
        <div className="toolbar__group">
          {lightingTools.map((tool) => (
            <button
              key={tool.id}
              className={`toolbar__tool-btn ${selectedTool === tool.id ? "toolbar__tool-btn--active" : ""}`}
              onClick={() => handleToolClick(tool.id)}
              title={`${tool.label} (${tool.hotkey})`}
            >
              <span className="toolbar__tool-icon"><Icon icon={tool.icon} /></span>
              <span className="toolbar__tool-hotkey">{tool.hotkey}</span>
            </button>
          ))}
        </div>
      </div>

      <EdgeInterpolateModal
        isOpen={showEdgeInterpolateModal}
        onClose={() => setShowEdgeInterpolateModal(false)}
        onConfirm={handleEdgeInterpolateConfirm}
      />

      <HeightMapModalContainer
        isOpen={showHeightMapModal}
        onClose={() => setShowHeightMapModal(false)}
        onConfirm={handleHeightMapConfirm}
      />
    </>
  );
}
