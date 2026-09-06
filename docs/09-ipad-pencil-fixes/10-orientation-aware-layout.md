# 10 — The iPad remembers a layout per orientation

**Wave:** W4 · **Depends on:** none (W4 to avoid the W2/W3 `UIStore.ts` and `toolWidgets.ts` traffic)
**Touches:** `client/src/stores/ui/LayoutUIStore.ts` · `client/src/ui/layout/deviceClass.ts` · `client/src/stores/ui/__tests__/orientationLayout.test.ts` (new)
**Effort:** M

## Objective

After this task, an iPad holds **two** saved rail layouts — one for portrait and one for
landscape — and rotating the device swaps between them live. Arranging the rails in
landscape no longer destroys the portrait arrangement.

## Context

### How layout persistence works today (measured 2026-09-06)

**Not localStorage.** Layout lives inside the project file, in `uiState`. `localStorage`
is used for exactly one thing in this codebase: seeding the theme
(`ui/theme/themes.ts:47, 57, 69`, applied at `main.tsx:16`); `LayoutUIStore.ts:32-39` and
`UIStore.ts:43-46` both explain the theme *moved out* of localStorage into the project.

**`client/src/stores/ui/LayoutUIStore.ts`** (573 lines) owns it:

| Field | Line | Persisted |
|---|---|---|
| `deviceClass: DeviceClass` — readonly, measured once at construction (`:281-282`) | 247 | no — it is the **key** |
| `railLayouts: { [deviceClass: string]: PersistedRailLayout }` | 254 | yes, conditional slot 45 |
| `theme` | 261 | yes, slot 46 |
| `layoutPresets: { [deviceClass: string]: PersistedLayoutPreset[] }` | 268 | yes, slot 46b |
| `layoutMode` | 271 | **no** — session only |
| `otherHandSection` | 279 | **no** — session only |

Helpers:
- `get layout(): RailLayout` — `:312-314`, `narrowLayout(this.railLayouts[this.deviceClass])`
- `private write(layout)` — `:322-327`,
  `{...this.railLayouts, [this.deviceClass]: widenLayout(layout)}`
- `toPersistedRailLayouts()` — `:551-554`, returns `undefined` when `railLayouts` is `{}`
- `toPersistedLayoutPresets()` — `:564-570`, same pattern
- `hydrate(ui)` — `:534-542`

The whole scheme already keys by an **arbitrary string** — `railLayouts` is
`{ [deviceClass: string]: … }`. That is the seam this task uses: **no wire-format shape
change is needed, only a richer key.**

### Why it is not orientation-aware, and the constraint that created it

`client/src/ui/layout/deviceClass.ts:46-75`:
```ts
/** Breakpoints, in CSS px of the SHORT edge — orientation must not reclassify. */
const PHONE_MAX_SHORT_EDGE = 480;
const TABLET_MAX_SHORT_EDGE = 900;
```
with the header at `:53-55`:
> *"Rotating an iPad must not move it between classes — that would swap the user's layout
> mid-session."*

That rule is **still right** and must be preserved: rotating must not turn a tablet into a
phone. This task adds orientation as a **separate dimension**, it does not make
`detectDeviceClass` orientation-sensitive.

`deviceClass` is measured once at construction (`:281-282`) and never re-read. There is no
resize or orientationchange listener anywhere; `matchMedia` appears in exactly two places
(`deviceClass.ts:63-64` and `ui/utils/pointerDevice.ts:40-42`), neither querying
orientation.

The only orientation awareness in the app is CSS, and it does not touch persisted state:
`OtherHand.css:276`, `CanvasSplit.css:47`, `Header.css:486`. `OtherHandSurface.tsx:22-30`
states that is deliberate: *"no measurement, no resize listener and no orientation
listener."* Your listener is for the **layout key**, not for rendering — do not add
orientation-driven rendering.

### ⚠️ The wire-format rule

