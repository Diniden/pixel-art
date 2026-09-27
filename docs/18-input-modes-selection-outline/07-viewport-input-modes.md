# 07 — Viewport integration: input modes + Safari gesture zoom

**Wave:** W3 · **Depends on:** 02, 05
**Touches:** `client/src/ui/hooks/useCanvasViewport.ts` · `client/src/ui/hooks/useGestureZoom.ts` (new) · `client/src/ui/hooks/__tests__/useGestureZoom.dom.test.ts` (new) · `client/src/ui/hooks/__tests__/useCanvasViewport.dom.test.ts` · `client/src/ui/hooks/useSuppressBrowserZoom.ts`
**Effort:** M

## Objective

The shared canvas viewport engine behaves according to the detected `InputMode`:

- **The wheel:** every wheel event goes through `interpretWheel` (task 05).
- **Safari trackpad pinch:** `gesturestart/gesturechange/gestureend` now **zoom the canvas** about
  the fingers in `mac` and `windows` modes, and are ignored in `ipad` mode.
- **One zoom implementation:** both zoom sources share one `zoomAbout` function.
- **No double zoom:** a ctrl+wheel that arrives during a live gesture is not applied on top of it.

After this task, trackpad pinch-zoom works on the MacBook in Safari and in Chrome. The three
callers (pixel canvas, lighting canvas, brush camera) get this with **no edits**.

## Context

- **Locked decisions:** MASTER D10–D14.
- **Probe results.** Read `HANDOFF.md` → *Notes for the next session → Probe results*, written by
  task 01.
  - If they show the owner's browser sends `gesture*` for a pinch, this task is the fix.
  - If they show ctrl+wheel arriving and the canvas still not zooming, **stop and report**. The
    cause is something else (the target element, or an overlay swallowing events), and this plan
    needs a deviation, not a guess.
- **Current code**, `client/src/ui/hooks/useCanvasViewport.ts` (677 raw, **357 code lines**; the
  `ui/` `max-lines` **error** is at 400):
  - `WHEEL_ZOOM_RATE = 0.012` is at `:109`. Delete it and import it from
    `../canvas/model/wheelIntent`.
  - `wheelStateRef` is written during render at `:330-346`. It is load-bearing (see the file
    header), so keep the pattern.
  - The wheel effect is at `:349-421`:
    - the ctrl branch at `:355-395` holds the anchor lock (`zoomAnchorLockRef`, `ZOOM_ANCHOR_MS`),
      the clamp to `[viewZoomFloor(contentW, contentH), MAX_VIEW_ZOOM]`, pan re-anchoring,
      `setViewZoom`, `viewPanRef`, `setViewPanOffsetState` and `scheduleCommitPan()`;
    - the else branch pans **unclamped**. Keep its ⚠️ DO-NOT-CLAMP comment verbatim.
  - The touch pinch block (`:598-660`, `beginPinch :444`, `updatePinch :466-554`,
    `endPinch :556`, `isPinching`) is what makes the **iPad** work. **Do not change it.**
  - The return object is at `:662-676`.
- **The three callers:**
  - `containers/CanvasContainer.tsx:1107`
  - `containers/LightingCanvasContainer.tsx:354`
  - `containers/brush/useBrushCamera.ts:94`

  None of them pass `inputMode`. The default is `currentInputMode()`, read once per mount (D13).
- **Safari `GestureEvent`** (WebKit-only, and not in the TS DOM lib) has `scale` (cumulative since
  `gesturestart`, where it starts at 1), `rotation`, `clientX` and `clientY`. On macOS Safari a
  trackpad pinch fires these. On iOS/iPadOS a **finger** pinch fires them **in addition to** touch
  events, which is why `ipad` mode must not zoom from them (D10). Declare a local
  `interface GestureLike extends Event { scale: number; clientX: number; clientY: number }` and
  cast through `unknown`.
- **`useSuppressBrowserZoom.ts`** (bound at `main.tsx:30`) `preventDefault`s every `gesture*` on
  `document` in the bubble phase. The container listener runs first, at the target, so zooming the
  canvas and blocking page zoom coexist (D14). **Its behaviour does not change in this task.** Only
  its comments are wrong: the header says the gesture events "exist on no other engine", and the
  "What this deliberately does NOT do" section is silent about the Mac. Correct both, and point at
  `useGestureZoom.ts`.
