import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditorStore } from '../../store';
import type { SaveStatus } from '../../store/storeTypes';
import { aiApi, exportApi } from '../../api';
import { ProjectSelectModal } from '../ProjectSelectModal/ProjectSelectModal';
import { ExportPreviewModal } from '../ExportPreviewModal/ExportPreviewModal';
import { BrowseBackupsModal } from '../BrowseBackupsModal/BrowseBackupsModal';
import { Icon } from '../Icon/Icon';
import { Diamond, Wand2, History, FolderOpen, ExternalLink, PenLine } from 'lucide-react';
import './Header.css';

export interface HeaderProps {
  /** From SessionStore via HeaderContainer (task 14). Header is its sole reader. */
  saveStatus: SaveStatus;
  /** From SessionStore via HeaderContainer (task 14) — the single read source. */
  aiServiceUrl: string | null;
}

export function Header({ saveStatus, aiServiceUrl }: HeaderProps) {
  // Everything below stays on Zustand for now — the full Header purification
  // is a later task. `setAiServiceUrl` still WRITES through the Zustand store
  // (Phase A: Zustand is the source of truth; the bridge mirrors it back into
  // SessionStore, which re-renders the container).
  const { projectName, projectList, renameCurrentProject, setAiServiceUrl } = useEditorStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(projectName);
  const [error, setError] = useState<string | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'success' | 'error'>('idle');
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportKebabName, setExportKebabName] = useState<string | null>(null);
  const [showExportPreview, setShowExportPreview] = useState(false);
  const [showBackupsModal, setShowBackupsModal] = useState(false);
  const [showAiConfig, setShowAiConfig] = useState(false);
  const [aiUrlInput, setAiUrlInput] = useState(aiServiceUrl || '');
  const [aiHealthStatus, setAiHealthStatus] = useState<'unknown' | 'ok' | 'error'>('unknown');
  const [aiHealthDetail, setAiHealthDetail] = useState<string | null>(null);
  // `null` = the server default is UNKNOWN (the request failed or has not
  // resolved). Task 15: the API layer no longer fabricates
  // `http://localhost:8100` when the server is down, so the UI must say
  // "unknown" instead of presenting an invented URL as "the server default".
  const [serverDefaultUrl, setServerDefaultUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const aiConfigRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    aiApi
      .getConfig(controller.signal)
      .then((cfg) => {
        setServerDefaultUrl(cfg.effectiveAiServiceUrl || null);
      })
      .catch(() => {
        // Explicit unknown state — never a fabricated default.
        setServerDefaultUrl(null);
      });
    return () => controller.abort();
  }, []);

  const pollAiHealth = useCallback(() => {
    const url = aiServiceUrl || undefined;
    aiApi
      .health(url)
      .then((result) => {
        if (result.status === 'ok' && result.remote_configured === false) {
          // The health that can lie: the proxy is up but has no remote AI
          // service configured, so every job would fail. Not "Connected".
          setAiHealthStatus('error');
          setAiHealthDetail(
            'AI proxy is running but no remote service is configured (AI_REMOTE_URL unset)',
          );
        } else if (result.status === 'ok') {
          setAiHealthStatus('ok');
          setAiHealthDetail(null);
        } else {
          setAiHealthStatus('error');
          setAiHealthDetail(result.detail || 'AI service is not reachable');
        }
      })
      .catch((err: unknown) => {
        // A THROW here means the Express server itself is unreachable
        // (health always answers HTTP 200 when the server is up).
        setAiHealthStatus('error');
        setAiHealthDetail(
          err instanceof Error ? err.message : 'Cannot reach the server',
        );
      });
  }, [aiServiceUrl]);

  useEffect(() => {
    pollAiHealth();
    const interval = setInterval(pollAiHealth, 15_000);
    return () => clearInterval(interval);
  }, [pollAiHealth]);

  useEffect(() => {
    if (!showAiConfig) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (aiConfigRef.current && !aiConfigRef.current.contains(e.target as Node)) {
        setShowAiConfig(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAiConfig(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showAiConfig]);

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
    setExportStatus('exporting');
    setExportMessage(null);
    try {
      const result = await exportApi.run(projectName);
      setExportStatus('success');
      setExportMessage(`Exported to ${result.path}`);
      setExportKebabName(result.kebabName);
      setShowExportPreview(true);
      setTimeout(() => {
        setExportStatus('idle');
        setExportMessage(null);
      }, 3000);
    } catch (err) {
      setExportStatus('error');
      setExportMessage(err instanceof Error ? err.message : 'Export failed');
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
      setError('Project name cannot be empty');
      return;
    }

    if (!/^[a-zA-Z0-9\s\-_]+$/.test(trimmedName)) {
      setError('Invalid characters in name');
      return;
    }

    if (trimmedName === projectName) {
      setIsEditing(false);
      return;
    }

    if (projectList.includes(trimmedName)) {
      setError('Name already exists');
      return;
    }

    const success = await renameCurrentProject(trimmedName);
    if (success) {
      setIsEditing(false);
      setError(null);
    } else {
      setError('Failed to rename');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const getStatusText = () => {
    switch (saveStatus) {
      case 'saving': return 'Saving...';
      case 'saved': return 'Saved';
      case 'error': return 'Save failed';
      default: return '';
    }
  };

  const getStatusClass = () => {
    switch (saveStatus) {
      case 'saving': return 'status-saving';
      case 'saved': return 'status-saved';
      case 'error': return 'status-error';
      default: return '';
    }
  };

  return (
    <header className="header">
      <div className="header-left">
        <div className="logo">
          <span className="logo-icon"><Icon icon={Diamond} size={16} /></span>
          <span className="logo-text">Pixel Studio</span>
        </div>
      </div>

      <div className="header-center">
        <div className="project-title-container">
          {isEditing ? (
            <div className="project-edit-wrapper">
              <input
                ref={inputRef}
                type="text"
                className={`project-title-input ${error ? 'has-error' : ''}`}
                value={editValue}
                onChange={(e) => {
                  setEditValue(e.target.value);
                  setError(null);
                }}
                onBlur={handleSaveEdit}
                onKeyDown={handleKeyDown}
                placeholder="Project name..."
              />
              {error && <span className="edit-error">{error}</span>}
            </div>
          ) : (
            <button className="project-title-btn" onClick={handleStartEdit} title="Click to rename project">
              <span className="project-name">{projectName}</span>
              <span className="edit-hint"><Icon icon={PenLine} size={12} /></span>
            </button>
          )}
        </div>

        {saveStatus !== 'idle' && (
          <div className={`save-status ${getStatusClass()}`}>
            <span className="status-dot"></span>
            {getStatusText()}
          </div>
        )}
      </div>

      <div className="header-right">
        <div className="ai-config-wrapper" ref={aiConfigRef}>
          <button
            className={`ai-config-btn ${aiHealthStatus === 'error' ? 'ai-error' : aiHealthStatus === 'ok' ? 'configured' : ''}`}
            onClick={() => {
              setAiUrlInput(aiServiceUrl || serverDefaultUrl || '');
              setShowAiConfig(!showAiConfig);
            }}
            title={aiHealthStatus === 'error' ? `AI Error: ${aiHealthDetail}` : 'AI Service Settings'}
          >
            <span className="ai-icon"><Icon icon={Wand2} size={14} /></span>
            AI
          </button>
          {showAiConfig && (
            <div className="ai-config-popover">
              {aiHealthStatus === 'error' && aiHealthDetail && (
                <div className="ai-config-error">{aiHealthDetail}</div>
              )}
              <label className="ai-config-label">AI Service URL</label>
              <div className="ai-config-row">
                <input
                  type="text"
                  className="ai-config-input"
                  value={aiUrlInput}
                  onChange={(e) => setAiUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setAiServiceUrl(aiUrlInput.trim());
                      setShowAiConfig(false);
                      setTimeout(pollAiHealth, 500);
                    } else if (e.key === 'Escape') {
                      setShowAiConfig(false);
                    }
                  }}
                  placeholder={serverDefaultUrl ?? 'Server default unavailable'}
                  autoFocus
                />
                <button
                  className="ai-config-save-btn"
                  onClick={() => {
                    setAiServiceUrl(aiUrlInput.trim());
                    setShowAiConfig(false);
                    setTimeout(pollAiHealth, 500);
                  }}
                >
                  Save
                </button>
              </div>
              <span className="ai-config-hint">
                {aiHealthStatus === 'ok' ? `Connected to ${aiServiceUrl || serverDefaultUrl}` :
                 aiHealthStatus === 'error' ? 'Service has errors' :
                 aiServiceUrl ||
                   (serverDefaultUrl
                     ? `Using default: ${serverDefaultUrl}`
                     : 'Server default unknown — is the server running?')}
              </span>
            </div>
          )}
        </div>
        <button className="browse-backups-btn" onClick={() => setShowBackupsModal(true)} title="Browse Backups">
          <span className="backups-icon"><Icon icon={History} size={14} /></span>
          Backups
        </button>
        <button className="switch-project-btn" onClick={() => setShowProjectModal(true)} title="Switch Projects">
          <span className="folder-icon"><Icon icon={FolderOpen} size={14} /></span>
          Projects
        </button>
        <button
          className="export-btn"
          onClick={handleExport}
          disabled={exportStatus === 'exporting'}
          title={exportMessage ?? 'Export project to server folder'}
        >
          <span className="export-icon"><Icon icon={ExternalLink} size={14} /></span>
          {exportStatus === 'exporting' ? 'Exporting...' : 'Export'}
        </button>
        {exportStatus !== 'idle' && exportMessage && (
          <span className={`export-status export-status-${exportStatus}`}>{exportMessage}</span>
        )}
      </div>

      {showProjectModal && (
        <ProjectSelectModal onClose={() => setShowProjectModal(false)} />
      )}

      {showBackupsModal && (
        <BrowseBackupsModal onClose={() => setShowBackupsModal(false)} />
      )}

      {exportKebabName && (
        <ExportPreviewModal
          isOpen={showExportPreview}
          onClose={() => setShowExportPreview(false)}
          kebabName={exportKebabName}
        />
      )}
    </header>
  );
}
