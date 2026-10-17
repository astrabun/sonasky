/**
 * The labels widget: the site owner's labels as chips, either one section per
 * labeler or a single combined row. Used by the labels block and by
 * `<div data-apollo-labels="...">` placeholders in writing / HTML pages.
 */

import {
  LABELS_PLACEHOLDER_ATTR,
  parseLabelerList,
  sonaskyLabelUrl,
} from "../../shared/labelers.ts";
import { LIMITS, utf8Bytes } from "../../shared/limits.ts";
import type { LabelsLayout } from "../../shared/records.ts";
import { ownerLabels, type LabelerLabels } from "../labels.ts";
import { esc } from "./escape.ts";

export interface LabelsWidget {
  labelers: string[];
  layout?: LabelsLayout;
  title?: string;
}

function chip(group: LabelerLabels, val: string, withAvatar: boolean): string {
  const name = group.labeler.names[val] ?? val;
  const avatar =
    withAvatar && group.labeler.avatar
      ? `<img class="apollo-label-avatar" src="${esc(group.labeler.avatar)}" alt="" title="${esc(group.labeler.name)}" loading="lazy">`
      : "";
  const href = sonaskyLabelUrl(group.labeler.did, val);
  const inner = `${avatar}${esc(name)}`;
  return `<li>${
    href
      ? `<a class="apollo-label-chip" href="${esc(href)}">${inner}</a>`
      : `<span class="apollo-label-chip">${inner}</span>`
  }</li>`;
}

function sortedValues(group: LabelerLabels): string[] {
  return [...group.values].sort((a, b) =>
    (group.labeler.names[a] ?? a).localeCompare(group.labeler.names[b] ?? b),
  );
}

/** Widget HTML from already-fetched labels. Empty string when there's nothing to show. */
export function labelsHtml(widget: LabelsWidget, groups: LabelerLabels[]): string {
  const shown = groups.filter((g) => g.values.length > 0);
  if (shown.length === 0) return "";
  const title = widget.title ? `<h3 class="apollo-labels-title">${esc(widget.title)}</h3>` : "";

  if (widget.layout === "combined") {
    const chips = shown.flatMap((g) => sortedValues(g).map((v) => chip(g, v, true))).join("");
    return `<section class="apollo-labels">${title}<ul class="apollo-labels-list">${chips}</ul></section>`;
  }

  const sections = shown
    .map((g) => {
      const avatar = g.labeler.avatar
        ? `<img class="apollo-label-avatar" src="${esc(g.labeler.avatar)}" alt="" loading="lazy">`
        : "";
      const profile = `https://bsky.app/profile/${g.labeler.did}`;
      return `<div class="apollo-labels-group"><a class="apollo-labels-labeler" href="${esc(profile)}">${avatar}${esc(
        g.labeler.name,
      )}</a><ul class="apollo-labels-list">${sortedValues(g)
        .map((v) => chip(g, v, false))
        .join("")}</ul></div>`;
    })
    .join("");
  return `<section class="apollo-labels">${title}${sections}</section>`;
}

export async function renderLabels(widget: LabelsWidget, ownerDid: string): Promise<string> {
  if (widget.labelers.length === 0) return "";
  return labelsHtml(widget, await ownerLabels(ownerDid, widget.labelers));
}

/**
 * Replace `<div data-apollo-labels="...">` placeholders in sanitized HTML with
 * the rendered widget. Runs after the sanitizer (which keeps `data-*` and strips
 * comments), so the comment tokens used here can't come from the author.
 */
export async function expandLabelPlaceholders(html: string, ownerDid: string): Promise<string> {
  if (!html.includes(LABELS_PLACEHOLDER_ATTR)) return html;
  const nonce = crypto.randomUUID();
  const widgets: LabelsWidget[] = [];
  const marked = await new HTMLRewriter()
    .on(`[${LABELS_PLACEHOLDER_ATTR}]`, {
      element(el) {
        // Same cap as blocks per page, so a page can't fan out unbounded fetches.
        if (widgets.length >= LIMITS.blocksPerPage) return;
        const layout = el.getAttribute("data-layout") === "combined" ? "combined" : "grouped";
        const title = el.getAttribute("data-title") ?? undefined;
        widgets.push({
          labelers: parseLabelerList(el.getAttribute(LABELS_PLACEHOLDER_ATTR) ?? ""),
          layout,
          title: title && utf8Bytes(title) <= LIMITS.titleBytes ? title : undefined,
        });
        el.replace(`<!--apollo-labels:${nonce}:${widgets.length - 1}-->`, { html: true });
      },
    })
    .transform(new Response(html))
    .text();
  if (widgets.length === 0) return html;

  const rendered = await Promise.all(
    widgets.map((w) =>
      renderLabels(w, ownerDid).catch((err: unknown) => {
        console.warn("render: labels placeholder failed", err);
        return "";
      }),
    ),
  );
  const token = new RegExp(`<!--apollo-labels:${nonce}:(\\d+)-->`, "g");
  return marked.replace(token, (_, i: string) => rendered[Number(i)] ?? "");
}
