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

/**
 * The four rails, named for what they CARRY — never for where they sit.
 *
 * ⚠️ `toolbar` is not like the other three, and the difference is why it has
 * its own type below rather than joining `SideRailName`. The three panel
 * rails live in `app__main` and take space away from the canvas. The toolbar
 * lives INSIDE the canvas area and docks to one of its four edges — it is a
 * frame around the workspace, not a column beside it. It therefore has no
 * slot and no ordering relative to the panel rails; it only has an edge.
 */
export type RailName = "left" | "right" | "bottom" | "toolbar";

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
 * Which edge of the canvas area the toolbar is locked to.
 *
 * All four are reachable, which is why its overlay shows four arrows rather
 * than the side rails' two: there is no "order" to step through, so each
 * arrow simply picks an edge directly.
 *
 * ⚠️ `left` / `right` turn the toolbar into a VERTICAL column, which changes
 * its own layout (`Toolbar.css`), not just its position. A control bar that
 * merely rotated would have unreadable labels.
 */
export type ToolbarEdge = "top" | "bottom" | "left" | "right";

/**
 * How many rows (docked horizontally) or columns (docked vertically) the
 * toolbar may spread its controls across.
 *
 * ⚠️ This is a MAXIMUM, not a fixed count. The toolbar wraps into as many
 * lines as its controls actually need, up to this number — asking for 3 with
 * few enough tools to fit on 1 leaves it on 1 rather than padding out empty
 * space.
 *
 * It exists because a single line is a hard constraint on an iPad: the tools
 * regularly exceed the width and the overflow has to be scrolled to. Spending
 * a second row buys back that reach at the cost of canvas height, and which
 * trade is right depends on the device — which is why it is a per-device
 * layout setting rather than a constant.
 */
export const TOOLBAR_SPREADS = [1, 2, 3] as const;
export type ToolbarSpread = (typeof TOOLBAR_SPREADS)[number];

export const TOOLBAR_EDGES: readonly ToolbarEdge[] = [
  "top",
  "bottom",
  "left",
  "right",
] as const;

/** Whether an edge makes the toolbar a vertical column. */
export function isToolbarVertical(edge: ToolbarEdge): boolean {
  return edge === "left" || edge === "right";
}

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

/* ══════════════════════════════════════════════════════════════════════════
   OTHER HAND MODE (2026-08-28)
   ══════════════════════════════════════════════════════════════════════════

   On an iPad the drawing hand holds the Pencil and the OTHER hand holds the
   device — with a thumb free along the rail's edge. Other Hand Mode turns one
   rail section (the current tool's options, the colour picker, the light
   settings) into a handful of large vertical thumb sliders and buttons that
   the user positions wherever that thumb comfortably reaches.

   The ARRANGEMENT is layout state and is persisted with the rest of the rail
   layout, per device class, for the same reason the rail placement is: it is
   a property of how this kind of device is held, not of the project. Whether
   the mode is currently ON is session state on the store, like `layoutMode`.

   Positions are PERCENTAGES of the section's stage (the rail's free area),
   keyed by section and then by widget. A percentage survives the rail being
   rescaled, the iPad being rotated, and the rail being moved to the other
   side — a pixel offset would survive none of those. */

/** One widget's top-left corner, as percentages of the stage's size. */
export interface OtherHandPosition {
  x: number;
  y: number;
}

/** Which channel set the colour section's sliders show. */
export const OTHER_HAND_COLOR_MODELS = ["hsl", "rgb"] as const;
export type OtherHandColorModel = (typeof OTHER_HAND_COLOR_MODELS)[number];

/** One section's arrangement. Every field is absent until the user sets it. */
export interface OtherHandSectionLayout {
  positions: { [widgetId: string]: OtherHandPosition };
  /** Colour sections only: HSL (the default) or RGB sliders. */
  colorModel?: OtherHandColorModel;
  /** Colour sections only: whether the alpha slider is in the set. */
  includeAlpha?: boolean;
}

/** Every section the user has arranged, by section key. */
export type OtherHandLayout = { [sectionKey: string]: OtherHandSectionLayout };

/** One rail's complete arrangement. */
export interface RailLayout {
  left: { slot: SideSlot; scale: RailScale };
  right: { slot: SideSlot; scale: RailScale };
  bottom: { edge: BottomEdge; scale: RailScale };
  /**
   * The canvas toolbar. Docks to an edge of the workspace; has no slot.
   *
   * ⚠️ `scale` is DEAD but retained. The toolbar does not resize (owner,
   * 2026-08-28) and nothing reads this, but dropping it from the type would
   * drop it from the persisted record and stop a layout written before that
   * date round-tripping unchanged.
   */
  toolbar: { edge: ToolbarEdge; scale: RailScale; spread: ToolbarSpread };
  /**
   * Other Hand Mode arrangements (see the block above). `{}` — the default —
   * is "nothing arranged", and is NOT written to the persisted record, so a
   * layout saved before the feature existed round-trips byte-identically.
   */
  otherHand: OtherHandLayout;
}

