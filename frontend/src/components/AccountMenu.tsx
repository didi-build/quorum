import { useCallback, useEffect, useRef, useState } from "react";
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDocMouse = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        closeMenu();
      }
    };
    const onDocKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }
    };
    document.addEventListener("mousedown", onDocMouse);
    document.addEventListener("keydown", onDocKey);
    const firstItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    firstItem?.focus();
    return () => {
      document.removeEventListener("mousedown", onDocMouse);
      document.removeEventListener("keydown", onDocKey);
    };
  }, [open, closeMenu]);

  const handleSignOut = () => {
    closeMenu(false);
    void logout()
      .then(() => {
        onSignedOut();
      })
      .catch(() => {
        onSignedOut();
      });
  };

  const accountLabel = `Account menu for @${user.login}`;

  return (
    <div className="quorum-acct-wrap" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="quorum-avatar"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={accountLabel}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        {initialsFromLogin(user.login)}
      </button>
      {open ? (
        <div
          className="quorum-acct-menu"
          ref={menuRef}
          role="menu"
          aria-label={accountLabel}
        >
          <div className="quorum-acct-menu-h">
            <span className="quorum-avatar quorum-avatar-lg" aria-hidden="true">
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
