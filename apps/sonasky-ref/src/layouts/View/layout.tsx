import React from "react";
import { Link } from "react-router";

interface LayoutProps {
  children?: React.ReactNode;
}

function Layout(props: LayoutProps) {
  const { children } = { ...props };
  return (
    <>
      <div className="mx-auto min-h-[calc(100vh-64px)] max-w-6xl px-4 pb-16">{children}</div>
      <footer className="relative bottom-0 w-full border-t border-gray-700 bg-gray-900 py-4 text-center text-white">
        <p className="text-sm">
          This is a SonaSky Ref Sheet - Want your own?{" "}
          <Link to="/dashboard" className="text-inherit">
            Click here
          </Link>
        </p>
      </footer>
    </>
  );
}

export default Layout;
