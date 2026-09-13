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
import { Tooltip } from "../../primitives/Tooltip/Tooltip";
import type { LucideIcon } from "lucide-react";
import {
  Pencil,
  Eraser,
  Paintbrush,
  Pipette,
  PaintBucket,
  CloudFog,
  Minus,
  RectangleHorizontal,
  Circle,
  Move,
  BoxSelect,
  Box,
  Crosshair,
  FlipHorizontal,
  FlipHorizontal2,
  FlipVertical2,
  Camera,
  X,
  Repeat2,
  Undo2,
  Redo2,
} from "lucide-react";
import { classNames } from "../../classNames";
import { EyedropperModeMenu } from "./EyedropperModeMenu";
import type { EyedropperMode } from "../../../types";

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
  /**
   * The eyedropper's post-sample behaviour, and its setter.
   *
   * Long-press or double-click the eyedropper to open the chooser — see
   * `ToolButton`'s `secondaryAction` note for why those two gestures and not
   * the slot-B ones.
   */
  eyedropperMode: EyedropperMode;
  onSelectEyedropperMode: (mode: EyedropperMode) => void;
  /** Which edge the toolbar is docked to, so the menu opens inward. */
  edge?: "top" | "bottom" | "left" | "right";
  /** Undo/redo — the toolbar is the ONLY way to reach these without a keyboard. */
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  /**
   * Tools to leave out of the bar (brush-studio task 19). The brush studio
   * shares this tool set but has no anchor point and no reference image, so
   * its container passes `origin` and `reference-trace`. The table below is
   * filtered by id; `reference-trace` has no table entry — its UI is the
   * reference-image group, which is hidden with it. Absent = show everything.
   */
  hiddenTools?: ReadonlySet<Tool>;
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
  {
    id: "brush",
    icon: Paintbrush,
    label: "Brush (stamps the open brush project)",
    hotkey: "B",
  },
  { id: "eyedropper", icon: Pipette, label: "Eyedropper", hotkey: "3" },
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
  {
    id: "reflection",
    icon: FlipHorizontal,
    label: "Reflection (mirror across lines)",
    hotkey: "R",
  },
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
  { id: "pose", icon: Box, label: "Pose (3D reference)", hotkey: "P" },
];

/**
 * One tool button, wrapped in its own `Tooltip`.
 *
 * ⚠️ It is a COMPONENT rather than inline JSX because it calls hooks —
 * `useState` for the menu anchor, and `Tooltip` runs its own long-press timer
 * per trigger. Fourteen tools need fourteen independent ones, and hooks cannot
 * be called inside a `.map()`. Inlining would either share one timer across
 * every button or break the rules of hooks outright.
 *
 * It used to own a `useLongPress` for slot-B assignment; that gesture is the
 * tooltip's now (2026-08-31) — see the note on `secondary` below.
 */
