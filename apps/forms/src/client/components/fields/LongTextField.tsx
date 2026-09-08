import type { TextField as TextFieldDef } from "../../../forms/types.ts";
import { inputCls, type FieldProps } from "./common.ts";

export function LongTextField({ field, value, onChange }: FieldProps<TextFieldDef>) {
  return (
    <textarea
      className={inputCls}
      rows={4}
      value={typeof value === "string" ? value : ""}
      maxLength={field.maxLength}
      placeholder={field.placeholder}
      required={field.required}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
