# 01 — Repo hygiene: exact version pinning, no lockfiles, build artifacts, and the `tsc -b` misuse

**Wave:** W0 · **Depends on:** nothing
**Touches:** `package.json` (root — dependency version pinning + scripts) · `client/package.json` (dependency version pinning + scripts) · `server/package.json` (dependency version pinning + scripts) · `server/bun.lock` (delete + untrack) · `.gitignore` · `client/tsconfig.tsbuildinfo` (untrack) · `client/tsconfig.json`
**Effort:** S

> **Note on the filename.** The file is still named `01-repo-hygiene-and-lockfiles.md` so that the cross-references in `MASTER.md` and tasks 03/04/05 keep resolving. Its *content* has been inverted by an owner decision: the project has **no lockfiles at all**, by policy. See "The lockfile policy" below.

## Objective

After this task, **every dependency in all three `package.json` files is pinned to an exact version** (no `^`, no `~`, no ranges), **no lockfile exists or is tracked anywhere in the repo**, `bunfig.toml`'s lockfile suppression is left untouched because it is deliberate, no machine-generated build artifact is tracked by git, and `client`'s type-check command is `tsc --noEmit` rather than the `tsc -b` build-mode misuse. Nothing about application behaviour changes; this task makes every later task's verification reproducible.

## Context

### The lockfile policy — OWNER DECISION (2026-08-16)

**The project never uses lockfiles, for Bun or for npm. Reproducibility comes from exact version pinning inside `package.json` itself.**

This inverts what an earlier draft of this plan assumed. `bunfig.toml` contains:

```toml
[install.lockfile]
# Prevent Bun from creating/updating lockfiles (bun.lock, bun.lockb)
save = false
```

**This is deliberate and must stay exactly as it is.** Do not delete the block, do not re-enable lockfile writing, do not run any command whose purpose is to regenerate a lockfile. There is no root `bun.lock` and there should never be one.

The reproducibility guarantee that lockfiles would have provided is instead supplied by **flexible-specifier elimination**: every `dependencies` and `devDependencies` entry must be an exact version string. `"react": "18.3.1"`, never `"react": "^18.3.1"`.

**Measured state at the time of writing: 22 flexible specifiers remain across the three manifests.**

| Manifest | Flexible specifiers to pin |
| --- | --- |
| `package.json` (root) | `mprocs ^0.8.3` |
| `client/package.json` | `lucide-react ^0.575.0` · `react ^18.3.1` · `react-dom ^18.3.1` · `zustand ^4.5.2` · `@eslint/js ^9.13.0` · `@types/react ^18.3.12` · `@types/react-dom ^18.3.1` · `@vitejs/plugin-react ^4.3.3` · `eslint ^9.13.0` · `eslint-plugin-react-hooks ^5.0.0` · `eslint-plugin-react-refresh ^0.4.14` · `globals ^15.11.0` · `typescript ~5.6.2` · `typescript-eslint ^8.11.0` · `vite ^5.4.10` |
| `server/package.json` | `cors ^2.8.5` · `dotenv ^17.3.1` · `express ^4.21.0` · `sharp ^0.33.5` · `@types/cors ^2.8.17` · `@types/express ^4.17.21` · `@types/node ^22.9.0` · `tsx ^4.19.2` · `typescript ~5.6.2` |

**A stray `server/bun.lock` exists and contradicts the policy.** It must be untracked (if tracked), deleted from the working tree, and prevented from returning by a `.gitignore` entry. Any `client/bun.lock` found in the working tree gets the same treatment.

### The rest of the hygiene work

1. **`client/tsconfig.tsbuildinfo` is tracked by git** (confirmed with `git ls-files`) and is **not** in `.gitignore`. It is 1,883 bytes of machine-generated incremental cache. This is the most likely cause of an earlier audit reporting 56 type errors where a clean run reports 29: `tsc -b` is incremental and reads that file, so a run against a stale buildinfo reports a different set than a run against a current one.

2. **`tsc -b` on a non-composite project.** `client/package.json` declares `"build": "tsc -b && vite build"`, but `client/tsconfig.json` declares **no `references`**, no `composite: true`, and there is no `tsconfig.node.json`. Build mode on a single non-composite root project is a misuse that happens to work. Measured: `bunx tsc --noEmit` and `bunx tsc -b` produce **byte-identical output** — 29 errors both ways, `diff` of the two captured outputs returns nothing.

3. **Nothing else is gitignored either.** `client/dist`, `client/coverage`, and `client/storybook-static` are all absent from `.gitignore`. The latter two do not exist yet but will after tasks 06 and 10.

4. **`node` and `npm` are not on PATH.** `which node` → not found. `server/package.json` declares `"start": "node dist/index.js"`, which cannot run on this machine. Development is Bun-only.

## Steps

1. **Leave `bunfig.toml` alone.** Confirm it still contains `[install.lockfile] save = false` and change nothing in it. If a previous run of this task deleted the block, restore it verbatim.

2. **Pin every dependency to an exact version.** Edit all three `package.json` files and strip every `^` and `~` from every specifier in `dependencies` and `devDependencies`, keeping the *same* version number that the range's base names (e.g. `^18.3.1` → `18.3.1`, `~5.6.2` → `5.6.2`). Work through the 22 specifiers in the Context table; then re-scan to catch anything the table missed:
   ```sh
   cd /Users/diniden/Desktop/self/pixel-art
   grep -nE '"[^"]+": *"[~^><*]|"\*"' package.json client/package.json server/package.json
   ```
   The scan must return **nothing** when this step is done. Do **not** change any version number — this step removes range operators only.

