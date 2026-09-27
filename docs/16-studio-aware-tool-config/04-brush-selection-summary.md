# 04 — Publish the brush selection so its Tool Options section is real

**Wave:** W3 · **Depends on:** 02
**Touches:** `client/src/stores/ui/BrushUIStore.ts` · `client/src/stores/ui/__tests__/BrushUIStore.test.ts` · `client/src/containers/BrushCanvasContainer.tsx` · `client/src/containers/RightSidebarTopControlsContainer.tsx` · `client/src/containers/__tests__/RightSidebarTopControlsContainer.dom.test.tsx` · `client/src/containers/brush/__tests__/useBrushSelection.dom.test.ts`

**Effort:** M

## Objective

After this task the brush studio's Selection tool shows a **live** Tool Options section —
the selection's width × height and pixel count, and a Clear button that actually clears the
brush mask. Task 02 left that section wired to `null` with a comment; this task supplies the
real value.

## Context

### Why this needs a store field at all

The brush studio's selection mask is **React state inside a hook**:
`client/src/containers/brush/useBrushSelection.ts:142` —

```ts
const [mask, setMaskState] = useState<ReadonlySet<number> | null>(null);
```

It is NOT `SelectionUIStore`. `containers/brush/brushSelection.ts:5-18` records why: that
store's geometry helpers are module-private, every public entry replaces its observable, and
that observable is the *pixel* project's, sized by `ApplicationStore.selectionDims`.

The rail is a **different container** (`RightSidebarTopControlsContainer`) from the canvas
(`BrushCanvasContainer`), with no parent that holds both — `BrushStudioContainer` renders
them into separate layout slots (`BrushStudioContainer.tsx:96`, `:99-105`). React state in
one cannot be read by the other. So a small observable summary has to cross the gap, and
`BrushUIStore` is where the brush studio's other session-only UI state already lives
(`selectedDelta`, `fillDelta`, `deltaTarget`, camera, playback).

### ⚠️ Publish a SUMMARY, never the mask

`BrushUIStore` must hold `{ width, height, pixelCount } | null` — three numbers — **not the
`Set`**. This is a standing rule with two independent reasons:

1. `RightSidebarTopControlsContainer.tsx:19-32` already states it for the pixel side: the
   mask "can hold tens of thousands of packed indices on the owner's real project", so the
   container projects three numbers and "the `Set` never becomes a prop. Same rule as
   'never pass an observable array or a domain node'."
2. `CLAUDE.md`: never deep-observe a pixel grid. A `Set` of packed cell indices put into a
   plain `observable` is the same modelling error with the same symptom — it presents as
   "MobX is slow".

Declare the field `observable.ref` and replace it wholesale, exactly as
`selectedDelta` / `fillDelta` are declared (`BrushUIStore.ts:143-144`).

### ⚠️ There are up to TWO canvas panes — exactly one may write

`BrushCanvasContainer` is rendered **once per open render mode**
(`BrushStudioContainer.tsx:100-103`, `CanvasSplit`), so two instances can be live, each with
its own `useBrushSelection`. The hook already has a single-owner rule you must reuse rather
than invent: `BrushCanvasContainer.tsx:244` —

```ts
enabled: hasDoc && views.keyboardOwner === renderMode,
```

`keyboardOwner` is a computed on `CanvasViewsUIStore` (`:75`) preferring `"full"`. **Gate the
publish on the same condition.** A non-owning pane must publish nothing — not `null`, not its
own summary — or the two panes will fight and the rail will flicker between them.

### How to publish without a render-phase write

Write the summary from an **effect**, never during render — a render-phase store write under
React 19 StrictMode's double invoke is a re-entrancy bug, and MobX will warn.

The values you need are already computed by the hook and exposed on its return
(`useBrushSelection.ts:105-126`): `mask` (for `.size`) and `bounds`
(`SelectionBounds` → `width`, `height`). Derive the three numbers and write them in a
`useEffect` keyed on those primitives, so the effect re-runs only when a number actually
changes.

⚠️ **Clear the field on unmount and when the pane stops owning the keyboard.** The effect's
cleanup must set it to `null`; otherwise leaving the brush studio, or closing the owning
pane, leaves a stale summary the rail keeps showing.

### Clear must clear the BRUSH mask

`selection.clear` already exists on the hook's return (`useBrushSelection.ts:123`). The rail's
Clear button currently calls `selectionUI.clearSelection()` — the pixel store — which in
brush mode would do nothing visible and would silently mutate the pixel project's selection.

That callback also has to cross the container gap. Put it on `BrushUIStore` the same way:
a plain field holding `(() => void) | null`, declared `observable.ref`, published by the
owning pane's effect alongside the summary and nulled in the same cleanup.

