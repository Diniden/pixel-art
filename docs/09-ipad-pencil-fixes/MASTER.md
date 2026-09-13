# MASTER — iPad Pencil fixes

11 tasks · 5 waves · written 2026-09-06

---

## 1. Request

Verbatim, as given:

> we have some items to fix for the ipad pencil use:
> - Accidentally tapping in locations causing the system browser zoom to trigger. This needs to be disabled completely. The editor has resizing controls for everything already. The system zoom triggers by accident way too much.
> - All input fields across the application need to NOT update values dyanmically onChange. Changes should ALWAYS be applied on blur. It's impossible to use several fields without this.
> - Color sliders and colro region: when the pencil touches the bars or the color grid it should immeditely start selecting and follow while dragging around. The color regions should also absorb events and defaults to prevent the pencil from drawing.
> - When selecting color from the pallettes we are currently only setting the edge color. Color changes and selections across the entire app needs to honor whether or not we are selecting edge or fill.
> - We need a color swap that let's us swap edge and fill colors
> - Our color picker's other hand mode needs to have selection and honor the edge vs fill selecton
> - Our main area is limiting the amount of zooming OUT that we can do. It should let us keep zooming the canvas' out no matter the size of canvas until the canvas reaches 50 on either dimension
> - Our ipad layouts needs to save the layout for landscape and portrait.
> - The rect and the lasso tool in selection are not working at all. They should be working the same as the rect tool etc for the other tools with same start and stop style events
> - The pencil and eraser have too many settings interlaced. THey should have the exact same controls for controlling size and shape, but they need to be distinct values from each other. Some values are currently being shared.

### Interpretation

Ten independent defects, all surfacing when the editor is driven by an Apple Pencil on an
iPad. They are not one feature; they are a punch list. The connective tissue is that the
codebase was built mouse-first and the touch path was, in several places, *deliberately*
left as a subset — those deliberate gaps are now the bugs. Three of the ten (color target,
swap, other-hand color) are the same underlying defect at three call sites, so they are
planned as a store-API task plus two rewiring tasks rather than three independent fixes.

### Assumptions made where the request was ambiguous

| # | Ambiguity | Assumption | Task |
| --- | --- | --- | --- |
| A1 | "canvas reaches 50 on either dimension" — 50 **screen px** or 50 **sprite pixels**? | **50 CSS px on screen**, applied to the longest dimension. Reading it as sprite pixels would make the floor depend on the sprite's own resolution, which is not a zoom limit the user could perceive. | 04 |
| A2 | "All input fields" — does this include sliders? | **No.** `type="range"` is excluded; a slider that only updated on release would be unusable. Number and text fields only. | 02 |
| A3 | "All input fields" — search/filter boxes? | Left live **if** the field's whole purpose is as-you-type narrowing, recorded as an explicit exception. | 02 |
| A4 | "other hand mode needs to have selection" | Read as **edge/fill selection**, matching the same bullet's second clause, not as the rect/lasso *selection tool*. The other-hand rail already has selection-tool widgets (`toolWidgets.ts:282-342`). | 07 |
| A5 | "exact same controls … but distinct values" | Shape is **already** separate (`eraserShape` / `pencilBrushShape`). Size and max are not. So this is: add `eraserBrushSize` + `eraserBrushMax`, and give the eraser the Max button row the pencil has. | 09 |
| A6 | "save the layout for landscape and portrait" | Two saved rail layouts per device class, swapped live on rotation. Layout **presets** stay keyed by device class alone. | 10 |
| A7 | Should the browser-zoom fix touch the native iOS app? | **Yes.** `WebView.swift` sets only `bouncesZoom = false`, which does not disable zoom. A web-only fix would leave the WKWebView path open. | 01 |

---

## 2. Outcome

When this plan is complete, on an iPad with an Apple Pencil the owner can:

- Tap, rest a palm, and mis-touch anywhere in the app without the page zooming. Pinch and
  double-tap zoom the *canvas* only, never the document.
- Type in any number or text field without it fighting them — values apply on blur, Enter
  commits, Escape reverts, and a field can be cleared without snapping to its minimum.
- Touch the color grid or any color slider and have it select **on contact** and track the
  Pencil continuously, including past the control's edge — and never draw on the canvas by
  accident while doing so.
- Choose Edge or Fill and have **every** color surface honour it: the picker, the palette
  grid, the pinned current palette, the eyedropper, and the other-hand thumb rail.
- Swap edge and fill with one control (and with `X` on a desktop keyboard), as one undo step.
- Zoom the canvas out until it is a ~50 px thumbnail, on a sprite of any size.
- Use the rectangle and lasso selection tools with the Pencil, with the same
  press/drag/release feel as every other tool.
