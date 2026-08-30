/**
 * useRailLayout — the one place layout mode is wired to the store.
 *
 * Both studios show the same rails and the same overlay controls, so the
 * wiring lives here rather than being transcribed into
 * `PixelStudioContainer` and `LightingStudioContainer` — two copies of a
 * store-to-props mapping is exactly how the two studios drift apart.
 *
 * Returns the two props `PixelStudioLayout` / `LightingStudioLayout` hand
 * straight to `AppShell`: the arrangement, and the per-rail scrims.
 *
 * ⚠️ **It must be called from an `observer()` container.** It reads MobX
 * observables (`layout.layoutMode`, `layout.layout`) and returns plain
 * values; a non-observer caller would render once and never update. Both
 * call sites are observers.
 *
 * ── Why the overlays are built here and not inside `AppShell` ─────────────
 *
 * `AppShell` is `ui/`: it may not import a store, so it cannot know whether
 * layout mode is on. It takes the scrims as `ReactNode`s and renders them
 * inside the rails it already owns. The rule that keeps the boundary honest
 * is the same one the region props follow — containers inject elements,
 * `ui/` arranges them.
 */
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { RailLayoutOverlay } from "../../ui/components/RailLayoutOverlay/RailLayoutOverlay";
import { RailDismissButton } from "../../ui/components/RailDismissButton/RailDismissButton";
import { Toast } from "../../ui/components/Toast/Toast";
import { useTransientMessage } from "./useTransientMessage";
import { DISMISSABLE_RAILS } from "../../ui/layout/railVisibility";
import { LayoutPresetPicker } from "../../ui/components/LayoutPresetPicker/LayoutPresetPicker";
import {
  RAIL_SCALES,
  slotSide,
  type RailLayout,
} from "../../ui/layout/railLayout";
import { useStores } from "../../stores/context";

export interface RailLayoutProps {
  layout: RailLayout;
  railOverlays?: Partial<
    Record<"left" | "right" | "bottom" | "toolbar", ReactNode>
  >;
  /** The preset picker over the canvas. `undefined` when layout mode is off. */
  canvasOverlay?: ReactNode;
  /** The per-rail × buttons. `undefined` while layout mode is on. */
  railDismiss?: Partial<Record<"left" | "right" | "bottom", ReactNode>>;
  /** Which rails are currently dismissed — the layouts' only question. */
  hiddenRails: ReadonlySet<"left" | "right" | "bottom">;
  /**
   * The "entered focus mode" toast, or `undefined` when nothing is showing.
   * Rendered by the studio containers alongside the layout.
   */
  toast?: ReactNode;
}

/**
 * What the first dismissal says.
 *
 * ⚠️ It names the TOOLBAR as the way back, because that is where the focus
 * button lives and the button is the only control that restores a rail
 * dismissed by its own handle. A user who collapses a rail and cannot find it
 * again has lost a panel; this one sentence is what prevents that.
 */
const FOCUS_MODE_TOAST =
  "Entered focus mode. Use toolbar to get rails back.";

/**
 * What each device class's preset shortlist is called on screen.
 *
 * ⚠️ It is a caption, not a choice. The class is MEASURED (`deviceClass.ts`),
 * and showing it is what makes the two facts the owner asked for legible:
 * these presets are for this kind of screen, and saving one saves it here
 * only. A user on an iPad seeing "Desktop presets" would be looking at a bug.
 */
const DEVICE_LABELS = {
  desktop: "Desktop layouts",
  tablet: "Tablet layouts",
  phone: "Phone layouts",
} as const;

/** The user-facing name of each rail — what the overlay is labelled with. */
const RAIL_LABELS = {
  left: "Objects & Layers",
  right: "Tools",
  bottom: "Timeline",
  toolbar: "Toolbar",
} as const;

