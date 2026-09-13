# 01 — Server portability audit & platform adapter design

**Wave:** W1 · **Depends on:** none
**Touches:** `docs/10-capacitor-ipad-analysis/findings/01-server-portability.md` (new)
**Effort:** M

## Objective
A verified, per-file portability map of all 19 production server modules, and a concrete
draft of the `ServerPlatform` adapter interface plus the two thin entrypoints
(Bun/Express and webview) that let the same server source run in both targets — written
to `findings/01-server-portability.md`. After this task, nobody designing the
implementation plan needs to open a server file to know what ports, what shims, and what
drops.

## Context
The baseline audit is in MASTER.md §4 ("Server"): ~1,150 LOC portable as-is, ~1,050
shimmable, ~290 drop/stub, sharp confined to `export/raster.ts:79-93`, no
`child_process`, no node:http client, 7 `process.env` sites, 4 `__dirname` anchors.
**Your job is to verify those claims at the line level and build on them**, not to
re-derive them — but D9 applies: anything you repeat into Facts, you have checked.

Key structural facts to exploit:
- `runExport()` (`server/src/export/index.ts:58-126`) is already Express-free and takes
  plain arguments; `export/exportRouter.ts` is a 69-line wrapper.
- `routes/project.ts` delegates all real work to `backup.ts`.
- `routes/ai.ts` uses only global `fetch` + env — already browser-compatible.
- `sync.ts`'s protocol is notification-only; local mode is single-instance, so the whole
  layer can be a no-op behind an interface.
- Locked decisions D2/D3 (MASTER §3): direct bindings behind the client barrel; adapter
  working name `ServerPlatform`, roughly `{ fs, gzip, hash, pngEncode, env, events }`.

Related W1 tasks own the deep dives — do not duplicate them: task 04 owns encoder
choice, task 05 owns the storage backing behind `fs`, task 02 owns platform
verification. You own the *interface* and the *map*.

## Steps
1. Read every file under `server/src/` (skip `__tests__/` bodies; note what each test
   pins — especially which artifacts `export-golden.test.ts` and the other two suites
   byte-compare, since G-06 needs to know whether backup `.gz` bytes are pinned).
2. Produce the portability table: one row per production file — LOC, Node builtins used
   (with line refs), bucket (PORTABLE / SHIM / DROP), and for SHIM rows exactly which
   adapter members it needs.
3. Draft the `ServerPlatform` interface as a TypeScript sketch **inside the findings
   doc** (never in `src/`): the minimal `fs` surface (enumerate each method `backup.ts`
   + `write.ts` + `project.ts` + `export/index.ts` actually call, with the mtime and
   read-back-compare requirements), `gzip`/`gunzip`, `hash` (note the md5 issue, G-05),
   `pngEncode` (signature matching `raster.ts:79-93` usage), `env` (map all 7
   `process.env` sites), `events` (what replaces the `project-saved` ws broadcast —
   trace who consumes it via `client/src/api/client/syncClient.ts` and
   `SyncController.ts`).
4. Sketch the two entrypoints: (a) `server/src/index.ts` reshaped into
   "assemble Express + node adapter"; (b) a webview entry that assembles the same
   handlers + browser adapter and exports them as callable bindings. Define the
   transport-agnostic handler signature the routes reduce to (name inputs/outputs per
   route family; the client-side pairing is task 03's job — agree via the shared
   MASTER D3 vocabulary, don't invent client design here).
5. State the build question precisely for task 08: how does server TS get into the
   client bundle (workspace import? path alias? a new shared package dir?) — list the
   options with the monorepo facts (no workspaces field? check root/client/server
   `package.json`) but leave the choice as a Recommendation.
6. Write `findings/01-server-portability.md` per MASTER D5 (Facts / Options /
   Recommendation / Gaps; gaps numbered G-101, G-102, …).

## Constraints
- Create only your findings file. **No edits anywhere else — not GAPS.md (D7), not
  `server/src/`.** Code sketches live in the findings doc as fenced blocks.
- Do not open or read anything under `server/src/data/` (owner's real data).
- Do not prescribe storage backings (task 05) or encoder libraries (task 04); reference
  their task numbers instead.

## Verification
```sh
test -s docs/10-capacitor-ipad-analysis/findings/01-server-portability.md
grep -q '^## Facts' docs/10-capacitor-ipad-analysis/findings/01-server-portability.md
grep -q '^## Gaps' docs/10-capacitor-ipad-analysis/findings/01-server-portability.md
git status --porcelain | grep -v 'docs/10-capacitor-ipad-analysis' | grep . && echo DIRTY || echo CLEAN
```
Expect the greps to succeed and `CLEAN`. Manual check: pick 3 random rows of your
portability table and re-open the file at the cited lines — the citation must hold.

## Definition of done
- [ ] Portability table covers all 19 production files with line-cited builtin usage
- [ ] `ServerPlatform` sketch enumerates every fs/gzip/hash/env/png/event touchpoint
      with the file:line that demands it
- [ ] Which golden/test suites pin which bytes is stated explicitly
- [ ] Dual-entrypoint sketch + route→handler signature table present
- [ ] Facts all carry `path:line`; unverified items appear as Gaps, not Facts
- [ ] Working tree clean outside this plan folder
