/**
 * Backup listing/restore (REFRESH task 15).
 *
 * The old `listBackups` swallowed every failure and returned `[]`, which made
 * `BrowseBackupsModal` render "no backups" for a server error — the user would
 * conclude their backups were gone. Failures now throw.
 */
import type { CompactProject } from "../../types";
import { request } from "../client/httpClient";

export interface BackupEntry {
  date: string;
  time: string;
  filename: string;
}

export interface MigrationBackupResult {
  success: true;
  message: string;
}

export const backupApi = {
  /** GET /api/project/backups */
  async list(
    projectName?: string,
    signal?: AbortSignal,
  ): Promise<BackupEntry[]> {
    const data = await request<{ backups?: BackupEntry[] }>({
      path: "/project/backups",
      query: { name: projectName },
      signal,
    });
    return data.backups ?? [];
  },

  /**
   * POST /api/project/restore-backup.
   *
   * ⚠️ Contract fact: the server answers **500, not 404, for a missing backup
   * file** (`routes/project.ts` catches the throw), so a missing backup
   * surfaces here as kind `server`. Mapped as the server sends it — the client
   * must not invent a 404.
   */
  async restore(
    date: string,
    filename: string,
    projectName?: string,
  ): Promise<void> {
    await request<{ success: true }>({
      method: "POST",
      path: "/project/restore-backup",
      query: { name: projectName },
      body: { date, filename },
    });
  },

  /**
   * POST /api/project/backup — the pre-migration safety copy. The caller (the
   * load path's migration chain) treats failure as best-effort BY PINNED
   * DESIGN; this method itself still throws like everything else.
   */
  async createMigrationBackup(
    project: CompactProject,
  ): Promise<MigrationBackupResult> {
    return request<MigrationBackupResult>({
      method: "POST",
      path: "/project/backup",
      body: project,
    });
  },
};
