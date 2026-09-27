# Input modes + crisp selection outline — MASTER plan (plan 18)

Planned 2026-09-27 against `main @ 096513f`. Every commit since `9007990` (the plan-13 merge) is
docs-only, so the application source is identical to that merge. Executed by `/plan-go`, with one
fresh agent per task. **Read this file, `CLAUDE.md`, and your task file.** Nothing else is needed
and nothing else is assumed.

> **Ordering note: run plans one at a time.** Plans 14, 15 and 16 are written but not executed.
> Plan 17 (`docs/17-transform-tool/`, transform tool) exists on the owner's machine and is also
> unexecuted. **Plan 17 collides with this plan.** It edits
> `ui/components/CanvasSurface/CanvasSurface.tsx` and relies on the `marchingAnts` prop and
> `ScreenWidthPath`, which task 06 here changes. Plans 14, 15 and 16 do not touch any file in this
> plan's `Touches` lists.
>
> Never run two plans at once on the same base. Whichever of 17 and 18 runs second must re-read
> the lines cited in its own plan on the branch it cuts. If 17 lands first, task 06 must also move
> plan 17's transform-frame outline into the screen-space layer, or leave it as it is. Record that
> choice as a deviation.
>
> Line numbers were measured on `096513f`. Each citation also names the symbol: **anchor on the
> symbol and treat the line number as a hint.**

---

## 1. Request

Verbatim:

> We need to fix macbook controls -> ipad is working great with finger gestures to zoom in and all
> of that, but when in mac mode I can no longer use the trackpad to zoom. 2 finger panning works
> fine. Make sure we have distinct modes of operation for ipad, mac trackpad, windows. It should
> work to detect these modes and work accordingly.
>
> Our selection borderline also is messed up. It should be zoom independent rendering, be 1px wide
> and be between pixels. Right now drawing the selections makes fat lines and then the selection
> line is crazy blurry and looks odd.

Owner answers given while planning (2026-09-27):

- **Windows mode, plain mouse-wheel notch:** it **zooms at the cursor**. Ctrl+wheel also zooms,
  Shift+wheel pans horizontally, and precision-touchpad two-finger scroll pans.
- **Outline shape:** **keep the bounding box.** Fix only how it renders. Do not trace the mask edge.

### Interpretation

**Part A: input modes.** There is no "mac mode" in the code today (§4.1); the owner means "on the
MacBook". The canvas has one wheel handler for every device, and it never looks at Safari's
`gesture*` events. Worse, a document-level listener calls `preventDefault()` on them. On macOS
Safari a trackpad pinch arrives as `gesturestart/gesturechange/gestureend` events, not as a
ctrl+wheel, so the pinch reaches nothing and the canvas cannot zoom. Chrome and Firefox on macOS
send ctrl+wheel instead, and that path does work.

This diagnosis comes from reading code plus WebKit knowledge; it has **not been measured on the
owner's machine**. That is why task 01 captures the real signal first (owner feedback memory: *get
the signal before diagnosing*). The fix is built to hold whichever browser the owner uses:

- a pure `InputMode` detector: `"ipad" | "mac" | "windows"`;
- a pure wheel interpreter with per-mode semantics;
- a Safari `GestureEvent` → zoom path that ignores duplicate ctrl+wheel events while a gesture is
  live.

**Part B: selection outline.** Today the marching ants are an SVG path in **cell units** inside
`.canvas__layout`, and that element is magnified by a CSS `scale(zoom·viewZoom)`. Two things follow:

- The stroke is counter-scaled to 1 CSS px, but it lands at sub-pixel screen positions and is
  antialiased (`shape-rendering: geometricPrecision`). The result is the "crazy blurry" line smeared
  across two device pixels, with cyan and white dashes mixing.
- The lasso rubber band is `stroke-width: 2` in cell units and is **not** counter-scaled. At zoom
  20 that is a 40 px line, which is the "fat lines while drawing".

The fix moves both overlays into a new **screen-space SVG**, a sibling of `.canvas__layout` that is
not scaled. The ants are drawn from cell-edge coordinates projected to screen and **snapped to the
device-pixel grid**, with `crispEdges`: 1 CSS px wide (rounded to whole device pixels) and on the
boundary between cells. The lasso band is drawn at 1 CSS px as well.

---

## 2. Outcome

When the plan is complete, the owner can:

1. **MacBook, Safari or Chrome:** pinch the trackpad over the canvas and zoom smoothly about the
   fingers. Two-finger scroll still pans. ⌘+scroll zooms (mouse users). The page itself never
   zooms.
2. **iPad (companion app / Safari):** behave exactly as today. Finger pinch zooms, two-finger pan
   pans, Pencil draws. None of the iPad code paths change.
3. **Windows (any browser):** a mouse-wheel notch zooms in or out one step about the cursor.
   Ctrl+wheel and touchpad pinch zoom. Shift+wheel pans horizontally. Precision-touchpad
   two-finger scroll pans.
