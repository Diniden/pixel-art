import type { LucideIcon } from "lucide-react";

interface IconProps {
  icon: LucideIcon;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function Icon({
  icon: LucideComponent,
  size = 14,
  className = "",
  strokeWidth = 2,
  ...rest
}: IconProps) {
  return (
    <LucideComponent
      size={size}
      className={`icon ${className}`.trim()}
      strokeWidth={strokeWidth}
      {...rest}
    />
  );
}
