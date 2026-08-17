/**
 * The ApiError hierarchy (REFRESH task 15).
 *
 * Every failure that leaves the API layer is one of these (except a caller's
 * own AbortSignal firing, which rethrows the `AbortError` unwrapped so React
 * effects can ignore it). Callers distinguish failures by `kind`, never by
 * string-matching messages.
 */
export type ApiErrorKind =
  | "network" // fetch rejected — server unreachable, DNS, CORS
  | "timeout" // our AbortController fired
  | "notFound" // 404
  | "conflict" // 409  (create/rename duplicate, job in progress)
  | "validation" // 400
  | "server" // 5xx
  | "unknown";

export interface ApiErrorInit {
  kind: ApiErrorKind;
  /** The request path, e.g. "/project". */
  path: string;
  /** HTTP status; absent for network/timeout. */
  status?: number;
  /** The server's `{error}` field, verbatim, when one was present. */
  serverMessage?: string;
  /** Override the derived human-readable message. */
  message?: string;
  cause?: unknown;
}

const defaultMessage = (init: ApiErrorInit): string => {
  if (init.message) return init.message;
  if (init.serverMessage) return init.serverMessage;
  switch (init.kind) {
    case "network":
      return `Cannot reach the server (${init.path})`;
    case "timeout":
      return `The request to ${init.path} timed out`;
    default:
      return `Request to ${init.path} failed${
        init.status !== undefined ? ` with status ${init.status}` : ""
      }`;
  }
};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly path: string;
  readonly serverMessage?: string;

  constructor(init: ApiErrorInit) {
    // No `{ cause }` constructor option: this workspace compiles with lib
    // ES2020, which predates it. Assigned manually below instead.
    super(defaultMessage(init));
    if (init.cause !== undefined) {
      (this as { cause?: unknown }).cause = init.cause;
    }
    this.name = "ApiError";
    this.kind = init.kind;
    this.status = init.status;
    this.path = init.path;
    this.serverMessage = init.serverMessage;
  }
}

/** fetch itself rejected: server down, DNS failure, CORS. */
export class NetworkError extends ApiError {
  constructor(path: string, cause?: unknown) {
    super({ kind: "network", path, cause });
    this.name = "NetworkError";
  }
}

/** The layer's own timeout fired (never a caller's AbortSignal). */
export class TimeoutError extends ApiError {
  constructor(path: string, message?: string) {
    super({ kind: "timeout", path, message });
    this.name = "TimeoutError";
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

export const isKind = (e: unknown, k: ApiErrorKind): e is ApiError =>
  isApiError(e) && e.kind === k;

/** 400 → validation, 404 → notFound, 409 → conflict, 5xx → server. */
export function statusToKind(status: number): ApiErrorKind {
  if (status === 400) return "validation";
  if (status === 404) return "notFound";
  if (status === 409) return "conflict";
  if (status >= 500) return "server";
  return "unknown";
}
