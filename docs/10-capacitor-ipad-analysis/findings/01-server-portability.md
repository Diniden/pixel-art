# Findings 01 — Server portability audit & platform adapter design

Task: `docs/10-capacitor-ipad-analysis/01-server-portability-audit.md` · Wave W1
Method: every production file under `server/src/` read in full (test bodies skimmed per
task step 1); every Node-builtin call site located by read + `grep -rn` over
`process.env`, `__dirname`, `Buffer`, `gunzip`. All line numbers below were read from
the working tree on 2026-09-06 (branch `feat/08-pose-camera-model-space`).

---

## Facts

### F1 — Verification of MASTER §4, with corrections

Confirmed at line level:

- **19 production files, 3,185 LOC total** (`wc -l` over `server/src/**/*.ts` minus
  `__tests__/`). Sum reproduced exactly.
- **No `child_process` and no `node:http` client anywhere.** The AI proxy uses global
  `fetch` exclusively (`server/src/routes/ai.ts:57,86,117,156,192,234`).
- **Exactly 7 `process.env` sites:** `index.ts:27` (PORT), `index.ts:35`
  (EXPORT_FOLDER), `discovery.ts:34` (CLIENT_PORT), `discovery.ts:104`
  (DISABLE_BONJOUR), `export/exportRouter.ts:40` (EXPORT_FOLDER), `routes/debugLog.ts:80`
  (NODE_ENV), `routes/ai.ts:27` (AI_SERVICE_URL).
- **3 `__dirname` declarations anchoring 4 paths:** `index.ts:5-6` (the `.env` file),
  `backup.ts:17-18` (`DATA_DIR`), `export/index.ts:37,42-43` (`DEFAULT_EXPORT_FOLDER`
  and `CLIENT_LIB_DIR`).
- **sharp is confined to one function:** `export/raster.ts:79-93` (`writePng`), options
  `{compressionLevel:9, palette:true, quality:100, effort:10}` at `raster.ts:85-92`.
- **`runExport()` is already Express-free:** `export/index.ts:58-126` takes
  `(projectName, exportBase)` and returns a plain `ExportResult`;
  `export/exportRouter.ts` is a 69-line Express wrapper around it.
- **`routes/project.ts` delegates all real work to `backup.ts`** — every handler body
  is validation + calls into the 13 functions imported at `routes/project.ts:4-17`.
- **`sync.ts` is notification-only:** the entire server→client protocol is `welcome`
  (`sync.ts:38-43`) and `project-saved` (`sync.ts:27-35`), "a notification, never a
  payload" (`sync.ts:8-9`). No client→server messages are handled at all —
  `wss.on("connection")` (`sync.ts:84-100`) registers only `close`/`error`.
- **No lockfile present** (`find . -maxdepth 2 -name 'bun.lock*'` → empty).

Corrections to MASTER §4 (evidence-backed; MASTER remains right in substance):

1. **MASTER's per-file list omits `export/transform.ts` (210 LOC)** from all three
   buckets. It is SHIM-light: pure transformation logic plus `join` from `"path"`
   (`transform.ts:18,65,87`) and Node `Buffer` in type positions.
2. **"`codegen.ts` (822 LOC)" is actually the sum of the six pure export modules**
   (naming 29 + pixelDecode 66 + exportTypes 217 + compactExport 168 + maxCanvas 114 +
   codegen 228 = 822). `codegen.ts` itself is 228 LOC.
3. **"byte-identity golden gate (`export-golden.test.ts`)" is inaccurate as stated** —
   that suite byte-compares nothing. See F3; recorded as G-101.
4. Measured bucket totals differ slightly from MASTER's estimates (see table): drop
   bucket is 464 LOC counting `index.ts` (replaced by entrypoints), not ~290.

### F2 — Portability table (all 19 production files)

Buckets: **PORTABLE** = compiles and runs in a browser bundle unchanged (or with only
the Express `Router` shell replaced by the transport-agnostic handler described in the
Recommendation). **SHIM** = needs `ServerPlatform` members. **DROP** = not applicable
in the webview target (kept for the Bun entrypoint).

