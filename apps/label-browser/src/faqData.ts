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

// Frequently asked questions shown at /faq. Add entries here.
export const FAQ_ENTRIES: FaqEntry[] = [
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
    id: "request-species",
    question: "Can you add a label for my species?",
    answer:
      "Not right now. The labeler has hit Bluesky's size limit for label definitions. In September 2024 I filed an issue asking Bluesky to raise that limit, and it hasn't been acknowledged yet. Until it is, I'm not accepting new labels - and to be fair to everyone who requested a label before the limit was reached, I'm not removing existing labels to make room. I know that isn't the answer most people are hoping for, but there's no version of this where everyone wins.",
    link: {
      href: "https://github.com/bluesky-social/atproto/issues/2803",
      label: "#2803",
    },
  },
];
