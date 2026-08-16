# MobX Architecture Design

**Task:** P2-06 · **Designed:** 2026-08-16 · **Reads:** `findings/store-state.md`,
`findings/api-contract.md` · **Verified against:** `client/src/store/*.ts` (17 files, 8,050 LOC —
confirmed by `wc -l`), `client/src/types/index.ts`, `client/package.json`.

---

## Summary

The locked decision is `ApplicationStore = SessionStore + DomainStore + UIStore`. The audits make
clear that a literal three-class reading of that decision cannot work, for one measured reason:

> **`Project.uiState` holds 44 UI fields inside the object the server owns**
> (`types/index.ts:125-194`, inventory at `store-state.md` §B). 43 are UI, 1 (`aiServiceUrl`) is
> SESSION, **0 are DOMAIN**. Meanwhile `EditorState` itself holds only 21 data fields, of which
> 3 are DOMAIN (`store-state.md` §A). The Domain/UI boundary runs *through* the serialized
> `Project`, not around it.

This design resolves that with **one rule, applied everywhere**:

> **Ownership follows semantics; the wire format follows the server.**
> `UIStore.persisted` owns the 43 UI fields as first-class observables. `DomainStore` owns
> `objects`, `palettes`, `variants`, `referenceImage`, `version`. At save time
> `DomainStore.serialize()` calls `uiStore.toPersistedUIState()` and merges the result into
> `CompactProject`, producing a **byte-identical** payload. Nothing about the wire format,
> the five migrations, or the backup corpus changes.

The four other decisions this document makes:

| Question | Decision |
| --- | --- |
| Undo/redo | **Bespoke command/inverse-patch `HistoryStore` on plain MobX observables.** Reject MST and mobx-keystone. Byte budget (64 MB), not entry count. Redo added. Pixel grids stay `observable.ref` with an explicit `pixelVersion` counter. |
| Auto-save | A single `reaction` on `DomainStore.saveSignal` (a computed tuple of the domain version + UI persisted version), 500 ms debounce, gated on `loadState === "loaded"` and `!historyStore.isReplaying`. `saveStatus` lives on `SessionStore`. |
| Migration strategy | **Incremental, bridged, 12 ordered slices.** Not big-bang. The bridge is a read-only Zustand→MobX sync in one direction at a time, with `useEditorStore` kept alive as a *deprecated facade* until the last slice lands. |
| `observer()` | **Containers only.** Presentational components are never observers and never receive an observable. Enforced by ESLint + a directory convention. |

**Store count:** 1 root + 1 session + 5 domain + 8 UI + 1 history = **16 store files**, largest
projected at **295 LOC**. Total projected store-layer LOC **≈ 2,730** vs today's 8,050 — the
reduction comes from `updateProjectAndSave`'s 129 call sites collapsing into direct mutation, and
from `helpers.ts`'s 6 functions (called ~120× today) becoming 6 `computed`s.

---

## Store tree

```
client/src/stores/
  ApplicationStore.ts              root: constructs + wires children, owns cross-store computeds   ~140
  context.ts                       React context, Provider, typed hooks                             ~60
  configure.ts                     configure({ enforceActions: "always", ... })                     ~25

  session/
    SessionStore.ts                save status, AI endpoint, clipboards, colorHistory, prefs       ~150
    AutoSaveController.ts          the reaction + debounce + backoff (replaces services/autoSave)   ~170

  domain/
    DomainStore.ts                 project root, load/save lifecycle, loadState, serialize()        ~230
    ObjectStore.ts                 objects: add/delete/rename/resize/duplicate/origin              ~250
    FrameStore.ts                  frames + frame tags                                             ~260
    LayerStore.ts                  layers: CRUD, visibility, reorder, squash, move pixels          ~290
    VariantStore.ts                variant groups/variants/variant frames/offsets/variant layers   ~295
    PaletteStore.ts                palette CRUD                                                     ~70
    PixelStore.ts                  setPixel(s), normals, height, flips, normal computation         ~280
                                   — the ONLY writer of PixelData grids

  ui/
    UIStore.ts                     composes UI sub-stores, owns toPersistedUIState()               ~120
    ToolUIStore.ts                 tool, color, brush, shape, gaussian, origin colour              ~230
    ViewportUIStore.ts             zoom, pan, grid, focus, panel geometry (9 panel fields)         ~240
    SelectionUIStore.ts            selection mask/bounds/mode/behaviour + mask ops                 ~260
    TimelineUIStore.ts             selectedObject/Frame/Layer id, variantFrameIndices, view modes  ~200
    LightingUIStore.ts             studioMode, normals/height edit mode, light + ambient, scale    ~180
    ReferenceUIStore.ts            trace overlays, frame-ref object, referenceImage selection      ~190
    ModalUIStore.ts                which modal is open + its params (new; today it is 31× useState)~110
    CanvasInteractionStore.ts      isDrawing, drawStartPoint, previewPixels — NOT observable-deep  ~90

  history/
    HistoryStore.ts                command stack, byte budget, transaction(), undo/redo            ~240
    commands.ts                    Command type + the ~14 concrete command factories               ~280
```

**Projected total: ~4,160 LOC across 21 files, largest 295.** No file over the ~300 guideline.

`commands.ts` at 280 is a flat catalogue of small factories, not a god object — it has no state and
each factory is 10-25 lines. If it grows past 300 it splits by domain (`commands/pixel.ts`,
`commands/structure.ts`).

### One-line responsibilities

| File | Responsibility | Owns state? |
| --- | --- | --- |
| `ApplicationStore` | Constructs children in dependency order; hosts the 6 cross-store `computed`s that replace `helpers.ts`; injects `api` + `history` into domain stores. | No — only computeds |
| `SessionStore` | Anything whose lifetime is the browser tab, not the project. Save status, AI endpoint, both clipboards, colour history, and the seam where auth would land. | Yes |
| `AutoSaveController` | Owns the save `reaction`, the 500 ms debounce, backoff/attempt cap, and the load-state gate. Written as a class so Vitest can instantiate it with fake timers. | Yes (private) |
| `DomainStore` | The `Project` root: `version`, `objects`, `palettes`, `variants`, `referenceImage`, `loadState`, `loadError`. Load/save lifecycle. `serialize()` merges the UI slice. **Imports nothing from `ui/`.** | Yes |
| `ObjectStore`/`FrameStore`/`LayerStore`/`VariantStore`/`PaletteStore`/`PixelStore` | Structural mutations over `DomainStore.objects` / `.variants` / `.palettes`. Each receives `DomainStore` + `HistoryStore` by constructor injection. | No — they mutate `DomainStore`'s tree |
| `UIStore` | Composes the 8 UI sub-stores and is the single owner of `toPersistedUIState(): CompactUIState`. | No — only composition |
| `ToolUIStore` … `ModalUIStore` | Own their slice of the 43 persisted UI fields + 14 ephemeral `EditorState` UI fields. Each declares which of its fields are persisted. | Yes |
| `CanvasInteractionStore` | The 3 TRANSIENT gesture fields. Plain class properties + `observable.ref` for `previewPixels`. Never enters history, never triggers save. | Yes |
| `HistoryStore` | Bounded command stack with a byte budget, `transaction()` batching, `undo()`/`redo()`, and `isReplaying` (the auto-save guard). | Yes |

### Why domain sub-stores mutate `DomainStore`'s tree rather than owning slices

`ObjectStore` does not hold `objects` — `DomainStore` does. The sub-stores are **behaviour modules
over one observable tree**. Reason: `variantActions.ts` (1,412 LOC) mutates `project.objects` *and*
`project.variants` in the same operation (e.g. `makeVariant` at `variantActions.ts:23`, which also
calls `layerActions.selectLayer` at `:446`). Splitting the *data* across sub-stores would recreate
the cross-module edge the audit found (`store-state.md` §Coupling graph) as a cross-store write.
Splitting only the *behaviour* keeps one tree, one `pixelVersion`, and one serializer.

---

## Field migration map

Every field from `store-state.md` §A (21), §B (44), §C (5), §D (6) = **76 fields**, all mapped.

### A. `EditorState` top-level (21)

