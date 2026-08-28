/**
 * Header — PURE (REFRESH task 36, W27).
 *
 * The AI-config popover was EXTRACTED first, as the spec's step 3 requires:
 * it now lives in `ui/components/AiConfigPopover/` and owns its own
 * outside-click/Escape handling. That removed 5 of this file's 14 `useState`
 * calls and both of its API-driven effects.
 *
 * ── The two runtime-concatenated class families ───────────────────────────
 *
 * The spec flags both, and `check-classes.mjs` CANNOT see either (it does not
 * evaluate interpolation), so both were verified by grepping the bare names:
 *
 *   1. `header__save-status--{saving,saved,error}` — built by `getStatusClass`
 *      below. All three are declared in `Header.css`. UNCHANGED by this task.
 *   2. `header__ai-btn--{error,configured}` — moved WITH the markup into
 *      `AiConfigPopover`, which keeps the `header__ai-*` names rather than
 *      re-cutting them into a new block (BEM names are final since W13/W14).
 *
 * Both status indicators are manual check 4.
 *
 * ── Injected containers ───────────────────────────────────────────────────
 *
 * The three modals are containers, so they arrive as ELEMENT props rather
 * than imports — `ui/` may not import a container without pulling MobX across
 * the purity boundary transitively.
 */
import { useState, useRef, useEffect, type ReactNode } from "react";
import {
  AiConfigPopover,
  type AiHealthStatus,
} from "../AiConfigPopover/AiConfigPopover";
import { Dropdown } from "../../primitives/Dropdown/Dropdown";
import { SaveStatusDot } from "../SaveStatusDot/SaveStatusDot";
import { Icon } from "../../primitives/Icon/Icon";
import { THEMES, type ThemeId } from "../../theme/themes";
import {
  Diamond,
  History,
  FolderOpen,
  ExternalLink,
  PenLine,
  LayoutDashboard as LayoutIcon,
} from "lucide-react";
import "./Header.css";

/** Save-state indicator. Mirrors `SaveStatus` without importing the store. */
export type HeaderSaveStatus =
  | "idle"
  | "pending"
  | "saving"
  | "saved"
  | "error";

/** The theme registry, shaped for the Dropdown primitive. */
const THEME_OPTIONS = THEMES.map((t) => ({ value: t.id, label: t.label }));

export interface HeaderProps {
  /** From SessionStore via HeaderContainer (task 14). Header is its sole reader. */
  saveStatus: HeaderSaveStatus;
  /** Failure detail for the status dot's popover, when there is one. */
  saveErrorDetail?: string | null;
  /** Saving paused for a rename / switch / delete — explains a still dot. */
  saveSuspended?: boolean;
  /** From SessionStore via HeaderContainer (task 14) — the single read source. */
  aiServiceUrl: string | null;
  /** Current project name, shown and renamed inline. */
  projectName: string;
  /** All project names — used to reject a duplicate rename. */
  projectList: string[];
  /** Commits a rename. Resolves false when the server refuses. */
  onRenameProject: (name: string) => Promise<boolean>;

  /** AI health, polled by the container. */
  aiHealthStatus: AiHealthStatus;
  aiHealthDetail: string | null;
  /** Server's effective default URL, or null when UNKNOWN (never invented). */
  serverDefaultUrl: string | null;
  /** Commits a new AI service URL and re-polls health. */
  onSaveAiServiceUrl: (url: string) => void;

  /**
   * Active UI theme — the dropdown beside the AI button switches it.
   *
   * ⚠️ As of 2026-08-25 this is PROJECT state, not a device preference: it
   * is persisted in `uiState.theme` and follows the project onto every
   * machine that opens it. The prop shape is unchanged; only its owner moved.
   */
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;

  /**
   * Layout mode — the scrim over each rail with its move/resize controls.
   * The button is a toggle and reads as pressed while the mode is on, so it
   * is obvious how to get back out of it.
   */
  layoutMode: boolean;
  onToggleLayoutMode: () => void;

