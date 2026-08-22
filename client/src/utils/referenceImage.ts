/**
 * Reference-image geometry — the PURE half of the reference-image feature
 * (REFRESH task 29).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT MOVED HERE, AND WHAT DELIBERATELY DID NOT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `components/ReferenceImageModal/ReferenceImageModal.tsx` exported seven
 * module-level functions. Three of them — `shiftReferenceSelection`,
 * `shiftReferenceSelectionBySize` and `adjustReferenceBoxSize` — READ AND WROTE
 * a module-level mutable singleton (`persistentState`) and additionally called
 * into the Zustand store, so they could not move verbatim.
 *
 * They are split instead, and this file takes the half that is genuinely pure:
 * the GEOMETRY. Each function below takes the current selection plus the image
 * BOUNDS as arguments and returns a new `SelectionBox` (or `null` when the move
 * is refused). No state is read, none is written, and nothing is saved.
 *
 * The stateful half — reading the current selection, writing the new one, and
 * persisting to the project — lives in `ReferenceUIStore`, which calls these.
 * That split is what makes the geometry testable: the four functions below are
 * unit-tested directly, which was impossible while they mutated a singleton
 * shared across every test in the process.
 *
 * `extractPixelsFromSelection` moved VERBATIM — it was already pure.
 */
import type {
  ReferenceImageData,
  ReferencePixel,
} from "../types/referenceImage";

/**
 * The modal's selection rectangle: two CORNERS, in image pixel coordinates.
 *
 * ⚠️ DELIBERATELY NOT `types/domain.ts`'s `SelectionBox`, which is an
 * `{x, y, width, height}` shape used for the pixel-selection mask. This one is
 * `{startX, startY, endX, endY}` and is NOT normalised: `start` may be below or
 * to the right of `end`, because it records where a drag began and ended. Every
 * consumer therefore min/maxes the pair before using it, and
 * `adjustReferenceBoxSize` reads the corner ORDER back out to decide which
 * corner to grow. Normalising it would be a behaviour change, so it is not
 * normalised. The two types share a name and nothing else; this one is local to
 * the reference-image feature and is exported from here.
 */
export interface ReferenceSelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

/** An image's pixel dimensions — the only thing the geometry needs from it. */
export interface ImageBounds {
  width: number;
  height: number;
}

/**
 * Read a (possibly inverted) selection box as a normalised rect.
 * Extracted because all four functions below started with these four lines.
 */
