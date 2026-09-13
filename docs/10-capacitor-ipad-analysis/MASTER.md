# MASTER — Capacitor iPad feasibility analysis

**This is an ANALYSIS plan, not an implementation plan.** Executing it writes zero
application code. Its deliverables are (a) six evidence-backed findings documents,
(b) a consolidated `GAPS.md` of everything the tech stack cannot support without special
measures, (c) a `DECISIONS-NEEDED.md` of owner sign-offs, and (d) **a generated
implementation plan** at `docs/11-capacitor-ipad-port/` — itself in `/plan-steps` format
with its own `GAPS.md` — ready for a later `/plan-go`.

---

## 1. Request

Verbatim from the owner (2026-09-06):

> - I want to use CapacitorJS to make this application run on the iPad natively.
> - The goal would be to see what it would take to convert the server components into
>   capacitor wrapped methods to do file saves to the iPad's local safe file system but
>   run the server code in the iPad's browser to prevent any weird run time dependencies
>   or needs.
> - I want the capacitor server code to be written once but still run for iPad native
>   and also STILL run as a standalone server.
> - I would need the APIs from the client to the server to have an abstraction layer to
>   call the server running in the browser (so change the api calls to direct method
>   bindings calling the in browser server logic).
> - I would need an abstraction layer between the use of things like Next or Express
>   that would switch over to be the method bindings instead of waiting for REST signals.
> - Again, most importantly, this should all be write once, but get both environments
>   from it.
> - We would need the iPad app to support selecting "run from remote" vs "run locally".
> - We would need UX at bootup to specify if the user wants to sync their local data to
>   a remote server or to another running iPad app. The sync operation should be
>   password protected for the user and the remote device receiving the signal. The
>   remote server would also need to explicitly open up the connection to allow
>   connections for the operation so we prevent bad actors spamming servers with
>   nonsense requests.
> - We need the ability to send from a server hosting situation all of the data on the
>   server to the user's device.
> - We will need to have all of the work from devices and users to be associated with an
>   email account. We will NOT centrally store the email account, but the account will
>   be needed to sandbox every user's work. The account will need to specify if they
>   want to password protect their work on devices. If password protected, the data
>   will be encrypted on the device hosting the information.
> - IMPORTANT: end result should be, keeps the existing "find a server to work off of"
>   functionality. Introduces a new "Run locally" which saves to the local iPad harddisk
>   in the correct app storage (not on the users file app stuff). Produces the ability
>   to create an android and ios solution. For now, just output ios.
> - This plan should include a GAPS.md recording ALL issues the tech stack just can NOT
>   support and would need special measures; the generated plan must include one too.

