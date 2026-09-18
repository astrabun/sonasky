import React from "react";
import Header from "../../assets/partials/Header";
import { AuthProvider } from "../../auth/auth-provider";
import { clientId } from "../../App";
import { ENV, FLAGS, PLC_DIRECTORY_URL } from "../../const";
import { handleResolver } from "../../helpers/handleResolver";
import InnerDashLayout from "./innerDash";
import { latestVersion } from "../../changelog";
import { Link } from "react-router";
import { Alert, AlertTitle } from "../../components/ui/Alert";
import { AnchorButton } from "../../components/ui/Button";

interface LayoutProps {
  children?: React.ReactNode;
}

function Layout(props: LayoutProps) {
  const { children } = { ...props };

  return (
    <div className="flex min-h-screen flex-col">
      <AuthProvider
        clientId={clientId}
        plcDirectoryUrl={PLC_DIRECTORY_URL}
        handleResolver={handleResolver as any}
        allowHttp={ENV === "development" || ENV === "test"}
      >
        <Header hideNavigation />
        <div className="mx-auto w-full max-w-6xl px-4">
          <main className="flex-1">
            {FLAGS.SHOW_FEEDBACK_FORM_ALERT && (
              <>
                <Alert severity="info" className="my-4">
                  <AlertTitle>Seeking Feedback!</AlertTitle>
                  <p>
                    I'm looking for feedback on the SonaSky REF project. If you have any
                    thoughts/feature requests/bug reports/positive feedback/etc, please{" "}
                    <a href="/feedback" target="_blank" className="text-inherit">
                      click here
                    </a>{" "}
                    to fill out a feedback form!
                  </p>
                  <AnchorButton
                    href="/feedback"
                    target="_blank"
                    className="mt-4"
                    variant="contained"
                  >
                    Feedback Form
                  </AnchorButton>
                </Alert>
              </>
            )}
            <InnerDashLayout>{children}</InnerDashLayout>
          </main>
        </div>
      </AuthProvider>
      <footer className="mt-auto">
        <div className="flex h-[50px] items-center justify-center bg-[#283546] text-white">
          <Link to={`/dashboard/changelog`} className="text-inherit">
            Version: {latestVersion.version}
          </Link>{" "}
          &nbsp;| Made with 💙 by &nbsp;
          <a href="https://bsky.app/profile/astrabun.com" target="_blank" className="text-inherit">
            Astra
          </a>
        </div>
      </footer>
    </div>
  );
}

export default Layout;
