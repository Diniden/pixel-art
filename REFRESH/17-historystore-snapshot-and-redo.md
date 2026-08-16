# 17 — `HistoryStore`: command stack, byte budget, transactions, and redo

**Wave:** W11 · **Depends on:** 16
**Touches:** `client/src/stores/history/HistoryStore.ts` (new) · `client/src/stores/history/commands.ts` (new) · `client/src/stores/ApplicationStore.ts` · `client/src/stores/session/AutoSaveController.ts` (replay guard) · `client/src/store/index.ts` (lines 51-109) · `client/src/store/projectActions.ts` (lines 210-225) · `client/src/store/drawingActions.ts` (lines 10, 27-34) · `client/src/stores/bridge/zustandBridge.ts` · `client/src/components/ColorPicker/ColorPicker.tsx` (undo call site only) · `client/src/stores/history/__tests__/` (new)
**Effort:** L

## Objective

After this task undo/redo is owned by a `HistoryStore` with a bounded command stack, an explicit transaction primitive, and — for the first time — a working **redo**. Behaviour is provably identical to today because every command in this task is still a full snapshot; the memory win comes in a later task when pixel commands become inverse patches.

## Context

### What is being replaced, and what it costs today

`updateProjectAndSave` (`client/src/store/index.ts:51-85`) is the sole sanctioned mutation path and does four unrelated jobs at once:

```ts
const updateProjectAndSave = (updater, trackHistory = false) => {
  const { project, projectHistory, historyIndex, projectName } = get();
  if (!project) return;
  const newProject = updater(project);
  if (trackHistory) {
    const compactProject = projectToCompact(project);        // full serialize
    const clonedProject  = compactToProject(compactProject); // full deserialize
    const newHistory = [...projectHistory.slice(0, historyIndex + 1), clonedProject];
    if (newHistory.length > MAX_HISTORY) newHistory.shift();
    set({ project: newProject, projectHistory: newHistory, historyIndex: newHistory.length - 1 });
  } else {
    set({ project: newProject });
  }
  scheduleAutoSave(newProject, projectName);
};
```

**Measured costs on the owner's real project** (`Base Unit.json`, 1,129,965 bytes, 300,249 pixel cells):

| Cost | Value |
| --- | --- |
| Heap per runtime `Project` snapshot | **6.9 MB** (measured with `Bun.gc(true)` + `heapUsed`, N=5) |
| Heap at `MAX_HISTORY = 100` | **~680 MB** |
| CPU per history-tracked mutation | **5.1 ms, synchronous, main thread** (the `projectToCompact` → `compactToProject` round trip) |
| Call sites paying that cost | **74 of 129** |
| Extra per snapshot | the full base64 PNG of `referenceImage` — a 1 MB reference image cloned 100× is 100 MB of duplicated PNG |

The pixel grid dominates: 300,249 `PixelData` objects, most structurally identical between consecutive snapshots. **The current design pays full-project cost for what are almost always single-pixel deltas.**

### Why a bespoke command stack and not a library

| Option | Assessment against this codebase | Verdict |
| --- | --- | --- |
| Port today's snapshot stack | Preserves every number above and adds nothing | Reject — it is the problem |
| `mobx-state-tree` | Every node must be a declared model and MST **copies on assignment**. The 300k-cell grid becomes 300k MST nodes. Requires rewriting 7 recursive types plus a 44-field `UIState` before a single feature works. | Reject |
| `mobx-keystone` | Lighter, gives `onPatch`/`applyPatch`/`UndoManager` free, does not copy on assignment. Still needs `@model` classes for the whole tree and still wraps array elements — the 300k grid problem is reduced, not solved. | Viable fallback, not the recommendation |
| **Bespoke command / inverse-patch on plain MobX observables** | The store already knows the exact shape of every mutation: `setPixel` knows `(x,y,old,new)`; `moveLayer` knows `(from,to)`; `deleteFrame` knows the frame it removed. An entry is ~40 bytes, not 6.9 MB. `beginStroke`/`endStroke` already define the batching boundary. **It is the only option that lets the grid stay a plain non-observable buffer** — which is what `<canvas>`-style imperative rendering actually wants. | **Recommended** |

