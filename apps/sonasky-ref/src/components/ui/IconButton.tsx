import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

const base =
  "inline-flex items-center justify-center rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100 disabled:pointer-events-none disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "small" | "medium";
  children?: ReactNode;
}

export function IconButton({ size = "medium", className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`${base} ${size === "small" ? "p-1" : ""} ${className ?? ""}`}
      {...rest}
    >
      {children}
    </button>
  );
}

interface AnchorIconButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  size?: "small" | "medium";
  children?: ReactNode;
}

export function AnchorIconButton({
  size = "medium",
  className,
  children,
  ...rest
}: AnchorIconButtonProps) {
  return (
    <a className={`${base} ${size === "small" ? "p-1" : ""} ${className ?? ""}`} {...rest}>
      {children}
    </a>
  );
}
