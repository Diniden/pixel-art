/**
 * toolWidgets — the `tool` section of Other Hand Mode, as data.
 *
 * Every tool's rail options become a short list of thumb widgets here: the
 * pencil is a size slider, a shape stack and a max stack; the eraser drops
 * the max; the gaussian fill is two fractional sliders; the selection tool is
 * three button stacks; the normal brush leads with its direction sphere. A
 * tool with nothing to offer (line, flood fill, the eyedropper, origin)
 * returns no widgets and the surface says so.
 *
 * The section KEY is per tool (`tool:pixel`, `tool:eraser`, …) so each tool
 * keeps the arrangement its thumb learned; in the lighting studio it is per
 * edit mode instead, because the brush changes shape with the mode.
 */
import type { ThumbWidgetSpec } from "../../ui/components/OtherHand/thumbWidgets";
import type { ApplicationStore } from "../../stores/ApplicationStore";
import type {
  SelectionBehavior,
  SelectionMode,
  ShapeMode,
  Tool,
} from "../../types";

const TOOL_TITLES: Partial<Record<Tool, string>> = {
  pixel: "Pencil",
  eraser: "Eraser",
  "fill-square": "Fill Square",
  "gaussian-fill": "Gaussian Fill",
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  move: "Move",
  selection: "Selection",
  "reference-trace": "Trace",
  line: "Line",
  "flood-fill": "Flood Fill",
  eyedropper: "Eyedropper",
  origin: "Origin",
  "normal-pencil": "Normal Brush",
  "auto-normal": "Auto Normal",
  "height-map": "Height Map",
};

/** Which tool section is showing, what to call it, and what to put on it. */
export interface ToolSectionPlan {
  /** The positions key — per TOOL, so each keeps its own arrangement. */
  sectionKey: string;
  title: string;
  widgets: ThumbWidgetSpec[];
}

/**
 * Build the current tool's thumb widgets from the stores.
 *
 * Reads observables, so it must be called from inside an `observer()` render
 * — it is a projection, not a hook, and holds nothing between calls.
 */
