import type { SelectField as SelectFieldDef } from "../../../forms/types.ts";
import type { FieldProps } from "./common.ts";

export function SingleSelectField({ field, value, onChange }: FieldProps<SelectFieldDef>) {
  return (
    <div className="mt-1 space-y-1.5">
      {field.options.map((opt) => (
        <label key={opt.value} className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name={field.id}
            value={opt.value}
            checked={value === opt.value}
            required={field.required}
            onChange={() => onChange(opt.value)}
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}
