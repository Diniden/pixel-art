# 08 — Edge/fill deltas in brush writes: fills, shapes, preview, eyedropper

**Wave:** W3 · **Depends on:** 03, 06, 07
**Touches:** `client/src/containers/brush/brushToolContext.ts` · `client/src/containers/brush/__tests__/brushToolContext.test.ts` · `client/src/containers/BrushCanvasContainer.tsx` · `client/src/containers/brush/useBrushHover.ts`
**Effort:** M

## Objective
Painting on a brush layer honours the two slots the way the pixel studio does: pencil, eraser,
line, fill-square and shape outlines take the **edge** delta; flood/gaussian fill and shape
interiors take the **fill** delta; a `"both"` shape splits per pixel; the live shape preview is
colourised per pixel so it does not lie; the eyedropper samples into the **active** slot.

## Context
- The pixel model: each `ToolPixelWrite` carries its own `color` (`ui/canvas/tools/toolHandlers.ts:69-75`);
  `ToolContext` has only `currentColor` (`:88`) — fill never enters the context, it is captured
  in the `floodFillAt`/`gaussianFillAt` closures (`CanvasContainer.tsx:4409-4432`, "the bucket
  FLOODS AN AREA, so it is a fill"). Shape commit decides per pixel
  (`CanvasContainer.tsx:5071-5106`): `shapeMode === "both"` → `getShapeOutlineKeys(tool, start, end, borderRadius)`
  (`components/Canvas/drawingUtils.ts:195-209`), outline keys → edge, others → fill;
  `"fill"` → all fill; `"outline"` → all edge. Live preview mirrors it (`:1917-1958`).
- Brush side: `containers/brush/brushToolContext.ts` — `DUMMY_TOOL_COLOR :85`;
  `mapWritesToBrushCells(writes, delta) :199-206` **discards `color` except for the `=== 0`
  erase test**; `pointsToBrushCells :363-368`; `BrushToolContextArgs.delta :369`;
  `buildBrushToolContext :408-470` — `setPixels :451-452`, `fillAt :428-435` (emits
  `DUMMY_TOOL_COLOR`), `squarePixelsAt :458-463`. Container: `finishStroke`
  `BrushCanvasContainer.tsx:333-348` paints one delta over the whole shape; eyedropper gesture
  `:284-297` calls `brushUI.setDelta`; preview colour `:411` `brushCellToRgba(selectedDelta, channelType)`;
  hover colour in `useBrushHover.ts`.
- Store (task 03): `selectedDelta` (edge), `fillDelta`, `activeDelta`, `setActiveDelta`.
- `max-lines`: the container is near the 400-count limit after task 06 — put the per-pixel
  shape split into `brushToolContext.ts` (`shapeCommitCells(points, outlineKeys, edge, fill)`),
  not the container.

## Steps
1. `brushToolContext.ts`: add `export const DUMMY_FILL_COLOR: ToolColor = { r: 0, g: 0, b: 0, a: 254 }`
   (distinct by identity AND by value from `DUMMY_TOOL_COLOR`; document that only identity/`a`
   is ever inspected). `mapWritesToBrushCells(writes, edgeDelta, fillDelta)`: `0` → `0`;
   `color === DUMMY_FILL_COLOR || color.a === 254` → copy of `fillDelta`; else copy of `edgeDelta`.
   `BrushToolContextArgs` gains `fillDelta: BrushDelta`; `fillAt` emits `DUMMY_FILL_COLOR`;
   `squarePixelsAt` keeps `DUMMY_TOOL_COLOR`; `setPixels` passes both deltas.
   Add `shapeCommitCells(points, shapeMode, outlineKeys, edgeDelta, fillDelta): BrushCellWrite[]`
   mirroring `CanvasContainer.tsx:5093-5104`, and `shapePreviewColors(...)` returning per-point
   RGBA for the preview (colourise edge/fill via `brushCellToRgba` with the layer's channel type).
2. `BrushCanvasContainer.tsx`: pass `fillDelta: brushUI.fillDelta` into the context (deps!);
   `finishStroke` computes `outlineKeys` when `shapeMode === "both"` from the stroke start and
   the last aim point (find the brush equivalent of `lastShapeAimRef` — the selection/gesture
   controller already tracks the last pointer cell; if not, add a ref) and commits
   `shapeCommitCells(...)`; preview render uses per-pixel colours from `shapePreviewColors`;
   eyedropper → `brushUI.setActiveDelta(delta)`.
3. `useBrushHover.ts`: hover footprint colour uses `activeDelta` (a pencil hover previews the
   edge delta; when the active tool is a fill tool preview the fill delta — keep it simple: pencil/
   eraser/line/square → edge, flood/gaussian → fill, shapes → edge).
4. Tests (`brushToolContext.test.ts`): erase → 0; edge sentinel → edge copy; fill sentinel → fill
   copy, never the same reference; through the real `toolHandlers`: a flood click writes the
   fill delta, a pencil stroke writes the edge delta; `shapeCommitCells` for `"outline"`, `"fill"`,
   `"both"` on a 5×5 rectangle (outline cells edge, interior fill) and a line (all edge).
5. Commit: `brush-followups(08): edge/fill deltas in fills, shapes, preview and eyedropper`.

## Constraints
- Do not edit stores, `ui/**`, `drawingUtils.ts`, or `toolHandlers.ts`.
- One undo entry per stroke/shape/fill, as today.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/containers          # max-lines must not fire on the container
cd client && bunx vitest run src/containers
cd client && bun run lint:boundaries
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Manual (owner, brush mode): set Edge to a red-ish delta and Fill to a blue-ish one; rectangle in
"both" mode previews and commits a red outline with blue interior; flood fill uses blue; pencil
uses red; eyedropper with Fill active loads the sampled cell into the Fill slot; one ⌘Z per shape.

## Definition of done
- [ ] Two sentinels, two deltas through the context; per-pixel shape commit and preview.
- [ ] Eyedropper writes the active slot; tests cover the routing; gate green; one commit.
