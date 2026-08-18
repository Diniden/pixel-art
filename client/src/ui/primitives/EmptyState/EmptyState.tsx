import type { ReactNode } from "react";
import { classNames } from "../../classNames";
import "./EmptyState.css";

/**
 * EmptyState — the shared "nothing here yet" placeholder (task 19).
 *
 * BEM block: `empty-state` (local stylesheet). The class was measured
 * DEFINED IDENTICALLY in three sheets — `LayerPanel.css`, `ObjectLibrary.css`
 * and `PaletteManager.css`; this primitive is that triplicate, extracted.
 * (Task 20's example split renames the legacy copies into per-component
 * `__empty` elements; the shared look lives here from now on.)
 */

export interface EmptyStateProps {
  children: ReactNode;
  /** Optional leading visual (an `Icon`, for instance). */
  icon?: ReactNode;
  className?: string;
}

export function EmptyState({ children, icon, className }: EmptyStateProps) {
  return (
    <div className={classNames("empty-state", className)}>
      {icon != null && (
        <span className="empty-state__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="empty-state__text">{children}</div>
    </div>
  );
}

export default EmptyState;
