/**
 * PixelStudioPanelContainer (REFRESH task 24; PURIFIED task 36, W27).
 *
 * `PixelStudioPanel` read 8 store members across **two separate
 * legacy Zustand-hook calls** — 5 in the panel and 3 more in its private
 * `OriginColorPicker`. Task 24 created this container and left the collapse to
 * 35/36; both call sites are now folded into this one `observer()`, exactly as
 * the spec asked.
 *
 * ⚠️ `originColor` defaults to the red cross `{255, 50, 50, 255}` HERE. That
 * literal was inline in `OriginColorPicker`; `ToolUIStore.originColor` is
 * legitimately `undefined` until set, so the fallback has to live somewhere.
 * It lives here so the component's prop is non-optional and there is one
 * source of truth for the default.
 *
 * ⚠️ `colorPicker` and `paletteManager` are passed as ELEMENTS — both are
 * containers, and `ui/` may not import one (MobX would cross the purity
 * boundary transitively).
 *
 * ⚠️ The POSE section (pose-tool task 07) is wired here too, and this is the
 * ONLY place that may touch `app.pose` — `PoseSection` and `DirectionOrb` are
 * pure `ui/` and hold no store. No second `observer()` was created: this one
 * already existed and simply grew a prop, which is what the task asked for.
 * The section's values are read straight off the store and its callbacks call
 * the store's actions; no derivation is needed, because the store already
 * clamps FOV and normalises the light direction on write. (The model's SCALE
 * is floored but never capped — MASTER E11 / plan 08 F6.)
 *
 * ⚠️ **The pose model's colour is the app's own FILL slot, and its outline's
 * colour is the EDGE slot** (pose-refinements MASTER E8/E9/E10). The rail used
 * to render two native `<input type="color">` elements; it now shows swatches
 * and asks THIS container to point the main picker at a slot, which is
 * `ui.tool.setColorTarget(...)` — the same seam `ColorPickerContainer` reads.
 * Two things about that wiring are load-bearing:
 *
 * - **`fillColor` is TRI-STATE.** `undefined` means "absent from the project
 *   file", which is every project saved before the field existed. The read
 *   goes through `ui.tool.fillColorOrSelected`, which falls back to
 *   `selectedColor`. **Never seed a default** — a default would add a key to
 *   all 151 corpus snapshots and change their digests (E8).
 * - **The domain `Color` is converted to `PoseColor` HERE, explicitly.** `ui/`
 *   may not import `types/domain.ts`, which is why `PoseColor` exists as a
 *   structural twin; `toPoseColor` is that conversion, kept at the boundary
 *   rather than "simplified" into a cross-boundary import.
 *
 * ⚠️ The REFLECTION section's preset geometry is computed HERE, not in the
 * component (MASTER D10). `presetLines()` needs the editable grid's
 * dimensions, and `app.editableGrid` is a store read that `ui/` may not make.
 * The component therefore emits only the preset NAME and this container turns
 * it into lines.
 *
 * ⚠️ The BRUSH section (pixel-brush task 06) is fed from `app.brushes` /
 * `app.brushUI` HERE, and only while the brush tool is selected — so no
 * brush observable is read (or subscribed to) for any other tool. The brush
 * document is `observable.ref`: this container reads `width`, `height`,
 * `frames.length`, the selected frame's `name` and `layers.length` and never
 * a pixel grid. **It does NOT call `brushes.init()`** — `usePixelBrush` in
 * `CanvasContainer` (task 05) does that whenever the tool is the brush, and a
 * second caller would only race it. "Open Brush Studio" goes through the same
 * `lightingUI.setStudioMode` the toolbar's mode buttons use.
 */
import { observer } from "mobx-react-lite";
import {
  PixelStudioPanel,
  type PixelStudioBrushInfo,
  type PixelStudioBrushSizeControls,
} from "../ui/components/PixelStudioPanel/PixelStudioPanel";
import { describeLine, presetLines } from "../ui/canvas/model/reflection";
import { pixelBrushSliderMax } from "../stores/ui/PixelBrushUIStore";
import { ColorPickerContainer } from "./ColorPickerContainer";
import { PaletteManagerContainer } from "./PaletteManagerContainer";
import { useStores } from "../stores/context";
import { OTHER_HAND_SECTIONS } from "./otherHand/otherHandSections";
import {
  applyCameraOverrides,
  fitCameraToMesh,
  getCameraPreset,
  hasCameraOverrides,
} from "../ui/canvas/pose/poseCamera";
import { UNIT_BOUNDS } from "../ui/canvas/pose/poseMeshes";

