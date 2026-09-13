/**
 * PixelStudioBrushSection — the Brush tool's right-rail section
 * (pixel-brush task 04, extracted in brush-scale task 13; MASTER D13).
 *
 * PURE, like everything under `ui/`: no store, no MobX, no API. The brush
 * document's facts arrive as `PixelStudioBrushInfo` and every interaction
 * leaves as a callback. `PixelStudioPanelContainer` is the `observer()` seam.
 *
 * It was extracted from `PixelStudioPanel.tsx` verbatim (same classes) so the
 * panel stays under `src/ui/**`'s 400-code-line `max-lines` ERROR once the
 * size controls landed, and the panel re-exports the prop types so existing
 * imports keep resolving.
 *
 * ## The size block (`size?: PixelStudioBrushSizeControls`)
 *
 * Present only while a brush document is loaded. Every value is ALREADY
 * RESOLVED by the container: `width` / `height` are the effective stamp size
 * (the store's `null` = native has been collapsed), `max` is
 * `pixelBrushSliderMax(native)`, and the lock / strategy rules (D11) live in
 * `PixelBrushUIStore` — this component only reports intents:
 *
 *  - W / H are `SliderWithNumber`s (1..`max`), with the ratio-lock
 *    `IconButton` BETWEEN them in DOM order (Tab: W → lock → H) and laid out
 *    to span both rows by the stylesheet.
 *  - The strategy picker is ONE `Dropdown` ("Scaling") while locked and TWO
 *    ("Scale X" / "Scale Y") when unlocked. The locked pick reports axis
 *    `"x"`; the store applies it to both. A disabled separator item precedes
 *    the first 2-D option so the two families read as groups.
 *  - "Native size" is disabled when the stamp already IS native.
 */
import { Link, Unlink } from "lucide-react";
import { OtherHandButton } from "../OtherHand/OtherHandButton";
import { Button } from "../../primitives/Button/Button";
import { Dropdown } from "../../primitives/Dropdown/Dropdown";
import type { DropdownOption } from "../../primitives/Dropdown/Dropdown";
import { IconButton } from "../../primitives/IconButton/IconButton";
import { SliderWithNumber } from "../../primitives/SliderWithNumber/SliderWithNumber";
import { classNames } from "../../classNames";
import { PIXEL_BRUSH_SCALE_OPTIONS } from "../../canvas/tools/pixelBrushScale";
import type { PixelBrushScaleStrategy } from "../../canvas/tools/pixelBrushScale";

/** `BrushStore.loadState`, mirrored as a plain union so `ui/` never imports the store. */
export type PixelStudioBrushLoadState =
  "idle" | "loading" | "loaded" | "failed";

export type PixelStudioBrushAxis = "x" | "y";

/**
 * The stamp-size controls, all values resolved by the container
 * (`app.ui.pixelBrush` + the document's native size).
 */
export interface PixelStudioBrushSizeControls {
  /** Effective stamp size, already resolved by the container. */
  width: number;
  height: number;
  nativeWidth: number;
  nativeHeight: number;
  /** `pixelBrushSliderMax(native)`. */
  max: number;
  lockRatio: boolean;
  scaleX: PixelBrushScaleStrategy;
  scaleY: PixelBrushScaleStrategy;
  onWidthChange: (w: number) => void;
  onHeightChange: (h: number) => void;
  onLockRatioChange: (locked: boolean) => void;
  onScaleChange: (
    axis: PixelStudioBrushAxis,
    id: PixelBrushScaleStrategy,
  ) => void;
  onResetSize: () => void;
}

/**
 * What the Brush section names: the brush project the pixel-studio brush tool
 * will stamp, and the frame/layers it stamps (pixel-brush task 04). Supplied
 * by `PixelStudioPanelContainer` (task 06) from `BrushStore` / `BrushUIStore`.
 */