4. Override detection on any machine with
   `localStorage.setItem("pixelart.inputMode", "windows")` (or `"mac"` / `"ipad"`) followed by a
   reload, and clear it with `removeItem`. This is how Windows mode is tested on the Mac.
5. See the selection box (rect, wand, colour and lasso, all drawn as the bounding box) at **every
   zoom** as a crisp dashed cyan/white line exactly 1 CSS px wide (2 device px on a Retina screen,
   1 on a 1× screen). It lies on the boundary between the selected and unselected cells, with no
   blur and no width change as the zoom changes.
6. Drag a rectangle or a lasso and see a 1 px line, never a line that grows with the zoom.
7. See the same in the brush studio's selection. It uses the same `CanvasSurface` and the same
   `marchingAntsOverlay`.

---

## 3. Locked decisions

| # | Decision | Why | Task |
| --- | --- | --- | --- |
| **D1** | `type InputMode = "ipad" \| "mac" \| "windows"`, in new `client/src/ui/canvas/model/inputMode.ts`. | The owner's three words. `ui/canvas/model/` is where the pure input helper `canvasTouchFilter.ts` lives. | 02 |
| **D2** | Detection order: **(1)** a valid `localStorage["pixelart.inputMode"]` override; **(2)** touch, meaning `matchMedia("(pointer: coarse)")` or `navigator.maxTouchPoints > 1`, gives `"ipad"`; **(3)** a Windows platform, meaning `navigator.userAgentData?.platform === "Windows"` or `/^Win/.test(navigator.platform)`, gives `"windows"`; **(4)** everything else gives `"mac"`. | Touch has to come first because iPadOS reports `navigator.platform === "MacIntel"`, and `maxTouchPoints > 1` is what tells it apart from a Mac. "Everything else → mac" means Linux, unknown platforms and **jsdom** keep today's behaviour exactly (plain wheel pans, ctrl+wheel zooms). No existing test changes meaning. Platform sniffing is needed here, because OS input conventions are exactly the question. Say so in the header, since `pointerDevice.ts` explains why *touch* detection must not sniff. | 02 |
| **D3** | Detection is **pure and injectable**: `detectInputMode(env: InputEnv): InputMode` with `readInputEnv(): InputEnv` reading `window`/`navigator`/`localStorage`, each access in try/catch. `currentInputMode()` = `detectInputMode(readInputEnv())`. | Testable without stubbing globals, matching the pattern of `deviceClass.ts`. | 02 |
| **D4** | **No UI toggle and no store.** The override is `localStorage` only and is per device. It must **never** go into project uiState. | Keeps the change away from the persisted project (corpus / uiState digests) and from `stores/`. Per-device matches the `initTheme()` localStorage precedent. | 02 |
| **D5** | Wheel semantics are a pure function in new `client/src/ui/canvas/model/wheelIntent.ts`: `interpretWheel(e: WheelLike, mode, latch: WheelLatch, now: number, pageHeight: number) → { intent: WheelIntent; latch: WheelLatch }`, where `WheelIntent = { kind: "pan"; dx; dy } \| { kind: "zoom"; factor }`. | Keeps `useCanvasViewport.ts` under the `ui/` `max-lines` **error** at 400 code lines (357 today), and makes the per-mode table unit-testable. | 05 |
| **D6** | **Delta normalisation, all modes:** `deltaMode` 1 (line) → ×16 px; 2 (page) → ×`pageHeight`. | Firefox reports lines. | 05 |
| **D7** | **Mode table.** **mac:** `ctrlKey \|\| metaKey` → zoom; else pan by `(-dx, -dy)`. **ipad:** same as mac (a Magic Keyboard trackpad's wheel). **windows:** `ctrlKey` → zoom; `shiftKey` with `dx === 0` → pan horizontally by `-dy`; else a **notch** → zoom; else pan. | mac is today's behaviour plus ⌘, which `docs/11-brush-studio-followups/HANDOFF.md:105` already promised. windows follows the owner's answer. | 05 |
| **D8** | **Zoom factor.** **mac/ipad + `ctrlKey`:** always `Math.exp(-dy * WHEEL_ZOOM_RATE)`, **byte-identical to today**. `WHEEL_ZOOM_RATE = 0.012` is **moved** from `useCanvasViewport.ts:109` unchanged. **Every other zoom** (mac/ipad + `metaKey` without ctrl, and every windows zoom) is **notch-aware**: a notch-shaped event gives a fixed step, `NOTCH_ZOOM_STEP = 1.2` (factor `1.2` when `dy < 0`, `1/1.2` when `dy > 0`), and a continuous delta gives the same `exp` formula. | Keeping mac ctrl identical means a pinch feels the same and the existing tests keep their meaning. `useBrushCamera.dom.test.ts` "ctrl-wheel zooming out stops at the derived floor" sends one `ctrlKey, deltaY: 5000`, which reaches the floor only through the `exp` formula. Windows needs a fixed step, because a notch of `deltaY` 100 through `exp` is a ×0.30 jump. | 05 |
| **D9** | **Notch heuristic:** `deltaMode !== 0`, **or** (`dx === 0` and `Number.isInteger(dy)` and `\|dy\| >= NOTCH_MIN_DELTA` (= 50)), **and** the latch is not in touchpad state. **Latch:** any event that is *not* a notch (`dx ≠ 0`, or a fractional or small `dy`) sets `latch = { touchpadUntil: now + TOUCHPAD_LATCH_MS }` (= 250). While `now < touchpadUntil`, every plain wheel in windows mode pans. | A precision touchpad sends small or fractional deltas and often a non-zero `dx`. A mouse sends ±100/±120 integers with no `dx`. The latch stops a fast touchpad flick (large integer `dy`) mid-sequence from flipping into zoom. This is **heuristic**; say so in the file header. | 05 |
| **D10** | **Safari gesture zoom** lives in a new hook, `client/src/ui/hooks/useGestureZoom.ts`: `useGestureZoom({ containerRef, enabled, onZoom(anchor, factor), onActiveChange(active) })`. It binds native `gesturestart/gesturechange/gestureend` with `{ passive: false }` on the container and calls `preventDefault()`. `factor = e.scale / lastScale`. The anchor is `clientX/Y − containerRect`. `enabled = mode !== "ipad"`. | On iPad, a finger pinch fires both touch events and `gesture*`. The touch pinch path (`useCanvasViewport.ts:598-660`) already zooms there, and zooming twice would double the speed. Separate hook for the line budget. | 07 |
| **D11** | **Dedupe:** while a gesture is active, `useCanvasViewport`'s wheel handler **drops** zoom intents (still `preventDefault()`s) and keeps pan intents. | If a WebKit build sends both gesture and ctrl+wheel for one pinch, the zoom must not double. | 07 |
| **D12** | Both zoom sources go through **one** internal `zoomAbout(anchor, factor)` in `useCanvasViewport`, extracted verbatim from the ctrl-branch maths (`:355-395`): anchor lock, floor/max clamp, pan re-anchoring, `scheduleCommitPan()`. | One zoom implementation, not two copies. | 07 |
| **D13** | `useCanvasViewport` gains an optional `inputMode?: InputMode` option. **Omitted means `currentInputMode()`, read once per mount** (`useState(() => …)`). None of the three callers (`CanvasContainer`, `LightingCanvasContainer`, `useBrushCamera`) pass it. | No container edits. Tests pass it explicitly. | 07 |
| **D14** | The document-level `gesture*` suppression in `useSuppressBrowserZoom.ts` **stays**, behaviour unchanged, and only its comments are corrected. The container's listener runs first (target/bubble order), so the canvas zooms while the page still does not. | Blocking page pinch-zoom app-wide is still wanted. The comment "exist on no other engine" is wrong on macOS Safari and must say so. | 07 |
| **D15** | Selection chrome moves to a **screen-space SVG**, `<svg className="canvas__screen-chrome">`. It is rendered by a new `ui/components/CanvasSurface/SelectionOutlineLayer.tsx` as a **direct child of `.canvas__viewport`, after `.canvas__layout` and before `{viewControls}`**, with absolute position `inset: 0`, `pointer-events: none` and `overflow: hidden`. | It is outside the CSS scale, so there is nothing to counter-scale and nothing for the compositor to resample. The later DOM order puts it above the artwork and below the view controls. | 06 |
| **D16** | **Snapping** (pure, in new `client/src/ui/canvas/svg/screenChrome.ts`). `deviceStrokePx(dpr) = max(1, round(dpr))`. `strokeCss = deviceStrokePx / dpr`. For a cell-edge coordinate `c` on an axis: `local = pan + c·scale`; `E = round((origin + local)·dpr)`; the line centre in local CSS px is `(E + (w % 2) / 2)/dpr − origin`. `origin` is the viewport's fractional client offset, and `w` is `deviceStrokePx`. | The line then covers whole device pixels at any DPR (1, 1.25, 1.5, 2, 3), any fractional pan and any fractional rail offset. With `w = 2` on Retina the line straddles the cell boundary symmetrically, which is "between pixels". | 03 |
| **D17** | **Ants look**: the **same rect path stroked twice**. The first pass is `SELECTION_COLOR`, dash `4 4`; the second is `WHITE`, dash `4 4`, offset 4. Dash values are CSS px, used directly (no counter-scale). The group has `shape-rendering: crispEdges`. **Static**, not animated. | Keeps today's palette and period (`chromeOverlay.ts:354-397`). `crispEdges` is safe because every coordinate is already device-snapped. The motion is static today (`useDashTicker.ts:5-6`), and animation was not requested. | 06 |
| **D18** | **Lasso band**: in the same screen SVG, vertices at cell **centres** (the `+0.5` from `lassoPath` is kept), `strokeCss` wide, dash `3 3`, **`geometricPrecision`** (it is diagonal), and **not** snapped. | The band is a freehand trail and not a cell boundary. Snapping a diagonal makes a staircase (`CanvasSurface.css:359-378`). The fix is its width. | 03, 06 |
| **D19** | **Keep the prop API.** `marchingAntsOverlay(...)` gains a `box: SelectionBounds` field (the offset- and drag-applied cell rect it already computes as `outer`). `lassoOverlay(...)` returns `LassoOverlay = SvgPathSpec & { points: Array<{x;y}> }`, holding the cell-space **centre** vertices. `CanvasSurface` renders the new layer from `marchingAnts.box` and `lasso.points` and no longer from `d`. | `CanvasContainer.tsx:5949-5976` and `useBrushSelection.ts:292-305` need **no edits**. The `d`/attrs fields stay for existing tests and for plan 17. | 03, 06 |
| **D20** | `useScreenPixelGrid(containerRef) → { dpr, originX, originY }` in new `client/src/ui/hooks/useScreenPixelGrid.ts`. `origin` is `rect.left/top` of the container (full value, not only the fraction). It updates on a `ResizeObserver` on the container, on window `resize`, and on a `matchMedia("(resolution: <dpr>dppx)")` change (re-armed after each change). Each binding is guarded by `typeof … === "function"` for jsdom. | A DPR change happens when the window moves to another display or when browser zoom changes. | 04 |
| **D21** | **Out of scope:** mask-edge tracing (the owner said so); `variantBox`, `brushOutline`, `hoverOutline` and the pixel grid (they stay in the cell-space SVG as they are); the `ReferenceImageModal` wheel (`ReferenceImageModal.tsx:368-389`); the lighting studio's `NormalPicker` wheel; a UI toggle for input mode; animating the ants. | Stay in scope. List each one as a follow-up in HANDOFF if it looks worth doing. | all |

---

## 4. Ground truth (measured 2026-09-27, `main @ 096513f`)

### 4.1 Input

- **No "mac mode" exists.** Searching `macMode|isMac|inputMode|trackpad|macos` in `client/src`,
  `docs`, `CLAUDE.md` and `ARCHITECTURE.md` finds nothing. The only device switches are these two:
  - `isTouchDevice()`, at `client/src/ui/utils/pointerDevice.ts:37-50`. It returns
    `matchMedia("(pointer: coarse)")`, with a fallback of `maxTouchPoints > 0`. It deliberately
    does not sniff the UA, and it is used for Pencil-only.
  - `detectDeviceClass()`, at `client/src/ui/layout/deviceClass.ts:57-75`, which picks the rail
    layout.
- **The shared viewport engine** is `client/src/ui/hooks/useCanvasViewport.ts`. It is 677 raw
  lines and **357 code lines**, against a `ui/` `max-lines` **error** at 400
  (`client/eslint.config.js` ~:568). Its callers:
  - `containers/CanvasContainer.tsx:1107`
  - `containers/LightingCanvasContainer.tsx:354`
  - `containers/brush/useBrushCamera.ts:94`
- **The wheel handler** is at `useCanvasViewport.ts:349-421`. It is native and non-passive, bound
  on the `.canvas__viewport` container (`CanvasSurface.tsx:665`):
  - `e.ctrlKey` → zoom by `Math.exp(-e.deltaY * WHEEL_ZOOM_RATE)` (`WHEEL_ZOOM_RATE = 0.012`,
    `:109`) about an anchor locked for `ZOOM_ANCHOR_MS = 100` (`:67`), clamped to
    `[viewZoomFloor(...), MAX_VIEW_ZOOM=4]`. It sets the zoom, then the pan, then
    `scheduleCommitPan()`.
  - Otherwise it pans by `(-deltaX, -deltaY)` and is **deliberately unclamped**. Keep the ⚠️
    comment there.
  - `metaKey` is ignored. Current values come in through `wheelStateRef` (a render-phase write,
    `:330-346`).
- **Touch pinch and two-finger pan** are in `useCanvasViewport.ts:598-660`:
  - native `touchstart/move` (non-passive);
  - `beginPinch :444`, `updatePinch :466-554`, `endPinch :556`, `isPinching`.
  - **iPad works. Do not change this block.**
- **Document-level suppression** is in `client/src/ui/hooks/useSuppressBrowserZoom.ts:78-120`,
  bound at `client/src/main.tsx:30`. It calls `preventDefault()` on `gesturestart`,
  `gesturechange` and `gestureend` on `document`, with **no device gating**, plus multi-touch
  `touchmove`, the double-tap guard, and `dblclick`. Its header says gesture events "exist on no
  other engine", which is false for macOS Safari. It was added in `95b0870` (2026-09-06,
  `docs/09-ipad-pencil-fixes/01`). That task's spec said to keep desktop trackpad behaviour
  untouched, but only the CSS half (`reset.css:62-117`) was scoped to `(pointer: coarse)`.
