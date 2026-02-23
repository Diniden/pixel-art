import { useState } from "react";
import { useEditorStore } from "../../store";
import { Tool } from "../../types";
import {
  ReferenceImageModal,
  ReferenceImageData,
} from "../ReferenceImageModal/ReferenceImageModal";

interface PixelStudioToolsProps {
  onReferenceImageChange?: (data: ReferenceImageData | null) => void;
  hasReferenceImage?: boolean;
}

const tools: { id: Tool; icon: string; label: string; hotkey: string }[] = [
  { id: "pixel", icon: "✏️", label: "Pencil", hotkey: "1" },
  { id: "eraser", icon: "🧹", label: "Eraser", hotkey: "2" },
  { id: "eyedropper", icon: "💧", label: "Eyedropper", hotkey: "3" },
  { id: "fill-square", icon: "⬛", label: "Square Brush", hotkey: "4" },
  { id: "flood-fill", icon: "🪣", label: "Fill", hotkey: "5" },
  { id: "gaussian-fill", icon: "🌫️", label: "Gaussian Fill", hotkey: "G" },
  { id: "line", icon: "📏", label: "Line", hotkey: "6" },
  { id: "rectangle", icon: "▢", label: "Rectangle (↑↓ radius)", hotkey: "7" },
  { id: "ellipse", icon: "◯", label: "Ellipse", hotkey: "8" },
  { id: "move", icon: "✥", label: "Move (arrows to shift)", hotkey: "9" },
  {
    id: "selection",
    icon: "⬚",
    label: "Selection (arrows to move)",
    hotkey: "0",
  },
  { id: "origin", icon: "⊕", label: "Origin (set anchor point)", hotkey: "O" },
];

export function PixelStudioTools({
  onReferenceImageChange,
  hasReferenceImage,
}: PixelStudioToolsProps) {
  const { project, setTool, flipHorizontal, flipVertical } = useEditorStore();
  const [isRefModalOpen, setIsRefModalOpen] = useState(false);

  if (!project) return null;

  const { selectedTool } = project.uiState;

  const handleReferenceConfirm = (data: ReferenceImageData) => {
    onReferenceImageChange?.(data);
    setIsRefModalOpen(false);
  };

  const handleClearReference = () => {
    onReferenceImageChange?.(null);
  };

  return (
    <>
      <div className="toolbar-section">
        <div className="toolbar-group">
          {tools.map((tool) => (
            <button
              key={tool.id}
              className={`tool-btn ${selectedTool === tool.id ? "active" : ""}`}
              onClick={() => setTool(tool.id)}
              title={`${tool.label} (${tool.hotkey})`}
            >
              <span className="tool-icon">{tool.icon}</span>
              <span className="tool-hotkey">{tool.hotkey}</span>
            </button>
          ))}
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button
            className="tool-btn"
            onClick={() => flipHorizontal()}
            title="Flip Horizontal"
          >
            <span className="tool-icon">↔️</span>
          </button>
          <button
            className="tool-btn"
            onClick={() => flipVertical()}
            title="Flip Vertical"
          >
            <span className="tool-icon">↕️</span>
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group reference-group">
          <button
            className={`tool-btn reference-btn ${hasReferenceImage ? "has-reference" : ""}`}
            onClick={() => setIsRefModalOpen(true)}
            title="Add Reference Image"
          >
            <span className="tool-icon">📷</span>
          </button>
          {hasReferenceImage && (
            <button
              className="tool-btn clear-reference-btn"
              onClick={handleClearReference}
              title="Clear Reference Image"
            >
              <span className="tool-icon">✕</span>
            </button>
          )}
        </div>
      </div>

      <ReferenceImageModal
        isOpen={isRefModalOpen}
        onClose={() => setIsRefModalOpen(false)}
        onConfirm={handleReferenceConfirm}
      />
    </>
  );
}
