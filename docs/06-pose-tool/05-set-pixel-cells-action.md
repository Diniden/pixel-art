# 05 — `PixelStore.setPixelCells()` — one atomic colour+normal+height write

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/stores/domain/PixelStore.ts` · `client/src/stores/domain/__tests__/PixelStore.test.ts`
**Effort:** M

## Objective

`PixelStore` gains one new public action, `setPixelCells()`, which writes **colour, normal
and height together** for a batch of cells as a **single history entry**. It is purely
additive: no existing action changes behaviour, no existing test changes, and the wire
format is untouched. The pose stamp (task 08) is its only caller, but it is written as a
general-purpose action.

## ⚠️ Data-safety task — read this first

`client/src/stores/domain/` is one of the four directories `CLAUDE.md` names as
data-safety-critical. `server/src/data/Base Unit.json` is **1.1 MB of the owner's real
work**, with 149 already-migrated backup snapshots and **no pre-migration data anywhere in
the repo** — the migrations have no real-data safety net. A bad refactor here **mangles
pixels silently rather than erroring**.

Therefore:

- **Never run `vitest -u`.** Every snapshot diff in the corpus, round-trip and
  `persistedUIState` suites is a change to the owner's real data and must be read by a human.
  A `PreToolUse` hook blocks `-u`, but treat that as a backstop, not permission to stop
  thinking.
- Your change must be **additive only**. Do not "tidy", refactor, or unify the existing
  write paths while you are in here. Four known migration bugs elsewhere are **pinned as
  characterisation tests, not fixed** — the house rule is to assert observed behaviour, never
  desired behaviour.
- After your change, the corpus/wire-format suites must pass **unchanged**.

## Context — why the three existing actions cannot do this

This is the whole justification for the task (MASTER D9). Verify it yourself before writing
code; if you conclude otherwise, stop and record it in `HANDOFF.md` rather than improvising.

| Action | Line | Why it is insufficient |
| --- | --- | --- |
| `setPixels(pixels, options)` | `:753` | Writes **colour only**. `PixelWrite` is `{x, y, color}` (`:103`). |
| `setNormalPixels(pixels, options)` | `:1323` | Routes through `collectLightingPatches`, which **skips any cell whose colour is `0`**. |
| `setHeightPixels(pixels, options)` | `:1351` | Same colour guard, same structure. |

Chaining them fails in two independent ways:

1. **Every normal and height would be dropped.** The stamp writes colour to
   *previously-empty* cells. In a chained call, `setNormalPixels` runs against the grid as
   it exists at *its own* commit — and the colour guard's rationale (`setNormalPixel` at
   `:1303`: "Can only set normal where color exists") means cells that were transparent
   before the colour commit are filtered. Even where ordering saves it, you are relying on
   commit interleaving for correctness, which is exactly the kind of silent-mangling this
   codebase forbids.
2. **Three undo entries.** The user would press Ctrl+Z three times to remove one stamp.

### The commit engine you must reuse

`private commitCells(target, layer, label, patches, trackHistory)` at `:483` does, in order:

1. `writeGrid(target, writeCells(layer.pixels, patches.map(p => ({x, y, value: p.after}))))`
   — whole-grid **ref replacement**, never in-place mutation (`:492`).
2. If `trackHistory`: `mirror.reconcile()` then
   `history.record(createPixelCommand({label, target, cells: patches, host: this.patchHost}))`
   (`:503-511`).
3. `publishAndBump()` (`:514`) — ⚠️ gated on `isReplaying`; that gate is the no-save-on-undo
   mechanism and must not acquire a second meaning.
4. `publishDirty(layer.id, patches)` (`:518`) — deliberately **not** gated on `isReplaying`
   (D8); it is the only repaint signal undo has.
5. If `trackHistory`: `mirror.syncHistory()`.

⚠️ It **early-returns on an empty patch list** (`:490`). That is correct for your action:
an empty stamp should record nothing and save nothing. Do **not** route through
`commitLighting` (`:1400+`), whose deliberate asymmetry — an empty patch list still *saves* —
is pinned observed legacy behaviour for the lighting paths only.

### The shape to copy

`setPixels` (`:753-785`) is your structural template:

```ts
setPixels(pixels: readonly PixelWrite[], options: PixelWriteOptions = {}): void {
  if (pixels.length === 0) return;
  const resolved = this.resolveTarget(options.variantFrameIndex);
  if (!resolved) return;
  const { target, layer, width, height } = resolved;

  const patches: PixelPatch[] = [];
  const seen = new Map<number, number>();          // packed key -> patch index
  for (const { x, y, color } of pixels) {
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    if (!this.allows(x, y, width, height, options)) continue;
    const key = y * width + x;
    /* later writes to the same cell win, and only ONE patch is recorded */
    ...
  }
  this.commitCells(target, layer, "Draw", patches, options.trackHistory ?? true);
}
```

Reuse exactly: `resolveTarget` (`:333-393`), the bounds filter, the mask gate
`allows(x, y, width, height, options)` (`:457-470`), and the **later-wins dedupe keyed on
`y * width + x`** — one patch per cell, because two patches for one cell make undo restore
an intermediate value.

⚠️ `setPixels` deliberately has **no same-colour early return** where `setPixel` does; that
asymmetry is pinned observed behaviour. Match `setPixels`: **no same-value filter.**

### The action to write

```ts
/** One cell's full contents: colour, normal and height together. */
export interface PixelCellWrite {
  x: number;
  y: number;
  color: Color | 0;
  normal: Normal | 0;
  height: number;
}