- **Nothing converts a `GestureEvent` to canvas zoom.**
- **CSS:** `.canvas__viewport { touch-action: none }` (`CanvasSurface.css:43`) does not affect
  trackpad wheel or gesture events. `index.html:8-9` sets `user-scalable=no`.
- **Stores:**
  - `ViewportUIStore.setViewZoom(zoom, floor)` is at `stores/ui/ViewportUIStore.ts:211`.
  - `CanvasCameraStore` (layer mode) is `stores/ui/CanvasCameraStore.ts:40-78`.
  - Neither is touched by this plan.
- **Tests:**
  - `ui/hooks/__tests__/useCanvasViewport.dom.test.ts` covers wheel pan at `:328-395`. It has no
    ctrl-zoom test.
  - `ui/hooks/__tests__/useSuppressBrowserZoom.dom.test.ts`.
  - `containers/brush/__tests__/useBrushCamera.dom.test.ts` holds the only ctrl+wheel zoom tests
    (`:141`, `:165`, `:214`), and they run through the shared hook.
- **jsdom:** `navigator.platform` is `""` and `matchMedia` is not defined. Under D2 that means the
  jsdom mode is `"mac"`, which is today's behaviour.
- **The debug log sink:** `server/src/routes/debugLog.ts`, dev only.
  - `POST /api/debug/log` takes `{ tag, entries: [...] }`.
  - `GET /api/debug/log?tag=&limit=` reads the buffer back, and `DELETE` clears it.
  - The client reaches it through Vite's `/api` proxy (`client/vite.config.ts:24`). The server
    listens on `:3001` and the client on `:5173`.

