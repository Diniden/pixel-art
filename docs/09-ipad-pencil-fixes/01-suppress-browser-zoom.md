# 01 — Suppress system browser zoom completely

**Wave:** W1 · **Depends on:** none
**Touches:** `client/index.html` · `client/src/styles/reset.css` · `client/src/ui/hooks/useSuppressBrowserZoom.ts` (new) · `client/src/ui/hooks/__tests__/useSuppressBrowserZoom.dom.test.ts` (new) · `client/src/main.tsx` · `ios-companion/PixelArtCompanion/Views/WebView.swift`
**Effort:** M

## Objective

After this task, no gesture anywhere in the app can trigger iOS Safari / WKWebView
**page** zoom — not a two-finger pinch on a rail, not a double-tap on the header, not a
Pencil-plus-finger stray contact on the timeline. The editor's own canvas zoom
(`viewZoom`, pinch inside `.canvas__viewport`) keeps working exactly as it does today.

## Context

### What exists now (measured 2026-09-06)

The app suppresses browser zoom **only inside the canvas**, and does it correctly there.
Everywhere else there is nothing.

1. **`client/index.html:6`** is the root gap:
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1.0" />
   ```
   No `maximum-scale`, no `minimum-scale`, no `user-scalable`, no `viewport-fit`.

2. **`client/src/styles/reset.css`** has **no global `touch-action`**. Its
   `html, body, #root` block (lines 21–27) sets only `height/width/overflow`. There is a
   `@media (pointer: coarse)` block at lines 38–78 that kills text selection and the
   `-webkit-touch-callout` bubble, but neither of those stops pinch or double-tap zoom.

3. **No `gesturestart` / `gesturechange` / `gestureend` handler exists anywhere in the
   repo** (grep-verified, zero occurrences). These are the Safari-specific events, and
   `preventDefault()` on `gesturestart` is the standard iOS page-pinch suppression.

4. **No double-tap-zoom suppression exists.** The app deliberately avoids `dblclick`
   (see the notes at `CanvasContainer.tsx:334-335` and
   `ui/components/PaletteManager/CurrentPalette.tsx:39`) but nothing prevents the
   *browser's* double-tap zoom outside the canvas.

5. **`ios-companion/PixelArtCompanion/Views/WebView.swift:84-85`**:
   ```swift
   // Pinch-zoom would fight the canvas's own gesture handling.
   webView.scrollView.bouncesZoom = false
   ```
   `bouncesZoom` only disables the rubber-band *animation*, not zooming. The real levers
   are absent: `minimumZoomScale` / `maximumZoomScale` are never pinned to 1, and
   `viewForZooming` is not overridden. Line 296–301 (`shouldRecognizeSimultaneouslyWith`
   returning `true`) explicitly lets WebKit's own pinch recogniser run — that is correct
   for the Pencil-exclusivity fix and **must not be changed**; pin the zoom scale instead.

### The pattern to copy — it is already in this repo

`client/src/ui/hooks/useCanvasViewport.ts:519-618` is the working model, and its header
states the rule you must follow:

> "React attaches touch handlers PASSIVELY, so `e.preventDefault()` inside a synthetic
> touch handler is a no-op in Safari… `{ passive: false }` is the only way to claim the
> gesture… `touch-action: none` in the CSS stops the browser claiming the gesture before
> the listener runs; this listener stops it claiming it afterwards. **Both are needed —
> neither alone is sufficient on iOS.**"

Bindings at `useCanvasViewport.ts:608-611` show the exact form:
```ts
container.addEventListener("touchstart", onStart, { passive: false });
```

### Traps

- **iOS ≥ 10 ignores `user-scalable=no`.** The effective lever is
  `maximum-scale=1, minimum-scale=1`. Include `user-scalable=no` anyway (it is honoured
  by other engines and by WKWebView when `ignoresViewportScaleLimits` is false), but do
  not rely on it.
- **A blanket `touch-action: none` on `html`/`body` is correct here but must not break
  the rails.** `Toolbar.css:44` sets `touch-action: pan-y` and `:87` `pan-x` so the
  toolbar can scroll; other rails scroll natively. `touch-action` does **not** inherit,
  so setting it on `html, body, #root` does not override a descendant's own declaration —
  but any scrollable container that relies on the *initial* `auto` value will stop
  scrolling. Grep for `overflow: auto|scroll` under `client/src/ui/` and give each such
  container an explicit `touch-action: pan-x pan-y` (or the axis it needs) in **its own
  stylesheet**. Do this by inspection, then confirm by the manual checks below.
- **Do not add `touch-action: none` to `.canvas-area`.** The bare `canvas-area` class is
  a runtime DOM hook for eight `document.querySelector('.canvas-area')` call sites — see
  the warning at `ui/components/AppShell/AppShell.tsx:70-77`. Leave that selector alone;
  `.canvas__viewport` already carries `touch-action: none` at `CanvasSurface.css:43`.
- The `gesturestart` handler must be added with a **native** listener at the document
  level, not a React prop — React has no synthetic `gesturestart`.

## Steps

1. **`client/index.html:6`** — replace the viewport meta with:
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover" />
   ```
   Add a one-line HTML comment above it saying `maximum-scale`/`minimum-scale` are the
   effective iOS levers and `user-scalable` is ignored on iOS ≥ 10.

2. **`client/src/styles/reset.css`** — inside the existing `@media (pointer: coarse)`
   block (lines 38–78), add `touch-action: none` to the `html, body, #root` rule, or add
   a new rule in that block if the existing one is elsewhere. Write a comment in the
   house style explaining that this is half of the two-part fix and pointing at
   `useSuppressBrowserZoom`. Keep it inside `@media (pointer: coarse)` so desktop
   trackpad behaviour is untouched.

