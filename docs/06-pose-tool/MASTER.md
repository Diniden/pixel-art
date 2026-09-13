# MASTER — Pose tool

Plan folder: `docs/06-pose-tool/`. Planned 2026-09-02. Executed by `/plan-go`.

## 1. Request

Verbatim:

> let's work on a new feature: Pose tool
>
> - this tool will be for loading a 3d model: rendering it above all the layers, allow the user to adjust the lighting on the model and rotation of the model. Adjust camera properties for the rendering. Then ultimately let the user use the pose as a reference or tell it to stamp to the current layer.
> - selecting the pose tool should make the side rail adopt the tool for the side rail.
> - side rail should have buttons for some common pose objects: cube, sphere, cylinder
> - more buttons for human pose models: head, body, etc (look online for free simple 3d meshes that are used for pose references)
> - tool side rail: we should use an orb the user can drag to change the lighting direction and an orb to change rotation of the model. Buttons should be available for common view points.
> - tool side rail: lighting color and model color
> - tool side rail: camera controls to adjust scaling and perspective and angles. There should be several common angles for common pixel games like 2.5d, iso, 2d etc. camera should have perspective and orthographic options.
> - rendering the model should be rendering to a texture and using all techniques to make it pixelated. The canvas and texture should be pixel matches perfectly to the pixel data zone we have and this rendering system should respond to the canvas being worked on getting resized. So the result should be a pixelated version of the 3d object but we get to see its reduced resolution form which will help with pixel drawing reference.
> - clicking and dragging the model while the tool mode is selected should pan the model around
> - initial rendering of the model should have all the settings be set correctly to center the model in the canvas and be sized appropriately to fit within the borders with some extra padding.
> - double clicking the model should take all of the pixels rendered for the model at that place and stamp those pixels into the current layer being edited.

**Interpretation.** A 17th pixel-studio tool, `pose`. While it is selected, a three.js
scene renders a reference solid — a primitive or a CC0 mannequin — into an **offscreen
WebGL render target sized exactly `cellWidth × cellHeight`** (the grid's cell dimensions,
1:1 with the pixel data), which is then blitted to a new always-mounted raster overlay
canvas sitting above every layer. Because the render target is one texel per art pixel and
the whole canvas stack is magnified by a single CSS transform with `image-rendering:
pixelated`, the reference appears at the artwork's true resolution — that *is* the
pixelation technique, not a post-process. The right rail adopts a Pose section carrying
mesh buttons, two drag-orbs (light direction, model rotation), colour pickers, and camera
controls. Dragging on the canvas pans the model; double-clicking stamps the rendered
pixels — **colour, normal and height** — into the active layer as one undoable entry.

**Assumptions made, where the request was ambiguous.**

- **"Above all the layers"** means above the layer stack *visually*, as a non-destructive
  overlay. The model is never part of the document until stamped. Nothing about the pose
  is saved into the project file (see D6) — it is session state, exactly like reflection
  lines.
- **"Head, body, etc."** — the CC0 mannequin (D3) is a single unrigged mesh, so per-part
  buttons are implemented as **camera framing presets over the one mannequin** (Full body,
  Head, Torso, Arm, Leg, Hand), which frame the named region, rather than as separate
  meshes. This delivers the asked-for buttons without inventing a rigged asset.
- **The stamp writes all three channels** (owner decision, this session): colour from the
  lit render, normal from the surface normal buffer, height from the depth buffer. See D8
  for the mapping and D9 for why this needs a new store action.
- **"Pan the model"** is a screen-space translation of the model within the frame; it does
  not rotate. Rotation is the orb. This keeps drag unambiguous.
- **Double-click stamps everything currently rendered** — every non-transparent texel of
  the render target, at its current position. Not a click-point flood.
- The tool is **pixel-studio only**. The lighting studio (`LightingCanvasContainer`) does
  not get the overlay.
- The **split-canvas Layer pane** (plan 02) does not get the overlay. Only the main
  `CanvasSurface`. Recorded for a future plan.

## 2. Outcome

When the plan is complete the owner can:

- Press `P` (or click the Pose button) to select the tool. The right rail replaces its
  contents with a **Pose** section.
- Click **Cube / Sphere / Cylinder / Mannequin** to load a reference solid. It appears
  immediately, **auto-centred and auto-fitted with ~10% padding** inside the canvas
  bounds, at the artwork's own resolution — visibly chunky, aliased to the pixel grid.
- Drag the **light orb** to move the key light around the model in real time; drag the
  **rotation orb** to tumble the model. Click **Front / Back / Left / Right / Top /
  Bottom / 3/4** to snap the rotation.
- Pick a **model colour** and a **light colour**.
- Choose a **camera projection** (Perspective / Orthographic), a **framing preset**
  (2D front-on, 2.5D, True isometric, Top-down, Oblique), a **zoom/scale** and an
  optional **FOV**.
