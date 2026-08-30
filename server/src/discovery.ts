import { networkInterfaces } from "os";
import { Bonjour, type Service } from "bonjour-service";

/**
 * LAN discovery for the iPad companion app (`ios-companion/`).
 *
 * The companion needs to answer one question: "where on this network is the
 * pixel-art editor?" Two mechanisms cooperate:
 *
 *  1. **Bonjour/mDNS** — we advertise `_pixelart._tcp`, which `NWBrowser` on
 *     iOS resolves in well under a second with no scanning at all.
 *  2. **`GET /api/discovery`** — an identity endpoint. When mDNS is blocked
 *     (guest/corporate Wi-Fi) the companion falls back to probing addresses,
 *     and needs a way to tell *this* server apart from any other host that
 *     happens to answer on port 5173. A probe that returns this payload with
 *     `service === "pixel-art"` is a confirmed hit.
 *
 * The advertised port is the **client** (Vite) port, not the API port — the
 * companion opens a webview onto the editor UI, and that is what it needs.
 */

/** Bonjour service type. Must match `PixelArtDiscovery.serviceType` on iOS. */
export const SERVICE_TYPE = "pixelart";

/** Marker identifying this payload as the pixel-art editor. */
export const SERVICE_ID = "pixel-art";

/**
 * Port the editor UI is served from. The companion webview loads this, not the
 * API port. Vite's dev server defaults to 5173; `CLIENT_PORT` overrides it for
 * a preview/production host.
 */
export function getClientPort(): number {
  const raw = process.env.CLIENT_PORT;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 && parsed < 65536
    ? parsed
    : 5173;
}

/** Payload returned by `GET /api/discovery`. Mirrored by `DiscoveryInfo` on iOS. */
export interface DiscoveryInfo {
  /** Always `"pixel-art"` — the marker the companion matches on. */
  service: string;
  /** Human-readable name shown in the companion's UI. */
  name: string;
  /** Port serving the editor UI, i.e. what the webview should open. */
  clientPort: number;
  /** Port serving this API. */
  apiPort: number;
  /** Name of the project currently open, when known. */
  currentProject: string | null;
  /** Non-loopback IPv4/IPv6 addresses this host is reachable on. */
  addresses: string[];
  /** Discovery contract version, bumped if the payload shape changes. */
  version: number;
}

/** Current discovery payload version. */
export const DISCOVERY_VERSION = 1;

/**
 * Non-loopback addresses this machine is reachable at, IPv4 first.
 *
 * Reported to the companion so that a server found via one interface can hand
 * back every address it answers on — useful when the iPad is on a different
 * interface (e.g. the Mac is on both Ethernet and Wi-Fi).
 */
export function getLocalAddresses(): string[] {
  const v4: string[] = [];
  const v6: string[] = [];

  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.internal) continue;
      // Node types `family` as `string | number` across versions; accept both.
      const family = String(addr.family);
      if (family === "IPv4" || family === "4") {
        v4.push(addr.address);
      } else if (family === "IPv6" || family === "6") {
        // Link-local (fe80::) addresses need a zone index to be usable by a
        // peer, which we cannot supply meaningfully here — skip them.
        if (!addr.address.toLowerCase().startsWith("fe80")) {
          v6.push(addr.address);
        }
      }
    }
  }

  return [...v4, ...v6];
}

let bonjour: Bonjour | null = null;
let published: Service | null = null;

/**
 * Start advertising this server over Bonjour/mDNS.
 *
 * Safe to call when mDNS is unavailable: failures are logged and swallowed, as
 * discovery is an enhancement and must never prevent the server from serving.
 * Set `DISABLE_BONJOUR=1` to opt out entirely.
 */
export function startAdvertising(apiPort: number): void {
  if (process.env.DISABLE_BONJOUR === "1") {
    console.log("📡 Bonjour advertisement disabled (DISABLE_BONJOUR=1)");
    return;
  }
  if (published) return;

  const clientPort = getClientPort();

  try {
    bonjour = new Bonjour();
    published = bonjour.publish({
      name: "Pixel Art Editor",
      type: SERVICE_TYPE,
      port: clientPort,
      // TXT records let the companion filter candidates before it opens a
      // connection, and survive the resolve step intact.
      txt: {
        service: SERVICE_ID,
        api: String(apiPort),
        client: String(clientPort),
        version: String(DISCOVERY_VERSION),
      },
    });

    published.on("error", (err: Error) => {
      console.warn(`📡 Bonjour advertisement error: ${err.message}`);
    });

    console.log(
      `📡 Advertising _${SERVICE_TYPE}._tcp on port ${clientPort} for the iPad companion`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`📡 Could not start Bonjour advertisement: ${message}`);
    bonjour = null;
    published = null;
  }
}

/**
 * Withdraw the advertisement and tear down the mDNS socket.
 *
 * Called on shutdown so the companion does not keep resolving a dead service
 * from a cached record.
 */
export function stopAdvertising(): Promise<void> {
  return new Promise((resolve) => {
    if (!bonjour) {
      resolve();
      return;
    }
    const instance = bonjour;
    bonjour = null;
    published = null;

    // `unpublishAll` sends goodbye packets; `destroy` closes the socket.
    try {
      instance.unpublishAll(() => {
        try {
          instance.destroy();
        } catch {
          // Socket already closed — nothing to do.
        }
        resolve();
      });
    } catch {
      resolve();
    }
  });
}