| # | File | LOC | Node builtins / natives (line refs) | Bucket | Adapter members needed |
|---|---|---|---|---|---|
| 1 | `export/naming.ts` | 29 | none | PORTABLE | — |
| 2 | `export/pixelDecode.ts` | 66 | none | PORTABLE | — (text pinned, see F3) |
| 3 | `export/exportTypes.ts` | 217 | none (0 imports) | PORTABLE | — |
| 4 | `export/compactExport.ts` | 168 | none | PORTABLE | — |
| 5 | `export/maxCanvas.ts` | 114 | none | PORTABLE | — |
| 6 | `export/codegen.ts` | 228 | none (template-literal `import` strings at 149-150 are generated output, not module imports) | PORTABLE | — |
| 7 | `validation.ts` | 22 | none | PORTABLE | — |
| 8 | `routes/debugLog.ts` | 156 | `process.env.NODE_ENV` (80); Express `Router` (98) | PORTABLE | `env.get("NODE_ENV")`; handler shell. Dev-only; may be omitted from the webview entry entirely (`index.ts:45-48` already mounts it conditionally) |
| 9 | `routes/ai.ts` | 312 | `process.env.AI_SERVICE_URL` (27); global `fetch` only (57,86,117,156,192,234); Express `Router`; `loadConfig` from backup.ts (2,34,271,296) | PORTABLE | `env`; handler shell; `fs` transitively via `loadConfig` |
| 10 | `backup.ts` | 476 | `fs/promises`: writeFile 79, readFile 82/123/321/472, rename 88/146/383, unlink 94/219/396, mkdir 66, readdir 111/190/290/344/417/433, stat 198/293/424/444, rm 116/149; `fs`: existsSync 66/92/316/362/375/379/392/468, createWriteStream 132; `path` 12; `url` 13/17; `zlib` createGzip level 9 (133); `crypto` md5 (36-38) | SHIM | `fs.*` (full surface, F4), `gzip`, `hash.md5Hex`, `paths.dataDir` |
| 11 | `routes/project.ts` | 368 | `fs/promises` readFile 94, mkdir 26; `fs` existsSync 25/356; Express `Router`; `broadcastProjectSaved` + `ORIGIN_HEADER` (19,139-140) | SHIM | `fs.readTextFile/mkdir/exists`, `events.projectSaved`; handler shell |
| 12 | `export/index.ts` | 126 | `fs` existsSync 63; `fs/promises` readFile 73; `path` 17,42-43,69-70; `url` 18,37 (`__dirname`) | SHIM | `fs.exists/readTextFile/mkdir/join`, `paths.exportsDir`, `paths.clientLibDir` |
| 13 | `export/write.ts` | 67 | `fs` createWriteStream 36, existsSync 55; `fs/promises` cp 56; `stream` Readable 14 + pipeline 15 (33-37); `zlib` createGzip level 9 (35); `path` 16 | SHIM | `fs.writeTextFile/writeBinaryFile/copyDir/exists/join`, `gzip` |
| 14 | `export/raster.ts` | 93 | `crypto` sha256 (19,29-31); **sharp** (20,85-92); `Buffer.alloc` (38,61) | SHIM | `hash.sha256Hex` (**synchronous** — see G-102), `pngEncode`; `Buffer`→`Uint8Array` (G-103) |
| 15 | `export/transform.ts` | 210 | `path` join (18,65,87); `Buffer` in signatures (50,73) | SHIM | `fs.join` only; calls raster's `writePng` synchronously-queued (55-92); function text partially pinned (F3) |
| 16 | `export/exportRouter.ts` | 69 | Express `Router`; `process.env.EXPORT_FOLDER` (40) | SHIM | `env`/`paths.exportsDir`; handler shell around `runExport` |
| 17 | `discovery.ts` | 173 | `os.networkInterfaces` (1,73); `bonjour-service` raw UDP mDNS (2,113-125); `process.env` (34,104) | DROP | Node entry only. A webview cannot open UDP sockets; local mode has nothing to advertise. `/api/discovery` contract survives in *remote* mode via the unchanged Bun entry |
| 18 | `sync.ts` | 176 | `node:http` `Server` type (1); `ws` `WebSocketServer` (2,82) | DROP | Node entry only. Local mode is single-instance; the whole layer collapses to `events.projectSaved` = no-op (F6) |
| 19 | `index.ts` | 115 | dotenv (3-6), express+cors (8-9,26-36), `express.static` (36), `app.listen(PORT,"::")` (84), `process.on(SIGINT/SIGTERM)` (114-115), `process.exit` (109,111) | DROP (replaced) | Becomes the Bun entrypoint (`entry-node`); the webview gets a sibling entry. See Recommendation |

Measured totals: PORTABLE 1,312 LOC (rows 1-9) · SHIM 1,409 LOC (rows 10-16) ·
DROP/replace 464 LOC (rows 17-19). Sum 3,185. The write-once core (PORTABLE + SHIM)
is 2,721 LOC ≈ 85% of the server.

Non-handler HTTP surfaces that do **not** reduce to bindings (for task 03):
`express.static(exportsDir)` at `/exports` (`index.ts:35-36`), the `/ws` websocket
(`sync.ts:47,82`), `/health` (`index.ts:51-53`), `/api/discovery` (`index.ts:58-76`).

### F3 — What the three test suites actually pin (the G-06 question)

- **`server/src/__tests__/export-golden.test.ts` (322 lines) byte-compares NOTHING.**
  Despite the name, it is pure-function characterisation: `toKebabCase`/`toPascalCase`
  (25-88), `resolveVariantOffset` (97-155), `applyMaxCanvas` incl. the pinned `-0`
  offsets (198-285), `isValidProjectName` (290-322). It reads no golden files, no PNGs,
  no `.gz`.
