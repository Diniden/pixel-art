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
 * clamps zoom and FOV and normalises the light direction on write.
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
          // `lightColor`, `modelColor` are `observableRef` and replaced
          // wholesale by their actions, so passing them by reference is safe:
          // nothing downstream can mutate the store's held object, and identity
          // changes exactly when the value does.
          meshId: pose.meshId,
          framing: pose.framing,
          rotation: pose.rotation,
          lightDirection: pose.lightDirection,
          lightColor: pose.lightColor,
          modelColor: pose.modelColor,
          projection: pose.projection,
          cameraPreset: pose.cameraPreset,
          zoom: pose.zoom,
          fov: pose.fov,
          onSelectMesh: (meshId) => pose.setMesh(meshId),
          onSelectFraming: (framing) => pose.setFraming(framing),
          onSetRotation: (rotation) => pose.setRotation(rotation),
          // The store NORMALISES on write, so the orb may emit whatever the
          // drag produced and readers never have to renormalise.
          onSetLightDirection: (direction) => pose.setLightDirection(direction),
          onSetLightColor: (color) => pose.setLightColor(color),
          onSetModelColor: (color) => pose.setModelColor(color),
          onSetProjection: (projection) => pose.setProjection(projection),
          // ⚠️ A preset stores only its ID (MASTER D14). Resolving it to angles
          // is `poseCamera.ts`'s job in task 08's render, not the rail's —
          // which is why nothing here reaches for `getCameraPreset()`.
          onSelectCameraPreset: (preset) => pose.setCameraPreset(preset),
          // Both are re-clamped by the store (0.1–10 and 10–120), so the
          // slider's own bounds are a convenience, not the guarantee.
          onSetZoom: (zoom) => pose.setZoom(zoom),
          onSetFov: (fov) => pose.setFov(fov),
          onClear: () => pose.clear(),
        }}
      />
    );
  },
);
