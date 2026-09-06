# GAPS — Capacitor iPad analysis

Everything identified so far that the tech stack **cannot support as-is** and would need
special measures, plus unverified assumptions and decisions only the owner can make.

- **Seeded 2026-09-06** during plan writing, from a measured exploration of the repo
  (see MASTER.md §4). These entries are evidence-backed but pre-analysis.
- **Maintained by task 07 only.** W1 tasks record new gaps in their own findings file
  (`G-<task>xx` numbering, format per MASTER D6); task 07 merges them here with final
  numbers and keeps the cross-reference table at the bottom. Task 09 may update the
  Status column.
- Severities: `BLOCKER` · `NEEDS-MEASURE` · `DESIGN-RISK` · `PRODUCT-DECISION` (MASTER D6).

Status values: `OPEN` · `MEASURED` (verified by a task; see xref) · `DECIDED` (owner) ·
`CARRIED` (transferred into docs/11 GAPS.md with a mitigation task).

---

### G-01 · BLOCKER · sharp cannot run in a browser
**Evidence:** `server/package.json` (sharp 0.33.5, native libvips prebuilds in
`node_modules/@img/sharp-darwin-arm64`); sole call site `server/src/export/raster.ts:79-93`.
**Impact:** The export pipeline's PNG encode step has no browser equivalent as written.
Surface is tiny (raw RGBA → palettized PNG, 14 LOC) but any replacement encoder emits
different PNG bytes, failing the byte-identity golden gate
(`server/src/__tests__/export-golden.test.ts`; W2b measured 214/232 PNGs changed from a
mere sharp version bump). Texture *filenames* and `frames.json` survive (hash is over raw
RGBA, `raster.ts:29`).
**Special measure:** Inject `pngEncode` via the platform adapter: sharp on the standalone
server, a JS/WASM encoder (task 04 chooses) in the webview. Byte-identity across the two
targets is then unattainable — see G-14 for the product decision this forces.
**Status:** OPEN

### G-02 · BLOCKER · Bonjour/mDNS is impossible in a webview
**Evidence:** `bonjour-service` 1.4.4 needs raw UDP (`dgram`); browsers expose no UDP
sockets. Advertise side: `server/src/discovery.ts`. Browse side: native Swift
(`ios-companion/PixelArtCompanion/Discovery/`).
**Impact:** The Capacitor app's `remote` mode cannot *discover* servers from JS, and the
`local` mode cannot *advertise* itself; the "find a server" requirement cannot be met by
web code at all.
**Special measure:** Native code — a Capacitor plugin (community mDNS plugin, verified by
task 02, or a custom plugin porting the existing, battle-tested Swift discovery pipeline
from ios-companion). The probe/verify step (`GET /api/discovery`) IS portable JS.
**Status:** OPEN

### G-03 · BLOCKER · The ai-service can never run on-device
**Evidence:** `ai-service/requirements.txt` (torch, opencv, CUDA-gated RIFE);
auto-detects GPU via `nvidia-smi` (`ai-service/server.py:32-74`).
**Impact:** Frame interpolation on a local-mode iPad requires a *remote* ai-service.
Today the client reaches it via the Express proxy (`server/src/routes/ai.ts`), which
won't exist in-process… actually it will — `routes/ai.ts` is pure global-`fetch` code
and ports fine — but the request then originates from the webview origin, not from a
server.
**Special measure:** Keep `routes/ai.ts` logic in the in-browser server (it is already
browser-compatible); the FastAPI service already sets `allow_origins=["*"]` but task 02
must verify the Capacitor origin (`capacitor://localhost`) passes CORS + non-HTTPS ATS.
Feature degrades to the existing `UnavailableStep` when unreachable — already built.
**Status:** OPEN

### G-04 · BLOCKER · A webview cannot accept inbound connections
**Evidence:** No listening-socket API exists in any browser/webview JS environment;
`server/src/sync.ts` uses `ws.WebSocketServer`, Node-only.
**Impact:** Two requirements collide with this: (a) device↔device sync — the *receiving*
iPad must accept a connection; (b) "run locally" cannot host `/ws` or serve other
devices. A pure-web Capacitor app can only ever *originate* connections.
**Special measure:** Options for task 06: native TCP/HTTP listener plugin on the
receiving device; or relay through a standalone server both devices dial out to; or
explicitly scope device↔device sync out of v1. Single-instance local mode itself needs
no sync server (client gates it behind `syncEnabled`, `ApplicationStore.ts:865`).
**Status:** OPEN