### 4.2 Selection outline

- **State:** `SelectionUIStore.selection` (`observable.ref`), with type
  `SelectionState { width, height, mask: Set<number>, bounds }` (`client/src/store/storeTypes.ts:93-100`).
  The rect, lasso and gesture state are React `useState` in `CanvasContainer.tsx:554-570`. **The
  ants are always the bounding box** (`previewSelection || selection.bounds`).
- **Spec builders:** `client/src/ui/canvas/svg/chromeOverlay.ts` (627 raw, 251 code lines).
  - `lassoOverlay(points, offX, offY)` at `:281-307`: `stroke-width: 2` in **cell** units, vertices
    at cell centres via `lassoPath` (`renderSelectionOverlay.ts:226-260`).
  - `marchingAntsOverlay(box, offX, offY, dragDx, dragDy)` at `:354-397`: one rect path at integer
    cell edges, two passes (`SELECTION_COLOR` dash `4 4`, `WHITE` dash `4 4` offset `4`), and
    `ANTS_STROKE = 1` (`:334`) that the consumer counter-scales.
- **Call sites. Neither changes in this plan:**
  - `containers/CanvasContainer.tsx:5949-5976`: `lasso`, `marchingAnts`; passed at `:6166-6167`.
  - `containers/brush/useBrushSelection.ts:292-305`: passed at `BrushCanvasContainer.tsx:515`.
