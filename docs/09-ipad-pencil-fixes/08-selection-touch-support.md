# 08 — Rect and lasso selection work under the Pencil

**Wave:** W4 · **Depends on:** 07
**Touches:** `client/src/containers/CanvasContainer.tsx` · `client/src/ui/hooks/useCanvasPointer.ts` · `client/src/containers/__tests__/selectionTouch.dom.test.tsx` (new)
**Effort:** L

## Objective

After this task, the rectangle and lasso selection modes respond to the Apple Pencil
exactly as they do to a mouse: press begins the selection, drag updates the live preview,
release commits it. Today they do nothing at all on touch.

## Context

### The diagnosis — this is not a broken implementation, it is an absent one

The **mouse path is fully wired and works.** `CanvasContainer.tsx:4568-4628`, inside
`handleMouseDown`'s `if (currentTool === "selection")` block, handles all four modes:

- `:4590-4598` — `selectionMode === "rect"` → `setIsSelectingRegion(true)`,
  `setSelectionStart(coords)`, `setPreviewSelection({...})`
- `:4600-4608` — `"flood"` → `actions.selectFloodFillAt(...)`
- `:4610-4618` — `"color"` → `actions.selectAllByColorAt(...)`
- `:4620-4627` — the fallthrough is **lasso** → `setIsLassoSelecting(true)`,
  `setLassoPoints([coords])`

`handleMouseMove` continues them at `:4789-4801` (rect preview box) and `:4803-4812`
(lasso point accumulation). `handleMouseUp` commits at `:4988-4994`
(`actions.setSelection(previewSelection)`) and `:4996-5000`
(`if (lassoPoints.length > 1) actions.selectLasso(lassoPoints)`). Rendering is wired:
`lassoOverlay` at `:5659-5665`, `marchingAntsOverlay` at `:5668-5686`, both passed to the
surface at `:5823`.

**The touch path deliberately bails.** Two guards, both documented as intentional:

**Guard 1 — `client/src/ui/hooks/useCanvasPointer.ts:49-60`:**
```ts
/** Tools the touch path deliberately does not dispatch — see the module note. */
const MOUSE_ONLY_TOOLS = new Set([
  "eyedropper", "selection", "origin", "reference-trace",
]);
export function canDispatchTool(tool: string, device: PointerDevice): boolean {
  return device === "mouse" || !MOUSE_ONLY_TOOLS.has(tool);
}
```

**Guard 2 — `CanvasContainer.tsx:384-393` + its three call sites:**
```ts
function isGestureTool(tool: string): boolean {
  return tool === "move" || tool === "selection" || tool === "eyedropper" ||
         tool === "origin" || tool === "reflection" || tool === "pose";
}
```
- `handleTouchStart`, `:5217-5222` — `if (isGestureTool(currentTool)) return;`
- `handleTouchMove`, `:5364` — same
- `handleTouchEnd`, `:5395-5449` — no selection branch at all

So on an iPad: rect and lasso selection produce **nothing**. No preview, no marching ants,
no commit. The five local state clusters (`isSelectingRegion`/`selectionStart`/
`previewSelection`, `isLassoSelecting`/`lassoPoints`, declared at `:547-559`) are only
ever written from the mouse handlers.

The module header at `useCanvasPointer.ts:25-33` records this as intentional legacy
preservation — "extending touch to those tools is a behaviour change, needs its own
gesture design." **This task is that gesture design.**

### The ordering rule you must follow — it is already documented in the file

`handleTouchStart` has an explicit precedent for exactly this work.
`CanvasContainer.tsx:5180-5201`:

> "FIRST gesture tool touch actually implements (the eyedropper, selection and origin
> were never wired for it and fall through that bail doing nothing), so its branch has to
> run first or the gesture is swallowed silently — the highest-likelihood risk in
> MASTER §9. Also before the `!coords || !layer` guard: corner coords clamp and a guide
> does not need a layer, so neither condition may abort it."

`reflection` (`:5187-5191`) and `pose` (`:5201`) each got a branch placed **ahead of the
`isGestureTool` bail** for this reason. `move` (`:5206-5211`) sits after the coords guard
because it needs a layer. **Selection needs coords but not a layer** — you can select on
an empty layer — so its branch belongs after `getPixelCoords` but **before** the
`!coords || !layer` guard at `:5203-5204`, or you must restructure that guard. Read
`:5203-5211` carefully and choose deliberately; write your reasoning into a comment.

### The selection store

