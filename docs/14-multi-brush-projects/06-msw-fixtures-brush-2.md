# 06 — msw fixtures to brush-2

**Wave:** W2 · **Depends on:** 05 (shape only — code to MASTER §3's block; the task runs in parallel)
**Touches:** `client/src/api/__mocks__/fixtures.ts` · `client/src/api/__mocks__/handlers.ts` · `client/src/api/__tests__/resources.contract.test.ts`
**Effort:** S

## Objective
`fixtureBrushDocument()` returns a brush-2 project with **two** brushes, so every msw-backed test (the API contract suite now, the container suites in W4) exercises the multi-brush shape. The handlers' comments stop describing one file as one brush.

## Context
`client/src/api/__mocks__/fixtures.ts:153-170`: `FIXTURE_BRUSH_NAME = "Soft Round"`, `fixtureBrushList = ["Soft Round", "Scatter"]` (file names — still correct; they are **projects**), and `fixtureBrushDocument(): BrushDocument` = `createBrushDocument(8, 8)` with cells `grid[1][1]` and `grid[6][6]` painted (comment `:161-163`: "the in-memory shape IS the wire shape … exactly what `GET /api/brush` sends"). `handlers.ts:54-80` routes `GET */api/brushes`, `POST */api/brush/create`, `POST */api/brush/rename`, `GET */api/brush` (404 unless the name is listed, else `fixtureBrushDocument()`), `POST */api/brush`, `DELETE */api/brush`; the error block at `:118-120`. `resources.contract.test.ts` (30 tests) asserts the brush routes at `:120-171` with `fixtureBrushDocument()` as the save body and checks the `?name=` query.

Locked fixture (so W4 container tests can rely on it):
- brush 1: `id: "brush-1"`, `name: "Round"`, 8×8, painted `[1][1]` and `[6][6]` with the existing delta values (keep them);
- brush 2: `id: "brush-2"`, `name: "Dot"`, 4×4, one painted cell `[2][2]` = `[0, 0, 0, 0]`.
Build brush 1 with `createBrush("brush-1", "Round", 8, 8)` and brush 2 with `createBrush("brush-2", "Dot", 4, 4)`, then `{ version: BRUSH_DOCUMENT_VERSION, brushes: [b1, b2] }`. Export the two ids as `FIXTURE_BRUSH_IDS = ["brush-1", "brush-2"] as const` for the W4 tests.

## Steps
1. Rewrite `fixtureBrushDocument()` per the locked fixture; add `FIXTURE_BRUSH_IDS`; update the section comment to say a brush **project** holds brushes.
2. `handlers.ts`: no route changes; fix the comments that say "brush" for the file (e.g. "409 when the brush exists" → "brush project").
3. `resources.contract.test.ts`: it should still pass unchanged (the body is opaque to the transport). If any assertion inspects the document (`width`, `frames`), move it to `brushes[0]`. Add one assertion that `GET /api/brush?name=Soft%20Round` returns a body with `brushes.length === 2`.
4. Run the verification. Commit: `multi-brush(06): msw brush fixture is a two-brush project`.

## Constraints
- Do not touch `brushApi.ts` or anything under `api/client/`.
- Do not add brush fixtures to `fixtures/projects.ts` or `test/__fixtures__/` — the pixel project has none and needs none.

## Verification
```sh
cd client && bunx vitest run src/api && bunx eslint src/api
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # prints nothing
```
Expected: `src/api` suites green (contract 30 → 31). tsc is red in this wave by design (task 05); do not chase it.

Manual: none.

## Definition of done
- [ ] Fixture matches the locked shape; `FIXTURE_BRUSH_IDS` exported.
- [ ] `src/api` green; comments updated.
