# 05 — Generic AutoSaveController

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/stores/session/AutoSaveController.ts` · `client/src/stores/session/__tests__/autoSaveController.test.ts` · `client/src/stores/domain/DomainStore.ts`
**Effort:** S

## Objective
`AutoSaveController` no longer depends on the concrete `DomainStore` class: it is generic over a
structural `AutoSaveDocument<TDoc>` interface so task 11 can instantiate a second controller for
brush documents. Behaviour is byte-for-byte unchanged for projects; every existing autosave test
passes unmodified, plus new tests prove a non-`DomainStore` document works.

## Context
- `client/src/stores/session/AutoSaveController.ts` (352 lines). Constructor at `:148`:
  `constructor(domain: DomainStore, session: SessionStore, history: ReplayGuard | null = null, options: AutoSaveControllerOptions = {}, persistedUI: PersistedUISource | null = null)`.
  The trigger at `:237-241` reads `domain.loadState`, `domain.loadGeneration`,
  `domain.domainVersion`, `domain.pixelVersion`; `run()` at `:274-306` calls
  `domain.serialize()` and uses `domain.projectName || undefined` as the save name; the default
  `save` is `projectApi.save` (`:160`). `options.save?: (project: CompactProject, name?: string) => Promise<unknown>` at `:99`.
- Header comments `:10-32` explain why the trigger is three counters and why the debounce is
  hand-rolled; keep every comment and behaviour.
- `DomainStore` (`stores/domain/DomainStore.ts`) has `projectName :142`, `loadState :139`,
  `loadGeneration :209`, `domainVersion :198`, `pixelVersion :199`, `serialize() :467`.
  Add **one** getter: `get saveName(): string { return this.projectName; }` (non-observable
  getter; do not add it to `makeObservable`). Nothing else in that file changes.
- Tests: `stores/session/__tests__/autoSaveController.test.ts` (523 lines, fake timers) and
  `autoSaveGate.test.ts` — the latter must pass **untouched**.
- Data safety: `DomainStore` is on the corpus-sensitive list. A getter cannot change
  serialisation, but the wave gate re-runs the corpus digests; any diff = stop and report.

## Steps
1. In `AutoSaveController.ts` add:
   ```ts
   export interface AutoSaveDocument<TDoc> {
     readonly loadState: LoadState;          // import the type from ../domain/DomainStore
     readonly loadGeneration: number;
     readonly domainVersion: number;
     readonly pixelVersion: number;
     readonly saveName: string;
     serialize(): TDoc | null;
   }
   export interface AutoSaveControllerOptions<TDoc = CompactProject> {
     save?: (doc: TDoc, name?: string) => Promise<unknown>;
     clock?: Clock;
   }
   export class AutoSaveController<TDoc = CompactProject> { … }
   ```
   Change the constructor's first parameter to `AutoSaveDocument<TDoc>`; `run()` uses
   `this.domain.saveName || undefined`. The default `save` remains `projectApi.save` — type it
   so the default only applies when `TDoc` is `CompactProject` (cast at the single default site
   with a comment; do not weaken the public type).
2. Add `get saveName()` to `DomainStore`.
3. Existing tests must pass unchanged. Add a `describe("generic document")` block to
   `autoSaveController.test.ts` that builds a minimal MobX object satisfying
   `AutoSaveDocument<{ hello: string }>` (use `makeObservable` on a small class with
   `observable` counters), passes a spy `save`, bumps `pixelVersion`, advances fake timers
   500 ms, and asserts the spy was called with `({ hello: … }, "brush-name")`; also that a
   `loadState: "loading"` document never saves.
4. Commit: `brush-studio(05): AutoSaveController generic over AutoSaveDocument`.

## Constraints
- No behaviour change for projects: same debounce, same backoff, same gate, same status writes.
- Do not touch `ApplicationStore.ts` (task 11 wires the brush instance).
- Do not touch `autoSaveGate.test.ts`.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/stores
cd client && bunx vitest run src/stores            # all pass, incl. autoSaveGate.test.ts untouched
cd client && bunx vitest run src/types             # corpus digests unchanged
cd client && bun run lint:boundaries
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Paste the vitest summaries. `git diff --stat` must show exactly the three Touches files.

## Definition of done
- [ ] `AutoSaveDocument<TDoc>` exported; class and options generic; defaults preserved.
- [ ] `DomainStore.saveName` getter added; nothing else in that file changed (`git diff` shows ≤ 3 added lines there).
- [ ] New generic-document tests pass; all pre-existing autosave tests pass unmodified.
- [ ] Corpus digests unchanged; gate green; no lockfile.
- [ ] One commit, only Touches files staged.
