# 04 — `useScreenPixelGrid` hook

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/ui/hooks/useScreenPixelGrid.ts` (new) · `client/src/ui/hooks/__tests__/useScreenPixelGrid.dom.test.ts` (new)
**Effort:** S

## Objective

A React hook reports the device-pixel ratio and the viewport element's client offset,
`{ dpr, originX, originY }`, and re-renders when either changes. Task 06 feeds these into
`screenChrome.ts`'s snapping so the selection line lands on whole device pixels on the owner's
real screen.

## Context

- **Locked decision:** MASTER D20.
- **Why the origin matters.** Device pixels are aligned to the window. The canvas viewport sits
  after rails whose widths can be fractional, so a line snapped only in viewport-local coordinates
  can still straddle two device pixels. `screenChrome.snapEdge` (task 03) takes `origin` for this.
- **Why the DPR matters.** It is 2 on the MacBook, 1 on a typical external monitor, and 1.25 or
  1.5 on many Windows laptops. It changes when the window moves between displays or the browser
  zoom changes. `devicePixelRatio` is not read anywhere in the client today (MASTER §4.2).
- **Detecting a DPR change.** `matchMedia(\`(resolution: ${dpr}dppx)\`)` fires `change` once, when
  the ratio stops matching. Re-arm a fresh query with the new DPR after each change. This is the
  standard pattern.
- **Analogue for guards:** `ui/utils/pointerDevice.ts` wraps `matchMedia` in try/catch because
  jsdom's implementation is incomplete, and in this repo's jsdom `window.matchMedia` is
  **undefined**. `ResizeObserver` may also be undefined in jsdom. Guard each with
  `typeof … === "function"`.
- **Hook conventions:** see `ui/hooks/useCanvasViewport.ts`, a pure hook with no store, native
  listeners in `useEffect`, and cleanup that removes everything. StrictMode mounts effects twice,
  so cleanup must be exact.

## Steps

1. Create `client/src/ui/hooks/useScreenPixelGrid.ts`:
   ```ts
   export interface ScreenPixelGrid { dpr: number; originX: number; originY: number }
   export function readScreenPixelGrid(el: HTMLElement | null): ScreenPixelGrid; // pure-ish reader, dpr fallback 1
   export function useScreenPixelGrid(containerRef: React.RefObject<HTMLElement | null>): ScreenPixelGrid;
   ```
   - State starts as `readScreenPixelGrid(null)`, which is `{ dpr: devicePixelRatio || 1, originX: 0, originY: 0 }`.
   - In `useEffect`, measure once. Then subscribe to: `ResizeObserver` on the container if
     available; `window` `resize`; and the DPR `matchMedia` query, re-armed on each change. Each
     callback re-measures, and `setState` fires **only when a value actually changed** (compare
     all three) to avoid render loops.
   - Also re-measure on `window` `scroll` with capture and passive. It is cheap, and it covers a
     scrolled ancestor.
   - Clean up every subscription.
   - Header: why this exists (task 03's snapping), why the origin, the DPR re-arm pattern, and
     that it is pure `ui/`.
2. Create `client/src/ui/hooks/__tests__/useScreenPixelGrid.dom.test.ts`:
   - It returns `dpr` from a stubbed `window.devicePixelRatio`, via
     `Object.defineProperty(window, "devicePixelRatio", { value: 2, configurable: true })`, and
     restores it after.
   - It returns the origin from a stubbed `getBoundingClientRect` on the container
     (`left: 100.3, top: 40.5`).
   - A `resize` event after changing the stubbed rect updates the result.
   - With a stubbed `matchMedia` (an object with `addEventListener` and `removeEventListener` that
     captures the listener): firing the change after changing `devicePixelRatio` updates `dpr`,
     and a **new** query is registered for the new DPR.
   - Unmount removes the listeners (spy on `removeEventListener`).
   - It does not throw with `matchMedia` and `ResizeObserver` undefined, which is this repo's jsdom
     default.
   - A resize with identical values does not cause a re-render. Count renders with a ref.
3. **Commit** as `feat(18/04): useScreenPixelGrid`.

## Constraints

- Pure `ui/`: no store, no MobX.
- No consumer yet. Do not touch `CanvasSurface.tsx` (task 06).

## Verification

```sh
cd client
bunx tsc --noEmit
bunx vitest run src/ui/hooks/__tests__/useScreenPixelGrid.dom.test.ts
bunx eslint src/ui/hooks
bun scripts/check-boundaries.mjs
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```

Manual: none here. Task 08 moves the window between displays.

## Definition of done

- [ ] The hook and the reader exist with the API above, and every subscription is cleaned up.
- [ ] Every test in step 2 is green.
- [ ] tsc, eslint and the boundary check are clean, and there is no lockfile.
- [ ] Committed.