function ToolButton({
  tool,
  isActive,
  isAlternate,
  onSelect,
  onSelectAlternate,
  secondaryAction,
  secondaryHint,
  children,
}: {
  tool: { id: Tool; icon: LucideIcon; label: string; hotkey: string };
  isActive: boolean;
  isAlternate: boolean;
  onSelect: () => void;
  onSelectAlternate: () => void;
  /**
   * Overrides what long-press / right-click / double-click do on THIS tool.
   *
   * ⚠️ When supplied, the tool LOSES its slot-B assignment gesture, and that
   * is the owner's call (2026-08-28): slot B is reachable another way —
   * swap to the alternate, then re-assign it with a Pencil double-tap — so
   * the gesture is free for a tool that has a better use for it. Only the
   * eyedropper passes this today.
   */
  secondaryAction?: () => void;
  /** Tooltip tail describing `secondaryAction`. */
  secondaryHint?: string;
  /**
   * The anchored menu, when this tool has one open. Called with the button
   * element so the menu can measure it.
   *
   * ⚠️ A RENDER PROP, not a child: the menu portals itself to `document.body`
   * (the toolbar clips it otherwise — see `EyedropperModeMenu`'s header), and
   * it needs the trigger's DOM node to position against. A plain child could
   * not be handed one.
   */
  children?: (anchor: HTMLButtonElement | null) => ReactNode;
}) {
  /* ⚠️ LONG-PRESS NO LONGER ASSIGNS THE SECOND SLOT — IT SHOWS THE TOOLTIP.
     Changed 2026-08-31 at the owner's request: "Long hold on ipad should make
     them show up and release should immediately dismiss ... All tools should
     have tooltips that open on all platforms." Long-press is the only gesture
     a touch device has for "tell me what this is", and it cannot mean two
     things at once, so the tooltip won it and `useLongPress` is gone from here.

     The secondary action keeps BOTH of its other routes, and `onDoubleClick`
     below is now wired unconditionally rather than only where a
     `secondaryAction` exists — otherwise removing the long press would have
     left slot-B assignment reachable by right-click alone, which an iPad does
     not have. Double-tap is also the gesture the Apple Pencil already uses for
     this, so it is the one the owner's hand already knows. */
  const secondary = secondaryAction ?? onSelectAlternate;
  // `useState`, not `useRef`: the menu has to RE-RENDER once the node exists,
  // and a ref assignment does not schedule one — the menu would mount with a
  // null anchor and never measure.
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);

  const button = (
    <button
      ref={setAnchor}
      className={classNames(
        "toolbar__tool-btn",
        isActive && "toolbar__tool-btn--active",
        // The alternate slot is MARKED, never styled as selected: two
        // buttons that both look active leave the user unable to tell which
        // one is painting.
        isAlternate && "toolbar__tool-btn--alternate",
      )}
      onClick={() => {
        // No long-press guard is needed any more: the hold shows a tooltip and
        // performs no action, so the click that follows a hold is an ordinary
        // selection and is exactly what the user meant.
        onSelect();
      }}
      /* Double-tap / double-click is now the PRIMARY route to the secondary
         action on every tool, not just those with a menu — see the note on
         `secondary` above. It is what the Apple Pencil's own double-tap maps
         to, so the gesture is already familiar.

         ⚠️ `onClick` still fires (twice) before this does, so the action has
         to be safe to reach with the tool already selected. Opening a menu is.
         Assigning slot B is too: `onSelectAlternate` sets the slot rather than
         toggling it, so running it after two selections of the same tool lands
         on the same result. */
      onDoubleClick={(e) => {
        e.preventDefault();
        secondary();
      }}
      // Right-click is the POINTER route to the same action — on a desktop
      // there is no Pencil to double-tap. Complementary, not an alternative.
      onContextMenu={(e) => {
        e.preventDefault();
        secondary();
      }}
      /* ⚠️ EXPLICIT, because `title` used to be the accessible name and is
         gone. The visible content is an icon plus a bare hotkey letter, so
         without this a screen reader would announce the button as "B" — and
         `Tooltip`'s `aria-describedby` is a DESCRIPTION, which never
         substitutes for a name. */
      aria-label={`${tool.label} (${tool.hotkey})`}
    >
      <span className="toolbar__tool-icon">
        <Icon icon={tool.icon} />
      </span>
      <span className="toolbar__tool-hotkey">{tool.hotkey}</span>
    </button>
  );

  /* The label every platform gets. `title=` used to carry this, and a `title`
     is invisible on an iPad and unstyleable everywhere — which is why the
     owner reported the tools had no tooltips there at all. `Tooltip` shows on
     hover, on keyboard focus, and on a touch long-press.

     ⚠️ NO GESTURE INSTRUCTIONS. Removed 2026-09-01 at the owner's request:
     the tooltip names the tool and its hotkey, nothing more. It used to spell
     out "double-tap or right-click for the second slot" on every tool, which
     is noise on a bubble the user sees on every hover.

     The gestures themselves are UNCHANGED — double-tap, right-click and
     long-press all still assign the second slot (see `secondaryAction` and the
     handlers below). Only the advertising is gone. Do not reintroduce it
     here. */
  const hint = secondaryHint
    ? `${tool.label} (${tool.hotkey}) — ${secondaryHint}`
    : isAlternate
      ? `${tool.label} (${tool.hotkey}) — second slot`
      : `${tool.label} (${tool.hotkey})`;

  // The menu portals itself out, so there is no wrapper and no change to the
  // toolbar's flex layout for the one tool that has one.
  return (
    <>
      <Tooltip content={hint}>{button}</Tooltip>
      {children?.(anchor)}
    </>
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
  eyedropperMode,
  onSelectEyedropperMode,
  edge = "top",
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onFlipHorizontal,
  onFlipVertical,
  hiddenTools,
  referenceImageModal,
}: PixelStudioToolsProps) {
  const [isRefModalOpen, setIsRefModalOpen] = useState(false);
  // Genuine local view state, like `isRefModalOpen`: which tool's anchored
  // menu is open is not a store value and nothing outside this bar reads it.
  const [isEyedropperMenuOpen, setIsEyedropperMenuOpen] = useState(false);

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

  // See `hiddenTools`: the table is filtered by id, and the reference-image
  // group goes with the trace tool it exists to enter.
  const visibleTools = hiddenTools
    ? tools.filter((tool) => !hiddenTools.has(tool.id))
    : tools;
  const showReferenceGroup = !hiddenTools?.has("reference-trace");

  return (
    <>
      <div className="toolbar__section">
        <div className="toolbar__group">
          {visibleTools.map((tool) => {
            const isEyedropper = tool.id === "eyedropper";
            return (
              <ToolButton
                key={tool.id}
                tool={tool}
                isActive={selectedTool === tool.id}
                isAlternate={
                  alternateTool === tool.id && selectedTool !== tool.id
                }
                onSelect={() => onSelectTool(tool.id)}
                onSelectAlternate={() => onSelectAlternateTool(tool.id)}
                // Only the eyedropper claims the secondary gesture — see
                // `ToolButton`'s `secondaryAction` note.
                secondaryAction={
                  isEyedropper
                    ? () => setIsEyedropperMenuOpen((open) => !open)
                    : undefined
                }
                /* ⚠️ States the MODE, never the gesture that changes it —
                   see `ToolButton`'s hint note. */
                secondaryHint={
                  isEyedropper
                    ? eyedropperMode === "stay"
                      ? "stays active after sampling"
                      : "returns to the previous tool after sampling"
                    : undefined
                }
              >
                {isEyedropper && isEyedropperMenuOpen
                  ? (anchor) => (
                      <EyedropperModeMenu
                        mode={eyedropperMode}
                        edge={edge}
                        anchorEl={anchor}
                        onSelectMode={(mode) => {
                          onSelectEyedropperMode(mode);
                          setIsEyedropperMenuOpen(false);
                        }}
                        onClose={() => setIsEyedropperMenuOpen(false)}
                      />
                    )
                  : undefined}
              </ToolButton>
            );
          })}
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
          {/* The human LABEL, never the raw tool id — `flood-fill` and
              `pixel` are internal names and mean nothing to the user. */}
          <Tooltip content={`Swap tools — ${alternateToolLabel}`}>
            <button
              className="toolbar__tool-btn toolbar__tool-btn--swap"
              onClick={onSwapTools}
              aria-label={`Swap to ${alternateToolLabel}`}
            >
              <span className="toolbar__tool-icon">
                <Icon icon={Repeat2} />
              </span>
            </button>
          </Tooltip>
          <Tooltip content="Undo (Cmd/Ctrl+Z)">
            <button
              className="toolbar__tool-btn"
              onClick={onUndo}
              disabled={!canUndo}
              aria-label="Undo"
            >
              <span className="toolbar__tool-icon">
                <Icon icon={Undo2} />
              </span>
            </button>
          </Tooltip>
          <Tooltip content="Redo (Cmd/Ctrl+Shift+Z)">
            <button
              className="toolbar__tool-btn"
              onClick={onRedo}
              disabled={!canRedo}
              aria-label="Redo"
            >
              <span className="toolbar__tool-icon">
                <Icon icon={Redo2} />
              </span>
            </button>
          </Tooltip>
        </div>

        <div className="toolbar__divider" />

        <div className="toolbar__group">
          <Tooltip content="Flip Horizontal">
            <button
              className="toolbar__tool-btn"
              onClick={() => onFlipHorizontal()}
              aria-label="Flip Horizontal"
            >
              <span className="toolbar__tool-icon">
                <Icon icon={FlipHorizontal2} />
              </span>
            </button>
          </Tooltip>
          <Tooltip content="Flip Vertical">
            <button
              className="toolbar__tool-btn"
              onClick={() => onFlipVertical()}
              aria-label="Flip Vertical"
            >
              <span className="toolbar__tool-icon">
                <Icon icon={FlipVertical2} />
              </span>
            </button>
          </Tooltip>
        </div>

        {showReferenceGroup && <div className="toolbar__divider" />}

        {showReferenceGroup && (
          <div className="toolbar__group toolbar__group--reference">
            <Tooltip content="Add Reference Image">
              <button
                className={`toolbar__tool-btn ${hasReferenceImage ? "toolbar__tool-btn--has-reference" : ""}`}
                onClick={() => setIsRefModalOpen(true)}
                aria-label="Add Reference Image"
              >
                <span className="toolbar__tool-icon">
                  <Icon icon={Camera} />
                </span>
              </button>
            </Tooltip>
            {hasReferenceImage && (
              <Tooltip content="Clear Reference Image">
                <button
                  className="toolbar__tool-btn toolbar__clear-reference-btn"
                  onClick={handleClearReference}
                  aria-label="Clear Reference Image"
                >
                  <span className="toolbar__tool-icon">
                    <Icon icon={X} />
                  </span>
                </button>
              </Tooltip>
            )}
          </div>
        )}
      </div>

      {referenceImageModal({
        isOpen: isRefModalOpen,
        onClose: () => setIsRefModalOpen(false),
        onConfirm: handleReferenceConfirm,
      })}
    </>
  );
}