- Drag on the canvas to **pan** the model; the render follows at interactive rate.
- **Resize the object** and watch the render target resize with it, re-fitting the model —
  no stretching, no blurring, still 1:1.
- **Double-click** the model to stamp its pixels into the current layer — colour, normal
  and height together, as **one** undo entry, respecting an active selection mask.
- Switch to another tool and the overlay disappears; switch back and the pose is still
  there. Open a different project and it is cleared.
- `bun run verify` exits 0.

## 3. Locked decisions

Executors **must not re-decide these**. If one is genuinely wrong, record it in
`HANDOFF.md` under Deviations and say why.

| # | Decision | Value |
| --- | --- | --- |
| **D1** | Tool id / hotkey / icon / label / position | `"pose"` · `P`/`p` (verified free — `TOOL_HOTKEYS` has no `p`) · lucide `Box` · `"Pose (3D reference)"` · placed after `origin`, last in the `tools[]` array of `PixelStudioTools.tsx` |
| **D2** | 3D engine | **three.js**, added with `bun add --exact three` + `bun add --exact --dev @types/three` in `client/`. **Lazy-loaded** via a dynamic `import("three")` behind the pose engine module so it stays out of the main bundle until the tool is first used. ⚠️ **`bunx`/`bun add` can write a lockfile — check and delete.** |
| **D3** | Mannequin asset | **`burning-barb.itch.io/mannequin`**, license **CC0 1.0 Universal** (verified 2026-09-02), `mannequin.gltf` 372 kB, 9.6k tris, **unrigged**, 2 material slots. Vendored to `client/public/models/mannequin.gltf` with `client/public/models/LICENSE.md` recording source + license verbatim. Loaded with three's `GLTFLoader` from `three/examples/jsm/loaders/GLTFLoader.js`. **Task 09 is the only task that downloads it and it must ask the owner to confirm the download before committing a binary asset.** If the download fails or the license cannot be re-verified at execution time, task 09 stops and records BLOCKED — the primitives still ship. |
| **D4** | Human "parts" buttons | **Camera framing presets over the one mannequin**, not separate meshes (it is unrigged). Presets: Full body · Head · Torso · Arm · Leg · Hand. Each is a normalised bounding-box sub-region of the mannequin, defined once in `poseMeshes.ts` and applied by the same auto-fit routine as D7. |
| **D5** | Render pipeline | Offscreen `THREE.WebGLRenderTarget` at **exactly `cellWidth × cellHeight`** (the same 1:1 dimensions every other canvas in the stack uses). Renderer created with `antialias: false`; target textures use `THREE.NearestFilter` for both min and mag. Read back with `renderer.readRenderTargetPixels` into a `Uint8Array`, written to an `ImageData`, `putImageData` onto the overlay canvas. **No `drawImage` scaling anywhere** — magnification is the existing CSS transform plus `image-rendering: pixelated`. This is the whole "make it pixelated" answer: never render at high resolution and downsample. |
| **D6** | State home & lifetime | New `stores/ui/PoseUIStore.ts`, attached as `app.pose`. **Session-only: no key is added to `toPersistedUIState()`** — the wire format does not change and the 151 corpus snapshot digests must stay identical. Not in history (only the *stamp* is undoable). Cleared by a `reaction` on `DomainStore.loadGeneration` in `ApplicationStore`, exactly like `ReflectionUIStore` — **not** via `adoptProject`, which also runs on undo. |
| **D7** | Initial framing | On mesh load: compute the mesh's world bounding sphere, place the camera to frame it, then scale so the projected bounding box occupies **90%** of the shorter canvas axis (10% total padding), centred. One pure function `fitCameraToMesh()` in `poseCamera.ts`, re-run on mesh change, framing-preset change, projection change, and **on any `cellWidth`/`cellHeight` change** (the resize requirement). Pan offset is reset to zero by a mesh change but **preserved** across a resize. |
| **D8** | What the stamp writes | All three channels, one entry. **Colour** = the lit RGB, alpha-thresholded at `>= 128` (a texel is either stamped or not; the pixel format has no partial alpha for this purpose). **Normal** = the view-space surface normal from a second render pass with `MeshNormalMaterial`, decoded `n = rgb/255 * 2 - 1`, stored in the project's existing `Normal` shape. **Height** = the linearised depth from the depth buffer, normalised across the model's own near/far bounds to the project's height range. The height mapping is defined once in `poseStamp.ts` and unit-tested; if the depth read proves unavailable on the owner's hardware, task 08 falls back to **height = 0 for every stamped pixel** and records it as a deviation rather than blocking colour+normal. |
| **D9** | How the stamp commits | ⚠️ **A new `PixelStore.setPixelCells()` action is required.** The three existing actions cannot do this: `setPixels` writes colour only; `setNormalPixels`/`setHeightPixels` **refuse any cell whose colour is `0`** (`PixelStore.ts:1303`, `collectLightingPatches`) and each opens **its own** history entry. Chaining them would (a) drop every newly-stamped pixel's normal, because the colour is written in a different commit, and (b) produce three undo steps. `setPixelCells(cells: readonly {x,y,color,normal,height}[], options)` builds one patch list writing all three members and routes through the **existing private `commitCells`** — one history entry, one `publishAndBump`, one `publishDirty`. It reuses `allows()` for the mask and the same later-wins dedupe as `setPixels`. It is **additive**: no existing action changes behaviour. |
| **D10** | Overlay placement | A new always-mounted `<canvas className="canvas__overlay canvas__overlay--pose">` in `CanvasSurface`, inserted **immediately before** the reflection overlay so it sits above every layer and below the reflection guides and the SVG chrome. DOM order is z-order — `--z-canvas-overlay` is shared and **no numeric z-index may be added** (stylelint error). Ref prop `poseCanvasRef` is **optional** so task 05 compiles before task 07 wires it. |
| **D11** | Repaint cadence | The pose overlay gets **its own `useCanvasRender`**, never the main `render`. Orb drags and pans are pointer-rate; routing them through `render` would repaint every cell of every layer per sample (the measured 2026-08-28 class of bug). Drag state lives in **refs**, and repaint is `invalidate()` — never `useState` per pointer sample. Precedent: the hover overlay, `CanvasContainer.tsx:2069-2099`. |
| **D12** | Gesture routing | `pose` is added to `isGestureTool()` so it never opens a history stroke or writes pixels through the tool table. Its `toolHandlers` entry is an empty `pose: {}`. Drag (pan) and double-click (stamp) are arbitrated in `CanvasContainer` **ahead of** the tool table, exactly like `origin` and `reflection`, and **before** the touch `isGestureTool` bails so touch works. Double-click is detected as two pointer-downs within **400 ms** and **within 2 cells**, tracked in a ref — `dblclick` alone is unreliable on touch. |
| **D13** | Orb control | One reusable pure component `ui/components/PosePanel/DirectionOrb.tsx`, used twice (light, rotation). It renders an SVG sphere with a draggable handle, takes `{x,y,z}` unit-vector-ish props and emits the same, and owns **no** store. Dragging maps to yaw/pitch. It must work with mouse **and** touch (`pointerdown`/`pointermove`/`pointerup` with `setPointerCapture`). |
| **D14** | Camera presets | `"2d"` (front orthographic) · `"2.5d"` (~30° pitch, orthographic) · `"iso"` (true isometric: 35.264° pitch, 45° yaw, orthographic) · `"top-down"` (90° pitch, orthographic) · `"oblique"` (45° yaw, perspective). Defined once as data in `poseCamera.ts`; a preset sets projection + angles but leaves zoom and pan untouched. |
| **D15** | Where three.js may live | **`three` is a third-party render library, not a store/API/MobX** — the `ui/` boundary rule (`check-boundaries.mjs` rule 1) blocks `stores/`, `store/`, `api/`, `services/`, `mobx`, `mobx-react-lite`, `useContext`. **It does not block `three`.** The engine therefore lives under `client/src/ui/canvas/pose/` alongside the other pure canvas modules, and must stay pure: no store import, no MobX, no `observer()`. Verify with `bun run lint:boundaries`. |
| **D16** | Studio scope | Pixel studio only. `LightingCanvasContainer` is **not** touched. The split-canvas Layer pane is **not** touched. |

