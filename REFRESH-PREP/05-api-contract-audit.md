# P1-05 — API & Server-Contract Audit

**Wave:** P1 · **Depends on:** nothing · **Output:** `REFRESH-PREP/findings/api-contract.md`

## Expert profile

You are an API design specialist working across a TypeScript client and an
Express server. You care about a single source of truth for types, honest error
handling, and keeping transport concerns out of business logic.

## Context

Three tiers, three lifecycles:

- **Client** — `client/src/services/`: `api.ts` (427), `aiService.ts` (216),
  `autoSave.ts`, `export.ts`. `API_BASE = import.meta.env.VITE_API_URL || "/api"`.
- **Server** — Express 4 + sharp. `server/src/index.ts`, `routes/project.ts` (361),
  `routes/export.ts` (927), `routes/ai.ts` (289), `backup.ts` (441).
  Persistence is **JSON files on disk** under `server/src/data/` with gzipped
  backups — there is no database.
- **AI service** — separate Python FastAPI app (`ai-service/`): `server.py`,
  `job_manager.py`, `interpolate.py`, `proxy.py`. Async job model.

`services/api.ts` also carries **schema-migration logic**
(`needsVariantMigration`, `migrateLegacyProject`, `migrateLegacyLayer`) — data
migration living in the transport layer.

**Target: one well-defined, isolated, strongly-typed API layer.**

## Your task

1. **Endpoint catalogue.** Every route the server exposes and every route the AI
   service exposes. For each: method, path, path/query params, request body
   shape, success response shape, error responses, and the client function that
   calls it. Read the route files directly — do not infer from client code alone.

2. **Contract drift.** Compare what the client *expects* against what the server
   *sends*, field by field. Report every mismatch: fields the client reads that
   the server never sets, fields the server sends that nothing consumes, optional
   /required disagreements, differing null handling. This is the section most
   likely to surface real bugs.

3. **Type-sharing assessment.** Client types live in `client/src/types/index.ts`
   (1,086 lines); the server has its own. Determine how much is duplicated and
   how far the two have diverged. Then recommend a mechanism for a single source
   of truth — a `shared/` workspace package, a generated client, or runtime
   validation via Zod. Give **one** recommendation with concrete tradeoffs for a
   Bun-based repo, not a survey.

4. **Error handling census.** How does each client call handle failure today?
   Look for: swallowed errors, bare `console.error`, unhandled rejections,
   missing non-2xx checks (a `fetch` that doesn't check `response.ok`), absent
   timeouts, no retry on transient failure. Table it with file:line.

5. **The migration-logic problem.** Document every schema migration in
   `api.ts` and `types/index.ts`: what format it converts from, what triggers it,
   whether it's idempotent, and what happens on a partially-migrated file.
   Recommend where this belongs in the target architecture — it is not transport
   logic, and it must not be lost in the refactor. **Losing a migration path
   means silently corrupting the user's existing project files, so treat
   preservation as a hard requirement.**

6. **Auto-save & backup flow.** Trace `autoSave.ts` → server → `backup.ts` end to
   end: trigger, debounce, request shape, write strategy, backup rotation, and
   what happens on concurrent or failed saves. Note the data-loss risks you find.

7. **AI service integration.** Document the full async job lifecycle: how a job
   is submitted, polled, and retrieved; how `server/src/routes/ai.ts` proxies to
   the Python service; and what happens when the Python service is down. Note
   that `ai-service` config moved to env (commit `3199fa8`) — record how it is
   configured now.

8. **Target API layer design.** Propose the structure, concretely:
   - Directory and file layout under `client/src/api/` (or wherever you
     recommend).
   - A typed request helper: base URL, JSON handling, `response.ok` checking,
     typed errors, timeout, abort-signal support.
   - Resource modules (`projectApi`, `exportApi`, `aiApi`, `backupApi`) with
     exact function signatures.
   - A defined error taxonomy (network / not-found / validation / server /
     timeout) and how callers distinguish them.
   - How the MobX `DomainStore` consumes this layer — the API layer must not
     import the store, and the store must not use `fetch` directly.
   - How it's mocked for Storybook and Vitest.

9. **Server route decomposition.** `routes/export.ts` is 927 lines. Identify its
   responsibilities and propose a split. Note that task 03 also covers this file
   — coordinate by focusing on the *API-contract* angle (routes, handlers,
   validation) and leaving general code structure to 03.

## Output format

Write `REFRESH-PREP/findings/api-contract.md`:

```markdown
# API & Server-Contract Audit

## Summary

## Endpoint catalogue
| Method | Path | Params | Request | Response | Client caller | Errors |

## Contract drift  ← real bugs likely here
| Endpoint | Client expects | Server sends | Impact |

## Type duplication
| Type | Client | Server | Divergence |
### Single-source-of-truth recommendation

## Error handling census
| Call site | Current handling | Problem | Fix |

## Schema migrations  ← must be preserved
| Migration | From → To | Trigger | Idempotent? | Where it should live |

## Auto-save & backup flow
<end-to-end trace + data-loss risks>

## AI service integration
<job lifecycle, proxying, failure modes, env config>

## Target API layer
### Structure
### Typed request helper
### Resource modules & signatures
### Error taxonomy
### Store integration boundary
### Mocking for Storybook/Vitest

## Server route decomposition

## Proposed work items
| Title | Touches (explicit files/dirs) | Depends on | Effort | Risk |

## Verification
| Work item | Command(s) | Manual checks |

## Open questions
```

## Definition of done

- Every server and AI-service endpoint is catalogued.
- The drift table is complete and specific — each row names real fields.
- Every schema migration is documented with a preservation plan.
- The target API layer is specified precisely enough to implement from directly.
