# 11 — Decompose `server/src/routes/export.ts` (single owner)

**Wave:** W6 · **Depends on:** 04, 07
**Touches:** `server/src/routes/export.ts` (deleted at the end) · `server/src/export/` (new: `index.ts`, `exportRouter.ts`, `naming.ts`, `exportTypes.ts`, `compactExport.ts`, `pixelDecode.ts`, `raster.ts`, `transform.ts`, `maxCanvas.ts`, `write.ts`, `codegen.ts`) · `server/src/index.ts` (mount point) · `server/src/validation.ts` (new) · `server/src/__tests__/export-golden.test.ts` (new)
**Effort:** L

## Objective

After this task the 927-line `server/src/routes/export.ts` is decomposed into a thin route plus ~10 focused modules, its pure functions are unit-testable, and the export output is **byte-identical** to before, proven by a golden comparison. Project-name validation is shared with the project routes.

## Context

**Ownership note:** two separate audits proposed decomposing this file — one on code-structure grounds, one on API-contract grounds. **This task is the single owner of the whole decomposition.** No other task in this plan touches `server/src/routes/export.ts` or `server/src/export/`.

### What is actually in the file

Despite the filename there are **no `router.get`/`router.post` calls scattered through it**: `exportRouter` is created at line 486 and the entire export runs in **one handler spanning lines 488-927** (440 lines in a single function). The `export` keywords at lines 862-878 are **inside a template literal** (822-915) that *generates TypeScript source* — they are not module exports. The only real exports are `DEFAULT_EXPORT_FOLDER` (line 20) and `exportRouter` (line 486).

| Lines | Responsibility | Target module |
| --- | --- | --- |
| 24-41 | Name casing (`toKebabCase`, `toPascalCase`) — **pure, testable** | `server/src/export/naming.ts` |
| 44-95 | Compact **input** schema — a hand-copy of the client's `Compact*` types | `server/src/export/exportTypes.ts` |
| 98-164 | `Exported*` wire schema (7 interfaces) | `server/src/export/exportTypes.ts` |
| 166-219 | `CompactExported*` schema (7 interfaces) | `server/src/export/exportTypes.ts` |
| 221-372 | String-table construction + compaction (`collectStrings`, `toCompactExport`) — **pure, testable** | `server/src/export/compactExport.ts` |
| 373-419 | Pixel decode (`compactPixelToRgba`, `compactPixelToNormalHeight`, `normalizePixel`) — **pure, testable** | `server/src/export/pixelDecode.ts` |
| 420-484 | Raster + PNG encode (`bufferHash`, `renderLayerTo*Buffer`, `writePng`) | `server/src/export/raster.ts` |
| 488-501 | Route concern: project-name resolution + existence check | stays in `exportRouter.ts` |
| 503-624 | Texture dedup + object/variant transformation | `server/src/export/transform.ts` |
| 628-690 | `maxCanvas` bounds computation — **pure, testable** | `server/src/export/maxCanvas.ts` |
| 692-712 | Serialise `frames.json` + `.gz` | `server/src/export/write.ts` |
| 714-718 | Copy `client/lib` → exports | `server/src/export/write.ts` |
| 720-918 | **Codegen of `index.ts` via a ~96-line template literal** | `server/src/export/codegen.ts` |
| 920-926 | Response + error mapping | stays in `exportRouter.ts` |

Target shape: `server/src/routes/export.ts` disappears; `server/src/export/exportRouter.ts` is ~60-120 lines that validate, call `runExport(projectName, exportBase)` from `server/src/export/index.ts`, and respond.

### Two duplicated domain rules that live here

1. **The 4-level variant-offset fallback appears at `export.ts:657-665`** — the same rule duplicated 6× in total (the other 5 are in `client/src/components/Canvas/Canvas.tsx` at lines 541, 663, 1113, 1390, 1915). The rule is:
   ```ts
   l.variantOffsets?.[l.selectedVariantId ?? ""] ?? l.variantOffset ??
     variant.baseFrameOffsets?.[baseFrameIndex] ?? { x: 0, y: 0 }
   ```
   **Do not attempt to share this across the client/server package boundary** — no shared package exists and creating one is out of scope here. Move it verbatim into `maxCanvas.ts` (or a sibling), give it a unit test, and add a comment pointing at the client copies so the duplication is at least documented.

2. **`normalizePixel` (`export.ts:412-418`) is a second implementation of the client's legacy-pixel migration.** The server version **is array-safe** (`Array.isArray(pixel) && length >= 3` returns as-is); the client's `migrateLegacyPixel` is not. Task 07 pinned both with tests. **Move the server implementation verbatim. Do not "fix" it and do not make it call the client's.**

### Contract fixes to make while splitting — but only these

