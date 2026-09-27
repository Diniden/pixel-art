# 02 — `RightSidebarTopControls` takes a studio, not a boolean

**Wave:** W2 · **Depends on:** 01
**Touches:** `client/src/ui/components/RightSidebarTopControls/RightSidebarTopControls.tsx` · `client/src/ui/components/RightSidebarTopControls/RightSidebarTopControls.stories.tsx` · `client/src/ui/components/RightSidebarTopControls/SelectionControls.tsx` · `client/src/ui/components/RightSidebarTopControls/SelectionControls.stories.tsx` · `client/src/ui/components/RightSidebarTopControls/__tests__/RightSidebarTopControls.dom.test.tsx` (new) · `client/src/containers/RightSidebarTopControlsContainer.tsx` · `client/src/containers/__tests__/RightSidebarTopControlsContainer.dom.test.tsx` (new)

**Effort:** M

## Objective

After this task the Tool Options panel decides what to show from **`studio` + `selectedTool`**
through task 01's capability table, instead of from a single `isPixelMode` boolean. The
brush studio gains the tool-option sections it can honour — `fill-square` size, shape mode,
border radius, and a basic selection readout — and still shows nothing for the four controls
it cannot honour. The pixel studio's behaviour is **byte-for-byte unchanged**, and that is
the thing this task must prove, not merely intend.

## Context

### What changes

`client/src/ui/components/RightSidebarTopControls/RightSidebarTopControls.tsx:111-119`
currently reads:

```ts
const showBrushSize = isPixelMode && selectedTool === "fill-square";
// … six more, all `isPixelMode && …`
```

Each `isPixelMode &&` becomes `studioSupports(studio, "<capability>") &&`. The tool
conditions themselves do not change — they are correct and are what make the panel
tool-specific in the first place.

The selection row splits in two:

```ts
const showSelectionFull  = studioSupports(studio, "selectionFull")  && selectedTool === "selection";
const showSelectionBasic = studioSupports(studio, "selectionBasic") && selectedTool === "selection";
```

`showToolOptions` (`:122-130`) becomes the OR of all eight.

### `SelectionControls` grows a `variant`

`SelectionControls` (`client/src/ui/components/RightSidebarTopControls/SelectionControls.tsx`)
renders mode + behaviour + expand/shrink/clear. In the brush studio only the **summary and
Clear** are real (see task 01's Context table: the brush mask is rectangle-only React state
in `containers/brush/useBrushSelection.ts`, has no modes and no expand/shrink).

Add a `variant?: "full" | "basic"` prop, defaulting to `"full"` so **every existing caller
and story keeps its current output with no edit**. Under `"basic"`, render the summary and
the Clear button and nothing else. This is the same technique the codebase already uses for
optional UI: `BrushDeltaPicker.tsx:71-78` renders its tab row only when both `target` and
`onTargetChange` are supplied, and `ColorPicker.tsx:90-99` renders the swap button only when
`onSwapColors` is passed — "the control renders only when a caller supplies it, so it can
never half-exist as a visible dead control". Same rule, same reason.

⚠️ **Do not make the mode/behaviour props optional.** They stay required; `"basic"` simply
does not render them. Making them optional would let a `"full"` caller forget one and lose a
control silently — the exact failure those two headers warn about.

### The container

`client/src/containers/RightSidebarTopControlsContainer.tsx:76` currently passes
`isPixelMode={lightingUI.studioMode === "pixel"}`. It becomes
`studio={lightingUI.studioMode}` and gains `selectionVariant`.

⚠️ **The `selectionSummary` source must switch per studio, and it cannot be done from this
container alone.** `selectionUI.selection` (`:60-67`) is the **pixel** project's mask, sized
by `ApplicationStore.selectionDims`; `SelectionUIStore`'s own header states its geometry
helpers are module-private and every entry point replaces its observable. The brush
studio's mask is React state inside `useBrushSelection`, in a **different container**
(`BrushCanvasContainer`). So in brush mode this container must pass
`selectionSummary={null}` and leave the real brush readout to **task 04**, which publishes
the brush mask to a store this container can read. Until task 04 lands, brush mode shows the
selection panel's "no selection" state — which is honest, not broken.

Write that as a comment in the container, not as a silent `null`.

⚠️ **`selectionUI` must not be read at all in brush mode.** Reading `selection.bounds` in
brush mode would subscribe this `observer()` to the pixel project's selection while the user
is editing a brush, re-rendering the brush rail on every pixel-studio selection change.
Guard the read, do not just discard the result.

### The pattern to follow