- **The consumer** is `client/src/ui/components/CanvasSurface/CanvasSurface.tsx`. It is 976 raw
  lines and **348 code lines** against the `ui/` 400 **error** limit.
  - `.canvas__viewport` is at `:665`.
  - `.canvas__layout` is at `:666-677` with
    `transform: translate(pan) scale(combinedScale)` and `transformOrigin: 0 0`.
  - `.canvas__frame` sits at the layout's origin. Its CSS is `position: relative`, with no border
    or padding (`CanvasSurface.css:81-83`). **So cell `(x, y)`'s top-left, in viewport-local CSS
    px, is `pan + (x, y)·combinedScale`.**
  - The cell-space SVG is `.canvas__svg` at `:871-969`:
    - the lasso goes through plain `OverlayPath` at `:888`, so it is **not counter-scaled**;
    - the ants go through `ScreenWidthPath` at `:890-913` (defined `:570-601`, `ANTS_DASH = 4` at
      `:604`);
    - `inverseScale` is at `:651`, `hasSvgChrome` at `:653-661`, and `{viewControls}` at `:972`.
  - Prop docs for `lasso` and `marchingAnts` are at `:404-411`.
- **CSS** is in `CanvasSurface.css`:
  - `.canvas__svg` has `crispEdges` (`:343-351`).
  - `.canvas__svg-ants` is opted back into `geometricPrecision` (`:374-378`). That, together with
    the sub-pixel positions, is the blur.
  - `will-change` is **forbidden** on `.canvas__layout` (`:53-72`, see its warning).
- **`devicePixelRatio`** is handled nowhere in the client (two comments in pose code only).
- **Tests:**
  - `ui/canvas/svg/__tests__/chromeOverlay.test.ts`: ants at `:213-295`, zoom independence at
    `:510-585`.
  - `ui/components/CanvasSurface/__tests__/CanvasSurface.dom.test.tsx`:
    - `:928-958`, "strokes the marching ants twice, out of phase";
    - `:974-1001`, the "screen-constant" width and dash check across zooms;
    - `:1037-1077`, the `shape-rendering` CSS assertions.
  - `containers/brush/__tests__/useBrushSelection.dom.test.ts` (`:86`, `:119`, `:299-308`).
