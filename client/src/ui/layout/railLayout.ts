/**
 * railLayout — the rail-arrangement model, as pure data.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT A "LAYOUT" IS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The shell has three rails — `left`, `right` and `bottom` — named for the
 * regions they CARRY, not for where they sit. That distinction is the whole
 * point of this module: after the user moves things around, the rail still
 * called `left` (Objects + Layers) may well be the right-most column on
 * screen. The name is an identity; the placement is state.
 *
 * A layout is therefore two independent facts per rail:
 *
 *   - **placement** — which side, and in what order relative to the other
 *     side rail;
 *   - **scale** — one of four zoom steps, applied to the rail's contents as
 *     a CSS transform (not as a width; see `RAIL_SCALES`).
 *
 * ── The five slots ────────────────────────────────────────────────────────
 *
 * The two side rails live in an ordered track of four positions around the
 * canvas:
 *
 *      leftOuter │ leftInner │  CANVAS  │ rightInner │ rightOuter
 *
 * The canvas is always between them, whatever the rails do — it is the
 * flex-grow child and is never displaced. `SIDE_SLOTS` below is that track in
 * screen order, and every placement question reduces to an index into it.
 *
 * Stepping is CLAMPED, never wrapped (owner decision): a rail at `rightOuter`
 * that is asked to move right stays put and the button disables. Wrapping
 * would make the two arrows indistinguishable after a few clicks.
 *
 * ── Why both rails can share a side ───────────────────────────────────────
 *
 * The requested behaviour is explicit: click the left rail's right-arrow once
 * and it parks against the right rail's left edge — i.e. BOTH rails are now
 * on the right, and the canvas has the whole left half. `leftInner` /
 * `rightInner` are what make that expressible. A slot holds at most one rail:
 * `stepRail` swaps the occupant out of the way rather than stacking two rails
 * into one slot, which keeps every reachable arrangement legal by
 * construction.
 *
 * `ui/` boundary: this file is pure data and pure functions. No store, no
 * MobX, no DOM.
 */

/** The three rails, named for what they carry — never for where they sit. */
export type RailName = "left" | "right" | "bottom";

/** The two side rails, which are the only ones that can be re-ordered. */
export type SideRailName = "left" | "right";

/** A side rail's position in the horizontal track around the canvas. */
export type SideSlot = "leftOuter" | "leftInner" | "rightInner" | "rightOuter";

/** The horizontal track, in SCREEN order. Index arithmetic relies on this. */
export const SIDE_SLOTS: readonly SideSlot[] = [
  "leftOuter",
  "leftInner",
  "rightInner",
  "rightOuter",
] as const;

/** Which half of the shell a slot belongs to — what flexbox actually needs. */
export function slotSide(slot: SideSlot): "left" | "right" {
  return slot === "leftOuter" || slot === "leftInner" ? "left" : "right";
}

/** The bottom rail sits either below the canvas or above it. */
export type BottomEdge = "bottom" | "top";

/**
 * The four zoom steps, smallest to largest.
 *
 * ⚠️ A step SCALES THE RAIL'S CONTENTS — `transform: scale()` on the scroll
 * container, so every control, label and icon inside grows together. It is
 * deliberately not a width change: giving a rail more room only lets the same
 * small type reflow into the space, leaving it exactly as hard to read.
 * `AppShell.css` carries the transform and the footprint maths that keeps a
 * scaled rail inside its own column.
 *
 * `"regular"` is the identity transform, so every project that has never
 * touched the layout renders byte-identically to how it always has.
 */
export const RAIL_SCALES = ["compact", "regular", "large", "huge"] as const;
export type RailScale = (typeof RAIL_SCALES)[number];

/** One rail's complete arrangement. */
export interface RailLayout {
  left: { slot: SideSlot; scale: RailScale };
  right: { slot: SideSlot; scale: RailScale };
  bottom: { edge: BottomEdge; scale: RailScale };
}

/** The historical arrangement: rails where they have always been, unscaled. */
export const DEFAULT_RAIL_LAYOUT: RailLayout = {
  left: { slot: "leftOuter", scale: "regular" },
  right: { slot: "rightOuter", scale: "regular" },
  bottom: { edge: "bottom", scale: "regular" },
};

