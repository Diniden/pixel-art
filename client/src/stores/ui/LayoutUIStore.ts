/**
 * LayoutUIStore — the rail arrangement and the UI theme.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  TWO FIELDS, TWO DIFFERENT PERSISTENCE SHAPES — ON PURPOSE
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  - **`railLayouts` is keyed by DEVICE CLASS.** One project carries up to
 *    three arrangements (`desktop` / `tablet` / `phone`), and the store
 *    exposes the one for THIS device as `layout`. A laptop and an iPad
 *    opening the same project each get the layout that fits their screen,
 *    and neither overwrites the other's.
 *  - **`theme` is one value for the whole project** (owner decision). It
 *    applies on every device that opens the file.
 *
 * ── Both are ABSENT until the user changes something, and that is R3 ──────
 *
 * `theme` is `null` and `railLayouts` is `{}` on a fresh store, and
 * `UIStore.toPersistedUIState()` emits each key only when it is set. A
 * project that has never touched the Layout menu or the theme dropdown
 * therefore serializes the EXACT key set it always did — which is what keeps
 * the 151 corpus snapshots' digests unchanged. Emitting a default here
 * instead would add two keys to every project on its next save.
 *
 * ── ⚠️ The theme is applied to the DOM by the container, not here ─────────
 *
 * A store must not touch `document`. `LayoutContainer` runs the
 * `applyTheme()` side effect in a reaction; this store holds the value and
 * nothing else. `themes.ts` remains the only place that knows about
 * `<html data-theme>`.
 *
 * ── Migrating off the localStorage device preference ──────────────────────
 *
 * The theme USED to be a device preference in `localStorage`, deliberately
 * kept out of the wire format. The owner has since moved it into the project
 * (one theme per project, this file's `theme`). `localStorage` is now only a
 * SEED: a project with no saved theme adopts whatever the device last used,
 * so nobody's existing preference is lost the first time they open a file —
 * see `LayoutContainer`. The store itself knows nothing about storage.
 */
import { action, makeObservable, observable, observableRef } from "mobx";
import {
  DEFAULT_RAIL_LAYOUT,
  RAIL_SCALES,
  SIDE_SLOTS,
  canScaleRail,
  canStepRail,
  flipBottomEdge,
  scaleRail,
  setToolbarEdge,
  stepRail,
  TOOLBAR_EDGES,
  type BottomEdge,
  type RailLayout,
  type RailName,
  type RailScale,
  type SideRailName,
  type SideSlot,
  type ToolbarEdge,
} from "../../ui/layout/railLayout";
import {
  detectDeviceClass,
  isDeviceClass,
  type DeviceClass,
} from "../../ui/layout/deviceClass";
import { isThemeId, type ThemeId } from "../../ui/theme/themes";
import type { PersistedRailLayout } from "../../types";

/**
 * Narrow a persisted layout — which carries WIDE `string` types, because a
 * file on disk may have been written by a different build — into the store's
 * union types, falling back field-by-field to the default.
 *
 * Field-by-field rather than all-or-nothing: a file carrying one unknown
 * scale should keep its three valid placements, not lose the whole layout.
 */
function narrowLayout(persisted: PersistedRailLayout | undefined): RailLayout {
  if (!persisted) return DEFAULT_RAIL_LAYOUT;
  const slot = (value: string, fallback: SideSlot): SideSlot =>
    (SIDE_SLOTS as readonly string[]).includes(value)
      ? (value as SideSlot)
      : fallback;
  const scale = (value: string, fallback: RailScale): RailScale =>
    (RAIL_SCALES as readonly string[]).includes(value)
      ? (value as RailScale)
      : fallback;
  const edge = (value: string, fallback: BottomEdge): BottomEdge =>
    value === "top" || value === "bottom" ? (value as BottomEdge) : fallback;
  const toolbarEdge = (
    value: string | undefined,
    fallback: ToolbarEdge,
  ): ToolbarEdge =>
    (TOOLBAR_EDGES as readonly string[]).includes(value ?? "")
      ? (value as ToolbarEdge)
      : fallback;

  const d = DEFAULT_RAIL_LAYOUT;
  const narrowed: RailLayout = {
    left: {
      slot: slot(persisted.left?.slot, d.left.slot),
      scale: scale(persisted.left?.scale, d.left.scale),
    },
    right: {
      slot: slot(persisted.right?.slot, d.right.slot),
      scale: scale(persisted.right?.scale, d.right.scale),
    },
    bottom: {
      edge: edge(persisted.bottom?.edge, d.bottom.edge),
      scale: scale(persisted.bottom?.scale, d.bottom.scale),
    },
    // ⚠️ `toolbar` is absent from every layout saved before 2026-08-28, so
    // the whole block defaults rather than just its fields — an older
    // project must come back with the toolbar where it has always been.
    toolbar: {
      edge: toolbarEdge(persisted.toolbar?.edge, d.toolbar.edge),
      scale: scale(persisted.toolbar?.scale ?? "", d.toolbar.scale),
    },
  };

  // ⚠️ Two rails narrowing into the SAME slot is unrepresentable on screen —
  // one would be rendered twice or not at all. It cannot arise from
  // `stepRail` (which swaps), only from a corrupt or hand-edited file, so it
  // is repaired rather than trusted: the left rail keeps its slot and the
  // right rail returns to its default.
  if (narrowed.left.slot === narrowed.right.slot) {
    narrowed.right.slot =
      narrowed.left.slot === d.right.slot ? d.left.slot : d.right.slot;
  }
  return narrowed;
}

