import { useState, useEffect, useRef, useCallback } from 'react';
import { useEditorStore } from '../../store';
import { Color } from '../../types';
import './ColorPicker.css';

// HSL to RGB conversion
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h = h / 360;
  s = s / 100;
  l = l / 100;

  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

// RGB to HSL conversion
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

export function ColorPicker() {
  const { project, setColor, colorHistory, colorAdjustment, adjustColor } = useEditorStore();

  const [localColor, setLocalColor] = useState<Color>({ r: 0, g: 0, b: 0, a: 255 });
  const [hsl, setHsl] = useState({ h: 0, s: 0, l: 0 });
  const [isDraggingSV, setIsDraggingSV] = useState(false);
  const [isDraggingHue, setIsDraggingHue] = useState(false);

  const svCanvasRef = useRef<HTMLCanvasElement>(null);
  const hueCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (project?.uiState.selectedColor) {
      const c = project.uiState.selectedColor;
      setLocalColor(c);
      setHsl(rgbToHsl(c.r, c.g, c.b));
    }
  }, [project?.uiState.selectedColor]);

  // Draw the saturation/value gradient
  const drawSVCanvas = useCallback(() => {
    const canvas = svCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Create the hue background
    const hueColor = hslToRgb(hsl.h, 100, 50);
    ctx.fillStyle = `rgb(${hueColor.r}, ${hueColor.g}, ${hueColor.b})`;
    ctx.fillRect(0, 0, width, height);

    // White gradient from left
    const whiteGradient = ctx.createLinearGradient(0, 0, width, 0);
    whiteGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    whiteGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = whiteGradient;
    ctx.fillRect(0, 0, width, height);

    // Black gradient from bottom
    const blackGradient = ctx.createLinearGradient(0, 0, 0, height);
    blackGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    blackGradient.addColorStop(1, 'rgba(0, 0, 0, 1)');
    ctx.fillStyle = blackGradient;
    ctx.fillRect(0, 0, width, height);
  }, [hsl.h]);

  // Draw the hue strip
  const drawHueCanvas = useCallback(() => {
    const canvas = hueCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
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

  if (!project) return null;

  // Use adjustColor when in color adjustment mode, otherwise use setColor
  const applyColor = (color: Color) => {
    if (colorAdjustment) {
      adjustColor(color);
    } else {
      setColor(color);
    }
  };

  const updateColorFromHSL = (newHsl: { h: number; s: number; l: number }) => {
    setHsl(newHsl);
    const rgb = hslToRgb(newHsl.h, newHsl.s, newHsl.l);
    const newColor = { ...rgb, a: localColor.a };
    setLocalColor(newColor);
    applyColor(newColor);
  };

  const updateColorFromRGB = (channel: keyof Color, value: number) => {
    const clamped = Math.max(0, Math.min(255, Math.floor(value)));
    const newColor = { ...localColor, [channel]: clamped };
    setLocalColor(newColor);
    applyColor(newColor);
    if (channel !== 'a') {
      setHsl(rgbToHsl(newColor.r, newColor.g, newColor.b));
    }
  };

  const handleSVCanvasInteraction = (e: React.MouseEvent<HTMLCanvasElement>) => {
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
    const l = (v / 100) * (1 - (s / 100) / 2);
    const sHSL = l === 0 || l === 1 ? 0 : ((v / 100) - l) / Math.min(l, 1 - l);

    updateColorFromHSL({ h: hsl.h, s: Math.round(sHSL * 100), l: Math.round(l * 100) });
  };

  const handleHueCanvasInteraction = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = hueCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newHue = Math.round(x * 360);

    updateColorFromHSL({ ...hsl, h: newHue });
  };

  const handleHexChange = (hex: string) => {
    const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i);
    if (match) {
      const r = parseInt(match[1], 16);
      const g = parseInt(match[2], 16);
      const b = parseInt(match[3], 16);
      const a = match[4] ? parseInt(match[4], 16) : 255;
      const newColor = { r, g, b, a };
      setLocalColor(newColor);
      applyColor(newColor);
      setHsl(rgbToHsl(r, g, b));
    }
  };

  const getHexColor = (): string => {
    const r = localColor.r.toString(16).padStart(2, '0');
    const g = localColor.g.toString(16).padStart(2, '0');
    const b = localColor.b.toString(16).padStart(2, '0');
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
      y: (1 - v) * 100
    };
  };

  const svPos = getSVPosition();

  const handleHistoryColorClick = (color: Color) => {
    setLocalColor(color);
    applyColor(color);
    setHsl(rgbToHsl(color.r, color.g, color.b));
  };

  return (
    <div className="panel color-picker">
      <div className="panel-header">Color</div>
      <div className="panel-content">
        {/* Color History */}
        {colorHistory.length > 0 && (
          <div className="color-history">
            {colorHistory.map((color, index) => (
              <button
                key={`${color.r}-${color.g}-${color.b}-${color.a}-${index}`}
                className="color-history-swatch"
                style={{
                  backgroundColor: `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`
                }}
                onClick={() => handleHistoryColorClick(color)}
                title={`#${color.r.toString(16).padStart(2, '0')}${color.g.toString(16).padStart(2, '0')}${color.b.toString(16).padStart(2, '0')}`}
              />
            ))}
          </div>
        )}

        {/* Rainbow picker area */}
        <div className="color-picker-area">
          <div className="sv-picker-container">
            <canvas
              ref={svCanvasRef}
              width={180}
              height={120}
              className="sv-canvas"
              onMouseDown={(e) => {
                setIsDraggingSV(true);
                handleSVCanvasInteraction(e);
              }}
              onMouseMove={(e) => isDraggingSV && handleSVCanvasInteraction(e)}
              onMouseUp={() => setIsDraggingSV(false)}
              onMouseLeave={() => setIsDraggingSV(false)}
            />
            <div
              className="sv-picker-handle"
              style={{ left: `${svPos.x}%`, top: `${svPos.y}%` }}
            />
          </div>

          <div className="hue-picker-container">
            <canvas
              ref={hueCanvasRef}
              width={180}
              height={12}
              className="hue-canvas"
              onMouseDown={(e) => {
                setIsDraggingHue(true);
                handleHueCanvasInteraction(e);
              }}
              onMouseMove={(e) => isDraggingHue && handleHueCanvasInteraction(e)}
              onMouseUp={() => setIsDraggingHue(false)}
              onMouseLeave={() => setIsDraggingHue(false)}
            />
            <div
              className="hue-picker-handle"
              style={{ left: `${(hsl.h / 360) * 100}%` }}
            />
          </div>
        </div>

        {/* Color preview and hex */}
        <div className="color-preview-row">
          <div
            className="color-preview"
            style={{ backgroundColor: getDisplayColor() }}
          >
            <div className="transparency-grid"></div>
          </div>
          <input
            type="text"
            className="hex-input"
            value={getHexColor()}
            onChange={(e) => handleHexChange(e.target.value)}
            placeholder="#000000"
          />
        </div>

        {/* HSL Sliders */}
        <div className="slider-section">
          <div className="slider-section-label">HSL</div>
          <div className="slider-row">
            <label className="slider-label hsl-h">H</label>
            <input
              type="range"
              className="compact-slider hue-slider"
              min="0"
              max="360"
              value={hsl.h}
              onChange={(e) => updateColorFromHSL({ ...hsl, h: parseInt(e.target.value) })}
            />
            <input
              type="number"
              className="slider-input"
              min="0"
              max="360"
              value={hsl.h}
              onChange={(e) => updateColorFromHSL({ ...hsl, h: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div className="slider-row">
            <label className="slider-label hsl-s">S</label>
            <input
              type="range"
              className="compact-slider sat-slider"
              min="0"
              max="100"
              value={hsl.s}
              onChange={(e) => updateColorFromHSL({ ...hsl, s: parseInt(e.target.value) })}
              style={{
                background: `linear-gradient(to right,
                  hsl(${hsl.h}, 0%, ${hsl.l}%),
                  hsl(${hsl.h}, 100%, ${hsl.l}%))`
              }}
            />
            <input
              type="number"
              className="slider-input"
              min="0"
              max="100"
              value={hsl.s}
              onChange={(e) => updateColorFromHSL({ ...hsl, s: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div className="slider-row">
            <label className="slider-label hsl-l">L</label>
            <input
              type="range"
              className="compact-slider light-slider"
              min="0"
              max="100"
              value={hsl.l}
              onChange={(e) => updateColorFromHSL({ ...hsl, l: parseInt(e.target.value) })}
              style={{
                background: `linear-gradient(to right,
                  hsl(${hsl.h}, ${hsl.s}%, 0%),
                  hsl(${hsl.h}, ${hsl.s}%, 50%),
                  hsl(${hsl.h}, ${hsl.s}%, 100%))`
              }}
            />
            <input
              type="number"
              className="slider-input"
              min="0"
              max="100"
              value={hsl.l}
              onChange={(e) => updateColorFromHSL({ ...hsl, l: parseInt(e.target.value) || 0 })}
            />
          </div>
        </div>

        {/* RGB Sliders */}
        <div className="slider-section">
          <div className="slider-section-label">RGB</div>
          {(['r', 'g', 'b'] as const).map((channel) => (
            <div key={channel} className="slider-row">
              <label className={`slider-label channel-${channel}`}>
                {channel.toUpperCase()}
              </label>
              <input
                type="range"
                className={`compact-slider channel-slider channel-${channel}`}
                min="0"
                max="255"
                value={localColor[channel]}
                onChange={(e) => updateColorFromRGB(channel, parseInt(e.target.value))}
              />
              <input
                type="number"
                className="slider-input"
                min="0"
                max="255"
                value={localColor[channel]}
                onChange={(e) => updateColorFromRGB(channel, parseInt(e.target.value) || 0)}
              />
            </div>
          ))}
        </div>

        {/* Alpha Slider */}
        <div className="slider-section">
          <div className="slider-row">
            <label className="slider-label channel-a">A</label>
            <input
              type="range"
              className="compact-slider alpha-slider"
              min="0"
              max="255"
              value={localColor.a}
              onChange={(e) => updateColorFromRGB('a', parseInt(e.target.value))}
              style={{
                background: `linear-gradient(to right,
                  rgba(${localColor.r}, ${localColor.g}, ${localColor.b}, 0),
                  rgba(${localColor.r}, ${localColor.g}, ${localColor.b}, 1))`
              }}
            />
            <input
              type="number"
              className="slider-input"
              min="0"
              max="255"
              value={localColor.a}
              onChange={(e) => updateColorFromRGB('a', parseInt(e.target.value) || 0)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
