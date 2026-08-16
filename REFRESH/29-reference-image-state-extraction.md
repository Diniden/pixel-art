# 29 — `ReferenceUIStore`: eliminate the module-level state inside a modal

**Wave:** W21 · **Depends on:** 28, 21
**Touches:** `client/src/stores/ui/ReferenceUIStore.ts` (new) · `client/src/components/ReferenceImageModal/ReferenceImageModal.tsx` · `client/src/App.tsx` · `client/src/components/ReferenceImagePanel/ReferenceImagePanel.tsx` · `client/src/components/FrameReferencePanel/FrameReferencePanel.tsx` · `client/src/components/Toolbar/{PixelStudioTools,Toolbar}.tsx` (type imports) · `client/src/components/Canvas/{Canvas,CanvasInfo}.tsx` (type imports) · `client/src/store/referenceActions.ts` · `client/src/utils/referenceImage.ts` (new) · `client/src/utils/imageEncoding.ts` (new) · `client/src/types/referenceImage.ts` (new) · `client/src/containers/{ReferenceImageContainer,ReferenceImagePanelContainer,FrameReferencePanelContainer}.tsx` (new)
**Effort:** L

## Objective

After this task the fourth, undeclared state container — a mutable module-level object living **inside a modal component** — is gone, `App.tsx` imports nothing from `components/ReferenceImageModal/`, and the reference-image state is owned by `ReferenceUIStore`. This is the architectural smell that blocks any dependency-ordered refactor of `components/`.

## Context

### What exists today

`client/src/components/ReferenceImageModal/ReferenceImageModal.tsx:29-38` declares a module-level mutable singleton **above** the component, with the comment *"Store persistent state outside the component so it survives unmounts"*:

```ts
const persistentState = {
  image: null as HTMLImageElement | null,
  imageUrl: null as string | null,
  selection: null as SelectionBox | null,
  zoom: 1,
  panOffset: { x: 0, y: 0 },
  hasBeenActivated: false,
};
```

The `const` binding is never reassigned; **every property is mutated in place**, from three different kinds of call site:

| Property | Mutated at | By |
| --- | --- | --- |
| `image` | 270, 345, 701 | `restoreReferenceImageFromProject`, the component's sync `useEffect`, `handleClearImage` |
| `imageUrl` | 271, 346, 702 | same three |
| `selection` | **106**, **193**, 272-277, 347, 703 | **`shiftReferenceSelection` and `adjustReferenceBoxSize` — called from `ReferenceImagePanel`, a different component** — plus the three above |
| `zoom` | 348, 704 | sync `useEffect`, `handleClearImage` |
| `panOffset` | 349, 705 | same |
| `hasBeenActivated` | 278, 351, 706 | **written in 3 places, read in 0 — dead state** |

The file has **11 exports, 10 of them non-component**. Seven are module-level functions operating on the singleton:

| # | Export | Line | Reads state | Writes state | Touches the store |
| --- | --- | --- | :---: | :---: | --- |
| 1 | `extractPixelsFromSelection(image, selection)` | 41 | no (pure) | no | no |
| 2 | `shiftReferenceSelection(dx, dy)` | 79 | **yes** | **yes (L106)** | indirectly via #7 |
| 3 | `shiftReferenceSelectionBySize(dx, dy, w, h)` | 117 | **yes** | via #2 | via #2 |
| 4 | `adjustReferenceBoxSize(direction, increase)` | 150 | **yes** | **yes (L193)** | indirectly via #7 |
| 5 | `encodeImageToBase64(image)` | 203 | no | no | no |
| 6 | `decodeBase64ToImage(base64)` | 224 | no | no | no |
| 7 | `saveReferenceImageToProject(image, selection)` | 234 | no | no | **`useEditorStore.getState()` at L235** |
| 8 | `restoreReferenceImageFromProject()` | 260 | no | **yes (L270-278)** | **`useEditorStore.getState()` at L261** |
| 9 | `getCurrentReferenceImageData()` | 285 | **yes** | no | no |
| 10 | `ReferenceImageModal` (the component) | 289 | yes | yes | no direct subscription |

**`useEditorStore.getState()` appears exactly twice in the entire client codebase** — both here, at lines 235 and 261, both from module-level functions rather than components.

### Who depends on it

