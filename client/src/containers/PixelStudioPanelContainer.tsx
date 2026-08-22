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
 */
import { observer } from "mobx-react-lite";
import { PixelStudioPanel } from "../ui/components/PixelStudioPanel/PixelStudioPanel";
import { ColorPickerContainer } from "./ColorPickerContainer";
import { PaletteManagerContainer } from "./PaletteManagerContainer";
import { useStores } from "../stores/context";

/** Transcribed from `OriginColorPicker`'s inline fallback. */
const DEFAULT_ORIGIN_COLOR = { r: 255, g: 50, b: 50, a: 255 };

export const PixelStudioPanelContainer = observer(
  function PixelStudioPanelContainer() {
    const app = useStores();
    const { domain, ui } = app;

    // Transcribed from the component's pre-purification `if (!project) return null`.
    if (!domain.hasProject) return null;

    const tool = ui.tool;

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
      />
    );
  },
);
