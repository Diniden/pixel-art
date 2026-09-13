/**
 * AppShell — the chrome BOTH editor layouts share (REFRESH task 37).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 THIS IS A COMPONENT, NOT A LAYOUT — AND THE DISTINCTION IS LOAD-BEARING
 * ══════════════════════════════════════════════════════════════════════════
 *
 * It composes five page regions, which *sounds* like a layout. It is not, and
 * the membership rule is one question: **does this decide what page you are
 * looking at?** `AppShell` does not. `PixelStudioLayout` and
 * `LightingStudioLayout` BOTH render it, so it cannot be the thing that
 * distinguishes them — it is the frame two different pages hang inside.
 *
 * Putting it in `ui/layouts/` would make the layout tree self-contradictory:
 * a layout that renders another layout, with the inner one unable to say which
 * of its two outer callers it is serving.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 PURITY BAR — the import list below is the whole proof
 * ══════════════════════════════════════════════════════════════════════════
 *
 * W24's `CanvasSurface`, W25's `LightingSurface` and W26's `ZoomControls` each
 * import ONLY React types and their own CSS. This file matches that bar: React
 * types, its own CSS, and two SIBLING `ui/` modules — `railLayout` (pure data
 * and pure functions) and `classNames`. No store, no API, no MobX, no
 * `useContext`, no hook of any kind — not even for types.
 *
 * That is what makes "the layout stories need no provider" a STRUCTURAL
 * guarantee rather than an assertion someone has to re-check. There is no
 * import through which a store could arrive, so there is no code path by which
 * a story could need one.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🏁 THE RAILS ARE PLACED BY DATA, NOT BY THEIR NAMES (2026-08-25)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `leftPanel` and `rightPanel` are named for the CONTENT they carry — Objects
 * + Layers, and the tool/studio controls — not for where they end up. The
 * `layout` prop decides placement, and after the user has re-arranged things
 * the `leftPanel` may legitimately render as the right-most column. Reading
 * the prop names as positions is the one mistake to avoid in this file.
 *
 * The shell renders the horizontal track in SCREEN order:
 *
 *      [rails on the left]  CANVAS  [rails on the right]
 *
 * `railsOnSide()` returns each half already sorted by slot index, so the JSX
 * below has no ordering logic of its own and no way to disagree with the
 * model. Both rails on one side is a legal, reachable arrangement — that is
 * exactly what "click the left rail's right-arrow once" produces — and it
 * needs no special case here: one side's array simply has two entries and the
 * other's has none.
 *
 * A rail's SIZE is a zoom, not a width: the scale step becomes a
 * `transform: scale()` on that rail's scroll container, so the controls
 * inside actually grow rather than merely reflowing into more space. The
 * rail's footprint is derived from the same factor so the scaled contents
 * stay inside their own column. `AppShell.css` holds all of that — the
 * shell's only job here is to put the step on the element as a class.
 *
 * ── Focus mode is STILL expressed by ABSENCE, not by a flag ───────────────
 *
 * `leftPanel` and `bottomPanel` are optional. Focus mode is the caller passing
 * neither. `AppShell` therefore has no `focusMode` prop and no idea the concept
 * exists. A rail that is not rendered gets no overlay either, which is why
 * layout mode simply shows fewer controls in focus mode rather than needing to
 * know about it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ `canvas-area` IS A RUNTIME DOM HOOK — BOTH CLASSES ARE REQUIRED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The `<main>` carries TWO class names: `app__canvas-area` (the BEM block that
 * styles it) and the bare legacy `canvas-area` (a query selector, with no rule
 * attached to it in `AppShell.css`). Eight `document.querySelector(
 * '.canvas-area')` sites in `ReferenceImagePanel` / `FrameReferencePanel`
 * resolve the shell's canvas viewport by that literal name. Dropping it breaks
 * reference-image positioning SILENTLY — no type error, no test failure, no
 * lint warning. Task 21 documented the hazard in `AppShell.css`'s header when
 * it converted the block; this is the render site it was warning about.
 *
 * ⚠️ **No class name in this file was renamed by task 37.** The markup is
 * transcribed from `App.tsx:232-292` character-for-character on the class
 * attributes, including the `--open` modifier that is applied unconditionally
 * (the legacy markup hard-coded it; a collapsed-sidebar state was never wired).
 * The 2026-08-25 layout work ADDED modifiers (`--slot-*`, `--scale-*`) and
 * renamed nothing.
 */
import type { ReactNode, RefObject } from "react";
import {
  DEFAULT_RAIL_LAYOUT,
  railsOnSide,
  type RailLayout,
  type SideRailName,
} from "../../layout/railLayout";
import { classNames } from "../../classNames";
import "./AppShell.css";

