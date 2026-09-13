# 04 — Zoom out until the canvas is 50 px, whatever its size

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/hooks/useCanvasViewport.ts` · `client/src/stores/ui/ViewportUIStore.ts` · `client/src/stores/ui/CanvasCameraStore.ts` · `client/src/containers/LightingCanvasContainer.tsx` · `client/src/stores/ui/__tests__/viewZoomFloor.test.ts` (new)
**Effort:** M

## Objective

After this task, the user can keep zooming the canvas out until its **longest on-screen
dimension reaches 50 px**, regardless of the sprite's size or the pixel scale. The
current hard floor of `viewZoom ≥ 0.25` — which stops a 2560 px-wide composition at
640 px — is replaced by a floor derived from the content size.

## Context

### There are TWO zooms, and confusing them is the whole problem

| | `zoom` (pixel scale) | `viewZoom` (view transform) |
|---|---|---|
| Range today | 1 – 50 | **0.25 – 4** |
| Meaning | screen px per sprite px; changes what is rasterised | CSS `scale()` over the drawn bitmap |
| Set by | **nothing in production** | pinch + ctrl+wheel |

They multiply into one CSS transform: `combinedScale = zoom * viewZoom`
(`containers/CanvasContainer.tsx:5798`).

`viewport.zoom` is effectively **read-only in production** — the only writer is `hydrate`
(`ViewportUIStore.ts:360`); every other reference reads it (`CanvasContainer.tsx:615`,
`CanvasInfoContainer.tsx:94`, `FrameTimelineContainer.tsx:116`,
`ReferenceImagePanelContainer.tsx:55`) and it is displayed at
`ui/components/CanvasInfo/CanvasInfo.tsx:149`. **This task does not touch `zoom`.** Only
`viewZoom`'s floor changes.

### The five places holding the floor, all of which must agree

1. **`client/src/ui/hooks/useCanvasViewport.ts:68-70`** — the constants:
   ```ts
   /** View-zoom limits. Both legacy copies used exactly this range. */
   export const MIN_VIEW_ZOOM = 0.25;
   export const MAX_VIEW_ZOOM = 4;
   ```
2. **`useCanvasViewport.ts:346-349`** — the wheel clamp:
   ```ts
   const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_RATE);
   const newViewZoom = Math.max(MIN_VIEW_ZOOM, Math.min(MAX_VIEW_ZOOM, state.viewZoom * factor));
   ```
3. **`useCanvasViewport.ts:463-466`** — the pinch clamp, same shape.
4. **`client/src/stores/ui/ViewportUIStore.ts:199-202`**:
   ```ts
   setViewZoom(zoom: number): void { this.viewZoom = Math.max(0.25, Math.min(4, zoom)); }
   ```
5. **`client/src/stores/ui/CanvasCameraStore.ts:69-72`** — a duplicate of #4, with the
   comment "Same clamp as `ViewportUIStore.setViewZoom` — the gesture engine's range."

**There is no fit-to-screen calculation and no dimension-derived floor anywhere in the
app.** `MIN_VIEW_ZOOM` is a hard-coded literal. (`ExportPreviewModal.tsx:255` has a
`Math.max(1, Math.floor(160 / maxDim))` fit calc and `ui/canvas/render/renderLitComposite.ts:11`
documents one, but both are for **thumbnails**, not the viewport.)

### Where the content size lives

`client/src/ui/hooks/useCanvasGeometry.ts:128-134` — `contentWidth = cellWidth * zoom`
(and the height equivalent). **`contentWidth` is already passed into
`useCanvasViewport`** (its options are declared at `useCanvasViewport.ts:95-105`), so the
hook has the input it needs today.

The two stores do **not** have it, and must not go and get it: see the note at
`ViewportUIStore.ts:204-212` — stores are forbidden from reading the DOM. The floor must
be **passed in** to them.

### The zoom-out call sites

- `useCanvasViewport.ts:356` — `setViewZoom(newViewZoom)` from ctrl+wheel
- `useCanvasViewport.ts:497` — `setViewZoom(newViewZoom)` from pinch
- `useCanvasViewport.ts:238` — the debounced outward commit
- `containers/CanvasContainer.tsx:1087` — `onCommitViewZoom: (z) => camera.setViewZoom(z)`
- `containers/LightingCanvasContainer.tsx:363` — the same for the lighting pane

Resets (`setViewZoom(1)`) at `CanvasContainer.tsx:5517`, `LightingCanvasContainer.tsx:403`,
`ViewportUIStore.ts:213-216`, `CanvasCameraStore.ts:79` are not zoom-outs and need no change.

### Traps

- **`CanvasContainer.tsx` is owned by task 07 in this same plan and is NOT in this task's
  `Touches`.** Line 1087 calls `camera.setViewZoom(z)`; because the new floor is a
  parameter with a safe default, that call site compiles and behaves correctly
  unchanged. **Do not edit `CanvasContainer.tsx`.** If you conclude it must change, stop
  and record a blocker in `HANDOFF.md` rather than editing it — the collision matrix
  depends on this.
- The floor must never exceed the ceiling. On a tiny sprite the derived floor could
  compute above `MAX_VIEW_ZOOM`; clamp the floor itself to `Math.min(derivedFloor, 1)` so
  the user can always reach 1:1.
- `contentWidth`/`contentHeight` can be `0` during the first render. Guard: if either is
  non-positive, fall back to `0.25`.
- **Do not deep-observe anything.** No pixel-grid access is involved here; keep it that way.
- `ui/hooks/` is under the `ui/` boundary — `useCanvasViewport.ts` may not import a store,
  the API, or MobX. It already takes its inputs as options; keep that shape.

## Steps

1. **`useCanvasViewport.ts`** — add and export a pure helper beside the constants at
   lines 68–70:
   ```ts
   /** Smallest on-screen size, in CSS px, the canvas may be shrunk to. */
   export const MIN_CANVAS_SCREEN_PX = 50;

   /**
    * The view-zoom floor for a given content size. Derived, not fixed: the old
    * hard 0.25 stopped a 2560px composition at 640px, so a large sprite could
    * never be seen whole. Clamped to <= 1 so 1:1 is always reachable, and
    * falls back to the legacy 0.25 before the first measurement lands.
    */
   export function viewZoomFloor(contentWidth: number, contentHeight: number): number {
     const longest = Math.max(contentWidth, contentHeight);
     if (!(longest > 0)) return 0.25;
     return Math.min(1, MIN_CANVAS_SCREEN_PX / longest);
   }
   ```
   Keep `MIN_VIEW_ZOOM = 0.25` exported — it stays the documented fallback.

2. Replace the two clamp expressions (`:346-349` wheel, `:463-466` pinch) so their lower
   bound is `viewZoomFloor(contentWidth, contentHeight)` from the hook's options rather
   than `MIN_VIEW_ZOOM`.

3. **`ViewportUIStore.ts:199-202`** — change the signature to
   `setViewZoom(zoom: number, floor: number = 0.25): void` and clamp with
   `Math.max(floor, Math.min(4, zoom))`. Update the doc comment to say the floor is
   supplied by the caller because the store may not read the DOM, citing the existing
   note at `:204-212`.

4. **`CanvasCameraStore.ts:69-72`** — the identical change, and update its "Same clamp as
   `ViewportUIStore.setViewZoom`" comment so the two stay documented as twins.

5. **`LightingCanvasContainer.tsx:363`** — pass the floor through:
   `camera.setViewZoom(z, viewZoomFloor(contentWidth, contentHeight))`, using whatever
   content dimensions that container already has in scope. If it does not have them,
   leave the call as-is (the default keeps today's behaviour) and record that in
   `HANDOFF.md` — do **not** invent a new measurement path in this task.

6. **Commit** ("feat(canvas): derive the zoom-out floor from content size").

7. **New test `client/src/stores/ui/__tests__/viewZoomFloor.test.ts`.** Cover the pure
   helper — it is exported from `ui/hooks/`, so import it directly:
   - a 2560×2240 content gives a floor below 0.25 (≈ 0.0195);
   - a 40×40 content gives a floor clamped to 1, never above;
   - a 0-width content returns 0.25;
   - `ViewportUIStore.setViewZoom(0.01, 0.0195)` stores 0.0195, not 0.25;
   - `setViewZoom` with no floor argument still clamps at 0.25 (the legacy contract).

8. **Commit** ("test(canvas): pin the derived view-zoom floor").

## Constraints

- **Do not edit `client/src/containers/CanvasContainer.tsx`** — task 07 owns it.
- Do not change `MAX_VIEW_ZOOM`, `resetView()`, or any `setViewZoom(1)` reset.
- Do not change `ViewportUIStore.setZoom` (the 1–50 pixel-scale clamp) or add a UI
  control for it. That is a different feature.
- Do not change the wire format. `viewZoom` is persisted as conditional key 47
  (`UIStore.ts`) — its serialization is untouched by this task.
- Do not read the DOM from a store.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art
bun run typecheck        # expect exit 0
bun run lint             # 0 errors; warnings ≤ 65
bun run test             # 0 failures — INCLUDING the corpus suite, which must be unchanged
bun run build
```