## 4. Ground truth (measured 2026-09-02)

**Refresh state: COMPLETE.** There is no `REFRESH/` directory (`ls -d REFRESH` → not found);
the last refresh commit is `8c1edb3 "THE REFRESH IS COMPLETE. All 38 tasks landed."` Every
file this plan touches is already in the **target** architecture, so there is exactly one
pattern to follow: MobX stores under `stores/`, pure `ui/`, `observer()` only in
`containers/`, BEM CSS with tokens. The legacy `client/src/store/` (Zustand) is residue and
must not be extended. **`client/src/components/Canvas/drawingUtils.ts` is current, not
legacy** — it deliberately sits outside the `ui/` boundary so pure `ui/canvas/tools/*`
modules can take its rasterisers as injected parameters.

**Branch / worktree.** Branch `feat/03-reflection-tool`, HEAD `cd7a852`. ⚠️ **The worktree is
DIRTY** — 27 modified files and 1 untracked, an in-flight **edge/fill colour split**
(`ToolUIStore.fillColor` + `colorTarget`, `ColorPicker` tabs, a new `"pixel-unbounded"`
snap mode, marker policy). It is unrelated to this plan but **shares four files** with it:
`types/domain.ts`, `ui/components/Toolbar/PixelStudioTools.tsx`, `stores/ui/UIStore.ts`,
`containers/CanvasContainer.tsx`. See the risk register — this is the single biggest
execution hazard.

**Gate (measured from `client/`, this session).**