- Set the pencil's and the eraser's sizes independently, with identical controls for both.
- Arrange the rails in landscape and in portrait separately, and have rotation swap between
  the two saved arrangements.

---

## 3. Locked decisions

Decided now so no executor re-litigates them mid-flight.

| Decision | Value | Rationale | Owner |
| --- | --- | --- | --- |
| Zoom-out floor unit | 50 **CSS px**, longest dimension | A1; a perceivable limit | 04 |
| Zoom floor mechanism | Derived helper `viewZoomFloor(w, h)`, passed into stores as a parameter | Stores may not read the DOM (`ViewportUIStore.ts:204-212`) | 04 |
| Floor clamp | `Math.min(1, 50 / longest)` | 1:1 must always be reachable | 04 |
| Which zoom changes | `viewZoom` only | `viewport.zoom` has no production writer | 04 |
| Input commit semantics | Draft while typing; commit on blur **and** Enter; revert on Escape | Matches `CameraAdvanced.tsx:258-269`, the one correct field in the repo | 02 |
| Input primitive | Fix `NumberInput`, adopt it for `type="number"` only | It already exists and is unadopted; wholesale primitive adoption (the never-run task 36) stays out of scope | 02 |
| Sliders | Untouched | A2 | 02 |
| Pointer pattern | `onPointerDown/Move/Up/Cancel` + `setPointerCapture` + `touch-action: none` in CSS | The house pattern — `ThumbSlider.tsx:60-82`. Both halves required; neither alone works on iOS | 03 |
| Single color-set entry point | `ApplicationStore.setActiveColor(color)` | One branch point instead of five call sites each deciding | 05 |
| Color history asymmetry | Edge adds to `colorHistory`; fill does not | Preserves today's behaviour from `ColorPickerContainer.tsx:116-120` | 05 |
| `selectedColor` name | **Never renamed** | It is the wire-format name (`ToolUIStore.ts:52-58`) | 05 |
| `colorTarget` persistence | Stays **unpersisted** | Deliberate today (`ToolUIStore.ts:131-136`) | 05 |
| Swap semantics with `fillColor === undefined` | Effective fill is `fillColorOrSelected`; the swap materialises `fillColor` so both slots become independently editable | `fillColor` is tri-state and `selectedColor` is non-optional | 05 |
| Swap = one undo step | `swapEdgeAndFillColors()` calls `saveStateToHistory` once | | 05, 11 |
| Swap shortcut | `X`, suppressed while a text field has focus | Paint-app convention | 11 |
| Selection touch design | Mirror the mouse path in `CanvasContainer`, then extract shared helpers. **No begin/update/commit triad added to `SelectionUIStore`** | Selection is fire-and-forget today; a triad would pull the data-safety perimeter into the task | 08 |
| Mouse-only tools | Only `"selection"` is removed. `eyedropper`, `origin`, `reference-trace` stay touch-excluded | Scope discipline | 08 |
| New brush fields | `eraserBrushSize`, `eraserBrushMax` — **tri-state, `undefined` by default, emitted conditionally** | The only way the 151 corpus digests survive (`UIStore.ts:539-547`) | 09 |
| Brush migration | None. `?? brushSize` fallback **is** the migration | An existing project's `brushSize` becomes the pencil's; the eraser inherits it | 09 |
| Lighting normal brush size | **Out of scope**, recorded not fixed | A third field; the user did not ask | 09 |
| Layout key | `` `${deviceClass}:${orientation}` `` for tablet/phone; plain `deviceClass` for desktop | No desktop layout moves; no new wire key | 10 |
| `detectDeviceClass` | **Unchanged** | "Rotating an iPad must not move it between classes" (`deviceClass.ts:53-55`) | 10 |
| Legacy layout migration | Resolved in the `layout` **getter**, not by mutating the map on hydrate | Mutating on load would change an untouched project's digest on its next save | 10 |
| `layoutPresets` keying | Stays `deviceClass`-only | A named preset is wanted in either orientation | 10 |

---

## 4. Ground truth

Measured 2026-09-06 on branch `feat/08-pose-camera-model-space`.

### Project state

- **The refresh is complete.** There is **no `REFRESH/` directory**; `CLAUDE.md` and
  `ARCHITECTURE.md` still describe the mid-refresh mixed state, but on disk
  `client/src/` has `stores/`, `ui/`, `containers/`, `api/`, `styles/` all present and
  populated. **The target patterns apply everywhere**: MobX, BEM + tokens, `ui/` pure,
  `observer()` only in `containers/`. A legacy `client/src/store/` and
  `client/src/components/` still exist alongside the new tree — prefer the new one and
  match whatever the file you are editing already does.
