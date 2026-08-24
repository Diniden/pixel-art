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
import { Icon } from "../../primitives/Icon/Icon";
import { THEMES, type ThemeId } from "../../theme/themes";
import {
  Diamond,
  History,
  FolderOpen,
  ExternalLink,
  PenLine,
} from "lucide-react";
import "./Header.css";

/** Save-state indicator. Mirrors `SaveStatus` without importing the store. */
export type HeaderSaveStatus = "idle" | "saving" | "saved" | "error";

/** The theme registry, shaped for the Dropdown primitive. */
const THEME_OPTIONS = THEMES.map((t) => ({ value: t.id, label: t.label }));

export interface HeaderProps {
  /** From SessionStore via HeaderContainer (task 14). Header is its sole reader. */
  saveStatus: HeaderSaveStatus;
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

  /** Active UI theme — the dropdown beside the AI button switches it. */
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;

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

  const getStatusText = () => {
    switch (saveStatus) {
      case "saving":
        return "Saving...";
      case "saved":
        return "Saved";
      case "error":
        return "Save failed";
      default:
        return "";
    }
  };

  const getStatusClass = () => {
    switch (saveStatus) {
      case "saving":
        return "header__save-status--saving";
      case "saved":
        return "header__save-status--saved";
      case "error":
        return "header__save-status--error";
      default:
        return "";
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
        </div>

        {saveStatus !== "idle" && (
          <div className={`header__save-status ${getStatusClass()}`}>
            <span className="header__status-dot"></span>
            {getStatusText()}
          </div>
        )}
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
          />
        </div>
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
