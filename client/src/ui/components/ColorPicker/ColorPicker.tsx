import { useState, useEffect, useRef, useCallback } from "react";
/**
 * ColorPicker — PURE (REFRESH task 36, W27).
 *
 * ⚠️ THE 300ms DEBOUNCE IS UNCHANGED, and must stay that way — the spec calls
 * it out explicitly because it drives UNDO HISTORY, not just rendering. The
 * whole timer, its `hasSavedInitialStateRef` latch and its cleanup live
 * entirely inside this component and touch no store directly; purification
 * only renamed the store CALLS they make into props
 * (`saveCurrentStateToHistory` → `onSaveStateToHistory`). Nothing about
 * *when* they fire moved.
 *
 * The store contract preserved verbatim:
 *   - `onSaveStateToHistory()` with NO label on drag START (the pre-image),
 *   - `onSaveStateToHistory("Adjust color")` 300ms after drag END,
 *   - `onAdjustColor(color, trackHistory)` while a colour ADJUSTMENT is
 *     active, `onSetColor(color)` otherwise.
 *
 * That "write on release, not on every mousemove" behaviour is manual check 3.
 */
import { Color } from "../../../types";
// Task 36: the HSL ⇄ RGB maths was module-private here; it now lives in
// `ui/utils/colorMath.ts` (extracted verbatim — see that file's note on why
// `prevHsl` must not be "simplified" away).
import { hslToRgb, rgbToHsl } from "../../utils/colorMath";
import { OtherHandButton } from "../OtherHand/OtherHandButton";
import "./ColorPicker.css";

interface ColorPickerProps {
  /** `uiState.selectedColor` — the colour the picker reflects. */
  selectedColor: Color;
  /** Recently used colours, newest first. */
  colorHistory: Color[];
  /** Truthy while a colour-adjustment session is active. */
  colorAdjustment: boolean;
  onSetColor: (color: Color) => void;
  onAdjustColor: (color: Color, trackHistory: boolean) => void;
  /** Label omitted on drag start, `"Adjust color"` on the debounced save. */
  onSaveStateToHistory: (label?: string) => void;
  /** Hands the rail to the colour sliders in Other Hand Mode (tablets only). */
  onOtherHand?: () => void;
}

