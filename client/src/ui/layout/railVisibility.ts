/**
 * railVisibility — which rails the user has dismissed, as pure data.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  DISMISSAL AND FOCUS MODE ARE ONE MECHANISM (owner, 2026-08-30)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The app had a single `focusMode` boolean that hid two rails at once. It now
 * has three × buttons — one per rail — and the focus button became the way
 * back from any of them. The two features are not layered; they are the same
 * operation applied to different subsets, which is why this module models a
 * SET OF HIDDEN RAILS rather than a flag plus three overrides.
 *
 * That framing is what makes the asymmetry in the button legible:
 *
 *   - **engaged** (anything hidden) → show everything;
 *   - **not engaged** (nothing hidden) → hide `FOCUS_MODE_RAILS`.
 *
 * "Off" is one state; "on" is any non-empty subset. A plain toggle cannot
 * express that, and trying to keep a separate `focusMode` flag in sync with
 * three booleans is where the bugs would live.
 *
 * ⚠️ The names are IDENTITIES, not positions — `railLayout.ts` opens on this
 * point and it matters here too. Dismissing `left` hides the Objects &
 * Layers rail wherever the user has since moved it to, so a dismissal
 * survives every re-arrangement layout mode can produce.
 *
 * `ui/` boundary: pure data and pure functions. No store, no MobX, no DOM.
 */

/**
 * The rails a user can dismiss, and the only values the persisted list may
 * contain.
 *
 * ⚠️ NOT `RailName` — the toolbar is deliberately absent. It is the one rail
 * with no × button: it holds the tools the editor is operated with, and the
 * focus button that brings everything back lives ON it. A dismissable
 * toolbar could hide its own undo.
 */
export const DISMISSABLE_RAILS = ["left", "right", "bottom"] as const;
export type DismissableRail = (typeof DISMISSABLE_RAILS)[number];

export function isDismissableRail(value: unknown): value is DismissableRail {
  return (DISMISSABLE_RAILS as readonly unknown[]).includes(value);
}

/**
 * What the focus button hides when it is pressed from the un-engaged state.
 *
 * ⚠️ The two rails classic focus mode has ALWAYS hidden — the Objects &
 * Layers rail and the timeline — and not the third. The right rail carries
 * the tool options the user is drawing with; hiding it was never what focus
 * mode meant, and making the button hide everything would turn a familiar
 * control into a different one.
 *
 * It is also the set the legacy persisted `focusMode: true` expands into on
 * load, so an old project comes back looking exactly as it did.
 */
export const FOCUS_MODE_RAILS: readonly DismissableRail[] = [
  "left",
  "bottom",
] as const;

/**
 * Whether a hidden-rail set says anything the legacy `focusMode` boolean
 * cannot already express on its own.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ THIS PROTECTS THE OWNER'S REAL DATA — MEASURED, NOT THEORETICAL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `focusMode` can encode exactly two states: nothing hidden, and both
 * `FOCUS_MODE_RAILS` hidden. For those two the boolean is the whole truth and
 * `hiddenRails` must NOT be written — otherwise a project that has never used
 * per-rail dismissal gains a key on its next save.
 *
 * That is not hypothetical. `backup-02-08-2026.json::Base Unit-15-16-07.json`
 * in the owner's corpus carries `focusMode: true`; hydrating it produces a
 * non-empty hidden set, and a naive "emit when non-empty" test added
 * `hiddenRails` to that real snapshot. The corpus digest gate caught it.
 *
 * Everything else — the right rail hidden, or one classic rail without the
 * other — is genuinely new information and is written.
 */
export function needsHiddenRailsKey(
  hidden: ReadonlySet<DismissableRail>,
): boolean {
  if (hidden.size === 0) return false;
  const classicCount = FOCUS_MODE_RAILS.filter((r) => hidden.has(r)).length;
  // Exactly the classic pair and nothing else — `focusMode: true` says it.
  return !(
    classicCount === FOCUS_MODE_RAILS.length &&
    hidden.size === FOCUS_MODE_RAILS.length
  );
}

/** The persisted list, narrowed and de-duplicated. Unknown names are dropped. */
export function narrowHiddenRails(
  value: readonly string[] | undefined,
): DismissableRail[] {
  if (!value) return [];
  return DISMISSABLE_RAILS.filter((rail) => value.includes(rail));
}

/**
 * The set as a stable, sorted list for persistence.
 *
 * ⚠️ Sorted by `DISMISSABLE_RAILS` order rather than insertion order, so the
 * same two hidden rails always serialize to the same array. An
 * insertion-ordered list would make the saved bytes depend on which × the
 * user pressed first, and every digest-style comparison downstream would see
 * two identical states as different.
 */
export function serializeHiddenRails(
  hidden: ReadonlySet<DismissableRail>,
): DismissableRail[] {
  return DISMISSABLE_RAILS.filter((rail) => hidden.has(rail));
}
