# 24 — `UIStore`, `toPersistedUIState()`, and the `Project.uiState` split

**Wave:** W16 · **Depends on:** 23
**Touches:** `client/src/stores/ui/UIStore.ts` (new) · `client/src/stores/ui/ToolUIStore.ts` (new) · `client/src/stores/ui/ViewportUIStore.ts` (new) · `client/src/stores/ApplicationStore.ts` · `client/src/stores/domain/DomainStore.ts` (`serialize()`) · `client/src/stores/bridge/zustandBridge.ts` · `client/src/store/toolActions.ts` · `client/src/components/Toolbar/{Toolbar,PixelStudioTools}.tsx` · `client/src/components/PixelStudioPanel/PixelStudioPanel.tsx` · `client/src/components/RightSidebarTopControls/RightSidebarTopControls.tsx` · `client/src/containers/{ToolbarContainer,PixelStudioToolsContainer,PixelStudioPanelContainer,RightSidebarTopControlsContainer}.tsx` (new) · `client/src/stores/ui/__tests__/` (new)
**Effort:** L

## Objective

After this task the 43 UI fields that live inside the serialized `Project` are owned by `UIStore` sub-stores as first-class observables, while the save payload stays **byte-identical**. This is the hardest coupling in the whole migration, and the wire-format golden test is its gate.

## Context

### The problem this task solves

**`Project.uiState` holds 44 fields inside the object the server owns** (`types/index.ts:125-194`). Of those, **43 are UI, 1 (`aiServiceUrl`) is SESSION, and 0 are DOMAIN.** Meanwhile `EditorState` itself holds only 21 data fields, of which 3 are domain. **The Domain/UI boundary runs *through* the serialized `Project`, not around it.**

Every one of those 44 fields is serialized to the server, deep-cloned into every undo snapshot, and round-tripped through `projectToCompact`/`compactToProject`.

The resolution, applied everywhere:

> **Ownership follows semantics; the wire format follows the server.**
> `UIStore` owns the 43 UI fields as observables. `DomainStore` owns `objects`, `palettes`, `variants`, `referenceImage`, `version`. At save time `DomainStore.serialize()` calls `uiStore.toPersistedUIState()` and merges the result into `CompactProject`, producing a **byte-identical** payload.

```ts
// ApplicationStore constructor — DomainStore never imports UIStore
this.domain.setUIStateProvider(() => this.ui.toPersistedUIState());

// DomainStore
serialize(): CompactProject {
  return {
    version: this.version,
    objects: this.objects.map(objectToCompact),
    palettes: this.palettes.map(paletteToCompact),
    variants: this.variants?.map(variantGroupToCompact),
    referenceImage: this.referenceImage,
    uiState: this.uiStateProvider(),      // ← the 43 UI fields, byte-identical
  };
}
```

**`toPersistedUIState()` is an explicit field-by-field builder, not a spread.** That is what makes the current class of bug — fields present in `UIState` but absent from `CompactUIState`, silently surviving only because `projectToCompact` spreads `...project.uiState` at line 754 — impossible going forward. Task 13 already declared the three previously-undeclared fields; this builder emits them explicitly.

### The fields this task moves (30 of the 43)

**`ToolUIStore`:**

| Field | Kind | Note |
| --- | --- | --- |
| `selectedTool` | `observable` | 16-member union (`types/index.ts:196-212`) |
| `selectedColor` | `observable.ref` | `{r,g,b,a}`, always replaced wholesale; hex in compact form |
| `brushSize` | `observable` | clamped to `pencilBrushMax` inside the action |
| `bitDepth` | `observable` | **written by `setBitDepth`, read by nobody.** Keep the field and the setter for wire compatibility; mark `@deprecated` in TS. **Do not delete it during the migration.** |
| `shapeMode`, `borderRadius` | `observable` | |
| `eraserShape`, `pencilBrushShape`, `pencilBrushMax` | `observable` | |
| `moveAllLayers` | `observable` | read by `moveLayerPixels` — passed as an **argument**, never a cross-store read |
| `originColor` | `observable.ref` | hex-or-undefined in compact form |
| `gaussianFill` | `observable.ref` | `{smoothing, radius, radiusMax?}` |
| `previousTool` | `observable.ref` | eyedropper revert target; **not** persisted (it is an `EditorState` field today, not a `uiState` one) |
| `colorAdjustment` | `observable.ref` | holds a `Map<string, Map<string, {x,y}[]>>` (`storeTypes.ts:32`) — `observable.ref` keeps MobX out of the Map entirely. **Not persisted.** |

**`ViewportUIStore`:**