| # | Current field | Destination | Kind | Notes |
| --- | --- | --- | --- | --- |
| 1 | `project` | `DomainStore` — decomposed into `version`/`objects`/`palettes`/`variants`/`referenceImage`; `uiState` re-homed per §B | `observable.shallow` on arrays; grid leaves `observable.ref` | The `Project` object stops existing as a single runtime value. It is **reconstituted only in `serialize()`**. This is the central change. |
| 2 | `projectName` | `DomainStore.projectName` | `observable` | Audit recommended DOMAIN (`store-state.md` §Contested). **Confirmed.** `DomainStore` owns load/save; `projectApi.save(project, name)` needs both. Placing it in `SessionStore` forces a cross-store read on every save. |
| 3 | `projectList` | `DomainStore.projectList` | `observable.shallow` | Pure API cache of the server directory listing. Refreshed by `flow refreshProjectList`. |
| 4 | `isLoading` | `DomainStore.loadState: "idle"\|"loading"\|"loaded"\|"failed"` | `observable` + `computed isLoading` | **Widened deliberately.** `api-contract.md` D1/R1 (the blank-project overwrite) is closed by `loadState === "failed"` blocking auto-save. A boolean cannot express that. `isLoading` survives as a `computed` so consumers need not change. |
| 5 | `saveStatus` | `SessionStore.saveStatus` | `observable` | Confirmed SESSION. Written by `AutoSaveController`, read by the `Header` container. The 2 s `saved→idle` timer becomes `SessionStore.markSaved()`. |
| 6 | `projectHistory` | **Deleted.** Replaced by `HistoryStore.entries: Command[]` | `observable.shallow` | 100 × 6.9 MB clones → bounded command list. See [Undo/redo design](#undoredo-design). |
| 7 | `historyIndex` | `HistoryStore.index` | `observable` | Same cursor semantics; `canUndo`/`canRedo` become `computed`. |
| 8 | `isDrawing` | `CanvasInteractionStore.isDrawing` | `observable` | Read only by `Canvas.tsx`. Kept observable (not a ref) because the container re-renders the tool cursor on it. |
| 9 | `drawStartPoint` | `CanvasInteractionStore.drawStartPoint` | `observable.ref` | A `Point`, replaced wholesale. Deep observation is waste. |
| 10 | `previewPixels` | `CanvasInteractionStore.previewPixels` | `observable.ref` | Rewritten on **every mousemove**. `observable.ref` + whole-array replacement is mandatory — a deep observable array here is a per-frame allocation storm. |
| 11 | `referenceOverlayOffset` | `ReferenceUIStore.overlayOffset` | `observable` | Ephemeral (not persisted today — preserve). |
| 12 | `frameTraceActive` | `ReferenceUIStore.frameTraceActive` | `observable` | The tool-exclusivity rule currently duplicated at `referenceActions.ts:55-63` **and** `toolActions.ts:24-30` becomes **one** `reaction` in `UIStore`, observing `ToolUIStore.selectedTool`. Single enforcement point. |
| 13 | `frameTraceFrameIndex` | `ReferenceUIStore.frameTraceFrameIndex` | `observable` | Moves atomically with (12) via a single `action`. |
| 14 | `frameOverlayOffset` | `ReferenceUIStore.frameOverlayOffset` | `observable` | Ephemeral. |
| 15 | `frameReferenceObjectId` | `ReferenceUIStore.frameReferenceObjectId` | `observable` | `getFrameReferenceObject()` becomes a `computed` on `ApplicationStore` (needs `DomainStore.objects`). |
| 16 | `colorHistory` | **`SessionStore.colorHistory`** | `observable.shallow`, capped at `MAX_COLOR_HISTORY = 10` | **Overriding the audit's "UI, preserve behaviour" recommendation.** Rationale: findings 02 Q1 itself names it the fourth SessionStore tenant, and the audit's stated reason for UI was "do not change persistence behaviour during migration". This design keeps that promise — `SessionStore.colorHistory` is **not persisted** in the migration; the localStorage hookup is a separate, later item (W-S3). Placing it in `SessionStore` now costs nothing and avoids moving it twice. |
| 17 | `previousTool` | `ToolUIStore.previousTool` | `observable.ref` | Eyedropper revert target. |
| 18 | `selection` | `SelectionUIStore.selection` | `observable.ref` (the `SelectionState`), `mask: Set<number>` **non-observable** | **Contested, resolved: UI.** The `Set` is replaced wholesale on every selection change, so `observable.ref` is exactly right and dodges the `Set`-serialization hazard (`store-state.md` §Persistence defect 5). **The write-path rule from the audit is adopted verbatim:** `PixelStore.setPixels(pixels, mask?)` takes the mask as an argument. `DomainStore` and its sub-stores import nothing from `ui/` — ESLint-enforced. |
| 19 | `colorAdjustment` | `ToolUIStore.colorAdjustment` | `observable.ref` | Holds a `Map<string, Map<string, {x,y}[]>>` (`storeTypes.ts:32`). `observable.ref` keeps MobX out of the Map entirely. Cleared by a `reaction` on tool change / layer change instead of the 3 scattered clear sites today. |
| 20 | `layerClipboard` | **`SessionStore.layerClipboard`** | `observable.ref` | **Contested, resolved: SESSION.** The audit found cross-project survival is *load-bearing* (`store-state.md` §Contested) and that this design's `UIStore` **is** project-scoped (`TimelineUIStore` selection ids are reset on switch). Leaving it in `UIStore` would silently break cross-project layer copy. `SessionStore` preserves it by construction. |
| 21 | `timelineCellClipboard` | **`SessionStore.timelineCellClipboard`** | `observable.ref` | Same reasoning as (20). |

### B. `Project.uiState` — the 44 fields (43 UI + 1 SESSION)

All 43 UI fields land in `UIStore` sub-stores and are marked `persisted: true`, meaning
`UIStore.toPersistedUIState()` emits them into `CompactUIState`. **The wire format does not change.**

| # | Current field | Destination | Kind | Notes |
| --- | --- | --- | --- | --- |
| 1 | `selectedObjectId` | `TimelineUIStore.selectedObjectId` | `observable`, persisted | Feeds `ApplicationStore.currentObject` computed. |
| 2 | `selectedFrameId` | `TimelineUIStore.selectedFrameId` | `observable`, persisted | Feeds `currentFrame`. |
| 3 | `selectedLayerId` | `TimelineUIStore.selectedLayerId` | `observable`, persisted | Feeds `currentLayer`. |
| 4 | `selectedTool` | `ToolUIStore.selectedTool` | `observable`, persisted | 16-member union (`types/index.ts:196-212`). |
| 5 | `selectedColor` | `ToolUIStore.selectedColor` | `observable.ref`, persisted | `Color` is `{r,g,b,a}`, always replaced wholesale. |
| 6 | `selectionMode` | `SelectionUIStore.mode` | `observable`, persisted | Default `"rect"`. |
| 7 | `selectionBehavior` | `SelectionUIStore.behavior` | `observable`, persisted | Gates pixel writes. Passed as an **argument** to `PixelStore`, never read across the boundary. |
| 8 | `focusMode` | `ViewportUIStore.focusMode` | `observable`, persisted | |
| 9 | `lightGridMode` | `ViewportUIStore.lightGridMode` | `observable`, persisted | Absent from `CompactUIState` today (`api-contract.md` D12). The explicit `toPersistedUIState()` **adds it properly** — this design removes the `...spread` that hid the bug. |
| 10 | `brushSize` | `ToolUIStore.brushSize` | `observable`, persisted | Clamped to `pencilBrushMax` in the `action`. |
| 11 | `bitDepth` | `ToolUIStore.bitDepth` | `observable`, persisted | **Written, never read** (`store-state.md` §B row 11). Keep the field (wire compat) and the setter; mark `@deprecated` in TS. Do **not** delete during the migration. |
| 12 | `shapeMode` | `ToolUIStore.shapeMode` | `observable`, persisted | |
| 13 | `borderRadius` | `ToolUIStore.borderRadius` | `observable`, persisted | |
| 14 | `zoom` | `ViewportUIStore.zoom` | `observable`, persisted | Most-read uiState field (8 consumers). Clamped 1..50. |
| 15 | `panOffset` | `ViewportUIStore.panOffset` | `observable.ref`, persisted | Replaced wholesale. |
| 16 | `moveAllLayers` | `ToolUIStore.moveAllLayers` | `observable`, persisted | Read by `LayerStore.moveLayerPixels` — passed as an **argument**. |
| 17 | `eraserShape` | `ToolUIStore.eraserShape` | `observable`, persisted | |
| 18 | `pencilBrushShape` | `ToolUIStore.pencilBrushShape` | `observable`, persisted | |
| 19 | `pencilBrushMax` | `ToolUIStore.pencilBrushMax` | `observable`, persisted | |
| 20 | `traceNudgeAmount` | `ReferenceUIStore.traceNudgeAmount` | `observable`, persisted | Semantically a trace setting; moved from Tool to Reference for cohesion. Wire key unchanged. |
| 21 | `variantFrameIndices` | `TimelineUIStore.variantFrameIndices` | `observable` map (plain object, `observable` deep — it is `{[id]: number}`, tiny), persisted | **The most load-bearing UI field** — read in 6 modules' pixel-write paths. Under this design it is read by `ApplicationStore.currentVariant` (a computed) and passed **into** domain actions as an argument. |
| 22 | `layerSelectionCounter` | `TimelineUIStore.layerSelectionCounter` | `observable`, persisted | Silently dropped today (`api-contract.md` D12). `toPersistedUIState()` fixes it. |
| 23 | `studioMode` | `LightingUIStore.studioMode` | `observable`, persisted | One of the **8 setters that never autosave today** (`lightingActions.ts:11-129`). Under the save reaction the bug is fixed **structurally** — any observable in the persisted set triggers a save. |
| 24 | `lightingDataLayerEditMode` | `LightingUIStore.dataLayerEditMode` | `observable`, persisted | Same — bug fixed by construction. |
| 25 | `selectedNormal` | `LightingUIStore.selectedNormal` | `observable.ref`, persisted | Packed to an int in compact form. |
| 26 | `lightDirection` | `LightingUIStore.lightDirection` | `observable.ref`, persisted | Packed. |
| 27 | `lightColor` | `LightingUIStore.lightColor` | `observable.ref`, persisted | Hex in compact form. |
| 28 | `ambientColor` | `LightingUIStore.ambientColor` | `observable.ref`, persisted | Hex. |
| 29 | `heightScale` | `LightingUIStore.heightScale` | `observable`, persisted | Clamped 1..500. |
| 30 | `heightBrushValue` | `LightingUIStore.heightBrushValue` | `observable`, persisted | Clamped 0..255. |
| 31 | `normalBrushShape` | `LightingUIStore.normalBrushShape` | `observable`, persisted | The one lighting field that *does* autosave today (`toolActions.ts:200`). |
| 32 | `frameReferencePanelPosition` | `ViewportUIStore.panels.frameReference.position` | `observable.ref`, persisted | See panel note below. |
| 33 | `frameReferencePanelMinimized` | `ViewportUIStore.panels.frameReference.minimized` | `observable`, persisted | The duplicate `useState` in `FrameReferencePanel.tsx` is **deleted**, not carried over. |
| 34 | `frameReferencePanelVisible` | `ViewportUIStore.panels.frameReference.visible` | `observable`, persisted | Defaults `true` when absent. |
| 35 | `referenceImagePanelPosition` | `ViewportUIStore.panels.referenceImage.position` | `observable.ref`, persisted | Dropped on save today (D12). Fixed. |
| 36 | `referenceImagePanelMinimized` | `ViewportUIStore.panels.referenceImage.minimized` | `observable`, persisted | Dropped today. Fixed. |
| 37 | `lightingPreviewPanelPosition` | `ViewportUIStore.panels.lightingPreview.position` | `observable.ref`, persisted | |
| 38 | `lightingPreviewPanelMinimized` | `ViewportUIStore.panels.lightingPreview.minimized` | `observable`, persisted | |
| 39 | `canvasInfoHidden` | `ViewportUIStore.canvasInfoHidden` | `observable`, persisted | |
| 40 | `objectLibraryViewMode` | `TimelineUIStore.objectLibraryViewMode` | `observable`, persisted | |
| 41 | `timelineThumbnailMode` | `TimelineUIStore.timelineThumbnailMode` | `observable`, persisted | |
| 42 | `originColor` | `ToolUIStore.originColor` | `observable.ref`, persisted | Hex-or-undefined in compact. |
| 43 | `gaussianFill` | `ToolUIStore.gaussianFill` | `observable.ref`, persisted | Tool parameters, replaced wholesale. |
| 44 | `aiServiceUrl` | **`SessionStore.aiServiceUrl`** | `observable`, **NOT persisted into `CompactUIState`** | **The one deliberate wire-format change in this design.** Persisting an app-level endpoint per project is a live bug (`store-state.md` Q1): switching projects silently repoints the AI service. Read-compat is preserved: on load, if `compact.uiState.aiServiceUrl` is present, `SessionStore` adopts it (once) and it is **not re-emitted**. Field disappears from new saves. Requires an explicit re-bless of the golden fixtures — see [Risks](#risks) R4. |

**Panel note (32-38):** grouping the 9 panel fields under a `panels` record is an internal shape
only. `toPersistedUIState()` flattens them back to the exact 9 top-level keys. Wire format unchanged.

### C. `Project` domain fields (5)

| Current field | Destination | Kind | Notes |
| --- | --- | --- | --- |
| `version` | `DomainStore.version` | `observable` | Becomes `schemaVersion` when `api-contract.md` W5 lands; until then, carried verbatim. |
| `objects` | `DomainStore.objects` | `observable.shallow` array; each `PixelObject`/`Frame`/`Layer` is `makeAutoObservable` **except** `layer.pixels` | `layer.pixels: PixelData[][]` is **`observable.ref`**. This is the single most important performance decision in the design — see [Pixel grid contract](#pixel-grid-contract). |
| `palettes` | `DomainStore.palettes` | `observable` array of `observable` palettes | Small (a few hundred colours). Deep observation is affordable and gives `PaletteManager` free granularity. |
| `variants` | `DomainStore.variants` | `observable.shallow`; `VariantFrame.layers[].pixels` is `observable.ref` | Same grid rule as `objects`. |
| `referenceImage` | `DomainStore.referenceImage` | `observable.ref` | A whole base64 PNG. `observable.ref` and **never** in a history command (see below) — this alone removes up to 100 MB of duplicated PNG from history. |

### D. `persistentState` in `ReferenceImageModal.tsx:29-38` (6)

| Current field | Destination | Kind | Notes |
| --- | --- | --- | --- |
| `image` | `ReferenceUIStore.image` | `observable.ref` | A live `HTMLImageElement`. `observable.ref` is the only safe kind; it must never be cloned, serialized, or entered into history. |
| `imageUrl` | `ReferenceUIStore.imageUrl` | `observable.ref` | Base64 mirror. |
| `selection` (`SelectionBox`) | `ReferenceUIStore.referenceImageSelection` | `observable.ref` | The one field with real shared behaviour (modal + panel). `shiftReferenceSelection`, `shiftReferenceSelectionBySize`, `adjustReferenceBoxSize` become `ReferenceUIStore` **actions**. |
| `zoom` | **Component-local `useState`** in the modal | — | Modal viewport only; nothing outside reads it. |
| `panOffset` | **Component-local `useState`** in the modal | — | Same. |
| `hasBeenActivated` | **Deleted** | — | Written 3×, read 0×. Confirmed dead. |

**Bucket totals after migration:** `DomainStore` 8 · `SessionStore` 5 (`saveStatus`,
`aiServiceUrl`, 2 clipboards, `colorHistory`) · `UIStore` 60 · `CanvasInteractionStore` 3 ·
deleted 1 (`hasBeenActivated`) · replaced 2 (`projectHistory`, `historyIndex` → `HistoryStore`).

---

## Action migration map

All 17 modules and every action from `storeTypes.ts:119-441` (verified by direct read).

| Current action | Module | Destination | Kind |
| --- | --- | --- | --- |
| `initProject` | projectActions | `DomainStore.initProject` | **flow** |
| `createNewProject` | projectActions | `DomainStore.createProject` | **flow** |
| `switchToProject` | projectActions | `DomainStore.switchProject` | **flow** |
| `renameCurrentProject` | projectActions | `DomainStore.renameProject` | **flow** — must call `autoSave.cancelPending()` (fixes the defect at `projectActions.ts:111-129`) |
| `deleteCurrentProject` | projectActions | `DomainStore.deleteProject` | **flow** |
| `refreshProjectList` | projectActions | `DomainStore.refreshProjectList` | **flow** |
| `restoreFromBackup` | projectActions | `DomainStore.restoreFromBackup` | **flow** |
| `undo` | projectActions | `HistoryStore.undo` | action |
| *(new)* `redo` | — | `HistoryStore.redo` | action |
| `addObject`, `deleteObject`, `renameObject`, `resizeObject`, `selectObject`, `duplicateObject`, `setObjectOrigin` | objectActions (7) | `ObjectStore` (`selectObject` → `TimelineUIStore.selectObject`) | action ×6, action ×1 (UI) |
| `setOriginColor` | objectActions | `ToolUIStore.setOriginColor` | action |
| `addFrame`, `deleteFrame`, `deleteSelectedFrame`, `renameFrame`, `duplicateFrame`, `moveFrame`, `reorderFrame`, `addFrameTag`, `removeFrameTag` | frameActions (9) | `FrameStore` | action |
| `selectFrame` | frameActions | `TimelineUIStore.selectFrame` | action — the `syncVariants` branch reads `DomainStore.variants` **via an injected computed**, not a store import |
| `addLayer`, `duplicateLayer`, `deleteLayer`, `renameLayer`, `toggleLayerVisibility`, `toggleAllLayersVisibility`, `moveLayer`, `moveLayerAcrossAllFrames`, `deleteLayerAcrossAllFrames`, `squashLayerDown/Up`, `squashLayerDown/UpAcrossAllFrames`, `moveLayerPixels` | layerActions (14) | `LayerStore` | action |
| `selectLayer` | layerActions | `TimelineUIStore.selectLayer` | action — also bumps `layerSelectionCounter`. **This retires the one cross-module edge** (`variantActions.ts:446,1407`): `VariantStore` calls `timelineUI.selectLayer` through an injected callback, not a store import. |
| `copyLayerToClipboard` | layerClipboardActions | `LayerStore.copyLayerToClipboard` → writes `SessionStore.layerClipboard` | action |
| `pasteLayerFromClipboard`, `copyLayerFromObject` | layerClipboardActions | `LayerStore` | action |
| `addLayerToAllFrames`, `addLayerToFrameAtPosition`, `deleteLayerFromFrame`, `reorderLayerInFrame` | timelineActions (4) | `LayerStore` | action — these are layer ops with a frame scope, not a distinct concern |
| `copyTimelineCell`, `pasteTimelineCell` | timelineActions (2) | `LayerStore` (clipboard on `SessionStore`) | action |
| `beginStroke`, `endStroke` | drawingActions | `HistoryStore.beginTransaction` / `endTransaction` | action — **promotes the `_strokeActive` module closure (`drawingActions.ts:10`) to a first-class primitive**, so variant offsets, normal painting, and the AI modal can batch too |
| `setPixel`, `setPixels` | drawingActions | `PixelStore.setPixel(s)(pixels, opts?)` | action — mask + behaviour + variantFrameIndex arrive as **arguments** |
| `startDrawing`, `updateDrawing`, `endDrawing` | drawingActions | `CanvasInteractionStore` | action |
| `setPreviewPixels`, `clearPreviewPixels` | drawingActions | `CanvasInteractionStore` | action |
| `setTool`, `revertToPreviousTool` | toolActions | `ToolUIStore` | action — tool/trace exclusivity moves to a single `reaction` |
| `setColor`, `setColorAndAddToHistory`, `addToColorHistory` | toolActions | `ToolUIStore.setColor` + `SessionStore.addToColorHistory` | action |
| `setBrushSize`, `setEraserShape`, `setPencilBrushShape`, `setPencilBrushMax`, `setNormalBrushShape`, `setBitDepth`, `setShapeMode`, `setBorderRadius`, `setGaussianFillParams` | toolActions (9) | `ToolUIStore` | action |
| `setTraceNudgeAmount` | toolActions | `ReferenceUIStore` | action |
| `setZoom`, `setPanOffset`, `toggleFocusMode`, `toggleLightGridMode`, `setCanvasInfoHidden` | toolActions (5) | `ViewportUIStore` | action |
| `setFrameReferencePanelPosition/Minimized`, `toggleFrameReferencePanelVisible`, `setReferenceImagePanelPosition/Minimized`, `setLightingPreviewPanelPosition/Minimized` | toolActions (7) | `ViewportUIStore.setPanel(name, patch)` | action — 7 near-identical setters collapse to 1 parameterized action |
| `setMoveAllLayers` | toolActions | `ToolUIStore` | action |
| `setObjectLibraryViewMode`, `setTimelineThumbnailMode` | toolActions (2) | `TimelineUIStore` | action |
| `setSelectionMode`, `setSelectionBehavior` | toolActions (2) | `SelectionUIStore` | action |
| `setAiServiceUrl` | toolActions | `SessionStore.setAiServiceUrl` | action |
| `addPalette`, `deletePalette`, `renamePalette`, `addColorToPalette`, `removeColorFromPalette` | paletteActions (5) | `PaletteStore` | action — remain non-undoable (Q2 preserved) |
| `setReferenceOverlayOffset`, `moveReferenceOverlay`, `resetReferenceOverlay`, `setFrameTraceActive`, `moveFrameOverlay`, `resetFrameOverlay`, `setFrameReferenceObjectId` | referenceActions (7) | `ReferenceUIStore` | action |
| `setReferenceImage` | referenceActions | `DomainStore.setReferenceImage` | action — writes `project.referenceImage`, non-undoable |
| `getFrameReferenceObject` | referenceActions | `ApplicationStore.frameReferenceObject` | **computed** |
| `setSelection`, `setSelectionMask`, `clearSelection`, `expandSelection`, `shrinkSelection`, `selectFloodFillAt`, `selectAllByColorAt`, `selectLasso`, `moveSelection` | selectionActions (9) | `SelectionUIStore` | action — the 3 pixel-sampling selects (`selectFloodFillAt`, `selectAllByColorAt`) receive the layer grid as an argument |
| `moveSelectedPixels`, `deleteSelectionPixels` | selectionActions (2) | `PixelStore` (mask passed in) | action |
| `startColorAdjustment`, `clearColorAdjustment` | colorAdjustmentActions (2) | `ToolUIStore` | action |
| `adjustColor` | colorAdjustmentActions | `PixelStore.adjustColor(newColor, session, trackHistory)` | action |
| `saveCurrentStateToHistory` | index.ts (exposed as an action) | `HistoryStore.snapshot()` | action — retained only for the ~10 structural ops that legitimately need a full snapshot |
| `makeVariant`, `addVariant`, `deleteVariant`, `deleteVariantGroup`, `renameVariant`, `renameVariantGroup`, `resizeVariant`, `setVariantOffset`, `duplicateVariantFrame`, `deleteVariantFrame`, `addVariantFrameTag`, `removeVariantFrameTag`, `addVariantFrame`, `moveVariantFrame`, `reorderVariantFrame`, `addVariantLayerFromExisting`, `removeVariantLayer` | variantActions (17) | `VariantStore` | action |
| `selectVariant`, `selectVariantFrame`, `advanceVariantFrames` | variantActions (3) | `TimelineUIStore` (they write `variantFrameIndices` / layer selection) | action |
| `setStudioMode`, `setLightingDataLayerEditMode`, `setSelectedNormal`, `setLightDirection`, `setLightColor`, `setAmbientColor`, `setHeightScale`, `setHeightBrushValue` | lightingActions (8) | `LightingUIStore` | action — **the 8 no-autosave setters; the save reaction fixes them structurally** |
| `setLightingPreviewPanelPosition/Minimized` | lightingActions (2) | `ViewportUIStore.setPanel` | action |
| `setNormalPixel`, `setNormalPixels`, `setNormalPixelsForAllFrames`, `setHeightPixels` | lightingActions (4) | `PixelStore` | action |
| `computeNormalsForAllFrames` | lightingActions | `PixelStore.computeNormalsForAllFrames` | **flow** — long-running; today it runs **inside `LightingStudioTools.tsx`** and blocks. As a `flow` it can yield between frames and report progress. |
| `flipHorizontal`, `flipVertical` | lightingActions (2) | `PixelStore` | action — snapshot-backed commands |
| `getCurrentObject` | helpers | `ApplicationStore.currentObject` | **computed** |
| `getCurrentFrame` | helpers | `ApplicationStore.currentFrame` | **computed** |
| `getCurrentLayer` | helpers | `ApplicationStore.currentLayer` | **computed** |
| `getCurrentVariant` | helpers | `ApplicationStore.currentVariant` | **computed** |
| `getSelectedVariantLayer` | helpers | `ApplicationStore.selectedVariantLayer` | **computed** |
| `isEditingVariant` | helpers | `ApplicationStore.isEditingVariant` | **computed** |
| `updateProjectAndSave` (the closure, `index.ts:51-85`, **129 call sites**) | index.ts | **Decomposed into 4 independent mechanisms** | see below |
| `setOnSaveStatusChange` wiring (`index.ts:37-48`) | index.ts | `AutoSaveController` + `SessionStore.setSaveStatus` | — |

### Decomposing `updateProjectAndSave`

The audit's central finding is that the real coupling is this one closure doing four jobs
(`store-state.md` §Coupling graph). Under MobX each job gets its own mechanism, and the 129 call
sites stop calling anything:

| Job today | Under MobX | Who triggers it |
| --- | --- | --- |
| 1. Mutate `project` immutably and `set()` it | Direct mutation inside an `action` on the observable tree | The action itself |
| 2. Deep-clone the pre-state (5.1 ms) | **Gone** for 90 % of ops — replaced by an inverse command | `HistoryStore.record(command)` |
| 3. Push to `projectHistory` with the `MAX_HISTORY` cap | `HistoryStore.push()` with a **byte budget** | `HistoryStore` |
| 4. `scheduleAutoSave(newProject, projectName)` | A `reaction` on the save signal | `AutoSaveController` — **nobody calls it explicitly** |

Job 4 becoming implicit is what fixes the 8 lighting setters and what makes the
`AIInterpolateModal` bypass (`AIInterpolateModal.tsx:754,841,766,853`) impossible to write.

### `flow` vs `action` summary

**`flow` (7):** `initProject`, `createProject`, `switchProject`, `renameProject`, `deleteProject`,
`refreshProjectList`, `restoreFromBackup`, plus `computeNormalsForAllFrames` and the AI job
orchestration (`submitInterpolationJob`) = **9 total**. Everything touching the API is a `flow`;
`flow` gives implicit `action` wrapping after each `yield`, which `async/await` does not under
`enforceActions: "always"`.

**`computed` (7 from helpers/getters + the derived layer below).**
**`action`: everything else (~155).**

---

## Computed layer

This is the `UIStore` mandate — "mutating Domain data into structures React can consume". Inputs are
listed precisely so a reviewer can verify the dependency set.

| Computed | Store | Inputs | Consumers | Memoization |
| --- | --- | --- | --- | --- |
| `currentObject` | `ApplicationStore` | `domain.objects`, `timelineUI.selectedObjectId` | 12 containers + `currentFrame` | plain `computed` |
| `currentFrame` | `ApplicationStore` | `currentObject`, `timelineUI.selectedFrameId` | 9 containers + `currentLayer` | plain `computed` |
| `currentLayer` | `ApplicationStore` | `currentFrame`, `timelineUI.selectedLayerId` | 7 containers + `currentVariant` | plain `computed` |
| `currentVariant` | `ApplicationStore` | `currentObject`, `currentLayer`, `domain.variants`, `timelineUI.variantFrameIndices`, `timelineUI.selectedFrameId` | `Canvas`, `LightingCanvas`, `LayerPanel`, `VariantView`, `CanvasInfo`, `HeightMapModal` | plain `computed` — replaces the 60-line scan at `helpers.ts:33-79` run on **every** call today |
| `selectedVariantLayer` | `ApplicationStore` | `currentVariant` | `LayerPanel`, pixel write paths | plain `computed` |
| `isEditingVariant` | `ApplicationStore` | `currentLayer` | `Canvas`, `CanvasInfo`, `LayerPanel`, `HeightMapModal` | plain `computed` |
| `frameReferenceObject` | `ApplicationStore` | `domain.objects`, `referenceUI.frameReferenceObjectId`, `currentObject` | `FrameReferencePanel` | plain `computed` |
| `activeGrid` | `ApplicationStore` | `currentVariant`, `currentLayer` | `PixelStore`, `Canvas` | plain `computed` — the "which `PixelData[][]` am I writing to" resolution, currently reimplemented in `drawingActions`, `selectionActions`, `colorAdjustmentActions`, `lightingActions` |
| `orderedLayers` | `UIStore` | `currentFrame.layers` | `LayerPanel`, `TimelineView` | plain `computed` — layers are stored bottom-up and displayed top-down; the `.slice().reverse()` currently happens in 3 components |
| `visibleLayers` | `UIStore` | `orderedLayers` | `Canvas` composite | plain `computed` |
| `compositedFrame(frameId)` | `UIStore` | `currentObject.frames`, `domain.pixelVersion`, `visibleLayers` | `Canvas`, `FramesView` thumbnails, `TimelineView` thumbnails | **`computedFn`** — parameterized by frame id; **must** also depend on `pixelVersion` since grids are `observable.ref` |
| `layerThumbnail(frameId, layerId)` | `UIStore` | same + `pixelVersion` | `TimelineView` (up to 360 cells on the measured project) | **`computedFn`** with `keepAlive: false` — 360 entries would leak without eviction |
| `frameRange` | `TimelineUIStore` | `currentObject.frames`, `zoom`, container width (passed in) | `TimelineView`, `FramesView` | plain `computed` |
| `variantTree` | `UIStore` | `domain.variants`, `currentObject`, `variantFrameIndices` | `VariantView`, `AddVariantModal`, `VariantSelectModal`, `ObjectLibrary` | plain `computed` — the flattened `group → variant → frame → layer` view all four rebuild by hand today |
| `paletteGroups` | `UIStore` | `domain.palettes`, `toolUI.selectedColor` | `PaletteManager`, `ColorPicker` | plain `computed` — includes `isSelected` per swatch |
| `layerColors(layerId)` | `UIStore` | `activeGrid`, `pixelVersion` | `LayerColors` | **`computedFn`** — `LayerColors.tsx` currently scans every pixel **inside render** |
| `objectThumbnails` | `UIStore` | `domain.objects`, `pixelVersion`, `objectLibraryViewMode` | `ObjectLibrary` | plain `computed` — replaces the custom `React.memo` comparators that thread `project` internals |
| `canUndo` / `canRedo` | `HistoryStore` | `entries.length`, `index` | `Canvas`, `Header` | plain `computed` |
| `historyBytes` | `HistoryStore` | `entries` | dev overlay only | plain `computed` |
| `persistedUIState` | `UIStore` | all 43 persisted UI observables | `AutoSaveController`, `DomainStore.serialize()` | plain `computed` — also the auto-save trigger |
| `saveSignal` | `DomainStore` | `domainVersion`, `pixelVersion`, `uiStore.persistedUIVersion` | `AutoSaveController` reaction | plain `computed` |
| `isLoading` | `DomainStore` | `loadState` | `App` | plain `computed` — back-compat shim |
| `aiConnectionState` | `SessionStore` | last `aiApi.health()` result | `Header`, `AIInterpolateModal` | plain `computed` — must honour `remote_configured` (`api-contract.md` D5) |

`computedFn` comes from `mobx-utils`. **Rule:** use `computedFn` only where the parameter space is
bounded and the result is expensive (the 4 above). Never `computedFn` on a hot path called with a
fresh object identity each render — it will grow without bound.

### Pixel grid contract

Non-negotiable, and the single largest performance risk (`store-state.md` R2 — 300,249 cells,
~1M proxies if done naively):

1. `Layer.pixels: PixelData[][]` is **`observable.ref`**. MobX never sees inside it.
2. Only `PixelStore` writes grids. Every write path ends with `domain.bumpPixelVersion()`.
3. `pixelVersion: number` is a plain `observable`. Anything deriving from pixel content **must**
   read `pixelVersion` — this includes all four `computedFn`s above.
4. `Canvas.tsx` and `LightingCanvas.tsx` are imperative `<canvas>` renderers: they use a single
   `reaction(() => [pixelVersion, zoom, panOffset, ...], redraw)`, **not** `observer` on grid data.
5. Grid *replacement* (resize, flip, paste) assigns a new array — that is a `ref` write and does
   propagate.

A lint rule (`no-restricted-syntax`) forbids `makeAutoObservable` on any type whose name matches
`/Pixel(Data)?|Normal$/`.

---

## Undo/redo design

### Options considered

| Option | Assessment against **this** codebase | Verdict |
| --- | --- | --- |
| **Manual snapshot stack** (today's approach, ported) | Measured: 6.9 MB/snapshot, ~680 MB at `MAX_HISTORY=100`, 5.1 ms synchronous main-thread block × 74 of 129 call sites (`store-state.md` §Undo & history). Porting it preserves every one of those numbers and adds nothing. | **Reject.** It is the problem. |
| **`mobx-state-tree`** | Every node must be a declared model and MST **copies on assignment**. The 300k-cell grid becomes 300k MST nodes. Requires rewriting 7 recursive types + a 44-field `UIState` in `types/index.ts` (1,086 LOC) before a single feature works. | **Reject.** Node overhead on the grid is disqualifying; the type rewrite is a multi-week prerequisite. |
| **`mobx-keystone`** | Lighter, gives `onPatch`/`applyPatch`/`UndoManager` free, does not copy on assignment. Still requires `@model` classes for the whole tree and still wraps array elements — the 300k grid problem is unsolved, only reduced. | **Viable fallback, not the recommendation.** |
| **Bespoke command / inverse-patch history on plain MobX observables** | The store already knows the exact shape of every mutation: `setPixel` knows `(x,y,old,new)`; `moveLayer` knows `(from,to)`; `deleteFrame` knows the frame it removed. An entry becomes ~40 bytes, not 6.9 MB. `beginStroke`/`endStroke` (`drawingActions.ts:27-34`) already define the batching boundary. Crucially it is the **only** option that lets the grid stay a plain non-observable buffer. | **RECOMMENDED.** |

### Recommendation

**Bespoke `HistoryStore` with `Command` records, on plain MobX observables.** This confirms
findings 02's recommendation. I evaluated it critically and it holds — for one reason the audit
states and I verified: every library option must represent the 300k-cell grid inside its reactive
tree, and this app's grids are written by `<canvas>`-style imperative code that wants a mutable
buffer. The libraries solve "arbitrary unknown mutations" — a problem this app does not have, since
every mutation goes through one of ~155 named actions.

### Shape

```ts
// client/src/stores/history/commands.ts
export interface Command {
  readonly label: string;          // "Draw", "Delete frame", "Resize object"
  readonly bytes: number;          // estimated cost, charged against the budget
  undo(): void;
  redo(): void;
}

// client/src/stores/history/HistoryStore.ts
class HistoryStore {
  entries: Command[] = [];              // observable.shallow
  index = -1;                           // observable
  isReplaying = false;                  // observable — the auto-save guard
  private txn: Command[] | null = null; // open transaction

  get canUndo() { return this.index >= 0; }
  get canRedo() { return this.index < this.entries.length - 1; }
  get historyBytes() { /* sum */ }

  beginTransaction(label: string): void;   // was: beginStroke
  endTransaction(): void;                  // was: endStroke — collapses to one CompositeCommand
  record(cmd: Command): void;              // no-op while isReplaying
  snapshot(label: string): void;           // full-clone escape hatch, ~10 structural ops
  undo(): void; redo(): void;
  clear(): void;                           // on project switch
}
```

Three command families:

| Family | Ops | Entry cost | Example |
| --- | --- | --- | --- |
| **Inverse patch** | `setPixel(s)`, `setNormalPixels`, `setHeightPixels`, `adjustColor`, `moveSelectedPixels`, `deleteSelectionPixels`, `setVariantOffset` | ~24 bytes/pixel changed | Record `(gridRef, [{x,y,before,after}])`. A 50-pixel stroke = ~1.2 kB. |
| **Structural inverse** | `addLayer`, `deleteLayer`, `moveLayer`, `addFrame`, `deleteFrame`, `reorderFrame`, `renameObject`, `addVariant`, `deleteVariant`, layer/timeline clipboard ops | size of the removed/added node only | `deleteFrame` holds the detached `Frame` (which already contains its grids) — the grids are *moved*, not cloned. |
| **Snapshot** | `resizeObject`, `resizeVariant`, `flipHorizontal`, `flipVertical`, `squashLayer*` (×4), `computeNormalsForAllFrames`, `pasteLayerFromClipboard` | up to 6.9 MB, charged honestly | Keeps today's clone for the ~11 ops where an inverse is genuinely intractable. All are slow, deliberate, infrequent. |

### Budget

Replace `MAX_HISTORY = 100` (`storeTypes.ts`) with `MAX_HISTORY_BYTES = 64 * 1024 * 1024`. Evicting
from the front until under budget. This resolves `store-state.md` Q4 in favour of a byte budget: a
count cap is meaningless when entries span 40 bytes to 6.9 MB. 64 MB allows roughly **50,000
pixel-level undos** or **9 full snapshots** — both far better than today's uniform 100.

### Memory & CPU comparison (honest)

| Scenario | Today (measured) | Proposed (projected) | Basis |
| --- | --- | --- | --- |
| 100 pencil strokes, 50 px each | 100 × 6.9 MB = **690 MB** | 100 × ~1.2 kB = **120 kB** | 24 B/pixel × 50, one composite entry per stroke |
| 100 layer add/delete ops | **690 MB** | ~100 × grid size of one layer (768 cells × ~24 B ≈ 18 kB) = **1.8 MB** | detached node, grids moved not cloned |
| 20 `resizeObject` ops | 20 × 6.9 MB = **138 MB** | 20 × 6.9 MB = **138 MB**, capped at 64 MB → ~9 retained | unchanged — snapshot family |
| Realistic mixed session | ~**680 MB** at cap | **< 64 MB** by construction | budget |
| CPU per history-tracked mutation | **5.1 ms blocking**, ×74 call sites | **< 0.1 ms** for patch/structural; 5.1 ms retained for the 11 snapshot ops | no `projectToCompact` round trip |

**Honest caveats:**
1. The snapshot family is genuinely no better than today. It is ~11 of ~155 actions, all of which
   are already visibly slow and user-initiated.
2. `referenceImage` (a full base64 PNG) is **excluded from every command**. Today it is cloned into
   all 100 snapshots — up to 100 MB of duplicated PNG. `setReferenceImage` stays non-undoable, as it
   is today (`referenceActions.ts:47`).
3. Command correctness is now **the developer's responsibility per action**, not automatic. This is
   the real cost of rejecting the libraries, and it is why W7 (characterisation tests) must exist
   before any command is written.

### Migration path

1. **Before touching MobX:** write the characterisation suite against the *Zustand* store
   (`store-state.md` W7) — undo-depth matrix, stroke batching, the 47-site non-undoable set. This is
   the only baseline that will exist.
2. Port the **129-site `trackHistory` classification verbatim** as the initial mapping. It is
   already a hand-audited answer to "what is undoable"; do not re-derive it. `true` → record a
   command; `false` → record nothing; `!_strokeActive` → inside a transaction.
3. Implement `HistoryStore` + the snapshot family **first**. At that point behaviour is identical to
   today (all commands are full snapshots) and the characterisation suite must pass unchanged.
4. Convert families to inverse patches one at a time, re-running the suite after each. Pixel commands
   first (biggest win), structural second, snapshots left alone.
5. Add `redo` (resolves Q3). The data was already retained today; only the action was missing
   (`projectActions.ts:210-225` — verified: it decrements `historyIndex` and truncation is deferred).
6. Palette edits stay **non-undoable** (Q2 preserved). Revisit post-migration.

---

## Auto-save reaction

Replaces `services/autoSave.ts` (5 module-level mutable variables) and the `setOnSaveStatusChange`
callback registered inside `create()` (`index.ts:37-48`).

```ts
// client/src/stores/session/AutoSaveController.ts
class AutoSaveController {
  constructor(private domain: DomainStore,
              private session: SessionStore,
              private history: HistoryStore,
              private ui: UIStore) {
    this.dispose = reaction(
      () => this.saveTrigger,                 // ← what is observed
      () => this.scheduleSave(),
      { delay: 500, equals: comparer.structural }
    );
  }

  private get saveTrigger() {
    if (this.domain.loadState !== "loaded") return null;   // hydration + failure guard
    if (this.history.isReplaying) return null;             // undo/redo replay guard
    if (this.session.saveSuspended) return null;           // explicit suspend (rename, switch)
    return [this.domain.domainVersion,
            this.domain.pixelVersion,
            this.ui.persistedUIVersion] as const;
  }
}
```

| Concern | Design |
| --- | --- |
| **What is observed** | Three integer version counters, not the data. `domainVersion` bumps in a single `reaction` on the structural observables; `pixelVersion` bumps in `PixelStore`; `persistedUIVersion` bumps in a `UIStore` reaction over the 43 persisted fields. **Rationale:** observing the whole tree would make the reaction re-evaluate a 300k-cell structure on every keystroke. Counters make the trigger O(1). |
| **Debounce** | `{ delay: 500 }` on the reaction — identical to today's `DEBOUNCE_MS = 500` (`autoSave.ts:10`), trailing edge, reset on each change. Coalescing is inherent: MobX reactions do not queue. |
| **Save status location** | `SessionStore.saveStatus` (`"idle"\|"saving"\|"saved"\|"error"`). Written only by `AutoSaveController`. The 2 s `saved→idle` timer becomes `SessionStore.markSaved()` which sets `saved` then schedules `idle`. Read by the `Header` container. |
| **Hydration guard** | `loadState !== "loaded"` returns `null` → the reaction sees no change → no save. Hydration happens while `loadState === "loading"`. |
| **Replay guard** | `history.isReplaying` is set for the duration of `undo()`/`redo()`. **Deliberate behaviour change:** today `undo` *does* call `scheduleAutoSave` (`projectActions.ts:224`). Under this design undo does **not** immediately save; the *next real edit* does. Rationale: a save triggered by replay is indistinguishable from a save triggered by an edit, which makes "did the undo persist?" untestable. Flagged as a user-visible change — see [Open questions](#open-questions) Q3. |
| **Load-failure gate** | `loadState === "failed"` permanently blocks saves until a successful load. **This closes `api-contract.md` D1/R1** — the blank-project overwrite, the highest-severity bug in the repo. |
| **Suspend on rename/switch/delete** | `session.saveSuspended` is set by the `DomainStore` flows for their duration, replacing 4 manual `cancelPendingSave()` calls (`projectActions.ts:58,85,141,178`) — **and covering `renameCurrentProject`, which is missing one today** (`projectActions.ts:111-129`). |
| **Retry** | Exponential backoff (500 ms × 2ⁿ, cap 30 s), max 6 attempts, then `saveStatus = "error"` with the `ApiError.serverMessage` surfaced. Replaces the infinite 2 Hz loop at `autoSave.ts:29-34`. |
| **Re-entrancy** | A single in-flight promise held on the controller; a save scheduled mid-flight sets a dirty flag and fires once the current one settles. Replaces the un-awaited recursion at `autoSave.ts:38-41` (`api-contract.md` R4). |
| **Testability** | The controller is a class taking its collaborators, not a module singleton. Vitest constructs one per test with fake timers. This fixes the "single global callback slot" problem (`autoSave.ts:12`). |
| **Serialization** | `AutoSaveController` calls `domain.serialize()`, which calls `ui.toPersistedUIState()` and merges into `CompactProject`. `DomainStore` does **not** import `UIStore` — the merge function is injected by `ApplicationStore` at construction. |

**Save payload assembly (the `Project.uiState` resolution):**

```ts
// ApplicationStore constructor
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

`toPersistedUIState()` is an **explicit field-by-field builder**, not a spread. That is what makes
`api-contract.md` D12 (`lightGridMode`, `layerSelectionCounter`,
`referenceImagePanelPosition/Minimized` silently present-or-dropped) impossible going forward — and
it is why the golden fixtures must be re-blessed once, deliberately.

---

## React integration

### Provider & hooks

```ts
// client/src/stores/context.ts
const StoreContext = createContext<ApplicationStore | null>(null);

export function StoreProvider({ store, children }: {
  store: ApplicationStore; children: ReactNode
}) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStores(): ApplicationStore {
  const s = useContext(StoreContext);
  if (!s) throw new Error("useStores must be used inside <StoreProvider>");
  return s;
}

export const useDomainStore  = () => useStores().domain;
export const useUIStore      = () => useStores().ui;
export const useSessionStore = () => useStores().session;
export const useHistoryStore = () => useStores().history;
```

The store is constructed **once, in `main.tsx`**, and passed in. It is never a module-level
singleton — that is what lets Storybook and Vitest build a fresh instance per story/test. This is
the same defect that `services/autoSave.ts` and `ReferenceImageModal`'s `persistentState` both have
today, and it is not carried forward.

### `observer()` placement rules

**These five rules are the enforceable review checklist.**

1. **Only container components are `observer`s.** A container is a file matching
   `client/src/components/**/*Container.tsx` or `client/src/containers/**`. Nothing else may import
   `observer` from `mobx-react-lite`. ESLint: `no-restricted-imports` with a `files` override.
2. **A presentational component never calls a store hook.** `useStores`, `useDomainStore`,
   `useUIStore`, `useSessionStore`, `useHistoryStore` are importable **only** from container files.
   Same ESLint mechanism. This is the rule that makes Storybook work: every presentational component
   renders from props alone, with no provider needed.
3. **Containers render markup only for layout glue.** A container's job is: read observables →
   convert to plain values → render exactly one presentational component with those props +
   bound callbacks. If a container has more than ~40 lines of JSX, the presentational split is wrong.
4. **`observer` goes on the smallest component that reads observables.** Do not wrap a page in
   `observer` and read 20 fields — that reproduces today's whole-store-destructure problem
   (33 of 34 consumers, `store-state.md` §Consumer census). One container per meaningfully
   independent region: `LayerPanelContainer`, `TimelineRowContainer` (per row), `SwatchContainer`
   (per swatch).
5. **Never `observer` a component that takes `children`** unless the children are also observers —
   MobX cannot track through the `children` prop, and it silently produces stale subtrees.

Additional mechanical rules:

- Callbacks passed down are `action`-bound store methods or `useCallback`-wrapped calls to them.
  Never inline arrow functions that mutate observables outside an `action` (`enforceActions:
  "always"` throws).
- List rendering: the container maps over a computed array of **ids**, and renders a per-item
  container that reads its own item. This keeps a 360-cell timeline from re-rendering wholesale.
- `<canvas>` renderers (`Canvas`, `LightingCanvas`) are **not** `observer`s. They use an explicit
  `reaction(() => [...deps], redraw, { fireImmediately: true })` inside `useEffect`. Reactive
  rendering into an imperative canvas via `observer` is the wrong tool and causes double redraws.

### Observable → plain props boundary

This is where the coupling gets removed for real. Rules:

| Situation | Rule |
| --- | --- |
| Primitive (`number`, `string`, `boolean`) | Pass directly. Reading it in the container's render **is** the subscription. |
| Small observable object (`Color`, `Point`, `Normal`, `SelectionBox`) | Already `observable.ref` by design — pass the reference. It is immutable by convention (always replaced, never mutated in place). Document with `readonly` in the presentational prop type. |
| Observable array | **Never pass the observable array.** Pass a computed-derived plain array, or (preferred) pass ids and let per-item containers read their own item. |
| Domain node (`PixelObject`, `Frame`, `Layer`, `VariantGroup`) | **Never pass the node.** The container projects it to a flat view-model: `{ id, name, visible, thumbnailUrl, isSelected }`. This is exactly what `UIStore`'s computeds exist to produce. |
| `PixelData[][]` grid | **Never pass to a React component at all.** Only `<canvas>` renderers touch grids, and they receive them through the `reaction`, not props. |
| Store instance | **Never.** A presentational component receiving a store is an automatic review rejection. |

Enforcement: presentational prop types live next to the component and may not import from
`client/src/types` anything that transitively references `PixelData`, and may not import from
`client/src/stores/**` at all. ESLint `no-restricted-imports` on the presentational glob.

`toJS()` is **not** the tool here. It deep-clones — on a `PixelObject` that is a 6.9 MB copy. Use it
only in tests and in `serialize()` where a plain snapshot is genuinely wanted.

### Strict mode config

```ts
// client/src/stores/configure.ts
import { configure } from "mobx";

configure({
  enforceActions: "always",          // every observable write must be inside an action/flow
  computedRequiresReaction: true,    // catches computeds read outside a reactive context
  reactionRequiresObservable: true,  // catches reactions with no observable deps (silent no-ops)
  observableRequiresReaction: true,  // catches observables read outside observer/reaction
  disableErrorBoundaries: false,     // keep React error boundaries working
  safeDescriptors: true,             // default; prevents monkey-patching store methods
});
```

**Recommendation: all five on, in development and in tests.** In production, keep
`enforceActions: "always"` (it is a correctness guarantee, not a dev aid) and disable the three
`*RequiresReaction` warnings — they only log, but they log on hot paths.

`observableRequiresReaction: true` is the rule most likely to be noisy during migration, because the
bridge (below) reads observables from Zustand-land. Accept the noise: **every warning it emits marks
a component that has not been migrated yet.** It is a free migration progress meter.

---

## Migration strategy

### Verdict: **incremental, bridged, 12 ordered slices. Not big-bang.**

The honest case for big-bang: `EditorState` is one flat object built by a single `create()` call
(`store/index.ts:36`), and the module graph is a **DAG with zero cycles** (`store-state.md`
§Coupling graph, verified). A cut-everything-at-once rewrite is *technically* possible.

The case against, which wins:

| Factor | Measurement | Consequence |
| --- | --- | --- |
| Files importing `useEditorStore` | **35** (verified: `grep -rl "useEditorStore" client/src \| wc -l` → 35) | A big-bang touches all 35 in one non-shippable change. |
| Consumer LOC in the 8 high-entanglement files | **~7,900 — 60 % of all consumer code**, `Canvas.tsx` alone 3,062 | One of those files is bigger than most of the store. |
| Existing tests | **zero** | There is nothing to tell you a big-bang landed correctly. Task 08's harness is a hard prerequisite either way. |
| Undo/redo | 129 call sites, 3 distinct `trackHistory` semantics | Findings 02 names undo regressions "the most likely way this migration breaks user-visible behavior". Big-bang couples that risk to 34 other risks simultaneously. |
| Render-count change | 33 of 34 consumers currently re-render on **every** store change | `observer` changes render counts everywhere at once. Big-bang means diagnosing that across 35 files with no bisect point. |

A big-bang would produce one un-reviewable, un-bisectable change with no green state between start
and finish. That is not acceptable on a codebase whose only safety net is manual clicking.

### The bridge

MobX and Zustand coexist for the duration. The bridge is **one-directional per slice** and lives in
one file that is deleted at the end:

```ts
// client/src/stores/bridge/zustandBridge.ts   (TEMPORARY — deleted by slice 12)
export function installBridge(app: ApplicationStore) {
  // Phase A (slices 1-3): MobX mirrors Zustand. Zustand is the source of truth.
  const disposeZ = useEditorStore.subscribe((s) => runInAction(() => {
    app.session.saveStatus = s.saveStatus;
    // ...only fields whose slice has NOT yet flipped
  }));

  // Phase B (slices 4+): Zustand mirrors MobX for not-yet-migrated consumers.
  const disposeM = reaction(
    () => app.migratedSnapshot(),
    (snap) => useEditorStore.setState(snap, false)   // shallow merge, no history side effects
  );

  return () => { disposeZ(); disposeM(); };
}
```

**Bridge invariant — enforced by review:** a field is mirrored in exactly **one** direction at a
time. A field never has two writers. The slice that flips a field's ownership also moves it from the
Phase A list to the Phase B list, in the same change. The bridge file's two lists are the migration's
progress ledger.

**Cost, stated plainly:** the bridge re-serializes migrated fields into Zustand on every change,
which is why it flips direction as early as possible (slice 4) and why `project`/pixel grids are
mirrored **by reference only** — never cloned. Peak overhead is one shallow `setState` per change.

### Ordered slice sequence

Prerequisites (owned by tasks 08 and by `store-state.md` W1/W2/W7 — must land before slice 1):
Vitest + Storybook harness · golden migration fixtures · characterisation tests for history ·
the 3 pre-existing store defects fixed.

| # | Slice | What flips | Why here | Consumers touched |
| --- | --- | --- | --- | --- |
| **1** | `ApplicationStore` skeleton + `SessionStore` + provider + bridge Phase A | `saveStatus`, `aiServiceUrl`, both clipboards, `colorHistory` | Smallest, most isolated. 4 real tenants, no domain coupling. Proves the provider/hook/observer pattern on `Header` before anything risky. | `Header` |
| **2** | `AutoSaveController` (replaces `services/autoSave.ts`) | the save reaction, save status, backoff, **load-state gate** | Closes `api-contract.md` D1/R1 (blank-project overwrite) early — it is the highest-severity bug and it must not be live during a 12-slice migration. Depends on `DomainStore.loadState`, so ship a minimal `DomainStore` with only `loadState` + `projectName` here. | `Header`, `App` |
| **3** | `HistoryStore` (snapshot-only) + bridge for `projectHistory`/`historyIndex` | undo/redo | Behaviour-identical to today at this point (all commands are snapshots). The characterisation suite must pass **unchanged**. Adds `redo`. | `Canvas`, `LightingCanvas`, `ColorPicker` (undo callers only) |
| **4** | `DomainStore` full + `PaletteStore` + `ObjectStore` + bridge flips to Phase B | `version`, `objects`, `palettes`, `variants`, `referenceImage`, `projectName`, `projectList`, load/save flows | The pivot. From here MobX is the source of truth and Zustand is a read-only mirror. Palette + Object first: `paletteActions.ts` (70 LOC) takes no `get` at all and `objectActions.ts` (233 LOC) names its `get` `_get` (unused) — **the two trivially extractable modules** (`store-state.md` §Coupling graph). | `PaletteManager`, `ObjectSelectModal`, `ProjectSelectModal`, `BrowseBackupsModal` |
| **5** | The 6 `helpers.ts` computeds on `ApplicationStore` | `getCurrentObject/Frame/Layer/Variant`, `getSelectedVariantLayer`, `isEditingVariant` | 9 of 15 store modules and 8 components depend on these (~120 call sites). Everything downstream needs them. They are pure and 93 LOC — the cheapest high-leverage slice. Resolves Q7: they live on `ApplicationStore` because they span `domain` + `timelineUI`. | `HeightMapModal`, `CopyFromModal`, `CanvasInfo` |
| **6** | `UIStore` + `ToolUIStore` + `ViewportUIStore` + `toPersistedUIState()` | 30 of the 43 persisted UI fields | This is the `Project.uiState` split landing. **The wire-format golden test is the gate** — the save payload must be byte-identical except the deliberate `aiServiceUrl` removal. Do not proceed to 7 until it is green. | `Toolbar`, `PixelStudioTools`, `PixelStudioPanel`, `RightSidebarTopControls` (partial) |
| **7** | `TimelineUIStore` + `FrameStore` + `LayerStore` | selection ids, `variantFrameIndices`, `layerSelectionCounter`, view modes; frame + layer CRUD | Selection ids must move together with the stores that read them. `LayerStore` absorbs `timelineActions`' 6 actions. | `FrameTimeline`, `FramesView`, `TimelineView`, `LayerPanel`, `FrameTagsModal` |
| **8** | `SelectionUIStore` + `PixelStore` (mask-as-argument) | `selection`, `selectionMode`, `selectionBehavior`; `setPixel(s)` | **The hot path.** The mask/behaviour-as-argument rule (`store-state.md` R5) is implemented here. `PixelStore` becomes the sole grid writer and the sole `pixelVersion` bumper. Convert pixel commands from snapshot to inverse-patch **in this slice** — the biggest memory win. | `Canvas` (partial — selection + drawing only) |
| **9** | `LightingUIStore` + lighting parts of `PixelStore` | studio mode, normals/height, light/ambient, scale, flips, normal computation | The 8 no-autosave setters are fixed structurally on arrival. `computeNormalsForAllFrames` becomes a `flow` and moves **out of `LightingStudioTools.tsx`**. | `LightingCanvas`, `LightControl`, `NormalPicker`, `LightingStudioPanel`, `LightingStudioTools` |
| **10** | `VariantStore` | all 20 variant actions | Largest module (1,412 LOC) and depends on `LayerStore` + `TimelineUIStore` being done (the `selectLayer` edge at `variantActions.ts:446,1407`). | `VariantView`, `AddVariantModal`, `VariantSelectModal`, `ObjectLibrary` |
| **11** | `ReferenceUIStore` + kill `persistentState` | reference/frame trace overlays, `referenceImageSelection`, the modal's module singleton | Independent of 4-10 and could move earlier, but it is a component refactor as much as a store one. Placing it late keeps the container pattern established first. `App.tsx` must end up importing **nothing** from `components/ReferenceImageModal/`. | `App`, `ReferenceImagePanel`, `ReferenceImageModal`, `FrameReferencePanel` |
| **12** | `CanvasInteractionStore` + `Canvas.tsx` + `AIInterpolateModal` + **delete the bridge and `client/src/store/`** | `isDrawing`, `drawStartPoint`, `previewPixels`; the last 2 consumers | `Canvas.tsx` (3,062 LOC, 9 fields + 19 uiState + 38 actions) is deliberately last — every store it touches is already stable. Should itself be split into ≥3 sub-items. Deleting the bridge is the migration's completion criterion. | `Canvas`, `AIInterpolateModal` |

**Rollback point:** every slice ends with the app running, the bridge consistent, and
`bunx vitest run && bunx tsc -b && bun run build` green. Any slice can be reverted independently
because the bridge's two lists are the only shared mutable state.

**Estimated shape:** slices 1-3 are S/M; 4, 6, 7, 8 are L; 9, 10, 12 are L and should each split
further once the preceding slice reveals the true size. 12 is realistically 3-4 sessions.

---

## Testing approach

### Unit-testing stores without React (Vitest)

Stores are plain classes with constructor-injected collaborators. No React, no jsdom, no provider:

```ts
// client/src/stores/domain/__tests__/LayerStore.test.ts
function makeApp(overrides?: Partial<ApiLayer>) {
  const api = { project: mockProjectApi(), backup: mockBackupApi(), ...overrides };
  const app = new ApplicationStore({ api, autoSaveEnabled: false });
  app.domain.hydrate(fixtureCompactProject);   // no network
  return app;
}

test("deleteLayer is undoable and restores pixel content", () => {
  const app = makeApp();
  const before = snapshotGrid(app.currentLayer!);
  app.layers.deleteLayer(app.currentLayer!.id);
  expect(app.currentFrame!.layers).toHaveLength(2);
  app.history.undo();
  expect(app.currentFrame!.layers).toHaveLength(3);
  expect(snapshotGrid(app.currentLayer!)).toEqual(before);
});
```

Test-harness requirements this design commits to:

| Requirement | Why |
| --- | --- |
| `ApplicationStore` takes an **options object** (`{ api, autoSaveEnabled, historyBudgetBytes }`) | Tests disable auto-save and shrink the history budget to exercise eviction. |
| `DomainStore.hydrate(compact)` is public and network-free | Every store test starts from a fixture, not a `flow`. |
| `AutoSaveController` is constructed separately and takes a clock | `vi.useFakeTimers()` + assert exactly one save for 10 rapid edits. |
| No module-level singletons anywhere in `stores/` | Two tests in one process must not share state — the exact defect `autoSave.ts` and `persistentState` have today. |
| MSW for the API layer (`api-contract.md` W20) | `flow` tests go through the real `projectApi`, so URL building and error mapping are covered too. |

Coverage targets, by priority:

1. **`HistoryStore` + every command** — undo-depth matrix, transaction batching (one drag = one
   entry), byte-budget eviction, redo, `isReplaying` guard. This is the critical path.
2. **`UIStore.toPersistedUIState()`** — a golden test asserting the emitted `CompactUIState` matches
   a frozen fixture key-for-key. This is what keeps the wire format from drifting.
3. **`AutoSaveController`** — debounce, coalescing, backoff, attempt cap, the load-state gate
   (assert **zero** `POST /api/project` after a failed load), replay guard.
4. **The 6 `ApplicationStore` computeds** — including the variant resolution at `helpers.ts:33-79`,
   which has three fallback layers (`variantOffsets` → `variantOffset` → `baseFrameOffsets`).
5. **Each domain sub-store's actions** — one test per action asserting the mutation and its inverse.

### Reaction/computed testing

Use `reaction(...)` with a spy and assert **invocation counts**, not just values — the whole point of
the migration is render granularity, and a computed that re-fires on unrelated changes is a silent
regression. `mobx`'s `_resetGlobalState()` between tests, and `configure({ enforceActions: "always",
observableRequiresReaction: true })` in `vitest.setup.ts` so violations fail tests, not just warn.

### Storybook

Because **presentational components never touch a store** (rule 2), the overwhelming majority of
stories need no store at all — they take props. That is the payoff of the observer rule.

For the minority of **container** stories:

```ts
// .storybook/decorators/withStores.tsx
export const withStores = (build?: (app: ApplicationStore) => void) => (Story) => {
  const app = useMemo(() => {
    const a = new ApplicationStore({ api: mswApi, autoSaveEnabled: false });
    a.domain.hydrate(fixtures.smallProject);
    build?.(a);
    return a;
  }, []);
  return <StoreProvider store={app}><Story /></StoreProvider>;
};
```

- A **fresh `ApplicationStore` per story** — trivial because the store is not a singleton.
- A small fixture project (2 objects, 4 frames, 3 layers, 16×16) checked into
  `client/src/stores/__fixtures__/`. **Not** `Base Unit.json` (1.1 MB, 300k cells) — that belongs in
  the migration corpus, not in Storybook.
- MSW handlers from `client/src/api/__mocks__/handlers.ts` (`api-contract.md` W20) drive the
  loading / failed / conflict container states that have no UI today.
- Layout-level stories compose containers with a `build` callback that puts the store in the exact
  state the story illustrates (e.g. `a.ui.selection.setSelectionMask(...)`).

---

## SessionStore definition

There is no auth, no user, no profile, no login anywhere in `client/`, `server/`, or `ai-service/`
(established by `store-state.md` Q1). `SessionStore` is nonetheless **a real store with five tenants
on day one** — not a placeholder.

```ts
class SessionStore {
  // --- persistence health (moved from EditorState.saveStatus) ---
  saveStatus: SaveStatus = "idle";
  lastSaveError: ApiError | null = null;
  saveSuspended = false;                    // set during rename/switch/delete flows

  // --- app-level configuration (moved OUT of the persisted Project — bug fix) ---
  aiServiceUrl: string | null = null;
  aiConnection: "unknown" | "ok" | "unconfigured" | "error" = "unknown";

  // --- cross-project buffers (must survive project switch) ---
  layerClipboard: LayerClipboard | null = null;
  timelineCellClipboard: TimelineCellClipboard | null = null;

  // --- user preference trail ---
  colorHistory: Color[] = [];               // capped at MAX_COLOR_HISTORY = 10

  get isSaving() { return this.saveStatus === "saving"; }
  get canPaste()  { return this.layerClipboard !== null; }

  setSaveStatus(s: SaveStatus): void;
  markSaved(): void;                        // 'saved' then 'idle' after 2s
  setAiServiceUrl(url: string): void;
  addToColorHistory(c: Color): void;
  // NOT reset by project switch — this is the contract
}
```

| Tenant | Why SESSION | Fixes |
| --- | --- | --- |
| `saveStatus` / `lastSaveError` / `saveSuspended` | The state of the app's link to its backend. Not domain data, not view state. | Replaces the single global callback slot at `autoSave.ts:12`. |
| `aiServiceUrl` / `aiConnection` | App-level configuration for an external endpoint. | **Fixes a live bug** — persisting it per-project (`types/index.ts:193`, written by `toolActions.ts:488`) means switching projects silently repoints the AI service. Also the place to honour `remote_configured` (`api-contract.md` D5). |
| `layerClipboard` / `timelineCellClipboard` | They **deliberately outlive the project** today — nothing in `projectActions` clears them. `copyLayerFromObject` exists precisely to move layers between objects. | Because this design's `UIStore` *is* project-scoped, leaving them in `UIStore` would silently break cross-project copy. `SessionStore` preserves it **by construction**, not by accident. |
| `colorHistory` | A cross-project preference trail, capped at 10, meaningless to any single view. | Positions it for a `localStorage` follow-up without a second move. |

### Explicitly deferred

**Do not build now:** auth, user, profile, permissions, tokens, multi-user, or a connection/online
model. There is no requirement and no evidence one is coming.

### The auth seam

When auth arrives, it slots in without restructuring:

1. `SessionStore` gains `user: User | null` and `authStatus: "anonymous" | "authenticating" |
   "authenticated"`. `authStatus === "anonymous"` is today's permanent state.
2. `ApplicationStore` gains a `reaction` on `authStatus` that calls `domain.reset()` on logout.
   `DomainStore` already needs a `reset()` for project switching, so it exists.
3. The API layer's `httpClient` (`api-contract.md` §Typed request helper) gains an auth-header
   injector fed by `SessionStore` — one function, one call site, because `request<T>()` is the
   only `fetch` caller.
4. `ApiErrorKind` gains `"unauthorized"`; `SessionStore` reacts by clearing `user` and suspending
   saves — reusing the `saveSuspended` mechanism this design already has.

Nothing in `DomainStore` or `UIStore` changes. That is the test of whether the seam is real.

---

## Risks

| # | Risk | Severity | Mitigation |
| --- | --- | --- | --- |
| R1 | **Deep-observing the 300k-cell pixel grid.** MobX `observable` is deep by default; naively wrapping `Project` creates ~1M proxies (measured: 300,249 `PixelData` cells with nested `Pixel`/`Normal`). | **Critical** | `observable.ref` on every grid; `PixelStore` is the sole writer; `pixelVersion` counter; canvases use `reaction`, not `observer`. Lint rule forbidding `makeAutoObservable` on `PixelData`/`Normal` types. **Benchmark a 100-stroke drag before and after — must stay under 16 ms/frame.** |
| R2 | **Wire-format drift from the `uiState` split.** 43 fields move out of `Project` and must come back byte-identically at save time. Months of gzipped backups depend on it. | **Critical** | `toPersistedUIState()` is an explicit field-by-field builder with a golden test against a frozen `CompactUIState` fixture. Slice 6 does not complete until byte-comparison passes. The 4 fields currently mis-declared (D12) are added deliberately, with a documented fixture re-bless. |
| R3 | **Undo/redo behaviour regression.** 129 call sites, 3 `trackHistory` semantics, no tests today, and command correctness is now per-action manual work. | **Critical** | Characterisation suite written against the **Zustand** store first (there is no other baseline). Slice 3 ships snapshot-only commands so behaviour is provably identical before any inverse patch is written. Convert families one at a time, re-running the suite each time. |
| R4 | **`aiServiceUrl` leaves the wire format** — the one deliberate format change. | High | Read-compat retained (adopted from the file if present, then not re-emitted). Golden fixtures re-blessed once, in a dedicated change, with the diff reviewed by hand. If the owner rejects the change, the fallback is to keep emitting it while `SessionStore` remains the read source — a one-line change to `toPersistedUIState()`. |
| R5 | **`DomainStore → UIStore` dependency on the hot path.** `selection.mask` + `selectionBehavior` are consulted on **every** `setPixel` (`drawingActions.ts:11-24`); `variantFrameIndices` in 6 modules' write paths. | High | Mask, behaviour, and variant frame index are **arguments** to `PixelStore` methods, never cross-store reads. Enforced by ESLint `no-restricted-imports`: `stores/domain/**` may not import `stores/ui/**`. Verified mechanically, not by convention. |
| R6 | **The bridge develops two writers for one field.** A field mirrored in both directions oscillates or silently loses writes. | High | The bridge file's two explicit field lists are the single source of truth; the slice that flips a field moves it between lists in the same change. Add a dev-mode assertion that a field never appears in both lists. |
| R7 | **Render-count changes surface latent ordering bugs.** 33 of 34 consumers re-render on every change today; `observer` makes rendering granular everywhere. | High | Migrate in the 12-slice order (low-entanglement first, `Canvas.tsx` last). Per-slice manual smoke matrix. Keep `observableRequiresReaction: true` on in dev as a progress meter. |
| R8 | **Auto-save reaction fires too often or not at all.** Observing version counters means a missed `bump()` = silent data loss; observing too much = a save per keystroke. | High | Version bumps live in exactly 3 places (`DomainStore.bumpDomainVersion`, `PixelStore.bumpPixelVersion`, `UIStore` persisted reaction), each with a unit test. Integration test: 10 rapid edits → exactly one POST. Plus the inverse test: edit each of the 43 UI fields → each must produce a save (this is the regression test for the 8 lighting setters). |
| R9 | **`computedFn` leaks.** `layerThumbnail(frameId, layerId)` on the measured project is 360 keys; unbounded caching across project switches accumulates. | Medium | `keepAlive: false` and an explicit `clearCache()` on project switch. Assert cache size in a test after 3 project switches. |
| R10 | **`enforceActions: "always"` breaks the bridge.** Zustand's `subscribe` callback writes observables from outside an action. | Medium | The bridge wraps every write in `runInAction`. It is one file; review it once and it stays correct. |
| R11 | **11 snapshot-family commands still cost 6.9 MB each.** The memory win is real but not universal. | Medium | Charged honestly against the 64 MB budget, so they evict rather than accumulate. Stated plainly rather than hidden — see the memory table. |
| R12 | **Undo no longer triggers an immediate save** (deliberate change from `projectActions.ts:224`). | Medium | Flagged in Open questions Q3. If the owner wants today's behaviour, the fix is one line: have `HistoryStore.undo()` clear `isReplaying` before the final version bump. |
| R13 | **`Set`/`Map` in state** (`selection.mask`, `colorAdjustment.affectedPixelsByFrame`). | Low | Both `observable.ref`, so MobX never touches their interiors, and neither is persisted. `toJS` is banned outside tests and `serialize()`. |
| R14 | **`ModalUIStore` is new scope.** No modal state exists in the store today (it is ~31 local `useState`s). | Low | Genuinely optional — it can be deferred past slice 12 without affecting anything. Included because container/presentational separation needs *somewhere* to put "which modal is open", and Storybook stories need to drive it. |

---

## Proposed work items

These are the store-architecture items. They interleave with `store-state.md`'s W1-W14 and
`api-contract.md`'s W1-W20; dependencies on those are named explicitly as `[SS-Wn]` / `[API-Wn]`.

| Title | Touches (explicit files/dirs) | Depends on | Effort | Risk |
| --- | --- | --- | --- | --- |
| **M1. Store scaffolding, strict mode, provider, typed hooks** | NEW `client/src/stores/{ApplicationStore.ts,context.ts,configure.ts}`, NEW `client/src/stores/__fixtures__/smallProject.ts`; `client/src/main.tsx`; `client/package.json` (add `mobx@6`, `mobx-react-lite`, `mobx-utils`) | Task 08 harness (Vitest) | S | Nothing renders differently yet. Regression detected by `bunx tsc -b` + the app still booting. |
| **M2. `SessionStore` + move `saveStatus`, `aiServiceUrl`, both clipboards, `colorHistory`** | NEW `client/src/stores/session/SessionStore.ts`, NEW `client/src/stores/bridge/zustandBridge.ts`; `client/src/components/Header/Header.tsx`; `client/src/store/toolActions.ts` (`setAiServiceUrl` L488 → bridge) | M1 | M | Clipboards must survive a project switch — **no automated test covers this today**; manual check mandatory. AI URL moving out of `Project` changes the save payload (see M7's golden re-bless). |
| **M3. `AutoSaveController` — reaction, debounce, backoff, load-state gate** | NEW `client/src/stores/session/AutoSaveController.ts`; NEW `client/src/stores/domain/DomainStore.ts` (minimal: `loadState`, `loadError`, `projectName`); DELETE `client/src/services/autoSave.ts`; `client/src/store/index.ts` (L3-6, L37-48, L84), `client/src/store/projectActions.ts` (L16,58,85,111-129,141,178,202,224), `client/src/components/AIInterpolateModal/AIInterpolateModal.tsx` (L766,853) | M2, [SS-W2], [SS-W6], [API-W7] | M | **The critical fix (D1/R1).** A regression silently re-enables the blank-project overwrite. Detected by an MSW test asserting **zero** `POST /api/project` after a 500 on `GET /api/project`. |
| **M4. `HistoryStore` + `Command` (snapshot-only) + `redo`** | NEW `client/src/stores/history/{HistoryStore.ts,commands.ts}`; `client/src/store/index.ts` (L51-109), `client/src/store/projectActions.ts` (L210-225), `client/src/store/drawingActions.ts` (L10,27-34) | M1, [SS-W7] | M | Behaviour must be **identical** to today at this stage. Detected by the characterisation suite passing unchanged. |
| **M5. `DomainStore` full + `PaletteStore` + `ObjectStore`; bridge flips to Phase B** | NEW `client/src/stores/domain/{DomainStore.ts,PaletteStore.ts,ObjectStore.ts}`; `client/src/stores/bridge/zustandBridge.ts`; `client/src/store/{paletteActions.ts,objectActions.ts}`; `client/src/components/{PaletteManager,ObjectSelectModal,ProjectSelectModal,BrowseBackupsModal}/` | M3, M4, [API-W7] | L | **The pivot** — MobX becomes the source of truth. The bridge reversing direction is the highest-risk moment in the migration. Detected by the full manual smoke matrix + `bun run build`. |
| **M6. The 6 `helpers.ts` computeds on `ApplicationStore`** | `client/src/stores/ApplicationStore.ts`; `client/src/store/helpers.ts` (93 LOC → deleted at M12); `client/src/components/{HeightMapModal,CopyFromModal,Canvas/CanvasInfo}/` | M5 | M | `getCurrentVariant` has 3 fallback layers (`helpers.ts:69-77`: `variantOffsets` → `variantOffset` → `baseFrameOffsets`). Getting the precedence wrong misplaces every variant on canvas. Unit-test each fallback explicitly. |
| **M7. `UIStore` + `ToolUIStore` + `ViewportUIStore` + `toPersistedUIState()`** | NEW `client/src/stores/ui/{UIStore.ts,ToolUIStore.ts,ViewportUIStore.ts}`; `client/src/store/toolActions.ts` (494 LOC, 34 actions); `client/src/components/{Toolbar,PixelStudioPanel,RightSidebarTopControls}/`; `client/src/types/index.ts` (`CompactUIState` L612-663 — add the 4 mis-declared fields) | M5, M6, [SS-W4], [API-W1] | L | **The `Project.uiState` split.** Wire-format golden test is the gate; the payload must be byte-identical except the deliberate `aiServiceUrl` removal, which requires a hand-reviewed fixture re-bless. |
| **M8. `TimelineUIStore` + `FrameStore` + `LayerStore`** | NEW `client/src/stores/ui/TimelineUIStore.ts`, NEW `client/src/stores/domain/{FrameStore.ts,LayerStore.ts}`; `client/src/store/{frameActions.ts,layerActions.ts,timelineActions.ts,layerClipboardActions.ts}`; `client/src/components/FrameTimeline/`, `client/src/components/{LayerPanel,FrameTagsModal}/` | M7 | L | `TimelineView` mutates layer structure across **all** frames. `layerSelectionCounter` semantics (re-selecting the same layer) are subtle and read by `FrameTimeline.tsx`. Detected by the timeline click-through matrix. |
| **M9. `SelectionUIStore` + `PixelStore` + inverse-patch pixel commands** | NEW `client/src/stores/ui/SelectionUIStore.ts`, NEW `client/src/stores/domain/PixelStore.ts`; `client/src/stores/history/commands.ts`; `client/src/store/{selectionActions.ts,drawingActions.ts,colorAdjustmentActions.ts}`; `client/src/components/Canvas/Canvas.tsx` (drawing + selection paths only) | M8, M4 | L | **The hot path and the biggest memory win.** Two risks at once: mask-as-argument correctness, and inverse-patch correctness. Detected by the undo-depth matrix + a 100-stroke drag benchmark under 16 ms/frame. |
| **M10. `LightingUIStore` + lighting `PixelStore` paths** | NEW `client/src/stores/ui/LightingUIStore.ts`; `client/src/stores/domain/PixelStore.ts`; `client/src/store/lightingActions.ts` (1,036 LOC); `client/src/components/Canvas/LightingCanvas.tsx`, `client/src/components/LightingStudioPanel/`, `client/src/components/Toolbar/LightingStudioTools.tsx` | M9 | L | The 8 no-autosave setters start autosaving — a **behaviour change users will notice**. `computeNormalsForAllFrames` moves out of the component into a `flow`. Detected by the lighting-persist-across-reload check. |
| **M11. `VariantStore`** | NEW `client/src/stores/domain/VariantStore.ts`; `client/src/store/variantActions.ts` (1,412 LOC, 20 actions); `client/src/components/{VariantSelectModal,AddVariantModal,ObjectLibrary}/`, `client/src/components/FrameTimeline/VariantView.tsx` | M8, M10 | L | Largest single module. The `selectLayer` cross-module edge (`variantActions.ts:446,1407`) becomes an injected callback. `ObjectLibrary`'s custom `React.memo` comparators thread `project` internals and must be removed. |
| **M12. `ReferenceUIStore` + eliminate `persistentState`** | NEW `client/src/stores/ui/ReferenceUIStore.ts`; `client/src/components/ReferenceImageModal/ReferenceImageModal.tsx` (delete L29-38, move L41-287), `client/src/App.tsx` (L14-19,59,76-79), `client/src/components/ReferenceImagePanel/ReferenceImagePanel.tsx`, `client/src/store/referenceActions.ts`; NEW `client/src/utils/referenceImage.ts` | M7, [SS-W5] | M | Overlaps `[SS-W5]` — if that lands first this is store-side only. 16 nudge buttons in `ReferenceImagePanel` currently mutate a global and get pixels back synchronously; no test covers any of them. |
| **M13. `CanvasInteractionStore` + `Canvas.tsx` container split** | NEW `client/src/stores/ui/CanvasInteractionStore.ts`; `client/src/components/Canvas/Canvas.tsx` (3,062 LOC — **split into ≥3 sequential sub-items**) | M9, M10, M11 | L | **The highest-risk file in the project.** Should be proposed as 3+ items once M9 establishes the canvas pattern. Regression = drawing breaks. |
| **M14. `AIInterpolateModal` onto store actions; delete the bridge and `client/src/store/`** | `client/src/components/AIInterpolateModal/AIInterpolateModal.tsx` (L316,745-770,835-860); DELETE `client/src/stores/bridge/`, DELETE `client/src/store/` (17 files, 8,050 LOC) | M13, all | L | Completion criterion. Nothing may import `useEditorStore` afterwards. Detected by `grep -rl "useEditorStore" client/src` returning **nothing**. |
| **M15. `ModalUIStore` + container/presentational enforcement lint rules** | NEW `client/src/stores/ui/ModalUIStore.ts`; `client/eslint.config.js` (`no-restricted-imports` for observer/hook placement + `stores/domain` ↛ `stores/ui`) | M7, task 07's taxonomy | M | Optional and deferrable past M14. The lint rules half is **not** optional — without it the observer placement rules are unenforceable and rot within weeks. Consider splitting the lint rules into M1. |

---

## Verification

| Work item | Command(s) | Manual checks |
| --- | --- | --- |
| **M1** | `cd client && bunx tsc -b --noEmit && bunx vitest run src/stores && bun run build` | App boots with the provider mounted and nothing visually changed. |
| **M2** | `cd client && bunx vitest run src/stores/session` | **Clipboard cross-project survival:** copy a layer in project A → switch to project B → paste. Must still work. **AI URL:** set the URL, switch projects, confirm it does **not** change. |
| **M3** | `cd client && bunx vitest run src/stores/session/__tests__/autosave.test.ts` — must assert: 10 edits in 500 ms → exactly 1 POST; a failed load → **0** POSTs; failure → backoff, capped at 6 attempts | Stop the server, reload the app: expect an explicit error, **not** a blank canvas. Then `ls -la server/src/data/` — `Base Unit.json` must still be ~1.1 MB, not ~2 kB. Edit a pixel, immediately rename the project: no file written under the old name. |
| **M4** | `cd client && bunx vitest run src/stores/history` — characterisation suite from `[SS-W7]` must pass **unchanged** | Undo-depth matrix: 5 distinct edits → 5 undos → byte-identical restoration. One 50-pixel drag → exactly one history entry. Change tool + zoom + a palette colour → history length unchanged. Redo after undo restores. |
| **M5** | `cd client && bunx tsc -b --noEmit && bunx vitest run && bun run build` | Full smoke: create / switch / rename / delete a project; add + delete a palette colour; add / rename / resize / duplicate / delete an object. Confirm each still autosaves within ~1 s. |
| **M6** | `cd client && bunx vitest run src/stores/__tests__/computeds.test.ts` — one test per fallback branch of `currentVariant` | Select a variant layer with (a) `variantOffsets`, (b) legacy `variantOffset`, (c) only `baseFrameOffsets`. All three must render at the same position as before. |
| **M7** | `cd client && bunx vitest run src/stores/ui/__tests__/persistedUIState.test.ts` **plus the wire-format byte test:** `cp "server/src/data/Base Unit.json" /tmp/before.json`, make one edit, wait for save, then diff `uiState` keys — the only permitted difference is the removal of `aiServiceUrl` | Set every one of the 43 UI fields, hard-reload, confirm all 43 persist. **Including the 4 that do not today**: `lightGridMode`, `layerSelectionCounter`, `referenceImagePanelPosition`, `referenceImagePanelMinimized`. |
| **M8** | `cd client && bunx vitest run src/stores/domain src/stores/ui/TimelineUIStore* && bunx tsc -b --noEmit` | Timeline matrix: add/delete/reorder frames; add layer to all frames; delete a layer from one frame; reorder within a frame; copy/paste a timeline cell. Click the same layer twice → re-selection behaviour intact. |
| **M9** | `cd client && bunx vitest run src/stores/domain/PixelStore* src/stores/history` — assert a 50-pixel stroke command is **< 5 kB** (`cmd.bytes`) and that 1,000 strokes stay under the 64 MB budget | Full drawing matrix: pencil, eraser, line, rect, ellipse, flood fill, gaussian fill, all 4 selection modes, all 3 selection behaviours, move tool, eyedropper revert, origin tool, both trace modes. **Chrome Performance panel: 100-pixel drag must stay under 16 ms/frame**, matching the pre-migration baseline. |
| **M10** | `cd client && bunx vitest run src/stores/ui/LightingUIStore*` — assert each of the 8 previously-broken setters bumps `persistedUIVersion` | Lighting Studio: change light colour, ambient colour, height scale, selected normal, studio mode, height brush value, edit mode, light direction → wait 2 s → hard-reload → **all 8 must persist** (today they do not). Normal computation must not freeze the UI. |
| **M11** | `cd client && bunx vitest run src/stores/domain/VariantStore*` | Variant matrix: make variant, add/delete/rename variant + group, resize variant, set offset (single + all frames), add/duplicate/delete/move/reorder variant frames, add/remove variant frame tags, add/remove variant layer. **`ObjectLibrary` thumbnails must update when a variant frame changes.** |
| **M12** | `cd client && bunx tsc -b --noEmit && grep -rn "ReferenceImageModal" client/src/App.tsx` (**must return nothing**) | Load a project with a saved reference image → it appears on startup. Exercise **all 16** nudge/resize buttons in `ReferenceImagePanel`. Open and close the modal twice → state behaves correctly. |
| **M13** | `cd client && bunx vitest run && bunx tsc -b --noEmit && bun run build` | The full M9 drawing matrix again, plus pan/zoom, trace overlays, and undo during a drag. |
| **M14** | `cd client && grep -rl "useEditorStore" client/src` (**must return nothing**) `&& bunx tsc -b --noEmit && bunx eslint . && bunx vitest run && bun run build` | Run AI interpolation 5× → history stays within budget and the app remains responsive. Full app regression pass. |
| **M15** | `cd client && bunx eslint .` — must fail on a deliberately-planted `observer()` in a presentational file, and on a deliberate `stores/ui` import inside `stores/domain` | Open Storybook: confirm presentational stories render with **no** `StoreProvider` decorator. |
| **Global gate (after every item)** | `cd client && bunx tsc -b --noEmit && bunx eslint . && bunx vitest run && bun run build` | Wire-format stability: edit one field, save, and diff the on-disk JSON — only the edited key and `uiState.aiServiceUrl` may differ. Clipboard cross-project survival. |

All commands exit non-zero on failure. `bunx vitest` and `bunx eslint` become available only after
task 08's harness lands — every item above is blocked on it.

---

## Open questions

| # | Question | Blocking? | Assumption to proceed under |
| --- | --- | --- | --- |
| **Q1** | **Is removing `aiServiceUrl` from the persisted `Project` acceptable?** It is the only deliberate wire-format change in this design. It fixes a real bug (switching projects repoints the AI service, `store-state.md` Q1) but it changes the saved payload and requires a hand-reviewed golden-fixture re-bless. | **Blocking M7** (the golden test cannot be written without the answer) | Assume **yes, remove it**, with read-compat: adopt the value from the file on load, never re-emit. If rejected, `toPersistedUIState()` re-emits `session.aiServiceUrl` — a one-line change, and `SessionStore` remains the single read source either way. |
| **Q2** | **Should the 4 mis-declared `CompactUIState` fields start persisting?** `lightGridMode`, `layerSelectionCounter`, `referenceImagePanelPosition`, `referenceImagePanelMinimized` are present in `UIState` but absent from `CompactUIState` (`api-contract.md` D12). The explicit builder makes hiding them impossible — they either persist or are dropped on purpose. | Non-blocking, **but M7 must decide** | Assume they **should** persist (that is clearly the intent — `lightGridMode` is even read back at `types/index.ts:967`, and `layerSelectionCounter` is read by `FrameTimeline.tsx`). Overlaps `[SS-W4]`; if that item lands first, this is already settled. |
| **Q3** | **Should `undo` still trigger an immediate save?** Today it does (`projectActions.ts:224`). This design's replay guard means it does not — the next real edit saves instead. | Non-blocking | Assume **no immediate save on undo**, because a save indistinguishable from an edit-triggered save makes "did undo persist?" untestable. If the owner disagrees, the fix is one line in `HistoryStore.undo()`. |
| **Q4** | **Is `mobx-utils` acceptable as a dependency?** `computedFn` is needed for the 4 parameterized computeds (`compositedFrame`, `layerThumbnail`, `layerColors`). The client currently has exactly 4 production dependencies and is clearly kept lean; this migration already adds `mobx` + `mobx-react-lite`. | Non-blocking | Assume yes (~3 kB gz). If rejected, hand-roll a `Map`-keyed memo with explicit invalidation on `pixelVersion` — more code, same result, and it must then be unit-tested for leaks. |
| **Q5** | **Is `ModalUIStore` (M15) wanted at all?** No modal state exists in the store today; it is ~31 local `useState`s across 31 component folders. Adding it is new scope inside a refactor. | Non-blocking | Assume **defer past M14**, and treat it as task 07's call — container/presentational separation is their domain, and they may prefer modal state to stay component-local. The lint-rule half of M15 is **not** deferrable and should fold into M1. |
| **Q6** | **What is the correct history byte budget?** I recommend 64 MB (≈10 % of today's measured 680 MB worst case, allowing ~50,000 pixel-level undos or ~9 full snapshots). This resolves `store-state.md` Q4 in favour of bytes over count, but the specific number is a judgement call. | Non-blocking | Assume **64 MB**, made configurable via `ApplicationStore` options so it can be tuned from a dev overlay without a code change. Expose `historyBytes` in dev to gather real numbers. |
| **Q7** | **Do domain sub-stores mutating one shared tree feel right to the owner?** `ObjectStore` etc. are behaviour modules over `DomainStore.objects` rather than owners of their own slices. The alternative — each sub-store owning its data — was rejected because `variantActions` mutates `objects` and `variants` together. | Non-blocking | Assume the shared-tree design. It keeps one `pixelVersion`, one serializer, and no cross-store writes. Revisit only if a sub-store starts needing its own lifecycle. |
| **Q8** | **Is 12 slices too many to sequence given task 07 is also refactoring the same components?** M7-M13 each touch component files that task 07's container taxonomy also claims. | **Potentially blocking task 09's wave planning** | Assume task 09 interleaves them by **file**, not by task: a component is decoupled from Zustand (my item) and split into container/presentational (task 07's item) in the **same** agent session, because doing them separately means editing every consumer twice. My `Touches` lists are deliberately explicit so task 09 can detect exactly these collisions. |
| **Q9** | **Should palette edits become undoable?** All 5 `paletteActions` pass `trackHistory=false` (`store-state.md` Q2). Palettes are user content, unlike everything else in the non-undoable bucket. | Non-blocking | Assume **preserve today's behaviour exactly** during the migration and file it as a post-migration fix. Changing it mid-migration would make undo regressions ambiguous. The command architecture makes it a 5-line change later. |
