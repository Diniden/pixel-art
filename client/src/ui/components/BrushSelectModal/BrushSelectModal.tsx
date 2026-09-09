/**
 * BrushSelectModal — the Header's brush-file chooser (Brush Studio plan,
 * task 13; MASTER D21).
 *
 * The brush counterpart of `ProjectSelectModal`: list / switch / create /
 * rename / delete brush files. Brush files have a size, so the create form
 * carries width and height; and because the Header's inline rename is a
 * project-only affordance, the current brush gets a Rename row here.
 *
 * ── On the `Modal` and `ConfirmDialog` primitives ─────────────────────────
 * `ProjectSelectModal` predates the primitives and hand-rolls its overlay
 * (and uses `window.confirm` for delete). This component adopts them:
 * `Modal` supplies `role="dialog"`, the focus trap, Escape and the
 * mousedown-origin backdrop close; `ConfirmDialog` is the delete
 * confirmation and, because its anchor sits inside the modal's element,
 * Escape there closes only the confirm.
 *
 * The lifecycle callbacks are promise-returning `flow`s from `BrushStore`
 * (task 07), bound by `BrushSelectModalContainer` (task 17). `true` means
 * the operation succeeded; a `false` keeps the modal open with an error.
 *
 * ── Purity ────────────────────────────────────────────────────────────────
 * Imports: React, the `Modal` / `ConfirmDialog` / `NumberInput` /
 * `EmptyState` / `Icon` primitives, `lucide-react` glyphs, the shared brush
 * name validator, and this file's stylesheet. No store, no MobX, no API.
 */
import { useId, useState } from "react";
import { AlertTriangle, Brush, Plus } from "lucide-react";
import { Modal } from "../../primitives/Modal/Modal";
import { ConfirmDialog } from "../../primitives/ConfirmDialog/ConfirmDialog";
import { NumberInput } from "../../primitives/NumberInput/NumberInput";
import { EmptyState } from "../../primitives/EmptyState/EmptyState";
import { Icon } from "../../primitives/Icon/Icon";
import { classNames } from "../../classNames";
import { validateBrushName } from "../BrushLibrary/brushName";
import "./BrushSelectModal.css";

const DEFAULT_BRUSH_SIZE = 16;
const MIN_BRUSH_SIZE = 1;
const MAX_BRUSH_SIZE = 256;

export interface BrushSelectModalProps {
  onClose: () => void;
  /** The loaded brush's file name; `null` when none is loaded. */
  brushName: string | null;
  brushList: ReadonlyArray<string>;
  onSwitchBrush: (name: string) => Promise<boolean>;
  onCreateBrush: (
    name: string,
    width: number,
    height: number,
  ) => Promise<boolean>;
  /** Renames the CURRENT brush. */
  onRenameBrush: (newName: string) => Promise<boolean>;
  /** Deletes the CURRENT brush. */
  onDeleteBrush: () => Promise<boolean>;
  onRefreshBrushList: () => Promise<void>;
  /**
   * Portal target for the modal and its confirm; `document.body` when
   * omitted. Supplied by the Storybook `modalHost` decorator and by tests.
   */
  container?: HTMLElement | null | undefined;
}

