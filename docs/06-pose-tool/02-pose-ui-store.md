# 02 — `PoseUIStore` + `ApplicationStore` wiring

**Wave:** W1 · **Depends on:** none
**Touches:** `client/src/stores/ui/PoseUIStore.ts` (new) · `client/src/stores/ui/__tests__/PoseUIStore.test.ts` (new) · `client/src/stores/ApplicationStore.ts`
**Effort:** M

## Objective

`app.pose` exists as a MobX store holding every piece of pose-tool state — selected mesh,
framing, rotation, light direction, light and model colours, camera projection/preset/zoom,
and pan offset — with actions to change each. It is **session-only**: nothing is persisted,
nothing is undoable, and it is cleared when a different project is installed. No UI reads it
yet.

## Context

**The analogue to copy is `client/src/stores/ui/ReflectionUIStore.ts`.** Read it in full
before starting. It is the most recent UI store and its doc header is the house style: an
explicit, boxed statement of what is *not* persisted, *not* in history, and *not* deep, plus
the lifetime rationale. Reproduce that structure for pose.

**Key patterns from it:**

- Fields that are replaced wholesale are `observableRef`, never `observable` — so no
  `PoseVector` or `Color` ever becomes a MobX proxy and readers can compare identity.
  Scalars (`zoom`, `fov`) are plain `observable`.
- `makeObservable(this, {...})` in the constructor lists every observable, computed and
  action explicitly.
- Actions replace values; they never mutate a held object field-by-field.

**Wiring in `client/src/stores/ApplicationStore.ts`** — follow the reflection hunks exactly:

| What | Line (reflection's) |
| --- | --- |
| import | `:66` |
| public field declaration | `:412` |
| construction | `:528` |
| `reaction` on `loadGeneration` → `clear()` | `:533-535` |
| disposal | `:1771` |

⚠️ **The clear hook must be a `reaction` on `DomainStore.loadGeneration`, NOT
`adoptProject()`.** `loadGeneration` is bumped once per *fresh install* (init / load /
create / switch / delete). `adoptProject()` also runs on **snapshot undo/redo**, so hooking
it would wipe the pose every time the user undoes. `ReflectionUIStore`'s header spells this
out; the same trap applies here.

⚠️ **Nothing here is persisted.** Do **not** add any key to `toPersistedUIState()`
(`stores/ui/UIStore.ts:345-512`). That builder is an explicit field-by-field list and
**absence from it is the mechanism** by which state stays session-only. Adding a key would
extend the wire format across the owner's 151 backup snapshots and change their digests.
`stores/ui/UIStore.ts` is **not** in your `Touches` list — that is deliberate.

**State to hold** (locked by MASTER D6, D13, D14; types named in the Alignment guide):

```ts
export type PoseMeshId = "cube" | "sphere" | "cylinder" | "mannequin";
export type PoseFraming = "full" | "head" | "torso" | "arm" | "leg" | "hand";
export type PoseProjection = "perspective" | "orthographic";
export type PoseCameraPreset = "2d" | "2.5d" | "iso" | "top-down" | "oblique";
export interface PoseVector { x: number; y: number; z: number }
```

| Field | Type | Kind | Default |
| --- | --- | --- | --- |
| `meshId` | `PoseMeshId \| null` | `observable` | `null` (no model loaded) |
| `framing` | `PoseFraming` | `observable` | `"full"` |
| `rotation` | `PoseVector` (euler radians) | `observableRef` | `{x:0,y:0,z:0}` |
| `lightDirection` | `PoseVector` (unit-ish) | `observableRef` | a sensible key-light, e.g. `{x:-0.5,y:0.7,z:1}` normalised |
| `lightColor` | `Color` | `observableRef` | white |
| `modelColor` | `Color` | `observableRef` | a mid grey |
| `projection` | `PoseProjection` | `observable` | `"perspective"` |
| `cameraPreset` | `PoseCameraPreset` | `observable` | `"2.5d"` |
| `zoom` | `number` | `observable` | `1` |
| `fov` | `number` | `observable` | `50` |
| `pan` | `{x:number;y:number}` (cells) | `observableRef` | `{x:0,y:0}` |

⚠️ **Declare `PoseVector` and the four id unions locally in this file**, structurally
identical to the ones task 03 declares in `ui/canvas/pose/poseTypes.ts`. `stores/**` may not
depend on a `ui/` module's landing order — `ReflectionUIStore` does exactly this for
`ReflectionLine` and documents why at its interface. Structural identity means no cast is
ever needed. `Color` **is** imported from `types/` — that is a domain type and is fine.

**Computed:** `hasMesh` (`meshId !== null`). Add others only if a consumer needs them.

**Actions:** one setter per field (`setMesh`, `setFraming`, `setRotation`, `setLightDirection`,
`setLightColor`, `setModelColor`, `setProjection`, `setCameraPreset`, `setZoom`, `setFov`,
`setPan`, `nudgePan`) plus `clear()`.

- `setMesh` must **reset `pan` to `{x:0,y:0}`** (MASTER D7: a mesh change resets pan;
  a resize preserves it) and reset `framing` to `"full"`.
- `setZoom` and `setFov` must **clamp** to sane ranges (e.g. zoom `0.1..10`, fov `10..120`)
  — `ToolUIStore.setGaussianFillParams` (`:403-415`) is the clamping precedent.
- `clear()` returns every field to its default, including `meshId = null`.

## Steps

1. Write `client/src/stores/ui/PoseUIStore.ts`, copying the structure and doc-comment
   discipline of `ReflectionUIStore.ts`. The header must state explicitly: not persisted,
   not in history, never schedules a save, `observableRef` contract, and the
   `loadGeneration` lifetime rationale.
2. Declare the local types (`PoseMeshId`, `PoseFraming`, `PoseProjection`,
   `PoseCameraPreset`, `PoseVector`) with the comment explaining why they are local rather
   than imported from `ui/`.
3. Implement the fields, `makeObservable` registration, the `hasMesh` computed, and every
   action, with clamping where specified.
4. Write `client/src/stores/ui/__tests__/PoseUIStore.test.ts` (unit lane, `*.test.ts`).
   Cover, at minimum: defaults; each setter; `setMesh` resetting pan and framing;
   `setZoom`/`setFov` clamping at both ends; `clear()` restoring every default; and an
   **identity assertion** that `setRotation` replaces the object rather than mutating it
   (`expect(store.rotation).not.toBe(previous)`).
5. Wire it into `client/src/stores/ApplicationStore.ts`: import, field, construct, the
   `reaction` on `app.domain.loadGeneration` calling `pose.clear()`, and disposal. Mirror
   the reflection hunks precisely.
6. Add a test asserting the `loadGeneration` reaction clears the store, following whatever
   pattern the existing reflection wiring test uses (search `stores/__tests__/` and
   `stores/ui/__tests__/` for `loadGeneration`).
7. Run the full verification. **Commit after step 7**, staging only your own hunks:
   `feat(pose): PoseUIStore — session-only pose state, cleared on project switch`.

## Constraints

- **Never add a key to `toPersistedUIState()`.** `stores/ui/UIStore.ts` is not yours to edit.
- **Never hook `adoptProject()`** for the clear — it runs on undo.
- Do not import anything from `client/src/ui/` into this store — declare the types locally.
- Do not deep-observe anything. Vectors and colours are `observableRef` and replaced
  wholesale.
- Do not record anything here in history. The store has no undo semantics; only the *stamp*
  (task 05/08) is undoable.
- ⚠️ **`ApplicationStore.ts` may be touched by the in-flight edge/fill work** — check
  `git diff` before staging and use `git add -p` to stage only your hunks.
- No UI, no container, no rendering. Task 07 consumes this store; task 08 drives it.

## Verification

From `client/`:

```sh
bunx tsc --noEmit                                   # exit 0
bunx eslint .                                       # 0 errors
bunx vitest run                                     # all pass, incl. your new tests
bun run lint:boundaries                             # OK — proves no ui/ import crept in
bunx stylelint "src/**/*.css"                       # exactly 2 errors (unchanged baseline)
```

From the repo root:

```sh
find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules    # nothing
```

**Corpus safety check (required — you touched `stores/`):** confirm the persisted-UI-state
and wire-format suites pass **unchanged**:

```sh
bunx vitest run src/stores/ui/__tests__/persistedUIState.test.ts src/stores/domain/__tests__/wireFormat.test.ts
```

Both must pass with **no snapshot updates**. **Never run `vitest -u`.**

**Manual checks:**

1. `bun run dev` starts and the app loads a project normally.
2. Switch projects, then undo several times — no console errors. (You cannot yet observe
   pose state from the UI; this check is that the new reaction has not destabilised loading.)

## Definition of done

- [ ] `stores/ui/PoseUIStore.ts` exists with all 11 fields, `hasMesh`, and every action.
- [ ] Its doc header states: not persisted, not in history, no save, `observableRef`
      contract, and the `loadGeneration` (not `adoptProject`) lifetime rationale.
- [ ] Local type declarations carry the "why not imported from `ui/`" comment.
- [ ] `setMesh` resets pan and framing; `setZoom`/`setFov` clamp.
- [ ] `PoseUIStore.test.ts` covers defaults, every setter, clamping, `clear()`, and a
      ref-identity assertion.
- [ ] `app.pose` is constructed, cleared on `loadGeneration`, and disposed in
      `ApplicationStore`.
- [ ] **No key added to `toPersistedUIState()`**; `persistedUIState` and `wireFormat`
      snapshots pass unchanged with no `-u`.
- [ ] Full gate green; no lockfile.
- [ ] One commit, containing only this task's hunks.
