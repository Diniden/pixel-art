# 02 — Server brush file routes

**Wave:** W1 · **Depends on:** none
**Touches:** `server/src/brushFiles.ts` (new) · `server/src/routes/brush.ts` (new) · `server/src/index.ts` · `server/src/__tests__/brushFiles.test.ts` (new)
**Effort:** M

## Objective
The Express server can list, read, write, create, rename and delete brush documents stored
as `server/src/data/brushes/<name>.json`, with atomic verified writes and a one-deep previous
copy, and none of it can collide with the project files or leak into `GET /api/projects`.

## Context
- Routers are mounted in `server/src/index.ts:39-41` (`app.use("/api", projectRouter)` etc.).
  Add `app.use("/api", brushRouter);` beside them. The debug-log router mount at `:45` is
  conditional; yours is unconditional.
- The pattern to copy is `server/src/routes/project.ts` — read it fully. Note: `GET /api/project`
  (`:75`) returns 404 `{ error, projectName }` on a missing file; `create` (`:150`) returns 409;
  `rename` (`:183`) 400/404/409; `DELETE` (`:220`) 404. Reproduce those status codes.
- File helpers: `server/src/backup.ts` exports `safeWriteFile(filePath, content)` (temp file →
  write → read back & compare → atomic rename, `:74`), `ensureDir(dir)` (`:65`), and `DATA_DIR`
  (`:18`, = `server/src/data`). Reuse them — do not reimplement atomic writes.
- Name validation: `server/src/validation.ts:14 isValidProjectName(name)` is the only
  path-traversal guard. Reuse it verbatim for brush names.
- `listProjects()` (`backup.ts:342`) filters `readdir(DATA_DIR)` on `.json` suffix, so a
  `brushes/` subdirectory is invisible to it. **Projects are flat files in `DATA_DIR`; brushes
  must live in the subdirectory** or they would appear as projects.
- Server tests: `server/vitest.config.ts` (node env, `src/**/__tests__/**/*.test.ts`, excludes
  `src/data/**`). Run with `cd server && bunx vitest run`. Agents **cannot read
  `server/src/data/**`** (permission deny) — tests must use a temp dir.
- No sync broadcast for brushes (MASTER D12). Do not import `sync.ts`.
- Bun only: `bun`, `bunx`. `express` is v5 (`server/package.json`).

## Steps
1. Create `server/src/brushFiles.ts`:
   ```ts
   export const BRUSHES_DIR = join(DATA_DIR, "brushes");
   export interface BrushFilesOptions { baseDir?: string }   // default BRUSHES_DIR; tests pass a temp dir
   export function getBrushFilePath(name: string, opts?): string        // join(baseDir, `${name}.json`)
   export async function listBrushes(opts?): Promise<string[]>           // sorted stems; ignores non-.json and `.prev`
   export async function readBrush(name, opts?): Promise<unknown | null> // null when missing
   export async function writeBrush(name, content: unknown, opts?): Promise<void>
   //   ensureDir(baseDir); if file exists copy it to `${baseDir}/.prev/${name}.json` (ensureDir);
   //   then safeWriteFile(path, JSON.stringify(content, null, 2))
   export async function brushExists(name, opts?): Promise<boolean>
   export async function renameBrush(oldName, newName, opts?): Promise<void>   // fs.rename
   export async function deleteBrush(name, opts?): Promise<void>               // fs.unlink
   ```
   Every function that takes a name first checks `isValidProjectName(name)` and throws a
   `BrushNameError` (exported class) otherwise — the route maps it to 400.
2. Create `server/src/routes/brush.ts` implementing MASTER D13:
   - `GET /api/brushes` → `{ brushes: string[] }`
   - `GET /api/brush?name=` → raw document JSON; 400 invalid name; 404 `{ error: "No brush found", name }`
   - `POST /api/brush?name=` body = document → `{ success: true }`; 400 if invalid name or body not an object
   - `POST /api/brush/create` `{ name, brushData? }` → `{ success: true, name }`; 400 invalid; 409 `Brush already exists`. If `brushData` absent write `{ version: "brush-1", width: 16, height: 16, frames: [], appliedGroups: [] }` — the client normalises; the server does not know the type.
   - `POST /api/brush/rename` `{ oldName, newName }` → `{ success: true }`; 400/404/409
   - `DELETE /api/brush?name=` → `{ success: true }`; 400/404
   Every handler wraps in try/catch and returns 500 `{ error }` on unexpected failure —
   **never fabricate a success value** (ARCHITECTURE §6).
3. Mount in `server/src/index.ts` next to the other `/api` routers. Commit after step 3:
   `brush-studio(02): server brush file routes`.
4. Write `server/src/__tests__/brushFiles.test.ts` using `mkdtemp(join(tmpdir(), "brushes-"))`
   as `baseDir` (clean up in `afterEach`): list empty → `[]`; write then list → `["a"]`;
   write twice → `.prev/a.json` holds the first content; read missing → `null`; rename;
   delete; invalid names (`"../x"`, `"config"`, `".hidden"`, `""`) throw `BrushNameError`;
   `listBrushes` ignores a `.prev` directory and a stray `notes.txt`.
5. Run verification; commit: `brush-studio(02): brushFiles tests`.

## Constraints
- Do not modify `backup.ts`, `validation.ts`, `routes/project.ts`, `sync.ts`, or anything
  under `server/src/export/`.
- Do not write into `server/src/data/` from tests.
- No request may return 200 with an error payload.

## Verification
```sh
cd server && bunx tsc --noEmit            # clean
cd server && bunx eslint .                # 0 errors
cd server && bunx vitest run              # 52 existing + new tests pass
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # no output
```
Manual (with `bun run dev:server` in another terminal, then `! curl …` in this session):
- `curl -s localhost:3001/api/brushes` → `{"brushes":[…]}` (existing brushes, if any; else `[]`).
- `curl -s -X POST localhost:3001/api/brush/create -H 'content-type: application/json' -d '{"name":"zz-plan-test"}'` → 201/200 `{ success: true, name: "zz-plan-test" }`; again → 409.
- `curl -s 'localhost:3001/api/brush?name=zz-plan-test'` → the document.
- `curl -s -X DELETE 'localhost:3001/api/brush?name=zz-plan-test'` → `{ success: true }`.
- `curl -s localhost:3001/api/projects` does **not** list `zz-plan-test` at any point.
Paste the outputs.

## Definition of done
- [ ] Six endpoints behave as specified, including status codes.
- [ ] `brushFiles.ts` is `baseDir`-parameterised; tests use a temp dir.
- [ ] Previous-copy semantics verified by a test.
- [ ] Manual curl checks pasted; the project list never shows a brush.
- [ ] tsc/eslint/vitest clean in `server/`; no lockfile.
- [ ] Two commits with only Touches files staged.
