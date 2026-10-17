/**
 * Rings: webrings of Apollo sites. Loads its own data (not the site bundle) so
 * people can own a ring before - or without - making a site.
 *
 *   /edit/rings            your rings, invites, rings you're in
 *   /edit/rings/new        create a ring
 *   /edit/rings/:slug      edit a ring and its members
 *   /edit/rings/join?ring= invite link landing
 */

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Copy, ExternalLink, Trash2 } from "lucide-react";
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router";
import type { OwnedRing, RingLookupResponse, RingRef, RingsResponse } from "../../shared/dto.ts";
import { LIMITS } from "../../shared/limits.ts";
import { NSID_STYLE } from "../../shared/nsid.ts";
import type { RingMemberRef, ThemeTokens } from "../../shared/records.ts";
import { isSlug, slugify } from "../../shared/slug.ts";
import { DEFAULT_THEME, DEFAULT_THEME_ID, THEME_FONTS, THEME_RADII } from "../../shared/themes.ts";
import { api, ApiFailure } from "../api.ts";
import { profileDidFrom } from "../bsky.ts";
import { Button, Card, Notice, Spinner, TextArea, TextInput } from "../components/ui.tsx";
import { MarkdownEditor } from "./MarkdownEditor.tsx";
import { ThemeTokensEditor } from "./ThemePanel.tsx";

const message = (err: unknown, fallback: string) =>
  err instanceof ApiFailure || err instanceof Error ? err.message : fallback;

function inviteLink(uri: string): string {
  return `${window.location.origin}/edit/rings/join?ring=${encodeURIComponent(uri)}`;
}

function useRings() {
  const [data, setData] = useState<RingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Keeps the old data on screen while reloading, so saves don't flash a spinner.
  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.rings());
    } catch (err) {
      setError(message(err, "Couldn't load your rings."));
    }
  }, []);
  useEffect(() => void load(), [load]);
  return { data, error, reload: load };
}

function NoSiteHint() {
  return (
    <p className="text-xs text-neutral-500 dark:text-neutral-400">
      You need a site to join a ring.{" "}
      <Link to="/edit" className="text-sky-700 hover:underline dark:text-sky-400">
        Make your site
      </Link>{" "}
      first.
    </p>
  );
}

function RingLine({ ring }: { ring: RingRef }) {
  return (
    <div className="min-w-0">
      {ring.url ? (
        <a href={ring.url} className="font-medium hover:underline">
          {ring.name}
        </a>
      ) : (
        <span className="font-medium">{ring.name}</span>
      )}
      <p className="truncate text-xs text-neutral-500">
        by @{ring.ownerHandle ?? ring.ownerDid}
        {ring.description ? ` · ${ring.description}` : ""}
      </p>
    </div>
  );
}

