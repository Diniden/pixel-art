# 07 — The Pose rail section and drag orbs

**Wave:** W2 · **Depends on:** 01, 02
**Touches:** `client/src/ui/components/PosePanel/PoseSection.tsx` (new) · `client/src/ui/components/PosePanel/DirectionOrb.tsx` (new) · `client/src/ui/components/PosePanel/PosePanel.css` (new) · `client/src/ui/components/PosePanel/PoseSection.stories.tsx` (new) · `client/src/ui/components/PosePanel/__tests__/PoseSection.dom.test.tsx` (new) · `client/src/ui/components/PosePanel/__tests__/DirectionOrb.dom.test.tsx` (new) · `client/src/ui/components/PixelStudioPanel/PixelStudioPanel.tsx` · `client/src/containers/PixelStudioPanelContainer.tsx`
**Effort:** L

## Objective

Selecting the Pose tool makes the right rail adopt a **Pose** section containing: mesh
buttons (Cube / Sphere / Cylinder / Mannequin), framing buttons (Full / Head / Torso / Arm /
Leg / Hand), two draggable orbs (light direction and model rotation), viewpoint snap buttons,
light and model colour pickers, and camera controls (projection toggle, preset buttons, zoom,
FOV). Every control reads and writes `app.pose`. Nothing renders on the canvas yet — task 08
does that.

## Context

### How a tool "adopts the side rail" — the exact mechanism

There are two panels in the right rail; **you want the second**.

`PixelStudioPanel` (`client/src/ui/components/PixelStudioPanel/PixelStudioPanel.tsx`) gates
sections on the selected tool with plain booleans at `:139-142`:

```ts
const showEraserControls     = selectedTool === "eraser";
const showPencilControls     = selectedTool === "pixel";
const showOriginControls     = selectedTool === "origin";
const showReflectionControls = selectedTool === "reflection" && !!reflection;
```

**The Reflection section is your template**, in all three of its pieces:

1. **The pure component** — `PixelStudioPanel/ReflectionLinesSection.tsx`. Props in,
   callbacks out, imports no store and no MobX.
2. **The mount** — `PixelStudioPanel.tsx:272-284`. Note the props arrive as **ONE optional
   grouped object**, `reflection?: ReflectionLinesSectionProps` (declared `:118` with the
   rationale at `:108-117`): every existing caller and story predates the tool, so a
   required prop — or eight — would break them all at compile time for a section they never
   render. **Do exactly the same**: add `pose?: PoseSectionProps`, one optional prop.
3. **The wiring** — `containers/PixelStudioPanelContainer.tsx:79-98`, which reads the store
   and maps it to plain props.

Render your section inside the same wrapper shape the reflection block uses — `.panel` +
`.panel__header--compact` with a `.panel__title`, the `OtherHandButton` when `onOtherHand`
is present, and `.panel__body--dense`.

### Boundary rules (non-negotiable)

- **Nothing under `client/src/ui/` may import a store, the API, `services/`, MobX, or call
  `useContext`** — type-only imports included. `PoseSection` and `DirectionOrb` take props
  and emit callbacks. Enforced by `bun run lint:boundaries` and ESLint.
- **`observer()` only in `containers/`.** `PixelStudioPanelContainer` is already an observer;
  extend it, do not create a second one.
- Do not import `PoseUIStore`'s types into `ui/`. Declare the section's prop types
  structurally in `PoseSection.tsx` (the same pattern task 02 and 03 use in the other
  direction). Task 06's `poseTypes.ts` already declares the unions and **is** under `ui/`,
  so importing from there is fine and preferred.

### `DirectionOrb` (MASTER D13)

One reusable pure component, used **twice** — light direction and model rotation. Requirements:

- Renders an SVG sphere with a draggable handle indicating the current direction.
- Props: a current `{x, y, z}`-ish value, an `onChange`, a `label`, and a `disabled` flag.
- **Mouse and touch both.** Use `pointerdown` / `pointermove` / `pointerup` with
  `setPointerCapture` so a drag that leaves the orb keeps tracking. Touch is a first-class
  input on this project (the owner uses an iPad); a mouse-only orb is a failed task.
- Dragging maps 2D movement to yaw/pitch. Document the mapping.
- ⚠️ **`touch-action: none`** on the orb, or the browser will scroll the rail instead of
  dragging.
- It owns **no** store and **no** app state beyond its own in-drag bookkeeping.

The two orbs differ only in what their value means, so keep the component generic and let
the caller interpret. The rotation orb should also be settable by the viewpoint buttons, so
its value is fully controlled by props — no internal source of truth.

### The controls to build

| Group | Controls | Store field |
| --- | --- | --- |
| Model | Cube · Sphere · Cylinder · Mannequin | `meshId` via `setMesh` |
| Framing | Full · Head · Torso · Arm · Leg · Hand | `framing` via `setFraming` |
| Rotation | `DirectionOrb` + Front/Back/Left/Right/Top/Bottom/¾ buttons | `rotation` via `setRotation` |
| Light | `DirectionOrb` + colour input | `lightDirection`, `lightColor` |
| Model colour | colour input | `modelColor` |
| Camera | Perspective/Orthographic toggle; preset buttons 2D · 2.5D · Iso · Top-down · Oblique; zoom slider; FOV slider | `projection`, `cameraPreset`, `zoom`, `fov` |

- The framing buttons are only meaningful for the mannequin — **disable them** for
  primitives rather than hiding them, so the layout does not jump.
- The **FOV slider is only meaningful in perspective** — disable it in orthographic.
- The viewpoint rotations and camera presets come from task 06's `poseCamera.ts`. **Import
  them; do not re-declare the angles.** Two sources of truth for the isometric angle is a
  guaranteed drift.
- Follow the existing button-row idiom: `pixel-studio-panel__shape-buttons` /
  `__shape-btn` / `__shape-btn--active` is the established pattern for a row of small
  toggle buttons — mirror its structure under your own `pose-panel` BEM block.

### CSS

BEM block **`pose-panel`**, plus **`direction-orb`** for the orb. Use tokens from
`styles/tokens.css` — **no colour literals, no numeric `z-index`, no `!important`**.
⚠️ The stylelint baseline is **exactly 2 pre-existing errors**; your CSS must not raise it.
Note the existing constraints the linter enforces: max 2 class compounds, no type selectors,
declaration-strict-value on colours.

## Steps

1. Create `client/src/ui/components/PosePanel/DirectionOrb.tsx` — the pure, pointer-captured,
   touch-capable orb, with its `direction-orb` styles in `PosePanel.css`.
2. Write `__tests__/DirectionOrb.dom.test.tsx`: renders; a `pointerdown` + `pointermove`
   emits `onChange` with a changed value; `disabled` suppresses `onChange`; the handle
   position reflects the incoming value (controlled, not internal).
3. Create `PoseSection.tsx` with `PoseSectionProps` covering every control above, importing
   the preset/viewpoint tables from `ui/canvas/pose/poseCamera.ts`. All state arrives as
   props; every interaction calls a callback.
4. Write `PosePanel.css` with the `pose-panel` and `direction-orb` blocks, tokens only.
5. Write `PoseSection.stories.tsx` — at minimum: no mesh selected, a primitive selected
   (framing disabled), the mannequin selected (framing enabled), and orthographic (FOV
   disabled).
6. Write `__tests__/PoseSection.dom.test.tsx`: each mesh button calls `onSelectMesh` with the
   right id; framing buttons are disabled for primitives and enabled for the mannequin; the
   FOV slider is disabled in orthographic; each camera preset button calls
   `onSelectCameraPreset`; each viewpoint button calls `onSetRotation` with the angles from
   `poseCamera.ts`.
