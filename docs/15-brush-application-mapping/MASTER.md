# Brush application mapping — MASTER plan

Planned 2026-09-13 against `main @ 6f1bc44` (clean tree; plan 13 merged, plan 14 **written but not
executed**). Executed by `/plan-go`, one fresh agent per task. **Read this file, `CLAUDE.md`, and your
task file. Nothing else is required; nothing else is assumed.**

> ## ⛔ Prerequisite — plan 14 must be merged first
>
> This plan is written against the **post-plan-14** brush model (`docs/14-multi-brush-projects/`):
> `BrushDocument { version: "brush-2"; brushes: Brush[] }`, `Brush { id; name; width; height; frames;
> appliedGroups }`, `app.brushUI.selectedBrushId` / `selectedBrushIn(doc)`, `app.brushes.projectName`.
> Plan 14 rewrites the same files this plan touches (`types/brush.ts`, `BrushStructureStore`,
> `usePixelBrush`, `PixelStudioBrushSection`, `PixelStudioPanelContainer`), so executing this plan on
> a pre-14 tree would collide with it.
>
> **Coordinator pre-flight (before W1):** on the freshly cut branch run
> `grep -n '"brush-2"' client/src/types/brush.ts && grep -n 'selectedBrushIn' client/src/stores/ui/BrushUIStore.ts && grep -n 'projectName' client/src/stores/domain/BrushStore.ts`.
> All three must match. If any does not, set every wave to `BLOCKED` in `HANDOFF.md` with the note
> "plan 14 not merged" and stop. Do not adapt the tasks to the brush-1 shape.
>
> Line numbers quoted below were measured on `main @ 6f1bc44` (pre-14) and **will have shifted**;
> every citation also names the symbol — anchor on the symbol, treat the line as a hint.

---

## 1. Request

Verbatim:

> Brush use needs to have advanced controls for how the brush is supposed to be applied:
> - Brushes have frames and layers, we need controls to explain how those can be applied to the target canvas
> - We need a control in the brush tool side rail (in the pixel editor) that lets us specify which layer is applied to WHAT layer in the editor. I expect to be able to specify a layer should apply to a delta layer (like -1 meaning apply this layer to the layer below). I should also be able to specify that a layer should apply to a SPECIFIC layer in the editor at the current time. The decision of what brush should apply to specific layers should be saved with the object being edited. The delta layers should travel with the brush. If the user switches to a new object the layer specific pointers should default back to the current layer. Deltas that exceed layer ranges should just be culled.
> - We need a control that lets us specify brush frame to be applied to frame deltas for the object. A brush frame should be allowed to be appplied to multiple frames at a time like: brsh frame 1 applies to object frame 1,2,3,4. In the event we go beyond the object's frames, it should just cull those writes.
> - We need to also set these controls for deltas only so the brush can define default settings for these applications

### Interpretation

Today the pixel studio's Brush tool folds **every visible layer of the brush's selected frame** into one
colour per cell and writes it to **the current layer of the current frame** — `PixelStore.setPixels`
resolves its target from the timeline selection and nothing in the tool chain can name another frame or
layer (`toolHandlers.ts` `ToolPixelWrite` is `{x, y, color}`). This plan makes the application of a brush
a **mapping**: each brush layer names the object layer it lands on (a delta from the current layer, or a
specific layer of this object), and each brush frame names the set of object frames it lands on (deltas
from the current frame). Two levels hold the mapping: **defaults travel with the brush** (deltas only, in
the brush file) and **overrides are saved with the object being edited** (deltas or specific layers, in
the project file on the `PixelObject`). Targets outside the object's range are culled silently. The
controls live in the pixel rail's existing "Brush" section, with a scope switch between "This object" and
"Brush defaults".

### Assumptions where the request was ambiguous

| Ambiguity | Decision |
| --- | --- |
| What is "the object being edited"? | The selected **`PixelObject`** inside the project (`app.ui.timeline.selectedObjectId` → `app.currentObject`). A project holds many objects; switching object is what resets the specific pointers. Overrides are stored on that object (`PixelObject.brushApplication`), keyed by brush identity, so every object in the project keeps its own. |
| "Default back to the current layer" on a new object | A new object has no override for the brush, so every brush layer falls back to the **brush's default delta**, which is 0 (= the current layer) unless the brush author changed it. This keeps "the delta layers travel with the brush" and "specific pointers are per object" consistent: an override never leaks across objects. |
| Pixel-object layer ids differ per frame (`LayerStore.addLayerToAllFrames` generates a fresh id per frame; reorder/delete work **by index** across frames) | A **specific-layer pointer stores the layer id** picked in the current frame "at the current time" and is resolved to that layer's **index**; the write lands at that index in every target frame (the same cross-frame identity the timeline's reorder/delete already use). A pointer whose id exists in no frame of the object is treated as absent → brush default. |
| Which brush frames stamp, and where, when nothing is configured? | **Brush frame `i` applies to Δ+`i`** (frame 0 → the current frame, frame 1 → the next, …). A one-frame brush behaves exactly as today. A multi-frame brush changes from "selected frame → current frame" to "frames fan out from the current frame" — that is the coherent reading of "brush frames map to object frame deltas" and it is a brush-level default the author can change. The Brush Studio's selected frame keeps its role there (editing) and in the rail readout. |
| Object-level frame mapping | Deltas (the request says "frame deltas for the object"). The object level does not point at specific frames. |
| Brush-level defaults | Deltas only, for both layers and frames (the last bullet of the request). |
| Where do the brush-default controls live? | In the **same rail section**, behind a scope switch ("This object" / "Brush defaults"). Editing defaults writes to the brush document through `BrushStructureStore` (undoable in the brush history, autosaved by `brushAutoSave`). The Brush Studio's layer panel does **not** grow a control in this plan (open item). |
| Other Hand Mode | **Not** extended — a per-layer dropdown list does not fit thumb widgets; `toolWidgets.ts` and `pixelBrushWidgets.ts` are untouched. |
| Colour-source `"target"` layers on a mapped layer | Sampled from the **target** layer's grid, not the current one — a burn brush mapped to Δ-1 burns the layer below. |
| Selection mask and reflection lines | Apply to **every** target: all base layers of an object share the object's `gridSize`, so the mask and the mirror lines are valid for all of them. |
| Editing a variant layer | Variant layers have their own grid size and `PixelStore.resolveTargetFor` refuses them by design. While the current layer is a variant layer (`app.isEditingVariant`), the plan **collapses to today's behaviour**: the selected brush frame's visible layers fold into one stamp on the current target. Mapped targets that resolve to a variant layer are culled. |
| Undo | One drag = **one** undo entry across all targets (the existing stroke transaction). Mapping edits are undoable: object overrides in the project history (like `setObjectOrigin`), brush defaults in the brush history (like `setLayerColorSource`). |
| Hover marker | The **union** of every mapped brush frame's painted cells (after culling). If the mapping writes nothing to the current frame the marker still shows where the brush would land in other frames. |