export function ColorPicker({
  selectedColor,
  colorHistory,
  colorAdjustment,
  onSetColor,
  onAdjustColor,
  onSaveStateToHistory,
  onOtherHand,
}: ColorPickerProps) {
  const [localColor, setLocalColor] = useState<Color>({
    r: 0,
    g: 0,
    b: 0,
    a: 255,
  });
  const [hsl, setHsl] = useState({ h: 0, s: 0, l: 0 });
  const [isDraggingSV, setIsDraggingSV] = useState(false);
  const [isDraggingHue, setIsDraggingHue] = useState(false);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const historySaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasSavedInitialStateRef = useRef<boolean>(false);
  // Store last known H and S values to preserve them when L is 0 or 100
  const lastValidHsRef = useRef<{ h: number; s: number } | null>(null);

  const svCanvasRef = useRef<HTMLCanvasElement>(null);
  const hueCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (selectedColor) {
      const c = selectedColor;
      setLocalColor(c);
      const newHsl = rgbToHsl(c.r, c.g, c.b, hsl);
      setHsl(newHsl);
      // Update last valid H and S if L is not 0 or 100
      if (newHsl.l > 0 && newHsl.l < 100) {
        lastValidHsRef.current = { h: newHsl.h, s: newHsl.s };
      }
    }
  }, [selectedColor]);

  // Draw the saturation/value gradient
  const drawSVCanvas = useCallback(() => {
    const canvas = svCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Create the hue background
    const hueColor = hslToRgb(hsl.h, 100, 50);
    ctx.fillStyle = `rgb(${hueColor.r}, ${hueColor.g}, ${hueColor.b})`;
    ctx.fillRect(0, 0, width, height);

    // White gradient from left
    const whiteGradient = ctx.createLinearGradient(0, 0, width, 0);
    whiteGradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    whiteGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = whiteGradient;
    ctx.fillRect(0, 0, width, height);

    // Black gradient from bottom
    const blackGradient = ctx.createLinearGradient(0, 0, 0, height);
    blackGradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    blackGradient.addColorStop(1, "rgba(0, 0, 0, 1)");
    ctx.fillStyle = blackGradient;
    ctx.fillRect(0, 0, width, height);
  }, [hsl.h]);

  // Draw the hue strip
  const drawHueCanvas = useCallback(() => {
    const canvas = hueCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    for (let i = 0; i <= 360; i += 60) {
      const rgb = hslToRgb(i, 100, 50);
      gradient.addColorStop(i / 360, `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }, []);

  useEffect(() => {
    drawSVCanvas();
  }, [drawSVCanvas]);

  useEffect(() => {
    drawHueCanvas();
  }, [drawHueCanvas]);

  // Use adjustColor when in color adjustment mode, otherwise use setColor
  const applyColor = (color: Color, trackHistory: boolean = false) => {
    if (colorAdjustment) {
      onAdjustColor(color, trackHistory);
    } else {
      onSetColor(color);
    }
  };

  // Save initial state to history when starting to drag
  const saveInitialStateToHistory = useCallback(() => {
    if (colorAdjustment && !hasSavedInitialStateRef.current) {
      // Save current state to history before making any changes
      onSaveStateToHistory();
      hasSavedInitialStateRef.current = true;
    }
  }, [colorAdjustment, onSaveStateToHistory]);

  // Debounced history save - saves final state to history after mouse release
  const saveFinalStateToHistory = useCallback(() => {
    if (historySaveTimeoutRef.current) {
      clearTimeout(historySaveTimeoutRef.current);
    }
    historySaveTimeoutRef.current = setTimeout(() => {
      if (colorAdjustment && hasSavedInitialStateRef.current) {
        // Save the final state to history
        // This ensures we can redo after undoing
        onSaveStateToHistory("Adjust color");
        hasSavedInitialStateRef.current = false;
        historySaveTimeoutRef.current = null;
      }
    }, 300); // 300ms debounce
  }, [colorAdjustment, onSaveStateToHistory]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (historySaveTimeoutRef.current) {
        clearTimeout(historySaveTimeoutRef.current);
      }
    };
  }, []);

  // Handle global mouse up to save final state if dragging
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (
        isDraggingSlider &&
        colorAdjustment &&
        hasSavedInitialStateRef.current
      ) {
        setIsDraggingSlider(false);
        saveFinalStateToHistory();
      }
    };

    if (isDraggingSlider) {
      window.addEventListener("mouseup", handleGlobalMouseUp);
      return () => {
        window.removeEventListener("mouseup", handleGlobalMouseUp);
      };
    }
  }, [isDraggingSlider, colorAdjustment, localColor, saveFinalStateToHistory]);

  // Handle slider mouse down - start tracking drag
  const handleSliderMouseDown = useCallback(() => {
    setIsDraggingSlider(true);
    hasSavedInitialStateRef.current = false;
    if (historySaveTimeoutRef.current) {
      clearTimeout(historySaveTimeoutRef.current);
      historySaveTimeoutRef.current = null;
    }
    // Save initial state to history before making changes
    saveInitialStateToHistory();
  }, [saveInitialStateToHistory]);

  // Handle slider mouse up - save final state with debounce
  const handleSliderMouseUp = useCallback(() => {
    setIsDraggingSlider(false);
    if (colorAdjustment && hasSavedInitialStateRef.current) {
      // Save final state to history with debounce
      saveFinalStateToHistory();
    }
  }, [colorAdjustment, localColor, saveFinalStateToHistory]);

  const updateColorFromHSL = (newHsl: { h: number; s: number; l: number }) => {
    // Preserve H and S when L is 0 or 100
    let finalHsl = { ...newHsl };
    if (newHsl.l === 0 || newHsl.l === 100) {
      // Use last valid H and S if available, otherwise keep current values
      if (lastValidHsRef.current) {
        finalHsl = { ...lastValidHsRef.current, l: newHsl.l };
      } else {
        // If we don't have a last valid value, preserve current H and S
        finalHsl = { h: hsl.h, s: hsl.s, l: newHsl.l };
      }
    } else {
      // Update last valid H and S when L is not 0 or 100
      lastValidHsRef.current = { h: newHsl.h, s: newHsl.s };
    }

    setHsl(finalHsl);
    const rgb = hslToRgb(finalHsl.h, finalHsl.s, finalHsl.l);
    const newColor = { ...rgb, a: localColor.a };
    setLocalColor(newColor);
    // Only track history if not dragging a slider (for direct input changes)
    applyColor(newColor, !isDraggingSlider);
  };

  const updateColorFromRGB = (channel: keyof Color, value: number) => {
    const clamped = Math.max(0, Math.min(255, Math.floor(value)));
    const newColor = { ...localColor, [channel]: clamped };
    setLocalColor(newColor);
    // Only track history if not dragging a slider (for direct input changes)
    applyColor(newColor, !isDraggingSlider);
    if (channel !== "a") {
      const newHsl = rgbToHsl(newColor.r, newColor.g, newColor.b, hsl);
      setHsl(newHsl);
      // Update last valid H and S if L is not 0 or 100
      if (newHsl.l > 0 && newHsl.l < 100) {
        lastValidHsRef.current = { h: newHsl.h, s: newHsl.s };
      }
    }
  };

  const handleSVCanvasInteraction = (
    e: React.MouseEvent<HTMLCanvasElement>,
  ) => {
    const canvas = svCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    // Convert x,y to saturation and lightness
    // x = saturation (0 to 100)
    // y = value/brightness (100 to 0), which affects lightness
    const s = x * 100;
    const v = (1 - y) * 100;
    // Convert HSV to HSL
    const l = (v / 100) * (1 - s / 100 / 2);
    const sHSL = l === 0 || l === 1 ? 0 : (v / 100 - l) / Math.min(l, 1 - l);

    const lPercent = Math.round(l * 100);
    let finalHsl = { h: hsl.h, s: Math.round(sHSL * 100), l: lPercent };

    // Preserve H and S when L is 0 or 100
    if (lPercent === 0 || lPercent === 100) {
      if (lastValidHsRef.current) {
        finalHsl = { ...lastValidHsRef.current, l: lPercent };
      } else {
        finalHsl = { h: hsl.h, s: hsl.s, l: lPercent };
      }
    } else {
      // Update last valid H and S when L is not 0 or 100
      lastValidHsRef.current = { h: finalHsl.h, s: finalHsl.s };
    }

    setHsl(finalHsl);
    const rgb = hslToRgb(finalHsl.h, finalHsl.s, finalHsl.l);
    const newColor = { ...rgb, a: localColor.a };
    setLocalColor(newColor);
    // Don't track history while dragging
    applyColor(newColor, false);
  };

  const handleHueCanvasInteraction = (
    e: React.MouseEvent<HTMLCanvasElement>,
  ) => {
    const canvas = hueCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newHue = Math.round(x * 360);

    const newHsl = { ...hsl, h: newHue };
    setHsl(newHsl);
    const rgb = hslToRgb(newHsl.h, newHsl.s, newHsl.l);
    const newColor = { ...rgb, a: localColor.a };
    setLocalColor(newColor);
    // Don't track history while dragging
    applyColor(newColor, false);
  };

  const handleHexChange = (hex: string) => {
    const match = hex.match(
      /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i,
    );
    if (match) {
      const r = parseInt(match[1], 16);
      const g = parseInt(match[2], 16);
      const b = parseInt(match[3], 16);
      const a = match[4] ? parseInt(match[4], 16) : 255;
      const newColor = { r, g, b, a };
      setLocalColor(newColor);
      applyColor(newColor);
      const newHsl = rgbToHsl(r, g, b, hsl);
      setHsl(newHsl);
      // Update last valid H and S if L is not 0 or 100
      if (newHsl.l > 0 && newHsl.l < 100) {
        lastValidHsRef.current = { h: newHsl.h, s: newHsl.s };
      }
    }
  };

  const getHexColor = (): string => {
    const r = localColor.r.toString(16).padStart(2, "0");
    const g = localColor.g.toString(16).padStart(2, "0");
    const b = localColor.b.toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  };

  const getDisplayColor = (): string => {
    return `rgba(${localColor.r}, ${localColor.g}, ${localColor.b}, ${localColor.a / 255})`;
  };

  // Calculate SV picker position from current HSL
  const getSVPosition = () => {
    const l = hsl.l / 100;
    const s = hsl.s / 100;
    // Convert HSL back to HSV for positioning
    const v = l + s * Math.min(l, 1 - l);
    const sHSV = v === 0 ? 0 : 2 * (1 - l / v);
    return {
      x: sHSV * 100,
      y: (1 - v) * 100,
    };
  };

  const svPos = getSVPosition();

  const handleHistoryColorClick = (color: Color) => {
    setLocalColor(color);
    applyColor(color);
    const newHsl = rgbToHsl(color.r, color.g, color.b, hsl);
    setHsl(newHsl);
    // Update last valid H and S if L is not 0 or 100
    if (newHsl.l > 0 && newHsl.l < 100) {
      lastValidHsRef.current = { h: newHsl.h, s: newHsl.s };
    }
  };

  return (
    <div className="panel color-picker">
      <div className="panel__header">
        <span className="panel__title">Color</span>
        {onOtherHand ? (
          <OtherHandButton onClick={onOtherHand} sectionLabel="Color" />
        ) : null}
      </div>
      <div className="panel__body">
        {/* Color History */}
        {colorHistory.length > 0 && (
          <div className="color-picker__history">
            {colorHistory.map((color, index) => (
              <button
                key={`${color.r}-${color.g}-${color.b}-${color.a}-${index}`}
                className="color-picker__history-swatch"
                style={{
                  backgroundColor: `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`,
                }}
                onClick={() => handleHistoryColorClick(color)}
                title={`#${color.r.toString(16).padStart(2, "0")}${color.g.toString(16).padStart(2, "0")}${color.b.toString(16).padStart(2, "0")}`}
              />
            ))}
          </div>
        )}

        {/* Rainbow picker area */}
        <div className="color-picker__area">
          <div className="color-picker__sv-picker">
            <canvas
              ref={svCanvasRef}
              width={180}
              height={120}
              className="color-picker__sv-canvas"
              onMouseDown={(e) => {
                setIsDraggingSV(true);
                setIsDraggingSlider(true);
                hasSavedInitialStateRef.current = false;
                if (historySaveTimeoutRef.current) {
                  clearTimeout(historySaveTimeoutRef.current);
                  historySaveTimeoutRef.current = null;
                }
                saveInitialStateToHistory();
                handleSVCanvasInteraction(e);
              }}
              onMouseMove={(e) => isDraggingSV && handleSVCanvasInteraction(e)}
              onMouseUp={() => {
                setIsDraggingSV(false);
                setIsDraggingSlider(false);
                if (colorAdjustment && hasSavedInitialStateRef.current) {
                  saveFinalStateToHistory();
                }
              }}
              onMouseLeave={() => {
                setIsDraggingSV(false);
                setIsDraggingSlider(false);
                if (colorAdjustment && hasSavedInitialStateRef.current) {
                  saveFinalStateToHistory();
                }
              }}
            />
            <div
              className="color-picker__sv-handle"
              style={{ left: `${svPos.x}%`, top: `${svPos.y}%` }}
            />
          </div>

          <div className="color-picker__hue-picker">
            <canvas
              ref={hueCanvasRef}
              width={180}
              height={12}
              className="color-picker__hue-canvas"
              onMouseDown={(e) => {
                setIsDraggingHue(true);
                setIsDraggingSlider(true);
                hasSavedInitialStateRef.current = false;
                if (historySaveTimeoutRef.current) {
                  clearTimeout(historySaveTimeoutRef.current);
                  historySaveTimeoutRef.current = null;
                }
                saveInitialStateToHistory();
                handleHueCanvasInteraction(e);
              }}
              onMouseMove={(e) =>
                isDraggingHue && handleHueCanvasInteraction(e)
              }
              onMouseUp={() => {
                setIsDraggingHue(false);
                setIsDraggingSlider(false);
                if (colorAdjustment && hasSavedInitialStateRef.current) {
                  saveFinalStateToHistory();
                }
              }}
              onMouseLeave={() => {
                setIsDraggingHue(false);
                setIsDraggingSlider(false);
                if (colorAdjustment && hasSavedInitialStateRef.current) {
                  saveFinalStateToHistory();
                }
              }}
            />
            <div
              className="color-picker__hue-handle"
              style={{ left: `${(hsl.h / 360) * 100}%` }}
            />
          </div>
        </div>

        {/* Color preview and hex */}
        <div className="color-picker__preview-row">
          <div
            className="color-picker__preview"
            style={{ backgroundColor: getDisplayColor() }}
          >
            <div className="color-picker__transparency-grid"></div>
          </div>
          <input
            type="text"
            className="color-picker__hex-input"
            value={getHexColor()}
            onChange={(e) => handleHexChange(e.target.value)}
            placeholder="#000000"
          />
        </div>

        {/* HSL Sliders */}
        <div className="color-picker__section">
          <div className="color-picker__section-label">HSL</div>
          <div className="slider__row">
            <label className="slider__label color-picker__label--h">H</label>
            <input
              type="range"
              className="slider slider__hue"
              min="0"
              max="360"
              value={hsl.h}
              onMouseDown={handleSliderMouseDown}
              onMouseUp={handleSliderMouseUp}
              onChange={(e) =>
                updateColorFromHSL({ ...hsl, h: parseInt(e.target.value) })
              }
            />
            <input
              type="number"
              className="slider__input"
              min="0"
              max="360"
              value={hsl.h}
              onChange={(e) =>
                updateColorFromHSL({ ...hsl, h: parseInt(e.target.value) || 0 })
              }
            />
          </div>
          <div className="slider__row">
            <label className="slider__label color-picker__label--s">S</label>
            <input
              type="range"
              className="slider color-picker__slider--sat"
              min="0"
              max="100"
              value={hsl.s}
              onMouseDown={handleSliderMouseDown}
              onMouseUp={handleSliderMouseUp}
              onChange={(e) =>
                updateColorFromHSL({ ...hsl, s: parseInt(e.target.value) })
              }
              style={{
                background: `linear-gradient(to right,
                  hsl(${hsl.h}, 0%, ${hsl.l}%),
                  hsl(${hsl.h}, 100%, ${hsl.l}%))`,
              }}
            />
            <input
              type="number"
              className="slider__input"
              min="0"
              max="100"
              value={hsl.s}
              onChange={(e) =>
                updateColorFromHSL({ ...hsl, s: parseInt(e.target.value) || 0 })
              }
            />
          </div>
          <div className="slider__row">
            <label className="slider__label color-picker__label--l">L</label>
            <input
              type="range"
              className="slider color-picker__slider--light"
              min="0"
              max="100"
              value={hsl.l}
              onMouseDown={handleSliderMouseDown}
              onMouseUp={handleSliderMouseUp}
              onChange={(e) =>
                updateColorFromHSL({ ...hsl, l: parseInt(e.target.value) })
              }
              style={{
                background: `linear-gradient(to right,
                  hsl(${hsl.h}, ${hsl.s}%, 0%),
                  hsl(${hsl.h}, ${hsl.s}%, 50%),
                  hsl(${hsl.h}, ${hsl.s}%, 100%))`,
              }}
            />
            <input
              type="number"
              className="slider__input"
              min="0"
              max="100"
              value={hsl.l}
              onChange={(e) =>
                updateColorFromHSL({ ...hsl, l: parseInt(e.target.value) || 0 })
              }
            />
          </div>
        </div>

        {/* RGB Sliders */}
        <div className="color-picker__section">
          <div className="color-picker__section-label">RGB</div>
          {(["r", "g", "b"] as const).map((channel) => (
            <div key={channel} className="slider__row">
              <label
                className={`slider__label color-picker__label--${channel}`}
              >
                {channel.toUpperCase()}
              </label>
              <input
                type="range"
                className={`slider color-picker__slider--${channel}`}
                min="0"
                max="255"
                value={localColor[channel]}
                onMouseDown={handleSliderMouseDown}
                onMouseUp={handleSliderMouseUp}
                onChange={(e) =>
                  updateColorFromRGB(channel, parseInt(e.target.value))
                }
              />
              <input
                type="number"
                className="slider__input"
                min="0"
                max="255"
                value={localColor[channel]}
                onChange={(e) =>
                  updateColorFromRGB(channel, parseInt(e.target.value) || 0)
                }
              />
            </div>
          ))}
        </div>

        {/* Alpha Slider */}
        <div className="color-picker__section">
          <div className="slider__row">
            <label className="slider__label color-picker__label--a">A</label>
            <input
              type="range"
              className="slider color-picker__slider--alpha"
              min="0"
              max="255"
              value={localColor.a}
              onMouseDown={handleSliderMouseDown}
              onMouseUp={handleSliderMouseUp}
              onChange={(e) =>
                updateColorFromRGB("a", parseInt(e.target.value))
              }
              style={{
                background: `linear-gradient(to right,
                  rgba(${localColor.r}, ${localColor.g}, ${localColor.b}, 0),
                  rgba(${localColor.r}, ${localColor.g}, ${localColor.b}, 1))`,
              }}
            />
            <input
              type="number"
              className="slider__input"
              min="0"
              max="255"
              value={localColor.a}
              onChange={(e) =>
                updateColorFromRGB("a", parseInt(e.target.value) || 0)
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
