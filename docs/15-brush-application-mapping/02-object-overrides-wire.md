# 02 — Object-level overrides on the wire

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/types/brushApplication.ts` (new) · `client/src/types/__tests__/brushApplication.test.ts` (new) · `client/src/types/domain.ts` · `client/src/types/index.ts` · `client/src/types/codecs/compactTypes.ts` · `client/src/types/codecs/serialize.ts` · `client/src/types/codecs/deserialize.ts` · `client/src/types/__tests__/roundtrip.test.ts`
**Effort:** S

## Objective
A `PixelObject` can carry `brushApplication?: BrushApplicationMap` — per-brush overrides of the layer
and frame mapping — and it survives the project codec in both directions, **while every corpus digest,
`base-unit.json`'s exact byte count and every committed snapshot stay unchanged.** The types and helpers
(`brushApplicationKey`, `isBrushLayerTarget`, `pruneBrushApplication`) exist for the stores and the
resolver to import.

## Context
- ⚠️ This is the one task that opens `client/src/types/domain.ts` and `client/src/types/codecs/**` —
  CLAUDE.md's highest-severity area. The precedent to copy **exactly** is the optional `origin` field:
  `types/domain.ts` `PixelObject.origin?` (:86 pre-14), `codecs/compactTypes.ts` `CompactPixelObject.origin?`
  (:73), `codecs/serialize.ts` `projectToCompact` object literal `...(obj.origin ? { origin: obj.origin } : {}),`
  (:74), `codecs/deserialize.ts` `compactToProject` object literal, same line (:175).
- Why the conditional spread matters: `client/src/test/__fixtures__/projects.ts` `digest()` (:108-125)
  canonicalises with `undefined` preserved as an explicit marker — a present-with-`undefined` key **changes
  the digest**. `UIStore.ts:582-585` records that `fillColor: undefined` moved all 11 digests. Never emit
  `brushApplication: undefined`.
- Gates that must pass unchanged: `types/__tests__/migrations.test.ts` corpus golden digests (:988-1048,
  11 sha256 in `__snapshots__/migrations.test.ts.snap`), `roundtrip.test.ts` R2 (:94-128, hand-built rich
  project, `expect(rt.objects).toEqual(p.objects)`), R6 (:295 corpus idempotency), **R10 (:393-408)
  `expect(onDisk).toBe(1_129_965)`** exact byte count of `base-unit.json`. `persistedUIState.test.ts` is
  about `CompactUIState` and is not affected by an object-level key.
- The corpus fixtures (`client/src/test/__fixtures__/corpus/*.json`, 11 files) are gitignored — if the
  worktree lacks them, ask the coordinator to copy them **before** running the suite; `corpusFiles()`
  throws on an empty directory, it does not silently pass.
- `types/index.ts` is a barrel (`export * from "./domain"` …); add `export * from "./brushApplication";`
  beside `./brush`. `types/brush.ts` is task 01's file — do not import from it here (the new module needs
  nothing from it).
- Pattern: pure TypeScript; Prettier via `bun run format:check` covers `client/src/types/**`.

## Steps
1. Create `client/src/types/brushApplication.ts` with the MASTER §3 type block:
   `BrushLayerTarget`, `BrushApplicationOverride`, `BrushApplicationMap`,
   `brushApplicationKey(projectName, brushId)` returning `` `${projectName}::${brushId}` ``,
   `isBrushLayerTarget(v)` (an object with **exactly** one own key, either `delta` as an integer or
   `layerId` as a non-empty string), `pruneBrushApplication(map)` (returns a **new** map with empty
   `layers`/`frames` records removed, overrides with neither removed, and `undefined` when nothing
   remains; never mutates its input; `undefined` in → `undefined` out). Header comment: why the key is
   conditional (digest + R10), and that the resolver, not the codec, validates contents.
2. `types/index.ts`: add the barrel line. Commit: `brush-apply(02): brushApplication types + helpers`.
3. `types/domain.ts`: add to `PixelObject`, directly after `origin?`:
   `brushApplication?: BrushApplicationMap;` with a two-line comment ("Per-brush overrides of the Brush
   tool's layer/frame mapping, keyed by `brushApplicationKey`. Present only when non-empty — see
   `codecs/serialize.ts`."). Import the type from `./brushApplication` (type-only import).
4. `codecs/compactTypes.ts`: the same optional member on `CompactPixelObject` after `origin?`.
5. `codecs/serialize.ts` and `codecs/deserialize.ts`: directly under each `origin` spread add
   `...(obj.brushApplication ? { brushApplication: obj.brushApplication } : {}),` — the identical
   conditional form. No other change.
6. Run the full `src/types` suite and **read the output**: every corpus digest test passes, R10 passes,
   no snapshot written. Commit: `brush-apply(02): PixelObject.brushApplication through the codec`.
7. Tests:
   - `types/__tests__/brushApplication.test.ts`: `brushApplicationKey("Ink", "brush-2")` →
     `"Ink::brush-2"`; `isBrushLayerTarget` accepts `{delta: -1}` and `{layerId: "L"}`, rejects `{}`,
     `{delta: 1.5}`, `{delta: 1, layerId: "L"}`, `{layerId: ""}`, `null`, `"x"`; `pruneBrushApplication`
     cases: `undefined` → `undefined`; `{}` → `undefined`; `{ k: {} }` → `undefined`;
     `{ k: { layers: {} } }` → `undefined`; `{ k: { layers: { a: {delta: 1} }, frames: {} } }` →
     `{ k: { layers: { a: {delta: 1} } } }`; input not mutated.
   - `roundtrip.test.ts`: two new `it`s in a new `describe("R11 — PixelObject.brushApplication")`:
     (a) a default object (`createDefaultProject()`) round-trips with `"brushApplication" in rt.objects[0] === false`
     and `"brushApplication" in projectToCompact(p).objects[0] === false`; (b) an object given
     `brushApplication: { "Ink::brush-1": { layers: { l1: { delta: -1 } }, frames: { f1: [0, 1] } } }`
     survives `roundTrip` `toEqual`, and the compact form carries the same key. Do **not** edit
     `buildRichProject()` in the shared fixture.
   Commit: `brush-apply(02): brushApplication tests`.

## Constraints
- Only the files in `Touches`. No `services/`, no `server/`, no `__snapshots__`, no `test/__fixtures__/`.
- No validation logic in the codec — pass-through exactly like `origin`.
- Never `key: undefined`; never `{}` on the wire (the stores prune before writing; the codec does not).
- Do not import `types/brush.ts` from the new module.

## Verification
```sh
cd client && bunx vitest run src/types                      # all green, incl. corpus digests + R10
git status --porcelain | grep __snapshots__                  # prints nothing
git diff --stat main -- client/src/types/codecs              # exactly three files, a few lines each
cd client && bunx tsc --noEmit && bunx eslint src/types      # clean / 0 errors
cd .. && bun run format:check                                # clean
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules  # prints nothing
```
Paste the `src/types` vitest summary (file/test counts) into your report. Manual: none.

## Definition of done
- [ ] `types/brushApplication.ts` exports the MASTER block; barrel updated.
- [ ] `PixelObject.brushApplication?` and `CompactPixelObject.brushApplication?` exist; codec spreads conditionally in both directions.
- [ ] R11 absence + presence tests green; `brushApplication.test.ts` green.
- [ ] Corpus digests, R10 byte count and `__snapshots__` unchanged (state the vitest totals in the report).
- [ ] Three commits with the `brush-apply(02):` prefix; no lockfile.
