# 04 — Server upgrade: Express 5, sharp 0.35, and dead-dependency removal

**Wave:** W2b · **Depends on:** 01, 03
**Touches:** `server/package.json` · `server/src/index.ts` · `server/src/routes/project.ts` · `server/src/routes/export.ts` · `server/src/routes/ai.ts` · `package.json` (root — dependency removal only)
**Effort:** M

## Objective

After this task the server runs Express 5.2.1 with matching `@types/express@5`, sharp 0.35.3 with **byte-verified export output**, and the two verified-dead dependencies (root `sharp`, server `tsx`) are gone. The server continues to typecheck clean and every route continues to respond.

## Context

This task is **fully parallel with the client track** — the file sets are disjoint. It touches only `server/**` plus a dependency removal in the root `package.json`.

### Express 4.22.1 → 5.2.1

The standard Express 5 hazards are all **absent here**, verified by grep across `server/src`:

- **Every route is a literal string path.** `server/src/index.ts:19,20,24,27,28,29,32` plus the three routers (`routes/project.ts`, `routes/export.ts`, `routes/ai.ts`). No wildcard `*`, no `:param?`, no RegExp routes — so the path-to-regexp v8 rewrite has no surface to break.
- `req.param(`, `app.del(`, `res.sendfile`, `res.json(status`, `res.send(<4xx/5xx>)` → **no matches**.

**Residual risks not detectable by grep** (check these manually):
- (a) In Express 5, `res.status(...).send()` of a *number* is no longer treated as a status.
- (b) Rejected promises in async handlers now forward to the error middleware automatically, which can surface **previously-swallowed errors** in `server/src/routes/export.ts` (927 lines, the heaviest handler file) as new 500s.
- (c) `req.query` is a getter and is no longer assignable.

`@types/express` must move to `^5.0.6` **in the same commit** — a v5 types package against a v4 runtime (or the reverse) is a silent-drift trap.

### sharp 0.33.5 → 0.35.3

`server/src/routes/export.ts:10` (`import sharp from "sharp"`) is the **only** `import sharp` in the repo. 0.33 → 0.35 crosses two 0.x majors: libvips is upgraded (subtle resampling and output-encoding differences), prebuilt binaries are repackaged, and the minimum Node engine rises.

**For a pixel-art exporter, output-encoding drift is the material risk: a change in PNG encoding or resampling would silently alter exported sprites rather than throw.** A 200 response is not verification. Golden images must be captured **before** the version changes — that is step 1 below, and it is not optional. `server/exports/` is gitignored, so the goldens go to a scratch directory, not into the repo.

### Dead dependencies to remove

| Location | Package | Evidence it is dead |
| --- | --- | --- |
| root `package.json` (devDependency) | `sharp@0.34.5` (exact pin) | `grep -rn "sharp" client/src client/lib mprocs.yaml package.json` finds only the declaration itself. Nothing at root imports it. It is an unused ~100 MB-class native dependency. The **server's** `sharp` is the real one and is upgraded above. |
| `server/package.json` | `tsx@^4.19.2` | Nothing invokes it. `server/package.json` `dev` uses `bun --watch`. Absent from every script. |

### Deliberately NOT upgraded here

`@types/node` (22.19.11 → 26.2.0) is **not forced by anything** — Vitest 3.2.7's peer accepts `^22`. Upgrading narrows Node globals typing and is the change most likely to break the currently-green `server` workspace (`server/src/backup.ts` is 441 lines and fs/stream-heavy). **Defer it.** If a later task needs it, it gets its own item.

## Steps

1. **Capture sharp goldens FIRST, before touching any version.**
   ```sh
   cd /Users/diniden/Desktop/self/pixel-art
   mkdir -p /tmp/export-goldens
   # Start the server, then run an export of a real project via POST /api/project/export
   # and copy the entire resulting export tree out:
   cp -R server/exports/<kebab-name> /tmp/export-goldens/before
   ```
   Export at least one project that exercises: multiple objects, variants with offsets, and at least one layer with transparency. Record the exact project name used.
2. Upgrade Express and its types in one commit:
   ```sh
   cd /Users/diniden/Desktop/self/pixel-art/server
   bun add --exact express@5.2.1
   bun add --exact -d @types/express@5.0.6
   bunx tsc --noEmit           # must exit 0
   ```
   Fix any type errors the v5 types surface in the four route files.
3. Start the server and exercise **one endpoint from each of the three routers** — `routes/project.ts`, `routes/export.ts`, `routes/ai.ts` — confirming error responses are still shaped as `{error: string}`. Express 5's automatic async-rejection forwarding is the thing to watch: an endpoint that used to swallow an error may now return 500.
4. Upgrade sharp:
   ```sh
   bun add --exact sharp@0.35.3
   bunx tsc --noEmit           # must exit 0
   ```
