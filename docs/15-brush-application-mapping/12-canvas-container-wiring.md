# 12 — `CanvasContainer` wiring + legacy seam removal

**Wave:** W4 · **Depends on:** 03, 09, 10
**Touches:** `client/src/containers/CanvasContainer.tsx` · `client/src/containers/__tests__/pixelBrushTool.dom.test.tsx` · `client/src/ui/canvas/tools/toolHandlers.ts` · `client/src/ui/canvas/tools/__tests__/toolHandlers.test.ts` · `client/src/containers/pixelBrush/usePixelBrush.ts` · `client/src/containers/pixelBrush/__tests__/usePixelBrush.dom.test.ts`
**Effort:** M

## Objective
Painting with the Brush tool stamps every plan entry: the current target through the existing funnel,
every other target through `actions.setPixelsAt` → `PixelStore.setPixelsAt`, with reflection mirroring
and the selection mask applied to all, `"target"` cells sampled from their own layer, and one undo entry
per drag. The legacy `pixelBrushStamp` / `pixelBrushTarget` seam is deleted from `ToolContext`, the
handler, the hook and their tests — one model remains.

## Context
- `client/src/containers/CanvasContainer.tsx` (6193 lines; already over `max-lines`, so no *new* warning
  can come from it, but keep additions small): `usePixelBrush(app, currentTool === "brush", currentColor)`
  `:643`; `actions.setPixels` `:881-894` (`expandWrites(pixels, lines, editable.dims.width, editable.dims.height)`
  then `app.pixels.setPixels(mirrored, app.selectionUI.writeOptions)`); `getPixelColor` module helper
  `:305-309`; `editableGrid()` `:4349-4355`; `pixelBrushTouched` ref + `pixelBrushTarget` memo
  `:4385-4404`; `getToolContext` `:4411-4493` with `pixelBrushStamp: pixelBrush.stamp` `:4425`,
  `pixelBrushTarget` `:4426`, `setPixels` `:4436`, deps `:4474-4492`; hover footprint `:2289-2300`.
- From task 10: `pixelBrush.plan`, `bindPixelBrushTargets(plan, lookup, currentTarget, getPixelColor)`.
  From task 09: `ToolContext.pixelBrushPlan`, `setPixelsAt`. From task 03: `app.pixels.setPixelsAt`.
- `app.currentObject.gridSize` is the dims for every base layer of the object — use it for `expandWrites`
  in `setPixelsAt` (not `editableGrid`, which may be a variant grid).
- The stroke transaction: `actions.beginStroke` → `strokeControl.begin()` (`:929`). `setPixelsAt` opens
  none (task 03), so a drag over N targets is still one undo entry.
- Integration rig: `__tests__/pixelBrushTool.dom.test.tsx` (600 lines): real `ApplicationStore` +
  `<CanvasContainer>` render, brush api fake, pointer events on the canvas; assertions on the domain grids
  and history length. Extend it.
- Removal scope: `pixelBrushStamp?`/`pixelBrushTarget?` in `ToolContext` and the handler's legacy branch
  (`toolHandlers.ts` + its tests that exercise the legacy field — replace them with plan equivalents where
  they pinned behaviour); `stamp` in `usePixelBrush`'s return + its tests. `pixelBrushStamp.ts` keeps
  `PixelBrushTarget`/`PixelBrushStamp` (they are used by the plan).

