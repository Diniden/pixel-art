import type { ReactNode } from "react";
import { classNames } from "../../classNames";

/**
 * Panel — the shared sidebar panel shell (task 19).
 *
 * BEM block: `panel` (`client/src/styles/blocks/panel.css`, task 18):
 *
 *   panel
 *   panel__header            (--stacked | --compact)
 *   panel__title
 *   panel__body              (--stack | --dense)
 *
 * Replaces the 12 measured `.panel`/`.panel-header`/`.panel-content` sites
 * whose header markup disagreed on nesting (LayerPanel's container form vs
 * ColorPicker's bare text — LightingStudioPanel used BOTH forms in one file).
 * This component always renders the container form: title inside
 * `panel__title`, header actions as siblings.
 */

export type PanelHeaderVariant = "default" | "stacked" | "compact";
export type PanelBodyVariant = "default" | "stack" | "dense";

export interface PanelProps {
  /** Header title, rendered inside `panel__title`. */
  title?: ReactNode;
  /** Extra header content (buttons etc.), after the title. */
  headerActions?: ReactNode;
  /** `stacked` = column layout; `compact` = tight padding, smaller type. */
  headerVariant?: PanelHeaderVariant;
  /** `stack` = centered wide-gap column; `dense` = tight centered column. */
  bodyVariant?: PanelBodyVariant;
  children: ReactNode;
  className?: string;
}

export function Panel({
  title,
  headerActions,
  headerVariant = "default",
  bodyVariant = "default",
  children,
  className,
}: PanelProps) {
  const hasHeader = title != null || headerActions != null;

  // Explicit maps (not `panel__header--${variant}` and not comparisons inside
  // the className expression) so check-classes.mjs sees literal references.
  return (
    <section className={classNames("panel", className)}>
      {hasHeader && (
        <div
          className={classNames(
            "panel__header",
            HEADER_VARIANT_CLASS[headerVariant],
          )}
        >
          {title != null && <span className="panel__title">{title}</span>}
          {headerActions}
        </div>
      )}
      <div
        className={classNames("panel__body", BODY_VARIANT_CLASS[bodyVariant])}
      >
        {children}
      </div>
    </section>
  );
}

const HEADER_VARIANT_CLASS: Record<PanelHeaderVariant, string | null> = {
  default: null,
  stacked: "panel__header--stacked",
  compact: "panel__header--compact",
};

const BODY_VARIANT_CLASS: Record<PanelBodyVariant, string | null> = {
  default: null,
  stack: "panel__body--stack",
  dense: "panel__body--dense",
};

export default Panel;