  /** Runs the export. Resolves with the path and kebab name on success. */
  onExport: () => Promise<{ path: string; kebabName: string }>;

  /** `ProjectSelectModalContainer`, rendered when open. */
  projectModal: (props: { onClose: () => void }) => ReactNode;
  /** `BrowseBackupsModalContainer`, rendered when open. */
  backupsModal: (props: { onClose: () => void }) => ReactNode;
  /** `ExportPreviewModalContainer`, rendered after a successful export. */
  exportPreviewModal: (props: {
    isOpen: boolean;
    onClose: () => void;
    kebabName: string;
  }) => ReactNode;
}

export function Header({
  saveStatus,
  saveErrorDetail,
  saveSuspended,
  aiServiceUrl,
  projectName,
  projectList,
  onRenameProject,
  aiHealthStatus,
  aiHealthDetail,
  serverDefaultUrl,
  onSaveAiServiceUrl,
  theme,
  onThemeChange,
  layoutMode,
  onToggleLayoutMode,
  onExport,
  projectModal,
  backupsModal,
  exportPreviewModal,
}: HeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(projectName);
  const [error, setError] = useState<string | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [exportStatus, setExportStatus] = useState<
    "idle" | "exporting" | "success" | "error"
  >("idle");
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportKebabName, setExportKebabName] = useState<string | null>(null);
  const [showExportPreview, setShowExportPreview] = useState(false);
  const [showBackupsModal, setShowBackupsModal] = useState(false);
  const [showAiConfig, setShowAiConfig] = useState(false);
  const [aiUrlInput, setAiUrlInput] = useState(aiServiceUrl || "");
  const inputRef = useRef<HTMLInputElement>(null);

  // Update editValue when projectName changes
  useEffect(() => {
    setEditValue(projectName);
  }, [projectName]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleExport = async () => {
    if (!projectName) return;
    setExportStatus("exporting");
    setExportMessage(null);
    try {
      // Task 36: the `exportApi.run` call moved to the container; the
      // status/message/timeout choreography stays here because it is this
      // component's own view state.
      const result = await onExport();
      setExportStatus("success");
      setExportMessage(`Exported to ${result.path}`);
      setExportKebabName(result.kebabName);
      setShowExportPreview(true);
      setTimeout(() => {
        setExportStatus("idle");
        setExportMessage(null);
      }, 3000);
    } catch (err) {
      setExportStatus("error");
      setExportMessage(err instanceof Error ? err.message : "Export failed");
      setTimeout(() => {
        setExportStatus("idle");
        setExportMessage(null);
      }, 5000);
    }
  };

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditValue(projectName);
    setError(null);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditValue(projectName);
    setError(null);
  };

  const handleSaveEdit = async () => {
    const trimmedName = editValue.trim();

    if (!trimmedName) {
      setError("Project name cannot be empty");
      return;
    }

    if (!/^[a-zA-Z0-9\s\-_]+$/.test(trimmedName)) {
      setError("Invalid characters in name");
      return;
    }

    if (trimmedName === projectName) {
      setIsEditing(false);
      return;
    }

    if (projectList.includes(trimmedName)) {
      setError("Name already exists");
      return;
    }

    const success = await onRenameProject(trimmedName);
    if (success) {
      setIsEditing(false);
      setError(null);
    } else {
      setError("Failed to rename");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveEdit();
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  return (
    <header className="header">
      <div className="header__left">
        <div className="header__logo">
          <span className="header__logo-icon">
            <Icon icon={Diamond} size={16} />
          </span>
          <span className="header__logo-text">Pixel Studio</span>
        </div>
      </div>

      <div className="header__center">
        <div className="header__project-group">
          {isEditing ? (
            <div className="header__project-edit">
              <input
                ref={inputRef}
                type="text"
                className={`header__project-input ${error ? "header__project-input--error" : ""}`}
                value={editValue}
                onChange={(e) => {
                  setEditValue(e.target.value);
                  setError(null);
                }}
                onBlur={handleSaveEdit}
                onKeyDown={handleKeyDown}
                placeholder="Project name..."
              />
              {error && <span className="header__edit-error">{error}</span>}
            </div>
          ) : (
            <button
              className="header__project-btn"
              onClick={handleStartEdit}
              title="Click to rename project"
            >
              <span className="header__project-name">{projectName}</span>
              <span className="header__edit-hint">
                <Icon icon={PenLine} size={12} />
              </span>
            </button>
          )}
          {/* ⚠️ Beside the TITLE, inside the project group — the dot is
              about this project, and grouping it with the name says so.
              It is always rendered: a control that vanishes when idle is one
              the user cannot consult to confirm their work is safe. */}
          <SaveStatusDot
            status={saveStatus}
            errorDetail={saveErrorDetail}
            suspended={saveSuspended}
          />
        </div>
      </div>

      <div className="header__right">
        <AiConfigPopover
          isOpen={showAiConfig}
          onOpenChange={(open) => {
            // Re-seed the draft from the effective URL each time it opens,
            // exactly as the inline version did.
            if (open) setAiUrlInput(aiServiceUrl || serverDefaultUrl || "");
            setShowAiConfig(open);
          }}
          aiHealthStatus={aiHealthStatus}
          aiHealthDetail={aiHealthDetail}
          aiServiceUrl={aiServiceUrl}
          serverDefaultUrl={serverDefaultUrl}
          urlInput={aiUrlInput}
          onUrlInputChange={setAiUrlInput}
          onSave={() => {
            onSaveAiServiceUrl(aiUrlInput.trim());
            setShowAiConfig(false);
          }}
        />
        <div className="header__theme" title="UI theme">
          <Dropdown
            options={THEME_OPTIONS}
            value={theme}
            onChange={onThemeChange}
            label="UI theme"
            triggerLabel="Theme"
          />
        </div>
        <button
          className={`header__layout-btn ${
            layoutMode ? "header__layout-btn--active" : ""
          }`}
          onClick={onToggleLayoutMode}
          aria-pressed={layoutMode}
          title={
            layoutMode
              ? "Done arranging panels"
              : "Move and resize the side and bottom panels"
          }
        >
          <span className="header__layout-icon">
            <Icon icon={LayoutIcon} size={14} />
          </span>
          {layoutMode ? "Done" : "Layout"}
        </button>
        <button
          className="header__backups-btn"
          onClick={() => setShowBackupsModal(true)}
          title="Browse Backups"
        >
          <span className="header__backups-icon">
            <Icon icon={History} size={14} />
          </span>
          Backups
        </button>
        <button
          className="header__switch-btn"
          onClick={() => setShowProjectModal(true)}
          title="Switch Projects"
        >
          <span className="header__folder-icon">
            <Icon icon={FolderOpen} size={14} />
          </span>
          Projects
        </button>
        <button
          className="header__export-btn"
          onClick={handleExport}
          disabled={exportStatus === "exporting"}
          title={exportMessage ?? "Export project to server folder"}
        >
          <span className="header__export-icon">
            <Icon icon={ExternalLink} size={14} />
          </span>
          {exportStatus === "exporting" ? "Exporting..." : "Export"}
        </button>
        {exportStatus !== "idle" && exportMessage && (
          <span
            className={`header__export-status header__export-status--${exportStatus}`}
          >
            {exportMessage}
          </span>
        )}
      </div>

      {showProjectModal &&
        projectModal({ onClose: () => setShowProjectModal(false) })}

      {showBackupsModal &&
        backupsModal({ onClose: () => setShowBackupsModal(false) })}

      {exportKebabName &&
        exportPreviewModal({
          isOpen: showExportPreview,
          onClose: () => setShowExportPreview(false),
          kebabName: exportKebabName,
        })}
    </header>
  );
}
