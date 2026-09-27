# 01 — Input signal probe (temporary)

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/debug/inputProbe.ts` (new) · `client/src/debug/__tests__/inputProbe.dom.test.ts` (new) · `client/src/main.tsx`
**Effort:** S

## Objective

A **dev-only**, temporary logger records every raw wheel, `gesture*` and multi-touch event at the
`document` capture phase and posts batches to the existing dev log sink (`POST /api/debug/log`,
tag `input-probe`). It also posts a startup heartbeat describing the device. The owner runs a
trackpad pinch on the MacBook, and the coordinator records the real signal in `HANDOFF.md`. We
then *know*, rather than assume, what the owner's browser sends. Task 08 deletes the probe.

## Context

- **Why this task exists.** It is the owner's standing correction, recorded in project memory as
  "get the signal before diagnosing". On an earlier gesture bug, three diagnoses reasoned from code
  were wrong, and one round of real logging found the cause. The diagnosis in `MASTER.md` §1
  ("Safari sends `gesture*`, nothing converts it to zoom, and a document listener
  `preventDefault`s it") comes from reading code and has **not** been measured on the owner's Mac.
- **The sink** is `server/src/routes/debugLog.ts`. It is dev only, disabled when `NODE_ENV` is
  `production` or `test`, and enabled under `bun run dev`.
  - `POST /api/debug/log` takes `{ tag: string, entries: unknown[] }`.
  - `GET /api/debug/log?tag=input-probe&limit=500` reads entries back, and `DELETE` clears them.
  - The client posts to the relative `/api/debug/log`, which Vite proxies to `:3001`
    (`client/vite.config.ts:24`).
- **The entry point** is `client/src/main.tsx`. It calls `bindBrowserZoomSuppression()` at `:30` as
  a top-level side effect. The probe binds the same way, guarded by `import.meta.env.DEV`.
  - Do **not** gate it on a URL query flag. The iPad companion app loads a fixed URL and cannot
    set one.
  - `main.tsx` must keep exporting nothing (`react-refresh/only-export-components`).
- **Capture phase at `document`** (`addEventListener(type, fn, { capture: true, passive: true })`).
  This sees events before any component can stop them, so "the event never arrived" can be told
  apart from "it arrived and was dropped". The probe must be **passive** and must never call
  `preventDefault` or `stopPropagation`. It observes only.
- `src/debug/` is a new folder outside `ui/`, `stores/` and `containers/`, so no boundary rule
  applies. It must still pass eslint.

## Steps

1. Create `client/src/debug/inputProbe.ts` exporting `bindInputProbe(opts?: { post?: (batch) => void; now?: () => number }): () => void`.
   - **Heartbeat, sent once on bind:**
     - `{ kind: "heartbeat", platform: navigator.platform, uaPlatform: navigator.userAgentData?.platform ?? null, ua: navigator.userAgent, maxTouchPoints, coarse: matchMedia("(pointer: coarse)").matches, fine: matchMedia("(any-pointer: fine)").matches, dpr: devicePixelRatio }`.
     - Guard every access, including `matchMedia` being absent and `userAgentData` being absent.
   - **`wheel`:** `{ kind: "wheel", t, dx: deltaX, dy: deltaY, dz: deltaZ, mode: deltaMode, ctrl, meta, shift, alt, target: <short target descriptor: tagName + first className> }`.
   - **`gesturestart` / `gesturechange` / `gestureend`:** `{ kind, t, scale, rotation, clientX, clientY, target }`. Cast through `unknown` to a local `GestureLike` interface. `GestureEvent` is not in the TS DOM lib.
   - **`touchstart`, `touchmove` (only when `touches.length >= 2`), `touchend`:** `{ kind, t, n: touches.length, types: [...touches].map(t => t.touchType ?? "?") }`.
   - **Batching:** buffer entries and flush every 250 ms, or at 50 entries, with
     `fetch("/api/debug/log", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ tag: "input-probe", entries }) })`.
     Swallow fetch errors. Throttle `wheel` and `gesturechange` to **one entry per 16 ms per
     kind**, but always keep the first event after a gap of 100 ms or more.
   - Return an unbind function that removes every listener and clears the timer.
   - Add a file header: **TEMPORARY. Plan 18 task 08 deletes this file.** Explain why it logs at
     document capture, and say that it never alters an event.
2. In `client/src/main.tsx`, after `bindBrowserZoomSuppression();`, add
   `if (import.meta.env.DEV) bindInputProbe();` with a two-line comment pointing at plan 18.
3. Create `client/src/debug/__tests__/inputProbe.dom.test.ts` (jsdom):
   - The heartbeat is posted through an injected `post`.
   - A dispatched `WheelEvent` with `ctrlKey` is recorded with `ctrl: true`.
   - A synthetic `new Event("gesturechange")` with `scale` assigned is recorded.
   - Unbind stops recording.
   - The probe never calls `preventDefault`: dispatch a cancelable wheel and assert
     `defaultPrevented === false`.
   - Use fake timers for the flush.
4. Run the verification below, then **commit** as `feat(18/01): temporary input signal probe`.
5. **Owner capture.** This is a manual step, and the coordinator runs it with the owner.
   1. `curl -s -X DELETE http://localhost:3001/api/debug/log`
   2. With `bun run dev` running, have the owner open the app on the MacBook **in the browser they
      normally use**. Ask which one (Safari or Chrome) and record it.
   3. Have the owner, over the canvas: (a) pinch in and out on the trackpad, (b) scroll with two
      fingers, (c) ⌘+scroll if they use it.
   4. `curl -s 'http://localhost:3001/api/debug/log?tag=input-probe&limit=500' > /tmp/…/probe-mac.json`.
      Summarise it: the heartbeat fields, whether `gesture*` events arrived, and whether the pinch
      produced `wheel` events with `ctrl: true`, with typical `dy` magnitudes.
   5. If the owner has a second browser, repeat in it. If the iPad is handy, repeat a finger pinch
      there to confirm the iPad heartbeat (`coarse: true`, `maxTouchPoints > 1`).
   6. Paste the summary into `HANDOFF.md` under **Notes for the next session → Probe results**.
   7. If the owner is **unavailable**, write "signal not captured (owner unavailable)" in HANDOFF
      and mark this task **PARTIAL**. Task 08 re-runs the capture.

