import { useMemo, useState } from "react";
import { useEditorStore } from "../../store";
import { Color, Pixel, PixelData } from "../../types";
import "./LayerColors.css";

// Helper to create a unique key for a color
function colorKey(c: Color): string {
  return `${c.r}-${c.g}-${c.b}-${c.a}`;
}

// Helper to extract color from PixelData
function getPixelColor(pd: PixelData | undefined): Pixel | null {
  if (!pd || pd.color === 0) return null;
  return pd.color;
}

export function LayerColors() {
  const {
    project,
    getCurrentLayer,
    getCurrentObject,
    getCurrentVariant,
    getSelectedVariantLayer,
    isEditingVariant,
    colorAdjustment,
    startColorAdjustment,
    clearColorAdjustment,
  } = useEditorStore();

  const [allFramesMode, setAllFramesMode] = useState(false);

  const layer = getCurrentLayer();
  const obj = getCurrentObject();
  const currentPickerColor = project?.uiState.selectedColor;
  const editingVariant = isEditingVariant();
  const variantData = editingVariant ? getCurrentVariant() : null;
  const variantLayer = editingVariant ? getSelectedVariantLayer() : null;

  // Extract unique colors from the current layer (or all frames if toggle is on)
  const uniqueColorsData = useMemo(() => {
    if (!layer || !obj)
      return { colors: [] as Color[], exceeded: false, count: 0 };

    const MAX_DISPLAY = 64;
    const colorMap = new Map<string, Color>();
    let exceeded = false;

    const addColor = (pixel: Color) => {
      const key = colorKey(pixel);
      if (!colorMap.has(key)) {
        colorMap.set(key, pixel);
        if (colorMap.size > MAX_DISPLAY) {
          exceeded = true;
        }
      }
    };

    // Handle variant editing mode
    if (editingVariant && variantData && variantLayer) {
      const { variant } = variantData;
      const { width, height } = variant.gridSize;

      if (allFramesMode) {
        // Get colors from all variant frames
        outerVariantAll: for (const variantFrame of variant.frames) {
          for (const vLayer of variantFrame.layers) {
            for (let y = 0; y < height; y++) {
              const row = vLayer.pixels[y];
              if (!row) continue;

              for (let x = 0; x < width; x++) {
                const pixel = getPixelColor(row[x]);
                if (pixel && pixel.a > 0) {
                  addColor(pixel);
                  if (exceeded) break outerVariantAll;
                }
              }
            }
          }
        }
      } else {
        // Get colors only from current variant frame's layer
        outerVariantCurrent: for (let y = 0; y < height; y++) {
          const row = variantLayer.pixels[y];
          if (!row) continue;

          for (let x = 0; x < width; x++) {
            const pixel = getPixelColor(row[x]);
            if (pixel && pixel.a > 0) {
              addColor(pixel);
              if (exceeded) break outerVariantCurrent;
            }
          }
        }
      }
    } else {
      // Regular layer editing mode
      const { width, height } = obj.gridSize;

      if (allFramesMode) {
        // Get colors from all frames with matching layer names
        outerAllFrames: for (const frame of obj.frames) {
          const matchingLayers = frame.layers.filter(
            (l) => l.name === layer.name,
          );
          for (const matchingLayer of matchingLayers) {
            for (let y = 0; y < height; y++) {
              const row = matchingLayer.pixels[y];
              if (!row) continue;

              for (let x = 0; x < width; x++) {
                const pixel = getPixelColor(row[x]);
                if (pixel && pixel.a > 0) {
                  addColor(pixel);
                  if (exceeded) break outerAllFrames;
                }
              }
            }
          }
        }
      } else {
        // Get colors only from current layer
        outerCurrentLayer: for (let y = 0; y < height; y++) {
          const row = layer.pixels[y];
          if (!row) continue;

          for (let x = 0; x < width; x++) {
            const pixel = getPixelColor(row[x]);
            if (pixel && pixel.a > 0) {
              addColor(pixel);
              if (exceeded) break outerCurrentLayer;
            }
          }
        }
      }
    }

    // Sort by luminance for a nice visual order
    const colors = exceeded
      ? []
      : Array.from(colorMap.values()).sort((a, b) => {
          const lumA = 0.299 * a.r + 0.587 * a.g + 0.114 * a.b;
          const lumB = 0.299 * b.r + 0.587 * b.g + 0.114 * b.b;
          return lumA - lumB;
        });

    return { colors, exceeded, count: colorMap.size };
  }, [layer, obj, allFramesMode, editingVariant, variantData, variantLayer]);

  if (!layer) {
    return (
      <div className="layer-colors">
        <div className="layer-colors-left">
          <div className="layer-colors-label">Layer Colors</div>
        </div>
        <div className="layer-colors-center">
          <div className="layer-colors-empty">No layer selected</div>
        </div>
        <div className="layer-colors-right"></div>
      </div>
    );
  }

  if (uniqueColorsData.exceeded) {
    return (
      <div className="layer-colors">
        <div className="layer-colors-left">
          <div className="layer-colors-label">Layer Colors</div>
          <div
            className="layer-colors-toggle"
            onClick={() => setAllFramesMode(!allFramesMode)}
          >
            <input
              type="checkbox"
              checked={allFramesMode}
              onChange={() => {}}
              className="layer-colors-checkbox"
            />
            <span className="layer-colors-toggle-label">All Frames</span>
          </div>
        </div>
        <div className="layer-colors-center">
          <div className="layer-colors-empty">
            Too many colors to display ({uniqueColorsData.count}+)
          </div>
        </div>
        <div className="layer-colors-right"></div>
      </div>
    );
  }

  if (uniqueColorsData.colors.length === 0) {
    return (
      <div className="layer-colors">
        <div className="layer-colors-left">
          <div className="layer-colors-label">Layer Colors</div>
          <div
            className="layer-colors-toggle"
            onClick={() => setAllFramesMode(!allFramesMode)}
          >
            <input
              type="checkbox"
              checked={allFramesMode}
              onChange={() => {}}
              className="layer-colors-checkbox"
            />
            <span className="layer-colors-toggle-label">All Frames</span>
          </div>
        </div>
        <div className="layer-colors-center">
          <div className="layer-colors-empty">No colors in this layer</div>
        </div>
        <div className="layer-colors-right"></div>
      </div>
    );
  }

  const handleColorClick = (color: Color) => {
    // If clicking any swatch while in adjustment mode, clear the adjustment
    if (colorAdjustment) {
      clearColorAdjustment();
    } else {
      // Otherwise, start adjusting this color
      startColorAdjustment(color, allFramesMode);
    }
  };

  const handleToggleChange = () => {
    // Clear any active color adjustment when toggling
    if (colorAdjustment) {
      clearColorAdjustment();
    }
    setAllFramesMode(!allFramesMode);
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
      <div className="layer-colors-left">
        <div className="layer-colors-label">Layer Colors</div>
        <div className="layer-colors-toggle" onClick={handleToggleChange}>
          <input
            type="checkbox"
            checked={allFramesMode}
            onChange={() => {}}
            className="layer-colors-checkbox"
          />
          <span className="layer-colors-toggle-label">All Frames</span>
        </div>
      </div>
      <div className="layer-colors-center">
        <div className="layer-colors-swatches">
          {uniqueColorsData.colors.map((color, index) => {
            const key = colorKey(color);
            // A swatch is selected if we're in adjustment mode AND the current picker color matches this swatch
            const isSelected = colorAdjustment && selectedIndex === index;

            return (
              <button
                key={key}
                className={`layer-color-swatch ${isSelected ? "selected" : ""}`}
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
      <div className="layer-colors-right">
        {colorAdjustment && (
          <div className="layer-colors-hint">
            {colorAdjustment.allFrames
              ? "Adjusting all frames"
              : "Adjusting color"}{" "}
            • Press ESC or click swatch to stop
          </div>
        )}
      </div>
    </div>
  );
}
