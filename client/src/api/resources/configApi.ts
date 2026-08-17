/**
 * Server configuration (REFRESH task 15).
 *
 * Read-only on purpose: `POST /api/config` has no client caller, and the spec
 * forbids building resource methods for caller-less endpoints. (The project
 * switch flow uses `projectApi.switchTo`, which hits `/api/project/switch`.)
 */
import { request } from "../client/httpClient";

export interface ServerConfig {
  currentProject: string;
  /** Present when an AI service URL has been persisted server-side. */
  aiServiceUrl?: string;
}

export const configApi = {
  /** GET /api/config */
  async get(signal?: AbortSignal): Promise<ServerConfig> {
    return request<ServerConfig>({ path: "/config", signal });
  },
};