- **Stories:** `CanvasSurface.stories.tsx`.
  - `SvgChrome` (`:676-735`) uses both builders at `ZOOM=12`.
  - `SelectionActive` (`:447-490`) still paints **old canvas ants** into the 1:1 canvas, which is
    stale.

### 4.3 Gate commands (each confirmed to run on `096513f`)

- `cd client && bun scripts/check-boundaries.mjs` → `check-boundaries: OK — all 5 boundary rules hold.`
- `cd client && bunx vitest run src/ui/hooks/__tests__/useCanvasViewport.dom.test.ts src/ui/canvas/svg/__tests__/chromeOverlay.test.ts src/ui/components/CanvasSurface/__tests__/CanvasSurface.dom.test.tsx`
  → 3 files, 117 tests, all pass.
- `cd client && bunx eslint <file>` → clean for `useCanvasViewport.ts`.
- `cd client && bunx tsc --noEmit`, `bunx vitest run`, `bunx eslint .` and
  `bunx stylelint "src/**/*.css"` exist as `package.json` scripts. `bun run verify` from the root
  runs typecheck, lint, format:check, test and build.
- Code-line count for any file:
  `bunx eslint --rule '{"max-lines":["error",{"max":1,"skipBlankLines":true,"skipComments":true}]}' <file>`
  prints `has too many lines (N)`.
- No lockfile was created by these runs. Check anyway after every `bunx`.

---

## 5. Wave table

| Wave | Tasks | Parallelism | Gate that must exit 0 before the next wave |
| --- | --- | --- | --- |
| **W1** | `01`, `02`, `03`, `04` | **4 agents** | `cd client && bunx tsc --noEmit` · `bunx vitest run src/ui/canvas src/ui/hooks src/debug` · `bunx eslint .` · `bun scripts/check-boundaries.mjs` · no lockfile |
| **W2** | `05`, `06` | **2 agents** | `cd client && bunx tsc --noEmit` · `bunx vitest run` (full) · `bunx eslint .` · `bunx stylelint "src/**/*.css"` · `bun scripts/check-boundaries.mjs` · no lockfile · **no snapshot updated** |
| **W3** | `07` | 1 agent | same as W2 |
| **W4** | `08` | 1 agent | `bun run verify` (repo root, all stages) · `cd client && bun scripts/check-boundaries.mjs` · no lockfile · **no snapshot updated** · owner manual QA recorded |

