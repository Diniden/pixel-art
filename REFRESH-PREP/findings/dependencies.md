# Dependency Audit

**Task:** P1-01 · **Measured:** 2026-08-16 · **Toolchain:** `bun 1.3.5` (verified: `bun --version` → `1.3.5`)

## Summary

The dependency tree is **moderately stale but remarkably clean**. Nothing is abandoned,
nothing is security-blocked, and the two lockfiles (`client/bun.lock`, `server/bun.lock`)
resolve to versions within their declared semver ranges — there is no dangerous drift, only
range-drift (e.g. `vite ^5.4.10` installed as `5.4.21`). The upgrades that actually matter
are three: **React 18.3 → 19.2** (which this codebase is unusually well-positioned for — a
grep for every React 19 removal found **zero** occurrences), **Vite 5 → 7** (required, because
Vitest 4 and Storybook's Vitest addon will not install against Vite 5), and **Zustand 4 → 5**
(which we should *skip entirely* — the locked decision is to migrate to MobX, so upgrading
Zustand is throwaway work).

Two structural problems outweigh any version number. First, **`bunfig.toml` sets
`[install.lockfile] save = false`**, so Bun never writes or updates lockfiles — every
`bun install` is effectively unpinned and the two committed `bun.lock` files are frozen
snapshots that no longer track `package.json`. Second, **`client` does not typecheck**:
`bunx tsc --noEmit` exits 2 with 29 errors, 9 of them genuine type errors (not merely unused
vars). Both must be fixed before any upgrade, because otherwise there is no green baseline to
regress *against* — you cannot tell an upgrade-induced failure from a pre-existing one.

Also worth flagging: **neither `npm` nor `node` is on PATH** (`which node` → not found), yet
`server/package.json:8` declares `"start": "node dist/index.js"`. That script cannot run on
this machine today.

---

## Upgrade table

Legend — `SAFE` = patch/minor, no known breaking change · `BREAKING` = major requiring
migration work · `BLOCKED` = cannot upgrade yet · `SKIP` = do not upgrade, being replaced.

`Declared` is from `package.json`; `Installed` is from the actual `node_modules/<pkg>/package.json`.

### Root workspace (`/package.json`)

| Workspace | Package | Declared | Installed | Latest | Class | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| root | `mprocs` | `^0.8.3` | 0.8.3 | 0.9.6 | SAFE | Dev-only process runner (`mprocs.yaml`). 0.x minor bump; only consumer is `package.json:7` `dev` script. Low value, low risk. |
| root | `sharp` | `0.34.5` | 0.34.5 | 0.35.3 | **BLOCKED** | **Dead dependency.** `grep -rn "sharp" client/src client/lib package.json` finds only the declaration itself. Nothing at root imports it. See "sharp mismatch" below — recommend **removal**, not upgrade. |

Root has **no `bun.lock`** (`find . -maxdepth 2 -name "bun.lock*"` → only `client/bun.lock`,
`server/bun.lock`). Root deps are entirely unpinned.

### Client workspace (`/client/package.json`)

| Workspace | Package | Declared | Installed | Latest | Class | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| client | `react` | `^18.3.1` | 18.3.1 | 19.2.8 | **BREAKING** | Major. See "React 19 verdict" — **recommend**. Zero blocking patterns found in `client/src`. |
| client | `react-dom` | `^18.3.1` | 18.3.1 | 19.2.8 | **BREAKING** | Must move in lockstep with `react`. Entry point `client/src/main.tsx:2` already uses `createRoot` from `react-dom/client` — the React 18 API that React 19 keeps. |
| client | `@types/react` | `^18.3.12` | 18.3.28 | 19.2.18 | **BREAKING** | Must move with `react`. This is where most React 19 friction actually lands (JSX namespace moved out of global scope) — but `grep -rn "JSX.Element\|JSX.IntrinsicElements" client/src` → **NONE**, so the usual breakage does not apply here. |
| client | `@types/react-dom` | `^18.3.1` | 18.3.7 | 19.2.4 | **BREAKING** | Must move with `@types/react`. |
| client | `zustand` | `^4.5.2` | 4.5.7 | 5.0.15 | **SKIP** | Do **not** upgrade. Locked decision is Zustand → MobX. Only one file imports it: `client/src/store/index.ts:1` `import { create } from "zustand"`. Upgrading to v5 then deleting it is wasted effort. Remove when MobX lands. |
| client | `lucide-react` | `^0.575.0` | 0.575.0 | 1.31.0 | SAFE | 0.x → 1.x is nominally a major, but the package reached 1.0 as a stability declaration. Peer range at **both** 0.575.0 and 1.31.0 is `react: ^16.5.1 \|\| ^17 \|\| ^18 \|\| ^19` — verified via registry. React-19-ready either way. Icon-name changes are the only real risk; audit is out of my scope (icons are `client/src` component-level). |
| client | `vite` | `^5.4.10` | 5.4.21 | 8.2.1 | **BREAKING** | **Recommend 7.3.6, not 8.2.1.** Vite 8 is the rolldown-based rewrite. Vitest 4 requires `vite ^6 \|\| ^7 \|\| ^8` — Vite 5 is excluded, so v5 cannot stay. `vite@7.3.6` engines: `node ^20.19.0 \|\| >=22.12.0`. |
| client | `@vitejs/plugin-react` | `^4.3.3` | 4.7.0 | 6.0.5 | **BREAKING** | **Pin 5.2.0, not 6.0.5.** Verified peer of `6.0.5` is `vite: "^8.0.0"` **only** — installing 6.x forces Vite 8. `5.2.0` peer is `vite: ^4.2 \|\| ^5 \|\| ^6 \|\| ^7`, which matches the recommended Vite 7. |
| client | `typescript` | `~5.6.2` | 5.6.3 | 7.0.2 | **BLOCKED at 5.9.3** | TS 7 is out but **`typescript-eslint@8.67.0` peer is `typescript: ">=4.8.4 <6.1.0"`** (verified via registry) — TS 6 and 7 are both outside the supported window. Upgrade to **5.9.3**, the top of the 5.x line. |
| client | `eslint` | `^9.13.0` | 9.39.3 | 10.8.1 | **BLOCKED at 9.39.5** | ESLint 10 is latest, and the `maintenance` dist-tag is `9.39.5`. `typescript-eslint@8.67.0` does list `eslint: ^8.57 \|\| ^9 \|\| ^10`, so 10 is *technically* allowed — but see Open questions. Recommend staying on the 9.x maintenance line (`9.39.5`) for the refresh. |
| client | `@eslint/js` | `^9.13.0` | 9.39.3 | 10.0.1 | SAFE→9.39.5 | Must match `eslint` major. |
| client | `eslint-plugin-react-hooks` | `^5.0.0` | 5.2.0 | 7.1.1 | **BREAKING** | v7 peer is `eslint: ^3…^10` — compatible with ESLint 9. Major bump adds the React Compiler ruleset and turns rules on by default; expect a **large** new-warning wave across `client/src`. Since there is no config today, adopt 7.1.1 directly. |
| client | `eslint-plugin-react-refresh` | `^0.4.14` | 0.4.26 | 0.5.4 | SAFE | 0.x minor. Dev-only HMR lint rule. |
| client | `globals` | `^15.11.0` | 15.15.0 | 17.11.0 | SAFE | Data-only package (global identifier lists). Two majors, but consumed only by the flat config we are about to write, so there is no existing config to break. |
| client | `typescript-eslint` | `^8.11.0` | 8.56.1 | 8.67.0 | SAFE | Same major. **This package is the ceiling on TypeScript** (`<6.1.0`) and the floor under ESLint 8.57. |

### Server workspace (`/server/package.json`)

| Workspace | Package | Declared | Installed | Latest | Class | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| server | `express` | `^4.21.0` | 4.22.1 | 5.2.1 | **BREAKING (low actual risk)** | Express 5's breaking changes are overwhelmingly about path-to-regexp route syntax (`*`, `:p?`, regex routes). I grepped every route definition in `server/src` — **all 7 are literal string paths** with no wildcards or optional params (`server/src/index.ts:19,20,24,27,28,29,32`). Also verified absent: `req.param(`, `app.del(`, `res.sendfile`, `res.send(<status>)`. See detail below. |
| server | `sharp` | `^0.33.5` | 0.33.5 | 0.35.3 | **BREAKING** | Real, in-use dependency: `server/src/routes/export.ts:10` `import sharp from "sharp"`. 0.33 → 0.35 crosses two 0.x majors (libvips upgrades, prebuilt-binary and Node-engine changes). This is the *only* sharp that matters. |
| server | `cors` | `^2.8.5` | 2.8.6 | 2.8.6 | SAFE | Already at latest via range. Used at `server/src/index.ts:19`. |
| server | `dotenv` | `^17.3.1` | 17.3.1 | 17.4.2 | SAFE | Same major, patch/minor only. |
| server | `@types/cors` | `^2.8.17` | 2.8.19 | 2.8.19 | SAFE | Already latest via range. |
| server | `@types/express` | `^4.17.21` | 4.17.25 | 5.0.6 | **BREAKING (coupled)** | Must move to `5.x` **only if** `express` moves to 5. Keep at 4.x otherwise — a v5 types package against a v4 runtime is a silent-drift trap. |
| server | `@types/node` | `^22.9.0` | 22.19.11 | 26.2.0 | **BREAKING** | Four majors behind. Note `vitest@4.1.10` peer is `@types/node: ^20 \|\| ^22 \|\| >=24` — **22 is still supported**, so this is not forced. `vitest@3.2.7` peer is `^18 \|\| ^20 \|\| >=22`. Bump only to match the actual runtime. |
| server | `tsx` | `^4.19.2` | 4.21.0 | 4.23.12 | SAFE | Same major. Note: **nothing invokes `tsx`** — `server/package.json:7` `dev` uses `bun --watch`. Candidate for removal. |
| server | `typescript` | `~5.6.2` | 5.6.3 | 7.0.2 | **BLOCKED at 5.9.3** | Keep aligned with client to avoid two TS versions in one repo. |

**Coverage check (Definition of done #1):** all 2 root + 15 client + 9 server = **26 declared
JS dependencies** appear above. No workspace-level dependency is omitted.

---

## Breaking upgrades — detail

### react / react-dom / @types/react 18.3.1 → 19.2.8

- **What breaks here: nothing found.** I grepped `client/src` for every removal and behavior
  change in the React 19 migration guide. Actual command output:

  ```
  cd client/src
  grep -rn "defaultProps" .              → NONE
  grep -rn "propTypes" .                 → NONE
  grep -rn 'ref="' .                     → NONE   (string refs)
  grep -rn "contextTypes\|getChildContext" . → NONE (legacy context)
  grep -rn "createFactory" .             → NONE
  grep -rn "ReactDOM.render\|ReactDOM.hydrate\|unmountComponentAtNode\|findDOMNode" . → NONE
  grep -rn "react-test-renderer" .       → NONE
  grep -rnE "useRef<[^>]*>\(\)" .        → NONE   (React 19 requires an argument)
  grep -rn "useRef()" .                  → NONE
  grep -rn "JSX.Element\|JSX.IntrinsicElements" . → NONE
  ```

- **Entry point is already React-18-modern:** `client/src/main.tsx:2,6` uses
  `createRoot(...).render(<StrictMode>…)`, which React 19 keeps unchanged.
- **No `forwardRef` anywhere** (`grep -rn "forwardRef" client/src` → NONE), so the React 19
  change making `ref` a regular prop is a pure no-op here. 111 `useRef` call sites across 23
  files, all with an initial argument; 52 `ref={...}` JSX attachments, all to DOM elements.
- **`createPortal` is used** at `client/src/components/ObjectLibrary/ObjectLibrary.tsx:2,152,605`
  — unchanged in React 19.
- **Files that must change:** `client/package.json:12-13` (deps) and `client/package.json:17-18`
  (`@types/react*`). Type-level fallout, if any, will surface in the 23 `useRef` files above;
  most likely candidates are the largest consumers — `client/src/components/Canvas/Canvas.tsx`
  and `client/src/components/Canvas/LightingCanvas.tsx`.
- **Migration effort: S.** This is a version bump plus a typecheck, not a refactor.
- **Recommended wave:** early — a foundation wave, before Storybook/Vitest are installed, so
  the test harness is built against its final React version and never needs re-validation.

### vite 5.4.21 → 7.3.6

- **What breaks here:** almost nothing at the app level. `client/vite.config.ts` uses only
  `defineConfig`, `loadEnv`, `plugins`, `envDir`, and `server.proxy` — all stable across
  5→6→7. The forcing function is not features, it is peers: **`vitest@4.1.10` requires
  `vite ^6 || ^7 || ^8`**, so Vite 5 cannot remain if we want a current Vitest.
- **Files that must change:** `client/vite.config.ts` (verify only), `client/package.json:26`
  (`vite`), `client/package.json:22` (`@vitejs/plugin-react` must go to `5.2.0` in the same
  commit — `4.7.0` also allows Vite 7, but `6.0.5` would force Vite 8).
- **Environment risk:** `vite@7.3.6` declares `engines: node ^20.19.0 || >=22.12.0`. **`node`
  is not on PATH on this machine** — Bun satisfies the runtime, but this constraint will bite
  in CI or on another developer's machine.
- **Migration effort: S–M.**
- **Recommended wave:** the same foundation wave as React 19, and *before* the tooling wave.

### @vitejs/plugin-react 4.7.0 → 5.2.0 (not 6.0.5)

- **What breaks here:** nothing in app code — the plugin is invoked bare as `react()` at
  `client/vite.config.ts:2,12`.
- **Why not 6.0.5:** registry-verified peer of `6.0.5` is `{"vite": "^8.0.0"}` — a hard,
  single-major pin. Its dependency set also moved to `@rolldown/pluginutils`, with optional
  peers `@rolldown/plugin-babel` and `babel-plugin-react-compiler`. Taking plugin-react 6
  means taking the whole rolldown-based Vite 8 stack.
- **Migration effort: S.** **Recommended wave:** with the Vite upgrade.

### express 4.22.1 → 5.2.1

- **What breaks here:** the standard Express 5 hazards are all **absent**. Every route is a
  literal path — verified across `server/src/index.ts:19,20,24,27,28,29,32` and the three
  routers (`server/src/routes/project.ts`, `export.ts`, `ai.ts`). No wildcard `*`, no `:param?`,
  no RegExp routes, so the path-to-regexp v8 rewrite has no surface to break. Grep for
  `req.param(`, `app.del(`, `res.sendfile`, `res.json(status`, `res.send(4xx/5xx)` → no matches.
- **Residual risks not detectable by grep:** (a) in Express 5 `res.status(...).send()` of a
  *number* is no longer treated as a status; (b) rejected promises in async handlers now
  forward to the error middleware automatically, which can surface previously-swallowed errors
  in `server/src/routes/export.ts` (927 lines, the heaviest handler file); (c) `req.query` is a
  getter and no longer assignable.
- **Files that must change:** `server/package.json:6` (`express`) and `server/package.json:14`
  (`@types/express` → `^5.0.6`, in the same commit).
- **Migration effort: S.** **Recommended wave:** a server wave; fully independent of all client
  work — zero file overlap, so it can run in parallel with the entire client track.

### sharp 0.33.5 → 0.35.3 (server)

- **What breaks here:** one file — `server/src/routes/export.ts:10` is the only `import sharp`
  in the repo. 0.33 → 0.35 crosses two 0.x majors: libvips is upgraded (subtle resampling /
  output-encoding differences), prebuilt binaries are repackaged, and the minimum Node engine
  rises. For a **pixel-art** exporter, output-encoding drift is the material risk: a change in
  PNG encoding or resampling would silently alter exported sprites rather than throw.
- **Detection:** byte-compare exported PNGs before and after against `server/exports/`.
- **Migration effort: M** (the upgrade is minutes; validating pixel-exact output is the work).
- **Recommended wave:** server wave, and **only with a golden-image comparison in place**.

### eslint-plugin-react-hooks 5.2.0 → 7.1.1

- **What breaks here:** no application file breaks — but there is *no ESLint config today*
  (proven below), so nothing is currently enforced. v7 ships the React Compiler rules and
  enables more by default; the first run will produce a large finding count across the 69
  `.ts`/`.tsx` files in `client/src`.
- **Files that must change:** `client/eslint.config.js` (new file), `client/package.json:20`.
- **Migration effort: M** — sizing is driven by how many findings you choose to fix versus
  downgrade to warnings.
- **Recommended wave:** the tooling wave.

### @types/node 22.19.11 → 26.2.0 (server)

- **What breaks here:** not forced by anything. `vitest@4.1.10` peer accepts `^22`. Upgrading
  narrows Node globals typing and can surface new errors in `server/src/backup.ts` (441 lines)
  and `server/src/routes/export.ts` (fs/stream-heavy). `server` currently typechecks **clean**
  (`bunx tsc --noEmit` in `server/` → 0 errors), so this upgrade is the one most likely to
  *break* a currently-green workspace.
- **Migration effort: S.** **Recommended wave:** server wave, last — or defer.

---

## sharp version mismatch — resolution

| Location | Declared | Installed | Actually imported? |
| --- | --- | --- | --- |
| root `package.json:18` (devDependency) | `0.34.5` (exact) | 0.34.5 | **No** |
| `server/package.json:9` (dependency) | `^0.33.5` | 0.33.5 | **Yes** — `server/src/routes/export.ts:10` |

Command run: `grep -rn "sharp" client/src client/lib mprocs.yaml package.json` → the only hit
outside `server/` is the root `package.json:18` declaration itself.

**Verdict: they do not need to align — the root one should be deleted.** It is an unused,
exactly-pinned, ~100 MB-class native dependency in a workspace that imports nothing. Removing
it eliminates the mismatch entirely and removes a native-binary build from root installs. The
server copy is the real one and should be upgraded on its own schedule.

**Caveat (non-blocking):** root `package.json:11` `install:all` runs `bun install` in all three
workspaces, and `ai-service/setup.sh` is a separate pip path — so nothing in the build depends
on root `sharp`. If it was added to force a single native binary download for a since-removed
root script, that intent is no longer expressed anywhere in the repo.

---

## React 19 verdict

### **RECOMMEND — upgrade to React 19.2.8, and do it early.**

**Evidence for:**

1. **Zero blocking patterns.** Every React 19 removal grepped clean across `client/src` (full
   command list in the Breaking-upgrades detail above): no `defaultProps`, no `propTypes`, no
   string refs, no legacy context, no `createFactory`, no `ReactDOM.render`, no `findDOMNode`,
   no `react-test-renderer`, no argument-less `useRef`.
2. **No `forwardRef` in the codebase at all.** The single largest React 19 refactor category
   simply does not exist here.
3. **Modern entry point already.** `client/src/main.tsx:6` uses `createRoot`.
4. **No global `JSX.*` namespace usage** — the most common `@types/react@19` compile break
   does not apply.
5. **`lucide-react` is ready at both ends.** Registry-verified peer on the installed `0.575.0`
   *and* on `1.31.0` is `react: ^16.5.1 || ^17.0.0 || ^18.0.0 || ^19.0.0`.
6. **Everything we plan to add is React-19-ready** (all registry-verified):
   - `@testing-library/react@16.3.2` → peer `react: ^18.0.0 || ^19.0.0`
   - `mobx-react-lite@5.0.0` → peer `react: ^18 || ^19`, `mobx: ^7.0.0`
   - `@storybook/react-vite@9.1.20` → peer `react: ^16.8 || ^17 || ^18 || ^19.0.0-beta`
   - `@storybook/react-vite@10.5.8` → peer `react: ^16.8 || ^17 || ^18 || ^19.0.0`
7. **Timing.** The refresh will rewrite the store layer (Zustand → MobX) and add a Storybook +
   Vitest harness from scratch. Doing React 19 *after* that means re-validating every new story
   and test against a new React. Doing it *first* means the harness is authored once, against
   its final target.

**The one caveat:** React 19 tightens StrictMode double-invocation and ref-cleanup semantics.
`client/src/main.tsx:7` wraps the app in `<StrictMode>`, and there are **111 `useRef` sites
across 23 files**, concentrated in canvas code (`client/src/components/Canvas/Canvas.tsx`,
`client/src/components/Canvas/LightingCanvas.tsx`). Imperative canvas effects with manual
listener attachment are exactly where StrictMode changes bite. This is a *runtime* risk, not a
compile risk, and it is not detectable by grep — it needs a manual smoke test of the canvas.

**Verdict stands: recommend.** The static surface is as clean as a React 18 codebase can be.
Gate it on a manual canvas smoke test rather than on further static analysis.

---

## New tooling compatibility matrix

**This is the install list for the REFRESH tooling task.** Every version below is a real
published version (registry-verified today), and the whole set was **proven to resolve
together** — not assumed:

```
cd <scratchpad>/dryrun && bun install --dry-run
…
[8.73s] done
EXIT=0          # no peer-dependency warnings, no resolution errors
```

### Recommended stack — Vite 7 line (conservative, verified)

| Package | Version to install | Compatible with | Notes |
| --- | --- | --- | --- |
| `react` | `19.2.8` | — | Target React. |
| `react-dom` | `19.2.8` | react 19.2.8 | Lockstep. |
| `@types/react` | `19.2.18` | react 19 | Lockstep. |
| `@types/react-dom` | `19.2.4` | react-dom 19 | Lockstep. |
| `typescript` | `5.9.3` | ts-eslint 8.67 (`>=4.8.4 <6.1.0`) | **Do not take TS 7** — outside typescript-eslint's supported range. |
| `vite` | `7.3.6` | vitest 3/4, SB 9/10, plugin-react 5 | engines `node ^20.19.0 \|\| >=22.12.0`. |
| `@vitejs/plugin-react` | `5.2.0` | vite `^4.2 \|\| ^5 \|\| ^6 \|\| ^7` | **Not 6.0.5** — its peer is `vite ^8.0.0` only. |
| `mobx` | `7.0.0` | — | Locked decision. Latest major. |
| `mobx-react-lite` | `5.0.0` | peer `mobx ^7.0.0`, `react ^18 \|\| ^19` | Must be v5 — v4 pairs with mobx 6. |
| `vitest` | `3.2.7` | vite `^5 \|\| ^6 \|\| ^7.0.0-0`; engines `node ^18 \|\| ^20 \|\| >=22` | **3.2.7 = the `V3` dist-tag.** Chosen over 4.x for a wider Vite range and a settled ecosystem. |
| `@vitest/ui` | `3.2.7` | exact-match peer to vitest | Vitest pins its own subpackages exactly. |
| `@vitest/coverage-v8` | `3.2.7` | exact-match peer to vitest | Same. |
| `jsdom` | `30.0.1` | vitest peer `jsdom: "*"` | DOM environment. Alternative: `happy-dom@20.11.2` (faster, less complete). |
| `@testing-library/react` | `16.3.2` | peer `react ^18 \|\| ^19`, `@testing-library/dom ^10.0.0` | Requires `@testing-library/dom` as an **explicit** dependency — v16 no longer bundles it. |
| `@testing-library/dom` | `10.4.1` | RTL 16 peer | Must be installed explicitly; a common omission. |
| `@testing-library/jest-dom` | `7.0.1` | vitest 3 (`expect.extend`) | Custom matchers. |
| `@testing-library/user-event` | `14.6.4` | @testing-library/dom 10 | Interaction simulation. |
| `storybook` | `9.1.20` | the `v9` dist-tag | See "Storybook 9 vs 10" below. |
| `@storybook/react-vite` | `9.1.20` | peer `vite ^5 \|\| ^6 \|\| ^7`; `react ^16.8…^19.0.0-beta`; `storybook ^9.1.20` | Must exactly match the `storybook` version. |
| `eslint` | `9.39.5` | the `maintenance` dist-tag | See Open questions re: ESLint 10. |
| `@eslint/js` | `9.39.5` | eslint 9 | Match major. |
| `typescript-eslint` | `8.67.0` | peer `eslint ^8.57 \|\| ^9 \|\| ^10`; `typescript >=4.8.4 <6.1.0` | **The binding constraint on TypeScript.** |
| `eslint-plugin-react-hooks` | `7.1.1` | peer `eslint ^3…^10`; engines `node >=18` | Ships the React Compiler ruleset. |
| `eslint-plugin-react-refresh` | `0.5.4` | eslint 9 | Vite HMR correctness rule. |
| `globals` | `17.11.0` | flat config | Data-only. |
| `prettier` | `3.9.6` | — | Not currently installed anywhere. |
| `eslint-config-prettier` | `10.1.8` | eslint 9 | Disables ESLint rules that fight Prettier. Config-only. |
| `eslint-plugin-storybook` | `9.x` (match `storybook`) | peer `eslint >=8`, `storybook ^<same>` | Optional. **Pin to the same major as `storybook`** — the `10.5.8` on `latest` peers to `storybook ^10.5.8`. |

### Alternative stack — Vite 8 / Vitest 4 / Storybook 10 (also verified to resolve)

Also dry-run-verified (`dryrun2`, `EXIT=0`): `vite@8.2.1` + `@vitejs/plugin-react@6.0.5` +
`vitest@4.1.10` + `storybook@10.5.8` + `@storybook/react-vite@10.5.8` +
`@storybook/addon-vitest@10.5.8` + `@vitest/browser-playwright@4.1.10`.

**Not recommended for this refresh.** Reasons, all measured:

- Vite 8 is the **rolldown** bundler rewrite. `@vitejs/plugin-react@6.0.5` depends on
  `@rolldown/pluginutils` and peers `vite: "^8.0.0"` exclusively — no fallback path.
- `vitest@4.1.10` engines are `node ^20 || ^22 || >=24`, and its peers pin every `@vitest/*`
  subpackage to an exact `4.1.10`.
- `@storybook/addon-vitest@10.5.8` requires `@vitest/browser` **and** `@vitest/browser-playwright`
  — meaning a Playwright browser download, a real cost for a project that has **zero tests today**.
- `storybook@10.5.8` lists a `vite-plus` peer (`^0.1.15 || ^0.2.0`), an additional moving part.

Migrating a 69-file, zero-test client onto three simultaneous ecosystem rewrites maximizes the
chance that a failure is a *tooling* failure rather than a *migration* failure. Take the Vite 7
stack now; Vite 8 / Vitest 4 / SB 10 is a clean follow-up once tests exist to prove it.

### Storybook 9 vs 10

Both are live: `dist-tags` for `storybook` → `latest: 10.5.8`, `v9: 9.1.20`, `v8: 8.6.18`.
The task brief said "Storybook 8/9" — **Storybook 8 is superseded** (`v8: 8.6.18`) and should
not be chosen. `@storybook/react-vite@9.1.20` peers `vite ^5 || ^6 || ^7`, which is exactly the
recommended Vite. Note its React peer is written `^19.0.0-beta`, which **does** satisfy
`19.2.8` under semver.

---

## Missing tooling

Every absence below was verified with `find client server -maxdepth 2 -iname "eslint*" -o
-iname ".eslintrc*" -o -iname "prettier*" -o -iname "vitest*" -o -iname ".storybook"`
(excluding `node_modules`) → **zero results**.

| Tool | State | What adding it requires |
| --- | --- | --- |
| **ESLint config** | **Missing — and the script is broken.** `client/package.json:9` declares `"lint": "eslint ."`, but running it fails: `ESLint couldn't find an eslint.config.(js\|mjs\|cjs) file.` The five ESLint packages are installed and unused. | A new `client/eslint.config.js` (flat). Must cover: TS parsing (`typescript-eslint` with `projectService` for type-aware rules), `eslint-plugin-react-hooks` (`recommended-latest`), `eslint-plugin-react-refresh` (`vite` preset), `globals.browser`, and ignores for `dist`, `node_modules`, `tsconfig.tsbuildinfo`, `client/lib` if it should be excluded. |
| **Prettier** | **Absent everywhere.** Not in any `package.json`; no `.prettierrc*`. | `prettier@3.9.6` + `eslint-config-prettier@10.1.8` (last in the flat-config array), a `.prettierrc`, a `.prettierignore`, and a `format` script. Note: `storybook@10` peers `prettier: ^2 \|\| ^3` — 3.9.6 satisfies it. |
| **Test runner** | **Absent.** No `vitest`, no `jest`, no test script in any of the three `package.json` files. Zero test files. | `vitest` + `jsdom` + the three `@testing-library/*` packages, a `test` config block in `client/vite.config.ts` (or a separate `vitest.config.ts`), a `setupFiles` entry importing `@testing-library/jest-dom/vitest`, and `test` / `test:watch` scripts. |
| **Storybook** | **Absent.** No `.storybook/` directory in any workspace. | `bunx storybook@9.1.20 init` scaffolds `.storybook/main.ts` + `preview.ts`. Wire `staticDirs` to `client/public`, and import `client/src/index.css` in `preview.ts` — otherwise stories render unstyled, since all 34 CSS files are global. |
| **CI** | **Absent.** No `.github/`, no CI config at root. | Out of scope for this audit; flagged so task 09 knows nothing enforces any of the above. |
| **`server` lint/test** | **Nothing at all.** `server/package.json` has only `dev` / `build` / `start` — no `lint`, no `test`, and no ESLint packages even installed (unlike client, which at least has the packages). | Server needs its own flat config (Node globals, no React plugins) or a shared root config. Given `server/src` is 2,057 lines across 5 files, a root-level shared config is the cheaper path. |

**Two additional infrastructure defects found while verifying the above:**

1. **Lockfiles are disabled repo-wide.** `bunfig.toml`:
   ```toml
   [install.lockfile]
   # Prevent Bun from creating/updating lockfiles (bun.lock, bun.lockb)
   save = false
   ```
   `client/bun.lock` and `server/bun.lock` are committed but **frozen** — Bun will not update
   them, so they drift from `package.json` silently, and root has no lockfile at all. Any
   multi-package upgrade performed under this setting is unreproducible. **This must be
   resolved before the first upgrade lands**, or "it worked on my machine" is unfalsifiable.

2. **`client` does not typecheck.** Actual output of `bunx tsc --noEmit` in `client/`:
   ```
   exit=2
   total errors: 29
   19  error TS6133   (declared but never read)
    5  error TS2322   (type not assignable)
    2  error TS2367   (comparison with no type overlap — likely real bugs)
    1  error TS6192   (all imports unused)
    1  error TS2345   (argument type mismatch)
    1  error TS2339   (property does not exist)
   ```
   The 9 non-unused errors are genuine, concentrated in:
   - `client/src/components/AIInterpolateModal/AIInterpolateModal.tsx:692,720,736,785,815` (5)
   - `client/src/components/Canvas/drawingUtils.ts:438` — `TS2367`, compares `Pixel` to `number`
   - `client/src/components/ReferenceImagePanel/ReferenceImagePanel.tsx:116` — `TS2367`, compares an RGBA object to `number`
   - `client/src/types/index.ts:967` — `TS2339`, `lightGridMode` missing on `CompactUIState`
   - `client/lib/versions/v1.ts:210` — `TS2322`

   By contrast **`server` typechecks clean** (`bunx tsc --noEmit` in `server/` → 0 errors).
   The two `TS2367`s are the interesting ones: comparing a struct to a number is almost
   certainly a live bug, not a typing artifact.

   Note also that `client/package.json:8` runs `tsc -b` (build mode), but `client/tsconfig.json`
   declares **no `references`** and there is no `tsconfig.node.json` — `tsc -b` on a
   non-composite root project is a misuse that happens to work.

---

## ai-service (Python) — report only

Python on PATH: `python3 --version` → **Python 3.11.5**.

`ai-service/requirements.txt` (9 deps, **all unpinned**):

```
fastapi
uvicorn[standard]
torch
torchvision
Pillow
numpy
opencv-python
httpx
jinja2
```

`ai-service/requirements-proxy.txt` (4 deps, **all unpinned**):

```
fastapi
uvicorn[standard]
httpx
jinja2
```

**Findings:**

| Observation | Risk |
| --- | --- |
| **Zero version constraints — not one `==`, `>=`, or `~=` in either file.** | **High.** Every `pip install` resolves to whatever is latest that day. Two developers, or the same developer a month apart, get different stacks. This is strictly worse than the JS side, which at least has semver ranges. |
| `torch` / `torchvision` unpinned | **Highest single risk.** These are ~2 GB CUDA-linked wheels with a strict torch↔torchvision compatibility table. An unpinned pair can install a mismatched combination that imports but fails at runtime. |
| `numpy` unpinned | The NumPy 2.x transition broke ABI compatibility with C extensions built against 1.x. Unpinned `numpy` + unpinned `opencv-python` + unpinned `torch` is the classic ABI-mismatch triangle. |
| `opencv-python` unpinned | Large binary wheel; platform-specific. |
| **Two divergent dependency sets, selected at runtime by hardware.** `ai-service/setup.sh:8` branches on `nvidia-smi`: GPU → `requirements.txt` + `gdown` + `setup_model.sh`; no GPU → `requirements-proxy.txt` and proxy mode via `AI_REMOTE_URL`. | Medium. A reasonable design, but it means the dev machine (this one — Darwin/arm64, no NVIDIA) **never installs `torch` at all** and only ever exercises the proxy path. GPU-path dependency breakage is invisible locally. |
| `gdown` installed imperatively in `setup.sh:10`, not declared in either requirements file | Low, but it is an undeclared dependency. |
| No `venv`/`uv`/`poetry`/`pip-tools`; `setup.sh` calls bare `pip install` into the ambient environment | Medium. No isolation from system Python. |
| No lockfile, no `pyproject.toml`, no `requirements*.lock` | Reinforces the above. |

**Recommendation (report only, per task scope — do not act in this refresh):** at minimum,
`pip freeze` the currently-working GPU environment into a `requirements.lock` so the working
combination is recoverable. Full `uv`/`pip-tools` adoption is a separate initiative from a
JS-focused refresh, and `ai-service/` has its own lifecycle (MASTER.md line 63).

---

## Recommended upgrade sequencing

```
STEP 0  ── Baseline (BLOCKING — nothing else may start)
          0a. Re-enable lockfiles (bunfig.toml) + regenerate all three
          0b. Get `client` to tsc-clean (29 errors → 0)
                    │
      ┌─────────────┴─────────────┐
      │                           │
STEP 1 (client track)      STEP 1' (server track)   ← fully parallel, zero file overlap
  1a. React 18 → 19          1'a. express 4 → 5 (+ @types/express 5)
  1b. Vite 5 → 7             1'b. sharp 0.33 → 0.35  [needs golden images]
      + plugin-react 5.2.0   1'c. Remove unused root `sharp`; remove unused `tsx`
  1c. TypeScript 5.6 → 5.9   1'd. @types/node 22 → 26  (optional; defer OK)
      │
STEP 2  ── ESLint flat config + Prettier   (client + server + root)
      │
STEP 3  ── Vitest + Testing Library harness   (needs Vite 7 from 1b)
      │
STEP 4  ── Storybook 9.1.20                   (needs Vite 7 + React 19)
      │
STEP 5  ── MobX 7 + mobx-react-lite 5 installed; remove `zustand`
           (dependency-only here; the migration itself belongs to task 06)
```

**Can run in parallel:**
- The whole **client track (1a–1c)** and the whole **server track (1'a–1'd)** — disjoint
  file sets, verified: client work touches only `client/**`, server work only
  `server/**` + root `package.json`.
- Within step 1, **1a (React) and 1c (TypeScript)** are independent of each other; both must
  precede step 3.
- **Step 2 (lint/format)** is independent of steps 3–4 and can overlap them, *except* that it
  edits `client/package.json`, so it must not run concurrently with another `package.json` writer.

**Must be strictly sequential:**
- Step 0 before everything (no green baseline otherwise).
- 1b (Vite 7) before step 3 (Vitest peer range excludes Vite 5).
- 1a (React 19) + 1b before step 4 (Storybook is authored against final React/Vite).
- Step 5 last among dependency changes, so MobX arrives on a fully-upgraded, test-covered base.

**Never do:** upgrade `zustand` to 5.0.15. It is being deleted.

---

## Proposed work items

| Title | Touches (explicit files/dirs) | Depends on | Effort | Risk |
| --- | --- | --- | --- | --- |
| **D1 — Re-enable lockfiles & establish reproducible installs** | `bunfig.toml`, `client/bun.lock`, `server/bun.lock`, `bun.lock` (new, root), `.gitignore` | — | S | Regenerated lockfiles may resolve range-drift to newer patches than currently installed, changing behavior before any intentional upgrade. Detect: `bunx tsc --noEmit` in `client/` and `server/` plus an app smoke test immediately after regeneration. |
| **D2 — Clear the client TypeScript baseline (29 → 0 errors)** | `client/src/components/AIInterpolateModal/AIInterpolateModal.tsx`, `client/src/components/Canvas/drawingUtils.ts`, `client/src/components/ReferenceImagePanel/ReferenceImagePanel.tsx`, `client/src/types/index.ts`, `client/lib/versions/v1.ts`, `client/src/components/AnchorGrid/AnchorGrid.tsx`, `client/src/components/Canvas/LightingCanvas.tsx`, `client/src/components/ColorPicker/ColorPicker.tsx`, `client/src/components/FrameTagsModal/FrameTagsModal.tsx`, `client/src/components/FrameTimeline/TimelineView.tsx`, `client/src/components/FrameTimeline/VariantView.tsx`, `client/src/components/HeightMapModal/HeightMapModal.tsx`, `client/src/components/LayerPanel/LayerPanel.tsx`, `client/src/components/PreviewModal/PreviewModal.tsx`, `client/src/components/VariantSelectModal/VariantSelectModal.tsx`, `client/src/utils/lightingRenderer.ts` | — (can run parallel to D1) | M | **The 2 `TS2367`s are probably live bugs** (`Pixel` vs `number`; RGBA object vs `number`) — "fixing the type" could mask, or expose, real behavior. Detect: `bunx tsc --noEmit` exits 0, plus manual canvas draw + reference-image smoke test. **Collision warning: touches many files that tasks 02/03 will also want.** |
| **D3 — React 18 → 19** | `client/package.json` | D1, D2 | S | StrictMode ref-cleanup semantics change; 111 `useRef` sites across 23 files, canvas-heavy. Compile-clean is likely; runtime is the risk. Detect: `bunx tsc --noEmit` + manual canvas/lighting-studio smoke test. |
| **D4 — Vite 5 → 7 + @vitejs/plugin-react 4 → 5.2.0** | `client/package.json`, `client/vite.config.ts` | D1 | S | Dev-server proxy config (`/api`, `/exports`) could regress → client can't reach server. Detect: `bunx vite build` exits 0, then `bun run dev:client` and confirm a real `/api` request succeeds. |
| **D5 — TypeScript 5.6 → 5.9 (both workspaces)** | `client/package.json`, `server/package.json`, `client/tsconfig.json`, `server/tsconfig.json` | D2 | S | Newer TS finds new errors in previously-passing code — notably in the currently-clean `server`. Detect: `bunx tsc --noEmit` exits 0 in both. Also fix the `tsc -b`-without-`references` misuse at `client/package.json:8` here. |
| **D6 — ESLint flat config (client + server) + Prettier** | `client/eslint.config.js` (new), `server/eslint.config.js` (new), `client/package.json`, `server/package.json`, `.prettierrc` (new, root), `.prettierignore` (new, root) | D5 (ts-eslint pins TS `<6.1.0`) | M | `eslint-plugin-react-hooks@7` will emit a large first-run finding set across 69 files; a Prettier first-run reformat would touch every file and destroy diff readability. **Do not run `prettier --write` repo-wide in the same commit as any other work item.** Detect: `bunx eslint .` exits 0. |
| **D7 — Vitest + Testing Library harness** | `client/package.json`, `client/vitest.config.ts` (new) or `client/vite.config.ts`, `client/src/test/setup.ts` (new) | D3, D4 | M | Zero tests exist, so nothing proves the harness works. Ship at least one real passing test. Detect: `bunx vitest run` exits 0 and reports ≥1 passing test. |
| **D8 — Storybook 9.1.20 install & configure** | `client/package.json`, `client/.storybook/main.ts` (new), `client/.storybook/preview.ts` (new), `client/package.json` scripts | D3, D4 (and D7 if the Vitest addon is wanted) | M | All 34 client CSS files are global — stories render unstyled unless `client/src/index.css` is imported in `preview.ts`. Detect: `bunx storybook build` exits 0 and produces `storybook-static/`. |
| **D9 — Express 4 → 5 (+ @types/express 5)** | `server/package.json`, `server/src/index.ts`, `server/src/routes/project.ts`, `server/src/routes/export.ts`, `server/src/routes/ai.ts` | D1 | S | Async handlers now auto-forward rejections to error middleware — previously-swallowed errors in `export.ts` (927 lines) may start surfacing as 500s. Detect: `bunx tsc --noEmit` in `server/` exits 0; `curl /health`; then exercise one route from each of the 3 routers. **Fully parallel with all client items — zero file overlap.** |
| **D10 — sharp 0.33 → 0.35 (server) with export golden-image check** | `server/package.json`, `server/src/routes/export.ts` | D1 | M | libvips upgrade can silently change PNG encoding/resampling — a pixel-art exporter's worst failure mode, because it does not throw. Detect: byte-compare exported PNGs against pre-upgrade goldens; **not** merely "the export endpoint returned 200". |
| **D11 — Remove dead dependencies (root `sharp`, server `tsx`)** | `package.json` (root), `server/package.json` | D1 | S | If some undocumented workflow relies on the root native binary or on `tsx`, it breaks. Both verified unreferenced (`grep` for `sharp` outside `server/`; `tsx` absent from all scripts). Detect: `bun run install:all` then `bun run dev` starts all three mprocs procs. |
| **D12 — MobX 7 + mobx-react-lite 5 in, zustand out** | `client/package.json`, `client/src/store/index.ts` | D3, D7; and the store migration owned by task 06 | S (deps only) | Removing `zustand` before the MobX store exists breaks the build instantly — `client/src/store/index.ts:1` is the sole importer. **This item is dependency-manifest work only**; the code migration is task 06's. Detect: `bunx tsc --noEmit` exits 0 and `grep -rn "zustand" client/src` returns nothing. |
| **D13 — Pin `ai-service` Python deps (report → lockfile)** | `ai-service/requirements.txt`, `ai-service/requirements-proxy.txt`, `ai-service/requirements.lock` (new) | — | S | The GPU path cannot be validated on this machine (no NVIDIA — `setup.sh:8` takes the proxy branch), so pins would be authored blind. **Recommend deferring out of this refresh** unless a GPU machine is available. Detect: `pip install -r requirements-proxy.txt` succeeds and `python ai-service/proxy.py` starts. |

---

## Verification

| Work item | Command(s) | Manual checks |
| --- | --- | --- |
| D1 | `cd client && bun install --frozen-lockfile` · `cd server && bun install --frozen-lockfile` · `bun install --frozen-lockfile` (root) — each must exit 0 | Confirm `bunfig.toml` no longer sets `save = false`; confirm all three `bun.lock` files are tracked by git (`git status --porcelain \| grep bun.lock`). |
| D2 | `cd client && bunx tsc --noEmit` (must exit 0) | Draw on canvas; load a reference image; open the AI Interpolate modal. The two `TS2367` sites (`drawingUtils.ts:438`, `ReferenceImagePanel.tsx:116`) need a human decision: is the comparison dead code or a live bug? |
| D3 | `cd client && bunx tsc --noEmit && bunx vite build` (exit 0) | Full canvas smoke test under `<StrictMode>`: draw, undo/redo, layer toggle, lighting studio, timeline scrub. StrictMode double-invocation is not statically detectable. |
| D4 | `cd client && bunx vite build` (exit 0) | `bun run dev:client`, then confirm a `/api/...` request returns 200 (proxy at `client/vite.config.ts:16-25` intact) and `/exports` static serving works. |
| D5 | `cd client && bunx tsc --noEmit` · `cd server && bunx tsc --noEmit` (both exit 0) | Confirm both workspaces report the same `bunx tsc --version`. |
| D6 | `cd client && bunx eslint .` (exit 0) · `cd server && bunx eslint .` (exit 0) · `bunx prettier --check .` (exit 0) | Review the first `eslint-plugin-react-hooks@7` report before mass-fixing — decide error vs warn per rule. Keep the Prettier reformat in its own commit. |
| D7 | `cd client && bunx vitest run` (exit 0, ≥1 test passing) | Confirm the harness renders a real component with `@testing-library/react` — not just a trivial `expect(1).toBe(1)`. |
| D8 | `cd client && bunx storybook build` (exit 0, emits `storybook-static/`) | Run `bunx storybook dev` and confirm at least one story renders **with styles applied** (global CSS imported in `preview.ts`). |
| D9 | `cd server && bunx tsc --noEmit` (exit 0) · start server, then `curl -fsS localhost:3001/health` (exit non-zero on failure via `-f`) | Exercise one endpoint from each router — `routes/project.ts`, `routes/export.ts`, `routes/ai.ts` — and confirm error responses are still shaped correctly (Express 5 changes async error propagation). |
| D10 | `cd server && bunx tsc --noEmit` (exit 0) · then a golden comparison, e.g. `cmp <new-export>.png <golden>.png` (exits non-zero on any byte difference) | **Capture goldens BEFORE upgrading.** Export at multiple scales and with/without transparency, and byte-compare. A 200 response is not verification. |
| D11 | `bun run install:all` (exit 0) · `bun run build` (exit 0) | `bun run dev` and confirm all three mprocs processes (`server`, `client`, `ai-service`) start — see `mprocs.yaml`. |
| D12 | `cd client && bunx tsc --noEmit` (exit 0) · `grep -rn "zustand" client/src` **must return no matches** (`! grep -rq zustand client/src`) | Full app regression — this is a state-layer swap. Coordinate with task 06; this item alone must not land before the MobX store exists. |
| D13 | `cd ai-service && pip install -r requirements-proxy.txt` (exit 0) | Proxy path only can be checked here (no NVIDIA GPU). The GPU path (`requirements.txt`, `torch`/`torchvision`) **cannot be verified on this machine** and needs a GPU host. |

**Cross-cutting gate — run before and after every item above:**

```sh
cd client && bunx tsc --noEmit && bunx vite build && cd ../server && bunx tsc --noEmit
```

Exits non-zero on any failure. Note this gate is **red today** (client: 29 errors) — D2 is what
makes it usable, which is why D2 blocks the upgrade chain.

---

## Open questions

1. **`bunfig.toml` disables lockfiles — was that deliberate?** (`[install.lockfile] save = false`)
   **BLOCKING for D1**, and transitively for every upgrade item. If it was a workaround for a
   Bun bug or a merge-conflict annoyance, I need to know before undoing it. *Assumption if
   unanswered:* it was a convenience hack; re-enable it, since reproducible installs are
   non-negotiable during a multi-package upgrade.

2. **Are the two `TS2367` comparisons live bugs or dead code?** `client/src/components/Canvas/drawingUtils.ts:438`
   compares `Pixel` to `number`; `client/src/components/ReferenceImagePanel/ReferenceImagePanel.tsx:116`
   compares `{r,g,b,a}` to `number`. Both are always-false at runtime. **BLOCKING for D2** —
   the fix differs completely depending on the answer. *Assumption if unanswered:* treat as
   real bugs, fix the comparison rather than the type, and flag each in the PR.

3. **ESLint 9 or 10?** I recommend the `9.39.5` maintenance line because it is the settled
   target for `eslint-plugin-react-refresh` and the broader plugin ecosystem, even though
   `typescript-eslint@8.67.0` does accept `^10`. **Non-blocking for D6.** *Assumption:* pin
   ESLint 9.39.5; revisit after the refresh ships.

4. **Vite 7 or Vite 8?** I recommend 7.3.6 (rationale under "Alternative stack" — Vite 8 is the
   rolldown rewrite and drags in plugin-react 6, Vitest 4, Storybook 10, and a Playwright
   download). **Non-blocking for D4.** *Assumption:* Vite 7.3.6 + plugin-react 5.2.0 + Vitest
   3.2.7 + Storybook 9.1.20 — the combination I dry-run-verified resolves cleanly.

5. **Node is not on PATH, but `server/package.json:8` is `"start": "node dist/index.js"`.**
   Is production Node or Bun? This determines whether `vite@7`'s `node ^20.19 || >=22.12`
   engine constraint and `vitest`'s `node ^20 || ^22 || >=24` matter at all, and whether
   `server`'s `build` + `start` scripts are still live. **Non-blocking** (nothing in the
   upgrade chain depends on it) but it affects D5/D9 verification realism. *Assumption:*
   development is Bun-only; `start` is a stale production script.

6. **Does root `sharp@0.34.5` have an off-repo consumer?** Verified unreferenced by any code or
   script. **Non-blocking for D11.** *Assumption:* dead — remove it. Trivially reversible.

7. **Are `lucide-react` icon names stable across 0.575 → 1.31?** The peer range is React-19-safe
   at both versions, but renamed/removed icon exports are a real 1.0 hazard. Enumerating icon
   imports across `client/src` is component-audit territory (task 03), not dependency territory.
   **Non-blocking.** *Assumption:* upgrade `lucide-react` **last**, after `bunx tsc --noEmit` is
   green, so any missing export shows up as an unambiguous compile error.

8. **Is a golden-image corpus available for D10 (sharp)?** Byte-exact export comparison is the
   only honest verification for a pixel-art exporter, and `server/exports/` is gitignored
   (`.gitignore:20`). **BLOCKING for D10.** *Assumption if unanswered:* generate goldens as the
   first step of D10 itself, before touching the version.

9. **Should `ai-service` be pinned during this refresh at all?** The GPU dependency path cannot
   be exercised on this machine (`setup.sh:8` branches on `nvidia-smi`; this is Darwin/arm64).
   **Non-blocking.** *Assumption:* **defer D13** — report the risk, do not author pins that
   cannot be tested. Per MASTER.md line 63, `ai-service` has a separate lifecycle.

10. **D2 collides with tasks 02 and 03.** Clearing the TypeScript baseline touches 16 files in
    `client/src`, including `types/index.ts`, `AIInterpolateModal.tsx`, and `TimelineView.tsx` —
    all of which the store audit (02) and component-size audit (03) are likely to propose
    splitting or rewriting. **Non-blocking for me, but flagged for task 09's collision
    detection.** *Assumption:* D2 lands **first and alone**, before any refactor work item,
    precisely because everything else needs a green typecheck as its baseline.
