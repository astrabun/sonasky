import { useEffect, useState } from "react";
import "./App.css";
import { FAQ_ENTRIES } from "./faqData";

function hashId(): string {
  return decodeURIComponent(window.location.hash.replace(/^#/, ""));
}

// If the page loads with #<entry-id> present, start with only that entry open
// (accordion style). With no valid hash, every entry starts open.
function initialOpen(): Record<string, boolean> {
  const target = hashId();
  const hasTarget = FAQ_ENTRIES.some((entry) => entry.id === target);
  return Object.fromEntries(
    FAQ_ENTRIES.map((entry) => [entry.id, hasTarget ? entry.id === target : true]),
  );
}

export function Faq() {
  const [open, setOpen] = useState<Record<string, boolean>>(initialOpen);

  // The deep-linked entry may render below the fold; nudge it into view once.
  useEffect(() => {
    const target = hashId();
    if (target && FAQ_ENTRIES.some((entry) => entry.id === target)) {
      document.getElementById(target)?.scrollIntoView();
    }
  }, []);

  const toggle = (id: string) => setOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <>
      <section className="spacer"></section>
      <section id="center">
        <div className="hero">
          <img
            src={"/sonasky_favicon.png"}
            className="base"
            width="170"
            height="179"
            alt="SonaSky Icon"
          />
        </div>
        <div>
          <h1>Frequently Asked Questions</h1>
          <p>
            <a href="/">&larr; Back to the Label Browser</a>
          </p>
        </div>
        <div className="faq">
          {FAQ_ENTRIES.map((entry) => {
            const isOpen = open[entry.id] ?? false;
            return (
              <div className="faq-entry" id={entry.id} key={entry.id}>
                <h2>
                  <button
                    type="button"
                    className="faq-question"
                    aria-expanded={isOpen}
                    onClick={() => toggle(entry.id)}
                  >
                    <span className="faq-chevron" aria-hidden="true">
                      {isOpen ? "▾" : "▸"}
                    </span>
                    {entry.question}
                  </button>
                  <a
                    className="faq-permalink"
                    href={`#${entry.id}`}
                    aria-label="Link to this question"
                  >
                    #
                  </a>
                </h2>
                {isOpen && (
                  <div className="faq-answer">
                    <p>{entry.answer}</p>
                    {entry.link && (
                      <p>
                        <a href={entry.link.href} target="_blank" rel="noopener noreferrer">
                          {entry.link.label}
                        </a>
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
      <section className="spacer"></section>
    </>
  );
}

export default Faq;
