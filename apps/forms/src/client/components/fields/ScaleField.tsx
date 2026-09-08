import { scaleTicks, type ScaleField as ScaleFieldDef } from "../../../forms/types.ts";
import type { FieldProps } from "./common.ts";

export function ScaleField({ field, value, onChange }: FieldProps<ScaleFieldDef>) {
  const ticks = scaleTicks(field);
  const selected = typeof value === "string" ? value : "";

  return (
    <div className="mt-2 flex items-end gap-3 overflow-x-auto pb-1">
      {field.minLabel ? (
        <span className="shrink-0 pb-6 text-xs text-neutral-500 dark:text-neutral-400">
          {field.minLabel}
        </span>
      ) : null}

      {ticks.map((tick) => {
        const v = String(tick);
        return (
          <label key={v} className="flex shrink-0 flex-col items-center gap-1 text-sm">
            <span className="text-neutral-700 dark:text-neutral-200">{tick}</span>
            <input
              type="radio"
              name={field.id}
              value={v}
              checked={selected === v}
              required={field.required}
              onChange={() => onChange(v)}
            />
          </label>
        );
      })}

      {field.maxLabel ? (
        <span className="shrink-0 pb-6 text-xs text-neutral-500 dark:text-neutral-400">
          {field.maxLabel}
        </span>
      ) : null}
    </div>
  );
}
