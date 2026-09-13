# 07 — Exact Euler entry for the model's rotation and the light

**Wave:** W5 · **Depends on:** 03, 05
**Touches:** `client/src/ui/components/PosePanel/EulerInput.tsx` (new) · `client/src/ui/components/PosePanel/__tests__/EulerInput.dom.test.tsx` (new) · `client/src/ui/components/PosePanel/PoseSection.tsx` · `client/src/ui/components/PosePanel/__tests__/PoseSection.dom.test.tsx` · `client/src/ui/components/PosePanel/PoseSection.stories.tsx`
**Effort:** M

## Objective

The owner can **type exact angles** instead of only dragging an orb — for the model's rotation
and for the light's direction. Typing `45` does exactly what dragging to 45° does.

## Context

**The owner's words:** *"I want the light and rotation to also allow me to enter in the exact
euler angles I want to use for the rotation of the object."*

**F10 — the UI is in DEGREES, the store is in RADIANS.** The store stays the single source of
truth in radians; the component converts at its edge. Degrees are what the owner thinks in, and
what every other angle in this rail already displays.

### The model's rotation — straightforward

`rotation: PoseVector` on the store, Euler **XYZ radians**, three's default order. Applied as a
mesh transform at `CanvasContainer.tsx:2758` (`root.rotation.set(x, y, z)`), and set from the
panel via `onSetRotation` → `pose.setRotation` (`PoseUIStore.ts:412-414`, wholesale replacement).
The orb already drives it (`PoseSection.tsx:341-346`, `mode="euler"`). You are adding a second,
numeric way to write the same three numbers. **Round-trips exactly** — degrees → radians →
degrees is lossless enough for display at sensible precision.

### ⚠️ The light — NOT straightforward, and the spec's hardest decision

**F11.** The light is a **unit vector**, not Euler angles. Measured 2026-09-03:

- `lightDirection: PoseVector` at `PoseUIStore.ts:292` (`observableRef` `:344`), default `:141-143`.
- `setLightDirection` at `:417-419` **normalizes on write** (`normalizeVector` at `:234-238`,
  divides by `Math.hypot`).
- The engine uses it as a **position**, not a rotation: `keyLight.position.set(x,y,z)` with the
  target at the origin (`poseEngine.ts:355-367`).
- **There is no Euler representation of the light anywhere in the codebase today.**

So "exact Euler angles for the light" requires inventing a mapping, and **the inverse is not
unique**: a direction vector has 2 degrees of freedom, Euler angles have 3, so **roll is
unconstrained**. Converting vector → Euler → vector is stable, but Euler → vector → Euler is
**not**: the third angle is lost.

**F11 requires you to decide and document.** The two honest options:

1. **Store the typed angles alongside the vector.** The UI shows exactly what was typed and
   round-trips perfectly; the vector stays the thing the engine consumes. Cost: a second piece of
   state that can drift from the vector if the orb is dragged afterwards (you must define what
   happens then — recommended: dragging the orb **clears or recomputes** the stored angles).
2. **Derive angles from the vector every time** (e.g. yaw/pitch from spherical coordinates, roll
   fixed at 0). No extra state and no drift, but the owner types 3 numbers and gets 2 back —
   typing a roll does nothing visible, which is confusing unless the UI **only offers two
   fields**.

⚠️ **Option 2 with a two-field UI (azimuth + elevation) is the recommended default**: it is
honest about the actual degrees of freedom, cannot drift, and needs no new store field. If you
choose it, **label the fields for what they are**, not "Euler XYZ". If you choose option 1, you
need a store field — and `PoseUIStore.ts` is **NOT in your `Touches`**, so you must **stop and
report** rather than adding one.

**Whichever you choose: say so plainly in the report and in `HANDOFF.md`.** The owner asked for
"exact Euler angles" for both; delivering two fields for the light is a *reasoned* answer to an
under-determined request, but only if it is stated rather than quietly substituted.

**Where things live.** `PoseSection.tsx`: the orb at `:341-346` (`mode="euler"`, rotation) and
`:347-352` (`mode="direction"`, light); props `onSetRotation` `:152` and `onSetLightDirection`
`:153`; wired at `PixelStudioPanelContainer.tsx:180` and `:183`.

**Boundary — everything you touch is under `client/src/ui/`:** no store, API, `services/`, MobX
or `useContext`, **type-only included**. Props in, callbacks out. No `observer()`.

