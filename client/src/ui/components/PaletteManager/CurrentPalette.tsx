/**
 * CurrentPalette — the live colours of whatever is being edited, rendered as
 * the first, permanent row of the palette list.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THIS REPLACES `LayerColors`, WHICH IS RETIRED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `LayerColors` was a horizontal strip under the workspace (`PixelStudioLayout`'s
 * `layerColors` region). It is gone, and everything it did lives here:
 *
 *   - the swatch list from the pixel scan (though NOT its luminance order —
 *     see `sortPaletteColors`, which now puts recently-used colours first),
 *   - the "All Frames" toggle,
 *   - the no-colours / no-layer states (but NOT its "too many colors" cap —
 *     that is removed; see `ui/utils/layerColors.ts`),
 *   - the colour-adjustment mode and its hint.
 *
 * Two things are NEW:
 *
 *   - an "All Layers" toggle, orthogonal to "All Frames" (four scopes — see
 *     `containers/hooks/layerColorExtraction.ts` for the table),
 *   - "Save as Palette", which freezes the current swatches into a real,
 *     permanent palette in the list below.
 *
 * ── ⚠️ SINGLE TAP AND DOUBLE TAP ARE DIFFERENT ACTIONS ────────────────────
 *
 * This is the one behaviour change users will feel, and it is deliberate:
 *
 *   single tap  -> pick the colour (like EVERY other palette swatch)
 *   double tap  -> enter colour-adjustment mode, recolouring every matching
 *                  pixel in scope live as the picker moves
 *
 * `LayerColors` had single tap enter adjustment mode, which made its swatches
 * behave unlike every other swatch in the app. Now that the strip lives among
 * the real palettes, that inconsistency would be actively confusing.
 *
 * ⚠️ The single-tap handler is DEFERRED behind a timer, not fired eagerly.
 * A double tap delivers TWO `click` events before `dblclick`, so an eager
 * single-tap handler would set the drawing colour and only then open the
 * adjustment mode — harmless here (adjustment sets the same colour anyway)
 * but it also fires `onSelectColor` twice, and the timer keeps the two
 * gestures cleanly disjoint on touch devices where the app is actually used.
 *
 * Pure `ui/` — the pixel scan, the store reads and the recolour engine are all
 * the container's (R2). This file gets swatches in and callbacks out.
 */
import { useCallback, useEffect, useRef } from "react";
import { Toggle } from "../../primitives/Toggle/Toggle";
import { Icon } from "../../primitives/Icon/Icon";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Color } from "../../../types";
import { colorKey, type LayerColorsData } from "../../utils/layerColors";

/** Window in which a second tap counts as a double tap. */
const DOUBLE_TAP_MS = 250;

export interface CurrentPaletteProps {
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
   * mid-adjustment — which is exactly why flipping clears the adjustment.
   * Meaningless unless `colorAdjustment` is true.
   */
  colorAdjustmentAllFrames: boolean;
  /** The all-layers twin of `colorAdjustmentAllFrames`. */
  colorAdjustmentAllLayers: boolean;
  /** Expansion is owned by `PaletteManager`, which allows one open row. */
  expanded: boolean;
  onToggleExpanded: () => void;
  /**
   * Reports expansion UP to the container, which uses it to skip the pixel
   * scan entirely while the row is closed.
   *
   * ⚠️ This exists because the state has two owners with different needs:
   * `PaletteManager` owns WHICH row is open (only one may be), while the
   * container owns whether the scan is worth paying for. Neither can read the
   * other's, so the row — which sees both — relays it. See
   * `PaletteManagerContainer`'s header for why the gate matters.
   */
  onExpandedChange: (expanded: boolean) => void;
  /** "All Frames" toggle state — owned by the container, since the scan needs it. */
  allFramesMode: boolean;
  onAllFramesModeChange: (allFrames: boolean) => void;
  /** "All Layers" toggle state — likewise. */
  allLayersMode: boolean;
  onAllLayersModeChange: (allLayers: boolean) => void;
  /** Single tap: make this the drawing colour. */
  onSelectColor: (color: Color) => void;
  /** Double tap: open colour-adjustment mode over the current scope. */
  onStartColorAdjustment: (
    color: Color,
    allFrames: boolean,
    allLayers: boolean,
  ) => void;
  onClearColorAdjustment: () => void;
  /** Freeze the current swatches into a permanent palette. */
  onSaveAsPalette: (colors: Color[]) => void;
}