- Stack: React **19.2.8**, MobX **7.0.0**, Vite **7.3.6**, TypeScript **5.9.3**,
  Vitest **3.2.7**, ESLint **9.39.5**, Storybook 9.1.20, Stylelint 17.14.1. Bun only.
- There is a **native iOS companion** at `ios-companion/PixelArtCompanion/` (SwiftUI +
  WKWebView). `Views/WebView.swift` holds the Pencil bridge and the touch-exclusivity fix.

### The gate — all four commands confirmed run, 2026-09-06

```
$ bun run typecheck      → exit 0
$ bun run lint           → exit 0 · 65 warnings, 0 errors (pre-existing)
$ bun run test           → 148 files, 3139 tests, all passing, ~73 s
$ bun run build          → (typecheck + vite build)
$ bun run verify         → typecheck + lint + format:check + test + build
```

Also confirmed to run:

```
$ cd client && bun run lint:boundaries  → "OK — all 5 boundary rules hold." (5 rules)
$ cd client && bun run lint:css         → 71 problems: 2 ERRORS, 69 warnings — PRE-EXISTING
```

⚠️ **`bun run lint:css` is NOT a gate and is not part of `bun run verify`.** It fails
today with 2 pre-existing `no-descending-specificity` errors in the shared blocks. Tasks
01, 03 and 07 add CSS; they must not *increase* the count, but they are not required to
fix the existing two, and **`bun run verify` does not run stylelint at all**. If you touch
CSS, run it, compare against `71 problems (2 errors, 69 warnings)`, and record the number.

`bun run build-storybook` also exists; no task in this plan requires it.

**The baselines a task must not raise: 65 ESLint warnings / 0 errors, and 71 stylelint
problems / 2 errors.**

### Subsystem baseline, by area

**Browser zoom (task 01).** `client/index.html:6` has no `maximum-scale`/`minimum-scale`.
No global `touch-action` in `styles/reset.css`. **Zero** `gesturestart`/`gesturechange`
handlers in the repo. No double-tap suppression. `WebView.swift:85` sets only
`bouncesZoom = false`. The one place it *is* done right is
`ui/hooks/useCanvasViewport.ts:519-618`, whose header states the two-part rule: CSS
`touch-action: none` **and** a `{ passive: false }` native listener — "Both are needed —
neither alone is sufficient on iOS."

**Inputs (task 02).** `ui/primitives/NumberInput/` exists and has **one** importer
(`SliderWithNumber.tsx:80`), which itself has **zero** production usages. `Field` and
`Slider`: zero. `NumberInput`'s current semantics are hybrid — in-range keystrokes commit
live (lines 77–89). 21 raw `type="number"` inputs across 12 files, all clamping on every
keystroke; 7 live `type="text"`; the one correct field is
`PosePanel/CameraAdvanced.tsx:258-269`.

**Color (tasks 03, 05, 06, 07).** `ui/components/ColorPicker/ColorPicker.tsx` (729 lines)
is the **only** interactive color surface still on raw mouse events — no pointer events, no
`setPointerCapture`, no `preventDefault`/`stopPropagation`, no `touch-action` in its CSS.
Every sibling (`ThumbSlider`, `NormalPicker`, `DirectionOrb`, `OtherHandSurface`,
`CanvasSurface`) was already converted. It has **no test and no story**.
Edge/fill state is `ToolUIStore.selectedColor` (line 59, = edge), `fillColor` (72,
tri-state), `colorTarget` (137, unpersisted). Only **one** call site branches correctly
(`ColorPickerContainer.tsx:116-120`); four hardcode edge —
`PaletteManagerContainer.tsx:177` and `:176`, `OtherHandRailContainer.tsx:74, 88-91`, and
the eyedropper at `CanvasContainer.tsx:4527, 4540, 4554`. **No swap exists anywhere.**
`ui/primitives/ColorSwatch/` exists and is imported by nothing.

**Zoom (task 04).** Two zooms: `zoom` (1–50, pixel scale, **no production writer**) and
`viewZoom` (0.25–4, view transform), multiplied at `CanvasContainer.tsx:5798`. The 0.25
floor is hard-coded in five places: `useCanvasViewport.ts:69`, `:347`, `:465`,
`ViewportUIStore.ts:201`, `CanvasCameraStore.ts:71`. **No fit-to-screen calculation exists
anywhere in the app.** `contentWidth`/`contentHeight` come from
`useCanvasGeometry.ts:128-134` and are already passed into `useCanvasViewport`
(options at `:95-105`).

