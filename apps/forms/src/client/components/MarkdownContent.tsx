import DOMPurify from "dompurify";
import { marked } from "marked";

const ALLOWED_TAGS = [
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
];

const ALLOWED_ATTR = ["href", "target", "rel"];

marked.use({ breaks: true, gfm: true });

export function MarkdownContent({ content }: { content: string }) {
  const rawHtml = marked.parse(content) as string;
  const html = DOMPurify.sanitize(rawHtml, { ALLOWED_ATTR, ALLOWED_TAGS });

  return (
    <div
      className="prose-sm max-w-none space-y-2 text-sm text-neutral-700 [&_a]:text-sky-600 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-neutral-300 [&_blockquote]:pl-3 [&_blockquote]:text-neutral-500 [&_code]:rounded [&_code]:bg-neutral-100 [&_code]:px-1 [&_code]:py-0.5 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-bold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 dark:text-neutral-300 dark:[&_blockquote]:border-neutral-700 dark:[&_blockquote]:text-neutral-400 dark:[&_code]:bg-neutral-800"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
