# Findings 03 — Client transport seam design

**Task:** `03-client-transport-seam.md` · **Wave:** W1 · **Date:** 2026-09-06
**Design goal (D2/D4):** `remote` keeps HTTP exactly as today; `local` dispatches to
in-process server bindings — behind the existing `client/src/api/` barrel, with zero
changes to the 9 consumer files.

> **Measurement conditions.** Client/server sources were verified against the working
> tree at HEAD `cb27aa0` (branch `feat/09-ipad-pencil-fixes`). The analysis-plan folder
> itself lives on `feat/10-capacitor-ipad-analysis` (commit `324c41c`, = `cb27aa0` +
> 2 docs commits — no application-code difference), and the working tree was **switched
> off that branch by an external process mid-task**; plan files quoted below were read
> from git (`git show feat/10-capacitor-ipad-analysis:...`). No application source
> differs between the two branches, so every `path:line` below is valid on both.

---

## Facts

All verified in this task's own pass (D9). "Consumer files" means non-test production
importers of the barrel.

### The seam that exists

- **F1 — one fetch site.** `grep -rn "fetch(" client/src` (excluding `__tests__`/
  `__mocks__`) returns exactly one call: `client/src/api/client/httpClient.ts:155`.
  The only `new WebSocket(...)` construction is
  `client/src/api/client/syncClient.ts:131` (line 45 is a type annotation on the
  test-only socket factory).
- **F2 — barrel-only consumption, 9 files.** Grep for barrel imports finds exactly
  these production importers, all through `"../api"` / `"../../api"` (never a deep
  path):
  `containers/BrowseBackupsModalContainer.tsx:25`, `containers/ExportPreviewModalContainer.tsx:27`,
  `containers/HeaderContainer.tsx:80`, `containers/hooks/useInterpolationJob.ts:25`,
  `stores/ApplicationStore.ts:42`, `stores/domain/DomainStore.ts:66-75`,
  `stores/session/AutoSaveController.ts:60`, `stores/session/SyncController.ts:44`
  (type-only), `stores/session/SessionStore.ts:39` (type-only).
- **F3 — 18 resource methods.** `projectApi` list/get/save/create/rename/remove/
  switchTo (`api/resources/projectApi.ts:26,39,51,67,81,90,99`); `backupApi`
  list/restore/createMigrationBackup (`backupApi.ts:26,46,64`); `exportApi`
  run/fetchFramesJson (`exportApi.ts:23,41`); `configApi` get (`configApi.ts:18`);
  `aiApi` getConfig/health/submitJob/getJob/pollJob (`aiApi.ts:108,113,125,147,164`).
  All `async`, all throwing typed `ApiError` (`api/index.ts:9-13`).
- **F4 — the error contract is small and closed.** Kinds: network / timeout /
  notFound / conflict / validation / server / unknown (`api/client/errors.ts:9-16`);
  status mapping `statusToKind` (`errors.ts:89-95`); fetch-rejection → `NetworkError`,
  layer timeout → `TimeoutError` (`httpClient.ts:163-172`); 2xx-with-unparseable-body →
  kind `unknown` (`httpClient.ts:191-202`); caller-signal aborts rethrow **unwrapped**
  (`httpClient.ts:166-167`).
- **F5 — server status codes the local mode must reproduce** (`server/src/routes/project.ts`):
  invalid name → 400 (`:50,:119,:157,:188,:225,:265,:345`), missing project → 404
  (`:90,:193,:230,:270`), duplicate create/rename → 409 (`:162,:197-201`), *missing
  backup on restore → 500, not 404* (`:332`; pinned client-side at
  `backupApi.ts:41-44` and `api/__tests__/resources.contract.test.ts:118-125`),
  last-project delete → 400 (`:239`). Export: no/invalid name → 400
  (`server/src/export/exportRouter.ts:27,:36`), failure → 500 (`:65`).
- **F6 — no consumer imports the transport constants.** Grep for
  `API_BASE|SYNC_PATH|resolveSyncUrl|ORIGIN_HEADER|getSyncOrigin|setSyncOrigin|syncOriginHeaders|DEFAULT_TIMEOUT_MS|LONG_TIMEOUT_MS`
  outside `src/api/` (excluding tests) returns nothing; `ApplicationStore.ts:42`
  imports only `SyncClient` + `ProjectSavedEvent`. The transport internals can change
  representation without touching any consumer.
- **F7 — injectable seams already present.** `AutoSaveController` takes an injectable
  `save` defaulting to `projectApi.save` (`AutoSaveController.ts:100-101,159-160`);
  `ExportPreviewModalContainer` injects `loadExport` into the modal and documents that
  its **referential identity is load-bearing** (`ExportPreviewModalContainer.tsx:14-20,41`).

### The four misfits, measured

- **F8 — `fetchFramesJson` escapes `API_BASE`.** `exportApi.ts:45-49` passes
  `base: ""`; the default base is `API_BASE` (`httpClient.ts:124`), which is
  `import.meta.env.VITE_API_URL || "/api"` (`api/client/config.ts:8`) — a **build-time
  constant**.
- **F9 — textures are not fetched at all.** `ui/components/ExportPreviewModal/
  ExportPreviewModal.tsx:435` hardcodes `` const basePath = `/exports/${kebabName}` ``
  and `:442` calls `loadTextures(projectData, basePath)`;
  `client/lib/parse-pixel-project.ts:514-537` loads each texture via
  `new Image(); img.src = `${base}/${texPath}``. This path bypasses `fetch`, the
  httpClient, and the barrel entirely. `client/lib/` is mirrored verbatim to
  `server/exports/lib/`, a **frozen external surface** (CLAUDE.md "Environment notes";
  MASTER §4 / OPEN-QUESTIONS Q33).