export function useRailLayout(): RailLayoutProps {
  const { ui } = useStores();
  const store = ui.layout;
  const layoutMode = store.layoutMode;
  const layout = store.layout;
  // Read unconditionally so the observer tracks them: reading these inside
  // the memo's callback would leave the container blind to a saved preset,
  // because a memo body does not run under the observer's tracking.
  const presets = store.availablePresets;
  const activePresetId = store.activePresetId;
  const viewport = ui.viewport;
  const hiddenRails = viewport.hiddenRails;

  /* ── The first-dismissal toast ─────────────────────────────────────────
     ⚠️ FIRES ON THE EDGE, not on the condition. `wasEngaged` is what makes
     it "the FIRST rail to be disappeared" (owner, 2026-08-30): the toast is
     shown only as the hidden set goes from empty to non-empty, so dismissing
     a second rail while one is already gone says nothing. Watching
     `focusModeEngaged` itself would re-fire on every re-render that happened
     to occur while a rail was hidden. */
  const { message: toastMessage, show: showToast } = useTransientMessage();
  const engaged = viewport.focusModeEngaged;
  const wasEngaged = useRef(engaged);

  useEffect(() => {
    if (engaged && !wasEngaged.current) showToast(FOCUS_MODE_TOAST);
    wasEngaged.current = engaged;
  }, [engaged, showToast]);

  const toast = toastMessage ? <Toast>{toastMessage}</Toast> : undefined;

  /**
   * The × on each rail.
   *
   * ⚠️ SUPPRESSED ENTIRELY WHILE LAYOUT MODE IS ON. The two modes both act on
   * rails and would otherwise sit one on top of the other — the scrim already
   * covers the button (see `RailDismissButton.css`), but rendering a control
   * the user cannot reach is worse than not rendering it. Layout mode is for
   * arranging rails; dismissing one mid-arrangement is not a thing to do.
   */
  const railDismiss = useMemo(() => {
    if (layoutMode) return undefined;
    return Object.fromEntries(
      DISMISSABLE_RAILS.map((rail) => [
        rail,
        <RailDismissButton
          key={rail}
          label={RAIL_LABELS[rail]}
          // ⚠️ The rail's CURRENT PLACEMENT, not its name. The handle runs
          // along the rail's canvas-facing edge, and the rail called `left`
          // may well be sitting on the right — `slotSide` is the one place
          // that question is answered.
          edge={rail === "bottom" ? layout.bottom.edge : slotSide(layout[rail].slot)}
          onDismiss={() => viewport.setRailHidden(rail, true)}
        />,
      ]),
    );
    // `layout` is a dependency because the handle's edge follows the rail.
  }, [layoutMode, layout, viewport]);

  /**
   * The picker over the canvas — the fourth scrim layout mode raises.
   *
   * ⚠️ Its own `useMemo`, NOT folded into `railOverlays` below. The two have
   * genuinely different dependencies: the rail scrims depend on the layout,
   * the picker also depends on the SAVED PRESET LIST, which changes when the
   * user saves or deletes one and not otherwise. Sharing one memo would
   * rebuild all four scrims on a save, and — worse — would make the picker's
   * dependency on `availablePresets` invisible in the dependency array.
   */
  const canvasOverlay = useMemo(() => {
    if (!layoutMode) return undefined;
    return (
      <LayoutPresetPicker
        presets={presets}
        current={layout}
        activeId={activePresetId}
        deviceLabel={DEVICE_LABELS[store.deviceClass] ?? DEVICE_LABELS.desktop}
        onApply={(preset) => store.applyLayoutPreset(preset)}
        onSaveCurrent={(name) => store.saveCurrentAsPreset(name)}
        onDeletePreset={(preset) => store.deleteLayoutPreset(preset.id)}
      />
    );
  }, [layoutMode, layout, presets, activePresetId, store]);

  const railOverlays = useMemo(() => {
    if (!layoutMode) return undefined;

    const scaleStep = (rail: "left" | "right" | "bottom") =>
      RAIL_SCALES.indexOf(layout[rail].scale) + 1;

    return {
      left: (
        <RailLayoutOverlay
          label={RAIL_LABELS.left}
          move={{
            kind: "arrows",
            onMoveLeft: () => store.stepRail("left", -1),
            onMoveRight: () => store.stepRail("left", 1),
            canMoveLeft: store.canStepRail("left", -1),
            canMoveRight: store.canStepRail("left", 1),
          }}
          scale={{
            onScaleUp: () => store.scaleRail("left", 1),
            onScaleDown: () => store.scaleRail("left", -1),
            canScaleUp: store.canScaleRail("left", 1),
            canScaleDown: store.canScaleRail("left", -1),
            step: scaleStep("left"),
            count: RAIL_SCALES.length,
          }}
        />
      ),
      right: (
        <RailLayoutOverlay
          label={RAIL_LABELS.right}
          move={{
            kind: "arrows",
            onMoveLeft: () => store.stepRail("right", -1),
            onMoveRight: () => store.stepRail("right", 1),
            canMoveLeft: store.canStepRail("right", -1),
            canMoveRight: store.canStepRail("right", 1),
          }}
          scale={{
            onScaleUp: () => store.scaleRail("right", 1),
            onScaleDown: () => store.scaleRail("right", -1),
            canScaleUp: store.canScaleRail("right", 1),
            canScaleDown: store.canScaleRail("right", -1),
            step: scaleStep("right"),
            count: RAIL_SCALES.length,
          }}
        />
      ),
      // ⚠️ The toolbar gets a four-way COMPASS, not the side rails' stepper:
      // it locks to an edge rather than stepping through an ordered track,
      // so each arrow names its destination directly.
      toolbar: (
        <RailLayoutOverlay
          label={RAIL_LABELS.toolbar}
          move={{
            kind: "edges",
            edge: layout.toolbar.edge,
            onSetEdge: (edge) => store.setToolbarEdge(edge),
          }}
          // ⚠️ NO `scale` — the toolbar is sized by its own controls, so a
          // scale step would be a setting with nothing to apply it to
          // (owner, 2026-08-28). It gets `spread` INSTEAD: more lines is what
          // actually helps when the tools run past the edge of a one-row bar.
          spread={{
            onMore: () => store.stepToolbarSpread(1),
            onFewer: () => store.stepToolbarSpread(-1),
            canMore: store.canStepToolbarSpread(1),
            canFewer: store.canStepToolbarSpread(-1),
          }}
          // `compact` drops the label: the rail is 36px tall docked
          // horizontally and has no room for one.
          compact
        />
      ),
      bottom: (
        <RailLayoutOverlay
          label={RAIL_LABELS.bottom}
          horizontal
          move={{
            kind: "flip",
            onFlip: () => store.flipBottomEdge(),
            edge: layout.bottom.edge,
          }}
          scale={{
            onScaleUp: () => store.scaleRail("bottom", 1),
            onScaleDown: () => store.scaleRail("bottom", -1),
            canScaleUp: store.canScaleRail("bottom", 1),
            canScaleDown: store.canScaleRail("bottom", -1),
            step: scaleStep("bottom"),
            count: RAIL_SCALES.length,
          }}
        />
      ),
    };
  }, [layoutMode, layout, store]);

  return {
    layout,
    railOverlays,
    canvasOverlay,
    railDismiss,
    hiddenRails,
    toast,
  };
}
