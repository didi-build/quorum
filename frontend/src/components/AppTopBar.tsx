import type { AuthUser } from "../lib/auth";
import { appPath, resolveAppView } from "../lib/routing";
import { AccountMenu } from "./AccountMenu";
import { DomMark } from "./DomMark";

interface AppTopBarProps {
  user: AuthUser;
  onSignedOut: () => void;
}

export function AppTopBar({ user, onSignedOut }: AppTopBarProps) {
  const view = resolveAppView();

  return (
    <header className="quorum-bar">
      <a className="quorum-brand" href={appPath("chat")} aria-label="Quorum">
        <DomMark size={26} />
        <span className="quorum-brand__word">Quorum</span>
      </a>
      <nav className="quorum-seg" aria-label="Sections">
        <a href={appPath("chat")} aria-current={view === "chat" ? "page" : undefined}>
          Chat
        </a>
        <a
          href={appPath("connections")}
          aria-current={view === "connections" ? "page" : undefined}
        >
          Connections
        </a>
      </nav>
      <AccountMenu user={user} onSignedOut={onSignedOut} />
    </header>
  );
}
