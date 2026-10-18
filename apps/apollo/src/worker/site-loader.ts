import { LIMITS } from "../shared/limits.ts";
import {
  NSID_LAYOUT,
  NSID_PAGE,
  NSID_POST,
  NSID_SCRIPT,
  NSID_SITE,
  NSID_STYLE,
  SITE_RKEY,
} from "../shared/nsid.ts";
import type {
  LayoutRecord,
  PageRecord,
  PostRecord,
  ScriptRecord,
  SiteRecord,
  StyleRecord,
} from "../shared/records.ts";
import { isSlug } from "../shared/slug.ts";
import { getPublicRecord, listPublicRecords, type RecordEntry } from "./atproto/repo.ts";
import type { RenderInput, RenderTarget } from "./render/document.ts";
import type { RingNav } from "./rings.ts";

export type TargetSpec =
  | { kind: "page"; slug?: string }
  | { kind: "post"; slug: string }
  | { kind: "blog" };

export interface LoadedSite {
  site: RecordEntry<SiteRecord>;
  target: RenderTarget;
  /** cid of the page/post (absent for the blog index). */
  targetCid?: string;
  targetUri?: string;
  styles: StyleRecord[];
  layout?: LayoutRecord;
  scripts: { rkey: string; cid: string }[];
  selfLabels: string[];
}

function isRecordOf<T extends { $type: string }>(value: unknown, type: string): value is T {
  return (
    typeof value === "object" && value !== null && (value as { $type?: unknown }).$type === type
  );
}

async function optionalRecord<T>(
  pds: string,
  did: string,
  collection: string,
  rkey: string | undefined,
): Promise<RecordEntry<T> | null> {
  if (!rkey || !isSlug(rkey)) return null;
  try {
    const entry = await getPublicRecord<T>(pds, did, collection, rkey);
    return entry && isRecordOf<{ $type: string }>(entry.value, collection) ? entry : null;
  } catch (err) {
    console.warn(`optional ${collection}/${rkey} failed`, err);
    return null;
  }
}

/**
 * Load the site record and whatever `spec` points at. Returns null when the
 * site or the requested page/post doesn't exist.
 */
export async function loadSite(
  pds: string,
  did: string,
  spec: TargetSpec,
): Promise<LoadedSite | null> {
  const site = await getPublicRecord<SiteRecord>(pds, did, NSID_SITE, SITE_RKEY);
  if (!site || !isRecordOf<SiteRecord>(site.value, NSID_SITE)) return null;

  let target: RenderTarget;
  let content: RecordEntry<PageRecord | PostRecord> | null = null;
  if (spec.kind === "blog") {
    if (!site.value.blogEnabled) return null;
    const posts = await listPublicRecords<PostRecord>(pds, did, NSID_POST, LIMITS.postsPerSite);
    target = { kind: "blog", posts: posts.filter((p) => isRecordOf(p.value, NSID_POST)) };
  } else if (spec.kind === "post") {
    if (!site.value.blogEnabled) return null;
    const post = await optionalRecord<PostRecord>(pds, did, NSID_POST, spec.slug);
    if (!post) return null;
    content = post;
    target = { kind: "post", slug: post.rkey, record: post.value };
  } else {
    const slug = spec.slug ?? site.value.homePage;
    const page = await optionalRecord<PageRecord>(pds, did, NSID_PAGE, slug);
    if (!page) return null;
    content = page;
    target = { kind: "page", slug: page.rkey, record: page.value };
  }

  const record = content?.value;
  const styleKeys = [site.value.theme, ...(record?.styles ?? []).slice(0, LIMITS.stylesPerPage)];
  const scriptKeys = (record?.scripts ?? []).slice(0, LIMITS.scriptsPerPage);
  const layoutKey = record?.layout ?? site.value.defaultLayout;

  const [styles, layout, scripts] = await Promise.all([
    Promise.all(styleKeys.map((k) => optionalRecord<StyleRecord>(pds, did, NSID_STYLE, k))),
    optionalRecord<LayoutRecord>(pds, did, NSID_LAYOUT, layoutKey),
    Promise.all(scriptKeys.map((k) => optionalRecord<ScriptRecord>(pds, did, NSID_SCRIPT, k))),
  ]);

  // The theme slot stays first even when the site has no theme record, so the
  // default tokens apply and page styles still layer on top.
  const themeStyle = styles[0]?.value;
  const extraStyles = styles.slice(1).flatMap((s) => (s ? [s.value] : []));

  const selfLabels = [...(site.value.labels?.values ?? []), ...(record?.labels?.values ?? [])].map(
    (l) => l.val,
  );

  return {
    site,
    target,
    targetCid: content?.cid,
    targetUri: content?.uri,
    styles: [
      themeStyle ?? { $type: NSID_STYLE, name: "default", createdAt: "", updatedAt: "" },
      ...extraStyles,
    ],
    layout: layout?.value,
    scripts: scripts.flatMap((s) => (s ? [{ rkey: s.rkey, cid: s.cid }] : [])),
    selfLabels,
  };
}

export function toRenderInput(
  loaded: LoadedSite,
  did: string,
  actor: string,
  rings: RingNav[] = [],
  handle?: string,
): RenderInput {
  return {
    rings,
    did,
    actor,
    handle,
    site: loaded.site.value,
    target: loaded.target,
    styles: loaded.styles,
    layout: loaded.layout,
    scripts: loaded.scripts,
  };
}