export function BrushSelectModal({
  onClose,
  brushName,
  brushList,
  onSwitchBrush,
  onCreateBrush,
  onRenameBrush,
  onDeleteBrush,
  onRefreshBrushList,
  container,
}: BrushSelectModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWidth, setNewWidth] = useState(DEFAULT_BRUSH_SIZE);
  const [newHeight, setNewHeight] = useState(DEFAULT_BRUSH_SIZE);

  const [renameValue, setRenameValue] = useState(brushName ?? "");
  const [renameSeed, setRenameSeed] = useState(brushName);
  // Re-seed the rename field when the current brush changes under us
  // (react.dev: "storing information from previous renders").
  if (brushName !== renameSeed) {
    setRenameSeed(brushName);
    setRenameValue(brushName ?? "");
  }

  const [confirmDelete, setConfirmDelete] = useState(false);

  const ids = useId();
  const newNameId = `${ids}-new-name`;
  const widthId = `${ids}-width`;
  const heightId = `${ids}-height`;
  const renameId = `${ids}-rename`;

  const resetCreateForm = () => {
    setIsCreating(false);
    setNewName("");
    setNewWidth(DEFAULT_BRUSH_SIZE);
    setNewHeight(DEFAULT_BRUSH_SIZE);
    setError(null);
  };

  const handleSwitch = async (name: string) => {
    if (name === brushName) {
      onClose();
      return;
    }
    setIsLoading(true);
    setError(null);
    const ok = await onSwitchBrush(name);
    if (ok) {
      onClose();
    } else {
      setError("Failed to switch brush project");
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    const problem = validateBrushName(newName, brushList);
    if (problem) {
      setError(problem);
      return;
    }
    setIsLoading(true);
    setError(null);
    const ok = await onCreateBrush(newName.trim(), newWidth, newHeight);
    if (ok) {
      onClose();
    } else {
      setError("Failed to create brush project");
      setIsLoading(false);
    }
  };

  const trimmedRename = renameValue.trim();
  const canRename =
    brushName !== null &&
    !isLoading &&
    trimmedRename.length > 0 &&
    trimmedRename !== brushName;

  const handleRename = async () => {
    if (brushName === null) return;
    const problem = validateBrushName(renameValue, brushList, brushName);
    if (problem) {
      setError(problem);
      return;
    }
    setIsLoading(true);
    setError(null);
    const ok = await onRenameBrush(trimmedRename);
    if (!ok) setError("Failed to rename brush project");
    setIsLoading(false);
  };

  const handleDeleteConfirmed = async () => {
    setConfirmDelete(false);
    setIsLoading(true);
    setError(null);
    const ok = await onDeleteBrush();
    if (ok) {
      await onRefreshBrushList();
      onClose();
    } else {
      setError("Failed to delete brush project");
      setIsLoading(false);
    }
  };

  const canCreate = !isLoading && newName.trim().length > 0;

  return (
    <Modal
      title="Brush Projects"
      className="brush-select-modal"
      onClose={onClose}
      container={container}
      footerEnd
      footer={
        <button
          type="button"
          className="btn btn--danger-outline"
          onClick={() => setConfirmDelete(true)}
          disabled={isLoading || brushName === null}
          title={
            brushName === null
              ? "No brush project is loaded"
              : `Delete "${brushName}"`
          }
        >
          Delete Current Brush Project
        </button>
      }
    >
      <p className="brush-select-modal__intro">
        Each brush project is one file holding a whole brush — its layers and
        frames. Switch, create, rename or delete brush project files here.
      </p>

      {error && (
        <div className="brush-select-modal__error" role="alert">
          {error}
        </div>
      )}

      {brushName !== null && (
        <div className="brush-select-modal__rename">
          <label className="brush-select-modal__label" htmlFor={renameId}>
            Current brush project
          </label>
          <div className="brush-select-modal__rename-row">
            <input
              id={renameId}
              type="text"
              className="brush-select-modal__input"
              value={renameValue}
              onChange={(e) => {
                setRenameValue(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canRename) void handleRename();
              }}
              disabled={isLoading}
            />
            <button
              type="button"
              className="btn btn--neutral"
              onClick={() => void handleRename()}
              disabled={!canRename}
            >
              Rename
            </button>
          </div>
        </div>
      )}

      {brushList.length === 0 ? (
        <EmptyState className="brush-select-modal__empty">
          No brush projects yet. Create one to start.
        </EmptyState>
      ) : (
        <div className="brush-select-modal__list">
          {brushList.map((name) => {
            const isCurrent = name === brushName;
            return (
              <button
                key={name}
                type="button"
                className={classNames(
                  "brush-select-modal__item",
                  isCurrent && "brush-select-modal__item--current",
                )}
                aria-current={isCurrent ? "true" : undefined}
                onClick={() => void handleSwitch(name)}
                disabled={isLoading}
              >
                <span className="brush-select-modal__icon">
                  <Icon icon={Brush} size={14} />
                </span>
                <span className="brush-select-modal__name">{name}</span>
                {isCurrent && (
                  <span className="brush-select-modal__badge">Current</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {isCreating ? (
        <div className="brush-select-modal__form">
          <label className="brush-select-modal__label" htmlFor={newNameId}>
            Name
          </label>
          <input
            id={newNameId}
            type="text"
            className="brush-select-modal__input"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void handleCreate();
              } else if (e.key === "Escape") {
                // Escape in the form cancels the FORM, not the modal —
                // `ProjectSelectModal`'s behaviour. Stop it before the
                // dialog's document-level listener sees it.
                e.stopPropagation();
                resetCreateForm();
              }
            }}
            placeholder="Enter brush project name..."
            autoFocus
            disabled={isLoading}
          />
          <div className="brush-select-modal__size-inputs">
            <div className="brush-select-modal__size-field">
              <label className="brush-select-modal__label" htmlFor={widthId}>
                W
              </label>
              <NumberInput
                id={widthId}
                unstyled
                className="brush-select-modal__size-input"
                min={MIN_BRUSH_SIZE}
                max={MAX_BRUSH_SIZE}
                value={newWidth}
                onChange={setNewWidth}
                disabled={isLoading}
              />
            </div>
            <span className="brush-select-modal__size-separator">×</span>
            <div className="brush-select-modal__size-field">
              <label className="brush-select-modal__label" htmlFor={heightId}>
                H
              </label>
              <NumberInput
                id={heightId}
                unstyled
                className="brush-select-modal__size-input"
                min={MIN_BRUSH_SIZE}
                max={MAX_BRUSH_SIZE}
                value={newHeight}
                onChange={setNewHeight}
                disabled={isLoading}
              />
            </div>
          </div>
          <div className="brush-select-modal__form-actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={resetCreateForm}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--gradient"
              onClick={() => void handleCreate()}
              disabled={!canCreate}
            >
              Create
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="brush-select-modal__new-btn"
          onClick={() => setIsCreating(true)}
          disabled={isLoading}
        >
          <span className="brush-select-modal__plus-icon">
            <Icon icon={Plus} size={14} />
          </span>
          New Brush Project
        </button>
      )}

      {confirmDelete && brushName !== null && (
        <ConfirmDialog
          danger
          title={
            <>
              <Icon icon={AlertTriangle} size={14} /> Delete Brush Project
            </>
          }
          message={
            <>
              Are you sure you want to delete <strong>"{brushName}"</strong>?
            </>
          }
          warning="This permanently deletes the brush project file. It cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => void handleDeleteConfirmed()}
          onCancel={() => setConfirmDelete(false)}
          container={container}
        />
      )}
    </Modal>
  );
}

export default BrushSelectModal;
