import { useEffect, useState } from "react";
import { AuthFrame } from "../components/AuthFrame";
import { DomMark } from "../components/DomMark";
import { ExternalLinkIcon } from "../components/ExternalLinkIcon";
import { EntryLoading } from "./EntryLoading";
import { fetchAccessDeniedInfo } from "../lib/api/auth";
import { githubLogoutUrl, initialsFromLogin, requestAccessMailto } from "../lib/auth";
import { humanizeApiError } from "../lib/authErrors";
import { appPath } from "../lib/routing";

export function NotAllowedScreen() {
  const [login, setLogin] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    void fetchAccessDeniedInfo()
      .then((info) => {
        if (!info) {
          window.location.replace(appPath("chat"));
          return;
        }
        setLogin(info.login);
      })
      .catch(() => {
        setLoadFailed(true);
      });
  }, []);

  if (loadFailed) {
    return (
      <AuthFrame>
        <DomMark size={44} />
        <h1>We couldn&apos;t check your access</h1>
        <div className="quorum-callout-err" role="alert">
          {humanizeApiError(500, "")}
        </div>
        <a className="dom-btn dom-btn--primary" href={appPath("chat")}>
          Try signing in again
        </a>
      </AuthFrame>
    );
  }

  if (!login) {
    return <EntryLoading />;
  }

  return (
    <AuthFrame>
      <div className="quorum-auth-id">
        <span className="quorum-avatar">{initialsFromLogin(login)}</span>
        <span className="quorum-auth-id-label">
          Signed in as <strong>@{login}</strong>
        </span>
      </div>
      <h1>You&apos;re not on the list yet</h1>
      <p>
        Quorum is invite-only while I build it. If you&apos;d like to try it, send me
        your GitHub username and I&apos;ll add you.
      </p>
      <div className="quorum-auth-actions">
        <a className="dom-btn dom-btn--primary" href={requestAccessMailto(login)}>
          Request access
        </a>
        <a
          className="dom-btn dom-btn--secondary dom-btn--with-icon"
          href={githubLogoutUrl()}
          target="_blank"
          rel="noreferrer"
        >
          Use a different account
          <ExternalLinkIcon size={12} />
        </a>
        <p className="quorum-auth-hint">
          Sign out of GitHub first in the new tab, then try again.
        </p>
      </div>
    </AuthFrame>
  );
}
