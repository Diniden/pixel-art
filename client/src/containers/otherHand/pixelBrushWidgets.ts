/**
 * pixelBrushWidgets — the Brush tool's thumb widgets for Other Hand Mode
 * (plan 13, task 14; MASTER D14).
 *
 * The rail's Brush section (task 13) has W/H sliders, a ratio lock, a scaling
 * strategy per axis and a "Native size" button; this is the same set as thumb
 * widgets, bound to the same store (`app.ui.pixelBrush`, task 11) with the
 * same rules: while the ratio is locked, moving one slider moves the other and
 * one strategy pick sets both axes; unlocked, each axis has its own stack.
 *
 * Lives in its OWN file rather than in `toolWidgets.ts` because that file is
 * already at the containers `max-lines` warning (D14) — the count must not
 * rise. `planToolSection` spreads the result into its `case "brush"`.
 *
 * ⚠️ Called from inside an `observer()` render. It reads the brush document
 * at the SCALAR level only (`width` / `height`) — never a frame, layer or
 * grid, which are behind `observable.ref` and must not be observed here.
 */
import type {
  ThumbButtonsSpec,
  ThumbWidgetSpec,
} from "../../ui/components/OtherHand/thumbWidgets";
import type { ApplicationStore } from "../../stores/ApplicationStore";
import { PIXEL_BRUSH_SCALE_OPTIONS } from "../../ui/canvas/tools/pixelBrushScale";
import type { PixelBrushScaleStrategy } from "../../ui/canvas/tools/pixelBrushScale";
import { pixelBrushSliderMax } from "../../stores/ui/PixelBrushUIStore";
import type { PixelBrushAxis } from "../../stores/ui/PixelBrushUIStore";

const formatCells = (v: number): string => `${v} px`;

/**
 * Build the Brush tool's widgets, in order: Width, Ratio (lock toggle), Height,
 * Scale (one stack while locked; "Scale X" + "Scale Y" unlocked), Size (the
 * `Native` action). With no brush document loaded there is nothing to size,
 * so the list is empty and the surface shows its empty message.
 */
export function pixelBrushWidgets(app: ApplicationStore): ThumbWidgetSpec[] {
  const doc = app.brushes.document;
  if (!doc) return [];

  const store = app.ui.pixelBrush;
  // Scalars only — see the header.
  const native = { width: doc.width, height: doc.height };
  const max = pixelBrushSliderMax(native);
  const size = store.effectiveSize(native);
  const locked = store.lockRatio;

  const scaleStack = (
    id: string,
    label: string,
    axis: PixelBrushAxis,
    current: PixelBrushScaleStrategy,
  ): ThumbButtonsSpec => ({
    kind: "buttons",
    id,
    label,
    buttons: PIXEL_BRUSH_SCALE_OPTIONS.map((opt) => ({
      id: opt.id,
      label: opt.short,
      title: opt.label,
      active: current === opt.id,
      onClick: () => store.setScale(axis, opt.id),
    })),
  });

  const scaleStacks: ThumbWidgetSpec[] = locked
    ? [scaleStack("scale", "Scale", "x", store.scaleX)]
    : [
        scaleStack("scale-x", "Scale X", "x", store.scaleX),
        scaleStack("scale-y", "Scale Y", "y", store.scaleY),
      ];

  return [
    {
      kind: "slider",
      id: "width",
      label: "Width",
      value: Math.min(size.width, max),
      min: 1,
      max,
      onChange: (v) => store.setWidth(v, native),
      format: formatCells,
    },
    {
      kind: "buttons",
      id: "lock",
      label: "Ratio",
      buttons: [
        {
          id: "lock",
          label: locked ? "Locked" : "Free",
          title: "Lock the width-to-height ratio",
          active: locked,
          onClick: () => store.setLockRatio(!locked, native),
        },
      ],
    },
    {
      kind: "slider",
      id: "height",
      label: "Height",
      value: Math.min(size.height, max),
      min: 1,
      max,
      onChange: (v) => store.setHeight(v, native),
      format: formatCells,
    },
    ...scaleStacks,
    {
      kind: "buttons",
      id: "reset",
      label: "Size",
      buttons: [
        {
          id: "native",
          label: "Native",
          title: "Back to the brush's native size",
          onClick: () => store.resetSize(),
        },
      ],
    },
  ];
}
