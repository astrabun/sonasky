import { describe, expect, it } from "vitest";
import { markdownToHtml } from "./markdown.ts";

describe("markdownToHtml tables", () => {
  it("renders a GFM table with a bold header row", () => {
    const html = markdownToHtml("| a | b |\n| --- | --- |\n| 1 | 2 |\n");
    expect(html).toMatch(/<thead>\s*<tr>\s*<th>a<\/th>/);
    expect(html).toMatch(/<tbody>\s*<tr>\s*<td>1<\/td>/);
  });

  it("passes through the HTML tables the editor writes for custom header settings", () => {
    // tiptap-markdown's HTML fallback: no header row, header column on.
    const table =
      '<table style="min-width: 50px">\n<colgroup><col style="min-width: 25px"><col style="min-width: 25px"></colgroup><tbody><tr><th colspan="1" rowspan="1"><p>Name</p></th><td colspan="1" rowspan="1"><p>Ada</p></td></tr><tr><th colspan="1" rowspan="1"><p>Role</p></th><td colspan="1" rowspan="1"><p>Engineer</p></td></tr></tbody>\n</table>';
    const html = markdownToHtml(`Intro\n\n${table}\n\nAfter`);
    expect(html).toContain('<th colspan="1" rowspan="1"><p>Name</p></th>');
    expect(html).toContain('<td colspan="1" rowspan="1"><p>Ada</p></td>');
    expect(html).not.toContain("<thead>");
    expect(html).toContain("<p>After</p>");
  });
});