function RingsOverview() {
  const { data, error, reload } = useRings();
  const [busy, setBusy] = useState<string | null>(null);

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return <Spinner label="Loading your rings..." />;

  const act = async (uri: string, fn: () => Promise<unknown>, fallback: string) => {
    setBusy(uri);
    try {
      await fn();
      await reload();
    } catch (err) {
      globalThis.alert(message(err, fallback));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Rings</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          A ring links sites together, like an old-school webring. Every member site shows{" "}
          <strong>Previous · Ring · Next</strong> links in its footer, and the ring's own page lists
          everyone.
        </p>
      </div>

      <section className="space-y-2">
        <h3 className="font-semibold">Invites</h3>
        {!data.invitesOk ? (
          <Notice tone="warn">
            We couldn't check for invites right now. If someone sent you an invite link, open it to
            join.
          </Notice>
        ) : null}
        {data.invites.length ? (
          <ul className="space-y-2">
            {data.invites.map((ring) => (
              <li key={ring.uri}>
                <Card className="flex flex-wrap items-center justify-between gap-2">
                  <RingLine ring={ring} />
                  <div className="space-y-1 text-right">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!data.hasSite || busy === ring.uri}
                      onClick={() =>
                        act(ring.uri, () => api.joinRing(ring.uri), "Couldn't join the ring.")
                      }
                    >
                      Accept
                    </Button>
                    {!data.hasSite ? <NoSiteHint /> : null}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        ) : data.invitesOk ? (
          <p className="text-sm text-neutral-500">No invites right now.</p>
        ) : null}
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Your rings</h3>
          {data.owned.length < LIMITS.ringsPerAccount ? (
            <Link
              to="/edit/rings/new"
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
            >
              + New ring
            </Link>
          ) : null}
        </div>
        {data.owned.length ? (
          <ul className="space-y-2">
            {data.owned.map((r) => {
              const accepted = r.members.filter((m) => m.status === "accepted").length;
              return (
                <li key={r.uri}>
                  <Card className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        to={`/edit/rings/${r.entry.rkey}`}
                        className="font-medium hover:underline"
                      >
                        {r.entry.value.name}
                      </Link>
                      <p className="text-xs text-neutral-500">
                        {accepted} member{accepted === 1 ? "" : "s"}
                        {r.members.length > accepted
                          ? ` · ${r.members.length - accepted} invited`
                          : ""}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <a
                        href={r.url}
                        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      >
                        View <ExternalLink size={12} aria-hidden />
                      </a>
                      <Link
                        to={`/edit/rings/${r.entry.rkey}`}
                        className="rounded-md px-2.5 py-1 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      >
                        Edit
                      </Link>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">
            You don't own any rings yet. You don't need a site of your own to start one.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">Rings your site is in</h3>
        {data.memberships.length ? (
          <>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Ring links are always shown in your site's footer - that's what makes you a member. To
              stop showing them, leave the ring.
            </p>
            <ul className="space-y-2">
              {data.memberships.map((m) => (
                <li key={m.uri}>
                  <Card className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <RingLine ring={m} />
                      {!m.active ? (
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          The owner removed your site from this ring.
                        </p>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      disabled={busy === m.uri}
                      onClick={() => {
                        if (!globalThis.confirm(`Leave "${m.name}"?`)) return;
                        void act(m.uri, () => api.leaveRing(m.uri), "Couldn't leave the ring.");
                      }}
                    >
                      Leave
                    </Button>
                  </Card>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-neutral-500">Your site isn't in any rings.</p>
        )}
      </section>
    </div>
  );
}

/** rkey of the style record holding a ring's own look. */
function ringStyleRkey(slug: string): string {
  return `ring-${slug}`.slice(0, 64).replace(/-+$/, "");
}

/** A rough sketch of the ring page in the chosen look (fonts fall back to built-ins). */
function RingLookPreview({ tokens, name }: { tokens: ThemeTokens; name: string }) {
  const radius = THEME_RADII[tokens.radius].css;
  const muted = `color-mix(in srgb, ${tokens.muted} 25%, transparent)`;
  return (
    <div
      aria-hidden
      className="space-y-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
      style={{
        background: tokens.background,
        color: tokens.text,
        fontFamily: THEME_FONTS[tokens.fontBody].stack,
      }}
    >
      <p
        className="text-xl font-bold"
        style={{ fontFamily: THEME_FONTS[tokens.fontHeading].stack }}
      >
        {name || "Your ring"}
      </p>
      <p className="text-sm" style={{ color: tokens.muted }}>
        A webring of Apollo sites.{" "}
        <span style={{ color: tokens.link ?? tokens.accent, textDecoration: "underline" }}>
          A link
        </span>
      </p>
      <span
        className="block px-3 py-2 text-center text-sm font-semibold"
        style={{ background: tokens.accent, color: tokens.accentText, borderRadius: radius }}
      >
        Visit a random site
      </span>
      <div className="grid grid-cols-2 gap-2">
        {["A member site", "Another site"].map((t) => (
          <div
            key={t}
            className="p-2 text-sm"
            style={{
              background: tokens.surface,
              borderRadius: radius,
              border: `1px solid ${muted}`,
            }}
          >
            <span className="font-semibold">{t}</span>
            <span className="block text-xs" style={{ color: tokens.muted }}>
              @someone
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const STATUS_BADGE = {
  accepted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
};

function RingEditor({
  data,
  existing,
  reload,
}: {
  data: RingsResponse;
  existing?: OwnedRing;
  /** Refetch rings after a save, so the list, statuses and new rings are current. */
  reload: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const value = existing?.entry.value;
  const [name, setName] = useState(value?.name ?? "");
  const [slug, setSlug] = useState(existing?.entry.rkey ?? "");
  const [description, setDescription] = useState(value?.description ?? "");
  const [listed, setListed] = useState(value?.unlisted !== true);
  const [body, setBody] = useState(value?.body ?? "");
  // A ring either borrows the owner's site theme or has its own style record.
  const ownStyle = data.styles.find((st) => st.rkey === value?.theme);
  const [customLook, setCustomLook] = useState(Boolean(value?.theme));
  const [tokens, setTokens] = useState<ThemeTokens>(ownStyle?.tokens ?? DEFAULT_THEME);
  const [basedOn, setBasedOn] = useState<string | undefined>(
    ownStyle ? ownStyle.basedOn : DEFAULT_THEME_ID,
  );
  const [lookDirty, setLookDirty] = useState(false);
  const [members, setMembers] = useState<RingMemberRef[]>(value?.members ?? []);
  const [invite, setInvite] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const finalSlug = existing ? existing.entry.rkey : slug || slugify(name);
  const uri = existing?.uri ?? `at://${data.did}/app.sonasky.apollo.ring/${finalSlug}`;
  const handles = new Map(existing?.members.map((m) => [m.did, m]) ?? []);
  const selfListed = members.some((m) => m.did === data.did);
  const selfJoined = data.memberships.some((m) => m.uri === uri);

  const save = async (nextMembers = members) => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const styleRkey = ringStyleRkey(finalSlug);
      if (customLook && (lookDirty || value?.theme !== styleRkey)) {
        const prior = data.styles.find((st) => st.rkey === styleRkey);
        await api.putRecord(NSID_STYLE, styleRkey, {
          name: `Ring: ${name.trim()}`,
          tokens,
          basedOn,
          ...(prior ? {} : { createdAt: new Date().toISOString() }),
        });
      }
      await api.putRing(finalSlug, {
        name: name.trim(),
        description: description.trim() || undefined,
        format: value?.format ?? "markdown",
        body: body || undefined,
        theme: customLook ? styleRkey : undefined,
        members: nextMembers,
        unlisted: listed ? undefined : true,
        createdAt: value?.createdAt,
      });
      // Back to the site theme: the ring's own style record isn't needed any more.
      if (!customLook && value?.theme === styleRkey) {
        await api.deleteRecord(NSID_STYLE, styleRkey).catch(() => undefined);
      }
      setLookDirty(false);
      await reload();
      setSaved(true);
      if (!existing) void navigate(`/edit/rings/${finalSlug}`, { replace: true });
      return true;
    } catch (err) {
      setError(message(err, "Couldn't save the ring."));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addInvite = async () => {
    setInviteError(null);
    try {
      const did = await profileDidFrom(invite);
      if (members.some((m) => m.did === did)) {
        setInviteError("That site is already in this ring.");
        return;
      }
      if (members.length >= LIMITS.ringMembers) {
        setInviteError(`A ring can have up to ${LIMITS.ringMembers} sites.`);
        return;
      }
      setMembers([...members, { did, addedAt: new Date().toISOString() }]);
      setInvite("");
    } catch (err) {
      setInviteError(message(err, "We couldn't find that account."));
    }
  };

  const move = (i: number, step: -1 | 1) => {
    const next = [...members];
    [next[i], next[i + step]] = [next[i + step], next[i]];
    setMembers(next);
  };

  const addSelf = async () => {
    const next = selfListed
      ? members
      : [...members, { did: data.did, addedAt: new Date().toISOString() }];
    setMembers(next);
    if (!(await save(next))) return;
    try {
      await api.joinRing(uri);
      await reload();
    } catch (err) {
      setError(message(err, "Couldn't add your site."));
    }
  };

  const del = async () => {
    if (
      !existing ||
      !globalThis.confirm(`Delete "${value?.name}"? Members' ring links will stop showing.`)
    )
      return;
    try {
      await api.deleteRing(existing.entry.rkey);
      if (value?.theme === ringStyleRkey(existing.entry.rkey)) {
        await api.deleteRecord(NSID_STYLE, value.theme).catch(() => undefined);
      }
      void navigate("/edit/rings");
    } catch (err) {
      setError(message(err, "Couldn't delete the ring."));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{existing ? value?.name : "New ring"}</h2>
        <Link to="/edit/rings" className="text-sm text-sky-700 hover:underline dark:text-sky-400">
          &larr; All rings
        </Link>
      </div>

      <Card className="space-y-4">
        <TextInput label="Ring name" value={name} onChange={(e) => setName(e.target.value)} />
        {!existing ? (
          <TextInput
            label="Web address"
            help={`Your ring's page will be at .../ring/${finalSlug || "..."}`}
            value={slug}
            placeholder={slugify(name || "my-ring")}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            error={slug && !isSlug(slug) ? "Use lowercase letters, numbers and dashes." : null}
          />
        ) : null}
        <TextArea
          label="Short description"
          help="Shown on the ring page and in link previews."
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
            <input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} />
            Show in the ring directory
          </label>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Lets people find this ring on Discover once a site has joined. Unlisted rings still work
            for anyone with the link.
          </p>
        </div>
        <MarkdownEditor
          label="Ring page"
          help="Anything you want on the ring's page: what it's about, how to join, rules. The member list and a random-site button are added below it."
          value={body}
          onChange={setBody}
        />
      </Card>

      <Card className="space-y-3">
        <h3 className="font-semibold">Look</h3>
        <fieldset className="space-y-2 text-sm">
          <legend className="sr-only">Ring page look</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="ring-look"
              checked={!customLook}
              onChange={() => setCustomLook(false)}
            />
            {data.hasSite ? "Use my site's theme" : "Apollo's default look"}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="ring-look"
              checked={customLook}
              onChange={() => setCustomLook(true)}
            />
            Give this ring its own look
          </label>
        </fieldset>
        {customLook ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="space-y-4">
              <ThemeTokensEditor
                tokens={tokens}
                basedOn={basedOn}
                onChange={(patch, nextBasedOn) => {
                  setTokens((t) => ({ ...t, ...patch }));
                  if (nextBasedOn !== undefined) setBasedOn(nextBasedOn);
                  setLookDirty(true);
                }}
              />
            </div>
            <div className="xl:sticky xl:top-4 xl:self-start">
              <RingLookPreview tokens={tokens} name={name} />
              <p className="mt-2 text-xs text-neutral-500">
                Saved as a style in your account, so it counts toward your {LIMITS.stylesPerSite}{" "}
                styles.
              </p>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="space-y-3">
        <h3 className="font-semibold">Sites</h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Previous/Next go through sites in this order. Invited sites join once they accept.
        </p>
        {members.length ? (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {members.map((m, i) => {
              const known = handles.get(m.did);
              const status = known?.status ?? "pending";
              return (
                <li key={m.did} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <span className="truncate text-sm">@{known?.handle ?? m.did}</span>
                    <span
                      className={`ml-2 rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_BADGE[status]}`}
                    >
                      {status === "accepted" ? "Member" : known ? "Invited" : "Not saved yet"}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Move up"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp size={14} aria-hidden />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Move down"
                      disabled={i === members.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown size={14} aria-hidden />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Remove"
                      onClick={() => setMembers(members.filter((x) => x.did !== m.did))}
                    >
                      <Trash2 size={14} aria-hidden />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">No sites yet.</p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <TextInput
              label="Invite a site"
              placeholder="alice.bsky.social"
              value={invite}
              error={inviteError}
              onChange={(e) => setInvite(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && invite.trim()) void addInvite();
              }}
            />
          </div>
          <Button onClick={addInvite} disabled={!invite.trim()}>
            Add
          </Button>
        </div>
        {data.hasSite && !(selfListed && selfJoined) ? (
          <Button size="sm" onClick={addSelf} disabled={busy || !name.trim()}>
            Add my own site to this ring
          </Button>
        ) : null}
      </Card>

      {existing ? (
        <Card className="space-y-2">
          <h3 className="font-semibold">Invite link</h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Invited sites see the invite in their Rings tab. You can also send them this link. Only
            sites you've added above can join.
          </p>
          <div className="flex flex-wrap gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-neutral-100 px-2 py-1.5 text-xs dark:bg-neutral-800">
              {inviteLink(uri)}
            </code>
            <Button size="sm" onClick={() => void navigator.clipboard.writeText(inviteLink(uri))}>
              <Copy size={14} aria-hidden /> Copy
            </Button>
          </div>
        </Card>
      ) : null}

      {error ? <Notice tone="error">{error}</Notice> : null}
      {saved ? <Notice tone="success">Saved.</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={() => void save()}
          disabled={busy || !name.trim() || !isSlug(finalSlug)}
        >
          {busy ? "Saving..." : existing ? "Save" : "Create ring"}
        </Button>
        {existing ? (
          <>
            <a
              href={existing.url}
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              View ring page <ExternalLink size={14} aria-hidden />
            </a>
            <Button variant="danger" onClick={del}>
              Delete ring
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function RingEditorRoute({ creating }: { creating?: boolean }) {
  const { slug } = useParams();
  const { data, error, reload } = useRings();
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return <Spinner label="Loading the ring..." />;
  if (creating) return <RingEditor key="new" data={data} reload={reload} />;
  const existing = data.owned.find((r) => r.entry.rkey === slug);
  if (!existing) return <Notice tone="error">That ring doesn't exist.</Notice>;
  return <RingEditor key={existing.entry.rkey} data={data} existing={existing} reload={reload} />;
}

function RingJoinRoute() {
  const [params] = useSearchParams();
  const uri = params.get("ring") ?? "";
  const [info, setInfo] = useState<RingLookupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .lookupRing(uri)
      .then(setInfo)
      .catch((err) => setError(message(err, "Couldn't load that ring.")));
  }, [uri]);
  useEffect(load, [load]);

  const join = async () => {
    setBusy(true);
    try {
      await api.joinRing(uri);
      load();
    } catch (err) {
      setError(message(err, "Couldn't join the ring."));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!info) return <Spinner label="Loading the ring..." />;
  return (
    <Card className="max-w-lg space-y-3">
      <p className="text-sm text-neutral-500">Ring invite</p>
      <RingLine ring={info.ring} />
      {info.joined ? (
        <Notice tone="success">
          Your site is in this ring. Its links now show in your site's footer.
        </Notice>
      ) : !info.invited ? (
        <Notice tone="warn">
          This ring hasn't invited your site. Ask its owner to add you, then open this link again.
        </Notice>
      ) : !info.hasSite ? (
        <NoSiteHint />
      ) : (
        <>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Joining adds <strong>Previous · {info.ring.name} · Next</strong> links to your site's
            footer. They stay there for as long as you're a member - you can leave any time.
          </p>
          <Button variant="primary" onClick={join} disabled={busy}>
            {busy ? "Joining..." : "Accept invite"}
          </Button>
        </>
      )}
      <Link
        to="/edit/rings"
        className="block text-sm text-sky-700 hover:underline dark:text-sky-400"
      >
        Go to your rings
      </Link>
    </Card>
  );
}

export function RingsRoutes() {
  return (
    <Routes>
      <Route index element={<RingsOverview />} />
      <Route path="new" element={<RingEditorRoute creating />} />
      <Route path="join" element={<RingJoinRoute />} />
      <Route path=":slug" element={<RingEditorRoute />} />
    </Routes>
  );
}