---

## 2. Outcome

When every wave is DONE the owner can:

1. Select the Brush tool with a brush loaded and see, under the size controls, an **Application** block
   with a scope switch **This object / Brush defaults**, one row per brush layer (top → bottom) with a
   target dropdown, and one row per brush frame with a frame-delta field.
2. In **This object**, set a brush layer to `Δ-1` and paint: that layer's deltas land on the layer below
   the current one; set another to a **named layer** of the current frame and it lands there. Switch to
   another object: both rows read "Brush default" again. Switch back: the choices are still there, and
   they survive a reload (saved in the project file on the object).
3. Set brush frame 1 to `0, 1, 2, 3` and paint on frame 2 of a 4-frame object: frames 2, 3 and 4 receive
   the stamp and the fourth target is culled silently. ⌘Z removes all of it in one step.
4. In **Brush defaults**, set a layer's default to `Δ-1` and a frame's default deltas: the brush file
   saves them; opening a fresh object applies them without configuration; ⌘Z in the Brush Studio undoes
   them. A brush that never had defaults set round-trips byte-identically.
5. Nothing else changes: single-frame brushes with no mapping stamp exactly as before; the corpus
   digests, `Base Unit.json`'s byte size and every snapshot are untouched.

---

## 3. Locked decisions

| # | Decision | Value |
| --- | --- | --- |
| D1 | **Brush-level defaults** (`client/src/types/brush.ts`) | `BrushLayer.applyDelta?: number` — integer, absent ⇔ `0`. `BrushFrame.applyTo?: number[]` — sorted ascending, deduped integers, absent ⇔ `[frameIndex]`; `[]` is legal and means "this frame is never applied". `BRUSH_APPLY_DELTA_MAX = 64`; values beyond ±64 are dropped by the normaliser and clamped by the setters. Keys are present **only when non-default** (the `colorSource` rule): `createBrushLayer`/`createBrushFrame` never write them, `normalizeLayer` keeps `applyDelta` iff `Number.isInteger(v) && v !== 0 && |v| ≤ 64`, `normalizeFrame(raw, index)` keeps `applyTo` iff every entry is an integer within ±64, after `normalizeDeltaList` (dedupe + sort), and the result differs from `[index]`. Helpers: `brushLayerApplyDelta(layer): number`, `brushFrameApplyTo(frame, index): number[]`, `normalizeDeltaList(list: readonly number[]): number[]`, `isDefaultApplyTo(list, index): boolean`. |
| D2 | **Object-level overrides** (new `client/src/types/brushApplication.ts`, re-exported from `types/index.ts`) | `type BrushLayerTarget = { delta: number } \| { layerId: string }` (exactly one key). `interface BrushApplicationOverride { layers?: Record<string, BrushLayerTarget>; frames?: Record<string, number[]> }` keyed by **brush layer id** / **brush frame id**. `type BrushApplicationMap = Record<string, BrushApplicationOverride>` keyed by `brushApplicationKey(projectName, brushId)` = `` `${projectName}::${brushId}` ``. `pruneBrushApplication(map): BrushApplicationMap \| undefined` drops empty `layers`/`frames`, empty overrides, and returns `undefined` for an empty map. `isBrushLayerTarget(v): v is BrushLayerTarget`. `PixelObject.brushApplication?: BrushApplicationMap` (`types/domain.ts`), `CompactPixelObject.brushApplication?: BrushApplicationMap` (`codecs/compactTypes.ts`), and in **both** `projectToCompact` and `compactToProject` the line `...(obj.brushApplication ? { brushApplication: obj.brushApplication } : {}),` directly under the existing `origin` spread. Pass-through, no validation in the codec (as `origin`). **Never** `brushApplication: undefined` — `digest()` treats a present-undefined key as content and all 11 corpus digests would move. |
| D3 | **Resolution** (pure, new `client/src/ui/canvas/tools/pixelBrushApply.ts`) | Input is ids and indices only, never a grid (type block below). Rules, in order: (1) layer target = `override.layers[layer.id]` if it `isBrushLayerTarget`, else `{ delta: brushLayerApplyDelta(layer) }`; (2) `{ delta }` → `layerIndex = currentLayerIndex + delta`; `{ layerId }` → index of that id in the current object frame, else in the first object frame that has it, else fall back to rule (1)'s default delta; (3) frame deltas = `override.frames[frame.id]` if it is an integer array (normalised), else `brushFrameApplyTo(frame, i)`; (4) each `d` → `frameIndex = currentFrameIndex + d`, culled when out of `[0, frames.length)`; (5) `layerIndex` culled when out of that target frame's `[0, layers.length)` or when that layer `isVariant`; (6) `layer.visible === false` skipped (as today); (7) group by `(frameId, layerId)`, layers in brush order — frames ascending, then bottom → top — into `PixelBrushApplyGroup { frameId; layerId; current: boolean; layers: PixelBrushSourceLayer[] }`, `current` ⇔ the group's ids equal the current frame/layer ids. Exports: `resolveBrushLayerTarget`, `resolveBrushFrameDeltas`, `planPixelBrushTargets(input): PixelBrushApplyGroup[]`, plus the plan types of D5. Deterministic output order: by target frame index, then layer index. |
| D4 | **Footprint and stamps** | `PixelBrushPlan.footprint` = `pixelBrushFootprint` over the **union** of every group's layers (one call with all grouped layers concatenated — `forEachPaintedCell` unions painted cells). One `PixelBrushStamp` per group via the unchanged `resolvePixelBrushStamp(group.layers, w, h, base)`. `pixelBrushStamp.ts` is **not edited** by this plan. |
| D5 | **Tool seam** (`toolHandlers.ts`) | `PixelBrushPlanEntry { key: string /* `${frameId}/${layerId}` */; frameId; layerId; current: boolean; stamp: PixelBrushStamp; target: PixelBrushTarget \| null }`, `PixelBrushPlan { footprint: PixelBrushFootprint \| null; entries: ReadonlyArray<PixelBrushPlanEntry> }` (both declared in `pixelBrushApply.ts`). `ToolContext` gains `pixelBrushPlan?: PixelBrushPlan \| null` and `setPixelsAt?: (target: { frameId: string; layerId: string }, writes: ToolPixelWrite[]) => void`. The `brush` handler: on down `beginStroke`, then for **every** entry clear `entry.target?.touched`, `stampPixelBrushSegment(prev, next, ctx.line, entry.stamp, ctx, entry.target)`, and route `entry.current ? ctx.setPixels(w) : ctx.setPixelsAt?.(entry, w)` (a missing `setPixelsAt` culls non-current entries). Task 09 **adds** the plan path beside the legacy `pixelBrushStamp`/`pixelBrushTarget` path (plan wins when present) so every gate stays green; task 12 **removes** the legacy fields from `ToolContext`, the handler, the hook and the tests. |
| D6 | **Domain write** (`stores/domain/PixelStore.ts`) | `setPixelsAt(frameId: string, layerId: string, pixels: readonly PixelWrite[], options: PixelWriteOptions = {}): void` — `resolveTargetFor(frameId, layerId)` (`null` → silent no-op, which also culls variant layers), then exactly `setPixels`'s bounds/mask/dedupe/patch construction, then `commitCells(target, layer, "Draw", patches, options.trackHistory ?? true)`. **Opens no transaction** — the stroke transaction (`ctx.beginStroke`) owns the undo entry; a nested `beginTransaction` would commit the outer one and cut the stroke in two (`HistoryStore.beginTransaction` :200-202). `setPixels`'s behaviour and its suite are unchanged; the shared patch construction may be extracted into one private helper both call. |
| D7 | **Container binding** (`CanvasContainer.tsx`, `containers/pixelBrush/`) | `actions.setPixelsAt(target, writes)` mirrors through `expandWrites` with the **object's** `gridSize` and calls `app.pixels.setPixelsAt(target.frameId, target.layerId, mirrored, app.selectionUI.writeOptions)`. Samplers: `bindPixelBrushTargets(plan, lookup, currentTarget)` (new `containers/pixelBrush/pixelBrushPlan.ts`) returns the plan with each entry's `target` set — the `current` entry gets the existing `pixelBrushTarget` (its `touched` ref survives), every other entry gets `{ sample: (x, y) => getPixelColor(lookup(frameId, layerId)?.[y]?.[x]), touched: new Set() }` where `lookup` reads `app.currentObject` lazily at call time (pointer-time, never observed). Memoised on `[plan, editableGrid]`, never on `pixelVersion`. `getToolContext` binds `pixelBrushPlan` and `setPixelsAt`; `pixelBrushStamp`/`pixelBrushTarget` bindings go away in task 12. |
| D8 | **Hook** (`containers/pixelBrush/usePixelBrush.ts`) | Returns `plan: PixelBrushPlan \| null` and keeps `footprint` (= `plan.footprint`), `size`, `loadState`, `projectName`. Builds `PixelBrushApplyInput` from `app.currentObject` (ids only, via `readObjectShape(app)` in `pixelBrushPlan.ts`), the selected brush (all frames scaled with `scalePixelBrushLayers` — identity requests return the same arrays), `app.currentObject?.brushApplication?.[brushApplicationKey(projectName, brush.id)]`, and the current frame/layer indices. Variant editing → legacy single group (D3 note). Memo keys add `app.domain.domainVersion`, `selectedObjectId`, `selectedFrameId`, `selectedLayerId`, `isEditingVariant`; grids are read inside the memo, never observed. The `stamp` member is kept until task 12 removes it. |
| D9 | **UI** (`ui/components/PixelStudioPanel/`) | New pure `PixelStudioBrushApplication.tsx` (+ `PixelStudioBrushApplication.css`, `.stories.tsx`, `__tests__/PixelStudioBrushApplication.dom.test.tsx`), BEM block `brush-application`. Props in the type block below. Scope switch = two `Button`s with `aria-pressed` ("This object" / "Brush defaults"). Layer rows: name + one `Dropdown` (`label` = the layer name for a11y, options supplied by the container). Frame rows: name + a text input showing `formatDeltaList(deltas)` that commits on Enter/blur via `parseDeltaList` (garbage → revert, no callback) + a reset `IconButton` (lucide `RotateCcw`, disabled when `isDefault`) that calls `onFrameDeltasChange(id, null)`. Value encoding helpers in new `brushApplicationValue.ts`: `BRUSH_APPLY_DEFAULT = "default"`, `encodeDeltaTarget(n)` = `` `d:${n}` ``, `encodeLayerTarget(id)` = `` `l:${id}` ``, `decodeBrushApplyValue(v)`, `formatDeltaList(list)` (`"0, +1, +2"`, `"—"` for `[]`), `parseDeltaList(text): number[] \| null` (comma/space separated signed integers, deduped, sorted; `""` → `[]`; anything else → `null`). `PixelStudioBrushInfo.application?: PixelStudioBrushApplication` (optional — the `size?` precedent) rendered by `PixelStudioBrushSection` after the size controls, only when loaded. Hint copy: "Each brush layer stamps onto its mapped object layer; each brush frame onto its mapped object frames." |
| D10 | **Session state** (`stores/ui/PixelBrushUIStore.ts`) | `applyScope: PixelBrushApplyScope = "object"` (`type PixelBrushApplyScope = "object" \| "brush"`), `setApplyScope(scope)`, reset by `resetAll()`. **Session-only** — nothing reaches `toPersistedUIState()`; `persistedUIState.test.ts` is the gate. |
| D11 | **Object setters** (`stores/domain/ObjectStore.ts`) | `setBrushLayerTarget(objectId, brushKey, brushLayerId, target: BrushLayerTarget \| null)` and `setBrushFrameTargets(objectId, brushKey, brushFrameId, deltas: readonly number[] \| null)`; `null` removes the entry. Each is one `mutator.commit(label, true, …)` (labels `"Set brush layer target"` / `"Set brush frame targets"`) that rebuilds the object with `pruneBrushApplication`; when the pruned map is `undefined` the object is rebuilt **without** the key (`const { brushApplication: _drop, ...rest } = o`), never with `brushApplication: undefined`. Frame deltas are normalised with `normalizeDeltaList` and clamped to ±64 before storing. No-op (no commit) when the stored value already equals the request. |
| D12 | **Brush setters** (`stores/domain/BrushStructureStore.ts`) | `setLayerApplyDelta(id, delta)` — clamp ±64, `0` drops the key, snapshot commit `"Change layer target"`, no pixel bump, `mapLayer` across every frame (the `colorSource` shape). `setFrameApplyTo(frameId, deltas: readonly number[] \| null)` — `null` or `isDefaultApplyTo(list, index)` drops the key, else stores `normalizeDeltaList(list)`, snapshot commit `"Change frame targets"`, no pixel bump. `duplicateLayer`/`duplicateFrame` carry the keys by spread (verify and pin); a moved frame keeps an explicit `applyTo` and a default one follows its new index. |
| D13 | **Panel container** | New `containers/pixelBrush/buildBrushApplication.ts` exporting `buildBrushApplication(app): PixelStudioBrushApplication \| undefined` (a plain function called from the `observer` container, so its reads are tracked) — `undefined` unless a brush is loaded and `app.currentObject` exists. Brush key = `brushApplicationKey(app.brushes.projectName, brush.id)`. Layer rows from `brush.frames[0].layers` **reversed** (top first, like every layer panel); frame rows from `brush.frames`. Options in **object** scope: `Brush default (Δn)` first, then `Δ-(L-1) … Δ+(L-1)` (labels `Δ0 · current layer`, `Δ-1 · below`, `Δ+1 · above`, plain `Δ±n` otherwise; `L` = layers in the current object frame, min range ±1, plus the stored value if outside), a disabled separator, then the current frame's layers top → bottom by name (encoded `l:<id>`). In **brush** scope: deltas only (no default row, no specific layers). `PixelStudioPanelContainer` spreads `...(application ? { application } : {})` into `pixelBrush` — the container file itself gains only that. |
| D14 | **Commits / branch** | Prefix `brush-apply(NN):` for tasks 01–12, `docs(15):` for 13. One commit per task. Branch `feat/15-brush-application-mapping`. |
| D15 | **Data safety** | Task 02 is the **only** task allowed to touch `client/src/types/domain.ts`, `client/src/types/codecs/**`; task 01 the only one to touch `types/brush.ts`; tasks 03, 07, 08 the only ones under `stores/domain/`. At every gate: `bunx vitest run src/types` green, `git status --porcelain \| grep __snapshots__` empty, `bun run format:check` clean, `git diff --stat <base>..HEAD -- client/src/types/codecs` lists only `compactTypes.ts`, `serialize.ts`, `deserialize.ts` with the `brushApplication` lines, and `client/src/services`, `server/src/export`, `UIStore.toPersistedUIState` are **untouched**. Nobody reads or writes `server/src/data/`. |