## Steps
1. `CanvasContainer.tsx`:
   - `lookupLayerGrid = useCallback((frameId, layerId) => app.currentObject?.frames.find(f => f.id === frameId)?.layers.find(l => l.id === layerId)?.pixels ?? null, [app])`
     (lazy, called at pointer time from samplers — not observed).
   - `boundPlan = useMemo(() => pixelBrush.plan ? bindPixelBrushTargets(pixelBrush.plan, lookupLayerGrid, pixelBrushTarget, getPixelColor) : null, [pixelBrush.plan, lookupLayerGrid, pixelBrushTarget])`.
   - `actions.setPixelsAt(target, writes)`: `const obj = app.currentObject; if (!obj) return;` mirror with
     `expandWrites(writes, app.reflection.lines, obj.gridSize.width, obj.gridSize.height)` when lines
     exist; `app.pixels.setPixelsAt(target.frameId, target.layerId, mirrored, app.selectionUI.writeOptions)`.
   - `getToolContext`: `pixelBrushPlan: boundPlan`, `setPixelsAt: (t, w) => actions.setPixelsAt(t, w as never)`;
     remove `pixelBrushStamp`/`pixelBrushTarget` bindings; deps updated (`boundPlan` replaces
     `pixelBrush.stamp` and `pixelBrushTarget`). Keep the `pixelBrushTarget` memo itself (it is the
     current entry's target inside `boundPlan`).
   Commit: `brush-apply(12): CanvasContainer binds the plan and setPixelsAt`.
2. Legacy removal: `toolHandlers.ts` — delete `pixelBrushStamp?`/`pixelBrushTarget?` from `ToolContext`
   and the legacy branch of the handler (plan `null` → nothing stamped, `setLastStrokePixel` still
   called); `toolHandlers.test.ts` — convert legacy-field tests to plan-based equivalents (single current
   entry), keep the "field absent behaves as null" test against `pixelBrushPlan`. `usePixelBrush.ts` —
   remove the `stamp` memo and member; `usePixelBrush.dom.test.ts` — assert via `plan.entries[0].stamp`
   instead. Run `grep -rln "pixelBrushStamp\b\|pixelBrushTarget\b" client/src` → only
   `pixelBrushStamp.ts` and `pixelBrushStamp.test.ts` may match (the module name and its own types).
   Commit: `brush-apply(12): remove the legacy single-stamp seam`.
3. Integration tests (`pixelBrushTool.dom.test.tsx`):
   - brush layer with `applyDelta: -1`, 3-layer object, current layer 1: a click writes to layer 0 and the
     current layer receives only the other brush layers' fold; one history entry.
   - object override `{ layerId }` → that layer changes.
   - two-frame brush with default `applyTo`, current frame 0 of 2 → both frames written; current frame 1 →
     only frame 1 (culled); one history entry per drag; `undo()` restores every touched grid.
   - a drag (down, two moves, up) over two targets → history length grows by exactly one.
   - selection mask active → non-current targets respect it; reflection line active → non-current targets
     are mirrored.
   - `"target"` colour-source layer mapped to Δ-1 → the written colour derives from the **lower** layer's
     pixel (seed two distinct colours and assert).
   - the hover footprint (whatever the rig exposes — the existing footprint assertion) is the union.
   Commit: `brush-apply(12): multi-target integration tests`.

## Constraints
- No edits under `types/`, `stores/`, `ui/components/`; `pixelBrushStamp.ts` and `pixelBrushApply.ts`
  untouched.
- Do not open a transaction anywhere new; do not touch `strokeControl`.
- `usePixelBrush`'s reset effect and memo keys from task 10 stay as they are.
- Keep `CanvasContainer` additions minimal (helpers belong in `pixelBrushPlan.ts`, which task 10 owns —
  if you need one more helper there, record it as a deviation).

## Verification
```sh
cd client && bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run lint:boundaries   # full client gate; paste totals + warning count
cd client && bunx vitest run src/types                       # green, snapshots unchanged
grep -rln "pixelBrushStamp\b\|pixelBrushTarget\b" client/src # only pixelBrushStamp.ts and its test
git status --porcelain | grep __snapshots__                  # prints nothing
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules  # prints nothing
```
**Manual (required)** — `bun run dev`, a brush project with a two-layer brush (top layer `"target"`
colour source) and a two-frame brush, a 3-layer / 4-frame object:
1. Δ-1 on the top brush layer: paint on layer 2 → layer 1 shows the burn/tint, layer 2 the other layer's
   colour; ⌘Z once → both gone.
2. Named layer target → that layer changes wherever you paint; the hover marker still shows the full brush.
3. Frame fan-out: on frame 3 of 4 with the two-frame brush → frames 3 and 4 change; on frame 4 → only
   frame 4; one ⌘Z each time.
4. Selection: marquee a region → mapped writes stay inside it on every target layer.
5. Reflection: enable a vertical line → mapped writes are mirrored on every target layer.
6. iPad / Pencil (if available): a fast drag writes continuous segments to every target (no gaps on the
   Δ-1 layer). If no iPad, say so.
7. StrictMode (dev build): no double stamp on `onDown` (the first click writes each cell once — check
   with a semi-transparent colour).
Record every observation, including anything you could not test.

## Definition of done
- [ ] Plan bound with per-entry samplers; `setPixelsAt` action with reflection + mask; legacy seam gone.
- [ ] Integration tests listed above green; full client gate green with the warning count ≤ baseline.
- [ ] The grep confirms one model remains.
- [ ] Manual checks 1–7 performed and recorded (or explicitly marked untestable with the reason).
- [ ] Three commits `brush-apply(12):`; no lockfile.
