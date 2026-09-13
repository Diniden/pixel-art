/**
 * LayoutPresetPicker — the overlay over the CANVAS while layout mode is on.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE FOURTH OVERLAY, AND THE ONLY ONE THAT IS NOT PER-RAIL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Layout mode already dims each rail and offers the controls that rail owns
 * (`RailLayoutOverlay`). Those are per-rail by construction: an arrow that
 * moves the Tools rail belongs over the Tools rail. A PRESET is not any one
 * rail's business — it sets all four at once — so it has no rail to live in,
 * and the canvas is the one region layout mode otherwise leaves empty.
 *
 * It follows the rail overlays' structural trick rather than re-implementing
 * it: absolutely positioned against the region it dims, injected as a
 * `ReactNode` by a container. `AppShell` renders it inside `app__canvas-area`
 * and knows nothing about presets.
 *
 * ── ⚠️ IT STARTS COLLAPSED, AS ONE SMALL BUTTON (owner, 2026-08-30) ──────
 *
 * Layout mode's PRIMARY job is the per-rail controls, and a grid of cards
 * covering the whole canvas buries them: the user entered the mode to nudge
 * a rail and instead got a wall of alternatives. So the picker opens as a
 * single "Layout Presets" button in the middle of the canvas and expands only
 * when asked.
 *
 * The collapsed button is deliberately NOT a scrim. While it is closed the
 * canvas is fully visible and nothing is dimmed — there is nothing to dim,
 * because the button is not covering anything the user needs. The scrim
 * arrives with the grid and leaves with it.
 *
 * ── Cards, and why the thumbnail is generated ─────────────────────────────
 *
 * Each card is a thumbnail and a name. The thumbnail is rendered from the
 * preset's own `RailLayout` by `LayoutThumbnail`, so it is a demo of the
 * arrangement rather than a picture of one — see that file for why that
 * distinction was worth the code.
 *
 * ⚠️ THE DESCRIPTION IS NOT RENDERED ON THE CARD (owner, 2026-08-30). A card
 * is ~140px wide and the thumbnail plus the name already fill it; two more
 * lines of prose made every card taller than the grid could afford. The text
 * survives on `LayoutPreset` and is shown as the card's `title` tooltip, so
 * the explanation is still reachable on a desktop without costing the layout
 * any height. It is not dead data.
 *
 * ── ⚠️ SAVE IS A CARD, NOT A BUTTON ABOVE THE GRID ───────────────────────
 *
 * "Save current layout" sits in the grid as the last card, showing a
 * thumbnail of the CURRENT arrangement. That is the thing being saved, and
 * showing it in the same visual language as the presets is what makes the
 * action legible without a word of explanation: the user sees the shape they
 * are about to name, next to the shapes they could pick instead.
 *
 * `ui/` boundary: React, lucide icons, `railLayout` types, `classNames`, own
 * CSS. No store, no MobX, no API. Naming a preset is a controlled input owned
 * by this component's local state — a draft string that is never anywhere
 * else's business.
 */
import { useState } from "react";
import { Check, ChevronDown, LayoutGrid, Plus, Trash2, X } from "lucide-react";
import { Icon } from "../../primitives/Icon/Icon";
import { classNames } from "../../classNames";
import type { LayoutPreset } from "../../layout/layoutPresets";
import type { RailLayout } from "../../layout/railLayout";
import { LayoutThumbnail } from "./LayoutThumbnail";
import "./LayoutPresetPicker.css";

export interface LayoutPresetPickerProps {
  /** Built-ins for this device, then whatever the user has saved. */
  presets: readonly LayoutPreset[];
  /** The arrangement on screen right now — what the save card previews. */
  current: RailLayout;
  /** The id of the preset the current layout matches, if any. */
  activeId?: string | null;
  onApply: (preset: LayoutPreset) => void;
  /** Save `current` under a user-typed name. */
  onSaveCurrent: (name: string) => void;
  /** Only ever called for a preset with `custom: true`. */
  onDeletePreset: (preset: LayoutPreset) => void;
  /**
   * Which device the shortlist is for — shown as a caption so it is obvious
   * that the iPad's presets are not the desktop's, and that saving here
   * saves for THIS kind of screen only.
   */
  deviceLabel: string;
}