7. Mount it in `PixelStudioPanel.tsx`: add `pose?: PoseSectionProps` as **one optional
   grouped prop** (documented like `reflection?`), add
   `const showPoseControls = selectedTool === "pose" && !!pose;`, and render the section
   inside the standard `.panel` wrapper with an `OtherHandButton` when `onOtherHand` is
   present.
8. Wire it in `PixelStudioPanelContainer.tsx`: read `app.pose`, build the `pose` prop object,
   and pass it. Keep the container's existing structure — it is already an `observer`.
9. Run the full verification. **Commit after step 9**:
   `feat(pose): the pose rail section with drag orbs and camera controls`.

## Constraints

- **No store / MobX / API / `services/` / `useContext` import under `ui/`.** The two new
  components are pure.
- **`observer()` only in the container**, which already exists — do not add another.
- The `pose` prop on `PixelStudioPanel` **must be optional and grouped**. Do not add eight
  flat required props; that breaks every existing caller and story.
- Do not re-declare camera preset or viewpoint angles — import them from task 06.
- The orbs **must work on touch**, with `setPointerCapture` and `touch-action: none`.
- No colour literals, no `!important`, no numeric `z-index`. Stylelint must stay at 2 errors.
- Do not render anything on the canvas and do not touch `CanvasContainer.tsx`,
  `CanvasSurface.tsx`, or any `ui/canvas/pose/` file. Task 08 connects this to the render.
- Do not add pose to `containers/otherHand/toolWidgets.ts` — out of scope, as for reflection.

## Verification

From `client/`:

```sh
bunx tsc --noEmit                                   # exit 0
bunx eslint .                                       # 0 errors
bunx vitest run                                     # all pass, incl. both new dom tests
bun run lint:boundaries                             # OK — the critical check for this task
bunx stylelint "src/**/*.css"                       # EXACTLY 2 errors
bunx storybook build                                # succeeds
```

From the repo root:

```sh
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules    # nothing
```

**Manual checks (not optional):**

1. `bun run dev`; select the Pose tool. The right rail shows the **Pose** section; selecting
   Pencil or Eraser shows their sections instead and the Pose section disappears.
2. Every button and slider is reachable and visibly reflects state (active styling on the
   selected mesh, preset and projection).
3. **Drag both orbs with a mouse** — the handle follows, and keeps following when the cursor
   leaves the orb (this is the `setPointerCapture` check).
4. **Drag both orbs by touch** (device or devtools touch emulation) — the rail must **not**
   scroll while dragging.
5. Framing buttons are disabled for primitives and enabled for the mannequin; the FOV slider
   is disabled in orthographic.
6. Clicking a viewpoint button visibly moves the rotation orb's handle.
7. The colour inputs change their swatches.
8. Switch projects — the section resets to defaults (proving task 02's `clear()` reaction).
9. The rail layout is not broken at a narrow width, and the section scrolls if it overflows.

## Definition of done

- [ ] `DirectionOrb` is pure, fully controlled, pointer-captured, and works on mouse **and**
      touch with `touch-action: none`.
- [ ] `PoseSection` renders all six control groups, importing preset/viewpoint angles from
      `poseCamera.ts` rather than re-declaring them.
- [ ] Framing is disabled for primitives; FOV is disabled in orthographic.
- [ ] `PixelStudioPanel` gains **one optional grouped** `pose?: PoseSectionProps` prop and
      renders the section only when the pose tool is selected.
- [ ] `PixelStudioPanelContainer` wires `app.pose` to it; no new `observer()` was created.
- [ ] Stories cover no-mesh, primitive, mannequin and orthographic states.
- [ ] Both DOM test files pass, covering the cases listed in the Steps.
- [ ] `bun run lint:boundaries` OK; stylelint **exactly 2** errors; storybook builds.
- [ ] All 9 manual checks performed and recorded.
- [ ] One commit, containing only this task's hunks.
