# 03 — Client transport seam design

**Wave:** W1 · **Depends on:** none
**Touches:** `docs/10-capacitor-ipad-analysis/findings/03-client-transport-seam.md` (new)
**Effort:** M

## Objective
A concrete design for swapping the client's transport per mode — `remote` keeps HTTP
exactly as today, `local` dispatches to in-process server bindings — behind the existing
`client/src/api/` barrel with **zero changes to the 9 consumer files**, plus explicit
designs for the four paths that don't fit the barrel cleanly. Written to
`findings/03-client-transport-seam.md`.

## Context
Measured facts to build on (MASTER §4 "Client"; verify what you use, D9):
- `client/src/api/index.ts` is the only legal consumer import; `httpClient.ts:155` is
  the sole `fetch`; `syncClient.ts:131` the sole `WebSocket`. Boundary machine-checked
  (`client/scripts/check-boundaries.mjs` rule 5, ESLint).
- 18 methods across 5 resource modules, all `async`, all throwing typed `ApiError` —
  a local implementation returning promises satisfies the contract verbatim.
- Contract tests: `api/__tests__/resources.contract.test.ts` + MSW mocks — your design
  should let the same contract suite run against the local implementation.
- Seams that already exist: `AutoSaveController` takes an injectable `save`;
  `ExportPreviewModalContainer` injects `loadExport`.

The four misfits you must design for individually:
1. **`exportApi.fetchFramesJson`** uses `base: ""` — outside `API_BASE` — and the
   preview then loads texture **PNGs by URL** (`ExportPreviewModal.tsx:442` →
   `loadTextures(data, "/exports/<kebab>")`). See G-08; D2 allows a fallback mechanism
   here (blob URLs / scoped service worker / Capacitor `convertFileSrc` — weigh them,
   citing task 02's findings by number for platform facts rather than asserting them).
2. **SyncClient `/ws`** — remote mode keeps it (it already bypasses the Vite proxy and
   is opt-in via `syncEnabled`, `ApplicationStore.ts:865-875`); local mode is
   single-instance. Decide: no-op sync transport vs not constructing it, and what
   becomes of the `x-pixel-art-origin` header stamping in `projectApi.save`.
3. **aiApi** — in local mode the Express proxy hop disappears but `routes/ai.ts` logic
   ports (G-03). Decide where URL resolution lives and how the 15 s health poll in
   `HeaderContainer.tsx:196` behaves offline.
4. **Mode selection + boot flow** — where the `remote`/`local` choice (D4) lives
   (a persisted device preference — cite task 02 for Capacitor Preferences vs
   localStorage), how it composes with the future find-a-server UX (the discovery UI
   itself is implementation-plan scope; you define the seam: what the transport layer
   needs handed to it — a base URL for remote, an assembled server-binding object for
   local), and how the web (non-Capacitor) build keeps today's behavior with zero UX
   change.

Also in scope: the mode-aware build story for G-12 (Vite `base`, a `capacitor` build
mode/config, `envDir` interplay) — as options + recommendation, not edits.

## Steps
1. Read `client/src/api/` in full (it is small), the 9 consumer files at the cited call
   sites, `vite.config.ts`, and `client/aliases.ts`. Verify the "only fetch site" claim
   with your own grep.
2. Design the transport abstraction: name the interface, show the TypeScript sketch
   (fenced, in the findings doc), show how each of the 5 resource modules binds to it,
   and how mode wiring happens at startup without violating the `ui/` boundary or
   introducing imports that `check-boundaries.mjs` forbids (quote the rule you checked).
3. Design the four misfits (above), one section each, with a recommendation per item.
4. Specify the test strategy: how `resources.contract.test.ts` runs against both
   transports (MSW for HTTP; direct for local) and what new contract cases local mode
   needs (e.g. quota-full errors surfacing as `ApiError`).
5. Write `findings/03-client-transport-seam.md` per MASTER D5; gaps numbered G-301….

## Constraints
- Findings file only; no source edits, no GAPS.md edits (D7).
- Do not design storage (task 05), encryption/sync protocol (task 06), or pick the PNG
  encoder (task 04). Where your seam touches theirs, name the task number and state the
  interface you expect from it.
- The 9 consumer files and everything under `ui/` are design invariants: if you
  conclude one must change, that is a Gap with justification, not a silent redesign.

## Verification
```sh
test -s docs/10-capacitor-ipad-analysis/findings/03-client-transport-seam.md
grep -q '^## Facts' docs/10-capacitor-ipad-analysis/findings/03-client-transport-seam.md
grep -qi 'fetchFramesJson' docs/10-capacitor-ipad-analysis/findings/03-client-transport-seam.md
git status --porcelain | grep -v 'docs/10-capacitor-ipad-analysis' | grep . && echo DIRTY || echo CLEAN
```
Manual: walk each of the 18 methods through your design on paper — each one has a
stated local-mode behavior (including error semantics), none is hand-waved.

## Definition of done
- [ ] Transport interface sketch + per-resource binding table for all 18 methods
- [ ] All four misfits have a dedicated design section with a recommendation
- [ ] Boot/mode-selection seam defined, web build behavior provably unchanged
- [ ] Mode-aware Vite build options laid out (G-12 addressed)
- [ ] Contract-test strategy covers both transports
- [ ] Tree clean outside this folder; gaps in-file only
