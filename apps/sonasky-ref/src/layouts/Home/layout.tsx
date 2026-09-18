import React from "react";
import Header from "../../assets/partials/Header";

interface LayoutProps {
  children?: React.ReactNode;
}
function Layout(props: LayoutProps) {
  const { children } = { ...props };
  return (
    <>
      <div className="mx-auto max-w-6xl px-4">
        <Header />
        {children}
      </div>
    </>
  );
}

export default Layout;
