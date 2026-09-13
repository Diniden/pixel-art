# 05 — Brush handler, hover footprint, `usePixelBrush`, canvas wiring

**Wave:** W2 · **Depends on:** 01, 02, 03
**Touches:** `client/src/ui/canvas/tools/toolHandlers.ts` · `client/src/ui/canvas/tools/toolFootprint.ts` · `client/src/ui/canvas/tools/__tests__/toolFootprint.test.ts` · `client/src/ui/canvas/tools/__tests__/toolHandlers.test.ts` (new) · `client/src/containers/pixelBrush/usePixelBrush.ts` (new) · `client/src/containers/pixelBrush/__tests__/usePixelBrush.dom.test.ts` (new) · `client/src/containers/CanvasContainer.tsx` · `client/src/containers/__tests__/pixelBrushTool.dom.test.tsx` (new)
**Effort:** L

## Objective
The brush tool draws. Hovering shows the brush's footprint centred on the cursor; clicking stamps the
settled colours; dragging stamps along the segment; one undo entry per drag; selection masks and
reflection mirroring apply because writes go through `actions.setPixels`. The brush document is
loaded on demand in pixel mode. With no document loaded, the marker is absent and strokes write
nothing.

## Context
- **Module from task 02:** `client/src/ui/canvas/tools/pixelBrushStamp.ts` — `PixelBrushFootprint`,
  `PixelBrushStamp`, `pixelBrushFootprint(layers, w, h)`, `resolvePixelBrushStamp(layers, w, h, base)`,
  `stampPixelBrushSegment(prev, next, line, stamp, bounds)`.
- **Store from task 03:** `app.brushUI.selectedFrameIn(doc)`. Brush store: `app.brushes.document`
  (`observable.ref`), `loadState`, `hasBrush`, `pixelVersion`, `domainVersion`, `init()` (idempotent,
  StrictMode-safe, `BrushStore.ts:286-305`). **Only caller of `init()` today is the brush studio's mount
  effect**, so in pixel mode the document is `null` until someone calls it.
- **Handler table:** `client/src/ui/canvas/tools/toolHandlers.ts` — `ToolContext` `:78-121`,
  `ToolEvent` `:124-129`, `paintDown/paintMove` `:147-188` (the shape to imitate), `pixel` entry
  `:196-199`, placeholder `brush: {}` (task 01). Purity: no store/MobX/API imports.
- **Footprint:** `client/src/ui/canvas/tools/toolFootprint.ts` — header `:1-45` documents three
  footprint classes; `FootprintOptions` `:58-70`; `isBrushTool` `:84-86` (**do not extend** — its test at
  `__tests__/toolFootprint.test.ts:126` pins exactly three tools); `toolFootprint` `:95-133`.
- **Container:** `client/src/containers/CanvasContainer.tsx` (6157 lines, already over `max-lines` — a
  pre-existing warning). `actions.setPixels` `:880-894` is the single mirror/mask funnel; `beginStroke`
  `:924`; `resolveHoverCells` `:2258-2292` (a `useCallback`; the hovered cell is read at paint time);
  `getToolContext` `:4382-4455` **with its dependency array `:4443-4455`** — the file warns five times
  (`:2180, :3179, :3628, :3657, :5886`) that pointer-rate values must never be deps; `currentColor`
  is already a dep; `pointer = useCanvasPointer(...)` `:4470-4477`; cursor ladder `:5725-5739` (leave
  `crosshair`). `isGestureTool` `:386-395` — the brush is **not** a gesture tool. `MOUSE_ONLY_TOOLS`
  (`ui/hooks/useCanvasPointer.ts:64`) — the brush must work on touch, so do not add it.
- **Marker plumbing** (unchanged): `placeHoverCells` `:2311`, `renderHover` `:2321-2345`, the SVG outline
  `:2296-2304` from the same cells — both derive from `resolveHoverCells`, so a non-contiguous footprint
  gets a correct outer perimeter for free (`renderHoverMarker.ts:97 markerPerimeter`).
- **Hook precedent:** `client/src/containers/brush/useBrushHover.ts` (small container-tier hook) and the
  "read grids at compute time, never observe them" note in `containers/brush/brushPanes.ts:22-25`.