## Constraints

- The probe is passive. It never calls `preventDefault` or `stopPropagation`, and it never
  changes the app's behaviour.
- It is dev only (`import.meta.env.DEV`). It must not ship in `vite build` output as an active
  binding. Tree-shaking under a `DEV`-false branch is acceptable.
- Do not touch `useSuppressBrowserZoom.ts`, `useCanvasViewport.ts` or the server route.

## Verification

```sh
cd client
bunx tsc --noEmit                                         # exit 0
bunx vitest run src/debug                                 # new suite green
bunx eslint src/debug src/main.tsx                        # 0 errors
bun scripts/check-boundaries.mjs                          # all 5 rules hold
cd .. && find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules   # prints nothing
```

**Manual checks:**

- `bun run dev` starts.
- After the page loads,
  `curl -s 'http://localhost:3001/api/debug/log?tag=input-probe&limit=5'` shows the heartbeat.
  This proves the pipeline end to end **before** asking the owner to do anything.
- The owner capture in step 5.

## Definition of done

- [ ] `bindInputProbe` exists and is bound in DEV from `main.tsx`.
- [ ] The test suite passes, including the "never preventDefault" test.
- [ ] tsc, eslint and the boundary check are clean, and there is no lockfile.
- [ ] The heartbeat was seen through `GET /api/debug/log` in a real dev run.
- [ ] The probe results, or "not captured" plus PARTIAL, are recorded in `HANDOFF.md`.
- [ ] Committed.
