import { useState, useEffect, useCallback, useRef } from 'react';
import { useEditorStore } from '../../store';
import { Color } from '../../types';
import { NormalPicker } from './NormalPicker';
import './LightControl.css';

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
// prevHsl is optional and used to preserve H and S when L is 0 or 100
function rgbToHsl(r: number, g: number, b: number, prevHsl?: { h: number; s: number; l: number }): { h: number; s: number; l: number } {
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

  const lPercent = Math.round(l * 100);

  // Preserve H and S when L is 0 or 100 (pure black or white)
  // Use previous values if available, otherwise use calculated values
  if ((lPercent === 0 || lPercent === 100) && prevHsl) {
    return {
      h: prevHsl.h,
      s: prevHsl.s,
      l: lPercent
    };
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: lPercent
  };
}

interface ColorSliderProps {
  label: string;
  color: Color;
  onChange: (color: Color) => void;
}

function ColorSlider({ label, color, onChange }: ColorSliderProps) {
  const [hsl, setHsl] = useState({ h: 0, s: 0, l: 0 });
  // Store last known H and S values to preserve them when L is 0 or 100
  const lastValidHsRef = useRef<{ h: number; s: number } | null>(null);

  useEffect(() => {
    // Use last valid H/S as fallback when converting from RGB
    const prevHsl = lastValidHsRef.current ?
                    { ...lastValidHsRef.current, l: 0 } :
                    hsl;
    const newHsl = rgbToHsl(color.r, color.g, color.b, prevHsl);
    setHsl(newHsl);
    // Update last valid H and S if L is not 0 or 100
    if (newHsl.l > 0 && newHsl.l < 100) {
      lastValidHsRef.current = { h: newHsl.h, s: newHsl.s };
    }
  }, [color]);

  const updateColor = useCallback((newHsl: { h: number; s: number; l: number }) => {
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
    onChange({ ...rgb, a: 255 });
  }, [onChange, hsl]);

  const getColorPreview = () => {
    return `rgb(${color.r}, ${color.g}, ${color.b})`;
  };

  return (
    <div className="color-slider-section">
      <div className="color-slider-header">
        <span className="color-slider-label">{label}</span>
        <div
          className="color-slider-preview"
          style={{ backgroundColor: getColorPreview() }}
        />
      </div>

      <div className="color-slider-row">
        <label className="slider-label">H</label>
        <input
          type="range"
          className="compact-slider hue-slider"
          min="0"
          max="360"
          value={hsl.h}
          onChange={(e) => updateColor({ ...hsl, h: parseInt(e.target.value) })}
        />
        <input
          type="number"
          className="slider-input"
          min="0"
          max="360"
          value={hsl.h}
          onChange={(e) => updateColor({ ...hsl, h: parseInt(e.target.value) || 0 })}
        />
      </div>

      <div className="color-slider-row">
        <label className="slider-label">S</label>
        <input
          type="range"
          className="compact-slider"
          min="0"
          max="100"
          value={hsl.s}
          onChange={(e) => updateColor({ ...hsl, s: parseInt(e.target.value) })}
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
          onChange={(e) => updateColor({ ...hsl, s: parseInt(e.target.value) || 0 })}
        />
      </div>

      <div className="color-slider-row">
        <label className="slider-label">L</label>
        <input
          type="range"
          className="compact-slider"
          min="0"
          max="100"
          value={hsl.l}
          onChange={(e) => updateColor({ ...hsl, l: parseInt(e.target.value) })}
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
          onChange={(e) => updateColor({ ...hsl, l: parseInt(e.target.value) || 0 })}
        />
      </div>
    </div>
  );
}

export function LightControl() {
  const { project, setLightColor, setAmbientColor, setHeightScale } = useEditorStore();

  if (!project) return null;

  const { lightColor, ambientColor, heightScale } = project.uiState;

  return (
    <div className="light-control">
      <div className="light-control-section">
        <NormalPicker isLightDirection={true} />
      </div>

      <div className="light-control-section">
        <ColorSlider
          label="Light Color"
          color={lightColor}
          onChange={setLightColor}
        />
      </div>

      <div className="light-control-section">
        <ColorSlider
          label="Ambient Color"
          color={ambientColor}
          onChange={setAmbientColor}
        />
      </div>

      <div className="light-control-section">
        <div className="color-slider-section">
          <div className="color-slider-header">
            <span className="color-slider-label">Shadow Height Scale</span>
          </div>
          <div className="color-slider-row">
            <label className="slider-label">Scale</label>
            <input
              type="range"
              className="compact-slider"
              min="1"
              max="500"
              value={heightScale}
              onChange={(e) => setHeightScale(parseInt(e.target.value))}
            />
            <input
              type="number"
              className="slider-input"
              min="1"
              max="500"
              value={heightScale}
              onChange={(e) => setHeightScale(parseInt(e.target.value) || 100)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

