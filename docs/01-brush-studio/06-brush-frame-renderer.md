# 06 — Brush frame renderer

**Wave:** W2 · **Depends on:** 01
**Touches:** `client/src/ui/canvas/render/renderBrushFrame.ts` (new) · `client/src/ui/canvas/render/__tests__/renderBrushFrame.test.ts` (new)
**Effort:** S

## Objective
A pure, hash-tested function turns a brush frame's visible layers into a `width × height`
RGBA `PixelBuffer` using the D5 colourisation and Porter-Duff "over" compositing (bottom layer
first), plus a per-layer variant used for thumbnails. Both the canvas (task 16) and the timeline
thumbnails (task 18) call it.

## Context
- Sibling precedent: `client/src/ui/canvas/render/renderScene.ts` (`PixelBuffer :38-43`,
  `paintCell :112-148`, hash-tested in its `__tests__`). Reuse its `PixelBuffer` interface by
  import (`import type { PixelBuffer } from "./renderScene"`) — do not declare a fourth copy.
- Compositing helper: `client/src/utils/alphaBlend.ts:127 blendOverInto(data, idx, r, g, b, a)`.
  `ui/canvas/render` already imports from `utils/` (check `renderScene.ts` imports) — allowed.
- Colourisation: `brushCellToRgba(cell, channelType)` from `client/src/types/brush.ts` (task 01).
  `ui/canvas` may import `types/` (only `ui/primitives` may not).
- Upscaling to the screen is **not** this module's job: task 16 feeds the buffer to
  `renderNormalEdit` (`ui/canvas/render/renderNormalEdit.ts:75`), which takes a `source: PixelBuffer`.
- Test style: look at `renderScene`'s test for how a `PixelBuffer` is built in node (a plain
  `{ data: new Uint8ClampedArray(w*h*4), width, height }`) and how digests are asserted.

## Steps
1. Create `renderBrushFrame.ts`:
   ```ts
   export interface BrushSceneLayer { pixels: ReadonlyArray<ReadonlyArray<BrushCell>>; channelType: BrushChannelType; visible: boolean }
   export interface RenderBrushFrameOptions { layers: ReadonlyArray<BrushSceneLayer>; width: number; height: number }
   /** Clears `buffer` to transparent, then composites visible layers bottom→top. Returns `buffer`. */
   export function renderBrushFrame(buffer: PixelBuffer, opts: RenderBrushFrameOptions): PixelBuffer
   /** One layer, no compositing — for thumbnails and the "solo" preview. */
   export function renderBrushLayer(buffer: PixelBuffer, layer: BrushSceneLayer, width: number, height: number): PixelBuffer
   export function createBrushBuffer(width: number, height: number): PixelBuffer
   ```
   Skip cells that are `0`; skip rows/cells outside `width/height`; `blendOverInto` for every
   painted cell (alpha from `brushCellToRgba`).
2. Tests: (a) an unpainted layer yields all-zero bytes; (b) one `rgb` cell `[0,0,0,255]` →
   `127,127,127,255`; (c) an `hsl` cell `[100,-100,0,255]` → `177,77,127,255`; (d) a `normal`
   cell `[0,0,255,0]` → `127,127,255,255`; (e) a `heightmap` cell `[-255,0,0,0]` → `0,0,0,255`;
   (f) two layers: bottom opaque red-ish, top with A delta 0 (alpha 127) — assert the blended
   byte equals `blendOverChannels` output; (g) hidden layer contributes nothing; (h) a
   determinism digest over a 16×16 synthetic frame (compute once, pin the hex in the test with
   a comment — this is synthetic data, not owner data, so pinning is fine).
3. Commit: `brush-studio(06): renderBrushFrame + renderBrushLayer`.

## Constraints
- No store/MobX/API imports; no DOM (`ImageData`) — the buffer is structural.
- Do not modify `renderScene.ts`, `renderNormalEdit.ts`, `alphaBlend.ts`.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/ui/canvas
cd client && bunx vitest run src/ui/canvas
cd client && bun run lint:boundaries
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```

## Definition of done
- [ ] Functions exported with the signatures above; `PixelBuffer` imported, not redeclared.
- [ ] Tests a–h pass.
- [ ] Gate green; one commit with only Touches files.