- **Tests today:**
  - `ui/hooks/__tests__/useCanvasViewport.dom.test.ts` covers wheel pan at `:328-395` (plain wheel
    with non-zero `deltaX`) and touch pinch at `:117-175`.
  - `containers/brush/__tests__/useBrushCamera.dom.test.ts:133-230` covers ctrl+wheel zoom
    through the hook: `deltaY -100`, and `5000` reaching the floor. In jsdom the mode defaults to
    `"mac"` (MASTER §4.1), and mac ctrl uses today's exact maths (D8), so **those tests must pass
    unedited**. If they don't, you changed behaviour you should not have.

## Steps

1. **Measure first.** Paste the code-line count of `useCanvasViewport.ts` before and after.
2. Create `client/src/ui/hooks/useGestureZoom.ts`:
   ```ts
   export interface UseGestureZoomOptions {
     containerRef: React.RefObject<HTMLElement | null>;
     enabled: boolean;
     onZoom: (anchor: { x: number; y: number }, factor: number) => void;
     onActiveChange?: (active: boolean) => void;
   }
   export function useGestureZoom(opts: UseGestureZoomOptions): void;
   ```
   - Hold the callbacks in refs, the same stale-closure defence as `wheelStateRef`.
   - In `useEffect([containerRef, enabled])`, when enabled and the container exists, bind
     `gesturestart`, `gesturechange` and `gestureend` with `{ passive: false }`. Each calls
     `preventDefault()`.
   - `gesturestart`: `lastScale = 1`, then `onActiveChange(true)`.
   - `gesturechange`: `factor = e.scale / lastScale`, guarding `lastScale > 0` and a finite
     factor. `lastScale = e.scale`. `anchor = clientXY − container.getBoundingClientRect()`. Call
     `onZoom(anchor, factor)`.
   - `gestureend`: `onActiveChange(false)`.
   - Unbind everything on cleanup, and call `onActiveChange(false)` if a gesture was live.
   - Header: why Safari needs this; why it is off on iPad; and that the document-level suppressor
     still runs afterwards.
3. In `useCanvasViewport.ts`:
   - Add the option `inputMode?: InputMode`, and read
     `const [mode] = useState(() => options.inputMode ?? currentInputMode())`. Mirror a changed
     `options.inputMode` prop into a ref the handler reads, so tests can switch it.
   - **Extract** the ctrl-branch maths into an internal
     `zoomAbout(anchor: ViewPoint, factor: number)` (a `useCallback` or a ref-held function).
     Keep the **same** anchor lock, clamp, re-anchoring and `scheduleCommitPan()`, moved verbatim,
     with the factor as the input instead of computed from `deltaY`.
   - Rewrite the wheel handler body:
     - call `e.preventDefault()`;
     - `const { intent, latch } = interpretWheel(e, mode, latchRef.current, performance.now(), container.clientHeight)`,
       then `latchRef.current = latch`;
     - for a zoom intent, **if a gesture is active** (`gestureActiveRef.current`), drop it (D11).
       Otherwise compute the cursor anchor as today and call `zoomAbout(anchor, intent.factor)`.
       The anchor lock logic moves into `zoomAbout`, so both paths share it.
     - for a pan intent, run the existing unclamped pan with `(intent.dx, intent.dy)`. Keep the ⚠️
       comment.
   - Call `useGestureZoom({ containerRef, enabled: mode !== "ipad", onZoom: zoomAbout, onActiveChange: a => { gestureActiveRef.current = a } })`.
   - Delete the local `WHEEL_ZOOM_RATE`, and update the file header's wheel section to describe the
     modes, the gesture path and the dedupe.
   - If the file would exceed 400 code lines, move more into `useGestureZoom.ts` or into a helper
     in the same folder, and record it as a deviation. **Never add a max-lines disable.**
