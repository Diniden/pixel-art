/**
 * LayerPanelHeader — the header row and its eight action buttons
 * (REFRESH task 35).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE `allFrames` HALF OF THE COLLAPSE LIVES HERE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Five of the seven collapsed callbacks were header buttons: move up/down
 * across all frames, squash down/up across all frames, and delete across all
 * frames. All five now go through the same three signatures the row uses,
 * differing only in `scope: "allFrames"`. Reading this file next to
 * `LayerRow.tsx` is how a reviewer confirms the two scopes are wired to the
 * same shapes — which is precisely what the pre-split code, with seven
 * separately-named store members inlined into seven `onClick`s, made hard.
 *
 * ⚠️ See `layerScope.ts`: the `allFrames` actions are NOT "the frame action
 * repeated". They match layers by index rather than by id and carry their own
 * guards, deliberately. Both scopes must be verified separately in the app.
 *
 * ── The delete confirm is the caller's ────────────────────────────────────
 *
 * The pre-split code called `confirm('Delete this layer across all frames?')`
 * inline. A `window.confirm` is a store-shaped dependency in disguise: it
 * blocks, it cannot be rendered in a story, and it makes the button
 * untestable. The button now just emits `onDeleteLayer(id, "allFrames")` and
 * the container decides whether to confirm — so this component stays pure and
 * the dialog stays swappable.
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 * Imports: the `Icon` primitive, `lucide-react` glyphs, the shared scope
 * types, and this file's own stylesheet. No store, no MobX, no API, no
 * domain type.
 */
import { Icon } from "../../primitives/Icon/Icon";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Eye,
  EyeOff,
  ClipboardCopy,
  Wand2,
  Plus,
  X,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import type { LayerScope, MoveDirection } from "./layerScope";
import "./LayerPanel.css";

export interface LayerPanelHeaderProps {
  /** The selected layer, or `null` — every all-frames button needs one. */
  selectedLayerId: string | null;
  /** Every layer in the current frame is visible. */
  allVisible: boolean;
  /** The project has at least one variant group. */
  hasVariants: boolean;

  canMoveUp: boolean;
  canMoveDown: boolean;
  canSquashDown: boolean;
  canSquashUp: boolean;
  /** False when the frame holds a single layer — delete is refused. */
  canDeleteAcrossAllFrames: boolean;

  /** Collapsed callback #1 — this header emits "allFrames" only. */
  onMoveLayer: (
    layerId: string,
    direction: MoveDirection,
    scope: LayerScope,
  ) => void;
  /** Collapsed callback #2 — this header emits "allFrames" only. */
  onSquashLayer: (
    layerId: string,
    direction: MoveDirection,
    scope: LayerScope,
  ) => void;
  /** Collapsed callback #3 — this header emits "allFrames" only. */
  onDeleteLayer: (layerId: string, scope: LayerScope) => void;

  onToggleAllVisibility: (visible: boolean) => void;
  onOpenCopyFrom: () => void;
  onOpenAddVariant: () => void;
  onAddLayer: () => void;
}

export function LayerPanelHeader({
  selectedLayerId,
  allVisible,
  hasVariants,
  canMoveUp,
  canMoveDown,
  canSquashDown,
  canSquashUp,
  canDeleteAcrossAllFrames,
  onMoveLayer,
  onSquashLayer,
  onDeleteLayer,
  onToggleAllVisibility,
  onOpenCopyFrom,
  onOpenAddVariant,
  onAddLayer,
}: LayerPanelHeaderProps) {
  return (
    <div className="panel__header panel__header--stacked">
      <div className="panel__title">Layers</div>
      <div className="layer-panel__header-actions">
        <button
          className="layer-panel__header-btn layer-panel__header-btn--move-all"
          onClick={(e) => {
            e.stopPropagation();
            if (selectedLayerId) {
              onMoveLayer(selectedLayerId, "up", "allFrames");
            }
          }}
          disabled={!canMoveUp}
          title="Move selected layer up across all frames"
        >
          <Icon icon={ChevronUp} size={12} />
        </button>
        <button
          className="layer-panel__header-btn layer-panel__header-btn--move-all"
          onClick={(e) => {
            e.stopPropagation();
            if (selectedLayerId) {
              onMoveLayer(selectedLayerId, "down", "allFrames");
            }
          }}
          disabled={!canMoveDown}
          title="Move selected layer down across all frames"
        >
          <Icon icon={ChevronDown} size={12} />
        </button>
        <button
          className="layer-panel__header-btn layer-panel__header-btn--squash-all"
          onClick={(e) => {
            e.stopPropagation();
            if (selectedLayerId) {
              onSquashLayer(selectedLayerId, "down", "allFrames");
            }
          }}
          disabled={!canSquashDown}
          title="Squash down across all frames (this layer squashes into layer below)"
        >
          <Icon icon={ArrowDownToLine} size={12} />
        </button>
        <button
          className="layer-panel__header-btn layer-panel__header-btn--squash-all"
          onClick={(e) => {
            e.stopPropagation();
            if (selectedLayerId) {
              onSquashLayer(selectedLayerId, "up", "allFrames");
            }
          }}
          disabled={!canSquashUp}
          title="Squash up across all frames (this layer squashes into layer above)"
        >
          <Icon icon={ArrowUpToLine} size={12} />
        </button>
        <button
          className={`layer-panel__header-btn layer-panel__header-btn--visibility ${allVisible ? "layer-panel__header-btn--all-visible" : ""}`}
          onClick={() => onToggleAllVisibility(!allVisible)}
          title={allVisible ? "Hide all layers" : "Show all layers"}
        >
          <Icon icon={allVisible ? Eye : EyeOff} size={12} />
        </button>
        <button
          className="layer-panel__header-btn layer-panel__header-btn--copy-from"
          onClick={onOpenCopyFrom}
          title="Copy layer from another object"
        >
          <Icon icon={ClipboardCopy} size={12} />
        </button>
        <button
          className={`layer-panel__header-btn layer-panel__header-btn--add-variant ${hasVariants ? "" : "layer-panel__header-btn--disabled"}`}
          onClick={() => hasVariants && onOpenAddVariant()}
          disabled={!hasVariants}
          title={
            hasVariants
              ? "Add existing variant as layer"
              : "No variants exist yet"
          }
        >
          <Icon icon={Wand2} size={12} />
        </button>
        <button
          className="layer-panel__header-btn"
          onClick={onAddLayer}
          title="New Layer"
        >
          <Icon icon={Plus} size={12} />
        </button>
        <button
          className="layer-panel__header-btn layer-panel__header-btn--delete-all"
          onClick={(e) => {
            e.stopPropagation();
            if (selectedLayerId) {
              onDeleteLayer(selectedLayerId, "allFrames");
            }
          }}
          disabled={!selectedLayerId || !canDeleteAcrossAllFrames}
          title="Delete selected layer across all frames"
        >
          <Icon icon={X} size={12} />
        </button>
      </div>
    </div>
  );
}