export function planToolSection(app: ApplicationStore): ToolSectionPlan {
  const { ui, lightingUI, referenceUI, selectionUI } = app;
  const tool = ui.tool;
  const isLighting = lightingUI.studioMode === "lighting";
  const editMode = lightingUI.lightingDataLayerEditMode ?? "normals";

  const sectionKey = isLighting
    ? `tool:lighting-${editMode}`
    : `tool:${tool.selectedTool}`;
  const title = isLighting
    ? editMode === "height"
      ? "Height Brush"
      : "Normal Brush"
    : (TOOL_TITLES[tool.selectedTool] ?? "Tool");

  const shapeButtons = (
    id: string,
    value: "circle" | "square",
    onChange: (shape: "circle" | "square") => void,
  ): ThumbWidgetSpec => ({
    kind: "buttons",
    id,
    label: "Shape",
    buttons: [
      {
        id: "circle",
        label: "⭕",
        title: "Circle",
        active: value === "circle",
        onClick: () => onChange("circle"),
      },
      {
        id: "square",
        label: "⬜",
        title: "Square",
        active: value === "square",
        onClick: () => onChange("square"),
      },
    ],
  });

  const widgets: ThumbWidgetSpec[] = [];

  if (isLighting) {
    if (editMode === "height") {
      widgets.push({
        kind: "slider",
        id: "value",
        label: "Value",
        value: lightingUI.heightBrushValue ?? 128,
        min: 0,
        max: 255,
        onChange: (v) => lightingUI.setHeightBrushValue(v),
      });
    }
    if (editMode === "normals") {
      // The brush normal — `selectedNormal`, NOT `lightDirection`. The two
      // are independent settings sharing one picker; see
      // `NormalPickerContainer` for why mixing them up is invisible.
      widgets.push({
        kind: "normal",
        id: "normal",
        label: "Normal",
        normal: lightingUI.selectedNormal,
        onChange: (n) => lightingUI.setSelectedNormal(n),
        isLightDirection: false,
      });
    }
    widgets.push(
      {
        kind: "slider",
        id: "size",
        label: "Size",
        value: tool.brushSize,
        min: 1,
        max: 20,
        onChange: (v) => tool.setBrushSize(v),
      },
      shapeButtons("shape", lightingUI.normalBrushShape, (s) =>
        lightingUI.setNormalBrushShape(s),
      ),
    );
  } else {
    const max = tool.pencilBrushMax ?? 16;
    const sizeSlider = (): ThumbWidgetSpec => ({
      kind: "slider",
      id: "size",
      label: "Size",
      value: Math.min(tool.brushSize, max),
      min: 1,
      max,
      onChange: (v) => tool.setBrushSize(v),
    });
    const maxButtons = (): ThumbWidgetSpec => ({
      kind: "buttons",
      id: "max",
      label: "Max",
      buttons: ([8, 16, 32, 64, 128] as const).map((opt) => ({
        id: String(opt),
        label: String(opt),
        active: max === opt,
        onClick: () => tool.setPencilBrushMax(opt),
      })),
    });

    /* ── the ERASER's own size and max (plan 09, task 09) ────────────────
     *
     * The rail must match the panel: before this, `case "eraser"` pushed the
     * SAME `sizeSlider()` the pencil uses — the pencil's size, bounded by the
     * pencil's max — and got no Max row at all. Both are the interlacing the
     * user reported.
     *
     * `effectiveEraserSize` / `effectiveEraserMax` have already applied the
     * `?? brushSize` / `?? pencilBrushMax ?? 16` fallbacks, so a project that
     * predates this reads exactly the numbers it read before.
     */
    const eraserMax = tool.effectiveEraserMax;
    const eraserSizeSlider = (): ThumbWidgetSpec => ({
      kind: "slider",
      id: "size",
      label: "Size",
      value: Math.min(tool.effectiveEraserSize, eraserMax),
      min: 1,
      max: eraserMax,
      onChange: (v) => tool.setEraserBrushSize(v),
    });
    const eraserMaxButtons = (): ThumbWidgetSpec => ({
      kind: "buttons",
      id: "max",
      label: "Max",
      buttons: ([8, 16, 32, 64, 128] as const).map((opt) => ({
        id: String(opt),
        label: String(opt),
        active: eraserMax === opt,
        onClick: () => tool.setEraserBrushMax(opt),
      })),
    });
    const shapeModeButtons = (): ThumbWidgetSpec => ({
      kind: "buttons",
      id: "mode",
      label: "Mode",
      buttons: (
        [
          ["outline", "Outline"],
          ["fill", "Fill"],
          ["both", "Both"],
        ] as [ShapeMode, string][]
      ).map(([mode, label]) => ({
        id: mode,
        label,
        active: tool.shapeMode === mode,
        onClick: () => tool.setShapeMode(mode),
      })),
    });

    switch (tool.selectedTool) {
      case "pixel":
        widgets.push(
          sizeSlider(),
          shapeButtons("shape", tool.pencilBrushShape ?? "square", (s) =>
            tool.setPencilBrushShape(s),
          ),
          maxButtons(),
        );
        break;
      case "eraser":
        // Same widget set as `"pixel"` above, in the same order — the user
        // asked for "the exact same controls … but distinct values" — bound
        // to the eraser's own size and max.
        widgets.push(
          eraserSizeSlider(),
          shapeButtons("shape", tool.eraserShape, (s) =>
            tool.setEraserShape(s),
          ),
          eraserMaxButtons(),
        );
        break;
      case "fill-square":
        widgets.push({
          kind: "slider",
          id: "size",
          label: "Size",
          value: tool.brushSize,
          min: 1,
          max: 16,
          onChange: (v) => tool.setBrushSize(v),
        });
        break;
      case "gaussian-fill": {
        const gf = tool.gaussianFill ?? {
          smoothing: 1.0,
          radius: 2.0,
          radiusMax: 16,
        };
        const radiusMax = gf.radiusMax ?? 16;
        widgets.push(
          {
            kind: "slider",
            id: "smoothing",
            label: "Smooth",
            value: gf.smoothing,
            min: 0.1,
            max: 5,
            step: 0.1,
            onChange: (smoothing) =>
              tool.setGaussianFillParams({
                smoothing,
                radius: gf.radius,
                radiusMax,
              }),
          },
          {
            kind: "slider",
            id: "radius",
            label: "Radius",
            value: gf.radius,
            min: 0.5,
            max: radiusMax,
            step: 0.5,
            onChange: (radius) =>
              tool.setGaussianFillParams({
                smoothing: gf.smoothing,
                radius,
                radiusMax,
              }),
          },
        );
        break;
      }
      case "rectangle":
        widgets.push(
          {
            kind: "slider",
            id: "radius",
            label: "Radius",
            value: tool.borderRadiusOrZero,
            min: 0,
            max: 16,
            onChange: (v) => tool.setBorderRadius(v),
          },
          shapeModeButtons(),
        );
        break;
      case "ellipse":
        widgets.push(shapeModeButtons());
        break;
      case "move":
        widgets.push({
          kind: "buttons",
          id: "layers",
          label: "Layers",
          buttons: [
            {
              id: "all",
              label: tool.moveAllLayers ? "All" : "Current",
              title: "Move all layers",
              active: tool.moveAllLayers,
              onClick: () => tool.setMoveAllLayers(!tool.moveAllLayers),
            },
          ],
        });
        break;
      case "selection":
        widgets.push(
          {
            kind: "buttons",
            id: "mode",
            label: "Mode",
            buttons: (
              [
                ["rect", "Rect"],
                ["flood", "Flood"],
                ["lasso", "Lasso"],
                ["color", "Color"],
              ] as [SelectionMode, string][]
            ).map(([mode, label]) => ({
              id: mode,
              label,
              active: tool.selectionMode === mode,
              onClick: () => tool.setSelectionMode(mode),
            })),
          },
          {
            kind: "buttons",
            id: "behavior",
            label: "Drag",
            buttons: (
              [
                ["movePixels", "Pixels"],
                ["moveSelection", "Outline"],
                ["editMask", "Mask"],
              ] as [SelectionBehavior, string][]
            ).map(([behavior, label]) => ({
              id: behavior,
              label,
              active: tool.selectionBehavior === behavior,
              onClick: () => tool.setSelectionBehavior(behavior),
            })),
          },
          {
            kind: "buttons",
            id: "actions",
            label: "Edit",
            buttons: [
              {
                id: "expand",
                label: "Grow",
                title: "Expand by 1",
                onClick: () => selectionUI.expandSelection(1),
              },
              {
                id: "shrink",
                label: "Shrink",
                title: "Shrink by 1",
                onClick: () => selectionUI.shrinkSelection(1),
              },
              {
                id: "clear",
                label: "Clear",
                onClick: () => selectionUI.clearSelection(),
              },
            ],
          },
        );
        break;
      case "reference-trace":
        widgets.push(
          { ...maxButtons(), id: "trace-max", label: "Trace Max" },
          {
            kind: "buttons",
            id: "nudge",
            label: "Nudge",
            buttons: ([10, 20, 25, 50, 100] as const).map((n) => ({
              id: String(n),
              label: `${n}%`,
              active: referenceUI.traceNudgeAmount === n,
              onClick: () => referenceUI.setTraceNudgeAmount(n),
            })),
          },
        );
        break;
      default:
        break;
    }
  }

  return { sectionKey, title, widgets };
}