`railLayouts` is one of the two **deliberate, owner-approved format extensions** described
at `UIStore.ts:539-547`, and it is safe only because it is conditional:

> "**neither key is emitted until the user changes something.** `railLayouts` is `{}` …
> on an untouched project, so `toPersistedRailLayouts()` … yields `undefined` and
> `assign` writes nothing. The corpus digests are unchanged BECAUSE of that."

Adding orientation to the **key** adds no new wire key and changes no existing project's
digest: an untouched project still has `railLayouts === {}`. A project already carrying
`railLayouts: { tablet: {...} }` must still load — see the migration step below.

### Traps

- **Do not change `PersistedRailLayout`'s shape** (`types/domain.ts:312-337`). Only the
  map key changes. This keeps `types/` out of `Touches` and out of the data-safety
  perimeter entirely.
- **Existing saved layouts must not be lost.** A project saved before this change has
  `railLayouts.tablet`. On hydrate, if the composite key is absent but the bare
  `deviceClass` key is present, seed **both** orientations from it. Do this in
  `hydrate` (`:534-542`), lazily — do **not** rewrite the map on load in a way that
  emits new keys for a project the user never touched, or you change its digest on next
  save. Prefer resolving the fallback in the `layout` **getter** (`:312-314`) rather than
  mutating `railLayouts` on hydrate. That is the safer of the two and the one you should
  take unless it proves impossible.
- **`deviceClass` is `readonly` and measured once.** Orientation is not — it must become
  an `observable` that a listener updates, so `get layout()` recomputes reactively. Adding
  a listener to a store means adding a disposer; check how `LayoutUIStore` handles other
  reactions/lifecycle and match it. If the store has no dispose path, bind the listener in
  the constructor and expose a `dispose()` the way MobX stores in this repo do — read
  `stores/session/AutoSaveController.ts` for the house pattern.
- **StrictMode double-invocation.** React 19 StrictMode mounts twice in dev; a listener
  added without a matching removal will double-fire. This is an explicit manual check.
- `layoutPresets` (slot 46b) is keyed the same way. Decide deliberately whether presets
  become per-orientation too. **Recommendation: leave `layoutPresets` keyed by
  `deviceClass` alone** — a preset is a user-named arrangement they may want in either
  orientation. Record the decision in `HANDOFF.md`.

## Steps

1. **`deviceClass.ts`** — add, without touching `detectDeviceClass`:
   ```ts
   export type Orientation = "portrait" | "landscape";

   /** ⚠️ Deliberately NOT folded into `detectDeviceClass`: rotating an iPad must
    *  not move it between device classes (see the note above). Orientation is a
    *  SECOND dimension of the layout key, not a redefinition of the first. */
   export function detectOrientation(): Orientation { … }

   /** The `railLayouts` map key. */
   export function layoutKey(deviceClass: DeviceClass, orientation: Orientation): string { … }
   ```
   Derive orientation from `window.matchMedia("(orientation: portrait)")` with an
   `innerWidth`/`innerHeight` fallback for jsdom. `layoutKey` should return
   `` `${deviceClass}:${orientation}` `` for tablets and phones, and **plain
   `deviceClass` for desktop** — a desktop window is resizable and does not have a
   meaningful orientation, and keeping `"desktop"` unchanged means no desktop user's saved
   layout moves. Document that choice in the function's comment.

2. **`LayoutUIStore.ts`** —
   - add `orientation: Orientation` as an `observable`, initialised from
     `detectOrientation()` in the constructor beside `deviceClass` (`:281-282`);
   - add a `matchMedia("(orientation: portrait)")` change listener (falling back to
     `resize`) that sets it, in an action, plus a disposer;
   - change `get layout()` (`:312-314`) to read
     `this.railLayouts[layoutKey(this.deviceClass, this.orientation)]`, **falling back to
     `this.railLayouts[this.deviceClass]`** when the composite key is absent — that
     fallback is the migration for already-saved layouts;
   - change `private write(layout)` (`:322-327`) to write the composite key.
   - Leave `toPersistedRailLayouts()` (`:551-554`) and `hydrate()` (`:534-542`)
     structurally unchanged — they pass the map through, and the map's keys are now
     richer. Confirm `toPersistedRailLayouts()` still returns `undefined` for `{}`.

