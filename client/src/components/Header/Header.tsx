import { useState, useRef, useEffect } from 'react';
import { useEditorStore } from '../../store';
import { exportProject } from '../../services/export';
import { ProjectSelectModal } from '../ProjectSelectModal/ProjectSelectModal';
import { ExportPreviewModal } from '../ExportPreviewModal/ExportPreviewModal';
import './Header.css';

export function Header() {
  const { project, projectName, projectList, saveStatus, renameCurrentProject, setAiServiceUrl } = useEditorStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(projectName);
  const [error, setError] = useState<string | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'success' | 'error'>('idle');
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportKebabName, setExportKebabName] = useState<string | null>(null);
  const [showExportPreview, setShowExportPreview] = useState(false);
  const [showAiConfig, setShowAiConfig] = useState(false);
  const [aiUrlInput, setAiUrlInput] = useState(project?.uiState.aiServiceUrl || '');
  const inputRef = useRef<HTMLInputElement>(null);
  const aiConfigRef = useRef<HTMLDivElement>(null);

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
      const result = await exportProject(projectName);
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
          <span className="logo-icon">◆</span>
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
              <span className="edit-hint">✎</span>
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
            className={`ai-config-btn ${project?.uiState.aiServiceUrl ? 'configured' : ''}`}
            onClick={() => {
              setAiUrlInput(project?.uiState.aiServiceUrl || '');
              setShowAiConfig(!showAiConfig);
            }}
            title="AI Service Settings"
          >
            <span className="ai-icon">✦</span>
            AI
          </button>
          {showAiConfig && (
            <div className="ai-config-popover">
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
                    } else if (e.key === 'Escape') {
                      setShowAiConfig(false);
                    }
                  }}
                  placeholder="http://192.168.1.100:8100"
                  autoFocus
                />
                <button
                  className="ai-config-save-btn"
                  onClick={() => {
                    setAiServiceUrl(aiUrlInput.trim());
                    setShowAiConfig(false);
                  }}
                >
                  Save
                </button>
              </div>
              <span className="ai-config-hint">
                {project?.uiState.aiServiceUrl ? 'Connected' : 'Not configured'}
              </span>
            </div>
          )}
        </div>
        <button className="switch-project-btn" onClick={() => setShowProjectModal(true)} title="Switch Projects">
          <span className="folder-icon">📁</span>
          Projects
        </button>
        <button
          className="export-btn"
          onClick={handleExport}
          disabled={exportStatus === 'exporting'}
          title={exportMessage ?? 'Export project to server folder'}
        >
          <span className="export-icon">↗</span>
          {exportStatus === 'exporting' ? 'Exporting...' : 'Export'}
        </button>
        {exportStatus !== 'idle' && exportMessage && (
          <span className={`export-status export-status-${exportStatus}`}>{exportMessage}</span>
        )}
      </div>

      {showProjectModal && (
        <ProjectSelectModal onClose={() => setShowProjectModal(false)} />
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
