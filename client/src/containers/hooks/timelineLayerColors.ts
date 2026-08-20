/**
 * Layer-name → colour assignment for the timeline grid (REFRESH task 35).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THIS MODULE HOLDS MUTABLE MODULE-LEVEL STATE, DELIBERATELY
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `layerColorCache` is a process-wide `Map` that survives every re-render and
 * every project switch. That is what makes a layer named "Base" keep the same
 * hue while you work — recomputing per render would reshuffle the whole grid
 * whenever a layer was added.
 *
 * It lived at the top of `TimelineView.tsx` before this task. It cannot stay
 * there: `ui/` forbids module-level mutable state precisely because a story
 * that mounted the component would permanently seed a shared cache, and two
 * stories rendered in either order would then disagree. So the cache moved to
 * the container side, unchanged.
 *
 * Everything below — the HSL distance metric, the 0.15 conflict threshold, the
 * 200° hue start, the `namesToAssign.length * 3` step, the 360-attempt bail —
 * is copied verbatim from the pre-split file. None of it is obviously optimal
 * and none of it is this task's to tune; it is isolated here so it can be
 * replaced deliberately later, with a test, rather than incidentally during a
 * split.
 */

/** Module-level cache for layer name → color mapping. See the header. */
const layerColorCache = new Map<string, string>();

/** Convert HSL string to HSL values for comparison. */
function parseHsl(
  hslString: string,
): { h: number; s: number; l: number } | null {
  const match = hslString.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!match) return null;
  return {
    h: parseInt(match[1], 10),
    s: parseInt(match[2], 10),
    l: parseInt(match[3], 10),
  };
}

/**
 * Calculate color distance in HSL space.
 * Returns a value between 0 and 1, where 1 is maximum distance.
 */
function colorDistance(
  hsl1: { h: number; s: number; l: number },
  hsl2: { h: number; s: number; l: number },
): number {
  // Normalize hue to 0-1 (circular, so 359 and 1 are close)
  const hDiff =
    Math.min(Math.abs(hsl1.h - hsl2.h), 360 - Math.abs(hsl1.h - hsl2.h)) / 180;
  const sDiff = Math.abs(hsl1.s - hsl2.s) / 100;
  const lDiff = Math.abs(hsl1.l - hsl2.l) / 100;
  // Weighted distance (hue is most important for distinction)
  return Math.sqrt(hDiff * 0.5 + sDiff * 0.25 + lDiff * 0.25);
}

/** Check if a color conflicts with any cached colors. */
function colorConflicts(newColor: string, cachedColors: string[]): boolean {
  const newHsl = parseHsl(newColor);
  if (!newHsl) return false;

  for (const cachedColor of cachedColors) {
    const cachedHsl = parseHsl(cachedColor);
    if (!cachedHsl) continue;
    // If colors are too similar (distance < 0.15), they conflict
    if (colorDistance(newHsl, cachedHsl) < 0.15) {
      return true;
    }
  }
  return false;
}

/**
 * Generate unique colors for the given layer names.
 *
 * Takes NAMES rather than `Frame[]`: the caller already walks the frames to
 * build the grid, and passing the domain nodes in here would give this module
 * a reason to know about pixels.
 */
export function generateLayerColors(
  uniqueLayerNames: Iterable<string>,
): Map<string, string> {
  const colorMap = new Map<string, string>();

  // Get cached colors for existing layers
  const cachedColors: string[] = [];
  const namesToAssign: string[] = [];

  for (const name of uniqueLayerNames) {
    if (colorMap.has(name)) continue;
    const cached = layerColorCache.get(name);
    if (cached !== undefined) {
      colorMap.set(name, cached);
      cachedColors.push(cached);
    } else {
      namesToAssign.push(name);
    }
  }

  // Generate new colors for layers not in cache
  if (namesToAssign.length > 0) {
    let hueStart = 200; // Start from blue-ish
    // Use more steps to find non-conflicting colors
    const hueStep = 360 / Math.max(namesToAssign.length * 3, 1);

    for (const name of namesToAssign) {
      let attempts = 0;
      let color: string | null = null;

      // Try different hues until we find one that doesn't conflict, checking
      // against both cached colors and newly assigned colors.
      while (attempts < 360 && color === null) {
        const hue = (hueStart + attempts * hueStep) % 360;
        const candidateColor = `hsl(${Math.round(hue)}, 70%, 55%)`;

        if (!colorConflicts(candidateColor, cachedColors)) {
          color = candidateColor;
          break;
        }
        attempts++;
      }

      // If we couldn't find a non-conflicting color, use the first attempt
      // anyway (this should rarely happen with many layers).
      if (!color) {
        const hue = hueStart % 360;
        color = `hsl(${Math.round(hue)}, 70%, 55%)`;
      }

      layerColorCache.set(name, color);
      colorMap.set(name, color);
      // Add to cachedColors so subsequent new colors don't conflict with it
      cachedColors.push(color);

      hueStart = (hueStart + hueStep) % 360;
    }
  }

  return colorMap;
}
