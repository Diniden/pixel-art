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
 * import ONLY React types and their own CSS. This file matches that bar
 * exactly: one `import type` from React, one CSS import, nothing else. No
 * store, no API, no MobX, no `useContext`, no hook of any kind — not even for
 * types.
 *
 * That is what makes "the layout stories need no provider" a STRUCTURAL
 * guarantee rather than an assertion someone has to re-check. There is no
 * import through which a store could arrive, so there is no code path by which
 * a story could need one.
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
 *
 * ── Focus mode is expressed by ABSENCE, not by a flag ──────────────────────
 *
 * `leftPanel` and `bottomPanel` are optional. Focus mode is the caller passing
 * neither. `AppShell` therefore has no `focusMode` prop and no idea the concept
 * exists — which is why it needs no branch to test and no story of its own for
 * the state. The layouts own the flag; the shell owns the markup.
 */
import type { ReactNode, RefObject } from "react";
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
  canvasAreaRef,
}: AppShellProps) {
  return (
    <div className="app">
      {header}

      <div className="app__main">
        {/* Left Panel - Objects & Layers. Absent in focus mode. */}
        {leftPanel ? (
          <aside className="app__side-panel app__side-panel--left app__side-panel--open">
            <div className="app__panel-scroll">{leftPanel}</div>
          </aside>
        ) : null}

        {/* Center - Canvas & Toolbar. ⚠️ `canvas-area` is a query hook. */}
        <main ref={canvasAreaRef} className="app__canvas-area canvas-area">
          {toolbar}
          {children}
        </main>

        {/* Right Panel - always present, in both studios. */}
        <aside className="app__side-panel app__side-panel--right app__side-panel--open">
          <div className="app__panel-scroll">{rightPanel}</div>
        </aside>
      </div>

      {/* Bottom Panel - Frame Timeline. Absent in focus mode. */}
      {bottomPanel ? (
        <footer className="app__bottom">{bottomPanel}</footer>
      ) : null}
    </div>
  );
}
