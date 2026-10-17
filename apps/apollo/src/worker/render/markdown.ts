import { Marked } from "marked";

const marked = new Marked({ gfm: true, breaks: true, async: false });

/**
 * Markdown -> HTML. The output is NOT safe on its own (markdown allows raw
 * HTML); callers always pass it through `sanitizeHtml`.
 */
export function markdownToHtml(source: string): string {
  return marked.parse(source) as string;
}
