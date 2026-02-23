import { useState } from "react";
import { useEditorStore } from "../../store";
import { ReferenceImageData } from "../ReferenceImageModal/ReferenceImageModal";
import { PixelStudioTools } from "./PixelStudioTools";
import { LightingStudioTools } from "./LightingStudioTools";
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
          className="toolbar-fixed-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Focus Mode Toggle */}
      <div className="toolbar-section focus-mode-section">
        <div className="toolbar-group">
          <button
            className={`tool-btn ${isFocusMode ? "active" : ""}`}
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
            <span className="tool-icon">⛶</span>
            <span className="tool-hotkey">`</span>
          </button>
          <button
            className={`tool-btn ${isLightGrid ? "active light-grid-active" : ""}`}
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
            <span className="tool-icon">{isLightGrid ? "☀" : "☾"}</span>
          </button>
          {!isLightingMode && (
            <button
              className={`tool-btn ${isFrameReferenceVisible ? "active" : ""}`}
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
              <span className="tool-icon">🎞️</span>
            </button>
          )}
        </div>
      </div>

      <div className="toolbar-divider" />

      {/* Studio Mode Toggle */}
      <div className="toolbar-section studio-mode-section">
        <div className="studio-mode-toggle">
          <button
            className={`studio-mode-btn ${!isLightingMode ? "active" : ""}`}
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
            <span className="tool-icon">🎨</span>
          </button>
          <button
            className={`studio-mode-btn ${isLightingMode ? "active" : ""}`}
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
            <span className="tool-icon">💡</span>
          </button>
        </div>
      </div>

      <div className="toolbar-divider" />

      {/* Conditional Tools based on Studio Mode */}
      {isLightingMode ? (
        <LightingStudioTools />
      ) : (
        <PixelStudioTools
          onReferenceImageChange={onReferenceImageChange}
          hasReferenceImage={hasReferenceImage}
        />
      )}
    </div>
  );
}
