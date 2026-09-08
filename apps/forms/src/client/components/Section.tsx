import type { AnswerValue, FieldDefinition, SectionDefinition } from "../../forms/types.ts";
import { helpCls, inputCls, labelCls, type FieldProps } from "./fields/common.ts";
import { LongTextField } from "./fields/LongTextField.tsx";
import { MultiSelectField } from "./fields/MultiSelectField.tsx";
import { NumberField } from "./fields/NumberField.tsx";
import { ScaleField } from "./fields/ScaleField.tsx";
import { SingleSelectField } from "./fields/SingleSelectField.tsx";
import { TextField } from "./fields/TextField.tsx";

function FieldInput({ field, value, onChange }: FieldProps) {
  switch (field.type) {
    case "longtext":
      return <LongTextField field={field} value={value} onChange={onChange} />;
    case "number":
      return <NumberField field={field} value={value} onChange={onChange} />;
    case "linear-scale":
      return <ScaleField field={field} value={value} onChange={onChange} />;
    case "single-select":
      return <SingleSelectField field={field} value={value} onChange={onChange} />;
    case "multi-select":
      return <MultiSelectField field={field} value={value} onChange={onChange} />;
    case "text":
    case "email":
      return <TextField field={field} value={value} onChange={onChange} />;
  }
}

interface SectionProps {
  section: SectionDefinition;
  answers: Record<string, AnswerValue | undefined>;
  onChange: (fieldId: string, value: AnswerValue) => void;
}

export function Section({ section, answers, onChange }: SectionProps) {
  return (
    <div className="space-y-5">
      {section.title ? (
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
          {section.title}
        </h2>
      ) : null}
      {section.description ? (
        <p className="whitespace-pre-line text-sm text-neutral-600 dark:text-neutral-300">
          {section.description}
        </p>
      ) : null}

      {section.fields.map((field: FieldDefinition) => (
        <div key={field.id}>
          <span className={labelCls}>
            {field.label}
            {field.required ? <span className="text-rose-500"> *</span> : null}
          </span>
          {field.prefill ? (
            <input
              className={`${inputCls} opacity-70`}
              value={typeof answers[field.id] === "string" ? (answers[field.id] as string) : ""}
              readOnly
              disabled
            />
          ) : (
            <FieldInput
              field={field}
              value={answers[field.id]}
              onChange={(v) => onChange(field.id, v)}
            />
          )}
          {field.help ? <p className={helpCls}>{field.help}</p> : null}
        </div>
      ))}
    </div>
  );
}
