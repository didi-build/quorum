import { useEffect, useRef, useState } from "react";
import type { AuthUser } from "../lib/auth";
import { initialsFromLogin, logout } from "../lib/auth";
import { appPath } from "../lib/routing";

interface AccountMenuProps {
  user: AuthUser;
  onSignedOut: () => void;
}

export function AccountMenu({ user, onSignedOut }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDoc = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open]);

  const handleSignOut = () => {
    void logout()
      .then(() => {
        onSignedOut();
      })
      .catch(() => {
        onSignedOut();
      });
  };

  return (
    <div className="quorum-acct-wrap" ref={wrapRef}>
      <button
        type="button"
        className="quorum-avatar"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        {initialsFromLogin(user.login)}
      </button>
      {open ? (
        <div className="quorum-acct-menu" role="menu">
          <div className="quorum-acct-menu-h">
            <span className="quorum-avatar quorum-avatar-lg">
              {initialsFromLogin(user.login)}
            </span>
            <div className="quorum-acct-menu-id">
              <strong>@{user.login}</strong>
              <span>Signed in with GitHub</span>
            </div>
          </div>
          <a
            className="quorum-acct-menu-item"
            href={appPath("connections")}
            role="menuitem"
          >
            Connections
          </a>
          <button
            type="button"
            className="quorum-acct-menu-item"
            role="menuitem"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
