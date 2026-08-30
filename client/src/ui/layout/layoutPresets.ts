/**
 * layoutPresets — the ready-made arrangements offered in layout mode.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY PRESETS EXIST AT ALL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `railLayout.ts` gives every arrangement a legal representation, and the
 * per-rail overlays let the user reach any of them — one stepped arrow at a
 * time. That is the right vocabulary for FINE adjustment and the wrong one
 * for "put this iPad into the grip I always use", which is four or five
 * separate steps across three different overlays. A preset is that sequence,
 * named, applied in one tap.
 *
 * ── ⚠️ A PRESET IS A COMPLETE `RailLayout`, NOT A PATCH ───────────────────
 *
 * Applying one replaces the whole arrangement, `otherHand` excepted (see
 * `applyPreset`). A patch would make the result depend on what the layout
 * happened to be beforehand, so the same card would produce a different
 * screen on two different days — which defeats the point of showing the user
 * a thumbnail of what they are about to get. The thumbnail is rendered FROM
 * this data, so "what the card shows" and "what applying it does" cannot
 * drift apart.
 *
 * ── The lists differ by device class, and that is the requirement ─────────
 *
 * A desktop has a mouse, a wide screen and no grip to speak of; an iPad is
 * held, and every useful arrangement on it is about which hand is free. The
 * two devices therefore do not want the same shortlist — an iPad has no use
 * for "both rails on the right so the mouse travels less", and a desktop has
 * no use for "everything under the left thumb". `PRESETS_BY_DEVICE` is that
 * split.
 *
 * ⚠️ `phone` shares the tablet list deliberately. The grips are the same
 * ones, just tighter; a separate shortlist would be three near-duplicate
 * entries maintained in parallel. If a phone-specific arrangement is ever
 * identified, give `phone` its own array here and nothing else changes.
 *
 * `ui/` boundary: pure data and pure functions over `railLayout`'s types. No
 * store, no MobX, no DOM.
 */
import {
  DEFAULT_RAIL_LAYOUT,
  SIDE_SLOTS,
  type RailLayout,
  type RailScale,
} from "./railLayout";
import type { DeviceClass } from "./deviceClass";

/**
 * One offered arrangement.
 *
 * `id` is stable and is what a saved custom preset is keyed by; `name` is
 * what the card shows and is the only field the user can author.
 */
export interface LayoutPreset {
  id: string;
  name: string;
  /** One line under the name — what this arrangement is FOR, not what it is. */
  description: string;
  layout: RailLayout;
  /**
   * `true` for a preset the user saved. Only these can be deleted, and only
   * these are persisted — the built-ins are code and are always present.
   */
  custom?: boolean;
}

/** A whole layout at one scale — the built-ins vary placement, not size. */
function at(scale: RailScale, layout: RailLayout): RailLayout {
  return {
    ...layout,
    left: { ...layout.left, scale },
    right: { ...layout.right, scale },
    bottom: { ...layout.bottom, scale },
  };
}

/**
 * Force all three PANEL rails — both side rails and the timeline — to the
 * smallest scale step, leaving the toolbar as it was.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ EVERY TABLET PRESET GOES THROUGH THIS (owner, 2026-08-30)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * On an iPad every rail is charged against the canvas: the side rails take
 * width, the timeline takes height, and the screen has far less of both than
 * a laptop. `compact` is step 1 of the four `RAIL_SCALES` — what the layout
 * overlay's readout calls "1 / 4" — and it is the tablet DEFAULT for all
 * three, whatever else a preset does.
 *
 * ⚠️ Note the timeline's step-1 is a SMALLER factor than a side rail's
 * (`--rail-scale-bottom-compact` is 0.55 against the side rails' 0.8; see
 * `tokens.css`). That is deliberate in the token, not an inconsistency here:
 * "step 1 of 4" is a position on each rail's own scale, and the timeline's
 * bottom step goes further because it is the rail most often shrunk to get
 * out of the way.
 *
 * The TOOLBAR is untouched, and cannot be otherwise: it does not resize at
 * all (owner, 2026-08-28), which is why its overlay offers `spread` instead
 * of a scale pair.
 *
 * Applied as a FUNCTION rather than written into each literal so the rule is
 * stated once: a preset added to the tablet list later cannot forget it, and
 * a test can assert the property against the whole list.
 */
function compactRails(layout: RailLayout): RailLayout {
  return {
    ...layout,
    left: { ...layout.left, scale: "compact" },
    right: { ...layout.right, scale: "compact" },
    bottom: { ...layout.bottom, scale: "compact" },
  };
}

