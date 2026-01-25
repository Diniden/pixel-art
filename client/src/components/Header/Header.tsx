import { useEditorStore } from '../../store';
import { exportProject } from '../../services/export';
import './Header.css';

export function Header() {
  const { project, saveStatus } = useEditorStore();

  const handleExport = () => {
    if (project) {
      exportProject(project);
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
        {saveStatus !== 'idle' && (
          <div className={`save-status ${getStatusClass()}`}>
            <span className="status-dot"></span>
            {getStatusText()}
          </div>
        )}
      </div>

      <div className="header-right">
        <button className="export-btn" onClick={handleExport}>
          <span className="export-icon">↗</span>
          Export
        </button>
      </div>
    </header>
  );
}

