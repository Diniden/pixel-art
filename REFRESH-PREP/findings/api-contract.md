# API & Server-Contract Audit

**Task:** P1-05 · **Measured:** 2026-08-16 · **Method:** direct read of
`server/src/routes/*.ts`, `server/src/backup.ts`, `ai-service/*.py`,
`client/src/services/*.ts`, `client/src/types/index.ts`, plus inspection of the
live on-disk project at `server/src/data/Base Unit.json`.

## Summary

| Metric | Value |
| --- | --- |
| Express endpoints (incl. `/health`) | **23** (`/health` + 13 project + 1 export + 8 ai) |
| AI-service endpoints — GPU mode | **11** (`/health`, `/heartbeat`, `/jobs`×3, `/dashboard`, `DELETE /jobs/{id}`, 2 file routes, `/interpolate`, `/ui`) |
| AI-service endpoints — proxy mode | **10** (9 proxy routes + `/ui`; the GPU-only routes are **not registered**) |
| Client API functions | **19** (11 in `api.ts`, 6 in `aiService.ts`, 1 re-export in `export.ts`, 2 autoSave entry points) |
| Endpoints with **no client caller** | **5** (`POST /api/config`, `POST /api/ai/interpolate`, `GET /api/ai/jobs`, `POST /api/ai/config`, `GET /api/ai/heartbeat`) |
| Distinct schema migrations found | **8** (5 structural + 3 field-default families) |
| `fetch` call sites total | **17** (16 in `client/src/services/`, 1 in `ExportPreviewModal.tsx:408`) |
| `fetch` sites with **no timeout / no AbortSignal** | **17 of 17** |
| Client calls that **swallow the error and return a fabricated value** | **6** |

Three findings dominate:

1. **`loadProject()` swallows every failure and returns `createDefaultProject()`**
   (`client/src/services/api.ts:236-240`). The store then hands that empty
   project straight to auto-save (`store/projectActions.ts:32-41` →
   `store/index.ts:84` → `services/autoSave.ts:53`). A transient network blip
   during load can overwrite a 1.1 MB project file with a blank default. This is
   the single highest-severity contract bug in the repo.
2. **All migration logic lives in the transport layer** (`services/api.ts:15-145`)
   and in the serializer (`types/index.ts:797-1085`). It is invoked *only* on the
   `loadProject` HTTP path, so any other read of a project file (backup restore
   preview, export) skips it entirely.
3. **`server/src/routes/export.ts` re-implements the client's compact schema by
   hand** (`export.ts:44-95`), including its own `normalizePixel` legacy-pixel
   migration (`export.ts:412-418`) that duplicates
   `types/index.ts:migrateLegacyPixel`. Two copies of the same migration in two
   languages of the same repo — they can and will drift.

---

## Endpoint catalogue

### Express server — `server/src/index.ts:27-34`

Mount points: `app.use('/api', projectRouter | exportRouter | aiRouter)` plus a
bare `/health` and a static mount `app.use('/exports', express.static(exportsDir))`
(`index.ts:24`). Body limit is `50mb` (`index.ts:20`); CORS is wide open
(`index.ts:19`).

