# 32 — Canvas decomposition step 3: `CanvasSurface`, `CanvasInteractionStore`, and `CanvasContainer`

**Wave:** W24 · **Depends on:** 31, 26
**Touches:** `client/src/components/Canvas/Canvas.tsx` (deleted at the end) · `client/src/ui/components/CanvasSurface/CanvasSurface.tsx` (new) + `.stories.tsx` · `client/src/ui/hooks/useCanvasGeometry.ts` (new) · `client/src/containers/CanvasContainer.tsx` (new) · `client/src/stores/ui/CanvasInteractionStore.ts` (new) · `client/src/stores/{ApplicationStore,bridge/zustandBridge}.ts` · `client/src/store/drawingActions.ts` · `client/src/ui/components/CanvasInfo/` (moved) · `client/src/containers/CanvasInfoContainer.tsx`
**Effort:** L

## Objective

After this task `Canvas.tsx` no longer exists: it is a pure `CanvasSurface` in `ui/components/` with stories, a `CanvasContainer` in `containers/`, a `useCanvasGeometry` hook, and a `CanvasInteractionStore` holding the three transient gesture fields. The single largest coupling site in the app — **47 store members in one destructure** — is gone.

## Context

### What remains in `Canvas.tsx` after tasks 30 and 31

Concerns 1 and 2 of the original 11:

| # | Concern | Original lines | Size |
| --- | --- | --- | --- |
| 1 | Store binding — **47 members** from one `useEditorStore()` call | 101-149 | 49 |
| 2 | Grid/view geometry — variant-aware bounds, `canvasWidth`/`canvasHeight`, cache keys | 151-285 | 135 |

Plus the JSX: a stack of 4 `<canvas>` elements, the transform wrapper, and the cursor.

### The 47 members, and why a props interface must not be written for them

`Canvas.tsx` destructures **47 store members** — 9 top-level state fields, 19 `uiState` sub-fields, and 38 actions (the counts overlap because some members are getters). A purified component taking all 47 as props would have a ~52-prop interface, which is a pathological artefact of a component that had 11 responsibilities. **That is why tasks 30 and 31 came first.**

After those two tasks, `CanvasSurface` should need roughly 10-15 props: the canvas refs, dimensions, zoom/pan transform, cursor, and the event handlers the hooks return.

### `CanvasInteractionStore` — three transient fields

| Field | Kind | Note |
| --- | --- | --- |
| `isDrawing` | `observable` | read only by `Canvas` today; kept observable because the container re-renders the tool cursor on it |
| `drawStartPoint` | **`observable.ref`** | a `Point`, replaced wholesale — deep observation is waste |
| `previewPixels` | **`observable.ref`** | ⚠️ **rewritten on EVERY mousemove.** `observable.ref` plus whole-array replacement is **mandatory**; a deeply observable array here is a per-frame allocation storm. |

Actions: `startDrawing`, `updateDrawing`, `endDrawing`, `setPreviewPixels`, `clearPreviewPixels` (from `drawingActions.ts`). **None of these enters history and none triggers a save.**

### The canvas is NOT an `observer`

`Canvas` and `LightingCanvas` are imperative `<canvas>` renderers. They must use:

```ts
reaction(() => [pixelVersion, zoom, panOffset, /* … */], redraw, { fireImmediately: true })
```

inside a `useEffect` — **not** `observer` on grid data. Reactive rendering into an imperative canvas via `observer` is the wrong tool and causes double redraws.

`layer.pixels` remains `observable.ref`; anything deriving from pixel content reads `pixelVersion`.

### The observable → plain props boundary

| Situation | Rule |
| --- | --- |
| Primitive (`number`/`string`/`boolean`) | pass directly — reading it in the container's render **is** the subscription |
| Small `observable.ref` object (`Color`, `Point`, `Normal`, `SelectionBox`) | pass the reference; it is immutable by convention (always replaced, never mutated in place) |
| Observable array | **never pass it.** Pass a computed-derived plain array, or pass ids and let per-item containers read their own item |
| Domain node (`PixelObject`, `Frame`, `Layer`, `VariantGroup`) | **never pass the node.** Project it to a flat view-model |
| `PixelData[][]` grid | **never pass it to a React component at all.** Only `<canvas>` renderers touch grids, and they receive them through the `reaction`, not through props |
| Store instance | **never.** A presentational component receiving a store is an automatic review rejection |

`toJS()` is **not** the tool here — it deep-clones, and on a `PixelObject` that is a 6.9 MB copy. Use it only in tests and in `serialize()`.

