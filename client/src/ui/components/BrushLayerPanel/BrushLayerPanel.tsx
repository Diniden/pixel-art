/**
 * BrushLayerPanel — the brush document's layer list (Brush Studio plan,
 * `docs/01-brush-studio`, task 12; MASTER D16).
 *
 * The brush-mode replacement for `LayerPanel` in the left rail. A stacked
 * panel header ("Layers" + an add button) over a list of `BrushLayerRow`s.
 * There are no variants and no per-frame anything: layer order is uniform
 * across frames (MASTER D6), so every move applies everywhere.
 *
 * The header's "+" opens the SAME `BrushChannelMenu` the rows use, in its
 * channel-only form, so a new layer is born with its type chosen —
 * `onAddLayer(channelType)` — rather than defaulting and needing a second
 * click. The menu is a `document.body` portal, so the rail's scroller
 * cannot clip it.
 *
 * `ui/` boundary: React, lucide, the brush types, the `Icon` primitive,
 * `classNames`, its two siblings and the stylesheet. No store, no MobX.
 */
import { useCallback, useState } from "react";
import { Plus } from "lucide-react";
import type { BrushAppliedGroup, BrushChannelType } from "../../../types";
import { Icon } from "../../primitives/Icon/Icon";
import { classNames } from "../../classNames";
import { BrushChannelMenu } from "./BrushChannelMenu";
import { BrushLayerRow, type BrushLayerRowModel } from "./BrushLayerRow";
import "./BrushLayerPanel.css";

export interface BrushLayerPanelProps {
  /** Display order: top of the stack FIRST. The container reverses. */
  layers: ReadonlyArray<BrushLayerRowModel>;
  selectedLayerId: string | null;
  appliedGroups: ReadonlyArray<BrushAppliedGroup>;

  /** The header "+" — the channel is picked from the menu before the call. */
  onAddLayer: (channelType: BrushChannelType) => void;

  onSelect: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onRename: (layerId: string, name: string) => void;
  onSetChannelType: (layerId: string, type: BrushChannelType) => void;
  onSetAppliedGroup: (layerId: string, groupId: string | null) => void;
  onCreateAppliedGroup: (layerId: string, name: string) => void;
  onMoveUp: (layerId: string) => void;
  onMoveDown: (layerId: string) => void;
  onDuplicate: (layerId: string) => void;
  onDelete: (layerId: string) => void;
}

export function BrushLayerPanel({
  layers,
  selectedLayerId,
  appliedGroups,
  onAddLayer,
  onSelect,
  onToggleVisibility,
  onRename,
  onSetChannelType,
  onSetAppliedGroup,
  onCreateAppliedGroup,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
}: BrushLayerPanelProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [addEl, setAddEl] = useState<HTMLButtonElement | null>(null);
  const closeAdd = useCallback(() => setAddOpen(false), []);

  return (
    <div className="panel brush-layer-panel">
      <div className="panel__header panel__header--stacked">
        <div className="panel__title">Layers</div>
        <div className="brush-layer-panel__header-actions">
          <button
            ref={setAddEl}
            type="button"
            className={classNames(
              "brush-layer-panel__header-btn",
              addOpen && "brush-layer-panel__header-btn--open",
            )}
            aria-haspopup="menu"
            aria-expanded={addOpen}
            aria-label="Add layer"
            title="Add layer"
            onClick={() => setAddOpen((open) => !open)}
          >
            <Icon icon={Plus} size={12} />
          </button>
        </div>
      </div>

      <div className="panel__body">
        {layers.length === 0 ? (
          <div className="brush-layer-panel__empty">No layers yet</div>
        ) : (
          <div className="brush-layer-panel__list">
            {layers.map((layer, index) => (
              <BrushLayerRow
                key={layer.id}
                layer={layer}
                isSelected={layer.id === selectedLayerId}
                index={index}
                count={layers.length}
                appliedGroups={appliedGroups}
                onSelect={onSelect}
                onToggleVisibility={onToggleVisibility}
                onRename={onRename}
                onSetChannelType={onSetChannelType}
                onSetAppliedGroup={onSetAppliedGroup}
                onCreateAppliedGroup={onCreateAppliedGroup}
                onMoveUp={onMoveUp}
                onMoveDown={onMoveDown}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>

      {addOpen && (
        <BrushChannelMenu
          anchorEl={addEl}
          channelType={null}
          label="New layer channel"
          onSelectChannelType={(type) => {
            onAddLayer(type);
            closeAdd();
          }}
          onClose={closeAdd}
        />
      )}
    </div>
  );
}
