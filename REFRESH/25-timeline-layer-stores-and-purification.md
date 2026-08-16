# 25 — `TimelineUIStore`, `FrameStore`, `LayerStore`, and the timeline/layer consumers

**Wave:** W17 · **Depends on:** 24
**Touches:** `client/src/stores/ui/TimelineUIStore.ts` (new) · `client/src/stores/domain/FrameStore.ts` (new) · `client/src/stores/domain/LayerStore.ts` (new) · `client/src/stores/{ApplicationStore,bridge/zustandBridge}.ts` · `client/src/store/{frameActions,layerActions,timelineActions,layerClipboardActions}.ts` · `client/src/components/FrameTimeline/{FrameTimeline.tsx,FramesView.tsx,TimelineView.tsx,VariantView.tsx}` · `client/src/components/LayerPanel/LayerPanel.tsx` · `client/src/components/FrameTagsModal/FrameTagsModal.tsx` · `client/src/containers/{FrameTimelineContainer,FramesViewContainer,TimelineViewContainer,VariantViewContainer,LayerPanelContainer,FrameTagsModalContainer}.tsx` (new) · `client/src/stores/domain/__tests__/`
**Effort:** L

## Objective

After this task frame and layer structure, the timeline selection state, and both clipboards are owned by MobX, and the six timeline/layer consumers read through containers. Selection ids must move together with the stores that read them, which is why these three stores are one task.

## Context

### `TimelineUIStore` (persisted UI fields)

| Field | Kind | Note |
| --- | --- | --- |
| `selectedObjectId`, `selectedFrameId`, `selectedLayerId` | `observable`, persisted | feed the `currentObject`/`currentFrame`/`currentLayer` computeds from task 23 |
| `variantFrameIndices` | `observable` (a plain `{[vgId]: number}` object, small), persisted | **the most load-bearing UI field** — read in 6 modules' pixel-write paths. It is read by the `currentVariant` computed and **passed into domain actions as an argument**, never read across the store boundary. |
| `layerSelectionCounter` | `observable`, persisted | a monotonic click counter read by `FrameTimeline.tsx` to detect re-selection of the same layer. Subtle; task 08 pinned it. |
| `objectLibraryViewMode`, `timelineThumbnailMode` | `observable`, persisted | |

These 6 fields join `toPersistedUIState()` from task 24. **The save payload must stay byte-identical.**

### `FrameStore` (9 actions)

`addFrame`, `deleteFrame`, `deleteSelectedFrame`, `renameFrame`, `duplicateFrame`, `moveFrame`, `reorderFrame`, `addFrameTag`, `removeFrameTag`.

`selectFrame` is **UI**, not domain — it goes to `TimelineUIStore`. Its `syncVariants` branch reads `DomainStore.variants`, which it must do **via an injected computed**, not a store import.

Note `deleteSelectedFrame` calls `deleteFrame` intra-module today (`frameActions.ts:90`) — harmless, keep it.

### `LayerStore` (absorbs three modules)

From `layerActions.ts` (14 actions): `addLayer`, `duplicateLayer`, `deleteLayer`, `renameLayer`, `toggleLayerVisibility`, `toggleAllLayersVisibility`, `moveLayer`, `moveLayerAcrossAllFrames`, `deleteLayerAcrossAllFrames`, `squashLayerDown`, `squashLayerUp`, `squashLayerDownAcrossAllFrames`, `squashLayerUpAcrossAllFrames`, `moveLayerPixels`.

From `timelineActions.ts` (4 actions — these are layer ops with a frame scope, not a distinct concern): `addLayerToAllFrames`, `addLayerToFrameAtPosition`, `deleteLayerFromFrame`, `reorderLayerInFrame`. Plus `copyTimelineCell` / `pasteTimelineCell`, whose clipboard lives on `SessionStore`.

From `layerClipboardActions.ts` (3 actions, 837 lines total — sizes 143/406/288): `copyLayerToClipboard`, `pasteLayerFromClipboard`, `copyLayerFromObject`. The clipboard itself is `SessionStore.layerClipboard`.

`selectLayer` is **UI** → `TimelineUIStore.selectLayer`, and it also bumps `layerSelectionCounter`.

⚠️ **This retires the store graph's only cross-module edge.** `variantActions.ts:446` (`makeVariant`) and `:1407` (`removeVariantLayer`) call `layerActions.selectLayer`. Under MobX, `VariantStore` (a later task) will call `timelineUI.selectLayer` **through an injected callback**, not a store import. Design `TimelineUIStore.selectLayer` so that injection is straightforward.

⚠️ **The 4 `squash*` variants are near-identical** and could collapse to one parameterised core. Task 08 pinned the differences between them. **Do not collapse them in this task** — port all four faithfully, then collapse in a follow-up if desired. Collapsing while porting makes a regression impossible to attribute.

