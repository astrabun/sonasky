import type { ReactNode } from "react";

type ChipColor = "default" | "warning" | "info" | "error";

const colorClasses: Record<ChipColor, string> = {
  default: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100",
  warning: "bg-amber-500 text-white",
  info: "bg-sky-600 text-white",
  error: "bg-red-600 text-white",
};

interface ChipProps {
  label: ReactNode;
  color?: ChipColor;
  icon?: ReactNode;
  /** Overrides the background/text classes from `color` with arbitrary Tailwind classes. */
  colorClassName?: string;
}

export function Chip({ label, color = "default", icon, colorClassName }: ChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${colorClassName ?? colorClasses[color]}`}
    >
      {icon}
      {label}
    </span>
  );
}
