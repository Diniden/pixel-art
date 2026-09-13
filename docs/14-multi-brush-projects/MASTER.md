# Multi-brush projects — MASTER plan

Planned 2026-09-13 against `main @ 9007990` (clean tree; plan 13 merged). Executed by `/plan-go`,
one fresh agent per task. **Read this file, `CLAUDE.md`, and your task file. Nothing else is
required; nothing else is assumed.**

---

## 1. Request

Verbatim:

> Brush studio sort of messed up a concept:
> - The top has brush projects which correctly is listing project files for brushes
> - After opening, the top of the layers rail shows Brush projects again which is WRONG.
> - This top should be brush objects WITHIN the project and not another listing of brush projects.
> - Each project needs to have many brushes able to be configured.
> - The brush tool should then be letting us select which brush we want from the project

### Interpretation

Today a brush **file** *is* one brush: `BrushDocument { version, width, height, frames, appliedGroups }`
(`client/src/types/brush.ts:86-92`). The header's "Brush Projects" button (`HeaderContainer.tsx:239`,
opening `BrushSelectModal`) and the left rail's "Brush Projects" panel (`BrushLibrary.tsx:103`, fed by
`BrushLibraryContainer`) are two views of the **same file list** — the rail is not a bug in the wiring,
it is the only thing the data model lets it show. Plan 11 task 02 even renamed both surfaces to say
"project", and the modal's copy states "Each brush project is one file holding a whole brush".

This plan introduces the missing level. A brush **project** (one file, `server/src/data/brushes/<name>.json`)
holds **many brushes**; each brush has its own `width × height`, frames, layers and applied groups —
exactly the shape a whole file has today. The left rail's top section becomes the list of brushes
**inside** the open project (select, add, rename, duplicate, delete, reorder); the layer panel, timeline,
canvases and thumbnails follow the **selected brush**; and the pixel studio's Brush tool gains a picker
so the user chooses which brush of the open project to stamp. The header's "Brush Projects" button and
modal keep managing files.

### Assumptions where the request was ambiguous

| Ambiguity | Decision |
| --- | --- |
| Is the selected brush shared between the Brush Studio and the pixel-studio Brush tool? | **Yes, one selection** (`brushUI.selectedBrushId`), exactly as the selected *frame* is shared today (plan 12 D4). Picking a brush in the pixel rail is what the studio shows on the next visit, and vice versa. |
| Is the selected brush persisted across reloads? | **No.** `BrushUIStore` is session-only and plan 12 deliberately declined to persist a brush identity (its open item 7) because that touches `types/codecs/**`. On load the first brush of the first project is selected. Open item, carried forward. |
| Does the project-create form still ask for a size? | **Yes.** The modal's and rail's create forms already collect `W × H`; that size becomes the project's **first brush** ("Brush 1"). No form is removed. |
| Can a project have zero brushes? | **No.** Like frames and layers, a project always has ≥ 1 brush; `deleteBrush` refuses the last one. The normaliser rejects an empty `brushes` array. |
| What happens to the owner's existing brush-1 files? | The normaliser **wraps** a legacy file as one brush named `"Brush 1"` (lossless, in memory). The first autosave writes it back as `brush-2`; the server's `.prev/` copy keeps the brush-1 bytes once. See §9 R1. |
| Which frame / layer is selected after switching brush? | The new brush's **first frame** and **top layer** (array end) — `selectBrush` clears both ids and re-seats through the same clamp `adoptDocument` uses. |
| Frame / layer ids across brushes | Unique **within** a brush only. `createBrush` reuses `"frame-1"` / `"layer-1"` in every brush (deterministic factories, as today). All lookups are brush-scoped, so collisions across brushes are harmless. |
| Store naming | `BrushStore`'s file-level flows are renamed `*Project` (D3) so `brushes.deleteProject()` (the file) and `brushStructure.deleteBrush(id)` (a brush in the file) can never be confused. |
| Header title in brush mode | Unchanged: the **project** name. Showing the selected brush there is not requested. |
| `useRailLayout`'s "Objects & Layers" rail label over the brush rail | Pre-existing cosmetic mismatch (noted since plan 01 task 19); out of scope. |

---

## 2. Outcome

When every wave is DONE the owner can:

1. Open the Brush Studio and see, at the top of the left rail, **"Brushes"** — the brushes inside the
   open project, each with a thumbnail, its name and its `W×H`; the selected one highlighted. The
   header's "Brush Projects" button still lists and manages project **files**.
2. Press the rail's "+" and create a second brush (name, W, H) in the same project; rename it by
   double-clicking, duplicate it, move it up or down, delete it (never the last one). Each is one ⌘Z step.
3. Click between brushes and watch the layer panel, the timeline, both canvas panes and the
   thumbnails switch to that brush's frames and layers; paint in one, switch, paint in the other,
   switch back — both are intact and the file autosaves as one project.
4. Reload: the project reopens with its brushes; a project created before this plan opens as a
   project with one brush called "Brush 1", pixel-identical.
5. In the pixel studio, select the Brush tool and pick which brush of the open project to stamp from a
   **"Brush"** dropdown in the rail section (and a button stack in Other Hand Mode); the hover marker,
   the stamp and the size controls follow the pick, and a brush of a different native size resets the
   stamp size to native exactly as loading a different file does today.

---

## 3. Locked decisions