export interface PixelStudioBrushInfo {
  loadState: PixelStudioBrushLoadState;
  /** Filename stem of the loaded brush project, or null when none is loaded. */
  brushName: string | null;
  width: number | null;
  height: number | null;
  frameName: string | null;
  /** 0-based; null when no frame. */
  frameIndex: number | null;
  frameCount: number;
  layerCount: number;
  onOpenBrushStudio: () => void;
  /** The stamp-size controls (task 13); absent until a document is loaded. */
  size?: PixelStudioBrushSizeControls;
}

export interface PixelStudioBrushSectionProps {
  pixelBrush: PixelStudioBrushInfo;
  /** Other Hand Mode hand-off; absent off tablets (see `OtherHandButton`). */
  onOtherHand?: () => void;
}

/**
 * The separator's `value`. It is never a strategy id, so a `Dropdown` typed
 * over `ScaleMenuValue` can hold it as a disabled item; `onChange` narrows it
 * away before reporting.
 */
const SCALE_SEPARATOR = "__separator__" as const;
type ScaleMenuValue = PixelBrushScaleStrategy | typeof SCALE_SEPARATOR;

/**
 * Registry order (kernels first, then the 2-D scalers — D7), with one
 * disabled separator before the first `pixel-art` option. Built once: the
 * registry is a module constant.
 */
const SCALE_MENU: ReadonlyArray<DropdownOption<ScaleMenuValue>> = (() => {
  const items: DropdownOption<ScaleMenuValue>[] = [];
  let separated = false;
  for (const option of PIXEL_BRUSH_SCALE_OPTIONS) {
    if (option.group === "pixel-art" && !separated) {
      items.push({
        value: SCALE_SEPARATOR,
        label: "— pixel-art (both axes) —",
        disabled: true,
      });
      separated = true;
    }
    items.push({ value: option.id, label: option.label });
  }
  return items;
})();

interface ScalePickerProps {
  label: string;
  axis: PixelStudioBrushAxis;
  value: PixelBrushScaleStrategy;
  onScaleChange: PixelStudioBrushSizeControls["onScaleChange"];
}

function ScalePicker({ label, axis, value, onScaleChange }: ScalePickerProps) {
  return (
    <div className="pixel-studio-panel__brush-scale-row">
      {/* Its own class, not `__brush-label`: the `<dl>` rows' label
          collector (panel + container tests) must keep seeing four. */}
      <span className="pixel-studio-panel__brush-scale-label">{label}</span>
      <Dropdown<ScaleMenuValue>
        className="pixel-studio-panel__brush-scale-picker"
        triggerClassName="pixel-studio-panel__brush-scale-trigger"
        label={label}
        options={SCALE_MENU}
        value={value}
        onChange={(next) => {
          if (next !== SCALE_SEPARATOR) onScaleChange(axis, next);
        }}
      />
    </div>
  );
}

