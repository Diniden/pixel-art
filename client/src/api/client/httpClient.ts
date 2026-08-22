/**
 * `request<T>()` — the single fetch wrapper (REFRESH task 15).
 *
 * This is the ONLY place in the client that calls `fetch`. Guarantees:
 *
 *  - every request has a timeout (an internal AbortController);
 *  - a caller-supplied AbortSignal is honoured, and its abort rethrows the
 *    `AbortError` UNWRAPPED so React effects can ignore it;
 *  - failures always THROW a typed `ApiError` — no function in this layer ever
 *    returns a fabricated success value, and nothing here calls
 *    `console.error`;
 *  - error bodies are read defensively (a proxy's HTML 502 page must not mask
 *    the real status with a JSON parse error).
 */
import { API_BASE, DEFAULT_TIMEOUT_MS } from "./config";
import { ApiError, NetworkError, TimeoutError, statusToKind } from "./errors";

export interface RequestOptions {
  method?: "GET" | "POST" | "DELETE";
  /** e.g. "/project" */
  path: string;
  /** `undefined` values are skipped entirely. */
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
  /**
   * URL prefix; defaults to `API_BASE`. Pass `""` for same-origin paths that
   * live outside `/api` (the static `/exports/...` tree).
   */
  base?: string;
}

function buildUrl(
  base: string,
  path: string,
  query?: Record<string, string | number | undefined>,
): string {
  let url = `${base}${path}`;
  if (query) {
    // `encodeURIComponent`, not URLSearchParams: the old call sites encoded a
    // space as `%20` (URLSearchParams emits `+`), and the characterisation
    // tests pin that byte-level URL shape.
    const parts: string[] = [];
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        parts.push(
          `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
        );
      }
    }
    if (parts.length > 0) url += `?${parts.join("&")}`;
  }
  // In a non-browser runtime (the Vitest node lane) a relative URL cannot be
  // fetched at all; resolve it against localhost so MSW's path-based handlers
  // still match. In the browser, relative URLs resolve against the page origin
  // exactly as before.
  if (url.startsWith("/") && typeof window === "undefined") {
    url = `http://localhost${url}`;
  }
  return url;
}

/**
 * Read the server's error body without trusting it to be JSON. Several proxies
 * answer with an HTML 502 page; the old call sites did `await response.json()`
 * unguarded there, which threw a SyntaxError and masked the real status.
 */
async function readServerMessage(
  response: Response,
): Promise<string | undefined> {
  try {
    // Real `Response` objects always have `text()`; hand-rolled stubs in older
    // characterisation tests may only implement `json()`.
    if (typeof response.text === "function") {
      const raw = await response.text();
      if (!raw) return undefined;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (
          parsed !== null &&
          typeof parsed === "object" &&
          "error" in parsed &&
          typeof (parsed as { error: unknown }).error === "string"
        ) {
          return (parsed as { error: string }).error;
        }
        return undefined;
      } catch {
        // Non-JSON body (HTML error page, plain text): keep a readable slice.
        return raw.slice(0, 500);
      }
    }
    const parsed: unknown = await response.json();
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "error" in parsed &&
      typeof (parsed as { error: unknown }).error === "string"
    ) {
      return (parsed as { error: string }).error;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function request<T>(opts: RequestOptions): Promise<T> {
  const {
    method = "GET",
    path,
    query,
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
    base = API_BASE,
  } = opts;

  const url = buildUrl(base, path, query);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  // Link a caller-supplied signal to the internal controller.
  const onCallerAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      throw signal.reason instanceof Error
        ? signal.reason
        : new DOMException("The operation was aborted.", "AbortError");
    }
    signal.addEventListener("abort", onCallerAbort, { once: true });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers:
        body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    // Our own timeout fired.
    if (timedOut) throw new TimeoutError(path);
    // The caller's signal fired: rethrow UNWRAPPED so effects can ignore it.
    if (signal?.aborted) throw error;
    throw new NetworkError(path, error);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onCallerAbort);
  }

  if (!response.ok) {
    const serverMessage = await readServerMessage(response);
    throw new ApiError({
      kind: statusToKind(response.status),
      status: response.status,
      path,
      serverMessage,
    });
  }

  if (
    response.status === 204 ||
    response.headers?.get?.("content-length") === "0"
  ) {
    return undefined as T;
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    // A 2xx with an unparseable body is a failure, not a success value.
    throw new ApiError({
      kind: "unknown",
      status: response.status,
      path,
      message: `The response from ${path} was not valid JSON`,
      cause: error,
    });
  }
}
