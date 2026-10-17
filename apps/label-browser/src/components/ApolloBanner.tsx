// Temporary announcement for the Apollo launch. To remove: delete this file
// and its <ApolloBanner /> usage in main.tsx.
export function ApolloBanner() {
  return (
    <a
      href="https://apollo.sonasky.app/?utm_source=sonasky&utm_medium=banner&utm_campaign=new&utm_content=landing+page&utm_term=New%3A+SonaSky+Apollo+-+build+a+simple+website+hosted+from+your+Bluesky+account+%26rarr%3B"
      target="_blank"
      rel="noopener noreferrer"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        display: "block",
        padding: "0.5rem 1rem",
        background: "var(--accent)",
        color: "#fff",
        fontSize: "0.9rem",
        fontWeight: 600,
        textAlign: "center",
        textDecoration: "none",
      }}
    >
      New: SonaSky Apollo - build a simple website hosted from your Bluesky account &rarr;
    </a>
  );
}
