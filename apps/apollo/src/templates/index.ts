/**
 * Starter templates for the getting-started wizard. Each one is plain data -
 * pages made of blocks plus a few site settings - that the wizard writes to the
 * user's repo. Nothing here is generated; the user edits everything afterwards.
 */

import type { Block, NavItem, PageRecord, PostRecord } from "../shared/records.ts";

export interface TemplateContext {
  did: string;
  handle?: string;
  title: string;
}

type Content<T> = Omit<T, "$type" | "createdAt" | "updatedAt">;

export interface TemplateResult {
  homePage: string;
  pages: { slug: string; record: Content<PageRecord> }[];
  posts?: { slug: string; record: Content<PostRecord> }[];
  nav?: NavItem[];
  blogEnabled?: boolean;
  description?: string;
}

export type TemplateIcon = "link" | "calendar" | "users" | "palette" | "pen" | "file";

export interface SiteTemplate {
  id: string;
  name: string;
  summary: string;
  /** Icon name; the wizard maps it to a lucide icon (this file stays UI-free). */
  icon: TemplateIcon;
  /** Suggested theme id from @sonasky/apollo-themes. */
  theme: string;
  build: (ctx: TemplateContext) => TemplateResult;
}

const D = "app.sonasky.apollo.defs";

const heading = (text: string, level: 1 | 2 | 3 = 1): Block => ({
  $type: `${D}#heading`,
  text,
  level,
});
const text = (markdown: string): Block => ({ $type: `${D}#text`, markdown });
const buttons = (items: { label: string; url: string }[]): Block => ({
  $type: `${D}#buttons`,
  items,
});
const profile = (did: string): Block => ({ $type: `${D}#bskyProfile`, did });
const divider: Block = { $type: `${D}#divider` };

function profileUrl(ctx: TemplateContext): string {
  return `https://bsky.app/profile/${ctx.handle ?? ctx.did}`;
}

function nextSaturdayAt7pm(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  d.setHours(19, 0, 0, 0);
  return d.toISOString();
}

function page(title: string, blocks: Block[], description?: string): Content<PageRecord> {
  return { title, description, format: "blocks", blocks };
}

export const TEMPLATES: SiteTemplate[] = [
  {
    id: "links",
    name: "Link page",
    summary: "One page with your profile and a list of buttons linking to everywhere you are.",
    icon: "link",
    theme: "sky-light",
    build: (ctx) => ({
      homePage: "home",
      pages: [
        {
          slug: "home",
          record: page(ctx.title, [
            profile(ctx.did),
            text("Hi! Here's where you can find me and my stuff."),
            buttons([
              { label: "Follow me on Bluesky", url: profileUrl(ctx) },
              { label: "My art", url: "https://example.com" },
              { label: "Commission info", url: "https://example.com" },
            ]),
          ]),
        },
      ],
    }),
  },
  {
    id: "event",
    name: "Event page",
    summary: "Share the when and where of a meetup, stream, party or con hangout.",
    icon: "calendar",
    theme: "midnight",
    build: (ctx) => ({
      homePage: "home",
      pages: [
        {
          slug: "home",
          record: page(ctx.title, [
            heading(ctx.title),
            {
              $type: `${D}#event`,
              name: ctx.title,
              start: nextSaturdayAt7pm(),
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              location: "Add the place here",
            },
            text("Tell people what to expect, what to bring, and how to find you."),
            buttons([{ label: "Say you're coming on Bluesky", url: profileUrl(ctx) }]),
            divider,
            text("**Questions?** Message me on Bluesky."),
          ]),
        },
      ],
    }),
  },
  {
    id: "starter-pack",
    name: "Starter pack sign-up",
    summary: "Explain your starter pack and how people can ask to be added.",
    icon: "users",
    theme: "sky-light",
    build: (ctx) => ({
      homePage: "home",
      pages: [
        {
          slug: "home",
          record: page(ctx.title, [
            heading(ctx.title),
            text(
              "I keep a starter pack of people in our community. Want to be in it?\n\n1. Follow me on Bluesky\n2. Send me a message or reply to my pinned post\n3. I'll add you as soon as I can!",
            ),
            buttons([{ label: "Follow me on Bluesky", url: profileUrl(ctx) }]),
            text(
              "_Tip: add a **Starter pack** block here so visitors can see who's already in it._",
            ),
          ]),
        },
      ],
    }),
  },
  {
    id: "portfolio",
    name: "Portfolio",
    summary: "Show off your work with a gallery, an about page and a contact page.",
    icon: "palette",
    theme: "paper",
    build: (ctx) => ({
      homePage: "home",
      nav: [
        { label: "Work", page: "home" },
        { label: "About", page: "about" },
        { label: "Contact", page: "contact" },
      ],
      pages: [
        {
          slug: "home",
          record: page(ctx.title, [
            heading(ctx.title),
            text(
              "A few things I've made. Upload images in **Media**, then add them to the gallery below.",
            ),
            { $type: `${D}#gallery`, items: [] },
          ]),
        },
        {
          slug: "about",
          record: page("About", [heading("About me"), text("Write a little about yourself here.")]),
        },
        {
          slug: "contact",
          record: page("Contact", [
            heading("Contact"),
            text("The best way to reach me is on Bluesky."),
            buttons([{ label: "Message me on Bluesky", url: profileUrl(ctx) }]),
          ]),
        },
      ],
    }),
  },
  {
    id: "blog",
    name: "Blog",
    summary: "A home page plus blog posts listed newest first.",
    icon: "pen",
    theme: "paper",
    build: (ctx) => ({
      homePage: "home",
      blogEnabled: true,
      nav: [
        { label: "Home", page: "home" },
        { label: "Blog", url: "/blog" },
      ],
      pages: [
        {
          slug: "home",
          record: page(ctx.title, [
            heading(ctx.title),
            text("Welcome! I write about things I'm into. Check out the [blog](/blog)."),
          ]),
        },
      ],
      posts: [
        {
          slug: "hello-world",
          record: {
            title: "Hello, world",
            format: "markdown",
            body: "This is my first post. Edit it, or delete it and write your own!\n\nPosts are written in **Markdown** - but you can use the formatting buttons instead.",
            publishedAt: new Date().toISOString(),
          },
        },
      ],
    }),
  },
  {
    id: "blank",
    name: "Start from scratch",
    summary: "A single empty page. Add whatever blocks you like.",
    icon: "file",
    theme: "sky-light",
    build: (ctx) => ({
      homePage: "home",
      pages: [{ slug: "home", record: page(ctx.title, [heading(ctx.title)]) }],
    }),
  },
];