### The type blocks, verbatim (tasks in later waves code against these)

```ts
// types/brush.ts (task 01) — added members; everything else unchanged from plan 14
export const BRUSH_APPLY_DELTA_MAX = 64;
export interface BrushLayer { /* … */ applyDelta?: number; }
export interface BrushFrame { /* … */ applyTo?: number[]; }
export function normalizeDeltaList(list: readonly number[]): number[];
export function isDefaultApplyTo(list: readonly number[], frameIndex: number): boolean;
export function brushLayerApplyDelta(layer: { applyDelta?: number }): number;
export function brushFrameApplyTo(frame: { applyTo?: readonly number[] }, frameIndex: number): number[];

// types/brushApplication.ts (task 02)
export type BrushLayerTarget = { delta: number } | { layerId: string };
export interface BrushApplicationOverride {
  layers?: Record<string, BrushLayerTarget>;
  frames?: Record<string, number[]>;
}
export type BrushApplicationMap = Record<string, BrushApplicationOverride>;
export function brushApplicationKey(projectName: string, brushId: string): string;
export function isBrushLayerTarget(v: unknown): v is BrushLayerTarget;
export function pruneBrushApplication(map: BrushApplicationMap | undefined): BrushApplicationMap | undefined;

// ui/canvas/tools/pixelBrushApply.ts (task 06)
export interface PixelBrushApplyLayer extends PixelBrushSourceLayer { id: string; applyDelta?: number }
export interface PixelBrushApplyFrame { id: string; applyTo?: readonly number[]; layers: ReadonlyArray<PixelBrushApplyLayer> }
export interface PixelBrushObjectShape { frames: ReadonlyArray<{ id: string; layers: ReadonlyArray<{ id: string; isVariant?: boolean }> }> }
export interface PixelBrushApplyInput {
  brush: { frames: ReadonlyArray<PixelBrushApplyFrame> };
  override: BrushApplicationOverride | undefined;
  object: PixelBrushObjectShape;
  currentFrameIndex: number;
  currentLayerIndex: number;
}
export interface PixelBrushApplyGroup { frameId: string; layerId: string; current: boolean; layers: PixelBrushSourceLayer[] }
export function resolveBrushLayerTarget(layer: PixelBrushApplyLayer, override: BrushApplicationOverride | undefined): BrushLayerTarget;
export function resolveBrushFrameDeltas(frame: PixelBrushApplyFrame, frameIndex: number, override: BrushApplicationOverride | undefined): number[];
export function planPixelBrushTargets(input: PixelBrushApplyInput): PixelBrushApplyGroup[];
export interface PixelBrushPlanEntry { key: string; frameId: string; layerId: string; current: boolean; stamp: PixelBrushStamp; target: PixelBrushTarget | null }
export interface PixelBrushPlan { footprint: PixelBrushFootprint | null; entries: ReadonlyArray<PixelBrushPlanEntry> }

// stores/ui/PixelBrushUIStore.ts (task 04)
export type PixelBrushApplyScope = "object" | "brush";

// ui/components/PixelStudioPanel/PixelStudioBrushApplication.tsx (task 05)
export type PixelStudioBrushApplyScope = "object" | "brush";
export interface PixelStudioBrushLayerMapping { id: string; name: string; value: string }
export interface PixelStudioBrushFrameMapping { id: string; name: string; deltas: ReadonlyArray<number>; isDefault: boolean }
export interface PixelStudioBrushApplication {
  scope: PixelStudioBrushApplyScope;
  onScopeChange: (scope: PixelStudioBrushApplyScope) => void;
  layers: ReadonlyArray<PixelStudioBrushLayerMapping>;
  layerOptions: ReadonlyArray<DropdownOption<string>>;
  onLayerTargetChange: (brushLayerId: string, value: string) => void;
  frames: ReadonlyArray<PixelStudioBrushFrameMapping>;
  onFrameDeltasChange: (brushFrameId: string, deltas: number[] | null) => void;
}
```

