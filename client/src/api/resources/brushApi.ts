/**
 * Brush document CRUD (Brush Studio plan, `docs/01-brush-studio`, task 04;
 * MASTER D13/D14). Same shape as `./projectApi`.
 *
 * ⚠️ `get()` returns the RAW payload as `unknown`. Normalisation is not the
 * API layer's job — `BrushStore` (task 07) runs `normalizeBrushDocument` on
 * whatever comes back. Transport never mutates domain data.
 *
 * Wire shapes verified against `server/src/routes/brush.ts`:
 *
 *   GET    /api/brushes         → { brushes: string[] }
 *   GET    /api/brush?name=     → the raw document           400 / 404
 *   POST   /api/brush?name=     → { success: true }          400
 *   POST   /api/brush/create    → { success: true, name }    400 / 409
 *   POST   /api/brush/rename    → { success: true }          400 / 404 / 409
 *   DELETE /api/brush?name=     → { success: true }          400 / 404
 *
 * Status → `ApiError.kind` mapping is the http client's (`statusToKind`):
 * 404 → `notFound`, 409 → `conflict`, 400 → `validation`, 5xx → `server`.
 *
 * Unlike `projectApi.save`, no sync-origin header is stamped: brush saves are
 * never broadcast to other tabs (MASTER D12).
 */
import type { BrushDocument } from "../../types";
import { request } from "../client/httpClient";

export interface SaveBrushResult {
  success: true;
}

export interface CreateBrushResult {
  success: true;
  name: string;
}

export const brushApi = {
  /** GET /api/brushes */
  async list(signal?: AbortSignal): Promise<string[]> {
    const data = await request<{ brushes?: string[] }>({
      path: "/brushes",
      signal,
    });
    return data.brushes ?? [];
  },

  /**
   * GET /api/brush — the RAW document as the server stored it, untyped.
   * A missing brush throws a `notFound` ApiError; it is the CALLER's decision
   * what that means.
   */
  async get(name: string, signal?: AbortSignal): Promise<unknown> {
    return request<unknown>({
      path: "/brush",
      query: { name },
      signal,
    });
  },

  /** POST /api/brush?name= — overwrites the file (previous copy kept server-side). */
  async save(doc: BrushDocument, name: string): Promise<SaveBrushResult> {
    return request<SaveBrushResult>({
      method: "POST",
      path: "/brush",
      query: { name },
      body: doc,
    });
  },

  /** POST /api/brush/create — 409 (`conflict`) for a duplicate name. */
  async create(
    name: string,
    brushData?: BrushDocument,
  ): Promise<CreateBrushResult> {
    const body: { name: string; brushData?: BrushDocument } = { name };
    if (brushData) body.brushData = brushData;
    return request<CreateBrushResult>({
      method: "POST",
      path: "/brush/create",
      body,
    });
  },

  /** POST /api/brush/rename — 404 (`notFound`) / 409 (`conflict`). */
  async rename(oldName: string, newName: string): Promise<void> {
    await request<{ success: true }>({
      method: "POST",
      path: "/brush/rename",
      body: { oldName, newName },
    });
  },

  /** DELETE /api/brush?name= — 404 (`notFound`) for a missing brush. */
  async remove(name: string): Promise<void> {
    await request<{ success: true }>({
      method: "DELETE",
      path: "/brush",
      query: { name },
    });
  },
};
