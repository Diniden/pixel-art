/**
 * This tab's sync identity (cross-instance sync).
 *
 * The id is stamped on `POST /api/project` so the server can skip broadcasting
 * a reload back to the tab that performed the save. Without it, a saving tab
 * would be told to reload its own write and would clobber any edits made since
 * the payload was captured.
 *
 * The id is assigned by the SERVER on websocket connect (the `welcome`
 * message), not generated here — the server is the only party that can
 * guarantee it matches the connection it will later compare against.
 *
 * Lives in `api/client/` because `httpClient` needs it and the API layer may
 * not import from `stores/`.
 */

/** Header the server reads. Mirrors `ORIGIN_HEADER` in `server/src/sync.ts`. */
export const ORIGIN_HEADER = "x-pixel-art-origin";

let originId: string | null = null;

/**
 * Record the id the server assigned this connection.
 *
 * Called by `SyncClient` on every `welcome`, including after a reconnect —
 * the server issues a NEW id per connection, and a stale id would silently
 * stop suppressing echoes.
 */
export function setSyncOrigin(id: string | null): void {
  originId = id;
}

/** The current origin id, or `null` before the socket has connected. */
export function getSyncOrigin(): string | null {
  return originId;
}

/**
 * Headers for a request that should be attributed to this tab.
 * Empty when no socket is connected — the server then broadcasts to everyone,
 * which is the correct conservative behaviour.
 */
export function syncOriginHeaders(): Record<string, string> {
  return originId ? { [ORIGIN_HEADER]: originId } : {};
}
