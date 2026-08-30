/**
 * otherHandSections — the section keys Other Hand Mode knows.
 *
 * A plain module (no components) so the section containers and the panel
 * containers that enter the mode can share the keys without tripping the
 * fast-refresh rule.
 */
/** The section keys `LayoutUIStore.enterOtherHand` accepts. */
export const OTHER_HAND_SECTIONS = {
  tool: "tool",
  color: "color",
  light: "light",
} as const;
