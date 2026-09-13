# 06 — Advanced camera mode: exact projection values

**Wave:** W5 · **Depends on:** 03, 05
**Touches:** `client/src/ui/components/PosePanel/CameraAdvanced.tsx` (new) · `client/src/ui/components/PosePanel/__tests__/CameraAdvanced.dom.test.tsx` (new) · `client/src/ui/components/PosePanel/CameraAdvanced.stories.tsx` (new) · `client/src/ui/components/PosePanel/PosePanel.css`
**Effort:** M

## Objective

A pure, self-contained **advanced camera** control: numeric fields for the exact projection
values, so the owner can type a frustum instead of dragging toward one. It is a presentational
component — props in, callbacks out — that task 08 mounts and wires.

## Context

**The owner's words:** *"I want a camera advanced mode that lets me put EXACT values for the
camer'a projection matrix and then save that matrix into a preset I can select."*

**⚠️ F16 — "projection matrix" means the projection FIELDS, not 16 raw floats.** This is a real
constraint, not a simplification. `applyCameraParams` (`poseCamera.ts:476-497`) writes camera
*fields* and then calls `camera.updateProjectionMatrix()` at `:496`, which **rebuilds the matrix
from those fields** — so a hand-entered matrix would be overwritten on the next frame. Exposing
the fields is the only shape that actually round-trips.

**The fields to expose** — exactly what `PoseCameraParams` (`poseCamera.ts:223-238`) carries:

| Projection | Fields |
| --- | --- |
| both | `near`, `far` |
| orthographic | `left`, `right`, `top`, `bottom` |
| perspective | `fov` (degrees), `aspect` |

⚠️ **Show the fields for the *current* projection only.** Showing perspective `fov` while an
orthographic camera is active invites the owner to type a value that does nothing.

**The saving half is task 08's**, not yours. You ship the *editing* surface plus an
`onSaveAsPreset` callback; task 08 mounts you and persists the result. Do not build storage here.

**⚠️ Constraint discipline that must be surfaced, not hidden:**

- `far > near` must hold, and `near > 0` for a perspective camera (three requires it).
  `fitCameraToMesh` derives `far` from `near` at `:411-415` precisely so this cannot break.
- `left < right` and `bottom < top` for orthographic.
- A degenerate frustum (`left === right`) collapses the projection.

**Do not silently clamp a typed value into legality** — the owner typed it on purpose. Show the
field as invalid and **do not emit** until it is valid, or emit and let the container reject.
**Decide, document, and be consistent.** Silent clamping in a control whose entire purpose is
"exact values" is the worst option.

**Boundary — this file is under `client/src/ui/`:** no store, no API, no `services/`, no MobX, no
`useContext`, **type-only imports included**. Props in, callbacks out. `observer()` is forbidden
here. Run `bun run lint:boundaries`.

**Prior art to copy:**

- The pure-rail-control shape: `DirectionOrb` and the edge-width slider in `PoseSection.tsx` —
  props in, callbacks out, no internal store knowledge.
- **The uncapped numeric-entry pattern**, added in plan 07 for the zoom box: an
  `<input type="number">` with no `max`, which **rejects empty/unparseable input rather than
  sending `0`**. ⚠️ That trap is measured and will bite you: an `<input type=number>` sanitizes
  garbage to `""`, and `Number("")` is **`0`, not `NaN`**, so a naive `Number.isFinite` guard
  passes zero straight through. Copy the existing guard.
- BEM + design tokens for CSS. ⚠️ **No numeric `z-index`; stylelint must stay at exactly 2
  errors** (`OtherHand.css:338`/`:359`, both pre-existing).

**Touch:** plan 07 recorded a confirmed iPad defect — `.pose-panel__slider` lacks
`touch-action: none` while `.direction-orb__sphere` (`PosePanel.css:257`) has it under a comment
calling it "THE TOUCH FIX, not a nicety". **Task 08 fixes that.** For your part: any new CSS you
add for numeric fields should not make it worse, and if you add a drag affordance it needs the
same line.

## Steps

1. Read `PoseSection.tsx` (the whole file — it is the sibling component and sets the house
   style), then `poseCamera.ts:223-238` and `:476-497`, then `PosePanel.css`.
