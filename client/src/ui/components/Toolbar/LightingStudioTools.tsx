/**
 * LightingStudioTools — PURE (REFRESH task 36, W27).
 *
 * ⚠️ BOTH confirm handlers moved to the CONTAINER, not just the store reads.
 * `handleEdgeInterpolateConfirm` and `handleHeightMapConfirm` resolved the
 * current layer/object/frame/variant, computed a full grid of normals or
 * height values, and wrote them back. That is pixel work, which R2 bars from
 * `ui/` (W26's precedent). The component now just says "the user confirmed
 * with these params".
 *
 * ⚠️ `HeightMapModalContainer` is injected as a RENDER PROP — it is a
 * container, and the modal's open state is owned here, so the element cannot
 * be built up-front. `EdgeInterpolateModal` is a plain `ui/` component and is
 * imported normally.
 */
import { useState, type ReactNode } from "react";
import { Tool } from "../../../types";
import { EdgeInterpolateModal } from "../EdgeInterpolateModal/EdgeInterpolateModal";
import { Icon } from "../../primitives/Icon/Icon";
import { Tooltip } from "../../primitives/Tooltip/Tooltip";
import type { LucideIcon } from "lucide-react";
import { Sun, Wrench, Mountain } from "lucide-react";
// Type-only: the COMPUTE moved to the container (R2 — it walks pixels), but
// the channel union is part of this component's public prop surface.
import type { HeightChannel } from "../../../utils/normalCompute";

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

/** Params the edge-interpolate modal returns on confirm. */
export interface EdgeInterpolateParams {
  startAngle: number;
  smoothing: number;
  radius: number;
  applyToAllFrames: boolean;
}

/** Params the height-map modal returns on confirm. */
export interface HeightMapParams {
  channel: ChannelType;
  min: number;
  max: number;
  /** Apply to every frame of the layer (or variant), not just the current one. */
  applyToAllFrames: boolean;
}

interface LightingStudioToolsProps {
  /** `uiState.selectedTool` */
  selectedTool: Tool;
  /** `uiState.lightingDataLayerEditMode`, already defaulted. */
  editMode: "normals" | "height";
  onSelectTool: (tool: Tool) => void;
  onEditModeChange: (mode: "normals" | "height") => void;
  /** Computes and applies normals. Pixel work — lives in the container. */
  onEdgeInterpolateConfirm: (params: EdgeInterpolateParams) => void;
  /** Computes and applies a height map. Pixel work — lives in the container. */
  onHeightMapConfirm: (params: HeightMapParams) => void;
  /** `HeightMapModalContainer` with the supplied wiring. */
  heightMapModal: (props: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (params: HeightMapParams) => void;
  }) => ReactNode;
}

export function LightingStudioTools({
  selectedTool,
  editMode,
  onSelectTool,
  onEditModeChange,
  onEdgeInterpolateConfirm,
  onHeightMapConfirm,
  heightMapModal,
}: LightingStudioToolsProps) {
  const [showEdgeInterpolateModal, setShowEdgeInterpolateModal] =
    useState(false);
  const [showHeightMapModal, setShowHeightMapModal] = useState(false);

  const handleToolClick = (toolId: Tool) => {
    if (toolId === "auto-normal") {
      setShowEdgeInterpolateModal(true);
    } else if (toolId === "height-map") {
      setShowHeightMapModal(true);
    } else {
      onSelectTool(toolId);
    }
  };

  return (
    <>
      {/* Lighting data layer edit target.

          ⚠️ The GROUP's `title="Lighting edit target"` is gone rather than
          converted. A tooltip on the wrapper would fire from the same
          long-press as the button inside it and stack two bubbles for one
          gesture; each button already names itself, which is the information
          that group label was carrying. */}
      <div className="toolbar__section toolbar__section--studio-mode">
        <div className="toolbar__studio-mode-toggle">
          <Tooltip content="Edit Normals">
            <button
              className={`toolbar__studio-mode-btn ${editMode === "normals" ? "toolbar__studio-mode-btn--active" : ""}`}
              onClick={() => onEditModeChange("normals")}
              aria-label="Edit Normals"
            >
              <span className="toolbar__tool-icon">
                <Icon icon={Sun} />
              </span>
            </button>
          </Tooltip>
          <Tooltip content="Edit Height Map">
            <button
              className={`toolbar__studio-mode-btn ${editMode === "height" ? "toolbar__studio-mode-btn--active" : ""}`}
              onClick={() => onEditModeChange("height")}
              aria-label="Edit Height Map"
            >
              <span className="toolbar__tool-icon">
                <Icon icon={Mountain} />
              </span>
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="toolbar__section">
        <div className="toolbar__group">
          {lightingTools.map((tool) => (
            <Tooltip key={tool.id} content={`${tool.label} (${tool.hotkey})`}>
              <button
                className={`toolbar__tool-btn ${selectedTool === tool.id ? "toolbar__tool-btn--active" : ""}`}
                onClick={() => handleToolClick(tool.id)}
                aria-label={`${tool.label} (${tool.hotkey})`}
              >
                <span className="toolbar__tool-icon">
                  <Icon icon={tool.icon} />
                </span>
                <span className="toolbar__tool-hotkey">{tool.hotkey}</span>
              </button>
            </Tooltip>
          ))}
        </div>
      </div>

      <EdgeInterpolateModal
        isOpen={showEdgeInterpolateModal}
        onClose={() => setShowEdgeInterpolateModal(false)}
        onConfirm={onEdgeInterpolateConfirm}
      />

      {heightMapModal({
        isOpen: showHeightMapModal,
        onClose: () => setShowHeightMapModal(false),
        onConfirm: onHeightMapConfirm,
      })}
    </>
  );
}
