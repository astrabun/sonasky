import { defineCommunityBlock } from "../types.ts";

/**
 * The smallest block with a script: a greeting that works on its own, plus a
 * button the script turns on. Copy this one if your block needs JavaScript.
 */
export const helloWave = defineCommunityBlock({
  id: "hello-wave",
  name: "Hello wave",
  description: "Say hello to visitors, and let them wave back.",
  author: { name: "SonaSky (Example)" },
  fields: {
    greeting: { type: "text", label: "Greeting", required: true, max: 200 },
  },
  example: { greeting: "Hello, and welcome to my site!" },
  css: `
& { margin: 1.5em 0; text-align: center; }
.greeting { font-family: var(--apollo-font-heading); font-size: 1.3rem; margin: 0 0 0.75em; }
.wave { padding: 8px 16px; border: 0; border-radius: var(--apollo-radius); background: var(--apollo-accent); color: var(--apollo-accent-text); font: inherit; font-weight: 600; cursor: pointer; }
.count { color: var(--apollo-muted); margin: 0.5em 0 0; }
`,
  // The greeting shows with or without the script. The button and counter
  // start hidden, and the script shows them.
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
});
