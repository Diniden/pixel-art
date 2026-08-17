/**
 * Project CRUD (REFRESH task 15). Replaces the transport half of the old
 * `services/api.ts`.
 *
 * ⚠️ `get()` returns the RAW, UNMIGRATED payload. Migration is not the API
 * layer's job — transport must not mutate domain data. The migration chain
 * still lives in `services/api.ts`'s load path until task 16 moves it into the
 * store.
 */
import type { CompactProject } from "../../types";
import { request } from "../client/httpClient";

export interface SaveProjectResult {
  success: true;
  backupCreated: boolean;
}

export interface CreateProjectResult {
  success: true;
  projectName: string;
}

export const projectApi = {
  /** GET /api/projects */
  async list(signal?: AbortSignal): Promise<string[]> {
    const data = await request<{ projects?: string[] }>({
      path: "/projects",
      signal,
    });
    return data.projects ?? [];
  },

  /**
   * GET /api/project — the RAW `CompactProject` as the server stored it.
   * A missing project throws a `notFound` ApiError; it is the CALLER's
   * decision whether "no project yet" means "create a default".
   */
  async get(name?: string, signal?: AbortSignal): Promise<CompactProject> {
    return request<CompactProject>({
      path: "/project",
      query: { name },
      signal,
    });
  },

  /**
   * POST /api/project. The old call site discarded the response body;
   * `backupCreated` is now surfaced for consumers that want it.
   */
  async save(
    project: CompactProject,
    name?: string,
  ): Promise<SaveProjectResult> {
    return request<SaveProjectResult>({
      method: "POST",
      path: "/project",
      query: { name },
      body: project,
    });
  },

  /** POST /api/project/create — 409 (`conflict`) for a duplicate name. */
  async create(
    name: string,
    projectData?: CompactProject,
  ): Promise<CreateProjectResult> {
    const body: { name: string; projectData?: CompactProject } = { name };
    if (projectData) body.projectData = projectData;
    return request<CreateProjectResult>({
      method: "POST",
      path: "/project/create",
      body,
    });
  },

  /** POST /api/project/rename — 409 (`conflict`) for a duplicate name. */
  async rename(oldName: string, newName: string): Promise<void> {
    await request<{ success: true }>({
      method: "POST",
      path: "/project/rename",
      body: { oldName, newName },
    });
  },

  /** DELETE /api/project — 400 (`validation`) for the last project. */
  async remove(name: string): Promise<void> {
    await request<{ success: true }>({
      method: "DELETE",
      path: "/project",
      query: { name },
    });
  },

  /** POST /api/project/switch — updates the server's current-project config. */
  async switchTo(name: string): Promise<void> {
    await request<{ success: true }>({
      method: "POST",
      path: "/project/switch",
      body: { name },
    });
  },
};