- **F10 — sync is opt-in and already has an "off" configuration.**
  `ApplicationStore.ts:865-875` constructs `SyncController` + `SyncClient` only when
  `options.syncEnabled`; only `main.tsx:36-39` passes `syncEnabled: true` (tests and
  Storybook run without). `resolveSyncUrl()` bypasses the Vite proxy by design
  (`syncClient.ts:80-96`; `vite.config.ts:33-38`), using `API_BASE` when absolute,
  else `location.hostname` + `VITE_SERVER_PORT || "3001"` under `import.meta.env.DEV`
  (`syncClient.ts:57-58,88-95`). Origin stamping: `projectApi.save` attaches
  `syncOriginHeaders()` (`projectApi.ts:60-62`), which returns `{}` whenever no socket
  has delivered a `welcome` id (`syncOrigin.ts:43-45`).
- **F11 — `routes/ai.ts` is a stateless proxy with a 4-tier URL resolution.**
  Priority: per-request param → persisted `config.json` `aiServiceUrl` →
  `AI_SERVICE_URL` env → `http://localhost:8100` (`server/src/routes/ai.ts:24-44`).
  `GET /api/ai/health` **never returns non-200**: failures are encoded in the body
  (`routes/ai.ts:182-218`); job/proxy failures forward the upstream status or 500
  (`:65,:73,:89,:97,:120,:128,:164,:174`). `GET /api/ai/config` returns
  `{aiServiceUrl, envAiServiceUrl, effectiveAiServiceUrl}` (`:288-311`).
- **F12 — both health consumers fold "throws" and "resolves with error status" into
  the same UI outcome.** `HeaderContainer.tsx:164-191` (poll wired at `:193-197`,
  `setInterval(pollAiHealth, 15_000)`) and `useInterpolationJob.ts:114-135` both
  render "unavailable + detail" either way; only the detail string differs.

### Boundaries, boot, build, tests

- **F13 — the boundary rules I checked.** ESLint flat config: `src/api/**` may not
  import `**/stores`, `**/store`, `**/components/**` (`client/eslint.config.js:414-441`);
  `src/ui/**` may not import `**/api`, `**/api/**`, stores, mobx
  (`eslint.config.js:275-300`). `client/scripts/check-boundaries.mjs:119-126` — rule 5:
  *"nothing under `src/api/` imports from `stores/` or `components/`"*. **No rule
  machine-enforces barrel-only deep-imports by consumers** — that is doc-level
  (`api/index.ts:4-7`) plus F2's measured reality; the design below must not depend on
  anything stronger.
- **F14 — boot is synchronous and single-sited.** `main.tsx:36-39` constructs the one
  `ApplicationStore({ autoSaveEnabled: true, syncEnabled: true })`; the store options
  already accept an (unused, `unknown`-typed) `api` injection point
  (`ApplicationStore.ts:106-111`) plus `sync`/`autoSave` overrides (`:121-135`).
- **F15 — Vite config is function-form and env-rooted at the repo root.**
  `vite.config.ts:5-13`: `defineConfig(({ mode }) => ...)`, `loadEnv(mode, "..")`,
  `envDir: ".."`, **no `base` set**; `/api` and `/exports` proxied, `/ws` deliberately
  not (`:24-39`). Aliases come from `client/aliases.ts:17-25` shared with
  `vitest.config.ts`, hand-mirrored in tsconfig.
- **F16 — the contract suite tests the real modules at the network boundary.**
  `api/__tests__/resources.contract.test.ts` (269 lines) imports the production
  resource objects from `@/api` and intercepts with MSW
  (`api/__mocks__/handlers.ts`; server instance `src/test/mswServer.ts`; unit lane
  `onUnhandledRequest: "error"` per `vitest.config.ts` unit-project comment). Handlers
  are origin-agnostic (`*/api/...`), and `buildUrl` resolves relative URLs against
  `http://localhost` in the node lane (`httpClient.ts:61-68`).
- **F17 — client-side the AI URL is a *project uiState* setting**, persisted through
  the normal save path, not through `POST /api/ai/config` (no client caller of that
  route; `HeaderContainer.tsx:210-215` `onSaveAiServiceUrl` → `setAiServiceUrl` →
  UIStore persistence per `ApplicationStore.ts:846-852` W29d note).

---

## Options

### Core seam: where does the mode swap live?

**A — Request-level swap (`request()` becomes the interface).** A `LocalTransport`
implements `request<T>(opts: RequestOptions)` and routes on `(method, path)` strings.
*Pros:* the 5 resource modules and both contract suites run byte-identical; smallest
diff. *Cons:* it rebuilds an HTTP router inside the client — path parsing, query
decoding, status fabrication — which is precisely the indirection the owner asked to
remove ("direct method bindings", MASTER §1); every route string exists twice (client
matcher + server logic); a new endpoint is a silent 404-shaped hole rather than a type
error.

