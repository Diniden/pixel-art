# 02 — Server default document → brush-2

**Wave:** W1 · **Depends on:** none
**Touches:** `server/src/routes/brush.ts` · `server/src/__tests__/brushRoutes.test.ts` (new)
**Effort:** S

## Objective
`POST /api/brush/create` without `brushData` writes a **valid brush-2** document — one 16×16 brush named "Brush 1" with one frame and one empty rgb layer — instead of today's `{ version: "brush-1", width, height, frames: [] }` (which the client normaliser rejects). The server's route tests exist for the first time and pin the created shape.

## Context
`server/src/routes/brush.ts:37-42` holds `EMPTY_BRUSH_DOCUMENT`, the **only** place the server knows the document shape (`brushFiles.ts` treats documents as opaque JSON, `isDocumentObject :53` checks "non-array object" only). The client always sends `brushData` (`BrushStore.createProject` → `createBrushDocument`), so the constant is a fallback for direct API use — but a fallback that yields an unloadable file is a trap. MASTER D14 makes it valid.

The brush-2 shape (MASTER D1, §3 type block): `{ version: "brush-2", brushes: [{ id, name, width, height, frames: [{ id, name, layers: [{ id, name, channelType, visible, pixels }] }], appliedGroups: [] }] }` where `pixels` is `height` rows of `width` zeros. Ids: `"brush-1"`, `"frame-1"`, `"layer-1"`; names `"Brush 1"`, `"Frame 1"`, `"Layer 1"`; `channelType: "rgb"`, `visible: true`. This mirrors the client's `createBrushDocument()` defaults exactly (task 05) so a server-created and a client-created project are byte-identical after normalisation.

Server tests: 4 files / 102 tests today, all under `server/src/__tests__/` (`brushFiles.test.ts`, `debugLogGate.test.ts`, `normalizePixel.test.ts`, `export-golden.test.ts`). `brushFiles.test.ts` is the harness to copy: it drives the `brushFiles.ts` helpers against a `mkdtemp` `baseDir`. The route module uses the default `BRUSHES_DIR` and no test exercises a route through an app instance — so test the exported document builder directly and leave the route itself untested rather than writing to `server/src/data/`.

## Steps
1. Replace the `EMPTY_BRUSH_DOCUMENT` constant with a function `emptyBrushDocument()` that builds the brush-2 shape above (a fresh object per call — the grid must not be shared between two creates). Export it so the test can import it. Update the comment (`:33-36`) to say the shape is brush-2 per plan 14 and mirrors the client factory.
2. Update the route header comment (`:1-17`) where it describes the create fallback.
3. Add `server/src/__tests__/brushRoutes.test.ts` beside `brushFiles.test.ts`: assert `emptyBrushDocument()` has `version === "brush-2"`, one brush 16×16 with a 16-row × 16-col zero grid, ids `brush-1`/`frame-1`/`layer-1`, and that two calls return distinct grid arrays.
4. Run the verification. Commit: `multi-brush(02): server create fallback writes a valid brush-2 document`.

## Constraints
- Never read or write `server/src/data/**`. Tests use `mkdtemp` or pure functions.
- Do not change `brushFiles.ts`, the status codes, or the route paths.
- `server/src/export/` is off-limits.

## Verification
```sh
cd server && bunx tsc --noEmit && bunx eslint . && bunx vitest run
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # prints nothing
```
Expected: tsc clean, eslint clean, vitest 5 files (was 4) with the new tests green.

Manual: none.

## Definition of done
- [ ] `emptyBrushDocument()` returns a valid brush-2 document with fresh grids per call.
- [ ] New server test file green; existing 102 tests untouched.
- [ ] Server gate output pasted in the report; no lockfile.
