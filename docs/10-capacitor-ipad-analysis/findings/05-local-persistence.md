# Findings 05 — Local persistence & the VFS behind the adapter

**Task:** `05-local-persistence-vfs.md` · **Wave:** W1 · **Date:** 2026-09-06
**Line citations** verified against the working tree on branch `feat/09-ipad-pencil-fixes`
@ `cb27aa0` (MASTER §4 measured `941f982`; the persistence files are unchanged between
the two — re-verified at every cited line below).

Scope note: platform behavior (OPFS availability/persistence/timestamps in WKWebView,
Capacitor Filesystem bridge cost and directory semantics, in-app eviction rules) is task
02's to verify. Everywhere this document leans on such a fact it cites task 02's
question number (Q1–Q8 in `02-capacitor-platform-verification.md`) and records the
dependency as an explicit assumption. Web citations here are API-shape facts only.

---

## Facts

### F1 — The complete fs surface the server's persistence code uses

Consumers audited: `server/src/backup.ts` (477 lines), `server/src/export/write.ts`,
`server/src/routes/project.ts`, `server/src/export/index.ts`, plus the one binary
writer `server/src/export/raster.ts` (sharp `.toFile()` — the encoder itself is task
04's; the *file write* it implies is ours).

| # | Operation (Node form) | Call sites (path:line) | Semantics the VFS must provide |
|---|---|---|---|
| 1 | `readFile(p, "utf-8")` | `backup.ts:82` (read-back verify), `:123` (gz roll-up input), `:321` (config), `:472` (backup restore); `routes/project.ts:94` (load project); `export/index.ts:73` (project for export) | UTF-8 text read of up to ~1.2 MB (`Base Unit.json` = 1,164,725 B, MASTER §4). Must throw a typed NotFound on missing file (`:472` guards with exists first, `:94` likewise). |
| 2 | `writeFile(p, s, "utf-8")` | `backup.ts:79` — **only inside `safeWriteFile`** | Plain text write to a temp path. Every durable text write in the system funnels through `safeWriteFile` (`backup.ts:74-100`). |
| 3 | binary file write | `raster.ts:92` (`sharp(...).toFile(outPath)`), queued at `transform.ts:61,83`, awaited `transform.ts:95-97` | Under D3 the encoder becomes `pngEncode` returning bytes; the VFS then needs a **binary write** (`Uint8Array`), 264 files/run for base-unit (MASTER §4), each a small palettized PNG. Concurrent writes are in flight together (`Promise.all`, `transform.ts:96`). |
| 4 | `mkdir(p, {recursive:true})` | `backup.ts:67` (`ensureDir`, used at `:241,271,314,335,406` and `export/index.ts:71`); `routes/project.ts:26` | mkdir -p; idempotent (call sites pre-check exists, but recursive create must tolerate existing dirs). |
| 5 | `readdir(p)` | `backup.ts:111` (roll-up), `:191` (cleanup sort), `:290` (find old date folders), `:344` (list projects), `:417,433` (list backups) | Names only (no `withFileTypes` anywhere — callers `stat` separately). Order is irrelevant; callers filter/sort themselves. |
| 6 | `stat(p)` | `backup.ts:198-199` (**`.mtime` for oldest-first cleanup sort**), `:293-296` (`.isDirectory()` on backup folders), `:424-426` (`.isDirectory()`), `:444-450` (**`.mtime` for newest-first backup listing**) | Needs `mtime` (ms precision is enough — values are compared, `:203`, `:455`) and a file/dir kind flag. **These four sites are the entire mtime dependency.** |
| 7 | `rename(from, to)` | `backup.ts:88` (**atomic replace of an existing destination** — the commit step of `safeWriteFile`), `:146` (gz temp → final), `:383` (project rename — destination guaranteed absent by `:379`) | Two distinct semantics: (a) POSIX rename-over-existing, atomic, at `:88`; (b) rename-to-fresh-name at `:146,:383`. The VFS must state which it gives (see Recommendation R4 and G-501). |
| 8 | `unlink(p)` | `backup.ts:93` (temp cleanup), `:219` (prune >50/day), `:396` (delete project) | Delete file; `:93` tolerates failure (wrapped in try/ignore). |
| 9 | `rm(p, {recursive:true, force:true})` | `backup.ts:116` (empty date folder), `:149` (date folder after gz roll-up) | Recursive dir delete, no-error-if-missing. |
| 10 | `existsSync(p)` | `backup.ts:66, 92, 316, 362, 375, 379, 392, 468`; `routes/project.ts:25, 89, 356`; `export/index.ts:63`; `export/write.ts:55` — **13 sites, all synchronous** | Every browser-side backing is async-only (OPFS and the Capacitor bridge both return promises). **`existsSync` cannot be implemented honestly on any candidate backing.** Every one of the 13 call sites already sits inside an `async` function (incl. `projectExists`, `backup.ts:361-363`, whose only callers are async route handlers, `routes/project.ts:161,192,197,229,269`), so an async `exists()` is a mechanical migration — but it is a *server-source* change task 01's adapter must own. |
| 11 | `createWriteStream(p)` + `pipeline`/`pipe` | `backup.ts:132-146` (gzip roll-up, `createGzip({level:9})` at `:133`); `export/write.ts:33-37` (`frames.json.gz`, level 9 at `:35`) | Both sites exist **only to stream into gzip**. Inputs are already fully in memory (`combinedContent` string, `backup.ts:128`; `framesJsonStr`, `write.ts:34`). A `gzip(bytes)→bytes` adapter member plus binary write (row 3) replaces both; no true streaming write is required at these scales (see R3). Gzip byte-compat itself is G-06 (seeded GAPS.md), not re-argued here. |
| 12 | `cp(src, dst, {recursive:true, force:true})` | `export/write.ts:56` (`copyClientLib`) | Recursive copy of `client/lib` → `exports/lib`. In local mode there is no on-disk `client/lib`; the source is bundled assets. This row should leave the fs surface entirely (see R3 and G-508). |

Path/name facts the VFS inherits:

- All paths are `join()`-built POSIX-ish relative trees under two roots: `DATA_DIR`
  (`backup.ts:17-20`, anchored on `__dirname`) and the export base
  (`export/index.ts:42`, `server/src/index.ts:35-36`).
- Project names — hence filenames — are `[a-zA-Z0-9 \-_]{1,100}`, never `config`,
  never dot-led (`validation.ts:14-22`). **Spaces are legal** (`Base Unit.json`), so
  the backing must accept spaces in entry names.
- The backup layout **already encodes date and time in names**:
  `backups/MM-DD-YYYY/<Project>-HH-MM-SS.json` (`backup.ts:43-60, 269-276`), and
  `listBackupsForProject` re-parses both from names (`:428, :442`) while sorting by
  mtime (`:450-455`). Roll-ups are `backups/MM-DD-YYYY.gz` (`:107`).

### F2 — The atomic-write contract (`backup.ts:74-100`)

`safeWriteFile` = write `${path}.tmp.${Date.now()}` → read the temp back → strict
string compare (`:82-84`) → `rename(temp, path)` (`:88`) → on any failure, best-effort
`unlink(temp)` (`:91-97`). Guarantees today, on POSIX: (a) the destination is never a
torn file; (b) the bytes on disk were verified readable-equal before commit; (c) a
crash leaves either old file + stray temp, or new file. Callers: every config write
(`:336`), every project save (`routes/project.ts:128,170,327,357`), every backup
(`:279`), `frames.json` and `index.ts` in exports (`write.ts:30,66`).

### F3 — Write frequency and volume envelope

- Project save: client-debounced autosave POSTs the full ~1.16 MB JSON; each save is
  one `safeWriteFile` (= 1 write + 1 read + 1 rename) plus a backup attempt.
- Backups: ≥5 min apart per project (`backup.ts:22,255`), md5-deduped (`:263`),
  ≤50/day (`:23,213`), so worst-case ~58 MB/day of uncompressed backups; previous days
  collapse to one `.gz` each (`:105-157`). 9 gz files hold 149 snapshots today
  (CLAUDE.md "Protect the owner's data").
- Export run (user-initiated, 120 s client timeout per MASTER §4): 264 PNG writes +
  `frames.json` (+`.gz`) + `index.ts` + lib copy.

### F4 — Client-side persistence today is one seed key

The only live web-storage use in the client is the theme seed:
`client/src/ui/theme/themes.ts:57` (get) and `:69` (set); every other `localStorage`
mention in `client/src/` is a comment (verified by grep across `main.tsx`,
`stores/ui/*`, `ui/layout/deviceClass.ts`, `containers/HeaderContainer.tsx`,
2026-09-06). No IndexedDB, no sessionStorage. Local mode **introduces** persistence;
there is nothing to migrate. (Confirms MASTER §4.)

### F5 — API-shape facts about the candidate backings (dated citations)

- **Capacitor Filesystem plugin** (https://capacitorjs.com/docs/apis/filesystem,
  checked 2026-09-06): methods `readFile`, `readFileInChunks` (read-only chunking),
  `writeFile`, `appendFile`, `deleteFile`, `mkdir({recursive})`, `rmdir({recursive})`,
  `readdir`, `getUri`, `stat`, `rename`, `copy`. `stat()`/`readdir()` return
  `FileInfo` with **`mtime` ("time of last modification in milliseconds")**, `ctime`,
  `size`, `type: 'file'|'directory'`, `uri`. `writeFile` data is `string | Blob`;
  text uses `Encoding.UTF8`, binary is **base64-encoded string** ("if you do not
  provide encoding and use non-base64 data, an error will be thrown"). The docs
  document **no atomicity or durability guarantee for `writeFile`**, and no
  rename-over-existing semantics. Directory enum: `Data` — "On iOS it will use the
  Documents directory"; `Library` — "On iOS it will use the Library directory";
  `Cache` — "can be deleted in cases of low memory".
- **OPFS** (https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system,
  checked 2026-09-06): root via `navigator.storage.getDirectory()`;
  `getFileHandle/getDirectoryHandle({create})`, `removeEntry({recursive})`, async
  directory iteration; writes via `createWritable()` (documented as temp-file +
  atomic replace on close) or worker-only `createSyncAccessHandle()`
  (`read/write/truncate/flush/close`). **No timestamp/metadata API is documented on
  handles**; `getFile()` returns a `File` whose `lastModified` fidelity on an
  OPFS-backed file is per-engine behavior (→ task 02 Q3).
  `FileSystemHandle.move()` "has shipped for files within the OPFS" per Chrome's
  documentation (https://developer.chrome.com/docs/capabilities/web-apis/file-system-access,
  checked 2026-09-06) but is **not part of the MDN-documented baseline and is not
  supported for directories** — WebKit support is a task 02 Q3 fact.
- **Capacitor Preferences plugin** (https://capacitorjs.com/docs/apis/preferences,
  checked 2026-09-06): key/value store, **`UserDefaults` on iOS**;
  `get/set/remove/keys/clear/configure(group)`; string values only; docs warn it "is
  _not_ meant to be used as a local database" and exists to replace `localStorage`,
  "which mobile operating systems may periodically clear".

### F6 — Dependencies on task 02 (explicit, none silently assumed)

| Dep | What this document assumes | Task 02 question |
|---|---|---|
| A1 | OPFS exists, persists, and is not silently evicted in WKWebView-in-Capacitor; whether it exposes usable timestamps | Q3 |
| A2 | IndexedDB inside a Capacitor app is (or is not) subject to Safari-style 7-day eviction | Q3 |
| A3 | `Directory.Library` is app-private (not Files-app-visible without `UIFileSharingEnabled`/`LSSupportsOpeningDocumentsInPlace`) and whether it is included in iCloud/device backup by default | Q3 |
| A4 | Per-call bridge overhead order-of-magnitude and base64-vs-Blob behavior on iOS for MB-scale payloads | Q3 (and G-09 for in-process call cost) |
| A5 | Local files can be served by URL to `<img>`/fetch/WebGL via `convertFileSrc`/`WKURLSchemeHandler` (matters for exports, G-08) | Q4 |
| A6 | Exact plugin package + version pins (`@capacitor/filesystem`, `@capacitor/preferences`) | Q1 |
| A7 | Webview JS throttling when backgrounded (affects the debounced autosave landing) | Q8 |

---

## Options

Candidates measured against F1's 12 rows, F2's atomicity contract, F3's volume, and the
owner constraint "app-private storage, not the user-visible Files app" (MASTER §1).

### O1 — Capacitor Filesystem plugin, rooted at `Directory.Library`

Real native files inside the app container.

- **mtime (F1 rows 6):** native — `stat`/`readdir` return `mtime` in ms (F5). The only
  candidate with metadata for free.
- **Atomicity (F2):** `writeFile` undocumented; `rename` exists but
  rename-over-existing is undocumented on iOS (Apple's `FileManager.moveItem` family
  historically fails if the destination exists) → the shim keeps the temp-file dance
  but must resolve the commit-step semantics (G-501).
- **Durability:** native files are **outside every browser-storage eviction regime** —
  the strongest durability story available, matching today's server semantics. Backup
  inclusion: A3/Q3.
- **Scale:** binary crosses the bridge as base64 (F5) — a 1.16 MB save costs ~1.55 MB
  string across the bridge twice (write + read-back verify); 264 PNG writes = 264
  bridge calls in a user-initiated 120 s operation. Order-of-magnitude fine on paper;
  measured by Q3/G-09 (A4).
- **Exports by URL (G-08):** native file paths are exactly what
  `convertFileSrc`/scheme handlers serve (A5/Q4) — OPFS files are not.
- **App-private:** `Library` is the app-private choice; note the trap that
  **`Directory.Data` maps to *Documents* on iOS** (F5) — Documents is the directory
  that *can* become Files-app-visible via Info.plist keys, so `Data` is the wrong
  default for this owner constraint (confirm via A3/Q3).
- **Fit gaps:** no streaming write (rows 11 — resolved by buffering, R3), no recursive
  copy needed once row 12 is deleted (R3), async-only (row 10 — same for all
  candidates).

### O2 — OPFS (+ sidecar metadata index)

- **mtime:** none documented (F5) → a sidecar index (or name-derived ordering, which
  the backup layout supports — F1 path facts) is mandatory.
- **Atomicity:** `createWritable()` is documented temp-file + atomic-replace-on-close —
  actually *stronger* than the hand-rolled dance; read-back verify still portable.
- **Performance:** in-webview, zero bridge cost, sync access handles in workers — the
  best raw I/O of the three.
- **Durability:** the killer risk — availability *and* eviction behavior in WKWebView
  are unverified (A1/Q3), and this store holds the owner's real work (CLAUDE.md
  highest-severity rule). Also invisible to native code, un-servable by URL (A5), and
  un-reachable by a future native sync plugin without copying through the bridge.
- **Rename:** `move()` unverified in WebKit (F5, A1); emulate via copy+delete if absent.

### O3 — IndexedDB as a VFS (file-per-record)

- **mtime:** trivially self-recorded per record. **Atomicity:** real transactions —
  best-in-class; the temp/rename dance becomes a single transactional put.
- **Durability:** same webview-storage eviction question as OPFS (A2/Q3), same
  invisibility to native/URL serving. A VFS emulation layer (directories as key
  prefixes, readdir as index scans) is invented code with no ecosystem behind it in
  this repo.
- Binary Blobs native (no base64), MB-scale values fine.

### O4 — Hybrid: native files for data, OPFS/IDB for derived output

E.g. project/backup tree on O1, `exports/` tree on O2 (regenerable cache). Rejected as
the *primary* recommendation: exports must be URL-servable to the preview WebGL loader
(`ExportPreviewModal.tsx:442`, MASTER §4) which favors native files (A5), and two
backings behind one `fs` interface doubles the semantics matrix (two atomicity stories,
two error taxonomies) for no removed risk.

### Comparison matrix

| Criterion (from Facts) | O1 Capacitor FS (`Library`) | O2 OPFS | O3 IndexedDB-VFS | O4 Hybrid |
|---|---|---|---|---|
| mtime for rows 6 | **native** | sidecar/name-derived | self-recorded | mixed |
| Atomic commit (F2) | temp+rename, semantics to verify (G-501) | **atomic close, documented** | **transactional** | mixed |
| Read-back verify portable | yes | yes | yes (or superseded by txn) | yes |
| Eviction risk to owner's data | **none known (native files)** | unverified (A1) | unverified (A2) | partial |
| 1.16 MB save cost | 2× base64 bridge hops (A4) | in-process | in-process | bridge for data |
| 264-PNG export run | 264 bridge calls (A4) | fast | fast | fast |
| Served by URL for preview (A5) | **yes** | no | no | partial |
| Reachable by native sync/backup code later | **yes** | no | no | partial |
| App-private, not Files app | yes (`Library`, A3) | yes | yes | yes |
| Sync `existsSync` | no — async migration needed (row 10) | no | no | no |
| Implementation surface | thin shim over plugin | shim + metadata index + worker plumbing | whole VFS emulation | two shims |

---

## Recommendation

### R1 — Backing: **Capacitor Filesystem plugin rooted at `Directory.Library`** (winner); **OPFS + sidecar index** (runner-up)

The decision is dominated by one asymmetry: this store will hold the only copy of the
owner's real work in local mode, and **native container files are the only candidate
whose durability model is not an open question** (O1 vs A1/A2). Everything else O1
loses on — bridge cost, base64 inflation — is bounded and measurable (A4), sits inside
a debounced autosave and a user-initiated export, and buys back URL-servability (A5)
and future native reachability for task 06's sync. OPFS is the runner-up, promoted
only if task 02 measures (a) the bridge cost as genuinely prohibitive at F3's envelope
*and* (b) OPFS-in-WKWebView as persistent and eviction-safe; it then still needs the
sidecar mtime index and a G-08 answer that doesn't involve URLs. IndexedDB is not
recommended: it shares OPFS's unverified eviction posture while adding a bespoke VFS
emulation layer. Per-device *preferences* are not files at all — R6.

### R2 — VFS surface (`ServerPlatform.fs`, MASTER D3 vocabulary; task 01 owns the final shape, task 07 reconciles)

```ts
/** All paths are POSIX-style, relative to the adapter's root (see R5). */
export interface VfsStat {
  kind: "file" | "dir";
  size: number;
  mtimeMs: number; // F1 row 6; winner: native FileInfo.mtime; runner-up: sidecar index
}

export interface ServerPlatformFs {
  readTextFile(path: string): Promise<string>;              // F1 row 1
  writeTextFile(path: string, text: string): Promise<void>; // F1 row 2 (non-atomic, temp files only)
  readBinaryFile(path: string): Promise<Uint8Array>;        // restore/sync symmetry
  writeBinaryFile(path: string, bytes: Uint8Array): Promise<void>; // F1 rows 3, 11
  /** Temp-write → read-back verify → atomic commit, lifted from backup.ts:74-100 (R4). */
  writeFileAtomic(path: string, data: string | Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;                   // F1 row 10 — async by necessity
  stat(path: string): Promise<VfsStat>;                     // throws ENOENT-typed (R7)
  readdir(path: string): Promise<string[]>;                 // names only, F1 row 5
  mkdirp(path: string): Promise<void>;                      // F1 row 4
  rename(from: string, to: string, opts: { overwrite: boolean }): Promise<void>; // F1 row 7
  unlink(path: string): Promise<void>;                      // F1 row 8
  rmrf(path: string): Promise<void>;                        // F1 row 9
}
```

Deliberate deletions from the Node surface, each requiring a small server-source change
that task 01's adapter work owns:

- **No `existsSync`** — all 13 sites (F1 row 10) are inside async functions already;
  `projectExists` (`backup.ts:361`) becomes async, rippling only into async route
  handlers.
- **No `createWriteStream`** — both sites are gzip-only (F1 row 11); with D3's
  `gzip(bytes) → bytes` member, `writeBinaryFile` replaces the pipeline. Buffering is
  safe at F3 scales (≤ a few MB). Byte-compat of the gzip stream itself is G-06.
- **No `cp -r`** — `copyClientLib` (F1 row 12) must not go through the VFS in local
  mode; the lib source is a bundled asset, and whether on-device exports include
  `lib/` at all is G-508.
- **`writeFileAtomic` is an adapter member, not shared code** — because the correct
  mechanics differ per platform (R4), and because task 06's at-rest encryption
  interposes exactly here: encrypt-before-write inside `writeFileAtomic`/
  `writeTextFile`, decrypt-after-read inside the reads, with the read-back verify
  comparing **ciphertext** (what was physically written), keeping F2's guarantee
  intact under encryption.

### R3 — mtime strategy

Winner: use native `mtime` from `stat`/`readdir` (F5) directly for the four sites in
F1 row 6 — no sidecar. Hedge (mandatory for the runner-up, cheap insurance for the
winner): the backup tree is **self-describing** — `MM-DD-YYYY/` + `-HH-MM-SS` names
give 1-second-resolution ordering with zero extra I/O; per-project files can't collide
within a second (≥5 min apart, `backup.ts:22,255`); cross-project same-second ties
break by name. Specify the shim's backup listing/cleanup as *mtime-primary,
name-derived-fallback* so a future restore/sync that fails to preserve mtimes (G-507)
degrades to correct ordering instead of silent mis-pruning.

### R4 — Atomicity mapping

| Backing | `writeFileAtomic` implementation | Guarantee |
|---|---|---|
| Node/Bun (today) | unchanged `backup.ts:74-100` mechanics | POSIX rename-over-existing, atomic |
| Capacitor FS (winner) | write `${p}.tmp.<ts>` → read back & compare → commit. Commit step: `rename` if the native side replaces existing destinations, else `delete(p)` + `rename(tmp,p)` with a crash-recovery sweep (on adapter init, for each `*.tmp.*`: if the base file is missing and the temp verifies as JSON, promote it; else delete it) | atomic if rename-replaces (G-501 decides); else "never torn, briefly absent, self-healing" |
| OPFS (runner-up) | `createWritable()` (documented atomic-on-close, F5) + read-back verify after close | atomic per spec; verify is belt-and-braces |

The read-back byte-compare survives in every mapping — it is the cheapest honest check
against bridge/encoding corruption (base64 round-trips, F5) and is non-negotiable
given whose data this is.

### R5 — On-device layout: account-namespaced mirror of `server/src/data/`, versioned from day one

The adapter is **rooted per account**: server code keeps its exact current relative
layout (zero knowledge of accounts), and mode bootstrap picks the root. Task 06 owns
key derivation; the floor it stands on (D8/G-10) is:

```
<Directory.Library>/pixel-art/
  storage.json                    # { "storageVersion": 1, "createdAt": <iso> } — the layout's own version marker
  accounts/
    <account-key>/                # filename-safe key derived from the email (task 06; see constraints below)
      account.json                # per-account: { "storageVersion": 1, "protected": bool, ... } — task 06 defines the rest
      data/                       # ⇐ ServerPlatform.fs root for this account (mirror of server/src/data/)
        config.json
        <Project Name>.json
        <Project Name>.migration-backup.json
        backups/
          MM-DD-YYYY/<Project>-HH-MM-SS.json
          MM-DD-YYYY.gz
      exports/                    # ⇐ export base for this account (mirror of server/exports/, minus lib/ — G-508)
        <kebab-name>/{frames.json, frames.json.gz, index.ts, textures/*.png}
```

Constraints on `<account-key>` this layout imposes on task 06: deterministic from the
normalized email (same email ⇒ same directory, every launch), filename-safe on iOS
(recommend lowercase hex, so length is bounded and no case-sensitivity questions),
and stable across app updates — a salted hash is fine **iff the salt is stored on
device** (losing it orphans the namespace; where the salt lives is 06's design, G-509).
`storage.json` is written before first use and checked on every bootstrap; an
unknown-higher version aborts with a typed error instead of guessing — the project
JSON's 8-migration history is the proof this marker earns its keep.

### R6 — Per-device preferences: Capacitor Preferences, not the data tree

Mode choice (`remote`/`local`, D4), last-known server URL (feature parity with
ios-companion's UserDefaults strategy, MASTER §4), active `<account-key>`, and the
theme seed (F4) are device-scoped, tiny, needed at bootup before any VFS/account is
open, and must not be inside an account namespace (they *select* the namespace). The
Preferences plugin (UserDefaults on iOS, F5) is purpose-built for exactly this and
escapes webview-storage clearing (F5). Project data never goes there ("not a local
database", F5). The existing theme seed migrates trivially or stays in localStorage
until Q3 rules on webview localStorage persistence in-app.

### R7 — Error taxonomy (for task 03's typed `ApiError` contract)

The adapter maps every backing error into one of:

| VFS error | Sources (winner backing) | Local-mode `ApiError` mapping | UX obligation |
|---|---|---|---|
| `VfsNotFound` | plugin file-not-found on read/stat/delete | today's 404 bodies (`routes/project.ts:90,193,230,270`) | existing flows |
| `VfsConflict` | rename/create onto existing (`backup.ts:375-381` paths) | today's 409 (`routes/project.ts:162,197`) | existing flows |
| `VfsStorageFull` | iOS disk-full write failure; (runner-up: `QuotaExceededError` DOMException) | **new** typed `storage-full` | Blocking, explicit UI. Autosave must keep the dirty in-memory state and retry after user action — a silent drop of a 1.16 MB save is data loss. Backups already self-cap (F3); export failure is recoverable (derived data). |
| `VfsIntegrityError` | read-back compare mismatch in `writeFileAtomic` (F2) | **new** typed `write-verify-failed` | Same severity as storage-full; never retry-loop silently. |
| `VfsUnavailable` | root/mkdir failure at bootstrap, storage.json version-ahead (R5) | **new** typed `storage-unavailable` | Refuse to enter local mode; offer remote mode. |

Free-space *preflight* has no verified API on the winner (the Filesystem plugin
exposes none — F5); treat write-failure as the discovery mechanism unless task 02
finds one (G-506).

### R8 — Durability story and escape hatch

- **Quota/disk exhaustion:** see `VfsStorageFull` above; the layout's growth is
  bounded by design (≤50 backups/day, daily gz roll-up, F3).
- **Device/iCloud backup:** if `Library` is included by default (A3/Q3), the owner
  gets whole-container recovery for free; if task 06's encryption story wants data
  *excluded* from backups, that is a native-side attribute
  (`NSURLIsExcludedFromBackupKey`-shaped) requiring a small native hook — recorded as
  part of G-504 so the decision is explicit either way.
- **App deletion deletes the container.** The real safety net is task 06's sync; until
  it exists, local mode's honest posture is "data lives and dies with the app install
  (plus device backup, pending A3)". This must be surfaced in the mode-selection UX.
- **Escape hatch:** a *user-initiated* share-sheet export of a project JSON (and
  import of one) is the recommended future recovery hatch. It is not the Files app,
  but it does make data user-visible on demand, which tensions with the owner's
  constraint — flagged PRODUCT-DECISION (G-503), not designed here.

---

## Gaps

### G-501 · NEEDS-MEASURE · Capacitor Filesystem `rename`/`writeFile` atomicity semantics are undocumented
**Evidence:** https://capacitorjs.com/docs/apis/filesystem (checked 2026-09-06)
documents `rename` and `writeFile` with no statement on overwrite-existing behavior or
atomicity; the commit step of `safeWriteFile` (`server/src/backup.ts:88`) requires
rename-over-existing today.
**Impact:** If native rename refuses an existing destination, the shim's commit
becomes delete+rename — a crash window where the project file is briefly absent.
**Special measure:** Task 02 spike (or first implementation task) measures rename-onto-existing
on iOS; until then the shim ships the delete+rename + `*.tmp.*` crash-recovery sweep
specified in R4, which converts the window into self-healing.

### G-502 · NEEDS-MEASURE · Runner-up viability rests entirely on task 02 Q3
**Evidence:** F6 rows A1/A2 — OPFS availability, persistence, timestamps, and `move()`
support in WKWebView, and IndexedDB in-app eviction, are all unverified here by design.
**Impact:** If Q3 finds OPFS absent/evictable, there is no runner-up and O1 is the
only honest backing; if Q3 finds the bridge prohibitive (A4) *and* OPFS solid, the
recommendation flips.
**Special measure:** None needed now — R1 is written to survive either outcome; task
07 re-checks this gap against `findings/02-capacitor-feasibility.md` when merging.

### G-503 · PRODUCT-DECISION · Recovery escape hatch vs "not the Files app"
**Evidence:** Owner constraint (MASTER §1: "not on the users file app stuff"); R8's
share-sheet export recommendation makes data user-visible on explicit demand.
**Impact:** Without *any* hatch, un-synced local data is unrecoverable outside device
backup; with one, the "app-private" posture gains a deliberate, user-initiated hole.
**Special measure:** Owner chooses: (a) no hatch until sync ships, (b) share-sheet
export/import as a v1 feature, or (c) hatch behind the password-protection setting.
For DECISIONS-NEEDED.md.

### G-504 · NEEDS-MEASURE · `Directory.Library` privacy + backup inclusion (delegated to 02 Q3)
**Evidence:** F5: plugin docs state only "On iOS it will use the Library directory";
`Directory.Data` maps to *Documents* on iOS — the directory Info.plist keys can expose
in the Files app. Files-app visibility and default iCloud-backup inclusion are
platform facts (F6 row A3).
**Impact:** Wrong directory choice violates the owner's core constraint; backup
inclusion decides half the durability story (R8) and interacts with 06's encryption.
**Special measure:** Task 02 Q3 verifies both; if backup-exclusion is wanted, budget
the small native hook named in R8.

### G-505 · DESIGN-RISK · The VFS is async-only; 13 `existsSync` sites and 2 stream sites must migrate
**Evidence:** F1 rows 10–12 (call-site census with lines); every candidate backing is
promise-based.
**Impact:** This is a *server-source* refactor (touching `backup.ts`,
`routes/project.ts`, `export/write.ts`, `export/index.ts`) that must land before any
adapter can be injected — and those files sit above the migration-corpus safety rule
(CLAUDE.md: corpus snapshots must pass unchanged).
**Special measure:** Task 01's adapter design owns the refactor shape (all sites are
already in async contexts — F1 row 10); the implementation plan must schedule it with
the corpus-snapshot gate attached.

### G-506 · NEEDS-MEASURE · No verified free-space preflight for local mode
**Evidence:** F5 — the Filesystem plugin API exposes no free-space query
(https://capacitorjs.com/docs/apis/filesystem, checked 2026-09-06).
**Impact:** First notice of disk exhaustion is a failed 1.16 MB autosave write.
**Special measure:** R7's `VfsStorageFull` path (retain dirty state, blocking UI) makes
failure-as-discovery safe; task 02 Q1 may surface a Device-plugin free-space field to
add a courtesy preflight warning.

### G-507 · DESIGN-RISK · mtime fidelity across restore/sync/backup round-trips
**Evidence:** F1 row 6 — pruning (`backup.ts:199-219`) and listing (`:450-455`) order
by mtime; files re-materialized by iCloud restore or task 06's future sync have no
guaranteed original mtimes.
**Impact:** Skewed mtimes could mis-order the backup list or prune the wrong files
(silent loss of backup history).
**Special measure:** R3's mtime-primary/name-derived-fallback listing rule; task 06's
sync should write files with source timestamps where the plugin allows, else rely on
the name-derived ordering the layout already encodes.

### G-508 · PRODUCT-DECISION · Does an on-device export include `lib/` at all?
**Evidence:** F1 row 12 — `copyClientLib` (`server/src/export/write.ts:50-58`) copies
`client/lib` → `exports/lib`, a tree "consumed VERBATIM by external game code"
(`write.ts:45-48`, OPEN-QUESTIONS Q33); on device there is no `client/lib` directory,
only bundled assets, and no external game code reads the iPad's container.
**Impact:** Copying it costs bundle size + storage for a tree nothing on-device
consumes; omitting it makes a device-side export directory non-identical to a
server-side one (matters if sync ever ships export trees).
**Special measure:** Owner decides: omit `lib/` in local mode (recommended — the
preview loader reads `frames.json` + textures, not `lib/`) or ship it as a bundled
asset copy. For DECISIONS-NEEDED.md alongside G-14's export-identity question.

### G-509 · DESIGN-RISK · Account-key stability is a data-loss vector
**Evidence:** R5 — the namespace directory is derived from the email (D8: salted
hash); a salt or normalization rule that changes across launches/updates orphans the
entire account tree.
**Impact:** Everything under `accounts/<key>/` becomes invisible (not deleted, but
unreachable) after a derivation change — indistinguishable from data loss to the user.
**Special measure:** Layout requirement handed to task 06: derivation inputs
(normalization rule, salt) must live on-device with the data (e.g. inside
`account.json`/`storage.json`), and bootstrap must enumerate `accounts/` and detect
orphans (a directory no known key maps to) rather than silently ignoring them.