4. Correct the comments in `useSuppressBrowserZoom.ts` (D14). **No code change.**
5. **Commit** as `feat(18/07): input-mode wheel + Safari gesture zoom in the viewport engine`.
6. Tests:
   - `__tests__/useGestureZoom.dom.test.ts`:
     - dispatch synthetic `gesturestart`, then `gesturechange` with scale 1.5 and then 2.0, then
       `gestureend`. Build them with `Object.assign(new Event("gesturechange", { cancelable: true }), { scale, clientX, clientY })`;
     - `onZoom` receives factors 1.5 and 2/1.5 with anchors relative to a stubbed rect;
     - every event is `defaultPrevented`;
     - `enabled: false` binds nothing;
     - `onActiveChange` true, then false;
     - unmount unbinds.
   - `useCanvasViewport.dom.test.ts` (**add**; do not edit existing cases):
     - `inputMode: "mac"`: ctrl+wheel `deltaY: -10` → `viewZoom === exp(0.12)` about the cursor
       anchor. ⌘+wheel `deltaY: -100` → `viewZoom === 1.2`. Plain wheel pans.
     - `inputMode: "mac"`: a gesture sequence (scale 2) → `viewZoom` ≈ 2, clamped by
       `MAX_VIEW_ZOOM`. During a live gesture, a ctrl+wheel does **not** change `viewZoom`
       (dedupe). After `gestureend` it does again.
     - `inputMode: "ipad"`: a gesture sequence leaves `viewZoom === 1`, while the existing
       two-finger touch pinch test still zooms.
     - `inputMode: "windows"`: plain `deltaY: 100, deltaX: 0` → `viewZoom === 1/1.2`, clamped at
       the floor if that's lower. Plain `deltaY: 3.5` → pan. Shift+`deltaY: 100` → pan x by −100.
     - Default mode (no option) in jsdom behaves as `"mac"`: the existing tests already prove it,
       so reference them in a comment.
7. **Commit** as `test(18/07): viewport input modes + gesture zoom`.

## Constraints

- **Do not change the touch pinch block or any iPad path.**
- **Do not reintroduce pan clamping.** Keep every ⚠️ comment in the wheel pan branch.
- No container edits (D13). No store edits.
- Pure `ui/`: no store, no MobX.
- `useBrushCamera.dom.test.ts` and every existing `useCanvasViewport.dom.test.ts` case pass
  **unedited**.

## Verification

```sh
cd client
bunx tsc --noEmit
bunx vitest run src/ui/hooks src/containers/brush/__tests__/useBrushCamera.dom.test.ts src/containers/__tests__/zoomFloorCallSite.dom.test.tsx
bunx vitest run                                   # full; corpus fixtures must be present
bunx eslint .
bunx stylelint "src/**/*.css"
bun scripts/check-boundaries.mjs
bunx eslint --rule '{"max-lines":["error",{"max":1,"skipBlankLines":true,"skipComments":true}]}' src/ui/hooks/useCanvasViewport.ts   # paste N (< 400)
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```

**Manual checks (required; `bun run dev`):**

1. **MacBook, Safari:** pinch over the pixel canvas. It zooms smoothly about the fingers, and the
   page does not zoom. Two-finger scroll pans. ⌘+scroll zooms.
2. **MacBook, Chrome:** pinch zooms at the same feel as before. Two-finger scroll pans.
3. **Lighting studio and brush studio:** pinch zooms there too, since they use the shared engine.
4. **Windows mode on the Mac:** in devtools run `localStorage.setItem("pixelart.inputMode","windows")`
   and reload.
   - A mouse-wheel notch zooms one step. If there is no mouse, note that and check that a trackpad
     scroll still **pans** thanks to the latch.
   - Clear the key with `localStorage.removeItem("pixelart.inputMode")` and reload.
5. **iPad (if available):** finger pinch zooms at the **same speed as before**, not double.
   Two-finger pan works and the Pencil draws.

The probe from task 01 is still installed. Use `GET /api/debug/log?tag=input-probe` to confirm
what arrived if something looks wrong. Record each check. Any skipped check means **PARTIAL**.

## Definition of done

- [ ] The wheel handler goes through `interpretWheel`. `zoomAbout` is shared. `useGestureZoom`
      exists and is disabled in `ipad` mode. The dedupe works.
- [ ] The iPad touch block is untouched (a `git diff` of `:598-660` shows no change).
- [ ] The existing tests pass unedited, and the new tests are green.
- [ ] `useCanvasViewport.ts` is under 400 code lines (number pasted).
- [ ] The `useSuppressBrowserZoom.ts` comments are corrected and its behaviour is unchanged.
- [ ] tsc, eslint, stylelint and the boundary check are clean, and there is no lockfile.
- [ ] Manual checks are recorded.
- [ ] Two commits.
