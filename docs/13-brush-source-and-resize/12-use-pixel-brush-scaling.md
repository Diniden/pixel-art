# 12 — `usePixelBrush`: scale the frame's layers before footprint and stamp

**Wave:** W4 · **Depends on:** 06, 09, 11
**Touches:** `client/src/containers/pixelBrush/usePixelBrush.ts` · `client/src/containers/pixelBrush/__tests__/usePixelBrush.dom.test.ts`
**Effort:** S

## Objective
The hover marker and the stamp reflect the size and strategies in `ui.pixelBrush`: the
frame's layers are scaled once per (document, frame, versions, size, strategies), then fed
to the unchanged `pixelBrushFootprint` / `resolvePixelBrushStamp` at the scaled size. At
native size nothing changes, including the stamp's referential stability. A brush
document with different native dimensions resets the size to native.

## Context
- `usePixelBrush.ts` (135 lines, whole file quoted in MASTER §4): subscribing reads
  `:96-101`; footprint memo `:103-113` (deps `[app, enabled, doc, frameId, pv, dv]`); stamp
  memo `:116-128` (+ colour scalars). `CanvasContainer.tsx:642` calls
  `usePixelBrush(app, currentTool === "brush", currentColor)` — **do not change the call**;
  read `app.ui.pixelBrush` inside the hook.
- Task 09: `scalePixelBrushLayers(layers, req)` returns the same array for an identity
  request. Task 11: `effectiveSize(native)`, `scaleX`, `scaleY`, `resetSize()`.
- The hook's test (`usePixelBrush.dom.test.ts`): `init()` describe `:138-157`; footprint/stamp
  describe `:159+` including the referential-stability case `:183`.
- Rule: grids are read inside memos, never observed; pointer-rate values are never deps.
  The scaled-layer memo's deps: `[app, enabled, doc, frameId, pv, dv, width, height, scaleX, scaleY]`
  where the four scalars are read from `app.ui.pixelBrush` in the render body (they are
  observable and change at slider rate, not pointer rate).

## Steps
1. Add a `scaled` memo: `const native = { width: doc.width, height: doc.height }`;
   `const size = app.ui.pixelBrush.effectiveSize(native)`; build the request and call
   `scalePixelBrushLayers(frame.layers, req)`; return `{ layers, width, height }`. The
   footprint and stamp memos consume `scaled` (deps become `[enabled, scaled]` and
   `[enabled, scaled, r, g, b, a]`).
2. Reset on native change: `useEffect(() => { app.ui.pixelBrush.resetSize(); }, [app, doc?.width, doc?.height])`
   — runs on mount too, which is a no-op at defaults. Document why (MASTER D12).
3. Extend `PixelBrushState` with `size: { width, height } | null` (the effective stamp
   size) for the rail's readout (task 13 reads it through the container).
4. Tests: at native size the stamp reference is unchanged across re-renders (existing
   `:183` still passes); `setWidth(6, native)` on a 3×3 brush (locked → 6×6) gives a
   footprint of `4 × |painted|` cells with nearest; switching `scaleX` to `bilinear`
   re-resolves; installing a 4×4 document after a 3×3 resets `width/height` to `null`;
   `size` reports the effective size.
5. Commit: `brush-scale(12): usePixelBrush scales layers from ui.pixelBrush`.

## Constraints
- Only the two files. Do not edit `CanvasContainer.tsx`, `pixelBrushStamp.ts`, `pixelBrushScale/*`.

## Verification
```sh
cd client && bunx tsc --noEmit && bunx eslint src/containers/pixelBrush && bunx vitest run src/containers/pixelBrush src/containers/__tests__/pixelBrushTool.dom.test.tsx
```
Manual (`bun run dev`, with task 13 landed): drag the width slider — the hover marker grows;
a press writes the scaled footprint; at native size a large brush strokes with no added lag
(compare against `main`).

## Definition of done
- [ ] Scaled layers feed footprint and stamp; identity keeps reference stability; native-change reset; `size` exposed.
- [ ] Tests in step 4 green; existing hook tests green.
