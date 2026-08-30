# 02 — One undo entry per lighting stroke

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/hooks/useLightingPaint.ts` · `client/src/ui/hooks/__tests__/useLightingPaint.dom.test.ts` · `client/src/stores/domain/__tests__/PixelStoreLighting.test.ts`
**Effort:** S

## Objective
A lighting paint stroke — one press, drag, release on the normal or height canvas — becomes
**exactly one undo entry**, matching the pixel studio. Today it produces one entry per pointer
move (measured), so undoing a 40-cell drag takes 40 presses of ⌘Z.

## Context
- **The owner explicitly asked for this** (2026-08-29). It is independent of the split; it lands
  in W1 so the split work never has to reason about it.
- **The mechanism already exists and is used three times in this very file.**
  `client/src/stores/history/HistoryStore.ts` exposes `beginTransaction(label)` /
  `endTransaction()`; commands recorded while a transaction is open **buffer into it**, and
  `endTransaction` collapses them into a single `CompositeCommand`. `PixelStore`'s own header
  documents this as the stroke invariant (`stores/domain/PixelStore.ts:52-56`: "During a stroke
  transaction those per-move commands buffer into the open transaction and `endStroke` collapses
  them into a single `CompositeCommand` — one drag stays exactly one undo entry"). Existing call
  sites to copy: `PixelStore.ts:1201/1207` (`"Adjust color"`, opened only when tracking, closed
  from a `finally`), `:1446/:1467` (`"Compute normals"`), `:1594/:1620` (`"Generate height map"`).
- ⚠️ **Read `PixelStore.ts:948-961` before writing anything.** It documents the trap: *a
  transaction opened while another is already open COMMITS the outer one first* (pinned legacy
  nested-`beginStroke` behaviour). So this task must **never** open a second transaction while one
  of its own is in flight, and must always close from a `finally`.
- **Where the strokes live:** `client/src/ui/hooks/useLightingPaint.ts` (171 lines) —
  `beginStroke(cell, erase)` `:121-135`, `continueStroke(cell, erase)` `:137-156`, `endStroke()`
  `:158-161`, and the private `apply(cells, erase)` `:107-119` which dispatches to
  `paintHeights` (height mode) or `paintNormals`. Refs: `isPaintingRef` `:101`,
  `lastPaintPixelRef` `:102`.
- ⚠️ **`ui/` may not import a store.** `useLightingPaint` is under `ui/hooks/`, so it cannot call
  `history.beginTransaction` itself — ESLint will refuse and `lint:boundaries` will fail. The
  transaction must arrive as **two optional callbacks in the options object**, supplied by the
  container (task 04 wires them). This is the same props-in/callbacks-out shape the hook already
  uses for `paintNormals` / `paintHeights`.
- The container's paint callbacks are `LightingCanvasContainer.tsx:296-322`
  (`paintNormals` → `app.pixels.setNormalPixels(cells, app.selectionUI.writeOptions)` `:303-306`;
  `paintHeights` → `setHeightPixels` `:313-317`). Both are undoable per call — that is exactly
  what the transaction collapses.
- **Existing pinned behaviour you must not break** (`ui/hooks/__tests__/useLightingPaint.dom.test.ts`,
  153 lines): `:38` a 50-cell stroke causes ZERO renders beyond mount; `:59` `isPainting` is a ref,
  not rendered state; `:85` a repeat of the already-painted cell is skipped; `:96`
  `continueStroke` with no stroke in flight is ignored; `:105` the cursor rests on the last
  *painted* cell; `:124` height mode forwards `erase`; `:144` a brush resolving to no cells paints
  nothing. The transaction callbacks must not cause a re-render — keep them out of state.

## Steps
1. Extend `UseLightingPaintOptions` (`useLightingPaint.ts:57-73`):
   ```ts
   /**
    * Open a history transaction for one stroke. Every paint call made between
    * this and `onStrokeEnd` collapses into a SINGLE undo entry. Optional so the
    * hook stays usable (and testable) without a history store.
    */
   onStrokeStart?: (label: string) => void;
   /** Close the transaction opened by `onStrokeStart`. Always called if it was. */
   onStrokeEnd?: () => void;
   ```
2. In `beginStroke` (`:121-135`): call `onStrokeStart?.(label)` **before** the first `apply()`,
   where `label` is `editMode === "height" ? "Paint heights" : "Paint normals"`. Track that a
   transaction is open in a **ref** (e.g. `strokeOpenRef`), never state.
3. In `endStroke` (`:158-161`): if the ref says a transaction is open, call `onStrokeEnd?.()` and
   clear the ref. Do this **before** clearing the other refs, and make it safe to call twice —
   `endStroke` is invoked from both `onMouseUp` and `onMouseLeave`
   (`LightingCanvasContainer.tsx:565`, `:567-570`), so a double close must not fire two
   `endTransaction()` calls.
4. Also close the transaction if the hook **unmounts** mid-stroke (a `useEffect` cleanup that
   calls the same guarded close). An unmount with a transaction still open would swallow every
   subsequent edit into it — the exact failure `PixelStore.ts:958-960` warns about.
5. Add cases to `useLightingPaint.dom.test.ts`:
   - a full `begin → continue ×3 → end` calls `onStrokeStart` exactly once (with
     `"Paint normals"`) and `onStrokeEnd` exactly once;
   - height mode passes `"Paint heights"`;
   - `endStroke()` called twice fires `onStrokeEnd` only once;
   - a `beginStroke` whose brush resolves to no cells still opens **and** closes exactly one
     transaction (or opens none at all — pick one, assert it, and state which in your report);
   - unmount mid-stroke closes the transaction;
   - the existing `:38` zero-renders assertion still holds **with the callbacks supplied**.
6. Add a case to `client/src/stores/domain/__tests__/PixelStoreLighting.test.ts` proving the
   store side of the contract end to end: open a transaction, call `setNormalPixels` three times
   with different cells, close it, then assert **one** `undo()` restores all three. Follow the
   existing suite's construction helpers (`:213` describes the `setNormalPixels`/`setHeightPixels`
   block). This is the test that actually pins "one drag = one undo entry".
7. Commit: `fix(lighting): one undo entry per paint stroke`.

## Constraints
- **`ui/` purity:** no store, MobX, API or `useContext` import in `useLightingPaint.ts`. The
  transaction arrives as callbacks.
- Do **not** modify `PixelStore.ts` or `HistoryStore.ts` — the primitive already exists and is
  already correct. If you believe it needs a change, stop and report.
- Do not change `LightingCanvasContainer.tsx` — task 04 owns that file and supplies the
  callbacks. Until then the options are optional and behaviour is unchanged.
- Do not break any of the seven pinned cases listed in Context.
- Never run `vitest -u`.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/ui/hooks src/stores/domain
cd client && bunx vitest run src/ui/hooks src/stores/domain      # all pass, incl. new cases
cd client && bun run lint:boundaries                             # OK — all 5 rules hold
cd client && bunx prettier --check src/ui/hooks/useLightingPaint.ts src/ui/hooks/__tests__/useLightingPaint.dom.test.ts src/stores/domain/__tests__/PixelStoreLighting.test.ts
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
**Manual:** none possible in this task — with no container wiring yet the callbacks are unused at
runtime. The real end-to-end check ("drag across 10 cells, press ⌘Z once, the whole stroke
disappears") is manual check 6 in task 06. Say so in your report rather than claiming it.

## Definition of done
- [ ] `onStrokeStart` / `onStrokeEnd` exist, are optional, and default behaviour is unchanged.
- [ ] Double-close and unmount-mid-stroke are both safe.
- [ ] Hook tests cover open-once/close-once, label per mode, double close, unmount, and the
      existing zero-render pin still passes.
- [ ] A `PixelStoreLighting` test proves three buffered lighting writes collapse to one undo.
- [ ] `PixelStore.ts` and `HistoryStore.ts` are untouched.
- [ ] One commit, only the three `Touches` files staged.
