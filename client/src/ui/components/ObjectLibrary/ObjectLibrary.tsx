/**
 * ObjectLibrary — the object list, in three view modes (REFRESH task 35).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  623 LINES · 15 `useState` CALLS · JSX DEPTH 14 → A LIST AND FOUR DIALOGS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The 15 `useState` calls were five inline forms sharing one component. They
 * are now **four** (`showNewForm`, `renamingId`, `resizingId`,
 * `deleteConfirm`) — each a single "which flow is open" flag, with the flow's
 * own fields owned by the dialog that uses them:
 *
 *   newName / newWidth / newHeight        → `ObjectCreateDialog`   (3 → 0)
 *   editingName                           → `ObjectRenameDialog`   (1 → 0)
 *   resizeWidth / resizeHeight /          → `ObjectResizeDialog`   (5 → 0)
 *     resizeAnchor / originalWidth /
 *     originalHeight
 *
 * ── ⚠️ THUMBNAILS: NO PIXEL GRID, AND NO COMPARATOR ───────────────────────
 *
 * `renderFramePreview` walks every layer of a frame (R2). It runs on the
 * container's side and arrives as `makeThumbnailDraw(objectId)`, a factory
 * this component calls per row. `thumbnailRevision` says when to repaint.
 *
 * **Do not add a `React.memo` comparator over the project tree.** W20 found
 * the 79-line one that used to live here was dead code hiding a live
 * stale-thumbnail bug — it iterated `variantGroups`, which the v1.1.0
 * migration leaves `undefined`. See `ObjectThumbnail.tsx`'s header; 5 DOM
 * tests pin the behaviour.
 *
 * ── The three view modes ──────────────────────────────────────────────────
 *
 * `grid` (thumbnail + hover tooltip), `small-rows` (thumbnail + name), and
 * `normal` (thumbnail + name + metrics + actions, with the resize panel
 * nested in the entry). All three were `objects.map` copies of nearly the
 * same JSX; the shared parts are now the row components below.
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 * Imports: React hooks, `createPortal` (for the hover tooltip only), the
 * `Icon` primitive, `lucide-react` glyphs, its own dialogs and thumbnail, the
 * `AnchorPosition` type, and this file's stylesheet. No store, no MobX, no
 * API. `PixelObject` no longer crosses the boundary — rows arrive as
 * `ObjectRowModel`.
 */
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../primitives/Icon/Icon";
import { Copy, Maximize, X } from "lucide-react";
import { ObjectThumbnail } from "./ObjectThumbnail";
import { ObjectCreateDialog } from "./dialogs/ObjectCreateDialog";
import { ObjectRenameDialog } from "./dialogs/ObjectRenameDialog";
import { ObjectResizeDialog } from "./dialogs/ObjectResizeDialog";
import { ObjectDeleteDialog } from "./dialogs/ObjectDeleteDialog";
import type { AnchorPosition } from "../../../components/AnchorGrid/AnchorGrid";
import "./ObjectLibrary.css";

export type ObjectLibraryViewMode = "normal" | "small-rows" | "grid";

/**
 * The flat projection of one object. Note what is absent: `frames`. A
 * `PixelObject` carries every pixel of every layer of every frame, and this
 * list renders 12+ of them.
 */
export interface ObjectRowModel {
  id: string;
  name: string;
  width: number;
  height: number;
  frameCount: number;
}

export interface ObjectLibraryProps {
  objects: ObjectRowModel[];
  selectedObjectId: string | null;
  viewMode: ObjectLibraryViewMode;

  /**
   * Builds the paint callback for one object's thumbnail. Called per row;
   * the closure it returns is what actually walks the pixels, on the
   * CONTAINER's side of the boundary.
   */
  makeThumbnailDraw: (
    objectId: string,
  ) => (ctx: CanvasRenderingContext2D, size: number) => void;
  /** Changes exactly when any thumbnail's content changes. */
  thumbnailRevision: number;

  onAddObject: (name: string, width: number, height: number) => void;
  onDeleteObject: (id: string) => void;
  onRenameObject: (id: string, name: string) => void;
  onResizeObject: (
    id: string,
    width: number,
    height: number,
    anchor: AnchorPosition,
  ) => void;
  onSelectObject: (id: string) => void;
  onDuplicateObject: (id: string) => void;
  onSetViewMode: (mode: ObjectLibraryViewMode) => void;
}

/** Hover tooltip for grid mode. Portalled so the list's overflow cannot clip it. */
function Tooltip({
  children,
  visible,
  x,
  y,
}: {
  children: React.ReactNode;
  visible: boolean;
  x: number;
  y: number;
}) {
  if (!visible) return null;

  return createPortal(
    <div className="object-library__tooltip" style={{ left: x, top: y }}>
      {children}
    </div>,
    document.body,
  );
}

