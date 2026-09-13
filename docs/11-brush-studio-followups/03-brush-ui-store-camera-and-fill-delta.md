# 03 — BrushUIStore: `CanvasCamera` + edge/fill delta slots

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/stores/ui/BrushUIStore.ts` · `client/src/stores/ui/__tests__/BrushUIStore.test.ts`
**Effort:** M

## Objective
`BrushUIStore` implements the `CanvasCamera` interface the pixel canvas's viewport hook
expects (`viewZoom`, `setViewZoom`, `resetView`), and holds **two** delta slots (edge and fill)
plus the active-slot flag, with the same orchestration shape the pixel studio has for colours.
Nothing is persisted. Tasks 06–09 build on these members; this task changes no consumer.

## Context
- Current camera members (`stores/ui/BrushUIStore.ts:180-197`): `zoom` (px per cell, clamped
  `BRUSH_ZOOM_MIN=1..BRUSH_ZOOM_MAX=64`, default 16, `:42-44,73`), `panOffset` (`observableRef`,
  `:75`), `setZoom`, `zoomBy`, `setPanOffset`. No `viewZoom`, no `resetView`.
- Target interface, `stores/ui/CanvasCameraStore.ts:39-51`:
  ```ts
  export interface CanvasCamera {
    readonly panOffset: { x: number; y: number };
    readonly viewZoom: number | undefined;        // undefined = never zoomed; readers use ?? 1
    setPanOffset(offset: { x: number; y: number }): void;
    setViewZoom(zoom: number, floor?: number): void;   // floor defaults to legacy 0.25
    resetView(centeredPan: { x: number; y: number }): void;
  }
  ```
  `ViewportUIStore implements CanvasCamera` (`ViewportUIStore.ts:44`) — copy its `setViewZoom`
  clamping (floor…max) and `resetView` (pan := centeredPan, viewZoom := 1) semantics exactly;
  `CanvasCameraStore.ts:53` is the smaller second implementation to read.
- Current delta members (`:71,84,162-180`): `selectedDelta: BrushDelta` (`observableRef`),
  `setDeltaChannel(index: BrushDeltaIndex, value)`, `setDelta(delta)` (clamps + copies),
  `resetDelta()`. One slot only.
- Pixel-studio precedent to mirror in shape (not persistence): `stores/ui/ToolUIStore.ts`
  `selectedColor :59` (edge), `fillColor :72`, `colorTarget :169` (`"edge" | "fill"`, **not
  persisted**), `setColorTarget :347`, `swapColors :376-381`, `fillColorOrSelected :392`;
  `ApplicationStore.ts:2003 setActiveColor`, `:2020 activeColor`, `:2044 swapEdgeAndFillColors`.
  The brush store is simpler: nothing is persisted (`UIStore.toPersistedUIState()` never reads
  `brushUI`), there is no `colorSink`, and the delta is not undoable (MASTER-01 D17) — so no
  history entry on swap.
- Store style: explicit `makeObservable` map, `observableRef` for tuples/objects (mobx 7 export
  names — see the file's existing imports). No `stores/domain` imports.

## Steps
1. Camera: add `viewZoom: number | undefined = undefined` (observable),
   `setViewZoom(zoom, floor = 0.25)` (ignore non-finite; clamp to `[floor, 4]` — read
   `ViewportUIStore.setViewZoom` for the exact max and copy it), `resetView(centeredPan)`
   (`panOffset = centeredPan; viewZoom = 1`). Declare `export class BrushUIStore implements CanvasCamera`
   (import the type from `./CanvasCameraStore`). Keep `zoom`/`setZoom`/`zoomBy` as they are.
2. Deltas: keep `selectedDelta` as the **edge** slot (name kept — every consumer reads it).
   Add `fillDelta: BrushDelta = [0,0,0,0]` (observableRef), `deltaTarget: "edge" | "fill" = "edge"`
   (observable), `get activeDelta(): BrushDelta` (computed), `setDeltaTarget(t)`,
   `setActiveDelta(delta)` (clamps + copies into the active slot), `setActiveDeltaChannel(index, value)`,
   `resetActiveDelta()`, `swapDeltas()` (exchange the two tuples; both always defined, so no
   tri-state handling), and `setFillDelta(delta)`. Export `type BrushDeltaTarget = "edge" | "fill"`.
   Existing `setDelta`/`setDeltaChannel`/`resetDelta` keep writing the edge slot (document that).
3. `adoptDocument(doc)` must NOT reset deltas or camera (unchanged behaviour); state that in a test.
4. Tests: `viewZoom` starts `undefined`; `setViewZoom(0.1, 0.5)` clamps to 0.5; non-finite ignored;
   `resetView` sets both; `activeDelta` follows `deltaTarget`; `setActiveDelta` on `"fill"` leaves
   `selectedDelta` untouched and stores a new tuple reference; `swapDeltas` exchanges and produces
   fresh tuples; `setActiveDeltaChannel` clamps; a structural check that the store satisfies
   `CanvasCamera` (`const cam: CanvasCamera = store`).
5. Commit: `brush-followups(03): BrushUIStore implements CanvasCamera; edge/fill delta slots`.

## Constraints
- No persistence, no undo, no `stores/domain` imports, no consumer edits.
- Do not rename `selectedDelta`, `zoom`, `panOffset`, `setZoom`, `zoomBy`, `setPanOffset`.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/stores/ui
cd client && bunx vitest run src/stores            # existing BrushUIStore + wiring tests untouched and green
cd client && bun run lint:boundaries
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```

## Definition of done
- [ ] `implements CanvasCamera` compiles; new delta members with tests.
- [ ] All pre-existing tests pass unmodified; one commit with only the two files.
