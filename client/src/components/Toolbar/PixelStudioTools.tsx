import { useState } from "react";
import { useEditorStore } from "../../store";
import { Tool } from "../../types";
import {
  ReferenceImageModal,
  ReferenceImageData,
} from "../ReferenceImageModal/ReferenceImageModal";
import { Icon } from "../../ui/primitives/Icon/Icon";
import type { LucideIcon } from "lucide-react";
import {
  Pencil,
  Eraser,
  Pipette,
  Square,
  PaintBucket,
  CloudFog,
  Minus,
  RectangleHorizontal,
  Circle,
  Move,
  BoxSelect,
  Crosshair,
  FlipHorizontal2,
  FlipVertical2,
  Camera,
  X,
} from "lucide-react";

interface PixelStudioToolsProps {
  onReferenceImageChange?: (data: ReferenceImageData | null) => void;
  hasReferenceImage?: boolean;
}

const tools: { id: Tool; icon: LucideIcon; label: string; hotkey: string }[] = [
  { id: "pixel", icon: Pencil, label: "Pencil", hotkey: "1" },
  { id: "eraser", icon: Eraser, label: "Eraser", hotkey: "2" },
  { id: "eyedropper", icon: Pipette, label: "Eyedropper", hotkey: "3" },
  { id: "fill-square", icon: Square, label: "Square Brush", hotkey: "4" },
  { id: "flood-fill", icon: PaintBucket, label: "Fill", hotkey: "5" },
  { id: "gaussian-fill", icon: CloudFog, label: "Gaussian Fill", hotkey: "G" },
  { id: "line", icon: Minus, label: "Line", hotkey: "6" },
  { id: "rectangle", icon: RectangleHorizontal, label: "Rectangle (↑↓ radius)", hotkey: "7" },
  { id: "ellipse", icon: Circle, label: "Ellipse", hotkey: "8" },
  { id: "move", icon: Move, label: "Move (arrows to shift)", hotkey: "9" },
  {
    id: "selection",
    icon: BoxSelect,
    label: "Selection (arrows to move)",
    hotkey: "0",
  },
  { id: "origin", icon: Crosshair, label: "Origin (set anchor point)", hotkey: "O" },
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
      <div className="toolbar__section">
        <div className="toolbar__group">
          {tools.map((tool) => (
            <button
              key={tool.id}
              className={`toolbar__tool-btn ${selectedTool === tool.id ? "toolbar__tool-btn--active" : ""}`}
              onClick={() => setTool(tool.id)}
              title={`${tool.label} (${tool.hotkey})`}
            >
              <span className="toolbar__tool-icon"><Icon icon={tool.icon} /></span>
              <span className="toolbar__tool-hotkey">{tool.hotkey}</span>
            </button>
          ))}
        </div>

        <div className="toolbar__divider" />

        <div className="toolbar__group">
          <button
            className="toolbar__tool-btn"
            onClick={() => flipHorizontal()}
            title="Flip Horizontal"
          >
            <span className="toolbar__tool-icon"><Icon icon={FlipHorizontal2} /></span>
          </button>
          <button
            className="toolbar__tool-btn"
            onClick={() => flipVertical()}
            title="Flip Vertical"
          >
            <span className="toolbar__tool-icon"><Icon icon={FlipVertical2} /></span>
          </button>
        </div>

        <div className="toolbar__divider" />

        <div className="toolbar__group toolbar__group--reference">
          <button
            className={`toolbar__tool-btn ${hasReferenceImage ? "toolbar__tool-btn--has-reference" : ""}`}
            onClick={() => setIsRefModalOpen(true)}
            title="Add Reference Image"
          >
            <span className="toolbar__tool-icon"><Icon icon={Camera} /></span>
          </button>
          {hasReferenceImage && (
            <button
              className="toolbar__tool-btn toolbar__clear-reference-btn"
              onClick={handleClearReference}
              title="Clear Reference Image"
            >
              <span className="toolbar__tool-icon"><Icon icon={X} /></span>
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