### `CanvasInfo` comes along

`client/src/components/Canvas/CanvasInfo.tsx` (146 lines, 7 store members) shares `Canvas.css` and calls `useEditorStore()` **twice** (lines 12-19 and 51). It moves to `ui/components/CanvasInfo/` with a single container. Note task 20's BEM conversion already established that `Canvas.css` legitimately declares two blocks, `canvas` and `canvas-info`.

### Stories

`CanvasSurface` gets **5 stories**: default, variant-edit mode, selection active, frame overlay, and light-grid mode. Use the shared fixtures from task 10 (`projectEmpty`, `projectTypical`, `projectDense`) — **not** `Base Unit.json`.

The `LightGridMode` story is where the `lightGridMode` round-trip fix from task 02 first becomes *visible*, so use it as the manual verification for that fix's persistence claim.

## Steps

1. Create `CanvasInteractionStore` with the three fields and five actions; move them out of `drawingActions.ts`; update the bridge lists.
2. Extract `useCanvasGeometry` from concern 2 (lines 151-285): variant-aware view bounds, `canvasWidth`/`canvasHeight`, cache keys.
3. Create `client/src/ui/components/CanvasSurface/CanvasSurface.tsx` — **purely presentational**: the 4-`<canvas>` stack, the transform wrapper, the cursor. Props only. It must import no store, no API, no MobX.
4. Create `client/src/containers/CanvasContainer.tsx` as an `observer()` that reads the observables, drives the render `reaction`, wires the hooks from task 31, and renders `CanvasSurface`.
5. Move `CanvasInfo.tsx` to `ui/components/CanvasInfo/` and give it a container.
6. **Delete `client/src/components/Canvas/Canvas.tsx`.**
7. Write the 5 `CanvasSurface` stories.

## Constraints

- **`CanvasSurface` must import nothing from `stores/`, `store/`, `api/`, `services/` or `mobx`**, and must not call `useContext`. Task 05's ESLint rule enforces this.
- **The canvas containers use `reaction`, not `observer`, for redraw.**
- **`previewPixels` must be `observable.ref` with whole-array replacement.**
- **Never pass a `PixelData[][]` grid as a React prop.**
- Do not restructure `LightingCanvas.tsx` — the next task owns it.
- Do not use `toJS()` outside tests.
- The save payload must stay byte-identical.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run build && bunx storybook build
test ! -f src/components/Canvas/Canvas.tsx
! grep -rn "useEditorStore\|from \"mobx\|stores/" src/ui/components/CanvasSurface
bunx vitest run src/ui/canvas                 # golden-hash render tests from task 30 still pass
```

Manual checks — **the full drawing matrix, again, because this is the highest-risk file in the project**:

1. Pencil, eraser, line, rect, ellipse, flood fill, gaussian fill; all 4 selection modes; all 3 `selectionBehavior` values; move tool; eyedropper revert; origin tool; both trace modes.
2. All 12 tool hotkeys; WASD under all three priority modes; arrows under each `selectionBehavior`; Escape's 3-level precedence; `.`/`,` frame nav.
3. Pan and zoom: trackpad pinch, ctrl+wheel, two-finger pan, touch pinch.
4. Undo **during** an in-progress drag.
5. Variant-edit mode, selection with marching ants, lasso, frame overlay and trace overlay all render correctly.
6. **Performance: a 100-pixel drag must stay under 16 ms/frame.**
7. The 5 `CanvasSurface` stories render **without any store provider** — that is the proof the boundary holds.
8. Toggle `lightGridMode` and reload — it must persist (task 02's fix, now visible).

## Definition of done

- [ ] `client/src/components/Canvas/Canvas.tsx` is **deleted**.
- [ ] `CanvasSurface` is pure, lives in `ui/components/`, takes roughly 10-15 props, and imports no store/API/MobX.
- [ ] `CanvasContainer` is the only `observer()` involved and drives redraw through a `reaction`, not `observer` on grid data.
- [ ] `CanvasInteractionStore` holds the three gesture fields with `previewPixels` and `drawStartPoint` as `observable.ref`.
- [ ] `useCanvasGeometry` exists; `CanvasInfo` moved to `ui/components/` with a container.
- [ ] 5 `CanvasSurface` stories exist and render **with no store provider**.
- [ ] No `PixelData[][]` grid is passed as a React prop anywhere.
- [ ] The 100-pixel drag stays under 16 ms/frame.
- [ ] The full 8-point manual matrix was performed and recorded.
