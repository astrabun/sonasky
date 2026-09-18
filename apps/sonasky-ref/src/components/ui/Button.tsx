import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";

type Variant = "contained" | "outlined" | "text";
type Color = "primary" | "error" | "warning" | "info" | "inherit";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50";

const sizeClasses = {
  medium: "px-4 py-2",
  small: "px-3 py-1.5 text-xs",
};

const colorVariantClasses: Record<Color, Record<Variant, string>> = {
  primary: {
    contained: "bg-blue-600 text-white hover:bg-blue-700",
    outlined: "border border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950",
    text: "text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950",
  },
  error: {
    contained: "bg-red-600 text-white hover:bg-red-700",
    outlined: "border border-red-600 text-red-600 hover:bg-red-50 dark:hover:bg-red-950",
    text: "text-red-600 hover:bg-red-50 dark:hover:bg-red-950",
  },
  warning: {
    contained: "bg-amber-500 text-white hover:bg-amber-600",
    outlined: "border border-amber-500 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950",
    text: "text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950",
  },
  info: {
    contained: "bg-sky-600 text-white hover:bg-sky-700",
    outlined: "border border-sky-600 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950",
    text: "text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950",
  },
  inherit: {
    contained: "bg-gray-800 text-white hover:bg-gray-900",
    outlined:
      "border border-gray-400 text-inherit hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800",
    text: "text-inherit hover:bg-gray-100 dark:hover:bg-gray-800",
  },
};

interface CommonProps {
  variant?: Variant;
  color?: Color;
  size?: "medium" | "small";
  fullWidth?: boolean;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function buttonClassName({
  variant = "text",
  color = "primary",
  size = "medium",
  fullWidth,
  className,
}: CommonProps) {
  return [
    base,
    sizeClasses[size],
    colorVariantClasses[color][variant],
    fullWidth ? "w-full" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = CommonProps & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({
  variant,
  color,
  size,
  fullWidth,
  startIcon,
  endIcon,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, color, size, fullWidth, className })}
      {...rest}
    >
      {startIcon}
      {children}
      {endIcon}
    </button>
  );
}

type AnchorButtonProps = CommonProps & {
  href: string;
  target?: string;
  rel?: string;
};

export function AnchorButton({
  variant,
  color,
  size,
  fullWidth,
  startIcon,
  endIcon,
  className,
  children,
  ...rest
}: AnchorButtonProps) {
  return (
    <a className={buttonClassName({ variant, color, size, fullWidth, className })} {...rest}>
      {startIcon}
      {children}
      {endIcon}
    </a>
  );
}

type LinkButtonProps = CommonProps & LinkProps;

export function LinkButton({
  variant,
  color,
  size,
  fullWidth,
  startIcon,
  endIcon,
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link className={buttonClassName({ variant, color, size, fullWidth, className })} {...rest}>
      {startIcon}
      {children}
      {endIcon}
    </Link>
  );
}
