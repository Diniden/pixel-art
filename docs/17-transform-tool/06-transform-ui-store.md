# 06 — `TransformUIStore`

**Wave:** W2 · **Depends on:** 02
**Touches:** `client/src/stores/ui/TransformUIStore.ts` (new) · `client/src/stores/ui/__tests__/TransformUIStore.test.ts` (new)
**Effort:** M

## Objective
A session-only MobX store holds the lifted source and the current float params of one transform
session, exposes `isActive` / `isPending` / `result` (the rasterised cells and vacated set, memoised
by MobX), and the lifecycle actions `begin` / `setParams` / `nudge` / `reset` / `end`. Nothing is
persisted, nothing enters history. Not yet attached to `ApplicationStore` (task 08).

## Context
- Template: `client/src/stores/ui/ReflectionUIStore.ts` (196 lines) — `observableRef` fields
  replaced wholesale (`:80-101`), header explaining session-only lifetime (`:10-26`), actions with
  early returns. Test `__tests__/ReflectionUIStore.test.ts` for the rig.
- A UI store may import the pure geometry module: `PixelBrushUIStore.ts:41-42` imports from
  `@/ui/canvas/tools/pixelBrushScale`. Import `identityParams`, `isIdentity`, `rasterizeTransform`,
  `TransformParams`, `TransformSource`, `TransformResult` from `@/ui/canvas/model/transform`.
- `SelectionBox` from `@/types`. `selectionRef: object` is an identity token (the
  `SelectionUIStore.selection` object at lift time) — never inspected, only compared with `===`.
- `stores/ui/**` must not import `stores/domain/**` (ESLint). The commit is orchestrated by
  `ApplicationStore` (task 08), not here.
- `persistedUIState.test.ts` proves no key is added to the wire format — this store never touches
  `UIStore`.

## Steps
1. Write the store per MASTER D8 and the §3 type block: `session: TransformSession | null = null`,
   `params: TransformParams | null = null` (both `observable.ref`), `makeObservable` with explicit
   annotations; actions `begin(session)` (replaces any existing session; `params = identityParams(session.bounds)`),
   `setParams(p)` (no-op when `!session`), `nudge(dx, dy)` (`cx += dx, cy += dy`; no-op when
   inactive), `reset()` (params → identity), `end()` (both `null`); computeds `isActive`,
   `isPending` (`isActive && !isIdentity(params, session.bounds)`), `result` (`rasterizeTransform(session.source, params, session.gridWidth, session.gridHeight)` or `null`).
   Header: what a session is, why refs, why `result` is a computed (recomputed only when a ref
   changes; consumers read it at most once per pointer sample), and that `ApplicationStore` commits.
2. Tests: defaults null / inactive / not pending / `result === null`; `begin` sets identity params and
   `isActive`, not `isPending`; `setParams` with a rotation → `isPending`, `result` non-null and equal
   to a direct `rasterizeTransform` call; `result` is the **same reference** across two reads without
   a change and a new one after `setParams`; `nudge(1, 0)` shifts `cx` by 1 and makes the session
   pending; `reset()` clears pending but keeps the session; `end()` clears both; `setParams`/`nudge`
   before `begin` are no-ops; `begin` twice replaces the session.
3. Commit: `transform(06): TransformUIStore + tests`.

## Constraints
- No imports from `stores/domain/**`, no `UIStore` edit, no `ApplicationStore` edit.
- `session.source.cells` is never copied or mutated by the store.

## Verification
```sh
cd client && bunx vitest run src/stores/ui                   # green, persisted-state suites unchanged
cd client && bunx tsc --noEmit && bunx eslint src/stores/ui  # clean
cd client && bun run lint:boundaries                         # 5/5
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules  # prints nothing
```
Manual: none.

## Definition of done
- [ ] Store with D8 fields, actions and computeds; header written.
- [ ] Tests listed above green; persisted-UI suites untouched.
- [ ] One commit `transform(06):`; no lockfile.
