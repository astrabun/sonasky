import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { api } from "../api.ts";

/** "N sites made with Apollo". Renders nothing until (or unless) the count loads. */
export function SiteCount({ className = "" }: { className?: string }) {
  const [sites, setSites] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    api
      .stats()
      .then((s) => {
        if (live) setSites(s.sites);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (sites === null || sites === 0) return null;
  return (
    <p className={`flex items-center gap-1.5 ${className}`}>
      <Users size={14} aria-hidden />
      <span>
        <span className="font-semibold">{sites.toLocaleString()}</span>{" "}
        {sites === 1 ? "site" : "sites"} made with Apollo
      </span>
    </p>
  );
}