⚠️ Hold the callback in a **ref-backed stable wrapper**, not the hook's raw `clear`
identity — `clear` is `useCallback`-stable today (`useBrushSelection.ts:161`) but depending
on that would make the store's identity churn if it ever gained a dep. Publish a wrapper
whose identity never changes and which calls the latest `clear` through a ref, the same
latest-first pattern `useBrushSelection.ts:148-152` (`hostRef`) already uses.

### The pattern to follow

MobX. `observer()` only in `containers/`. `BrushUIStore` is **session-only and never
persisted** — its header (`:14-19`) states it has no `hydrate` and is unknown to
`UIStore.toPersistedUIState()`. **Keep it that way**: adding a persisted field here would
touch the wire format and, through it, the 151 corpus snapshots. Your two new fields are
session-only, like `deltaTarget`.

There is no history involvement: a selection is not undoable in the brush studio (no such
entry exists today) and you must not add one.

### Traps

- `bounds` is `null` whenever `mask` is `null`, and `mask` is normalised so an empty set
  becomes `null` (`useBrushSelection.ts:155-159`). So "no selection" is one state, not two.
  Publish `null`, and let the rail's existing "no selection" rendering handle it.
- Do not add the summary to `adoptDocument` (`BrushUIStore.ts:197-215`). The hook already
  resets its mask on document-identity change (`:163-174`) and the effect will publish the
  resulting `null`. Two writers is the bug.
- Task 02's comment in `RightSidebarTopControlsContainer.tsx` says the real summary comes
  from task 04. **Replace that comment** with what you actually built; do not leave it
  pointing at a task that has landed.
- Keep the pixel-mode path untouched: in pixel mode the container must still read
  `selectionUI` and must still pass `selectionUI.expandSelection` / `shrinkSelection` /
  `clearSelection`.

## Steps

1. `BrushUIStore.ts`: add

   ```ts
   /** The brush canvas's live selection, as three numbers — NEVER the mask. */
   selectionSummary: { width: number; height: number; pixelCount: number } | null = null;
   /** Clears that selection; owned by the keyboard-owning pane. */
   clearSelectionHandler: (() => void) | null = null;
   ```

   both `observable.ref` in the `makeObservable` map, with one `action` setter each (or one
   setter taking both — your call, but say which and why in a comment). Document above them:
   session-only, never persisted, never the `Set`, single writer = the keyboard-owning pane.

2. Extend `stores/ui/__tests__/BrushUIStore.test.ts`: the fields default to `null`; the
   setters replace wholesale; setting `null` clears. Pin that `selectionSummary` is
   `observable.ref` by asserting a mutation of the held object is NOT observed — mirror
   however the existing suite pins `selectedDelta`'s ref-ness (read it first and copy the
   technique rather than inventing one).

3. Commit: `feat(16): brush selection summary on BrushUIStore`.

4. `BrushCanvasContainer.tsx`: add the publishing effect. Derive
   `width`/`height`/`pixelCount` from `selection.bounds` and `selection.mask`; gate on the
   same `hasDoc && views.keyboardOwner === renderMode` expression the hook's `enabled` uses
   (extract it to one named local and use it in both places so they cannot drift). Publish a
   ref-backed stable clear wrapper. Cleanup nulls both fields.

5. Commit: `feat(16): publish the brush selection from the owning pane`.

6. `RightSidebarTopControlsContainer.tsx`: in brush mode, source `selectionSummary` from
   `brushUI.selectionSummary` and `onClearSelection` from
   `brushUI.clearSelectionHandler ?? (() => {})`; keep `selectionUI` as the source in pixel
   mode and keep NOT reading it in brush mode. Replace task 02's placeholder comment.

7. Commit: `feat(16): rail reads the brush selection summary`.

8. Extend `client/src/containers/__tests__/RightSidebarTopControlsContainer.dom.test.tsx`
   (created by task 02). Pin, over the real `ApplicationStore` in brush mode with
   `selectedTool="selection"`:
   - with `brushUI.selectionSummary = null`, the "no selection" state renders;
   - with a summary set, the width × height and pixel count appear;
   - clicking Clear invokes `brushUI.clearSelectionHandler` (spy) and does **not** call
     `selectionUI.clearSelection` (⭐ the discriminating case — a rail still wired to the
     pixel store passes every other assertion and fails this one);
   - ⭐ setting a selection on `selectionUI` while in brush mode changes nothing on screen.

   Remember `setStudioMode` also writes `selectedTool` (`LightingUIStore.ts:193-196`): set
   the studio first, the tool second.

