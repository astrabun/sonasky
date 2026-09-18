import { cloneElement, type ReactElement } from "react";

interface TooltipProps {
  title: string;
  children: ReactElement<{ title?: string }>;
}

export function Tooltip({ title, children }: TooltipProps) {
  return cloneElement(children, { title });
}