/** Transcribed from `OriginColorPicker`'s inline fallback. */
const DEFAULT_ORIGIN_COLOR = { r: 255, g: 50, b: 50, a: 255 };

/**
 * The domain `Color` → the pose module's `PoseColor`, at the boundary.
 *
 * The two are structurally identical on purpose: `ui/canvas/pose/poseTypes.ts`
 * declares `PoseColor` rather than importing `types/domain.ts` because nothing
 * under `ui/` may take that dependency. This copy is therefore not a *cast* —
 * it is the explicit conversion the plan asks for at the seam, and it also
 * makes the store's own object unreachable from the pure component, so no
 * downstream render can mutate observable state by accident.
 *
 * ⚠️ Do not "simplify" this away by importing `Color` into `ui/`, or by
 * passing the store's object through: the first breaks the boundary lint, the
 * second hands `ui/` a live reference to an `observableRef` value.
 */
function toPoseColor(color: { r: number; g: number; b: number; a: number }): {
  r: number;
  g: number;
  b: number;
  a: number;
} {
  return { r: color.r, g: color.g, b: color.b, a: color.a };
}

export const PixelStudioPanelContainer = observer(
  function PixelStudioPanelContainer() {
    const app = useStores();
    const { domain, ui } = app;

    // Transcribed from the component's pre-purification `if (!project) return null`.
    if (!domain.hasProject) return null;

    const tool = ui.tool;
    const reflection = app.reflection;
    const pose = app.pose;

    // `selectionDims` is `editableGrid?.dims` with the transcribed 32×32
    // floor, which is exactly the fallback presets want: with no resolvable
    // layer a preset still produces a definite line rather than one at NaN.
    const gridDims = app.selectionDims;

    // ⚠️ The pose camera's FRUSTUM, derived rather than stored — see the
    // `pose` block below for why, and for how far the advanced panel's edits
    // currently reach. Transcribed from `CanvasContainer`'s fit effect so the
    // two cannot disagree: a preset OVERRIDES the projection and supplies the
    // orbit, and the store's own `projection` is the fallback for a preset id
    // that no longer exists.
    const poseFrustumPreset = getCameraPreset(pose.cameraPreset);
    const poseFittedFrustum = fitCameraToMesh({
      bounds: UNIT_BOUNDS,
      canvasWidth: gridDims.width,
      canvasHeight: gridDims.height,
      projection: poseFrustumPreset?.projection ?? pose.projection,
      fov: pose.fov,
      pitch: poseFrustumPreset?.pitch ?? 0,
      yaw: poseFrustumPreset?.yaw ?? 0,
    });
    // ⚠️ The owner's typed values are re-applied HERE TOO, in the same order
    // `CanvasContainer`'s fit effect applies them (fit first, overrides on
    // top). Both call sites must stay identical: the boxes are meant to read
    // back the numbers the camera is ACTUALLY using, and a mirror that showed
    // only the derived value would make a typed `near` look like it had been
    // ignored the moment the box lost focus — which is the exact D08-16
    // symptom this closes.
    const poseFrustum = hasCameraOverrides(pose.cameraOverrides)
      ? applyCameraOverrides(poseFittedFrustum, pose.cameraOverrides)
      : poseFittedFrustum;

    // ── the Brush section (pixel-brush task 06) ─────────────────────────────
    //
    // Built ONLY for the brush tool, so this observer subscribes to no brush
    // store field while the pencil (or anything else) is selected. The
    // document is `observable.ref` — only its identity is tracked — and the
    // reads below stay at the frame/layer-count level: no grid is touched.
    // `brushes.init()` is deliberately NOT called here (see the header).
    let pixelBrush: PixelStudioBrushInfo | undefined;
    if (tool.selectedTool === "brush") {
      const brushes = app.brushes;
      const doc = brushes.document;
      // The same frame rule the brush studio and the stamp use (MASTER D4):
      // `selectedFrameId`, falling back to `frames[0]`.
      const frame = app.brushUI.selectedFrameIn(doc);
      // ── the stamp-size controls (brush-scale task 13, MASTER D13) ─────────
      //
      // Every value the section shows is RESOLVED HERE: the store's `null`
      // (= native) collapses through `effectiveSize(native)`, and the native
      // size is the document's own `width` / `height` — read off the
      // `observable.ref` document, never a grid. The setters take `native`
      // as an argument by design (the store holds no `BrushStore`), so the
      // same object is threaded through each callback. Absent without a
      // document: there is no native size to resolve against.
      let size: PixelStudioBrushSizeControls | undefined;
      if (doc) {
        const pixelBrushUI = ui.pixelBrush;
        const native = { width: doc.width, height: doc.height };
        const effective = pixelBrushUI.effectiveSize(native);
        size = {
          width: effective.width,
          height: effective.height,
          nativeWidth: native.width,
          nativeHeight: native.height,
          max: pixelBrushSliderMax(native),
          lockRatio: pixelBrushUI.lockRatio,
          scaleX: pixelBrushUI.scaleX,
          scaleY: pixelBrushUI.scaleY,
          onWidthChange: (w) => pixelBrushUI.setWidth(w, native),
          onHeightChange: (h) => pixelBrushUI.setHeight(h, native),
          onLockRatioChange: (locked) =>
            pixelBrushUI.setLockRatio(locked, native),
          // The lock / 2-D rules (D11) are the store's; the section only
          // names the axis it was asked on.
          onScaleChange: (axis, id) => pixelBrushUI.setScale(axis, id),
          onResetSize: () => pixelBrushUI.resetSize(),
        };
      }
      pixelBrush = {
        loadState: brushes.loadState,
        brushName: brushes.hasBrush ? brushes.brushName : null,
        width: doc?.width ?? null,
        height: doc?.height ?? null,
        frameName: frame?.name ?? null,
        frameIndex: frame && doc ? doc.frames.indexOf(frame) : null,
        frameCount: doc?.frames.length ?? 0,
        layerCount: frame?.layers.length ?? 0,
        // The toolbar's own studio-mode switch (`ToolbarContainer`'s
        // `onSetStudioMode`). It also resets the tool to `"pixel"` — unchanged
        // behaviour, MASTER D11.
        onOpenBrushStudio: () => app.lightingUI.setStudioMode("brush"),
        // `undefined` with no document; the section then draws no size block.
        // Spread-as-optional rather than `size: undefined` so the info object
        // carries the key only when there is something to show.
        ...(size ? { size } : {}),
      };
    }

    return (
      <PixelStudioPanel
        selectedTool={tool.selectedTool}
        brushSize={tool.brushSize}
        eraserShape={tool.eraserShape}
        pencilBrushShape={tool.pencilBrushShape}
        pencilBrushMax={tool.pencilBrushMax}
        // The tri-state fields are collapsed HERE, not in the component:
        // `ui/` may not import a store and must not carry wire-format
        // knowledge. `effectiveEraserSize` is `?? brushSize` — the migration
        // that lets an existing project's single saved size serve as the
        // eraser's until the user moves its slider.
        eraserBrushSize={tool.effectiveEraserSize}
        eraserBrushMax={tool.effectiveEraserMax}
        originColor={tool.originColor ?? DEFAULT_ORIGIN_COLOR}
        originPos={app.currentObject?.origin ?? null}
        onBrushSizeChange={(size) => tool.setBrushSize(size)}
        onEraserShapeChange={(shape) => tool.setEraserShape(shape)}
        onPencilBrushShapeChange={(shape) => tool.setPencilBrushShape(shape)}
        onPencilBrushMaxChange={(max) => tool.setPencilBrushMax(max)}
        onEraserBrushSizeChange={(size) => tool.setEraserBrushSize(size)}
        onEraserBrushMaxChange={(max) => tool.setEraserBrushMax(max)}
        onOriginColorChange={(color) => tool.setOriginColor(color)}
        colorPicker={<ColorPickerContainer />}
        paletteManager={<PaletteManagerContainer />}
        // Tablets only — see `LayoutUIStore.otherHandAvailable`. Left
        // `undefined` elsewhere so the component draws no button.
        onOtherHand={
          ui.layout.otherHandAvailable
            ? () => ui.layout.enterOtherHand(OTHER_HAND_SECTIONS.tool)
            : undefined
        }
        reflection={{
          // `lines` is `observableRef` and replaced wholesale, so this map
          // re-runs only when the array identity changes — never per line.
          lines: reflection.lines.map((line) => ({
            id: line.id,
            label: describeLine(line),
          })),
          atCapacity: reflection.atCapacity,
          onRemoveLine: (id) => reflection.removeLine(id),
          onClearAll: () => reflection.clear(),
          // ⚠️ IDS ARE ASSIGNED BY THE STORE. `presetLines` takes a `makeId`
          // so the geometry module needs no id source of its own; here it
          // returns `""` because `addLines` takes `Omit<ReflectionLine,"id">`
          // and stamps its own session-unique `refl-N`. Generating a real id
          // here would produce one that is thrown away.
          onApplyPreset: (preset) =>
            reflection.addLines(
              presetLines(preset, gridDims.width, gridDims.height, () => ""),
            ),
        }}
        pose={{
          // Every field is read straight through. `rotation`, `lightDirection`,
          // `lightColor` are `observableRef` and replaced wholesale by their
          // actions, so passing them by reference is safe: nothing downstream
          // can mutate the store's held object, and identity changes exactly
          // when the value does.
          meshId: pose.meshId,
          rotation: pose.rotation,
          lightDirection: pose.lightDirection,
          lightColor: pose.lightColor,
          // ⚠️ NOT `pose.modelColor` any more (MASTER E8). The model wears the
          // app's FILL colour, read through `fillColorOrSelected` so a project
          // saved before the fill/edge split falls back to `selectedColor`
          // instead of showing an undefined slot. Never seed a default.
          modelColor: toPoseColor(tool.fillColorOrSelected),
          // The outline wears the EDGE colour (E9) — `selectedColor`, which is
          // what the pencil, the line and a shape's outline already use.
          edgeColor: toPoseColor(tool.selectedColor),
          // So the rail can mark whichever swatch the picker is pointed at.
          colorTarget: tool.colorTarget,
          // Whole pixels, 0–4, 0 = off (MASTER E4). Session state on the pose
          // store like everything else here — never persisted (D6).
          edgeWidth: pose.edgeWidth,
          projection: pose.projection,
          cameraPreset: pose.cameraPreset,
          scale: pose.scale,
          axisScale: pose.axisScale,
          fov: pose.fov,
          // ⚠️ The mannequin PART buttons come through here too (MASTER
          // E1/E2). A part is real sub-geometry now, so "load the head" is a
          // mesh selection; there is no `onSelectFraming` any more.
          onSelectMesh: (meshId) => pose.setMesh(meshId),
          onSetRotation: (rotation) => pose.setRotation(rotation),
          // The store NORMALISES on write, so the orb may emit whatever the
          // drag produced and readers never have to renormalise.
          onSetLightDirection: (direction) => pose.setLightDirection(direction),
          // The key light's TINT stays pose state: it describes the studio, not
          // the artwork, so it is neither the Fill nor the Edge slot. See
          // `PoseSection`'s header for the full reasoning behind keeping it.
          onSetLightColor: (color) => pose.setLightColor(color),
          // ⚠️ Not "set the colour" — "point the PICKER at this slot" (E10).
          // The rail embeds no picker; `ColorPickerContainer` is already
          // rendered below it and reads the same `colorTarget`, so switching
          // the target here is what makes the existing picker edit the pose's
          // model or outline colour.
          onEditModelColor: () => tool.setColorTarget("fill"),
          onEditEdgeColor: () => tool.setColorTarget("edge"),
          // The store rounds and clamps to 0–4 itself, so the rail may emit
          // whatever its slider produced.
          onSetEdgeWidth: (width) => pose.setEdgeWidth(width),
          onSetProjection: (projection) => pose.setProjection(projection),
          // ⚠️ **A preset now applies a WHOLE SCENE STATE** (plan 08, F7),
          // which supersedes MASTER D14's narrower "a preset overrides the
          // projection". `applyCameraPreset` writes the id, the projection,
          // the FOV and the MODEL'S ROTATION in ONE MobX action, so no
          // reaction can observe a torn half-applied camera. The rail hands
          // over the resolved spec it already rendered, so there is still no
          // second lookup and no second angle table here. `pitch`, `yaw` and
          // the clip policy stay properties of the preset — `CanvasContainer`
          // re-resolves them from the id it just stored.
          //
          // ⚠️ `scale` and `pan` are deliberately NOT reset; see
          // `PoseCameraPresetSpec`'s header for that decision.
          onApplyCameraPreset: (preset) => pose.applyCameraPreset(preset),
          // ⚠️ `scale` is the MODEL's own multiplier about its own origin
          // (plan 08, F6) — renamed from `zoom` AND re-meant: the camera no
          // longer moves for it. Re-sanitised by the store but NEVER CAPPED
          // (MASTER E11): only a `1e-3` safety floor. FOV is still 10–120.
          onSetScale: (scale) => pose.setScale(scale),
          // Per-axis PROPORTIONS, composed on top of `scale` by the container's
          // scale effect (owner-requested 2026-09-04). The store clamps each
          // component to 0.001..1 — a real range here, unlike `scale`'s floor.
          onSetAxisScale: (axisScale) => pose.setAxisScale(axisScale),
          onSetFov: (fov) => pose.setFov(fov),
          // ⚠️ A REQUEST, not a fit (MASTER E14). `requestFit()` only bumps the
          // store's `fitGeneration` counter and mutates no camera field; the
          // canvas container reacts to that counter and does the framing. A
          // counter rather than a boolean, so two presses are two events.
          onRequestFit: () => pose.requestFit(),
          // ── the advanced camera panel (task 06, mounted by task 08) ───────
          //
          // ⚠️ `near`, `far`, the ortho box and the aspect ratio are NOT
          // store fields. They are DERIVED, and they are derived HERE by the
          // same call `CanvasContainer`'s fit effect makes — same
          // `UNIT_BOUNDS` (every mesh is normalised into it before it reaches
          // the engine), same preset-overrides-projection rule, same fov — so
          // the numbers on screen are the numbers the camera is actually
          // using rather than a second, drifting estimate.
          //
          // ⚠️ **ALL SIX KEYS NOW REACH THE CAMERA** (plan 08 task 09, closes
          // D08-16). Task 08 shipped this callback honouring only `fov`,
          // because the other five are DERIVED by the fit rather than stored
          // and there was no seam to write them through. There is one now:
          // `pose.cameraOverrides` holds what was typed, and both this mirror
          // and `CanvasContainer`'s fit effect apply it ON TOP of the fit's
          // output — so a typed value survives Fit to canvas, a resize, a
          // preset press and a projection change instead of silently reverting.
          near: poseFrustum.near,
          far: poseFrustum.far,
          orthographic: poseFrustum.orthographic,
          perspective: poseFrustum.perspective,
          // ⚠️ TWO DESTINATIONS, and the split is not arbitrary. `fov` is a
          // real store field with its own clamp and its own slider, so it goes
          // to `setFov` and reaches the fit as an INPUT; the other five have no
          // stored form, so they go to `setCameraOverrides` and are applied to
          // the fit's OUTPUT. Routing `fov` through the override layer as well
          // would give one number two writers, which is how they drift.
          //
          // The patch is sparse and `setCameraOverrides` MERGES, so committing
          // one box never disturbs the other five. A key explicitly set to
          // `undefined` clears just that field back to the fitted value.
          onAdvancedChange: (patch) => {
            const { fov, ...frustum } = patch;
            if (fov !== undefined) pose.setFov(fov);
            if (Object.keys(frustum).length > 0) {
              pose.setCameraOverrides(frustum);
            }
          },
          // "Reset to fitted" — task 06 shipped the button, task 08 left it
          // unwired because there was nothing to reset. It drops every typed
          // value and hands the frustum back to the fit.
          onAdvancedReset: () => pose.clearCameraOverrides(),
          // ── saved scene presets (plan 08 task 08, F12) ────────────────────
          //
          // ⚠️ THE ONE PERSISTED FIELD ON THIS STORE. `posePresets` reaches
          // the project file through `UIStore.toPersistedUIState()`, and only
          // when at least one exists (F13) — every other pose field here is
          // session-only (MASTER D6).
          //
          // `posePresets` is `observableRef` and replaced wholesale, so this
          // map re-runs only when the array identity changes, never per
          // preset. It projects to `{id, name}` deliberately: `PosePresetList`
          // is a `ui/` module and may not see `types/domain.ts`'s
          // `PersistedPosePreset`, and it has no use for the contents.
          presets: pose.posePresets.map((preset) => ({
            id: preset.id,
            name: preset.name,
          })),
          // The store trims and no-ops on an empty name; the rail disables
          // the button as well. Store = the guarantee, rail = the affordance.
          onSavePreset: (name) => pose.saveCurrentAsPosePreset(name),
          // ⚠️ ONE action (see `applyPosePreset`): nine fields land in a
          // single MobX transaction, so `CanvasContainer`'s fit effect cannot
          // observe a torn half-restored scene.
          onApplyPreset: (id) => pose.applyPosePreset(id),
          onDeletePreset: (id) => pose.deletePosePreset(id),
          onClear: () => pose.clear(),
        }}
        // `undefined` for every tool but the brush; the component gates the
        // section on both the tool AND the prop, so nothing is drawn.
        pixelBrush={pixelBrush}
      />
    );
  },
);
