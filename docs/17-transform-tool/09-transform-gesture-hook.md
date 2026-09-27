# 09 — Gesture hook + lift

**Wave:** W3 · **Depends on:** 02, 03, 05, 06
**Touches:** `client/src/containers/transform/useTransformGesture.ts` (new) · `client/src/containers/transform/liftTransformSource.ts` (new) · `client/src/containers/transform/__tests__/useTransformGesture.dom.test.ts` (new) · `client/src/containers/transform/__tests__/liftTransformSource.test.ts` (new)
**Effort:** L

## Objective
A container-tier hook owns the whole transform gesture — zone hit-testing on press, drag state in
refs, per-sample params updates into `app.transform`, cursor state that changes only when the hover
zone changes, cancel on pinch — and a plain function lifts the original pixels under the selection
into a `TransformSession`. `CanvasContainer` will call both (task 10); nothing else changes yet.

## Context
- Lift-out precedent: `client/src/containers/brush/useBrushSelection.ts` (316) and
  `useBrushPointerHandlers.ts` (274) — hooks that own refs and React state so the container stays a
  binding layer; `containers/pixelBrush/usePixelBrush.ts` (207) for the "reads from `app`, returns
  memos" shape and its dom test rig (`renderHook` over a real `ApplicationStore`).
- From task 02: `hitTestTransform`, `dragParams`, `TransformDrag`, `TransformModifiers`,
  `TransformZone`, `TransformSource`. From task 05: `transformCursor`. From task 06:
  `TransformSession`, `app.transform.begin/setParams`. From task 03: the container will supply
  `getFloatCoords` built on the `"float"` mode — the hook receives it as a dep.
- App reads: `app.selectionUI.selection` (`SelectionState { width; height; mask; bounds }`),
  `app.currentObject/currentFrame/currentLayer`, `app.isEditingVariant`, `app.editableGrid`
  (`{ grid, dims }`), `app.transform.session/params`.
- Rules: grids are walked **once** in `liftTransformSource` (never per sample, never in a render);
  the drag lives in a `useRef`; the cursor is `useState` updated only when the zone kind/handle
  changes; `params` goes to the store per sample via `setParams` (one `observable.ref` replacement,
  the `pixelDragOffset` cost class).
- Touch has no modifiers: the container passes `{ uniform: false, snap: false }`.

## Steps
1. `liftTransformSource.ts`: `liftTransformSource(app): TransformSession | null` per MASTER D9 —
   guards (selection, object/frame/layer, not editing a variant, selection dims equal
   `object.gridSize`), walk `selection.mask`, keep non-empty cells (`color !== 0 || normal !== 0 || height !== 0`)
   into `Map<number, PixelData>` keyed `y * width + x` (the same `PixelData` object references —
   the rasteriser reads, the commit copies), return
   `{ target: { objectId, frameId, layerId }, gridWidth, gridHeight, bounds: selection.bounds, source: { width, height, bounds, cells }, selectionRef: selection }`.
   Unit test (node lane, a hand-built minimal `app`-shaped object or a real `ApplicationStore` — the
   real one is fine): returns `null` in each guard case; lifts only non-empty cells; keys and
   references correct; `selectionRef` is the selection object.
   Commit: `transform(09): liftTransformSource`.
2. `useTransformGesture.ts` per MASTER D16:
   - state: `dragRef = useRef<TransformDrag | null>(null)`, `dragOpenRef = useRef(false)`,
     `[cursor, setCursor] = useState("crosshair")`, `zoneRef` (last hover zone, for change detection).
   - `pointerDown(clientX, clientY, mods)`: `const sel = deps.app.selectionUI.selection; if (!sel || deps.app.isEditingVariant) return false;`
     `p = deps.getFloatCoords(...)`; `params = app.transform.params ?? identityParams(sel.bounds)`;
     `bounds = app.transform.session?.bounds ?? sel.bounds`; `zone = hitTestTransform(p, params, bounds, deps.getCombinedScale())`;
     `outside` → `false`. Else if no session: `const s = deps.lift(); if (!s) return false; app.transform.begin(s);`
     then `dragRef.current = { zone, start: p, startParams: app.transform.params! }`, `dragOpenRef.current = true`,
     `setCursor(transformCursor(zone, params))`, return `true`.
   - `pointerMove(clientX, clientY, mods)`: if dragging → `app.transform.setParams(dragParams(dragRef.current, p, mods, session.bounds))`,
     return `true`. Else (hover): if a selection exists and not editing a variant → compute the zone
     and, if it differs from `zoneRef.current` (compare kind + handle id), `setCursor(...)`; return `false`.
   - `pointerUp()`: if dragging → clear `dragRef`/`dragOpenRef`, return `true`; else `false`.
   - `cancel()`: if dragging → `app.transform.setParams(dragRef.current.startParams)`, clear.
   - Also expose `resetCursor()` (sets `"crosshair"`, used by the container when the tool changes or
     the pointer leaves) — add it to the returned object and note it in your report.
   - All callbacks stable via `useCallback` over `deps` (the container memoises `deps`).
   Commit: `transform(09): useTransformGesture`.
3. Dom tests (`useTransformGesture.dom.test.ts`, `renderHook` with a real `ApplicationStore`, a 8×8
   object with coloured cells, a rect selection; `getFloatCoords` = identity mapping from a fake
   client space at `CELL_PX = 10`; `getCombinedScale = () => 10`):
   - no selection → `pointerDown` false, no session.
   - press on the `se` handle → true, session begun with the lifted cells, `params` identity, cursor
     `nwse-resize`; move by (+10 px, +10 px) → `scaleX`/`scaleY` grow, `dragOpenRef` true; up → false
     drag, session kept, params kept.
   - press inside → cursor `move`; move → `cx/cy` change, scale/rotation unchanged.
   - press in the rotate band → cursor is `ROTATE_CURSOR`; quarter-circle of moves → rotation ≈ π/2.
   - press outside → false; the session (if any) untouched.
   - a second press on a handle **does not** re-lift (`session` reference unchanged; `source.cells`
     same reference).
   - hover: moving over a handle then inside then outside changes `cursor` exactly three times; moving
     within the same zone does not call `setCursor` again (spy on the state changes via render count).
   - `cancel()` mid-drag restores `startParams`.
   - editing a variant (select a variant layer in the rig) → press on a handle returns false.
   Commit: `transform(09): gesture hook tests`.

## Constraints
- No edits outside `containers/transform/`. No `CanvasContainer` edits (task 10).
- Never read `layer.pixels` in the hook; only `liftTransformSource` walks a grid, once.
- No React state per pointer sample other than the store's `params` ref; no `useEffect` per sample.

## Verification
```sh
cd client && bunx vitest run src/containers/transform         # green
cd client && bunx tsc --noEmit && bunx eslint src/containers/transform   # clean; no new max-lines warning
cd client && bun run lint:boundaries                          # 5/5
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # prints nothing
```
Manual: none (end-to-end in task 10).

## Definition of done
- [ ] `liftTransformSource` per D9 with tests; `useTransformGesture` per D16 (+ `resetCursor`) with tests.
- [ ] Cursor state changes only on zone change (pinned); drag state in refs; one lift per session (pinned).
- [ ] Boundaries 5/5; eslint warnings ≤ 66.
- [ ] Three commits `transform(09):`; no lockfile.
