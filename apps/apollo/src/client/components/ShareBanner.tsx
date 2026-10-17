import { useLayoutEffect, useRef } from "react";

// Temporary launch announcement. To remove: delete this file and its <ShareBanner /> usage in
// App.tsx. The --banner-h offsets on sticky editor toolbars fall back to 0 without it.
export function ShareBanner() {
  const ref = useRef<HTMLAnchorElement>(null);

  // Publish the banner's height so sticky elements below it can sit underneath instead of behind.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      root.style.setProperty("--banner-h", `${el.offsetHeight}px`);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--banner-h");
    };
  }, []);

  return (
    <a
      ref={ref}
      href="https://bsky.app/profile/astrabun.com/post/3my366hq2es2q"
      target="_blank"
      rel="noopener noreferrer"
      className="sticky top-0 z-50 block bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-neutral-950 hover:bg-amber-400"
    >
      Share the announcement to let your friends know about Apollo &rarr;
    </a>
  );
}
