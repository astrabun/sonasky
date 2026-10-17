/**
 * Apollo's own small server-rendered pages (link interstitial, content
 * warnings, "unavailable", "not found"). No framework, no external resources;
 * they work without JavaScript.
 */

import { esc } from "./escape.ts";
import { icon } from "./icons.ts";
import { SECURITY_HEADERS, staticPageCsp } from "./csp.ts";

export const BASE_STYLES = `:root{color-scheme:light dark;--bg:#f8fafc;--card:#fff;--text:#0f172a;--muted:#475569;--border:#e2e8f0;--accent:#0284c7;--accent-text:#fff;--warn-bg:#fef3c7;--warn-text:#78350f}
@media (prefers-color-scheme:dark){:root{--bg:#0a0a0a;--card:#171717;--text:#ededed;--muted:#a3a3a3;--border:#262626;--accent:#38bdf8;--accent-text:#082f49;--warn-bg:#422006;--warn-text:#fde68a}}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.55}
.page{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px}
.card{width:100%;max-width:34rem;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:28px}
h1{font-size:1.35rem;margin:0 0 12px}
p{margin:0 0 12px;color:var(--muted)}
.host{font-size:1.15rem;font-weight:700;color:var(--text);word-break:break-all}
.url{display:block;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.85rem;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 12px;word-break:break-all;color:var(--text);margin:0 0 16px}
.warn{background:var(--warn-bg);color:var(--warn-text);border-radius:8px;padding:10px 12px;font-size:.9rem;margin:0 0 16px}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}
.btn{display:inline-block;padding:10px 16px;border-radius:10px;font-weight:600;text-decoration:none;border:1px solid var(--border);color:var(--text);background:transparent}
.btn-primary{background:var(--accent);border-color:var(--accent);color:var(--accent-text)}
.brand{display:flex;align-items:center;gap:6px;margin-bottom:16px;color:var(--muted);font-size:.85rem;text-decoration:none}`;

export function staticPage(opts: {
  title: string;
  body: string;
  status?: number;
  /** Load /_apollo/back.js (wires up [data-back] "Go back" links). */
  backScript?: boolean;
}): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(
    opts.title,
  )} · SonaSky Apollo</title><style>${BASE_STYLES}</style></head><body><main class="page"><div class="card"><a class="brand" href="/">${icon("sun")} SonaSky Apollo</a>${opts.body}</div></main>${
    opts.backScript ? '<script src="/_apollo/back.js"></script>' : ""
  }</body></html>`;
  return new Response(html, {
    status: opts.status ?? 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": staticPageCsp(Boolean(opts.backScript)),
      "x-robots-tag": "noindex",
      ...SECURITY_HEADERS,
    },
  });
}

export function notFoundPage(message = "We couldn't find that page."): Response {
  return staticPage({
    title: "Not found",
    status: 404,
    body: `<h1>Not found</h1><p>${esc(message)}</p><div class="actions"><a class="btn btn-primary" href="/">Go to Apollo</a></div>`,
  });
}

export function unavailablePage(): Response {
  return staticPage({
    title: "Unavailable",
    status: 451,
    body: `<h1>This site isn't available</h1><p>It has been taken down or the account is no longer active.</p><div class="actions"><a class="btn btn-primary" href="/">Go to Apollo</a></div>`,
  });
}

export const BACK_SCRIPT = `(function(){var links=document.querySelectorAll("[data-back]");for(var i=0;i<links.length;i++){links[i].addEventListener("click",function(e){if(history.length>1){e.preventDefault();history.back();}});}})();`;