3. **New file `client/src/ui/hooks/useSuppressBrowserZoom.ts`.** A hook taking no
   arguments that, in a `useEffect` with an empty dep array, binds to `document`:
   - `gesturestart`, `gesturechange`, `gestureend` → `e.preventDefault()`, each with
     `{ passive: false }`.
   - `touchmove` with `{ passive: false }` → `if (e.touches.length > 1) e.preventDefault()`.
   - `dblclick` → `e.preventDefault()`.
   - A double-tap guard: track the last `touchend` timestamp; if a second `touchend`
     arrives within 300 ms, `e.preventDefault()`. Bind `touchend` with `{ passive: false }`.
   Return a cleanup that removes every listener. Write a module header in the house
   style (see `ThumbSlider.tsx:1-16` for tone) explaining why each half is needed,
   citing `useCanvasViewport.ts:519-618`.

   ⚠️ This hook lives under `ui/hooks/` and must import **nothing** from `stores/`,
   `api/`, or `mobx` — the `ui/` boundary is ESLint-enforced.

4. **`client/src/main.tsx`** — call the hook. `main.tsx` renders the tree; if it has no
   component of its own to hang a hook on, call it from `AppContainer` instead — in that
   case **change `Touches` is not permitted**, so prefer wrapping: add a tiny
   `<ZoomSuppressor />` component defined inside `main.tsx` that calls the hook and
   returns `null`, mounted as a sibling of the app root. Keep the change to `main.tsx`
   under 15 lines.

5. **Commit** ("fix(ipad): suppress system browser zoom app-wide").

6. **`ios-companion/PixelArtCompanion/Views/WebView.swift`** — immediately after line 85
   (`bouncesZoom = false`), add:
   ```swift
   // `bouncesZoom` only kills the rubber-band animation. Pinning both scales
   // is what actually stops WKWebView page zoom; the editor owns canvas zoom.
   webView.scrollView.minimumZoomScale = 1.0
   webView.scrollView.maximumZoomScale = 1.0
   ```
   Do **not** touch `shouldRecognizeSimultaneouslyWith` (lines 296–301) or
   `relaxTouchExclusivity` (lines 272–289) — both are load-bearing for the Pencil fix
   confirmed working 2026-08-28.

7. **New test `client/src/ui/hooks/__tests__/useSuppressBrowserZoom.dom.test.ts`** — render
   the hook with `@testing-library/react`'s `renderHook`, dispatch a `dblclick` and a
   synthetic `gesturestart` on `document`, and assert `defaultPrevented` is true. Assert
   the listeners are removed on unmount. jsdom does not implement `gesturestart`, so
   construct it with `new Event("gesturestart", { cancelable: true })`.

8. **Commit** ("test(ipad): cover browser-zoom suppression" + the Swift change as its own
   commit if you prefer; two commits minimum for steps 5–8).

## Constraints

- Do not change `.canvas__viewport`'s existing `touch-action: none`
  (`CanvasSurface.css:43`) or any of the per-component `touch-action` declarations listed
  in the Context — they already work.
- Do not modify `useCanvasViewport.ts`. Its native pinch listener stays exactly as is.
- Do not remove `Toolbar.css:44` / `:87` (`pan-y` / `pan-x`).
- Do not change `WebView.swift`'s gesture-recogniser or Pencil-interaction code.
- Nothing under `client/src/ui/` may import a store, the API, or MobX.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art
bun run typecheck        # expect exit 0
bun run lint             # expect 0 errors (warnings are pre-existing; count must not rise above 65)
bun run test             # expect 148+ files / 3139+ tests passing, 0 failures
bun run build
```

This task adds CSS. Stylelint is **not** part of `bun run verify` and fails today with 2
pre-existing errors — run it and confirm you have not raised the count:
```sh
cd client && bun run lint:css   # baseline: 71 problems (2 errors, 69 warnings)
```

**Manual checks — none of these are optional, and all require the iPad:**

1. Two-finger pinch on the **header** → nothing zooms. Repeat on the **left rail**, the
   **right rail**, the **timeline**, and any **gap between panels**.
2. Double-tap on the header / a rail / the timeline → no zoom, no text-selection bubble.
3. Two-finger pinch **inside the canvas** → the canvas still zooms (`viewZoom`), exactly
   as before.
4. One-finger drag on the **toolbar** → it still scrolls along its docked axis.
5. Every scrollable panel (layer list, object library, palette list, frame timeline)
   still scrolls with one finger.
6. Pencil draws normally on the canvas; a resting finger does not break the stroke.

## Definition of done

- [ ] `client/index.html` viewport meta includes `maximum-scale=1.0` and `minimum-scale=1.0`.
- [ ] `reset.css` sets `touch-action: none` on `html, body, #root` inside `@media (pointer: coarse)`.
- [ ] `useSuppressBrowserZoom.ts` exists, imports no store/API/MobX, and is mounted.
- [ ] `WebView.swift` pins `minimumZoomScale` and `maximumZoomScale` to `1.0`.
- [ ] A test covers `gesturestart` and `dblclick` prevention plus unmount cleanup.
- [ ] `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build` all exit 0.
- [ ] All six manual checks performed **on the iPad** and their results written into
      `HANDOFF.md`. If the iPad is unavailable, mark the task **PARTIAL** and say so —
      do not mark it done.