**B — Resource-level swap (per-mode implementations of the 5 module interfaces behind
stable delegators).** The barrel keeps exporting `projectApi`/`backupApi`/`exportApi`/
`configApi`/`aiApi` as **permanently-identical frozen objects** whose methods delegate
to the active transport, selected once at boot. Remote impl = today's modules,
verbatim. Local impl = typed calls into task 01's ported server services.
*Pros:* honest method bindings (a missing local method is a compile error); error
mapping is explicit and testable; consumers and `ui/` untouched (F2/F6/F7 hold);
tree-shakeable — the local implementation is behind a dynamic import that the web
build never takes. *Cons:* 18 one-line delegator methods of boilerplate; the local
impl owns ApiError mapping (drift risk — mitigated by the shared contract suite,
§Recommendation-5 and G-304).

**C — Service-worker fetch interception (app-wide HTTP masquerade).** Zero client
changes at all. Rejected as the primary: D2 restricts SW to per-sub-problem fallback;
WKWebView SW availability under the Capacitor scheme is unverified (task 02 Q4); and a
SW keeps the client speaking HTTP to a server that no longer exists — the anti-pattern
MASTER §1 names.

**Chosen: B.** A is kept only as a thought-experiment baseline; C survives solely as
the misfit-1 fallback (below).

### Misfit 1 — `fetchFramesJson` + texture URLs

The JSON half fits the seam (local = VFS read). The texture half (F9) cannot go
through any client seam: `loadTextures` composes `basePath + "/" + texPath` into
`Image.src`, and both the composition (frozen lib, F9) and the basePath literal
(`ExportPreviewModal.tsx:435`, a `ui/` file) are outside the barrel.

1. **Blob URLs** — read PNGs from the VFS, `URL.createObjectURL` each. Requires a
   per-file URL *map*, incompatible with string-concat `basePath` unless
   `loadTextures` changes → changes the frozen `lib/` surface (F9, Q33). **Rejected.**
2. **Scoped service worker** intercepting `GET /exports/*` on the app origin and
   answering from the VFS. Zero `ui/` change, D2-sanctioned as a fallback. Blocked on
   task 02 Q4 (SW support under `capacitor://` in WKWebView) — historically
   restricted; treat as unproven.
3. **`convertFileSrc` base injection** — write exports to app storage (task 05), and
   hand the modal a base URL that Capacitor's scheme handler will serve
   (`convertFileSrc(<dataDir>/exports/<kebab>)`); `loadTextures`' concat contract is
   preserved because the result is an ordinary URL *prefix*. Costs **one optional prop
   on a `ui/` component** — an invariant break, recorded as **G-301** with
   justification. Platform behavior (does `Image.src` load `convertFileSrc` URLs; can
   the handler serve a whole tree) is task 02 **Q4**; the webview origin/scheme
   consequences are **Q2**.

**Chosen: 3**, with 2 as the fallback if task 02 verifies SW support and falsifies
convertFileSrc; 1 rejected outright.

### Misfit 2 — SyncClient `/ws`

1. **No-op sync transport** (a `SyncClient` that never connects). Adds a second
   implementation of nothing, and keeps a dead reconnect loop and dead origin-id
   machinery alive in local mode.
2. **Don't construct it** — the `syncEnabled: false` configuration that every test
   and Storybook story already exercises (F10). Boot computes
   `syncEnabled: mode === "remote"`.

**Chosen: 2.** Header stamping needs **no change in either mode**: with no socket,
`syncOriginHeaders()` returns `{}` (F10), so local-mode saves carry no header, and the
local transport ignores `headers` anyway. Remote mode keeps today's behavior verbatim,
including the straight-to-port-3001 URL resolution — though its build-time assumptions
need to follow the runtime base URL (G-305).

### Misfit 3 — aiApi in local mode

1. **Port `routes/ai.ts` into the shared server core** and call it like the other
   bindings. But the route is a stateless `fetch` proxy (F11) whose only reasons to
   exist are (a) the browser→Python CORS hop and (b) server-side URL resolution.
   In-webview it would be a proxy from the page to itself.
2. **Call the Python service directly from the webview through the existing
   `request()`**, with `base: <resolved AI URL>`. FastAPI already sends
   `allow_origins=["*"]` (MASTER §4); whether that holds for the `capacitor://`
   origin, plain-HTTP ATS, and iOS Local-Network consent is task 02 **Q2**. This keeps
   the one-fetch-site invariant (F1) — the local aiApi is HTTP *because the AI service
   is genuinely remote* (D10), not a masquerade.