5. Re-run the **same** export of the **same** project, then byte-compare against the goldens:
   ```sh
   cp -R server/exports/<kebab-name> /tmp/export-goldens/after
   diff -r /tmp/export-goldens/before /tmp/export-goldens/after
   ```
   `diff -r` must produce **no output**. If any PNG differs, **stop and report** — libvips has changed the encoding and that is a silent corruption of the owner's exported sprites. Do not "re-bless" the goldens.
6. Remove the dead dependencies:
   - Root `package.json`: delete the `sharp` devDependency entry.
   - `server/package.json`: delete the `tsx` devDependency entry.
   ```sh
   cd /Users/diniden/Desktop/self/pixel-art && bun install
   cd server && bun install
   ```
7. Confirm no range operator and no lockfile was introduced:
   ```sh
   cd /Users/diniden/Desktop/self/pixel-art
   ! grep -qE '"[^"]+": *"[~^><*]' package.json server/package.json
   test -z "$(find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules)"
   ```
   If a range appears, rewrite the specifier by hand to the exact version. If a lockfile appears, `bunfig.toml` was modified — restore it and delete the lockfile.

## Constraints

- **Do not decompose `server/src/routes/export.ts` in this task.** That file is 927 lines and both the size audit and the API audit proposed splitting it; the plan assigns that work to a single later task (`10-decompose-server-export.md`). Editing it here is limited to whatever the Express 5 and sharp upgrades force.
- Do not upgrade `@types/node` — see Context.
- ⚠️ **Do not touch `devDependencies.typescript` in `server/package.json`.** Task 03 (wave W2a) already landed it — it upgrades TS in both workspaces so the repo never carries two versions. **You run after task 03, so read the file as it now stands** and edit only `express`, `@types/express`, `sharp` and `tsx`. If `devDependencies.typescript` is not already at the version task 03 pinned, stop and report rather than fixing it yourself.
- Do not change any route's path, method, request shape, or response shape. This is a dependency upgrade, not a contract change.
- Do not touch `client/` or `ai-service/`.
- **Do not create, commit, or regenerate a lockfile, and do not edit `bunfig.toml`.** No-lockfiles + exact pinning is a standing project policy (owner decision, 2026-08-16): `bunfig.toml`'s `[install.lockfile] save = false` stays, and every dependency version is written exactly in `package.json`. Every `bun add` here uses `--exact`, because plain `bun add x@1.2.3` writes `"^1.2.3"`.
- `npm` and `node` are not on PATH. Use `bun` / `bunx`.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/server
bunx tsc --noEmit                                  # exit 0
# Server starts and answers:
# (start the server, then)
curl -fsS localhost:3001/health                    # -f exits non-zero on any HTTP error
# Golden comparison — must produce NO output:
diff -r /tmp/export-goldens/before /tmp/export-goldens/after
# Dead deps are gone:
cd /Users/diniden/Desktop/self/pixel-art
! grep -q '"sharp"' package.json
! grep -q '"tsx"' server/package.json
# No range operators, no lockfiles (standing project policy):
! grep -qE '"[^"]+": *"[~^><*]' package.json server/package.json
test -z "$(find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules)"
! git ls-files --error-unmatch server/bun.lock 2>/dev/null
bun run install:all && bun run build
```

Manual checks:
- Exercise one endpoint from each of the three routers and confirm both the success and an error path (e.g. request a project that does not exist → 404 with `{error}`).
- `bun run dev` starts all three mprocs processes (`server`, `client`, `ai-service`).
- Visually inspect one exported PNG at 1× and one at a scaled size — the byte-diff is authoritative, but a visual check catches a golden captured from the wrong project.

## Definition of done

- [ ] `express@5.2.1` and `@types/express@5.0.6` (exact, no `^`), upgraded in the same commit.
- [ ] **No lockfile exists anywhere** and **no `^`/`~` specifier** was introduced into `package.json` or `server/package.json`.
- [ ] `sharp@0.35.3` in `server/`.
- [ ] **`diff -r` between the pre-upgrade and post-upgrade export trees produced no output**, and the goldens were captured *before* the sharp upgrade.
- [ ] Root `sharp` devDependency and `server` `tsx` devDependency removed.
- [ ] `@types/node` **not** upgraded.
- [ ] `cd server && bunx tsc --noEmit` exits 0.
- [ ] One endpoint from each of the three routers exercised, success and error path, with results recorded.
- [ ] `server/src/routes/export.ts` was **not** decomposed.
