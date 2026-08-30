# 08 — BrushStructureStore (frames, layers, applied groups)

**Wave:** W4 · **Depends on:** 07, 10
**Touches:** `client/src/stores/domain/BrushStructureStore.ts` (new) · `client/src/stores/domain/__tests__/BrushStructureStore.test.ts` (new)
**Effort:** M

## Objective
A behaviour module over `BrushStore.document` implementing every structural operation the
brush studio needs — frames (add/duplicate/delete/rename/move), layers (add/delete/rename/
visibility/move up-down/duplicate/channel type/applied group — **always applied to every
frame**), applied groups (add/rename/delete), and resize — each as one undoable `commit`, and
each preserving the uniform-layer invariant.

## Context
- Deps/injection pattern: `stores/domain/FrameStore.ts:52-71` and `LayerStore.ts:97-118`
  (a `selection` source of ids + a sink to select). Here:
  ```ts
  export interface BrushSelectionSource { readonly selectedFrameId: string | null; readonly selectedLayerId: string | null }
  export interface BrushSelectionSink { selectFrame(id: string | null): void; selectLayer(id: string | null): void }
  export interface BrushStructureStoreDeps { brush: BrushStore; source: BrushSelectionSource; select: BrushSelectionSink }
  ```
  (task 11 passes `brushUI` for both `source` and `select`; this file must not import it.)
- Immutable spine writes: `LayerStore.ts:219-226 mapFrames`. Everything goes through
  `brush.commit(label, mutate)` from task 07; `mutate` must return a **new** document (never
  mutate in place) and must call `assertUniformLayers` on its result in dev (cheap: O(frames×layers)).
- Layer ids are stable across frames (MASTER D6). "Add layer" adds the same `{id, name, channelType}`
  with a fresh empty grid to **every** frame; "move up/down" swaps adjacent positions in every
  frame; "delete" removes the id from every frame. There is deliberately **no** per-frame
  reorder API.
- Ids: use the same id helper the project stores use (grep `generateId`/`crypto.randomUUID` in
  `stores/domain/ObjectStore.ts` and copy the call).
- Array end = top of stack (as `LayerStore.addLayer :238`). Frame order = `frames` array order.

## Steps
1. Implement:
   ```ts
   // frames
   addFrame(name?: string, copyPrevious = false): string   // new frame after the selected one; same layer ids; empty (or copied) grids; selects it
   duplicateFrame(id): void; deleteFrame(id): void          // refuse to delete the last frame (no-op)
   renameFrame(id, name): void; moveFrame(id, direction: "left" | "right"): void; reorderFrame(id, toIndex): void
   // layers (uniform across frames)
   addLayer(name: string, channelType: BrushChannelType): string   // appended on top in every frame; selects it
   deleteLayer(id): void                                            // refuse to delete the last layer (no-op)
   renameLayer(id, name): void; toggleLayerVisibility(id): void
   moveLayer(id, direction: "up" | "down"): void                    // swap with neighbour in EVERY frame
   duplicateLayer(id): string                                       // copies grids in every frame
   setLayerChannelType(id, type): void                              // relabel only — cell values untouched
   setLayerAppliedGroup(id, groupId: string | null): void
   // groups
   addAppliedGroup(name): string; renameAppliedGroup(id, name): void
   deleteAppliedGroup(id): void                                     // clears appliedGroupId on layers that used it
   // document
   resizeBrush(width, height): void                                 // top-left anchored crop/pad on every grid
   ```
   Each method: read `brush.document`; if null or target missing, return without committing.
2. Tests (build docs with `createBrushDocument` + a fake `BrushApiLike` as in task 07's test, or
   construct `BrushStore` with a stub `session`): after **every** mutation call
   `assertUniformLayers(store.document!)`. Cover: add layer appears in all frames with same id/
   order; move up/down swaps in all frames and is a no-op at the ends; delete last layer/frame
   is a no-op; `addFrame(copyPrevious=true)` deep-copies grids (mutating the new one doesn't
   touch the old); `setLayerChannelType` keeps cell values; `deleteAppliedGroup` clears
   references; `resizeBrush` crops/pads; each op is exactly one history entry and undo restores
   the previous document reference; selection sink called on add/delete.
3. Commit: `brush-studio(08): BrushStructureStore`.

## Constraints
- Do not edit `BrushStore.ts`, `brushCommands.ts`, or any `stores/ui/**`.
- No per-frame layer ordering, no variants, no in-place mutation.
- Never touch cell values except in `resizeBrush`/`duplicate*`/`addFrame(copy)`.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/stores/domain
cd client && bunx vitest run src/stores
cd client && bun run lint:boundaries
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```

## Definition of done
- [ ] Every method above implemented as a single `commit`.
- [ ] Tests assert the invariant after every op and cover the listed cases.
- [ ] Gate green; one commit with only Touches files.
