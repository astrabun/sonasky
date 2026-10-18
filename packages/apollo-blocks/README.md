# @sonasky/apollo-blocks

Community-contributed block types for [SonaSky Apollo](https://apollo.sonasky.app) pages. Every
block here shows up in Apollo's **Add a block** menu under **Community blocks**, credited to its
author, after the official blocks.

A block is one small file: the form people fill in (its **fields**), what a new block starts with
(its **example**), optional **CSS**, a **render** function that turns the values into HTML, and
optionally a small **script** to make it interactive.
Apollo builds the editor form from your fields, checks what people type, and renders the block on
the published page.

## Tiers

- **Official** blocks are built into Apollo and maintained by SonaSky.
- **Community** blocks live here. They get the same safety checks, but they're looked after on a
  best-effort basis and carry a "Community" badge in the editor.

A popular community block can **graduate** to an official one. Pages that already use it keep
working: Apollo converts the community version to the official block when it reads the page.

## Contributing a block

You'll need a GitHub account and to be comfortable editing a file in a pull request. GitHub's web
editor is fine.

1. **Copy the example.** Duplicate [`src/community/pull-quote.ts`](src/community/pull-quote.ts)
   and name the copy after your block's id: `src/community/<your-id>.ts`.
2. **Fill it in:**

   ```ts
   import { defineCommunityBlock } from "../types.ts";

   export const nowReading = defineCommunityBlock({
     id: "now-reading", // permanent: lowercase letters, numbers, dashes
     name: "Now reading", // shown in the block menu, 40 characters max
     description: "The book you're reading right now.", // 140 max
     author: { name: "Your Name", handle: "you.bsky.social" }, // how you'd like to be credited
     fields: {
       // key: { type, label, ... } - keys are camelCase and permanent
       title: { type: "text", label: "Book title", required: true },
       author: { type: "text", label: "Author" },
       cover: { type: "media", label: "Cover (optional)" },
       link: { type: "url", label: "Link (optional)" },
     },
     example: { title: "The Left Hand of Darkness", author: "Ursula K. Le Guin" },
     css: `
   & { display: flex; gap: 12px; align-items: center; }
   img { width: 64px; border-radius: var(--apollo-radius); }
   .muted { color: var(--apollo-muted); }
   `,
     render: (f, h) => {
       const src = h.mediaUrl(f.cover?.media);
       const href = h.href(f.link);
       const title = href ? `<a href="${h.esc(href)}">${h.esc(f.title)}</a>` : h.esc(f.title);
       return `${src ? `<img src="${h.esc(src)}" alt="${h.esc(f.cover?.alt)}">` : ""}
         <div><strong>${title}</strong>${f.author ? `<div class="muted">${h.esc(f.author)}</div>` : ""}</div>`;
     },
   });
   ```

3. **List it** in [`src/index.ts`](src/index.ts): import it, then add it to `COMMUNITY_BLOCKS`,
   keeping that list in alphabetical order by id.
4. **Open a pull request.** Checks run automatically. If something's wrong, the failing check says
   exactly what, for example `block "now-reading": css must not use url() - blocks can't load images or fonts`.

You can run the checks yourself with `pnpm -F @sonasky/apollo-blocks test`.

### Field types

| `type`      | Editor shows                 | `render` gets                          | Options                            |
| ----------- | ---------------------------- | -------------------------------------- | ---------------------------------- |
| `text`      | one line of text             | `string` (or `undefined` if empty)     | `required`, `max` (bytes, 300)     |
| `longText`  | a few lines, no formatting   | `string` / `undefined`                 | `required`, `max` (3000), `rows`   |
| `markdown`  | the Text block's editor      | use `h.html("key")` for the HTML       | `required`, `max` (8192)           |
| `url`       | a link, with Apollo's checks | `string` / `undefined`                 | `required`                         |
| `datetime`  | a date and time picker       | ISO `string` / `undefined`             | `required`                         |
| `select`    | a dropdown                   | `string`, always set                   | `options`, `default` (required)    |
| `number`    | a number                     | `number`, always set                   | `default` (required), `min`, `max` |
| `boolean`   | a checkbox                   | `boolean`, always set                  | `default`                          |
| `media`     | an uploaded picture + alt    | `{ media, alt, noAlt? }` / `undefined` | `required`                         |
| `mediaList` | several pictures, each + alt | `{ media, alt, noAlt? }[]`, always set | `required`, `max` (24)             |

Every field also takes a `label` and an optional `help` line. A block can have up to 12 fields.
`required` text fields are always a non-empty `string` in `render`.

### Render helpers

`render(fields, h)` gets these from Apollo:

- `h.esc(value)`: escape text for HTML. **Use it on everything people typed.**
- `h.href(url)`: a link that's safe to use in `href`, or `null` to leave the link out.
- `h.mediaUrl(rkey)`: the address of an uploaded picture, or `null`.
- `h.html(key)`: a `markdown` field, already turned into safe HTML.
- `h.formatDate(iso, timezone?)`: "Saturday, October 24, 2026 at 7:00 PM EDT", or `null`.

Apollo's base styles and theme variables apply inside blocks. You can reuse classes like
`apollo-card` and `apollo-button`, and use `var(--apollo-text)`, `--apollo-muted`,
`--apollo-surface`, `--apollo-accent`, `--apollo-accent-text`, `--apollo-link`, `--apollo-radius`,
`--apollo-font-body` and `--apollo-font-heading` in your CSS.

### Scripts (optional)

Some blocks need a little JavaScript. Add it as `script`. Your code runs once for each of
your blocks on the page, after the page loads, with `block` set to that block's wrapper element.
[`hello-wave.ts`](src/community/hello-wave.ts) is the smallest example to copy:

```ts
render: (f, h) =>
  `<p class="greeting">${h.esc(f.greeting)}</p><button type="button" class="wave" hidden>Wave back</button><p class="count" aria-live="polite" hidden></p>`,
script: `
const button = block.querySelector(".wave");
const count = block.querySelector(".count");
if (!button || !count) return;

let waves = 0;
button.addEventListener("click", () => {
  waves += 1;
  count.textContent = waves === 1 ? "You waved once." : "You waved " + waves + " times.";
  count.hidden = false;
});
button.hidden = false;
`,
```

- **Work without it first.** Apollo's editor preview doesn't run scripts, and some visitors won't
  either. Render something that's already useful (in the example, the greeting), and use the
  script to add to it. Render buttons that only work with the script as `hidden`, and unhide
  them from the script.
- **Only touch your own block.** Find things with `block.querySelector(...)`, not `document`.
  There may be several of your blocks on one page.
- **Build elements, don't write HTML.** Use `document.createElement` and `textContent`, not
  `innerHTML`. This keeps anything people typed from turning into code.
- **No loading, storing or talking to the outside.** Sites run in a sandbox with no network, so
  `fetch` and friends wouldn't work anyway. Don't use storage, `postMessage`, `eval`, or `\u`
  escapes. 8 KB max.
- **Respect reduced motion.** If your block animates or scrolls, check
  `matchMedia("(prefers-reduced-motion: reduce)")`.

The checks catch the obvious mistakes, and a maintainer reads every script before it's merged.

### Rules

- **`render` only turns values into HTML.** Given the same values, it should always return the
  same HTML. Use only the `fields` and `h` helpers it's given: don't load anything from the
  internet, read the current date or time, use random numbers, or store anything between calls.
  It runs on Apollo's server every time someone views a page, so it needs to be quick and
  predictable. Apollo also cleans up what it returns (removing scripts, iframes, forms and event
  handlers). If your block needs JavaScript, use `script` (above).
- **CSS stays inside your block.** Apollo wraps your CSS in `.apollo-cb-<id> { ... }` (CSS
  nesting), so `.title { ... }` means "a `.title` inside this block" and `& { ... }` is the block
  itself. Up to 4 KB, and only `@media`, `@container` and `@supports` at-rules. No `url()`,
  `@import`, `@font-face`, `\` escapes or `position: fixed`. Sites can still restyle your block with
  their own CSS.
- **Readable.** Use the theme variables for colors so your block works with every theme. Pictures
  need alt text (the `media` field asks for it).
- **Ids and field keys are permanent.** Pages store your block's id and field keys. You can add new
  optional fields later, and change labels, help, the name and the description. Don't rename or
  remove fields, or change a field's type.
- **Credit sources.** If your block is based on something else, add a `source` with where it came
  from and its license, and only use it if that license allows it.
- **Be kind.** Names, descriptions and examples should be unproblematic.

## Graduating a block (for maintainers)

When a community block becomes official:

1. Add the official block to Apollo the usual way (lexicon, `records.ts`, validate, render, editor).
2. Add a converter for the old fields in `apps/apollo/src/shared/communityUpgrades.ts`.
3. Remove the definition from `COMMUNITY_BLOCKS` and add its id to `GRADUATED_BLOCKS` in
   [`src/index.ts`](src/index.ts), mapped to the official `$type`. The id is never reused.

## For developers

- `COMMUNITY_BLOCKS`, `findCommunityBlock(id)` and `GRADUATED_BLOCKS` - the catalog.
- `normalizeFields(def, input)` checks and tidies a block's values (Apollo's editor and server both
  use it). Apollo additionally runs `url` and `media` values through its own link and media checks.
- `validateBlockDefinition(def)` returns a list of problems (empty means valid). `cssProblems(css)`
  checks just the CSS.
- `scopedCss(def)` is the CSS Apollo adds to pages that use the block; `blockClass(id)` is the
  wrapper's class.
- `blockScriptSource(def)` is the file Apollo serves at `/_apollo/block/<id>.js` (your script
  wrapped to run once per block), and `blockScriptVersion(def)` is its content hash for the URL.
  `scriptProblems(js)` checks just the script.
