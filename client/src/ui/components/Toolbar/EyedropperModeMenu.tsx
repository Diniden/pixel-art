/**
 * EyedropperModeMenu — the eyedropper's two post-sample behaviours.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ IT IS ANCHORED TO A TOOL BUTTON, SO IT CANNOT LIVE IN THE TOOL BUTTON
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ IT MUST BE A PORTAL. `.toolbar` is a scroll container — `overflow-x:
 * auto` with `overflow-y: hidden` on a 36px-tall bar (`Toolbar.css`) — and an
 * absolutely-positioned menu inside it is CLIPPED OUT OF EXISTENCE: the menu
 * opens, the state flips, every handler runs, and the user sees nothing at
 * all. That was the first implementation of this component, and it is why
 * `position: fixed` in a `document.body` portal is not a refinement here but
 * the only thing that works. A jsdom test cannot catch it: jsdom does no
 * layout and no clipping, so the DOM assertions pass either way.
 *
 * The trigger's rect is measured on open and the menu is placed against it,
 * the same approach the `Tooltip` primitive uses to escape this very toolbar.
 * It flips to whichever side has room, so a bottom-docked bar opens the menu
 * upward rather than off-screen.
 *
 * ⚠️ It is also NOT a child of the tool `<button>`: a menu of `<button>` rows
 * nested inside a `<button>` is invalid HTML, and browsers recover by
 * hoisting the inner buttons out. The portal settles that too.
 *
 * ── Why a distinct background (owner's request, and it is load-bearing) ────
 *
 * This menu overlaps the tool row it belongs to. With the toolbar's own
 * surface colour it reads as more toolbar — a second row of buttons — rather
 * than as a transient choice. `--bg-elevated` plus a ring makes it obviously
 * a layer ON TOP, which is what tells the user their next click goes here and
 * not to a tool.
 *
 * `ui/` boundary: React, an icon, `classNames`, its own CSS. No store.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pipette, Check } from "lucide-react";
import type { EyedropperMode } from "../../../types";
import { Icon } from "../../primitives/Icon/Icon";
import { classNames } from "../../classNames";
import "./EyedropperModeMenu.css";

/** The two modes, with the wording the menu shows. */
const MODES: {
  id: EyedropperMode;
  label: string;
  detail: string;
}[] = [
  {
    id: "revert",
    label: "Sample & return",
    detail: "Go back to the previous tool",
  },
  {
    id: "stay",
    label: "Sample & stay",
    detail: "Keep the eyedropper active",
  },
];

export interface EyedropperModeMenuProps {
  /** The mode currently in force — one row is ticked. */
  mode: EyedropperMode;
  /** Commits a mode. The caller closes the menu. */
  onSelectMode: (mode: EyedropperMode) => void;
  /** Dismiss without choosing (outside click, Escape). */
  onClose: () => void;
  /** Which edge the toolbar is docked to, so the menu opens inward. */
  edge?: "top" | "bottom" | "left" | "right";
  /**
   * The button the menu hangs off. Measured on open to place the portal.
   *
   * ⚠️ Passed as an element rather than a ref object so the menu re-measures
   * whenever the caller re-renders it with a different trigger.
   */
  anchorEl?: HTMLElement | null;
}

/** Gap between the trigger and the menu, in px. Matches `Tooltip`'s offset. */
const ANCHOR_GAP = 8;

export function EyedropperModeMenu({
  mode,
  onSelectMode,
  onClose,
  edge = "top",
  anchorEl,
}: EyedropperModeMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  /**
   * Measure the trigger and place the menu beside it.
   *
   * `useLayoutEffect` so the position is set before the browser paints —
   * with a plain `useEffect` the menu flashes at the top-left corner for one
   * frame before jumping into place.
   *
   * ⚠️ It measures the MENU too, and clamps to the viewport. A toolbar docked
   * to the bottom or right would otherwise open the menu off-screen, which is
   * the same class of bug as the clipping this portal exists to fix — just
   * harder to notice, because it only bites in two of the four dock edges.
   */
  useLayoutEffect(() => {
    if (!anchorEl) return;
    const a = anchorEl.getBoundingClientRect();
    const m = rootRef.current?.getBoundingClientRect();
    const w = m?.width ?? 190;
    const h = m?.height ?? 0;

    // Vertical docks push the menu out sideways; horizontal ones drop it
    // below (or lift it above, when the bar is at the bottom).
    const isVertical = edge === "left" || edge === "right";
    let left = isVertical
      ? edge === "left"
        ? a.right + ANCHOR_GAP
        : a.left - w - ANCHOR_GAP
      : a.left;
    let top = isVertical
      ? a.top
      : edge === "bottom"
        ? a.top - h - ANCHOR_GAP
        : a.bottom + ANCHOR_GAP;

    // Clamp into the viewport, so no dock edge can strand it off-screen.
    left = Math.max(
      ANCHOR_GAP,
      Math.min(left, window.innerWidth - w - ANCHOR_GAP),
    );
    top = Math.max(
      ANCHOR_GAP,
      Math.min(top, window.innerHeight - h - ANCHOR_GAP),
    );

    setPosition({ left, top });
  }, [anchorEl, edge]);

  // Outside click + Escape, the same pair `AiConfigPopover` uses.
  //
  // ⚠️ `pointerdown`, NOT `mousedown`: the menu is opened by a long press on
  // an iPad, where a `mousedown` listener attached during that very gesture
  // is not what dismisses it. Pointer events cover pen, touch and mouse in
  // one path — the same reason `useLongPress` uses them.
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      // ⚠️ The ANCHOR counts as inside. The menu is a portal, so it is no
      // longer a DOM descendant of the button that opened it — without this
      // the press that opens the menu (or the one that toggles it shut)
      // registers as an outside click on the very gesture that started it.
      if (anchorEl?.contains(target)) return;
      if (rootRef.current && !rootRef.current.contains(target)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, anchorEl]);

  const menu = (
    <div
      ref={rootRef}
      className={classNames(
        "eyedropper-mode-menu",
        `eyedropper-mode-menu--${edge}`,
      )}
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        // Hidden for the one frame before the measure lands, so the menu
        // never flashes in the corner on its way to the anchor.
        visibility: position ? "visible" : "hidden",
      }}
      role="menu"
      aria-label="Eyedropper mode"
      // The menu is a SIBLING of the tool button now, not a child, so a click
      // in here no longer bubbles through it. This stays as a guard for the
      // toolbar's own delegated handlers above: a click that chooses a mode
      // must never also read as a click on the tool row.
      onClick={(e) => e.stopPropagation()}
    >
      <div className="eyedropper-mode-menu__title">
        <span className="eyedropper-mode-menu__title-icon">
          <Icon icon={Pipette} size={12} />
        </span>
        Eyedropper mode
      </div>
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          role="menuitemradio"
          aria-checked={m.id === mode}
          className={classNames(
            "eyedropper-mode-menu__item",
            m.id === mode && "eyedropper-mode-menu__item--selected",
          )}
          onClick={() => onSelectMode(m.id)}
        >
          <span className="eyedropper-mode-menu__check">
            {m.id === mode ? <Icon icon={Check} size={12} /> : null}
          </span>
          <span className="eyedropper-mode-menu__text">
            <span className="eyedropper-mode-menu__label">{m.label}</span>
            <span className="eyedropper-mode-menu__detail">{m.detail}</span>
          </span>
        </button>
      ))}
    </div>
  );

  return createPortal(menu, document.body);
}
