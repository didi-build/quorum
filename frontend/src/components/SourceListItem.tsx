import { useEffect, useRef, useState } from "react";
import { humanizeApiError } from "../lib/authErrors";
import { useMediaQuery } from "../lib/useMediaQuery";
import type { KnowledgeSource } from "../types/sources";
import {
  IconExternal,
  IconMore,
  IconRefresh,
  IconTrash,
  SourceTypeIcon,
} from "./icons";
import { StatusChip } from "./StatusChip";

const GITHUB_INSTALLATIONS_URL = "https://github.com/settings/installations";

export interface SourceListItemProps {
  source: KnowledgeSource;
  refreshing?: boolean;
  refreshError?: string | null;
  onRefresh: () => void;
  onRemove: () => Promise<void>;
}

export function SourceListItem({
  source,
  refreshing = false,
  refreshError = null,
  onRefresh,
  onRemove,
}: SourceListItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const inlineMenu = useMediaQuery("(max-width: 639px)");
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstMenuItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen || inlineMenu) {
      return;
    }
    const onDoc = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen, inlineMenu]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    firstMenuItemRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const closeMenu = () => {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  };

  const handleRemoveClick = () => {
    closeMenu();
    setConfirmRemove(true);
  };

  return (
    <div
      className={`quorum-source-row${confirmRemove ? " quorum-source-row--confirm" : ""}`}
      data-testid={`source-row-${source.id}`}
    >
      <SourceTypeIcon type={source.source_type} className="quorum-source-row__icon" />
      <div className="quorum-source-row__body">
        <span className="quorum-source-row__name">{source.name}</span>
        <StatusChip status={source.status} refreshing={refreshing} />
        {refreshError ? (
          <div className="quorum-callout-err" role="alert">
            {refreshError}
          </div>
        ) : null}
        {source.status === "error" && source.status_message ? (
          <div className="quorum-source-row__err">
            <span>{source.status_message}</span>
            <div className="quorum-source-row__err-actions">
              <a
                className="dom-btn dom-btn--secondary dom-btn--sm"
                href={GITHUB_INSTALLATIONS_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Check GitHub access
                <IconExternal />
              </a>
              <button
                type="button"
                className="dom-btn dom-btn--ghost dom-btn--sm"
                onClick={onRefresh}
                disabled={refreshing}
              >
                <IconRefresh />
                Refresh
              </button>
            </div>
          </div>
        ) : null}
        {inlineMenu && menuOpen ? (
          <div
            className="quorum-source-row__actions"
            role="menu"
            aria-label={`Actions for ${source.name}`}
          >
            <button
              type="button"
              role="menuitem"
              ref={firstMenuItemRef}
              onClick={() => {
                closeMenu();
                onRefresh();
              }}
            >
              <IconRefresh size={14} />
              <span>
                <b>Refresh</b>
                <span className="caption">Read the latest changes</span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={handleRemoveClick}
            >
              <IconTrash size={14} />
              <span>
                <b>Remove</b>
                <span className="caption">Stop using it in answers</span>
              </span>
            </button>
          </div>
        ) : null}
        {confirmRemove ? (
          <div
            className="quorum-source-row__confirm"
            role="alertdialog"
            aria-label={`Remove ${source.name}`}
          >
            <span>
              <b>Remove {source.name}?</b> Quorum stops answering from it. You can add
              it again any time.
            </span>
            {removeError ? (
              <div className="quorum-callout-err" role="alert">
                {removeError}
              </div>
            ) : null}
            <div className="quorum-source-row__confirm-actions">
              <button
                type="button"
                className="dom-btn dom-btn--ghost dom-btn--sm"
                onClick={() => setConfirmRemove(false)}
              >
                Keep
              </button>
              <button
                type="button"
                className="dom-btn dom-btn--danger dom-btn--sm"
                onClick={() => {
                  void onRemove()
                    .then(() => setConfirmRemove(false))
                    .catch((error: unknown) => {
                      setRemoveError(
                        error instanceof Error
                          ? error.message
                          : "Something went wrong on our side. Try again in a moment.",
                      );
                    });
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="quorum-source-row__menu" ref={menuRef}>
        <button
          type="button"
          ref={menuButtonRef}
          className="quorum-icon-btn"
          aria-label={`Actions for ${source.name}`}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <IconMore />
        </button>
        {menuOpen && !inlineMenu ? (
          <div className="quorum-source-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              ref={firstMenuItemRef}
              onClick={() => {
                closeMenu();
                onRefresh();
              }}
            >
              <IconRefresh size={14} />
              <span>
                <b>Refresh</b>
                <span className="caption">Read the latest changes</span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={handleRemoveClick}
            >
              <IconTrash size={14} />
              <span>
                <b>Remove</b>
                <span className="caption">Stop using it in answers</span>
              </span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function removeSourceErrorMessage(status: number, sourceRef: string): string {
  return humanizeApiError(status, "", { sourceRef });
}

export function refreshSourceErrorMessage(
  status: number,
  sourceRef: string,
  provider?: string,
): string {
  return humanizeApiError(status, "", { sourceRef, provider });
}