9. Extend `client/src/containers/brush/__tests__/useBrushSelection.dom.test.ts` only if your
   change needed a new hook-level behaviour. If you added nothing to the hook, state that in
   your report and leave the file untouched — **remove it from your `Touches` in the
   HANDOFF note rather than making a cosmetic edit to justify it.**

10. Commit: `test(16): pin the brush selection rail wiring`.

## Constraints

- **Never put the mask `Set` on the store.** Three numbers only.
- **Never write the store during render.** Effect only, with cleanup.
- **Exactly one writer**: the keyboard-owning pane. Non-owning panes publish nothing.
- **Do not persist anything.** No `hydrate` entry, no `toPersistedUIState` change, no
  `compactTypes` change. If you find yourself editing anything under `client/src/types/` or
  `client/src/types/codecs/`, stop — you have left this task's scope and are one step from
  the corpus snapshots.
- Do not add undo/history for selections.
- Do not change `SelectionUIStore` or the pixel studio's selection behaviour.
- Do not add lasso, expand or shrink to the brush selection. `brushSelection.ts:17-18`
  defers lasso deliberately; widening the brush selection's capabilities is a separate
  feature, not this task.
- Do not touch `BrushStudioPanelContainer.tsx` (task 03 owns it in the same wave-adjacent
  window; it is not in your `Touches`).

## Verification

```sh
cd client && bunx tsc --noEmit
cd client && bunx vitest run src/stores/ui/__tests__/BrushUIStore.test.ts src/containers/__tests__/RightSidebarTopControlsContainer.dom.test.tsx src/containers/brush
cd client && bunx eslint src/stores/ui/BrushUIStore.ts src/containers/BrushCanvasContainer.tsx src/containers/RightSidebarTopControlsContainer.tsx
cd client && bun scripts/check-boundaries.mjs
cd client && bunx vitest run
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # must print nothing
```

⚠️ Never pass the snapshot-update flag (`CLAUDE.md`). `BrushUIStore` is not persisted, so the
corpus snapshots must be **unchanged**. If any corpus or migration snapshot differs, you have
accidentally touched the wire format: STOP, report the diff, do not update it.

Confirm the non-persistence claim directly:

```sh
cd client && grep -n 'selectionSummary\|clearSelectionHandler' src/stores/ui/UIStore.ts src/types/codecs/compactTypes.ts
```

must print nothing. Paste that.

### Manual checks — NOT optional

`bun run dev`, Brush Studio, brush loaded, layer selected, Selection tool:

1. Drag a rectangle selection. The Tool Options panel shows the correct **width × height**
   and **pixel count**. Check the arithmetic against the cells you selected.
2. Press **Clear** in the rail. The marching ants disappear from the brush canvas. (This is
   the check that proves the callback crossed the container gap.)
3. Drag a selection, then press **Escape** on the canvas. The rail's summary returns to the
   "no selection" state — i.e. the publish flows both ways.
4. **Two panes.** Open the second brush pane (Full + Layer). Make a selection. The rail shows
   one coherent summary, not a flickering one, and it follows the keyboard-owning pane. Then
   close the owning pane and confirm the rail does not keep a stale summary.
5. **Leave and return.** Switch to the pixel studio and back. No stale brush summary; the
   pixel studio's own selection panel behaves exactly as before, including expand/shrink.
6. **Pixel-studio isolation.** Make a selection in the pixel studio, switch to the brush
   studio with the Selection tool active: the rail must NOT show the pixel selection's
   numbers.
7. **StrictMode.** Repeatedly select → clear → switch studio. No duplicated publish, no
   MobX render-phase-write warning in the console (check the console explicitly and say so).

Report each individually with what you saw.

## Definition of done

- [ ] `BrushUIStore` carries the summary and the clear handler, both `observable.ref`, both
      session-only, with the single-writer rule documented.
- [ ] The publish happens in an effect, gated on the keyboard-owning pane, with cleanup.
- [ ] The rail reads brush state in brush mode and `selectionUI` in pixel mode, and reads
      `selectionUI` not at all in brush mode.
- [ ] Task 02's placeholder comment is gone, replaced by an accurate one.
- [ ] `grep` for the two field names in `UIStore.ts` / `compactTypes.ts` prints nothing.
- [ ] Both ⭐ discriminating cases pass.
- [ ] Full `bunx vitest run` green with corpus snapshots UNCHANGED and none updated.
- [ ] tsc, eslint, boundary probe green; no lockfile.
- [ ] All seven manual checks performed and reported, including the console check in 7.
- [ ] Four commits (steps 3, 5, 7, 10), or three plus a stated reason if step 9 was a no-op.