**Selection (task 08).** `Tool` is an 18-member union (`types/domain.ts:446-466`);
`"selection"` is **one** tool with four **modes** (`SelectionMode`, `:487`). The mouse path
is fully implemented — `CanvasContainer.tsx:4568-4628` (down), `:4789-4812` (move),
`:4988-5000` (up), overlays at `:5659-5686`. The touch path bails twice, both deliberate:
`useCanvasPointer.ts:49-60` (`MOUSE_ONLY_TOOLS`) and `CanvasContainer.tsx:384-393`
(`isGestureTool`, checked at `:5217-5222`, `:5364`, and absent from `handleTouchEnd`).
`reflection` and `pose` already have branches placed **ahead** of that bail (`:5187-5201`) —
that is the precedent to follow. `SelectionUIStore` has no begin/update/commit triad; the
in-flight gesture is `CanvasContainer` `useState` (`:547-559`).
`CanvasContainer.tsx` is **5,848 lines**.

**Brush (task 09).** `brushSize` (`ToolUIStore.ts:73`) is a single global with **seven
readers** — pencil, eraser, fill-square, reference-trace, the lighting normal pencil, the
hover footprint, and the other-hand sliders. `pencilBrushMax` (`:95`) also bounds the
**eraser's** slider (`PixelStudioPanel.tsx:252-266`), and only the pencil gets a Max row.
`eraserShape` (93) and `pencilBrushShape` (94) are already correctly separate.

**Layout (task 10).** Layout lives in the **project file**, not localStorage
(`LayoutUIStore.ts`, `railLayouts` at `:254`, conditional wire slot 45). Keyed by
`DeviceClass` alone — `"desktop" | "tablet" | "phone"` — and `detectDeviceClass`
(`deviceClass.ts:46-75`) deliberately classifies by **short edge** so rotation cannot
reclassify. `deviceClass` is measured once at construction (`:281-282`); there is **no
resize or orientationchange listener anywhere**, and `matchMedia` appears in only two
files, neither querying orientation. So an iPad has exactly **one** saved arrangement
shared between portrait and landscape.

### Data-safety perimeter — what is at risk in this plan

`server/src/data/Base Unit.json` is 1.1 MB of the owner's real work, with 149 backup
snapshots. The corpus suite is the regression gate and **must pass unchanged**.

Tasks touching the perimeter (`client/src/types/`, `client/src/stores/domain/`,
`client/src/stores/ui/` where it feeds `toPersistedUIState`, `client/src/services/`,
`server/src/export/`): **05, 09, 10**. Task **09 is the sharpest** — it adds two wire keys.

The precedent that makes it safe is documented at `UIStore.ts:539-547`, for `railLayouts`
and `theme`: a new key is safe **only** while it is `undefined` on an untouched project and
emitted through `assign()`. Making one unconditional adds a key to all 151 snapshots on
their next save.

**Never run `vitest -u`.** A `PreToolUse` hook blocks it, but that is a backstop.

---

## 5. Wave table

| Wave | Tasks | Parallelism | Gate that must exit 0 before the next wave |
| --- | --- | --- | --- |
| **W1** | 01, 02, 03, 04 | 4 agents | `bun run typecheck && bun run lint && bun run test && bun run build` |
| **W2** | 05, then 09 | **1 agent, sequential** — both edit `ToolUIStore.ts` | same, plus corpus suite unchanged |
| **W3** | 06, 07 | 2 agents | same, plus `cd client && bun run lint:boundaries` |
| **W4** | 08, 10 | 2 agents | same, plus corpus suite unchanged |
| **W5** | 11 | 1 agent | `bun run verify` — the full gate, plus the lockfile check |

**W2 is the one wave that is deliberately not parallel.** Tasks 05 and 09 both edit
`client/src/stores/ui/ToolUIStore.ts`, in textually disjoint regions (05 near line 313, 09
near lines 73–95 and 328–360) — but the same file. Run **05 first, then 09**. Do not
dispatch them concurrently.

---

## 6. Dependency graph

```
W1  01 ── (none)
    02 ── (none)
    03 ── (none)
    04 ── (none)

W2  05 ── (none)          ← must land before 06, 07
    09 ── (none)          ← sequential after 05 only because of the shared file

W3  06 ── 05
    07 ── 05              (also rebases on 03's ColorPicker.tsx work from W1)

W4  08 ── 07              (both edit CanvasContainer.tsx; 07's 3 lines land first)
    10 ── (none)

W5  11 ── 02, 03, 05, 06, 07, 08, 09
```

