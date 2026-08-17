/**
 * Shared request-validation helpers.
 *
 * `isValidProjectName` was moved here VERBATIM from `src/routes/project.ts`
 * (REFRESH task 11) so that the export route can share the same rule. Before
 * this move `POST /api/project/export` accepted `req.query.name` unvalidated
 * and fed it straight to `toKebabCase()` → `join(exportBase, kebabName)`.
 *
 * Do not relax this predicate without checking every call site: it is the only
 * guard between a user-supplied string and a filesystem path join.
 */

// Validate project name (no special characters, reasonable length)
export function isValidProjectName(name: string): boolean {
  if (!name || typeof name !== "string") return false;
  if (name.length === 0 || name.length > 100) return false;
  // Allow alphanumeric, spaces, hyphens, underscores
  if (!/^[a-zA-Z0-9\s\-_]+$/.test(name)) return false;
  // Don't allow names that could conflict with system files
  if (name === "config" || name.startsWith(".")) return false;
  return true;
}
