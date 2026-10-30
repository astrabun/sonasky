import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { X } from "lucide-react";
import { formatBytes } from "../../shared/limits.ts";

const INPUT_CLASS =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 focus:outline-none disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "bg-sky-600 text-white hover:bg-sky-500",
  secondary:
    "border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800",
  danger: "bg-rose-600 text-white hover:bg-rose-500",
  ghost: "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  const sizing = size === "sm" ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-sm";
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${sizing} ${VARIANT_CLASS[variant]} ${className}`}
      {...props}
    />
  );
}

/** Label + control + help/error text, wired up for screen readers. */
export function Field({
  label,
  help,
  error,
  children,
}: {
  label: ReactNode;
  help?: ReactNode;
  error?: string | null;
  children: (ids: { id: string; describedBy?: string }) => ReactNode;
}) {
  const id = useId();
  const helpId = `${id}-help`;
  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-neutral-800 dark:text-neutral-200"
      >
        {label}
      </label>
      {children({ id, describedBy: help || error ? helpId : undefined })}
      {error ? (
        <p id={helpId} className="text-xs text-rose-600">
          {error}
        </p>
      ) : help ? (
        <p id={helpId} className="text-xs text-neutral-500 dark:text-neutral-400">
          {help}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  label,
  help,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  help?: ReactNode;
  error?: string | null;
}) {
  return (
    <Field label={label} help={help} error={error}>
      {({ id, describedBy }) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          className={INPUT_CLASS}
          {...props}
        />
      )}
    </Field>
  );
}

export function TextArea({
  label,
  help,
  error,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: ReactNode;
  help?: ReactNode;
  error?: string | null;
}) {
  return (
    <Field label={label} help={help} error={error}>
      {({ id, describedBy }) => (
        <textarea
          id={id}
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          className={INPUT_CLASS}
          {...props}
        />
      )}
    </Field>
  );
}

/** Free-text tags shown as chips. Comma or Enter accepts the pending tag. */
export function TagInput({
  label,
  help,
  value,
  onChange,
  max,
}: {
  label: ReactNode;
  help?: ReactNode;
  value: string[];
  onChange: (tags: string[]) => void;
  max: number;
}) {
  const [pending, setPending] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const full = value.length >= max;

  const add = (raw: string[]) => {
    const next = [...value];
    for (const r of raw) {
      const tag = r.trim();
      if (!tag || next.length >= max) continue;
      if (next.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
      next.push(tag);
    }
    if (next.length !== value.length) onChange(next);
  };

  const commit = () => {
    add([pending]);
    setPending("");
  };

  return (
    <Field label={label} help={help}>
      {({ id, describedBy }) => (
        <div
          className={`${INPUT_CLASS} flex cursor-text flex-wrap items-center gap-1.5 focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500`}
          onClick={() => inputRef.current?.focus()}
        >
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-sky-100 py-0.5 pr-1 pl-2.5 text-xs font-medium text-sky-900 dark:bg-sky-900 dark:text-sky-100"
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="rounded-full p-0.5 hover:bg-sky-200 dark:hover:bg-sky-800"
                aria-label={`Remove tag ${tag}`}
              >
                <X size={12} aria-hidden />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            id={id}
            aria-describedby={describedBy}
            className="min-w-24 flex-1 bg-transparent outline-none placeholder:text-neutral-400 disabled:cursor-not-allowed"
            value={pending}
            disabled={full}
            placeholder={full ? `Up to ${max} tags` : value.length ? "" : "Add a tag"}
            onChange={(e) => {
              // Typed or pasted commas split off finished tags; the remainder stays pending.
              const parts = e.target.value.split(",");
              const rest = parts.pop() ?? "";
              if (parts.length) add(parts);
              setPending(rest);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Backspace" && pending === "" && value.length) {
                onChange(value.slice(0, -1));
              }
            }}
            onBlur={commit}
          />
        </div>
      )}
    </Field>
  );
}

export function Select({
  label,
  help,
  options,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: ReactNode;
  help?: ReactNode;
  options: { value: string; label: string }[];
}) {
  return (
    <Field label={label} help={help}>
      {({ id, describedBy }) => (
        <select id={id} aria-describedby={describedBy} className={INPUT_CLASS} {...props}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 ${className}`}
    >
      {children}
    </div>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "error" | "success";
  children: ReactNode;
}) {
  const toneClass = {
    info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100",
    warn: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100",
    error:
      "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100",
    success:
      "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  }[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg border px-3 py-2 text-sm ${toneClass}`}
    >
      {children}
    </div>
  );
}

/** Live "how full is this record" meter, matching the Worker's byte caps. */
export function SizeMeter({ used, max, label }: { used: number; max: number; label: string }) {
  const ratio = Math.min(used / max, 1);
  const tone = ratio >= 1 ? "bg-rose-500" : ratio > 0.8 ? "bg-amber-500" : "bg-sky-500";
  const message =
    ratio >= 1
      ? "This is too big to publish. Try moving some of it to a new page."
      : ratio > 0.8
        ? "This is getting full. Consider splitting it into another page."
        : null;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
        <span>{label}</span>
        <span>
          {formatBytes(used)} of {formatBytes(max)}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={used}
      >
        <div className={`h-full ${tone}`} style={{ width: `${ratio * 100}%` }} />
      </div>
      {message ? <p className="text-xs text-amber-700 dark:text-amber-400">{message}</p> : null}
    </div>
  );
}

/** Native <dialog> modal. */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      // React bubbles `close` through the component tree, so a modal opened from
      // inside this one (e.g. a media picker) would close this one too.
      onClose={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? "max-w-3xl" : "max-w-lg"} rounded-xl border border-neutral-200 bg-white p-0 text-neutral-900 shadow-xl backdrop:bg-black/40 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100`}
    >
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <h2 className="text-base font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          aria-label="Close"
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto p-4">{open ? children : null}</div>
    </dialog>
  );
}

export function Spinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-neutral-500" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-sky-500" />
      {label}
    </div>
  );
}