`ui/` purity: this component may not import a store or MobX
(`client/scripts/check-boundaries.mjs` rule 1). `studio` arrives as a prop typed
`ToolConfigStudio` from task 01 — a local union, **not** the domain `StudioMode`. The
container passes `lightingUI.studioMode` into it; the two unions are structurally identical
so the assignment typechecks with no cast. If TypeScript demands a cast, you have got the
union wrong — fix the union, do not add `as`.

`observer()` stays in the container and only there (ESLint rule; `check-boundaries.mjs`
rule 3).

### Traps

- **The stale comment at `RightSidebarTopControls.tsx:21`** claims the gate is
  `studioMode !== "lighting"`. It is not, and never was in this file's shipped form — the
  container passes the stricter `=== "pixel"`. Replace that comment with an accurate
  description of the new capability gate. Do not preserve the false claim.
- The Zoom stepper note at `:24-30` is a standing "do not reintroduce" warning. Leave it.
- `frameTraceActive` forces the trace group on regardless of the tool (`:112-113`). That OR
  must stay inside the `studioSupports(studio, "traceBrush") &&` guard, so a live trace in
  the pixel studio still shows it and a brush studio never does.
- There is **no existing dom test** for either this component or its container. Both test
  files in `Touches` are new. Do not assume a suite exists to extend.

## Steps

1. `SelectionControls.tsx`: add `variant?: "full" | "basic"` (default `"full"`), documented
   with the reason and a pointer to the brush selection's real capabilities. Render the
   summary always; render mode + behaviour + expand/shrink only under `"full"`; render Clear
   in both. Add a `"basic"` story to `SelectionControls.stories.tsx` beside the existing
   ones.

2. `RightSidebarTopControls.tsx`:
   - replace the `isPixelMode: boolean` prop with `studio: ToolConfigStudio`, imported from
     `./toolConfigStudio`;
   - add `selectionVariant?: "full" | "basic"` (default `"full"`) and forward it;
   - rewrite `:111-119` to use `studioSupports`, splitting the selection row in two as in
     Context;
   - rewrite `showToolOptions` over all eight flags;
   - replace the stale header comment at `:21`; add a short block explaining that the gate
     is now per-capability and pointing at `toolConfigStudio.ts` for why the brush studio
     gets four of the eight.

3. Update `RightSidebarTopControls.stories.tsx`: every story that passed `isPixelMode` now
   passes `studio`. Add one story per studio (`pixel`, `brush`) with `selectedTool` set to
   `"rectangle"` so the difference is visible at a glance, and one `brush` + `"gaussian-fill"`
   story that must render an EMPTY panel.

4. Commit: `feat(16): gate tool options per studio capability`.

5. `RightSidebarTopControlsContainer.tsx`:
   - pass `studio={lightingUI.studioMode}` and
     `selectionVariant={lightingUI.studioMode === "brush" ? "basic" : "full"}`;
   - guard the `selectionUI` read so it is not touched in brush mode, passing
     `selectionSummary={null}` there, with the comment Context requires (why, and that task
     04 supplies the real one);
   - leave the expand/shrink/clear callbacks wired to `selectionUI` — under `"basic"` only
     Clear renders, and in brush mode task 04 re-points it.

6. Commit: `feat(16): wire studio into the tool-options container`.

7. New `__tests__/RightSidebarTopControls.dom.test.tsx`. Pin, as observed behaviour:
   - `studio="pixel"`, `selectedTool="rectangle"` → shape mode AND border radius present;
   - `studio="brush"`, `selectedTool="rectangle"` → shape mode AND border radius present
     (⭐ the discriminating case: this is the bug being fixed and it fails on `main`);
   - `studio="brush"`, `selectedTool="gaussian-fill"` → the whole panel absent (no
     "Tool Options" heading), because `gaussianFill` is unsupported there;
   - `studio="brush"`, `selectedTool="move"` → panel absent;
   - `studio="lighting"`, any tool → panel absent;
   - `studio="brush"`, `selectedTool="selection"` → summary + Clear present, mode and
     behaviour controls ABSENT;
   - `studio="pixel"`, `selectedTool="selection"` → mode and behaviour controls present.

