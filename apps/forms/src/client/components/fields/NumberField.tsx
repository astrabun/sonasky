import type { NumberField as NumberFieldDef } from "../../../forms/types.ts";
import { inputCls, type FieldProps } from "./common.ts";

export function NumberField({ field, value, onChange }: FieldProps<NumberFieldDef>) {
  return (
    <input
      type="number"
      className={inputCls}
      value={typeof value === "string" ? value : ""}
      min={field.min}
      max={field.max}
      required={field.required}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
