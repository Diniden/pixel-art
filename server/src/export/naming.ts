/**
 * Project-name casing helpers for the exporter.
 *
 * Moved VERBATIM from `src/routes/export.ts:23-41` (REFRESH task 11). These two
 * functions decide the on-disk export folder name and the generated class name,
 * so any change to them changes the published export layout. Do not "improve"
 * them — `server/exports/lib/` is consumed by external game code
 * (OPEN-QUESTIONS.md Q33).
 */

/** Convert a project name to kebab-case for the export folder. */
export function toKebabCase(name: string): string {
  return name
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1-$2") // camelCase boundaries
    .replace(/[^a-zA-Z0-9]+/g, "-") // non-alphanum to hyphens
    .replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
    .toLowerCase();
}

/** Convert a project name to PascalCase for the class name. */
export function toPascalCase(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}
