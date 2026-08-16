# 27 — `LightingUIStore`, the lighting `PixelStore` paths, and the lighting consumers

**Wave:** W19 · **Depends on:** 26
**Touches:** `client/src/stores/ui/LightingUIStore.ts` (new) · `client/src/stores/domain/PixelStore.ts` · `client/src/stores/{ApplicationStore,bridge/zustandBridge}.ts` · `client/src/store/lightingActions.ts` · `client/src/components/Canvas/LightingCanvas.tsx` · `client/src/components/LightingStudioPanel/{LightingStudioPanel,LightControl,NormalPicker}.tsx` · `client/src/components/Toolbar/LightingStudioTools.tsx` · `client/src/containers/{LightingCanvasContainer,LightingStudioPanelContainer,LightControlContainer,NormalPickerContainer,LightingStudioToolsContainer}.tsx` (new) · `client/src/stores/ui/__tests__/LightingUIStore.test.ts` (new)
**Effort:** L

## Objective

After this task the lighting studio's 9 persisted settings live in `LightingUIStore`, normal/height painting and the flips live in `PixelStore`, and `computeNormalsForAllFrames` becomes a non-blocking `flow` outside the component that currently runs it. The 8 setters that never autosave are fixed **structurally** — under the save reaction, any observable in the persisted set triggers a save by construction.

## Context

`client/src/store/lightingActions.ts` is 1,036 lines: 15 actions, of which three are large algorithms and eight are trivial setters.

### `LightingUIStore` — 9 persisted fields

| Field | Kind | Source | Note |
| --- | --- | --- | --- |
| `studioMode` | `observable`, persisted | `lightingActions.ts:21` | `"pixel"` \| `"lighting"` — the top-level mode switch, read by `App`, `Toolbar`, `Canvas`, `RightSidebarTopControls` |
| `dataLayerEditMode` (`lightingDataLayerEditMode`) | `observable`, persisted | `:36` | `"normals"` \| `"height"` |
| `selectedNormal` | `observable.ref`, persisted | `:50` | packed to a single int in compact form |
| `lightDirection` | `observable.ref`, persisted | `:65` | packed. Default `{x:-64, y:-64, z:180}` (`types/index.ts:242`) |
| `lightColor` | `observable.ref`, persisted | `:80` | hex in compact form |
| `ambientColor` | `observable.ref`, persisted | `:95` | hex |
| `heightScale` | `observable`, persisted | `:125` | clamped 1..500 |
| `heightBrushValue` | `observable`, persisted | `:110` | clamped 0..255 |
| `normalBrushShape` | `observable`, persisted | `toolActions.ts:200` | the one lighting field that **does** autosave today |

**Eight of these nine never autosave today.** `lightingActions.ts:11-129` writes `project` via raw `set({ project: {...} })` and the file **does not import `services/autoSave` at all**. Task 14 patched this by hand against the Zustand store; this task makes it structural — `LightingUIStore` fields are in the persisted set, so `persistedUIVersion` bumps and `AutoSaveController`'s reaction fires. **The hand-patch becomes unnecessary; verify the behaviour is preserved, not that the patch is still there.**

Add these 9 to `toPersistedUIState()`. **The payload must stay byte-identical.**

### `PixelStore` gains the lighting write paths

| Action | Source lines | Note |
| --- | --- | --- |
| `setNormalPixel`, `setNormalPixels`, `setNormalPixelsForAllFrames` | `lightingActions.ts:132-484` | grid writes; must end with `bumpPixelVersion()` |
| `setHeightPixels` | `:622-755` | same |
| `flipHorizontal`, `flipVertical` | `:756-1035` — **280 lines that are mirror-image copies of each other** | These are **snapshot-family** commands (an inverse patch is intractable). Charge the real byte cost. ⚠️ **Do not unify them into one `flipAxis(axis)` in this task** — task 08 pinned `flipHorizontal ∘ flipHorizontal = identity` and that H and V agree modulo transpose. Port both faithfully; unifying is a follow-up. |
| `computeNormalsForAllFrames` | `:485-621` (136 lines) | **Becomes a `flow`.** Today it runs **inside `LightingStudioTools.tsx`** and blocks the main thread. As a `flow` it can yield between frames and report progress. |

The normal-from-height algorithm at `:485-621` is pure and belongs in a `normalCompute` module that `PixelStore` calls — extract it so it is unit-testable independently of the store.

### The five consumers