| Command | Result |
| --- | --- |
| `bunx tsc --noEmit` | **exit 0**, clean |
| `bunx stylelint "src/**/*.css"` | **exit 0** — 69 problems: **2 errors** (`OtherHand.css:338` and `:359`) + 67 warnings. **This 2-error baseline is pre-existing.** New CSS must not raise it. |
| `bunx eslint .` | **exit 0** — 0 errors, 65 warnings (measured this session) |
| `bunx vitest run` | two lanes: `unit` (node, `*.test.ts`), `dom` (jsdom, `*.dom.test.*`) |
| `bun run lint:boundaries` | 5 rules, from `client/scripts/check-boundaries.mjs` |
| `bun run verify` (root) | `typecheck && lint && format:check && test && build` |
| `find . -maxdepth 2 -name 'bun.lock*' \| grep -v node_modules` | **empty — and must stay empty** |

**No 3D library is installed.** `three`, `babylon`, `gl-matrix`, `ogl` are all absent from
`node_modules` and both `package.json` files. **No WebGL context is created anywhere in
`client/src`** — this plan introduces the first one. `client/public/` contains only
`favicon.svg` and `mockServiceWorker.js`; there is no `assets/` directory in `src`.

**Tool system — the 5 registration gates.**

1. `types/domain.ts:333-350` — the `Tool` union, 17 members today (`pose` makes 18).
2. `ui/canvas/tools/toolHandlers.ts:186-265` — the dispatch table.
3. `ui/canvas/tools/toolHandlers.ts:289` — `export const TOOLS_ARE_EXHAUSTIVE: AssertSame<HandledTool, DomainTool> = true;` **A union member with no table entry is a `tsc` failure.**
4. `ui/hooks/useCanvasKeyboard.ts:44-57` (`HotkeyTool`) and `:70-86` (`TOOL_HOTKEYS`).
5. `ui/components/Toolbar/PixelStudioTools.tsx:90-123` — the `tools[]` array (12 buttons).

Optional: `containers/otherHand/toolWidgets.ts:24-41` + `:179-367` — the tablet thumb rail.
Reflection is **not** handled there and falls to `default`; **pose does the same** (out of
scope, recorded).

**The side rail — two panels, both in the right rail.** Mounted at
`ui/layouts/PixelStudioLayout/PixelStudioLayout.tsx:160-169`, supplied from
`containers/PixelStudioContainer.tsx:198-207`.

- `RightSidebarTopControls` — the "Tool Options" panel. Switching is plain booleans at
  `RightSidebarTopControls.tsx:111-128`. **Not used by this plan.**
- **`PixelStudioPanel`** — the per-tool sections. Switching at `PixelStudioPanel.tsx:139-142`
  (`showEraserControls`, `showPencilControls`, `showOriginControls`, `showReflectionControls`).
  Render at `:145-288`. **This is where the Pose section goes.**

**The analogue to copy for the rail: the Reflection section.** Three pieces —
(i) pure `ui/components/PixelStudioPanel/ReflectionLinesSection.tsx` with props and no store;
(ii) the mount in `PixelStudioPanel.tsx:272-284`, where the props arrive as **ONE optional
grouped object** (`reflection?: ReflectionLinesSectionProps`, `:118`) precisely so existing
callers and stories do not break; (iii) container wiring in
`PixelStudioPanelContainer.tsx:79-98`.

**Canvas stack.** `ui/components/CanvasSurface/CanvasSurface.tsx` (780 lines), DOM at
`:540-779`. Inside `.canvas__frame`, in source order: background div (`:582`), layer canvases
(`:608`), pointer surface `.canvas__surface` (`:632`), hover overlay (`:652`), reference
overlay (`:660`), frame overlay (`:669`), frame-trace overlay (`:679`), reflection overlay
(`:695`), SVG chrome (`:714`). **DOM order IS z-order** — every absolutely-positioned block
shares `--z-canvas-overlay: 20` (`styles/tokens.css:433`) and the later sibling wins. Adding
a numeric z-index is a stylelint error. ⚠️ `CanvasSurface.css:53-72`: **never add
`will-change: transform`** to `.canvas__layout` — promotion rasterises at 1:1 then
GPU-bilinear-scales, defeating `pixelated`.

**Backing stores are 1:1 with pixel data** (`cellWidth × cellHeight`), never `* zoom`. All
magnification is the single CSS transform on `.canvas__layout` plus `image-rendering:
pixelated`. This is why D5's render target is trivially "pixel matched" — it is the same
dimensions as every other canvas in the stack.

**The overlay recipe** (from `renderOverlay`, `CanvasContainer.tsx:2226-2295`):

```ts
const canvas = poseCanvasRef.current;
const ctx = canvas?.getContext("2d");
if (!canvas || !ctx || !active) { if (canvas && ctx) ctx.clearRect(0,0,canvas.width,canvas.height); return; }
canvas.width = cellWidth; canvas.height = cellHeight;   // 1:1, never * zoom
ctx.imageSmoothingEnabled = false;                      // reset by setting .width
ctx.clearRect(0, 0, cellWidth, cellHeight);
const ox = isEditingVariantResolved ? viewMinX : 0;     // view-space shift
const oy = isEditingVariantResolved ? viewMinY : 0;
```

