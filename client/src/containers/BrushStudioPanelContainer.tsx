/**
 * BrushStudioPanelContainer (Brush Studio plan, `docs/01-brush-studio`,
 * task 17; MASTER D17 / D19).
 *
 * The brush studio's right-rail panel — what `PixelStudioPanelContainer` is
 * to the pixel studio, minus everything a brush document does not have. Two
 * things live here:
 *
 *  1. **The delta picker** (`BrushDeltaPicker`, task 14) in place of the
 *     colour picker. It edits whichever of the two delta slots
 *     `brushUI.deltaTarget` names — `selectedDelta` (edge) or `fillDelta`
 *     (follow-ups `docs/11-brush-studio-followups` task 07, MASTER D8) —
 *     through the store's `*Active*` setters. UI state, NOT undoable (D17),
 *     so every slider move goes straight to `setActiveDeltaChannel` with no
 *     debounce and no history entry, and the Edge/Fill swap is a plain
 *     exchange with no snapshot. The sliders shown follow the SELECTED
 *     LAYER's channel type (`brushUI.channelTypeIn(brushes.document)`); with
 *     no layer selected the picker renders its own empty state.
 *
 *  2. **The stroke-size controls** for the pencil and the eraser, read from
 *     and written to the SHARED `ToolUIStore` (`app.ui.tool`). The tool set
 *     is the pixel studio's own (D19), so the brush canvas (task 16) reads
 *     `brushSize` / `pencilBrushShape` / `effectiveEraserSize` exactly as
 *     `CanvasContainer` does, and this panel drives the same fields.
 *
 * ── Why the size controls are composed from primitives, not reused ────────
 *
 * `PixelStudioPanel` carries the origin-colour, reflection and pose sections,
 * none of which apply to a brush, and its pencil/eraser markup is private to
 * that component. The task forbids a new `ui/` component, so the two
 * sections are rebuilt here from the `Panel`, `SliderWithNumber`, `Field`
 * and `Button` primitives: the same VALUES and the same store writes as the
 * pixel studio's sections (`PixelStudioPanel.tsx`, the `showPencilControls`
 * and `showEraserControls` blocks), in the primitives' own styling. They are
 * gated on `selectedTool` the same way.
 *
 * ⚠️ The eraser's size and max are the store's RESOLVED getters
 * (`effectiveEraserSize`, `effectiveEraserMax`), never the tri-state fields
 * — that fallback is a wire-format concern the container owns; see
 * `PixelStudioPanelContainer`'s note on the same props.
 *
 * `observer()` lives here and only here (ESLint, task 05).
 */
