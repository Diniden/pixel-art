/**
 * BrushChannelMenu — a brush layer's channel-type and applied-group chooser
 * (Brush Studio plan, `docs/01-brush-studio`, task 12).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠️ IT MUST BE A PORTAL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The panel sits in the left rail, which scrolls. An in-flow menu — the
 * `ui/primitives/Dropdown` — is clipped inside that scroller: it opens, the
 * state flips, and the user sees nothing. `position: fixed` in a
 * `document.body` portal is the only thing that works, so this copies
 * `Toolbar/EyedropperModeMenu.tsx` wholesale: measure the anchor on open,
 * clamp to the viewport, dismiss on outside `pointerdown` or Escape. jsdom
 * cannot observe the clipping; the DOM test asserts the parentage instead.
 *
 * ── Three sections, one menu ──────────────────────────────────────────────
 *
 * "Colour source" (plan 13, task 03) appears only when the caller passes
 * `onSelectColorSource`: two `menuitemradio` rows, `BRUSH_COLOR_SOURCES` in
 * order, ABOVE the channels so the creation flow reads source-then-channel.
 * "Channels" is always there: four `menuitemradio` rows, one per
 * `BRUSH_CHANNEL_TYPES` entry. "Applied group" appears only when the caller
 * passes `onSelectAppliedGroup` — the header's add-layer button reuses this
 * menu to pick a NEW layer's source and channel and has no group to assign.
 * "New group…" swaps itself for an inline input + confirm; Enter or the tick
 * commits.
 *
 * ── Keyboard ──────────────────────────────────────────────────────────────
 * Arrow keys / Home / End move focus across the rows (wrapping), Enter and
 * Space activate (native `<button>` behaviour), Escape closes. Inside the
 * new-group input the arrows belong to the input, and Escape only abandons
 * the draft — a second Escape closes the menu.
 *
 * Every selection callback is the CALLER's cue to close (or, for the
 * creation menu's colour source, to tick and stay open — MASTER D3), exactly
 * as with the eyedropper menu; nothing here closes itself except the
 * dismissals.
 *
 * `ui/` boundary: React, react-dom, lucide, the brush types, `classNames`
 * and the panel stylesheet. No store, no MobX, no context.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Plus } from "lucide-react";
import {
  BRUSH_CHANNELS,
  BRUSH_CHANNEL_TYPES,
  BRUSH_COLOR_SOURCES,
  BRUSH_COLOR_SOURCE_LABEL,
  type BrushAppliedGroup,
  type BrushChannelType,
  type BrushColorSource,
} from "../../../types";
import { Icon } from "../../primitives/Icon/Icon";
import { classNames } from "../../classNames";
import "./BrushChannelMenu.css";

/** The wording each channel row shows; the badge text lives on the row. */
const CHANNEL_LABEL: Record<BrushChannelType, string> = {
  hsl: "HSL",
  rgb: "RGB",
  normal: "Normal",
  heightmap: "Heightmap",
};

/** The second line of each colour-source row; the label comes from the types. */
const COLOR_SOURCE_DETAIL: Record<BrushColorSource, string> = {
  selected: "Deltas apply to the colour you picked",
  target:
    "Deltas apply to the pixel already on the canvas — burns, fades, tints",
};

export interface BrushChannelMenuProps {
  /**
   * The button the menu hangs off. Measured on open to place the portal.
   * An element, not a ref object, so a re-render with a new trigger
   * re-measures.
   */
  anchorEl: HTMLElement | null;
  /** The channel in force — that row is ticked. `null` when picking for a new layer. */
  channelType: BrushChannelType | null;
  /** Commits a channel. The caller closes the menu. */
  onSelectChannelType: (type: BrushChannelType) => void;
  /** Dismiss without choosing (outside click, Escape). */
  onClose: () => void;

  /** The colour source in force — that row is ticked. `null` ticks nothing. */
  colorSource?: BrushColorSource | null;
  /**
   * Commits a colour source. Supplying this is what SHOWS the "Colour
   * source" section. Whether the caller closes is the caller's business:
   * the row closes, the creation menu ticks and stays open.
   */
  onSelectColorSource?: (source: BrushColorSource) => void;

  /** The existing applied groups, in display order. */
  appliedGroups?: ReadonlyArray<BrushAppliedGroup>;
  /** The group in force; `null` means "None". */
  selectedGroupId?: string | null;
  /**
   * Commits a group (`null` = none). Supplying this is what SHOWS the
   * "Applied group" section; omit it for a channel-only menu.
   */
  onSelectAppliedGroup?: (groupId: string | null) => void;
  /** Commits a new group by name (trimmed, never empty). The caller closes. */
  onCreateAppliedGroup?: (name: string) => void;

  /** Accessible name of the menu. */
  label?: string;
}

/** Gap between the trigger and the menu, in px. */
const ANCHOR_GAP = 4;

/** Every focusable row, in DOM order, for the roving keyboard focus. */
const ITEM_SELECTOR =
  '[role="menuitemradio"]:not(:disabled), [role="menuitem"]:not(:disabled)';