- **`normalizePixel.test.ts` (242 lines)** pins M7/M8 behaviour **and contains
  source-fidelity guards that pin production text character-for-character**: the exact
  body of `normalizePixel` in `pixelDecode.ts` (test lines 194-206) and the M8
  expression in `transform.ts` (208-219), plus branch-ordering (233-241). It reads
  those two source files with `readFileSync` (41-48). **Consequence for the adapter:
  those two function bodies must not be edited by the port — neither needs to be, both
  are pure.**
- **`debugLogGate.test.ts` (31 lines)** pins only `isDebugLogEnabled` env behaviour.
- **No test anywhere in `server/src` reads or compares backup `.gz` bytes, exported
  PNG bytes, or `frames.json.gz` bytes** (`grep -rn 'gz|\.png|golden|byte'` over
  `__tests__/` — only the two `readFileSync` source-guard hits). The "byte-identity
  gate" is a *manual* procedure: "Re-export and `diff -r` against goldens after any
  change here" (`export/index.ts:9-12`). Backup `.gz` bytes are additionally
  write-only: **no `gunzip`/`createGunzip` call exists in `server/src`** (grep, 0
  hits); `listBackupsForProject` skips non-directories (`backup.ts:426`) and
  `readBackupFile` reads only plain `.json` (`backup.ts:466-472`). So gzipped backups
  are never read back by any code path — their bytes matter only for a human
  hand-decompressing an archive. Recorded as G-101.

### F4 — The exact `fs` surface the SHIM files call

Enumerated from `backup.ts` + `routes/project.ts` + `export/index.ts` +
`export/write.ts` (the only fs callers):

