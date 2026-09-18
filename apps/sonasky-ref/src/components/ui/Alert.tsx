import type { ReactNode } from "react";

type Severity = "info" | "warning" | "error" | "success";

const severityClasses: Record<Severity, string> = {
  info: "bg-sky-50 text-sky-900 border-sky-200 dark:bg-sky-950 dark:text-sky-100 dark:border-sky-900",
  warning:
    "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-900",
  error:
    "bg-red-50 text-red-900 border-red-200 dark:bg-red-950 dark:text-red-100 dark:border-red-900",
  success:
    "bg-green-50 text-green-900 border-green-200 dark:bg-green-950 dark:text-green-100 dark:border-green-900",
};

interface AlertProps {
  severity?: Severity;
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
}

export function Alert({ severity = "info", className, style, children }: AlertProps) {
  return (
    <div
      role="alert"
      style={style}
      className={`rounded-md border p-4 ${severityClasses[severity]} ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

export function AlertTitle({ children }: { children?: ReactNode }) {
  return <p className="mb-1 font-semibold">{children}</p>;
}
