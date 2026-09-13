# 02 — Capacitor platform verification

**Task:** `02-capacitor-platform-verification.md` · **Date:** 2026-09-06
**Method:** web research with dated citations + a local CLI spike run **outside the repo**
(`<scratchpad>/capspike`, throwaway, not committed anywhere). Spike observations are
labeled **[measured]**; everything else carries a citation. Device-only checks are gaps.

## Facts

### Q1 — Capacitor version, iOS minimum, iPad multitasking

- **Current major is Capacitor 8** (released 2025-12-08). Latest published versions on
  the npm registry, queried directly (`registry.npmjs.org`, checked 2026-09-06)
  **[measured]**:
  - `@capacitor/core` **8.5.1** (published 2026-08-31)
  - `@capacitor/cli` **8.5.1** (published 2026-08-31)
  - `@capacitor/ios` **8.5.1** (published 2026-08-31)
  - `@capacitor/filesystem` **8.1.3** (published prior to 2026-09-06; standalone repo
    `ionic-team/capacitor-filesystem`)
  - `@capacitor/preferences` **8.0.1** (published 2026-02-12)
- **Requirements for Capacitor 8**: iOS **15.0** minimum deployment target, **Xcode
  26.0+**, **NodeJS 22 or greater** (see Q7 for the Bun angle), Android minSdk 24
  (https://capacitorjs.com/docs/updating/8-0, checked 2026-09-06). Release announcement:
  https://ionic.io/blog/announcing-capacitor-8 (checked 2026-09-06).
- The spike's generated `Package.swift` pins `platforms: [.iOS(.v15)]` and
  `capacitor-swift-pm` at `exact: "8.5.1"` **[measured]**.
- **This machine satisfies the toolchain**: `xcodebuild -version` → **Xcode 26.6
  (17F113)**, macOS 26.6.2, CocoaPods 1.16.2 present (not needed — see Q7)
  **[measured 2026-09-06]**.
- **iPad multitasking / Stage Manager**: no Capacitor-specific blocker found. Known
  items: a feature request for true multi-window/multi-scene support
  (https://github.com/ionic-team/capacitor/issues/4001, checked 2026-09-06) and a
  viewport-recalculation bug on fullscreen exit
  (https://github.com/ionic-team/capacitor/issues/8231, checked 2026-09-06). Stage
  Manager resizing is an ordinary responsive-CSS concern for a single-scene app; the
  generated app template already uses a `SceneDelegate` **[measured — spike
  `ios/App/App/SceneDelegate.swift` exists]**.

### Q2 — Webview origin, scheme, CORS, ATS, absolute `/api` URLs

- **iOS origin is `capacitor://localhost`**: `server.iosScheme` default is `capacitor`,
  `server.hostname` default `localhost`, and the scheme **cannot** be set to `http` or
  `https` ("Can't be set to schemes that the WKWebView already handles") — unlike
  Android, whose default `androidScheme` is `https`
  (https://capacitorjs.com/docs/config, checked 2026-09-06). Keeping hostname
  `localhost` is recommended because it preserves secure-context Web APIs (same page).
- **CORS to a LAN server**: requests carry `Origin: capacitor://localhost`. Any server
  that reflects the origin or uses `*` works; services with strict https-only origin
  allowlists reject the custom scheme (documented failure mode:
  https://www.sanity.io/answers/cors-errors-when-trying-to-fetch-a-file-using-capacitor,
  checked 2026-09-06). For this project both peers are permissive today: Express uses
  bare `cors()` (`server/src/index.ts` per MASTER §4) and FastAPI sets
  `allow_origins=["*"]` (MASTER §4) — both reflect/allow any origin, so no change is
  needed for CORS itself.
- **ATS still applies to plain-HTTP LAN traffic** from the webview: the ios-companion
  precedent (`NSAllowsLocalNetworking`, plus `NSBonjourServices` being silently fatal
  when missing) is recorded in this repo's own README/memory (MASTER §4 "Discovery /
  iPad today"). The Capacitor app's `Info.plist` needs the same keys, plus
  `NSLocalNetworkUsageDescription` for the iOS 14+ local-network prompt. The generated
  spike `Info.plist` contains **none** of these — they must be added by the port
  **[measured — spike `ios/App/App/Info.plist`]**.
- **Cookies/storage are partitioned per app**: a Capacitor app's WKWebsiteDataStore is
  app-private; nothing is shared with Safari. Storage lives under the
  `capacitor://localhost` origin (WebKit treats each `(scheme, host)` as an origin —
  consequence of the scheme facts above; see also the WebKit storage-policy source in Q3
  which states WebView apps get their own app-classified quotas).
- **Absolute `/api` URLs break in local mode** (confirms G-12): inside the webview,
  `/api/...` resolves against `capacitor://localhost` and is handled by Capacitor's
  asset handler (which serves `webDir` files), not a network stack — so it 404s unless a
  file exists at that path. In remote mode the client must build **fully-qualified**
  `http://<host>:<port>/api` URLs at runtime (today `API_BASE` falls back to relative
  `"/api"`, `client/src/api/client/config.ts:8` per MASTER §4; and
  `fetchFramesJson` uses `base: ""` which has the same problem).

### Q3 — Storage backings (feeds task 05 / G-07)

- **WebKit storage policy (authoritative for all WKWebView apps)**: since iOS/iPadOS 17,
  a **non-browser app's WebView gets an origin quota of up to ~15% of total disk and an
  overall cap of ~20%**; eviction is LRU per origin and happens on quota pressure,
  system storage pressure, or prolonged non-interaction; `navigator.storage.persist()`
  is granted only heuristically (e.g. Home Screen web apps) with no guarantee
  (https://webkit.org/blog/14403/updates-to-storage-policy/, checked 2026-09-06).
- **Capacitor's own guidance warns against webview storage for critical data**: "the OS
  will reclaim local storage from Web Views if a device is running low on space. The
  same can be said for IndexedDB at least on iOS"; it recommends the native Preferences
  API for small data and SQLite-family plugins for large data
  (https://capacitorjs.com/docs/guides/storage, checked 2026-09-06). Safari's 7-day
  script-writable-storage cap is an ITP/Safari-browsing rule; inside an app's WKWebView
  the operative rules are the quota/eviction ones above — but see G-204.
- **OPFS**: `navigator.storage.getDirectory()` has shipped in WebKit since Safari 15.2
  (https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/,
  checked 2026-09-06). Writes from the main thread via
  `FileSystemFileHandle.createWritable()` only became available in **Safari 26.0**
  (2025-09; https://webkit.org/blog/17333/webkit-features-in-safari-26-0/, checked
  2026-09-06) — on iOS 15–25 the only write path is `createSyncAccessHandle()` inside a
  **dedicated Web Worker** (https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createSyncAccessHandle,
  checked 2026-09-06). Timestamps: OPFS exposes `File.lastModified` via
  `handle.getFile()` but no directory mtimes and no ctime. An unofficial checker repo
  claims a **10 MB per-file limit for OPFS inside WKWebView** that does not exist in
  Safari (https://github.com/wendylabsinc/opfs-checker, checked 2026-09-06) — unconfirmed
  by any Apple source, and OPFS availability under the `capacitor://` custom scheme is
  unverified → **G-201**.
- **Capacitor Filesystem plugin directory mapping on iOS** — read from the pinned
  plugin's own source in the spike (`@capacitor/filesystem@8.1.3`,
  `ios/Sources/FilesystemPlugin/IONFileStructures+Converters.swift:15-25` and
  `dist/esm/definitions.d.ts:19-90`) **[measured]**:

  | `Directory` value | iOS location | Files-app visible? | iCloud backup |
  |---|---|---|---|
  | `Documents` | `Documents/` | **Only if** `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace` are set (they are NOT in the generated Info.plist) | yes |
  | `Data` | **also `Documents/`** (aliased to `.document` in source) | same as Documents | yes |
  | `Library` | `Library/` | never | yes |
  | `LibraryNoCloud` (since plugin 7.1.0) | `Library/` marked not-synced | never | **no** |
  | `Cache` | `Caches/` | never | no — **OS may purge** |
  | `Temporary` | `tmp/` | never | no — OS may purge |

  The doc-string for `Data` confirms: "On iOS it will use the Documents directory"
  (https://capacitorjs.com/docs/apis/filesystem, checked 2026-09-06). So the
  "app-private, not in the user's Files app" requirement is met by **`Library` /
  `LibraryNoCloud`**, or by `Documents`/`Data` **only as long as the two Info.plist
  sharing keys are never added**.
- **Bridge transport is string-based**: `writeFile` takes `data: string | Blob` but the
  doc notes Blob is **web-platform only**; on iOS binary data crosses the bridge as
  **base64 strings** (https://capacitorjs.com/docs/apis/filesystem, checked 2026-09-06).
  Reads: `readFile` returns one base64/utf8 string; **`readFileInChunks()` exists since
  plugin 7.1.0** (callback-based, native-only) for memory-bounded reads **[measured —
  `definitions.d.ts:556`]**. `stat()` returns `mtime` and `ctime` in milliseconds
  (same doc page) — the timestamp requirement is satisfied natively, unlike OPFS.
- **Order-of-magnitude bridge cost**: the `capacitor-blob-writer` project benchmarks
  `Filesystem.writeFile` at **3.7 s for 8 MB on iOS** (old hardware, iPhone 6) vs 0.2 s
  for its streaming approach, and reports 32 MB base64 writes crashing the webview; it
  works by streaming PUTs to a localhost HTTP server; v1.1.20 supports Capacitor 8 + SPM
  (https://github.com/diachedelic/capacitor-blob-writer, checked 2026-09-06).
  Extrapolated to this project's 1.16 MB project JSON that is sub-second even on decade-old
  hardware, but per-save cost on the target iPad is unmeasured → **G-203**.

### Q4 — Serving local files by URL (G-08)

- `Capacitor.convertFileSrc()` rewrites a device `file://` path to a webview-loadable
  URL — `file:///path/to/photo.jpg` → `<scheme>://localhost/_capacitor_file_/path/to/photo.jpg`
  — explicitly for use in `<img src>` after a `Filesystem.writeFile`
  (https://capacitorjs.com/docs/core-apis/web, checked 2026-09-06). The iOS handler
  (`WebViewAssetHandler`, a `WKURLSchemeHandler` registered for the `capacitor` scheme)
  serves both the `webDir` bundle and arbitrary `_capacitor_file_` paths, so an entire
  on-disk tree (e.g. a per-project `textures/` directory) is addressable by URL without
  copying — each file becomes `capacitor://localhost/_capacitor_file_/<abs path>`. This
  is same-origin with the app, so `fetch()` of `frames.json` from app storage should
  also work; `fetch`-vs-`img` parity on-device is a cheap confirmation → **G-208**.

### Q5 — mDNS from Capacitor (G-02)

- **No official Capacitor plugin.** Community: **`capacitor-zeroconf`** (trik/capacitor-zeroconf),
  latest **4.0.0**, published **2025-05-09**, peerDeps `@capacitor/core >= 7.0.0` —
  registry queried directly **[measured 2026-09-06]**. It is a port of the Cordova
  ZeroConf plugin supporting **both browse (`watch`) and advertise (`register`)** on
  iOS/Android/Electron, with the stated caveat that it is **not a background service** —
  publish/watch stop when the webview is destroyed
  (https://github.com/trik/capacitor-zeroconf, checked 2026-09-06). A fork
  (`capacitor-zeroconf-lt`) is stale (2022, Capacitor 3) **[measured]**.
- iOS requirements carried over from the companion app apply identically:
  `NSBonjourServices` must list `_pixelart._tcp` (silently fatal if missing — this
  repo's own measured finding, MASTER §4) plus `NSLocalNetworkUsageDescription`.
- Honest answer: a maintained-ish community plugin **exists** (14 months old, one major
  behind on peerDeps but a `>=` range that admits 8.x); compatibility with Capacitor
  8.5.1 and advertise-mode behavior under app lifecycle is unverified → **G-205**. A
  custom Swift plugin wrapping `NWBrowser`/`NWListener` is a modest, well-trodden
  fallback (ios-companion already contains working Bonjour browse code in Swift).

### Q6 — Inbound listeners (G-04)

- **Confirmed: there is no Capacitor-blessed way for the webview to accept inbound
  connections.** Web content has no listening-socket API, and Capacitor's official
  plugin set (https://capacitorjs.com/docs/apis, checked 2026-09-06) contains no server
  plugin; Capacitor's own architecture docs describe only an *internal* asset handler,
  not an externally reachable server
  (https://ionicframework.com/docs/core-concepts/webview, checked 2026-09-06).
- Native-plugin escape hatches exist: **`@cantoo/capacitor-http-server`** — "Capacitor
  plugin exposing a local HTTP server on iOS and Android with routing delegated to
  JavaScript", latest **1.0.8** published **2026-08-12**, peerDeps
  `^6 || ^7 || ^8`, first published 2026-04 — registry queried directly
  **[measured 2026-09-06]** (repo: github.com/cantoo-scribe/capacitor-http-server).
  Young project, small ecosystem footprint; treat as an option to evaluate, not a
  foundation → **G-206**. `capacitor-blob-writer` (Q3) independently proves the
  embedded-localhost-server pattern works on iOS. Any such server still stops when iOS
  suspends the app (Q8), so "receive sync while backgrounded" is not achievable.

### Q7 — Toolchain vs house rules (G-11)

All **[measured 2026-09-06]** in the spike (`bun 1.3.5`, outside the repo):

- `bun x @capacitor/cli@8.5.1 --version` → `8.5.1`, exit 0. `cap init`, `cap add ios`,
  `cap sync ios`, `cap copy ios` all succeeded under Bun. Capacitor 8's "NodeJS 22+"
  requirement is satisfied because Bun 1.3.5 reports `process.version` **v24.3.0**.
- **Lockfile behavior**: `bun x` printed `Saved lockfile` but wrote it to Bun's global
  install cache, **not** the cwd (spike dir stayed empty). A plain `bun add` in the
  spike dir *did* create a local `bun.lock` — expected, since the repo's
  `bunfig.toml [install.lockfile] save = false` does not govern outside directories.
  Inside the repo the guard is that same bunfig plus the standing check; the repo stayed
  clean throughout (verification output below). **Task 08 must carry: every dependency
  is added with `bun add --exact`, and versions in `package.json` are exact strings.**
  The spike's `--exact` install wrote exact versions, no carets **[measured]**.
- **SPM is the default; CocoaPods is not needed.** `cap add ios` generated an SPM
  project (`ios/App/CapApp-SPM/Package.swift`, `swift-tools-version: 5.9`) with zero
  Podfile; both plugins were consumed as local SPM packages pointing into
  `node_modules` (`.package(name: "CapacitorFilesystem", path: "../../../node_modules/@capacitor/filesystem")`)
  **[measured]**. CocoaPods remains available via `cap add ios --packagemanager CocoaPods`
  (https://capacitorjs.com/docs/updating/8-0, checked 2026-09-06). Note the SPM
  node_modules paths mean **`bun install` must run before Xcode builds**.
- **Xcode**: requirement is 26.0+; installed is 26.6 (17F113) → OK **[measured]**.
- Generated project shape: `capacitor.config.json` `{appId, appName, webDir}` at the
  package root; web assets copied `webDir` → `ios/App/App/public/`; app skeleton is
  `AppDelegate.swift` + `SceneDelegate.swift` + `Info.plist` + `Assets.xcassets`
  **[measured]**.

### Q8 — Background behavior, memory, workers

- **JS in WKWebView is suspended when the app is backgrounded** — by design, same as any
  suspended app; no timers or callbacks run until foregrounded
  (https://developer.apple.com/forums/thread/64150, checked 2026-09-06; long-standing
  Cordova-era confirmation: https://issues.apache.org/jira/browse/CB-10657, checked
  2026-09-06). Consequence for autosave: pending work must be flushed synchronously-ish
  on Capacitor's `appStateChange`/`pause` event before suspension; the grace window is
  unmeasured → **G-207**. This also kills any embedded HTTP server or mDNS
  advertisement while backgrounded (Q5/Q6).
- **Memory**: there is no API to raise a WKWebView's memory limit; the
  `com.apple.WebKit.WebContent` process is jetsam-killed at a device-class-dependent
  ceiling (a 2026 report shows a hard 2048 MB ActiveHard limit on iPhone; "stable on
  iPad" in the same report: https://developer.apple.com/forums/thread/822200, checked
  2026-09-06; "not possible to increase… depends on total device RAM and current system
  load": https://developer.apple.com/forums/thread/119550, checked 2026-09-06). Large
  canvases/WebGL scenes are the documented way to hit it. The real number for this
  app's workload (300k-cell grids + three.js + export rasterization) on the owner's
  iPad is device-only → **G-202**.
- **Web Workers are fully supported** in WKWebView-era Safari (iOS Safari 5+ through
  current 26.x, no partial-support flags: https://caniuse.com/webworkers, checked
  2026-09-06) — relevant both for OPFS `createSyncAccessHandle` and for moving export
  rasterization off the main thread.

## Options

Storage backing for local mode (the task-05 decision this feeds; requirement: survive
OS pressure, app-private, invisible in Files app, timestamps for backup rotation,
handles 1.16 MB JSON + ≤50 backups/day + 264 PNGs per export run):

| | Capacitor Filesystem (`Directory.Library` / `LibraryNoCloud`) | OPFS | IndexedDB | Preferences |
|---|---|---|---|---|
| Eviction safety | **Native app container — never OS-evicted** (only Cache/tmp are purgeable) | Webview origin storage: 15%/20% quota + LRU eviction per WebKit policy | Same webview eviction; Capacitor docs explicitly warn | Native, safe |
| Files-app visibility | Invisible (Library; Documents only visible if sharing keys added) | Invisible | Invisible | Invisible |
| iCloud backup control | Yes — `LibraryNoCloud` opts out | No control | No control | No |
| Timestamps | `stat()` → mtime+ctime ms | `getFile().lastModified` only, no dir times, no ctime | manual | n/a |
| 1 MB+ transfer cost | base64 across bridge (~seconds at 8 MB on 2015 HW; fine at 1 MB, G-203); `readFileInChunks` for reads | in-process, fast; but main-thread writes need iOS 26 / else worker-only; unverified in `capacitor://` origin (G-201) | structured-clone, fine | strings only, "small data" per docs |
| Debuggability (pull data off device) | Real files in app container (Finder/Xcode container download) | Opaque origin store | Opaque | plist |
| Verdict | **Primary** | Perf cache at best until G-201 resolved | No | Config/flags only (e.g. mode, last-server) |

Fallbacks noted, not recommended: SQLite plugins (Capacitor's storage guide suggestion —
overkill: the server's persistence is already file-shaped, `backup.ts` wants a VFS);
`capacitor-blob-writer`-style localhost streaming if G-203 measurement shows base64 is
too slow at real sizes.

## Recommendation

The platform configuration to bet on:

- **Pins** (task 08 must write these exactly, added via `bun add --exact`):
  `@capacitor/core@8.5.1`, `@capacitor/cli@8.5.1`, `@capacitor/ios@8.5.1`,
  `@capacitor/filesystem@8.1.3`, `@capacitor/preferences@8.0.1`. iOS deployment target
  15.0 (Capacitor 8 default; owner hardware is iOS 17+ per ios-companion). Xcode 26.6 on
  this machine builds it. **SPM, no CocoaPods.**
- **Origin**: accept `capacitor://localhost` (default). Do not fight the scheme. Remote
  mode must construct fully-qualified `http://host:port` URLs for `/api`, `/exports`,
  and `ws://` — the runtime server-URL config the port needs anyway (G-12). `Info.plist`
  gains `NSAllowsLocalNetworking`, `NSLocalNetworkUsageDescription`, and
  `NSBonjourServices: _pixelart._tcp`.
- **Storage**: Capacitor **Filesystem plugin over `Directory.Library`** (decide
  `LibraryNoCloud` vs `Library` = iCloud-backup opt-in as a product question for task
  05/07); `Preferences` for mode + last-known-server config; **never** put project data
  in IndexedDB/localStorage/OPFS (webview-evictable per WebKit policy). Serve exported
  textures to the preview UI via `convertFileSrc` URLs instead of copying into the
  bundle.
- **mDNS**: plan A `capacitor-zeroconf@4.0.0`, verified early against Capacitor 8 in a
  spike (G-205); plan B a small custom Swift plugin reusing ios-companion's proven
  Bonjour code. Advertise-while-app-open only; no background operation.
- **Inbound sync listener**: design device↔device sync around **outbound-only**
  connections from the webview, or gate any "receive" role on an explicitly opened,
  foreground-only embedded server (`@cantoo/capacitor-http-server` as candidate, G-206)
  — never on background listening, which iOS suspension forbids.
- **Autosave**: flush on Capacitor's `appStateChange` before suspension (G-207); do all
  heavy rasterization in Web Workers to keep peak memory and main-thread stalls down
  (G-202).

## Gaps

### G-201 · NEEDS-MEASURE · OPFS availability/limits inside the `capacitor://localhost` origin
**Evidence:** OPFS shipped in WebKit (webkit.org/blog/12257, checked 2026-09-06) but an
unofficial checker claims a 10 MB per-file cap in WKWebView absent from Safari
(github.com/wendylabsinc/opfs-checker, checked 2026-09-06); no Apple documentation of
that cap found; OPFS under a custom `WKURLSchemeHandler` scheme untested.
**Impact:** Only matters if task 05 wants OPFS as a fast cache; primary recommendation
(Filesystem plugin) is unaffected.
**Special measure:** 20-line probe page in a device build: `getDirectory()`, write 1 KB /
1 MB / 11 MB via worker `createSyncAccessHandle`, report `navigator.storage.estimate()`.

### G-202 · NEEDS-MEASURE · Real webview memory ceiling on the owner's iPad under this app's workload
**Evidence:** No API to raise the limit; jetsam ceiling is device-class dependent
(developer.apple.com/forums/thread/119550 and /thread/822200, both checked 2026-09-06).
**Impact:** Export rasterization (264 PNGs) + three.js + 300k-cell grids in one webview
could hit WebContent's ceiling and kill the page (silent white-screen, not an error).
**Special measure:** Device run with `performance.memory`-style instrumentation /
`webViewWebContentProcessDidTerminate` logging via the existing debug-log sink
(memory: dev-only `/api/debug/log`) while running a full export on the real project.

### G-203 · NEEDS-MEASURE · Filesystem bridge cost per save at real payload sizes on target iPad
**Evidence:** Only third-party benchmarks on 2015-era hardware exist (3.7 s per 8 MB
base64 write on iPhone 6, github.com/diachedelic/capacitor-blob-writer, checked
2026-09-06).
**Impact:** Save path = 1.16 MB JSON (+ gzip backup) per autosave tick; export writes
264 small PNGs = 264+ bridge calls; if per-call latency is ~ms it's fine, if ~tens of ms
the export path needs batching.
**Special measure:** Time `writeFile` at 1 KB/100 KB/1.16 MB and a 264-file burst in the
device spike; compare `readFileInChunks` vs whole-file reads.

### G-204 · NEEDS-MEASURE · Whether webview-storage eviction/persist() heuristics differ for the `capacitor://` origin
**Evidence:** WebKit policy documents app-classified quotas and heuristic `persist()`
grants (webkit.org/blog/14403, checked 2026-09-06) but does not address custom-scheme
origins or in-app grant behavior.
**Impact:** Low for the recommended design (no critical data in webview storage); would
matter only if a fallback design leaned on IndexedDB.
**Special measure:** Call `navigator.storage.persist()`/`estimate()` in the device spike
and record results; otherwise simply keep critical data out of webview storage.

### G-205 · DESIGN-RISK · `capacitor-zeroconf@4.0.0` is one major behind and unverified on Capacitor 8
**Evidence:** peerDeps `@capacitor/core >= 7.0.0`, published 2025-05-09, registry query
[measured 2026-09-06]; browse+advertise documented but "not a background service"
(github.com/trik/capacitor-zeroconf, checked 2026-09-06).
**Impact:** Discovery in remote mode and advertise in device↔device sync depend on it;
a silent incompatibility with Capacitor 8.5.1 would surface late.
**Special measure:** Add it to the first device spike (install, register+watch
`_pixelart._tcp` against the real server). Fallback: custom Swift plugin reusing
ios-companion's Bonjour browse/`ServerProbe` logic — small, already-proven code.

### G-206 · DESIGN-RISK · Inbound-connection capability rests on one young community plugin
**Evidence:** No official server plugin exists (capacitorjs.com/docs/apis, checked
2026-09-06); `@cantoo/capacitor-http-server@1.0.8` first published 2026-04, registry
query [measured 2026-09-06].
**Impact:** Any sync design where the iPad *receives* a connection depends on
unaudited third-party native code, foreground-only (Q8 suspension).
**Special measure:** Prefer outbound-only sync topology (task 06); if a listener is
required, audit/vendor the plugin (~small Swift surface) and gate it behind an explicit
foreground-only "receive window" UI — which the owner's request already demands.

### G-207 · NEEDS-MEASURE · Suspension grace window for flushing autosave on `appStateChange`
**Evidence:** JS fully suspends in background (developer.apple.com/forums/thread/64150,
checked 2026-09-06); how much wall-clock the webview reliably gets between the pause
event and suspension is undocumented.
**Impact:** A 1.16 MB serialize + base64 bridge write racing suspension could truncate
or skip a save (the atomic temp-file+rename pattern from `backup.ts` prevents
corruption, but the save could be lost).
**Special measure:** Device-measure time-to-suspend; if tight, use the native
`beginBackgroundTask` pattern (plugin-side) to extend, and keep the atomic-rename VFS
contract from task 01/05.

### G-208 · NEEDS-MEASURE · `fetch()` + full-tree serving via `_capacitor_file_` URLs (exports preview)
**Evidence:** `convertFileSrc` documented for `<img src>` (capacitorjs.com/docs/core-apis/web,
checked 2026-09-06); same-origin `fetch` of such URLs and per-file behavior over a
264-file tree not explicitly documented.
**Impact:** `ExportPreviewModal` loads textures by URL and `fetchFramesJson` fetches
JSON outside `API_BASE` (MASTER §4); if fetch of `_capacitor_file_` worked only for
media, the preview path would need a service-worker or read-through fallback.
**Special measure:** Device spike: `fetch()` a JSON and an `<img>` PNG from
`Directory.Library` via `convertFileSrc`; confirm subdirectory paths and content-types.

### G-209 · NEEDS-MEASURE · Full Capacitor CLI surface under Bun beyond init/add/sync/copy
**Evidence:** `cap init/add ios/sync/copy` all pass under `bun x` [measured 2026-09-06];
`cap run ios` / `cap open ios` (device deploy, Xcode launch) not exercised in this spike
(no device build per task instructions).
**Impact:** If a later CLI command shells out to `node` explicitly it would fail on this
machine (node not on PATH).
**Special measure:** Exercise `cap open ios`/`cap run ios` under Bun in the first
device-build task; fallback is invoking Xcode directly (`xcodebuild`/GUI), which needs
no Node at all.