/** The historical arrangement: rails where they have always been, unscaled. */
export const DEFAULT_RAIL_LAYOUT: RailLayout = {
  left: { slot: "leftOuter", scale: "regular" },
  right: { slot: "rightOuter", scale: "regular" },
  bottom: { edge: "bottom", scale: "regular" },
  // `top` is where the toolbar has always been, on a single line.
  toolbar: { edge: "top", scale: "regular", spread: 1 },
  otherHand: {},
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

  for (
    let i = from + direction;
    i >= 0 && i < SIDE_SLOTS.length;
    i += direction
  ) {
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

/** Lock the toolbar to one of the four edges of the workspace. */
export function setToolbarEdge(
  layout: RailLayout,
  edge: ToolbarEdge,
): RailLayout {
  if (layout.toolbar.edge === edge) return layout;
  return { ...layout, toolbar: { ...layout.toolbar, edge } };
}

/**
 * Step the toolbar's spread by one line, clamped at both ends.
 *
 * Clamped rather than wrapping, like every other stepper here: a control that
 * silently jumps from 3 back to 1 reads as a glitch.
 */
export function stepToolbarSpread(
  layout: RailLayout,
  direction: -1 | 1,
): RailLayout {
  const to = TOOLBAR_SPREADS.indexOf(layout.toolbar.spread) + direction;
  if (to < 0 || to >= TOOLBAR_SPREADS.length) return layout;
  return {
    ...layout,
    toolbar: { ...layout.toolbar, spread: TOOLBAR_SPREADS[to] },
  };
}

export function canStepToolbarSpread(
  layout: RailLayout,
  direction: -1 | 1,
): boolean {
  const to = TOOLBAR_SPREADS.indexOf(layout.toolbar.spread) + direction;
  return to >= 0 && to < TOOLBAR_SPREADS.length;
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

/* ── Other Hand Mode ──────────────────────────────────────────────────────── */

const clampPercent = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;

/** Whether a persisted value is a usable position. Anything else is dropped. */
export function isOtherHandPosition(
  value: unknown,
): value is OtherHandPosition {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as OtherHandPosition).x === "number" &&
    typeof (value as OtherHandPosition).y === "number"
  );
}

export function isOtherHandColorModel(
  value: unknown,
): value is OtherHandColorModel {
  return (OTHER_HAND_COLOR_MODELS as readonly unknown[]).includes(value);
}

function otherHandSection(
  layout: RailLayout,
  sectionKey: string,
): OtherHandSectionLayout {
  return layout.otherHand[sectionKey] ?? { positions: {} };
}

function withOtherHandSection(
  layout: RailLayout,
  sectionKey: string,
  section: OtherHandSectionLayout,
): RailLayout {
  return {
    ...layout,
    otherHand: { ...layout.otherHand, [sectionKey]: section },
  };
}

/**
 * Place one widget. The position is clamped to the stage, so a drag that
 * ends off the rail leaves the widget at the edge rather than lost.
 */
export function setOtherHandWidgetPosition(
  layout: RailLayout,
  sectionKey: string,
  widgetId: string,
  position: OtherHandPosition,
): RailLayout {
  const section = otherHandSection(layout, sectionKey);
  return withOtherHandSection(layout, sectionKey, {
    ...section,
    positions: {
      ...section.positions,
      [widgetId]: { x: clampPercent(position.x), y: clampPercent(position.y) },
    },
  });
}

export function setOtherHandColorModel(
  layout: RailLayout,
  sectionKey: string,
  colorModel: OtherHandColorModel,
): RailLayout {
  const section = otherHandSection(layout, sectionKey);
  if (section.colorModel === colorModel) return layout;
  return withOtherHandSection(layout, sectionKey, { ...section, colorModel });
}

export function setOtherHandIncludeAlpha(
  layout: RailLayout,
  sectionKey: string,
  includeAlpha: boolean,
): RailLayout {
  const section = otherHandSection(layout, sectionKey);
  if (section.includeAlpha === includeAlpha) return layout;
  return withOtherHandSection(layout, sectionKey, { ...section, includeAlpha });
}

/**
 * Forget one section's positions — every widget returns to the default grid.
 * The colour model and alpha choice are preferences, not positions, and are
 * kept.
 */
export function resetOtherHandPositions(
  layout: RailLayout,
  sectionKey: string,
): RailLayout {
  if (!layout.otherHand[sectionKey]) return layout;
  const section = otherHandSection(layout, sectionKey);
  return withOtherHandSection(layout, sectionKey, {
    ...section,
    positions: {},
  });
}
