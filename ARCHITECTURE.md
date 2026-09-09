# pixel-art — architecture & contribution guide

How this project is put together and how to extend it without breaking the parts that
matter. For the rules an agent must obey, see [`CLAUDE.md`](./CLAUDE.md).

> **This document describes two states.** The project is mid-refresh, so each section
> gives **Today** (what is on disk) and **Target** (what the refresh is building).
> [`REFRESH/HANDOFF.md`](./REFRESH/HANDOFF.md) tells you which waves have landed and
> therefore which of the two you are actually looking at.

---

## 1. What the app is

A pixel-art editor for game sprites. Beyond drawing, it handles the things a sprite
pipeline needs:

- **Objects → frames → layers**, with a timeline and onion-skin/frame references.
- **Variants** — alternate versions of an object (palette swaps, equipment, states) that
  share structure and carry per-variant offsets. This is the most intricate domain in the
  codebase (`variantActions.ts` alone is 1,412 lines).
- **Lighting authoring** — every pixel carries a **normal** and a **height** alongside its
  colour, so sprites can be lit at runtime. A separate lighting studio mode edits these.
- **Export** — sprite sheets and a JSON manifest, rendered server-side with `sharp`.
- **AI frame interpolation** — a Python service generates in-between frames.

The domain shape that explains most of the code: **a pixel is not a colour.** It is
`[colour, normal, height]`, which is why the pixel grid is large (300,249 cells in the
owner's real project), why serialization has 8 migrations behind it, and why performance
rules exist around it.

## 2. The three processes

| Workspace     | Stack                                                             | Role                                                                 |
| ------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| `client/`     | React 18.3 + Vite 5.4 + TypeScript (→ React 19 / Vite 7 / TS 5.9) | The editor UI. All authoring happens here.                           |
| `server/`     | Express 4 + sharp (→ Express 5)                                   | Project persistence, backups, sprite export. Owns the files on disk. |
| `ai-service/` | Python                                                            | Frame interpolation (RIFE). Optional; the editor works without it.   |

`bun run dev` starts all three under mprocs. The client talks to the server over HTTP;
the server talks to the AI service.

**Bun is the only runtime — `node` and `npm` are not on PATH.**

---

## 3. Client structure

### Today

```
client/src/
  App.tsx            the whole app shell, both editor layouts, modal mounting
  main.tsx
  index.css          + 33 more global stylesheets, unscoped
  components/        30 component folders, each <Name>.tsx + <Name>.css
  store/             17 files, ~8,050 lines — one flat Zustand EditorState
  services/          api.ts, autoSave.ts, export.ts, aiService.ts
  types/             index.ts — 1,086 lines: types + serializers + all 8 migrations
  utils/             alphaBlend, edgeInterpolate, lightingRenderer, previewRenderer
```

**Known characteristics, measured rather than guessed:**

- One flat store from a single `create()`. **34 files import `useEditorStore`; 33
  destructure the whole store**, so every component re-renders on every change.
- `Canvas.tsx` is **3,062 lines** with 11 responsibilities and 47 store members in one
  destructure.
- CSS is global and unscoped: **31 critical class collisions**, 23 `!important`,
  `z-index` up to 99999, and 6 custom properties referenced 76 times but never defined.
- Zero tests, zero stories, zero lint config, zero CI.

Treat these as the conditions the refresh exists to fix, not as patterns to copy.

### Target

```
client/src/
  ui/            PURE presentation. Props in, callbacks out.
                 MAY NOT import a store, the API, or MobX. ESLint-enforced.
  containers/    the ONLY place observer() appears. Wires stores to ui/.
  stores/        MobX ApplicationStore = Session + Domain + UI + History
  api/           the ONLY place fetch() is called. Typed errors, timeouts.
  types/         types only — serializers and migrations move to their own modules
  styles/        tokens.css + BEM blocks (btn, modal, panel, slider, confirm-dialog)
```

**The layering rule, which is the point of the whole exercise:**

```
ui/  ←  containers/  →  stores/  →  api/
```

`ui/` is at the bottom and knows nothing. Containers are the only bidirectional layer.
A component that needs state does not reach for a store — a container passes it props.

### The target store tree

```
stores/
  ApplicationStore      constructs children, owns cross-store computeds
  session/              SessionStore, AutoSaveController
                        — lifetime is the browser tab, not the project
  domain/               DomainStore (owns the Project tree) + behaviour modules:
                        Object, Frame, Layer, Variant, Palette, PixelStore
  ui/                   UIStore + Tool, Viewport, Selection, Timeline,
                        Lighting, Reference, Modal, CanvasInteraction
  history/              HistoryStore + commands.ts
```

Two design choices worth knowing before you add to it:

**Domain sub-stores do not own data.** `ObjectStore` does not hold `objects` —
`DomainStore` does. Sub-stores are _behaviour modules over one observable tree_, because
operations like `makeVariant` mutate `project.objects` **and** `project.variants`
together. Splitting the data would turn an internal call into a cross-store write.

**Session vs UI is a lifetime distinction, not a topical one.** Clipboards and colour
history live on `SessionStore` specifically so they **survive a project switch** — that
cross-document lifetime is load-bearing and easy to destroy by "tidying" them into
`UIStore`, which is project-scoped.

### Brush documents

The brush studio (`studioMode === "brush"`, plan `docs/01-brush-studio/`) edits a
**brush document** — a separate file type, entirely independent of the pixel project's
wire format and its migrations. It reuses the pixel studio's toolbar, tool handlers,
`CanvasSurface` and `TimelineView`, but nothing about its data touches the project.

- **Store members** on `ApplicationStore`: `app.brushes` (`BrushStore` — owns the
  document and its list/load/create/rename/delete lifecycle), `app.brushStructure`
  (frame and layer ops), `app.brushPixels` (cell writes, move, flips), `app.brushUI`
  (selected frame/layer, the two delta slots, zoom/pan, playback — in-memory, never
  persisted), `app.brushViews` (a second `CanvasViewsUIStore`: which panes are open, the
  Layer pane's camera, the keyboard owner) and `app.brushAutoSave`. The structure and
  pixel stores are behaviour modules over `brushes.document`, the same way the domain
  sub-stores are over `DomainStore`.
- **Document shape** (`client/src/types/brush.ts`):
  `BrushDocument { version: "brush-1"; width; height; frames; appliedGroups }`.
  Every `BrushLayer` carries a
  `channelType` (`hsl | rgb | normal | heightmap`) and a `pixels: BrushCell[][]` grid
  indexed `[y][x]`, where a cell is `0` (unpainted) or a 4-tuple of signed deltas in
  −255..255, rendered colourised with 127 = zero delta (`brushCellToRgba`). The
  in-memory shape **is** the wire shape (plain `JSON.stringify`) — no compact codec, no
  migration chain. The file carries no name: the filename stem is the identity, as for
  projects.
- **Where files live:** `server/src/data/brushes/<name>.json`, written atomically with
  `safeWriteFile`; the previous version is copied to
  `server/src/data/brushes/.prev/<name>.json` before each overwrite (one deep, no
  rotation, not part of the project backup snapshots). Routes: `GET /api/brushes`,
  `GET | POST | DELETE /api/brush?name=`, `POST /api/brush/create | rename`
  (`server/src/routes/brush.ts`), called only through
  `client/src/api/resources/brushApi.ts`. Names go through `isValidProjectName`.
- **The uniform-layer invariant:** every frame has the same layer ids in the same order.
  `BrushStructureStore` runs `assertUniformLayers` on every changed document before it
  is recorded — layers can be swapped, never ordered per frame. A file that violates it
  fails `normalizeBrushDocument` and does not load.
- **`document` is `observable.ref`, always.** Every mutation replaces the document
  immutably (spine copy, touched rows only) and bumps `domainVersion` and/or
  `pixelVersion`; the canvas and thumbnails redraw from those counters, exactly as the
  pixel grids do in §5. Never `observable`, never `observer` over grid contents.
- **Separate history:** `BrushStore` owns its own `HistoryStore`. `app.activeHistory` is
  `brushes.history` in brush mode and the project `history` otherwise; `app.undo()`,
  `app.redo()` and the toolbar route through it, so ⌘Z in the brush studio never touches
  the project's undo stack. Commands live in `stores/history/brushCommands.ts`:
  whole-document snapshots for structural ops, `{x, y, before, after}` inverse patches
  for pixel writes, strokes wrapped in one transaction.
- **Separate autosave:** `app.brushAutoSave` is a second `AutoSaveController<BrushDocument>`
  (the controller is generic over a structural `AutoSaveDocument<TDoc>`), triggered by
  `[loadGeneration, domainVersion, pixelVersion]` of `BrushStore` and saving through
  `brushApi.save`. It shares `SessionStore` with the project controller — one
  `saveStatus` dot and one `saveSuspended` flag serve both. A brush undo/redo bumps the
  counters during replay, so it schedules a save of the restored document (accepted and
  pinned by a test; the pixel project does not do this).
- **Camera and panes** (plan `docs/11-brush-studio-followups/`): the brush canvas runs on
  the same `ui/hooks/useCanvasViewport` engine as the pixel and lighting canvases —
  `containers/brush/useBrushCamera.ts` is a thin adapter over it, and
  `canvasTouchFilter` arbitrates Pencil against resting fingers exactly as in
  `CanvasContainer`. `brushUI` **`implements CanvasCamera`** (`viewZoom`,
  `setViewZoom(z, floor)`, `resetView`) and is the **Full** pane's camera;
  `app.brushViews.layerCamera` is the **Layer** pane's. `brushUI.zoom` (integer px/cell)
  is shared by both panes and no gesture changes it any more — pinch and wheel move only
  `viewZoom`, so `combinedScale = zoom * viewZoom` is computed once in the adapter and
  the backing store stays 1:1 with the cells (the fix for the measured blur: fractional
  px/cell after a pinch). `BrushStudioContainer` renders `CanvasSplit` over
  `brushViews.openModes`, one `<BrushCanvasContainer renderMode>` per pane; Layer mode
  renders only the selected layer (`brushPaneScene`), keys are handled by the pane that
  is `brushViews.keyboardOwner`, and the pane compositor and view-control builder live in
  `containers/brush/brushPanes.ts` (`useBrushPaneRender`, `brushPaneControls`).
- **Edge/fill deltas:** `brushUI` holds two slots — `selectedDelta` (edge, the original
  name) and `fillDelta` — with `deltaTarget: "edge" | "fill"`, the computed
  `activeDelta`, `setActiveDelta` / `setActiveDeltaChannel` / `resetActiveDelta`, and
  `swapDeltas` (bound to `X` in brush mode by `GlobalHotkeys`; `BrushDeltaPicker` shows
  the colour picker's Edge/Fill tabs and swap button). Neither slot is persisted or
  undoable. The tool handlers never see a delta: `containers/brush/brushToolContext.ts`
  hands them two sentinel colours, `DUMMY_TOOL_COLOR` (edge, `a: 255`) and
  `DUMMY_FILL_COLOR` (fill, `a: 254`). Pencil, eraser, line and shape outlines emit the
  edge sentinel; flood and gaussian fills emit the fill sentinel; and
  `mapWritesToBrushCells(writes, edge, fill)` routes each write to a delta by sentinel
  identity or its `a` byte (`0` erases). A `"both"` shape is split per pixel with
  `getShapeOutlineKeys` (`shapeCommitCells`), and the preview is colourised by the same
  routine, so it cannot disagree with the commit.
- **Timeline floor:** `TimelineView` takes an opt-in `minRows` (root modifier
  `timeline-view--min-rows` + CSS var `--timeline-min-rows`); `BrushTimelineContainer`
  passes 5 so the brush rail is five rows tall even with one layer. The pixel studio
  does not pass it.
- **Files:** pure UI in `ui/components/Brush{Library,LayerPanel,DeltaPicker,SelectModal}/`
  and `ui/layouts/BrushStudioLayout/`; containers are `containers/Brush*Container.tsx`;
  the canvas container's store-free helpers live in `containers/brush/`
  (`brushToolContext` maps each `ToolPixelWrite` sentinel colour to the edge or fill
  delta, `brushFill`, `brushSelection`, `brushPanes`, and the
  `useBrush{PointerHandlers,Selection,Hover,Camera}` hooks lifted out to keep the
  container under `max-lines`).

---

## 4. Server structure

```
server/src/
  index.ts     Express app
  backup.ts    rolling gzipped snapshots of project files
  routes/
    project.ts  load/save/list
    export.ts   927 lines, one 440-line handler → task 11 decomposes it
    ai.ts       proxy to the Python service
```

The server owns **real user data**: `server/src/data/` and `server/exports/` are
gitignored because they hold the owner's actual work.

⚠️ **`server/exports/lib/` is consumed by external game code.** Its published format may
not change without a coordinated version bump and owner sign-off.

---

## 5. Rules that exist for a measured reason

Each of these was written after something was measured. They read as arbitrary until you
know the number behind them.

### Pixel grids are `observable.ref`, never deep

300,249 cells. Deep observation is ~1M proxies. It will present as "MobX is slow" rather
than as the modelling error it is. Canvases render from a `reaction` on `pixelVersion`,
not from `observer`. **Gate: a 100-pixel drag must stay under 16 ms/frame.**

### The serialization layer is load-bearing — treat it as such

8 schema migrations stand between the saved files and corruption, and a bad refactor
**mangles pixels silently rather than erroring.**

**No pre-migration data survives anywhere in the repo** (measured 2026-08-16 across all
149 backup snapshots). The migrations can therefore only be tested against hand-authored
synthetic fixtures — there is no real-data safety net. Four known migration bugs are
**pinned as characterisation tests, not fixed**: they assert the current, buggy behaviour
on purpose, so that a refactor that changes it fails loudly.

If you touch `types/`, `services/`, `stores/domain/` or `server/src/export/`: re-run the
corpus suite and confirm it passes **unchanged**. **Never `vitest -u`** there.

### The wire format does not change

Every field that goes into a saved project must come back byte-identically. Months of the
owner's backups depend on it. `toPersistedUIState()` is an **explicit field-by-field
builder, never a spread** — a spread silently ships whatever field someone adds next.

### `ui/` may not import a store

Enforced by ESLint, and **verified by a probe that must fail lint.** A
`no-restricted-imports` rule keyed to a path that does not exist matches nothing, and a
rule matching nothing looks exactly like a rule that passes. If you move or rename
`src/ui/`, re-run the probe.

---

## 6. How to make a change

### Adding a UI component

1. Build it in `ui/components/<Name>/` — pure, props in and callbacks out, no store import.
2. Style it with BEM (`block__element--modifier`) using the tokens in `styles/tokens.css`.
   No colour literals, no numeric `z-index`, no `!important`.
3. Write a Storybook story. Stories bubble up: primitives → components → full-page layouts.
4. If it needs state, write a container in `containers/` that wires the store to it.
   `observer()` goes there and only there.

### Adding state

1. Decide the **lifetime** first: survives a project switch → `SessionStore`; scoped to the
   project → the matching `ui/` sub-store; part of the saved document → `domain/`.
2. If it persists, add it to `toPersistedUIState()` explicitly and bump
   `persistedUIVersion`. **Add a round-trip assertion** — the golden test is what stops a
   field going missing from someone's saved work.
3. If it should be undoable, express it as a **command** in `history/commands.ts`. Prefer
   inverse patches over snapshots on hot paths; a 50-pixel stroke command should be
   under 5 kB.

### Adding a server route

1. Validate input with the shared validator — do not re-implement `isValidProjectName`.
2. Return typed errors. **Never fabricate a success value on failure**: six functions used
   to do this, and one of them could overwrite the owner's 1.1 MB project with a blank
   default.
3. Call it through `client/src/api/` — the client's single `fetch` site. Every request
   gets a timeout.

### Guidelines

- **~300 lines is the file guideline.** 46 files currently exceed 250; that is the debt
  being paid down, not a licence to add more.
- **One responsibility per file.** `Canvas.tsx` having 11 is why it takes three sequential
  tasks to dismantle.
- Prefer deleting duplication over abstracting it. ~1,960 duplicated lines were measured,
  ~1,400 mechanically removable — including alpha compositing implemented **five times**
  and a variant-offset fallback implemented **six**.

---

## 7. Verification

```sh
cd client && bunx tsc --noEmit     # typecheck
cd client && bun run build         # typecheck + build
cd server && bunx tsc --noEmit
```

Arriving with later refresh waves: `bunx vitest run` (W4+), `bunx eslint .` (W3+),
`bunx storybook build` (W6+), `bunx stylelint` (W7+), and finally **`bun run verify`**
(W29) — the single command that runs the whole gate.

**Some things here are not automatable and must be checked by hand**: gesture behaviour
on both mouse and touch, StrictMode double-invocation, z-index stacking with a modal
open, and canvas visual regressions. A change whose manual checks were skipped is not
done.

---

## 8. Where to read next

| Question                                    | File                                |
| ------------------------------------------- | ----------------------------------- |
| What is the refresh doing, and where is it? | `REFRESH/HANDOFF.md`                |
| How do I execute a refresh wave?            | `REFRESH/PROTOCOL.md`               |
| What is the full plan?                      | `REFRESH/MASTER.md`                 |
| What exactly does task N do?                | `REFRESH/NN-*.md`                   |
| Why was X decided that way?                 | `REFRESH/OPEN-QUESTIONS.md`         |
| What was measured, and how?                 | `REFRESH-PREP/findings/` (8 audits) |
| How does the brush studio work, and why?    | `docs/01-brush-studio/MASTER.md`    |
