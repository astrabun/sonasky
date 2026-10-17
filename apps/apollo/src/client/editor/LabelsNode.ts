/**
 * Formatted-mode (tiptap) node for the labels placeholder, so
 * `<div data-apollo-labels="...">` survives a round trip through the WYSIWYG
 * editor instead of being dropped as unknown HTML. Shown as a small chip.
 */

import { Node } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import {
  LABELS_PLACEHOLDER_ATTR,
  PRESET_LABELERS,
  labelsPlaceholder,
  parseLabelerList,
} from "../../shared/labelers.ts";

function snippetFor(node: PMNode): string {
  return labelsPlaceholder({
    labelers: parseLabelerList(String(node.attrs.labelers ?? "")),
    layout: node.attrs.layout === "combined" ? "combined" : undefined,
    title: node.attrs.title ? String(node.attrs.title) : undefined,
  });
}

function describe(node: PMNode): string {
  const names = parseLabelerList(String(node.attrs.labelers ?? "")).map(
    (did) => PRESET_LABELERS.find((p) => p.did === did)?.name ?? did,
  );
  return names.length ? `Your labels: ${names.join(", ")}` : "Your labels (no labelers picked)";
}

export const LabelsNode = Node.create({
  name: "apolloLabels",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      labelers: {
        default: "",
        parseHTML: (el) => el.getAttribute(LABELS_PLACEHOLDER_ATTR) ?? "",
        renderHTML: (attrs) => ({ [LABELS_PLACEHOLDER_ATTR]: attrs.labelers }),
      },
      layout: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-layout"),
        renderHTML: (attrs) => (attrs.layout ? { "data-layout": attrs.layout } : {}),
      },
      title: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-title"),
        renderHTML: (attrs) => (attrs.title ? { "data-title": attrs.title } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: `div[${LABELS_PLACEHOLDER_ATTR}]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", HTMLAttributes];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.className =
        "my-2 rounded-md border border-dashed border-neutral-300 px-3 py-2 text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-300";
      dom.textContent = describe(node);
      return { dom };
    };
  },

  addStorage() {
    return {
      // tiptap-markdown: write the placeholder back out as raw HTML.
      markdown: {
        serialize(
          state: { write: (s: string) => void; closeBlock: (n: PMNode) => void },
          node: PMNode,
        ) {
          state.write(snippetFor(node));
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});