### G-05 · DESIGN-RISK · WebCrypto has no MD5
**Evidence:** `server/src/backup.ts:37` uses `crypto` md5 for backup dedupe;
`crypto.subtle.digest` supports SHA-1/256/384/512 only.
**Impact:** Backup change-detection hashing fails in the webview as written.
**Special measure:** Adapter `hash` member: pure-JS md5 (tiny), or switch dedupe to
SHA-256 on both targets (changes only in-memory dedupe behavior, not any wire/disk
format — verify nothing persists the md5).
**Status:** OPEN

### G-06 · DESIGN-RISK · Browser gzip ≠ Node zlib bytes
**Evidence:** `server/src/export/write.ts:35` (gzip level 9, published artifact
`frames.json.gz`); `backup.ts:105-157` (day-roll `.gz`). `CompressionStream("gzip")`
gives no level control and a different deflate implementation — bytes will differ.
**Impact:** Byte-gated artifacts (`frames.json.gz`) diverge between targets even with
identical JSON inside; backup `.gz` files differ across targets (functionally fine,
byte-compared nowhere, but golden tests may pin them — task 01 verifies which tests pin
what).
**Special measure:** Adapter `gzip` member; standalone server keeps node:zlib. For the
webview either accept different bytes (decoded-content equality gate instead) or ship a
JS zlib (e.g. pako) configured to match — byte-match with node zlib level 9 is likely
but NOT guaranteed and must be measured (task 04).
**Status:** OPEN

### G-07 · NEEDS-MEASURE · iPad storage backing for a POSIX-ish VFS
**Evidence:** `backup.ts` needs readdir, `stat().mtime` sorting (`:199,:450`), rename,
recursive rm, mkdir -p, createWriteStream; scale: 1.16 MB project JSON, ≤50 backups/day,
264 texture PNGs per export. OPFS in WKWebView, its mtime absence, Capacitor Filesystem
plugin bridge latency per call, and iOS eviction/quota rules for each backing are all
unverified training-data claims until task 02/05 measure them.
**Impact:** Wrong backing choice surfaces late as data loss (eviction) or a slow export
(bridge round-trips × 264 files).
**Special measure:** Task 02 verifies platform facts; task 05 picks the backing and
specs the VFS, including an mtime strategy (sidecar metadata if the backing has none)
and the app-private location requirement (owner: NOT the user-visible Files app).
**Status:** OPEN

### G-08 · DESIGN-RISK · No static file server for `/exports` in local mode
**Evidence:** `server/src/index.ts:36` (`express.static`); the export preview fetches
`frames.json` with `base:""` (`client/src/api/resources/exportApi.ts:41`) and then loads
texture PNGs **by URL** (`ExportPreviewModal.tsx:442`) — a whole-tree URL contract,
not a single endpoint.
**Impact:** Direct method bindings cannot satisfy "load this PNG by URL"; the preview
breaks in local mode unless URLs resolve somewhere.
**Special measure:** Task 03 evaluates: blob/object URLs injected below `loadTextures`;
a service-worker scoped to `/exports/*` only; or Capacitor's WKURLSchemeHandler /
`convertFileSrc` serving the app-storage export tree. This is the one place D2 allows a
fallback mechanism.
**Status:** OPEN