setPixelCells(cells: readonly PixelCellWrite[], options: PixelWriteOptions = {}): void
```

Each patch's `after` is built from the existing cell (via the same `copyCell`/`nextCell`
helpers the file already uses) with **all three members** replaced. Label the history entry
`"Stamp pose"` — a distinct, user-legible label; check how existing labels read
(`"Draw"`, `"Set normal"`, `"Set normals"`, `"Set heights"`) and match their register.

⚠️ **No colour guard.** Unlike the lighting paths, this action writes all three members
atomically, so "colour must already exist" is neither necessary nor correct — the colour is
arriving in the same patch. Document that difference in the doc comment explicitly, because
it is the exact thing a future reader will assume was an oversight.

⚠️ `stores/domain/**` may **never** import from `stores/ui/**` (boundary rule 4). Your action
takes plain data; it must not reach for `app.pose`.

## Steps

1. Read `PixelStore.ts` around `:453-530` (`allows`, `commitCells`), `:718-800`
   (`setPixel`/`setPixels`) and `:1289-1400` (the lighting writes + `commitLighting`) so the
   asymmetries are in your head before you write anything.
2. Add the `PixelCellWrite` interface next to `PixelWrite` (`:103`), documented.
3. Implement `setPixelCells` following the `setPixels` template: empty-list guard,
   `resolveTarget`, bounds filter, `allows` mask gate, later-wins dedupe, patches with all
   three members replaced, then `commitCells(..., "Stamp pose", patches,
   options.trackHistory ?? true)`.
4. Write a doc comment covering: it writes all three members atomically; **why there is no
   colour guard** (contrast with `setNormalPixels`); that it produces **one** history entry;
   that it honours the edit mask; and that it exists because the three older actions cannot
   express an atomic three-channel write.
5. Extend `client/src/stores/domain/__tests__/PixelStore.test.ts`. Cover at minimum:
   - all three members land on a **previously empty** cell (the case the lighting actions
     would have dropped) — this is the central assertion;
   - **exactly one** history entry is recorded for a multi-cell batch, and one `undo()`
     reverts **every** cell, including normals and heights;
   - out-of-bounds cells are filtered, not thrown on;
   - an `editMask` excludes the masked cells;
   - duplicate coordinates in one batch produce **one** patch, later wins;
   - `trackHistory: false` records no history entry but still writes;
   - an empty array is a complete no-op (no history, no bump).
6. Run the full verification, **including the corpus safety check**. **Commit after step 6**:
   `feat(pixels): setPixelCells — atomic colour+normal+height write in one history entry`.

## Constraints

- **Additive only.** Do not modify `setPixel`, `setPixels`, `setNormalPixel`,
  `setNormalPixels`, `setHeightPixels`, `commitCells`, `commitLighting`, `allows`,
  `resolveTarget`, or any existing test.
- **Never `vitest -u`.** Corpus, wire-format and round-trip snapshots must pass unchanged.
- Do not import from `stores/ui/**`.
- Never mutate a pixel grid in place; `commitCells` does ref replacement and you must go
  through it.
- Do not add a same-value early return (match `setPixels`, not `setPixel`).
- Do not route through `commitLighting`.
- Do not add anything to the wire format or `toPersistedUIState()`.

## Verification

From `client/`:

```sh
bunx tsc --noEmit                                   # exit 0
bunx eslint .                                       # 0 errors
bunx vitest run                                     # ALL pass — no updated snapshots
bun run lint:boundaries                             # OK — proves no stores/ui import
bunx stylelint "src/**/*.css"                       # exactly 2 errors (unchanged)
```

**Corpus safety check (required — this is a `stores/domain/` change):**

```sh
bunx vitest run \
  src/stores/domain/__tests__/wireFormat.test.ts \
  src/stores/domain/__tests__/pixelGridContract.test.ts \
  src/stores/domain/__tests__/PixelStore.test.ts \
  src/stores/domain/__tests__/PixelStoreLighting.test.ts \
  src/stores/ui/__tests__/persistedUIState.test.ts
```

All must pass **with no snapshot writes**. Then confirm nothing was rewritten:

```sh
git status --short -- '*__snapshots__*' 'client/src/**/*.snap'    # must be empty
```

From the repo root:

```sh
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules       # nothing
```

**Manual checks:**

1. `bun run dev` starts and a project loads normally.
2. Draw, erase, flood fill, and use the lighting studio's normal and height tools — **all
   unchanged**. This is the regression check that your addition did not disturb the shared
   commit engine.
3. Undo/redo across a mixed sequence (draw, normal, height) behaves exactly as before.
4. The save indicator still behaves normally — no spurious saves.

## Definition of done

- [ ] `PixelCellWrite` is declared and documented.
- [ ] `setPixelCells` writes colour, normal and height in **one** `commitCells` call.
- [ ] Its doc comment explains the absent colour guard and contrasts it with
      `setNormalPixels`.
- [ ] It honours bounds, the edit mask, later-wins dedupe, and `trackHistory`.
- [ ] Tests cover the empty-cell case, single-history-entry + full undo, bounds, mask,
      dedupe, `trackHistory: false`, and the empty-array no-op.
- [ ] **No existing action or test was modified.**
- [ ] The corpus/wire-format/persistedUIState suites pass **unchanged**, with **no `-u`**
      and no snapshot files touched in `git status`.
- [ ] Full gate green; no lockfile.
- [ ] All 4 manual checks performed and recorded.
- [ ] One commit, containing only this task's hunks.
