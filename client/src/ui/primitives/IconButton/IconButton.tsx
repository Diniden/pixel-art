import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { Icon } from "../Icon/Icon";
import { classNames } from "../../classNames";
import "./IconButton.css";

/**
 * IconButton — a square icon-only button (task 19).
 *
 * BEM block: `icon-btn` (local stylesheet). The skin is the 13-fold-duplicated
 * close button (the pre-BEM bare close-button class + `<Icon icon={X} size={14}/>`)
 * measured at AddVariantModal:126, CopyFromModal:187, ObjectSelectModal:113,
 * VariantSelectModal:144, EdgeInterpolateModal:47, HeightMapModal:201,
 * BrowseBackupsModal:125, the project-select modal (:108),
 * ReferenceImageModal:755,
 * plus the bespoke twins in ResizeModal/PreviewModal/ExportPreviewModal/
 * FrameTagsModal. `Modal` renders its close control through this component
 * with `className="modal__close"` (the task 18 vocabulary name).
 *
 * `label` is REQUIRED and becomes `aria-label`: an icon-only button without a
 * name is invisible to assistive tech — across the 14 legacy modals exactly
 * ONE close button had an aria-label (FrameTagsModal:177).
 */

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "children" | "aria-label"
> {
  /** The lucide icon to render. */
  icon: LucideIcon;
  /** Accessible name (rendered as `aria-label`). Required. */
  label: string;
  /** Icon size in px. Default 14, the measured house value. */
  size?: number;
  /** Extra classes (e.g. `modal__close`), appended after the block class. */
  className?: string;
}

export function IconButton({
  icon,
  label,
  size = 14,
  type = "button",
  className,
  title,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={classNames("icon-btn", className)}
      aria-label={label}
      title={title ?? label}
      {...rest}
    >
      <Icon icon={icon} size={size} />
    </button>
  );
}

export default IconButton;