function normalize(selection: ReferenceSelectionBox) {
  const minX = Math.min(selection.startX, selection.endX);
  const minY = Math.min(selection.startY, selection.endY);
  const maxX = Math.max(selection.startX, selection.endX);
  const maxY = Math.max(selection.startY, selection.endY);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Extract the selected region's pixels as an RGBA grid. Moved VERBATIM from
 * `ReferenceImageModal.tsx:41` — it was already pure and already exported.
 *
 * Returns `null` for a missing image, a missing selection, or a zero-area
 * selection. Fully-transparent pixels become the `0` sentinel rather than an
 * RGBA record; see `ReferencePixel`.
 */
export function extractPixelsFromSelection(
  image: HTMLImageElement | null,
  selection: ReferenceSelectionBox | null,
): ReferenceImageData | null {
  if (!image || !selection) return null;

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = image.width;
  tempCanvas.height = image.height;
  const ctx = tempCanvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(image, 0, 0);

  const x = Math.min(selection.startX, selection.endX);
  const y = Math.min(selection.startY, selection.endY);
  const w = Math.abs(selection.endX - selection.startX);
  const h = Math.abs(selection.endY - selection.startY);

  if (w === 0 || h === 0) return null;

  const imageData = ctx.getImageData(x, y, w, h);
  const pixels: ReferenceImageData["pixels"] = [];

  for (let py = 0; py < h; py++) {
    const row: Array<ReferencePixel> = [];
    for (let px = 0; px < w; px++) {
      const idx = (py * w + px) * 4;
      const r = imageData.data[idx];
      const g = imageData.data[idx + 1];
      const b = imageData.data[idx + 2];
      const a = imageData.data[idx + 3];
      row.push(a > 0 ? { r, g, b, a } : 0);
    }
    pixels.push(row);
  }

  return { pixels, width: w, height: h };
}

/**
 * Translate the selection by `(dx, dy)`, CLAMPED to the image bounds.
 *
 * The geometry half of `ReferenceImageModal.tsx:79`. Note the clamp semantics,
 * preserved exactly: the box slides as far as it can and STOPS at the edge —
 * it is never refused and never resized. The returned box is always
 * top-left-normalised, exactly as the original built it, which means a nudge
 * silently normalises a previously-inverted selection. That is existing
 * behaviour and is preserved.
 */
export function shiftedSelection(
  selection: ReferenceSelectionBox,
  bounds: ImageBounds,
  dx: number,
  dy: number,
): ReferenceSelectionBox {
  const { minX, minY, width, height } = normalize(selection);

  let newMinX = minX + dx;
  let newMinY = minY + dy;

  newMinX = Math.max(0, Math.min(newMinX, bounds.width - width));
  newMinY = Math.max(0, Math.min(newMinY, bounds.height - height));

  return {
    startX: newMinX,
    startY: newMinY,
    endX: newMinX + width,
    endY: newMinY + height,
  };
}

/**
 * Translate by WHOLE MULTIPLES of the current reference size — the "next
 * sprite over" jump — or refuse entirely.
 *
 * The geometry half of `ReferenceImageModal.tsx:117`. ⚠️ Its refusal semantics
 * differ from `shiftedSelection`'s clamp and that difference is the point: a
 * partial jump would land the box misaligned with the sprite grid, so when the
 * full step does not fit, the move is REFUSED (`null`) rather than clamped.
 * Preserved exactly, including that the check uses the ORIGINAL box's corners.
 */
export function sizeSteppedSelection(
  selection: ReferenceSelectionBox,
  bounds: ImageBounds,
  dx: number,
  dy: number,
  currentRefWidth: number,
  currentRefHeight: number,
): ReferenceSelectionBox | null {
  const { minX, minY, width, height } = normalize(selection);

  const shiftX = dx * currentRefWidth;
  const shiftY = dy * currentRefHeight;

  const newMinX = minX + shiftX;
  const newMinY = minY + shiftY;
  const newMaxX = newMinX + width;
  const newMaxY = newMinY + height;

  const canMoveX = newMinX >= 0 && newMaxX <= bounds.width;
  const canMoveY = newMinY >= 0 && newMaxY <= bounds.height;

  if (!canMoveX || !canMoveY) {
    return null;
  }

  return shiftedSelection(selection, bounds, shiftX, shiftY);
}

/**
 * Grow or shrink the selection by 1px on ONE edge.
 *
 * The geometry half of `ReferenceImageModal.tsx:150`, preserved verbatim
 * including two quirks that are behaviour, not accidents:
 *
 *  1. ⚠️ `maxY` is computed as `Math.max(selection.endY, selection.startY)` in
 *     the original — arguments in the opposite order to the other three lines.
 *     `Math.max` is commutative so this is harmless, and it is preserved here
 *     via the shared `normalize()` helper, which computes the same value.
 *  2. The result is refused (`null`) when it would leave the box thinner than
 *     1px in either axis, so a shrink cannot collapse the selection.
 *
 * The returned corners honour the ORIGINAL box's corner order: a selection
 * dragged bottom-right-to-top-left stays inverted rather than being silently
 * normalised. That is why `startIsTopLeft` exists and why it is preserved.
 */
export function resizedSelection(
  selection: ReferenceSelectionBox,
  bounds: ImageBounds,
  direction: "up" | "down" | "left" | "right",
  increase: boolean,
): ReferenceSelectionBox | null {
  const { minX, minY, maxX, maxY } = normalize(selection);

  const delta = increase ? 1 : -1;
  let newMinX = minX;
  let newMinY = minY;
  let newMaxX = maxX;
  let newMaxY = maxY;

  switch (direction) {
    case "up":
      newMinY = Math.max(0, minY - delta);
      break;
    case "down":
      newMaxY = Math.min(bounds.height, maxY + delta);
      break;
    case "left":
      newMinX = Math.max(0, minX - delta);
      break;
    case "right":
      newMaxX = Math.min(bounds.width, maxX + delta);
      break;
  }

  // Ensure minimum size of 1x1
  if (newMaxX - newMinX < 1 || newMaxY - newMinY < 1) return null;

  // Determine which corner is start/end based on original selection
  const startIsTopLeft =
    selection.startX <= selection.endX && selection.startY <= selection.endY;

  return {
    startX: startIsTopLeft ? newMinX : newMaxX,
    startY: startIsTopLeft ? newMinY : newMaxY,
    endX: startIsTopLeft ? newMaxX : newMinX,
    endY: startIsTopLeft ? newMaxY : newMinY,
  };
}