### G-09 · NEEDS-MEASURE · In-process call cost for MB-scale payloads
**Evidence:** `express.json({limit:"50mb"})` (`index.ts:32`); Base Unit project =
1,164,725 B, 300,249 pixel cells; saves are debounced autosaves
(`AutoSaveController.ts`).
**Impact:** Bindings *remove* HTTP+JSON overhead — probably a win — but naive
implementations might deep-copy or re-stringify per save, or block the main thread
during in-browser export rasterization (currently the server's CPU). UI jank on a
tablet is the failure mode.
**Special measure:** Task 03/05 must state where serialization still happens (write to
disk needs bytes anyway), and whether the in-browser server runs on the main thread or
a Worker; mark main-thread export as NEEDS-MEASURE for the implementation plan.
**Status:** OPEN

### G-10 · DESIGN-RISK · Auth/accounts/encryption are 100% greenfield
**Evidence:** Zero auth, session, token, password, or email concept in client or server
(measured; `cors()` wide open; debug route comment: acceptable "on a local dev server
and nowhere else", `server/src/index.ts:43-44`).
**Impact:** The account + password + encryption requirements build on nothing; the
standalone server as shipped trusts its whole LAN. Bolting auth onto it changes its
public surface for every existing client (ios-companion probes included).
**Special measure:** Task 06 designs from scratch: WebCrypto AES-GCM at rest, key
derivation (PBKDF2 vs argon2-wasm), per-email namespacing, and the server's new
receive-window/auth endpoints, keeping the existing no-auth LAN mode as a compatibility
default if the owner wants it.
**Status:** OPEN

### G-11 · NEEDS-MEASURE · Capacitor toolchain vs Bun-only + no-lockfile policy
**Evidence:** Owner policy: no lockfile, ever; `bunx` measured to create one as a side
effect (CLAUDE.md); node/npm not on PATH. Capacitor CLI (`cap sync`, `cap add ios`)
historically assumes npm and CocoaPods/SPM tooling.
**Impact:** The build pipeline for the iOS app could violate standing policy or simply
not run under Bun.
**Special measure:** Task 02's spike (outside the repo) runs the actual CLI under Bun
and records what happens, including whether `bun x @capacitor/cli` writes a lockfile
and whether SPM integration (no CocoaPods) works on current Capacitor.
**Status:** OPEN

### G-12 · DESIGN-RISK · Vite config is not Capacitor-aware
**Evidence:** `client/vite.config.ts` — no `base` set; `envDir: ".."`;
`/ws` deliberately un-proxied (measured Vite bug note at lines 24-31); syncClient
hardcodes port fallback 3001 (`syncClient.ts:57-58`).
**Impact:** A Capacitor build served from `capacitor://localhost` breaks absolute-path
assumptions; conversely, changing `base` globally could break the dev web build —
"never break `bun run dev`" is a standing rule.
**Special measure:** Task 03 specs a mode-aware build (separate Vite mode/config for
the Capacitor target) rather than editing shared defaults.
**Status:** OPEN

### G-13 · DESIGN-RISK · "Explicit receive window" has no existing mechanism
**Evidence:** Requirement: remote server must explicitly open connections for a sync and
resist junk traffic; today the server has no admin surface at all (24 routes, none
gated).
**Impact:** Without design care this becomes either always-open (defeats the point) or
unusable ceremony.
**Special measure:** Task 06: time-boxed pairing window with short code (SAS/PAKE-style),
rate limiting, and an explicit server-side toggle (CLI prompt or authenticated route).
**Status:** OPEN

### G-14 · PRODUCT-DECISION · Byte-identity export gate vs dual encoders
**Evidence:** G-01/G-06; `export-golden.test.ts`; `server/exports/lib/` consumed by
external game code (OPEN-QUESTIONS Q33); sharp pin already flagged (Q45).
**Impact:** "Write once, both targets" and "bytes never change" cannot both hold for
PNG/gz artifacts. Someone must choose: re-baseline goldens to decoded-pixel equality,
or accept per-target golden sets, or keep export server-only.
**Special measure:** Task 04 lays out the options with measured consequences; task 07
puts it in DECISIONS-NEEDED.md. Not decidable by an agent.
**Status:** OPEN

### G-15 · PRODUCT-DECISION · Fate of ios-companion
**Evidence:** `ios-companion/` (~800 lines Swift) exists solely to find the server and
webview it; a Capacitor app with a `remote` mode duplicates it entirely.
**Impact:** Two iPad apps doing overlapping jobs, or a retirement decision.
**Special measure:** Analysis treats ios-companion as the reference implementation and
contract for `remote` mode (MASTER §1). Owner decides retire/keep in
DECISIONS-NEEDED.md.
**Status:** OPEN

---

## Cross-reference table (maintained by task 07)

| Final ID | Source (findings file · local ID) | Notes |
|---|---|---|
| G-01…G-15 | seeded at plan time | — |