| Operation | Call sites | Semantics the adapter must honour |
|---|---|---|
| read text file (utf-8) | backup.ts:82,123,321,472; project.ts:94; export/index.ts:73 | — |
| write text file (utf-8) | backup.ts:79 (only via `safeWriteFile`) | — |
| write binary/stream | backup.ts:132-146 (`.gz` temp), write.ts:33-37 (`frames.json.gz`) | buffer-in is sufficient; streams are an implementation detail (largest payload is the 1.1 MB project JSON / its gzip) |
| atomic rename | backup.ts:88,146,383 | **atomicity within a directory is the whole point of `safeWriteFile` (backup.ts:74-100)** |
| read-back verify | backup.ts:82-85 | write must be re-readable immediately; content compared for equality before rename |
| exists (currently **sync**) | backup.ts:66,92,316,362,375,379,392,468; project.ts:25,356; export/index.ts:63; write.ts:55 | `projectExists` (backup.ts:361-363) is the one *exported* sync API — must become async in the shim (G-108) |
| mkdir recursive | backup.ts:66-68; project.ts:26 | — |
| readdir (names only) | backup.ts:111,190,290,344,417,433 | — |
| stat → mtime | backup.ts:198-199 (backup ordering), 444-450 (listing order) | **mtime must be stable and monotonic in the storage backing** (G-109; backing choice is task 05's) |
| stat → isDirectory | backup.ts:293-296,424-426 | — |
| unlink | backup.ts:94,219,396 | — |
| rm recursive+force | backup.ts:116,149 | — |
| recursive dir copy | write.ts:56 (`cp(clientLibDir, libDestDir, {recursive, force})`) | only caller is `copyClientLib` — see G-106 |
| path join | backup.ts:18-20 etc.; transform.ts:65,87; export/index.ts:42-43,69-70; write.ts:29,32,54,65 | all POSIX-style relative joins under three root anchors; a pure-JS join suffices |

Non-fs adapter touchpoints:

- **gzip level 9, two sites:** `backup.ts:133` (day-folder archive) and `write.ts:35`
  (`frames.json.gz`, whose bytes are "part of the published artefact",
  write.ts:7-9). No gunzip site exists (F3). Encoder parity is task 04's (G-107).
- **hash, two algorithms:** md5-hex of project JSON for backup dedupe
  (`backup.ts:36-38`) and sha256-hex-12 of raw RGBA for texture filenames
  (`raster.ts:29-31`). Both are called **synchronously** — `bufferHash` inside
  `ensureColorTexture`/`ensureNormalTexture` (`transform.ts:55,77`) runs in a sync
  code path. WebCrypto (`crypto.subtle.digest`) is Promise-only → G-102.
- **pngEncode:** the only sharp usage, `raster.ts:79-93`: raw RGBA buffer + width +
  height + channels:4 → palettized PNG **file at `outPath`**. Adapter signature should
  split encode (bytes→bytes) from the write (routed through `fs`), so task 04's
  encoder choice and task 05's storage choice stay independent.
- **env:** the 7 sites in F1. Only `EXPORT_FOLDER`, `AI_SERVICE_URL`, `NODE_ENV`
  matter to the shared core; `PORT`/`CLIENT_PORT`/`DISABLE_BONJOUR` belong to the
  Node entry alone.

### F5 — Events: what replaces the `project-saved` broadcast

Producer chain today: `POST /api/project` handler reads the saving tab's identity from
the `x-pixel-art-origin` header (`sync.ts:55`, read at `routes/project.ts:139`) and
calls `broadcastProjectSaved(projectName, origin)` (`routes/project.ts:140` →
`sync.ts:121-140`), which sends `{type:"project-saved", projectName, origin, at}` to
every ws client except the origin.

Consumer chain: `client/src/api/client/syncClient.ts` — the client's only `WebSocket`
(constructed at `syncClient.ts:131`) — parses the message (`syncClient.ts:146-164`)
and invokes `onProjectSaved` (`syncClient.ts:41,161-163`). That callback is wired by
`ApplicationStore` (opt-in `syncEnabled`, MASTER §4) into
`client/src/stores/session/SyncController.ts`, whose reload default is
`domain.refreshFromServer` (`SyncController.ts:74-77`) — deliberately not
`loadProject`, to avoid unmount flash (`SyncController.ts:4-11`).

Conclusion: the protocol exists solely so *another* tab/process of the same server
reloads. **Local mode is single-instance by definition (one webview, one embedded
server), so `events.projectSaved` is correctly a no-op there** — matching the task
brief. Remote mode keeps today's ws path unchanged (Node entry). Two design notes for
the handler layer: (a) `origin` must become an explicit `saveProject` parameter, since
bindings have no headers; (b) the client-side decision of whether to even construct a
`SyncClient` in local mode is task 03's.

### F6 — Monorepo/build ground truth for task 08's wiring question

- **No `workspaces` field in any `package.json`** — root (read 2026-09-06; scripts use
  `--cwd` and `install:all` does three separate `bun install`s), `client/package.json`
  (verified `workspaces: null`), `server/package.json`. Three independent install
  roots, no lockfiles anywhere (policy).
- **Server compiles as NodeNext ESM:** `server/tsconfig.json` sets
  `module/moduleResolution: NodeNext`, `type: "module"` in `server/package.json`, and
  every relative import carries a `.js` extension (e.g. `export/index.ts:20-35`,
  `backup.ts` imports). Whether Vite/esbuild resolves `./x.js` → `x.ts` when bundling
  these files into the client is unverified here → G-103 (task 02's platform lane).
- **Client aliasing is triple-mirrored by design:** `client/aliases.ts` (single source,
  `@ui`/`@stores`/`@api`/`@test`/`@`) feeds vite+vitest configs; tsconfig `paths` is a
  hand-mirror (`aliases.ts:1-25`). Adding a server alias means touching all three.
- **`server/src/data/` lives INSIDE the source tree** (`backup.ts:17-18`:
  `DATA_DIR = join(__dirname, "data")`) — any bundling scheme that sweeps
  `server/src/**` into the client must exclude it (it is gitignored but present on
  disk, 1.1 MB+ of owner data).
- Server dev runs uncompiled under Bun (`bun --watch src/index.ts`,
  `server/package.json`), so a reshaped entry file changes no build tooling.
- Boundary enforcement infrastructure already exists to extend:
  `client/scripts/check-boundaries.mjs` + ESLint flat configs (MASTER §4 "Repo state").

---

## Options

### A. Adapter granularity

1. **One `ServerPlatform` object, injected once per entrypoint (D3 as locked).**
   Modules receive it via an explicit init call or constructor param.
   *For:* matches D3; single seam; trivially testable with an in-memory fake.
   *Against:* `backup.ts`'s 13 exports are today plain module functions with
   module-level constants (`DATA_DIR`, `backup.ts:17-20`) — they need either a
   module-level `setPlatform()` (ambient, slightly impure) or conversion to a
   factory/class (`createBackupService(platform)`), a larger but mechanical diff.
2. **Per-concern adapters** (separate `Vfs`, `Codec`, `EventBus` injected where used).
   *For:* smaller per-module signatures. *Against:* re-decides D3's shape; multiplies
   entrypoint wiring; no measured benefit at 7 shimmable files.
3. **Global substitution via bundler aliasing of `node:fs` etc.** (polyfill-style).
   *For:* near-zero source diff. *Against:* the anti-pattern MASTER §8 warns about in
   disguise — behaviour forks silently inside a shim nobody reads; `sharp` has no
   browser polyfill at all; mtime/atomic-rename semantics get faked invisibly. Rejected.

### B. Handler/transport shape

1. **Extract each route body into a transport-agnostic handler function; Express files
   become thin `(req,res)` mappers.** The precedent already exists in-tree —
   `exportRouter.ts` is exactly this wrapper around `runExport`
   (`export/exportRouter.ts:22-56`), and `routes/project.ts` bodies are already just
   validation + `backup.ts` calls.
2. **Service-worker fetch interception** (keep HTTP shapes, fake the network).
   D2 relegates this to fallback for specific sub-problems (the `/exports` static
   tree); not the primary transport.

### C. Getting server TS into the client bundle (decision itself belongs to task 08)

1. **Path alias into the server tree** (e.g. `@server-web` →
   `server/src/entry-web.ts` added to `client/aliases.ts` + tsconfig mirror + Vite
   `server.fs.allow`). *For:* no package.json/workspace changes, no install-graph
   changes, no lockfile risk, smallest structural diff; boundary can be enforced by
   extending `check-boundaries.mjs` (only `entry-web` importable, nothing under
   `server/src/data/`). *Against:* server code compiles under two tsconfig regimes;
   `.js`-specifier resolution unverified (G-103); server's `@types/node` ambience can
   leak into client type-checking; no hard package boundary.
2. **Introduce Bun workspaces + a real shared package** (`packages/server-core`).
   *For:* hard boundary, one compilation story, the "right" long-term shape.
   *Against:* restructures three install roots and moves ~2,700 LOC; the retired
   refresh explicitly scoped this out (`export/exportTypes.ts:17-19` cites MASTER §9.4
   of that plan) — that constraint is historical, but the caution about churn stands;
   workspaces change `bun install` behaviour repo-wide under a no-lockfile policy.
3. **Consume the server's compiled `dist/`** (server `tsc` → client imports JS+d.ts via
   alias). *For:* sidesteps TS-interop entirely. *Against:* adds a build-ordering
   dependency to `bun run dev`; worse DX (no source-level types/HMR into server code).

---

## Recommendation

Adopt **A1 + B1 + C1**: one injected `ServerPlatform`, route bodies extracted to
transport-agnostic handlers, and a path-alias bundling scheme — with C2 (workspace
package) as the designated fallback if task 02's measurement of G-103 fails. Argued:
A1 is locked by D3 and the factory conversion is mechanical; B1 formalises a shape the
tree already half-has (`runExport`); C1 is the only option that changes zero
`package.json` files under a standing no-lockfile policy, and its main weakness
(soft boundary) is answerable with the existing `check-boundaries.mjs` harness.

### R1 — `ServerPlatform` interface (draft; sketch only, lives nowhere in `src/`)

```ts
/** Injected once per entrypoint. Working name per MASTER D3. */
export interface ServerPlatform {
  fs: {
    // text (utf-8)
    readTextFile(path: string): Promise<string>;          // backup.ts:82,123,321,472; project.ts:94; export/index.ts:73
    writeTextFile(path: string, content: string): Promise<void>; // backup.ts:79
    // binary
    writeBinaryFile(path: string, bytes: Uint8Array): Promise<void>; // backup.ts:132-146; write.ts:33-37
    // structure
    exists(path: string): Promise<boolean>;               // replaces every existsSync site (F4); G-108
    mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>; // backup.ts:66; project.ts:26
    readdir(path: string): Promise<string[]>;             // backup.ts:111,190,290,344,417,433
    stat(path: string): Promise<{ mtimeMs: number; isDirectory: boolean }>; // backup.ts:198,293,424,444 — mtime is load-bearing (G-109)
    rename(from: string, to: string): Promise<void>;      // MUST be atomic-within-dir: backup.ts:88 (safeWriteFile), 146, 383
    unlink(path: string): Promise<void>;                  // backup.ts:94,219,396
    rm(path: string, opts: { recursive: boolean; force: boolean }): Promise<void>; // backup.ts:116,149
    copyDir(from: string, to: string): Promise<void>;     // write.ts:56 only (copyClientLib — G-106)
    join(...segments: string[]): string;                  // pure; replaces node:path join everywhere
  };

  /** Level must be honoured or its absence declared — bytes are published (write.ts:7-9). Owned by task 04 (G-107). */
  gzip(data: Uint8Array | string, opts?: { level?: number }): Promise<Uint8Array>;
  // NOTE: no gunzip member — zero server call sites exist (F3). Add only when a reader appears.

  /** Both SYNCHRONOUS by requirement (transform.ts:55,77 call bufferHash in sync paths) — G-102. */
  hash: {
    md5Hex(text: string): string;         // backup.ts:36-38 — dedupe only, not security (seeded G-05)
    sha256Hex(bytes: Uint8Array): string; // raster.ts:29-31 — first 12 hex chars name every texture
  };

  /** Encode only; the write goes through fs. Signature mirrors raster.ts:79-93 usage. Encoder choice: task 04. */
  pngEncode(rgba: Uint8Array, width: number, height: number): Promise<Uint8Array>;

  /** The three vars the shared core reads (F1/F4). PORT/CLIENT_PORT/DISABLE_BONJOUR stay in the Node entry. */
  env: { get(name: "EXPORT_FOLDER" | "AI_SERVICE_URL" | "NODE_ENV"): string | undefined };

  /** Replaces broadcastProjectSaved (project.ts:140 → sync.ts:121-140). Local mode: no-op (F5). */
  events: { projectSaved(projectName: string, origin: string | null): void };

  /** Replaces the three __dirname-anchored roots (backup.ts:18; export/index.ts:42-43). Backing: task 05. */
  paths: { dataDir: string; exportsDir: string; clientLibDir: string | null };
}
```

Shim consequences worth naming now: `safeWriteFile`'s temp-write → read-back compare →
atomic rename contract (`backup.ts:74-100`) is expressible entirely in these members
and must be preserved verbatim; `projectExists` goes async (G-108); `Buffer.alloc` in
`raster.ts:38,61` becomes `new Uint8Array` (byte-identical zero-fill, hashes
unaffected — but raster.ts is "the most byte-sensitive module", `raster.ts:6`, so the
change re-runs the manual golden diff); the pinned function texts in `pixelDecode.ts`
and `transform.ts` (F3) require no edits and must receive none.

### R2 — Dual entrypoints

```ts
// server/src/entry-node.ts — today's index.ts reshaped: "assemble Express + node adapter"
import { createNodePlatform } from "./platform/node.js"; // fs/promises, zlib, node:crypto, sharp, process.env,
                                                         // events → broadcastProjectSaved (sync.ts)
import { createHandlers } from "./handlers/index.js";    // the transport-agnostic core (R3)

const platform = createNodePlatform();          // also: dotenv (index.ts:5-6), __dirname path anchors
const handlers = createHandlers(platform);

const app = express();
app.use(cors());                                // index.ts:31
app.use(express.json({ limit: "50mb" }));       // index.ts:32
app.use("/exports", express.static(platform.paths.exportsDir)); // index.ts:35-36
mountHttp(app, handlers);                       // (req,res) → handler call → status mapping (R3 error table)
app.get("/health", ...); app.get("/api/discovery", ...);        // index.ts:51-76, Node-only
const server = app.listen(Number(PORT), "::", ...);             // index.ts:84
attachSyncServer(server);                       // index.ts:98 — ws stays Node-only
// SIGINT/SIGTERM shutdown as today (index.ts:102-115)
```

```ts
// server/src/entry-web.ts — same handlers, browser adapter, exported as callable bindings
import { createHandlers, type Handlers } from "./handlers/index.js";
import type { ServerPlatform } from "./platform/types.js";

/** The client's local-mode api/ implementation (task 03) calls these directly. */
export function createLocalServer(platform: ServerPlatform): Handlers {
  // platform supplied by the Capacitor layer: fs → task 05's storage backing,
  // pngEncode/gzip → task 04's encoder choice, events → no-op (F5),
  // env → Capacitor preferences/config object, paths → app-container roots.
  return createHandlers(platform);
}
// No express, no cors, no static, no ws, no discovery, no dotenv, no signals.
```

Write-once check (MASTER §8): all logic lives in `handlers/` + the existing modules;
the two entries differ only in *composition*. No `if (isBrowser)` anywhere.

### R3 — Route → handler signature table (vocabulary: the client's five resource modules, D3/D2)

Handlers take plain named inputs, return plain objects, and **throw typed errors**;
the Express entry maps errors to today's statuses; the bindings entry lets them reject
(client `api/client/errors.ts` already models typed API errors).

| Client method (barrel) | HTTP today | Handler signature (transport-agnostic) |
|---|---|---|
| `configApi.get` | GET `/api/config` (project.ts:34-42) | `config.get(): Promise<{currentProject: string; aiServiceUrl?: string}>` |
| — (no barrel consumer) | POST `/api/config` (project.ts:45-60) | `config.set({currentProject}): Promise<void>` |
| `projectApi.list` | GET `/api/projects` (project.ts:63-72) | `project.list(): Promise<{projects: string[]}>` |
| `projectApi.get` | GET `/api/project?name` (project.ts:75-101) | `project.get(name?: string): Promise<unknown>` · throws `ProjectNotFound` |
| `projectApi.save` | POST `/api/project?name` + origin header (project.ts:104-147) | `project.save(name: string \| undefined, project: object, origin: string \| null): Promise<{backupCreated: boolean}>` — origin is a parameter, not a header (F5) |
| `projectApi.create` | POST `/api/project/create` (project.ts:150-180) | `project.create(name: string, projectData?: object): Promise<{projectName: string}>` · throws `InvalidName`, `AlreadyExists` |
| `projectApi.rename` | POST `/api/project/rename` (project.ts:183-217) | `project.rename(oldName: string, newName: string): Promise<void>` · throws `InvalidName`, `NotFound`, `AlreadyExists` |
| `projectApi.remove` | DELETE `/api/project?name` (project.ts:220-257) | `project.remove(name: string): Promise<void>` · throws `InvalidName`, `NotFound`, `LastProject` |
| `projectApi.switchTo` | POST `/api/project/switch` (project.ts:260-281) | `project.switchTo(name: string): Promise<void>` |
| `backupApi.list` | GET `/api/project/backups?name` (project.ts:284-299) | `backup.list(name?: string): Promise<{backups: {date; time; filename}[]}>` |
| `backupApi.restore` | POST `/api/project/restore-backup` (project.ts:302-335) | `backup.restore(date: string, filename: string, name?: string): Promise<void>` |
| `backupApi.createMigrationBackup` | POST `/api/project/backup` (project.ts:338-368) | `backup.createMigrationBackup(project: object): Promise<{message: string}>` |
| `exportApi.run` | POST `/api/project/export` (exportRouter.ts:22-69) | `exportRes.run(name?: string): Promise<{kebabName; path; frameCount; textureCount; bytes}>` · throws `InvalidName`, `ProjectNotFound` — `path` is an absolute server path, meaningless locally (G-105) |
| `aiApi.submitJob` | POST `/api/ai/jobs` (ai.ts:50-75) | `ai.submitJob(body): Promise<unknown>` |
| `aiApi.getJob` / `pollJob` | GET `/api/ai/jobs/:jobId` (ai.ts:77-99) | `ai.getJob(jobId: string, aiServiceUrl?: string): Promise<unknown>` |
| `aiApi.health` | GET `/api/ai/health` (ai.ts:182-218) | `ai.health(aiServiceUrl?: string): Promise<{status; detail?}>` (never throws — soft-fails by contract) |
| `aiApi.getConfig` | GET `/api/ai/config` (ai.ts:294-312) | `ai.getConfig(): Promise<{aiServiceUrl; envAiServiceUrl; effectiveAiServiceUrl}>` |
| — (no barrel consumer per MASTER §4's 18-method census) | GET `/api/ai/jobs` (ai.ts:101-130), POST `/api/ai/interpolate` (136-176), GET `/api/ai/heartbeat` (224-263), POST `/api/ai/config` (268-283) | carry over as handlers anyway (cheap, PORTABLE); task 03 confirms consumers |
| — (not bindings) | `/health`, `/api/discovery`, `/ws`, `/exports/*`, `/api/debug/log` | Node entry only, or task-03/05 measures (F2 tail); debug sink dev-gated (index.ts:45-48) |

Error→status mapping (Node entry): `InvalidName`→400, `NotFound`/`ProjectNotFound`→404,
`AlreadyExists`→409, `LastProject`→400, anything else→500 — read off
`routes/project.ts` and `exportRouter.ts:57-68`. Note the CORS middleware
(`index.ts:31`) and the 50 MB JSON body limit (`index.ts:32`) are transport concerns
that simply vanish in bindings mode.

### R4 — Build wiring (the precise question for task 08)

Recommended: **Option C1** — alias `@server-web` → `server/src/entry-web.ts` in
`client/aliases.ts` + the tsconfig mirror, Vite `server.fs.allow` for `../server/src`,
and two new `check-boundaries.mjs` rules (client may import only the entry-web module
from server; nothing may resolve under `server/src/data/`). Fallback if G-103's
measurement fails: **C2** (workspace package), accepting the restructure. Task 08
must also decide where the `handlers/` + `platform/` files live (staying under
`server/src/` keeps the "one source tree" promise literal) and must schedule the
manual golden re-export diff for the `Buffer→Uint8Array` change in `raster.ts` (R1).

---

## Gaps

### G-101 · DESIGN-RISK · No automated byte-identity gate exists; backup `.gz` bytes are pinned by nothing
**Evidence:** `server/src/__tests__/export-golden.test.ts:25-322` (pure-function
assertions only, zero file reads besides source text); `export/index.ts:9-12` ("Re-export
and `diff -r` against goldens" — a manual instruction); grep over `server/src` for
`gunzip` → 0 hits; `backup.ts:426,466-472` (compressed backups never read back).
**Impact:** MASTER §4 describes `export-golden.test.ts` as "a byte-identity golden
gate"; the implementation plan must not rely on any test suite to catch export or
backup byte drift — nothing will fail automatically. G-06's question is answered:
backup `.gz` bytes are NOT pinned, and are write-only artifacts today.
**Special measure:** the docs/11 plan needs an explicit scripted golden re-export +
`diff -r` step (and a decision from task 04/07 on whether byte identity is even
retained — PRODUCT-DECISION already seeded).

### G-102 · DESIGN-RISK · Texture hashing must stay synchronous; WebCrypto cannot do it
**Evidence:** `transform.ts:55,77` call `bufferHash` inside synchronous
`ensureColorTexture`/`ensureNormalTexture`; `raster.ts:29-31` (sha256, 12 hex);
`backup.ts:36-38` (md5 — no WebCrypto support at all). `crypto.subtle.digest` is
Promise-only (MDN, checked 2026-09-06).
**Impact:** a naive WebCrypto adapter forces an async refactor through
`TextureRegistry` and the traversal whose ORDER is load-bearing for the string table
(`transform.ts:10-16`) — high corruption risk for published bytes.
**Special measure:** implement `hash.md5Hex`/`hash.sha256Hex` as synchronous pure-JS
(library choice alongside task 04's encoder work); keep `TextureRegistry` sync.

### G-103 · NEEDS-MEASURE · Bundling NodeNext server TS into the Vite client is unverified
**Evidence:** `server/tsconfig.json` (`module: NodeNext`); `.js`-suffixed relative
imports throughout (e.g. `export/index.ts:20-35`); `Buffer` usage in
`raster.ts:38,61`, `write.ts:39`; no workspaces field in any package.json (F6).
**Impact:** if Vite/esbuild does not resolve `./x.js` → `x.ts` for these files, or
`Buffer`/`@types/node` ambience breaks client typechecking, Option C1 fails and the
build wiring falls back to C2 (workspace restructure) — a materially bigger plan.
**Special measure:** task 02's spike should include a one-file measurement: import a
`.js`-specifier server module into a scratch Vite build outside the repo.

### G-104 · DESIGN-RISK · Module-level mutable state assumes one long-lived process
**Evidence:** `backup.ts:31` (`projectBackupStates` — 5-min throttle + md5 dedupe per
project, in memory only); `routes/debugLog.ts:63` (ring buffer); `sync.ts:57-61`.
**Impact:** every webview reload / Capacitor cold start resets the backup throttle and
dedupe hash, so the first save after every launch always writes a backup — harmless
but multiplies backups on a device that suspends often (≤50/day cap at
`backup.ts:23,213-217` still bounds it). Bindings must also be constructed once per
page, not per call.
**Special measure:** none required for correctness (cap holds); note in docs/11 that
the throttle state may move into the storage backing if backup churn matters.

### G-105 · DESIGN-RISK · Export result `path` is an absolute server filesystem path surfaced in UI
**Evidence:** `export/exportRouter.ts:43-56` (comment + response field);
`export/index.ts:119-125` (`path: projectExportDir`); consumer string "Exported to" in
`client/src/ui/components/Header/Header.tsx` (grep 2026-09-06 — the exportRouter
comment's `components/Header` path is stale post-refresh, the consumer moved).
**Impact:** in local mode the value would be an app-container path (or a VFS key) that
means nothing to the user.
**Special measure:** task 03/08: return `kebabName` as the identity and let mode-aware
UI copy decide; removing `path` is the coordinated change exportRouter.ts:47-48
already anticipates.

### G-106 · PRODUCT-DECISION · `copyClientLib` cannot run as-is on device — do local exports include `lib/`?
**Evidence:** `export/write.ts:50-58` (`cp(clientLibDir, ...)` from
`export/index.ts:43` `CLIENT_LIB_DIR = join(__dirname,"../../../client/lib")`);
`server/exports/lib/` is a frozen external-consumer contract (CLAUDE.md; write.ts:44-48).
**Impact:** a webview has no `client/lib` directory on disk. Local-mode exports either
(a) bundle `client/lib` files as app assets and copy them through `platform.fs`, (b)
omit `lib/` locally (making a local export incomplete relative to the published
contract), or (c) defer lib emission to a sync-to-server step. Which one is owner
intent for "export on iPad".
**Special measure:** `paths.clientLibDir: string | null` in the adapter keeps all
three options open; task 07 should carry this to DECISIONS-NEEDED.

### G-107 · NEEDS-MEASURE · gzip level-9 byte parity in the browser (owned by task 04; recorded here because both call sites are mine)
**Evidence:** `backup.ts:133` and `write.ts:35` both pin `createGzip({ level: 9 })`;
`write.ts:7-9` declares the `.gz` bytes part of the published artefact. The web
`CompressionStream("gzip")` API exposes no compression-level parameter (WHATWG
Compression spec, checked 2026-09-06).
**Impact:** browser-produced `frames.json.gz` will not be byte-identical to zlib
level 9 output unless a JS zlib port is used; backup `.gz` bytes have no consumer
(G-101) so only the export artefact is at stake.
**Special measure:** task 04 chooses the deflate implementation; the adapter's
`gzip(data, {level})` signature keeps the requirement explicit.

### G-108 · DESIGN-RISK · The one exported sync fs API must go async
**Evidence:** `backup.ts:361-363` (`projectExists` wraps `existsSync`), called from
five route handlers (`routes/project.ts:161,192,197,229,269`); 12 further internal
`existsSync` sites (F4).
**Impact:** the shim makes `projectExists` async; all callers are already async
handlers so the ripple is mechanical — but it touches `backup.ts`, and CLAUDE.md
requires corpus snapshots to pass unchanged for adjacent subsystems; the change plan
must include that verification.
**Special measure:** none beyond scheduling the corpus check in docs/11.

### G-109 · NEEDS-MEASURE · Backup ordering depends on filesystem mtime fidelity
**Evidence:** `backup.ts:198-199` (cleanup deletes oldest-by-mtime),
`backup.ts:444-455` (backup listing sorted newest-first by mtime).
**Impact:** if task 05's storage backing does not preserve stable per-file mtimes
(e.g. an object store without metadata), backup rotation deletes the wrong files and
the restore UI mis-orders. The adapter's `stat().mtimeMs` makes the requirement
explicit, but whether the chosen backing honours it is task 05's to measure.
**Special measure:** alternative if the backing cannot: derive ordering from the
`HH-MM-SS` filename timestamp already embedded at `backup.ts:274-276` — a pure-logic
change confined to `backup.ts`.
