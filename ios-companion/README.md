# ios-companion — iPad companion app

A single-purpose iPad app: **find the pixel-art editor running on the local network and
display it full-screen in a webview.** It does not add editing features of its own.

Built as a native SwiftUI app (`PixelArtCompanion.xcodeproj`), iPad-only, minimum iOS 17.

---

## How discovery works

The app tries four strategies in order of decreasing confidence and stops at the **first
confirmed server**. "Confirmed" always means the same thing: something answered
`GET /api/discovery` with a payload whose `service` field is `pixel-art`. A random web
server on port 5173 fails that check and is discarded, so the app never opens a webview
onto the wrong host.

| # | Strategy | Typical cost | Why it exists |
|---|----------|--------------|---------------|
| 1 | **Last-known-good** | 1 probe | Remembers the last server that worked; usually wins on relaunch. |
| 2 | **Bonjour / mDNS** | < 1 s | The intended path. The server advertises `_pixelart._tcp`. |
| 3 | **Known hostnames** | 3 probes | `localhost`, `pixel-art.local`, the device hostname. Covers networks where mDNS *names* resolve but *browse* is blocked. |
| 4 | **Subnet sweep** | 253 probes on a /24 | Last resort, for networks that block mDNS entirely. |

If all four fail, the app shows an **Editor Unavailable** screen with a retry button and a
manual address field. A hand-entered address is still verified through the same probe, so
a typo surfaces as "not found" rather than a blank screen.

**Subnets wider than /24 are deliberately not swept.** `LocalNetwork.hostAddresses`
refuses any subnet with more than 1024 hosts — sweeping a /16 means 65,534 probes, which
is not something to attempt from a tablet. On such a network, use Bonjour or manual entry.

### Files

```
PixelArtCompanion/
  PixelArtCompanionApp.swift    @main entry point
  Discovery/
    DiscoveryInfo.swift         payload + DiscoveredServer models
    ServerProbe.swift           the identity check every strategy funnels through
    BonjourBrowser.swift        NWBrowser wrapper for _pixelart._tcp
    LocalNetwork.swift          getifaddrs + subnet math for the sweep
    DiscoveryService.swift      runs the strategies in order; @Observable
  Views/
    RootView.swift              discovery screen <-> webview
    DiscoveryView.swift         searching / unavailable / manual entry
    WebView.swift               full-screen WKWebView
  Support/Info.plist            local-network + Bonjour + ATS declarations
```

---

## The server side

Two changes in the main repo make the editor discoverable. Both are already in place.

**`server/src/discovery.ts`** advertises `_pixelart._tcp` via `bonjour-service` and
supplies the `/api/discovery` payload:

```json
{ "service": "pixel-art", "name": "Pixel Art Editor", "clientPort": 5173,
  "apiPort": 3001, "currentProject": "Base Unit",
  "addresses": ["192.168.2.253", "fdca:..."], "version": 1 }
```

**`server/src/index.ts`** binds `::` (dual-stack) rather than `0.0.0.0`, and
**`client/vite.config.ts`** sets `host: true`.

> ⚠️ Two binding traps, both of which make the app find nothing:
> - Loopback-only binding makes the server invisible to every other device.
> - Binding `"0.0.0.0"` opens an **IPv4-only** socket. The server would then advertise
>   IPv6 addresses in `/api/discovery` that it cannot actually serve. Binding `"::"`
>   accepts both; Node maps IPv4 clients onto the dual-stack socket.

The advertised port is the **client** port, not the API port — the webview opens the
editor UI. `CLIENT_PORT` overrides it; `DISABLE_BONJOUR=1` turns advertising off.

### Contract

`SERVICE_TYPE` in `server/src/discovery.ts` and `BonjourBrowser.serviceType` must match,
as must the `DiscoveryInfo` shape on both sides. `NSBonjourServices` in `Info.plist` must
list the same type — **an unlisted service type is silently filtered out by iOS**, which
looks exactly like "no server on the network". Bump `version` on both sides together if
the payload shape changes.

---

## Building

```sh
open ios-companion/PixelArtCompanion.xcodeproj
```

Set your signing team on the `PixelArtCompanion` target (`Signing & Capabilities`) before
deploying to a device — the project ships with automatic signing and the bundle id
`com.diniden.PixelArtCompanion`, but no team.

From the command line:

```sh
cd ios-companion
xcodebuild -project PixelArtCompanion.xcodeproj -target PixelArtCompanion \
  -sdk iphoneos -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

### Info.plist keys that discovery depends on

Removing any of these breaks discovery **silently** — no error, just an empty network:

- `NSLocalNetworkUsageDescription` — without it the permission prompt never appears and
  every LAN request returns nothing.
- `NSBonjourServices` — must contain `_pixelart._tcp`.
- `NSAppTransportSecurity.NSAllowsLocalNetworking` — the dev server is plain HTTP.
  Scoped to local networking, so arbitrary internet loads stay blocked.

---

## Running it

1. `bun run dev` in the repo root.
2. Put the iPad on the same Wi-Fi network as the machine running the editor.
3. Launch the app and **allow local network access** when prompted. If it is declined, the
   only path left is manual entry — re-enable it in
   Settings → Privacy & Security → Local Network.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Stuck searching, then "Unavailable" | Local network permission denied, or the iPad is on a different VLAN / guest network with client isolation. |
| Bonjour never hits, sweep finds it | mDNS is blocked on the network. Working as designed, just slower. |
| Found the server but the page is blank | Vite is not bound to all interfaces — confirm `host: true` in `client/vite.config.ts`. |
| Works on Wi-Fi, not on cellular | Intended: cellular interfaces are excluded from the sweep. |
