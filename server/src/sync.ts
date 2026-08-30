import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";

/**
 * Cross-instance sync (single-author).
 *
 * Every browser tab holding the editor open connects here. When any tab saves,
 * the server tells the OTHERS to reload from disk. That is the whole protocol:
 * a notification, never a payload.
 *
 * ── Why the message carries no project data ───────────────────────────────
 * The owner's real project is 1.1 MB. Broadcasting it on every debounced save
 * would push megabytes per keystroke-burst through every socket, and the
 * receiver would still have to run the migration chain on it. Instead the
 * server sends a ~100-byte "reload" and the client re-runs its existing
 * `loadProject` flow, which already handles migrations, defaults and errors.
 * The file on disk is the single source of truth; this just says it moved.
 *
 * ── The concurrency model is deliberately last-write-wins ─────────────────
 * This is a single-author tool. There is no merge, no conflict detection, and
 * no presence. The save that reaches the server first is simply overwritten by
 * whichever lands next — the same semantics the HTTP endpoint always had. The
 * refresh clobbers unsaved work in the receiving tab, by design.
 */

/** Message the server pushes to peers. Mirrored by `SyncMessage` on the client. */
export interface ProjectSavedMessage {
  type: "project-saved";
  /** Which project changed, so a tab viewing a DIFFERENT one can ignore it. */
  projectName: string;
  /** Sender's origin id, echoed so the saver can skip its own broadcast. */
  origin: string | null;
  /** Server clock, for logging and stale-message diagnosis. */
  at: number;
}

/** Sent once on connect so the client can confirm the channel is live. */
export interface WelcomeMessage {
  type: "welcome";
  /** Id the server assigned this connection. */
  clientId: string;
}

export type ServerMessage = ProjectSavedMessage | WelcomeMessage;

/** Path the websocket is served on. Mirrored in the client and the Vite proxy. */
export const SYNC_PATH = "/ws";

/**
 * Header carrying the saving tab's identity on `POST /api/project`.
 *
 * Used to suppress the echo: a tab that saves must not be told to reload the
 * write it just made, or it would clobber the very edits it was saving.
 */
export const ORIGIN_HEADER = "x-pixel-art-origin";

let wss: WebSocketServer | null = null;
let nextClientId = 1;

/** Connections, each tagged with the id we handed it on connect. */
const clients = new Map<WebSocket, string>();

/**
 * Attach the websocket server to the running HTTP server.
 *
 * Shares the HTTP port rather than opening a second listener, so the Vite proxy
 * and the iPad companion need to know about exactly one port.
 */
export function attachSyncServer(server: Server): void {
  if (wss) return;

  // `{ server }` rather than `noServer` + a manual upgrade handler.
  //
  // MEASURED under Bun: an `http.Server` here never emits `"upgrade"` — Bun's
  // `ws` compatibility layer intercepts the handshake itself — so a
  // `noServer` setup produces a handler that never fires and a socket that
  // never connects. Passing `server` is the form Bun actually honours.
  //
  // Bun also logs a spurious "Is port N in use?" warning while attaching, even
  // though the socket works; it is swallowed by the `error` handler below
  // rather than surfaced, so startup output stays honest.
  wss = new WebSocketServer({ server, path: SYNC_PATH });

  wss.on("connection", (socket: WebSocket) => {
    const clientId = `c${nextClientId++}`;
    clients.set(socket, clientId);

    const welcome: WelcomeMessage = { type: "welcome", clientId };
    safeSend(socket, welcome);

    socket.on("close", () => {
      clients.delete(socket);
    });

    socket.on("error", () => {
      // A socket erroring is normal (tab closed, network dropped). Drop it and
      // let the client's own reconnect loop re-establish.
      clients.delete(socket);
    });
  });

  wss.on("error", (error: Error) => {
    // Bun emits a bogus "Is port N in use?" here while attaching to an
    // already-listening server. The socket is fine; reporting it would send
    // the reader chasing a port conflict that does not exist.
    if (/port .* in use/i.test(error.message)) return;
    // Anything else is real. Sync is an enhancement, so warn and carry on —
    // never take the HTTP server down with it.
    console.warn(`🔌 Sync server error: ${error.message}`);
  });

  console.log(`🔌 Sync websocket listening on ${SYNC_PATH}`);
}

/**
 * Tell every connected tab except `origin` that `projectName` was saved.
 *
 * Called after the write to disk has completed, so a peer that reloads
 * immediately is guaranteed to read the new bytes rather than the old ones.
 */
export function broadcastProjectSaved(
  projectName: string,
  origin: string | null,
): void {
  if (!wss || clients.size === 0) return;

  const message: ProjectSavedMessage = {
    type: "project-saved",
    projectName,
    origin,
    at: Date.now(),
  };

  for (const [socket, clientId] of clients) {
    // Skip the tab that performed the save — it already has this state, and
    // reloading it would clobber edits made since the save was captured.
    if (origin !== null && clientId === origin) continue;
    safeSend(socket, message);
  }
}

/** Send JSON to one socket, ignoring a socket that closed mid-iteration. */
function safeSend(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify(message));
  } catch {
    // Peer vanished between the readyState check and the send.
  }
}

/** Number of live connections. Exposed for `/api/discovery` and tests. */
export function connectedClientCount(): number {
  return clients.size;
}

/** Close every connection and stop the server. Called on shutdown. */
export function closeSyncServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!wss) {
      resolve();
      return;
    }
    const instance = wss;
    wss = null;
    for (const socket of clients.keys()) {
      try {
        socket.close();
      } catch {
        // Already closed.
      }
    }
    clients.clear();
    instance.close(() => resolve());
  });
}
