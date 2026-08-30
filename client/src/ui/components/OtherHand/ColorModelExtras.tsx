/**
 * ColorModelExtras — the HSL / RGB switch and the alpha checkbox that sit in
 * the Other Hand bar for a colour section. Pure: two callbacks in.
 *
 * `ui/` boundary: React types, the layout model's colour-model type, and the
 * shared `OtherHand.css`.
 */
import type { ReactNode } from "react";
import type { OtherHandColorModel } from "../../layout/railLayout";
import "./OtherHand.css";

export interface ColorModelExtrasProps {
  model: OtherHandColorModel;
  onModel: (model: OtherHandColorModel) => void;
  /** Omit BOTH alpha props for a colour with no alpha (the lights). */
  includeAlpha?: boolean;
  onIncludeAlpha?: (include: boolean) => void;
}

export function ColorModelExtras({
  model,
  onModel,
  includeAlpha,
  onIncludeAlpha,
}: ColorModelExtrasProps): ReactNode {
  return (
    <>
      <div
        className="other-hand__segment"
        role="group"
        aria-label="Colour model"
      >
        {(["hsl", "rgb"] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={
              m === model
                ? "other-hand__segment-btn other-hand__segment-btn--active"
                : "other-hand__segment-btn"
            }
            aria-pressed={m === model}
            onClick={() => onModel(m)}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>
      {onIncludeAlpha ? (
        <label className="other-hand__check">
          <input
            type="checkbox"
            checked={Boolean(includeAlpha)}
            onChange={(e) => onIncludeAlpha(e.target.checked)}
          />
          Alpha
        </label>
      ) : null}
    </>
  );
}
