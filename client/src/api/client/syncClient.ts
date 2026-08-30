/**
 * `SyncClient` — the websocket half of cross-instance sync.
 *
 * Connects to the server's `/ws` endpoint and invokes a callback whenever
 * ANOTHER tab saves the project. It carries no project data: the message is a
 * notification, and the receiver re-runs its normal load flow. See
 * `server/src/sync.ts` for why.
 *
 * Responsibilities kept deliberately narrow — this class knows about sockets,
 * not about stores. `SyncController` (in `stores/session/`) decides what a
 * "project saved elsewhere" event should DO.
 *
 * Reconnect: exponential backoff 500 ms × 2ⁿ capped at 30 s, mirroring
 * `AutoSaveController`'s retry shape. Unlike auto-save this never gives up —
 * a laptop closed for an hour must resync when it wakes, and an idle socket
 * costs nothing.
 */
import { API_BASE } from "./config";
import { setSyncOrigin } from "./syncOrigin";

/** Path the server serves the socket on. Mirrors `SYNC_PATH`. */
export const SYNC_PATH = "/ws";

/** A peer tab saved `projectName`. Mirrors `ProjectSavedMessage`. */
export interface ProjectSavedEvent {
  type: "project-saved";
  projectName: string;
  origin: string | null;
  at: number;
}

interface WelcomeEvent {
  type: "welcome";
  clientId: string;
}

type SyncMessage = ProjectSavedEvent | WelcomeEvent;

export interface SyncClientOptions {
  /** Invoked when a PEER saved. Never fires for this tab's own saves. */
  onProjectSaved: (event: ProjectSavedEvent) => void;
  /** Connection state changes, for UI affordances. */
  onConnectionChange?: (connected: boolean) => void;
  /** Socket factory override for tests. */
  createSocket?: (url: string) => WebSocket;
  /** Timer overrides so tests own time. */
  setTimeoutFn?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void;
}

/**
 * Port the Express server listens on when the client is served by Vite.
 *
 * Mirrors `PORT`'s default in `server/src/index.ts`. Overridable at build time
 * for a non-default deployment.
 */
const DEFAULT_API_PORT =
  import.meta.env.VITE_SERVER_PORT || "3001";

/**
 * Resolve the websocket URL.
 *
 * ⚠️ MEASURED: Vite's dev-server `ws: true` proxy does NOT forward the upgrade
 * in this environment. The same Vite instance proxies `/api` correctly (200)
 * while silently dropping the `/ws` handshake — reproduced with a minimal
 * config against a plain websocket server, so it is Vite's proxy rather than
 * anything in this app. A proxied socket therefore hangs forever instead of
 * failing loudly, which is the worst possible failure mode for sync.
 *
 * So the socket goes STRAIGHT to the Express port and skips the proxy:
 *
 *  - `VITE_API_URL` set (absolute)  → derive host+port from it;
 *  - served by the Vite dev server  → same hostname, `DEFAULT_API_PORT`;
 *  - served by anything else        → same origin, since a production host
 *    serves the API and the client together.
 *
 * Using `location.hostname` rather than a literal keeps this correct for the
 * iPad companion, which reaches the machine by LAN address, not `localhost`.
 */
export function resolveSyncUrl(): string {
  const absolute = /^https?:\/\//i.test(API_BASE);
  if (absolute) {
    const url = new URL(API_BASE);
    const protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${url.host}${SYNC_PATH}`;
  }

  const { protocol: pageProtocol, hostname, port } = window.location;
  const protocol = pageProtocol === "https:" ? "wss:" : "ws:";

  // `import.meta.env.DEV` is true only under the Vite dev server, which is
  // exactly when the client and the API live on different ports.
  const targetPort = import.meta.env.DEV ? DEFAULT_API_PORT : port;
  const host = targetPort ? `${hostname}:${targetPort}` : hostname;
  return `${protocol}//${host}${SYNC_PATH}`;
}

export class SyncClient {
  static readonly BACKOFF_BASE_MS = 500;
  static readonly BACKOFF_CAP_MS = 30_000;

  private socket: WebSocket | null = null;
  private attempts = 0;
  private reconnectHandle: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private connected = false;

  private readonly options: SyncClientOptions;
  private readonly setTimeoutFn: NonNullable<SyncClientOptions["setTimeoutFn"]>;
  private readonly clearTimeoutFn: NonNullable<
    SyncClientOptions["clearTimeoutFn"]
  >;

  constructor(options: SyncClientOptions) {
    this.options = options;
    this.setTimeoutFn =
      options.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimeoutFn =
      options.clearTimeoutFn ?? ((handle) => clearTimeout(handle));
  }

  /** Open the socket. Safe to call repeatedly; extra calls are ignored. */
  connect(): void {
    if (this.disposed || this.socket) return;

    let socket: WebSocket;
    try {
      const url = resolveSyncUrl();
      socket = this.options.createSocket
        ? this.options.createSocket(url)
        : new WebSocket(url);
    } catch {
      // Constructing the socket can throw synchronously (bad URL, blocked by
      // policy). Treat it exactly like a failed connection.
      this.scheduleReconnect();
      return;
    }

    this.socket = socket;

    socket.onopen = () => {
      this.attempts = 0;
      this.setConnected(true);
    };

    socket.onmessage = (event: MessageEvent) => {
      let message: SyncMessage;
      try {
        message = JSON.parse(String(event.data)) as SyncMessage;
      } catch {
        return; // Not our protocol; ignore rather than crash the socket.
      }

      if (message.type === "welcome") {
        // A RECONNECT gets a new id. Re-stamping is what keeps echo
        // suppression working after the socket drops.
        setSyncOrigin(message.clientId);
        return;
      }

      if (message.type === "project-saved") {
        this.options.onProjectSaved(message);
      }
    };

    socket.onclose = () => {
      this.socket = null;
      // The id belonged to the closed connection; stop stamping it. Saves made
      // while disconnected broadcast to everyone, which is the safe default.
      setSyncOrigin(null);
      this.setConnected(false);
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      // `onclose` always follows; let it own the reconnect so we never
      // schedule two.
    };
  }

  /** 500 ms × 2ⁿ capped at 30 s. Never gives up — see the header. */
  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectHandle !== null) return;

    const delay = Math.min(
      SyncClient.BACKOFF_BASE_MS * 2 ** this.attempts,
      SyncClient.BACKOFF_CAP_MS,
    );
    this.attempts += 1;

    this.reconnectHandle = this.setTimeoutFn(() => {
      this.reconnectHandle = null;
      this.connect();
    }, delay);
  }

  private setConnected(next: boolean): void {
    if (this.connected === next) return;
    this.connected = next;
    this.options.onConnectionChange?.(next);
  }

  /** Whether the socket is currently open. */
  get isConnected(): boolean {
    return this.connected;
  }

  /** Close the socket and stop reconnecting. */
  dispose(): void {
    this.disposed = true;
    if (this.reconnectHandle !== null) {
      this.clearTimeoutFn(this.reconnectHandle);
      this.reconnectHandle = null;
    }
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      // Drop handlers first so `onclose` cannot schedule a reconnect.
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      try {
        socket.close();
      } catch {
        // Already closing.
      }
    }
    setSyncOrigin(null);
    this.setConnected(false);
  }
}
