/**
 * Transport configuration for the typed API layer (REFRESH task 15).
 *
 * `API_BASE` mirrors the old `services/api.ts` value exactly: the Vite dev
 * server proxies `/api` (and `/exports`) to the Express server, and
 * `VITE_API_URL` overrides it for a non-proxied deployment.
 */
export const API_BASE = import.meta.env.VITE_API_URL || "/api";

/** Every request gets a timeout. This is the default. */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** For known-slow operations: the server-side export and AI job submission. */
export const LONG_TIMEOUT_MS = 120_000;