**Chosen: 2.** URL resolution moves client-side in local mode only, dropping the env
tier (no `process.env` in a webview): per-call param (F17's uiState value) → local
config store (task 05) → **"not configured"**. The hard-coded
`http://localhost:8100` default is self-referential on-device and must not be dialed
(G-303). Health-poll behavior offline: `health()` reproduces the route's semantics —
**resolve** `{status:"error", detail}` on any failure, never throw — so
`HeaderContainer`/`useInterpolationJob` behavior is pixel-identical (F12); with no URL
configured it short-circuits without touching the network, so the 15 s poll costs
nothing offline. Poll cadence under backgrounding: task 02 **Q8**.

### Misfit 4 — mode selection + boot seam

Where the `remote`/`local` choice (D4) lives and how it reaches the transport:

1. **localStorage** — synchronous, but WKWebView web-storage eviction risk is exactly
   what task 02 Q3 exists to check; the theme seed already lives there as an avowedly
   losable preference.
2. **Capacitor Preferences plugin** — native-backed, survives webview storage
   eviction; async read at boot. Version/persistence facts: task 02 **Q1/Q3**.

**Chosen: 2 on-device, with the web build not reading any preference at all** (it has
no mode; it is `remote` by construction). Boot-flow design in Recommendation §4.

---

## Recommendation

### 1. The transport interface

New files live under `client/src/api/` (allowed: F13's rules constrain what `api/`
*imports*, not its internal shape; consumers keep importing the barrel unchanged).

```ts
// api/transport.ts — the seam. No imports from stores/, components/, ui/.
import type { projectApi as httpProjectApi } from "./resources/projectApi";
import type { backupApi as httpBackupApi } from "./resources/backupApi";
import type { exportApi as httpExportApi } from "./resources/exportApi";
import type { configApi as httpConfigApi } from "./resources/configApi";
import type { aiApi as httpAiApi } from "./resources/aiApi";

/** Derived from the production HTTP modules so the contract cannot drift. */
export interface ApiTransport {
  project: typeof httpProjectApi;
  backup: typeof httpBackupApi;
  export: typeof httpExportApi;
  config: typeof httpConfigApi;
  ai: typeof httpAiApi;
}

let active: ApiTransport; // initialized to the HTTP transport at module load

/**
 * Select the transport. MUST be called (if at all) before the ApplicationStore
 * is constructed, and never again: every store holds state loaded through one
 * backend. Changing mode = persist the preference + full reload.
 */
export function setApiTransport(next: ApiTransport): void { active = next; }
export function getApiTransport(): ApiTransport { return active; }
```

```ts
// api/index.ts — the delegator barrel (replaces the direct re-exports of the
// five resource objects; every other export is unchanged).
// Frozen, permanently-identical objects: consumers may capture method
// references (ExportPreviewModalContainer.tsx:41, AutoSaveController.ts:160)
// and MUST keep working — see G-306. Never `export let`, never a Proxy swap.
export const projectApi: ApiTransport["project"] = Object.freeze({
  list: (signal) => getApiTransport().project.list(signal),
  get: (name, signal) => getApiTransport().project.get(name, signal),
  save: (project, name) => getApiTransport().project.save(project, name),
  create: (name, data) => getApiTransport().project.create(name, data),
  rename: (o, n) => getApiTransport().project.rename(o, n),
  remove: (name) => getApiTransport().project.remove(name),
  switchTo: (name) => getApiTransport().project.switchTo(name),
});
// backupApi, exportApi, configApi, aiApi: same pattern, 11 more one-liners.
```

```ts
// api/local/index.ts — constructed only in local mode, loaded only by a
// dynamic import the web build never takes.
import type { ApiTransport } from "../transport";

/** What task 01's ported server core hands the client (expected interface —
 *  its exact shape is task 01's to own; names here are illustrative). */
export interface ServerBindings {
  projects: PortedProjectService;   // routes/project.ts logic, Express-free
  backups: PortedBackupService;     // backup.ts over task 05's VFS
  exporter: PortedExportService;    // runExport over task 04's encoder
  config: PortedConfigService;      // config.json equivalent in the VFS
  exportsVfs: ExportsRead;          // readFile under <appData>/exports/
}

export function createLocalTransport(b: ServerBindings): ApiTransport { /* §2 */ }
```

Error mapping is one shared helper: the ported services throw a
`ServiceError { code: "validation" | "not-found" | "conflict" | "io"; message }`
(interface expected from task 01), and the local transport converts:

```ts
// api/local/mapError.ts
function toApiError(path: string, e: unknown): ApiError {
  if (isServiceError(e)) {
    const kind = ({ validation: "validation", "not-found": "notFound",
                    conflict: "conflict", io: "server" } as const)[e.code];
    return new ApiError({ kind, path, serverMessage: e.message,
      status: { validation: 400, "not-found": 404, conflict: 409, io: 500 }[e.code] });
  }
  return new ApiError({ kind: "server", path, status: 500, cause: e });
}
```

`status` is populated so any consumer that ever reads `err.status` sees the same
numbers the routes send (F5). Storage quota-full surfaces as code `io` → kind
`server` with the VFS's message as `serverMessage` (new contract case, §5).

### 2. All 18 methods through both transports

Remote column = today's modules, **verbatim, zero change**. Local column names the
binding called and the full error semantics. Timeouts: local in-process calls get **no
artificial deadline** (there is no network to hang on; a deadline cannot interrupt
same-thread work anyway — see G-307); local aiApi HTTP keeps the httpClient's
timeout/abort machinery because it *is* HTTP.

| # | Method (file:line) | Remote (unchanged) | Local-mode behavior | Local errors (ApiError kind) |
|---|---|---|---|---|
| 1 | `projectApi.list` (projectApi.ts:26) | GET /api/projects | `b.projects.list()` → `string[]` | io → `server` |
| 2 | `projectApi.get` (:39) | GET /api/project | `b.projects.load(name?)` → raw `CompactProject`, **no migration** (transport must not mutate domain data, projectApi.ts:5-8) | missing → `notFound` (mirrors routes/project.ts:90); io → `server` |
| 3 | `projectApi.save` (:51) | POST /api/project (+origin header) | `b.projects.save(project, name?)` → `{success:true, backupCreated}` (backup policy runs in the ported `backup.ts`); no header — `syncOriginHeaders()` is `{}` with no socket (F10) and local ignores headers | invalid data → `validation` (:119); quota/io → `server` |
| 4 | `projectApi.create` (:67) | POST /api/project/create | `b.projects.create(name, data?)` → `{success:true, projectName}` | invalid name → `validation` (:157); duplicate → `conflict` (:162); io → `server` |
| 5 | `projectApi.rename` (:81) | POST /api/project/rename | `b.projects.rename(old, new)` → void; updates current-project config like routes/project.ts:206-210 | invalid → `validation` (:188); missing → `notFound` (:193); duplicate → `conflict` (:197-201); io → `server` |
| 6 | `projectApi.remove` (:90) | DELETE /api/project | `b.projects.remove(name)` → void | invalid → `validation` (:225); missing → `notFound` (:230); last project → `validation` (:239); io → `server` |
| 7 | `projectApi.switchTo` (:99) | POST /api/project/switch | `b.config.setCurrentProject(name)` → void | invalid → `validation` (:265); missing → `notFound` (:270); io → `server` |
| 8 | `backupApi.list` (backupApi.ts:26) | GET /api/project/backups | `b.backups.list(name?)` → `BackupEntry[]`; **throws on failure, never fabricates `[]`** (backupApi.ts:4-7) | io → `server` |
| 9 | `backupApi.restore` (:46) | POST /api/project/restore-backup | `b.backups.restore(date, filename, name?)` → void | **missing backup → `server`, not `notFound`** — parity with the pinned 500 (F5); invalid args → `validation` (:309); io → `server` |
| 10 | `backupApi.createMigrationBackup` (:64) | POST /api/project/backup | `b.backups.createMigrationBackup(project)` → `{success:true, message}` | invalid data → `validation` (:345); io → `server` |
| 11 | `exportApi.run` (exportApi.ts:23) | POST /api/project/export (120 s) | `b.exporter.run(name?)` → `{success, path, kebabName, frameCount, textureCount, bytes}`; `path` is the VFS path (Header shows it — exportApi.ts:9-14); honors `signal` at pipeline await-points, best-effort; no deadline (G-307) | no/invalid name → `validation` (exportRouter.ts:27,:36); failure → `server` (:65); abort → unwrapped AbortError |
| 12 | `exportApi.fetchFramesJson` (:41) | GET /exports/…/frames.json, `base:""` | `b.exportsVfs.readFile("<kebab>/frames.json")` → `JSON.parse` | missing → `notFound` (parity: express.static 404); unparseable → `unknown` with the httpClient's "not valid JSON" message shape (httpClient.ts:191-202); io → `server` |
| 13 | `configApi.get` (configApi.ts:18) | GET /api/config | `b.config.get()` → `{currentProject, aiServiceUrl?}` | io → `server` (routes/project.ts:40) |
| 14 | `aiApi.getConfig` (aiApi.ts:108) | GET /api/ai/config | Pure local read — port of routes/ai.ts:288-311 minus the env tier: `{aiServiceUrl: cfg ?? "", envAiServiceUrl: "", effectiveAiServiceUrl: cfg ?? ""}` (empty = not configured; no localhost:8100 invention on-device, G-303) | config io → `server` (routes/ai.ts:310) |
| 15 | `aiApi.health` (:113) | GET /api/ai/health (never non-200) | If no effective URL: **resolve** `{status:"error", detail:"No AI service configured"}` with zero network. Else `request({base: aiUrl, path:"/health"})` and fold every failure into a resolved `{status:"error", detail}` — exact port of routes/ai.ts:182-218 semantics. **Never throws** (except unwrapped caller abort), so F12's consumers behave identically | none (resolved error states); caller abort rethrown unwrapped |
| 16 | `aiApi.submitJob` (:125) | POST /api/ai/jobs (120 s) | No URL → throw `validation` with `"AI service URL not configured."` (routes/ai.ts:54 parity). Else `request({method:"POST", base: aiUrl, path:"/jobs", body, timeoutMs: LONG_TIMEOUT_MS, signal})` — same wire body mapping (aiApi.ts:129-136) | Python 4xx/5xx → statusToKind of the forwarded status (remote forwards it too, routes/ai.ts:65); unreachable → `network` (remote wraps as 500 `server` — accepted single divergence, both render as failure text; noted in G-304); timeout → `timeout` |
| 17 | `aiApi.getJob` (:147) | GET /api/ai/jobs/:id | Same direct-`request` pattern, `base: aiUrl`, default timeout | missing job → `notFound` (status forwarded in both modes); unreachable → `network`; no URL → `validation` |
| 18 | `aiApi.pollJob` (:164) | Composition over getJob | **Shared code, both modes**: it calls `aiApi.getJob` through the delegator barrel, so it needs no local variant at all; deadline → `TimeoutError`, abort → unwrapped, failed job returned to the caller (aiApi.ts:159-189) | inherits #17's |

Notes on invariants the table preserves:
- The **one-fetch-site invariant (F1) survives local mode**: rows 15-17 route their
  genuine HTTP through `request()` (with a runtime `base`), so `httpClient.ts:155`
  stays the only `fetch`.
- Rows 1-14 never touch the network in local mode; `NetworkError`/`TimeoutError` are
  **unreachable** there by construction, which the contract suite asserts (§5).
- Caller `AbortSignal` semantics: local bindings receive the signal and check it at
  their await-points; an abort rethrows unwrapped exactly as `httpClient.ts:166-167`
  does. For sub-millisecond local reads this degrades to "checked once at entry" —
  behaviorally indistinguishable from a fast server.

### 3. Misfit designs (final form)

**Misfit 1 — export preview.** `fetchFramesJson` is row 12 — no special casing beyond
the VFS read. Textures: `ExportPreviewModal` gains one **optional, defaulted** prop:

```tsx
// ui/components/ExportPreviewModal/ExportPreviewModal.tsx — the ONE ui/ change (G-301)
resolveAssetBase?: (kebabName: string) => string;
// line 435 becomes:
const basePath = (resolveAssetBase ?? defaultAssetBase)(kebabName);
const defaultAssetBase = (k: string) => `/exports/${k}`; // today's literal
```

`ExportPreviewModalContainer` passes nothing in remote/web mode (web build provably
unchanged: the default is today's literal) and, in local mode, a module-level stable
function (same referential-identity discipline as `loadExport`,
`ExportPreviewModalContainer.tsx:14-20`) returning
`convertFileSrc(<appData>/exports/<kebab>)` — pure props in, so the `ui/` purity rule
(F13) still holds; the prop is a plain function, not an API import. Platform
dependency: task 02 **Q4** (convertFileSrc + `Image.src`, whole-tree serving) and
**Q2** (scheme/origin). Fallback if Q4 falsifies it: the scoped service worker for
`/exports/*` only (Options, misfit 1, option 2). `loadTextures` and the `lib/`
mirror stay byte-identical.

**Misfit 2 — sync.** `main.tsx` computes `syncEnabled: mode === "remote"`; in local
mode neither `SyncController` nor `SyncClient` is constructed (the already-tested
F10 path). `SyncClient`, `SYNC_PATH`, `resolveSyncUrl` stay exported for remote mode.
Origin-header stamping: no change in either mode (F10). Single-instance local means
no echo problem exists to suppress.

**Misfit 3 — AI.** Rows 14-18. The local aiApi is a *thin client-side port of the
proxy's URL-resolution + never-throwing-health semantics*, speaking HTTP directly to
the (always-remote, D10) Python service through the existing httpClient. `routes/ai.ts`
itself remains server-only code; nothing from it needs to compile into the webview —
G-03's "logic ports" reduces to ~40 lines of URL-priority + health-folding in
`api/local/aiLocal.ts`. Health poll: unchanged cadence, zero network when
unconfigured, `DEFAULT_TIMEOUT_MS` per probe when configured; backgrounnd-throttle
facts from task 02 **Q8**.

**Misfit 4 — mode selection + boot.** The transport layer's contract with the future
find-a-server UX (implementation-plan scope) is exactly two functions:

```ts
// api/transport.ts additions
/** Remote mode: hand the transport a base URL (found, saved, or default). */
export function configureRemote(opts?: { baseUrl?: string }): void;
// Internally replaces the API_BASE *value* with a runtime binding:
//   api/client/config.ts exports getApiBase(); default stays
//   `import.meta.env.VITE_API_URL || "/api"` (config.ts:8) so the web build's
//   behavior is byte-for-byte today's. resolveSyncUrl() derives from
//   getApiBase() instead of the frozen const (G-305).

/** Local mode: hand the transport the assembled server-binding object. */
export function configureLocal(bindings: ServerBindings): void; // wraps setApiTransport(createLocalTransport(b))
```

Boot flow (`main.tsx`; not one of the 9 consumer files, F2):

```ts
// Web build: VITE_APP_TARGET is undefined → this whole block is
// statically false and dead-code-eliminated. Boot stays synchronous and
// byte-identical in behavior: default transport = HTTP, syncEnabled = true.
let syncEnabled = true;
if (import.meta.env.VITE_APP_TARGET === "capacitor") {
  const boot = await import("./boot/capacitor");  // top-level await, capacitor build only
  const mode = await boot.readModePreference();   // Capacitor Preferences — 02 Q1/Q3;
                                                  // default on first launch: PRODUCT copy,
                                                  // seam default = "remote" (today's behavior)
  if (mode === "local") {
    await boot.configureLocalMode();   // assembles ServerBindings: task 01 core +
                                       // task 05 VFS + task 04 encoder → configureLocal()
    syncEnabled = false;
  } else {
    boot.configureRemoteMode();        // configureRemote({ baseUrl: saved/discovered });
                                       // discovery UX = implementation-plan scope
  }
}
const store = new ApplicationStore({ autoSaveEnabled: true, syncEnabled });
```

Rules the seam imposes: the transport is **fixed for the app lifetime** (stores hold
state from one backend; mode change = persist preference + `location.reload()`); the
mode-picker UI is an ordinary container/ui pair that calls the persistence +
reload — it never touches `setApiTransport` mid-session. Boundary compliance: the
new `api/transport.ts`, `api/local/**`, and `src/boot/capacitor.ts` import no stores
and no components (check-boundaries rule 5, `check-boundaries.mjs:119-126`, quoted in
F13, still passes; `boot/` is outside `src/ui/` so rule 1 is untouched).

### 4. Mode-aware Vite build (G-12)

Options considered:

1. **`--mode capacitor` in the existing config** (recommended). `vite.config.ts` is
   already function-form with `loadEnv(mode, "..")` (F15), so: add
   `.env.capacitor` **at the repo root** (envDir is `..`) carrying
   `VITE_APP_TARGET=capacitor`; in the config, when `mode === "capacitor"`, set
   `base: "./"` *iff task 02 Q2 confirms the scheme needs relative asset URLs*
   (a root-served `capacitor://localhost` origin may work with the default `/` —
   Q2 decides; the config change is one ternary either way), and optionally
   `build.outDir: "dist-capacitor"` so web and capacitor artifacts never mix.
   Build command: `cd client && bunx vite build --mode capacitor` — followed by the
   mandatory repo lockfile check (`bunx` has been measured to create one,
   CLAUDE.md). Dev-loop proxying is unaffected: `vite dev` keeps mode
   `development`.
2. **Separate `vite.capacitor.config.ts`** (`--config`). Clean isolation but
   duplicates the proxy/alias/env plumbing; `aliases.ts` de-drifts only the aliases,
   not the rest. More files to keep honest for one ternary's worth of difference.
3. **Single build + runtime `Capacitor.isNativePlatform()`**. No build fork, but the
   local server core, VFS, and encoder land in the web bundle, and "web behavior
   provably unchanged" degrades from *statically eliminated* to *hopefully not
   executed*. Rejected.

**Recommendation: option 1.** The `import.meta.env.VITE_APP_TARGET === "capacitor"`
guard in §3 is the single switch; it is a build-time constant in both builds, so the
web bundle's boot path is *provably* (dead-code-elimination, verifiable by grepping
the emitted bundle for `capacitor`) identical to today's.

### 5. Contract-test strategy

- **Extract the behavioral spec.** Refactor `resources.contract.test.ts` into a
  parameterized `describeApiContract(name, setup)` (a plain function of `describe`
  blocks) where `setup` yields `{ api: ApiTransport-shaped modules, scenarios }`.
  `scenarios` abstracts "make X fail": the HTTP suite implements them with
  `server.use(...)` over the existing MSW handler factories
  (`handlers.ts:72-113` — `serverDownHandlers`, `notFoundHandlers`,
  `aiJobFailureHandlers`); the local suite implements them by seeding/poisoning an
  **in-memory `ServerPlatform` fake** (interface expected from task 01) and a fake
  VFS (task 05).
- **HTTP lane: unchanged coverage.** The existing suite becomes
  `describeApiContract("http", mswSetup)` and must keep passing byte-identically —
  it is the regression net proving remote mode didn't move. HTTP-shape-only cases
  (URL `%20` byte-shape and headers-object-absence pinning,
  `httpClient.test.ts`) stay in the HTTP-only file; they have no local analogue.
- **Local lane: same spec + local-only cases.** Runs in the existing `unit` vitest
  project (node lane) with **no MSW** for rows 1-14 — direct calls (MSW's
  `onUnhandledRequest: "error"` doubles as the proof that local bindings touch no
  network); rows 15-17 keep MSW handlers for the *Python* endpoints
  (`*/jobs`, `*/health`) since local aiApi is genuinely HTTP.
  New cases local mode needs:
  - quota-full: VFS write rejects → `save`/`create`/`createMigrationBackup`/`restore`
    surface kind `server` with the VFS message as `serverMessage`;
  - `fetchFramesJson` on a never-exported project → `notFound`; corrupt
    `frames.json` → kind `unknown`;
  - restore of a missing backup → kind `server` (the pinned 500-parity, F5);
  - rename to an existing name → `conflict`; delete of the last project →
    `validation`;
  - `aiApi.health` with no configured URL resolves `{status:"error"}` **without a
    network request** (assert zero MSW hits);
  - `aiApi.submitJob` with no configured URL → `validation` with the exact
    routes/ai.ts:54 message;
  - abort of `exportApi.run` mid-pipeline rethrows the unwrapped AbortError.
- **Parity matrix.** One table-driven test iterates
  `(method, scenario) → expected ApiError.kind` over both suites' outputs and
  asserts equality, so a mapping drift in `api/local/mapError.ts` fails a test
  instead of shipping (G-304). The single sanctioned divergence (row 16:
  unreachable Python = `server` remote vs `network` local) is encoded in the table
  explicitly, not discovered.

---

## Gaps

### G-301 · DESIGN-RISK · The export preview's texture base path requires one `ui/` prop
**Evidence:** `client/src/ui/components/ExportPreviewModal/ExportPreviewModal.tsx:435`
hardcodes `` `/exports/${kebabName}` ``; `client/lib/parse-pixel-project.ts:514-537`
composes `basePath + "/" + texPath` into `Image.src` and is mirrored to the frozen
`server/exports/lib/` surface (CLAUDE.md, OPEN-QUESTIONS Q33).
**Impact:** The task's design invariant "zero `ui/` changes" cannot be met for local-
mode texture loading: every zero-ui alternative either changes the frozen lib (blob
URLs) or rests on unverified WKWebView service-worker support. The break is minimal —
one *optional, defaulted* prop (`resolveAssetBase`) whose absence reproduces today's
behavior byte-for-byte, keeping the web build and remote mode provably unchanged and
`ui/` purity intact (a function prop, no imports).
**Special measure:** Adopt the prop (Recommendation §3, misfit 1); fall back to a
scoped `/exports/*` service worker if task 02 Q4 falsifies `convertFileSrc` image
loading; never touch `loadTextures`.

### G-302 · NEEDS-MEASURE · Five platform facts this design consumes are task 02's to verify
**Evidence:** Dependencies marked in-line: `convertFileSrc`/scheme-handler tree
serving and SW availability (02 **Q4**), `capacitor://` origin + CORS + ATS +
Local-Network consent for direct webview→LAN-Python HTTP (02 **Q2**), Capacitor
Preferences pinning/persistence vs localStorage eviction (02 **Q1/Q3**), background
JS throttling of the 15 s health poll and autosave timers (02 **Q8**). Task 02 runs
in parallel; none of these is asserted here from training data (MASTER §9 risk 1).
**Impact:** Misfits 1, 3 and 4's recommendations are conditional on those answers;
if Q4 falsifies convertFileSrc *and* SW support, local-mode texture preview has no
known zero-lib-change path.
**Special measure:** Task 07 must join this findings file against
`findings/02-capacitor-feasibility.md` and re-grade the conditional recommendations.

### G-303 · DESIGN-RISK · The AI default URL and env tier are meaningless on-device
**Evidence:** `server/src/routes/ai.ts:24-44` — resolution tiers 3 (env) and 4
(`http://localhost:8100`) assume a server host; in a webview, `process.env` does not
exist and `localhost` is the device itself. `aiApi.getConfig`'s contract surfaces
`envAiServiceUrl` (`client/src/api/resources/aiApi.ts:22-26`).
**Impact:** A verbatim port would make local mode probe the iPad's own loopback every
15 s and report a lying "configured" default. Dropping the tiers changes what
`getConfig` returns (`envAiServiceUrl: ""`, effective URL empty when unset) and the
health-status copy ("No AI service configured") — visible, if minor, UX drift.
**Special measure:** Local resolution = per-call param → local config → *not
configured* (health short-circuits, `submitJob` throws `validation`). UI copy for the
unconfigured state is the implementation plan's to write; task 07 should carry the
copy question into DECISIONS-NEEDED only if the owner cares about wording.

### G-304 · DESIGN-RISK · Error-kind parity between the two transports can silently drift
**Evidence:** The kind contract is measured from live routes (F5), including one
deliberate oddity — missing backup restores as 500/`server`, pinned at
`client/src/api/resources/backupApi.ts:41-44` and
`resources.contract.test.ts:118-125`. The local transport re-derives all of it via
`mapError.ts`; row 16 already carries one sanctioned divergence (unreachable Python:
`server` remote vs `network` local).
**Impact:** A drifted kind changes consumer behavior invisibly (e.g. `DomainStore`'s
`notFound` → create-default branch, `isKind` checks) — exactly the class of bug that
mangles flows silently rather than erroring.
**Special measure:** The shared `describeApiContract` spec plus the explicit
(method × scenario → kind) parity-matrix test (Recommendation §5); divergences must
be table-encoded, never incidental.

### G-305 · DESIGN-RISK · `API_BASE` and `resolveSyncUrl` are build-time constants but remote-on-iPad needs a runtime base URL
**Evidence:** `client/src/api/client/config.ts:8`
(`API_BASE = import.meta.env.VITE_API_URL || "/api"`);
`client/src/api/client/syncClient.ts:57-58,80-96` derives the socket host from
`API_BASE`/`import.meta.env.DEV`/`VITE_SERVER_PORT`, assuming Vite-dev or same-origin
serving. The find-a-server flow hands over a base URL only at runtime (MASTER §4,
ios-companion probes).
**Impact:** Without a runtime binding, the Capacitor remote mode would fetch
`capacitor://localhost/api/...` (nonexistent) and the sync socket would aim at the
wrong host with the silent-hang failure mode the syncClient header documents.
**Special measure:** `getApiBase()` runtime binding whose default is the current
expression (web build provably unchanged), `configureRemote({baseUrl})` before store
construction, and `resolveSyncUrl()` re-derived from `getApiBase()`; no consumer
imports these symbols (F6), so the change is `api/`-internal.

### G-306 · DESIGN-RISK · Consumers capture method references; the barrel swap must preserve object identity
**Evidence:** `client/src/containers/ExportPreviewModalContainer.tsx:14-20,41`
documents that `loadExport`'s referential identity is load-bearing (effect dependency
array); `client/src/stores/session/AutoSaveController.ts:159-160` captures a closure
over `projectApi.save` at construction; nothing machine-enforces barrel-only deep
imports (F13), so a reassignable `export let` or module-swap trick would also be
fragile against future deep importers.
**Impact:** A naive implementation (reassigning exports, HMR-style module
substitution, or a Proxy with unstable method identities) refires effects, aborts
in-flight requests, or pins a stale transport inside long-lived closures.
**Special measure:** Frozen delegator objects created once at module load, delegating
per-call through `getApiTransport()` (Recommendation §1); captured references stay
valid across `setApiTransport` because delegation is inside the method body.

### G-307 · NEEDS-MEASURE · In-process export blocks the webview thread and cannot honor a deadline
**Evidence:** `exportApi.run` remote-mode semantics: 120 s `LONG_TIMEOUT_MS`
(`client/src/api/resources/exportApi.ts:30-31`) plus abort. Locally the export core
runs in the same JS thread as the UI; a real project is 300,249 pixel cells and 264
textures per run (MASTER §4). An `AbortSignal` cannot interrupt synchronous compute,
and a deadline would reject the promise while the work keeps running.
**Impact:** Local exports may freeze the UI for seconds and are effectively
non-cancellable mid-stage; the 120 s timeout is unenforceable and this design
deliberately drops it for rows 1-14 (table §2).
**Special measure:** None from the client seam. Whether the ported export pipeline
must run in a Web Worker (and what `ServerBindings.exporter` then looks like —
structured-clone boundaries, transferable buffers) is task 01/04's measurement; the
seam is indifferent (a Promise either way) but the implementation plan must budget
for it.