- **Test rigs:** `client/src/containers/__tests__/eraserBrushWidth.dom.test.tsx` is the stroke rig to
  copy — it mounts the REAL `CanvasContainer`, stubs `HTMLElement.prototype.getBoundingClientRect`
  (`:129`, the header at `:36` says why the stub is load-bearing), fires
  `fireEvent.mouseDown(surface, { button: 0, ...at(x, y) })` (`:185`) and counts the pixels written.
  `selectionTouch.dom.test.tsx:306-319` does the same with `touchStart/Move/End`.
  (`CanvasContainer.dom.test.tsx` does **not** fire pointer events — measured; use it only for how a
  project is installed and layers are read.) `client/src/stores/__tests__/brushWiring.test.ts` and
  `containers/__tests__/BrushStudioPanelContainer.dom.test.tsx` for constructing `ApplicationStore` with
  `autoSaveEnabled: false` and installing a brush document via `app.brushes.installDocument(doc)`.
- `Color` (`ui.tool.selectedColor`) has `{ r, g, b, a }` — confirm in `types/domain.ts` (grep `interface Color`).

## Steps
1. **`toolFootprint.ts`:** add `pixelBrushOffsets?: ReadonlyArray<{ dx: number; dy: number }> | null` to
   `FootprintOptions` (doc: "class 4 — injected cells for the `brush` tool; `null`/`undefined` = no brush
   loaded → empty footprint"). In `toolFootprint`, before the `isBrushTool` branch:
   `if (tool === "brush") { const offs = options.pixelBrushOffsets; if (!offs) return []; return offs.map(o => ({ x: center.x + o.dx, y: center.y + o.dy })).filter(p => inBounds(p, bounds)); }`.
   Extend the header's class list. Tests: brush + offsets → translated & clipped cells; brush + null → `[]`;
   brush with offsets does not affect `isBrushTool`; other tools ignore the option.
2. **`toolHandlers.ts`:** add `pixelBrushStamp?: PixelBrushStamp | null` to `ToolContext` (optional — the
   brush studio's `buildBrushToolContext` must compile untouched). Replace the placeholder with
   ```ts
   brush: {
     onDown: (e, ctx) => {
       ctx.beginStroke();
       const stamp = ctx.pixelBrushStamp ?? null;
       if (stamp) { const w = stampPixelBrushSegment(null, e.coords, ctx.line, stamp, ctx); if (w.length > 0) ctx.setPixels(w); }
       ctx.setLastStrokePixel(e.coords);
     },
     onMove: (e, ctx) => {
       const stamp = ctx.pixelBrushStamp ?? null;
       if (stamp) { const w = stampPixelBrushSegment(ctx.lastStrokePixel, e.coords, ctx.line, stamp, ctx); if (w.length > 0) ctx.setPixels(w); }
       ctx.setLastStrokePixel(e.coords);
     },
   },
   ```
   (`ctx` satisfies `StampBounds` via `gridWidth/gridHeight`). New `__tests__/toolHandlers.test.ts`: a fake
   `ToolContext` with spies; `brush.onDown` calls `beginStroke` once, `setPixels` once with the translated
   stamp cells carrying their colours, `setLastStrokePixel(coords)`; `onMove` uses `lastStrokePixel` and the
   injected `line`; with `pixelBrushStamp: null` → `beginStroke` still called, `setPixels` never;
   `getToolHandler("brush")` returns the entry; the `pixel` entry is unchanged (one regression assertion).
3. **`containers/pixelBrush/usePixelBrush.ts`** (new, container tier):
   ```ts
   export interface PixelBrushState { footprint: PixelBrushFootprint | null; stamp: PixelBrushStamp | null; loadState; brushName: string | null }
   export function usePixelBrush(app: ApplicationStore, enabled: boolean, base: { r; g; b; a }): PixelBrushState
   ```
   - `useEffect(() => { if (enabled) void app.brushes.init(); }, [app, enabled]);`
   - read `const doc = app.brushes.document; const frameId = app.brushUI.selectedFrameId; const pv = app.brushes.pixelVersion; const dv = app.brushes.domainVersion;`
     (the caller is an `observer`, so these subscribe; the grids inside `doc` are plain arrays and are read
     only inside the memos);
   - `footprint = useMemo(() => { if (!enabled || !doc) return null; const frame = app.brushUI.selectedFrameIn(doc); return frame ? pixelBrushFootprint(frame.layers, doc.width, doc.height) : null; }, [app, enabled, doc, frameId, pv, dv])`;
   - `stamp = useMemo(() => { … resolvePixelBrushStamp(frame.layers, doc.width, doc.height, { r, g, b, a }) … }, […same…, base.r, base.g, base.b, base.a])`.
   - Document in the header why `enabled` gates the memos (no work for other tools) and why the base colour
     is spread into scalar deps (a fresh object per render must not churn the memo).
   Test (`__tests__/usePixelBrush.dom.test.ts`, `renderHook` inside an `observer` wrapper or a tiny observer
   component): `init` is called when enabled and not when disabled (spy on `app.brushes.init`); with an
   installed 3×3 document the footprint offsets and stamp colours match the pure module; the same `stamp`
   reference survives a re-render with an equal base colour; a new base colour yields a new stamp with
   re-settled colours; a frame switch (`brushUI.selectFrame`) changes the footprint; `document === null`
   → both `null`.
4. **`CanvasContainer.tsx`** (≤ 25 added lines — push everything else into the hook):
   - `const pixelBrush = usePixelBrush(app, currentTool === "brush", currentColor);`
   - `resolveHoverCells`: pass `pixelBrushOffsets: pixelBrush.footprint?.offsets ?? null` and add
     `pixelBrush.footprint` to its deps.
   - `getToolContext`: `pixelBrushStamp: pixelBrush.stamp,` and add `pixelBrush.stamp` to the dependency
     array (it changes only with document / frame / colour — comment that).
   - Nothing else: cursor stays `crosshair`; `markerPolicy` untouched; no gesture-tool arbitration.
5. **Container stroke test** (`containers/__tests__/pixelBrushTool.dom.test.tsx`, new): copy the
   `eraserBrushWidth.dom.test.tsx` rig (real `CanvasContainer`, the `getBoundingClientRect` stub, its
   `at(x, y)` helper); install a 1-layer 8×8 project the way that rig does; install a
   3×3 brush document (rgb layer with deltas at two cells, one hsl layer with a hue shift at one of them);
   set `ui.tool.selectedColor` and `setTool("brush")`; `fireEvent.mouseDown(surface, { button: 0, ...at(4, 4) })`
   then a window `mouseup`; assert the project layer now holds exactly the settled colours at
   `(4,4)+offset` (compute the expected values with `settlePixelBrushColor` in the test); a second click
   after ⌘Z-equivalent (`app.undo()`) restores the cells; with `installDocument(null)` a click writes
   nothing but `history` still gained one entry per drag (or assert whatever `strokeControl.end()` does for
   an empty transaction — read `stores/history/editorHistory.ts:41-56` and pin the observed behaviour).
6. Commit: `pixel-brush(05): brush tool draws — handler, hover footprint, usePixelBrush, canvas wiring`.

## Constraints
- Do not edit `brushStamp.ts`, `pixelBrushStamp.ts`, `useCanvasPointer.ts`, `markerPolicy.ts`,
  `containers/brush/**`, any store, any `ui/components/**`.
- `isBrushTool` unchanged; `pixelBrushStamp` stays optional on `ToolContext`.
- No `will-change`; grids never observed; `getToolContext` deps must not include pointer-rate values.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx eslint src/ui/canvas/tools src/containers          # no NEW warnings on CanvasContainer.tsx beyond the pre-existing max-lines
cd client && bunx vitest run src/ui/canvas/tools src/containers
cd client && bunx vitest run                                        # whole suite once
cd client && bun run lint:boundaries
cd .. && git status --short                                         # no __snapshots__
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```
Manual (owner, `bun run dev`, desktop + iPad) — list each as performed / not performed:
1. Fresh load in pixel mode, press `B`: the brush list loads and the first brush becomes the footprint
   (no visit to the Brush Studio needed).
2. Hover: the marker is exactly the painted cells of the brush's current frame, centred on the cursor,
   clipped at the grid edge; hidden brush layers do not appear.
3. Click: those cells land in the selected colour tinted per layer; drag: a continuous ribbon; ⌘Z removes
   the whole drag in one step.
4. Change the selected colour and click again: the tint re-settles from the new base.
5. With a selection active, the stamp is clipped to the mask; with reflection lines, it mirrors.
6. Pencil with a resting finger on the iPad still draws (no change to touch arbitration).
7. Brush Studio: paint a new cell / hide a layer / switch frame, return to pixel mode, press `B`: the
   footprint and colours reflect the change.

## Definition of done
- [ ] `brush` handler filled; `toolFootprint` class 4; `usePixelBrush` hook; container wired with ≤ 25 added lines.
- [ ] Unit, hook and container tests green; whole suite green; no snapshot changed; one commit.
- [ ] Manual checks listed with performed / not performed.
