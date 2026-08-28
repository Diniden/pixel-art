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
import { useMemo, type ReactNode } from "react";
import { RailLayoutOverlay } from "../../ui/components/RailLayoutOverlay/RailLayoutOverlay";
import { RAIL_SCALES, type RailLayout } from "../../ui/layout/railLayout";
import { useStores } from "../../stores/context";

export interface RailLayoutProps {
  layout: RailLayout;
  railOverlays?: Partial<
    Record<"left" | "right" | "bottom" | "toolbar", ReactNode>
  >;
}

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
          // (owner, 2026-08-28). `compact` drops the label too: the rail is
          // 36px tall docked horizontally and has no room for one.
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

  return { layout, railOverlays };
}