8. New `__tests__/RightSidebarTopControlsContainer.dom.test.tsx`, over the REAL
   `ApplicationStore`, following the harness in
   `client/src/containers/__tests__/BrushStudioPanelContainer.dom.test.tsx:26-60`
   (`new ApplicationStore({ autoSaveEnabled: false })`, `adoptProject(tinyProject())`,
   `domain.loadState = "loaded"`, `lightingUI.setStudioMode(...)`, `app.dispose()` in
   `afterEach`). Pin:
   - in brush mode with `selectedTool="rectangle"`, the shape controls render;
   - in brush mode with `selectedTool="selection"`, no selection MODE control renders;
   - ⭐ in brush mode, setting a selection on `selectionUI` does NOT change this
     container's output — the discriminating case for the "never read the pixel mask in
     brush mode" rule.

   ⚠️ `setStudioMode` also writes `selectedTool` (`LightingUIStore.ts:193-196`:
   `"lighting" → "normal-pencil"`, everything else `→ "pixel"`). Set the studio FIRST, then
   the tool, or your fixture silently tests the pencil.

9. Commit: `test(16): pin per-studio tool-option gating`.

## Constraints

- **The pixel studio's rendered output must not change.** Prove it in step 7, not by eye.
- Do not touch `BrushControls.tsx`, `ShapeControls.tsx` or `brushOptions.ts`. Only
  `SelectionControls.tsx` needs a change, and only additively.
- Do not make `SelectionControls`' mode/behaviour props optional (see Context).
- Do not add `observer()` to any `ui/` file. Do not import a store into `ui/`.
- Do not wire the brush selection summary here — that is task 04. Leave it `null` with the
  comment.
- Do not touch `client/src/containers/BrushStudioPanelContainer.tsx` (task 03 owns it) or
  `client/src/containers/BrushCanvasContainer.tsx` (task 04 owns it).
- Do not rename `isPixelMode` by aliasing it (`const isPixelMode = studio === "pixel"`).
  That would reintroduce the wholesale gate this task exists to remove.

## Verification

```sh
cd client && bunx tsc --noEmit
cd client && bunx vitest run src/ui/components/RightSidebarTopControls src/containers/__tests__/RightSidebarTopControlsContainer.dom.test.tsx
cd client && bunx eslint src/ui/components/RightSidebarTopControls src/containers/RightSidebarTopControlsContainer.tsx
cd client && bunx stylelint "src/ui/components/RightSidebarTopControls/**/*.css"
cd client && bun scripts/check-boundaries.mjs
```

Then the whole suite, because this component is rendered by all three studios:

```sh
cd client && bunx vitest run
```

⚠️ **Never pass `-u` / the snapshot-update flag** (`CLAUDE.md`, highest-severity rule). If a
corpus or migration snapshot differs, STOP and report the diff — it means a wire-format
field moved and that is not this task's business.

⚠️ After any `bunx`, check no lockfile appeared (`CLAUDE.md`):

```sh
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules
```

Delete any it finds; do not commit one.

### Manual checks — NOT optional

`bun run dev`, then:

1. **Brush studio, rectangle tool.** Toolbar → Brush Studio; pick Rectangle. The right rail
   shows a **Tool Options** panel with Shape (outline/fill/both) and Border radius. Change
   Shape to "fill" and drag a rectangle on the brush canvas — the interior fills with the
   FILL delta, the outline does not. This proves the control is live, not decorative.
2. **Brush studio, gaussian-fill.** Pick Gaussian Fill. The Tool Options panel is **absent**
   (not empty-with-a-header — absent). Confirm the tool still fills on click.
3. **Brush studio, selection.** Pick Selection. The panel shows a summary and Clear, and NO
   mode or behaviour buttons.
4. **Pixel studio regression.** Return to the pixel studio and step through
   `fill-square`, `gaussian-fill`, `rectangle`, `ellipse`, `move`, `selection`,
   `reference-trace`. Each shows exactly what it showed before this change. Note any
   difference in your report as a failure.
5. **Lighting studio.** No Tool Options panel, as before.
6. **StrictMode.** The app runs under React 19 StrictMode; confirm switching studio →
   tool → studio does not double-render into a duplicated panel or throw.

Record each check as pass/fail with what you actually saw. `CLAUDE.md`: a task whose manual
checks were skipped is not done.

## Definition of done

- [ ] `isPixelMode` no longer exists anywhere in the directory
      (`grep -rn isPixelMode client/src` returns only unrelated hits, or none).
- [ ] All eight gates go through `studioSupports`.
- [ ] `SelectionControls` has a `variant` defaulting to `"full"`; no existing caller edited
      except the two in `Touches`.
- [ ] Container passes `studio` and never reads `selectionUI` in brush mode.
- [ ] Both new dom suites pass, including the three ⭐ discriminating cases.
- [ ] `bunx vitest run` (full suite) green, with NO snapshot updated.
- [ ] tsc, eslint, stylelint, boundary probe all exit 0 — real output pasted.
- [ ] No lockfile created.
- [ ] All six manual checks performed and reported individually.
- [ ] Three commits (steps 4, 6, 9).
