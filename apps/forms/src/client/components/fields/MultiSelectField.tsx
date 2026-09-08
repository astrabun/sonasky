import type { SelectField as SelectFieldDef } from "../../../forms/types.ts";
import type { FieldProps } from "./common.ts";

export function MultiSelectField({ field, value, onChange }: FieldProps<SelectFieldDef>) {
  const selected = Array.isArray(value) ? value : [];

  function toggle(optValue: string) {
    onChange(
      selected.includes(optValue)
        ? selected.filter((v) => v !== optValue)
        : [...selected, optValue],
    );
  }

  return (
    <div className="mt-1 space-y-1.5">
      {field.options.map((opt) => (
        <label key={opt.value} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            value={opt.value}
            checked={selected.includes(opt.value)}
            onChange={() => toggle(opt.value)}
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}
