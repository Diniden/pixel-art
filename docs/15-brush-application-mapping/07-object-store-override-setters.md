# 07 — `ObjectStore` override setters

**Wave:** W2 · **Depends on:** 02
**Touches:** `client/src/stores/domain/ObjectStore.ts` · `client/src/stores/domain/__tests__/subStores.test.ts`
**Effort:** S

## Objective
`app.objects.setBrushLayerTarget(objectId, brushKey, brushLayerId, target | null)` and
`app.objects.setBrushFrameTargets(objectId, brushKey, brushFrameId, deltas | null)` store or remove an
override on a `PixelObject`, as **undoable** project-history commits, always pruning so that an object
with no overrides has **no** `brushApplication` key.

## Context
- `client/src/stores/domain/ObjectStore.ts` (249 lines): `setObjectOrigin(id, origin)` (`:242-248`) is
  the template — `this.mutator.commit("Set origin", true, () => { this.domain.objects = this.domain.objects.map(o => o.id === id ? { ...o, origin } : o); })`.
  `DomainMutator.commit(label, undoable, mutate)` snapshots before, `runInAction`s the mutation, publishes
  and bumps `domainVersion`. The store imports `PixelObject` from `../../types`.
- From task 02 (`@/types`): `BrushLayerTarget`, `BrushApplicationOverride`, `BrushApplicationMap`,
  `pruneBrushApplication`. From task 01: `normalizeDeltaList`.
- **Never** write `brushApplication: undefined` — remove the key by destructuring
  (`const { brushApplication: _drop, ...rest } = o; return rest;`). `digest()` counts a present-undefined
  key as content and every saved project would change shape (MASTER D2, mistake #1).
- `src/store/storeTypes.ts:181` lists `setObjectOrigin` in the legacy facade — do **not** add the new
  methods there; the container calls `app.objects.*` directly.
- Tests live in `client/src/stores/domain/__tests__/subStores.test.ts` (210 lines): `setObjectOrigin`
  test `:158-161`; the "all 6 are UNDOABLE — one snapshot each, recorded BEFORE the mutation" census at
  `:193` — extend its count and list.
- CLAUDE.md: a `stores/domain/` change must leave the corpus suites unchanged (`bunx vitest run src/types`).

## Steps
1. Private helper `withBrushApplication(o: PixelObject, next: BrushApplicationMap | undefined): PixelObject`
   — returns `{ ...rest, brushApplication: next }` when `next` is defined, else `rest` without the key.
2. `setBrushLayerTarget(objectId, brushKey, brushLayerId, target: BrushLayerTarget | null)`:
   read the object; compute the next map (copy on write: new map, new override, new `layers` record;
   set or delete the entry); `pruneBrushApplication`; if the result deep-equals the current value
   (`JSON.stringify` compare is acceptable for these tiny records) return without committing; else
   `mutator.commit("Set brush layer target", true, …)` replacing the object via `withBrushApplication`.
3. `setBrushFrameTargets(objectId, brushKey, brushFrameId, deltas: readonly number[] | null)`: same shape;
   a non-null list is stored as `normalizeDeltaList(deltas)`; label `"Set brush frame targets"`.
4. Both annotated as actions in the store's `makeObservable` block, next to `setObjectOrigin`.
   Commit: `brush-apply(07): ObjectStore brush-application setters`.
5. Tests in `subStores.test.ts`:
   - set a layer target → `objects[0].brushApplication` equals `{ [key]: { layers: { l1: { delta: -1 } } } }`.
   - set a second layer and a frame list → both present; frame list normalised (`[2, 0, 2]` → `[0, 2]`).
   - remove entries one by one with `null` → when the last goes, `"brushApplication" in objects[0]` is
     **false** (not `undefined`-valued).
   - setting the same value twice → second call records **no** history entry and does not bump
     `domainVersion`.
   - other objects and the object's `frames` array are the **same references** after a commit (spine copy
     of the object only).
   - both setters are undoable: `undo()` restores the previous map / removes the key; add them to the
     UNDOABLE census (count 6 → 8).
   Commit: `brush-apply(07): setter tests`.

## Constraints
- Only `ObjectStore.ts` and `subStores.test.ts`. No `types/**`, no `storeTypes.ts`, no `CanvasContainer`.
- No mutation of the existing object/map/override records — copy on write.
- No `undefined`-valued keys anywhere in the written object.

## Verification
```sh
cd client && bunx vitest run src/stores/domain               # green
cd client && bunx vitest run src/types                       # green, snapshots unchanged
cd client && bunx tsc --noEmit && bunx eslint src/stores/domain   # clean; no new warning (ObjectStore.ts stays well under 400 code lines)
git status --porcelain | grep __snapshots__                  # prints nothing
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules  # prints nothing
```
Manual: none.

## Definition of done
- [ ] Both setters exist with D11 semantics (prune, no-op on equal, key removed by destructuring, undoable).
- [ ] Tests cover set/remove/prune/no-op/reference-stability/undo; census updated.
- [ ] Corpus suites unchanged; no snapshot written.
- [ ] Two commits `brush-apply(07):`; no lockfile.
