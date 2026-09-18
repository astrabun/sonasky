import type { InputHTMLAttributes, ReactNode } from "react";

type CheckboxProps = InputHTMLAttributes<HTMLInputElement>;

export function Checkbox({ className, ...rest }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      className={`h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50 dark:border-gray-600 ${className ?? ""}`}
      {...rest}
    />
  );
}

export function FormControlLabel({
  control,
  label,
  className,
}: {
  control: ReactNode;
  label: ReactNode;
  className?: string;
}) {
  return (
    <label className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      {control}
      <span>{label}</span>
    </label>
  );
}
