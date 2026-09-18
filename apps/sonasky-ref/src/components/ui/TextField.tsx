import { useId } from "react";

interface BaseProps {
  label?: string;
  helperText?: string;
  className?: string;
}

type InputProps = BaseProps &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "className"> & {
    multiline?: false;
  };

type TextareaProps = BaseProps &
  Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & {
    multiline: true;
    rows?: number;
  };

export function TextField(props: InputProps | TextareaProps) {
  const { label, helperText, className, multiline, ...rest } = props;
  const id = useId();
  const fieldClassName =
    "w-full rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900";

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium">
          {label}
        </label>
      )}
      {multiline ? (
        <textarea id={id} className={fieldClassName} {...(rest as TextareaProps)} />
      ) : (
        <input id={id} className={fieldClassName} {...(rest as InputProps)} />
      )}
      {helperText && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{helperText}</p>}
    </div>
  );
}