⚠️ **Cross-project clipboard survival is load-bearing behaviour.** Nothing in `projectActions` clears `layerClipboard` or `timelineCellClipboard` on project switch (verified: the `set()` calls at `projectActions.ts:67,95,150` touch only `project`, `projectName`, `projectList`, `projectHistory`, `historyIndex`). `copyLayerFromObject` exists precisely to move layers between objects. Because `TimelineUIStore` **is** project-scoped, the clipboards stay on `SessionStore` (task 14 put them there) and **must not** be reset on switch. No automated test covered this before task 08 added one — keep it green.

### The six consumers

| Consumer | LOC | Store members | Migration note |
| --- | ---: | ---: | --- |
| `FramesView` | 684 | 8 — **actions only**, `project`/`obj` already arrive as props | **Already prop-driven for reads.** Only the action imports need lifting. One of the cheapest wins. |
| `VariantView` | 617 | 9 — **actions only**, all reads are props | Same. |
| `FrameTimeline` | 251 | 6 | A container that resolves and forwards props; owns playback (the rAF/interval stays in the component). |
| `TimelineView` | 836 | 12 | **High entanglement** — mutates layer structure across **all** frames. 6 responsibilities. Scheduled for splitting in a later task; here it just gets a container. |
| `LayerPanel` | 501 | **22** | **The highest store-member count outside Canvas.** Also has a global keydown handler. 7 of the 22 are `squash*`/`move*` variants. Scheduled for splitting later; here it gets a container. |
| `FrameTagsModal` | 266 | 5 | **The only component in the codebase already using selector-style subscriptions** (`:41-45`) rather than whole-store destructuring — it is the reference example. |

**Do not split `TimelineView` or `LayerPanel` here.** Both are scheduled as their own tasks. Purifying and splitting in one session makes the diff unreviewable.

Container rules (restated): `observer()` only under `client/src/containers/`; one container per meaningfully independent region — for a 360-cell timeline, map over a computed array of **ids** and render a per-item container that reads its own item, rather than wrapping the whole grid in one `observer`.

## Steps

1. Create `TimelineUIStore` with the 6 persisted fields; add them to `toPersistedUIState()`; confirm the wire-format golden test still passes.
2. Create `FrameStore` (9 actions) and `LayerStore` (14 + 4 + 2 + 3 actions), each taking `DomainStore` + `HistoryStore` by injection.
3. Move `selectFrame` and `selectLayer` to `TimelineUIStore`, with `selectLayer` bumping `layerSelectionCounter`.
4. Move the migrated fields and actions from the bridge's Phase A list to Phase B in the same commit.
5. Create the six containers.
6. Delete the migrated actions from `frameActions.ts`, `layerActions.ts`, `timelineActions.ts` and `layerClipboardActions.ts`.

## Constraints

- **Do not collapse the 4 `squash*` variants.**
- **Do not split `TimelineView` or `LayerPanel`.**
- **The clipboards stay on `SessionStore` and are never reset on project switch.**
- `variantFrameIndices`, the selection mask and `selectionBehavior` are passed as **arguments** to domain actions; `stores/domain/**` must not import `stores/ui/**`.
- The save payload must stay byte-identical; the corpus snapshots must stay unchanged.
- Do not make any pixel grid observable; `layer.pixels` stays `observable.ref`.
- Do not remove `zustand`; do not move any component into `ui/components/`.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run build && bunx storybook build
bunx vitest run src/stores/domain src/stores/ui/__tests__/TimelineUIStore
bunx vitest run src/store/__tests__/     # task 08's suite still green
bunx vitest run src/types/__tests__/     # corpus snapshots unchanged
```

Manual checks — the timeline matrix:
1. Add, delete, rename, duplicate, move and reorder frames; add and remove a frame tag.
2. Add a layer to **all** frames; add one at a specific position; delete a layer from **one** frame; reorder within a frame.
3. Copy and paste a timeline cell, within a row and across rows.
4. Delete, move and squash a layer in **both** `frame` and `all-frames` scope, and verify every frame updates for the all-frames variants.
5. Click the **same layer twice** and confirm the re-selection behaviour (`layerSelectionCounter`) still works, and survives a reload.
6. **Cross-project clipboard:** copy a layer in project A, switch to project B, paste. This must still work.
7. Reorder frames by drag in all three timeline views; the drop indicator must land correctly at start, middle and end.

## Definition of done

- [ ] `TimelineUIStore` owns the 6 persisted fields and they round-trip; the wire-format golden test is green.
- [ ] `FrameStore` and `LayerStore` exist; `LayerStore` absorbed `timelineActions`' 6 and `layerClipboardActions`' 3.
- [ ] `selectFrame` and `selectLayer` live on `TimelineUIStore`; `selectLayer` bumps `layerSelectionCounter`; the design supports injecting it into `VariantStore` later.
- [ ] All 4 `squash*` variants ported faithfully and **not** collapsed.
- [ ] Cross-project clipboard survival verified manually and by test.
- [ ] Six containers exist; `TimelineView` and `LayerPanel` were **not** split.
- [ ] `stores/domain/**` imports nothing from `stores/ui/**`.
- [ ] Corpus snapshots and the save payload unchanged.
