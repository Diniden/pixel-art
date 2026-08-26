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
  Repeat2,
  Undo2,
  Redo2,
} from "lucide-react";
import { classNames } from "../../classNames";
import { useLongPress } from "../../hooks/useLongPress";

interface PixelStudioToolsProps {
  onReferenceImageChange?: (data: ReferenceImageData | null) => void;
  hasReferenceImage?: boolean;
  /** `uiState.selectedTool` — the ACTIVE slot. */
  selectedTool: Tool;
  onSelectTool: (tool: Tool) => void;
  /**
   * The second tool slot — what an Apple Pencil double-tap swaps to.
   *
   * Long-press (or right-click) a tool to assign it here instead of making
   * it active, which is the only way to set slot B without a Pencil.
   */
  alternateTool: Tool;
  onSelectAlternateTool: (tool: Tool) => void;
  onSwapTools: () => void;
  /** Undo/redo — the toolbar is the ONLY way to reach these without a keyboard. */
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
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

/**
 * One tool button, with its own long-press timer.
 *
 * ⚠️ It is a COMPONENT rather than inline JSX because `useLongPress` is a
 * hook: twelve tools need twelve independent timers, and hooks cannot be
 * called inside a `.map()`. Inlining it would either share one timer across
 * every button (so pressing one tool assigns another) or break the rules of
 * hooks outright.
 */
function ToolButton({
  tool,
  isActive,
  isAlternate,
  onSelect,
  onSelectAlternate,
}: {
  tool: { id: Tool; icon: LucideIcon; label: string; hotkey: string };
  isActive: boolean;
  isAlternate: boolean;
  onSelect: () => void;
  onSelectAlternate: () => void;
}) {
  const longPress = useLongPress(onSelectAlternate);

  return (
    <button
      className={classNames(
        "toolbar__tool-btn",
        isActive && "toolbar__tool-btn--active",
        // The alternate slot is MARKED, never styled as selected: two
        // buttons that both look active leave the user unable to tell which
        // one is painting.
        isAlternate && "toolbar__tool-btn--alternate",
      )}
      onClick={() => {
        // ⚠️ A completed long press is followed by a click. Without this
        // guard the button would assign the alternate slot AND then select
        // itself, so the gesture would appear to do the wrong thing.
        if (longPress.didLongPress()) return;
        onSelect();
      }}
      // Right-click is the POINTER route to the same action — on a desktop
      // there is no Pencil to double-tap and no reason to hold the mouse
      // down for half a second. The two are complementary, not alternatives.
      onContextMenu={(e) => {
        e.preventDefault();
        onSelectAlternate();
      }}
      {...longPress.handlers}
      title={
        isAlternate
          ? `${tool.label} (${tool.hotkey}) — second slot`
          : `${tool.label} (${tool.hotkey}) — long-press or right-click for the second slot`
      }
    >
      <span className="toolbar__tool-icon">
        <Icon icon={tool.icon} />
      </span>
      <span className="toolbar__tool-hotkey">{tool.hotkey}</span>
    </button>
  );
}

export function PixelStudioTools({
  onReferenceImageChange,
  hasReferenceImage,
  selectedTool,
  onSelectTool,
  alternateTool,
  onSelectAlternateTool,
  onSwapTools,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onFlipHorizontal,
  onFlipVertical,
  referenceImageModal,
}: PixelStudioToolsProps) {
  const [isRefModalOpen, setIsRefModalOpen] = useState(false);

  // The alternate slot may hold a tool that has no entry here only if the
  // list and the `Tool` union drift; falling back to the id keeps the button
  // labelled rather than blank.
  const alternateToolLabel =
    tools.find((t) => t.id === alternateTool)?.label ?? alternateTool;

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
            <ToolButton
              key={tool.id}
              tool={tool}
              isActive={selectedTool === tool.id}
              isAlternate={
                alternateTool === tool.id && selectedTool !== tool.id
              }
              onSelect={() => onSelectTool(tool.id)}
              onSelectAlternate={() => onSelectAlternateTool(tool.id)}
            />
          ))}
        </div>

        <div className="toolbar__divider" />

        {/* Slot swap + undo/redo.

            ⚠️ These three are the iPad's ONLY route to actions that were
            keyboard-only (Cmd+Z / Cmd+Shift+Z, and the Pencil double-tap
            which does not exist outside the companion app). They are shown
            on every device rather than gated behind a touch media query: a
            control that appears only on one device is a control nobody
            discovers, and undo is useful with a mouse too. */}
        <div className="toolbar__group">
          <button
            className="toolbar__tool-btn toolbar__tool-btn--swap"
            onClick={onSwapTools}
            // The human LABEL, never the raw tool id — `flood-fill` and
            // `pixel` are internal names and mean nothing to the user.
            title={`Swap tools — ${alternateToolLabel} (Apple Pencil: double-tap)`}
            aria-label={`Swap to ${alternateToolLabel}`}
          >
            <span className="toolbar__tool-icon">
              <Icon icon={Repeat2} />
            </span>
          </button>
          <button
            className="toolbar__tool-btn"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Cmd/Ctrl+Z)"
            aria-label="Undo"
          >
            <span className="toolbar__tool-icon">
              <Icon icon={Undo2} />
            </span>
          </button>
          <button
            className="toolbar__tool-btn"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Cmd/Ctrl+Shift+Z)"
            aria-label="Redo"
          >
            <span className="toolbar__tool-icon">
              <Icon icon={Redo2} />
            </span>
          </button>
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
