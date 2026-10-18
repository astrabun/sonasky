/**
 * Content-Security-Policy for the two kinds of HTML Apollo serves.
 *
 * Usercontent documents (the user's site, inside the sandboxed iframe):
 *  - `sandbox allow-scripts` even when opened top-level, so the document always
 *    runs in an opaque origin with no storage/cookies, popups or top navigation
 *  - scripts only from Apollo's bootstrap, community block scripts (reviewed
 *    code from @sonasky/apollo-blocks) and the site's own script records
 *  - images/media only from the site's own media records (+ Bluesky's CDN for
 *    avatars in Bluesky cards), fonts only via Apollo's Google Fonts proxy; no
 *    fetch/XHR/WebSocket at all, no form posts
 *  - embeddable only by the Apollo viewer shell
 *
 * Viewer shell (apollo.sonasky.app/@actor/...):
 *  - `frame-src` pinned to this one site's usercontent path, so script inside the
 *    iframe cannot navigate the frame to any other site (or another user's)
 *  - `connect-src` only to Apollo's Swetrix instance, when analytics is configured
 */

export function usercontentCsp(
  usercontentOrigin: string,
  publicOrigin: string,
  did: string,
): string {
  const site = `${usercontentOrigin}/s/${did}/`;
  const media = `${usercontentOrigin}/m/${did}/`;
  return [
    "sandbox allow-scripts",
    "default-src 'none'",
    `script-src ${usercontentOrigin}/_apollo/bootstrap.js ${usercontentOrigin}/_apollo/block/ ${site}script/`,
    // Fonts: only Apollo's own Google Fonts proxy (never Google directly).
    `style-src 'unsafe-inline' ${usercontentOrigin}/_apollo/fonts.css`,
    `img-src ${media} data: https://cdn.bsky.app`,
    `media-src ${media}`,
    `font-src ${usercontentOrigin}/_apollo/font/`,
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "worker-src 'none'",
    "manifest-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    `frame-ancestors ${publicOrigin}`,
  ].join("; ");
}

export function shellCsp(usercontentOrigin: string, did: string, analyticsOrigin?: string): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'unsafe-inline'",
    `img-src 'self' ${usercontentOrigin}/m/${did}/`,
    `frame-src ${usercontentOrigin}/r/${did}/`,
    ...(analyticsOrigin ? [`connect-src ${analyticsOrigin}`] : []),
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** CSP for Apollo's own server-rendered pages (`/out`, errors). */
export function staticPageCsp(allowSelfScripts: boolean): string {
  return [
    "default-src 'none'",
    ...(allowSelfScripts ? ["script-src 'self'"] : []),
    "style-src 'unsafe-inline'",
    "img-src 'self'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};
