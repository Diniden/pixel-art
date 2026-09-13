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
  stepToolbarSpread,
  canStepToolbarSpread,
  isOtherHandColorModel,
  isOtherHandPosition,
  resetOtherHandPositions,
  setOtherHandColorModel,
  setOtherHandIncludeAlpha,
  setOtherHandWidgetPosition,
  TOOLBAR_EDGES,
  TOOLBAR_SPREADS,
  type BottomEdge,
  type OtherHandColorModel,
  type OtherHandLayout,
  type OtherHandPosition,
  type OtherHandSectionLayout,
  type RailLayout,
  type RailName,
  type RailScale,
  type SideRailName,
  type SideSlot,
  type ToolbarEdge,
  type ToolbarSpread,
} from "../../ui/layout/railLayout";
import {
  detectDeviceClass,
  detectOrientation,
  isDeviceClass,
  layoutKey,
  PORTRAIT_QUERY,
  type DeviceClass,
  type Orientation,
} from "../../ui/layout/deviceClass";
import { isThemeId, type ThemeId } from "../../ui/theme/themes";
import {
  applyPreset,
  customPresetId,
  isPresetActive,
  presetsForDevice,
  type LayoutPreset,
} from "../../ui/layout/layoutPresets";
import type { PersistedLayoutPreset, PersistedRailLayout } from "../../types";

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
  // ⚠️ Absent in every layout saved before 2026-08-28, and a file may carry
  // any number at all — a count outside the supported set must fall back to
  // one line rather than producing a toolbar with, say, 40 rows.
  const spread = (
    value: number | undefined,
    fallback: ToolbarSpread,
  ): ToolbarSpread =>
    (TOOLBAR_SPREADS as readonly number[]).includes(value ?? 0)
      ? (value as ToolbarSpread)
      : fallback;
  const toolbarEdge = (
    value: string | undefined,
    fallback: ToolbarEdge,
  ): ToolbarEdge =>
    (TOOLBAR_EDGES as readonly string[]).includes(value ?? "")
      ? (value as ToolbarEdge)
      : fallback;

  const d = DEFAULT_RAIL_LAYOUT;
  const narrowed: RailLayout = {
    otherHand: narrowOtherHand(persisted.otherHand),
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
      spread: spread(persisted.toolbar?.spread, d.toolbar.spread),
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

/**
 * Narrow the Other Hand arrangements. Field-by-field, like the rest: a
 * section with one malformed position keeps its other positions, and an
 * unknown colour model falls back to "unset" rather than discarding the
 * section. An entry that is not an object at all is dropped.
 */
function narrowOtherHand(
  persisted: PersistedRailLayout["otherHand"],
): OtherHandLayout {
  if (!persisted || typeof persisted !== "object") return {};
  const out: OtherHandLayout = {};
  for (const [key, raw] of Object.entries(persisted)) {
    if (!raw || typeof raw !== "object") continue;
    const positions: OtherHandSectionLayout["positions"] = {};
    for (const [id, pos] of Object.entries(raw.positions ?? {})) {
      if (isOtherHandPosition(pos)) positions[id] = { x: pos.x, y: pos.y };
    }
    const section: OtherHandSectionLayout = { positions };
    if (isOtherHandColorModel(raw.colorModel)) {
      section.colorModel = raw.colorModel;
    }
    if (typeof raw.includeAlpha === "boolean") {
      section.includeAlpha = raw.includeAlpha;
    }
    out[key] = section;
  }
  return out;
}

/**
 * Narrow the saved presets. Same field-by-field spirit as `narrowLayout`: an
 * entry missing an id or a name is unusable in a keyed list and is DROPPED,
 * but an entry whose `layout` is partial or unknown is kept — `narrowLayout`
 * defaults the bad fields, so the user still gets the preset they named.
 */
function narrowPresets(
  persisted: { [deviceClass: string]: PersistedLayoutPreset[] } | undefined,
): { [deviceClass: string]: PersistedLayoutPreset[] } {
  if (!persisted || typeof persisted !== "object") return {};
  const out: { [deviceClass: string]: PersistedLayoutPreset[] } = {};
  for (const [deviceClass, list] of Object.entries(persisted)) {
    if (!Array.isArray(list)) continue;
    const kept = list.filter(
      (preset): preset is PersistedLayoutPreset =>
        !!preset &&
        typeof preset === "object" &&
        typeof preset.id === "string" &&
        typeof preset.name === "string",
    );
    if (kept.length > 0) out[deviceClass] = kept;
  }
  return out;
}

/** The store's `RailLayout` widened back to the persisted shape. */
function widenLayout(layout: RailLayout): PersistedRailLayout {
  const widened: PersistedRailLayout = {
    left: { slot: layout.left.slot, scale: layout.left.scale },
    right: { slot: layout.right.slot, scale: layout.right.scale },
    bottom: { edge: layout.bottom.edge, scale: layout.bottom.scale },
    toolbar: {
      edge: layout.toolbar.edge,
      scale: layout.toolbar.scale,
      spread: layout.toolbar.spread,
    },
  };
  // ⚠️ Emitted ONLY when something has been arranged. A layout saved before
  // Other Hand Mode existed must widen back to exactly the record it came
  // from — an empty `otherHand: {}` on every rail layout would be wire-format
  // drift for a feature the user has not touched.
  if (Object.keys(layout.otherHand).length > 0) {
    widened.otherHand = layout.otherHand;
  }
  return widened;
}

export class LayoutUIStore {
  /**
   * Which device class this session writes to. Measured ONCE at construction:
   * re-detecting per read would let a window resize silently move the user's
   * edits into a different class's record mid-session.
   */
  readonly deviceClass: DeviceClass;

  /**
   * Which way round the device is being held RIGHT NOW.
   *
   * ⚠️ Unlike `deviceClass`, this is NOT measured once — it is the one thing
   * about the layout key that legitimately changes mid-session, because
   * rotating an iPad really does mean the user wants their other saved
   * arrangement. A media listener installed in the constructor updates it,
   * and `get layout()` recomputes reactively off it.
   *
   * Desktop ignores it entirely: `layoutKey` keys desktop by class alone, so
   * a resized desktop window changes nothing here even though this field
   * still tracks the window's shape.
   */
  orientation: Orientation;

  /**
   * Every device class's layout, exactly as persisted. `observableRef` — the
   * record is replaced wholesale, never mutated in place, so per-key
   * granularity would only add proxies.
   *
   * ⚠️ Since 2026-09-06 the KEYS are richer: a tablet or phone stores under
   * `` `${deviceClass}:${orientation}` `` so portrait and landscape hold
   * separate arrangements, while desktop keeps its bare `"desktop"`. The
   * map's SHAPE is unchanged — it has always been keyed by an arbitrary
   * string — so this is not a wire-format change and adds no new wire key.
   * A project saved before that date carries a bare `"tablet"` key and is
   * migrated lazily, in `get layout()`, never by rewriting this map: see
   * that getter for why.
   */
  railLayouts: { [deviceClass: string]: PersistedRailLayout } = {};

  /**
   * The project's theme. `null` means the project has never set one, which is
   * DISTINCT from "set to the default" — only the former stays out of the
   * wire format.
   */
  theme: ThemeId | null = null;

  /**
   * The user's own saved layouts, by device class, exactly as persisted.
   * `observableRef` for the same reason `railLayouts` is: the record is
   * replaced wholesale on every edit, so per-key proxies would buy nothing.
   */
  layoutPresets: { [deviceClass: string]: PersistedLayoutPreset[] } = {};

  /** Whether the layout overlay is showing. Session-only: never persisted. */
  layoutMode = false;

  /**
   * The section currently taking over the rail in Other Hand Mode, or `null`
   * when the mode is off. Session-only, like `layoutMode`: the ARRANGEMENT is
   * persisted (see `railLayout.ts`), but whether the rail is in the mode
   * right now is not — a project must open showing its rail normally.
   */
  otherHandSection: string | null = null;

  /**
   * Removes the orientation listener. `null` outside a browser, and in the
   * `matchMedia`-less contexts `detectOrientation` already guards for.
   *
   * ⚠️ R10 — this exists because React 19 StrictMode mounts twice in dev. A
   * listener added without a matching removal leaves the first store's
   * listener alive on the shared `window`, so one rotation fires two
   * handlers and the discarded store keeps reacting. `dispose()` is called
   * from `UIStore.dispose()`, the house pattern (`ReferenceUIStore.ts:412`,
   * `ApplicationStore.ts:1890`).
   */
  private readonly disposeOrientation: (() => void) | null = null;

  constructor(
    deviceClass: DeviceClass = detectDeviceClass(),
    orientation: Orientation = detectOrientation(),
  ) {
    this.deviceClass = deviceClass;
    this.orientation = orientation;
    makeObservable(this, {
      railLayouts: observableRef,
      layoutPresets: observableRef,
      orientation: observable,
      theme: observable,
      layoutMode: observable,
      otherHandSection: observable,
      setOrientation: action,
      setTheme: action,
      enterOtherHand: action,
      exitOtherHand: action,
      setOtherHandWidgetPosition: action,
      setOtherHandColorModel: action,
      setOtherHandIncludeAlpha: action,
      resetOtherHandPositions: action,
      setLayoutMode: action,
      toggleLayoutMode: action,
      stepRail: action,
      flipBottomEdge: action,
      setToolbarEdge: action,
      stepToolbarSpread: action,
      scaleRail: action,
      resetLayout: action,
      applyLayoutPreset: action,
      saveCurrentAsPreset: action,
      deleteLayoutPreset: action,
      hydrate: action,
    });

    this.disposeOrientation = this.listenForOrientation();
  }

  /**
   * Watch for rotation and keep {@link orientation} current.
   *
   * `matchMedia` + `change` is the primary path — it is the same signal the
   * app's CSS orientation queries already act on, so the key and the
   * stylesheet cannot disagree. `resize` is the fallback for environments
   * without `matchMedia` (jsdom in several suites) and, in that path, the
   * value is re-derived rather than read from the event.
   *
   * ⚠️ This is for the layout KEY only. It deliberately drives no rendering
   * — `OtherHandSurface.tsx:22-30` records that "no measurement, no resize
   * listener and no orientation listener" is the design for rendering, which
   * the CSS media queries handle. Nothing here measures the viewport for
   * layout purposes.
   *
   * Returns the disposer, or `null` where there is nothing to listen to.
   */
  private listenForOrientation(): (() => void) | null {
    if (typeof window === "undefined") return null;

    const onChange = (): void => this.setOrientation(detectOrientation());

    if (typeof window.matchMedia === "function") {
      const query = window.matchMedia(PORTRAIT_QUERY);
      // `addEventListener` is the modern form; Safari carried the deprecated
      // `addListener` alone until 14, and the iPad is precisely the device
      // this feature exists for, so both are handled.
      if (typeof query.addEventListener === "function") {
        query.addEventListener("change", onChange);
        return () => query.removeEventListener("change", onChange);
      }
      if (typeof query.addListener === "function") {
        query.addListener(onChange);
        return () => query.removeListener(onChange);
      }
    }

    if (typeof window.addEventListener !== "function") return null;
    window.addEventListener("resize", onChange);
    return () => window.removeEventListener("resize", onChange);
  }

  /**
   * Adopt a new orientation. An idempotent set is skipped so a `resize`
   * storm — which fires many times per rotation — does not churn observers
   * that only care about the layout key.
   */
  setOrientation(orientation: Orientation): void {
    if (this.orientation === orientation) return;
    this.orientation = orientation;
  }

  /** The key THIS session reads and writes: class, plus orientation. */
  get layoutKey(): string {
    return layoutKey(this.deviceClass, this.orientation);
  }

  /**
   * THIS device's arrangement for THIS orientation, narrowed and defaulted.
   *
   * ⚠️ THE FALLBACK IS THE MIGRATION, AND IT LIVES HERE ON PURPOSE (R11).
   *
   * Every layout saved before 2026-09-06 sits under a bare `"tablet"` or
   * `"phone"` key. The obvious fix — rewriting the map into composite keys
   * when a project hydrates — is the wrong one: it would change an untouched
   * project's `railLayouts` the moment it loaded, and the next autosave
   * would write a different key set into a file whose layout the owner never
   * touched. The digest of a file nobody edited must not move.
   *
   * So the legacy key is resolved lazily, on READ. A pre-existing layout
   * appears in BOTH orientations until the user actually arranges one, and
   * the first arrangement in either orientation writes only the composite
   * key it belongs to — leaving the legacy key in place as the other
   * orientation's answer. `write()` is the only thing that ever changes the
   * map, and it only ever runs because the user did something.
   */
  get layout(): RailLayout {
    const key = this.layoutKey;
    const persisted =
      this.railLayouts[key] ??
      // The legacy bare-`deviceClass` entry. On desktop `key` already IS
      // `deviceClass`, so this second lookup is the same one and is a no-op.
      this.railLayouts[this.deviceClass];
    return narrowLayout(persisted);
  }

  /** Whether this project has ever had a layout saved for ANY device. */
  get hasStoredLayout(): boolean {
    return Object.keys(this.railLayouts).length > 0;
  }

  /**
   * Replace THIS device-and-orientation's entry, leaving every other one
   * untouched — including the other orientation's, and including the legacy
   * bare-`deviceClass` entry, which stays as the other orientation's answer
   * until that orientation is itself arranged.
   */
  private write(layout: RailLayout): void {
    this.railLayouts = {
      ...this.railLayouts,
      [this.layoutKey]: widenLayout(layout),
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

  /** Give the toolbar one more / one fewer line to spread its tools over. */
  stepToolbarSpread(direction: -1 | 1): void {
    if (!canStepToolbarSpread(this.layout, direction)) return;
    this.write(stepToolbarSpread(this.layout, direction));
  }

  canStepToolbarSpread(direction: -1 | 1): boolean {
    return canStepToolbarSpread(this.layout, direction);
  }

  /** Step a rail's size one notch. A no-op at the ends of the scale. */
  scaleRail(rail: RailName, direction: -1 | 1): void {
    if (!canScaleRail(this.layout, rail, direction)) return;
    this.write(scaleRail(this.layout, rail, direction));
  }

  canScaleRail(rail: RailName, direction: -1 | 1): boolean {
    return canScaleRail(this.layout, rail, direction);
  }

  /* ── Other Hand Mode ──────────────────────────────────────────────────── */

  /**
   * ⚠️ TABLETS ONLY (owner, 2026-08-28). The mode exists for one grip — an
   * iPad held in one hand with that hand's thumb on the rail — so it is
   * offered only where that grip is possible. A phone is too narrow for a
   * rail of thumb sliders and a desktop has nowhere to put a thumb.
   * Gated on the device CLASS rather than on touch support, for the same
   * reason the layout is keyed by class: a touch-screen laptop is a desktop.
   */
  get otherHandAvailable(): boolean {
    return this.deviceClass === "tablet";
  }

  /** Whether the rail is currently taken over by a section. */
  get otherHandActive(): boolean {
    return this.otherHandSection !== null;
  }

  /** Hand the rail to one section. A no-op where the mode is unavailable. */
  enterOtherHand(sectionKey: string): void {
    if (!this.otherHandAvailable) return;
    this.otherHandSection = sectionKey;
  }

  exitOtherHand(): void {
    this.otherHandSection = null;
  }

  /** One section's arrangement, defaulted so callers never see `undefined`. */
  otherHandLayoutFor(sectionKey: string): OtherHandSectionLayout {
    return this.layout.otherHand[sectionKey] ?? { positions: {} };
  }

  setOtherHandWidgetPosition(
    sectionKey: string,
    widgetId: string,
    position: OtherHandPosition,
  ): void {
    this.write(
      setOtherHandWidgetPosition(this.layout, sectionKey, widgetId, position),
    );
  }

  setOtherHandColorModel(sectionKey: string, model: OtherHandColorModel): void {
    this.write(setOtherHandColorModel(this.layout, sectionKey, model));
  }

  setOtherHandIncludeAlpha(sectionKey: string, includeAlpha: boolean): void {
    this.write(setOtherHandIncludeAlpha(this.layout, sectionKey, includeAlpha));
  }

  resetOtherHandPositions(sectionKey: string): void {
    this.write(resetOtherHandPositions(this.layout, sectionKey));
  }

  /** Return THIS device to the historical arrangement. */
  resetLayout(): void {
    this.write(DEFAULT_RAIL_LAYOUT);
  }

  /* ── Layout presets ───────────────────────────────────────────────────── */

  /**
   * The shortlist offered in layout mode: this device class's built-ins,
   * then whatever the user has saved FOR THIS DEVICE CLASS.
   *
   * ⚠️ Keyed by device class throughout, exactly like `railLayouts` and for
   * exactly the same reason: an arrangement that works held in one hand is
   * not one that works with a mouse, so an iPad's saved layouts have no
   * business appearing on a laptop. The custom ones come last so the
   * built-ins keep stable positions as the user's list grows.
   */
  get availablePresets(): LayoutPreset[] {
    const saved = this.layoutPresets[this.deviceClass] ?? [];
    return [
      ...presetsForDevice(this.deviceClass),
      ...saved.map((preset) => ({
        id: preset.id,
        name: preset.name,
        // Custom presets have no authored purpose line — the name is the
        // user's own and is the whole description.
        description: "Your saved layout.",
        layout: narrowLayout(preset.layout),
        custom: true,
      })),
    ];
  }

  /**
   * The id of the preset the current arrangement matches, or `null`.
   *
   * FIRST match wins. A user can save a preset identical to a built-in, and
   * marking both as current would show two ticks for one arrangement; the
   * built-in is the one named in code, so it is the one that wins.
   */
  get activePresetId(): string | null {
    const layout = this.layout;
    return (
      this.availablePresets.find((preset) => isPresetActive(layout, preset))
        ?.id ?? null
    );
  }

  /** Adopt a whole arrangement in one step. */
  applyLayoutPreset(preset: LayoutPreset): void {
    this.write(applyPreset(this.layout, preset));
  }

  /**
   * Keep the current arrangement under a user-typed name.
   *
   * ⚠️ The layout is snapshotted through `widenLayout` HERE, not read lazily
   * later: a preset is a record of how things were when it was saved, and a
   * reference to the live layout would silently follow every subsequent
   * change. `otherHand` is dropped by that widening for a preset — those
   * positions are carried across a preset change, never dictated by one
   * (see `applyPreset`).
   */
  saveCurrentAsPreset(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    const saved = this.layoutPresets[this.deviceClass] ?? [];
    const layout = widenLayout(this.layout);
    delete layout.otherHand;
    this.layoutPresets = {
      ...this.layoutPresets,
      [this.deviceClass]: [
        ...saved,
        { id: customPresetId(this.availablePresets), name: trimmed, layout },
      ],
    };
  }

  /**
   * Forget one saved layout. Built-in ids are not in the persisted list, so
   * passing one is a harmless no-op rather than something to guard against.
   */
  deleteLayoutPreset(id: string): void {
    const saved = this.layoutPresets[this.deviceClass] ?? [];
    const next = saved.filter((preset) => preset.id !== id);
    if (next.length === saved.length) return;
    this.layoutPresets = { ...this.layoutPresets, [this.deviceClass]: next };
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
    layoutPresets?: { [deviceClass: string]: PersistedLayoutPreset[] };
    theme?: string;
  }): void {
    this.railLayouts = ui.railLayouts ?? {};
    this.layoutPresets = narrowPresets(ui.layoutPresets);
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
    { [deviceClass: string]: PersistedRailLayout } | undefined {
    return this.hasStoredLayout ? this.railLayouts : undefined;
  }

  /**
   * The saved presets for the builder. `undefined` until the user saves one,
   * for the same R3 reason as `toPersistedRailLayouts` — a project nobody has
   * saved a layout in must not gain the key.
   *
   * ⚠️ Every device class, not just this one: a desktop session saving must
   * not drop the iPad's saved layouts.
   */
  toPersistedLayoutPresets():
    { [deviceClass: string]: PersistedLayoutPreset[] } | undefined {
    const anySaved = Object.values(this.layoutPresets).some(
      (list) => list.length > 0,
    );
    return anySaved ? this.layoutPresets : undefined;
  }

  /**
   * Release the orientation listener. Idempotent — calling it twice, or on a
   * store that never installed one, is a no-op.
   *
   * ⚠️ R10. Called from `UIStore.dispose()`, which `ApplicationStore` and
   * the Storybook/Vitest teardowns already run. Without it, React 19
   * StrictMode's double mount leaves a listener on the shared `window` bound
   * to a store that has been thrown away.
   */
  dispose(): void {
    this.disposeOrientation?.();
  }
}

export { isDeviceClass };
