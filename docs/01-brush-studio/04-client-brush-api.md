# 04 — Client `brushApi`

**Wave:** W2 · **Depends on:** 01, 02
**Touches:** `client/src/api/resources/brushApi.ts` (new) · `client/src/api/index.ts` · `client/src/api/__mocks__/fixtures.ts` · `client/src/api/__mocks__/handlers.ts` · `client/src/api/__tests__/resources.contract.test.ts`
**Effort:** S

## Objective
The client has a typed, timeout-guarded `brushApi` resource for the six brush endpoints,
exported from the API barrel, with MSW fixtures/handlers shared by tests and Storybook, and
contract tests that exercise real URL construction and error mapping.

## Context
- The template is `client/src/api/resources/projectApi.ts` (read it fully): `list()`, `get(name)`,
  `save(project, name)`, `create(name, data?)`, `rename(old, new)`, `remove(name)`,
  `switchTo(name)`. Note `get()` returns the **raw** payload — migration/normalisation is not
  the API's job (header `:5-8`). Same here: `get()` returns `unknown`; task 07 normalises with
  `normalizeBrushDocument`.
- `client/src/api/client/httpClient.ts:18` `RequestOptions` (`method: "GET" | "POST" | "DELETE"`,
  `path`, `query`, `body`, `timeoutMs`, `headers`), `:116 request<T>()`. Errors are typed
  `ApiError` with `kind` (`client/errors.ts:9-16`). Map 409 → `"conflict"`, 404 → `"notFound"`
  exactly as `projectApi` does.
- `client/src/api/index.ts` is the **only legal import site** (ESLint-enforced). Add
  `brushApi` and its result types to the barrel beside `projectApi`.
- MSW: `client/src/api/__mocks__/handlers.ts:29-70` — one `http.<verb>("*/api/…")` per endpoint,
  origin-less predicates; `fixtures.ts` exports fixture data; both are used by Vitest
  (`src/test/mswServer.ts`, `onUnhandledRequest: "error"`) and Storybook (`.storybook/preview.tsx`).
- Contract test: `client/src/api/__tests__/resources.contract.test.ts` — each resource method
  runs against MSW; add a `describe("brushApi")`.
- Endpoints (task 02): `GET /api/brushes` → `{ brushes }`; `GET /api/brush?name=`; `POST /api/brush?name=`
  → `{ success: true }`; `POST /api/brush/create` `{ name, brushData? }` → `{ success, name }`;
  `POST /api/brush/rename` `{ oldName, newName }`; `DELETE /api/brush?name=`.
- ⚠️ `*/api/brush` and `*/api/brushes` are distinct MSW paths; `*/api/brush/create` must be
  registered **before** any wildcard that could swallow it (MSW matches in array order).

## Steps
1. Create `brushApi.ts`:
   ```ts
   export interface SaveBrushResult { success: true }
   export interface CreateBrushResult { success: true; name: string }
   export const brushApi = {
     list(signal?): Promise<string[]>,                    // unwraps data.brushes ?? []
     get(name: string, signal?): Promise<unknown>,        // RAW
     save(doc: BrushDocument, name: string): Promise<SaveBrushResult>,
     create(name: string, brushData?: BrushDocument): Promise<CreateBrushResult>,
     rename(oldName: string, newName: string): Promise<void>,
     remove(name: string): Promise<void>,
   };
   ```
   Import `BrushDocument` from `../../types` (api may import types).
2. Export from `api/index.ts`.
3. `fixtures.ts`: add `FIXTURE_BRUSH_NAME = "Soft Round"`, `fixtureBrushDocument()` (build with
   `createBrushDocument(8, 8)` and paint two cells), `fixtureBrushList = ["Soft Round", "Scatter"]`.
4. `handlers.ts`: handlers for all six endpoints returning the fixtures; 404 for an unknown
   `name` on GET; 409 on `create` when name already in `fixtureBrushList`.
5. Contract tests: list → fixture list; get known → deep-equals fixture; get unknown →
   `ApiError.kind === "notFound"`; save → `{ success: true }` and the request body round-trips;
   create existing → `"conflict"`; rename/remove resolve; a space in the name is encoded as `%20`
   (matches `httpClient.ts:48-50`).
6. Commit: `brush-studio(04): brushApi resource, MSW handlers, contract tests`.

## Constraints
- No imports from `stores/`, `components/`, `containers/` inside `api/`.
- Do not change `projectApi.ts` or the http client.
- `get()` must not normalise/migrate.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/api
cd client && bunx vitest run src/api                # contract tests pass; no unhandled-request errors
cd client && bun run lint:boundaries
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```

## Definition of done
- [ ] `brushApi` with six methods, typed results, barrel-exported.
- [ ] Fixtures + handlers cover every endpoint including 404/409.
- [ ] Contract tests green; `%20` encoding asserted.
- [ ] Gate green; no lockfile; one commit with only Touches files.