| Task | Depends on | Why |
| --- | --- | --- |
| 01 | — | |
| 02 | — | |
| 03 | — | |
| 04 | — | |
| 05 | — | Provides the store API 06 and 07 consume |
| 06 | 05 | Calls `app.setActiveColor` / `app.activeColor` |
| 07 | 05 | Calls `app.setActiveColor` / `app.swapEdgeAndFillColors`; rebases on 03 |
| 08 | 07 | Serialised on `CanvasContainer.tsx`: 07 changes 3 eyedropper lines, 08 rewrites the touch handlers |
| 09 | — | Sequenced after 05 within W2 for the shared file only |
| 10 | — | |
| 11 | all above | Wires what earlier waves deliberately left unwired |

---

## 7. Collision matrix

### W1 — four tasks, `Touches` pairwise disjoint

| | 01 | 02 | 03 | 04 |
| --- | --- | --- | --- | --- |
| **01** | — | ∅ | ∅ | ∅ |
| **02** | ∅ | — | ∅ | ∅ |
| **03** | ∅ | ∅ | — | ∅ |
| **04** | ∅ | ∅ | ∅ | — |

- **01**: `client/index.html`, `styles/reset.css`, `ui/hooks/useSuppressBrowserZoom.ts` (new) + its test, `main.tsx`, `ios-companion/…/WebView.swift`
- **02**: `ui/primitives/NumberInput/*`, 16 component files under `ui/components/`
- **03**: `ui/components/ColorPicker/ColorPicker.tsx`, `.css`, its new test
- **04**: `ui/hooks/useCanvasViewport.ts`, `stores/ui/ViewportUIStore.ts`, `stores/ui/CanvasCameraStore.ts`, `containers/LightingCanvasContainer.tsx`, its new test

⚠️ **02 and 03 both live under `ui/components/`, and 03's file is on 02's candidate list.**
Task 02 **explicitly excludes `ColorPicker.tsx`** (its 5 number inputs and its hex field),
and task 03 explicitly excludes the hex field's commit semantics. The hex field is picked
up by task **11**. Both files' constraints state this. **Verified disjoint.**

⚠️ **01 and 03 both add `touch-action`.** 01 writes it only in `styles/reset.css` (global,
inside `@media (pointer: coarse)`); 03 only in `ColorPicker.css` (component). Different
files, and `touch-action` does not inherit, so they compose rather than conflict.

⚠️ **02 touches `ui/components/LightingStudioPanel/LightControl.tsx`; 04 touches
`containers/LightingCanvasContainer.tsx`.** Different files, different layers.

### W2 — NOT PARALLEL

05 and 09 share `client/src/stores/ui/ToolUIStore.ts`. **Run sequentially, 05 first.**
This is the deliberate exception; do not "optimise" it into a parallel wave.

### W3 — two tasks

| | 06 | 07 |
| --- | --- | --- |
| **06** | — | ∅ |
| **07** | ∅ | — |

- **06**: `containers/PaletteManagerContainer.tsx`, `containers/ColorPickerContainer.tsx`, its test
- **07**: `containers/OtherHandRailContainer.tsx`, `containers/CanvasContainer.tsx` (3 lines), `ui/components/ColorPicker/ColorPicker.tsx`, `.css`, `containers/otherHand/toolWidgets.ts`, its test

⚠️ **Both are about the color target and both touch `containers/`, but no file overlaps.**
The crucial split: `ColorPickerContainer.tsx` belongs to **06**; `ColorPicker.tsx` (the
`ui/` component) belongs to **07**. This is why task 07 adds the swap **prop** as optional
and cannot wire it — task 11 does. Verified disjoint.

⚠️ **07 edits `ColorPicker.tsx`/`.css`, which task 03 rewrote in W1.** Sequential across
waves, not a collision. 07 must rebase and preserve 03's pointer work — stated in 07's
Definition of done.

⚠️ **07 edits `toolWidgets.ts`, which task 09 edited in W2.** Sequential across waves.

### W4 — two tasks

| | 08 | 10 |
| --- | --- | --- |
| **08** | — | ∅ |
| **10** | ∅ | — |

- **08**: `containers/CanvasContainer.tsx`, `ui/hooks/useCanvasPointer.ts`, its new test
- **10**: `stores/ui/LayoutUIStore.ts`, `ui/layout/deviceClass.ts`, its new test

Verified disjoint. **08 takes `CanvasContainer.tsx` only after 07's three lines have
landed in W3** — that is why 08 depends on 07.

