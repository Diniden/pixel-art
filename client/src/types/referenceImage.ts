/**
 * `ReferenceImageData` — the extracted-pixels payload of the reference-image
 * feature (REFRESH task 29).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS TYPE LIVES IN `types/` AND NOT IN THE MODAL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * It was declared inside `components/ReferenceImageModal/ReferenceImageModal.tsx`
 * and imported as a type by EIGHT other files — `App.tsx`, `Toolbar.tsx`,
 * `PixelStudioTools.tsx`, `Canvas.tsx`, `CanvasInfo.tsx`,
 * `ReferenceImagePanel.tsx`, `CanvasInfoContainer.tsx` and
 * `PixelStudioToolsContainer.tsx`. (⚠️ SPEC CORRECTION: the task spec says
 * "six files import it as a type"; the measured count is eight — the two
 * containers created by tasks 27/32 are not in the spec's table.)
 *
 * Every one of those imports made a leaf modal a dependency of the module
 * that imported it, including the application root. Moving the declaration
 * here inverts nothing and costs nothing: the type is a plain data shape with
 * no behaviour and no store dependency.
 *
 * ── NOT a persisted type ──────────────────────────────────────────────────
 *
 * This is the DECODED, in-memory form: a `height`-by-`width` array of RGBA
 * records. It is never serialized. What reaches the project file is
 * `Project.referenceImage` — a base64 PNG plus the selection box — and the
 * conversion between the two is `extractPixelsFromSelection` in
 * `utils/referenceImage.ts`.
 */

/**
 * One extracted pixel, or the `0` sentinel meaning "fully transparent".
 *
 * ⚠️ The `0` is a SENTINEL, not a colour. `extractPixelsFromSelection` writes
 * it for every source pixel whose alpha is 0, so consumers can (and do) use a
 * plain truthiness check to skip transparent cells.
 */
export type ReferencePixel = { r: number; g: number; b: number; a: number } | 0;

export interface ReferenceImageData {
  pixels: Array<Array<ReferencePixel>>;
  width: number;
  height: number;
}