**Dimensions and resize.** `PixelObject.gridSize` at `types/domain.ts:66`;
`Variant.gridSize` at `:83`. Flow:
`gridSize → gridWidth/gridHeight → useCanvasGeometry → cellWidth/cellHeight →
<canvas width height>` (`CanvasContainer.tsx:4270-4271`). ⚠️ **Resize notifies through
`domainVersion`, not `pixelVersion`** (`DomainStore.ts:224/272/308`); `ObjectStore.resizeObject`
at `:129`. Setting `canvas.width` **clears the backing store and resets
`imageSmoothingEnabled` to `true`** — re-set it on every context acquisition
(`CanvasContainer.tsx:1436`).

**Repaint plumbing.** `useCanvasRender(render, deps)` (`ui/hooks/useCanvasRender.ts:153`)
returns `{invalidate, invalidateRegion}`, one-shot rAF. The hover overlay is the precedent
for an independent cadence: `renderHover` at `CanvasContainer.tsx:2069-2093`, its own
`useCanvasRender` at `:2099`, pointer moves write `hoverPixelRef` (`:1941`) and call
`invalidateHoverRef.current()` (`:1955-1962`) — **never React state**.

**Coordinates.** `ui/canvas/model/coords.ts` exports exactly one function,
`screenToPixel(clientX, clientY, rect, geom, mode)` (`:88`), with modes `"pixel"`,
`"pixel-unbounded"`, `"origin"`, `"corner"`. ⚠️ It maps through the **rect**, never through
`zoom`, because the canvas carries a CSS `transform: scale()` for pinch and only the rect
includes it. **Pose needs no new mode** — pan deltas are computed from rect-relative pixel
deltas.

**Pixel writes.** `PixelStore.setPixels(pixels, options)` at `:753`;
`PixelWrite {x,y,color}` at `:103`; `PixelWriteOptions {mask, maskSize, behavior,
variantFrameIndex, trackHistory}` at `:89`; mask gate `allows()` at `:457-470`. The private
engine `commitCells(target, layer, label, patches, trackHistory)` at `:483` does
writeGrid → history.record(createPixelCommand) → publishAndBump → publishDirty.
**Lighting writes are the blocker for D9**: `setNormalPixels` `:1323` and `setHeightPixels`
`:1351` both route through `collectLightingPatches`, which **skips any cell whose colour is
`0`**, and each is its own history entry.

**The container's write seam.** `CanvasContainer.tsx:648-661` — `actions.setPixels` is the
single closure all ten production write paths funnel through, and it applies the reflection
mirror. **The pose stamp deliberately does NOT go through it** (D9 uses a different store
action, and a stamp is not a "drawing" in the mirror's sense — the same reasoning that
excludes `moveLayerPixels` and the lighting studio).

**Stores.** Pattern to copy: `stores/ui/ReflectionUIStore.ts` — `observableRef` fields
replaced wholesale, computeds, actions, and a doc header stating what is NOT persisted and
why. Wiring in `ApplicationStore.ts`: import `:66`, field `:412`, construct `:528`,
`reaction` on `loadGeneration` `:533-535`, dispose `:1771`. Persistence is an explicit
field-by-field builder at `stores/ui/UIStore.ts:345-512` — **absence from it means not
persisted**, which is what this plan wants.

## 5. Wave table

| Wave | Tasks | Parallel | Gate that must pass before the next wave |
| --- | --- | --- | --- |
| **W1** | 01 register tool · 02 store · 03 dependency + engine skeleton · 04 CanvasSurface overlay · 05 store action `setPixelCells` | 5 agents | From `client/`: `bunx tsc --noEmit` **0** · `bunx eslint .` **0 errors** · `bunx vitest run` **all pass** · `bun run lint:boundaries` **OK** · `bunx stylelint "src/**/*.css"` shows **exactly 2 errors** · `find . -maxdepth 2 -name 'bun.lock*' \| grep -v node_modules` **empty** |
| **W2** | 06 mesh library + camera/fit math · 07 orb + panel UI | 2 agents | same gate |
| **W3** | 08 CanvasContainer integration (render, pan, stamp, resize) | 1 agent | same gate **+ task 08's manual checks recorded** |
| **W4** | 09 mannequin asset (CC0, owner-confirmed) | 1 agent | same gate; **may end BLOCKED without failing the plan** |
| **W5** | 10 full gate, QA sweep, handoff | 1 agent | `bun run verify` **exit 0** at root; `bun run dev` starts all three processes |

## 6. Dependency graph

```
01 register ─────────┐
02 store ────────────┤
03 dep + engine ─────┼──► 06 meshes/camera ──┐
04 surface overlay ──┤                       ├──► 08 container ──► 10 gate/QA
05 setPixelCells ────┘        07 panel UI ───┘         │
                                                       │
                              09 mannequin asset ──────┘ (W4, after 08)
```