**Interpretation.** The tasks in this folder *analyze and design*; they do not port
anything. Ambiguities resolved as assumptions (executors do not re-open them; if
evidence contradicts one, record it in your findings' Gaps section):

- "Server code in the iPad's browser" = the server's TypeScript compiled into the
  Capacitor webview bundle and invoked as in-process method calls — not a Node/Bun
  process on the device, not a service worker HTTP masquerade (those are evaluated only
  as fallbacks for specific sub-problems).
- "Things like Next or Express" = Express 5, the only server framework present.
- The existing "find a server" functionality = `ios-companion/` (SwiftUI Bonjour
  discovery + WKWebView) plus its server contract (`server/src/discovery.ts`,
  `GET /api/discovery`). "Keeps the functionality" means the *capability* survives in
  the Capacitor app's remote mode; whether the separate companion app is retired is a
  PRODUCT-DECISION for the owner, recorded in GAPS.
- "Android and iOS solution, for now just output iOS" = shared code must contain no
  iOS-only assumptions; only the iOS platform folder is generated/configured.
- The ai-service (Python/torch) is out of scope for on-device execution — it is
  physically impossible there (G-03) and already optional; analysis covers only how the
  local mode reaches a *remote* ai-service.

## 2. Outcome

When every wave is DONE, the owner can:

1. Read `findings/00-synthesis.md` and know, with file-level evidence, what the port
   costs, which parts of the server are write-once-portable, and where the seams go.
2. Read `GAPS.md` and see every hard blocker, unmeasured risk, and product decision —
   nothing discovered during analysis is allowed to live only in a chat transcript.
3. Read `DECISIONS-NEEDED.md` and sign off (or not) on the handful of decisions the
   implementation cannot proceed without (export byte-identity re-baselining, account
   model, ios-companion retirement, encoder choice).
4. Run `/clear` then `/plan-go` and have it execute `docs/11-capacitor-ipad-port/` — a
   complete, path-verified, wave-based implementation plan with its own GAPS.md.

## 3. Locked decisions

| # | Decision | Choice (do not re-decide) |
|---|---|---|
| D1 | Generated plan location | `docs/11-capacitor-ipad-port/` — task 08 confirms `11` is still the next free number (`ls -d docs/[0-9][0-9]-*`); if taken, next free, and it updates HANDOFF here |
| D2 | Transport approach analyzed as primary | Direct method bindings behind the existing `client/src/api/` barrel: a per-mode implementation of the resource modules. Service-worker fetch interception and an on-device native HTTP server are *fallbacks*, evaluated only where bindings cannot work (e.g. the static `/exports` texture tree) |
| D3 | Write-once seam | A platform adapter interface injected into server logic — working name `ServerPlatform`, roughly `{ fs, gzip, hash, pngEncode, env, events }`. Task 01 owns its exact shape |
| D4 | Mode names | `remote` (today's behavior: find/attach to a server) and `local` (on-device persistence). UI copy is the change plan's job |
| D5 | Findings format | `findings/NN-<slug>.md` with mandatory sections **Facts** (verified, with `path:line`), **Options** (with trade-offs), **Recommendation** (one, argued), **Gaps** (G-format entries, see D6) |
| D6 | Gap entry format | `### G-NN · <SEVERITY> · <one-line title>` then **Evidence:** (path:line or citation), **Impact:**, **Special measure:** (the workaround, or "none known"). Severities: `BLOCKER` (tech stack cannot do this), `NEEDS-MEASURE` (unverified assumption), `DESIGN-RISK` (doable, easy to get wrong), `PRODUCT-DECISION` (owner must choose) |
| D7 | Gap numbering & merge | `GAPS.md` is seeded with G-01…G-15. **W1 tasks never edit `GAPS.md`** — they write gaps only in their own findings file, numbered `G-<task>xx` (e.g. task 03 uses G-301, G-302…). Task 07 merges everything into `GAPS.md` with final numbers and a cross-reference table |
| D8 | Account baseline for analysis | Email address is a *namespace key*: kept on-device, never sent to any central/third-party service; server-side sandboxing uses a salted hash of it. Task 06 validates or overturns this with rationale — but the "no central email storage" requirement itself is fixed |
| D9 | Analysis honesty rule | A finding without a `path:line` or an external citation (URL + date checked) is an opinion and does not belong in **Facts** |
| D10 | ai-service | Never runs on-device. Analysis covers remote reachability (CORS, URL config) only |

## 4. Ground truth (measured 2026-09-06)

Gathered by three exploration passes over the working tree (branch `feat/09-ipad-pencil-fixes`,
HEAD `941f982`). Executors verify what they build on rather than re-exploring from zero.

### Repo state
- The 38-task refresh **has landed and its `REFRESH/` folder is gone**. `CLAUDE.md`'s
  "arriving with later waves" paragraph is stale: `bun run verify` exists at the root
  (`typecheck && lint && format:check && test && build`) and every link resolves
  (tsc 5.9.3, eslint 9.39.5 flat configs, vitest 3.2.7 with 148 client test files,
  prettier 3.9.6, vite 7.3.6). Ungated but real: `lint:css` (stylelint 17.14.1),
  `lint:boundaries` (`client/scripts/check-boundaries.mjs`), `build-storybook`
  (74 stories; `storybook:dev` is known-broken by the no-lockfile policy), server vitest
  (3 test files).
- **No Capacitor/Cordova anywhere** in the repo. No lockfiles (policy).
- `docs/01`–`docs/09` are prior `/plan-steps` plans; `10` is this folder.

### Server (`server/src/` — 19 production files, 3,185 LOC)
- **Deps:** express 5.2.1, cors 2.8.5, **sharp 0.33.5 (native)**, ws 8.21.3,
  **bonjour-service 1.4.4 (raw UDP mDNS)**, dotenv 17.3.1.
- **Entry** `index.ts` (115 lines): dotenv → middleware (`cors()` wide open;
  `express.json({limit:"50mb"})`; `express.static(exportsDir)` at `/exports`) → routers →
  `app.listen(PORT, "::")` → `attachSyncServer(server)`.
- **24 routes** across `index.ts` (health, `/api/discovery`), `routes/project.ts` (368
  lines — config get/set, project list/get/save/create/rename/delete/switch, backups
  list/restore/migration-backup), `export/exportRouter.ts` (69-line wrapper), `routes/ai.ts`
  (312 lines — pure `fetch` proxy to the Python service), `routes/debugLog.ts` (dev-gated).
- **Portability buckets (per-file audit):**
  - *Portable as-is (~1,150 LOC / 36%):* all pure export logic — `naming.ts`,
    `pixelDecode.ts`, `exportTypes.ts`, `compactExport.ts`, `maxCanvas.ts`, `codegen.ts`
    (822 LOC, zero Node imports) — plus `validation.ts`, `routes/debugLog.ts` (in-memory
    ring buffer), `routes/ai.ts` (global `fetch`, no node:http).
  - *Shimmable (~1,050 LOC):* `backup.ts` (476 — `fs/promises`, zlib gzip, crypto md5,
    stat().mtime sorting, recursive rm), `routes/project.ts`, `export/write.ts`
    (createWriteStream, stream pipeline, gzip level 9), `export/index.ts` (`__dirname`
    anchors).
  - *Drop/stub (~290 LOC):* `discovery.ts` (bonjour + `os.networkInterfaces`),
    `sync.ts` (ws `WebSocketServer` at `/ws`; protocol is notification-only —
    `welcome` + `project-saved`, never a payload), listen/signal handling.
- **sharp = one file, one function:** `export/raster.ts:79-93` `writePng()` — raw RGBA
  buffer → palettized PNG file. No resize/composite/decode. But export output sits under
  a **byte-identity golden gate** (`server/src/__tests__/export-golden.test.ts`, 322
  lines); W2b measured that even a sharp *version bump* changed 214 of 232 PNGs
  (bit-identical pixels, different zlib stream). Texture filenames hash the **raw RGBA**
  (`raster.ts:29`), so a different encoder changes PNG bytes only — `frames.json` and
  filenames survive.
- **Persistence:** `backup.ts` owns `server/src/data/` (`config.json`; one minified JSON
  per project — `Base Unit.json` = 1,164,725 B; `backups/MM-DD-YYYY/` uncompressed today,
  `.gz` for prior days). Atomic write = temp file → **read-back byte-compare** → rename
  (`backup.ts:74-100`). Policy: ≥5 min between backups, md5 dedupe, ≤50/day.
- **Export output** (`server/exports/<kebab>/`): `frames.json` (compact string-table
  format), `frames.json.gz` (gzip **level 9** — part of the published artifact),
  generated `index.ts`, `textures/` (264 PNGs for base-unit, named `<12-hex-sha256>.png`
  + `_nrm` pairs). `server/exports/lib/` is a verbatim copy of `client/lib/` **consumed
  by external game code** (OPEN-QUESTIONS Q33 — format frozen without owner sign-off).
- **No `child_process` anywhere. No node:http client** (AI proxy uses global fetch).
  7 `process.env` sites, 4 `__dirname` anchors.

### Client (`client/src/`)
- Runtime deps: react 19.2.8, react-dom, mobx 7.0.0, mobx-react-lite 5.0.0,
  lucide-react, three 0.185.1. **No HTTP lib, no Zustand (fully retired).**
- **The seam already exists:** `client/src/api/` is the typed API layer;
  `httpClient.ts:155` is the **only `fetch` call site** in the entire client and
  `syncClient.ts:131` the **only `WebSocket`** (verified by grep, enforced by ESLint +
  `check-boundaries.mjs` rule 5; `ui/` may not import `api/` at all — rule 1).
- **18 resource methods** in 5 modules: `projectApi` (list/get/save/create/rename/
  remove/switchTo), `backupApi` (list/restore/createMigrationBackup), `exportApi`
  (run — 120 s timeout; `fetchFramesJson` — **`base: ""`**, fetches `/exports/<kebab>/
  frames.json` *outside* `API_BASE`), `configApi` (get), `aiApi` (getConfig/health/
  submitJob/getJob/pollJob with required AbortSignal). `API_BASE =
  import.meta.env.VITE_API_URL || "/api"` (`api/client/config.ts:8`).
- **Complete consumer set — 9 files:** stores `DomainStore.ts`, `AutoSaveController.ts`
  (save is injectable), `ApplicationStore.ts` (constructs SyncClient, **opt-in via
  `syncEnabled`**), `SyncController.ts`; containers `HeaderContainer.tsx` (aiApi.health
  poll every 15 s + exportApi.run), `BrowseBackupsModalContainer.tsx`,
  `ExportPreviewModalContainer.tsx`, `hooks/useInterpolationJob.ts`.
- **Contract tests exist:** `api/__mocks__/handlers.ts` (MSW) +
  `api/__tests__/resources.contract.test.ts` (269 lines) — a behavioral spec of all 18
  methods to test a local implementation against. Unit tests run with MSW
  `onUnhandledRequest:"error"` — no test touches the network.
- **Export preview loads textures by URL:** `ExportPreviewModal.tsx:442` →
  `loadTextures(projectData, "/exports/<kebab>")` — real PNG files fetched from
  `express.static`. This path has no request-level seam.
- **Client-side persistence is zero.** One localStorage key (theme seed,
  `ui/theme/themes.ts`). No IndexedDB/sessionStorage/Cache API. Local mode *introduces*
  persistence, it does not migrate any.
- **No auth/account/email/session-token concept anywhere** in client or server.
- `vite.config.ts`: **no `base` set** (Capacitor needs `"./"` or scheme-aware config),
  `envDir: ".."`, `server.host: true`, `/api` + `/exports` proxied, `/ws` deliberately
  NOT proxied (measured Vite proxy bug — syncClient connects straight to port 3001).
  Aliases triple-mirrored (`aliases.ts` → vite/vitest configs + tsconfig paths).

### Discovery / iPad today
- `ios-companion/` (SwiftUI, iOS 17+): 4-strategy discovery — last-known-good
  (UserDefaults), Bonjour `_pixelart._tcp`, known hostnames, /24 subnet sweep (48-way,
  refuses >1024 hosts) — every strategy funnels through `ServerProbe`
  (`GET /api/discovery`, 1.5 s, requires `service === "pixel-art"`), plus manual entry.
  Server side: `server/src/discovery.ts` advertises via bonjour-service; dual-stack `::`
  bind is load-bearing (README documents the `0.0.0.0` IPv4-only trap and the silently
  fatal `NSBonjourServices` Info.plist key).

### ai-service
- FastAPI + Practical-RIFE (torch). GPU mode or proxy mode (auto-detected via
  `nvidia-smi`; `AI_REMOTE_URL` currently points at a LAN GPU box). Client reaches it
  three-hop: client → Express `/api/ai/*` → Python. **Optional by design** — health
  always returns HTTP 200 with failure in the body; `UnavailableStep` is a first-class
  UI state. FastAPI already sets `allow_origins=["*"]`.

## 5. Wave table

| Wave | Tasks | Parallelism | Gate (must exit 0 before next wave) |
|---|---|---|---|
| W1 | 01, 02, 03, 04, 05, 06 | 6 agents | `bash docs/10-capacitor-ipad-analysis/gate.sh w1` — findings 01–06 exist and are non-empty, each contains the four D5 sections; working tree clean outside `docs/10-*` (see §10) |
| W2 | 07 | 1 agent | `bash docs/10-capacitor-ipad-analysis/gate.sh w2` — `GAPS.md` has no `TBD`/`TODO`, every findings-file gap ID appears in its cross-reference table; `DECISIONS-NEEDED.md` and `findings/00-synthesis.md` exist non-empty |
| W3 | 08 | 1 agent | `bash docs/10-capacitor-ipad-analysis/gate.sh w3` — `docs/11-capacitor-ipad-port/` contains `MASTER.md`, `HANDOFF.md`, `GAPS.md`, ≥8 task files; tree still clean outside `docs/` |
| W4 | 09 | 1 agent | `bash docs/10-capacitor-ipad-analysis/gate.sh w4` — `REVIEW.md` exists; its Findings table has zero rows left in state `OPEN` |

The coordinator creates `gate.sh` (checked into this folder) at W1 start from the
snippets in §10 — it is 20 lines of `test -s` / `grep`, not an application build.
`bun run verify` is NOT part of these gates: no application code may change, so the
correct gate is *proving nothing changed*, not rebuilding.

## 6. Dependency graph

```
01 server-portability ─┐
02 capacitor-platform ─┤
03 client-seam ────────┼──► 07 consolidate ──► 08 generate plan ──► 09 review
04 export-encoding ────┤
05 local-persistence ──┤
06 sync-accounts ──────┘
```

All of 01–06 depend on nothing; 07 depends on all six; 08 on 07; 09 on 08.

## 7. Collision matrix (W1, the only multi-task wave)

| Task | Writes |
|---|---|
| 01 | `findings/01-server-portability.md` only |
| 02 | `findings/02-capacitor-feasibility.md` only (+ scratch spike **outside the repo**) |
| 03 | `findings/03-client-transport-seam.md` only |
| 04 | `findings/04-export-encoding.md` only |
| 05 | `findings/05-local-persistence.md` only |
| 06 | `findings/06-sync-accounts-security.md` only |

Pairwise disjoint by construction; shared *reads* (e.g. several tasks read
`backup.ts`) do not collide. **`GAPS.md` is written by task 07 alone** (D7) — this is
what makes W1 honestly parallel.

## 8. Alignment guide

- **Facts vs opinions.** D9 is the discipline that makes the generated plan trustworthy:
  every Facts claim carries `path:line` or a dated citation. If you could not verify it,
  it goes in Gaps as `NEEDS-MEASURE`, not in Facts.
- **The seam is the barrel.** Everything the analysis designs hangs off two measured
  facts: one fetch site behind `client/src/api/index.ts`, and `runExport()` /
  `backup.ts` already being Express-free. If your design requires touching the 9
  consumer files or the `ui/` layer, you have probably gone wrong — say so explicitly
  if you conclude it is genuinely necessary.
- **Write-once means one source tree.** The adapter pattern (D3) must not fork server
  logic into `server-web/` and `server-node/` copies. Conditional *composition* (two
  thin entrypoints injecting different adapters) is the shape; conditional *logic*
  (`if (isBrowser)`) sprinkled through modules is the anti-pattern.
- **Respect the frozen surfaces:** the project JSON wire format (8 migrations,
  byte-identical round-trip), `server/exports/lib/` (external consumers), the
  `/api/discovery` payload contract with ios-companion. Designs may *propose* changing
  them only as an explicit PRODUCT-DECISION gap.
- **Most likely executor mistakes:** (1) editing application code "just to check
  something compiles" — forbidden, tree must stay clean; (2) writing gaps straight into
  `GAPS.md` from a W1 task — forbidden by D7; (3) trusting January-2026 training data
  for Capacitor/WebKit capabilities instead of task 02's verified findings; (4)
  designing the sync feature as if a webview could accept inbound connections — it
  cannot (G-04); (5) forgetting `fetchFramesJson`/texture loads bypass `API_BASE`.
- **What done looks like:** a stranger can read `00-synthesis.md` + `GAPS.md` +
  `DECISIONS-NEEDED.md` in 20 minutes and correctly brief the owner; `/plan-go` can
  execute `docs/11-*` without ever needing this conversation.

## 9. Risk register

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Capacitor/WebKit facts asserted from stale training data | High | Wrong plan foundations | Task 02 verifies every platform claim against current docs/release notes with dated citations; other tasks must cite 02 rather than assert | 02 |
| An executor edits application source | Medium | Corrupts the "analysis only" guarantee; risks data rules | Every gate greps `git status --porcelain` outside `docs/` and fails on any hit | all |
| GAPS.md write collisions in W1 | Medium | Lost findings | D7: gaps live in findings files, merged only by 07 | 07 |
| Generated plan cites paths/lines that don't exist | Medium | `/plan-go` fails mid-wave | Task 09 verifies every `Touches` path and cited symbol in docs/11 | 09 |
| Underestimating scale (sync + accounts + encryption is a product, not a feature) | High | docs/11 tasks blow past L sizing | Task 08 must split anything >L and is explicitly allowed to schedule sync/accounts as later phases behind the core port | 08 |
| Export byte-identity treated as solvable in-analysis | Medium | Deadlock — it is a product decision | Task 04 frames it as PRODUCT-DECISION with options; 07 puts it in DECISIONS-NEEDED | 04/07 |
| `bunx`/Capacitor CLI creates a lockfile as a side effect during 02's spike | Medium | Violates standing owner policy | Spike runs **outside the repo** (scratchpad); repo-side lockfile grep in every gate | 02 |

## 10. Rules for every executor

1. **Analysis only.** You may create/edit files **only inside
   `docs/10-capacitor-ipad-analysis/`** (task 08: also `docs/11-capacitor-ipad-port/`;
   task 02: also a scratch dir outside the repo). Never edit application source, confs,
   or `package.json` — not even reversibly, not even to test a hypothesis.
2. **CLAUDE.md still binds:** Bun only (`bun`/`bunx`, node/npm are not on PATH); never
   create a lockfile (`find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules`
   must stay empty — `bunx` has been measured to create one as a side effect); never
   run `vitest -u`; never touch `server/src/data/`.
3. **Stay inside your Touches list.** The collision matrix is only valid if you do.
4. **D5/D6/D7/D9 are mandatory:** findings sections, gap format, no direct GAPS.md
   writes from W1, every fact evidenced.
5. **Report honestly.** "I could not verify X" recorded as a NEEDS-MEASURE gap is a
   *good* outcome. A confident unverified claim is the failure mode this whole plan
   exists to prevent.
6. Gate snippets for `gate.sh` (coordinator assembles; each wave section exits non-zero
   on any failure):
   ```sh
   # every wave: tree clean outside docs/, no lockfile
   git status --porcelain | grep -v '^?? docs/' | grep -v '^ M docs/' | grep . && exit 1
   find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules | grep . && exit 1
   # w1: for f in findings/0{1..6}-*.md: test -s "$f" and grep -q '^## Facts' etc.
   # w2: test -s GAPS.md DECISIONS-NEEDED.md findings/00-synthesis.md; ! grep -nE 'TBD|TODO' GAPS.md
   # w3: test -s ../11-capacitor-ipad-port/{MASTER,HANDOFF,GAPS}.md; ls ../11-*/[0-9][0-9]-*.md | wc -l  # ≥8
   # w4: test -s REVIEW.md; ! grep -q 'OPEN' REVIEW.md findings table
   ```

## 11. Task index

| NN | Title | Wave | Effort | One line |
|---|---|---|---|---|
| 01 | Server portability audit & platform adapter | W1 | M | Verify the per-file portability map; draft the `ServerPlatform` adapter and dual entrypoints |
| 02 | Capacitor platform verification | W1 | M | Verify (web + scratch spike) every Capacitor/WKWebView capability the port depends on, with dated citations |
| 03 | Client transport seam design | W1 | M | Design the per-mode `api/` barrel swap, incl. the four paths that don't fit it (ws, static exports, base:"", ai polling) |
| 04 | Export encoding & golden gates | W1 | S | Options for browser-side RGBA→PNG + gzip; quantify what the byte-identity gates and `exports/lib` contract permit |
| 05 | Local persistence & VFS | W1 | M | Choose iPad storage backing; spec the VFS surface `backup.ts` needs; quota/eviction/scale checks |
| 06 | Sync, accounts & encryption design | W1 | L | Threat-modeled options for device↔server/device↔device sync, receive windows, email-keyed sandboxing, at-rest encryption |
| 07 | Consolidate: GAPS + decisions + synthesis | W2 | M | Merge all findings gaps into GAPS.md; write DECISIONS-NEEDED.md and 00-synthesis.md |
| 08 | Generate the implementation plan | W3 | L | Write `docs/11-capacitor-ipad-port/` in full /plan-steps format, incl. its own GAPS.md |
| 09 | Adversarial review of the generated plan | W4 | M | Verify every path/claim/gate in docs/11; fix or record; close the loop in both GAPS files |