After **every** wave, `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` must print
nothing, and `rm -f client/bun.lock server/bun.lock` in the worktree (see the memory note in
`CLAUDE.md`'s lockfile section: `bunx` inside `client/` can write one).

**Worktree setup (coordinator, before W1).** Copy the gitignored corpus JSONs from the launch
checkout into `client/src/test/__fixtures__/corpus/`. The full `vitest run` includes the corpus
suites, and they throw "Migration corpus is empty" without them. Then run `bun run install:all`
and delete the two sub-package lockfiles.

---

## 6. Dependency graph

```
01 input probe (temp) ────────────────────────────────────────────┐
02 inputMode ──► 05 wheelIntent ──► 07 viewport integration ─────┤
03 screenChrome geometry ──┐                                      ├──► 08 strip probe, docs, QA
04 useScreenPixelGrid ─────┴──► 06 SelectionOutlineLayer ─────────┘
```

- 01 → none
- 02 → none
- 03 → none
- 04 → none
- 05 → 02
- 06 → 03, 04
- 07 → 02, 05
- 08 → 01, 06, 07

---

## 7. Collision matrix

**W1 (4 tasks). The sets are pairwise disjoint:**

| 01 | 02 | 03 | 04 |
| --- | --- | --- | --- |
| `client/src/debug/inputProbe.ts` (new) | `client/src/ui/canvas/model/inputMode.ts` (new) | `client/src/ui/canvas/svg/screenChrome.ts` (new) | `client/src/ui/hooks/useScreenPixelGrid.ts` (new) |
| `client/src/debug/__tests__/inputProbe.dom.test.ts` (new) | `client/src/ui/canvas/model/__tests__/inputMode.test.ts` (new) | `client/src/ui/canvas/svg/__tests__/screenChrome.test.ts` (new) | `client/src/ui/hooks/__tests__/useScreenPixelGrid.dom.test.ts` (new) |
| `client/src/main.tsx` | | `client/src/ui/canvas/svg/chromeOverlay.ts` | |
| | | `client/src/ui/canvas/svg/__tests__/chromeOverlay.test.ts` | |

**W2 (2 tasks). The sets are disjoint:**

| 05 | 06 |
| --- | --- |
| `client/src/ui/canvas/model/wheelIntent.ts` (new) | `client/src/ui/components/CanvasSurface/SelectionOutlineLayer.tsx` (new) |
| `client/src/ui/canvas/model/__tests__/wheelIntent.test.ts` (new) | `client/src/ui/components/CanvasSurface/CanvasSurface.tsx` |
| | `client/src/ui/components/CanvasSurface/CanvasSurface.css` |
| | `client/src/ui/components/CanvasSurface/CanvasSurface.stories.tsx` |
| | `client/src/ui/components/CanvasSurface/__tests__/CanvasSurface.dom.test.tsx` |
| | `client/src/ui/components/CanvasSurface/__tests__/SelectionOutlineLayer.dom.test.tsx` (new) |

Task 05 reads task 02's `InputMode` type, which landed in W1. Task 06 reads 03 and 04, which also
landed in W1. Neither W2 task reads the other's output.

W3 and W4 are single-task waves.

---

## 8. Alignment guide

**Patterns to imitate:**

- Pure input helpers go in `ui/canvas/model/canvasTouchFilter.ts`. Use its style: long
  why-comments, exported pure functions, and a test beside it in `__tests__/`.
- Detection that is injectable and guarded against a missing DOM follows
  `ui/layout/deviceClass.ts` (`detectDeviceClass`) and `ui/utils/pointerDevice.ts`.
- Native non-passive listeners bound in `useEffect` on `containerRef`, with values read through a
  ref, follow the wheel effect in `useCanvasViewport.ts:349-421`. The gesture hook copies that
  shape exactly.
- Pure SVG specs are emitted as data and rendered by `CanvasSurface`. That is the
  `chromeOverlay.ts` / `OverlayPath` split, and `screenChrome.ts` follows it: geometry in `svg/`,
  JSX in `components/CanvasSurface/`.
- Canvas colours come **only** from `ui/theme/canvasTokens.ts` (a parity test guards this).
  `SELECTION_COLOR` is re-exported by `renderSelectionOverlay.ts`, and `WHITE` comes from
  `canvasTokens.ts`.

**Naming to hold:**

- `InputMode`, `currentInputMode()`, `detectInputMode()`, `readInputEnv()`, `INPUT_MODE_STORAGE_KEY = "pixelart.inputMode"`.
- `interpretWheel()`, `WheelIntent`, `WheelLatch`, `NOTCH_ZOOM_STEP`, `NOTCH_MIN_DELTA`, `TOUCHPAD_LATCH_MS`, `WHEEL_ZOOM_RATE`.
- `useGestureZoom()`, `useScreenPixelGrid()`, `SelectionOutlineLayer`, `.canvas__screen-chrome`.
- `snapEdge()`, `deviceStrokePx()`, `screenSelectionRect()`, `screenLassoPath()`.

**Boundaries that must not be crossed:**

- Everything new under `client/src/ui/` is pure: no store, no MobX, no `api/`, no `observer`.
  Check with `bun scripts/check-boundaries.mjs`.
- No file under `stores/`, `types/`, `services/` or `server/` changes. The corpus rule does not
  trigger. If you find yourself editing one, stop: you are outside this plan.
- No container changes in this plan (D13, D19). If a container edit looks necessary, record it as
  a deviation and ask.
- **Never** add `will-change` or any layer-promotion hint to `.canvas__layout`
  (`CanvasSurface.css:53-72`).

**What "done" looks like:**

- On a Mac in Safari, pinch zooms about the fingers, smoothly and at the same speed as Chrome's
  pinch. Two-finger scroll pans.
- With the Windows override set, one wheel notch is one ×1.2 step.
- The selection line looks like a Photoshop or Aseprite marquee: a razor-thin dashed line that does
  not change thickness at zoom 1, 5 or 50, and never smears.

**Most likely mistakes:**

1. **Zooming from `gesture*` on the iPad.** That doubles the pinch there. D10 forbids it, so gate
   on `mode !== "ipad"`.
2. **Treating `GestureEvent.scale` as a delta.** It is cumulative since `gesturestart`. Use the
   ratio to the last value.
3. **Forgetting `preventDefault()` on the gesture events at the container.** The document listener
   does it too, but the container must not rely on it.
4. **Snapping only the pan and forgetting the viewport's own fractional client offset**, or
   snapping at DPR 1 on a Retina screen. Both give a line that is crisp in the tests and soft on
   the owner's screen.
5. **Counter-scaling in the new layer.** It is not inside the CSS scale, so a counter-scale is
   wrong there.
6. **Updating tests to pass by re-deriving the new output.** Assert values worked out by hand:
   "at dpr 2, scale 7.3, pan 10.25, the left edge line centre is at x = …".
7. **Letting `CanvasSurface.tsx` go over 400 code lines.** That is an eslint *error*. Extract, do
   not disable.
8. **Leaving `src/debug/inputProbe.ts` in the tree after task 08.** It is temporary by design.

---

## 9. Risk register

| Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- |
| Diagnosis wrong: the owner's browser sends neither gesture events nor ctrl+wheel as expected | Med | High | Task 01 captures the raw signal on the owner's Mac before W3 lands. Task 07 handles both paths. If the probe shows something else, the coordinator records it and stops before W3 to re-plan. | 01, 07 |
| The probe can't be run (owner unavailable) | Med | Med | Task 01 still lands. Record "signal not captured" in HANDOFF, and have task 08 run it as a before/after check. Do **not** claim the diagnosis was verified. | 01, 08 |
| Windows notch heuristic misclassifies a touchpad as a mouse (zoom instead of pan) | Med | Med | The latch (D9), unit tests over both delta shapes, and the override key to escape it. Documented as heuristic. | 05 |
| iPad regression: pinch double-zooms or stops working | Low | High | D10 gates gesture zoom off in `ipad` mode. The touch block is untouched. Task 08 checks the iPad manually. | 07, 08 |
| `useCanvasViewport.ts` exceeds 400 code lines | Med | Low | Wheel maths moves to `wheelIntent.ts` and gesture binding to `useGestureZoom.ts`. Measure before committing. | 07 |
| `CanvasSurface.tsx` exceeds 400 code lines | Low | Low | The new layer is its own file, and the ants/lasso JSX is removed from the cell SVG (net ≈ −20). | 06 |
| Outline misaligned with the art (off by one cell or by pan) | Med | High | Unit tests with hand-computed coordinates, plus a manual check at zoom 1/7/50, with pan dragged to fractional values and the window moved between displays. | 03, 06, 08 |
| The screen-space layer lags the CSS-transformed art during a pan or pinch (one frame apart) | Low | Med | Both read the same `viewPanOffset`/`combinedScale` props in the same render, so there is no extra state. The manual check covers a fast pan. | 06 |
| Collision with plan 17 (CanvasSurface, `marchingAnts`) | High if run together | Med | Run sequentially (top banner). D19 keeps the prop API stable. | coordinator |
| `bunx` recreates a lockfile | Med | Low | Run the `find` check after each wave and delete the two sub-package lockfiles. | all |

---

## 10. Rules for every executor

- **Bun only.** `node` and `npm` are not on PATH. Run `bunx vitest run …`, never `npm test`.
- **Never create a lockfile.** After every `bunx`:
  `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` must print nothing. In a worktree,
  `rm -f client/bun.lock server/bun.lock`. Never use `--frozen-lockfile`, and never touch
  `bunfig.toml`.
- **Never run `vitest -u` or `--update`.** No snapshot changes in this plan at all. If a snapshot
  diff appears, you touched something you should not have.
- **The `ui/` boundary:** nothing under `client/src/ui/` imports a store, `api/`, MobX, or
  `observer`.
- **Never deep-observe a pixel grid.** Not relevant here, but do not add observation anywhere.
- **Never break `bun run dev`.**
- **Stay inside your task's `Touches`.** If you must touch another file, stop and report it as a
  deviation. Do not silently widen scope. The collision matrix is only valid if `Touches` is
  accurate.
- **Commit at task granularity.** One task is one or more commits, and a commit never mixes two
  tasks. Use messages like `feat(18/NN): …`, `test(18/NN): …`, `docs(18/NN): …`.
- **Paste the real gate output** in your report. "It passes" is not a report.
- **Manual checks are not optional.** A task whose manual checks were not done is **PARTIAL**, not
  DONE. Say which ones and why.
- **Report partial completion honestly.** Six of eight steps, with reasons, beats a false DONE.

---

## 11. Task index

| NN | Title | Wave | Effort | Summary |
| --- | --- | --- | --- | --- |
| 01 | Input signal probe (temporary) | W1 | S | A dev-only capture-phase logger of wheel/gesture/touch events to `/api/debug/log`. The owner pinches on the Mac, and the result is recorded in HANDOFF. |
| 02 | `InputMode` detection | W1 | S | Pure `detectInputMode(env)` → `ipad \| mac \| windows`, with a localStorage override. |
| 03 | Screen-space outline geometry | W1 | M | Pure device-pixel snapping plus screen paths for the selection rect and lasso. `marchingAntsOverlay`/`lassoOverlay` expose `box`/`points`. |
| 04 | `useScreenPixelGrid` hook | W1 | S | `{dpr, originX, originY}` for the viewport, kept current across resize and DPR changes. |
| 05 | `interpretWheel` per-mode wheel semantics | W2 | M | Pure wheel → pan/zoom intent with per-mode rules, notch detection and a touchpad latch. |
| 06 | `SelectionOutlineLayer` in `CanvasSurface` | W2 | M | Screen-space SVG for the ants and lasso. They are removed from the cell-space SVG, and tests and stories are updated. |
| 07 | Viewport integration: modes + Safari gesture zoom | W3 | M | `useCanvasViewport` uses `interpretWheel` and `useGestureZoom`, with a shared `zoomAbout` and dedupe. Suppression comments are corrected. |
| 08 | Strip probe, document, owner QA | W4 | M | Removes the probe, adds an ARCHITECTURE section, runs the full gate, and runs the manual QA matrix on the Mac, the iPad, and in Windows-override mode. |
