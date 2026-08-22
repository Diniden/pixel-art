/**
 * The typed API layer (REFRESH task 15).
 *
 * THIS BARREL IS THE ONLY IMPORT SITE FOR CONSUMERS. Nothing outside
 * `src/api/` may reach into `src/api/client/` or `src/api/resources/`
 * directly, and nothing in this layer imports from `src/stores/`, `src/store/`
 * or `src/components/` (ESLint-enforced).
 *
 * Guarantees, layer-wide:
 *  - exactly ONE `fetch` call site (`client/httpClient.ts`);
 *  - every request has a timeout and supports an `AbortSignal`;
 *  - every failure THROWS a typed `ApiError` — no fabricated success values,
 *    no `console.error`. Callers decide what a failure means.
 */
export { API_BASE, DEFAULT_TIMEOUT_MS, LONG_TIMEOUT_MS } from "./client/config";
export {
  ApiError,
  NetworkError,
  TimeoutError,
  isApiError,
  isKind,
  type ApiErrorKind,
} from "./client/errors";

export {
  projectApi,
  type CreateProjectResult,
  type SaveProjectResult,
} from "./resources/projectApi";
export {
  backupApi,
  type BackupEntry,
  type MigrationBackupResult,
} from "./resources/backupApi";
export { exportApi, type ExportRunResult } from "./resources/exportApi";
export { configApi, type ServerConfig } from "./resources/configApi";
export {
  aiApi,
  type AiConfigResult,
  type AiHealthResult,
  type JobStatusResult,
  type JobSubmitInput,
  type JobSubmitResult,
  type PollJobOptions,
} from "./resources/aiApi";
