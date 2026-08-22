/**
 * LayerColors — PURE (REFRESH task 36, W27).
 *
 * ── The pixel scan is GONE from this file ─────────────────────────────────
 *
 * The `useMemo` that walked every cell of the grid (and, in `allFramesMode`,
 * every cell of every matching layer of every frame) moved to
 * `containers/hooks/layerColorExtraction.ts`. R2 bars pixel-walking from
 * `ui/`, and W26 set the precedent for where it goes.
 *
 * ⚠️ Watch the INVALIDATION, not just the location: the container must feed
 * that scan `pixelVersion`, because grids are `observable.ref` and a paint can
 * replace `layer.pixels` without producing a new `layer` node. Getting this
 * wrong shows up as stale swatches (manual check 2).
 *
 * ── The 3 keyboard-inoperable toggles are FIXED ───────────────────────────
 *
 * All three "All Frames" toggles were `<div onClick>` wrappers around a
 * checkbox whose `onChange` was `() => {}` — a no-op. The div is not
 * focusable, so Tab never reached the control and Space never flipped it; the
 * checkbox rendered its state but could not be operated by keyboard at all.
 * Task 22 was explicitly told to leave them; task 36 is where they are fixed.
 *
 * All three now use the `Toggle` primitive, whose accessibility is
 * STRUCTURAL: it is a real `<input type="checkbox" role="switch">` inside its
 * `<label>`, so Tab and Space work with no JavaScript. The primitive's own
 * header names these three sites as its intended fix.
 *
 * ⚠️ This IS a deliberate visual change: a 14px native checkbox becomes the
 * shared pill switch. That is the primitive's documented design, and the
 * three sites are now consistent with the other toggles in the app. The
 * surrounding `layer-colors__toggle` chrome (bordered box + hover) is KEPT,
 * so only the control inside it changes.
 */
import { Toggle } from "../../primitives/Toggle/Toggle";
import { Color } from "../../../types";
import { colorKey, type LayerColorsData } from "../../utils/layerColors";
import "./LayerColors.css";

interface LayerColorsProps {
  /** Whether a layer is selected at all; drives the empty state. */
  hasLayer: boolean;
  /** The extracted swatches — computed in the container (R2). */
  uniqueColorsData: LayerColorsData;
  /** `uiState.selectedColor`, for the "which swatch is being adjusted" marker. */
  currentPickerColor: Color | undefined;
  /** Truthy while a colour-adjustment session is active. */
  colorAdjustment: boolean;
  /**
   * Whether the ACTIVE adjustment covers all frames.
   *
   * ⚠️ Separate from `allFramesMode`. `allFramesMode` is the toggle's current
   * position; this is the flag the adjustment was STARTED with, and the hint
   * text reports the latter. They differ the moment a user flips the toggle
   * mid-adjustment — which is exactly why `handleToggleChange` clears the
   * adjustment. Meaningless unless `colorAdjustment` is true.
   */
  colorAdjustmentAllFrames: boolean;
  /** "All Frames" toggle state — owned by the container, since the scan needs it. */
  allFramesMode: boolean;
  onAllFramesModeChange: (allFrames: boolean) => void;
  onStartColorAdjustment: (color: Color, allFrames: boolean) => void;
  onClearColorAdjustment: () => void;
}