Every library option must represent the 300k-cell grid inside its reactive tree, and they solve "arbitrary unknown mutations" — a problem this app does not have, since every mutation goes through one of ~155 named actions.

### The shape

```ts
// client/src/stores/history/commands.ts
export interface Command {
  readonly label: string;          // "Draw", "Delete frame", "Resize object"
  readonly bytes: number;          // estimated cost, charged against the budget
  undo(): void;
  redo(): void;
}

// client/src/stores/history/HistoryStore.ts
class HistoryStore {
  entries: Command[] = [];              // observable.shallow
  index = -1;                           // observable
  isReplaying = false;                  // observable — the auto-save guard
  private txn: Command[] | null = null;

  get canUndo() { return this.index >= 0; }
  get canRedo() { return this.index < this.entries.length - 1; }
  get historyBytes() { /* sum */ }

  beginTransaction(label: string): void;   // was: beginStroke
  endTransaction(): void;                  // was: endStroke — collapses to one CompositeCommand
  record(cmd: Command): void;              // no-op while isReplaying
  snapshot(label: string): void;           // full-clone escape hatch
  undo(): void; redo(): void;
  clear(): void;                           // on project switch
}
```

### Byte budget, not entry count

Replace `MAX_HISTORY = 100` (`storeTypes.ts`) with **`MAX_HISTORY_BYTES = 64 * 1024 * 1024`**, evicting from the front until under budget. A count cap is meaningless when entries span 40 bytes to 6.9 MB. 64 MB allows roughly **50,000 pixel-level undos** or **9 full snapshots** — both far better than today's uniform 100. Make it configurable through `ApplicationStore`'s options object so it can be tuned, and expose `historyBytes` in dev.

### This task ships SNAPSHOT-ONLY commands

**Every command in this task is a full snapshot, so behaviour is identical to today.** That is the entire point: task 08's characterisation suite must pass **unchanged**. Inverse-patch commands come in the pixel-store task, one family at a time, with the suite re-run after each.

The three eventual families, for context (only the third is implemented here):

| Family | Ops | Entry cost |
| --- | --- | --- |
| Inverse patch (later) | `setPixel(s)`, `setNormalPixels`, `setHeightPixels`, `adjustColor`, `moveSelectedPixels`, `deleteSelectionPixels`, `setVariantOffset` | ~24 bytes per changed pixel — a 50-pixel stroke is ~1.2 kB |
| Structural inverse (later) | `addLayer`, `deleteLayer`, `moveLayer`, `addFrame`, `deleteFrame`, `reorderFrame`, `renameObject`, `addVariant`, `deleteVariant`, clipboard ops | size of the removed/added node only; grids are **moved**, not cloned |
| **Snapshot (this task, and permanently for ~11 ops)** | `resizeObject`, `resizeVariant`, `flipHorizontal`, `flipVertical`, the 4 `squashLayer*` variants, `computeNormalsForAllFrames`, `pasteLayerFromClipboard` | up to 6.9 MB, charged honestly |

**Honest caveat:** the snapshot family is genuinely no better than today. It is ~11 of ~155 actions, all already visibly slow, user-initiated and infrequent. Say so; do not hide it.

**`referenceImage` is excluded from every command.** Today it is cloned into all 100 snapshots. `setReferenceImage` stays non-undoable, exactly as it is today (`referenceActions.ts:47`, comment: *"Don't track reference image changes in history"*).

### Port the 129-site `trackHistory` classification verbatim

It is already a hand-audited answer to "what is undoable". **Do not re-derive it.** The census:

| Module | `true` | `false` | `!_strokeActive` | Total |
| --- | ---: | ---: | ---: | ---: |
| `toolActions.ts` | 0 | **33** | 0 | 33 |
| `variantActions.ts` | 17 | 3 | 0 | 20 |
| `layerActions.ts` | 15 | 1 | 0 | 16 |
| `lightingActions.ts` | 14 | 0 | 0 | 14 |
| `frameActions.ts` | 8 | 1 | 0 | 9 |
| `objectActions.ts` | 6 | 1 | 0 | 7 |
| `layerClipboardActions.ts` | 5 | 0 | 0 | 5 |
| `paletteActions.ts` | 0 | **5** | 0 | 5 |
| `timelineActions.ts` | 5 | 0 | 0 | 5 |
| `colorAdjustmentActions.ts` | 0 | 1 | 4 (own param) | 5 |
| `selectionActions.ts` | 4 | 0 | 0 | 4 |
| `drawingActions.ts` | 0 | 0 | **4** | 4 |
| `referenceActions.ts` | 0 | 2 | 0 | 2 |
| **Total** | **74** | **47** | **8** | **129** |

Mapping: `true` → record a command; `false` → record nothing; `!_strokeActive` → inside a transaction.

**Palette edits stay non-undoable.** All 5 `paletteActions` pass `trackHistory=false`, so creating, renaming or deleting a palette and adding or removing a colour cannot be undone. That looks like an oversight but it is long-standing behaviour and changing it mid-migration would make undo regressions ambiguous. Preserve it; it is recorded as an open question.

### Stroke batching, promoted

`client/src/store/drawingActions.ts:10` holds a module closure `let _strokeActive = false`. `beginStroke` (`:27-30`) snapshots once via `saveCurrentStateToHistory` then sets the flag; every subsequent `setPixel` during the drag passes `false`. **One drag = one undo entry.** This is the only correct batching mechanism in the store, and it lives in a closure no other module can see.

Promote it to `HistoryStore.beginTransaction()` / `endTransaction()` so variant offsets, normal painting and the AI modal can batch too.

### Redo — new, and the data is already there

There is no redo today: `grep -rni "redo" client/src` returns exactly one hit, a comment in `ColorPicker.tsx:205`. `undo` (`projectActions.ts:210-225`) decrements `historyIndex`, and truncation is deferred to the next push (`index.ts:69`, `slice(0, historyIndex + 1)`), so the data to redo is present and reachable — only the action is missing. Add it.

**Warning:** history semantics are subtle. `projectHistory[historyIndex]` is the **pre-mutation** state (the state to return *to*), and truncation is deferred. A "cleanup" that normalises this off-by-one will silently break undo depth. Task 08 pinned the exact semantics.

### One deliberate behaviour change

**Undo no longer triggers an immediate save.** Today it does (`projectActions.ts:224` calls `scheduleAutoSave`). Under `HistoryStore`, `isReplaying` is set for the duration of `undo()`/`redo()` and `AutoSaveController`'s trigger returns `null` while it is set, so the *next real edit* saves instead. Rationale: a save triggered by replay is indistinguishable from one triggered by an edit, which makes "did the undo persist?" untestable.

**SETTLED — OWNER DECISION (2026-08-16): the owner accepted this change.** It is a deliberate, user-visible behaviour change, not an assumption and not an open question: undo performs **no immediate save**, `isReplaying` guards the save reaction, and the next real edit saves. Implement it as described and state the change in the completion report.

The reversal remains cheap if it is ever wanted: clear `isReplaying` before the final version bump in `undo()` — one line.

## Steps

