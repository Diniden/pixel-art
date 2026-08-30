# 04 — Reflection-line painter and dash ticker hook

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/canvas/render/renderReflectionLines.ts` (new) · `client/src/ui/canvas/render/__tests__/renderReflectionLines.test.ts` (new) · `client/src/ui/hooks/useDashTicker.ts` (new) · `client/src/ui/hooks/__tests__/useDashTicker.dom.test.ts` (new)
**Effort:** M

## Objective
A pure painter turns reflection lines into screen-space segments and strokes them as an
animated dotted line (phase-driven `lineDashOffset`), and a hook provides the codebase's
first continuous overlay animation loop — active only while there is something to
animate.

## Context
- Every painter in `ui/canvas/render/` splits **geometry (pure data, unit-tested)** from
  **stroking (asserted via the stub context's recorded calls)** — see
  `renderOriginCross.ts:6-18` (`originCrossGeometry` / `drawOriginCross`) and
  `renderSelectionOverlay.ts:270-334` (`marchingAntsRects` / `drawMarchingAnts`, which
  is *static*: `lineDashOffset = 4`, no time input). Test helpers:
  `client/src/test/canvasStub.ts` (`createStubContext`, records path/stroke calls) and
  `ui/canvas/render/__tests__/renderOriginCross.test.ts` as the test template.
- Colours come from `client/src/ui/theme/canvasTokens.ts` only (a parity test fails the
  build on drift). Use `ACCENT_VARIANT` (`:40`, purple — distinct from the cyan
  selection ants) for the dark dash and `WHITE` (`:47`) for the light dash. Draft line:
  same colours at `ctx.globalAlpha = 0.5`.
- The overlay canvas is `canvasWidth × canvasHeight` device pixels with the same
  pan/zoom CSS transform as the main surface, so grid coordinate `g` maps to
  `(g - viewOrigin) * zoom` — the same mapping `renderOverlay` uses at
  `CanvasContainer.tsx:1370-1372` (`ox = isEditingVariant ? viewMinX : 0`).
- Animation: `ui/hooks/useCanvasRender.ts` is one-shot per `invalidate()`. The only rAF
  loops in the codebase are the modal players (`ui/components/PreviewModal/PreviewModal.tsx:320-330`);
  imitate their `performance.now()` gating. Marching-ants speed: advance the phase by
  1 px every ~80 ms (≈12 fps) — do **not** repaint at 60 fps.

## Steps
1. `renderReflectionLines.ts`:
   ```ts
   export interface ReflectionLineInput { x1: number; y1: number; x2: number; y2: number }
   export interface ReflectionSegment { x1: number; y1: number; x2: number; y2: number; draft: boolean }
   export const REFLECTION_DASH = 4;           // px, screen space (not zoom-scaled, like ORIGIN_CROSS_SIZE)
   export const REFLECTION_DASH_PERIOD = REFLECTION_DASH * 2;
   export function reflectionSegments(lines: readonly ReflectionLineInput[], draft: ReflectionLineInput | null,
     zoom: number, viewOriginX: number, viewOriginY: number): ReflectionSegment[];
   export function drawReflectionLines(ctx: CanvasRenderingContext2D, segments: readonly ReflectionSegment[], phase: number): void;
   ```
   `drawReflectionLines`: for each segment stroke twice — a 2px `ACCENT_VARIANT` line with
   `setLineDash([4,4])`, `lineDashOffset = -phase`, then a 1px `WHITE` line with the same
   dash and `lineDashOffset = -phase + 4` (the two-phase trick from `drawMarchingAnts`).
   Draft segments at `globalAlpha 0.5`. Reset dash/alpha/lineWidth at the end. Skip
   degenerate segments. Extend each committed line to the canvas bounds? **No** — draw the
   segment the user drew (locked D8); the reflection *effect* is infinite, the guide is not.
2. Tests: geometry mapping with zoom and view origin; draft flag; degenerate skipped;
   stroke test asserting via the stub that `setLineDash` and `lineDashOffset` are set from
   `phase` and reset afterwards; `phase` wraps (`phase % REFLECTION_DASH_PERIOD`).
3. `useDashTicker.ts`:
   ```ts
   export function useDashTicker(active: boolean, onTick: (phase: number) => void, options?: { stepMs?: number; period?: number }): void
   ```
   While `active`, runs a rAF loop; every `stepMs` (default 80) increments phase by 1
   modulo `period` (default 8) and calls `onTick(phase)`. Cancels on `active=false` or
   unmount. Keep `onTick` in a ref so the loop is never re-created on re-render (same
   discipline as `useCanvasRender`'s `renderRef`). Must be StrictMode-safe (double
   effect mount → exactly one loop).
4. `useDashTicker.dom.test.ts` (jsdom lane): use `vi.useFakeTimers()` +
   `vi.stubGlobal("requestAnimationFrame", …)` to assert ticks advance and wrap, no ticks
   when inactive, and cleanup on unmount. Template: `ui/hooks/__tests__/useLongPress.dom.test.ts`.
5. Commit: `feat(canvas): reflection-line painter and dash ticker hook`.

## Constraints
- No store/MobX/API imports (`ui/`). No `CanvasContainer` edits (task 07).
- Do not modify `canvasTokens.ts` unless a needed colour is missing — it is not.

## Verification
```sh
cd client && bunx tsc --noEmit
cd client && bunx vitest run src/ui/canvas/render src/ui/hooks 2>&1 | tail -8
cd client && bunx eslint src/ui/canvas/render src/ui/hooks && bun run lint:boundaries
```

## Definition of done
- [ ] Painter split into geometry + stroke; both tested.
- [ ] Ticker hook tested for start/stop/wrap/unmount; StrictMode-safe by construction (ref + cleanup).
- [ ] Boundary check passes.
