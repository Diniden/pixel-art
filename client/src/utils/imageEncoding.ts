/**
 * Base64 ↔ `HTMLImageElement` conversion (REFRESH task 29).
 *
 * Both functions were module-level exports of
 * `components/ReferenceImageModal/ReferenceImageModal.tsx`, moved here
 * VERBATIM. Neither reads or writes any state — they take their input as an
 * argument and resolve a value — so neither had any business living inside a
 * modal, and neither had an importer outside that file.
 *
 * ⚠️ These deal in LIVE DOM NODES. An `HTMLImageElement` cannot be cloned into
 * a MobX observable, serialized, or entered into undo history; the store holds
 * it as `observable.ref` and nothing else. `encodeImageToBase64` is the ONLY
 * bridge from that live node to something persistable.
 */

/**
 * Rasterize an image element to a base64 PNG data URL.
 *
 * Rejects when a 2D context cannot be obtained, and when `toDataURL` throws —
 * which it does for a canvas tainted by a cross-origin image. Both paths are
 * genuinely reachable, so both are preserved exactly as they were.
 */
export function encodeImageToBase64(image: HTMLImageElement): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Could not get canvas context"));
      return;
    }
    ctx.drawImage(image, 0, 0);
    try {
      const base64 = canvas.toDataURL("image/png");
      resolve(base64);
    } catch (error) {
      reject(error);
    }
  });
}

/** Decode a base64 data URL into a loaded `HTMLImageElement`. */
export function decodeBase64ToImage(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (error) => reject(error);
    img.src = base64;
  });
}
