/**
 * EyedropperModeMenu — the eyedropper's two post-sample behaviours.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ IT IS ANCHORED TO A TOOL BUTTON, SO IT CANNOT LIVE IN THE TOOL BUTTON
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The toolbar docks to any of four edges and may spread over up to three
 * lines (`Toolbar.css`), and a menu positioned relative to the button would
 * have to know which. It does not: it is `position: absolute` inside
 * `.toolbar__tool-anchor` — a wrapper holding the tool button and this menu
 * as SIBLINGS — and flips itself with the same `--edge` modifier the toolbar
 * already carries, so a bottom-docked toolbar opens it upward instead of
 * off-screen.
 *
 * ⚠️ Sibling, not child, and that is not a style choice: a menu of `<button>`
 * rows nested inside the tool `<button>` is invalid HTML, and browsers
 * recover by hoisting the inner buttons OUT of the parent — which breaks the
 * positioning and the clicks together.
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
import { useEffect, useRef } from "react";
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
}

export function EyedropperModeMenu({
  mode,
  onSelectMode,
  onClose,
  edge = "top",
}: EyedropperModeMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Outside click + Escape, the same pair `AiConfigPopover` uses.
  //
  // ⚠️ `pointerdown`, NOT `mousedown`: the menu is opened by a long press on
  // an iPad, where a `mousedown` listener attached during that very gesture
  // is not what dismisses it. Pointer events cover pen, touch and mouse in
  // one path — the same reason `useLongPress` uses them.
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
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
  }, [onClose]);

  return (
    <div
      ref={rootRef}
      className={classNames(
        "eyedropper-mode-menu",
        `eyedropper-mode-menu--${edge}`,
      )}
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
}
