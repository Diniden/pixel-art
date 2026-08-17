/**
 * Server-side sprite export (REFRESH task 15).
 */
import { LONG_TIMEOUT_MS } from "../client/config";
import { request } from "../client/httpClient";

export interface ExportRunResult {
  success: true;
  /**
   * An absolute SERVER filesystem path. Task 11's spec proposed dropping it,
   * but `Header.tsx` shows it in the export toast (verified in W6), so it is
   * part of the contract until that call site goes.
   */
  path: string;
  kebabName: string;
  frameCount: number;
  textureCount: number;
  bytes: number;
}

export const exportApi = {
  /** POST /api/project/export — a full export can be slow; long timeout. */
  async run(projectName?: string, signal?: AbortSignal): Promise<ExportRunResult> {
    return request<ExportRunResult>({
      method: "POST",
      path: "/project/export",
      query: { name: projectName },
      timeoutMs: LONG_TIMEOUT_MS,
      signal,
    });
  },

  /**
   * GET /exports/<kebabName>/frames.json — the static export tree, OUTSIDE
   * `/api` (the Vite dev server proxies `/exports` to Express, which serves it
   * with `express.static`). Replaces the inline fetch in ExportPreviewModal.
   */
  async fetchFramesJson(
    kebabName: string,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return request<unknown>({
      base: "",
      path: `/exports/${encodeURIComponent(kebabName)}/frames.json`,
      signal,
    });
  },
};