`client/src/stores/ui/SelectionUIStore.ts` (500 lines). A `SelectionState` is
`{ width, height, mask: Set<number>, bounds }` where `mask` holds packed indices
`y * width + x` (`pack`, `:59-61`). It is a **raw** `Set`, `observableRef` at `:152`,
always replaced wholesale.

**There is no begin/update/commit triad.** Selection is fire-and-forget: the in-flight
gesture lives entirely in `CanvasContainer`'s `useState`, and the store is touched once at
the end via `setSelection(box, dims)` (`:256`) or `selectLasso(points, dims)` (`:460`).
**Do not add a triad to the store** — mirror the mouse path's shape instead. That keeps
this task inside `CanvasContainer` + `useCanvasPointer` and avoids the data-safety
perimeter entirely.

`SelectionMirror.ts` is misleadingly named and **irrelevant here** — its own header
(`:18-35`) says it mirrors `uiState` *selection ids*, is superseded in production, and is
retained only as a test double.

### A real latent bug you may notice — do not fix it here

`useCanvasPointer.ts:162-171` — `endStroke` nulls `lastStrokePixelRef.current` and then
reads it, so any future `onUp` handler receives `{x:0, y:0}`. No tool defines `onUp`
today, so it is latent. **Out of scope.** Record it in `HANDOFF.md` under Notes so it is
not lost.

### Traps

- **`toolHandlers.ts:260-261`** has `move: {}` and `selection: {}` — deliberate no-op
  entries, because both are arbitrated ahead of the handler table. Do **not** try to
  implement selection as a tool handler; there is no single dispatch point, and going
  that route means rewriting the arbitration.
- **Pencil vs finger.** `handleTouchMove` uses `pinchTouches`, not the raw touch count —
  see the note at `:5364-5370`: "A Pencil and a resting finger are two contacts and were
  being discarded as a pinch, which is the 'unable to slide and draw' report of
  2026-08-28." Your selection drag must survive a resting palm. Follow the same
  `pinchTouches` discipline.
- **Two-finger pinch must still pan/zoom, never select.** The native listener at
  `useCanvasViewport.ts:519-618` owns two-finger gestures; your branch must bail on a
  pinch exactly as the drawing path does.
- **The UI to choose rect vs lasso is only in other-hand mode on tablet.**
  `PixelStudioContainer.tsx:199` hides `RightSidebarTopControlsContainer` (which holds
  `SelectionControls`, `RightSidebarTopControls.tsx:119, 169-179`) whenever
  `ui.layout.otherHandActive`. The other-hand copy is at `toolWidgets.ts:282-317` and is
  fine. So with other-hand mode **off** on an iPad, the user can pick the Selection tool
  and the mode, and — after this task — the Pencil will work. Verify both paths.
- **Do not remove `"eyedropper"`, `"origin"` or `"reference-trace"` from
  `MOUSE_ONLY_TOOLS`.** Only `"selection"` comes out. Those three remain unimplemented on
  touch and that stays true.

## Steps

1. **`useCanvasPointer.ts:49-60`** — remove `"selection"` from `MOUSE_ONLY_TOOLS`, leaving
   the other three. Update the module note at `:25-33` to say selection is now
   implemented for touch and the remaining three are not.

2. **`CanvasContainer.tsx:384-393`** — remove `"selection"` from `isGestureTool`, **or**
   keep the predicate and add the selection branch ahead of the bail. Prefer the branch,
   matching how `reflection` and `pose` were done at `:5187-5201` — the predicate is used
   in three handlers and narrowing it in one place is easier to reason about than
   changing its meaning everywhere. Write the choice and its reason into a comment.

3. **`handleTouchStart`** — add a selection branch that mirrors `handleMouseDown:4568-4628`
   exactly: all four modes (`rect`, `flood`, `color`, and the lasso fallthrough), setting
   the same `useState` clusters. Place it per the ordering rule above and comment the
   placement. Bail early if the gesture is a pinch.

4. **`handleTouchMove`** — add the mirror of `handleMouseMove:4789-4812`: rect preview box
   and lasso point accumulation. Respect `pinchTouches`.

5. **`handleTouchEnd`** — add the mirror of `handleMouseUp:4988-5000`: commit the rect via
   `actions.setSelection(previewSelection)` and the lasso via `actions.selectLasso(...)`
   when `lassoPoints.length > 1`, and clear the in-flight state either way — including on
   `touchcancel`, which the mouse path has no equivalent of. A cancelled gesture must not
   leave a half-drawn preview on screen.