| Field | Kind | Note |
| --- | --- | --- |
| `zoom` | `observable` | clamped 1..50; the **most-read** uiState field (8 consumers) |
| `panOffset` | `observable.ref` | replaced wholesale |
| `focusMode`, `lightGridMode`, `canvasInfoHidden` | `observable` | |
| `panels.frameReference.{position,minimized,visible}` | `.ref` / `observable` | `visible` defaults to `true` when absent |
| `panels.referenceImage.{position,minimized}` | `.ref` / `observable` | |
| `panels.lightingPreview.{position,minimized}` | `.ref` / `observable` | |

**Panel grouping is an internal shape only.** `toPersistedUIState()` flattens `panels` back to the exact 9 top-level keys (`frameReferencePanelPosition`, `frameReferencePanelMinimized`, `frameReferencePanelVisible`, `referenceImagePanelPosition`, `referenceImagePanelMinimized`, `lightingPreviewPanelPosition`, `lightingPreviewPanelMinimized`, plus the two already covered). **The wire format does not change.**

The 7 near-identical panel setters (`setFrameReferencePanelPosition`, `setFrameReferencePanelMinimized`, `toggleFrameReferencePanelVisible`, `setReferenceImagePanelPosition`, `setReferenceImagePanelMinimized`, `setLightingPreviewPanelPosition`, `setLightingPreviewPanelMinimized`) collapse to one parameterised `setPanel(name, patch)` action.

`traceNudgeAmount` moves to a reference UI store in a later task, not here, though it is a `toolActions` setter today.

**`persistedUIVersion`:** `UIStore` must expose a counter bumped by a reaction over the 43 persisted fields, feeding `AutoSaveController`'s trigger tuple. **A missed bump is silent data loss.** Give it its own unit test, and the inverse test too: editing each persisted field must produce a save.

### `aiServiceUrl` stays in the wire format — OWNER DECISION (2026-08-16), SETTLED

An earlier draft proposed removing `uiState.aiServiceUrl` from `CompactUIState` as the plan's one deliberate format change. **The owner decided to keep it in the project file.** This is settled; do not revisit it and do not ask again.

Concretely:

- `toPersistedUIState()` **emits `session.aiServiceUrl`** into `CompactUIState`. `SessionStore` (task 14) remains the single **read** source; the value round-trips to the project file exactly as it does today.
- **There is now no deliberate wire-format change anywhere in this plan.** The persisted format is byte-identical throughout, which simplifies this task materially: **task 07's golden fixtures need NO re-blessing**, and the byte test below permits **zero** differences.

⚠️ **Known consequence, stated plainly: switching projects still repoints the AI endpoint**, because `aiServiceUrl` is persisted per project. That is **accepted existing behaviour, preserved deliberately** — it is **not** a bug this plan fixes. Filed as a follow-up note; nothing in this task addresses it.

### The rule that keeps the boundary one-directional

Three UI fields **gate domain writes** and are on the hottest path in the app:

- `selection.mask` + `uiState.selectionBehavior` are consulted on **every** `setPixel`/`setPixels` call (`drawingActions.ts:11-24`, `isEditMaskActiveFor`)
- `uiState.variantFrameIndices` is read in **6 modules'** pixel-write paths

A naive split creates a `DomainStore → UIStore` read dependency on that path, or a cycle. **The rule: mask, behaviour and variant frame index are passed as ARGUMENTS to domain actions, never read across the boundary.** Task 05's ESLint rule (`stores/domain/**` may not import `stores/ui/**`) enforces it mechanically. Those three fields move in a later task; the rule is stated here because `moveAllLayers` (moved in this task) has the identical shape and must follow it.

### The four consumers, purified

| Consumer | Store members today | Note |
| --- | ---: | --- |
| `Toolbar` | 5 | also replaces its bespoke portal tooltip with the `Tooltip` primitive |
| `PixelStudioTools` | 4 | |
| `PixelStudioPanel` | 8 (3 + 5, **two separate hook calls**) | collapse to one container |
| `RightSidebarTopControls` | 16 | **0 internal hooks** — nothing stateful can break, which makes it the cheapest big win. It is the union of every tool's option surface. |

⚠️ **`RightSidebarTopControls` reads 16 store members and is a candidate for splitting into `ZoomControls` + `BrushControls` + `ShapeControls` + `SelectionControls`.** Splitting *reduces* total props because each group takes 3-5. **That split is scheduled as its own later task** — here, just give it one container. Do not split and purify in the same session.

Container rules, restated: `observer()` only in `client/src/containers/`; a container reads observables, converts to plain values, and renders exactly one presentational element with props plus bound callbacks; `observer` goes on the **smallest** component that reads observables. Never pass an observable array or a domain node down — project it to a flat view-model.

**Do not move these components into `ui/components/` yet.** That is the purification task's job; here they get containers and stop reading the migrated fields from Zustand.

## Steps

