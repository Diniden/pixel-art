/**
 * BrushLayerRow — one row of the brush layer list (Brush Studio plan,
 * `docs/01-brush-studio`, task 12).
 *
 * Structurally a copy of `LayerPanel/LayerRow.tsx` with everything the brush
 * document does not have taken out: no variants, no squash, no drag, no
 * per-frame move scope (brush layer order is uniform across frames, MASTER
 * D6, so up/down is simply up/down). What it gains is the CHANNEL BADGE — a
 * button showing `BRUSH_CHANNEL_BADGE[type]` that opens the portalled
 * `BrushChannelMenu` — the SOURCE BADGE right after it (`SEL` / `TGT`,
 * plan 13 D3), which opens the SAME menu anchored on itself, and an optional
 * applied-group badge after the name.
 *
 * ── No `BrushLayer` crosses this boundary ─────────────────────────────────
 * The row takes a `BrushLayerRowModel`: ids, a name and booleans. A
 * `BrushLayer` carries `pixels`, and the same rule that keeps `Layer` out of
 * `LayerRow` keeps it out of here — the container projects.
 *
 * ── Local state, deliberately ─────────────────────────────────────────────
 * Unlike `LayerRow`, whose inline rename is driven by the container
 * (`editingId` / `editingName`), this row owns its rename draft and its
 * menu-open flag. Both are transient presentation state with a single
 * consumer, so lifting them would only add props. The committed name leaves
 * through `onRename`; nothing else escapes.
 *
 * Every action handler calls `e.stopPropagation()` so a button press never
 * doubles as a row select.
 *
 * `ui/` boundary: React, lucide, the brush types, the `Icon` primitive,
 * `classNames`, the sibling menu and the stylesheet. No store.
 */
import { useCallback, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, X } from "lucide-react";
import {
  BRUSH_CHANNEL_BADGE,
  BRUSH_COLOR_SOURCE_BADGE,
  type BrushAppliedGroup,
  type BrushChannelType,
  type BrushColorSource,
} from "../../../types";
import { Icon } from "../../primitives/Icon/Icon";
import { classNames } from "../../classNames";
import { BrushChannelMenu } from "./BrushChannelMenu";
import "./BrushLayerPanel.css";

/** The flat projection of one brush layer, built by the container. */
export interface BrushLayerRowModel {
  id: string;
  name: string;
  visible: boolean;
  channelType: BrushChannelType;
  /** Already resolved by the container (`brushLayerColorSource`), never absent. */
  colorSource: BrushColorSource;
  /** Resolved group name for the badge; `null` when ungrouped. */
  appliedGroupName: string | null;
  /**
   * The group's id, so the menu can tick the row in force. Optional: when
   * absent the row falls back to matching `appliedGroupName` against
   * `appliedGroups`, which is only ambiguous if two groups share a name.
   */
  appliedGroupId?: string | null;
}

export interface BrushLayerRowProps {
  layer: BrushLayerRowModel;
  isSelected: boolean;
  /** Position in the DISPLAYED (top-of-stack-first) list. */
  index: number;
  /** Length of the displayed list — the move-down disabled bound. */
  count: number;
  appliedGroups: ReadonlyArray<BrushAppliedGroup>;

  onSelect: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onRename: (layerId: string, name: string) => void;
  onSetChannelType: (layerId: string, type: BrushChannelType) => void;
  onSetColorSource: (layerId: string, source: BrushColorSource) => void;
  onSetAppliedGroup: (layerId: string, groupId: string | null) => void;
  onCreateAppliedGroup: (layerId: string, name: string) => void;
  onMoveUp: (layerId: string) => void;
  onMoveDown: (layerId: string) => void;
  onDuplicate: (layerId: string) => void;
  onDelete: (layerId: string) => void;
}

