import { useState } from "react";
import { useEditorStore } from "../../store";
import type { ReferenceImageData } from "../../types/referenceImage";
// Task 24: routed through its container so the `observer()` seam exists
// before task 35/36 purifies the component itself.
import { PixelStudioToolsContainer } from "../../containers/PixelStudioToolsContainer";
import { LightingStudioTools } from "./LightingStudioTools";
import { Icon } from "../../ui/primitives/Icon/Icon";
import { Maximize2, Sun, Moon, Film, Palette, Lightbulb } from "lucide-react";
import "./Toolbar.css";

interface ToolbarProps {
  onReferenceImageChange?: (data: ReferenceImageData | null) => void;
  hasReferenceImage?: boolean;
}

export function Toolbar({
  onReferenceImageChange,
  hasReferenceImage,
}: ToolbarProps) {
  const { project, setStudioMode, toggleFocusMode, toggleLightGridMode, toggleFrameReferencePanelVisible } =
    useEditorStore();
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
    visible: boolean;
  } | null>(null);

  if (!project) return null;

  const { studioMode } = project.uiState;
  const isLightingMode = studioMode === "lighting";
  const isFocusMode = project.uiState.focusMode ?? false;
  const isLightGrid = project.uiState.lightGridMode ?? false;
  const isFrameReferenceVisible = project.uiState.frameReferencePanelVisible ?? true;

  return (
    <div className="toolbar">
      {tooltip?.visible && (
        <div
          className="toolbar__fixed-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Focus Mode Toggle */}
      <div className="toolbar__section toolbar__section--focus-mode">
        <div className="toolbar__group">
          <button
            className={`toolbar__tool-btn ${isFocusMode ? "toolbar__tool-btn--active" : ""}`}
            onClick={toggleFocusMode}
            aria-label="Focus Mode"
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setTooltip({
                text: "Focus Mode (`)",
                x: rect.left + rect.width / 2,
                y: rect.bottom + 10,
                visible: true,
              });
            }}
            onMouseLeave={() => setTooltip(null)}
          >
            <span className="toolbar__tool-icon"><Icon icon={Maximize2} /></span>
            <span className="toolbar__tool-hotkey">`</span>
          </button>
          <button
            className={`toolbar__tool-btn ${isLightGrid ? "toolbar__tool-btn--active toolbar__tool-btn--light-grid" : ""}`}
            onClick={toggleLightGridMode}
            aria-label="Light Grid Background"
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setTooltip({
                text: isLightGrid
                  ? "Dark Grid Background"
                  : "Light Grid Background",
                x: rect.left + rect.width / 2,
                y: rect.bottom + 10,
                visible: true,
              });
            }}
            onMouseLeave={() => setTooltip(null)}
          >
            <span className="toolbar__tool-icon"><Icon icon={isLightGrid ? Sun : Moon} /></span>
          </button>
          {!isLightingMode && (
            <button
              className={`toolbar__tool-btn ${isFrameReferenceVisible ? "toolbar__tool-btn--active" : ""}`}
              onClick={toggleFrameReferencePanelVisible}
              aria-label="Frame Reference"
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setTooltip({
                  text: isFrameReferenceVisible
                    ? "Hide Frame Reference"
                    : "Show Frame Reference",
                  x: rect.left + rect.width / 2,
                  y: rect.bottom + 10,
                  visible: true,
                });
              }}
              onMouseLeave={() => setTooltip(null)}
            >
              <span className="toolbar__tool-icon"><Icon icon={Film} /></span>
            </button>
          )}
        </div>
      </div>

      <div className="toolbar__divider" />

      {/* Studio Mode Toggle */}
      <div className="toolbar__section toolbar__section--studio-mode">
        <div className="toolbar__studio-mode-toggle">
          <button
            className={`toolbar__studio-mode-btn ${!isLightingMode ? "toolbar__studio-mode-btn--active" : ""}`}
            onClick={() => setStudioMode("pixel")}
            aria-label="Pixel Studio"
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setTooltip({
                text: "Pixel Studio",
                x: rect.left + rect.width / 2,
                y: rect.bottom + 10,
                visible: true,
              });
            }}
            onMouseLeave={() => setTooltip(null)}
          >
            <span className="toolbar__tool-icon"><Icon icon={Palette} /></span>
          </button>
          <button
            className={`toolbar__studio-mode-btn ${isLightingMode ? "toolbar__studio-mode-btn--active" : ""}`}
            onClick={() => setStudioMode("lighting")}
            aria-label="Lighting Studio"
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setTooltip({
                text: "Lighting Studio",
                x: rect.left + rect.width / 2,
                y: rect.bottom + 10,
                visible: true,
              });
            }}
            onMouseLeave={() => setTooltip(null)}
          >
            <span className="toolbar__tool-icon"><Icon icon={Lightbulb} /></span>
          </button>
        </div>
      </div>

      <div className="toolbar__divider" />

      {/* Conditional Tools based on Studio Mode */}
      {isLightingMode ? (
        <LightingStudioTools />
      ) : (
        <PixelStudioToolsContainer
          onReferenceImageChange={onReferenceImageChange}
          hasReferenceImage={hasReferenceImage}
        />
      )}
    </div>
  );
}
