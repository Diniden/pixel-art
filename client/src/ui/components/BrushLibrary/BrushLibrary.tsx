/**
 * BrushLibrary — the left-rail brush selector (Brush Studio plan, task 13;
 * MASTER D16).
 *
 * The brush counterpart of `ObjectLibrary`: a `panel` listing brush FILE
 * names with the current one highlighted, plus an inline create form
 * (name, width, height) behind the header's `+`.
 *
 * ── Only the loaded brush has data ────────────────────────────────────────
 * The rail lists file names; only the CURRENT brush is in memory. So exactly
 * one row can carry a thumbnail and a `W×H` badge, and it arrives as
 * `thumbnailDraw` + `thumbnailRevision` (the `ThumbnailCanvas` contract —
 * the container paints, this component never sees a grid) and
 * `currentSize`. Every other row is name-only.
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 * Imports: React hooks, the `ThumbnailCanvas` / `NumberInput` / `EmptyState`
 * primitives, the shared name validator, and this file's stylesheet. No
 * store, no MobX, no API, no brush type.
 */
import { useId, useState } from "react";
import { ThumbnailCanvas } from "../../primitives/ThumbnailCanvas/ThumbnailCanvas";
import { NumberInput } from "../../primitives/NumberInput/NumberInput";
import { EmptyState } from "../../primitives/EmptyState/EmptyState";
import { classNames } from "../../classNames";
import { validateBrushName } from "./brushName";
import "./BrushLibrary.css";

/** Thumbnail edge in px — the same 32 as `ObjectLibrary`'s rows. */
export const BRUSH_THUMB_SIZE = 32;

const DEFAULT_BRUSH_SIZE = 16;
const MIN_BRUSH_SIZE = 1;
const MAX_BRUSH_SIZE = 256;

export interface BrushLibraryProps {
  /** Sorted brush file names. */
  brushes: ReadonlyArray<string>;
  currentBrush: string | null;
  /** Size of the loaded brush; `null` when nothing is loaded. */
  currentSize: { width: number; height: number } | null;
  /** Paints the loaded brush's thumbnail. `null` when nothing is loaded. */
  thumbnailDraw: ((ctx: CanvasRenderingContext2D, size: number) => void) | null;
  /** Changes exactly when the loaded brush's pixels change. */
  thumbnailRevision: number;
  /** A lifecycle flow is in flight — selection and creation are disabled. */
  isLoading: boolean;
  onSelectBrush: (name: string) => void;
  onCreateBrush: (name: string, width: number, height: number) => void;
}

export function BrushLibrary({
  brushes,
  currentBrush,
  currentSize,
  thumbnailDraw,
  thumbnailRevision,
  isLoading,
  onSelectBrush,
  onCreateBrush,
}: BrushLibraryProps) {
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
    if (isLoading) return;
    const problem = validateBrushName(newName, brushes);
    if (problem) {
      setError(problem);
      return;
    }
    onCreateBrush(newName.trim(), newWidth, newHeight);
    closeForm();
  };

  const canCreate = !isLoading && newName.trim().length > 0;

  return (
    <div
      className={classNames(
        "panel brush-library",
        isLoading && "brush-library--loading",
      )}
    >
      <div className="panel__header">
        Brush Projects
        <div className="brush-library__header-actions">
          {isLoading && (
            <span className="brush-library__status" aria-live="polite">
              Loading…
            </span>
          )}
          <button
            type="button"
            className={classNames(
              "brush-library__header-btn",
              showNewForm && "brush-library__header-btn--active",
            )}
            onClick={() => (showNewForm ? closeForm() : setShowNewForm(true))}
            title="New Brush Project"
            aria-label="New Brush Project"
            aria-expanded={showNewForm}
          >
            +
          </button>
        </div>
      </div>

      <div className="panel__body">
        {showNewForm && (
          <div className="brush-library__new-form">
            <label className="brush-library__label" htmlFor={nameId}>
              Name
            </label>
            <input
              id={nameId}
              type="text"
              className="brush-library__name-input"
              placeholder="Brush project name..."
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
              disabled={isLoading}
            />
            <div className="brush-library__size-inputs">
              <div className="brush-library__size-field">
                <label className="brush-library__label" htmlFor={widthId}>
                  W
                </label>
                <NumberInput
                  id={widthId}
                  unstyled
                  className="brush-library__size-input"
                  min={MIN_BRUSH_SIZE}
                  max={MAX_BRUSH_SIZE}
                  value={newWidth}
                  onChange={setNewWidth}
                  disabled={isLoading}
                />
              </div>
              <span className="brush-library__size-separator">×</span>
              <div className="brush-library__size-field">
                <label className="brush-library__label" htmlFor={heightId}>
                  H
                </label>
                <NumberInput
                  id={heightId}
                  unstyled
                  className="brush-library__size-input"
                  min={MIN_BRUSH_SIZE}
                  max={MAX_BRUSH_SIZE}
                  value={newHeight}
                  onChange={setNewHeight}
                  disabled={isLoading}
                />
              </div>
            </div>
            {error && (
              <div id={errorId} className="brush-library__error" role="alert">
                {error}
              </div>
            )}
            <div className="brush-library__form-actions">
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
          <EmptyState className="brush-library__empty">
            No brush projects yet. Create one to start.
          </EmptyState>
        ) : (
          <div className="brush-library__list">
            {brushes.map((name) => {
              const isCurrent = name === currentBrush;
              return (
                <button
                  key={name}
                  type="button"
                  className={classNames(
                    "brush-library__item",
                    isCurrent && "brush-library__item--current",
                  )}
                  aria-current={isCurrent ? "true" : undefined}
                  onClick={() => onSelectBrush(name)}
                  disabled={isLoading}
                  title={name}
                >
                  {isCurrent && thumbnailDraw && (
                    <span className="brush-library__thumb">
                      <ThumbnailCanvas
                        size={BRUSH_THUMB_SIZE}
                        revision={thumbnailRevision}
                        draw={thumbnailDraw}
                        label={`${name} preview`}
                        className="brush-library__thumb-canvas"
                      />
                    </span>
                  )}
                  <span className="brush-library__name">{name}</span>
                  {isCurrent && currentSize && (
                    <span className="brush-library__size">
                      {currentSize.width}×{currentSize.height}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default BrushLibrary;