export function ObjectLibrary({
  objects,
  selectedObjectId,
  viewMode,
  makeThumbnailDraw,
  thumbnailRevision,
  onAddObject,
  onDeleteObject,
  onRenameObject,
  onResizeObject,
  onSelectObject,
  onDuplicateObject,
  onSetViewMode,
}: ObjectLibraryProps) {
  // Four flags — down from 15. Each flow's own fields live in its dialog.
  const [showNewForm, setShowNewForm] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const [tooltipFor, setTooltipFor] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const cycleViewMode = useCallback(() => {
    if (viewMode === "normal") onSetViewMode("small-rows");
    else if (viewMode === "small-rows") onSetViewMode("grid");
    else onSetViewMode("normal");
  }, [viewMode, onSetViewMode]);

  const viewModeIcon =
    viewMode === "normal" ? "☰" : viewMode === "small-rows" ? "≡" : "▦";
  const viewModeTitle =
    viewMode === "normal"
      ? "Normal View (click for Small Rows)"
      : viewMode === "small-rows"
        ? "Small Rows (click for Grid)"
        : "Grid View (click for Normal)";

  const handleTooltipEnter = useCallback(
    (e: React.MouseEvent, objectId: string) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setTooltipPos({ x: rect.right + 8, y: rect.top });
      setTooltipFor(objectId);
    },
    [],
  );

  const thumbnailFor = (obj: ObjectRowModel) => (
    <ObjectThumbnail
      draw={makeThumbnailDraw(obj.id)}
      revision={thumbnailRevision}
      label={obj.name}
    />
  );

  return (
    <div className="panel object-library">
      <div className="panel__header">
        Objects
        <div className="object-library__header-actions">
          <button
            className={`object-library__view-toggle ${viewMode !== "normal" ? "object-library__view-toggle--active" : ""}`}
            onClick={cycleViewMode}
            title={viewModeTitle}
          >
            {viewModeIcon}
          </button>
          <button
            className="object-library__header-btn"
            onClick={() => setShowNewForm(!showNewForm)}
            title="New Object"
          >
            +
          </button>
        </div>
      </div>
      <div className="panel__body">
        {showNewForm && (
          <ObjectCreateDialog
            defaultName={`Object ${objects.length + 1}`}
            onCreate={(name, width, height) => {
              onAddObject(name, width, height);
              setShowNewForm(false);
            }}
            onCancel={() => setShowNewForm(false)}
          />
        )}

        {viewMode === "grid" ? (
          <div className="object-library__grid">
            {objects.map((obj) => (
              <div key={obj.id}>
                <div
                  className={`object-library__grid-item ${selectedObjectId === obj.id ? "object-library__grid-item--selected" : ""}`}
                  onClick={() => onSelectObject(obj.id)}
                  onMouseEnter={(e) => handleTooltipEnter(e, obj.id)}
                  onMouseLeave={() => setTooltipFor(null)}
                >
                  {thumbnailFor(obj)}
                </div>
                <Tooltip
                  visible={tooltipFor === obj.id}
                  x={tooltipPos.x}
                  y={tooltipPos.y}
                >
                  <div className="object-library__tooltip-name">{obj.name}</div>
                  <div className="object-library__tooltip-details">
                    {obj.width}×{obj.height} • {obj.frameCount} frame
                    {obj.frameCount !== 1 ? "s" : ""}
                  </div>
                </Tooltip>
              </div>
            ))}
          </div>
        ) : viewMode === "small-rows" ? (
          <div className="object-library__list-small">
            {objects.map((obj) => (
              <div
                key={obj.id}
                className={`object-library__item-small ${selectedObjectId === obj.id ? "object-library__item-small--selected" : ""}`}
                onClick={() => onSelectObject(obj.id)}
              >
                <div className="object-library__thumb-small">
                  {thumbnailFor(obj)}
                </div>
                {renamingId === obj.id ? (
                  <ObjectRenameDialog
                    initialName={obj.name}
                    size="small"
                    onRename={(name) => {
                      onRenameObject(obj.id, name);
                      setRenamingId(null);
                    }}
                    onCancel={() => setRenamingId(null)}
                  />
                ) : (
                  <span
                    className="object-library__name-small"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setRenamingId(obj.id);
                    }}
                  >
                    {obj.name}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="object-library__list">
            {objects.map((obj) => (
              <div key={obj.id} className="object-library__entry">
                <div
                  className={`object-library__item ${selectedObjectId === obj.id ? "object-library__item--selected" : ""}`}
                  onClick={() => onSelectObject(obj.id)}
                >
                  <div className="object-library__thumb">
                    {thumbnailFor(obj)}
                  </div>
                  <div className="object-library__content">
                    <div className="object-library__name-row">
                      {renamingId === obj.id ? (
                        <ObjectRenameDialog
                          initialName={obj.name}
                          onRename={(name) => {
                            onRenameObject(obj.id, name);
                            setRenamingId(null);
                          }}
                          onCancel={() => setRenamingId(null)}
                        />
                      ) : (
                        <span
                          className="object-library__name"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setRenamingId(obj.id);
                          }}
                        >
                          {obj.name}
                        </span>
                      )}
                    </div>

                    <div className="object-library__metrics-row">
                      <span className="object-library__details">
                        {obj.width}×{obj.height} • {obj.frameCount} frame
                        {obj.frameCount !== 1 ? "s" : ""}
                      </span>
                    </div>

                    <div className="object-library__actions-row">
                      <div className="object-library__actions">
                        <button
                          className="object-library__action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDuplicateObject(obj.id);
                          }}
                          title="Duplicate"
                        >
                          <Icon icon={Copy} size={12} />
                        </button>
                        <button
                          className="object-library__action-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setResizingId(obj.id);
                          }}
                          title="Resize"
                        >
                          <Icon icon={Maximize} size={12} />
                        </button>
                        <button
                          className="object-library__action-btn object-library__action-btn--danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirm({ id: obj.id, name: obj.name });
                          }}
                          title="Delete"
                        >
                          <Icon icon={X} size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {resizingId === obj.id && (
                  <ObjectResizeDialog
                    currentWidth={obj.width}
                    currentHeight={obj.height}
                    onApply={(width, height, anchor) => {
                      onResizeObject(obj.id, width, height, anchor);
                      setResizingId(null);
                    }}
                    onCancel={() => setResizingId(null)}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {objects.length === 0 && (
          <div className="object-library__empty">
            No objects yet. Create one to start.
          </div>
        )}
      </div>

      {deleteConfirm && (
        <ObjectDeleteDialog
          objectName={deleteConfirm.name}
          onConfirm={() => {
            onDeleteObject(deleteConfirm.id);
            setDeleteConfirm(null);
          }}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}
