# 10 — BrushUIStore

**Wave:** W3 · **Depends on:** 01
**Touches:** `client/src/stores/ui/BrushUIStore.ts` (new) · `client/src/stores/ui/__tests__/BrushUIStore.test.ts` (new)
**Effort:** S

## Objective
A small UI store for brush-studio session state: selected frame/layer ids, the current delta
vector, zoom/pan for the brush canvas, and the playback flag. Not persisted. It exposes
`adoptDocument(doc)` so selection is re-seated when a brush loads.

## Context
- Shape to copy: `client/src/stores/ui/LightingUIStore.ts` (explicit `makeObservable` map,
  `observable.ref` for objects `:148-151`, setter methods, `hydrate`). Also
  `stores/ui/ViewportUIStore.ts` for zoom/pan naming (`zoom`, `panOffset`) — reuse the names,
  not the store (the project viewport is persisted per project and must not be stomped).
- Types: `BrushDocument`, `BrushDelta`, `BrushChannelType` from `types/brush.ts`; `clampDelta`.
- `stores/ui/**` may not be imported by `stores/domain/**`; this store imports nothing from domain.

## Steps
1. Create the store:
   ```ts
   export class BrushUIStore {
     selectedFrameId: string | null = null;   // observable
     selectedLayerId: string | null = null;   // observable
     selectedDelta: BrushDelta = [0, 0, 0, 0]; // observable.ref (replace whole tuple)
     zoom = 16;                                // observable; clamp 1..64
     panOffset: { x: number; y: number } = { x: 0, y: 0 };  // observable.ref
     isPlaying = false;                        // observable
     selectFrame(id: string | null): void
     selectLayer(id: string | null): void
     setDeltaChannel(index: 0|1|2|3, value: number): void    // clampDelta, new tuple
     setDelta(delta: BrushDelta): void
     resetDelta(): void
     setZoom(z: number): void; zoomBy(factor: number): void
     setPanOffset(p): void
     setPlaying(on: boolean): void; togglePlaying(): void
     /** Called when a document is installed/replaced: keep ids that still exist, else pick frame[0]/layer[top]. */
     adoptDocument(doc: BrushDocument | null): void
     /** Convenience for containers: the selected layer's channel type in `doc`, or null. */
     channelTypeIn(doc: BrushDocument | null): BrushChannelType | null
   }
   ```
   "top" layer = last element of `frame.layers` (matches the project convention: array end = top of stack, `LayerStore.ts:238`).
2. Tests: selection adoption keeps valid ids and replaces stale ones; `adoptDocument(null)`
   clears both; `setDeltaChannel` clamps and produces a new tuple reference; zoom clamps;
   `togglePlaying`.
3. Commit: `brush-studio(10): BrushUIStore`.

## Constraints
- Nothing persisted; do not touch `UIStore.ts` / `toPersistedUIState()`.
- No domain imports.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/stores/ui
cd client && bunx vitest run src/stores/ui
cd client && bun run lint:boundaries
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```

## Definition of done
- [ ] Store with the API above and explicit observability annotations.
- [ ] Tests pass; gate green; one commit with only Touches files.
