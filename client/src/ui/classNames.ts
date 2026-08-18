/**
 * classNames — the one string-joining helper for the `ui/` tier.
 *
 * Task 19 introduces this instead of a `Tabs` primitive: the widespread
 * `` `${base} ${cond ? "active" : ""}` `` idiom (measured across the legacy
 * components) is a string-composition problem, not a component. Falsy entries
 * are dropped, so conditional modifiers read as
 * `classNames("btn", danger && "btn--danger", className)`.
 *
 * Pure by construction: no imports, no state.
 */
export function classNames(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}

export default classNames;
