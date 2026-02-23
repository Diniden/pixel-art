import { useState } from 'react';
import { useEditorStore } from '../../store';
import './ProjectSelectModal.css';

interface ProjectSelectModalProps {
  onClose: () => void;
}

export function ProjectSelectModal({ onClose }: ProjectSelectModalProps) {
  const { projectList, projectName, switchToProject, createNewProject, deleteCurrentProject, refreshProjectList } = useEditorStore();
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSwitchProject = async (name: string) => {
    if (name === projectName) {
      onClose();
      return;
    }

    setIsLoading(true);
    setError(null);

    const success = await switchToProject(name);
    if (success) {
      onClose();
    } else {
      setError('Failed to switch project');
      setIsLoading(false);
    }
  };

  const handleCreateProject = async () => {
    const trimmedName = newProjectName.trim();

    if (!trimmedName) {
      setError('Project name cannot be empty');
      return;
    }

    if (!/^[a-zA-Z0-9\s\-_]+$/.test(trimmedName)) {
      setError('Project name can only contain letters, numbers, spaces, hyphens, and underscores');
      return;
    }

    if (projectList.includes(trimmedName)) {
      setError('A project with that name already exists');
      return;
    }

    setIsLoading(true);
    setError(null);

    const success = await createNewProject(trimmedName);
    if (success) {
      onClose();
    } else {
      setError('Failed to create project');
      setIsLoading(false);
    }
  };

  const handleDeleteProject = async () => {
    if (projectList.length <= 1) {
      setError('Cannot delete the last project');
      return;
    }

    if (!confirm(`Are you sure you want to delete "${projectName}"? This cannot be undone.`)) {
      return;
    }

    setIsLoading(true);
    setError(null);

    const success = await deleteCurrentProject();
    if (success) {
      await refreshProjectList();
      onClose();
    } else {
      setError('Failed to delete project');
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isCreating) {
      handleCreateProject();
    } else if (e.key === 'Escape') {
      if (isCreating) {
        setIsCreating(false);
        setNewProjectName('');
        setError(null);
      } else {
        onClose();
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="project-select-modal" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="modal-header">
          <h2>Switch Project</h2>
          <button className="close-btn" onClick={onClose} disabled={isLoading}>×</button>
        </div>

        {error && (
          <div className="error-message">{error}</div>
        )}

        <div className="modal-content">
          <div className="project-list">
            {projectList.map((name) => (
              <button
                key={name}
                className={`project-item ${name === projectName ? 'current' : ''}`}
                onClick={() => handleSwitchProject(name)}
                disabled={isLoading}
              >
                <span className="project-icon">📁</span>
                <span className="project-name">{name}</span>
                {name === projectName && <span className="current-badge">Current</span>}
              </button>
            ))}
          </div>

          {isCreating ? (
            <div className="create-project-form">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Enter project name..."
                autoFocus
                disabled={isLoading}
              />
              <div className="form-buttons">
                <button
                  className="cancel-btn"
                  onClick={() => {
                    setIsCreating(false);
                    setNewProjectName('');
                    setError(null);
                  }}
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  className="create-btn"
                  onClick={handleCreateProject}
                  disabled={isLoading || !newProjectName.trim()}
                >
                  Create
                </button>
              </div>
            </div>
          ) : (
            <button
              className="new-project-btn"
              onClick={() => setIsCreating(true)}
              disabled={isLoading}
            >
              <span className="plus-icon">+</span>
              New Project
            </button>
          )}
        </div>

        <div className="modal-footer">
          <button
            className="delete-btn"
            onClick={handleDeleteProject}
            disabled={isLoading || projectList.length <= 1}
            title={projectList.length <= 1 ? 'Cannot delete the last project' : `Delete "${projectName}"`}
          >
            Delete Current Project
          </button>
        </div>
      </div>
    </div>
  );
}