1. Create `client/src/stores/history/commands.ts` with the `Command` interface and a `SnapshotCommand` factory that captures `compactToProject(projectToCompact(project))` — the same clone the current code uses — and a `CompositeCommand` for transactions.
2. Create `client/src/stores/history/HistoryStore.ts` per the shape above, with the byte budget, `isReplaying`, transactions, `undo`, `redo` and `clear`.
3. Wire `HistoryStore` into `ApplicationStore` and pass it to `AutoSaveController` so the replay guard is live.
4. Replace `store/index.ts:51-109`'s history handling: `updateProjectAndSave`'s `trackHistory=true` branch records a `SnapshotCommand`; `saveCurrentStateToHistory` becomes `history.snapshot(label)`. Keep the mutation and save behaviour otherwise identical.
5. Replace `projectActions.ts:210-225`'s `undo` with a delegation to `history.undo()`, and add a `redo` action.
6. Replace `drawingActions.ts`'s `_strokeActive` closure with `history.beginTransaction("Draw")` / `endTransaction()` in `beginStroke` / `endStroke`.
7. Update `ColorPicker.tsx`'s `saveCurrentStateToHistory` call site (it drives history from a debounce timer — **do not change that timing**).
8. Move `projectHistory` / `historyIndex` from the bridge's Phase A list to Phase B in the same change.
9. Write the tests in Verification.

## Constraints

- **Behaviour must be identical to today.** Task 08's characterisation suite must pass **unchanged** — that is the acceptance criterion for this task. Do not write a single inverse-patch command here.
- **Port the 129-site `trackHistory` classification verbatim.** Do not re-derive it and do not "improve" any site.
- **Do not make palette edits undoable.**
- **Do not put `referenceImage` into any command.**
- Do not change `ColorPicker`'s debounce timing.
- Do not normalise the pre-mutation-snapshot / deferred-truncation semantics.
- Do not make the pixel grid observable.
- `HistoryStore` must not import from `client/src/stores/ui/`.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx eslint . && bun run build
bunx vitest run src/store/__tests__/       # task 08's characterisation suite — UNCHANGED
bunx vitest run src/stores/history         # new HistoryStore suite
bunx vitest run                            # full suite
```

The `HistoryStore` suite must assert:
- **Undo-depth matrix:** 5 distinct edits (add layer, draw a stroke, delete a frame, rename an object, move a variant offset) → 5 undos → byte-identical restoration, compared via `projectToCompact` deep-equality.
- **Stroke batching:** one continuous drag over 50 pixels → **exactly one** new entry.
- **Non-undoable set:** change tool, change zoom, change a palette colour → history length unchanged.
- **Truncation:** a new edit after an undo discards the redo tail.
- **Byte-budget eviction:** with a small configured budget, entries evict from the front.
- **Redo:** undo then redo restores the post-edit state.
- **`isReplaying`:** during `undo()`/`redo()` the auto-save trigger is `null` and no `POST /api/project` fires.

⚠️ **Memory:** never fill history to 100 entries with a realistic project — 6.9 MB × 100 ≈ 680 MB will OOM the worker. Use a tiny fixture (1 object, 1 frame, 1 layer, 4×4 grid) and configure a small budget for the eviction test.

Manual checks:
1. Perform 5 distinct edits, press undo 5×, and confirm the project returns exactly to its starting state.
2. Draw one continuous 50-pixel stroke, press undo once — the whole stroke must disappear.
3. Undo, then redo — the edit must come back.
4. Change tool, zoom, and a palette colour — undo must not revert any of them.
5. Confirm undo does **not** trigger an immediate save (watch the header status), and that the next real edit does.

## Definition of done

- [ ] `HistoryStore` and `commands.ts` exist; `MAX_HISTORY_BYTES` (64 MB, configurable) replaces `MAX_HISTORY`.
- [ ] **Every command in this task is a full snapshot**; no inverse patch was written.
- [ ] Task 08's characterisation suite passes **unchanged**.
- [ ] `beginTransaction`/`endTransaction` replace the `_strokeActive` module closure; one drag is one entry.
- [ ] **`redo` exists and works.**
- [ ] The 129-site `trackHistory` classification is preserved verbatim; palette edits remain non-undoable; `referenceImage` is in no command.
- [ ] `isReplaying` blocks auto-save during replay, and the resulting "no immediate save on undo" change — a deliberate, owner-accepted, user-visible change (2026-08-16) — is stated in the completion report.
- [ ] The bridge's Phase A/B lists were updated in the same change.
- [ ] No test fills history to 100 entries with a realistic project.