export interface AppShellProps {
  header: ReactNode;
  toolbar: ReactNode;
  /** Left sidebar. Omit (or pass null) to hide — this is focus mode. */
  leftPanel?: ReactNode;
  rightPanel: ReactNode;
  /** Bottom timeline. Omit to hide — focus mode again. */
  bottomPanel?: ReactNode;
  /** The centre region: canvas + its floating panels + info strip. */
  children: ReactNode;
  /**
   * Where each rail sits and how big it is. Omitted, the shell renders the
   * historical arrangement — which is what every story and every project
   * that has never opened the Layout menu gets.
   */
  layout?: RailLayout;
  /**
   * The layout-mode scrim for one rail, by rail NAME (not by position).
   * Rendered inside that rail so it tracks the rail automatically. Absent
   * entries render nothing, which is how layout mode stays off.
   */
  railOverlays?: Partial<
    Record<"left" | "right" | "bottom" | "toolbar", ReactNode>
  >;
  /**
   * The layout-mode scrim for the CANVAS AREA — the layout picker.
   *
   * ⚠️ Deliberately NOT a fifth entry in `railOverlays`. That record is keyed
   * by RAIL, and the canvas is not a rail: it has no slot, no scale and no
   * placement of its own. Widening the key union would let a caller write
   * `railOverlays.canvas` and then find that `renderSide` and the footer have
   * nothing to do with it — a key that is legal to set and silently ignored.
   * A separate prop cannot be mis-set that way.
   *
   * Like the rail scrims, it is `position: absolute` against a region that is
   * already positioned, so it tracks that region through every rail
   * arrangement with no measurement.
   *
   * ⚠️ That region is `app__canvas-stack`, NOT `app__canvas-area`. The area
   * also holds the toolbar dock; a scrim filling it would cover the toolbar
   * and its layout overlay (owner, 2026-08-30). See the render site.
   */
  canvasOverlay?: ReactNode;
  /**
   * The dismiss (×) button for one rail, by rail NAME.
   *
   * Injected as elements for the same reason the scrims are: `AppShell` is
   * `ui/` and cannot know whether a rail is dismissable or what pressing the
   * button should do. Absent entries render nothing, which is how a build
   * without the feature — and every story — is unaffected.
   *
   * ⚠️ Rendered as a SIBLING of the rail's panel viewport, and it takes over
   * that rail's canvas-facing BORDER — the shell suppresses its own 1px rule
   * on any edge that has one (`--has-handle`), or the two would stack into a
   * double line. A rail that is not rendered gets no handle, which is
   * correct: there is nothing to hide.
   */
  railDismiss?: Partial<Record<"left" | "right" | "bottom", ReactNode>>;
  /**
   * Ref for the canvas area — `FloatingPanel` needs it as its drag bounds.
   *
   * `RefObject<HTMLElement | null>` rather than the spec's
   * `RefObject<HTMLElement>`: React 19's `useRef<HTMLElement>(null)` produces
   * the nullable form, so the spec's signature would reject every real caller.
   * Measured against `LightingPreviewPanelContainer`, which already uses the
   * nullable shape for exactly this reason.
   */
  canvasAreaRef?: RefObject<HTMLElement | null>;
}

