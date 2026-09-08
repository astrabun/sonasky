import type { TextField as TextFieldDef } from "../../../forms/types.ts";
import { inputCls, type FieldProps } from "./common.ts";

export function TextField({ field, value, onChange }: FieldProps<TextFieldDef>) {
  return (
    <input
      type={field.type === "email" ? "email" : "text"}
      className={inputCls}
      value={typeof value === "string" ? value : ""}
      maxLength={field.maxLength}
      placeholder={field.placeholder}
      required={field.required}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
