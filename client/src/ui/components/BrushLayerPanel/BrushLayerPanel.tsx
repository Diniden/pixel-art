/**
 * BrushLayerPanel — the brush document's layer list (Brush Studio plan,
 * `docs/01-brush-studio`, task 12; MASTER D16).
 *
 * The brush-mode replacement for `LayerPanel` in the left rail. A stacked
 * panel header ("Layers" + an add button) over a list of `BrushLayerRow`s.
 * There are no variants and no per-frame anything: layer order is uniform
 * across frames (MASTER D6), so every move applies everywhere.
 *
 * The header's "+" opens the SAME `BrushChannelMenu` the rows use, without
 * the group section, so a new layer is born with its colour source AND its
 * type chosen — `onAddLayer(channelType, colorSource)` — rather than
 * defaulting and needing a second click. The two picks read as a two-step
 * (plan 13, MASTER D3): a colour-source row TICKS and keeps the menu open
 * (the draft lives in `addSource` here); a channel row creates and closes.
 * The draft goes back to `"selected"` whenever the menu closes, however it
 * closes. The menu is a `document.body` portal, so the rail's scroller
 * cannot clip it.
 *
 * `ui/` boundary: React, lucide, the brush types, the `Icon` primitive,
 * `classNames`, its two siblings and the stylesheet. No store, no MobX.
 */
import { useCallback, useState } from "react";
import { Plus } from "lucide-react";
import type {
  BrushAppliedGroup,
  BrushChannelType,
  BrushColorSource,
} from "../../../types";
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

  /**
   * The header "+" — the colour source and the channel are both picked from
   * the menu before the call; the source defaults to `"selected"`.
   */
  onAddLayer: (
    channelType: BrushChannelType,
    colorSource: BrushColorSource,
  ) => void;

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

export function BrushLayerPanel({
  layers,
  selectedLayerId,
  appliedGroups,
  onAddLayer,
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
}: BrushLayerPanelProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [addEl, setAddEl] = useState<HTMLButtonElement | null>(null);
  /** The creation menu's sticky colour-source tick; reset on every close. */
  const [addSource, setAddSource] = useState<BrushColorSource>("selected");
  const closeAdd = useCallback(() => {
    setAddOpen(false);
    setAddSource("selected");
  }, []);

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
            onClick={() => (addOpen ? closeAdd() : setAddOpen(true))}
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
                onSetColorSource={onSetColorSource}
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
          colorSource={addSource}
          label="New layer — colour source, then channel"
          // Ticks and stays open: the source is the first half of the pick.
          onSelectColorSource={setAddSource}
          onSelectChannelType={(type) => {
            onAddLayer(type, addSource);
            closeAdd();
          }}
          onClose={closeAdd}
        />
      )}
    </div>
  );
}
