import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { Menu, X } from "lucide-react";
import { useAuthContext } from "../../auth/auth-provider";
import { buttonClassName } from "../../components/ui/Button";

interface LayoutProps {
  children?: React.ReactNode;
}

function InnerDashLayout(props: LayoutProps) {
  const { children } = { ...props };
  const { pdsAgent, signOut } = useAuthContext();

  // This call does not require authentication
  const [profile, setProfile] = useState<unknown>(undefined);
  const loadProfile = useCallback(async () => {
    const profile = await pdsAgent.com.atproto.repo.getRecord({
      collection: "app.bsky.actor.profile",
      repo: pdsAgent.accountDid,
      rkey: "self",
    });
    setProfile(profile.data);
  }, [pdsAgent]);

  useEffect(() => {
    void loadProfile();
  }, [pdsAgent]);

  const [sonaRecords, setSonaRecords] = useState<any>();
  const loadSonaRecords = useCallback(async () => {
    const sonaRecords = await pdsAgent.com.atproto.repo.listRecords({
      collection: "app.sonasky.ref",
      repo: pdsAgent.accountDid,
    });
    setSonaRecords(sonaRecords.data.records);
  }, [pdsAgent]);
  useEffect(() => {
    void loadSonaRecords();
  }, [pdsAgent]);

  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const navItems =
    sonaRecords !== undefined
      ? [
          { name: "Home", path: "/" },
          { name: "Dashboard", path: "/dashboard" },
          {
            name: sonaRecords !== undefined ? `Characters [${sonaRecords.length}]` : "Characters",
            path: "/dashboard/characters",
          },
          { name: "Add Character", path: "/dashboard/characters/add" },
          { name: "Manage Data", path: "/dashboard/manage" },
          { name: "Logout", onclick: signOut },
        ]
      : [
          { name: "Home", path: "/" },
          { name: "Dashboard", path: "/dashboard" },
          { name: "Manage Data", path: "/dashboard/manage" },
          { name: "Logout", onclick: signOut },
        ];

  const navLinks = navItems.map((item, idx) => {
    if (item.path) {
      return (
        <Link
          key={item.path}
          to={item.path}
          className={buttonClassName({
            variant: location.pathname === item.path ? "contained" : "outlined",
            fullWidth: true,
            className: "mb-2.5 justify-start",
          })}
        >
          {item.name}
        </Link>
      );
    }
    if (item.onclick) {
      return (
        <button
          key={idx}
          onClick={item.onclick}
          className={buttonClassName({
            variant: location.pathname === item.path ? "contained" : "outlined",
            fullWidth: true,
            className: "mb-2.5 justify-start",
          })}
        >
          {item.name}
        </button>
      );
    }
    return <></>;
  });

  return (
    <>
      <div className="flex flex-col md:flex-row">
        <div className="flex items-center justify-between p-4 pb-0 md:hidden">
          <h6 className="text-lg font-semibold">SonaSky REF</h6>
          <button
            type="button"
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-expanded={mobileNavOpen}
            aria-label="Toggle navigation menu"
            className={buttonClassName({ variant: "outlined" })}
          >
            {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        <div className={`w-full p-4 md:block md:w-[200px] ${mobileNavOpen ? "block" : "hidden"}`}>
          <h6 className="mb-2 hidden text-lg font-semibold md:block">SonaSky REF</h6>
          {navLinks}
        </div>
        <div className="flex-1 p-4">
          <div>
            <p>
              Logged in as{" "}
              <a
                href={`https://bsky.app/profile/${pdsAgent.did}`}
                target="_blank"
                rel="noreferrer"
                className="text-inherit no-underline"
              >
                {profile ? (profile as any).value.displayName : ""}
              </a>
            </p>
          </div>
          <div>{children}</div>
        </div>
      </div>
    </>
  );
}

export default InnerDashLayout;
