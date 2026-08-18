import { useState } from 'react';
import { Icon } from '../../ui/primitives/Icon/Icon';
import { FolderOpen, Plus, X } from 'lucide-react';
import './ProjectSelectModal.css';

interface ProjectSelectModalProps {
  onClose: () => void;
  /** From DomainStore via ProjectSelectModalContainer (REFRESH task 23). */
  projectName: string;
  projectList: string[];
  /** The four DomainStore lifecycle flows, as promise-returning callbacks. */
  onSwitchProject: (name: string) => Promise<boolean>;
  onCreateProject: (name: string) => Promise<boolean>;
  onDeleteProject: () => Promise<boolean>;
  onRefreshProjectList: () => Promise<void>;
}

export function ProjectSelectModal({
  onClose,
  projectName,
  projectList,
  onSwitchProject,
  onCreateProject,
  onDeleteProject,
  onRefreshProjectList,
}: ProjectSelectModalProps) {
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

    const success = await onSwitchProject(name);
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

    const success = await onCreateProject(trimmedName);
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

    const success = await onDeleteProject();
    if (success) {
      await onRefreshProjectList();
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
    <div className="modal__overlay" onClick={onClose}>
      <div className="modal project-select-modal" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="modal__header">
          <h2>Switch Project</h2>
          <button className="modal__close" onClick={onClose} disabled={isLoading}><Icon icon={X} size={14} /></button>
        </div>

        {error && (
          <div className="project-select-modal__error">{error}</div>
        )}

        <div className="modal__body">
          <div className="project-select-modal__list">
            {projectList.map((name) => (
              <button
                key={name}
                className={`project-select-modal__item ${name === projectName ? 'project-select-modal__item--current' : ''}`}
                onClick={() => handleSwitchProject(name)}
                disabled={isLoading}
              >
                <span className="project-select-modal__icon"><Icon icon={FolderOpen} size={14} /></span>
                <span className="project-select-modal__name">{name}</span>
                {name === projectName && <span className="project-select-modal__badge--current">Current</span>}
              </button>
            ))}
          </div>

          {isCreating ? (
            <div className="project-select-modal__form">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Enter project name..."
                autoFocus
                disabled={isLoading}
              />
              <div className="project-select-modal__form-actions">
                <button
                  className="btn btn--ghost"
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
                  className="btn btn--gradient"
                  onClick={handleCreateProject}
                  disabled={isLoading || !newProjectName.trim()}
                >
                  Create
                </button>
              </div>
            </div>
          ) : (
            <button
              className="project-select-modal__new-btn"
              onClick={() => setIsCreating(true)}
              disabled={isLoading}
            >
              <span className="project-select-modal__plus-icon"><Icon icon={Plus} size={14} /></span>
              New Project
            </button>
          )}
        </div>

        <div className="modal__footer modal__footer--end">
          <button
            className="btn btn--danger-outline"
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