| Method | Path | Params | Request | Success response | Client caller | Errors |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/health` | — | — | `{status:"ok"}` | **none** | — |
| GET | `/api/config` | — | — | `{currentProject:string, aiServiceUrl?:string}` (raw `config.json`, `project.ts:43-44`) | `getConfig()` `api.ts:148` | 500 `{error}` |
| POST | `/api/config` | — | `{currentProject:string}` | `{success:true}` | **none** | 400 `{error:'Invalid project name'}`, 500 |
| GET | `/api/projects` | — | — | `{projects:string[]}` | `listProjects()` `api.ts:162` | 500 |
| GET | `/api/project` | `?name` (opt) | — | raw project JSON (`CompactProject`) | `loadProject()` `api.ts:177` | 404 `{error,projectName}`, 500 |
| POST | `/api/project` | `?name` (opt) | `CompactProject` | `{success:true, backupCreated:boolean}` | `saveProject()` `api.ts:244` | 400 `{error:'Invalid project data'}`, 500 |
| POST | `/api/project/create` | — | `{name:string, projectData?:CompactProject}` | `{success:true, projectName:string}` | `createProject()` `api.ts:273` | 400, **409** `{error:'Project already exists'}`, 500 |
| POST | `/api/project/rename` | — | `{oldName,newName}` | `{success:true}` | `renameProject()` `api.ts:303` | 400, 404, **409**, 500 |
| DELETE | `/api/project` | `?name` (**required**) | — | `{success:true}` | `deleteProject()` `api.ts:327` | 400 (invalid **or last project**), 404, 500 |
| POST | `/api/project/switch` | — | `{name:string}` | `{success:true}` | `switchProject()` `api.ts:349` | 400, 404, 500 |
| GET | `/api/project/backups` | `?name` (opt) | — | `{backups:{date,time,filename}[]}` | `listBackups()` `api.ts:370` | 500 |
| POST | `/api/project/restore-backup` | `?name` (opt) | `{date,filename}` | `{success:true}` | `restoreBackup()` `api.ts:391` | 400 `{error:'Missing date or filename'}`, 500 (**404 collapses to 500**) |
| POST | `/api/project/backup` | — | `CompactProject` | `{success:true, message:'Backup created'\|'Backup already exists'}` | inline `fetch` in `loadProject`, `api.ts:211` | 400, 500 |
| POST | `/api/project/export` | `?name` (opt) | — (**body ignored**) | `{success:true, path:string, kebabName:string}` | `exportProject()` `api.ts:415`, re-export `services/export.ts:7` | 400 `{error:'No project name'}`, 404, 500 |
| POST | `/api/ai/jobs` | — | `{frame_start,frame_end,num_frames,scale?,flow_scale?,ai_service_url?}` | pass-through `{job_id,status}` | `submitJob()` `aiService.ts:119` | 400, upstream status, 500 `{error:'Proxy error: …'}` |
| GET | `/api/ai/jobs/:jobId` | `:jobId`, `?ai_service_url` | — | pass-through job dict | `getJobStatus()` `aiService.ts:156` | upstream status, 500 |
| GET | `/api/ai/jobs` | `?status,?page,?per_page,?ai_service_url` | — | pass-through `{jobs,total,page,per_page,total_pages}` | **none** | upstream, 500 |
| POST | `/api/ai/interpolate` | — | `{frame_start,frame_end,num_frames,scale?,ai_service_url?}` | `{frames:string[]}` | **none** | 400, upstream, 500 |
| GET | `/api/ai/health` | `?ai_service_url` | — | pass-through `{status,mode?}` — **always HTTP 200** | `checkAiHealth()` `aiService.ts:57` | never non-2xx; failure encoded as `{status:'error',detail}` (`ai.ts:188,195,199`) |
| GET | `/api/ai/heartbeat` | `?ai_service_url` | — | `{status,model_ready,detail?}` — **always HTTP 200** | `checkAiHeartbeat()` `aiService.ts:86` (**never called by any component**) | failure encoded in body (`ai.ts:221,233,241`) |
| POST | `/api/ai/config` | — | `{aiServiceUrl:string}` | `{success:true, aiServiceUrl}` | **none** | 500 |
| GET | `/api/ai/config` | — | — | `{aiServiceUrl, envAiServiceUrl, effectiveAiServiceUrl}` | `getAiConfig()` `aiService.ts:41` | 500 |
| GET | `/exports/*` | static path | — | file bytes | `fetch('/exports/<kebab>/frames.json')` `ExportPreviewModal.tsx:408` + `loadTextures()` | 404 from express.static (HTML body, not JSON) |

### AI service (Python FastAPI) — GPU mode only (`ai-service/server.py:76-230`)

These routes exist **only when `_has_nvidia_gpu()` and no `AI_REMOTE_URL`**
(`server.py:43-44, 76`). On a non-GPU machine they are not registered at all.

| Method | Path | Params | Request | Success response | Errors |
| --- | --- | --- | --- | --- | --- |
| GET | `/health` | — | — | `{status:"ok",mode:"gpu"}` | `{status:"error",mode:"gpu",detail}` at HTTP **200** (`server.py:116`) |
| GET | `/heartbeat` | — | — | `{status:"ok",model_ready:true}` | `{status:"error",model_ready:false,detail}` at HTTP 200 (`server.py:129`); **success path omits `mode`, error path at :126 omits `model_ready`** |
| POST | `/jobs` | — | `JobCreateRequest` (`server.py:80-85`): `frame_start`, `frame_end`, `num_frames` 1..64 (default 3), `scale` 1..16 (default 4), `flow_scale` 0.25..4.0 (default 1.0) | `{job_id, status}` | 422 pydantic validation |
| GET | `/jobs/{job_id}` | `:job_id` | — | `Job.to_dict()` + `frames:string[]` when completed (`server.py:150-153`) | 404 `{detail:"Job not found"}` |
| GET | `/jobs` | `?status,?page≥1,?per_page 1..100` | — | `{jobs,total,page,per_page,total_pages}` (`job_manager.py:238-244`) | 422 |
| GET | `/dashboard` | `?queued_page,?completed_page,?errors_page,?per_page` | — | `{queued,completed,errors,mode:"gpu"}` (`server.py:170-177`) | 422 |
| DELETE | `/jobs/{job_id}` | `:job_id` | — | `{deleted:true, job_id}` | 404, **409** `{detail:"Cannot delete a job that is still in progress"}` |
| GET | `/jobs/{job_id}/input/{filename}` | path | — | `image/png` FileResponse | 404 |
| GET | `/jobs/{job_id}/output/{filename}` | path | — | `image/png` FileResponse | 404 |
| POST | `/interpolate` | — | `InterpolateRequest` (`server.py:87-92`) | `{frames:string[]}` | 400 decode / size-mismatch, 500 |
| GET | `/ui` | — | — | `text/html` | 404 |

### AI service — proxy mode (`ai-service/proxy.py`, mounted at `server.py:65-70`)

| Method | Path | Behaviour | Notes |
| --- | --- | --- | --- |
| GET | `/health` | If `AI_REMOTE_URL` unset returns **HTTP 200 `{"status":"ok","mode":"proxy","remote_configured":false}`** (`proxy.py:73-77`) | **Reports healthy while being completely non-functional** — see drift table |
| GET | `/heartbeat` | forwards | 503 if unconfigured (`proxy.py:29-34`) |
| GET | `/dashboard` | forwards, injects `mode:"proxy"`, `remote_configured` (`proxy.py:92-94`) | |
| GET,POST | `/jobs` | forwards | |
| GET,DELETE | `/jobs/{job_id}` | forwards | |
| GET | `/jobs/{job_id}/input/{filename}` | forwards | |
| GET | `/jobs/{job_id}/output/{filename}` | forwards | |
| POST | `/interpolate` | forwards | |
| GET | `/ui` | served from `server.py:236` in both modes | |

Proxy client timeout is **120 s** (`proxy.py:23`). `GET /dashboard` is proxied
but Express exposes no `/api/ai/dashboard`, so the client can never reach it.

---

## Contract drift  ← real bugs likely here

| # | Endpoint | Client expects | Server sends | Impact |
| --- | --- | --- | --- | --- |
| D1 | `GET /api/project` | `loadProject` returns `Promise<Project>`; on **any** throw returns `createDefaultProject()` (`api.ts:236-240`) | 404 `{error,projectName}` or 500 `{error}` | **Data loss.** A 500, a JSON parse failure, or a dropped connection yields a blank default project. `projectActions.ts:32` sets it as `project`; the very next edit calls `scheduleAutoSave` (`store/index.ts:84`) which `POST /api/project` overwrites the real file with the blank one. `safeWriteFile` makes the overwrite *atomic*, not *safe*. |
| D2 | `POST /api/project` | `saveProject` (`api.ts:244-270`) ignores the response body entirely | `{success:true, backupCreated:boolean}` | `backupCreated` is dead on arrival. The client has no way to tell the user "a restore point was just made", and no way to force one. |
| D3 | `GET /api/config` | `getConfig(): Promise<{currentProject:string}>` (`api.ts:148`) | the **entire** `config.json`, which `POST /api/ai/config` mutates to also hold `aiServiceUrl` (`ai.ts:251-256`) | Server config and AI config share one untyped file. `saveConfig` is typed `{currentProject:string}` (`backup.ts:313`) but `ai.ts:256` casts a `Record<string,unknown>` through it. A future `saveConfig({currentProject})` call from `project.ts:61,171,205,245,270` **silently deletes the persisted `aiServiceUrl`.** Verified: current `server/src/data/config.json` is `{"currentProject":"Base Unit"}` with no `aiServiceUrl` — the field has already been lost at least once. |
| D4 | `POST /api/project/restore-backup` | `restoreBackup` throws on non-2xx and reads `data.error` (`api.ts:406-411`) | `readBackupFile` throws "Backup file not found" → caught at `project.ts:324` → **HTTP 500**, never 404 | A missing/typo'd backup is indistinguishable from a server crash. Client cannot offer "that backup is gone, pick another". |
| D5 | `GET /api/ai/health` | `checkAiHealth(): {status, mode?, detail?}` (`aiService.ts:59`) | Express **always** returns HTTP 200 and encodes failure in `status:'error'` (`ai.ts:188,195,199`). `mode` is only present when the Python service is in GPU mode (`server.py:114`) | The `!response.ok` branch at `aiService.ts:70` is **unreachable dead code**. Worse: in proxy mode with `AI_REMOTE_URL` unset, Python returns `{"status":"ok","mode":"proxy","remote_configured":false}` (`proxy.py:73-77`) → Express forwards it → `Header.tsx:41` and `AIInterpolateModal.tsx:339` both show **"Connected"** and let the user start a job that will always fail. `remote_configured` is never read anywhere in the client. |
| D6 | `POST /api/ai/jobs` | client sends `flow_scale` (`aiService.ts:132`) | Express `InterpolateBody` (`ai.ts:6-12`) declares **no `flow_scale`** — it survives only because `ai.ts:57` forwards `req.body` verbatim | Silent. The moment anyone adds field validation or field-picking to `/ai/jobs` (as `/ai/interpolate` already does at `ai.ts:141-146`), `flow_scale` is dropped and RIFE quality changes with no error. |
| D7 | `POST /api/ai/interpolate` | — no caller — | Explicitly rebuilds the payload as `{frame_start, frame_end, num_frames, scale?}` (`ai.ts:141-146`), **dropping `flow_scale`** | Already broken; latent because nothing calls it. Delete it or fix it, don't leave it. |
| D8 | `GET /api/ai/jobs/:jobId` | `JobStatusResult` requires `num_frames, scale, flow_scale, created_at, completed_at, error, output_count` non-optional; `frames?` optional (`aiService.ts:18-29`) | `Job.to_dict()` (`job_manager.py:47-50`) emits exactly those fields, **plus** `frames` only when `COMPLETED` (`server.py:151-153`) | Shapes agree today by coincidence — two hand-written definitions in two languages with zero shared schema. `Job.from_dict` (`job_manager.py:53-56`) silently drops unknown keys, so a Python-side field addition never reaches TS. |
| D9 | `GET /api/ai/heartbeat` | `HeartbeatResult` requires `model_ready:boolean` (`aiService.ts:3-7`) | Python `/heartbeat` error path at `server.py:126` returns `{"status":"error","detail":…}` with **no `model_ready`** | `result.model_ready` is `undefined` where the type says `boolean`. Currently harmless only because `checkAiHeartbeat` has **no caller** in the client. |
| D10 | `GET /api/ai/config` | `AiConfigResult` all three fields required (`aiService.ts:31-35`) | matches (`ai.ts:280-284`) | ✅ no drift — the only AI endpoint whose contract is fully honoured. |
| D11 | `POST /api/project/export` | `exportProject(): {success:true, path, kebabName}` (`api.ts:417`) | matches (`export.ts:920`) | ✅ shape matches, but `path` is an **absolute server filesystem path** the browser cannot use. Only `kebabName` is consumed (`ExportPreviewModal.tsx:407`). `path` is server-internal information leaked to the client. |
| D12 | `CompactUIState` vs disk | `CompactUIState` (`types/index.ts:612-663`) does **not declare** `lightGridMode`, yet `compactToProject` reads `compact.uiState.lightGridMode` (`types/index.ts:967`) | The live file `server/src/data/Base Unit.json` **does contain** `lightGridMode` in `uiState` | Round-trips only because `projectToCompact` spreads `...project.uiState` (`types/index.ts:754`), bypassing TS excess-property checking. Any future explicit field-by-field serializer silently drops the user's setting. Same latent hole for `layerSelectionCounter` and `gaussianFill`, both present in `UIState` (`types/index.ts:153,186`) and absent from `CompactUIState`'s explicit list except `gaussianFill` at `:655`. |
| D13 | `CompactLayer.variantGroupId` vs export | Client writes `variantGroupId` (`types/index.ts:554`) | `export.ts:46-56` reads `variantGroupId` and **renames it to `variantLayerId`** on output (`export.ts:574`) | Intentional but undocumented rename. Three names for one concept across the stack: `variantGroupId` (disk) → `variantLayerId` (export) → `variantLayers` (export root, vs `variants` on disk, `export.ts:94` vs `:162`). |
| D14 | `/exports/*` static 404 | `ExportPreviewModal.tsx:409` checks `res.ok` then `res.json()` | `express.static` 404 returns an **HTML** body | On a stale `kebabName` the `!res.ok` check catches it first — correct here by luck; the same pattern applied to `loadTextures` has no such guard. |
| D15 | Legacy-pixel migration | Client migrates `number → [color,0,1]` (`types/index.ts:1060-1068`) | Server independently migrates `number → [pixel,0,1]` (`export.ts:412-418`, `normalizePixel`) | Two copies of the same rule. If the client's height default ever changes from `1`, exports silently keep the old value with no compile error anywhere. |

---

## Type duplication

Client types: `client/src/types/index.ts` — **1,086 lines**, 44 exported symbols.
Server types: hand-written inside `server/src/routes/export.ts:44-219` — **176
lines** of interface declarations, zero imports from the client.

| Type | Client (`types/index.ts`) | Server | Divergence |
| --- | --- | --- | --- |
| `CompactPixelData` | `:544` `[number,number,number] \| 0` | `export.ts:44` identical | Byte-identical, duplicated. |
| `CompactLayer` | `:547-561` (8 fields incl. `tags`-less) | `export.ts:46-56` | Server **omits nothing**, but the client's is the source of truth and the server's is a manual copy. Drift is a matter of time. |
| `CompactFrame` | `:563-568` — has `tags?:string[]` | `export.ts:58-62` — **no `tags`** | Server drops frame tags. `Base Unit.json` frames **do** carry `tags` (verified on disk). Exported `frames.json` therefore loses all frame tags. |
| `CompactVariantFrame` | `:571-577` — has `tags?` and deprecated `offset?` | `export.ts:64-67` — neither | Same tag loss for variant frames; server also cannot see the legacy `offset` it would need for D-M4 below. |
| `CompactVariant` | `:579-586` | `export.ts:69-75` identical | Duplicated. |
| `CompactVariantGroup` | `:588-592` | `export.ts:77-81` named **`CompactVariantLayerInput`** | Same shape, different name. |
| `CompactPixelObject` | `:594-604` — has deprecated `variantGroups?` | `export.ts:83-89` — **no `variantGroups`** | Server cannot export a pre-migration project's variants at all. Exporting an unmigrated file silently produces `variantLayers: []`. |
| `CompactProject` | `:665-682` — `palettes`, `uiState`, `referenceImage` required/present | `export.ts:91-95` — only `version?`, `objects`, `variants?` | Server deliberately narrows. Acceptable for export, but there is no compile-time link asserting the narrow type is a subset of the wide one. |
| `Exported*` family | **none** | `export.ts:98-164` (7 interfaces) | Server-only wire format; the consumer `server/exports/lib/versions/v1.ts:1-278` re-declares them **a third time**. |
| `CompactExported*` family | **none** | `export.ts:166-219` (7 interfaces) | Same — re-declared in `v1.ts`. |
| Job/AI types | `aiService.ts:3-35` (5 interfaces) | Python dataclass `job_manager.py:35-56` + pydantic `server.py:80-94` | Three independent definitions of one job schema, in two languages. |

**Count:** 9 project-schema types are duplicated between client and server;
14 export-format types are duplicated between `routes/export.ts` and
`exports/lib/versions/v1.ts`; 3 AI-job schemas exist in 3 places.

### Single-source-of-truth recommendation

**Recommendation: a `shared/` Bun workspace package exporting Zod schemas, with
TypeScript types derived via `z.infer`. One mechanism, not two.**

Add to the root `package.json`:

```json
{ "workspaces": ["client", "server", "shared"] }
```

`shared/` exports:

- `shared/src/schemas/project.ts` — `CompactProjectSchema`, `CompactLayerSchema`,
  … with `z.infer` type aliases re-exported.
- `shared/src/schemas/api.ts` — request/response schema per endpoint.
- `shared/src/schemas/ai.ts` — `JobStatusSchema`, `JobSubmitSchema`.
- `shared/src/migrations/` — the migration chain (see next section).

Why this and not the alternatives, concretely for **this** repo:

| Option | Why not |
| --- | --- |
| Plain `shared/` types (no runtime validation) | Would not have caught D12 (`lightGridMode` present on disk, absent from the type) or D9 (`model_ready` missing from a Python response). The bugs here are *runtime shape* bugs, and structural types are erased at runtime. |
| Generated client (OpenAPI / tRPC) | tRPC cannot reach the **Python** FastAPI service, which owns a third of the surface. OpenAPI codegen would need a spec authored by hand for Express (which has none) — that spec becomes a fourth place to drift. Neither addresses the real problem, which is the *persisted file* schema, not the wire schema. |
| Zod **without** a workspace package | Leaves `routes/export.ts:44-219` as a hand-copy. The duplication, not the validation, is the root cause. |

Tradeoffs to accept, stated plainly:

- **Cost:** +1 runtime dependency (~14 kB gz for `zod@3` tree-shaken) shipped to
  the browser, and a validation pass over a 1.1 MB project on every load.
  Measured input size: `Base Unit.json` is 1,129,965 bytes. Parse a full `safeParse`
  on load only; use `z.infer` types (zero runtime cost) on the hot save path.
- **Bun specifics:** Bun workspaces need no build step — `server/` runs TS
  directly via `bun --watch src/index.ts` (`server/package.json:7`), and Vite
  transpiles `shared/` for the client. So `shared/` ships **source only**, no
  `tsc` emit, no `dist/`, no dual-package hazard. Add `"exports"` pointing at
  `./src/index.ts` and set `"type": "module"`.
- **Python is out of scope for Zod.** For the AI service, generate a JSON Schema
  from the Zod job schemas (`zod-to-json-schema`) and assert it in a Python test
  against the pydantic models. That is the cheapest honest bridge; do not attempt
  to share types across the language boundary.
- **`server/exports/lib/`** is a *published artifact* consumed by downstream
  game code and must stay dependency-free. Keep `v1.ts` hand-written, but
  generate/verify it from the shared schema in CI rather than hand-syncing.

---

## Error handling census

| # | Call site | Current handling | Problem | Fix |
| --- | --- | --- | --- | --- |
| E1 | `api.ts:148-159` `getConfig` | try/catch → `console.error` → **returns `{currentProject:"project"}`** | Fabricates a project name on failure. Downstream `projectActions.ts:26` then loads/creates a project literally named `project`. | Throw a typed `ApiError`; let the caller decide. |
| E2 | `api.ts:162-174` `listProjects` | catch → `console.error` → **returns `[]`** | UI shows "no projects" when the server is merely down; user may create a duplicate. | Throw; surface "cannot reach server" in UI. |
| E3 | `api.ts:177-241` `loadProject` | catch-all → `console.error` → **returns `createDefaultProject()`** (`:239`) | **Highest-severity bug in the audit.** Silent catastrophic data loss via the auto-save chain (see D1). Also swallows JSON parse errors and migration exceptions. | Throw `ApiError`. Store must enter an explicit `loadFailed` state that **blocks auto-save**. |
| E4 | `api.ts:211-219` migration backup `fetch` | `catch` → `console.warn("Could not create backup")` → **migration proceeds anyway** (`:218`) | The one safety net before a destructive schema migration is best-effort. If the backup POST fails, the migration still runs and the next auto-save overwrites the pre-migration file. | Make the backup **mandatory**: on failure, abort the migration and refuse to load. |
| E5 | `api.ts:244-270` `saveProject` | catch → `console.error` → **re-throws** ✅ | Correct, but no `response.ok` body read — `response.statusText` only (`:264`), so the server's `{error}` message is discarded. | Read the JSON error body like the other mutators do. |
| E6 | `api.ts:284-299` `createProject` | checks `!response.ok`, reads `data.error`, re-throws ✅ | `await response.json()` at `:291` will itself throw if the body is not JSON (e.g. a proxy 502 HTML page), masking the real status. | Guard the body parse; fall back to `statusText`. |
| E7 | `api.ts:308-323` `renameProject` | same as E6 | same latent JSON-parse-in-catch issue | same |
| E8 | `api.ts:329-345` `deleteProject` | same as E6 | same | same |
| E9 | `api.ts:351-366` `switchProject` | same as E6 | same | same |
| E10 | `api.ts:370-388` `listBackups` | catch → `console.error` → **returns `[]`** | `BrowseBackupsModal.tsx:3` renders "no backups" for a server error. User concludes their backups are gone. | Throw; distinguish empty-list from failure. |
| E11 | `api.ts:391-412` `restoreBackup` | **no try/catch**; checks `!response.ok` ✅, throws | Network rejection propagates as a raw `TypeError: Failed to fetch` — caught at `projectActions.ts:204` and logged, returning `false`. User sees a generic failure. | Wrap in typed error taxonomy. |
| E12 | `api.ts:415-427` `exportProject` | no try/catch; checks `!response.ok` ✅ | Export can run for **many seconds** (sharp PNG encode with `effort:10`, `export.ts:476-483`) with **no timeout and no progress**. A hung request hangs the UI button forever. | Long-running: convert to a job, or at minimum add an abort signal + explicit long timeout. |
| E13 | `aiService.ts:41-51` `getAiConfig` | bare `catch {}` → returns a **hard-coded `http://localhost:8100`** | Swallows everything, including programming errors. The fabricated default then appears in `Header.tsx:33` as the "server default", which is a lie. | Return `null` and let the UI show "unknown". |
| E14 | `aiService.ts:57-80` `checkAiHealth` | catch → returns `{status:'error',detail}` | The `!response.ok` branch (`:70`) is **dead** — `/api/ai/health` never returns non-2xx (`ai.ts:174-201`). Genuine proxy 500s are indistinguishable from AI-down. | Have the proxy return real status codes; keep the body shape. |
| E15 | `aiService.ts:86-114` `checkAiHeartbeat` | same shape as E14 | **No caller anywhere in `client/src`** (verified by grep). Dead code carrying a wrong type (D9). | Delete or wire up. |
| E16 | `aiService.ts:139-151` `submitJob` | checks `!response.ok`, `response.json().catch(...)` fallback ✅ | Best error handling in the codebase. Still **no timeout** on a request carrying two base64 PNGs. | Add abort signal. |
| E17 | `aiService.ts:167-174` `getJobStatus` | checks `!response.ok`, JSON fallback ✅ | no timeout | Add abort signal. |
| E18 | `aiService.ts:180-216` `interpolateFrames` | `while (true)` poll loop with backoff 500 ms → 3 s | **Unbounded.** No max attempts, no wall-clock cap, no `AbortSignal`. A job stuck in `processing` polls forever; closing the modal does not stop it (no cancellation token). A single `getJobStatus` rejection escapes the loop and rejects the whole promise, orphaning the server-side job. | Cap total wall time; accept an `AbortSignal`; on abort call `DELETE /jobs/{id}` (endpoint exists at `server.py:179` but Express exposes no proxy for it). |
| E19 | `autoSave.ts:29-34` `performSave` catch | `catch { onSaveStatusChange('error'); ...re-queue + scheduleAutoSave }` | **Infinite retry with no backoff and no cap.** A permanently failing save (e.g. 400 invalid data) retries every 500 ms forever, hammering the server. The error object is discarded entirely — `catch {}` with no binding. | Exponential backoff, max attempts, surface the error text. |
| E20 | `ExportPreviewModal.tsx:408-414` | checks `res.ok` ✅, catch sets `error` state ✅ | no timeout; `loadTextures` (separate call at `:412`) has no `res.ok` equivalent visible | Route through the typed API layer. |
| E21 | `projectActions.ts:42,76,104,125,159,169,204` | 7 × `catch (error) { console.error(...) }` | The store's only failure channel is the devtools console. No user-visible error state exists. | Store exposes an `error` observable; containers render it. |

**Totals:** 17 fetch sites, **0** with a timeout or abort signal; **6** functions
that fabricate a success value on failure (E1, E2, E3, E10, E13, and the
`.catch(() => ({error: statusText}))` fallbacks); **1** unbounded poll loop;
**1** unbounded retry loop; **8** bare `console.error` swallows in `api.ts` alone.

---

## Schema migrations  ← must be preserved

Eight distinct migrations. **Every one must survive the refresh.** They are the
only thing standing between the user's existing 1.1 MB `Base Unit.json` (and the
gzipped backup history spanning Jan–Jul 2026 under `server/src/data/backups/`)
and silent corruption.

| # | Migration | From → To | Trigger | Idempotent? | Partial-file behaviour | Where it should live |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | **Expanded → compact detection** | `Project` with `Color` objects → `CompactProject` with hex numbers | `isCompactFormat(data)` `types/index.ts:1016-1035` at `api.ts:194` | Yes — pure predicate | **Heuristic and fragile.** Sniffs `palettes[0].colors[0]` typeof, falling back to `uiState.selectedColor` typeof. A project with **zero palettes and a non-numeric selectedColor returns `false`** → the file is returned raw as `Project` (`api.ts:235`) with **no conversion**, producing hex numbers where `Color` objects are expected. | Replace with an explicit `version`/`schemaVersion` field. Keep the sniffer as a fallback for files that predate versioning. |
| M2 | **Legacy pixel → tuple** | `pixel: number` → `[colorHex, 0, 1]` | `isLegacyCompactFormat(data)` `types/index.ts:1039-1057` → `migrateLegacyProject` `api.ts:27-109` → `migrateLegacyLayer` `types/index.ts:1071-1085` | **Yes**, per-pixel (`migrateLegacyPixel` returns arrays unchanged? **No** — see risk) | **Detection samples only ONE pixel**: the first non-zero pixel of `objects[0].frames[0].layers[0]` (`types/index.ts:1041-1054`). A file where object 0 is fully migrated but object 3 is legacy is reported as non-legacy → **object 3's pixels are never migrated and become garbage**. `migrateLegacyPixel` is *not* array-safe: given an already-migrated `[c,n,h]` it hits `legacyPixel === 0` → false, then returns `[[c,n,h], 0, 1]` — a nested array. Re-running it corrupts data. | `shared/src/migrations/`, applied per-pixel with a per-pixel type check (`typeof pixel === 'number'`), not a one-sample file-level guess. Mirror `export.ts:412-418`'s `normalizePixel`, which **is** array-safe — adopt that implementation. |
| M3 | **Lighting-studio uiState defaults** | uiState without `studioMode`/`selectedNormal`/`lightDirection`/`lightColor`/`ambientColor`/`eraserShape`/`pencilBrushShape`/`pencilBrushMax`/`traceNudgeAmount`/`normalBrushShape`/`heightScale` → populated | `migrateLegacyProject` `api.ts:86-105` (bulk) **and** `compactToProject` `types/index.ts:964-1007` (per-field `??`) | Yes — `??` defaults | Safe. Two independent code paths set overlapping defaults with the **same values** — verified `studioMode:"pixel"`, `eraserShape:"circle"`, `pencilBrushShape:"square"`, `pencilBrushMax:16`, `traceNudgeAmount:10`, `normalBrushShape:"circle"`, `heightScale:100` match between `api.ts:90-104` and `types/index.ts:969-997`. Duplicated constants that must not diverge. | Single `defaultUIState` object in `shared/`, spread once. Delete the `api.ts` copy. |
| M4 | **Variant frame `offset` → `baseFrameOffsets`** | `CompactVariantFrame.offset` (deprecated, `types/index.ts:576`) → `CompactVariant.baseFrameOffsets` map | `compactToVariantGroups` `types/index.ts:806-825`, when `baseFrameOffsets` is missing or empty | **Yes**, but **lossy** | Fills indices `0..max(frames.length,10)` with `frames[i].offset ?? firstFrameWithOffset.offset` (`:817-820`). If a project has **more than 10 base frames** and the variant has fewer variant-frames, base frames 10+ get **no entry** and fall back to `{0,0}` at render time. Old per-frame offsets are **not deleted**, so re-running is safe but the `offset` field lingers forever. | `shared/src/migrations/`. Fix the hard-coded `10` to the actual base-frame count, which requires the object context this function does not currently receive. |
| M5 | **Layer `variantOffset` → `variantOffsets`** | single `{x,y}` → `{[variantId]: {x,y}}` | `migrateLayerVariantOffset` `types/index.ts:843-864`, applied at `:951` | **Yes** — guarded by `&& !layer.variantOffsets` | Requires `selectedVariantId` to be set (`:847`). A layer with `variantOffset` but **no** `selectedVariantId` is **left unmigrated forever** and its offset is silently ignored by the renderer. Sets `variantOffset: undefined` after migrating, but `layerToCompact` (`:702`) re-writes it only `if (layer.variantOffset)`, so `undefined` is correctly dropped on save. | `shared/src/migrations/`. Add a fallback that keys the offset by a synthetic id, or logs a recoverable warning, instead of dropping it. |
| M6 | **Object-level `variantGroups` → project-level `variants`** | `objects[].variantGroups[]` → `project.variants[]` | `needsVariantMigration` `api.ts:15-24` → `migrateVariantsToProjectLevel` `api.ts:112-145` **or** the parallel implementation in `compactToProject` `types/index.ts:867-938` | Yes — guarded by `data.variants?.length > 0` | **Two independent implementations of the same migration.** `api.ts:112` version is a pure re-parent. `types/index.ts:882-937` version *additionally* rewrites each variant layer's `variantOffsets` from the variant's `baseFrameOffsets[frameIndex]` (`:917`). Which one runs depends on the load path. **De-duplication by `vg.id` keeps only the first occurrence** (`api.ts:54-57`, `:127-130`) — if two objects carry variant groups with the same id but different content, **object 2's variant data is silently discarded**. | `shared/src/migrations/` — **one** implementation, the richer `types/index.ts` one. Deleting the `api.ts` copy is the single most valuable de-duplication in this audit. |
| M7 | **Server-side legacy pixel normalise** | `pixel: number` → `[pixel, 0, 1]` | `normalizePixel` `export.ts:412-418`, called per pixel from `renderLayerToColorBuffer:435` and `renderLayerToNormalHeightBuffer:458` | **Yes** — array-safe (`Array.isArray(pixel) && length>=3` returns as-is) | Correct and robust. This is the reference implementation M2 should copy. Runs on the export path only; does **not** persist, so it re-runs on every export. | Keep server-side, but import from `shared/` so it cannot drift from M2. |
| M8 | **Export-time `variantOffset` → `variantOffsets`** | `layer.variantOffset` → `{[selectedVariantId]: variantOffset}` | `export.ts:576-580` | Yes | Keys on `layer.selectedVariantId ?? ""` — an **empty-string key** when `selectedVariantId` is absent, producing an unusable `{"": {...}}` entry in the exported JSON rather than omitting it. Third implementation of M5's rule. | Import M5 from `shared/` and delete this copy. |

### Preservation plan (hard requirement)

1. **Freeze corpus first.** Before any refactor, copy `server/src/data/*.json`
   and the full `server/src/data/backups/` tree into a read-only
   `shared/src/migrations/__fixtures__/` corpus. Include at minimum: the current
   `Base Unit.json` (post-migration, 1.1 MB), `Test Blend.json`, and **one
   decompressed sample from each monthly backup `.gz`** — those span Jan–Jul 2026
   and are the only surviving examples of the pre-migration formats.
2. **Characterisation tests before refactor.** For every fixture, assert
   `compactToProject(fixture)` deep-equals a committed golden snapshot, using
   *today's* code. These are the regression gate. Write them **first**, while the
   current implementation is still intact.
3. **Extract, do not rewrite.** Move M1–M6 into `shared/src/migrations/` by
   *moving the exact function bodies*. Fix bugs (M2's sampling, M6's duplication)
   only **after** the characterisation tests are green, one migration per commit,
   re-running the corpus each time.
4. **Version the chain.** Introduce an explicit `schemaVersion: number` on
   `CompactProject`. Each migration declares `from`/`to`. The runner applies them
   in order and writes the resulting version. This replaces every heuristic
   sniffer (M1, M2, M6 detection) with a deterministic lookup and makes
   partially-migrated files impossible by construction.
5. **Idempotency test.** For each fixture assert `migrate(migrate(x)) === migrate(x)`.
   This alone catches the M2 nested-array corruption.
6. **Mandatory pre-migration backup.** Promote E4 from best-effort to blocking:
   if `POST /api/project/backup` fails, refuse to migrate and refuse to load.
7. **Migrations run in the DomainStore's load path, not the API layer.** The API
   layer returns the raw validated wire object; the store applies the migration
   chain. Transport must not mutate domain data.

---

## Auto-save & backup flow

### End-to-end trace

```
user edit
  → store/index.ts:59  updateProject(updater, trackHistory)
  → store/index.ts:84  scheduleAutoSave(newProject, projectName)
  → services/autoSave.ts:45  scheduleAutoSave()
        pendingProject = project                       (autoSave.ts:46)
        clearTimeout(saveTimeout)                      (autoSave.ts:50)
        setTimeout(performSave, DEBOUNCE_MS = 500)     (autoSave.ts:10,53)
  → services/autoSave.ts:16  performSave()
        guard: if (!pendingProject || isSaving) return (autoSave.ts:17)
        onSaveStatusChange('saving')                   (autoSave.ts:24)
  → services/api.ts:244  saveProject(project, name)
        projectToCompact(project)                      (api.ts:250)
        POST /api/project?name=<name>                  (api.ts:256)
  → server/src/routes/project.ts:111
        JSON.stringify(req.body)                       (project.ts:131)
        safeWriteFile(projectFile, content)            (project.ts:135)
        runBackupForProject(name, content)             (project.ts:138)
        res.json({ success, backupCreated })           (project.ts:140)
  → server/src/backup.ts:222  runBackupForProject()
        md5 hash of content                            (backup.ts:222 → :27)
        skip if < 5 min since last                     (backup.ts:13,238)
        skip if hash unchanged                         (backup.ts:244)
        write backups/MM-DD-YYYY/<name>-HH-MM-SS.json  (backup.ts:256-260)
        cleanupOldBackups: keep newest 50/day          (backup.ts:14,268)
        compress + delete previous days' folders → .gz (backup.ts:271-281)
```

### Write strategy

`safeWriteFile` (`backup.ts:65-91`): write `<path>.tmp.<Date.now()>` → **read it
back and byte-compare** (`:73-76`) → `rename()` (`:79`). On any failure, unlink
the temp file and rethrow. The rename is atomic on POSIX. This is genuinely good.

### Backup rotation

| Parameter | Value | Source |
| --- | --- | --- |
| Minimum interval between backups | 5 min | `backup.ts:13` |
| Max backups retained per day | 50 | `backup.ts:14` |
| Dedup | md5 of full content | `backup.ts:27,244` |
| Daily folder | `MM-DD-YYYY` | `backup.ts:34-40` |
| File name | `<project>-HH-MM-SS.json` | `backup.ts:256` |
| Previous days | combined into one JSON object then gzip level 9 | `backup.ts:96-146` |
| Debounce (client) | 500 ms | `autoSave.ts:10` |

### Data-loss risks

| # | Risk | Evidence | Severity |
| --- | --- | --- | --- |
| R1 | **Blank-project overwrite.** `loadProject` returns a default project on any error (`api.ts:239`); the store accepts it (`projectActions.ts:44`); the next edit auto-saves it over the real file. | `api.ts:236-240` + `projectActions.ts:32-50` + `store/index.ts:84` | **Critical** |
| R2 | **Backup state is in-process memory.** `projectBackupStates` is a module-level `Map` (`backup.ts:22`). A server restart resets `lastBackupTime` to 0 and `lastBackupHash` to null, so the very next save always backs up — wasteful but safe. However it also means the 5-min throttle cannot be honoured across restarts, and **`bun --watch`** (`server/package.json:7`) restarts on every server file edit. | `backup.ts:16-22` | Low |
| R3 | **Infinite retry storm.** On save failure `autoSave.ts:29-34` re-queues and re-schedules with **no backoff and no attempt cap**. A persistent 400 (`project.ts:126`) means a POST every 500 ms indefinitely. | `autoSave.ts:29-34` | High |
| R4 | **`isSaving` guard drops nothing but serialises badly.** `performSave` returns early if `isSaving` (`:17`), relying on the `finally` block (`:38-41`) to re-enter. But `performSave()` at `:41` is **not awaited** — two overlapping edits can produce a recursive un-awaited chain with no depth limit. | `autoSave.ts:17,38-41` | Medium |
| R5 | **No last-write-wins protection.** `POST /api/project` has no ETag, no `If-Match`, no version check (`project.ts:111-145`). Two browser tabs on the same project silently clobber each other; the loser's work is only recoverable from a ≤5-min-granularity backup. | `project.ts:111-145` | High |
| R6 | **Backup skipped when content unchanged** (`backup.ts:244`) — correct — but the hash is of the *incoming* content, so a **corrupt** save (R1's blank project) is treated as new content and **creates a backup of the corruption**, potentially rotating out good backups (50/day cap, `backup.ts:14`). | `backup.ts:244,268` | Medium |
| R7 | **`cleanupOldBackups` sorts by mtime, not filename time** (`backup.ts:184-193`). A restored/touched file changes mtime and can cause the wrong backup to be pruned. | `backup.ts:184-193` | Low |
| R8 | **Compression is silently best-effort.** `compressAndDeleteFolder` catches everything and only `console.error`s (`backup.ts:143-145`) — but it has already potentially deleted the source folder in the success path only, so a mid-write crash leaves a `.gz.tmp`. `rm(folderPath)` at `:140` runs *after* the rename at `:137`, so ordering is correct. Failure leaves the day folder intact and re-attempts next backup. | `backup.ts:96-146` | Low |
| R9 | **`POST /api/project` does not validate the body beyond `typeof === 'object'`** (`project.ts:125`). `[]`, `{}`, or `null`-free garbage is written to disk verbatim. Combined with R1, nothing on the server prevents persisting an empty project. | `project.ts:125-128` | **High** |
| R10 | **Migration backup is single-shot per project name.** `POST /api/project/backup` writes `<name>.migration-backup.json` only if absent (`project.ts:349`). A *second*, later migration finds the file present and **does not back up** — so the pre-second-migration state is never captured. | `project.ts:346-356` | Medium |

---

## AI service integration

### Configuration (post-commit `3199fa8`)

Resolution order in `server/src/routes/ai.ts:31-41`:

1. Per-request `ai_service_url` (body for POST, query for GET) — set from
   `project.uiState.aiServiceUrl` (`types/index.ts:662`, written by
   `store/toolActions.ts:488`).
2. `config.aiServiceUrl` persisted in `server/src/data/config.json`
   (`ai.ts:34-35`), written only by `POST /api/ai/config` (`ai.ts:248-263`).
3. `process.env.AI_SERVICE_URL` (`ai.ts:26-29`), loaded from the **repo-root**
   `.env` via `dotenv.config({path: resolve(__dirname,'../../.env')})`
   (`index.ts:6`). Confirmed present in the real `.env`.
4. Hard-coded `http://localhost:8100` (`ai.ts:24`).

The Python service reads a **different** variable: `AI_REMOTE_URL`
(`server.py:43`), also present in the real `.env`. `PORT` defaults to `8100`
(`server.py:272`).

**Config drift:** `POST /api/ai/config` has **no client caller** — verified by
grep across `client/src`. So layer 2 is unreachable from the UI, and any value
already in `config.json` is at risk of being wiped by the next
`saveConfig({currentProject})` (see D3). Effective configuration today is
env-var-or-per-request only.

### Mode detection

`GPU_MODE = _has_nvidia_gpu() and not REMOTE_URL` (`server.py:44`). GPU mode
requires `nvidia-smi` on PATH exiting 0 within 10 s (`server.py:32-40`).
Otherwise the proxy router is mounted (`server.py:65-70`) and **the GPU routes
are never registered** — a request to `/dashboard` in proxy mode hits
`proxy.py:87` (forwarded), but `/jobs/{id}` DELETE is available in both.

### Job lifecycle

```
submit   client aiService.ts:139  POST /api/ai/jobs
       → express ai.ts:47         POST {aiUrl}/jobs          (verbatim body)
       → fastapi server.py:133    JobCreateRequest validated
       → job_manager.py:154       create_job()
             uuid4().hex[:12] id                  (job_manager.py:162)
             decode b64 → jobs/<id>/input/*.png   (job_manager.py:167-170)
             Job(status=QUEUED) → jobs/<id>/job.json
             _work_queue.put(job_id)              (job_manager.py:181)
         ← {job_id, status:"queued"}

worker   job_manager.py:95  _worker_loop  (single daemon thread, started at
         server.py:291; processes strictly one job at a time)
             status=PROCESSING → interpolate_frames() → frames saved to
             jobs/<id>/output/frame_NNN.png  → status=COMPLETED, output_count
             on exception: status=FAILED, error=str(e)   (job_manager.py:131-135)

poll     client aiService.ts:167  GET /api/ai/jobs/{id}   (loop at :201-215,
                                   backoff 500ms → ×1.3 → cap 3000ms)
       → express ai.ts:74        GET {aiUrl}/jobs/{id}
       → fastapi server.py:144   job.to_dict() (+ frames[] b64 when COMPLETED)

cleanup  server.py:277-287  daemon thread, every 300 s, removes COMPLETED jobs
         older than 3600 s. FAILED jobs are kept forever (job_manager.py:327).
```

**State is on disk** (`ai-service/jobs/<id>/job.json`), so job metadata survives
a service restart — but `_work_queue` is in-memory (`job_manager.py:91`), so
**QUEUED jobs are orphaned on restart**: their `job.json` says `queued` forever,
the client polls them forever (E18), and `cleanup_old_completed` skips them
because it only removes `COMPLETED` (`job_manager.py:327`).

### Failure modes when the Python service is down

| Scenario | What happens | Assessment |
| --- | --- | --- |
| Python process not running | `fetch` in `ai.ts:54/81/109` rejects → 500 `{error:"Proxy error: fetch failed"}` → `submitJob` throws `err.error` (`aiService.ts:147`) | Correct, message is reasonable |
| Python up, `AI_REMOTE_URL` unset, proxy mode | `GET /health` returns **200 `{"status":"ok",...,"remote_configured":false}`** (`proxy.py:73-77`) → Express forwards → client shows **"Connected"** (`Header.tsx:41`) → user submits a job → `_forward` returns **503** (`proxy.py:29-34`) → job fails with a raw JSON string | **Bug (D5).** Health check lies. |
| Python up, remote configured but remote down | `/health` forwards; httpx raises → **unhandled** in `_forward` (`proxy.py:49`, no try/except) → FastAPI 500 → Express returns `{status:'error'}` (`ai.ts:188`) | Acceptable, but the Python-side stack trace is the only diagnostic |
| Job takes > 120 s on the remote | `httpx.AsyncClient(timeout=120.0)` (`proxy.py:23`) raises → 500 | The async job model exists precisely to avoid this; the **legacy sync `/interpolate`** path still hits it |
| Express down | client `fetch` rejects; `checkAiHealth` catch returns `{status:'error'}` (`aiService.ts:74-79`) | Correct |
| Job never completes | `interpolateFrames` polls forever (E18) | **Bug** |

**Missing proxy:** `DELETE /jobs/{job_id}` and `GET /dashboard` exist on the
Python side (`server.py:179,163`) but Express exposes no `/api/ai/jobs/:id`
DELETE and no `/api/ai/dashboard`. The client therefore **cannot cancel a job**.

---

## Target API layer

### Structure

```
client/src/api/
  index.ts                  # public barrel: the ONLY import site for consumers
  client/
    httpClient.ts           # request<T>() — the single fetch wrapper
    errors.ts               # ApiError hierarchy + isApiError type guards
    config.ts               # resolveBaseUrl(), DEFAULT_TIMEOUT_MS
  resources/
    projectApi.ts
    backupApi.ts
    exportApi.ts
    aiApi.ts
    configApi.ts
  schemas/                  # re-exports from the shared workspace package
    index.ts
  __mocks__/
    handlers.ts             # MSW handlers, shared by Storybook + Vitest
    fixtures.ts             # canned CompactProject / Job payloads

shared/                     # new Bun workspace package
  package.json
  src/
    index.ts
    schemas/
      project.ts            # CompactProject & friends (Zod)
      api.ts                # per-endpoint request/response schemas
      ai.ts                 # job schemas
    migrations/
      index.ts              # runMigrations(project): MigrationResult
      m01-expanded-to-compact.ts
      m02-legacy-pixel.ts
      m03-lighting-defaults.ts
      m04-variant-frame-offsets.ts
      m05-layer-variant-offsets.ts
      m06-object-to-project-variants.ts
      __fixtures__/         # frozen corpus (see preservation plan)
```

Hard rules: `client/src/api/**` imports **nothing** from `client/src/store/**`
or `client/src/components/**`. Enforced by an `eslint` `no-restricted-imports`
rule so the boundary cannot rot.

### Typed request helper

```ts
// client/src/api/client/config.ts
export const API_BASE = import.meta.env.VITE_API_URL || "/api";
export const DEFAULT_TIMEOUT_MS = 15_000;
export const LONG_TIMEOUT_MS = 120_000; // export, AI submit

// client/src/api/client/httpClient.ts
import type { ZodType } from "zod";

export interface RequestOptions<T> {
  method?: "GET" | "POST" | "DELETE";
  path: string;                          // e.g. "/project"
  query?: Record<string, string | number | undefined>;
  body?: unknown;                        // JSON-serialised
  schema?: ZodType<T>;                   // response validation; omit for void
  timeoutMs?: number;                    // default DEFAULT_TIMEOUT_MS
  signal?: AbortSignal;                  // caller cancellation
}

export async function request<T>(opts: RequestOptions<T>): Promise<T>;
```

Behaviour, in order:

1. Build the URL from `API_BASE` + `path` + encoded `query` (skipping `undefined`).
2. Create an internal `AbortController`; `setTimeout(abort, timeoutMs)`. If the
   caller passed a `signal`, link both (`AbortSignal.any([caller, internal])`).
3. `fetch` with `Content-Type: application/json` when `body` is present.
4. `fetch` rejection → `NetworkError`. Internal-timeout abort → `TimeoutError`.
   Caller-signal abort → rethrow the `AbortError` unwrapped so React effects can
   ignore it.
5. `!response.ok` → read the body **defensively**: `await response.json()`
   wrapped in its own try/catch falling back to `await response.text()` then to
   `response.statusText`. Map the status to a typed error (below).
6. `204` or `Content-Length: 0` → resolve `undefined as T`.
7. Parse JSON; if `schema` is supplied, `schema.safeParse` and throw
   `ValidationError` with `result.error.issues` on failure. **This is what would
   have caught D9 and D12.**
8. Never `console.error`. Never return a fabricated value. Errors always throw.

### Resource modules & signatures

```ts
// client/src/api/resources/projectApi.ts
export const projectApi = {
  list(signal?: AbortSignal): Promise<string[]>;
  get(name?: string, signal?: AbortSignal): Promise<CompactProject>;   // RAW, unmigrated
  save(project: CompactProject, name?: string): Promise<{ success: true; backupCreated: boolean }>;
  create(name: string, projectData?: CompactProject): Promise<{ success: true; projectName: string }>;
  rename(oldName: string, newName: string): Promise<void>;
  remove(name: string): Promise<void>;                                 // DELETE /project?name=
  switchTo(name: string): Promise<void>;
};

// client/src/api/resources/backupApi.ts
export interface BackupEntry { date: string; time: string; filename: string }
export const backupApi = {
  list(projectName?: string, signal?: AbortSignal): Promise<BackupEntry[]>;
  restore(date: string, filename: string, projectName?: string): Promise<void>;
  createMigrationBackup(project: CompactProject): Promise<{ success: true; message: string }>;
};

// client/src/api/resources/exportApi.ts
export const exportApi = {
  run(projectName?: string, signal?: AbortSignal): Promise<{ success: true; path: string; kebabName: string }>;
  fetchFramesJson(kebabName: string, signal?: AbortSignal): Promise<unknown>; // /exports/<kebab>/frames.json
};

// client/src/api/resources/aiApi.ts
export const aiApi = {
  getConfig(signal?: AbortSignal): Promise<AiConfigResult>;
  setConfig(aiServiceUrl: string): Promise<{ success: true; aiServiceUrl: string }>;
  health(aiServiceUrl?: string, signal?: AbortSignal): Promise<AiHealthResult>;
  heartbeat(aiServiceUrl?: string, signal?: AbortSignal): Promise<HeartbeatResult>;
  submitJob(input: JobSubmitInput, signal?: AbortSignal): Promise<JobSubmitResult>;
  getJob(jobId: string, aiServiceUrl?: string, signal?: AbortSignal): Promise<JobStatusResult>;
  cancelJob(jobId: string, aiServiceUrl?: string): Promise<void>;      // NEW — needs Express route
  pollJob(jobId: string, opts: {
    aiServiceUrl?: string;
    signal: AbortSignal;                 // REQUIRED — fixes E18
    maxWaitMs?: number;                  // default 300_000
    onStatus?: (job: JobStatusResult) => void;
  }): Promise<JobStatusResult>;
};

// client/src/api/resources/configApi.ts
export const configApi = {
  get(signal?: AbortSignal): Promise<ServerConfig>;   // { currentProject, aiServiceUrl? }
  setCurrentProject(name: string): Promise<void>;
};
```

Note `projectApi.get` returns the **raw** `CompactProject`. Migration is *not*
the API layer's job (see Store integration boundary).

`aiApi.pollJob` takes a **required** `signal` — the type system then makes E18's
unbounded loop unrepresentable.

### Error taxonomy

```ts
// client/src/api/client/errors.ts
export type ApiErrorKind =
  | "network"     // fetch rejected — server unreachable, DNS, CORS
  | "timeout"     // our AbortController fired
  | "notFound"    // 404
  | "conflict"    // 409  (create/rename duplicate, job in progress)
  | "validation"  // 400 from server, OR Zod schema mismatch on the response
  | "server"      // 5xx
  | "unknown";    // any other non-2xx

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;        // absent for network/timeout
  readonly path: string;
  readonly serverMessage?: string; // the server's `{error}` field, verbatim
  readonly issues?: unknown;       // Zod issues when kind === "validation"
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
export const isKind = (e: unknown, k: ApiErrorKind): e is ApiError =>
  isApiError(e) && e.kind === k;
```

Callers distinguish by `kind`, never by string matching. Status mapping:
`400 → validation`, `404 → notFound`, `409 → conflict`, `5xx → server`,
fetch rejection → `network`, internal abort → `timeout`.

This directly retires the fabricated-value pattern: `projectApi.get` throws
`notFound` where `loadProject` used to invent a default project (E3/D1). The
*store* decides that a `notFound` on first boot means "create a default", and
that a `network`/`server` error means "**block auto-save**".

### Store integration boundary

- `client/src/api/**` must not import `client/src/store/**`. One-way dependency,
  ESLint-enforced.
- `DomainStore` must not call `fetch`. It calls `projectApi` / `backupApi` /
  `exportApi` / `aiApi` only.
- **Migrations run in the store, not the API layer.** Concretely:

```ts
// DomainStore
async loadProject(name?: string) {
  this.loadState = "loading";
  try {
    const raw = await projectApi.get(name);            // API: transport only
    const { project, applied } = runMigrations(raw);   // shared/: domain logic
    if (applied.length > 0) {
      await backupApi.createMigrationBackup(raw);      // MANDATORY — fixes E4
      // if this throws, we do NOT proceed
    }
    runInAction(() => {
      this.project = compactToProject(project);
      this.loadState = "loaded";
    });
  } catch (e) {
    runInAction(() => {
      this.loadState = "failed";                       // fixes D1/E3
      this.loadError = isApiError(e) ? e : null;
    });
    throw e;
  }
}
```

- **`SessionStore` owns the auto-save gate.** Auto-save must assert
  `domainStore.loadState === "loaded"` before scheduling. A project that failed
  to load can never be written back. This one guard closes R1.
- Auto-save moves from a module-level singleton (`services/autoSave.ts`'s five
  mutable module variables) into a `SessionStore` reaction on a project hash,
  with exponential backoff and a max-attempt cap (fixes E19/R3).

### Mocking for Storybook/Vitest

Use **MSW** (`msw` + `msw-storybook-addon`), one handler set shared by both:

- `client/src/api/__mocks__/handlers.ts` exports `handlers` (happy path) plus
  named scenario factories: `serverDownHandlers`, `notFoundHandlers`,
  `slowExportHandlers`, `aiJobFailureHandlers`.
- **Storybook:** `msw-storybook-addon` in `.storybook/preview.ts`; stories set
  `parameters.msw.handlers` per story. Container stories can then demonstrate
  the loading / failed / conflict states that today have no UI at all.
- **Vitest:** `setupServer(...handlers)` in `vitest.setup.ts` with
  `onUnhandledRequest: "error"` — an un-mocked endpoint fails the test, which
  keeps the mock catalogue honest as endpoints are added.
- Because the API layer is the only `fetch` caller, MSW intercepts everything
  with no per-module stubbing. Resource modules stay real, so their URL
  construction, `response.ok` handling, and Zod validation are all under test.
- **Contract tests:** run each `__mocks__/fixtures.ts` payload through the
  corresponding Zod response schema in a Vitest suite. Update the fixtures from
  real server responses and any drift (D5, D9, D12) fails CI.

---

## Server route decomposition

`server/src/routes/export.ts` — **927 lines, one route handler**
(`exportRouter.post("/project/export")` spans lines **488–927**, i.e. 440 lines
in a single function). API-contract angle only; general code structure belongs to
task 03.

Responsibilities identified:

| Lines | Responsibility | Belongs in |
| --- | --- | --- |
| 24-41 | Name casing helpers (`toKebabCase`, `toPascalCase`) | `server/src/export/naming.ts` |
| 44-95 | Compact **input** schema (duplicate of client types) | **delete** — import from `shared/` |
| 98-164 | `Exported*` wire schema | `shared/` or `server/src/export/format/v1.ts` |
| 166-219 | `CompactExported*` schema | same |
| 221-370 | String-table construction + compaction (`collectStrings`, `toCompactExport`) | `server/src/export/format/compact.ts` |
| 372-418 | Pixel decode + **legacy migration** (`normalizePixel`) | `shared/src/migrations/` (M7 ≡ M2) |
| 420-484 | Raster + PNG encode (`bufferHash`, `renderLayerTo*Buffer`, `writePng`) | `server/src/export/raster.ts` |
| 488-501 | **Route concern:** project-name resolution + existence check | stays in the route |
| 503-624 | Texture dedup + object/variant transformation | `server/src/export/transform.ts` |
| 628-690 | `maxCanvas` bounds computation | `server/src/export/maxCanvas.ts` |
| 692-712 | Serialise `frames.json` + `.gz` | `server/src/export/write.ts` |
| 714-718 | Copy `client/lib` → exports | `server/src/export/write.ts` |
| 720-918 | **Codegen of `index.ts` via a 96-line template literal** | `server/src/export/codegen.ts` |
| 920-926 | Response + error mapping | stays in the route |

Proposed API-contract-level split, leaving the route file thin:

```
server/src/routes/export.ts        # ~60 lines: validate, orchestrate, respond
server/src/export/
  index.ts                         # runExport(projectName, exportBase): ExportResult
  naming.ts
  format/{v1.ts,compact.ts}
  raster.ts
  transform.ts
  maxCanvas.ts
  codegen.ts
  write.ts
```

Contract changes to make while splitting:

1. **Validate the project name.** `export.ts:491` accepts `req.query.name`
   unvalidated and feeds it to `toKebabCase` → `join(exportBase, kebabName)`.
   `project.ts:30-38` has `isValidProjectName`; **export does not call it.** A
   name is currently constrained only by the `.json` file needing to exist, but
   the validator should be shared and applied here too. Extract
   `isValidProjectName` to `server/src/validation.ts` and call it from every
   route that accepts a name (`project.ts` ×7, `export.ts` ×1).
2. **Distinguish 404 sub-cases.** `export.ts:499` returns 404 for "project file
   missing". `restore-backup` (`project.ts:324`) returns **500** for a missing
   backup file — unify: missing resource is always 404 with
   `{error, resource, name}`.
3. **Make export asynchronous or bound it.** With `sharp` at
   `compressionLevel:9, effort:10` (`export.ts:478-481`) over every unique layer
   texture, this is the longest request in the system and has no client timeout
   (E12). Either reuse the AI service's job pattern, or document a
   `LONG_TIMEOUT_MS` contract on both ends.
4. **Stop returning the absolute server path** (D11). Return
   `{success, kebabName, frameCount, textureCount, bytes}` — information the
   client can actually use — and drop `path`.
5. **Add a shared error mapper.** All 15 project routes repeat
   `catch (error) { console.error(...); res.status(500).json({error: '...'}) }`.
   Replace with one Express error middleware plus typed `HttpError` throws, so
   the `{error: string}` envelope is guaranteed by construction rather than by
   15 hand-written copies.

---

## Proposed work items

| # | Title | Touches (explicit files/dirs) | Depends on | Effort | Risk |
| --- | --- | --- | --- | --- | --- |
| W1 | **Freeze the migration corpus & write characterisation tests** | NEW `shared/src/migrations/__fixtures__/` (copies of `server/src/data/Base Unit.json`, `server/src/data/Test Blend.json`, one decompressed sample per `.gz` under `server/src/data/backups/`); NEW `shared/src/migrations/__tests__/characterisation.test.ts`. **Reads only** `client/src/types/index.ts`, `client/src/services/api.ts` | none | M | Fixtures may not cover every historical format. Detected by: any later migration change that breaks a real user file without a failing test. Mitigate by decompressing **every** backup `.gz` and deduping by structural signature. |
| W2 | **Create the `shared/` Bun workspace with Zod schemas** | `package.json` (add `workspaces`); NEW `shared/package.json`, `shared/tsconfig.json`, `shared/src/index.ts`, `shared/src/schemas/{project,api,ai}.ts`; `client/package.json`, `server/package.json` (add `shared` dep + `zod`) | none | M | Bun workspace resolution from both `client/` (Vite) and `server/` (bun runtime). Detected by `bun install && cd client && bunx tsc -b` and `cd server && bunx tsc --noEmit`. |
| W3 | **Extract migrations M1–M6 into `shared/src/migrations/`** | NEW `shared/src/migrations/{index,m01..m06}.ts`; MOVE-FROM `client/src/services/api.ts:15-145`, `client/src/types/index.ts:797-1085` | W1, W2 | L | Highest-risk item in the audit. Move bodies verbatim first, fix bugs after. Detected by W1's characterisation tests + an added `migrate(migrate(x)) === migrate(x)` idempotency assertion. |
| W4 | **Fix M2 per-pixel detection and M6 double-implementation** | `shared/src/migrations/m02-legacy-pixel.ts`, `shared/src/migrations/m06-object-to-project-variants.ts`, `shared/src/migrations/__tests__/` | W3 | M | Changing migration semantics on live data. Detected by W1 golden snapshots — any diff must be reviewed by hand and explicitly re-blessed. |
| W5 | **Introduce explicit `schemaVersion` + ordered migration runner** | `shared/src/schemas/project.ts`, `shared/src/migrations/index.ts`, `server/src/routes/project.ts` (write-through of version) | W3, W4 | M | Old files have no `schemaVersion`; runner must infer version 0 and apply the full chain. Detected by W1 corpus (all fixtures are version-less). |
| W6 | **Build `client/src/api/` — httpClient, errors, config** | NEW `client/src/api/client/{httpClient,errors,config}.ts`, `client/src/api/index.ts`; NEW `client/eslint.config.js` rule `no-restricted-imports` | W2 | M | Timeout/abort semantics regressions. Detected by unit tests in `client/src/api/client/__tests__/httpClient.test.ts` against MSW. |
| W7 | **Port `api.ts` → `projectApi` + `backupApi` + `configApi`, throwing typed errors** | NEW `client/src/api/resources/{projectApi,backupApi,configApi}.ts`; DELETE `client/src/services/api.ts`; `client/src/store/projectActions.ts`, `client/src/components/BrowseBackupsModal/BrowseBackupsModal.tsx` | W6, W3 | M | Removes the fabricated-default fallbacks 6 call sites relied on (E1,E2,E3,E10). Every caller must now handle throws. Detected by `bunx tsc -b` + manual "kill the server, reload the app" check. |
| W8 | **Close the blank-project overwrite (D1/R1) — load-state gate on auto-save** | `client/src/store/` (DomainStore/SessionStore load state + auto-save reaction), REPLACES `client/src/services/autoSave.ts` | W7 | M | **The critical fix.** Regression would silently re-enable data loss. Detected by an integration test: MSW returns 500 for `GET /api/project`, assert **zero** `POST /api/project` requests fire afterwards. |
| W9 | **Auto-save backoff + attempt cap + surfaced error (E19/R3/R4)** | `client/src/store/` (auto-save reaction), DELETE `client/src/services/autoSave.ts` | W8 | S | Debounce/serialisation changes could drop a save. Detected by a fake-timer test asserting the last edit always reaches the server. |
| W10 | **Port `aiService.ts` → `aiApi` with bounded polling + cancellation (E18)** | NEW `client/src/api/resources/aiApi.ts`; DELETE `client/src/services/aiService.ts`; `client/src/components/AIInterpolateModal/AIInterpolateModal.tsx`, `client/src/components/Header/Header.tsx` | W6 | M | Poll-loop rewrite could break the interpolate flow. Detected by an MSW test driving queued→processing→completed and one driving queued→abort. |
| W11 | **Port `export.ts` service + `ExportPreviewModal` fetch into `exportApi`** | NEW `client/src/api/resources/exportApi.ts`; DELETE `client/src/services/export.ts`; `client/src/components/ExportPreviewModal/ExportPreviewModal.tsx`, `client/src/components/Header/Header.tsx` | W6 | S | Export preview stops loading. Detected by running an export and opening the preview modal. |
| W12 | **Fix AI health honesty (D5) + wire `remote_configured`** | `ai-service/proxy.py:70-78`, `server/src/routes/ai.ts:174-201`, `client/src/api/resources/aiApi.ts`, `client/src/components/Header/Header.tsx` | W10 | S | Users who relied on the false "connected" indicator will now see "not configured". That is the point. Detected by starting the AI service with `AI_REMOTE_URL` unset and checking the header badge. |
| W13 | **Add `DELETE /api/ai/jobs/:jobId` proxy + `GET /api/ai/dashboard`** | `server/src/routes/ai.ts`, `client/src/api/resources/aiApi.ts` | W10 | S | New routes; low blast radius. Detected by `curl -X DELETE localhost:3001/api/ai/jobs/<id>`. |
| W14 | **Separate AI config from project config (D3)** | `server/src/backup.ts:293-316`, `server/src/routes/ai.ts:248-289`, `server/src/routes/project.ts` (all `saveConfig` call sites: `:61,171,205,245,270`) | none | S | Existing `config.json` must be read-compatible. Detected by a round-trip test: set `aiServiceUrl`, then switch project, then re-read — the URL must survive. |
| W15 | **Server: shared `isValidProjectName` + error middleware + 404/500 unification (D4)** | NEW `server/src/validation.ts`, NEW `server/src/errors.ts`; `server/src/index.ts`, `server/src/routes/project.ts`, `server/src/routes/export.ts`, `server/src/routes/ai.ts` | W2 | M | Status codes change (restore-backup 500→404). Client must already handle `notFound`. Detected by a supertest suite over every route's error paths. |
| W16 | **Server: validate `POST /api/project` body against the shared schema (R9)** | `server/src/routes/project.ts:111-145`, `shared/src/schemas/project.ts` | W2, W15 | S | Over-strict validation could reject legitimate saves and **block all persistence**. Ship as warn-only logging for one iteration before enforcing. Detected by saving every fixture from W1 through the endpoint. |
| W17 | **Decompose `server/src/routes/export.ts` (contract layer)** | `server/src/routes/export.ts`; NEW `server/src/export/{index,naming,raster,transform,maxCanvas,codegen,write}.ts`, `server/src/export/format/{v1,compact}.ts` | W2, W15; **coordinate with task 03** | L | Export output must be byte-identical. Detected by: export `Base Unit` before and after, `diff <(gunzip -c before/frames.json.gz) <(gunzip -c after/frames.json.gz)` must be empty. |
| W18 | **De-duplicate export types + `normalizePixel` against `shared/` (D15, M7/M8)** | `server/src/routes/export.ts:44-95,412-418,576-580` (post-W17: `server/src/export/**`), `shared/src/schemas/project.ts`, `shared/src/migrations/m02-legacy-pixel.ts`, `shared/src/migrations/m05-layer-variant-offsets.ts` | W17, W3 | M | Subtle export-output change (notably the `""`-keyed `variantOffsets` at `export.ts:579`). Detected by W17's byte-diff plus a deliberate re-bless of the empty-key fix. |
| W19 | **Restore frame `tags` in export (type-duplication finding)** | `server/src/export/format/v1.ts`, `server/src/export/transform.ts`, `server/exports/lib/versions/v1.ts`, `server/exports/lib/parse-pixel-project.ts` | W17, W18 | S | Changes the published export format consumed by downstream game code. Requires a version bump. Detected by `parsePixelProject()` round-trip test. |
| W20 | **MSW mock catalogue + contract tests** | NEW `client/src/api/__mocks__/{handlers,fixtures}.ts`, `client/vitest.setup.ts`, `client/.storybook/preview.ts`, `client/package.json` (add `msw`, `msw-storybook-addon`) | W6, W7, W10, W11 | M | Mocks drifting from the real server. Detected by the fixture-vs-Zod-schema contract suite, refreshed from live responses. |

## Verification

| Work item | Command(s) | Manual checks |
| --- | --- | --- |
| W1 | `cd shared && bunx vitest run src/migrations/__tests__/characterisation.test.ts` | Confirm every `.gz` under `server/src/data/backups/` was decompressed and considered; eyeball the distinct structural signatures found. |
| W2 | `bun install && cd client && bunx tsc -b && cd ../server && bunx tsc --noEmit` | `bun run dev` still starts all three procs via `mprocs.yaml`. |
| W3 | `cd shared && bunx vitest run src/migrations` — characterisation snapshots must be **unchanged** | Read the diff of the moved code and confirm it is a pure move (no logic edits). |
| W4 | `cd shared && bunx vitest run src/migrations` (idempotency + golden suites) | Manually review and re-bless every changed golden snapshot; each change must be explainable. |
| W5 | `cd shared && bunx vitest run src/migrations/__tests__/version-chain.test.ts` | Load `Base Unit` in the app; confirm no console migration logs on the **second** load. |
| W6 | `cd client && bunx vitest run src/api/client` | Kill the server mid-request; confirm a `TimeoutError` (not a hang). |
| W7 | `cd client && bunx tsc -b && bunx vitest run src/api/resources` | Stop the server, reload the app: expect an explicit error UI, **not** a blank canvas. |
| W8 | `cd client && bunx vitest run src/store/__tests__/autosave-gate.test.ts` (asserts zero `POST /api/project` after a failed load) | `git stash` the server, load the app, make an edit, restore the server, then `ls -la server/src/data/` — file size must be unchanged (~1.1 MB, not ~2 KB). |
| W9 | `cd client && bunx vitest run src/store/__tests__/autosave-backoff.test.ts` | Force a 400 from the server; confirm requests back off rather than firing every 500 ms (watch the network panel). |
| W10 | `cd client && bunx vitest run src/api/resources/aiApi.test.ts` | Open the AI modal, start a job, close the modal mid-run; confirm polling stops (network panel goes quiet). |
| W11 | `cd client && bunx tsc -b` | Run an export, then open the export preview modal and confirm frames render. |
| W12 | `AI_REMOTE_URL= bun run ai` then `curl -s localhost:3001/api/ai/health` — must **not** report a healthy connected state | Header badge shows "not configured", and the AI modal refuses to start a job. |
| W13 | `curl -f -X DELETE localhost:3001/api/ai/jobs/<id>` (exits non-zero on failure) | Cancel a queued job from the UI; confirm it disappears from `ai-service/jobs/`. |
| W14 | `cd server && bunx vitest run src/__tests__/config-roundtrip.test.ts` | `POST /api/ai/config`, then switch projects, then `GET /api/ai/config` — `aiServiceUrl` must persist. |
| W15 | `cd server && bunx vitest run src/routes` (supertest over every error path) | `curl -i -X POST localhost:3001/api/project/restore-backup -d '{"date":"01-01-2000","filename":"nope.json"}' -H 'content-type: application/json'` → **404**, not 500. |
| W16 | `cd server && bunx vitest run src/routes/__tests__/project-validation.test.ts` (every W1 fixture must POST successfully) | Watch server logs in warn-only mode for a full editing session; zero warnings before enforcing. |
| W17 | `cd server && bunx tsc --noEmit` then: export `Base Unit` before and after and run `diff <(gunzip -c /tmp/before/frames.json.gz) <(gunzip -c server/exports/base-unit/frames.json.gz)` — must be empty | Diff the generated `index.ts` too; confirm the texture PNG hashes are unchanged. |
| W18 | Same byte-diff as W17, plus `cd shared && bunx vitest run src/migrations/m02*` | Confirm the `""`-keyed `variantOffsets` entry is gone from the new `frames.json`. |
| W19 | `cd server && bunx vitest run exports/lib/__tests__/parse.test.ts` | Open the export preview modal on a project with frame tags; confirm tags survive the round-trip. |
| W20 | `cd client && bunx vitest run` with `onUnhandledRequest:"error"`; `cd client && bunx build-storybook` | Browse the API-state stories (loading / failed / conflict) in Storybook. |

## Open questions

| # | Question | Blocking? | Assumption to proceed under |
| --- | --- | --- | --- |
| Q1 | Do backups in `server/src/data/backups/*.gz` (Jan–Jul 2026) actually contain pre-migration formats, or has every one already been migrated in place? I inspected only the *current* `Base Unit.json` (fully migrated, `version: 1.1.0`, project-level `variants`, no object-level `variantGroups`). | **Blocking W1**, which blocks W3/W4/W5 | Decompress all of them as the first act of W1 and classify by structural signature. If **no** pre-migration sample survives, the migrations are unverifiable against real data and W4's bug fixes must be deferred as unacceptably risky. |
| Q2 | Is `POST /api/ai/config` genuinely dead, or is it called from the AI service's own web UI (`ai-service/templates/index.html`)? I grepped `client/src` only. | Non-blocking | Assume dead from the client. **Do not delete** the route in W14 — the Python `/ui` page is a separate consumer I did not audit. |
| Q3 | Is `server/exports/lib/` published/consumed by an external repo? It generates a typed `index.ts` for downstream game code (`export.ts:822-915`). If so, W19's format change needs a coordinated version bump. | **Blocking W19** | Assume it is consumed externally. Bump the export format to `2.0.0` and keep the v1 parser registered in `parse-pixel-project.ts:47`, which already supports multi-version dispatch. |
| Q4 | Should `GET /api/project` return the raw stored bytes (current behaviour, `project.ts:101-103`) or a server-migrated project? Server-side migration would fix the "other read paths skip migrations" problem, but requires the migration chain to run under Bun on the server. | Non-blocking | Proceed with **client-side migration in the DomainStore** (as specified). `shared/` is runtime-agnostic, so moving it server-side later is a config change, not a rewrite. |
| Q5 | Two browser tabs on one project silently clobber each other (R5). Is multi-tab editing a supported scenario? | Non-blocking | Assume single-tab. Note the risk; do **not** build optimistic concurrency in this refresh. If it becomes a requirement, the cheapest fix is an `ETag`/`If-Match` on `POST /api/project` using the existing md5 from `backup.ts:27`. |
| Q6 | `flow_scale` reaches the AI service only because `ai.ts:57` forwards `req.body` verbatim (D6). Was the omission from `InterpolateBody` (`ai.ts:6-12`) deliberate? | Non-blocking | Assume oversight. Add `flow_scale?: number` to the interface in W15 and validate it explicitly. |
| Q7 | MobX store shape is locked (`ApplicationStore` = `SessionStore` + `DomainStore` + `UIStore`) but the exact ownership of load-state and the auto-save reaction is task 06's call. W8/W9 assume `DomainStore.loadState` + a `SessionStore` reaction. | Non-blocking, but **task 06 must confirm** | Proceed with that split. The API-layer contract (typed throws, no fabricated values) is unaffected by where the gate ultimately lives. |
| Q8 | Is `zod` acceptable as a new client-side runtime dependency (~14 kB gz)? The client currently has exactly **four** production dependencies (`client/package.json:14-19`) and is clearly kept lean. | **Blocking W2** | Assume yes — D9/D12 are runtime shape bugs that types alone cannot catch. If rejected, fall back to a plain `shared/` types package and accept that response-shape drift stays undetectable at runtime. |
| Q9 | `POST /api/project/backup` writes `<name>.migration-backup.json` only once, ever (R10). Should a second migration overwrite it, create a numbered series, or refuse? | Non-blocking | Assume a numbered series (`<name>.migration-backup.<schemaVersion>.json`), so each migration step is independently recoverable. Confirm with the owner before W5 lands. |
