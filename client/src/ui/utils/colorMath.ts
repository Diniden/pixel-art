/**
 * colorMath — HSL ⇄ RGB conversion (REFRESH task 36, W27).
 *
 * Extracted VERBATIM from `ColorPicker.tsx`, where both functions were
 * module-private. The spec requires the extraction before `ColorPicker` is
 * purified so the maths is testable and reusable independently of the widget.
 *
 * ⚠️ Not simplified, not "corrected". `rgbToHsl`'s `prevHsl` parameter looks
 * redundant but is load-bearing: at L = 0 (pure black) and L = 100 (pure
 * white) the hue and saturation of an RGB triple are mathematically
 * undefined, and a naive conversion collapses them to 0. That would make the
 * picker's cursor jump to the top-left corner the moment a user dragged
 * lightness to either extreme, losing the hue they had selected. Passing the
 * previous HSL preserves H and S across that singularity.
 *
 * This file is pure computation with no React and no store, so it satisfies
 * the `ui/` purity boundary by construction.
 */

// HSL to RGB conversion
export function hslToRgb(
  h: number,
  s: number,
  l: number,
): { r: number; g: number; b: number } {
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
    b: Math.round(b * 255),
  };
}

// RGB to HSL conversion
// prevHsl is optional and used to preserve H and S when L is 0 or 100
export function rgbToHsl(
  r: number,
  g: number,
  b: number,
  prevHsl?: { h: number; s: number; l: number },
): { h: number; s: number; l: number } {
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
      l: lPercent,
    };
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: lPercent,
  };
}
