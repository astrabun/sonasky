import DOMPurify from "dompurify";
import { marked } from "marked";

const ALLOWED_TAGS = [
  "blockquote",
  "br",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "input",
  "li",
  "ol",
  "p",
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

const ALLOWED_ATTR = ["checked", "disabled", "type"];

marked.use({ breaks: true, gfm: true });

interface Props {
  content: string;
}

export function MarkdownDescription({ content }: Props) {
  const html = DOMPurify.sanitize(marked.parse(content) as string, {
    ALLOWED_ATTR,
    ALLOWED_TAGS,
  });

  return (
    <div
      dangerouslySetInnerHTML={{ __html: html }}
      className="prose prose-sm dark:prose-invert max-w-none [&_input[type=checkbox]]:mr-1"
    />
  );
}