export function AppShell({
  header,
  toolbar,
  leftPanel,
  rightPanel,
  bottomPanel,
  children,
  layout = DEFAULT_RAIL_LAYOUT,
  railOverlays,
  canvasOverlay,
  railDismiss,
  canvasAreaRef,
}: AppShellProps) {
  /** The content each rail NAME carries. A missing entry is focus mode. */
  const content: Record<SideRailName, ReactNode> = {
    left: leftPanel,
    right: rightPanel,
  };

  const renderSide = (side: "left" | "right") =>
    railsOnSide(layout, side)
      // A rail with no content is focus mode: render nothing, not an empty
      // column.
      .filter((rail) => content[rail] != null)
      .map((rail) => (
        <aside
          key={rail}
          className={classNames(
            "app__side-panel",
            // ⚠️ Identity, not position: this modifier names WHICH rail
            // this is, so a selector or a test written against the
            // Objects-and-Layers rail keeps matching it wherever the user
            // has moved it to. Placement is the separate `--at-*` modifier
            // below, and that is what carries the borders and the pinning.
            `app__side-panel--${rail}`,
            "app__side-panel--open",
            `app__side-panel--at-${side}`,
            `app__side-panel--scale-${layout[rail].scale}`,
            // ⚠️ Suppresses this rail's own inner border, because the handle
            // supplies a thicker one in its place. Keyed off the handle
            // actually being rendered, so a caller that passes none keeps the
            // historical border exactly.
            railDismiss?.[rail] != null && "app__side-panel--has-handle",
          )}
        >
          {/* ⚠️ TWO elements, and the split is load-bearing (see the CSS).
              The VIEWPORT takes the rail's flex space and does not scroll;
              the SCROLLER inside it is what the transform scales. Merging
              them back into one element puts `flex: 1`, `overflow: auto` and
              a counter-sized `height` on the same box, and the scroll
              viewport then resolves against an indefinite height — which is
              what broke scrolling in a scaled rail. */}
          <div className="app__panel-viewport">
            <div className="app__panel-scroll">{content[rail]}</div>
          </div>
          {/* ⚠️ OUTSIDE the viewport, and before the scrim. Outside, so the
              scaled panel contents do not scale the button too; before, so
              layout mode's overlay covers it — a rail must not be
              dismissable from under its own layout scrim. */}
          {railDismiss?.[rail]}
          {railOverlays?.[rail]}
        </aside>
      ));

  const bottom = bottomPanel ? (
    <footer
      className={classNames(
        "app__bottom",
        `app__bottom--at-${layout.bottom.edge}`,
        `app__bottom--scale-${layout.bottom.scale}`,
        railDismiss?.bottom != null && "app__bottom--has-handle",
      )}
    >
      {/* ⚠️ The scaled contents live in their OWN wrapper, so the transform
          does not also apply to the layout-mode scrim below — a scaled scrim
          would no longer cover the rail it is dimming. The side rails get
          this for free: their scrim is a sibling of the panel viewport. */}
      <div className="app__bottom-scale">{bottomPanel}</div>
      {railDismiss?.bottom}
      {railOverlays?.bottom}
    </footer>
  ) : null;

  return (
    <div className="app">
      {header}

      {/* The bottom rail flipped to the top sits directly under the header
          and above the main row — the same element, a different position in
          the flex column. */}
      {layout.bottom.edge === "top" ? bottom : null}

      <div className="app__main">
        {renderSide("left")}

        {/* Center - Canvas & Toolbar. ⚠️ `canvas-area` is a query hook.

            The toolbar docks to any of the four edges. `--toolbar-<edge>`
            sets the flex direction and the order, so which side it lands on
            is CSS rather than four branches of JSX — and the canvas keeps
            exactly one DOM position, which matters because eight
            `querySelector('.canvas-area')` sites resolve it by name. */}
        <main
          ref={canvasAreaRef}
          className={classNames(
            "app__canvas-area",
            "canvas-area",
            `app__canvas-area--toolbar-${layout.toolbar.edge}`,
          )}
        >
          {/* The toolbar and its layout-mode scrim travel together: the
              scrim is `inset: 0` against this wrapper, so it tracks the
              toolbar to whichever edge it is on with no measurement. */}
          {/* ⚠️ NO scale modifier. The toolbar does not resize (owner,
              2026-08-28): it is sized by its own controls, so a scale step
              would be a setting with nothing to apply it to. `toolbar.scale`
              survives in the type and the persisted record so an older
              layout round-trips unchanged, but nothing reads it. */}
          <div className="app__toolbar-dock">
            {toolbar}
            {railOverlays?.toolbar}
          </div>
          {/* ⚠️ The canvas content STAYS A COLUMN whatever edge the toolbar
              takes, and this wrapper is what guarantees it.

              Its children (`canvas`, `canvas-info`, `layer-colors`) were
              written as full-width rows stacked vertically. Docking the
              toolbar left/right turns the canvas AREA into a row, and
              without this wrapper those three become the row's siblings and
              compete horizontally — measured: `canvas-info` and
              `layer-colors` are `flex: 0 0 auto`, so they each took the full
              1280px and squeezed the canvas to ZERO width. The wrapper keeps
              them in their own column and lets only the dock share the
              canvas area's axis. */}
          {/* ⚠️ The picker lives INSIDE the canvas stack, NOT beside it in
              the canvas area. The area also contains the toolbar dock, so a
              scrim spanning the area covers the TOOLBAR — including the
              toolbar's own layout overlay, which is the one control layout
              mode most needs reachable. The stack is precisely the canvas
              area minus the dock, on every one of the four toolbar edges,
              because the dock is the area's other flex child. */}
          <div className="app__canvas-stack">
            {children}
            {/* Last child, so it stacks over the canvas and its floating
                panels without either needing to know it exists. */}
            {canvasOverlay}
          </div>
        </main>

        {renderSide("right")}
      </div>

      {layout.bottom.edge === "bottom" ? bottom : null}
    </div>
  );
}