export function CurrentPalette({
  hasLayer,
  uniqueColorsData,
  currentPickerColor,
  colorAdjustment,
  colorAdjustmentAllFrames,
  colorAdjustmentAllLayers,
  expanded,
  onToggleExpanded,
  onExpandedChange,
  allFramesMode,
  onAllFramesModeChange,
  allLayersMode,
  onAllLayersModeChange,
  onSelectColor,
  onStartColorAdjustment,
  onClearColorAdjustment,
  onSaveAsPalette,
}: CurrentPaletteProps) {
  // Pending single-tap, cancelled by a second tap inside the window.
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingTap = useCallback(() => {
    if (tapTimerRef.current !== null) {
      clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }
  }, []);

  // ⚠️ A pending timer must not outlive the component: it captures
  // `onSelectColor`, and firing after unmount is a write into a dead tree.
  useEffect(() => cancelPendingTap, [cancelPendingTap]);

  // Relay expansion to the container, which gates the scan on it. Reported in
  // an effect rather than from `onToggleExpanded` because `PaletteManager`
  // can also close this row on its own — opening a different one collapses
  // this one without any click landing here.
  useEffect(() => {
    onExpandedChange(expanded);
  }, [expanded, onExpandedChange]);

  const handleSwatchClick = (color: Color) => {
    cancelPendingTap();
    tapTimerRef.current = setTimeout(() => {
      tapTimerRef.current = null;
      onSelectColor(color);
    }, DOUBLE_TAP_MS);
  };

  const handleSwatchDoubleClick = (color: Color) => {
    cancelPendingTap();
    // Double-tapping any swatch while already adjusting LEAVES the mode —
    // transcribed from `LayerColors`, where it was the single-tap behaviour.
    if (colorAdjustment) {
      onClearColorAdjustment();
    } else {
      onStartColorAdjustment(color, allFramesMode, allLayersMode);
    }
  };

  // ⚠️ Flipping EITHER scope toggle clears an active adjustment. The
  // adjustment holds a snapshot taken under the OLD scope, so leaving it open
  // would keep recolouring a cell set the toggles no longer describe.
  const handleAllFramesChange = (next: boolean) => {
    if (colorAdjustment) onClearColorAdjustment();
    onAllFramesModeChange(next);
  };

  const handleAllLayersChange = (next: boolean) => {
    if (colorAdjustment) onClearColorAdjustment();
    onAllLayersModeChange(next);
  };

  const { colors } = uniqueColorsData;

  // Which swatch is the one being adjusted, if any.
  const selectedIndex = colorAdjustment
    ? colors.findIndex(
        (c) =>
          currentPickerColor &&
          c.r === currentPickerColor.r &&
          c.g === currentPickerColor.g &&
          c.b === currentPickerColor.b &&
          c.a === currentPickerColor.a,
      )
    : -1;

  const scopeLabel = () => {
    const frames = colorAdjustmentAllFrames ? "all frames" : "this frame";
    const layers = colorAdjustmentAllLayers ? "all layers" : "this layer";
    return `${layers}, ${frames}`;
  };

  // ⚠️ No "too many colors" state — there is no display cap any more (owner's
  // instruction). Every colour in scope is rendered, however many that is.
  const emptyMessage = !hasLayer
    ? "No layer selected"
    : colors.length === 0
      ? "No colors in this scope"
      : null;

  return (
    <div
      className={`palette-manager__item current-palette ${
        expanded ? "palette-manager__item--expanded" : ""
      }`}
    >
      <div className="palette-manager__item-header" onClick={onToggleExpanded}>
        <span className="palette-manager__expand-icon">
          <Icon icon={expanded ? ChevronDown : ChevronRight} size={12} />
        </span>
        <span className="palette-manager__name current-palette__name">
          Current Palette
        </span>
        <span className="palette-manager__count">{colors.length}</span>
      </div>

      {expanded && (
        <div className="palette-manager__item-content">
          <div className="current-palette__scope">
            <Toggle
              checked={allFramesMode}
              onChange={handleAllFramesChange}
              label={<span className="current-palette__scope-label">All Frames</span>}
            />
            <Toggle
              checked={allLayersMode}
              onChange={handleAllLayersChange}
              label={<span className="current-palette__scope-label">All Layers</span>}
            />
          </div>

          {emptyMessage ? (
            <div className="current-palette__empty">{emptyMessage}</div>
          ) : (
            <div className="palette-manager__swatches">
              {colors.map((color, index) => {
                const isSelected = colorAdjustment && selectedIndex === index;
                return (
                  <div key={colorKey(color)} className="palette-manager__swatch-group">
                    <button
                      className={`palette-manager__swatch ${
                        isSelected ? "current-palette__swatch--adjusting" : ""
                      }`}
                      style={{
                        backgroundColor: `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`,
                      }}
                      onClick={() => handleSwatchClick(color)}
                      onDoubleClick={() => handleSwatchDoubleClick(color)}
                      title={`#${color.r.toString(16).padStart(2, "0")}${color.g
                        .toString(16)
                        .padStart(2, "0")}${color.b
                        .toString(16)
                        .padStart(2, "0")} — tap to pick, double-tap to ${
                        isSelected ? "stop adjusting" : "recolor every use"
                      }`}
                    >
                      <div className="palette-manager__swatch-bg"></div>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {colorAdjustment && (
            <div className="current-palette__hint">
              Recoloring {scopeLabel()} • Press ESC or double-tap a swatch to
              stop
            </div>
          )}

          <div className="palette-manager__actions current-palette__actions">
            <button
              className="current-palette__save-btn"
              onClick={() => onSaveAsPalette(colors)}
              disabled={colors.length === 0}
              title={
                colors.length === 0
                  ? "Nothing to save"
                  : "Record these colors as a permanent palette"
              }
            >
              Save as Palette
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