1. Confirm the settled `aiServiceUrl` decision is reflected in the builder you are about to write: it **emits** `session.aiServiceUrl` (owner decision 2026-08-16, no removal, no fixture re-bless).
2. Create `ToolUIStore` and `ViewportUIStore` with the fields and observable kinds in the tables. Collapse the 7 panel setters into `setPanel(name, patch)`.
3. Create `UIStore` composing them, exposing `toPersistedUIState()` as an **explicit field-by-field builder** and `persistedUIVersion`.
4. Wire `this.domain.setUIStateProvider(() => this.ui.toPersistedUIState())` in `ApplicationStore` and switch `serialize()` to use it.
5. **Write the wire-format golden test before migrating any consumer** and confirm it is green: a saved payload must match a frozen `CompactUIState` fixture key-for-key.
6. Migrate the 30 `toolActions` setters to the two stores; delete them from `client/src/store/toolActions.ts`.
7. Move the 30 fields from the bridge's Phase A list to Phase B in the same commit.
8. Create the four containers and route the consumers' reads through them.

## Constraints

- **The save payload must be byte-identical — with no exceptions.** `aiServiceUrl` stays (owner decision, 2026-08-16), so there is no permitted difference at all and **no golden fixture may be re-blessed**. Any diff is a defect. **Task 07's corpus snapshots and the wire-format golden test are the gate; do not proceed past step 5 until both are green.**
- **`toPersistedUIState()` must be an explicit field-by-field builder.** No `...spread`.
- **Do not delete `bitDepth`.** It is written and never read, but it is in the wire format.
- **Do not unify the three floating panels' persistence keys** — `frameReferencePanelPosition`, `referenceImagePanelPosition` and `lightingPreviewPanelPosition` are distinct and must stay distinct.
- `DomainStore` must not import `UIStore`; the provider is injected.
- `moveAllLayers` is passed as an argument to `moveLayerPixels`, never read across the boundary.
- **Do not split `RightSidebarTopControls`** here.
- Do not move any component into `ui/components/`; do not remove `zustand`.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run build && bunx storybook build
bunx vitest run src/stores/ui/__tests__/persistedUIState.test.ts   # key-for-key golden
bunx vitest run src/types/__tests__/                               # corpus snapshots
```

**The byte test:**
```sh
cp "server/src/data/Base Unit.json" /tmp/before.json
# make one edit in the running app, wait for the save
diff <(bun -e "console.log(JSON.stringify(Object.keys(JSON.parse(require('fs').readFileSync('/tmp/before.json','utf8')).uiState).sort(),null,1))") \
     <(bun -e "console.log(JSON.stringify(Object.keys(JSON.parse(require('fs').readFileSync('server/src/data/Base Unit.json','utf8')).uiState).sort(),null,1))")
# There is NO permitted difference. The key sets must be identical, aiServiceUrl included.
```

Manual checks:
1. **Set every one of the 43 UI fields, hard-reload, confirm all 43 persist** — including the four that do **not** persist reliably today: `lightGridMode`, `layerSelectionCounter`, `referenceImagePanelPosition`, `referenceImagePanelMinimized`.
2. Each of the three floating panels: drag, minimise, reload — each must remember **its own** position.
3. Zoom, pan, focus mode, canvas-info visibility, brush size, eraser shape, pencil brush shape and max, shape mode, border radius, origin colour, gaussian fill parameters — all round-trip.
4. Eyedropper: pick a colour and confirm the tool reverts to the previous one.
5. `RightSidebarTopControls` renders and behaves identically (it has no local state, so any change is a wiring error).

## Definition of done

- [ ] `toPersistedUIState()` emits `session.aiServiceUrl` — the field remains in the wire format (owner decision, 2026-08-16) and no fixture was re-blessed.
- [ ] `UIStore`, `ToolUIStore` and `ViewportUIStore` exist; 30 fields moved with the observable kinds specified.
- [ ] `toPersistedUIState()` is an explicit field-by-field builder and flattens `panels` back to the exact 9 top-level keys.
- [ ] `persistedUIVersion` is bumped by a reaction over the persisted fields and feeds `AutoSaveController`; a missed-bump test and an every-field-saves test both exist.
- [ ] **The save payload is byte-identical, with no exceptions.** The `uiState` key sets before and after are identical; task 07's golden fixtures are untouched.
- [ ] All 43 UI fields persist across a reload, including the four that do not today.
- [ ] The 7 panel setters collapsed to `setPanel(name, patch)` with the three keys still distinct.
- [ ] `bitDepth` retained and marked `@deprecated`.
- [ ] `DomainStore` imports nothing from `stores/ui/`; `bunx eslint .` exits 0.
- [ ] Four containers exist; `RightSidebarTopControls` was **not** split.