function BrushSizeControls({ size }: { size: PixelStudioBrushSizeControls }) {
  const {
    width,
    height,
    nativeWidth,
    nativeHeight,
    max,
    lockRatio,
    scaleX,
    scaleY,
    onWidthChange,
    onHeightChange,
    onLockRatioChange,
    onScaleChange,
    onResetSize,
  } = size;
  const isNative = width === nativeWidth && height === nativeHeight;

  return (
    <div className="pixel-studio-panel__brush-size">
      {/* DOM order is the Tab order: W → lock → H. The stylesheet places the
          lock in its own column spanning both slider rows. */}
      <div className="pixel-studio-panel__brush-size-row">
        <SliderWithNumber
          label="W"
          name="Width"
          value={width}
          min={1}
          max={max}
          onChange={onWidthChange}
        />
        <IconButton
          icon={lockRatio ? Link : Unlink}
          label="Lock aspect ratio"
          aria-pressed={lockRatio}
          className={classNames(
            "pixel-studio-panel__brush-lock",
            lockRatio && "pixel-studio-panel__brush-lock--active",
          )}
          onClick={() => onLockRatioChange(!lockRatio)}
        />
        <SliderWithNumber
          label="H"
          name="Height"
          value={height}
          min={1}
          max={max}
          onChange={onHeightChange}
        />
      </div>
      <div className="pixel-studio-panel__brush-scale">
        {lockRatio ? (
          <ScalePicker
            label="Scaling"
            axis="x"
            value={scaleX}
            onScaleChange={onScaleChange}
          />
        ) : (
          <>
            <ScalePicker
              label="Scale X"
              axis="x"
              value={scaleX}
              onScaleChange={onScaleChange}
            />
            <ScalePicker
              label="Scale Y"
              axis="y"
              value={scaleY}
              onScaleChange={onScaleChange}
            />
          </>
        )}
      </div>
      <div className="pixel-studio-panel__brush-size-footer">
        <Button
          variant="neutral"
          className="pixel-studio-panel__brush-reset"
          disabled={isNative}
          onClick={onResetSize}
        >
          Native size
        </Button>
        <span className="pixel-studio-panel__brush-size-readout">
          {width} × {height} (native {nativeWidth} × {nativeHeight})
        </span>
      </div>
    </div>
  );
}

export function PixelStudioBrushSection({
  pixelBrush,
  onOtherHand,
}: PixelStudioBrushSectionProps) {
  const loaded = pixelBrush.loadState === "loaded" && !!pixelBrush.brushName;

  return (
    <div className="panel pixel-studio-panel__section">
      <div className="panel__header panel__header--compact">
        <span className="panel__title">Brush</span>
        {onOtherHand ? (
          <OtherHandButton onClick={onOtherHand} sectionLabel="Brush" />
        ) : null}
      </div>
      <div className="panel__body panel__body--dense">
        <div className="pixel-studio-panel__brush">
          {loaded ? (
            <dl className="pixel-studio-panel__brush-rows">
              <div className="pixel-studio-panel__brush-row">
                <dt className="pixel-studio-panel__brush-label">Project</dt>
                <dd className="pixel-studio-panel__brush-value">
                  {pixelBrush.brushName}
                </dd>
              </div>
              <div className="pixel-studio-panel__brush-row">
                <dt className="pixel-studio-panel__brush-label">Size</dt>
                <dd className="pixel-studio-panel__brush-value">
                  {pixelBrush.width ?? "?"} × {pixelBrush.height ?? "?"}
                </dd>
              </div>
              <div className="pixel-studio-panel__brush-row">
                <dt className="pixel-studio-panel__brush-label">Frame</dt>
                <dd className="pixel-studio-panel__brush-value">
                  {pixelBrush.frameName ?? "—"}
                  {pixelBrush.frameIndex !== null
                    ? ` (${pixelBrush.frameIndex + 1}/${pixelBrush.frameCount})`
                    : ""}
                </dd>
              </div>
              <div className="pixel-studio-panel__brush-row">
                <dt className="pixel-studio-panel__brush-label">Layers</dt>
                <dd className="pixel-studio-panel__brush-value">
                  {pixelBrush.layerCount}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="pixel-studio-panel__brush-status">
              {pixelBrush.loadState === "loading"
                ? "Loading brush projects…"
                : pixelBrush.loadState === "failed"
                  ? "Could not load brush projects."
                  : "No brush project loaded. Create one in the Brush Studio."}
            </p>
          )}
          {loaded && pixelBrush.size ? (
            <BrushSizeControls size={pixelBrush.size} />
          ) : null}
          <Button
            variant="neutral"
            className="pixel-studio-panel__brush-open"
            onClick={pixelBrush.onOpenBrushStudio}
          >
            Open Brush Studio
          </Button>
          <p className="pixel-studio-panel__brush-hint">
            Stamps the current frame of the open brush project with the selected
            colour.
          </p>
        </div>
      </div>
    </div>
  );
}