| Consumer | LOC | Store members | Note |
| --- | ---: | ---: | --- |
| `LightingCanvas` | 937 | 14 | Imperative `<canvas>` renderer reading 14 `uiState` sub-fields. **Must be driven by the `pixelVersion` reaction, not by `observer` on grid data.** Not split here — that is the canvas task. |
| `LightingStudioTools` | 308 | 11 | **Runs full normal/height-map computation inside the component today.** That logic moves to `PixelStore` as the `flow` above — behaviour-preserving but a large move. |
| `LightControl` | 281 | 4 | 4× `SliderWithNumber` would collapse ~120 lines, but adopting primitives is the purification task's job |
| `NormalPicker` | 261 | 3 | ⚠️ It drives **both** `selectedNormal` and `lightDirection`. It gets two containers, and wiring the wrong store field is the easy mistake — verify they stay independent. |
| `LightingStudioPanel` | 90 | 4 | small |

### Three latent bugs in `LightingCanvas` — record but do not fix here

Measured, and all belong to the canvas decomposition task, not this one:
- **No rAF coalescing** (`grep -c renderRequestRef LightingCanvas.tsx` → **0**); renders fire synchronously from effects at `:369-376`, each redrawing an **uncached O(w·h) `fillRect` checkerboard** (`:298-305`) that `Canvas.tsx` abandoned for `ImageData` at `:387-423`.
- **`lastPaintPixel` is state** (line 25), not a ref → a re-render **per pixel** during a stroke. `Canvas.tsx` correctly uses `lastStrokePixelRef` (line 38).
- **Grid alpha is hard-coded `0.08`** (line 322) vs `Canvas.tsx`'s `0.05`, and `lightGridMode` is ignored entirely → the two canvases visibly disagree.

## Steps

1. Create `LightingUIStore` with the 9 fields; add them to `toPersistedUIState()`; confirm the wire-format golden test stays green.
2. Extract the normal-from-height algorithm (`lightingActions.ts:485-621`) into a pure `normalCompute` module with unit tests.
3. Add the lighting write paths to `PixelStore`, each ending with `bumpPixelVersion()`. Port `flipHorizontal` and `flipVertical` **separately and faithfully** as snapshot commands.
4. Make `computeNormalsForAllFrames` a `flow` on `PixelStore` and remove the computation from `LightingStudioTools.tsx`.
5. Move the migrated fields and actions from the bridge's Phase A list to Phase B.
6. Create the five containers; give `NormalPicker` two containers for its two independent fields.

## Constraints

- **Do not unify `flipHorizontal` and `flipVertical`.**
- **Do not fix the three `LightingCanvas` latent bugs** (rAF, `lastPaintPixel`, grid alpha) — they belong to the canvas task, and the grid-alpha unification is a **visible design decision** needing owner sign-off.
- **Do not split `LightingCanvas`.**
- `layer.pixels` and normal/height grids stay `observable.ref`; `stores/domain/**` imports nothing from `stores/ui/**`.
- The save payload must stay byte-identical; corpus snapshots unchanged.
- Do not remove `zustand`; do not move any component into `ui/components/`.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run build && bunx storybook build
bunx vitest run src/stores/ui/__tests__/LightingUIStore.test.ts
bunx vitest run src/store/__tests__/     # task 08's suite, incl. flipH∘flipH = identity
```

The `LightingUIStore` suite must assert that **each of the 9 fields bumps `persistedUIVersion`** — this is the regression test for the 8 setters that never autosaved.

Manual checks:
1. **The 8 formerly-broken setters:** in the Lighting Studio, change light colour, ambient colour, height scale, selected normal, studio mode, height brush value, edit mode and light direction. Wait 2 s, hard-reload — **all 8 must persist.**
2. **`NormalPicker` independence:** change the **selected normal** and the **light direction** separately and confirm they do not affect each other.
3. **Normal computation must not freeze the UI** — it is a `flow` now.
4. Paint normals and paint height; both must round-trip.
5. `flipHorizontal` twice must return to the original; `flipVertical` likewise; and H and V must agree modulo transpose on an **asymmetric** fixture.
6. Full paint session in the lighting studio with no dropped strokes.

## Definition of done

- [ ] `LightingUIStore` owns the 9 fields; all 9 persist across a reload, including the 8 that never autosaved.
- [ ] Each of the 9 has a test asserting it bumps `persistedUIVersion`.
- [ ] The normal-from-height algorithm is a pure, unit-tested module.
- [ ] `flipHorizontal` and `flipVertical` are ported **separately** as snapshot commands and satisfy the identity and transpose assertions.
- [ ] `computeNormalsForAllFrames` is a `flow` on `PixelStore` and no longer runs inside `LightingStudioTools.tsx`.
- [ ] Five containers exist; `NormalPicker`'s two fields are independently wired.
- [ ] The three `LightingCanvas` latent bugs were **recorded, not fixed**.
- [ ] The save payload and corpus snapshots are unchanged.