export function BrushLayerRow({
  layer,
  isSelected,
  index,
  count,
  appliedGroups,
  onSelect,
  onToggleVisibility,
  onRename,
  onSetChannelType,
  onSetColorSource,
  onSetAppliedGroup,
  onCreateAppliedGroup,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
}: BrushLayerRowProps) {
  // One menu, two triggers. `anchorEl` is whichever badge was pressed last,
  // so the portal hangs off the button the user actually clicked; `menuOpen`
  // is a single flag because both badges open the same menu. A state-held
  // element rather than a ref read during render: the menu wants the
  // element itself, and reading `ref.current` in render is what
  // `react-hooks/refs` exists to catch.
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [channelBadgeEl, setChannelBadgeEl] =
    useState<HTMLButtonElement | null>(null);
  const [sourceBadgeEl, setSourceBadgeEl] = useState<HTMLButtonElement | null>(
    null,
  );
  /** `null` = not renaming; a string = the draft in the input. */
  const [draft, setDraft] = useState<string | null>(null);
  // Enter and Escape both remove the input; a blur that follows must not
  // commit (or re-commit) on their behalf.
  const skipBlurRef = useRef(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  /** Pressing the open menu's own anchor toggles it shut; the other badge re-anchors. */
  const toggleMenu = (el: HTMLButtonElement | null) => {
    if (menuOpen && el === anchorEl) {
      closeMenu();
      return;
    }
    setAnchorEl(el);
    setMenuOpen(true);
  };

  const selectedGroupId =
    layer.appliedGroupId ??
    appliedGroups.find((g) => g.name === layer.appliedGroupName)?.id ??
    null;

  const startRename = () => {
    skipBlurRef.current = false;
    setDraft(layer.name);
  };
  const finishRename = (commit: boolean) => {
    if (draft === null) return;
    const name = draft.trim();
    if (commit && name.length > 0 && name !== layer.name) {
      onRename(layer.id, name);
    }
    setDraft(null);
  };

  const badge = BRUSH_CHANNEL_BADGE[layer.channelType];
  const sourceBadge = BRUSH_COLOR_SOURCE_BADGE[layer.colorSource];
  const channelOpen = menuOpen && anchorEl === channelBadgeEl;
  const sourceOpen = menuOpen && anchorEl === sourceBadgeEl;

  return (
    <div
      className={classNames(
        "brush-layer-panel__item",
        isSelected && "brush-layer-panel__item--selected",
      )}
      onClick={() => onSelect(layer.id)}
    >
      <div className="brush-layer-panel__visibility-col">
        <button
          type="button"
          className={classNames(
            "brush-layer-panel__visibility-btn",
            layer.visible && "brush-layer-panel__visibility-btn--visible",
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisibility(layer.id);
          }}
          title={layer.visible ? "Hide layer" : "Show layer"}
          aria-pressed={layer.visible}
          aria-label={
            layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`
          }
        >
          <Icon icon={layer.visible ? Eye : EyeOff} size={12} />
        </button>
      </div>

      <div className="brush-layer-panel__main-col">
        <div className="brush-layer-panel__label-row">
          <button
            ref={setChannelBadgeEl}
            type="button"
            className={classNames(
              "brush-layer-panel__channel-badge",
              `brush-layer-panel__channel-badge--${layer.channelType}`,
              channelOpen && "brush-layer-panel__channel-badge--open",
            )}
            aria-haspopup="menu"
            aria-expanded={channelOpen}
            aria-label={`Channel: ${badge}`}
            title="Channel type and applied group"
            onClick={(e) => {
              e.stopPropagation();
              toggleMenu(channelBadgeEl);
            }}
          >
            {badge}
          </button>
          <button
            ref={setSourceBadgeEl}
            type="button"
            className={classNames(
              "brush-layer-panel__source-badge",
              `brush-layer-panel__source-badge--${layer.colorSource}`,
              sourceOpen && "brush-layer-panel__source-badge--open",
            )}
            aria-haspopup="menu"
            aria-expanded={sourceOpen}
            aria-label={`Colour source: ${sourceBadge}`}
            title="Where the brush takes its colour"
            onClick={(e) => {
              e.stopPropagation();
              toggleMenu(sourceBadgeEl);
            }}
          >
            {sourceBadge}
          </button>

          {draft !== null ? (
            <input
              // Focus and select on mount: the name is expected to be
              // overtyped.
              ref={(el) => {
                if (!el) return;
                el.focus();
                el.select();
              }}
              type="text"
              className="brush-layer-panel__name-input"
              value={draft}
              aria-label="Layer name"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                if (skipBlurRef.current) return;
                finishRename(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  skipBlurRef.current = true;
                  finishRename(true);
                } else if (e.key === "Escape") {
                  skipBlurRef.current = true;
                  finishRename(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="brush-layer-panel__name"
              title={layer.name}
              onDoubleClick={(e) => {
                e.stopPropagation();
                startRename();
              }}
            >
              {layer.name}
              {layer.appliedGroupName && (
                <span
                  className="brush-layer-panel__group-badge"
                  title={`Applied group: ${layer.appliedGroupName}`}
                >
                  {layer.appliedGroupName}
                </span>
              )}
            </span>
          )}
        </div>

        <div className="brush-layer-panel__actions">
          <button
            type="button"
            className="brush-layer-panel__action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp(layer.id);
            }}
            disabled={index === 0}
            title="Move layer up (all frames)"
            aria-label={`Move ${layer.name} up`}
          >
            <Icon icon={ChevronUp} size={10} />
          </button>
          <button
            type="button"
            className="brush-layer-panel__action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown(layer.id);
            }}
            disabled={index === count - 1}
            title="Move layer down (all frames)"
            aria-label={`Move ${layer.name} down`}
          >
            <Icon icon={ChevronDown} size={10} />
          </button>
          <button
            type="button"
            className="brush-layer-panel__action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(layer.id);
            }}
            title="Duplicate layer"
            aria-label={`Duplicate ${layer.name}`}
          >
            <Icon icon={Copy} size={10} />
          </button>
          <button
            type="button"
            className="brush-layer-panel__action-btn brush-layer-panel__action-btn--danger"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(layer.id);
            }}
            title="Delete layer"
            aria-label={`Delete ${layer.name}`}
          >
            <Icon icon={X} size={10} />
          </button>
        </div>
      </div>

      {menuOpen && (
        <BrushChannelMenu
          anchorEl={anchorEl}
          channelType={layer.channelType}
          colorSource={layer.colorSource}
          appliedGroups={appliedGroups}
          selectedGroupId={selectedGroupId}
          label={`${layer.name} channel`}
          onSelectColorSource={(source) => {
            onSetColorSource(layer.id, source);
            closeMenu();
          }}
          onSelectChannelType={(type) => {
            onSetChannelType(layer.id, type);
            closeMenu();
          }}
          onSelectAppliedGroup={(groupId) => {
            onSetAppliedGroup(layer.id, groupId);
            closeMenu();
          }}
          onCreateAppliedGroup={(name) => {
            onCreateAppliedGroup(layer.id, name);
            closeMenu();
          }}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