/** The store's `RailLayout` widened back to the persisted shape. */
function widenLayout(layout: RailLayout): PersistedRailLayout {
  return {
    left: { slot: layout.left.slot, scale: layout.left.scale },
    right: { slot: layout.right.slot, scale: layout.right.scale },
    bottom: { edge: layout.bottom.edge, scale: layout.bottom.scale },
    toolbar: { edge: layout.toolbar.edge, scale: layout.toolbar.scale },
  };
}

export class LayoutUIStore {
  /**
   * Which device class this session writes to. Measured ONCE at construction:
   * re-detecting per read would let a window resize silently move the user's
   * edits into a different class's record mid-session.
   */
  readonly deviceClass: DeviceClass;

  /**
   * Every device class's layout, exactly as persisted. `observableRef` — the
   * record is replaced wholesale, never mutated in place, so per-key
   * granularity would only add proxies.
   */
  railLayouts: { [deviceClass: string]: PersistedRailLayout } = {};

  /**
   * The project's theme. `null` means the project has never set one, which is
   * DISTINCT from "set to the default" — only the former stays out of the
   * wire format.
   */
  theme: ThemeId | null = null;

  /** Whether the layout overlay is showing. Session-only: never persisted. */
  layoutMode = false;

  constructor(deviceClass: DeviceClass = detectDeviceClass()) {
    this.deviceClass = deviceClass;
    makeObservable(this, {
      railLayouts: observableRef,
      theme: observable,
      layoutMode: observable,
      setTheme: action,
      setLayoutMode: action,
      toggleLayoutMode: action,
      stepRail: action,
      flipBottomEdge: action,
      setToolbarEdge: action,
      scaleRail: action,
      resetLayout: action,
      hydrate: action,
    });
  }

  /** THIS device's arrangement, narrowed and defaulted. */
  get layout(): RailLayout {
    return narrowLayout(this.railLayouts[this.deviceClass]);
  }

  /** Whether this project has ever had a layout saved for ANY device. */
  get hasStoredLayout(): boolean {
    return Object.keys(this.railLayouts).length > 0;
  }

  /** Replace THIS device's entry, leaving every other device's untouched. */
  private write(layout: RailLayout): void {
    this.railLayouts = {
      ...this.railLayouts,
      [this.deviceClass]: widenLayout(layout),
    };
  }

  setTheme(theme: ThemeId): void {
    this.theme = theme;
  }

  setLayoutMode(on: boolean): void {
    this.layoutMode = on;
  }

  toggleLayoutMode(): void {
    this.layoutMode = !this.layoutMode;
  }

  /** Move a side rail one slot. A no-op at the ends of the track. */
  stepRail(rail: SideRailName, direction: -1 | 1): void {
    if (!canStepRail(this.layout, rail, direction)) return;
    this.write(stepRail(this.layout, rail, direction));
  }

  canStepRail(rail: SideRailName, direction: -1 | 1): boolean {
    return canStepRail(this.layout, rail, direction);
  }

  /** Flip the bottom rail between the bottom and the top of the shell. */
  flipBottomEdge(): void {
    this.write(flipBottomEdge(this.layout));
  }

  /** Lock the canvas toolbar to one of the four edges of the workspace. */
  setToolbarEdge(edge: ToolbarEdge): void {
    this.write(setToolbarEdge(this.layout, edge));
  }

  /** Step a rail's size one notch. A no-op at the ends of the scale. */
  scaleRail(rail: RailName, direction: -1 | 1): void {
    if (!canScaleRail(this.layout, rail, direction)) return;
    this.write(scaleRail(this.layout, rail, direction));
  }

  canScaleRail(rail: RailName, direction: -1 | 1): boolean {
    return canScaleRail(this.layout, rail, direction);
  }

  /** Return THIS device to the historical arrangement. */
  resetLayout(): void {
    this.write(DEFAULT_RAIL_LAYOUT);
  }

  /**
   * Adopt a loaded project's chrome fields.
   *
   * ⚠️ Both are assigned UNCONDITIONALLY, so "absent stays absent" survives a
   * round trip. A project with no `theme` must hydrate to `null` and not
   * inherit the previously-loaded project's theme — switching projects would
   * otherwise write one project's theme into another on the next autosave.
   */
  hydrate(ui: {
    railLayouts?: { [deviceClass: string]: PersistedRailLayout };
    theme?: string;
  }): void {
    this.railLayouts = ui.railLayouts ?? {};
    this.theme = isThemeId(ui.theme) ? ui.theme : null;
  }

  /**
   * The persisted record for the builder. `undefined` when this project has
   * no layout at all — that is what keeps the key out of the wire format.
   *
   * ⚠️ Returns the record for EVERY device class, not just this one. A
   * desktop session must not drop the iPad's saved layout when it saves.
   */
  toPersistedRailLayouts():
    | { [deviceClass: string]: PersistedRailLayout }
    | undefined {
    return this.hasStoredLayout ? this.railLayouts : undefined;
  }
}

export { isDeviceClass };