3. **Commit** ("feat(ipad): rail layouts are saved per orientation").

4. **New test `client/src/stores/ui/__tests__/orientationLayout.test.ts`** — follow the
   conventions of the existing `stores/ui/__tests__/` suites. Cover:
   - `layoutKey("tablet", "portrait") === "tablet:portrait"`; `layoutKey("desktop", …) === "desktop"`;
   - writing a layout in portrait then switching to landscape yields the landscape layout,
     and switching back returns the portrait one **unchanged**;
   - a store hydrated from a legacy `{ tablet: {...} }` map resolves that layout in **both**
     orientations (the migration fallback);
   - once the user edits in landscape, the portrait layout is still the legacy one;
   - `toPersistedRailLayouts()` returns `undefined` for an untouched store;
   - the orientation listener is removed on dispose (assert `removeEventListener` was called).

5. **Commit** ("test(ipad): pin per-orientation layout persistence").

## Constraints

- **Do not change `detectDeviceClass`'s breakpoints or its short-edge logic.** Rotating
  must never reclassify the device.
- Do not change `PersistedRailLayout` in `types/domain.ts`; `types/` stays out of this diff.
- Do not add a new persisted wire key. Only the `railLayouts` map's **keys** change.
- Do not make `layoutPresets` per-orientation unless you record the decision and its
  reasoning; the recommendation is not to.
- Do not add orientation-driven **rendering** — the CSS media queries already handle that
  and `OtherHandSurface.tsx:22-30` explains why measurement is avoided.
- Do not deep-observe anything; `railLayouts` is a plain map replaced wholesale, as today.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art
bun run typecheck        # expect exit 0
bun run lint             # 0 errors; warnings ≤ 65
bun run test             # 0 failures — the corpus suite MUST pass unchanged
bun run build
```

**Manual checks — all require the iPad:**

1. In **landscape**, rearrange the rails (move a rail to a different slot, change a
   scale). Rotate to **portrait** → the portrait layout is whatever it was, **not** the
   landscape arrangement.
2. Rearrange in portrait. Rotate back to landscape → the landscape arrangement is intact.
3. Rotate back and forth several times → each orientation keeps its own layout with no
   drift.
4. Save the project, reload it, rotate → both layouts survived the round trip.
5. **Open a project saved before this change** → its single saved layout appears in both
   orientations, and editing one no longer clobbers the other.
6. On **desktop**, resize the window between wide and tall → the layout does **not** swap
   (desktop is not orientation-keyed).
7. **StrictMode**: run `bun run dev`, rotate → the layout swaps once, not twice, and no
   duplicate listener warning appears in the console.
8. Other-hand mode still positions correctly in both orientations (its CSS handles that;
   confirm nothing regressed).

## Definition of done

- [ ] `detectOrientation()` and `layoutKey()` exist in `deviceClass.ts`; `detectDeviceClass` is unchanged.
- [ ] `LayoutUIStore` holds an observable `orientation`, updates it from a media listener, and disposes that listener.
- [ ] `get layout()` reads the composite key and falls back to the bare `deviceClass` key.
- [ ] Desktop remains keyed by `deviceClass` alone.
- [ ] No new wire key; `toPersistedRailLayouts()` still returns `undefined` for an untouched store.
- [ ] The corpus suite passes unchanged; no `vitest -u` was run.
- [ ] `orientationLayout.test.ts` covers all six cases in step 4, including the legacy-map migration.
- [ ] `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build` all exit 0, real output pasted into `HANDOFF.md`.
- [ ] All eight manual checks performed and recorded, including the StrictMode check and the pre-existing-project check. No iPad ⇒ **PARTIAL**.