/**
 * The next slot in `direction` that would actually LOOK different, or `null`
 * at the end of the track.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ EMPTY SLOTS ARE SKIPPED, AND THAT IS THE WHOLE POINT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A naive one-index step is wrong, and it fails against the behaviour the
 * owner specified. Consider the default arrangement — the left rail at
 * `leftOuter`, nothing at `leftInner`:
 *
 *      [left]  CANVAS  [right]
 *
 * Stepping it one index lands it at `leftInner`. But `leftOuter` is now
 * empty, so the rail is STILL the left-most column and the screen is
 * pixel-identical. The user clicked an arrow and nothing happened.
 *
 * The requirement is explicit: *"click it once the left rail will now be up
 * against the right rail's left side"* — one click, and it has crossed the
 * canvas. So a step advances to the next slot that changes what is drawn,
 * which is the next slot that is either
 *
 *   - **occupied by the other rail** (stepping there swaps the two, visibly
 *     re-ordering them on that side), or
 *   - **on the other side of the canvas** (the rail crosses over).
 *
 * Everything else is a slot whose emptiness makes it indistinguishable from
 * the one the rail already holds.
 */
function nextVisibleSlot(
  layout: RailLayout,
  rail: SideRailName,
  direction: -1 | 1,
): SideSlot | null {
  const other: SideRailName = rail === "left" ? "right" : "left";
  const from = SIDE_SLOTS.indexOf(layout[rail].slot);
  const side = slotSide(layout[rail].slot);

  for (let i = from + direction; i >= 0 && i < SIDE_SLOTS.length; i += direction) {
    const candidate = SIDE_SLOTS[i];
    if (layout[other].slot === candidate) return candidate;
    if (slotSide(candidate) !== side) return candidate;
  }
  return null;
}

/**
 * Step a side rail toward `direction`, moving the OTHER rail out of the way
 * if it holds the target slot.
 *
 * Returns the layout unchanged when there is nowhere visibly different to go
 * — the caller does not have to pre-check, and `canStepRail` exists so the
 * button can disable rather than silently no-op.
 *
 * ⚠️ The displaced rail takes the MOVER'S OLD SLOT, not the next one along.
 * The two rails swap. Cascading a push would let a rail shove the other off
 * the end of the track, which has no legal representation.
 */
export function stepRail(
  layout: RailLayout,
  rail: SideRailName,
  direction: -1 | 1,
): RailLayout {
  const target = nextVisibleSlot(layout, rail, direction);
  if (target === null) return layout;

  const other: SideRailName = rail === "left" ? "right" : "left";
  const next: RailLayout = {
    ...layout,
    [rail]: { ...layout[rail], slot: target },
  };
  // The swap: whoever held the target slot inherits the mover's old one.
  if (layout[other].slot === target) {
    next[other] = { ...layout[other], slot: layout[rail].slot };
  }
  return next;
}

/** Whether `stepRail` would actually move — drives the arrow's disabled state. */
export function canStepRail(
  layout: RailLayout,
  rail: SideRailName,
  direction: -1 | 1,
): boolean {
  return nextVisibleSlot(layout, rail, direction) !== null;
}

/** Flip the bottom rail between the bottom and top edge of the shell. */
export function flipBottomEdge(layout: RailLayout): RailLayout {
  return {
    ...layout,
    bottom: {
      ...layout.bottom,
      edge: layout.bottom.edge === "bottom" ? "top" : "bottom",
    },
  };
}

/**
 * Step a rail's scale one notch. Clamped at both ends, like the slot track —
 * `canScaleRail` drives the disabled state.
 */
export function scaleRail(
  layout: RailLayout,
  rail: RailName,
  direction: -1 | 1,
): RailLayout {
  const to = RAIL_SCALES.indexOf(layout[rail].scale) + direction;
  if (to < 0 || to >= RAIL_SCALES.length) return layout;
  return {
    ...layout,
    [rail]: { ...layout[rail], scale: RAIL_SCALES[to] },
  };
}

export function canScaleRail(
  layout: RailLayout,
  rail: RailName,
  direction: -1 | 1,
): boolean {
  const to = RAIL_SCALES.indexOf(layout[rail].scale) + direction;
  return to >= 0 && to < RAIL_SCALES.length;
}

/**
 * The two side rails that sit on `side`, in inner-to-outer SCREEN order.
 *
 * `AppShell` renders the left half, the canvas, then the right half, so the
 * left half must be emitted outer→inner and the right half inner→outer. Both
 * come out of one sort by slot index, which is why `SIDE_SLOTS` is declared
 * in screen order.
 */
export function railsOnSide(
  layout: RailLayout,
  side: "left" | "right",
): SideRailName[] {
  return (["left", "right"] as const)
    .filter((rail) => slotSide(layout[rail].slot) === side)
    .sort(
      (a, b) =>
        SIDE_SLOTS.indexOf(layout[a].slot) - SIDE_SLOTS.indexOf(layout[b].slot),
    );
}
