# HANDOFF — Canvas rendering performance for large editing surfaces

**Current position:** W2 IN PROGRESS (tasks 02, 03 dispatched in parallel)
**Branch:** `feat/03-reflection-tool`
**Last commit:** `cacfafe`

Planned against `5d76ce9` ("Checkpoint: Stable version before optimize"), branch
`feat/03-reflection-tool`, working tree clean.

## Wave ledger

| Wave | Tasks | Status | Date | Commit | Gate output |
| --- | --- | --- | --- | --- | --- |
| W1 | 01 | DONE | 2026-08-30 | `cacfafe` | typecheck 0 · vitest **132 files / 2269 tests passed** · lint:boundaries OK (5/5) |
| W2 | 02, 03 | IN PROGRESS | 2026-08-30 | | |
| W3 | 04 | TODO | | | |
| W4 | 05 | TODO | | | |
| W5 | 06 | TODO | | | |
| W6 | 07 | TODO | | | |
| W7 | 08 | TODO | | | |

Status values: `TODO` · `IN PROGRESS` · `DONE` · `PARTIAL` · `BLOCKED`.

## Deviations

**D-01 (2026-08-30, resolved before W1):** The plan required a clean tree at `5d76ce9`, but
a concurrent session had ~1,900 lines uncommitted across `LayerColors*`, `PaletteManager*`,
rail layout, layout presets and toast. Verified green as-is (typecheck exit 0; vitest
131 files / 2255 tests passing; corpus golden digests unchanged) and confirmed **no overlap
with any task's `Touches` list**. On the owner's instruction it was committed as its own
checkpoint `85bb3d7`, so plan-05 starts from a clean tree. Plan-05 therefore branches from
`85bb3d7`, not `5d76ce9`.

**Revised baseline** (at `85bb3d7`, supersedes the plan's 123/2128): **131 files, 2255
tests, all passing, ~69s.** Task gates should compare against this. After W1: **132 / 2269**.

**D-02 (W1, accepted):** `DomainStore.ts` crossed ESLint's `max-lines` threshold (396 → 404)
from task 01's additions — a **warning**, not an error; `eslint` exits 0 and the gate passes.
Not fixed: splitting the file is outside task 01's mandate. `PixelStore.ts` carries the same
warning but pre-existed at 857 lines (now 875); coordinator verified both independently.

**D-03 (W1, accepted):** The executor added 8 tests beyond the 6 required cases (14 total),
including a guard that the published cells array is a raw array and not a MobX proxy — which
is what would catch a regression of the `observableRef` annotation. Kept.

**D-04 (W1, accepted):** The executor factored the four publish sites through two private
helpers (`publishDirty` / `publishDirtyAll`) rather than inlining `runInAction` four times.
Behaviourally identical, keeps the D8 rationale documented once. `publishAndBump` untouched.

## W1 gate — verified by the coordinator, not taken on report

Re-run independently at `cacfafe`:

```
bun run --cwd client typecheck          → $ tsc --noEmit    (no output)   exit 0
bun run --cwd client lint:boundaries    → check-boundaries: OK — all 5 boundary rules hold.  exit 0
cd client && bunx vitest run
  Test Files  132 passed (132)
       Tests  2269 passed (2269)
    Duration  69.04s
```

Delta vs the `85bb3d7` baseline is exactly **+1 file / +14 tests** — the new
`pixelDirty.test.ts`. No pre-existing test changed status. Corpus golden digests and all
round-trip stability tests passed **unchanged**; `vitest -u` was never run. No lockfile.

Coordinator spot-checks beyond the gate:

- `git diff 85bb3d7..HEAD --stat` → 3 files, **447 insertions, 0 deletions**. Zero removed
  lines structurally proves `publishAndBump`, `bumpPixelVersion` and the `isReplaying` gate
  are unchanged; `publishAndBump` re-read and confirmed verbatim.
- `grep pixelDirty` outside `stores/domain/` → **no matches**. No consumer added (task 07
  owns that), nothing persisted, no codec/migration/fixture touched.
- D8 confirmed by reading the diff: `applyPatch` publishes its region *after*
  `publishAndBump` and *outside* the `isReplaying` early-return, so undo repaints without
  triggering a save.
- `pixelDirty` is annotated `observableRef`, not `observable` (R2).

## Notes for the next session

**⚠️ A concurrent session was editing this repo while this plan was written (2026-08-30).**
At planning time the tree was clean at `5d76ce9`; by the time the plan folder was written,
another session had uncommitted changes across `LayerColors*`, `PaletteManager*`,
`PixelStudioLayout`, `LightingStudioLayout`, `ApplicationStore.ts` and `storeTypes.ts`.

None of those files appear in any task's `Touches` list, so there is no planned collision.
But **before starting W1, confirm the working tree is clean and branch from a known-good
commit** — do not start on top of another session's half-finished work. If those changes are
still uncommitted, coordinate with the owner first.

**Baseline for comparison** (measured 2026-08-30 at `5d76ce9`): `bunx vitest run` →
123 files, 2128 tests, all passing, ~72s. `bun run --cwd client typecheck` → exit 0.
No lockfile present, and none created by the baseline run.
