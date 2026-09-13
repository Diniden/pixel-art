# 05 — Local persistence & the VFS behind the adapter

**Wave:** W1 · **Depends on:** none
**Touches:** `docs/10-capacitor-ipad-analysis/findings/05-local-persistence.md` (new)
**Effort:** M

## Objective
A chosen storage backing for local mode on iPad (with runner-up), and a full
specification of the virtual-filesystem surface the server's persistence code needs from
the `ServerPlatform.fs` adapter — sufficient for the implementation plan to build the
shim without re-reading `backup.ts`. Written to `findings/05-local-persistence.md`.

## Context
The client has **zero** existing persistence to migrate (one theme-seed localStorage
key); you are introducing storage, not porting it. The consumer is
`server/src/backup.ts` (476 lines) plus `export/write.ts` and `routes/project.ts`
(MASTER §4). Requirements harvested there — verify each at the cited line:
- Operations: readFile/writeFile/mkdir(-p)/readdir/unlink/stat/rename/rm(-r),
  existsSync, createWriteStream (streaming gzip pipeline in `write.ts`).
- **`stat().mtime` ordering** (`backup.ts:199,450`) — a backing without timestamps
  needs a strategy (sidecar index, embedded-in-filename dates — note the layout already
  encodes dates: `backups/MM-DD-YYYY/<Project>-HH-MM-SS.json`).
- **Atomic write with read-back byte-compare** (`backup.ts:74-100`) — preserve this
  guarantee; state what atomicity each backing actually offers.
- Scale: 1,164,725 B project JSON written on debounced autosave; ≤50 backups/day + a
  daily gzip roll-up; 264 PNGs + frames.json per export run.
- Owner requirement: app-private storage, **not** the user-visible Files app.

Platform facts (OPFS availability/persistence/timestamps in WKWebView, Capacitor
Filesystem directory semantics and bridge costs, IndexedDB eviction in-app) are task
02's to verify — **cite `findings/02-capacitor-feasibility.md` gaps/answers by ID where
you depend on them**; where 02's answer isn't in yet, write your dependency as an
explicit assumption tied to their question number. Do not duplicate their research.

Also yours:
- Where per-device preferences live (mode choice, last-known server, account
  namespace) vs project data.
- The **namespace layout** for accounts (G-10/D8): how `<email-derived-key>/` prefixes
  the data tree so task 06's sandboxing has a floor to stand on — coordinate via the
  layout you publish, they design the crypto.
- Durability story: what happens at quota exhaustion (map to a typed `ApiError` for
  task 03's contract), iCloud backup inclusion (is app data backed up by default —
  cite 02 or gap it), and a recovery/escape hatch recommendation given the owner's
  "not the Files app" constraint (e.g. explicit share-sheet export as a *future* item —
  flag as PRODUCT-DECISION if it tensions with the constraint).
- Migration/versioning of the storage layout itself (the project JSON already has 8
  migrations — storage layout gets a version marker from day one).

## Steps
1. Read `backup.ts`, `write.ts`, `routes/project.ts`, `export/index.ts`; build the
   exact fs-surface table (method → call sites → semantics required).
2. Compare backings — OPFS / IndexedDB(-wrapped VFS) / Capacitor Filesystem plugin /
   hybrid (e.g. OPFS for data + Preferences for config) — against the surface table and
   scale numbers; a comparison matrix with a winner and runner-up.
3. Specify the VFS: TypeScript sketch of `ServerPlatform.fs` (align member naming with
   task 01's draft — same MASTER D3 vocabulary; small divergences are fine, task 07
   reconciles), mtime strategy, atomicity mapping, error taxonomy (incl. quota).
4. Define the on-disk layout for local mode: mirror of `server/src/data/` layout under
   an account namespace, plus the storage-version marker.
5. Write `findings/05-local-persistence.md` per MASTER D5; gaps G-501….

## Constraints
- Findings file only. **Never read files under `server/src/data/`** — the *code* tells
  you the layout; the owner's data files are off-limits.
- Don't design encryption or sync (task 06) — only leave them the namespace floor and
  note where an encryption layer would interpose (e.g. encrypt-before-write hook).
- Don't pick Capacitor package versions (task 02 owns pins).

## Verification
```sh
test -s docs/10-capacitor-ipad-analysis/findings/05-local-persistence.md
grep -q '^## Recommendation' docs/10-capacitor-ipad-analysis/findings/05-local-persistence.md
grep -qi 'mtime' docs/10-capacitor-ipad-analysis/findings/05-local-persistence.md
git status --porcelain | grep -v 'docs/10-capacitor-ipad-analysis' | grep . && echo DIRTY || echo CLEAN
```
Manual: every fs method in your surface table carries a `backup.ts`/`write.ts` line
citation; the chosen backing addresses each row or records a gap.

## Definition of done
- [ ] fs-surface table complete and line-cited
- [ ] Backing comparison matrix + winner/runner-up with reasoning
- [ ] VFS spec incl. mtime, atomicity, quota-error taxonomy
- [ ] Account-namespaced layout + storage version marker defined
- [ ] Dependencies on task 02 cited by question/gap ID, none silently assumed
- [ ] Tree clean outside this folder
