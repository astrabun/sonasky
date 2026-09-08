import type { AnswerValue, FieldDefinition } from "../../../forms/types.ts";

export interface FieldProps<F extends FieldDefinition = FieldDefinition> {
  field: F;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
}

export const labelCls = "block text-sm font-medium text-neutral-800 dark:text-neutral-100";
export const helpCls = "mt-1 whitespace-pre-line text-xs text-neutral-500 dark:text-neutral-400";
export const inputCls =
  "mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm " +
  "text-neutral-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 " +
  "focus:ring-sky-200 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";