export function LayoutPresetPicker({
  presets,
  current,
  activeId,
  onApply,
  onSaveCurrent,
  onDeletePreset,
  deviceLabel,
}: LayoutPresetPickerProps) {
  /**
   * Whether the grid is showing. Local, and deliberately not lifted to the
   * store: it is a transient disclosure within one visit to layout mode, not
   * a preference. Leaving and re-entering the mode unmounts this component
   * and so starts collapsed again, which is the wanted behaviour.
   */
  const [open, setOpen] = useState(false);
  /** `null` when not naming; a draft string while the name field is open. */
  const [draftName, setDraftName] = useState<string | null>(null);

  const commit = () => {
    const name = (draftName ?? "").trim();
    // An empty name would produce an unidentifiable card. Cancel instead —
    // the user pressing Enter on a blank field means "never mind".
    if (name) onSaveCurrent(name);
    setDraftName(null);
  };

  // Collapsed: one button, no scrim. See the header — while the grid is
  // closed there is nothing to dim, and dimming the canvas anyway would make
  // the per-rail controls look unavailable when they are the mode's point.
  if (!open) {
    return (
      <div className="layout-presets layout-presets--collapsed">
        <button
          type="button"
          className="layout-presets__open-btn"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          title="Show the ready-made layouts for this device"
        >
          <Icon icon={LayoutGrid} size={16} />
          <span>Layout Presets</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="layout-presets"
      role="group"
      aria-label="Layout presets"
    >
      <div className="layout-presets__panel">
        <div className="layout-presets__head">
          <span className="layout-presets__title">Layouts</span>
          <span className="layout-presets__device">{deviceLabel}</span>
          <button
            type="button"
            className="layout-presets__collapse"
            onClick={() => setOpen(false)}
            aria-expanded
            aria-label="Hide the layouts"
            title="Hide the layouts"
          >
            <Icon icon={ChevronDown} size={16} />
          </button>
        </div>

        <div className="layout-presets__grid">
          {presets.map((preset) => {
            const active = preset.id === activeId;
            return (
              <div
                key={preset.id}
                className={classNames(
                  "layout-presets__card",
                  active && "layout-presets__card--active",
                )}
              >
                <button
                  type="button"
                  className="layout-presets__card-btn"
                  onClick={() => onApply(preset)}
                  aria-pressed={active}
                  title={preset.description}
                >
                  <LayoutThumbnail layout={preset.layout} accent />
                  <span className="layout-presets__name">
                    {preset.name}
                    {active ? (
                      <Icon
                        icon={Check}
                        size={13}
                        className="layout-presets__check"
                      />
                    ) : null}
                  </span>
                  {/* ⚠️ No description line — see the header. The text is
                      the button's `title` above, so it is still reachable
                      without costing the card two lines of height. */}
                </button>

                {/* ⚠️ Only custom presets are deletable, and the button is
                    absent — not disabled — for the built-ins. A disabled bin
                    on every card would read as "this one is protected"
                    rather than "this one is code". */}
                {preset.custom ? (
                  <button
                    type="button"
                    className="layout-presets__delete"
                    onClick={() => onDeletePreset(preset)}
                    aria-label={`Delete the ${preset.name} layout`}
                    title={`Delete the ${preset.name} layout`}
                  >
                    <Icon icon={Trash2} size={13} />
                  </button>
                ) : null}
              </div>
            );
          })}

          {/* The save card — same shape as the rest, previewing the CURRENT
              arrangement, because that is what pressing it captures. */}
          <div
            className={classNames(
              "layout-presets__card",
              "layout-presets__card--save",
            )}
          >
            {draftName === null ? (
              <button
                type="button"
                className="layout-presets__card-btn"
                onClick={() => setDraftName("")}
                title="Save the current arrangement as a new layout"
              >
                <div className="layout-presets__save-thumb">
                  <LayoutThumbnail layout={current} />
                  <span className="layout-presets__save-badge">
                    <Icon icon={Plus} size={16} />
                  </span>
                </div>
                <span className="layout-presets__name">Save current</span>
              </button>
            ) : (
              <div className="layout-presets__save-form">
                <LayoutThumbnail layout={current} />
                <input
                  className="layout-presets__input"
                  value={draftName}
                  autoFocus
                  placeholder="Layout name"
                  aria-label="Name for the saved layout"
                  maxLength={40}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commit();
                    if (e.key === "Escape") setDraftName(null);
                  }}
                />
                <div className="layout-presets__save-actions">
                  <button
                    type="button"
                    className="layout-presets__mini-btn"
                    onClick={commit}
                    disabled={!draftName.trim()}
                    aria-label="Save this layout"
                    title="Save this layout"
                  >
                    <Icon icon={Check} size={14} />
                  </button>
                  <button
                    type="button"
                    className="layout-presets__mini-btn"
                    onClick={() => setDraftName(null)}
                    aria-label="Cancel saving"
                    title="Cancel"
                  >
                    <Icon icon={X} size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