- **01–05 have no dependencies on each other** and no dependency on anything outside the
  repo as it stands. 04 makes its ref prop optional so it compiles alone; 05 is purely
  additive to `PixelStore`.
- **06** ← 03 (needs `three` installed and the engine module's shape).
- **07** ← 01 (`"pose"` in `Tool`), 02 (`app.pose` for the container wiring).
- **08** ← 01, 02, 03, 04, 05, 06, 07 — this is the integration task and is deliberately
  alone in its wave.
- **09** ← 06 (the mesh registry seam it plugs into) and 08 (so the pipeline is provably
  working with primitives before an asset is introduced).
- **10** ← everything.

## 7. Collision matrix

Every multi-task wave, proven disjoint.

**W1 — five tasks**

| Task | Touches |
| --- | --- |
| 01 | `types/domain.ts` · `ui/canvas/tools/toolHandlers.ts` · `ui/hooks/useCanvasKeyboard.ts` · `ui/hooks/__tests__/useCanvasKeyboard.dom.test.ts` · `ui/components/Toolbar/PixelStudioTools.tsx` |
| 02 | `stores/ui/PoseUIStore.ts` (new) · `stores/ui/__tests__/PoseUIStore.test.ts` (new) · `stores/ApplicationStore.ts` |
| 03 | `client/package.json` · `ui/canvas/pose/poseEngine.ts` (new) · `ui/canvas/pose/poseTypes.ts` (new) · `ui/canvas/pose/__tests__/poseTypes.test.ts` (new) |
| 04 | `ui/components/CanvasSurface/CanvasSurface.tsx` · `…/CanvasSurface.css` · `…/CanvasSurface.stories.tsx` · `…/__tests__/CanvasSurface.dom.test.tsx` |
| 05 | `stores/domain/PixelStore.ts` · `stores/domain/__tests__/PixelStore.test.ts` |

No file appears twice. 02 and 05 are both under `stores/` but in different subtrees
(`stores/ui/` + `ApplicationStore.ts` vs `stores/domain/`). 01 and 04 both touch `ui/` but
different directories. 03 owns `client/package.json` **alone** — no other task adds a
dependency.

**W2 — two tasks**

| Task | Touches |
| --- | --- |
| 06 | `ui/canvas/pose/poseMeshes.ts` (new) · `ui/canvas/pose/poseCamera.ts` (new) · `ui/canvas/pose/poseStamp.ts` (new) · `ui/canvas/pose/__tests__/{poseMeshes,poseCamera,poseStamp}.test.ts` (new) |
| 07 | `ui/components/PosePanel/{PoseSection,DirectionOrb}.tsx` (new) · `…/PosePanel.css` (new) · `…/PoseSection.stories.tsx` (new) · `…/__tests__/{PoseSection,DirectionOrb}.dom.test.tsx` (new) · `ui/components/PixelStudioPanel/PixelStudioPanel.tsx` · `containers/PixelStudioPanelContainer.tsx` |

Disjoint. Both create new files under `ui/`, in different directories; only 07 edits
existing shared files, and neither of those is touched by 06.

**W3, W4, W5 are single-task waves** and need no matrix. Task 08 owns
`containers/CanvasContainer.tsx` exclusively — which is why it is alone.

## 8. Alignment guide

**Names to hold** (an executor inventing a synonym here breaks the next task):

- Tool id `"pose"`; hotkey `P`; store `PoseUIStore` / `app.pose`.
- Directory `client/src/ui/canvas/pose/` with modules `poseTypes.ts`, `poseEngine.ts`,
  `poseMeshes.ts`, `poseCamera.ts`, `poseStamp.ts`.
- Types: `PoseMeshId = "cube" | "sphere" | "cylinder" | "mannequin"`,
  `PoseFraming = "full" | "head" | "torso" | "arm" | "leg" | "hand"`,
  `PoseProjection = "perspective" | "orthographic"`,
  `PoseCameraPreset = "2d" | "2.5d" | "iso" | "top-down" | "oblique"`,
  `PoseVector = { x: number; y: number; z: number }`,
  `PoseStampCell = { x: number; y: number; color: Color; normal: Normal; height: number }`.
- Store action `PixelStore.setPixelCells()`.
- Ref `poseCanvasRef`; BEM blocks `pose-panel` and `direction-orb`; CSS modifier
  `canvas__overlay--pose`.
- Panel prop on `PixelStudioPanel`: `pose?: PoseSectionProps` — **one optional grouped
  object**, exactly like `reflection?`.

**Analogues to imitate, file by file:**

| Building | Copy the shape of |
| --- | --- |
| The UI store | `stores/ui/ReflectionUIStore.ts` (observableRef, doc header on what is NOT persisted, `clear()`) |
| Store wiring | `ApplicationStore.ts` reflection hunks: import `:66`, field `:412`, construct `:528`, `loadGeneration` reaction `:533-535`, dispose `:1771` |
| A new overlay canvas | the **hover** overlay — `CanvasSurface.tsx:652`, `renderHover` `CanvasContainer.tsx:2069-2093`, own `useCanvasRender` `:2099`, ref-driven invalidation `:1955-1962` |
| The rail section | `ReflectionLinesSection.tsx` + its mount `PixelStudioPanel.tsx:272-284` + wiring `PixelStudioPanelContainer.tsx:79-98` |
| Tool registration | reflection's task 01 — the same 5 gates |
| Gesture ahead of the table | `origin` and `reflection` in `CanvasContainer` (`isGestureTool` `:285-292`, touch branches placed **before** the bails at `:3724`/`:3870`) |
| A new `PixelStore` action | `setPixels` `:753` for the dedupe/mask shape, `commitCells` `:483` for the commit |
| A pure canvas module + tests | `ui/canvas/model/reflection.ts`, `ui/canvas/render/renderOriginCross.ts` |

**Boundaries that must not be crossed:**

- Nothing under `ui/` imports a store, the API, `services/`, MobX, or calls `useContext` —
  **including type-only imports**. `three` is fine (D15).
- `observer()` only in `containers/`.
- `stores/domain/**` never imports `stores/ui/**` — task 05 must not reach for `app.pose`;
  the stamp cells are computed in the container and passed in.
- Pixel grids are `observable.ref`, never deep-observed, never mutated in place.
- No key added to `toPersistedUIState()`. The wire format does not change.
- No numeric `z-index` in new CSS — use the tokens; DOM order is z-order here.
- No `will-change: transform` anywhere in the canvas stack.

**What "done" looks like, visually:** a chunky, hard-edged 3D solid floating over the
artwork at exactly the artwork's resolution — every facet a visible block of pixels, no
smooth gradients, no anti-aliased silhouette. Dragging the light orb makes the shading
sweep across those blocks in real time with no visible lag and no repaint of the layers
beneath. A double-click drops the shape into the layer, and one `Ctrl+Z` removes all of it.

**The five mistakes an executor is most likely to make:**

1. **Rendering at high resolution and downscaling.** The render target is `cellWidth ×
   cellHeight` — one texel per art pixel. Any `drawImage` that scales, any `antialias:
   true`, any `LinearFilter`, defeats the entire feature.
2. **Driving the overlay from the main `render`.** Pointer-rate repaints of every layer.
   Use a dedicated `useCanvasRender` and refs (D11).
3. **Chaining `setPixels` + `setNormalPixels` + `setHeightPixels` for the stamp.** It
   silently drops every normal (the colour guard) and gives three undo steps. That is
   exactly why D9 exists.
4. **Leaking WebGL.** A `WebGLRenderer`, its render targets, geometries and materials must
   all be `.dispose()`d when the tool is deselected or the component unmounts. Contexts are
   a limited browser resource; churning them crashes the tab.
5. **Committing the unrelated edge/fill-colour work in progress.** Four of this plan's
   files are already dirty. Stage your own hunks only (`git add -p`); never revert someone
   else's.

Also easy to get wrong: forgetting the touch path (place the pose branch **before** the
`isGestureTool` bails); adding a `z-index` to the new overlay CSS; letting `canvas.width =`
silently re-enable `imageSmoothingEnabled`; and creating a `bun.lock` with `bun add`.

## 9. Risk register

| Risk | L | I | Mitigation | Owner |
| --- | --- | --- | --- | --- |
| **Dirty worktree**: the in-flight edge/fill split shares `types/domain.ts`, `PixelStudioTools.tsx`, `UIStore.ts`, `CanvasContainer.tsx` | **High** | **High** | Ideally commit or stash that work **before** `/plan-go`. Otherwise stage own hunks only (`git add -p`), never revert another's, and re-run `tsc` after staging | 01, 08, 10 |
| WebGL context leak / exhaustion on repeated tool switches | Med | High | One renderer for the lifetime of the container, disposed on unmount; explicit `dispose()` of targets/geometries/materials on mesh change; manual check "switch tools 20×, no console warning" | 03, 08 |
| `three` bundle weight (~600 kB) inflates the main bundle | Med | Med | Lazy dynamic `import("three")` behind the engine module; task 10 records the built bundle size before/after | 03, 10 |
| Depth-buffer readback for height (D8) unavailable or wrong on the owner's hardware | Med | Low | Documented fallback: height = 0, colour+normal still stamp; recorded as a deviation, not a block | 06, 08 |
| CC0 mannequin download fails, or license cannot be re-verified at execution time | Med | Low | Task 09 is **last** and isolated; primitives ship without it; task 09 stops and records BLOCKED rather than substituting an unverified asset | 09 |
| Stamping a 300k-cell grid blows the frame budget or the history entry size | Low | Med | Only non-transparent texels are stamped; one coalesced command; task 08 measures a full-canvas stamp and records the timing | 05, 08 |
| Adding a `Tool` member without a `toolHandlers` entry | Low | Med | `TOOLS_ARE_EXHAUSTIVE` makes it a `tsc` failure — caught by the wave gate | 01 |
| New CSS raises the stylelint error count above the 2-error baseline | Med | Low | Every task runs stylelint and compares the count; task 10 asserts exactly 2 | 04, 07, 10 |
| `bun add` writes a lockfile | **High** | High | Task 03 runs the `find` check immediately after installing and deletes any lockfile; every wave gate repeats it | 03, all |
| Touch: the pose gesture is swallowed by the `isGestureTool` bail | Med | Med | Branch placed before the bails at `:3724`/`:3870`, mirroring reflection; manual touch check | 08 |
| Render target not resized when the object is resized | Med | Med | Resize notifies via `domainVersion`, not `pixelVersion` — task 08 keys the target's size off `cellWidth`/`cellHeight` directly and has an explicit manual resize check | 08 |
| jsdom has no WebGL, so engine code cannot be unit-tested in the `dom` lane | **High** | Low | Split pure math (meshes, camera, fit, stamp mapping) into `poseCamera.ts`/`poseStamp.ts` and test **those** in the `unit` lane; the GL calls themselves are covered by the manual checks | 03, 06 |

## 10. Rules for every executor

Restating the `CLAUDE.md` rules that actually bite in this plan, plus this plan's own:

1. **Bun only.** `node` and `npm` are not on PATH. Use `bun` / `bunx`.
2. **Never create a lockfile.** `bun add` **must** use `--exact`. After *any* `bun add` or
   `bunx`, run `find . -maxdepth 2 -name 'bun.lock*' | grep -v node_modules` and delete
   anything it finds. Never remove `save = false` from `bunfig.toml`. `--frozen-lockfile`
   must never appear.
3. **Never `vitest -u`.** The corpus, round-trip and `persistedUIState` snapshots must pass
   **unchanged**. A snapshot diff there is a change to the owner's real data.
4. **The wire format does not change.** No key is added to `toPersistedUIState()` by this
   plan. Task 05 touches `stores/domain/` — it must confirm the corpus snapshots still pass
   unchanged.
5. **Never break `bun run dev`.** If a change stops the app starting, fix or revert before
   finishing.
6. **The `ui/` boundary.** No store, API, `services/`, MobX or `useContext` under
   `client/src/ui/` — type-only imports included. `observer()` only in `containers/`. Run
   `bun run lint:boundaries`.
7. **Never deep-observe a pixel grid**, never mutate one in place.
8. **Stay inside your task's `Touches` list.** The collision matrix is only valid if
   `Touches` is accurate. If you need a file that is not yours, **stop** and record
   `BLOCKED` in `HANDOFF.md` with what you needed and why.
9. **Commit at task granularity**, on a branch (`feat/06-pose-tool`). Never commit directly
   to `main`. Stage only your own hunks — the worktree has unrelated work in it.
10. **Do the manual checks.** Gesture behaviour, touch, visual pixelation, StrictMode
    double-invocation and WebGL disposal are not automatable here. **A task whose manual
    checks were skipped is not done.**
11. **Report honestly.** Six of eight steps with the reasons stated beats a claim of
    success. Run the gate and paste the **real** output — "it passes" is not a report.

## 11. Task index

| NN | Title | Wave | Effort | Summary |
| --- | --- | --- | --- | --- |
| 01 | Register the `pose` tool | W1 | S | The 5 registration gates: union, handler table, hotkey `P`, toolbar button. |
| 02 | `PoseUIStore` + wiring | W1 | M | Session-only MobX store for mesh, rotation, light, colours, camera, pan; cleared on project switch. |
| 03 | Add three.js + engine skeleton | W1 | M | `bun add --exact three`, `poseTypes.ts`, and a lazy-loaded `poseEngine.ts` owning renderer/scene/target lifecycle. |
| 04 | Pose overlay canvas in `CanvasSurface` | W1 | S | An always-mounted `canvas__overlay--pose` above the layers, below the reflection guides. |
| 05 | `PixelStore.setPixelCells()` | W1 | M | One atomic action writing colour+normal+height as a single undo entry — the stamp's only viable commit path. |
| 06 | Mesh library, camera presets, auto-fit, stamp mapping | W2 | L | Pure modules: primitives, framing regions, the 5 camera presets, `fitCameraToMesh`, and the RGBA→cell mapping. |
| 07 | Pose rail section + drag orbs | W2 | L | The pure `PoseSection` and reusable `DirectionOrb`, mounted in `PixelStudioPanel` and wired by its container. |
| 08 | `CanvasContainer` integration | W3 | L | Render loop, pan drag, double-click stamp, resize response, disposal, touch. The task that makes it work. |
| 09 | Vendor the CC0 mannequin | W4 | M | Download, license-verify with the owner, `client/public/models/`, GLTFLoader path. May end BLOCKED. |
| 10 | Full gate, QA sweep, handoff | W5 | M | `bun run verify`, the manual QA script, bundle-size note, ledger close-out. |