/**
 * Put the TOOLS rail in the left-most occupied slot, swapping it with the
 * Objects & Layers rail when that rail is holding it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ EVERY TABLET PRESET BUT `right-hand` GOES THROUGH THIS (owner, …-08-30)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ NAMES FIRST, because they invert: the rail called `right` CARRIES the
 * Tools, and the rail called `left` carries Objects & Layers (see
 * `RAIL_LABELS` in `useRailLayout`). The names are identities, not positions
 * — `railLayout.ts` opens on exactly this point. So "Tools on the left" means
 * putting the rail named **`right`** in the left-most slot, which reads
 * backwards and is the whole reason this is a named function rather than four
 * hand-written slot pairs.
 *
 * A SWAP, not an assignment. The two rails' slots are exchanged, so whatever
 * arrangement a preset described is preserved exactly — same two slots, same
 * side, same order relative to each other — with only the occupants traded.
 * Assigning slots outright would let both rails land in one slot, which has
 * no on-screen representation (`AppShell` would draw one rail twice and the
 * other never), and `narrowLayout` would have to repair it.
 *
 * `right-hand` is exempt: it exists to put everything under the right thumb,
 * so forcing its Tools rail left would defeat the one thing it is for.
 */
function toolsRailLeftMost(layout: RailLayout): RailLayout {
  const tools = SIDE_SLOTS.indexOf(layout.right.slot);
  const layers = SIDE_SLOTS.indexOf(layout.left.slot);
  // Already the left-most of the two — nothing to trade.
  if (tools < layers) return layout;
  return {
    ...layout,
    left: { ...layout.left, slot: layout.right.slot },
    right: { ...layout.right, slot: layout.left.slot },
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   DESKTOP
   ══════════════════════════════════════════════════════════════════════════ */

const DESKTOP_PRESETS: LayoutPreset[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Rails either side, timeline below, toolbar on top.",
    layout: DEFAULT_RAIL_LAYOUT,
  },
  {
    // ⚠️ The id stays `wide-canvas` though the NAME is now "Right Stack"
    // (owner, 2026-08-30). Ids are the identity `activePresetId` and the
    // picker's card keys are matched on; renaming one silently un-ticks the
    // card for anyone currently sitting on that arrangement. The name is the
    // only half the user ever sees, so it is the only half that changed.
    id: "wide-canvas",
    name: "Right Stack",
    description: "Everything stacked on the right — rails and toolbar.",
    layout: {
      ...DEFAULT_RAIL_LAYOUT,
      left: { slot: "rightInner", scale: "regular" },
      right: { slot: "rightOuter", scale: "regular" },
      toolbar: { edge: "right", scale: "regular", spread: 1 },
    },
  },
  {
    id: "left-stack",
    name: "Left Stack",
    description: "Everything stacked on the left — rails and toolbar.",
    layout: {
      ...DEFAULT_RAIL_LAYOUT,
      left: { slot: "leftOuter", scale: "regular" },
      right: { slot: "leftInner", scale: "regular" },
      toolbar: { edge: "left", scale: "regular", spread: 1 },
    },
  },
  {
    id: "top-timeline",
    name: "Top Timeline",
    description: "Timeline above the canvas, toolbar down the left edge.",
    layout: {
      ...DEFAULT_RAIL_LAYOUT,
      bottom: { edge: "top", scale: "regular" },
      toolbar: { edge: "left", scale: "regular", spread: 1 },
    },
  },
  {
    id: "big-controls",
    name: "Big Controls",
    description: "Every rail one size up — readable across a room.",
    layout: at("large", DEFAULT_RAIL_LAYOUT),
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   TABLET / PHONE
   ══════════════════════════════════════════════════════════════════════════

   Every entry here is named for a GRIP, because that is the thing the user
   is actually choosing between. The device is held in one hand; the question
   each preset answers is which hand, and what that hand's thumb can reach. */

/**
 * The tablet shortlist, BEFORE the side-rail rule is applied.
 *
 * Each entry states what makes it distinct — which grip, which toolbar edge,
 * how many toolbar lines. None of them states a rail SCALE, because on a
 * tablet that is not a per-preset choice: `compactRails` settles all three
 * for the whole list below. The `scale` fields written here are placeholders
 * the rule overrides, kept only because `RailLayout` requires them.
 */
const TABLET_PRESET_SHAPES: LayoutPreset[] = [
  {
    id: "classic",
    name: "Classic",
    // ⚠️ NOT the desktop `Classic`'s wording. The Tools-left rule below puts
    // the tools rail on the outer left here, so "rails either side" is true
    // but which side each one lands on is not the historical order.
    description: "A rail either side, timeline below, toolbar on top.",
    layout: DEFAULT_RAIL_LAYOUT,
  },
  {
    id: "right-hand",
    name: "Right Hand",
    description: "Both rails under the right thumb; tools outermost.",
    layout: {
      ...DEFAULT_RAIL_LAYOUT,
      left: { slot: "rightInner", scale: "regular" },
      right: { slot: "rightOuter", scale: "regular" },
      bottom: { edge: "bottom", scale: "regular" },
      toolbar: { edge: "right", scale: "regular", spread: 2 },
    },
  },
  {
    id: "left-hand",
    name: "Left Hand",
    description: "Both rails under the left thumb; tools outermost.",
    // ⚠️ Already Tools-left-most once the rule runs: this preset puts both
    // rails on the left, and the rule decides which of the two is outermost.
    layout: {
      ...DEFAULT_RAIL_LAYOUT,
      left: { slot: "leftInner", scale: "regular" },
      right: { slot: "leftOuter", scale: "regular" },
      bottom: { edge: "bottom", scale: "regular" },
      toolbar: { edge: "left", scale: "regular", spread: 2 },
    },
  },
  {
    id: "thumb-reach",
    name: "Thumb Reach",
    description: "Toolbar along the bottom edge, on two rows.",
    layout: {
      // ⚠️ Every scale here is overridden by `compactRails` below — what
      // makes this preset distinct is the TOOLBAR: docked to the bottom
      // edge, on two rows, which is what puts it under a held device's
      // thumbs. It is the toolbar's placement, not any rail's size.
      ...DEFAULT_RAIL_LAYOUT,
      toolbar: { edge: "bottom", scale: "regular", spread: 2 },
    },
  },
  {
    id: "max-canvas",
    name: "Max Canvas",
    description: "Rails on the right, everything small — most drawing room.",
    layout: {
      ...DEFAULT_RAIL_LAYOUT,
      left: { slot: "rightInner", scale: "regular" },
      right: { slot: "rightOuter", scale: "regular" },
      bottom: { edge: "bottom", scale: "regular" },
      toolbar: { edge: "top", scale: "regular", spread: 1 },
    },
  },
];

/**
 * The tablet shortlist as offered.
 *
 * ⭐ TWO RULES, applied to the whole list at once rather than written into
 * each literal — which is what makes them rules a new preset cannot forget,
 * instead of conventions five entries happen to follow:
 *
 *  1. all three panel rails default to the smallest of the four scale steps;
 *  2. the TOOLS rail takes the left-most of the two side slots, swapping with
 *     Objects & Layers where needed — every preset but `right-hand`, which
 *     exists to put everything under the right thumb.
 *
 * Both owner decisions, 2026-08-30.
 */
/** The one preset the Tools-left rule does not apply to — see the function. */
const TOOLS_LEFT_EXEMPT = "right-hand";

const TABLET_PRESETS: LayoutPreset[] = TABLET_PRESET_SHAPES.map((preset) => ({
  ...preset,
  layout:
    preset.id === TOOLS_LEFT_EXEMPT
      ? compactRails(preset.layout)
      : compactRails(toolsRailLeftMost(preset.layout)),
}));

/**
 * The built-in shortlist for each device class.
 *
 * ⚠️ Read through `presetsForDevice`, never indexed directly — an unknown
 * class must fall back rather than yield `undefined` and blank the picker.
 */
export const PRESETS_BY_DEVICE: Record<DeviceClass, LayoutPreset[]> = {
  desktop: DESKTOP_PRESETS,
  tablet: TABLET_PRESETS,
  // Same grips, tighter screen — see the header.
  phone: TABLET_PRESETS,
};

export function presetsForDevice(deviceClass: DeviceClass): LayoutPreset[] {
  return PRESETS_BY_DEVICE[deviceClass] ?? DESKTOP_PRESETS;
}

/**
 * Apply a preset over the CURRENT layout.
 *
 * ⚠️ `otherHand` is CARRIED OVER, not replaced, and this is the one place a
 * preset is not wholesale. Those positions are where the user physically put
 * their thumb widgets — hard-won, per-section, and completely orthogonal to
 * which side a rail sits on. Wiping them because someone tried a different
 * rail arrangement would be a destructive surprise, and no preset has a
 * meaningful opinion about them anyway (every built-in carries `{}`).
 */
export function applyPreset(
  current: RailLayout,
  preset: LayoutPreset,
): RailLayout {
  return { ...preset.layout, otherHand: current.otherHand };
}

/**
 * Whether `layout` is already exactly what `preset` would produce.
 *
 * Drives the card's "current" mark. `otherHand` is excluded for the same
 * reason `applyPreset` preserves it — it is not part of what a preset says.
 */
export function isPresetActive(
  layout: RailLayout,
  preset: LayoutPreset,
): boolean {
  const strip = ({ otherHand: _omit, ...rest }: RailLayout) => rest;
  return JSON.stringify(strip(layout)) === JSON.stringify(strip(preset.layout));
}

/**
 * A unique id for a newly saved custom preset.
 *
 * Prefixed so a custom preset can never collide with a built-in id, which
 * matters because the two live in one list and are keyed by id: a custom
 * preset named "Classic" must not shadow the built-in one.
 */
export function customPresetId(existing: readonly LayoutPreset[]): string {
  let n = existing.length + 1;
  const taken = new Set(existing.map((p) => p.id));
  while (taken.has(`custom-${n}`)) n += 1;
  return `custom-${n}`;
}
