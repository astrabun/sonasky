import { Link, useParams } from "react-router";
import { LIMITS } from "../../shared/limits.ts";
import { NSID_PAGE, NSID_POST } from "../../shared/nsid.ts";
import { api, ApiFailure } from "../api.ts";
import { Button, Card, Notice } from "../components/ui.tsx";
import { editable, useEditorState } from "./context.tsx";
import { PageEditor } from "./PageEditor.tsx";

export function PagesPanel() {
  const { bundle, site, setSite, remove } = useEditorState();
  const pages = [...bundle.pages].sort((a, b) =>
    a.rkey === site.value.homePage
      ? -1
      : b.rkey === site.value.homePage
        ? 1
        : a.value.title.localeCompare(b.value.title),
  );

  const setHome = async (rkey: string) => {
    try {
      const res = await api.putSite({ ...editable(site.value), homePage: rkey });
      setSite({ ...site, cid: res.cid, value: { ...site.value, homePage: rkey } });
    } catch (err) {
      globalThis.alert(err instanceof ApiFailure ? err.message : "Couldn't change the home page.");
    }
  };

  const del = async (rkey: string, title: string) => {
    if (!globalThis.confirm(`Delete "${title}"? This can't be undone.`)) return;
    try {
      await api.deleteRecord(NSID_PAGE, rkey);
      remove(NSID_PAGE, rkey);
      if (site.value.nav?.some((n) => n.page === rkey)) {
        const nav = site.value.nav.filter((n) => n.page !== rkey);
        const res = await api.putSite({ ...editable(site.value), nav });
        setSite({ ...site, cid: res.cid, value: { ...site.value, nav } });
      }
    } catch (err) {
      globalThis.alert(err instanceof ApiFailure ? err.message : "Couldn't delete the page.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Pages</h2>
        {pages.length < LIMITS.pagesPerSite ? (
          <Link
            to="/edit/pages/new"
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            + New page
          </Link>
        ) : null}
      </div>
      <ul className="space-y-2">
        {pages.map((p) => {
          const isHome = p.rkey === site.value.homePage;
          return (
            <li key={p.rkey}>
              <Card className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Link to={`/edit/pages/${p.rkey}`} className="font-medium hover:underline">
                    {p.value.title || p.rkey}
                  </Link>
                  {isHome ? (
                    <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-900 dark:text-sky-100">
                      Home
                    </span>
                  ) : null}
                  <p className="text-xs text-neutral-500">
                    {isHome ? bundle.siteUrl : `${bundle.siteUrl}/${p.rkey}`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Link
                    to={`/edit/pages/${p.rkey}`}
                    className="rounded-md px-2.5 py-1 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    Edit
                  </Link>
                  {!isHome ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setHome(p.rkey)}>
                        Make home page
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => del(p.rkey, p.value.title)}>
                        Delete
                      </Button>
                    </>
                  ) : null}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PageEditorRoute({ kind }: { kind: "page" | "post" }) {
  const { slug } = useParams();
  const { bundle } = useEditorState();
  if (slug === "new") return <PageEditor key={`${kind}-new`} kind={kind} entry={null} />;
  const entry =
    (kind === "post" ? bundle.posts : bundle.pages).find((p) => p.rkey === slug) ?? null;
  if (!entry)
    return <Notice tone="warn">That {kind} doesn't exist (it may have been deleted).</Notice>;
  return <PageEditor key={`${kind}-${entry.rkey}`} kind={kind} entry={entry} />;
}

export function BlogPanel() {
  const { bundle, site, setSite, remove } = useEditorState();
  const posts = [...bundle.posts].sort((a, b) =>
    b.value.publishedAt.localeCompare(a.value.publishedAt),
  );

  const enable = async () => {
    try {
      const nav = site.value.nav?.some((n) => n.url === "/blog")
        ? site.value.nav
        : [
            ...(site.value.nav ?? [{ label: "Home", page: site.value.homePage }]),
            { label: "Blog", url: "/blog" },
          ];
      const res = await api.putSite({ ...editable(site.value), blogEnabled: true, nav });
      setSite({ ...site, cid: res.cid, value: { ...site.value, blogEnabled: true, nav } });
    } catch (err) {
      globalThis.alert(err instanceof ApiFailure ? err.message : "Couldn't turn on the blog.");
    }
  };

  const disable = async () => {
    if (
      !globalThis.confirm(
        posts.length
          ? `Turn off the blog? ${bundle.siteUrl}/blog and your ${posts.length} post(s) will stop showing on your site. The posts stay saved, so turning the blog back on brings them back. (Delete them first if you want them gone.)`
          : `Turn off the blog? ${bundle.siteUrl}/blog will stop showing on your site.`,
      )
    )
      return;
    try {
      const kept = site.value.nav?.filter((n) => n.url !== "/blog");
      const nav = kept?.length ? kept : undefined;
      const res = await api.putSite({ ...editable(site.value), blogEnabled: false, nav });
      setSite({ ...site, cid: res.cid, value: { ...site.value, blogEnabled: false, nav } });
    } catch (err) {
      globalThis.alert(err instanceof ApiFailure ? err.message : "Couldn't turn off the blog.");
    }
  };

  const del = async (rkey: string, title: string) => {
    if (!globalThis.confirm(`Delete "${title}"? This can't be undone.`)) return;
    try {
      await api.deleteRecord(NSID_POST, rkey);
      remove(NSID_POST, rkey);
    } catch (err) {
      globalThis.alert(err instanceof ApiFailure ? err.message : "Couldn't delete the post.");
    }
  };

  if (!site.value.blogEnabled) {
    return (
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">Blog</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Add a blog to your site: write posts, and visitors see them listed newest first at{" "}
          <span className="font-mono text-xs">{bundle.siteUrl}/blog</span>.
        </p>
        <Button variant="primary" onClick={enable}>
          Turn on the blog
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Blog posts</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={disable}>
            Turn off the blog
          </Button>
          <Link
            to="/edit/blog/new"
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            + New post
          </Link>
        </div>
      </div>
      {posts.length === 0 ? <p className="text-sm text-neutral-500">No posts yet.</p> : null}
      <ul className="space-y-2">
        {posts.map((p) => (
          <li key={p.rkey}>
            <Card className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Link to={`/edit/blog/${p.rkey}`} className="font-medium hover:underline">
                  {p.value.title}
                </Link>
                <p className="text-xs text-neutral-500">
                  {new Date(p.value.publishedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-1">
                <Link
                  to={`/edit/blog/${p.rkey}`}
                  className="rounded-md px-2.5 py-1 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Edit
                </Link>
                <Button size="sm" variant="ghost" onClick={() => del(p.rkey, p.value.title)}>
                  Delete
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
