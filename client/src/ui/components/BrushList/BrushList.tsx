/**
 * BrushList — the brushes INSIDE a project, as the left rail's top panel
 * (multi-brush plan, task 03; MASTER D8).
 *
 * Replaces `BrushLibrary`, which listed brush FILES. This lists the brushes
 * of the OPEN project: a "Brushes" header with a "+" that opens an inline
 * name / W / H form, and one `BrushListRow` per brush (thumbnail, name,
 * `W×H` badge, selection highlight, inline rename, hover actions).
 *
 * ── Every row has data ────────────────────────────────────────────────────
 * Unlike the library, every brush of the open project is in memory, so
 * every row carries a thumbnail via its own `draw` closure. One shared
 * `thumbnailRevision` repaints them all: `ThumbnailCanvas` ignores closure
 * identity and repaints only when the revision changes.
 *
 * ── The name rule is LOCAL ────────────────────────────────────────────────
 * `validateBrushListName` (below, module-private) requires a non-empty
 * trimmed name that no row already uses (case-sensitive compare on trimmed
 * names). It is NOT `BrushLibrary/brushName.ts`: that one enforces
 * FILE-name rules, and a brush inside a project is not a file.
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 * Imports: React hooks, lucide, the `Icon` / `NumberInput` / `EmptyState`
 * primitives, `classNames`, the sibling row and this file's stylesheet. No
 * store, no MobX, no API, no `Brush` / `BrushDocument` type — the row model
 * is the boundary.
 */
import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { Icon } from "../../primitives/Icon/Icon";
import { NumberInput } from "../../primitives/NumberInput/NumberInput";
import { EmptyState } from "../../primitives/EmptyState/EmptyState";
import { classNames } from "../../classNames";
import { BrushListRow, type BrushListRowModel } from "./BrushListRow";
import "./BrushList.css";

export {
  BRUSH_LIST_THUMB_SIZE,
  type BrushListRowModel,
  type BrushListRowProps,
} from "./BrushListRow";

const DEFAULT_BRUSH_SIZE = 16;
const MIN_BRUSH_SIZE = 1;
const MAX_BRUSH_SIZE = 256;

/**
 * Returns a user-facing error, or `null` when `name` (trimmed) is usable as
 * a brush name inside the project whose current names are `existing`.
 *
 * Module-private: `react-refresh/only-export-components` forbids exporting a
 * function from a component file, and the rule is pinned through the form's
 * dom tests rather than directly.
 */
function validateBrushListName(
  name: string,
  existing: ReadonlyArray<string>,
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Brush name cannot be empty";
  if (existing.some((n) => n.trim() === trimmed)) {
    return "A brush with that name already exists";
  }
  return null;
}

export interface BrushListProps {
  /** Display order: index 0 at the top. Never empty in practice, but render an EmptyState if it is. */
  brushes: ReadonlyArray<BrushListRowModel>;
  selectedBrushId: string | null;
  /** Changes whenever any thumbnail's content changes. */
  thumbnailRevision: number;
  onSelect: (brushId: string) => void;
  onAdd: (name: string, width: number, height: number) => void;
  onRename: (brushId: string, name: string) => void;
  onDuplicate: (brushId: string) => void;
  onDelete: (brushId: string) => void;
  onMoveUp: (brushId: string) => void;
  onMoveDown: (brushId: string) => void;
}

export function BrushList({
  brushes,
  selectedBrushId,
  thumbnailRevision,
  onSelect,
  onAdd,
  onRename,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: BrushListProps) {
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWidth, setNewWidth] = useState(DEFAULT_BRUSH_SIZE);
  const [newHeight, setNewHeight] = useState(DEFAULT_BRUSH_SIZE);
  const [error, setError] = useState<string | null>(null);

  const formId = useId();
  const nameId = `${formId}-name`;
  const widthId = `${formId}-width`;
  const heightId = `${formId}-height`;
  const errorId = `${formId}-error`;

  const closeForm = () => {
    setShowNewForm(false);
    setNewName("");
    setNewWidth(DEFAULT_BRUSH_SIZE);
    setNewHeight(DEFAULT_BRUSH_SIZE);
    setError(null);
  };

  const submit = () => {
    const problem = validateBrushListName(
      newName,
      brushes.map((b) => b.name),
    );
    if (problem) {
      setError(problem);
      return;
    }
    onAdd(newName.trim(), newWidth, newHeight);
    closeForm();
  };

  const canCreate = newName.trim().length > 0;

  return (
    <div className="panel brush-list">
      <div className="panel__header panel__header--stacked">
        <div className="panel__title">Brushes</div>
        <div className="brush-list__header-actions">
          <button
            type="button"
            className={classNames(
              "brush-list__header-btn",
              showNewForm && "brush-list__header-btn--active",
            )}
            onClick={() => (showNewForm ? closeForm() : setShowNewForm(true))}
            title="New brush"
            aria-label="New brush"
            aria-expanded={showNewForm}
          >
            <Icon icon={Plus} size={12} />
          </button>
        </div>
      </div>

      <div className="panel__body">
        {showNewForm && (
          <div className="brush-list__new-form">
            <label className="brush-list__label" htmlFor={nameId}>
              Name
            </label>
            <input
              id={nameId}
              type="text"
              className="brush-list__name-input"
              placeholder="Brush name..."
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                else if (e.key === "Escape") closeForm();
              }}
              aria-invalid={error != null}
              aria-describedby={error != null ? errorId : undefined}
              autoFocus
            />
            <div className="brush-list__size-inputs">
              <div className="brush-list__size-field">
                <label className="brush-list__label" htmlFor={widthId}>
                  W
                </label>
                <NumberInput
                  id={widthId}
                  unstyled
                  className="brush-list__size-input"
                  min={MIN_BRUSH_SIZE}
                  max={MAX_BRUSH_SIZE}
                  value={newWidth}
                  onChange={setNewWidth}
                />
              </div>
              <span className="brush-list__size-separator">×</span>
              <div className="brush-list__size-field">
                <label className="brush-list__label" htmlFor={heightId}>
                  H
                </label>
                <NumberInput
                  id={heightId}
                  unstyled
                  className="brush-list__size-input"
                  min={MIN_BRUSH_SIZE}
                  max={MAX_BRUSH_SIZE}
                  value={newHeight}
                  onChange={setNewHeight}
                />
              </div>
            </div>
            {error && (
              <div id={errorId} className="brush-list__error" role="alert">
                {error}
              </div>
            )}
            <div className="brush-list__form-actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={closeForm}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={submit}
                disabled={!canCreate}
              >
                Create
              </button>
            </div>
          </div>
        )}

        {brushes.length === 0 ? (
          <EmptyState className="brush-list__empty">
            No brushes in this project.
          </EmptyState>
        ) : (
          <div className="brush-list__list">
            {brushes.map((brush, index) => (
              <BrushListRow
                key={brush.id}
                brush={brush}
                isSelected={brush.id === selectedBrushId}
                index={index}
                count={brushes.length}
                thumbnailRevision={thumbnailRevision}
                onSelect={onSelect}
                onRename={onRename}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
                onMoveUp={onMoveUp}
                onMoveDown={onMoveDown}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default BrushList;
