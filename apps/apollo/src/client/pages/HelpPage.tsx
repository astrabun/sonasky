import type { ReactNode } from "react";
import { formatBytes, LIMITS } from "../../shared/limits.ts";

const QUESTIONS: { q: string; a: ReactNode }[] = [
  {
    q: "Where does my site live?",
    a: (
      <>
        In your own Bluesky account, as records - the same way your posts are stored. Apollo shows
        them as a website at <code>apollo.sonasky.app/@your.handle</code>.
      </>
    ),
  },
  {
    q: "Is there a shortcut to someone's site?",
    a: (
      <>
        Yes! On someone's Bluesky profile, change the <strong>b</strong> in <code>bsky.app</code> to{" "}
        <strong>site</strong>. So <code>bsky.app/profile/alice.bsky.social</code> becomes{" "}
        <code>sitesky.app/profile/alice.bsky.social</code>, which takes you to their Apollo site (if
        they've made one).
      </>
    ),
  },
  {
    q: "Who can see my site?",
    a: (
      <>
        Everyone. Anything you publish is public, like a post. Unpublished edits are kept only in
        this browser until you press <strong>Publish</strong>.
      </>
    ),
  },
  {
    q: "What's a block?",
    a: (
      <>
        A piece of a page: a heading, some text, a picture, a row of link buttons, an event, a
        Bluesky post and so on. Add blocks with <strong>Add a block</strong> and move them with the
        arrow buttons.
      </>
    ),
  },
  {
    q: "What's the “web address” of a page?",
    a: (
      <>
        The last part of the page's link, like <code>about</code> in <code>.../@you/about</code>.
        Use lowercase letters, numbers and dashes. To link to another of your pages, use{" "}
        <code>/about</code>.
      </>
    ),
  },
  {
    q: "Why do some links show a warning?",
    a: (
      <>
        When a visitor clicks a link to a website outside Apollo and Bluesky, they see a short
        “you're leaving” page showing exactly where the link goes. It helps protect people from
        scams. Links to Bluesky, Apollo and other SonaSky apps open straight away.
      </>
    ),
  },
  {
    q: "Why is there a size limit?",
    a: (
      <>
        Each page is saved as one record in your account, and records need to stay small. A page can
        hold about {formatBytes(LIMITS.pageBodyBytes)} of text - a lot of writing! If you reach it,
        split things into more pages. Pictures don't count toward it.
      </>
    ),
  },
  {
    q: "What files can I upload?",
    a: (
      <>
        Images (PNG, JPEG, GIF, WebP, AVIF) up to {formatBytes(LIMITS.imageBytes)} and videos (MP4,
        WebM) up to {formatBytes(LIMITS.videoBytes)}. Every upload needs a short description for
        people who can't see it.
      </>
    ),
  },
  {
    q: "Can I write my own HTML, CSS or JavaScript?",
    a: (
      <>
        Yes, if you want to! But you also don't have to if you don't want to. Switch a page to{" "}
        <em>HTML code</em>, or use <strong>Advanced</strong> for custom CSS, scripts and layouts. To
        keep visitors safe, scripts can't load anything from other websites, send data anywhere,
        open pop-ups or redirect people.
      </>
    ),
  },
  {
    q: "Does Apollo use AI?",
    a: <>No. Apollo gives you templates, themes and blocks, and you do the making.</>,
  },
  {
    q: "How do I report a site?",
    a: (
      <>
        Every Apollo site has a <strong>Report</strong> link in the bar at the top. Reports go to
        Bluesky's moderation team.
      </>
    ),
  },
  {
    q: "How do I delete my site?",
    a: (
      <>
        Go to <strong>Settings &rarr; Delete site</strong>. This removes every page, post, upload
        and setting from your account.
      </>
    ),
  },
];

export function HelpPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Help</h1>
      <dl className="space-y-5">
        {QUESTIONS.map(({ q, a }) => (
          <div key={q}>
            <dt className="font-semibold">{q}</dt>
            <dd className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">{a}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
