import { useState, useEffect } from 'react';
import { useEditorStore } from '../../store';
import { backupApi, isApiError, type BackupEntry } from '../../api';
import { Icon } from '../../ui/primitives/Icon/Icon';
import { Clock, X } from 'lucide-react';
import './BrowseBackupsModal.css';

interface BrowseBackupsModalProps {
  onClose: () => void;
}

function formatDate(dateStr: string): string {
  const match = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return dateStr;
  const [, month, day, year] = match;
  const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(timeStr: string): string {
  const parts = timeStr.split('-');
  if (parts.length !== 3) return timeStr;
  const [h, m, s] = parts;
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${m}:${s} ${ampm}`;
}

export function BrowseBackupsModal({ onClose }: BrowseBackupsModalProps) {
  const { projectName, restoreFromBackup } = useEditorStore();
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBackup, setSelectedBackup] = useState<BackupEntry | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  // Task 15: the API layer no longer returns `[]` when the server is down, so
  // a load failure is now an EXPLICIT error state — never "no backups", which
  // read as "your backups are gone".
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadBackups() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const results = await backupApi.list(projectName, controller.signal);
        setBackups(results);
        setIsLoading(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        setLoadError(
          isApiError(err) ? err.message : 'Could not load the backup list',
        );
        setIsLoading(false);
      }
    }

    loadBackups();
    return () => controller.abort();
  }, [projectName]);

  const groupedBackups = backups.reduce<Record<string, BackupEntry[]>>(
    (acc, entry) => {
      if (!acc[entry.date]) acc[entry.date] = [];
      acc[entry.date].push(entry);
      return acc;
    },
    {},
  );

  const dateKeys = Object.keys(groupedBackups);

  const handleRestore = () => {
    if (!selectedBackup) return;
    setShowConfirm(true);
  };

  const handleConfirmRestore = async () => {
    if (!selectedBackup) return;
    setIsRestoring(true);
    setError(null);

    const success = await restoreFromBackup(selectedBackup.date, selectedBackup.filename);

    if (success) {
      onClose();
    } else {
      setError('Failed to restore backup');
      setIsRestoring(false);
      setShowConfirm(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (showConfirm) {
        setShowConfirm(false);
      } else {
        onClose();
      }
    }
  };

  return (
    <div className="modal__overlay" onClick={onClose}>
      <div
        className="modal browse-backups-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="modal__header">
          <h2>Backups — {projectName}</h2>
          <button className="modal__close" onClick={onClose} disabled={isRestoring}>
            <Icon icon={X} size={14} />
          </button>
        </div>

        {error && <div className="error-message" style={{ margin: '12px 20px 0' }}>{error}</div>}

        <div className="modal__body">
          {isLoading ? (
            <div className="backups-loading">Loading backups...</div>
          ) : loadError ? (
            <div className="error-message" style={{ margin: '12px 0' }}>
              Could not load backups — {loadError}. Your backups are NOT gone;
              check that the server is running and reopen this dialog.
            </div>
          ) : backups.length === 0 ? (
            <div className="backups-empty">
              No unzipped backups found for this project.
            </div>
          ) : (
            dateKeys.map((date) => (
              <div key={date} className="backup-date-group">
                <div className="backup-date-label">{formatDate(date)}</div>
                <div className="backup-list">
                  {groupedBackups[date].map((entry) => {
                    const isSelected =
                      selectedBackup?.date === entry.date &&
                      selectedBackup?.filename === entry.filename;

                    return (
                      <button
                        key={entry.filename}
                        className={`backup-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedBackup(entry)}
                        disabled={isRestoring}
                      >
                        <span className="backup-time-icon"><Icon icon={Clock} size={12} /></span>
                        <span className="backup-time">{formatTime(entry.time)}</span>
                        <span className="backup-filename">{entry.filename}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="modal__footer modal__footer--end">
          <button
            className="restore-btn"
            onClick={handleRestore}
            disabled={!selectedBackup || isRestoring}
          >
            Restore Selected
          </button>
        </div>
      </div>

      {showConfirm && selectedBackup && (
        <div className="confirm-dialog__backdrop" onClick={() => !isRestoring && setShowConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Restore Backup?</h3>
            <p>
              This will replace the current project state with the backup from{' '}
              <strong>{formatDate(selectedBackup.date)}</strong> at{' '}
              <strong>{formatTime(selectedBackup.time)}</strong>.
            </p>
            <p className="confirm-dialog__undo">
              You can undo this action with Ctrl+Z.
            </p>
            <div className="confirm-dialog__actions">
              <button
                className="btn btn--ghost"
                onClick={() => setShowConfirm(false)}
                disabled={isRestoring}
              >
                Cancel
              </button>
              <button
                className="btn btn--gradient"
                onClick={handleConfirmRestore}
                disabled={isRestoring}
              >
                {isRestoring ? 'Restoring...' : 'Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