| Consumer | Imports | Why |
| --- | --- | --- |
| **`App.tsx`** | `restoreReferenceImageFromProject`, `getCurrentReferenceImageData`, `saveReferenceImageToProject` (lines 16-19), used at 59, 76, 79 | On project load, `App` calls `restoreReferenceImageFromProject()` (which hydrates the singleton from the store), then `getCurrentReferenceImageData()` (which reads the singleton back) to seed its own `useState`. **`App` uses a modal's module singleton as a data-transfer object.** |
| `ReferenceImagePanel.tsx` | `adjustReferenceBoxSize`, `shiftReferenceSelection`, `shiftReferenceSelectionBySize` (line 3), **16 call sites** at 235-311 and 335-405 | Every arrow and resize button in the panel mutates the *modal's* singleton and gets pixels back synchronously. **The panel and the modal share state through a global**, with no reactivity — mutating it triggers no re-render, so callers thread the returned `ReferenceImageData` back through props by hand. |
| `PixelStudioTools.tsx` | the modal + `ReferenceImageData` (5-7), used at 132 | renders the modal |
| `Toolbar.tsx`, `Canvas.tsx`, `CanvasInfo.tsx` | `ReferenceImageData` (3, 14, 2) | type-only |

`extractPixelsFromSelection`, `encodeImageToBase64` and `decodeBase64ToImage` are exported but have **no importers outside this file**.

### Why this blocks everything else

1. **Import direction is inverted** — `App.tsx` (the root) imports behaviour from a leaf modal.
2. **It is a fourth store nobody declared**, shared by two components with none of the reactivity.
3. **It makes both components untestable and un-Storybook-able** — state survives unmount by design, so two stories or two tests in one process share it. There is no reset hook; `handleClearImage` (701-706) is the only reset and it is bound to a button.
4. **It holds an `HTMLImageElement`** — a live DOM node that cannot live in any serializable store and must never be deep-cloned into undo history.

### Where each piece goes

| Piece | Destination | Rationale |
| --- | --- | --- |
| `image`, `imageUrl` | `ReferenceUIStore`, **`observable.ref`** | a live DOM element plus its base64 mirror. Must never be cloned or serialized. |
| `selection` (`SelectionBox`) | **`ReferenceUIStore.referenceImageSelection`**, `observable.ref` | the one field with genuine shared behaviour between the modal and the panel — it is what justifies the whole singleton |
| `zoom`, `panOffset` | **component-local `useState` in the modal** | modal viewport only; nothing outside reads them |
| `hasBeenActivated` | **delete** | written 3×, read 0× |
| `extractPixelsFromSelection`, `encodeImageToBase64`, `decodeBase64ToImage` | `client/src/utils/referenceImage.ts` and `client/src/utils/imageEncoding.ts` | pure, arg-taking, no state dependency |
| `shiftReferenceSelection`, `shiftReferenceSelectionBySize`, `adjustReferenceBoxSize` | **`ReferenceUIStore` actions** | state mutations with a derived return value — textbook store actions |
| `saveReferenceImageToProject`, `restoreReferenceImageFromProject` | **`DomainStore` actions** (they only touch `project.referenceImage`) | removes the last two `getState()` calls in the codebase |
| the `ReferenceImageData` type | `client/src/types/referenceImage.ts` | six files import it as a type; none should import it from a component |

### `ReferenceUIStore` also absorbs the trace-overlay fields

From `EditorState` (all ephemeral, **not persisted** today — preserve that):

| Field | Kind | Note |
| --- | --- | --- |
| `overlayOffset` (`referenceOverlayOffset`) | `observable` | trace overlay nudge |
| `frameTraceActive` | `observable` | ⚠️ mutually exclusive with the `reference-trace` tool, and **the exclusivity is currently enforced in two places** (`referenceActions.ts:55-63` **and** `toolActions.ts:24-30`). Collapse it into **one** `reaction` in `UIStore` observing `ToolUIStore.selectedTool`. |
| `frameTraceFrameIndex` | `observable` | moves atomically with `frameTraceActive` via a single action |
| `frameOverlayOffset` | `observable` | |
| `frameReferenceObjectId` | `observable` | `getFrameReferenceObject()` becomes a computed on `ApplicationStore` (it needs `DomainStore.objects`) |
| `traceNudgeAmount` | `observable`, **persisted** | moved here from `toolActions` for cohesion. **Wire key unchanged** — it must still serialize as `traceNudgeAmount`. |

`setReferenceImage` goes to `DomainStore` and stays **non-undoable**, exactly as today (`referenceActions.ts:47`, comment: *"Don't track reference image changes in history"*). `referenceImage` is `observable.ref` and enters **no** history command.

### Two components that mirror store state locally — remove the duplicates, do not carry them over

