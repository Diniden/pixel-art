# Studio-aware tool configuration — MASTER plan

Planned 2026-09-27 against `main @ 96e0284` (clean tree). Executed by `/plan-go`, one fresh
agent per task. **Read this file, `CLAUDE.md`, and your task file. Nothing else is required;
nothing else is assumed.**

> ## ℹ️ Relationship to plans 14 and 15 — no prerequisite, one collision to watch
>
> `docs/14-multi-brush-projects/` and `docs/15-brush-application-mapping/` are both **written
> but NOT executed** (both `HANDOFF.md`s read "W1 not started"; `grep -c '"brush-2"'
> client/src/types/brush.ts` → 0, confirming the plan-14 model has not landed).
>
> **This plan does not depend on either of them** and may be executed before, after or
> between them. It touches no wire format, no brush document shape, and no
> `types/`/`codecs/` file.
>
> **One collision exists.** Plan 14 task 12 lists `client/src/containers/BrushStudioPanelContainer.tsx`
> and `client/src/containers/__tests__/BrushStudioPanelContainer.dom.test.tsx` in its
> `Touches` — the same two files as **this plan's task 03**. Plan 14 also touches
> `BrushCanvasContainer.tsx` (this plan's task 04). Neither plan's changes are semantically
> incompatible — plan 14 threads a selected-brush id through, this plan adds rail sections —
> but they will conflict textually if merged in parallel.
>
> **Coordinator rule: do not run this plan and plan 14 concurrently.** Whichever merges
> second rebases and re-runs its own gate. Record which order was used in `HANDOFF.md`.
>
> Line numbers quoted throughout were measured on `main @ 96e0284`. Every citation also names
> the symbol — **anchor on the symbol, treat the line as a hint.**

---

## 1. Request

Verbatim:

> Our brush studio has an issue with the tools:
> - When using the brush studio: when I select a tool, I expect to see the tool's normal controls like selection tool etc should display it's tool configuration etc
> - I understand this conflicts with things like color selection because colors are now specialized to the brush studio delta colorations.
> - So, I expect tools to be given a "Studio" configuration when invoked for populating the tool panel so the tools can flexibly display configuration for the studio they are rendering for.
> - Thus, things like the pencil tool, or rectangle too or any tool that has color selections should still show the color picker for edge and fill, BUT the color picker can be passed the studio mode so they render with color picking for deltas instead for the brush studio.
> - And thus this way our other tools like reflection tool and selection tool still shows their unique tool configurations

### Interpretation

The reported symptom has one concrete cause, measured: the Tool Options panel is gated on a
single boolean, `isPixelMode={lightingUI.studioMode === "pixel"}`
(`client/src/containers/RightSidebarTopControlsContainer.tsx:76`), and every one of its seven
sections is `isPixelMode && selectedTool === …`
(`client/src/ui/components/RightSidebarTopControls/RightSidebarTopControls.tsx:111-119`). The
brush studio **does** render that container (`BrushStudioContainer.tsx:96`), so the panel is
mounted and then suppressed wholesale. Selecting Rectangle in the brush studio therefore
shows no shape controls even though `BrushCanvasContainer.tsx:163-164` reads `tool.shapeMode`
and `tool.borderRadiusOrZero` and honours both.

This plan replaces the wholesale boolean with the "Studio configuration" the request asks
for: a **per-capability table** keyed by studio (task 01), consumed by the Tool Options panel
(task 02) and by the brush rail (task 03). It is a capability table rather than a mode flag
because the honest answer differs per control, not per studio — three of the seven pixel
controls are live in the brush studio and four are not, and that is measured, not assumed
(the evidence table is in §4 and in task 01's Context).

On the request's colour-picker bullet: **the outcome it describes already exists**, achieved
by composition instead of a mode prop. `BrushDeltaPicker` is the brush studio's colour
picker — same Edge/Fill slot model, same swap button, same active-slot resolution as
`ColorPicker`, in delta vocabulary — and it is already mounted, ungated, at the top of the
brush rail (`BrushStudioPanelContainer.tsx:168-202`). Passing a `studioMode` into
`ColorPicker` so it renders deltas instead would merge two structurally incompatible
components (different value types, different write granularity, different undo policy, 945
vs 359 lines). §3 D1 locks that decision, with the incompatibility table in task 03's
Context. What the bullet actually *needs* — tool config visible, colour expressed as deltas —
is delivered by tasks 02 and 03 without that merge.

On the reflection tool: it is **inert** on a brush canvas
(`containers/brush/brushToolContext.ts:205`, `BRUSH_INERT_TOOLS`). In the brush studio the
only choices are a section that lies or no tool; §3 D6 locks "no tool" — hide it, as `origin`
and `brush` already are. Its pixel-studio section is untouched.

### Assumptions where the request was ambiguous

| Ambiguity | Decision | Why |
| --- | --- | --- |
| "Tool's normal controls" — which panel? | **Both** the Tool Options panel (`RightSidebarTopControls`, task 02) and the studio rail (`BrushStudioPanelContainer`, task 03). The two are separate containers in separate layout slots; the pixel studio splits tool config across both, so the brush studio must too. | `BrushStudioContainer.tsx:96` and `:99-105` mount them into `rightControls` and `studioPanel`. |
| Should the brush studio show controls it cannot honour? | **No.** Four of the seven — gaussian smoothing/radius, move-all-layers, selection mode, selection behaviour/expand/shrink — are never read on the brush side and are omitted. | Showing four dead controls is a worse bug than the one reported. Evidence per control in §4. |
| Then what does the Selection tool show in the brush studio? | A **basic** variant: live width × height, pixel count, and Clear. Tasks 02 + 04. | The brush mask is rectangle-only React state in `containers/brush/useBrushSelection.ts:142`, with no modes and no expand/shrink (`brushSelection.ts:17-18`: "Rectangle only. Lasso is DEFERRED"). |
| Reflection tool in the brush studio | **Hidden** (task 05), not given a section. | Inert: `BRUSH_INERT_TOOLS` (`brushToolContext.ts:205`) and `:189-196` for why letting it through opens an unclosed gesture. |
| Pose tool in the brush studio | **Hidden** too, same reasoning. | `BRUSH_INERT_TOOLS` (`brushToolContext.ts:206`). |
| Merge `ColorPicker` and `BrushDeltaPicker` behind a studio prop? | **No** — §3 D1. | Incompatible value types, write granularity, undo policy, empty states. Table in task 03's Context. |
| Mount `ColorPickerContainer` / `PaletteManagerContainer` in the brush studio? | **No.** | Nothing in `BrushCanvasContainer.tsx` or `containers/brush/*` reads `selectedColor`, `fillColor` or `colorTarget` — a colour picker there would edit state the canvas never consults. `PaletteManager` sources every value from the pixel document and its currency is RGBA, meaningless as a signed delta. |
| Should the brush selection gain lasso / expand / shrink to match the pixel studio? | **No** — out of scope. | A separate feature (`brushSelection.ts:17-18` defers lasso deliberately). This plan surfaces what exists; it does not widen the brush selection. |
| Lighting studio | **Unchanged**, every capability `false`. | It has its own rail (`LightingStudioPanelContainer`) and has never shown this panel. |
| Other Hand Mode (tablet thumb rail) | **Not extended.** `containers/otherHand/*` untouched. | Its section set is a separate surface with its own widget model; widening it needs its own manual-check pass on a tablet. |
| Hotkeys for newly hidden tools | **Investigated and recorded, not changed** (task 05). | `hiddenTools` filters buttons, not hotkeys — a pre-existing property that already applies to `origin` and `brush`. Changing hotkey routing is its own task. |

---

## 2. Outcome

When every wave is DONE the owner can, in the **Brush Studio**:

1. Select **Rectangle** or **Ellipse** and see a **Tool Options** panel with Shape
   (outline / fill / both) and — for Rectangle — Border radius. Setting Shape to "fill" and
   dragging fills the interior with the Fill delta and leaves the outline unpainted.
2. Select **Fill-square** and see its size slider, which changes the stamped square's size.
3. Select **Selection**, drag a rectangle, and see its live **width × height and pixel
   count** in the rail, with a **Clear** button that clears the brush canvas's marching ants.
4. Select **Eyedropper** and see which delta slot a pick will land in; switching the Delta
   picker's Edge/Fill tab changes that readout, and a pick moves the sliders of the named
   slot.
5. Select any painting tool and see, in the rail, which delta slot it paints with — so the
   Edge/Fill tabs are no longer guesswork.
6. See the **Delta picker at the top of the rail for every tool**, never gated away.
7. **Not** see: gaussian smoothing/radius, move-all-layers, selection modes, expand/shrink,
   or the Reflection and Pose tool buttons — none of which do anything there.

And in the **Pixel Studio**: everything behaves exactly as it does today, including the
Reflection and Pose rail sections, the full selection controls, and the colour picker and
palette manager. This is pinned by test, not by intention (task 02 step 7, task 05 manual
check 5).

---

## 3. Locked decisions

Decided now so no executor re-decides them mid-flight.

| # | Decision | Rationale | Owner task |
| --- | --- | --- | --- |
| **D1** | **`ColorPicker` and `BrushDeltaPicker` stay separate components.** No `studioMode` prop on `ColorPicker`, now or later in this plan. | Incompatible on six axes: value type (`Color` 0–255 vs `BrushDelta` −255..255 signed), write granularity (whole colour vs one channel), row count (fixed + SV square + hue bar vs 1/3/4 dynamic), undo (300 ms debounce vs none, and forbidden — MASTER D17 of plan 01), history strip (yes vs no), empty state (none vs "Select a layer"). `ColorPicker.tsx:124-141` documents an HSL-drift bug whose fix depends on the single-value-system shape. | 03 |
| **D2** | Tool options are gated by a **per-capability table**, `studioSupports(studio, capability)`, not by a per-studio boolean. | Three of seven pixel controls are live in the brush studio and four are not (§4). A boolean can only be wrong in one of two directions. | 01 |
| **D3** | The table lives in `client/src/ui/components/RightSidebarTopControls/toolConfigStudio.ts` as **pure `ui/` data** — no store, no MobX, no domain-type import. | The `ui/` boundary (`CLAUDE.md`); enforced by `check-boundaries.mjs` rules 1 and 3. Unions declared locally, as `BrushDeltaPicker.tsx:58` declares `BrushDeltaTarget` and `ui/canvas/pose/poseTypes.ts` declares `PoseColor`. | 01 |
| **D4** | `SelectionControls` gains `variant?: "full" \| "basic"`, **defaulting to `"full"`**; mode/behaviour props stay **required**. | Default-`"full"` keeps every existing caller and story byte-identical with no edit. Required props prevent a `"full"` caller silently losing a control — the failure `ColorPicker.tsx:90-99` and `BrushDeltaPicker.tsx:71-78` both warn about. | 02 |
| **D5** | The brush selection crosses containers as **three numbers + one callback on `BrushUIStore`**, `observable.ref`, session-only, published by the **keyboard-owning pane only**, never the mask `Set`. | The mask holds tens of thousands of packed indices (`RightSidebarTopControlsContainer.tsx:19-32`); `CLAUDE.md` forbids deep-observing a grid. Up to two `BrushCanvasContainer` panes are live (`BrushStudioContainer.tsx:100-103`), so a single-writer rule is required — reuse the hook's existing `views.keyboardOwner === renderMode` (`BrushCanvasContainer.tsx:244`). | 04 |
| **D6** | `reflection` and `pose` are **hidden** in the brush studio via `BRUSH_HIDDEN_TOOLS`, not given rail sections. | Both are in `BRUSH_INERT_TOOLS` (`brushToolContext.ts:205-206`). A hidden tool cannot be selected, so "what does its rail show?" never arises. A section would lie. | 05 |
| **D7** | `normal-pencil`, `auto-normal`, `height-map` are **not** added to `BRUSH_HIDDEN_TOOLS`. | They are not in the pixel tool table (`PixelStudioTools.tsx:100-140`); they live in `LightingStudioTools.tsx:27-36`, which the brush studio never renders (`Toolbar.tsx:107-124`). Adding them is dead config. | 05 |
| **D8** | **No new file under `client/src/ui/`** for the brush rail's new sections. They are lowercase `renderX` helpers inside `BrushStudioPanelContainer.tsx`. | `BrushStudioPanelContainer.tsx:26-35` (the pixel panel's sections do not apply; its markup is private) and `:76-93` (a second capitalised component in this file trips `react-refresh/only-export-components`, measured, with no precedent for a disable comment anywhere in `containers/`). | 03 |
| **D9** | **No wire-format change.** Nothing under `client/src/types/` or `client/src/types/codecs/` is touched by any task. `BrushUIStore` stays unpersisted. | `studioMode` IS persisted and appears in all 11 corpus fixtures; the corpus snapshots must come out **unchanged**. `BrushUIStore.ts:14-19`: no `hydrate`, unknown to `toPersistedUIState()`. Keeping it that way keeps this plan clear of `CLAUDE.md`'s highest-severity rule. | all |
| **D10** | The brush studio's **Delta picker is never gated on a tool.** | It is the studio's colour picker; a user needs it for every painting tool. Currently ungated at `BrushStudioPanelContainer.tsx:168-202`. | 03 |
| **D11** | Other Hand Mode (`containers/otherHand/*`) is **not extended**. | Separate surface, separate widget model, needs tablet manual checks. Out of scope. | all |

---

## 4. Ground truth

Measured on `main @ 96e0284`, 2026-09-27. Clean tree. No `REFRESH/` directory exists — the
38-task structural refresh described in `CLAUDE.md` has **completed and been removed**; the
codebase is uniformly MobX + `ui/`/`containers/` + BEM in every file this plan touches.
There is no Zustand in any of them. (`client/src/store/` still exists and
`ColorPickerContainer.tsx` documents a resolved Zustand hybrid at `:71-92`, but no task here
goes near it.)

### The bug, exactly

| Fact | Evidence |
| --- | --- |
| The brush studio **does** mount the Tool Options container | `BrushStudioContainer.tsx:96` → `rightControls={<RightSidebarTopControlsContainer />}` |
| …and it is suppressed wholesale | `RightSidebarTopControlsContainer.tsx:76` → `isPixelMode={lightingUI.studioMode === "pixel"}` (exact match, deliberate per its comment) |
| …because all seven sections AND the panel wrapper are gated on it | `RightSidebarTopControls.tsx:111-119` (seven predicates) and `:122-130` (`showToolOptions`) |
| The component's own header comment is **stale** | `:21` claims `studioMode !== "lighting"`; the container passes the stricter `=== "pixel"`. Task 02 replaces it. |

### Which pixel tool-options controls the brush studio actually honours

| Control | Brush studio | Evidence |
| --- | --- | --- |
| `fill-square` size | **live** | `BrushCanvasContainer.tsx:159` reads `tool.brushSize`; `brushToolContext.ts:664-670` `squarePixelsAt` uses `pencilBrushSize` |
| shape mode | **live** | `BrushCanvasContainer.tsx:163`, threaded `:276`, `:306` |
| border radius | **live** | `BrushCanvasContainer.tsx:164`, threaded `:277`, `:307` |
| gaussian smoothing / radius | **dead** | `brushToolContext.ts:670-671`: `floodFillAt: fillAt, gaussianFillAt: fillAt` — gaussian IS flood on a delta grid. `grep -n gaussianFill client/src/containers/BrushCanvasContainer.tsx` → no matches |
| move "all layers" | **dead** | `grep -n moveAll client/src/containers/BrushCanvasContainer.tsx` → no matches |
| selection mode / behaviour / expand / shrink | **dead** | brush mask is React state (`useBrushSelection.ts:142`), rectangle-only (`brushSelection.ts:17-18`), no modes (`grep -n 'selectionMode\|selectionBehavior' client/src/containers/brush/brushSelection.ts` → no matches) |
| reference-trace nudge | **dead** | `reference-trace` ∈ `BRUSH_INERT_TOOLS` and already hidden (`PixelStudioToolsContainer.tsx:30-35`) |

### The studio / rail composition

- `AppContainer.tsx:80-93` `renderStudio(mode)` → `PixelStudioContainer` /
  `LightingStudioContainer` / `BrushStudioContainer`; called `:129`.
- All three studios mount the **same** `ToolbarContainer` and the **same**
  `RightSidebarTopControlsContainer`; they differ in `studioPanel`.
- `Toolbar.tsx:107-124` `toolsForStudio`: `"brush"` returns `pixelStudioTools` — the brush
  studio literally shares the pixel tool strip, minus `BRUSH_HIDDEN_TOOLS`
  (`PixelStudioToolsContainer.tsx:30-35`, `:94`).
- Rails: pixel → `PixelStudioPanelContainer` → `PixelStudioPanel` (Origin / Pencil / Eraser /
  Reflection / Pose / Brush sections, then an **ungated** ColorPicker + PaletteManager,
  `PixelStudioPanel.tsx:200-205`, `:392-393`). Brush → `BrushStudioPanelContainer` (Delta,
  ungated; Pencil; Eraser — `:163-164`, `:168-224`). Lighting →
  `LightingStudioPanelContainer` (two sections, no colour picker).

### `studioMode` is persisted — the data-safety line

`types/domain.ts:483` `StudioMode = "pixel" | "lighting" | "brush"`; the field is
**required** on `UIState` (`:209`) and flows through `UIStore.ts:138`/`:450`/`:752`,
`codecs/compactTypes.ts:137`, `codecs/deserialize.ts:200`,
`codecs/migrate.ts:73` (its *absence* is a migration probe) and
`services/migrations/index.ts:114`. It appears in all 11 corpus fixtures under
`client/src/test/__fixtures__/corpus/`.

**No task in this plan touches any of those files.** Every new field is session-only. The
corpus snapshots must emerge unchanged, and each task's Verification says to STOP rather than
update one.

`setStudioMode` also writes `selectedTool` (`LightingUIStore.ts:193-196`:
`"lighting" → "normal-pencil"`, everything else `→ "pixel"`). **Every test fixture must set
the studio first and the tool second**, or it silently tests the pencil. Flagged in tasks 02,
04 and 05.

### Tests, stories and the gate — all confirmed to run

Verified by execution on `main @ 96e0284`:

- `cd client && bunx tsc --noEmit` → exit 0.
- `cd client && bun scripts/check-boundaries.mjs` → `check-boundaries: OK — all 5 boundary
  rules hold.`
- `bun run verify` = `typecheck && lint && format:check && test && build` (root
  `package.json`). Sub-scripts: `bunx vitest run`, `eslint .`, `stylelint "src/**/*.css"`,
  `storybook build` — all present in `client/package.json`.
- `cd client && bunx eslint src/ui/components/RightSidebarTopControls` → exit 0.
- `cd client && bunx stylelint "src/ui/components/RightSidebarTopControls/**/*.css"` → exit 0
  with **3 pre-existing warnings** (0 errors): `selector-max-compound-selectors` at
  `RightSidebarTopControls.css:132`, `:139`, `:153`, all on the `__toggle input:checked …`
  descendant chains. **These are the baseline, not your doing.** Do not "fix" them — that is
  an unrelated CSS refactor outside every task's `Touches`. Report them as unchanged.
- No lockfile exists at the baseline (`find . -maxdepth 2 -name 'bun.lock*' | grep -v
  node_modules` → empty).

Existing suites this plan extends: `containers/__tests__/BrushStudioPanelContainer.dom.test.tsx`
(179 lines, pins four delta-slot behaviours (a)–(d)),
`stores/ui/__tests__/BrushUIStore.test.ts`,
`containers/brush/__tests__/useBrushSelection.dom.test.ts`.

**There is no existing dom test for `RightSidebarTopControls` or its container.** Those files
are new in task 02. `RightSidebarTopControls.stories.tsx` and
`SelectionControls.stories.tsx` do exist. `ColorPicker` has no stories file.

---

## 5. Wave table

| Wave | Tasks | Parallelism | Gate that must exit 0 before the next wave |
| --- | --- | --- | --- |
| **W1** | `01` | 1 agent | `cd client && bunx tsc --noEmit` · `bunx vitest run src/ui/components/RightSidebarTopControls` · `bunx eslint src/ui/components/RightSidebarTopControls` · `bun scripts/check-boundaries.mjs` |
| **W2** | `02`, `03` | **2 agents** | `cd client && bunx tsc --noEmit` · `bunx vitest run` (full) · `bunx eslint .` · `bunx stylelint "src/**/*.css"` · `bun scripts/check-boundaries.mjs` · no lockfile · **no snapshot updated** |
| **W3** | `04` | 1 agent | same as W2 |
| **W4** | `05` | 1 agent | `bun run verify` (full gate, all five stages) · `bun scripts/check-boundaries.mjs` · no lockfile · **no snapshot updated** |

After **every** wave: `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` must print
nothing (`CLAUDE.md`: `bunx` can recreate a lockfile as a side effect).

---

## 6. Dependency graph

```
01  (capability table, pure ui/)
 ├── 02  (RightSidebarTopControls + its container)
 │    └── 04  (brush selection summary → the rail)
 └── 03  (brush rail tool sections)

02, 03, 04 ──> 05  (hide inert tools, ARCHITECTURE.md, final gate)
```

| Task | Depends on |
| --- | --- |
| 01 | none |
| 02 | 01 |
| 03 | 01 |
| 04 | 02 |
| 05 | 02, 03, 04 |

Task 04 depends on 02 because it fills in the `selectionSummary` seam and the placeholder
comment that 02 creates in `RightSidebarTopControlsContainer.tsx`.

---

## 7. Collision matrix

Only **W2** has two tasks. Their `Touches` side by side:

| Task 02 | Task 03 |
| --- | --- |
| `ui/components/RightSidebarTopControls/RightSidebarTopControls.tsx` | — |
| `ui/components/RightSidebarTopControls/RightSidebarTopControls.stories.tsx` | — |
| `ui/components/RightSidebarTopControls/SelectionControls.tsx` | — |
| `ui/components/RightSidebarTopControls/SelectionControls.stories.tsx` | — |
| `ui/components/RightSidebarTopControls/__tests__/RightSidebarTopControls.dom.test.tsx` (new) | — |
| `containers/RightSidebarTopControlsContainer.tsx` | — |
| `containers/__tests__/RightSidebarTopControlsContainer.dom.test.tsx` (new) | — |
| — | `containers/BrushStudioPanelContainer.tsx` |
| — | `containers/__tests__/BrushStudioPanelContainer.dom.test.tsx` |

**Disjoint: 7 files vs 2 files, no overlap.** Both read task 01's
`toolConfigStudio.ts` (task 03 only for its type, if at all) and neither writes it — W1 has
already merged when W2 starts, so it is a read-only shared dependency, not a collision.

Neither task changes a store, so there is no shared-store write either. Task 03 explicitly
must not touch `RightSidebarTopControls*`; task 02 explicitly must not touch
`BrushStudioPanelContainer.tsx`. Both constraints are stated in the task files.

W1, W3 and W4 are single-task waves — no matrix needed.

**Cross-plan collision** (not within this plan): plan 14 task 12 touches
`BrushStudioPanelContainer.tsx`, its test, and `BrushCanvasContainer.tsx` — colliding with
this plan's tasks 03 and 04. See the banner at the top: do not run the two plans
concurrently.

---

## 8. Alignment guide

How to keep five fresh contexts building one coherent thing.

### Naming to hold

- The capability module is `toolConfigStudio.ts`; its exports are `ToolConfigStudio`,
  `ToolConfigCapability`, `studioSupports`. Do not rename to `studioCapabilities`,
  `toolStudioConfig` or similar — task 02 imports these exact names.
- The prop on `RightSidebarTopControls` is `studio`, not `studioMode` (it is a
  `ToolConfigStudio`, a `ui/`-local union, not the domain type) and not `mode`.
- Capability members are `brushSize`, `traceBrush`, `gaussianFill`, `shapeMode`,
  `borderRadius`, `moveAllLayers`, `selectionFull`, `selectionBasic` — exactly these strings.
- `SelectionControls`' new prop is `variant: "full" | "basic"`.
- `BrushUIStore`'s new fields are `selectionSummary` and `clearSelectionHandler`.

### Analogue files to imitate

| Building | Imitate | Why |
| --- | --- | --- |
| The pure capability data module | `ui/components/RightSidebarTopControls/brushOptions.ts` | A sibling pure data module in the same directory |
| A locally-declared twin of a domain/store type in `ui/` | `BrushDeltaPicker.tsx:58` (`BrushDeltaTarget`), `ui/canvas/pose/poseTypes.ts` (`PoseColor`) | The established way to stay inside the `ui/` boundary |
| An optional prop that gates a control | `ColorPicker.tsx:90-99` (`onSwapColors`), `BrushDeltaPicker.tsx:71-78` (`target` + `onTargetChange`) | "renders only when a caller supplies it, so it can never half-exist as a visible dead control" |
| A new rail section in the brush studio | `BrushStudioPanelContainer.tsx:94-151` (`renderStrokeControls`) | Lowercase render helper, composed from `ui/primitives/`, for the `react-refresh` reason at `:76-93` |
| Projecting store state to flat props, never a node | `RightSidebarTopControlsContainer.tsx:19-32`, `:60-67` | The `SelectionSummary` projection — the exact precedent for D5 |
| A real-store dom test harness | `containers/__tests__/BrushStudioPanelContainer.dom.test.tsx:26-60` | `new ApplicationStore({ autoSaveEnabled: false })`, `adoptProject(tinyProject())`, `app.dispose()` in `afterEach` |
| A store field that must not be deep-observed | `BrushUIStore.ts:143-144` (`selectedDelta`, `fillDelta` as `observable.ref`) | D5's declaration style |

### Boundaries that must not be crossed

1. **Nothing under `client/src/ui/` imports a store, the API, or MobX.** Task 01's module and
   task 02's component are both `ui/`. `check-boundaries.mjs` rule 1 + ESLint. If the rule
   seems not to fire, **run the probe** — task 01 requires proving it live with a temporary
   import, because a rule matching nothing looks exactly like a rule that passes.
2. **`observer()` only under `client/src/containers/`.** Rule 3.
3. **Never deep-observe a pixel grid.** `layer.pixels` and brush layer cells are
   `observable.ref`, always. D5's three-numbers rule is this rule applied to a mask `Set`.
4. **No wire-format change** (D9). If a task finds itself editing `client/src/types/**`, it
   has left scope. `studioMode` is persisted in 11 corpus fixtures; the snapshots must be
   unchanged.
5. **Never `vitest -u`.** Every snapshot diff in the migration or corpus suites is a change
   to the owner's real data and must be read by a human. A `PreToolUse` hook blocks the flag,
   but it only inspects Bash commands — treat it as a backstop.

### What "done" looks like, behaviourally

In the brush studio, selecting Rectangle shows Shape + Border radius; selecting Gaussian fill
shows **no** Tool Options panel at all (absent, not an empty panel with a header); selecting
Selection shows a live size/count and a Clear that clears the brush ants; the Delta picker is
present for every tool. In the pixel studio, nothing whatsoever has changed.

### What an executor is most likely to get wrong

1. **Flipping `isPixelMode` true for `"brush"`** instead of building the table. Result: four
   dead controls on screen — worse than the reported bug. D2 and §4 exist to stop this.
2. **Proposing the `ColorPicker` merge** because the request's fourth bullet asks for it
   literally. D1 locks it; task 03's Context has the six-axis incompatibility table. The
   request's *outcome* is already met by `BrushDeltaPicker`.
3. **Giving the reflection tool a brush-studio section.** It is inert; D6 hides it instead.
4. **Putting the selection mask `Set` on `BrushUIStore`.** D5; two independent reasons.
5. **Writing the store during render** in task 04 instead of from an effect — a StrictMode
   re-entrancy bug and a MobX warning. Task 04 requires checking the console explicitly.
6. **Forgetting the two-pane single-writer rule** in task 04. Two `BrushCanvasContainer`
   instances can be live; reuse `views.keyboardOwner === renderMode`.
7. **Setting `selectedTool` before `studioMode` in a test fixture.** `setStudioMode`
   overwrites the tool (`LightingUIStore.ts:193-196`). Flagged in three task files.
8. **Adding a capitalised component to `BrushStudioPanelContainer.tsx`** — `react-refresh`
   rejects it. D8; task 03 requires proving the rule is live.
9. **Adding the lighting tools to `BRUSH_HIDDEN_TOOLS`.** D7; they are not in that tool
   table.
10. **Updating a snapshot to make the gate green.** Never. STOP and report.

---

## 9. Risk register

| # | Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- |
| R1 | An executor enables the four unsupported capabilities for `"brush"`, shipping dead controls | **Med** | Med — a worse bug than the one fixed, and it looks like success | The table's rows carry their evidence as comments; task 01's tests assert the four are absent **and say why** in the test description; task 02 manual checks 2–3 look for absence | 01, 02 |
| R2 | An executor merges `ColorPicker` and `BrushDeltaPicker` per the request's literal wording | **Med** | **High** — a 945-line rewrite, the HSL-drift bug reopened, undo policy confusion | D1 locked with a six-axis table; task 03's Constraints forbid it outright; §8 trap 2 | 03 |
| R3 | Task 04's store write happens during render → StrictMode double-invoke / MobX warning | Med | Med — flicker or a thrown render | Task 04 mandates an effect with cleanup, and manual check 7 requires reading the console and reporting it | 04 |
| R4 | Both brush panes publish a selection summary → the rail flickers between them | Med | Med | Reuse the hook's existing `views.keyboardOwner === renderMode`, extracted to one named local used in both places; manual check 4 opens two panes deliberately | 04 |
| R5 | The mask `Set` ends up on the store → "MobX is slow" on a real project | Low | **High** — presents as a perf problem, diagnosed as a modelling error only later | D5; task 04 Constraints; the `observable.ref` assertion in its store test | 04 |
| R6 | A corpus or migration snapshot changes and is "fixed" with `-u` | Low | **Highest — the owner's real data** | D9: no task touches `types/**`; every task's Verification says STOP and report; task 04 adds a `grep` proving the new fields never reach `UIStore.ts` / `compactTypes.ts`; the `PreToolUse` hook is a backstop | all |
| R7 | Plan 14 executes concurrently and conflicts on `BrushStudioPanelContainer.tsx` / `BrushCanvasContainer.tsx` | Med | Med — merge conflict, re-gate | Top-of-file banner: do not run concurrently; whichever merges second rebases and re-runs its gate; record the order in `HANDOFF.md` | coordinator |
| R8 | The pixel studio regresses silently — a section stops rendering for a tool | Low | High — the owner's daily surface | Task 02 step 7 pins the pixel cases explicitly; task 02 manual check 4 and task 05 manual check 5 sweep every pixel tool by hand | 02, 05 |
| R9 | The `ui/` boundary rule appears to pass because it matches nothing | Low | Med | Task 01 requires the temporary-import experiment with both outputs pasted; task 03 requires the same for `react-refresh` | 01, 03 |
| R10 | Hiding Pose leaves its `P` hotkey selecting an inert tool with no rail | Med | Low — cosmetic, and pre-existing for `origin`/`brush` | Task 05 investigates and **records** it in Deviations rather than changing hotkey routing mid-plan | 05 |

---

## 10. Rules for every executor

From `CLAUDE.md`, the ones that bite in this plan:

1. **Bun only.** `node` and `npm` are not on PATH. Use `bun` / `bunx` everywhere.
2. **Never create a lockfile.** After any `bunx`, run
   `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` and delete anything it
   finds. Never remove `bunfig.toml`'s `save = false`. **Never use `--frozen-lockfile`** — it
   is meaningless here and a hook blocks it.
3. **Never break `bun run dev`.** If a change stops the app starting, fix it or revert before
   finishing.
4. **Never run `vitest -u`** or any snapshot-update flag. Every corpus/migration snapshot diff
   is the owner's real data and must be read by a human. This plan should change **none** of
   them; a diff means STOP and report.
5. **Never deep-observe a pixel grid.** `observable.ref`, always. This extends to a mask
   `Set` (D5).
6. **The `ui/` boundary.** Nothing under `client/src/ui/` imports a store, the API, or MobX.
   `observer()` only under `containers/`. **If a boundary rule seems not to fire, run the
   probe** — tasks 01 and 03 require proving their rules live.
7. **Stay inside your task's `Touches`.** The collision matrix is only valid if `Touches` is
   accurate. If you need a file that is not listed, STOP and report rather than widening.
8. **Commit at task granularity.** A formatting sweep, a strictness flag and a refactor are
   three commits. Each task file names its commits.
9. **Run the gate and paste the real output.** "It passes" is not a report.
10. **Do the manual checks.** Gesture behaviour, StrictMode semantics, stacking order and
    visual regressions are not automatable here. **A task whose manual checks were skipped is
    not done** — report each individually with what you actually saw.
11. **Report honestly, including partial completion.** Six of eight steps with the reasons
    stated beats a claim of success. If a verification fails and you cannot fix it, say so.

---

## 11. Task index

| NN | Title | Wave | Effort | Summary |
| --- | --- | --- | --- | --- |
| [01](./01-studio-tool-config-type.md) | The `ToolConfigStudio` type and capability table | W1 | S | One pure `ui/` module: which tool-option controls each studio can honour, as a table + `studioSupports`, with the measured evidence per row |
| [02](./02-right-sidebar-studio-prop.md) | `RightSidebarTopControls` takes a studio, not a boolean | W2 | M | Replace `isPixelMode` with `studio` + the capability gate; `SelectionControls` gains a `"basic"` variant; the brush studio gains shape / radius / fill-square size; pixel studio pinned unchanged |
| [03](./03-brush-rail-tool-sections.md) | The brush rail shows the selected tool's own section | W2 | M | Eyedropper and per-tool delta-slot readouts in `BrushStudioPanelContainer`; Delta picker stays ungated; the `ColorPicker` merge is explicitly refused |
| [04](./04-brush-selection-summary.md) | Publish the brush selection so its section is real | W3 | M | Three numbers + a clear callback on `BrushUIStore`, published from an effect by the keyboard-owning pane; the rail's selection section goes live |
| [05](./05-hide-inert-tools-docs-gate.md) | Hide the inert tools, document the seam, final gate | W4 | S | `reflection` + `pose` into `BRUSH_HIDDEN_TOOLS`; `ARCHITECTURE.md` gains the per-studio tool-config map; `bun run verify` run and pasted; QA ledger closed |
