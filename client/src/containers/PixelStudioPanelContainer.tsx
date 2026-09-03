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
 * clamps FOV and normalises the light direction on write. (Zoom is no longer
 * clamped above — MASTER E11.)
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
 */
import { observer } from "mobx-react-lite";
import { PixelStudioPanel } from "../ui/components/PixelStudioPanel/PixelStudioPanel";
import {
  describeLine,
  presetLines,
} from "../ui/canvas/model/reflection";
import { ColorPickerContainer } from "./ColorPickerContainer";
import { PaletteManagerContainer } from "./PaletteManagerContainer";
import { useStores } from "../stores/context";
import { OTHER_HAND_SECTIONS } from "./otherHand/otherHandSections";

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
function toPoseColor(color: {
  r: number;
  g: number;
  b: number;
  a: number;
}): { r: number; g: number; b: number; a: number } {
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

    return (
      <PixelStudioPanel
        selectedTool={tool.selectedTool}
        brushSize={tool.brushSize}
        eraserShape={tool.eraserShape}
        pencilBrushShape={tool.pencilBrushShape}
        pencilBrushMax={tool.pencilBrushMax}
        originColor={tool.originColor ?? DEFAULT_ORIGIN_COLOR}
        originPos={app.currentObject?.origin ?? null}
        onBrushSizeChange={(size) => tool.setBrushSize(size)}
        onEraserShapeChange={(shape) => tool.setEraserShape(shape)}
        onPencilBrushShapeChange={(shape) => tool.setPencilBrushShape(shape)}
        onPencilBrushMaxChange={(max) => tool.setPencilBrushMax(max)}
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
          zoom: pose.zoom,
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
          // ⚠️ A preset stores only its ID (MASTER D14). Resolving it to angles
          // is `poseCamera.ts`'s job in the render, not the rail's — which is
          // why nothing here reaches for `getCameraPreset()`.
          onSelectCameraPreset: (preset) => pose.setCameraPreset(preset),
          // ⚠️ Zoom is re-sanitised by the store but NO LONGER CAPPED (MASTER
          // E11): task 01 deleted `POSE_ZOOM_MAX` and only a `1e-3` safety
          // floor remains. FOV is still clamped to 10–120.
          onSetZoom: (zoom) => pose.setZoom(zoom),
          onSetFov: (fov) => pose.setFov(fov),
          // ⚠️ A REQUEST, not a fit (MASTER E14). `requestFit()` only bumps the
          // store's `fitGeneration` counter and mutates no camera field; the
          // canvas container reacts to that counter and does the framing. A
          // counter rather than a boolean, so two presses are two events.
          onRequestFit: () => pose.requestFit(),
          onClear: () => pose.clear(),
        }}
      />
    );
  },
);
