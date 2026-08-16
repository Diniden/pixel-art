# 15 — The single typed API layer

**Wave:** W9 · **Depends on:** 14
**Touches:** `client/src/api/` (new: `index.ts`, `client/{httpClient,errors,config}.ts`, `resources/{projectApi,backupApi,exportApi,aiApi,configApi}.ts`, `__mocks__/{handlers,fixtures}.ts`) · `client/src/services/api.ts` (deleted) · `client/src/services/aiService.ts` (deleted) · `client/src/services/export.ts` (deleted) · `client/src/store/projectActions.ts` (call sites) · `client/src/components/BrowseBackupsModal/BrowseBackupsModal.tsx` · `client/src/components/ExportPreviewModal/ExportPreviewModal.tsx` · `client/src/components/Header/Header.tsx` · `client/src/components/AIInterpolateModal/AIInterpolateModal.tsx` (API calls only) · `client/vitest.config.ts` (MSW setup) · `client/.storybook/preview.tsx` (MSW addon) · `client/package.json` · `client/eslint.config.js` (api boundary rule)
**Effort:** L

## Objective

After this task there is exactly one place in the client that calls `fetch`, every response is typed, every failure throws a typed `ApiError` instead of fabricating a success value, every request has a timeout and an abort signal, and MSW handlers serve both Vitest and Storybook. The migration logic moves out of the transport layer.

## Context

### The measured problem

| Metric | Value |
| --- | --- |
| `fetch` call sites in the client | **17** (16 in `client/src/services/`, 1 in `ExportPreviewModal.tsx:408`) |
| …with a timeout or `AbortSignal` | **0 of 17** |
| Client functions that **swallow the error and return a fabricated value** | **6** |
| Unbounded poll loops | 1 (`aiService.ts:180-216`, `while (true)`) |
| Unbounded retry loops | 1 (`autoSave.ts:29-34`, infinite, no backoff, no cap) |
| Bare `console.error` swallows in `api.ts` alone | 8 |

**The six fabricated-value functions:**

| Function | Current behaviour | Consequence |
| --- | --- | --- |
| `api.ts:148-159` `getConfig` | catch → returns `{currentProject:"project"}` | Downstream `projectActions.ts:26` then loads or creates a project literally named `project` |
| `api.ts:162-174` `listProjects` | catch → returns `[]` | UI shows "no projects" when the server is merely down; the user may create a duplicate |
| **`api.ts:177-241` `loadProject`** | **catch-all → returns `createDefaultProject()` (line 239)** | **The highest-severity bug in the repo.** See below. |
| `api.ts:370-388` `listBackups` | catch → returns `[]` | `BrowseBackupsModal` renders "no backups" for a server error; the user concludes their backups are gone |
| `aiService.ts:41-51` `getAiConfig` | bare `catch {}` → returns hard-coded `http://localhost:8100` | The fabricated default then appears in `Header.tsx:33` as "the server default", which is a lie |
| various | `.catch(() => ({error: statusText}))` fallbacks | masks the real status |

### The critical bug this task exists to close

**`loadProject()` swallows every failure and returns a blank default project, which auto-save then writes over the user's real 1.1 MB file.** The chain is exact:

```
api.ts:236-240   catch → return createDefaultProject()
  → store/projectActions.ts:32-50   set({ project: <the blank default> })
    → any subsequent edit
      → store/index.ts:84   scheduleAutoSave(newProject, projectName)
        → services/autoSave.ts:53 → api.ts:256   POST /api/project?name=<real name>
          → server overwrites  server/src/data/<real project>.json  with the blank one
```

A transient network blip during load is enough. `safeWriteFile` on the server makes the overwrite **atomic**, not **safe**. Task 07's `loadProject.test.ts` assertion L6 pins this behaviour today; **this task is where it flips.**

The fix has two halves. The API half is here: `projectApi.get` **throws** a typed `notFound`/`network`/`server` error instead of inventing a project. The store half — the load-state gate that blocks auto-save — is task 16.

### Target structure

```
client/src/api/
  index.ts                  # public barrel: the ONLY import site for consumers
  client/
    httpClient.ts           # request<T>() — the single fetch wrapper
    errors.ts               # ApiError hierarchy + type guards
    config.ts               # API_BASE, DEFAULT_TIMEOUT_MS, LONG_TIMEOUT_MS
  resources/
    projectApi.ts  backupApi.ts  exportApi.ts  aiApi.ts  configApi.ts
  __mocks__/
    handlers.ts             # MSW handlers, shared by Storybook + Vitest
    fixtures.ts             # canned CompactProject / Job payloads
```