export function LayerColors({
  hasLayer,
  uniqueColorsData,
  currentPickerColor,
  colorAdjustment,
  colorAdjustmentAllFrames,
  allFramesMode,
  onAllFramesModeChange,
  onStartColorAdjustment,
  onClearColorAdjustment,
}: LayerColorsProps) {
  if (!hasLayer) {
    return (
      <div className="layer-colors">
        <div className="layer-colors__left">
          <div className="layer-colors__label">Layer Colors</div>
        </div>
        <div className="layer-colors__center">
          <div className="layer-colors__empty">No layer selected</div>
        </div>
        <div className="layer-colors__right"></div>
      </div>
    );
  }

  if (uniqueColorsData.exceeded) {
    return (
      <div className="layer-colors">
        <div className="layer-colors__left">
          <div className="layer-colors__label">Layer Colors</div>
          <div className="layer-colors__toggle">
            <Toggle
              checked={allFramesMode}
              onChange={onAllFramesModeChange}
              label={
                <span className="layer-colors__toggle-label">All Frames</span>
              }
            />
          </div>
        </div>
        <div className="layer-colors__center">
          <div className="layer-colors__empty">
            Too many colors to display ({uniqueColorsData.count}+)
          </div>
        </div>
        <div className="layer-colors__right"></div>
      </div>
    );
  }

  if (uniqueColorsData.colors.length === 0) {
    return (
      <div className="layer-colors">
        <div className="layer-colors__left">
          <div className="layer-colors__label">Layer Colors</div>
          <div className="layer-colors__toggle">
            <Toggle
              checked={allFramesMode}
              onChange={onAllFramesModeChange}
              label={
                <span className="layer-colors__toggle-label">All Frames</span>
              }
            />
          </div>
        </div>
        <div className="layer-colors__center">
          <div className="layer-colors__empty">No colors in this layer</div>
        </div>
        <div className="layer-colors__right"></div>
      </div>
    );
  }

  const handleColorClick = (color: Color) => {
    // If clicking any swatch while in adjustment mode, clear the adjustment
    if (colorAdjustment) {
      onClearColorAdjustment();
    } else {
      // Otherwise, start adjusting this color
      onStartColorAdjustment(color, allFramesMode);
    }
  };

  const handleToggleChange = (_next: boolean) => {
    // Clear any active color adjustment when toggling
    if (colorAdjustment) {
      onClearColorAdjustment();
    }
    onAllFramesModeChange(!allFramesMode);
  };

  // Find which swatch matches the current picker color (if in adjustment mode)
  const selectedIndex = colorAdjustment
    ? uniqueColorsData.colors.findIndex(
        (c) =>
          currentPickerColor &&
          c.r === currentPickerColor.r &&
          c.g === currentPickerColor.g &&
          c.b === currentPickerColor.b &&
          c.a === currentPickerColor.a,
      )
    : -1;

  return (
    <div className="layer-colors">
      <div className="layer-colors__left">
        <div className="layer-colors__label">Layer Colors</div>
        {/*
          ⚠️ This one goes through `handleToggleChange`, NOT
          `onAllFramesModeChange` directly: toggling "All Frames" while a
          colour adjustment is active must CLEAR that adjustment first, or the
          adjustment keeps targeting a swatch set that no longer matches the
          scan. The two empty-state toggles above have no adjustment to clear.
        */}
        <div className="layer-colors__toggle">
          <Toggle
            checked={allFramesMode}
            onChange={handleToggleChange}
            label={
              <span className="layer-colors__toggle-label">All Frames</span>
            }
          />
        </div>
      </div>
      <div className="layer-colors__center">
        <div className="layer-colors__swatches">
          {uniqueColorsData.colors.map((color, index) => {
            const key = colorKey(color);
            // A swatch is selected if we're in adjustment mode AND the current picker color matches this swatch
            const isSelected = colorAdjustment && selectedIndex === index;

            return (
              <button
                key={key}
                className={`layer-colors__swatch ${isSelected ? "layer-colors__swatch--selected" : ""}`}
                style={{
                  backgroundColor: `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`,
                }}
                onClick={() => handleColorClick(color)}
                title={`#${color.r.toString(16).padStart(2, "0")}${color.g.toString(16).padStart(2, "0")}${color.b.toString(16).padStart(2, "0")} (${isSelected ? "Click to deselect" : "Click to adjust"})`}
              />
            );
          })}
        </div>
      </div>
      <div className="layer-colors__right">
        {colorAdjustment && (
          <div className="layer-colors__hint">
            {colorAdjustmentAllFrames
              ? "Adjusting all frames"
              : "Adjusting color"}{" "}
            • Press ESC or click swatch to stop
          </div>
        )}
      </div>
    </div>
  );
}