6. **Commit** ("feat(ipad): rect and lasso selection respond to the Pencil").

7. **Refactor for duplication.** You have now written the selection gesture twice in one
   5,848-line file. Extract the shared body into three local helpers —
   `beginSelectionAt(coords)`, `updateSelectionAt(coords)`, `commitSelection()` — and have
   both the mouse and touch handlers call them. `ARCHITECTURE.md` §6 is explicit: "Prefer
   deleting duplication over abstracting it," and ~1,960 duplicated lines were the measured
   debt this project is paying down. Keep the helpers inside `CanvasContainer.tsx`; do not
   create a new module in this task.

8. **Commit** ("refactor(canvas): one selection gesture body for mouse and touch").

9. **New test `client/src/containers/__tests__/selectionTouch.dom.test.tsx`.** Follow the
   conventions of the existing container suites in that folder. Cover:
   - `canDispatchTool("selection", "touch")` now returns `true`, and still returns
     `false` for `"eyedropper"`, `"origin"` and `"reference-trace"`;
   - a touch begin/move/end sequence in `rect` mode commits a selection with the expected
     bounds;
   - the same in `lasso` mode with three or more points commits a non-empty mask;
   - a lasso with a single point commits nothing (mirrors `SelectionUIStore.selectLasso`'s
     1-point special case at `:463-466`);
   - `touchcancel` clears the in-flight preview without committing.
   Mounting the full `CanvasContainer` in jsdom may be impractical; if so, test the
   extracted helpers and `canDispatchTool` directly and say why in a comment.

10. **Commit** ("test(ipad): cover touch selection").

## Constraints

- Remove **only** `"selection"` from the mouse-only sets. The other three stay excluded.
- Do not modify `client/src/stores/ui/SelectionUIStore.ts`. It is inside the data-safety
  perimeter and needs no change — every helper already takes `dims` as an argument.
- Do not modify `toolHandlers.ts`.
- Do not fix the `endStroke` latent bug (`useCanvasPointer.ts:162-171`) — record it instead.
- Do not change the mouse behaviour. After step 7's refactor, mouse selection must behave
  identically to before.
- Do not break two-finger pinch-to-zoom or the Pencil-plus-resting-finger fix.
- Do not deep-observe a pixel grid. `previewSelection` and `lassoPoints` stay component
  state, exactly as they are today.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art
bun run typecheck        # expect exit 0
bun run lint             # 0 errors; warnings ≤ 65
bun run test             # 0 failures — the corpus suite MUST pass unchanged
bun run build
```

**Manual checks — 1–8 require the iPad and the Pencil:**

1. Selection tool, **rect** mode: press, drag, release with the Pencil → a rectangle
   previews while dragging and marching ants appear on release.
2. Selection tool, **lasso** mode: draw a closed shape with the Pencil → the lasso path
   renders live and the mask commits on release.
3. **flood** and **color** modes still work on a single Pencil tap.
4. Two-finger pinch while the Selection tool is active → the canvas zooms; **nothing is
   selected**.
5. Draw a selection with the Pencil while a finger rests on the screen → the selection
   still tracks.
6. Lift mid-gesture / trigger a `touchcancel` (e.g. a system gesture) → no stuck preview.
7. Repeat checks 1 and 2 with other-hand mode **on** (mode picker in the thumb rail) and
   **off** (mode picker in the right sidebar). Both must work.
8. After committing a selection, moving it and the Grow/Shrink/Clear buttons still behave.
9. On desktop with a mouse, all selection modes behave exactly as they did before the
   refactor.

## Definition of done

- [ ] `"selection"` is removed from `MOUSE_ONLY_TOOLS` and from the touch bail; the other three tools remain excluded.
- [ ] `handleTouchStart`/`Move`/`End` implement all four selection modes, including `touchcancel` cleanup.
- [ ] The selection gesture body is shared between the mouse and touch paths, not duplicated.
- [ ] `SelectionUIStore.ts` and `toolHandlers.ts` are **not** in the diff.
- [ ] The `endStroke` latent bug is recorded in `HANDOFF.md` under Notes, not fixed.
- [ ] Tests cover `canDispatchTool`, rect commit, lasso commit, the 1-point lasso, and cancel.
- [ ] The corpus suite passes unchanged; no `vitest -u` was run.
- [ ] `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build` all exit 0, real output pasted into `HANDOFF.md`.
- [ ] All nine manual checks performed and recorded. Checks 1–8 without an iPad ⇒ **PARTIAL**.