3. Install once in each workspace to confirm the pinned set resolves, and confirm no lockfile appears:
   ```sh
   cd /Users/diniden/Desktop/self/pixel-art && bun install
   cd /Users/diniden/Desktop/self/pixel-art/client && bun install
   cd /Users/diniden/Desktop/self/pixel-art/server && bun install
   cd /Users/diniden/Desktop/self/pixel-art && find . -maxdepth 2 -name 'bun.lock*' -not -path './node_modules/*'
   ```
   The `find` must print nothing. If it prints something, `bunfig.toml` was modified — revert it.

4. **Remove the stray lockfile.**
   ```sh
   cd /Users/diniden/Desktop/self/pixel-art
   git rm --cached server/bun.lock 2>/dev/null || true    # only if tracked
   rm -f server/bun.lock client/bun.lock bun.lock bun.lockb
   ```

5. Re-run the type-check in both workspaces to confirm the pinned resolutions did not change behaviour:
   ```sh
   cd /Users/diniden/Desktop/self/pixel-art/client && bunx tsc --noEmit   # expect exit 2, 29 errors
   cd /Users/diniden/Desktop/self/pixel-art/server && bunx tsc --noEmit   # expect exit 0
   ```
   If the client error count is anything other than 29, **stop and report** — pinning must not move any version, so a changed count means a version number was altered, and that must be investigated before task 02 uses "29" as its baseline.

6. Untrack the build cache: `git rm --cached client/tsconfig.tsbuildinfo`, then delete the file from the working tree.

7. Add to `.gitignore` (append, do not reorder existing entries):
   ```
   client/tsconfig.tsbuildinfo
   client/dist
   client/coverage
   client/storybook-static
   bun.lock
   bun.lockb
   package-lock.json
   yarn.lock
   ```

8. In `client/package.json`, change the `build` script from `tsc -b && vite build` to `tsc --noEmit && vite build`, and add a `typecheck` script: `tsc --noEmit`.

9. In `client/tsconfig.json`, confirm `"noEmit": true` is set. Add it if absent. Do **not** add `references` or `composite`.

10. In `server/package.json`, add a `typecheck` script: `tsc --noEmit`. Change `"start": "node dist/index.js"` to `"start": "bun dist/index.js"` (node is not on PATH; see Context item 4).

11. In the root `package.json`, add a `typecheck` script: `bun run --cwd client typecheck && bun run --cwd server typecheck`.

12. `git add .gitignore` plus the three `package.json` files and `client/tsconfig.json`, and stage the `server/bun.lock` deletion.

## Constraints

- **Never create a lockfile, in this task or in any later task.** `bunfig.toml`'s `[install.lockfile] save = false` is a standing project policy. `--frozen-lockfile` is meaningless in this repo and must never be used.
- **Do not change any dependency version number.** This task removes range operators; it does not upgrade. Tasks 03 and 04 own the upgrades, and they must also write exact versions.
- **Do not fix any TypeScript error in this task.** The client must still report exactly 29 errors when this task finishes. Task 02 owns fixing them, and it needs 29 as its starting count.
- Do not touch `client/src/`, `server/src/`, or `ai-service/`.
- `ai-service/requirements*.txt` is **out of scope** — Python pinning is deferred (its GPU path cannot be exercised on this machine).
- Use `bun` / `bunx` in every command. `npm` and `node` are not installed.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art
# 1. Zero flexible specifiers anywhere
! grep -qE '"[^"]+": *"[~^><*]|"\*"' package.json client/package.json server/package.json
# 2. Zero lockfiles anywhere in the repo
test -z "$(find . -maxdepth 2 -name 'bun.lock*' -o -maxdepth 2 -name 'package-lock.json' -o -maxdepth 2 -name 'yarn.lock' | grep -v node_modules)"
! git ls-files --error-unmatch server/bun.lock 2>/dev/null
# 3. bunfig.toml still suppresses lockfiles (deliberate)
grep -q 'save = false' bunfig.toml
# 4. A clean install works in all three workspaces without a lockfile
bun install && (cd client && bun install) && (cd server && bun install)
# 5. The buildinfo is untracked
! git ls-files --error-unmatch client/tsconfig.tsbuildinfo 2>/dev/null
# 6. Server still typechecks clean
cd server && bunx tsc --noEmit && cd ..
# 7. Client still reports exactly 29 errors (this task must not change the count)
cd client && test "$(bunx tsc --noEmit 2>&1 | grep -c 'error TS')" -eq 29
```

Manual checks:
- `bun run dev` starts all three mprocs processes (`server`, `client`, `ai-service`) — see `mprocs.yaml`.
- `git status --short` shows no `tsbuildinfo` and no `bun.lock` entry after running a build and an install.

## Definition of done

- [ ] `bunfig.toml` **still** contains `[install.lockfile] save = false`, unmodified.
- [ ] Every specifier in all three `package.json` files is an exact version — the flexible-specifier grep returns nothing (was **22**).
- [ ] `server/bun.lock` is deleted and untracked; no lockfile of any kind exists in the repo.
- [ ] `.gitignore` contains `bun.lock`, `bun.lockb`, `package-lock.json`, `yarn.lock`.
- [ ] `client/tsconfig.tsbuildinfo` is untracked and gitignored, along with `client/dist`, `client/coverage`, `client/storybook-static`.
- [ ] `client/package.json` `build` is `tsc --noEmit && vite build`; a `typecheck` script exists in both workspaces and at the root.
- [ ] `server/package.json` `start` uses `bun`, not `node`.
- [ ] The client type-check reports **exactly 29 errors** — unchanged by this task.
- [ ] `cd server && bunx tsc --noEmit` exits 0.