**Prior art:** the uncapped numeric-entry pattern from plan 07's zoom box. ⚠️ **The measured
trap:** an `<input type="number">` sanitizes garbage to `""`, and `Number("")` is **`0`, not
`NaN`** — so a naive `Number.isFinite` guard sends a real `0` mid-keystroke. Copy the existing
guard. For angles this is especially nasty: typing "-" then "9" would snap the model to 0 in
between.

## Steps

1. Read `PoseSection.tsx` in full, then `PoseUIStore.ts`'s rotation and light regions, then
   `poseCamera.ts:521-560` (`applyEulerXYZ` — the exact convention any conversion must match).
2. **Build `EulerInput.tsx`** — a pure, reusable numeric-angle control:
   - props: labelled axes, values in **degrees**, `onChange`, optional min/max per axis;
   - it does **not** know about rotation vs light — it is just "N labelled angle fields";
   - copy the empty-input guard; **never emit on unparseable input**;
   - normalise display (e.g. wrap to −180…180 or show one decimal) — **decide and document**;
   - it must be usable with **2 or 3 axes**, since the light may need only two.
3. **Wire it for the model's rotation** in `PoseSection.tsx`, beside the existing orb. Both write
   the same `onSetRotation`. Converting degrees → radians happens at the component edge (F10).
   ⚠️ **Dragging the orb must update the numeric fields live**, and typing must move the orb —
   they are two views of one value, not two values.
4. **Decide the light's representation** per F11. Implement it. If you pick option 2, offer
   **azimuth + elevation** and label them honestly. Convert to a vector by applying the same
   convention as `applyEulerXYZ` to a base axis, so it matches everything else.
   ⚠️ Remember `setLightDirection` **normalizes**, so magnitude is discarded — do not offer a
   "length" field.
5. **Handle the round-trip explicitly.** Write a test that takes the current light vector,
   renders the fields, and asserts the displayed numbers regenerate the **same vector** within an
   epsilon. If your chosen option cannot satisfy that, **that is the finding** — report it rather
   than shipping a control that silently mangles the light.
6. **Update the stories** so the numeric fields appear in the existing pose stories, at the real
   240 px rail width.
7. **Update the DOM tests**: typing a value emits the right radians; empty input emits nothing;
   the orb and the fields stay in sync; the light's fields round-trip.
8. Run the gate, then commit.

## Constraints

- **Do not edit `PosePanel.css`.** Task 06 owns it this wave. ⚠️ If you need a style, **stop and
  report**, or use existing classes.
- **Do not edit `PoseUIStore.ts`, any container, `poseCamera.ts`, or anything under `ui/canvas/`.**
  If option 1 for the light would need a new store field, **stop and report** — do not add it.
- **Do not change the light's normalization** or the fact that the engine treats the vector as a
  position.
- **Do not change `applyEulerXYZ`** — match it, do not modify it.
- **Do not import a store, MobX, the API or `services/`** — type-only included. No `observer()`.
- No numeric `z-index`; stylelint stays at exactly 2 errors.

## Verification

From `client/`:

```sh
bunx tsc --noEmit                 # exit 0
bunx eslint .                     # 0 errors
bunx vitest run                   # all pass
bun run lint:boundaries           # OK
bunx stylelint "src/**/*.css"     # EXACTLY 2 errors
bunx storybook build              # exit 0
```

Root: lockfile sweep after every `bunx`.

**Manual checks — you cannot perform these; list them as owed:**

1. Typing `45` into the model's Y rotation turns it exactly as dragging the orb to 45° does.
2. Dragging the orb updates the numeric fields **live**, and vice versa.
3. ⚠️ Typing a negative number or a partial value (`-`, `.`) does **not** snap the model to 0
   mid-keystroke. This is the measured trap.
4. The light's fields move the light as expected, and the values shown match the light's actual
   direction after dragging its orb.
5. Layout at **240 px** with the extra fields — nothing overflows. (Reviewable in Storybook.)
6. Touch: the fields are usable on the iPad; the rail does not scroll while typing.

## Definition of done

- [ ] `EulerInput.tsx` exists, pure, reusable for 2 or 3 axes, boundaries pass.
- [ ] Degrees in the UI, radians in the store (F10), converted at the component edge.
- [ ] The model's rotation has numeric entry, in sync with the orb both ways.
- [ ] **The light's representation decision (F11) is made, implemented and documented** — in the
      report and in `HANDOFF.md`.
- [ ] A round-trip test proves the light's displayed values regenerate the same vector (or the
      inability to is reported as a finding).
- [ ] The empty/partial-input guard is copied and **tested** — no mid-keystroke snap to 0.
- [ ] Stories and DOM tests updated; 240 px layout respected.
- [ ] Gate green, stylelint exactly 2 errors, no lockfile.