2. **Design the props.** Something like:
   ```ts
   interface CameraAdvancedProps {
     projection: PoseProjection;
     near: number; far: number;
     orthographic?: { left; right; top; bottom };
     perspective?: { fov; aspect };
     onChange: (patch: Partial<...>) => void;
     onSaveAsPreset: (name: string) => void;
     onReset?: () => void;
   }
   ```
   Mirror `PoseCameraParams`' shape so nothing has to be translated twice. **Write the final
   shape in your report** — task 08 mounts this and must match it exactly.
3. **Render only the current projection's fields.** Both projections share `near`/`far`.
4. **Implement validation** per the Context: `far > near`, `near > 0` for perspective,
   `left < right`, `bottom < top`. Surface invalidity visibly (a modifier class + `aria-invalid`),
   and follow your documented emit-or-not rule.
5. **Copy the numeric-entry guard** from the existing zoom number box — reject `""` rather than
   coercing to `0`. **Test that specific case**; it is the one that silently breaks.
6. **Add a "save as preset" affordance** — a name field plus a button that calls
   `onSaveAsPreset(name)`. Trim the name; **no-op on empty** (the `layoutPresets`
   `saveCurrentAsPreset` precedent at `LayoutUIStore.ts:500-513` does exactly this).
   **You do not store anything.**
7. **Make it collapsible** — "advanced mode" implies it is not always on screen. Default
   collapsed so the 240 px rail is not overwhelmed. ⚠️ The rail is **240 px**; numeric field rows
   must fit without horizontal overflow. Storybook mounts at exactly that width — use it.
8. **Write stories** covering: orthographic, perspective, an invalid state, and collapsed.
9. **Write DOM tests**: fields render per projection; typing emits the right patch; empty input
   does not emit `0`; invalid combinations behave per your rule; save-preset trims and no-ops on
   empty; the collapse toggles.
10. **Check stylelint before committing** — compare the error count to **exactly 2**.
11. Commit.

## Constraints

- **Do not edit `PoseSection.tsx`.** Task 07 owns it this wave — editing it would collide.
  ⚠️ If you conclude you cannot avoid it, **STOP and report** rather than colliding.
- **Do not edit** any store, container, `poseCamera.ts`, or anything under `ui/canvas/`.
- **Do not implement preset storage or persistence** — task 08 owns that entirely.
- **Do not import a store, MobX, the API or `services/`** — type-only included. No `observer()`.
- **No numeric `z-index`; no new stylelint errors** — the count stays at exactly 2.
- Do not accept a raw 16-float matrix (F16) — and say why in the component's header, so the next
  reader does not "add the missing feature".

## Verification

From `client/`:

```sh
bunx tsc --noEmit                 # exit 0
bunx eslint .                     # 0 errors
bunx vitest run                   # all pass
bun run lint:boundaries           # OK — this is the rule most at risk here
bunx stylelint "src/**/*.css"     # EXACTLY 2 errors
bunx storybook build              # exit 0
```

Root: lockfile sweep after every `bunx`.

**Manual checks — you cannot perform these; list them as owed:**

1. The advanced panel opens and shows the right fields for the current projection.
2. Typing an exact `fov` / ortho box changes the view to exactly that (needs task 08's wiring).
3. An invalid `near`/`far` combination is visibly rejected and does not corrupt the view.
4. Layout at **240 px** — nothing overflows or wraps badly. (Reviewable in Storybook.)
5. Touch: the numeric fields are usable on the iPad and the rail does not scroll while typing.

## Definition of done

- [ ] `CameraAdvanced.tsx` exists, pure, no store/MobX/API imports, boundaries pass.
- [ ] Only the current projection's fields are shown; `near`/`far` shared.
- [ ] Validation implemented; the emit-or-reject rule is documented and consistent.
- [ ] The empty-input-is-not-zero guard is copied and **tested**.
- [ ] A save-as-preset callback exists (name trimmed, empty no-ops) — **storage is task 08's**.
- [ ] Collapsible, fits 240 px.
- [ ] Stories cover ortho, perspective, invalid, collapsed. DOM tests cover all of it.
- [ ] F16 explained in the component header (fields, not a raw matrix, and why).
- [ ] Stylelint exactly 2 errors. Gate green, no lockfile.
- [ ] The final prop shape is in the report for task 08 to mirror.
