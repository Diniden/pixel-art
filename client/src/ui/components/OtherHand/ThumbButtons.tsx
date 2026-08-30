/**
 * ThumbButtons — a vertical stack of big tap targets.
 *
 * One component serves a toggle (one button, `active` flips), a choice (N
 * buttons, one active) and a set of actions (no `active` at all): the spec
 * decides, the stack just draws what it is given.
 *
 * `ui/` boundary: React, `classNames`, and the sibling spec type.
 */
import { classNames } from "../../classNames";
import type { ThumbButtonsSpec } from "./thumbWidgets";

export type ThumbButtonsProps = Omit<ThumbButtonsSpec, "kind" | "id">;

export function ThumbButtons({ label, buttons }: ThumbButtonsProps) {
  return (
    <div className="thumb-buttons" role="group" aria-label={label}>
      <div className="thumb-buttons__stack">
        {buttons.map((button) => (
          <button
            key={button.id}
            type="button"
            className={classNames(
              "thumb-buttons__btn",
              button.active && "thumb-buttons__btn--active",
            )}
            onClick={button.onClick}
            title={button.title ?? button.label}
            {...(button.active !== undefined
              ? { "aria-pressed": button.active }
              : {})}
          >
            {button.label}
          </button>
        ))}
      </div>
      <span className="thumb-buttons__label">{label}</span>
    </div>
  );
}
