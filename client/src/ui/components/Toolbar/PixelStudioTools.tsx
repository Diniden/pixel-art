/**
 * PixelStudioTools — PURE (REFRESH task 36, W27).
 *
 * The 4 store members are props now. `isRefModalOpen` stays a local
 * `useState`: it is genuinely component-local view state, NOT a mirror of a
 * store value, so the "no useState mirror" rule does not apply to it.
 *
 * ⚠️ The reference-image modal is passed in as the `referenceImageModal`
 * RENDER PROP. It is `ReferenceImageContainer` (task 29), and a `ui/` module
 * importing a container drags MobX across the purity boundary transitively.
 * The container receives the open/close state so the modal's lifecycle is
 * unchanged.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { Tool } from "../../../types";
import type { ReferenceImageData } from "../../../types/referenceImage";
import { Icon } from "../../primitives/Icon/Icon";
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
  /** `uiState.selectedTool` */
  selectedTool: Tool;
  onSelectTool: (tool: Tool) => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  /**
   * Renders `ReferenceImageContainer` with the supplied open/close/confirm
   * wiring — injected because it is a container (see the note above).
   */
  referenceImageModal: (props: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (data: ReferenceImageData) => void;
  }) => ReactNode;
}

const tools: { id: Tool; icon: LucideIcon; label: string; hotkey: string }[] = [
  { id: "pixel", icon: Pencil, label: "Pencil", hotkey: "1" },
  { id: "eraser", icon: Eraser, label: "Eraser", hotkey: "2" },
  { id: "eyedropper", icon: Pipette, label: "Eyedropper", hotkey: "3" },
  { id: "fill-square", icon: Square, label: "Square Brush", hotkey: "4" },
  { id: "flood-fill", icon: PaintBucket, label: "Fill", hotkey: "5" },
  { id: "gaussian-fill", icon: CloudFog, label: "Gaussian Fill", hotkey: "G" },
  { id: "line", icon: Minus, label: "Line", hotkey: "6" },
  {
    id: "rectangle",
    icon: RectangleHorizontal,
    label: "Rectangle (↑↓ radius)",
    hotkey: "7",
  },
  { id: "ellipse", icon: Circle, label: "Ellipse", hotkey: "8" },
  { id: "move", icon: Move, label: "Move (arrows to shift)", hotkey: "9" },
  {
    id: "selection",
    icon: BoxSelect,
    label: "Selection (arrows to move)",
    hotkey: "0",
  },
  {
    id: "origin",
    icon: Crosshair,
    label: "Origin (set anchor point)",
    hotkey: "O",
  },
];

export function PixelStudioTools({
  onReferenceImageChange,
  hasReferenceImage,
  selectedTool,
  onSelectTool,
  onFlipHorizontal,
  onFlipVertical,
  referenceImageModal,
}: PixelStudioToolsProps) {
  const [isRefModalOpen, setIsRefModalOpen] = useState(false);

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
              onClick={() => onSelectTool(tool.id)}
              title={`${tool.label} (${tool.hotkey})`}
            >
              <span className="toolbar__tool-icon">
                <Icon icon={tool.icon} />
              </span>
              <span className="toolbar__tool-hotkey">{tool.hotkey}</span>
            </button>
          ))}
        </div>

        <div className="toolbar__divider" />

        <div className="toolbar__group">
          <button
            className="toolbar__tool-btn"
            onClick={() => onFlipHorizontal()}
            title="Flip Horizontal"
          >
            <span className="toolbar__tool-icon">
              <Icon icon={FlipHorizontal2} />
            </span>
          </button>
          <button
            className="toolbar__tool-btn"
            onClick={() => onFlipVertical()}
            title="Flip Vertical"
          >
            <span className="toolbar__tool-icon">
              <Icon icon={FlipVertical2} />
            </span>
          </button>
        </div>

        <div className="toolbar__divider" />

        <div className="toolbar__group toolbar__group--reference">
          <button
            className={`toolbar__tool-btn ${hasReferenceImage ? "toolbar__tool-btn--has-reference" : ""}`}
            onClick={() => setIsRefModalOpen(true)}
            title="Add Reference Image"
          >
            <span className="toolbar__tool-icon">
              <Icon icon={Camera} />
            </span>
          </button>
          {hasReferenceImage && (
            <button
              className="toolbar__tool-btn toolbar__clear-reference-btn"
              onClick={handleClearReference}
              title="Clear Reference Image"
            >
              <span className="toolbar__tool-icon">
                <Icon icon={X} />
              </span>
            </button>
          )}
        </div>
      </div>

      {referenceImageModal({
        isOpen: isRefModalOpen,
        onClose: () => setIsRefModalOpen(false),
        onConfirm: handleReferenceConfirm,
      })}
    </>
  );
}