import type { ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { BrushDeltaPicker } from "../ui/components/BrushDeltaPicker/BrushDeltaPicker";
import { Panel } from "../ui/primitives/Panel/Panel";
import { SliderWithNumber } from "../ui/primitives/SliderWithNumber/SliderWithNumber";
import { Field } from "../ui/primitives/Field/Field";
import { Button } from "../ui/primitives/Button/Button";
import { useStores } from "../stores/context";
import type { BrushDeltaIndex } from "../stores/ui/BrushUIStore";

/** The pencil's / eraser's max-size choices — `PixelStudioPanel`'s `maxOptions`. */
const MAX_OPTIONS = [8, 16, 32, 64, 128] as const;
type MaxOption = (typeof MAX_OPTIONS)[number];

type StrokeShape = "circle" | "square";

/**
 * `BrushDeltaPicker` emits a plain `number` index (it maps over the channel
 * table); `BrushUIStore.setActiveDeltaChannel` takes the `0 | 1 | 2 | 3` union.
 * Narrow at the seam rather than casting — the picker never emits anything
 * else, but a cast would hide it if it ever did.
 */
function isDeltaIndex(index: number): index is BrushDeltaIndex {
  return index === 0 || index === 1 || index === 2 || index === 3;
}

interface StrokeControlsProps {
  title: string;
  size: number;
  max: MaxOption;
  shape: StrokeShape;
  onSizeChange: (size: number) => void;
  onMaxChange: (max: MaxOption) => void;
  onShapeChange: (shape: StrokeShape) => void;
}

/**
 * One Size / Max / Shape section.
 *
 * A RENDER HELPER, deliberately not a component: it takes no hooks and reads
 * no store, and `react-refresh/only-export-components` does not recognise
 * the `observer(...)` export below as a component, so a second, capitalised
 * component in this file trips the rule (measured; there is no precedent for
 * one in `containers/` and no disable comment anywhere in the tier). A plain
 * function called inline renders the same tree.
 *
 * The displayed size is clamped to the max exactly as `PixelStudioPanel`
 * clamps its own (`Math.min(brushSize, max)`): the store re-clamps when the
 * max changes, but a project can be loaded with a size above its max.
 */
function renderStrokeControls({
  title,
  size,
  max,
  shape,
  onSizeChange,
  onMaxChange,
  onShapeChange,
}: StrokeControlsProps): ReactNode {
  return (
    <Panel title={title} headerVariant="compact" bodyVariant="dense">
      <SliderWithNumber
        label="Size"
        value={Math.min(size, max)}
        min={1}
        max={max}
        step={1}
        onChange={onSizeChange}
        name={`${title} size`}
      />
      <Field label="Max" inline>
        <div role="group" aria-label={`${title} max size`}>
          {MAX_OPTIONS.map((option) => (
            <Button
              key={option}
              variant={max === option ? "primary" : "neutral"}
              aria-pressed={max === option}
              onClick={() => onMaxChange(option)}
              title={`Set max size to ${option}`}
            >
              {option}
            </Button>
          ))}
        </div>
      </Field>
      <Field label="Shape" inline>
        <div role="group" aria-label={`${title} shape`}>
          <Button
            variant={shape === "circle" ? "primary" : "neutral"}
            aria-pressed={shape === "circle"}
            onClick={() => onShapeChange("circle")}
            title="Circle"
          >
            ⭕
          </Button>
          <Button
            variant={shape === "square" ? "primary" : "neutral"}
            aria-pressed={shape === "square"}
            onClick={() => onShapeChange("square")}
            title="Square"
          >
            ⬜
          </Button>
        </div>
      </Field>
    </Panel>
  );
}

export const BrushStudioPanelContainer = observer(
  function BrushStudioPanelContainer() {
    const { brushes, brushUI, ui } = useStores();
    const tool = ui.tool;

    // `document` is `observable.ref` (D8): this read tracks its identity, and
    // the lookup inside walks one frame's layer list for a channel type —
    // never a grid.
    const channelType = brushUI.channelTypeIn(brushes.document);

    const showPencilControls = tool.selectedTool === "pixel";
    const showEraserControls = tool.selectedTool === "eraser";

    return (
      <>
        <Panel title="Delta" bodyVariant="dense">
          <BrushDeltaPicker
            channelType={channelType}
            /* Edge / Fill (follow-ups task 07, MASTER D8 / D10): the same
               shape as `ColorPickerContainer`'s wiring of `ColorPicker`. The
               store resolves the active slot (`activeDelta` is a computed
               over `deltaTarget`), so — unlike the colour container — no
               ternary is needed here; the picker never chooses between the
               two itself. */
            target={brushUI.deltaTarget}
            onTargetChange={(target) => brushUI.setDeltaTarget(target)}
            // `selectedDelta` IS the edge slot (the name predates the split).
            // Both are `observable.ref`, replaced wholesale by every setter —
            // passing the tuples through is safe and each identity changes
            // exactly when one of its channels does.
            edgeValue={brushUI.selectedDelta}
            fillValue={brushUI.fillDelta}
            value={brushUI.activeDelta}
            onChange={(index, value) => {
              if (isDeltaIndex(index)) {
                brushUI.setActiveDeltaChannel(index, value);
              }
            }}
            onReset={() => brushUI.resetActiveDelta()}
            /* ⚠️ NOT bracketed with a history save, and must never be: the
               deltas are UI state (D17), `swapDeltas` is a plain exchange,
               and the brush history stack holds document edits only. The
               colour picker's swap snapshots once INSIDE its store action for
               the same reason — never at the call site. */
            onSwap={() => brushUI.swapDeltas()}
            // A lifecycle flow in flight (switch / create / delete) — the
            // document under the picker is about to change.
            disabled={brushes.isLoading}
          />
        </Panel>

        {showPencilControls &&
          renderStrokeControls({
            title: "Pencil",
            size: tool.brushSize,
            max: tool.pencilBrushMax,
            shape: tool.pencilBrushShape,
            onSizeChange: (size) => tool.setBrushSize(size),
            onMaxChange: (max) => tool.setPencilBrushMax(max),
            onShapeChange: (shape) => tool.setPencilBrushShape(shape),
          })}

        {showEraserControls &&
          renderStrokeControls({
            title: "Eraser",
            size: tool.effectiveEraserSize,
            max: tool.effectiveEraserMax,
            shape: tool.eraserShape,
            onSizeChange: (size) => tool.setEraserBrushSize(size),
            onMaxChange: (max) => tool.setEraserBrushMax(max),
            onShapeChange: (shape) => tool.setEraserShape(shape),
          })}
      </>
    );
  },
);
