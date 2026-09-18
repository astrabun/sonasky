export type FaqEntry = {
  // Stable anchor slug. Used in the URL as /faq#<id> to deep-link an entry.
  id: string;
  question: string;
  answer: string;
  link?: {
    href: string;
    label: string;
  };
};

export type FaqCategory = {
  title: string;
  entries: FaqEntry[];
};

// Frequently asked questions shown at /faq, grouped under category headings.
// Add entries within the relevant category, or add a new category.
export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    title: "How-to and troubleshooting",
    entries: [
      {
        id: "add-labels",
        question: "How do I add a label to my account?",
        answer:
          "Like the label's post on Bluesky. Use the browser on sonasky.app to find the post for your species, open it, and like it - the bot applies the label automatically.",
      },
      {
        id: "labels-stuck",
        question: "I liked or unliked posts, but my labels seem stuck. What's going on?",
        answer:
          "This is almost always a temporary networking issue, either on Bluesky's side or on the server that hosts the bot. Check the bot's current lag time on sonasky.app. If the bot is caught up and your labels still aren't right, try liking or unliking the posts again. If the bot is significantly behind, I'm most likely already looking into it. SonaSky is a best-effort hobby project, so I can't guarantee perfect uptime - thanks for your patience.",
      },
      {
        id: "make-ref-sheet",
        question: "Is it true I can make a ref sheet page with SonaSky?",
        answer:
          "Yes, using SonaSky Ref. It lets you build a character reference sheet that lives in your Bluesky PDS repo, and gives you a page you can share.",
        link: {
          href: "https://ref.sonasky.app",
          label: "ref.sonasky.app",
        },
      },
    ],
  },
  {
    title: "Requests",
    entries: [
      {
        id: "request-species",
        question: "Can you add a label for my species?",
        answer:
          "Not right now. The labeler has hit Bluesky's size limit for label definitions. In September 2024 I filed an issue asking Bluesky to raise that limit, and it hasn't been acknowledged yet. Until it is, I'm not accepting new labels - and to be fair to everyone who requested a label before the limit was reached, I'm not removing existing labels to make room. I know that isn't the answer most people are hoping for, but there's no version of this where everyone wins.",
        link: {
          href: "https://github.com/bluesky-social/atproto/issues/2803",
          label: "#2803",
        },
      },
      {
        id: "give-feedback",
        question: "Can I give feedback about SonaSky?",
        answer:
          "Yes. Check the open feedback link at the top of sonasky.app, or see if there's an active survey at forms.sonasky.app - that requires signing in with your Bluesky account.",
        link: {
          href: "https://forms.sonasky.app",
          label: "forms.sonasky.app",
        },
      },
    ],
  },
  {
    title: "SonaSky Feeds",
    entries: [
      {
        id: "feed-types",
        question:
          "What's the difference between All Users, Trending, Comet, and the per-species feeds?",
        answer:
          "All SonaSky Users shows every post from a labeled account, newest first - no ranking. Species Latest is the same thing, just filtered to one species. SonaSky Trending ranks recent posts from labeled accounts by likes and reposts, weighted so newer posts don't need as much engagement to rank - Species Trending is that same ranking narrowed to one species. SonaSky Comet is different: instead of ranking by a post's total likes and reposts, it only counts engagement from other SonaSky users, and the post itself doesn't need a label - so it can surface posts from unlabeled accounts if enough SonaSky users are engaging with them.",
      },
      {
        id: "opt-out-algorithmic",
        question: "Can I keep my posts out of the SonaSky feeds?",
        answer:
          "Yes. Bluesky has a setting that asks apps to leave your posts out of algorithmic recommendations, meant to stop a post from going viral on something like Discover. Turning it on writes a record to your account (app.bsky.actor.contentVisibilityDeclaration) that any app can check. SonaSky Feeds checks it too: if you've turned it on, your posts are left out of every SonaSky feed, including All SonaSky Users and the per-species feeds, not just Trending and Comet.",
      },
    ],
  },
];

// Flat list of every entry, in display order. Used for id lookups (deep-linking).
export const FAQ_ENTRIES: FaqEntry[] = FAQ_CATEGORIES.flatMap((category) => category.entries);