**Hard rule: `client/src/api/**` imports nothing from `client/src/stores/**` or `client/src/components/**`.** Add a `no-restricted-imports` block for it to `client/eslint.config.js`, alongside the four blocks task 05 created.

### `httpClient.request<T>()`

```ts
export const API_BASE = import.meta.env.VITE_API_URL || "/api";
export const DEFAULT_TIMEOUT_MS = 15_000;
export const LONG_TIMEOUT_MS = 120_000;   // export, AI submit

export interface RequestOptions<T> {
  method?: "GET" | "POST" | "DELETE";
  path: string;                          // e.g. "/project"
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}
export async function request<T>(opts: RequestOptions<T>): Promise<T>;
```

Behaviour, in order:
1. Build the URL from `API_BASE` + `path` + encoded `query`, skipping `undefined` values.
2. Create an internal `AbortController` and `setTimeout(abort, timeoutMs)`. If the caller passed a `signal`, link both.
3. `fetch` with `Content-Type: application/json` when a `body` is present.
4. `fetch` rejection → `NetworkError`. Internal-timeout abort → `TimeoutError`. Caller-signal abort → rethrow the `AbortError` **unwrapped**, so React effects can ignore it.
5. `!response.ok` → read the body **defensively**: `await response.json()` inside its own try/catch, falling back to `await response.text()`, then to `response.statusText`. (Several current call sites do `await response.json()` unguarded in the error path, which throws on a proxy's HTML 502 page and masks the real status.)
6. `204` or `Content-Length: 0` → resolve `undefined as T`.
7. **Never `console.error`. Never return a fabricated value. Errors always throw.**

### Error taxonomy

```ts
export type ApiErrorKind =
  | "network"     // fetch rejected — server unreachable, DNS, CORS
  | "timeout"     // our AbortController fired
  | "notFound"    // 404
  | "conflict"    // 409  (create/rename duplicate, job in progress)
  | "validation"  // 400
  | "server"      // 5xx
  | "unknown";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;        // absent for network/timeout
  readonly path: string;
  readonly serverMessage?: string; // the server's `{error}` field, verbatim
}
export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
export const isKind = (e: unknown, k: ApiErrorKind): e is ApiError => isApiError(e) && e.kind === k;
```

Status mapping: `400 → validation`, `404 → notFound`, `409 → conflict`, `5xx → server`, fetch rejection → `network`, internal abort → `timeout`. **Callers distinguish by `kind`, never by string matching.**

### Resource signatures

```ts
export const projectApi = {
  list(signal?: AbortSignal): Promise<string[]>;
  get(name?: string, signal?: AbortSignal): Promise<CompactProject>;   // RAW, UNMIGRATED
  save(project: CompactProject, name?: string): Promise<{ success: true; backupCreated: boolean }>;
  create(name: string, projectData?: CompactProject): Promise<{ success: true; projectName: string }>;
  rename(oldName: string, newName: string): Promise<void>;
  remove(name: string): Promise<void>;
  switchTo(name: string): Promise<void>;
};
export interface BackupEntry { date: string; time: string; filename: string }
export const backupApi = {
  list(projectName?: string, signal?: AbortSignal): Promise<BackupEntry[]>;
  restore(date: string, filename: string, projectName?: string): Promise<void>;
  createMigrationBackup(project: CompactProject): Promise<{ success: true; message: string }>;
};
export const exportApi = {
  run(projectName?: string, signal?: AbortSignal): Promise<{ success: true; kebabName: string /* … */ }>;
  fetchFramesJson(kebabName: string, signal?: AbortSignal): Promise<unknown>;
};
export const aiApi = {
  getConfig(signal?: AbortSignal): Promise<AiConfigResult>;
  health(aiServiceUrl?: string, signal?: AbortSignal): Promise<AiHealthResult>;
  submitJob(input: JobSubmitInput, signal?: AbortSignal): Promise<JobSubmitResult>;
  getJob(jobId: string, aiServiceUrl?: string, signal?: AbortSignal): Promise<JobStatusResult>;
  pollJob(jobId: string, opts: {
    aiServiceUrl?: string;
    signal: AbortSignal;      // REQUIRED — makes the unbounded loop unrepresentable
    maxWaitMs?: number;       // default 300_000
    onStatus?: (job: JobStatusResult) => void;
  }): Promise<JobStatusResult>;
};
export const configApi = {
  get(signal?: AbortSignal): Promise<ServerConfig>;
  setCurrentProject(name: string): Promise<void>;
};
```

Two design points that are load-bearing:

- **`projectApi.get` returns the RAW `CompactProject`.** Migration is not the API layer's job — transport must not mutate domain data. All the migration logic currently living in `client/src/services/api.ts:15-145` moves to the **store's** load path in task 16. **Move it verbatim; do not rewrite it while moving.** Task 07's corpus snapshots are the proof of equivalence.
- **`aiApi.pollJob` takes a REQUIRED `signal`.** This is what makes `aiService.ts:180-216`'s `while (true)` loop unrepresentable in the type system. Today a job stuck in `processing` polls forever, closing the modal does not stop it, and one rejection orphans the server-side job.

### Contract facts to encode

- **`GET /api/ai/health` always returns HTTP 200** and encodes failure in `{status:'error'}` — so `aiService.ts:70`'s `!response.ok` branch is **unreachable dead code**. Do not carry it over.
- **Health can lie.** In proxy mode with `AI_REMOTE_URL` unset, the Python service returns `{"status":"ok","mode":"proxy","remote_configured":false}` and the header shows "Connected" while every job will fail. **Surface `remote_configured` in `AiHealthResult`** so a consumer can distinguish. (Changing the Python side is out of scope; reading the field it already sends is not.)
- **`POST /api/project` ignores its response body**, discarding `backupCreated`. Return it from `projectApi.save` so a consumer can use it.
- **The export response's `path` is an absolute server filesystem path** the browser cannot use; only `kebabName` is consumed. Task 11 may already have removed it — check what the server now returns and type `exportApi.run` to match.
- **`POST /api/project/restore-backup` returns 500, not 404, for a missing backup file** (`project.ts:324` catches the throw). Map it as the server sends it; do not invent a 404 client-side. The server-side unification is a separate open question.
- Endpoints with **no client caller** — `POST /api/config`, `POST /api/ai/interpolate`, `GET /api/ai/jobs` (list), `POST /api/ai/config`, `GET /api/ai/heartbeat` — **do not need resource methods.** Do not build them. (`checkAiHeartbeat` and `interpolateFrames` were already deleted as dead by task 02.)

### MSW

```sh
cd client && bun add --exact -d msw msw-storybook-addon
```

- `client/src/api/__mocks__/handlers.ts` exports `handlers` (happy path) plus named scenario factories: `serverDownHandlers`, `notFoundHandlers`, `slowExportHandlers`, `aiJobFailureHandlers`.
- **Vitest:** `setupServer(...handlers)` in the test setup with `onUnhandledRequest: "error"` — an un-mocked endpoint fails the test, which keeps the mock catalogue honest.
- **Storybook:** `msw-storybook-addon` in `preview.tsx`; stories set `parameters.msw.handlers` per story. This is what makes the loading / failed / conflict states — which have no UI at all today — storyable.
- Because the API layer is the only `fetch` caller, MSW intercepts everything with no per-module stubbing, so the resource modules stay real and their URL construction and error mapping are under test.

## Steps

1. Build `client/src/api/client/{config,errors,httpClient}.ts` and unit-test `httpClient` against MSW: timeout fires as `TimeoutError`; caller abort rethrows unwrapped; a non-JSON error body falls back cleanly; 204 resolves `undefined`.
2. Add the `client/src/api/**` `no-restricted-imports` block to `client/eslint.config.js`.
3. Port `projectApi`, `backupApi`, `configApi` from `services/api.ts`. **Leave the migration functions where they are for now** — task 16 moves them into the store load path. `projectApi.get` returns the raw payload.
4. Port `aiApi` from `services/aiService.ts`, replacing the `while (true)` loop with `pollJob`'s signal-and-deadline implementation.
5. Port `exportApi` from `services/export.ts` **and** the inline `fetch` at `ExportPreviewModal.tsx:408`.
6. Update every caller: `store/projectActions.ts`, `BrowseBackupsModal.tsx`, `ExportPreviewModal.tsx`, `Header.tsx`, `AIInterpolateModal.tsx`. **Every caller must now handle a throw** — the fabricated-value fallbacks they relied on are gone. Where a component previously rendered an empty list on failure, it must now render an explicit error state.
7. Delete `client/src/services/api.ts`, `client/src/services/aiService.ts` and `client/src/services/export.ts`. Do **not** delete `client/src/services/autoSave.ts` — task 16 owns that.
8. Add MSW, the handler catalogue, the Vitest `setupServer` with `onUnhandledRequest: "error"`, and the Storybook addon.
9. Write contract tests: run each `__mocks__/fixtures.ts` payload through its resource method and assert the shape.

## Constraints

- **No lockfiles; pin exact versions.** Standing project policy (owner decision, 2026-08-16): `bunfig.toml`'s `[install.lockfile] save = false` is deliberate and must stay, the repo has no lockfile of any kind, and every dependency is written as an exact version in `package.json`. Every `bun add` in this task uses `--exact` (plain `bun add x@1.2.3` writes `"^1.2.3"`). Never create, commit or regenerate a lockfile; `--frozen-lockfile` is meaningless here.
- **`client/src/api/**` must not import from `client/src/stores/**` or `client/src/components/**`.** ESLint-enforced.
- **No `console.error` and no fabricated return value anywhere in `client/src/api/`.** Errors always throw.
- **Do not move or rewrite the migration functions in this task.** They stay in `services/api.ts`'s place until task 16 relocates them verbatim into the store load path. Preserving all 8 migrations is a hard requirement — the owner's gzipped backups spanning Jan–Jul 2026 depend on them.
- **Do not delete `services/autoSave.ts`** — task 16.
- Do not build resource methods for the 5 endpoints that have no client caller.
- Do not change any server route.
- Do not introduce a `shared/` workspace or a runtime schema validator (Zod) in this task — both were proposed and both are recorded as open questions; adding a runtime dependency to a client that currently has four production dependencies needs the owner's answer.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx eslint . && bun run build && bunx storybook build
bunx vitest run src/api                       # httpClient + resource + contract tests
bunx vitest run                               # full suite
# The old service modules are gone and nothing imports them:
test ! -f src/services/api.ts && test ! -f src/services/aiService.ts && test ! -f src/services/export.ts
! grep -rn "services/api\|services/aiService\|services/export" src
# fetch is called from exactly one place:
test "$(grep -rn 'fetch(' src --include='*.ts' --include='*.tsx' | grep -v '/api/client/httpClient.ts' | wc -l)" -eq 0
# The api layer imports nothing from stores or components:
! grep -rn "from \"\.\./\.\./stores\|from \"\.\./\.\./components" src/api
```

Manual checks — required:
1. **Stop the server, reload the app.** Expect an explicit error state, **not** a blank canvas. Then `ls -la server/src/data/` — the real project file must be untouched at ~1.1 MB. (The full gate lands in task 16; this confirms the API half no longer fabricates.)
2. **AI job cancellation:** open the AI modal, start a job, close the modal mid-run, and confirm polling stops — the network panel must go quiet.
3. **Export:** run an export and open the export preview; frames must still render.
4. **Backups:** with the server stopped, open the backup browser and confirm it shows an error, not "no backups".
5. **Timeout:** kill the server mid-request and confirm a `TimeoutError` surfaces rather than a hang.

## Definition of done

- [ ] `client/src/api/` exists with the structure in Context; `index.ts` is the only import site for consumers.
- [ ] `fetch` is called from exactly one file (`httpClient.ts`); all 17 former call sites are routed through it.
- [ ] Every request has a timeout and supports an `AbortSignal`; `aiApi.pollJob`'s `signal` is **required**.
- [ ] All six fabricated-value functions now throw typed `ApiError`s; **zero** `console.error` calls remain in `client/src/api/`.
- [ ] `projectApi.get` returns the **raw, unmigrated** `CompactProject`.
- [ ] `services/{api,aiService,export}.ts` deleted; `services/autoSave.ts` **retained**.
- [ ] Every former caller handles throws and renders an explicit error state where it used to render an empty one.
- [ ] MSW handlers exist and are shared by Vitest (`onUnhandledRequest: "error"`) and Storybook.
- [ ] The `client/src/api/**` boundary rule is in `eslint.config.js` and `bunx eslint .` exits 0.
- [ ] The migration functions were **not** moved or rewritten.
- [ ] All 5 manual checks performed and recorded.
