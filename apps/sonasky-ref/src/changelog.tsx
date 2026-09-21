import dayjs from "dayjs";
import type { ReactNode } from "react";
import { compare as semverCompare } from "semver";

export interface ChangelogEntry {
  version: string;
  date: dayjs.Dayjs;
  changes: (string | ReactNode)[];
}

const changelogData = [
  {
    changes: [
      `Initial release of the application.`,
      `Added basic functionality for data manipulation and storage.`,
    ],
    date: dayjs(`2025-01-12`),
    version: "1.0.0",
  },
  {
    changes: [
      `Combine Add and Edit character pages into a single re-usable component.`,
      `Added changelog.`,
    ],
    date: dayjs(`2025-02-25`),
    version: "1.1.0",
  },
  {
    changes: [`Improve support for alternate PDS users.`],
    date: dayjs(`2025-12-29`),
    version: "1.1.1",
  },
  {
    changes: [`Depdendency updates.`, `Quality of life updates.`],
    date: dayjs(`2026-05-13`),
    version: "1.2.0",
  },
  {
    changes: [
      `Add image index selection for ref sheets (in case the post has multiple images)`,
      `Add blur + age warning dialog for ref sheets with NSFW tag applied.`,
    ],
    date: dayjs(`2026-05-13`),
    version: "1.3.0",
  },
  {
    changes: [`HOTFIX: Increase blur on nsfw to make it harder to see through`],
    date: dayjs(`2026-05-13`),
    version: "1.3.1",
  },
  {
    changes: [
      `Adds a feature for adding external links to a ref sheet page; if you've got a refsheet on FA or an extra image to link to on Bluesky, for example, you can add it here.`,
      <>
        If an external site you would like to link to is not yet supported,{" "}
        <a
          href="https://github.com/astrabun/sonasky-ref/issues/new?template=external-link-domain.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          open an issue on Github
        </a>
        .
      </>,
      `Adjusts how colors are displayed on the character view page; they should be centered and consistent heights now.`,
      `Adds "Export" button for color palettes in multiple formats.`,
      `Pulls alt text from Bluesky images if present.`,
      `Adds clarity on character editor/character viewer for when it is okay to draw the character with additional checkboxes for "ok-to-draw" scenarios.`,
      `Hide transparency slider for color picker as it was not intended to be present.`,
      `Add support for using quote posts for ref images.`,
      `Simple artist credit field (text only).`,
      `Add support for reordering character list.`,
      `Add confirmation dialog when clearing colors from a ref sheet.`,
      `Add basic markdown support for description field.`,
    ],
    date: dayjs(`2026-05-15`),
    version: "1.4.0", // Despite the amount of updates, it's still backwards compatible so old records still show correctly. Only a minor version update.
  },
  {
    changes: [
      `Bugfix: Add additional resolution option for W3C community draft did:web method on profile view page.`,
      `Bugfix: Add additional resolution option for W3C community draft did:web method on character view page.`,
      `Bugfix: fix flash to 404 on loading character from did:web repo.`,
    ],
    date: dayjs(`2026-06-04`),
    version: "1.4.1",
  },
  {
    changes: [
      `Enhancement: If using https://ssky.app/profile/<something>, if the URL ends in /post/<something>, it'll strip the post part and just go to the profile..`,
    ],
    date: dayjs(`2026-06-05`),
    version: "1.4.2",
  },
  {
    changes: [
      `Quality of Life Update: Searching for a user on the homepage will auto-fill/suggest a user as you type.`,
    ],
    date: dayjs(`2026-08-25`),
    version: "1.4.3",
  },
  {
    changes: [
      `Basic analytics (self-hosted Swetrix, NOT a big provider like Google) to get an idea of usage`,
    ],
    date: dayjs(`2026-09-06`),
    version: "1.4.4",
  },
  {
    changes: [
      `Scope narrowed when getting oauth token from Bluesky; now tokens are scoped ONLY to sonasky ref repo records management.`,
    ],
    date: dayjs(`2026-09-08`),
    version: "1.4.5",
  },
  {
    changes: [
      `Refreshed the visual style of SonaSky ref (moved to Tailwind to align with other SonaSky web components)`,
    ],
    date: dayjs(`2026-09-18`),
    version: "1.4.6",
  },
  {
    changes: [
      `Add the ability to upload a ref sheet image directly, for characters that don't have an existing Bluesky post to reference. Look for the "Upload an Image" option next to Ref Sheet / Alt Ref on the character editor.`,
      `Uploaded ref sheet images support alt text for accessibility.`,
      `Add the ability to report an uploaded ref sheet image, right from the character view page, to Bluesky Moderation Services (must be signed in).`,
      `You may be asked to sign out and back in once to grant the new upload/report permissions.`,
      `Character descriptions now support markdown links. Links to sites other than Bluesky/SonaSky show a leaving-site warning before you navigate.`,
      `Character descriptions now have a "Formatted" editor alongside the raw "Source" markdown view, with a toolbar for bold, italic, strikethrough, underline, headings, quotes, lists, checklists, tables, links, and dividers.`,
      `Better markdown support for tables, task list checkboxes, and --- dividers in character descriptions.`,
    ],
    date: dayjs(`2026-09-19`),
    version: "1.5.0",
  },
  {
    changes: [
      `Add character art galleries! Attach extra artwork to a character beyond the ref sheet, either by linking a Bluesky post or uploading an image directly, with support for a title, artist credit, and alt text on each entry.`,
      `Manage Data page overhaul: characters, gallery entries, and uploaded assets are now listed with thumbnail previews, and each can be deleted individually with a confirmation dialog. Assets still in use by a character or gallery entry are flagged before you delete them.`,
      `Improved mobile layout for the dashboard sidebar/navigation.`,
      `Added a live user count to the homepage.`,
      `Bugfix: various fixes for loading ref sheet images.`,
    ],
    date: dayjs(`2026-09-20`),
    version: "1.6.0",
  },
  {
    changes: [
      `Performance: Character art galleries now load in batches of 10 with a "Load more" button, instead of loading every image at once.`,
    ],
    date: dayjs(`2026-09-20`),
    version: "1.6.1",
  },
  {
    changes: [
      `Bugfix: profile and character pages failed to load for accounts hosted on a PDS other than bsky.social when visited via a did:plc URL (e.g. after clicking "Back" from a character page). The app now resolves the account's actual PDS before querying it, instead of assuming bsky.social.`,
    ],
    date: dayjs(`2026-09-20`),
    version: "1.6.2",
  },
];

// Get latest version by the highest semver version
const latestVersion = changelogData.reduce(
  (latest, current) => (semverCompare(current.version, latest.version) > 0 ? current : latest),
  changelogData[0],
);

export { changelogData, latestVersion };
