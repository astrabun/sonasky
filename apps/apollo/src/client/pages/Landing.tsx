import { Blocks, Cloud } from "lucide-react";
import { Link } from "react-router";
import { SignIn } from "../components/SignIn.tsx";
import { SiteCount } from "../components/SiteCount.tsx";

const FEATURES = [
  {
    icon: Blocks,
    title: "No AI needed",
    body: "Pick a starting point, then build your page from blocks: text, pictures, link buttons, events, Bluesky posts and more.",
  },
  {
    icon: Cloud,
    title: "Lives in your Bluesky account",
    body: "Your site is saved in your own account, like your posts. Sign in with Bluesky - no new password.",
  },
];

export function Landing() {
  return (
    <div className="space-y-12">
      <section className="space-y-4 pt-6">
        <h1 className="text-4xl font-bold tracking-tight">Make a little website.</h1>
        <p className="max-w-xl text-lg text-neutral-600 dark:text-neutral-300">
          A link page, an event, a starter-pack sign-up, a portfolio or a blog - built with your own
          hands and saved in your Bluesky account.
        </p>
        <div className="max-w-md">
          <SignIn returnTo="/edit" intro="Sign in with your Bluesky handle to get started." />
        </div>
        <SiteCount className="text-sm text-neutral-600 dark:text-neutral-400" />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <f.icon size={24} className="text-sky-600" aria-hidden />
            <h2 className="mt-2 font-semibold">{f.title}</h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">How it works</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-700 dark:text-neutral-300">
          <li>Sign in with Bluesky and choose what you want to make.</li>
          <li>Add and arrange blocks, pick colors and fonts, upload pictures.</li>
          <li>
            Press Publish. Your site is live at{" "}
            <span className="font-mono text-xs">apollo.sonasky.app/@your.handle</span>.
          </li>
        </ol>
        <p className="text-sm">
          <Link to="/help" className="text-sky-700 hover:underline dark:text-sky-400">
            Questions? Read the help page.
          </Link>
        </p>
      </section>
    </div>
  );
}
