# 06 — Wire the target sampler: `ToolContext`, the handler, `CanvasContainer`

**Wave:** W3 · **Depends on:** 05
**Touches:** `client/src/ui/canvas/tools/toolHandlers.ts` · `client/src/ui/canvas/tools/__tests__/toolHandlers.test.ts` · `client/src/containers/CanvasContainer.tsx` · `client/src/containers/__tests__/pixelBrushTool.dom.test.tsx`
**Effort:** M

## Objective
A brush whose layers are `"target"`-sourced burns, fades or tints the pixels already on the
canvas when stamped in the pixel studio. The sampler reads the same grid `setPixels`
writes, the per-stroke `touched` set is reset on every press, and the whole thing is
proven end-to-end by a container test that presses on a painted cell and reads back the
darkened pixel.

## Context
- `toolHandlers.ts`: `ToolContext` `:83-131`, `pixelBrushStamp?` `:97-105`; the `brush`
  handler `:293-317` (`onDown` → `beginStroke`, stamp, `setLastStrokePixel`; `onMove` → stamp
  segment). Add `pixelBrushTarget?: PixelBrushTarget | null` next to `pixelBrushStamp`
  (optional so `containers/brush/brushToolContext.ts` compiles untouched — the Brush Studio
  never supplies one). `onDown` calls `ctx.pixelBrushTarget?.touched.clear()` **before** the
  first stamp; both stamps pass `ctx.pixelBrushTarget ?? null` as the sixth argument.
- `CanvasContainer.tsx`: `editableGrid()` `:4348-4354` is the grid the fills sample
  (`floodFillAt` `:4415-4427` is the precedent for a bound closure);
  `getPixelColor(cell)` `:304-312` narrows a `PixelData` (`color: Pixel | 0`, `0` = empty);
  `getToolContext` `:4382-4466` and its dependency array — **pointer-rate values must not be
  deps** (`:4443-4455`). `usePixelBrush` is called at `:642`; `pixelBrushStamp: pixelBrush.stamp` at `:4403`.
- Per-stroke set: `const pixelBrushTouched = useRef(new Set<number>())` — a ref, so it is
  neither a dep nor observed. The sampler:
  `(x, y) => { const c = getPixelColor(editableGrid()?.[y]?.[x]); return c; }` — a pixel with
  `a === 0` is **present** and is returned (MASTER D5); only `0`/missing is `null`.
  Build `pixelBrushTarget` with `useMemo` on `[editableGrid]` so the context object is stable.
- Test rigs: `toolHandlers.test.ts` (`ctx` builder `:30-70`, `brush` describe `:78+`);
  `pixelBrushTool.dom.test.tsx` (real container; `installBrush` `:187-193`, `selectBrushTool`
  `:195-200`, `mountCanvas` `:202-214`, `at(x, y)` `:216-221`, two-`act()` press rule
  `:223-230`, expected colours computed with `settlePixelBrushColor`, never hard-coded).

## Steps
1. `toolHandlers.ts` as above. Handler test: `onDown` clears `touched`; both stamps receive
   the target; with `pixelBrushTarget` absent, calls are identical to before (spy on the
   segment function via the stamp shape — or assert the written colours).
2. `CanvasContainer.tsx`: the ref, the memoised `pixelBrushTarget`, and
   `pixelBrushTarget` in `getToolContext` (+ its dep). Keep `pixelBrush.stamp` as is.
3. Container test (`pixelBrushTool.dom.test.tsx`): a project whose layer has a red cell at
   (5,5) and nothing at (6,5); a 1×1 brush with one `"target"` rgb layer `[-100,0,0,0]`;
   press at (5,5) → the cell becomes `settlePixelBrushColor(RED, [...])`; press at (6,5) →
   the cell stays empty (`color === 0`); drag (5,5) → (7,5) → (5,5) in one stroke → (5,5)
   darkened **once**, not twice; a second stroke darkens again; one history entry per stroke.
   Add a mixed brush (target cell + selected cell) and assert both semantics in one press.
4. Commit: `brush-source(06): target sampler through ToolContext; container test proves the burn`.

## Constraints
- Do not touch `containers/brush/brushToolContext.ts`, `usePixelBrush.ts` (task 12 owns it),
  `toolFootprint.ts`, or the hover marker. No grid crosses into `ui/`.
- `CanvasContainer.tsx` already exceeds `max-lines` (warning baseline); add no more than
  the lines this needs.

## Verification
```sh
cd client && bunx tsc --noEmit && bunx eslint src/ui/canvas/tools src/containers/CanvasContainer.tsx && bunx vitest run src/ui/canvas/tools src/containers/__tests__/pixelBrushTool.dom.test.tsx src/containers/brush && bun run lint:boundaries
```
Manual (`bun run dev`): paint a red block; in the Brush Studio make a brush with one HSL
layer, L −60, source Target; back in the pixel studio select the Brush tool (B) and drag
across the block and past its edge — the block darkens, the empty canvas stays empty, and
a back-and-forth drag in one stroke does not double-darken; ⌘Z restores in one step.
Reflection lines on: the mirrored side darkens too (writes go through the funnel).

## Definition of done
- [ ] `ToolContext.pixelBrushTarget?` optional; handler clears `touched` on press and passes the target.
- [ ] Container binds the sampler over `editableGrid()` and a stable `touched` ref.
- [ ] Handler + container tests in steps 1 and 3 green; manual checks performed and listed.
