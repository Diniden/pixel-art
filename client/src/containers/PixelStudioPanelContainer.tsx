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
      />
    );
  },
);
