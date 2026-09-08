/**
 * Brush-name validation (Brush Studio plan, task 13).
 *
 * The one rule both `BrushLibrary`'s inline create form and
 * `BrushSelectModal`'s create / rename forms apply before they call out.
 * The pattern is `ProjectSelectModal`'s, verbatim: brush files are stored
 * beside project files and are validated server-side by the same
 * `isValidProjectName` (MASTER D12), so the client-side gate must not be
 * looser than the project one.
 *
 * Pure: no imports.
 */

export const BRUSH_NAME_PATTERN = /^[a-zA-Z0-9\s\-_]+$/;

/**
 * Returns a user-facing error, or `null` when `raw` (trimmed) is usable.
 *
 * `existing` is the current brush list; `allowName` is a name that may
 * collide (the brush being renamed to itself is not a duplicate).
 */
export function validateBrushName(
  raw: string,
  existing: ReadonlyArray<string>,
  allowName: string | null = null,
): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "Brush name cannot be empty";
  if (!BRUSH_NAME_PATTERN.test(trimmed)) {
    return "Brush name can only contain letters, numbers, spaces, hyphens, and underscores";
  }
  if (trimmed !== allowName && existing.includes(trimmed)) {
    return "A brush with that name already exists";
  }
  return null;
}
