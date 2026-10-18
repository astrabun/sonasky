import { defineCommunityBlock } from "../types.ts";

export const pullQuote = defineCommunityBlock({
  id: "pull-quote",
  name: "Pull quote",
  description: "A big quote that stands out, with who said it.",
  author: { name: "SonaSky (Example)" },
  fields: {
    quote: { type: "longText", label: "Quote", required: true, rows: 3, max: 1000 },
    by: { type: "text", label: "Who said it (optional)", placeholder: "Ada Lovelace" },
    align: {
      type: "select",
      label: "Alignment",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Centered" },
      ],
      default: "left",
    },
  },
  example: {
    quote:
      "Once men turned their thinking over to machines in the hope that this would set them free. But that only permitted other men with machines to enslave them.",
    by: "Frank Herbert, Dune",
  },
  css: `
& { margin: 2em 0; }
figure { margin: 0; }
.quote { margin: 0; padding: 0 0 0 1em; border-left: 4px solid var(--apollo-accent); color: var(--apollo-text); font-family: var(--apollo-font-heading); font-size: 1.4rem; line-height: 1.4; }
.by { margin: .5em 0 0 1.25em; color: var(--apollo-muted); }
.center { text-align: center; }
.center .quote { padding: 0; border-left: 0; }
.center .by { margin-left: 0; }
`,
  render: (f, h) =>
    `<figure class="${f.align === "center" ? "center" : ""}"><blockquote class="quote">${h.esc(
      f.quote,
    )}</blockquote>${f.by ? `<figcaption class="by">&mdash; ${h.esc(f.by)}</figcaption>` : ""}</figure>`,
});
