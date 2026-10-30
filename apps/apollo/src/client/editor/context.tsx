import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { BadgeEntry, Entry, MediaEntry, SiteBundle } from "../../shared/dto.ts";
import {
  NSID_LAYOUT,
  NSID_PAGE,
  NSID_POST,
  NSID_SCRIPT,
  NSID_STYLE,
  type SlugCollection,
} from "../../shared/nsid.ts";
import type { SiteRecord } from "../../shared/records.ts";

type ListKey = "pages" | "posts" | "styles" | "scripts" | "layouts";

export const LIST_FOR: Record<SlugCollection, ListKey> = {
  [NSID_PAGE]: "pages",
  [NSID_POST]: "posts",
  [NSID_STYLE]: "styles",
  [NSID_SCRIPT]: "scripts",
  [NSID_LAYOUT]: "layouts",
};

export interface EditorState {
  bundle: SiteBundle;
  site: Entry<SiteRecord>;
  setSite: (entry: Entry<SiteRecord>) => void;
  upsert: (collection: SlugCollection, entry: Entry<unknown>) => void;
  remove: (collection: SlugCollection | "media" | "badges", rkey: string) => void;
  upsertMedia: (entry: MediaEntry) => void;
  upsertBadge: (entry: BadgeEntry) => void;
  reload: () => void;
}

const EditorContext = createContext<EditorState | null>(null);

export function EditorProvider({
  initial,
  reload,
  children,
}: {
  initial: SiteBundle & { site: Entry<SiteRecord> };
  reload: () => void;
  children: ReactNode;
}) {
  const [bundle, setBundle] = useState<SiteBundle & { site: Entry<SiteRecord> }>(initial);

  const setSite = useCallback((site: Entry<SiteRecord>) => setBundle((b) => ({ ...b, site })), []);

  const upsert = useCallback((collection: SlugCollection, entry: Entry<unknown>) => {
    const key = LIST_FOR[collection];
    setBundle((b) => {
      const list = b[key] as Entry<unknown>[];
      const next = list.some((e) => e.rkey === entry.rkey)
        ? list.map((e) => (e.rkey === entry.rkey ? entry : e))
        : [...list, entry];
      return { ...b, [key]: next };
    });
  }, []);

  const remove = useCallback((collection: SlugCollection | "media" | "badges", rkey: string) => {
    const key =
      collection === "media" || collection === "badges" ? collection : LIST_FOR[collection];
    setBundle((b) => ({
      ...b,
      [key]: (b[key] as Entry<unknown>[]).filter((e) => e.rkey !== rkey),
    }));
  }, []);

  const upsertMedia = useCallback((entry: MediaEntry) => {
    setBundle((b) => ({
      ...b,
      media: b.media.some((m) => m.rkey === entry.rkey)
        ? b.media.map((m) => (m.rkey === entry.rkey ? entry : m))
        : [entry, ...b.media],
    }));
  }, []);

  const upsertBadge = useCallback((entry: BadgeEntry) => {
    setBundle((b) => ({
      ...b,
      badges: b.badges.some((e) => e.rkey === entry.rkey)
        ? b.badges.map((e) => (e.rkey === entry.rkey ? entry : e))
        : [entry, ...b.badges],
    }));
  }, []);

  const value = useMemo(
    () => ({
      bundle,
      site: bundle.site,
      setSite,
      upsert,
      remove,
      upsertMedia,
      upsertBadge,
      reload,
    }),
    [bundle, setSite, upsert, remove, upsertMedia, upsertBadge, reload],
  );
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditorState(): EditorState {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditorState outside EditorProvider");
  return ctx;
}

/** Strip server-managed fields before sending a record back for an update. */
export function editable<T extends { $type?: string }>(record: T): Omit<T, "$type"> {
  const { $type: _type, ...rest } = record;
  return rest;
}