⚠️ The corpus suite must pass **unchanged**. Never run `vitest -u`.

**Manual checks:**

1. Open the owner's real project (the large one). Pinch to zoom out repeatedly → the
   canvas keeps shrinking well past the old limit, down to roughly a 50 px thumbnail.
2. Zoom back in → the ceiling is still 4× and nothing snaps or jumps.
3. Reset view → returns to `viewZoom = 1` and the canvas is centred.
4. On a small sprite (e.g. 32×32), zooming out stops at a sensible size and 1:1 is still
   reachable.
5. The lighting pane's zoom still behaves (either improved or unchanged — record which).
6. Zoom out fully, then draw → the stroke lands on the correct pixel. Coordinate mapping
   must survive the wider scale range.

## Definition of done

- [ ] `viewZoomFloor()` and `MIN_CANVAS_SCREEN_PX` exist and are exported from `useCanvasViewport.ts`.
- [ ] The wheel and pinch clamps use the derived floor.
- [ ] Both stores' `setViewZoom` accept a `floor` parameter defaulting to `0.25`.
- [ ] `CanvasContainer.tsx` is **not** in the diff.
- [ ] Tests cover the helper's three branches and both store clamps.
- [ ] The corpus suite passes unchanged; no `vitest -u` was run.
- [ ] `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build` all exit 0, real output pasted into `HANDOFF.md`.
- [ ] All six manual checks performed and recorded, with the zoom-out check done on the owner's real (large) project.
