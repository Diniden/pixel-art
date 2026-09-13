# 01 — Dirty-region channel on the domain store

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/stores/domain/DomainStore.ts` · `client/src/stores/domain/PixelStore.ts` · `client/src/stores/domain/__tests__/pixelDirty.test.ts` (new)
**Effort:** M

## Objective

`DomainStore` gains a `pixelDirty` observable that names exactly which cells of which layer
changed in the last pixel write. `PixelStore` publishes it on **both** the normal write path
and the undo/redo replay path. Nothing consumes it yet — task 07 does. After this task the
information the renderer needs to stop repainting everything exists and is tested.

## Context

### The data already exists and is thrown away

`PixelStore.commitCells` (`stores/domain/PixelStore.ts:483-518`) is the single funnel for
every pixel write. It already receives:

```ts
private commitCells(
  target: PixelTarget,
  layer: Layer,
  label: string,
  patches: readonly PixelPatch[],   // ← {x, y, before, after} per cell
  trackHistory: boolean,
): void
```

`PixelPatch` carries exact coordinates. The method writes the grid, records history, then
calls `this.publishAndBump()` (`:514`) — and the patches go out of scope. You are adding a
publish of that same data, not building new tracking.

### ⚠️ `pixelVersion` must not change its semantics

`DomainStore.pixelVersion` (`:199`) is observed by `AutoSaveController`
(`stores/session/AutoSaveController.ts:171, 244`). `publishAndBump`
(`PixelStore.ts:601-606`) is gated on `history.isReplaying`:

```ts
private publishAndBump(): void {
  const project = this.domain.currentProject();
  if (project) this.mirror.publish(project);
  if (this.history.isReplaying) return;      // ← no bump during undo/redo
  runInAction(() => this.domain.bumpPixelVersion());
}
```

The long comment at `:580-600` explains this is the **no-save-on-undo** mechanism the owner
decided on 2026-08-16, pinned by `autoSave.test.ts:225`. **Do not touch this method's
existing behaviour.** Add a separate channel; do not repurpose `pixelVersion`.

### ⚠️ The replay path is why this is not a one-liner (D8)

`applyPatch` (`PixelStore.ts:613-646`) handles undo/redo. It writes the recorded side of
each cell back and calls `publishAndBump()` — which **publishes the tree but skips the
bump**. The tree still reaches the canvas during a replay; only the save trigger is
suppressed.

So a dirty region published only from `commitCells` would be missing on undo, and task 07's
incremental renderer would leave undone pixels on screen. `applyPatch` must publish its own
dirty region, **outside** the `isReplaying` gate.

### The shape to add

```ts
/** Cells changed by the most recent pixel write. `null` = "repaint everything". */
export interface PixelDirtyRegion {
  /** The layer whose grid changed. */
  layerId: string;
  /** Changed cells, in the layer's own grid space. */
  cells: readonly { x: number; y: number }[];
}
```

`null` is load-bearing: it is the safe default that keeps every unhandled path
correct-but-slow (Risk R6). Any writer that cannot describe its region publishes `null`.

### Where to put the observable

Follow `pixelVersion` exactly. In `DomainStore.ts`:

- field declaration next to `pixelVersion` (`:199`)
- registered in `makeObservable` (`:232`) — use **`observableRef`**, not `observable`. The
  region holds an array; deep-observing it would be the same modelling error as
  deep-observing a pixel grid. `objects` and `variants` at `:225-227` show the house style
  and the R2 comment.
- a `setPixelDirty(region: PixelDirtyRegion | null)` action next to `bumpPixelVersion`
  (`:266`).

### Getting `layerId`

`commitCells` takes `layer: Layer`, so `layer.id` is directly available. `applyPatch`
resolves its layer via `findLayer(target)` (`:648-666`) and returns early if null — publish
after that guard, using the resolved layer's `id`.

## Steps

1. Add `PixelDirtyRegion` to `stores/domain/DomainStore.ts` (exported), with a doc comment
   stating that `null` means "repaint everything" and that consumers must handle it.
2. Add the `pixelDirty: PixelDirtyRegion | null = null` field beside `pixelVersion`,
   register it as **`observableRef`** in `makeObservable`, and add a
   `setPixelDirty` action registered as `action`.
3. In `PixelStore.commitCells`, after the existing `this.publishAndBump()` call at `:514`,
   publish the region built from `patches` and `layer.id`. Wrap in `runInAction` — match how
   `publishAndBump` does it at `:605`.
4. In `PixelStore.applyPatch`, after `this.publishAndBump()` at `:645`, publish the region
   built from `cells` and the resolved layer's `id`. **This is the D8 requirement — it must
   fire during replay, when the version bump does not.**
5. Audit every other caller of `writeGrid` in `PixelStore.ts` that does *not* route through
   `commitCells`. For each, publish `setPixelDirty(null)`. Grep: `grep -n "writeGrid\|publishAndBump" stores/domain/PixelStore.ts`.
   Do not guess — read each call site and record in your report which paths you found and
   what each publishes.
6. Write `stores/domain/__tests__/pixelDirty.test.ts`. Copy the harness setup from an
   existing domain test — `stores/domain/__tests__/` has several; pick the one that already
   exercises `setPixel`/`setPixels` and undo.
7. Run the gate. Commit.

## Constraints

- **Do not modify `publishAndBump`'s existing behaviour**, its `isReplaying` gate, or
  `bumpPixelVersion`. Add alongside; change nothing.
- **Do not change any serializer, codec, migration, or wire type.** `pixelDirty` is
  **runtime-only** and must never be persisted. Do not add it to `UIState`,
  `CompactUIState`, `toPersistedUIState`, or any fixture.
- `observableRef`, never `observable` — see `CLAUDE.md`'s "never deep-observe a pixel grid".
- Do not add a consumer. No container or renderer changes in this task.
- Do not touch `LayerStore`, `VariantStore`, or `DomainMutator`.

## Verification

```sh
bun run --cwd client typecheck
cd client && bunx vitest run
bun run --cwd client lint:boundaries
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # must print nothing
```

Expected: typecheck exits 0; **123+ files / 2128+ tests pass**, with the corpus snapshot
tests passing **unchanged** (baseline measured 2026-08-30: 123 files, 2128 tests, ~72s).
Paste the real tail of the vitest output into your report.

⚠️ If any corpus or migration snapshot fails, **stop and report**. Do not run `vitest -u`
— it is blocked by a hook and would overwrite a record of the owner's real data.

New tests must cover:

1. `setPixel` publishes a region with the right `layerId` and exactly one cell.
2. `setPixels` publishes one region containing every written cell (and, per
   `setPixels`' documented behaviour at `:744-753`, it does **not** filter same-colour
   writes — assert observed behaviour, not desired).
3. A no-op `setPixel` (same colour, `:688`) publishes **nothing** — no region, no bump.
4. **Undo publishes a region** even though `pixelVersion` does not change. Assert both:
   region is non-null AND `pixelVersion` is unchanged. This is the D8 regression test.
5. Redo likewise.
6. A path that cannot describe its region publishes `null`.

## Definition of done

- [ ] `PixelDirtyRegion` exported from `DomainStore.ts` with `null` documented as "repaint everything".
- [ ] `pixelDirty` registered as `observableRef`; `setPixelDirty` registered as `action`.
- [ ] `commitCells` publishes region + `layer.id` for every write.
- [ ] `applyPatch` publishes on **both** undo and redo, during replay.
- [ ] Every non-`commitCells` write path audited and publishing `null`; the list is in the report.
- [ ] `publishAndBump`, `bumpPixelVersion` and the `isReplaying` gate are byte-identical to before.
- [ ] No serializer, codec, migration, wire type or fixture touched.
- [ ] New test file covers all six cases above, including the undo case.
- [ ] Full suite passes with corpus snapshots **unchanged**; real output pasted in the report.
- [ ] No lockfile created.
- [ ] Committed at task granularity.