---

## 4. Ground truth (measured 2026-09-13 on `main @ 6f1bc44`, pre-plan-14)

### Repo state
- Plan 13 merged; plan 14 planned (`docs/14-multi-brush-projects/`, HANDOFF "W1 not started"). `REFRESH/` does not exist — the refresh is complete; every file here is MobX + BEM + `ui/`/`containers/`. `CLAUDE.md`'s `REFRESH/*` links are dead.
- Baseline gate (plan 14's measurement; `6f1bc44` is a docs-only commit on top): `bun run verify` exit 0 — tsc clean, eslint **0 errors / 66 warnings**, vitest **200 files / 4361 tests**, build OK; stylelint 2 pre-existing errors (`OtherHand.css:338,359`); storybook OK; boundaries 5/5; server 4 files / 102 tests; no lockfile. **The coordinator re-measures after plan 14 and records the new baseline in `HANDOFF.md` before W1.**
- ⚠️ `client/src/test/__fixtures__/corpus/*.json` (11 files) is gitignored and absent in a fresh worktree; copy from the launch checkout before the first gate or `src/types/__tests__/` fails (`corpusFiles()` throws on an empty dir).

### The write chain today (the thing this plan opens)
```
toolHandlers.brush.onDown/onMove   (toolHandlers.ts :309-343; ToolContext :83-140; pixelBrushStamp? :105, pixelBrushTarget? :114, setPixels :128)
  → stampPixelBrushSegment(prev, next, line, stamp, bounds, target)   (pixelBrushStamp.ts :409-444; cull = inBounds :426)
  → ctx.setPixels(writes)   → CanvasContainer actions.setPixels (:881-894: expandWrites over app.editableGrid dims, then)
  → PixelStore.setPixels(writes, app.selectionUI.writeOptions)   (PixelStore.ts :771-818)
  → resolveTarget()  (:351-412, hard-wired to app.ui.timeline selection)  → commitCells (:501-540, one history.record + one publishAndBump)
```
- `PixelStore.resolveTargetFor(frameId, layerId)` (:439-465) already addresses an arbitrary (frame, layer) of the **selected object** and returns `null` for a variant layer. `adjustColorAcross` (:1136-1179) + `commitAdjustment` (:1344-1365) are the only multi-target writes: resolve everything first, `commitCells` per target, transaction only when `trackHistory && work.length > 1`, `endTransaction` in `finally`.
- The stroke: `ctx.beginStroke()` → `actions.beginStroke()` → `strokeControl.begin()` (`CanvasContainer.tsx:929`) opens the transaction that makes one drag one undo entry. `HistoryStore.beginTransaction` while one is open **commits the outer one** (`HistoryStore.ts:200-202`).
- `ToolPixelWrite { x; y; color }` (`toolHandlers.ts:72-76`) carries no target. `brush` has no `onUp`. `ctx` is passed as `StampBounds` (`gridWidth`/`gridHeight`).
- `usePixelBrush` (207 lines): reads `:139-146`, init effect `:133-135`, reset effect `:153-155`, `scaled` memo `:157-176` (`selectedFrameIn(doc)` `:159`, keys `:176`), `footprint` `:178-181`, `stamp` `:184-192`, returns `:200-206`. Consumers: `CanvasContainer.tsx:643` (call), `:2290/:2300` (`footprint.offsets` into `toolFootprint`), `:4425` (`pixelBrushStamp: pixelBrush.stamp`), `:4426` (`pixelBrushTarget`), sampler `:4385-4404` (`pixelBrushTouched` ref `:4397`, `getPixelColor` `:305-309`, `editableGrid()` `:4349-4355`), deps `:4474-4492`.
- Files that mention `pixelBrushStamp`/`pixelBrushTarget`: `toolHandlers.ts`, `toolHandlers.test.ts` (346 lines, `describe("toolHandlers.brush")` :83), `pixelBrushStamp.ts` + its test (pure — untouched), `usePixelBrush.ts` + `usePixelBrush.dom.test.ts` (457), `CanvasContainer.tsx`, `pixelBrushTool.dom.test.tsx` (600; real `ApplicationStore` + `CanvasContainer` render).

### Pixel project model
- `types/domain.ts`: `Layer :24-39` (`id`, `name`, `pixels`, `visible`, `isVariant?` …), `Frame :41-46`, `PixelObject :80-90` (`id`, `name`, `gridSize`, `frames`, `origin?`), `Project :105-123`. Ordering is array order; `layers[0]` is the bottom; no index fields.
- **Layer ids are per frame**: `LayerStore.addLayer` (:238) adds to the current frame only; `addLayerToAllFrames` (:723) generates a fresh id per frame; reorder/delete are by index across frames (:376, :406). Hence D3's id → index rule.
- Selection: `TimelineUIStore` (`app.ui.timeline`) `selectedObjectId/FrameId/LayerId` (:133-135). Resolved: `app.currentObject :1259`, `currentFrame :1265`, `currentLayer :1273`, `isEditingVariant :1350`, `editableGrid :1385-1405` (variant-aware). `domain.objects` is `observableShallow` — nested frames/layers are plain objects; `domainVersion`/`pixelVersion` on `DomainStore :224-225`.
- Domain writes: `DomainMutator.commit(label, undoable, mutate)` (`DomainMutator.ts:99`) — snapshot, `runInAction(mutate)`, publish, bump. `ObjectStore.setObjectOrigin` (:242-248) is the per-object scalar-setter template; test `subStores.test.ts:158-161` + the "all 6 are UNDOABLE" census `:193`. `src/store/storeTypes.ts:181` lists `setObjectOrigin` in the legacy facade — **do not add the new setters there**.

### Wire format and its gates
- Codec: `codecs/serialize.ts` `projectToCompact :67` (object literal `:70-81`, `origin` spread **:74**); `codecs/deserialize.ts` `compactToProject` (object literal `:171-182`, `origin` spread **:175**); `codecs/compactTypes.ts` `CompactPixelObject :67-77` (`origin? :73`). Present-with-`undefined` keys are content to `digest()` (`test/__fixtures__/projects.ts:105-125`) — the `fillColor` lesson (`UIStore.ts:582-585`).
- Gates: `types/__tests__/migrations.test.ts` corpus golden digests (:988-1048; 11 sha256 in `__snapshots__/migrations.test.ts.snap`, 149 + 2 snapshots), `roundtrip.test.ts` R2 rich project (:94-128, `expect(rt.objects).toEqual(p.objects)`), R6 corpus idempotency (:295), **R10 exact byte count** `expect(onDisk).toBe(1_129_965)` for `base-unit.json` (:393-408). `persistedUIState.test.ts` concerns `CompactUIState` only (55 keys) — untouched by an object-level field.
- Server treats projects and brushes as opaque JSON (`routes/project.ts:94-128`, `routes/brush.ts:53-55`). Nothing server-side changes.

### Brush model (post-plan-14 names; pre-14 lines)
- `types/brush.ts` (384): `BrushLayer :65-79` (`colorSource? :77`, additive-key comment `:71-76`), `BrushFrame :80-84`, `createBrushLayer :171-190` (writes `colorSource` only for `"target"` `:188`), `createBrushFrame :192-198`, `normalizeLayer :300-320` (`:318` keeps `"target"` only), `normalizeFrame :322-335`, `assertUniformLayers :222-253` (ids + order per frame — `applyDelta` lives on every frame's copy of a layer exactly as `colorSource` does). After plan 14: `Brush`, `brushIn`, `normalizeBrush(raw, index)`, `assertBrushDocument`. Test `brush.test.ts` (517): byte-identical round trip `:310-321` asserts key **absence**.
- `BrushStructureStore.ts` (681): `setLayerChannelType :534`, `setLayerColorSource :555-571` (the template: `layerIndexOf`, early return on no change, `commit(label, mapLayer…, false)`), frames `addFrame :223`, `duplicateFrame :261`, `moveFrame :329`, `mapLayer :129`. After plan 14 these resolve the selected brush through `commitBrush`.
- `BrushUIStore` after 14: `selectedBrushId`, `selectedBrushIn(doc)`, `selectedFrameIn(doc)`. `BrushStore.projectName`.
- `PixelBrushUIStore.ts` (179): observables `:69-77`, `makeObservable :81-93`, `resetAll :173-178`; test (286). Excluded from `toPersistedUIState()` (grep `pixelBrush` in `UIStore.ts` → lines 115, 264, 358 only).

### UI
- `PixelStudioBrushSection.tsx` (322 raw): `PixelStudioBrushSizeControls :52-71`, `PixelStudioBrushInfo :78-92` (`size? :92`), component `:249`, `loaded :253`, size render `:304-305`, hint `:314`. Plan 14 adds the "Brush" dropdown row and `brushes?/selectedBrushId?/onSelectBrush?`. `PixelStudioPanel.tsx` (396) re-exports the types `:84-89`. CSS in `PixelStudioPanel.css` (`.pixel-studio-panel__brush-*` :174-334). `ReflectionLinesSection.{tsx,css,stories.tsx}` is the "own block, own CSS file" precedent in the same folder. Tests `__tests__/PixelStudioBrushSection.dom.test.tsx` (281), `PixelStudioPanel.dom.test.tsx` (308).
- Primitives: `Dropdown<T extends string>` (`options: DropdownOption<T>[]`, `value`, `onChange`, `label?`, `disabled?`, `triggerLabel?`, `className?`; options accept `disabled` — the separator idiom used by `SCALE_MENU`), `Button`, `IconButton` (`aria-pressed` used by the ratio lock), `NumberInput`, `Field`, `Badge`, `Toggle`.
- `PixelStudioPanelContainer.tsx` (425 raw): `pixelBrush` block `:158-216`, `size` spread `:215`, passes `:421`. Near the 400-code-line **warning** — D13 keeps the builder in its own file.
- `max-lines`: 400 **code** lines (blank + comments skipped) — `warn` under `src/**`, **`error`** under `src/ui/**` (`eslint.config.js:519-573`). Warning baseline 66; every gate requires ≤ the post-14 baseline.

### Gate commands (confirmed)
- **Client gate** = `cd client && bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run lint:boundaries`; then from the root `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` prints nothing.
- Side gates: `cd client && bunx stylelint "src/**/*.css"` (no new errors; baseline 2), `cd client && bunx storybook build`, `bun run format:check` (root; covers `client/src/types/**`), `bun run verify` (root: typecheck → lint → format:check → client test → build). Server: `cd server && bunx tsc --noEmit && bunx eslint . && bunx vitest run` (untouched by this plan; run once in W5).
- **Data-safety check** (every wave): `cd client && bunx vitest run src/types` green · `git status --porcelain | grep __snapshots__` empty · `git diff --stat <base>..HEAD -- client/src/services server/src/export` empty · `git diff <base>..HEAD -- client/src/types/codecs` shows only the D2 lines.
- `.claude/hooks/guard-data-safety.sh` blocks `vitest -u` and the frozen-lockfile flag — and it inspects the **text** of every Bash command, so a command that merely quotes those strings is blocked too. Write documentation with the Write tool, not a heredoc.

---

## 5. Wave table

| Wave | Tasks | Parallel | Gate before next wave |
| --- | --- | --- | --- |
| W1 | 01 brush defaults (types) · 02 object overrides (types + codec) · 03 `PixelStore.setPixelsAt` · 04 `applyScope` · 05 UI component + section prop | 5 | Full client gate green (tsc clean, eslint 0e / ≤ baseline w, vitest all green, boundaries 5/5) + data-safety check + stylelint (no new errors) + `bunx storybook build` + `bun run format:check` + no lockfile |
| W2 | 06 pure resolver · 07 `ObjectStore` setters · 08 `BrushStructureStore` setters | 3 | Full client gate + data-safety check + no lockfile |
| W3 | 09 tool seam · 10 hook + plan builder · 11 panel container wiring | 3 | Full client gate + data-safety check + stylelint + storybook + no lockfile + **manual checks of task 11** |
| W4 | 12 `CanvasContainer` wiring + legacy seam removal | 1 | Full client gate + data-safety check + no lockfile + **manual checks of task 12** + `grep -rln "pixelBrushStamp\b\|pixelBrushTarget\b" client/src` lists only `pixelBrushStamp.ts` and its test |
| W5 | 13 final gate, `ARCHITECTURE.md`, QA ledger | 1 | `bun run verify` exit 0 + boundaries + stylelint + storybook + server gate + no lockfile + data-safety check + the manual QA table filled |

Every gate is **fully green** — this plan has no red seam (D5's additive-then-remove sequencing exists for that reason).

---

## 6. Dependency graph

```
W1  01 brush defaults (types/brush.ts) ─────────┬──────────┐
    02 object overrides (domain + codec) ───────┼───┐      │
    03 PixelStore.setPixelsAt ──────────────────┼───┼──────┼─────────────┐
    04 PixelBrushUIStore.applyScope ────────────┼───┼──────┼───┐         │
    05 UI component + section prop ─────────────┼───┼──────┼───┤         │
W2  06 resolver ◄─ 01, 02 ──────────────────────┘   │      │   │         │
    07 ObjectStore setters ◄─ 02 ───────────────────┘      │   │         │
    08 BrushStructureStore setters ◄─ 01 ──────────────────┘   │         │
W3  09 tool seam ◄─ 06 ────────────────────────────────────────┼─────┐   │
    10 hook + plan builder ◄─ 01, 02, 06 ──────────────────────┼──┐  │   │
    11 panel container ◄─ 04, 05, 07, 08 ──────────────────────┘  │  │   │
W4  12 CanvasContainer + seam removal ◄─ 03, 09, 10 ──────────────┴──┴───┘
W5  13 ◄─ everything
```

---

## 7. Collision matrix

**W1**
| 01 | 02 | 03 | 04 | 05 |
| --- | --- | --- | --- | --- |
| `client/src/types/brush.ts` · `client/src/types/__tests__/brush.test.ts` | `client/src/types/brushApplication.ts` (new) · `client/src/types/__tests__/brushApplication.test.ts` (new) · `client/src/types/domain.ts` · `client/src/types/index.ts` · `client/src/types/codecs/compactTypes.ts` · `client/src/types/codecs/serialize.ts` · `client/src/types/codecs/deserialize.ts` · `client/src/types/__tests__/roundtrip.test.ts` | `client/src/stores/domain/PixelStore.ts` · `client/src/stores/domain/__tests__/PixelStore.test.ts` | `client/src/stores/ui/PixelBrushUIStore.ts` · `client/src/stores/ui/__tests__/PixelBrushUIStore.test.ts` | `client/src/ui/components/PixelStudioPanel/PixelStudioBrushApplication.tsx` (new) · `PixelStudioBrushApplication.css` (new) · `PixelStudioBrushApplication.stories.tsx` (new) · `brushApplicationValue.ts` (new) · `__tests__/PixelStudioBrushApplication.dom.test.tsx` (new) · `__tests__/brushApplicationValue.test.ts` (new) · `PixelStudioBrushSection.tsx` · `PixelStudioPanel.tsx` · `__tests__/PixelStudioBrushSection.dom.test.tsx` |

Disjoint: 01 and 02 are different files under `types/` (02 never opens `brush.ts`; 01 never opens `index.ts`); 03 and 04 are different store folders; 05 is the only task under `ui/`.

**W2**
| 06 | 07 | 08 |
| --- | --- | --- |
| `client/src/ui/canvas/tools/pixelBrushApply.ts` (new) · `client/src/ui/canvas/tools/__tests__/pixelBrushApply.test.ts` (new) | `client/src/stores/domain/ObjectStore.ts` · `client/src/stores/domain/__tests__/subStores.test.ts` | `client/src/stores/domain/BrushStructureStore.ts` · `client/src/stores/domain/__tests__/BrushStructureStore.test.ts` |

**W3**
| 09 | 10 | 11 |
| --- | --- | --- |
| `client/src/ui/canvas/tools/toolHandlers.ts` · `client/src/ui/canvas/tools/__tests__/toolHandlers.test.ts` | `client/src/containers/pixelBrush/usePixelBrush.ts` · `client/src/containers/pixelBrush/pixelBrushPlan.ts` (new) · `client/src/containers/pixelBrush/__tests__/usePixelBrush.dom.test.ts` · `client/src/containers/pixelBrush/__tests__/pixelBrushPlan.test.ts` (new) | `client/src/containers/pixelBrush/buildBrushApplication.ts` (new) · `client/src/containers/pixelBrush/__tests__/buildBrushApplication.dom.test.ts` (new) · `client/src/containers/PixelStudioPanelContainer.tsx` · `client/src/containers/__tests__/PixelStudioPanelContainer.dom.test.tsx` |

Disjoint: 10 and 11 both add files under `containers/pixelBrush/` but never the same file; 09 is the only task under `ui/canvas/`.

**W4 / W5** are single-task waves. Task 12 touches `client/src/containers/CanvasContainer.tsx`, `client/src/containers/__tests__/pixelBrushTool.dom.test.tsx`, `client/src/ui/canvas/tools/toolHandlers.ts`, `client/src/ui/canvas/tools/__tests__/toolHandlers.test.ts`, `client/src/containers/pixelBrush/usePixelBrush.ts`, `client/src/containers/pixelBrush/__tests__/usePixelBrush.dom.test.ts`. Task 13 touches `ARCHITECTURE.md` and `docs/15-brush-application-mapping/HANDOFF.md`.

---

## 8. Alignment guide

### Naming to hold
- **Default** = the brush-level value (`applyDelta`, `applyTo`, "Brush defaults" scope). **Override** = the object-level value (`brushApplication`, "This object" scope). **Target** = a resolved `(frameId, layerId)`. Never call an override a default.
- **Delta** = a signed integer offset from the current frame/layer (`Δ-1`, `Δ+2`); UI labels use the `Δ` glyph. **Specific layer** = a `{ layerId }` target.
- Pixel-studio artefacts stay `pixelBrush*` / `PixelBrush*` (plan 12 D2); the pure resolver is `pixelBrushApply.ts`; the UI block is `brush-application`.
- The brush identity key is always built by `brushApplicationKey(projectName, brushId)` — never inline the template string.

### Files to imitate
- Optional wire key on a brush layer: `createBrushLayer`'s `colorSource` lines and `normalizeLayer:318` (task 01).
- Optional wire key on an object: the `origin` spreads at `serialize.ts:74` / `deserialize.ts:175` / `compactTypes.ts:73` (task 02).
- Per-object undoable setter: `ObjectStore.setObjectOrigin` + `subStores.test.ts:158` (task 07).
- Brush snapshot setter without a pixel bump: `BrushStructureStore.setLayerColorSource` (task 08).
- Multi-target domain write: `PixelStore.adjustColorAcross` → `resolveTargetFor` → `commitCells` (task 03) — minus the transaction (D6).
- Pure node-lane module with exhaustive tests: `pixelBrushStamp.ts` + `pixelBrushStamp.test.ts` (task 06).
- Own-block UI section in the same folder: `ReflectionLinesSection.{tsx,css,stories.tsx}` + its dom test (task 05).
- Container test rig over a real `ApplicationStore`: `PixelStudioPanelContainer.dom.test.tsx`, `usePixelBrush.dom.test.ts`, `pixelBrushTool.dom.test.tsx`.

### Boundaries that must not be crossed
- `ui/` imports nothing from `stores/`, `api/`, `mobx`. `pixelBrushApply.ts` and `PixelStudioBrushApplication.tsx` receive plain data; `types/**` imports are fine (as `pixelBrushStamp.ts` already does).
- `stores/domain/**` never imports `stores/ui/**`; `stores/ui/**` never imports `stores/domain/**`.
- `layer.pixels` / `brush.frames` are never observed. Grids are read inside memos keyed on version counters, or lazily at pointer time inside samplers.
- No transaction is opened inside a stroke (D6). No `key: undefined` on any wire object (D2, D11). Nothing in `server/src/data/`.

### What "done" looks like
- Rail, Brush tool, brush loaded: below the size controls a block titled **Application** with two pressed/unpressed buttons **This object** · **Brush defaults**; under it **Layers** rows (one dropdown each) and **Frames** rows (one text field + reset each).
- Choose `Δ-1` for a layer, paint: the layer below changes, the current layer does not (for that brush layer). Choose a named layer: that layer changes. Switch object: rows show "Brush default (Δ0)". Switch back: the choices are back. Reload: still there.
- Frame `0, 1, 2` on a 3-frame object painted on frame 1 (index 0): frames 1, 2, 3 change; painted on frame 3: only frame 3 changes (the rest culled). One ⌘Z reverts the whole drag.
- Brush defaults: set and reload the brush project — the values persist; the brush file gains `applyDelta` / `applyTo` keys only on the layers/frames that were changed.

### Most likely mistakes
1. **Emitting `brushApplication: undefined`** (or `{}`) on an object — every corpus digest moves and R10's byte count fails. Prune to `undefined` and spread conditionally; destructure the key away, never assign `undefined`.
2. **Opening a transaction in `setPixelsAt`** — it commits the open stroke and the drag becomes two undo entries (or more). `commitCells` records into the stroke transaction on its own.
3. **Resolving a specific layer by id in the target frame** — ids differ per frame; resolve to an index in the current frame (else any frame) and apply by index (D3 rule 2).
4. **Sampling `"target"` cells from `editableGrid()` for a non-current entry** — the burn then reads the wrong layer. Each entry samples its own target via the lazy `lookup` (D7).
5. **Observing grids in `usePixelBrush`** — read `app.currentObject` frames/layers **ids** into the memo and grids inside it, keyed on `domainVersion`/`pixelVersion`; never put a grid in a dependency array as content.
6. **Letting the new UI block push `PixelStudioBrushSection.tsx` over 400 code lines** (an **error** under `src/ui/**`) — the block is its own component and its own CSS file; the section only renders it.
7. **Adding lines to `PixelStudioPanelContainer.tsx` or `toolWidgets.ts`** — both sit at the `max-lines` warning edge; the warning count must not exceed the baseline. The builder lives in `buildBrushApplication.ts`.
8. **Removing `pixelBrushStamp`/`pixelBrushTarget` in W3** — `CanvasContainer` still binds them until task 12; W3 would go red. Add in 09/10, remove in 12.
9. **Reversing the frame list** — frames display in brush order (index 0 first); only **layers** display reversed (top first).
10. **Forgetting `assertUniformLayers`** — `applyDelta` must be written to the layer in **every** frame (`mapLayer` does this); writing it in one frame is still uniform by id/order but diverges in content and `duplicateFrame` would then spread a stale value.

---

## 9. Risk register

| # | Risk | L | I | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- |
| R1 | Plan 14 is not merged when this plan runs; tasks target the wrong brush shape | Med | High | The pre-flight grep at the top of this file; the coordinator marks everything `BLOCKED` rather than adapting. | coordinator |
| R2 | The codec change (task 02) moves a corpus digest or `base-unit.json`'s byte count | Low | **Critical** | Conditional spread copied from `origin`; `bunx vitest run src/types` at every gate; `__snapshots__` untouched; a new roundtrip test asserts key **absence** on a default object and presence on a configured one. Only task 02 opens the codec files. | 02, coordinator |
| R3 | Nested transaction in the stroke splits undo | Med | High | D6 forbids it; `PixelStore.test.ts` gains "setPixelsAt inside an open transaction records into it, one entry"; task 12's manual check ⌘Z after a multi-target drag. | 03, 12 |
| R4 | Stale or mis-targeted `"target"` sampling on mapped entries | Med | Med | Per-entry samplers with lazy lookup (D7); `pixelBrushPlan.test.ts` pins that a non-current entry samples its own layer; manual burn-on-Δ-1 check. | 10, 12 |
| R5 | `max-lines` error in `src/ui/**` from the new component, or the warning count rising past the baseline in containers | Med | Med | Own component + own CSS; builder in its own file; every gate compares the eslint warning count to the recorded baseline. | 05, 11, coordinator |
| R6 | The hook's memo keys miss a case → plan stale after a layer add/reorder, or rebuilt at pointer rate | Med | Med | Keys locked in D8; dom tests: add a layer → plan changes; pixel write → plan identity unchanged when `domainVersion` did not move. | 10 |
| R7 | Corpus JSON fixtures absent in the worktree | High | Low | Copy before the first gate; record in HANDOFF. | coordinator |
| R8 | The owner's brush files gain keys unexpectedly | Low | Med | Keys are written only by explicit setters and dropped at the default value; task 01 pins byte-identical round trip of a default brush; task 08 pins that setting `0`/default removes the key. | 01, 08 |
| R9 | Multi-frame brushes change behaviour (frame `i` → Δ+`i` instead of selected → current) | High (by design) | Low | Stated in §1; recorded in `ARCHITECTURE.md` by task 13; a brush author can set every frame's default to `[0]` to get the old fan-in. | 13 |
| R10 | `bunx` recreates a lockfile | Low | Low | The lockfile `find` runs at every gate. | all |

---

## 10. Rules for every executor

- **Bun only.** `node`/`npm` are not on PATH. `bun add` always `--exact`. Never create a lockfile; never pass the frozen-lockfile flag; run `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` before committing.
- **Never run `vitest -u`.** Snapshot diffs are read by a human. `git status --porcelain | grep __snapshots__` must print nothing.
- **Never touch `server/src/data/`**, `client/src/services/`, `server/src/export/`, `UIStore.toPersistedUIState`. `types/domain.ts` and `types/codecs/**` are task 02 only; `types/brush.ts` is task 01 only. The corpus suites (`bunx vitest run src/types`) must pass unchanged at every gate.
- **Never deep-observe a grid.** `layer.pixels` stays `observable.ref`/plain; `document` stays `observable.ref`; read grids inside memos and samplers, never in dependency arrays as content.
- **The `ui/` boundary.** Nothing under `client/src/ui/` imports a store, the API or MobX; `observer()` only under `containers/`. Run `bun run lint:boundaries`.
- **Stay inside `Touches`.** If you must touch another file, stop, record it under Deviations in `HANDOFF.md`, and say so in your report.
- **Run the gate and paste the real output.** "It passes" is not a report. Paste the eslint warning count and the vitest file/test totals.
- **Do the manual checks** listed in your task. A task whose manual checks were skipped is `PARTIAL`, not `DONE`, and says so.
- **Report honestly, including partial completion.**
- One commit per task, prefixed per D14, with the session's attribution trailers.

---

## 11. Task index

| NN | Title | Wave | Effort | Summary |
| --- | --- | --- | --- | --- |
| 01 | Brush-level apply defaults on the wire | W1 | S | `applyDelta` / `applyTo` optional keys, helpers, normaliser, byte-identical default round trip. |
| 02 | Object-level overrides on the wire | W1 | S | `types/brushApplication.ts`, `PixelObject.brushApplication?`, codec pass-through, absence/presence round-trip tests, corpus unchanged. |
| 03 | `PixelStore.setPixelsAt` | W1 | M | Write to an arbitrary (frame, layer) of the selected object without opening a transaction. |
| 04 | `PixelBrushUIStore.applyScope` | W1 | S | Session-only scope switch. |
| 05 | `PixelStudioBrushApplication` UI + section prop | W1 | L | Pure component, value helpers, CSS, stories, dom tests; `PixelStudioBrushInfo.application?`. |
| 06 | Pure resolver `pixelBrushApply.ts` | W2 | M | Layer/frame target resolution, culling, grouping; plan types. |
| 07 | `ObjectStore` override setters | W2 | S | Undoable per-object setters with pruning, never `undefined`. |
| 08 | `BrushStructureStore` default setters | W2 | S | Snapshot setters dropping keys at the default; duplicate/move carry. |
| 09 | Tool seam: `pixelBrushPlan` + `setPixelsAt` | W3 | S | Handler iterates plan entries; legacy path kept until 12. |
| 10 | Hook: plan builder and target binder | W3 | M | `usePixelBrush` returns a plan; `pixelBrushPlan.ts` reads the object shape and binds samplers. |
| 11 | Panel container wiring | W3 | M | `buildBrushApplication(app)` feeds the UI; scope, options, setters. |
| 12 | `CanvasContainer` wiring + legacy seam removal | W4 | M | Bind plan and `setPixelsAt`; remove `pixelBrushStamp`/`pixelBrushTarget`; integration tests; manual QA. |
| 13 | Final gate, `ARCHITECTURE.md`, QA ledger | W5 | S | `bun run verify` + side gates; docs; manual QA table. |