export function BrushChannelMenu({
  anchorEl,
  channelType,
  onSelectChannelType,
  onClose,
  colorSource = null,
  onSelectColorSource,
  appliedGroups = [],
  selectedGroupId = null,
  onSelectAppliedGroup,
  onCreateAppliedGroup,
  label = "Layer channel",
}: BrushChannelMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  /** `null` = the "New group…" row; a string = the inline draft. */
  const [draft, setDraft] = useState<string | null>(null);
  const creating = draft !== null;
  const showColorSource = onSelectColorSource !== undefined;
  const showGroups = onSelectAppliedGroup !== undefined;

  /**
   * Measure the trigger and drop the menu below it, clamped to the viewport.
   * `useLayoutEffect` so it never flashes at the corner for a frame. Re-runs
   * when the new-group input appears, because that changes the menu's height
   * and a bottom-clamped menu must move up to stay on screen.
   */
  useLayoutEffect(() => {
    if (!anchorEl) return;
    const a = anchorEl.getBoundingClientRect();
    const m = rootRef.current?.getBoundingClientRect();
    const w = m?.width ?? 200;
    const h = m?.height ?? 0;
    const left = Math.max(
      ANCHOR_GAP,
      Math.min(a.left, window.innerWidth - w - ANCHOR_GAP),
    );
    const top = Math.max(
      ANCHOR_GAP,
      Math.min(a.bottom + ANCHOR_GAP, window.innerHeight - h - ANCHOR_GAP),
    );
    setPosition({ left, top });
  }, [anchorEl, creating]);

  // Outside pointerdown + Escape. `pointerdown`, not `mousedown`, so pen,
  // touch and mouse share one path. The ANCHOR counts as inside: the menu is
  // a portal, so it is no longer a DOM descendant of the badge that opened
  // it, and the press that toggles it shut would otherwise read as outside.
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (anchorEl?.contains(target)) return;
      if (rootRef.current && !rootRef.current.contains(target)) onClose();
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

  // Focus the ticked row on open (else the first), and hand focus back to
  // the trigger on close unless something else already took it.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
    const ticked = items.find((i) => i.getAttribute("aria-checked") === "true");
    (ticked ?? items[0])?.focus();
    return () => {
      const active = document.activeElement;
      const focusWasInside =
        !active || active === document.body || root.contains(active);
      if (focusWasInside && anchorEl?.isConnected) anchorEl.focus();
    };
  }, [anchorEl]);

  const commitDraft = () => {
    const name = (draft ?? "").trim();
    if (!name) return;
    onCreateAppliedGroup?.(name);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT") {
      if (e.key === "Escape") {
        // Abandon the draft only; the document listener must not see this
        // one, or the whole menu would go with it.
        e.stopPropagation();
        setDraft(null);
      } else if (e.key === "Enter") {
        e.preventDefault();
        commitDraft();
      }
      return;
    }
    const items = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? [],
    );
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next: number;
    switch (e.key) {
      case "ArrowDown":
        next = current < 0 ? 0 : (current + 1) % items.length;
        break;
      case "ArrowUp":
        next =
          current < 0
            ? items.length - 1
            : (current - 1 + items.length) % items.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = items.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    items[next].focus();
  };

  const radio = (
    key: string,
    checked: boolean,
    onPick: () => void,
    text: string,
    detail?: string,
  ) => (
    <button
      key={key}
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      className={classNames(
        "brush-layer-panel__menu-item",
        checked && "brush-layer-panel__menu-item--selected",
      )}
      onClick={onPick}
    >
      <span className="brush-layer-panel__menu-check">
        {checked ? <Icon icon={Check} size={12} /> : null}
      </span>
      <span className="brush-layer-panel__menu-text">
        <span className="brush-layer-panel__menu-label">{text}</span>
        {detail ? (
          <span className="brush-layer-panel__menu-detail">{detail}</span>
        ) : null}
      </span>
    </button>
  );

  const menu = (
    <div
      ref={rootRef}
      className="brush-layer-panel__menu"
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        // Hidden for the one frame before the measure lands.
        visibility: position ? "visible" : "hidden",
      }}
      role="menu"
      aria-label={label}
      // React events bubble through portals along the COMPONENT tree, so a
      // click in here would otherwise reach the row's onClick and select it.
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      {showColorSource && (
        <>
          <div className="brush-layer-panel__menu-title">Colour source</div>
          {BRUSH_COLOR_SOURCES.map((s) =>
            radio(
              `source-${s}`,
              s === colorSource,
              () => onSelectColorSource(s),
              BRUSH_COLOR_SOURCE_LABEL[s],
              COLOR_SOURCE_DETAIL[s],
            ),
          )}
        </>
      )}

      <div className="brush-layer-panel__menu-title">Channels</div>
      {BRUSH_CHANNEL_TYPES.map((t) =>
        radio(
          t,
          t === channelType,
          () => onSelectChannelType(t),
          CHANNEL_LABEL[t],
          BRUSH_CHANNELS[t].join(" · "),
        ),
      )}

      {showGroups && (
        <>
          <div className="brush-layer-panel__menu-title">Applied group</div>
          {radio(
            "none",
            selectedGroupId === null,
            () => onSelectAppliedGroup(null),
            "None",
          )}
          {appliedGroups.map((g) =>
            radio(
              g.id,
              g.id === selectedGroupId,
              () => onSelectAppliedGroup(g.id),
              g.name,
            ),
          )}
          {creating ? (
            <div className="brush-layer-panel__menu-new-group">
              <input
                ref={(el) => el?.focus()}
                type="text"
                className="brush-layer-panel__menu-input"
                value={draft}
                placeholder="Group name"
                aria-label="New group name"
                onChange={(e) => setDraft(e.target.value)}
              />
              <button
                type="button"
                className="brush-layer-panel__menu-confirm"
                aria-label="Create group"
                title="Create group"
                disabled={draft.trim().length === 0}
                onClick={commitDraft}
              >
                <Icon icon={Check} size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="brush-layer-panel__menu-item"
              onClick={() => setDraft("")}
            >
              <span className="brush-layer-panel__menu-check">
                <Icon icon={Plus} size={12} />
              </span>
              <span className="brush-layer-panel__menu-text">
                <span className="brush-layer-panel__menu-label">
                  New group…
                </span>
              </span>
            </button>
          )}
        </>
      )}
    </div>
  );

  return createPortal(menu, document.body);
}