1. **Validate the project name.** `export.ts:491` accepts `req.query.name` unvalidated and feeds it to `toKebabCase` → `join(exportBase, kebabName)`. `server/src/routes/project.ts:30-38` already has `isValidProjectName` and **export does not call it**. Extract `isValidProjectName` into a new `server/src/validation.ts` and call it from the export route. (Wiring it into `project.ts`'s 7 call sites is fine and encouraged, but keep that a mechanical import change.)
2. **Stop returning the absolute server filesystem path.** The response is `{success: true, path, kebabName}` where `path` is an absolute server path the browser cannot use — only `kebabName` is consumed (by `ExportPreviewModal.tsx:407`). Replace it with `{success, kebabName, frameCount, textureCount, bytes}`. ⚠️ **This is a response-shape change**, so it must be coordinated: grep the client for every reader of `path` before removing it, and if any exists, keep `path` until the client task removes the reader. Report what you found.

### Deliberately NOT in scope

- **Do not restore frame tags to the export format.** The server's `CompactFrame` (`export.ts:58-62`) omits `tags?: string[]` that the client's has, so exported `frames.json` loses frame tags. Fixing that changes the **published export format** consumed by downstream game code and needs a version bump and owner sign-off. It is filed as an open question, not done here.
- **Do not fix the empty-string key in M8** (`export.ts:576-580` produces `{"": {x,y}}` when `selectedVariantId` is absent). Task 07 pinned it. Changing it changes exported JSON.
- **Do not make export asynchronous or job-based.** It is the longest request in the system (sharp at `compressionLevel:9, effort:10` over every unique texture) but converting it to a job model is a feature, not a refactor.
- **Do not create a `shared/` workspace package.** That was proposed by one audit as the eventual home for the duplicated schemas and migrations. It is a significant structural change with its own risks and is not scheduled in this refresh; it is recorded as an open question.

## Steps

1. **Capture the golden export first**, before any code moves:
   ```sh
   cd /Users/diniden/Desktop/self/pixel-art
   mkdir -p /tmp/export-split-goldens
   # start the server; export a real project via POST /api/project/export
   cp -R server/exports/<kebab-name> /tmp/export-split-goldens/before
   ```
   Use a project with multiple objects, variants carrying offsets, and at least one transparent layer. If task 04's goldens are still on disk and the same project, reuse them.
2. Create `server/src/validation.ts` exporting `isValidProjectName`, moved verbatim from `project.ts:30-38`. Update `project.ts` to import it.
3. Create `server/src/export/` and move each block from the table above **verbatim**, in this order — commit after each so a regression is bisectable:
   - `naming.ts`, `exportTypes.ts`, `pixelDecode.ts`, `maxCanvas.ts`, `compactExport.ts` (the pure ones, easiest to verify)
   - `raster.ts`, `transform.ts`, `write.ts`, `codegen.ts`
   - `index.ts` exposing `runExport(projectName, exportBase): Promise<ExportResult>`
   - `exportRouter.ts` — validate, call `runExport`, respond
4. Update the mount in `server/src/index.ts` to import `exportRouter` from its new location. Delete `server/src/routes/export.ts`.
5. Write `server/src/__tests__/export-golden.test.ts`: unit tests for `toKebabCase`, `toPascalCase`, `normalizePixel` (array-safe both directions), the 4-level variant-offset fallback (all 4 levels in priority order), and `maxCanvas` bounds for a fixture with offset variants.
6. Re-run the same export and byte-compare.

## Constraints

- **The export output must be byte-identical.** This includes `frames.json`, the generated `index.ts`, and every texture PNG hash. The only permitted difference is the HTTP response body, and only if step 2 of the contract fixes applies.
- **Move code verbatim first; fix nothing while moving.** If a bug is spotted, note it and leave it. The two contract fixes listed in Context are the only intentional changes, and each is its own commit.
- Do not touch `client/`. Do not touch `client/lib/` — it is copied verbatim into exports and is public API for generated projects.
- Do not upgrade any dependency.
- `npm` and `node` are not on PATH.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/server
bunx tsc --noEmit && bunx eslint .        # both exit 0
bunx vitest run src/__tests__/            # exit 0
# Byte-identical export — this is the gate:
cd /Users/diniden/Desktop/self/pixel-art
# (start the server; run the same export as step 1)
cp -R server/exports/<kebab-name> /tmp/export-split-goldens/after
diff -r /tmp/export-split-goldens/before /tmp/export-split-goldens/after   # MUST produce no output
# Explicitly diff the generated source and the compressed payload:
diff <(gunzip -c /tmp/export-split-goldens/before/frames.json.gz) \
     <(gunzip -c /tmp/export-split-goldens/after/frames.json.gz)
diff /tmp/export-split-goldens/before/index.ts /tmp/export-split-goldens/after/index.ts
# The old file is gone and nothing imports it:
test ! -f server/src/routes/export.ts
! grep -rn "routes/export" server/src
```

Manual checks:
- Confirm the generated `index.ts` still compiles in a consuming context (it is public API for downstream game code).
- Hit the export endpoint with an **invalid** project name and confirm it is now rejected by `isValidProjectName` rather than reaching `join()`.
- Report whether any client file reads the response's `path` field, and whether `path` was removed or retained.

## Definition of done

- [ ] `server/src/routes/export.ts` is deleted; `server/src/export/` contains the ~11 modules from the table; `server/src/index.ts` mounts the new router.
- [ ] `exportRouter.ts` is under ~120 lines and contains only validation, orchestration and the response.
- [ ] **`diff -r` between the pre-split and post-split export trees produced no output**, and the goldens were captured before any code moved.
- [ ] `isValidProjectName` lives in `server/src/validation.ts` and is called by the export route.
- [ ] Unit tests exist for `toKebabCase`, `toPascalCase`, `normalizePixel`, the 4-level variant-offset fallback, and `maxCanvas`.
- [ ] `normalizePixel` was moved **verbatim** and its array-safety preserved.
- [ ] Frame tags were **not** restored to the export format; the M8 empty-string key was **not** changed; no `shared/` workspace was created.
- [ ] Whether the response's `path` field was removed is reported, with the grep evidence.
- [ ] `cd server && bunx tsc --noEmit && bunx eslint .` both exit 0.