### W5 — single task

11 alone. It touches `ColorPickerContainer.tsx` (06's), `ColorPicker.tsx` (03's and 07's),
`GlobalHotkeys.tsx` (nobody's), and conditionally `CanvasContainer.tsx` (07's and 08's).
All sequential. No collision.

### Files touched by more than one task, across waves — the watch list

| File | Tasks, in order | Guard |
| --- | --- | --- |
| `stores/ui/ToolUIStore.ts` | 05 (W2) → 09 (W2) | **Sequential within W2.** Disjoint regions |
| `ui/components/ColorPicker/ColorPicker.tsx` + `.css` | 03 (W1) → 07 (W3) → 11 (W5) | Sequential waves; each must preserve the last |
| `containers/CanvasContainer.tsx` | 07 (W3, 3 lines) → 08 (W4, touch handlers) → 11 (W5, conditional) | Sequential waves; 07 and 11 are strictly bounded |
| `containers/otherHand/toolWidgets.ts` | 09 (W2) → 07 (W3) | Sequential waves |
| `containers/ColorPickerContainer.tsx` | 06 (W3) → 11 (W5) | Sequential waves |

---

## 8. Alignment guide

Eleven fresh contexts will execute this. These are the things that keep them producing one
coherent change rather than eleven local ones.

### The analogue files — imitate these, do not invent

| Doing this | Copy this |
| --- | --- |
| Any touch/pointer drag interaction | `ui/components/OtherHand/ThumbSlider.tsx:60-82` + `OtherHand.css:296` |
| Suppressing a browser gesture | `ui/hooks/useCanvasViewport.ts:519-618` — the two-part rule |
| A field that commits on blur | `ui/components/PosePanel/CameraAdvanced.tsx:258-269`; for text, `Header.tsx:282` |
| A tri-state wire field | `ToolUIStore.eyedropperMode` (`:100-109`) and its doc comment |
| A conditional wire key | `UIStore.ts:539-547` — the `railLayouts`/`theme` precedent |
| A store test for a tri-state field | `stores/ui/__tests__/fillColor.test.ts` |
| A touch branch placed before a bail | `CanvasContainer.tsx:5180-5201` (reflection, pose) |
| Branching on the color target | `ColorPickerContainer.tsx:116-120` |

### Naming to hold

- `colorTarget`, `"edge" | "fill"` — the existing vocabulary. Not "primary/secondary",
  not "foreground/background".
- `selectedColor` **is** the edge color and **is never renamed** (wire format).
- New store methods: `setActiveColor`, `activeColor`, `swapColors`,
  `swapEdgeAndFillColors`.
- New brush fields: `eraserBrushSize`, `eraserBrushMax` — parallel to the existing
  `pencilBrushShape` / `pencilBrushMax`.
- New layout helpers: `detectOrientation()`, `layoutKey()`, `Orientation`.
- New zoom helpers: `viewZoomFloor()`, `MIN_CANVAS_SCREEN_PX`.

### Boundaries that must not be crossed

1. **Nothing under `client/src/ui/` imports a store, the API, or MobX.** Props in,
   callbacks out. Enforced by ESLint and by `bun run lint:boundaries`. If the rule seems
   not to fire, run the boundary probe — a rule matching nothing looks exactly like a rule
   that passes.
2. **`observer()` appears only under `client/src/containers/`.**
3. **Pixel grids are never deep-observed.** No task here needs to touch `layer.pixels`; if
   you find yourself reaching for it, you have gone off-plan.
4. **Stores never read the DOM.** Task 04 exists in the shape it does because of this.
5. **The wire format does not change shape.** Two new keys (task 09) and richer map keys
   (task 10), both conditional, both with the corpus suite as the proof.

### What "done" looks like

The user picks up the iPad, and: nothing zooms the page by accident; every field waits for
them to finish typing; the color grid tracks the Pencil from first contact; Fill means
fill everywhere; one tap swaps; the canvas zooms out to a thumbnail; rect and lasso select;
the eraser has its own size; and rotating the iPad brings back the layout they built for
that orientation.

### The five things an executor is most likely to get wrong

1. **Making a new wire key unconditional.** It looks harmless and it silently rewrites 151
   of the owner's snapshots on their next save. Tasks 09 and 10. The corpus suite is the
   only thing that catches it — and the temptation when it fails is `vitest -u`, which is
   the single most damaging thing that could happen in this plan. **Never.**
2. **Doing only half the touch fix.** `touch-action: none` in CSS *or* a `{ passive:
   false }` listener, but not both. It will appear to work in Chrome DevTools' device
   emulation and fail on the actual iPad. Tasks 01 and 03.
3. **Widening `Touches` to "just fix this one thing while I'm here."** Three files in this
   plan are edited by three different tasks across three waves. The collision matrix is
   only valid if `Touches` is accurate. If a task seems to require a file it does not own,
   **stop and record a blocker** — several tasks say this explicitly and mean it.
4. **Marking a task done with the iPad checks skipped.** Six of the eleven tasks cannot be
   verified without the physical device. A task whose manual checks were skipped is
   **PARTIAL**, and saying so is the correct outcome, not a failure.
5. **Placing a new touch branch after the `isGestureTool` bail.** The file already warns
   about exactly this (`CanvasContainer.tsx:5180-5185`) and calls it "the
   highest-likelihood risk". The gesture is swallowed **silently** — it looks like the
   code never ran, because it didn't. Task 08.

---

## 9. Risk register

| # | Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- |
| R1 | A new wire key is emitted unconditionally, changing all 151 corpus digests | Medium | **Severe** — silently rewrites the owner's real project files | Both new fields default to `undefined` and go through `assign()`; a test asserts an untouched store emits neither key; the corpus suite must pass unchanged; `vitest -u` is forbidden and hook-blocked | 09, 10 |
| R2 | A global `touch-action: none` breaks scrolling in the rails and panels | **High** | High — the app becomes unusable on the iPad | Scoped to `@media (pointer: coarse)`; `touch-action` does not inherit; every scrollable container audited and given an explicit axis; six manual scroll checks | 01 |
| R3 | Suppressing browser zoom also kills the canvas's own pinch-zoom | Medium | High | The canvas's native `{ passive: false }` listener at `useCanvasViewport.ts:519-618` is explicitly not modified; manual check 3 on task 01 verifies canvas zoom still works | 01 |
| R4 | The touch selection branch is placed after the `isGestureTool` bail and silently does nothing | **High** | Medium — the task appears done and is not | The file's own warning is quoted in the task; `reflection`/`pose` are given as the precedent; the placement decision must be written into a code comment; manual checks 1–2 on the device | 08 |
| R5 | The selection gesture is duplicated into a 5,848-line file and left that way | High | Medium — adds to the measured duplication debt | Step 7 of task 08 mandates extraction into shared helpers, with `ARCHITECTURE.md` §6 cited | 08 |
| R6 | Three tasks edit `ColorPicker.tsx`/`.css` across three waves; a later one reverts an earlier one's work | Medium | Medium | Sequential waves; task 07 and 11 both have "preserve task 03's pointer work" in their Definition of done; the watch list in §7 names it | 03, 07, 11 |
| R7 | 05 and 09 are run in parallel and collide in `ToolUIStore.ts` | Medium | Medium — a lost edit | W2 is declared explicitly non-parallel in the wave table, the collision matrix, and both task files | coordinator |
| R8 | The swap button ships visible but unwired if task 11 is skipped | Medium | Low — a dead control | Task 07's Definition of done records it; task 11's manual check 1 verifies it; `HANDOFF.md` must carry the note | 07, 11 |
| R9 | The derived zoom floor breaks pointer→pixel coordinate mapping at extreme zoom-out | Medium | Medium — drawing lands on the wrong pixel | Manual check 6 on task 04 draws after zooming fully out; the floor is clamped to ≤1 so 1:1 stays reachable | 04 |
| R10 | An orientation listener added without a disposer double-fires under React 19 StrictMode | Medium | Low | An explicit StrictMode manual check; a test asserts `removeEventListener` on dispose | 10 |
| R11 | A previously-saved iPad layout is lost when the key changes | Medium | Medium — the owner's arrangement | The fallback is resolved in the `layout` getter, not by mutating on hydrate; a test covers the legacy map; manual check 5 opens a pre-existing project | 10 |
| R12 | The blur-commit sweep breaks a field whose live update is load-bearing (a search filter) | Medium | Low | Each text site is read before changing; genuine filter fields stay live and are recorded as explicit exceptions | 02 |
| R13 | Manual checks are skipped because no iPad is at hand, and tasks are marked done anyway | **High** | High — the entire plan is about the iPad | Six tasks state "no iPad ⇒ PARTIAL" in their Definition of done; `HANDOFF.md` must record each check's result individually | all |
| R14 | `bunx` recreates a lockfile as a side effect | Low | Medium — violates standing owner policy | Task 11 runs the `find` check; use `bun run <script>`, not bare `bunx`, wherever a script exists | 11 |

---

## 10. Rules for every executor

Restating the `CLAUDE.md` rules that actually bite in this plan, plus this plan's own.

**From `CLAUDE.md`:**

1. **Bun only.** `node` and `npm` are not on PATH. Use `bun` / `bunx` in every command.
2. **Never create a lockfile.** No `bun.lock`, `bun.lockb`, `package-lock.json`,
   `yarn.lock`, ever. `bunfig.toml`'s `save = false` stays. `--frozen-lockfile` must never
   appear. `bunx` can create one as a side effect — check with
   `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` before committing.
3. **Never break `bun run dev`.** If a change stops the app starting, fix it or revert.
4. **Protect the owner's data.** `server/src/data/` is 1.1 MB of real work behind 8
   migrations. **Never run `vitest -u`** on the migration or corpus suites. Any change
   under `client/src/types/`, `client/src/services/`, `client/src/stores/domain/` or
   `server/src/export/` must confirm the corpus snapshots pass **unchanged**.
5. **Never deep-observe a pixel grid.** `layer.pixels` is `observable.ref`, always.
6. **The `ui/` boundary.** Nothing under `client/src/ui/` imports a store, the API, or
   MobX. `observer()` only under `containers/`. Both ESLint-enforced — and if the rule
   seems not to fire, run the boundary probe.
7. **Commit at task granularity.** A formatting sweep, a store change and a UI rewire are
   three commits.
8. **Run the gate and paste the real output.** "It passes" is not a report.
9. **Do the manual checks.** Gesture behaviour, StrictMode semantics and visual
   regressions are not automatable here.
10. **Report honestly, including partial completion.**

**This plan's own rules:**

11. **Stay inside your `Touches` list.** Every file you create, edit or delete is listed
    there. If the work seems to require a file you do not own, **stop and record a blocker
    in `HANDOFF.md`** — do not edit it. Three files here are shared across waves and the
    collision matrix is only valid if `Touches` is accurate.
12. **W2 is sequential.** Tasks 05 and 09 share `ToolUIStore.ts`. Run 05, then 09.
13. **The lint baseline is 65 warnings, 0 errors.** Do not raise it.
14. **No iPad ⇒ PARTIAL, not done.** Six tasks depend on physical-device verification.
    Record each manual check's result individually in `HANDOFF.md`. "Manual checks
    performed" without per-item results is not a report.
15. **A new wire key is conditional or it is wrong.** If the corpus suite fails, you have
    made a key unconditional. Revert and fix. Do not update the snapshot.
16. **Branch per wave.** Create a branch for the plan (e.g.
    `feat/09-ipad-pencil-fixes`), never commit directly to `main`. The current branch at
    planning time is `feat/08-pose-camera-model-space`.

---

## 11. Task index

| NN | Title | Wave | Effort | Summary |
| --- | --- | --- | --- | --- |
| 01 | Suppress browser zoom | W1 | M | Viewport meta, global `touch-action`, a `gesturestart` suppression hook, and WKWebView zoom scales pinned to 1 |
| 02 | Inputs commit on blur | W1 | L | Strip `NumberInput`'s live-commit branch, adopt it for 21 number fields, convert 7 text fields to draft-plus-blur |
| 03 | ColorPicker pointer events | W1 | M | SV region and hue bar onto pointer events with capture; `touch-action: none`; absorb events so the Pencil cannot draw through |
| 04 | Zoom-out floor | W1 | M | Replace the hard `viewZoom ≥ 0.25` with a floor derived from content size, down to a 50 px canvas |
| 05 | Color target store API | W2 | M | `setActiveColor`, `activeColor`, `swapColors`, `swapEdgeAndFillColors` — one branch point, no wire change |
| 09 | Split pencil/eraser settings | W2 | L | Add tri-state `eraserBrushSize` / `eraserBrushMax`, give the eraser the pencil's Max row, keep the corpus digests intact |
| 06 | Color target call sites | W3 | M | Palette and Current Palette swatches honour edge vs fill; `ColorPickerContainer` delegates to the store |
| 07 | Other-hand, eyedropper, swap UI | W3 | L | Edge/Fill selector + Swap in the thumb rail, eyedropper writes the targeted slot, swap control added to the picker |
| 08 | Selection touch support | W4 | L | Rect and lasso selection respond to the Pencil; the gesture body shared between mouse and touch |
| 10 | Orientation-aware layout | W4 | M | Rail layouts keyed by `deviceClass:orientation`, swapped live on rotation, legacy layouts migrated in the getter |
| 11 | Wire swap and follow-ups | W5 | M | Wire the swap control and `X` shortcut, fix the hex field, apply deferred one-liners, run the full gate |