| # | Decision | Value |
| --- | --- | --- |
| D1 | **Wire shape** (`client/src/types/brush.ts`) | `Brush { id: string; name: string; width: number; height: number; frames: BrushFrame[]; appliedGroups: BrushAppliedGroup[] }` — today's document body plus `id` and `name`. `BrushDocument { version: "brush-2"; brushes: Brush[] }`. `BRUSH_DOCUMENT_VERSION = "brush-2"`; `LEGACY_BRUSH_DOCUMENT_VERSION = "brush-1"` (exported, read only by the normaliser's legacy branch). `BrushFrame`, `BrushLayer`, `BrushCell`, `BrushAppliedGroup`, `colorSource` — unchanged. |
| D2 | **Normaliser** | `normalizeBrushDocument(raw)` accepts both shapes. `raw.brushes` an array → brush-2: every entry through `normalizeBrush(raw, index)` (today's document rules: numeric `width`/`height` ≥ 1, non-empty `frames`, uniform layers; `id` → `stringOr(r.id, "brush-<i+1>")`, `name` → `stringOr(r.name, "Brush <i+1>")`); **any** invalid brush, zero brushes, or duplicate brush ids → `null` (a corrupt file is an error, never a blank default — R5). No `brushes` key but `width`/`height`/`frames` present → **legacy**: the whole object is normalised as one brush with `id: "brush-1"`, `name: "Brush 1"`. The `version` string is never read. `assertUniformLayers(brush: Brush)` keeps its name and moves down one level; new `assertBrushDocument(doc)` = ≥ 1 brush, unique ids, each brush uniform. |
| D3 | **Store naming** (`BrushStore`) | File-level members are renamed: `brushName → projectName`, `brushList → projectList`, `hasBrush → hasProject`, `loadBrush → loadProject`, `createBrush → createProject`, `switchBrush → switchProject`, `renameBrush → renameProject`, `deleteBrush → deleteProject`. `refreshList`, `init`, `document`, the three counters, `history`, `saveName`/`serialize` keep their names. `app.brushes` keeps its name. `brushApi` (`list/get/save/create/rename/remove`) is **not** renamed — the API layer names files. `usePixelBrush`'s returned `brushName` becomes `projectName`. |
| D4 | **Selection** (`BrushUIStore`) | New `selectedBrushId: string \| null` (observable). `selectBrush(id: string, doc: BrushDocument \| null)`: sets the id, clears `selectedFrameId` and `selectedLayerId`, then runs the `adoptDocument` clamp. `adoptDocument(doc)`: brush = `brushIn(doc, selectedBrushId)` (kept if present, else `brushes[0]`), then today's frame/layer clamp **within that brush**; `null` doc clears all three. `selectedBrushIn(doc): Brush \| null`; `selectedFrameIn`, `selectedLayerIn`, `channelTypeIn` resolve through it. Pure helper `brushIn(doc: BrushDocument \| null, id: string \| null): Brush \| null` (find by id, else `brushes[0]`, else `null`) lives in `types/brush.ts` so containers and the pane compositor share one rule. |
| D5 | **Structure store** (`BrushStructureStore`) | `BrushSelectionSource` gains `readonly selectedBrushId: string \| null`; `BrushSelectionSink` gains `selectBrush(id: string): void`. Every existing op resolves the **selected brush** (index via `selectedBrushId`, else 0; no document or no brush → silent no-op, as today) and commits through a private `commitBrush(label, mutate: (brush: Brush) => Brush, bumpPixels)` that spine-copies `doc.brushes[index]` and runs `assertUniformLayers` on the changed brush. The existing pure helpers (`mapFrames`, `mapLayers`, `mapLayer`, …) are re-typed from `BrushDocument` to `Brush` — their bodies do not change. New ops, each one snapshot commit: `addBrush(name, width = 16, height = 16): string` (appends `createBrush(generateId(), name, w, h)`, selects it), `duplicateBrush(id): string` (deep-copied grids, `"<name> Copy"`, inserted after the source, selected), `deleteBrush(id)` (**refuses the last**; when the deleted brush was selected, selects the previous or new first), `renameBrush(id, name)` (no pixel bump), `moveBrush(id, "up" \| "down")` (`"up"` = toward index 0, the top of the displayed list — the list is **not** reversed, unlike layers). `resizeBrush(w, h)` resizes the selected brush. |
| D6 | **Pixel store** (`BrushPixelStore`) | `BrushSelectionSource` gains `selectedBrushId`. `resolveTarget()` resolves brush → frame → layer and returns `brushIndex` too; `replaceLayerGrid(doc, brushIndex, frameIndex, layerIndex, pixels)` spine-copies `brushes` as well. `BrushPixelTarget` (in `brushCommands.ts`) gains `brushId: string`; `applyPatch` resolves the brush by id first and no-ops when it is gone. |
| D7 | **History** (`brushCommands.ts`) | Snapshot commands still hold the **whole document** by reference (D8 of plan 01 — immutable spine copies keep that valid). `estimateBrushBytes(doc)` sums `width × height × layers` over every brush. `BrushPixelTarget { brushId, frameId, layerId }`. |
| D8 | **Brush list UI** | New pure component `client/src/ui/components/BrushList/` (`BrushList.tsx`, `BrushListRow.tsx`, `BrushList.css`, `storyFixtures.ts`, `BrushList.stories.tsx`, `__tests__/BrushList.dom.test.tsx`), BEM block `brush-list`. Props: `brushes: ReadonlyArray<BrushListRowModel>` where `BrushListRowModel { id; name; width; height; draw: ((ctx, size) => void) \| null }`, `selectedBrushId`, `thumbnailRevision`, `onSelect(id)`, `onAdd(name, width, height)`, `onRename(id, name)`, `onDuplicate(id)`, `onDelete(id)`, `onMoveUp(id)`, `onMoveDown(id)`. Header "Brushes" + "+" opening the inline name/W/H form copied from `BrushLibrary` (defaults 16, range 1..256); rows: 32 px `ThumbnailCanvas`, name (double-click → inline rename, as `BrushLayerRow`), `W×H` badge, hover actions up / down / duplicate / delete (delete `disabled` when `brushes.length === 1`). Display order = array order (index 0 on top). Names must be non-empty and unique within the list (case-sensitive `trim()` compare) — a local validator, **not** `brushName.ts` (that one validates file names). It replaces `BrushLibrary`, which is deleted. |
| D9 | **Layout / studio** | `BrushStudioLayout` prop `brushLibrary` → `brushList` (doc comment: "the brushes INSIDE the open project — the left rail's top section"). `BrushStudioContainer` mounts `BrushListContainer` there. `BrushLibraryContainer.tsx` and `ui/components/BrushLibrary/**` are **deleted**, except `brushName.ts` which moves to `ui/components/BrushSelectModal/brushName.ts` (its only remaining importer). The modal's intro copy becomes: `Each brush project is one file holding a set of brushes — each with its own size, layers and frames. Switch, create, rename or delete brush project files here.` |
| D10 | **Thumbnails** | `BrushListContainer` paints one `draw` closure per brush with the compositor moved from `BrushLibraryContainer` (`makeBrushThumbnailDraw`, generalised to `(brush: Brush, frameIndex)`): the selected brush shows its selected frame, every other brush its frame 0. `thumbnailRevision = (pixelVersion + domainVersion) * 65536 + selectedFrameIndex` — the same formula, same reason (a frame change is a content change). |
| D11 | **Pixel-studio picker** | `PixelStudioBrushInfo` gains three **optional** members: `brushes?: ReadonlyArray<PixelStudioBrushOption>` (`{ id; name; width; height }`), `selectedBrushId?: string \| null`, `onSelectBrush?: (id: string) => void`. `PixelStudioBrushSection` renders a `Dropdown` labelled "Brush" (option label `name (W×H)`, BEM `pixel-studio-panel__brush-picker`) as the **first row** of the loaded branch, only when `brushes` has ≥ 1 entry and `onSelectBrush` is supplied. The hint reads "Stamps the selected brush's current frame with the selected colour." Optional so task 04 (W1) lands before the container (task 14, W4) — the `size?` precedent. |
| D12 | **Pixel-studio hook** | `usePixelBrush` resolves `brush = app.brushUI.selectedBrushIn(doc)` and uses `brush.width/height/frames` where it used `doc.*`; its memo keys add `selectedBrushId`; the native-size reset effect is keyed on `[app, brush?.width, brush?.height]` so switching to a brush of another size resets the stamp size and switching to one of the same size keeps it (plan 13's rule, unchanged). `PixelStudioPanelContainer` and `pixelBrushWidgets` resolve the same way. `CanvasContainer` is **not** touched. |
| D13 | **Other hand** | `pixelBrushWidgets(app)` prepends one `buttons` widget, key `brush`, label "Brush", only when the project has ≥ 2 brushes: one option per brush, `short` = `B<index+1>`, `label` = name, active = selected, tap → `brushUI.selectBrush(id, doc)`. Same spec shape as the existing `scale` stack; no new widget kind. |
| D14 | **Server** | `server/src/routes/brush.ts` `EMPTY_BRUSH_DOCUMENT` becomes a **valid** brush-2 document (one 16×16 brush, one frame, one empty rgb layer) built by a small `emptyBrushDocument()` so a `create` without `brushData` yields a loadable project. `brushFiles.ts` is shape-agnostic and unchanged. |
| D15 | **Persistence / data safety** | Nothing under `client/src/types/codecs/`, `client/src/services/`, `server/src/export/`, `types/domain.ts`, `UIStore.toPersistedUIState`, any `__snapshots__`. `types/brush.ts` is under `client/src/types/`, so the corpus snapshot suites must pass **unchanged** at every gate (they do not import it, but the rule is the rule) and `bun run format:check` covers it. Nothing new is persisted in the project file. |
| D16 | **Commits** | Prefix `multi-brush(NN):` for tasks 01–14, `docs(14):` for 15. One commit per task (plus a separate Prettier commit if a sweep is needed). Branch `feat/14-multi-brush-projects`. |

### The type block, verbatim (tasks 03–14 code against this before task 05 lands)

```ts
export interface Brush {
  id: string;
  name: string;
  width: number;
  height: number;
  frames: BrushFrame[];
  appliedGroups: BrushAppliedGroup[];
}
export const BRUSH_DOCUMENT_VERSION = "brush-2" as const;
export const LEGACY_BRUSH_DOCUMENT_VERSION = "brush-1" as const;
export interface BrushDocument {
  version: typeof BRUSH_DOCUMENT_VERSION;
  /** Never empty; ids unique. */
  brushes: Brush[];
}
export function createBrush(id: string, name: string, width = 16, height = 16): Brush;
/** One brush, id "brush-1", named `name` (default "Brush 1"). */
export function createBrushDocument(width = 16, height = 16, name = "Brush 1"): BrushDocument;
export function brushIn(doc: BrushDocument | null, brushId: string | null): Brush | null;
export function assertUniformLayers(brush: Brush): void;
export function assertBrushDocument(doc: BrushDocument): void;
export function normalizeBrushDocument(raw: unknown): BrushDocument | null;
```

---

## 4. Ground truth (measured 2026-09-13 on `main @ 9007990`)

### Repo state
- Plan 13 (`docs/13-brush-source-and-resize/`) is **merged**: `BrushLayer.colorSource`, `pixelBrushScale/`, `PixelBrushUIStore` (`ui.pixelBrush`), `PixelStudioBrushSection.tsx`, `containers/otherHand/pixelBrushWidgets.ts` all exist. Its 12 manual QA rows are still unperformed — not this plan's debt.
- `REFRESH/` does not exist; the refresh is complete. Everything brush-related is MobX + BEM + `ui/`/`containers/` split.
- Baseline gate: `bun run verify` exit 0 — tsc clean, eslint 0 errors / **66 warnings**, vitest **200 files / 4361 tests**, build OK; stylelint 2 pre-existing errors (`OtherHand.css:338,359`) / 69 warnings; storybook build OK; boundaries 5/5; no lockfile.
- ⚠️ `client/src/test/__fixtures__/corpus/*.json` (11 files) is **gitignored and absent in a fresh worktree**. Copy it from the launch checkout before the first gate or `src/types/__tests__/` (3 files / 139 tests) fails.

### The document family
- `client/src/types/brush.ts` (≈400 lines): `BrushDocument` `:86-92`; `createBrushDocument` `:200`; `assertUniformLayers` `:222` (destructures `width, height, frames` `:223`); `normalizeBrushDocument` `:357-382` (`:359` reads `width/height/frames`, `:370-376` builds the literal, `:379` asserts); `brushLayerColorSource` `:98`; `createBrushLayer(id, name, w, h, channelType, colorSource)` `:177`; `generateId` is in `types/factories.ts:70`; `types/index.ts:13` re-exports `*` from `./brush`.
- Wire = memory: plain `JSON.stringify`, no codec, no migration chain, no `version` read.

### Stores (all under `client/src/stores/`)
- `domain/BrushStore.ts` (445): `document` is `observableRef` `:119/:156`; `brushName :107`, `brushList :109`, `hasBrush :181`, `saveName :189`, `serialize :198`, `adoptDocument :209` (single writer, fires `onDocumentInstalled`), `installDocument :220`, `replaceDocument :232`, `commit :255`, `init :286`, `loadBrush :314` (`normalizeBrushDocument` `:319`), `createBrush :354` (`createBrushDocument(width, height)`), `switchBrush`, `renameBrush`, `deleteBrush`, `refreshList`.
- `domain/BrushStructureStore.ts` (680): own `BrushSelectionSource :57` / `BrushSelectionSink :63`; helpers `mapFrames :110`, `mapLayers :118`, `mapLayer :129`; `commit :192` asserts `:201`; `layerIndexOf :209`; frames `:223-380`; layers `:382-600` (`addLayer` reads `current.width/height` `:401`); groups `:604-655`; `resizeBrush :662` writes `width/height` `:677`.
- `domain/BrushPixelStore.ts` (455): own `BrushSelectionSource :59`; `replaceLayerGrid :159`; `resolveTarget :201` (returns `width: doc.width` `:216`); `applyPatch :371` (resolves by `target.frameId/layerId` `:378-384`); `commitCells :422`.
- `history/brushCommands.ts` (208): `BrushSnapshotHost :40-46`; `estimateBrushBytes :58-62` (`doc.width * doc.height`, walks `doc.frames`); `BrushPixelTarget { frameId; layerId } :~150`; `createBrushPixelCommand`.
- `ui/BrushUIStore.ts` (371): private `frameIn(doc, id) :91-99` (falls back to `frames[0]`); `selectedFrameId/selectedLayerId :103-105`; `adoptDocument :197`; `selectedFrameIn :224`; `selectedLayerIn :229`; `channelTypeIn :240`. **No brush id exists.**
- `ui/PixelBrushUIStore.ts` (plan 13): `width/height: number | null` (null = native), `effectiveSize(native)`, `resetSize()`; every setter takes `native` as an argument — it never reads a document.
- `ApplicationStore.ts`: `brushUI :380`, `brushes :387`, `brushStructure :389`, `brushPixels :391`, `brushAutoSave :398`, `brushViews :405`; construction `:958-976` — `new BrushStore({ session, onDocumentInstalled: (doc) => brushUI.adoptDocument(doc) })` `:960-963`, `new BrushStructureStore({ brush, source: brushUI, select: brushUI })` `:964-968`, `new BrushPixelStore({ brush, source: brushUI })` `:969-972`; `AutoSaveController<BrushDocument>` `:1037-1053`; `activeHistory :1895`.
- `session/AutoSaveController.ts`: `AutoSaveDocument<TDoc> :113-121` — `loadState`, `loadGeneration`, `domainVersion`, `pixelVersion`, `saveName`, `serialize()`. Unaffected by this plan.

### Containers (`client/src/containers/`)
- `BrushStudioContainer.tsx` (112): mounts `BrushLibraryContainer` as `brushLibrary` and `BrushLayerPanelContainer` as `layerPanel` `:85-86`; `brushes.init()` on mount `:70-72`.
- `BrushLibraryContainer.tsx` (155): `resolveFrameIndex :55`, `makeBrushThumbnailDraw(doc, frameIndex) :70` (uses `renderBrushFrame` + `createBrushBuffer` from `ui/canvas/render/renderBrushFrame`), `thumbnailRevision` formula `:134-136`. **To be deleted**; the compositor moves to `BrushListContainer`.
- `BrushLayerPanelContainer.tsx` (134): `doc.frames.find(... selectedFrameId) ?? doc.frames[0]` `:70`; `doc.appliedGroups :73`; `document?.frames[0]?.layers.length :110`.
- `BrushTimelineContainer.tsx`: `doc?.frames :98`; playback advance `:182-188`; cell thumbnail `:372-377` (`makeBrushCellThumbnailDraw(layer, doc.width, doc.height)`); `selectedLayerIn(doc) :267`.
- `BrushCanvasContainer.tsx`: `doc?.width/height :139-140`; `selectedLayerIn(doc) :142`; `resyncKey` keyed on `brushName` `:198`.
- `BrushStudioPanelContainer.tsx`: only `brushUI.channelTypeIn(brushes.document) :161`.
- `brush/brushPanes.ts`: `BrushPaneDocument :90` (structural `{ frames }`); `brushPaneScene(doc, frameId, layerId) :104` (**no** frame-0 fallback — strict, on purpose); `BrushPaneRenderArgs.source: { document } :119`; paint-time call `:162`.
- `brush/brushToolContext.ts`, `brushFill.ts`, `brushSelection.ts`, `useBrush*.ts`: no document field reads; their **tests** build documents (`brushToolContext.test.ts:1050-1052`, `brushSelection.test.ts:13`).
- `HeaderContainer.tsx`: `brushes.brushName :226`, `brushList :230`, `hasBrush/renameBrush :233-234`, "Brush Projects" `:239`, `projectModal` → `BrushSelectModalContainer :267-273`.
- `BrushSelectModalContainer.tsx` (55): maps every modal callback to a `BrushStore` flow `:44-51`.
- `PixelStudioPanelContainer.tsx`: the `pixelBrush` block `:152-217` (`brushes.document :162`, `selectedFrameIn :165`, `native = { doc.width, doc.height } :178`, `hasBrush/brushName :200`, `doc.frames.indexOf :205`).
- `pixelBrush/usePixelBrush.ts` (207): signature `:135-139`; reads `:147-154`; reset effect `:159-163` keyed `[app, doc?.width, doc?.height]`; the scaled memo `:165-181` (`selectedFrameIn(doc) :167`, `srcW: doc.width :172`); returns `brushName :204`.
- `otherHand/pixelBrushWidgets.ts`: `doc = app.brushes.document :38`; `native :43`. `toolWidgets.ts:402-404` dispatches `case "brush"`.
- `CanvasContainer.tsx`: `usePixelBrush(app, currentTool === "brush", currentColor) :643`; consumes `.footprint` `:2290` and `.stamp` `:4425`. **Not touched by this plan.**

### UI (`client/src/ui/`)
- `components/BrushLibrary/` — `BrushLibrary.tsx` (257), `.css` (182), `.stories.tsx`, `storyFixtures.ts`, `brushName.ts` (`validateBrushName`, also imported by `BrushSelectModal.tsx:35`), `__tests__/BrushLibrary.dom.test.tsx`. All deleted except `brushName.ts` (moved).
- `components/BrushLayerPanel/BrushLayerRow.tsx` (362): the affordance pattern to copy — visibility button `:166`, badge buttons `:188/:207`, inline rename input `:239` + double-click `:261`, move up/down `:280/:293`, duplicate `:306`, delete `:318`.
- `components/BrushSelectModal/BrushSelectModal.tsx` (398): props `:42-63` (create takes `width, height`); copy strings `:120-386` (intro `:203-204`).
- `components/PixelStudioPanel/PixelStudioBrushSection.tsx`: `PixelStudioBrushInfo :78-92`; JSX `:249-319`; `BrushSizeControls :157`. `PixelStudioPanel.tsx:81-88` re-exports the types. CSS selectors in `PixelStudioPanel.css:170-334`.
- `layouts/BrushStudioLayout/BrushStudioLayout.tsx` (145): prop `brushLibrary :52`, rendered `:120`; `.stories.tsx` beside it.
- `primitives/ThumbnailCanvas` (`size`, `revision`, `draw`, `label`), `primitives/Dropdown` (`DropdownOption`), `primitives/NumberInput`, `primitives/EmptyState` — all exist.
- `canvas/render/renderBrushFrame.ts`: `renderBrushFrame(buffer, { layers, width, height })`, `createBrushBuffer(w, h)`, `BrushSceneLayer`. `canvas/tools/pixelBrushStamp.ts`: every export takes `layers + width + height`, never a document.

### Tests that construct documents (must move to brush-2 in the task that owns their subject)
`types/__tests__/brush.test.ts` (30) · `stores/domain/__tests__/BrushStructureStore.test.ts` (46, `twoByTwoDoc :80`) · `BrushUIStore.test.ts` (42, spread-override `{ ...createBrushDocument(4,4), frames }`) · `BrushPixelStore.test.ts` (39, `mkDocument :52`) · `BrushStore.test.ts` (37, fake api `:57-65`) · `stores/history/__tests__/brushCommands.test.ts` (12, `{ ...before, width: 8 }`) · `stores/__tests__/brushWiring.test.ts` (13) · `containers/brush/__tests__/brushToolContext.test.ts` (71) · `brushSelection.test.ts` (32) · `containers/pixelBrush/__tests__/usePixelBrush.dom.test.ts` (17) · `containers/__tests__/pixelBrushTool.dom.test.tsx` (13) · `BrushLayerPanelContainer.dom.test.tsx` (5) · `OtherHandRailContainer.dom.test.tsx` (15) · `PixelStudioPanelContainer.dom.test.tsx` (13) · `BrushStudioPanelContainer.dom.test.tsx` (8) · `BrushStudioContainer.dom.test.tsx` (6) · `api/__tests__/resources.contract.test.ts` (30) · `api/__mocks__/fixtures.ts` (`fixtureBrushDocument :164`) + `handlers.ts` (`:54-80`).

### Gate commands (confirmed in `client/package.json` / root `package.json`)
- **Client gate** = `cd client && bunx tsc --noEmit && bunx eslint . && bunx vitest run && bun run lint:boundaries`, then from the repo root `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` prints nothing.
- `bunx stylelint "src/**/*.css"` (client) — no new errors (baseline 2). `bunx storybook build` (client). `bun run format:check` (root; covers `client/src/types/**`). `bun run verify` (root: typecheck → lint → format:check → client test → build; it does **not** run stylelint, boundaries, storybook or server tests). Server: `cd server && bunx tsc --noEmit && bunx eslint . && bunx vitest run`.
- **Data-safety check**: `git diff --stat <base>..HEAD -- client/src/types/codecs client/src/services server/src/export` is empty and `git status --porcelain | grep __snapshots__` prints nothing.
- The `PreToolUse` hook blocks `vitest -u` and `--frozen-lockfile`. ESLint: `max-lines` 400 code lines is a **warning** everywhere and an **error** under `src/ui/**`; the warning baseline is 66 and every gate requires ≤ 66.

---

## 5. Wave table

| Wave | Tasks | Parallel | Gate before next wave |
| --- | --- | --- | --- |
| W1 | 01 store rename · 02 server default · 03 `BrushList` UI · 04 rail picker UI | 4 | **Full client gate green** (tsc clean, eslint 0e/≤66w, vitest all green, boundaries) + stylelint (no new errors) + `bunx storybook build` + server gate + no lockfile |
| W2 | 05 types · 06 msw fixtures · 07 history commands | 3 | `bunx vitest run src/types src/api src/stores/history` green · `bun run format:check` clean · corpus snapshots unchanged · `bunx tsc --noEmit` errors **confined to the W2 seam list** (§8) · vitest failures **only** in the W2 expected-red list (§8) · no lockfile |
| W3 | 08 `BrushUIStore` · 09 `BrushStructureStore` · 10 `BrushPixelStore` · 11 `BrushStore` + wiring | 4 | `bunx vitest run src/stores` green · tsc errors confined to the W3 seam list (§8) · vitest failures only in the W3 expected-red list · no lockfile |
| W4 | 12 studio containers · 13 brush list wiring + library removal · 14 pixel-studio wiring | 3 | **Full client gate green** + stylelint + storybook + boundaries + data-safety check + **manual checks** (12, 13, 14) + lint-warning count ≤ 66 |
| W5 | 15 final gate, docs, QA | 1 | `bun run verify` exit 0 + boundaries + stylelint + storybook + server gate + lockfile + data-safety + the manual QA table filled |

The W2 and W3 gates are deliberately **partial**: the shape change cannot land without a red seam, and plan 13 used the same discipline (its W2 carried 2 tsc errors closed in W3). The coordinator must paste the actual `tsc` file list and the actual failing-suite list into `HANDOFF.md` and confirm each is a subset of the allowed list. Anything outside the list is a real regression and blocks the next wave.

---

## 6. Dependency graph

```
W1  01 rename ──────────────────────────────┐
    02 server (independent)                 │
    03 BrushList UI (independent) ──────────┼───────────────┐
    04 picker UI (independent) ─────────────┼───────────┐   │
W2  05 types ◄─ (codes to §3 block)         │           │   │
    06 fixtures ◄─ 05                       │           │   │
    07 commands ◄─ 05                       │           │   │
W3  08 BrushUIStore ◄─ 05                   │           │   │
    09 Structure ◄─ 05, 07                  │           │   │
    10 Pixel ◄─ 05, 07                      │           │   │
    11 BrushStore + App ◄─ 01, 05, 06, 08   │           │   │
W4  12 studio containers ◄─ 08, 09, 10, 11 ─┘           │   │
    13 list wiring ◄─ 03, 08, 09, 11 ───────────────────┼───┘
    14 pixel wiring ◄─ 01, 04, 08, 11 ──────────────────┘
W5  15 ◄─ everything
```

---

## 7. Collision matrix

**W1**
| 01 | 02 | 03 | 04 |
| --- | --- | --- | --- |
| `stores/domain/BrushStore.ts` · `containers/HeaderContainer.tsx` · `containers/BrushSelectModalContainer.tsx` · `containers/BrushLibraryContainer.tsx` · `containers/BrushCanvasContainer.tsx` · `containers/PixelStudioPanelContainer.tsx` · `containers/pixelBrush/usePixelBrush.ts` · tests: `stores/domain/__tests__/BrushStore.test.ts` · `stores/__tests__/brushWiring.test.ts` · `containers/__tests__/BrushStudioContainer.dom.test.tsx` · `containers/__tests__/pixelBrushTool.dom.test.tsx` · `containers/__tests__/PixelStudioPanelContainer.dom.test.tsx` · `containers/pixelBrush/__tests__/usePixelBrush.dom.test.ts` · `containers/__tests__/OtherHandRailContainer.dom.test.tsx` (+ any other file the rename grep reveals — all under `client/src/stores/**` or `client/src/containers/**`) | `server/src/routes/brush.ts` · `server/src/__tests__/brushRoutes.test.ts` (new) | `client/src/ui/components/BrushList/**` (all new) | `client/src/ui/components/PixelStudioPanel/PixelStudioBrushSection.tsx` · `PixelStudioBrushSection.stories.tsx` · `__tests__/PixelStudioBrushSection.dom.test.tsx` · `PixelStudioPanel.css` |

Disjoint: 01 never enters `client/src/ui/**` or `server/`; 03 and 04 are different `ui/components/` folders.

**W2**
| 05 | 06 | 07 |
| --- | --- | --- |
| `client/src/types/brush.ts` · `client/src/types/__tests__/brush.test.ts` | `client/src/api/__mocks__/fixtures.ts` · `client/src/api/__mocks__/handlers.ts` · `client/src/api/__tests__/resources.contract.test.ts` | `client/src/stores/history/brushCommands.ts` · `client/src/stores/history/__tests__/brushCommands.test.ts` |

**W3**
| 08 | 09 | 10 | 11 |
| --- | --- | --- | --- |
| `stores/ui/BrushUIStore.ts` · `stores/ui/__tests__/BrushUIStore.test.ts` | `stores/domain/BrushStructureStore.ts` · `stores/domain/__tests__/BrushStructureStore.test.ts` | `stores/domain/BrushPixelStore.ts` · `stores/domain/__tests__/BrushPixelStore.test.ts` | `stores/domain/BrushStore.ts` · `stores/ApplicationStore.ts` · `stores/domain/__tests__/BrushStore.test.ts` · `stores/__tests__/brushWiring.test.ts` |

**W4**
| 12 | 13 | 14 |
| --- | --- | --- |
| `containers/brush/brushPanes.ts` · `containers/brush/__tests__/brushPanes.test.ts` · `brushToolContext.test.ts` · `brushSelection.test.ts` · `useBrushSelection.dom.test.ts` · `useBrushPointerHandlers.dom.test.ts` (only if they build documents) · `containers/BrushCanvasContainer.tsx` · `containers/BrushTimelineContainer.tsx` · `containers/BrushStudioPanelContainer.tsx` · `containers/BrushLayerPanelContainer.tsx` · `containers/__tests__/BrushLayerPanelContainer.dom.test.tsx` · `containers/__tests__/BrushStudioPanelContainer.dom.test.tsx` | `containers/BrushListContainer.tsx` (new) · `containers/__tests__/BrushListContainer.dom.test.tsx` (new) · `containers/BrushStudioContainer.tsx` · `containers/__tests__/BrushStudioContainer.dom.test.tsx` · `containers/BrushLibraryContainer.tsx` (deleted) · `ui/layouts/BrushStudioLayout/BrushStudioLayout.tsx` · `BrushStudioLayout.stories.tsx` · `ui/components/BrushLibrary/**` (deleted) · `ui/components/BrushSelectModal/brushName.ts` (new, moved) · `BrushSelectModal.tsx` · `BrushSelectModal.stories.tsx` · `__tests__/BrushSelectModal.dom.test.tsx` | `containers/pixelBrush/usePixelBrush.ts` · `containers/pixelBrush/__tests__/usePixelBrush.dom.test.ts` · `containers/PixelStudioPanelContainer.tsx` · `containers/__tests__/PixelStudioPanelContainer.dom.test.tsx` · `containers/otherHand/pixelBrushWidgets.ts` · `containers/__tests__/pixelBrushTool.dom.test.tsx` · `containers/__tests__/OtherHandRailContainer.dom.test.tsx` |

Disjoint by inspection: 12 owns the studio's canvas/timeline/layer-panel containers and `containers/brush/`; 13 owns the studio shell, the new list container and the library removal; 14 owns `pixelBrush/`, `otherHand/` and the pixel panel container.

---

## 8. Alignment guide

### Naming to hold
- **Project** = the file (`projectName`, `projectList`, `createProject`, …, "Brush Projects" in the header/modal). **Brush** = an entry in `doc.brushes` (`selectedBrushId`, `addBrush`, `BrushList`, "Brushes" in the rail). Never write "brush" for the file again after task 01.
- Pixel-studio artefacts stay `pixelBrush*` / `PixelBrush*` (plan 12 D2). `PixelStudioBrushOption` is the picker's row type.
- The selected-brush resolver is `brushIn(doc, id)` / `brushUI.selectedBrushIn(doc)` — never re-implement "find by id else first" inline.

### Files to imitate
- New container ↔ UI pair: `BrushLayerPanelContainer.tsx` ↔ `BrushLayerPanel.tsx` / `BrushLayerRow.tsx` (header + "+" + rows with hover actions + inline rename).
- Structural ops: every existing `BrushStructureStore` method — one `commit`, immutable spine copy, selection written through the sink after the commit.
- Thumbnails: `BrushLibraryContainer.makeBrushThumbnailDraw` (move it, do not rewrite it).
- Test rigs: `BrushLayerPanelContainer.dom.test.tsx` (container over a real `ApplicationStore`), `BrushStructureStore.test.ts` (fake api + document builder).

### Boundaries that must not be crossed
- `ui/` imports nothing from stores, api or mobx. `BrushList` receives `draw` closures and row models; it never sees a `Brush`, a grid or the document.
- `stores/ui/**` never imports `stores/domain/**`; `BrushUIStore` takes the document **in** (D4).
- `layer.pixels` and `brush.frames` are never observed. `document` stays `observable.ref`; canvases redraw from `pixelVersion`.
- Nothing under `types/codecs/`, `services/`, `server/src/export/`, `types/domain.ts`, `__snapshots__`.

### The W2 / W3 seams (what may be red, and only this)
- **W2 seam** — tsc errors allowed only in: `stores/domain/BrushStore.ts`, `BrushStructureStore.ts`, `BrushPixelStore.ts`, `stores/ui/BrushUIStore.ts`, `stores/ApplicationStore.ts`, `containers/brush/brushPanes.ts`, `containers/BrushCanvasContainer.tsx`, `BrushTimelineContainer.tsx`, `BrushLayerPanelContainer.tsx`, `BrushLibraryContainer.tsx`, `PixelStudioPanelContainer.tsx`, `containers/pixelBrush/usePixelBrush.ts`, `containers/otherHand/pixelBrushWidgets.ts`, and the test files listed in §4 "Tests that construct documents" (minus those W2 itself fixes). Expected-red vitest suites: `BrushStructureStore.test.ts`, `BrushUIStore.test.ts`, `BrushPixelStore.test.ts`, `BrushStore.test.ts`, `brushWiring.test.ts`, `brushToolContext.test.ts`, `brushSelection.test.ts`, `brushPanes.test.ts`, `usePixelBrush.dom.test.ts`, `pixelBrushTool.dom.test.tsx`, `BrushLayerPanelContainer.dom.test.tsx`, `OtherHandRailContainer.dom.test.tsx`, `PixelStudioPanelContainer.dom.test.tsx`, `BrushStudioPanelContainer.dom.test.tsx`, `BrushStudioContainer.dom.test.tsx`, `BrushLibrary.dom.test.tsx` (if it renders a document-shaped fixture).
- **W3 seam** — tsc errors allowed only in the `containers/**` files above and their tests; expected-red suites = the container suites above. Every `src/stores/**` suite must be green.
- Anything red outside the list is a regression: fix it inside the task's `Touches`, or stop and record it.

### What "done" looks like
- Left rail, top: a panel titled **Brushes** with thumbnail rows; the selected row highlighted; "+" opens name/W/H; hover shows ↑ ↓ duplicate delete. Below it, **Layers**, showing the selected brush's layers.
- Switching brush repaints both canvas panes, the timeline strip, and the layer rows in one frame; ⌘Z after `addBrush` removes the brush and re-selects the previous one.
- Pixel studio, Brush tool: the section's first row is **Brush** with a dropdown; picking changes the marker under the cursor immediately.

### Most likely mistakes
1. Resolving the brush by **index 0** somewhere instead of `selectedBrushId` — the studio and the stamp then disagree. Use `brushIn` / `selectedBrushIn`.
2. Forgetting to spine-copy `doc.brushes` in a write path (`replaceLayerGrid`, `commitBrush`) — a retained snapshot then aliases the live brush and undo corrupts. Every write returns `{ ...doc, brushes: replacedAt(...) }`.
3. Calling `brushUI.selectBrush(id)` **without** the document — the frame/layer ids stay `null` and every tool writes nowhere until the next document change. The signature takes `doc` for this reason; the structure store's sink adapter in `ApplicationStore` supplies it.
4. Leaving `BrushCanvasContainer.resyncKey` keyed on the project name only — the panes then keep a stale backing store across a brush switch of a different size. Add `selectedBrushId`.
5. Keying `usePixelBrush`'s reset effect on `doc` identity — the size would reset on every pixel write. Key it on the selected brush's `width`/`height` (D12).
6. Reversing the brush list like the layer list. Brushes display in array order; `moveBrush("up")` moves toward index 0.
7. Letting the picker's optional props become required in task 04 — the W1 gate then fails on `PixelStudioPanelContainer`, which task 01 owns in the same wave.

---

## 9. Risk register

| # | Risk | L | I | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- |
| R1 | The owner's real brush-1 files under `server/src/data/brushes/` are rewritten as brush-2 on first autosave; an older client could no longer read them | High (by design) | Med | Lossless wrap in the normaliser (task 05 pins a legacy fixture round-trip); the server keeps `.prev/<name>.json` once. **The coordinator must tell the owner to back up `server/src/data/brushes/` before running the app on this branch**; agents never touch that directory. | 05, 15 |
| R2 | The W2/W3 red seam hides a real regression | Med | High | Allowed lists are explicit (§8); the coordinator pastes the actual tsc file list and failing suites into HANDOFF and diffs against them. | coordinator |
| R3 | A write path forgets to spine-copy `brushes` → aliasing between history snapshots and the live document | Med | High | Tasks 09/10 add tests asserting `before.brushes[i] !== after.brushes[i]` for the touched brush and `===` for every other brush. | 09, 10 |
| R4 | `usePixelBrush` memo/effect keys wrong → stamp stale after a brush switch, or size reset on every stroke | Med | Med | D12 keys locked; dom tests: switch brush of another size → `resetSize` called; pixel write → not called. | 14 |
| R5 | `max-lines` error under `src/ui/**` for `BrushList.tsx` | Low | Med | Row component split out from the start (`BrushListRow.tsx`), as the layer panel does. | 03 |
| R6 | Lint warning count exceeds 66 (`toolWidgets.ts`, `CanvasContainer.tsx` already at the limit) | Low | Med | Neither file is touched; `pixelBrushWidgets.ts` absorbs the new widget. | 14 |
| R7 | Corpus JSON fixtures absent in the worktree → `src/types/__tests__` fails at the first gate | High | Low | Copy `client/src/test/__fixtures__/corpus/*.json` from the launch checkout before W1's gate; record in HANDOFF. | coordinator |
| R8 | Deleting `ui/components/BrushLibrary/` breaks an unlisted importer | Low | Low | Task 13 greps `BrushLibrary` and `brushName` before deleting; the only known importer is `BrushSelectModal.tsx:35`. | 13 |
| R9 | `bunx` recreates a lockfile | Low | Low | The lockfile `find` runs at every gate. | all |

---

## 10. Rules for every executor

- **Bun only.** `node`/`npm` are not on PATH. `bun add` always `--exact`. Never create a lockfile; never use `--frozen-lockfile`; check `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` before committing.
- **Never run `vitest -u`.** Snapshot diffs are read by a human. `git status --porcelain | grep __snapshots__` must print nothing.
- **Never touch `server/src/data/`**, `client/src/types/codecs/`, `client/src/services/`, `server/src/export/`, `types/domain.ts`. `types/brush.ts` is fair game (task 05 only) but the corpus suites must pass unchanged.
- **Never deep-observe a grid.** `document` is `observable.ref`; read grids inside memos and reactions keyed on `pixelVersion`.
- **The `ui/` boundary.** Nothing under `client/src/ui/` imports a store, the API or MobX; `observer()` only under `containers/`. Run `bun run lint:boundaries`.
- **Stay inside `Touches`.** The collision matrix is only valid if the list is accurate. If you must touch another file, stop, record it in `HANDOFF.md` under Deviations, and say so in your report.
- **Run the gate and paste the real output.** "It passes" is not a report. For W2/W3, paste the tsc file list and the failing-suite list and state that each is a subset of §8's allowed list.
- **Do the manual checks** listed in your task. A task whose manual checks were skipped is `PARTIAL`, not `DONE`, and says so.
- **Report honestly, including partial completion.** Six of eight steps with reasons beats a claim of success.
- One commit per task, prefixed per D16, with the session's attribution trailers.

---

## 11. Task index

| NN | Title | Wave | Effort | Summary |
| --- | --- | --- | --- | --- |
| 01 | `BrushStore` project-level rename | W1 | S | Mechanical `*Brush → *Project` rename of the file-level flows/fields and every caller and test; no behaviour change. |
| 02 | Server default document → brush-2 | W1 | S | `EMPTY_BRUSH_DOCUMENT` becomes a valid one-brush brush-2 document; first server brush route test. |
| 03 | `BrushList` UI component | W1 | M | Pure left-rail list of the brushes in a project: rows, thumbnails, inline create form, rename/duplicate/delete/move; stories + dom tests. |
| 04 | Pixel-rail brush picker UI | W1 | S | `PixelStudioBrushSection` gains an optional "Brush" dropdown row; stories + dom tests. |
| 05 | Types: `Brush` + brush-2 document + legacy normaliser | W2 | M | The wire shape, factories, `brushIn`, invariants, legacy wrap; the type test suite. |
| 06 | msw fixtures to brush-2 | W2 | S | `fixtureBrushDocument()` becomes a two-brush project; contract test follows. |
| 07 | History commands for brushes | W2 | S | `estimateBrushBytes` over brushes; `BrushPixelTarget.brushId`. |
| 08 | `BrushUIStore.selectedBrushId` | W3 | M | Brush selection, `selectBrush(id, doc)`, brush-scoped clamp and resolvers. |
| 09 | `BrushStructureStore` brush-scoped + brush CRUD | W3 | L | Every op on the selected brush; `addBrush`/`duplicateBrush`/`deleteBrush`/`renameBrush`/`moveBrush`. |
| 10 | `BrushPixelStore` brush-scoped | W3 | M | `resolveTarget`/`replaceLayerGrid`/`applyPatch` through the selected brush. |
| 11 | `BrushStore` + `ApplicationStore` wiring | W3 | S | `createProject` builds brush-2; the selection-sink adapter supplies the document. |
| 12 | Brush-studio containers on the selected brush | W4 | L | Panes, canvas, timeline, layer panel, studio panel, `containers/brush` tests. |
| 13 | `BrushListContainer`, studio wiring, library removal | W4 | M | The rail's top section becomes the brush list; `BrushLibrary` deleted; modal copy updated. |
| 14 | Pixel-studio wiring: hook, rail, other hand | W4 | M | `usePixelBrush`, `PixelStudioPanelContainer`, `pixelBrushWidgets` follow `selectedBrushId`. |
| 15 | Final gate, `ARCHITECTURE.md`, QA ledger | W5 | S | `bun run verify` + every side gate; docs; the manual QA table. |
