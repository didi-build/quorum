import { useEffect, useState } from "react";
import type { AuthUser } from "../lib/auth";
import { fetchAuthUser } from "../lib/auth";
import { resolveAppView } from "../lib/routing";
import { ChatScreen } from "../screens/ChatScreen";
import { clearLegacyApiKeyStorage } from "../lib/session";
import { DomMark } from "./DomMark";
import { AppTopBar } from "./AppTopBar";
import { NotAllowedScreen } from "../screens/NotAllowedScreen";
import { SignInScreen } from "../screens/SignInScreen";

type AuthState = "loading" | "signed-out" | "signed-in";

export function AppShell() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const view = resolveAppView();

  useEffect(() => {
    clearLegacyApiKeyStorage();
  }, []);

  useEffect(() => {
    if (view === "not-allowed") {
      setAuthState("signed-out");
      return;
    }

    let cancelled = false;
    void fetchAuthUser()
      .then((authUser) => {
        if (cancelled) {
          return;
        }
        if (!authUser) {
          setUser(null);
          setAuthState("signed-out");
          return;
        }
        setUser(authUser);
        setAuthState("signed-in");
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setAuthState("signed-out");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [view]);

  const handleSignedOut = () => {
    setUser(null);
    setAuthState("signed-out");
    window.location.assign(`${import.meta.env.BASE_URL}`);
  };

  if (view === "not-allowed") {
    return (
      <main className="quorum-app quorum-app--auth">
        <NotAllowedScreen />
      </main>
    );
  }

  if (authState === "loading") {
    return (
      <main className="quorum-app quorum-app--auth">
        <div className="quorum-auth-loading" aria-busy="true">
          <DomMark size={40} />
          <span className="quorum-spin" aria-hidden="true" />
          Loading
        </div>
      </main>
    );
  }

  if (authState === "signed-out") {
    return (
      <main className="quorum-app quorum-app--auth">
        <SignInScreen />
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="quorum-app">
      <div className="quorum-page-shell">
        <AppTopBar user={user} onSignedOut={handleSignedOut} />
        <div className="quorum-page-main">
          {view === "chat" ? <ChatScreen /> : null}
        </div>
      </div>
    </main>
  );
}