- `FrameReferencePanel.tsx` mirrors `frameReferencePanelMinimized` into local `useState`.
- `ReferenceImagePanel.tsx` mirrors `isMinimized` and `position` into local `useState`.
- `App.tsx` mirrors `referenceImage` into local `useState`, seeded from the modal singleton.

All three duplicates must be **deleted**, not migrated. That changes update timing — verify it.

## Steps

1. Create `client/src/types/referenceImage.ts` with the `ReferenceImageData` type and update the six type-only importers.
2. Create `client/src/utils/referenceImage.ts` and `client/src/utils/imageEncoding.ts` with the three pure functions, moved verbatim, and unit-test them (in/partially-out-of-bounds selections; base64 encode→decode round trip).
3. Create `ReferenceUIStore` with `image`/`imageUrl`/`referenceImageSelection` (all `observable.ref`), the 6 trace-overlay fields, and the three selection actions.
4. Add `setReferenceImage`, `saveReferenceImageToProject` and `restoreReferenceImageFromProject` to `DomainStore`; **delete both `useEditorStore.getState()` calls.**
5. Add `traceNudgeAmount` to `toPersistedUIState()` with its wire key unchanged; confirm the golden test stays green.
6. Collapse the duplicated tool/trace exclusivity into one `reaction`; delete the second enforcement site.
7. Delete `persistentState` and `hasBeenActivated` from the modal; move `zoom`/`panOffset` to component-local `useState`.
8. Update `App.tsx` to import **nothing** from `components/ReferenceImageModal/`; remove its local `referenceImage` mirror.
9. Update `ReferenceImagePanel`'s 16 call sites to use store actions; delete its local `isMinimized`/`position` mirrors. Delete `FrameReferencePanel`'s local minimised mirror.
10. Create the three containers.

## Constraints

- **`image` and `imageUrl` are `observable.ref` and must never be cloned, serialized, or entered into history.**
- **`setReferenceImage` stays non-undoable.**
- **`traceNudgeAmount`'s wire key must not change.**
- **The three floating panels keep three distinct persistence keys** — do not unify them.
- Delete the three local `useState` mirrors rather than migrating them.
- **Do not restructure the modal's cropper UI** into a separate component — that is a later purification task. This task moves state and deletes the singleton.
- Do not remove `zustand`.
- ⚠️ **Sequencing:** task 21 already BEM-converted `ReferenceImageModal.{tsx,css}` and was explicitly forbidden from touching `persistentState`. This task is the one that moves it. Do not run them in parallel.

## Verification

```sh
cd /Users/diniden/Desktop/self/pixel-art/client
bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run build && bunx storybook build
# App.tsx imports nothing from the modal:
! grep -n "ReferenceImageModal" src/App.tsx
# The last two getState() calls are gone:
! grep -rn "useEditorStore.getState()" src
# The singleton is gone:
! grep -n "persistentState\|hasBeenActivated" src/components/ReferenceImageModal/ReferenceImageModal.tsx
```

Manual checks — **mandatory, no automated substitute; no test covered any of this before**:
1. Load a project with a saved reference image — it must appear in the panel **on startup**.
2. Exercise **all 16** nudge and resize buttons in `ReferenceImagePanel` and confirm the trace overlay moves each time.
3. Open the modal, close it, reopen it — the image must persist (this is exactly what `persistentState` existed for, and the lifetime semantics have changed).
4. Switch projects and reopen the modal — the **correct** image must appear.
5. Drag, minimise and reload each of the three floating panels — each must remember **its own** position.
6. Activate frame trace, then pick the `reference-trace` tool — the exclusivity must still hold with only one enforcement site.
7. Confirm `traceNudgeAmount` still persists across a reload.

## Definition of done

- [ ] `persistentState` and `hasBeenActivated` are deleted; `zoom`/`panOffset` are component-local.
- [ ] `ReferenceUIStore` owns `image`/`imageUrl`/`referenceImageSelection` as `observable.ref`, plus the 6 trace-overlay fields.
- [ ] **`App.tsx` imports nothing from `components/ReferenceImageModal/`**, and its local `referenceImage` mirror is gone.
- [ ] **Both `useEditorStore.getState()` call sites are gone** — zero remain in the codebase.
- [ ] The three pure functions live in `utils/` with unit tests; `ReferenceImageData` lives in `types/`.
- [ ] Tool/trace exclusivity is enforced in exactly **one** place.
- [ ] `traceNudgeAmount` persists with an unchanged wire key; `setReferenceImage` is still non-undoable.
- [ ] The local `useState` mirrors in `FrameReferencePanel`, `ReferenceImagePanel` and `App` are **deleted**.
- [ ] All 7 manual checks performed and recorded.
