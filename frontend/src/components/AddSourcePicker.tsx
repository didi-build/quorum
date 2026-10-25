import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { githubLoginUrl } from "../lib/auth";
import { humanizeApiError, humanizeApiErrorNextStep } from "../lib/authErrors";
import { addSourcesButtonLabel } from "../lib/addSourceLabels";
import { SourcesApiError } from "../lib/api/sources";
import type { SourcesApi } from "../lib/api/sources";
import { oauthAuthorizeUrl } from "../lib/api/sources";
import { useFocusTrap } from "../lib/useFocusTrap";
import type {
  Connection,
  AvailableSourceItem,
  CreateSourceInput,
} from "../types/connections";
import type { SourceType } from "../types/sources";
import {
  IconCheck,
  IconExternal,
  IconGitHub,
  IconLinear,
  IconLock,
  IconRefresh,
  IconSearch,
  IconX,
} from "./icons";

const GITHUB_ACCESS_URL = "https://github.com/settings/installations";

type PickerTab = SourceType;

export interface AddSourcePickerProps {
  open: boolean;
  connections: Connection[];
  api: SourcesApi;
  initialTab?: PickerTab;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  onAdded: (createdCount: number) => void;
}

type LoadState = "idle" | "loading" | "error" | "not-connected";

export function AddSourcePicker({
  open,
  connections,
  api,
  initialTab = "github_repo",
  returnFocusRef,
  onClose,
  onAdded,
}: AddSourcePickerProps) {
  const [tab, setTab] = useState<PickerTab>(initialTab);
  const [query, setQuery] = useState("");
  const [selectedByTab, setSelectedByTab] = useState<Record<PickerTab, string[]>>({
    github_repo: [],
    linear: [],
  });
  const [items, setItems] = useState<AvailableSourceItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [addError, setAddError] = useState<{ message: string; status: number } | null>(
    null,
  );
  const [adding, setAdding] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const githubTabRef = useRef<HTMLButtonElement>(null);
  const linearTabRef = useRef<HTMLButtonElement>(null);

  useFocusTrap(open, dialogRef);

  const githubConnection = connections.find((c) => c.provider === "github");
  const linearConnection = connections.find((c) => c.provider === "linear");
  const activeConnection = tab === "github_repo" ? githubConnection : linearConnection;

  const closeAndReturnFocus = useCallback(() => {
    onClose();
    returnFocusRef?.current?.focus();
  }, [onClose, returnFocusRef]);

  const loadAvailable = useCallback(async () => {
    if (!activeConnection) {
      setLoadState("not-connected");
      return;
    }
    if (!activeConnection.connected) {
      setLoadState("not-connected");
      setItems([]);
      return;
    }
    setLoadState("loading");
    setErrorMessage(null);
    setErrorStatus(null);
    try {
      const list = await api.listAvailableSources(
        activeConnection.id,
        activeConnection.provider,
      );
      setItems(list);
      setLoadState("idle");
    } catch (error) {
      if (error instanceof SourcesApiError) {
        if (error.status === 403) {
          setLoadState("not-connected");
          setItems([]);
          return;
        }
        setErrorStatus(error.status);
        setErrorMessage(
          humanizeApiError(error.status, error.detail, {
            provider: activeConnection.provider,
          }),
        );
        setLoadState("error");
        return;
      }
      setErrorStatus(500);
      setErrorMessage("Something went wrong on our side. Try again in a moment.");
      setLoadState("error");
    }
  }, [activeConnection, api]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setTab(initialTab);
    setSelectedByTab({ github_repo: [], linear: [] });
    setAddError(null);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery("");
    void loadAvailable();
  }, [open, tab, loadAvailable]);

  useEffect(() => {
    if (!open) {
      return;
    }
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAndReturnFocus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, closeAndReturnFocus]);

  const onTabKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    if (event.key === "ArrowRight") {
      setTab("linear");
      linearTabRef.current?.focus();
    } else {
      setTab("github_repo");
      githubTabRef.current?.focus();
    }
  };

  const selected = selectedByTab[tab];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return items;
    }
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, query]);

  const selectedCount = selected.length;
  const githubSelected = selectedByTab.github_repo.length;
  const linearSelected = selectedByTab.linear.length;

  const toggle = (item: AvailableSourceItem) => {
    if (item.already_added) {
      return;
    }
    setAddError(null);
    setSelectedByTab((prev) => {
      const current = prev[tab];
      const nextKeys = current.includes(item.key)
        ? current.filter((k) => k !== item.key)
        : [...current, item.key];
      return { ...prev, [tab]: nextKeys };
    });
  };

  const handleAdd = async () => {
    if (!activeConnection || selectedCount === 0) {
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const payload: CreateSourceInput[] = selected
        .map((key) => items.find((i) => i.key === key))
        .filter((item): item is AvailableSourceItem => Boolean(item))
        .map((item) => ({
          connection_id: activeConnection.id,
          source_type: tab,
          external_ref: item.external_ref,
          name: item.name,
          key: item.key,
        }));
      await api.createSources(payload);
      onAdded(selectedCount);
      closeAndReturnFocus();
    } catch (error) {
      const status = error instanceof SourcesApiError ? error.status : 500;
      const message =
        error instanceof SourcesApiError
          ? humanizeApiError(error.status, error.detail, {
              provider: activeConnection.provider,
            })
          : "Something went wrong on our side. Try again in a moment.";
      setAddError({ message, status });
    } finally {
      setAdding(false);
    }
  };

  if (!open) {
    return null;
  }

  const githubCaption =
    tab === "github_repo" && githubConnection?.account_label
      ? `Repos the Quorum app can access on @${githubConnection.account_label}`
      : null;
  const linearCaption =
    tab === "linear" && linearConnection?.account_label
      ? `Teams in ${linearConnection.account_label}`
      : null;
  const caption = githubCaption ?? linearCaption;

  const showSearch = loadState !== "not-connected";
  const listEmpty = items.length === 0 && loadState === "idle";
  const searchNoMatch =
    loadState === "idle" && items.length > 0 && filtered.length === 0;
  const loadingLabel = tab === "github_repo" ? "Loading repos" : "Loading teams";
  const panelId = tab === "github_repo" ? "picker-panel-github" : "picker-panel-linear";

  const renderErrorAction = (status: number, onRetry: () => void, forAdd = false) => {
    if (status === 401) {
      return (
        <a className="dom-btn dom-btn--primary dom-btn--sm" href={githubLoginUrl()}>
          Sign in again
        </a>
      );
    }
    if (status === 403 && forAdd) {
      return (
        <a
          className="dom-btn dom-btn--secondary dom-btn--sm"
          href={GITHUB_ACCESS_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Check GitHub access
          <IconExternal />
        </a>
      );
    }
    const label = humanizeApiErrorNextStep(status) ?? "Try again";
    return (
      <button
        type="button"
        className="dom-btn dom-btn--secondary dom-btn--sm"
        onClick={onRetry}
      >
        <IconRefresh size={13} />
        {label}
      </button>
    );
  };

  return (
    <div className="quorum-picker-shell">
      <div
        className="quorum-picker-scrim"
        aria-hidden="true"
        onClick={closeAndReturnFocus}
      />
      <div
        ref={dialogRef}
        className="quorum-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-sources-title"
      >
        <div className="quorum-picker-h">
          <div>
            <h2 id="add-sources-title">Add knowledge sources</h2>
            <p className="caption">
              Choose what Quorum should read. You can remove a source any time.
            </p>
          </div>
          <button
            type="button"
            ref={closeButtonRef}
            className="quorum-icon-btn"
            aria-label="Close"
            onClick={closeAndReturnFocus}
          >
            <IconX size={16} />
          </button>
        </div>
        <div className="quorum-picker-tabs" role="tablist" onKeyDown={onTabKeyDown}>
          <button
            type="button"
            ref={githubTabRef}
            id="picker-tab-github"
            role="tab"
            className="quorum-picker-tab"
            aria-selected={tab === "github_repo"}
            aria-controls="picker-panel-github"
            onClick={() => setTab("github_repo")}
          >
            <IconGitHub size={15} />
            GitHub repos
            {githubSelected > 0 ? (
              <span className="quorum-picker-count">{githubSelected}</span>
            ) : null}
          </button>
          <button
            type="button"
            ref={linearTabRef}
            id="picker-tab-linear"
            role="tab"
            className="quorum-picker-tab"
            aria-selected={tab === "linear"}
            aria-controls="picker-panel-linear"
            onClick={() => setTab("linear")}
          >
            <IconLinear size={13} />
            Linear teams
            {linearSelected > 0 ? (
              <span className="quorum-picker-count">{linearSelected}</span>
            ) : null}
          </button>
        </div>
        {showSearch ? (
          <>
            <div className="quorum-picker-search">
              <IconSearch />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tab === "github_repo" ? "Search repos" : "Search teams"}
                aria-label="Search"
                disabled={loadState === "loading" || loadState === "error"}
              />
            </div>
            {caption ? <p className="quorum-picker-cap caption">{caption}</p> : null}
          </>
        ) : null}
        <div
          className="quorum-picker-body"
          role="tabpanel"
          id={panelId}
          aria-labelledby={
            tab === "github_repo" ? "picker-tab-github" : "picker-tab-linear"
          }
        >
          {loadState === "loading" ? (
            <div className="quorum-picker-list" role="status" aria-label={loadingLabel}>
              {[0, 1, 2, 3, 4].map((i) => (
                <div className="quorum-picker-row quorum-picker-row--sk" key={i}>
                  <span className="quorum-skel quorum-skel--cb" />
                  <span className="quorum-skel" style={{ width: 150 + (i % 3) * 40 }} />
                </div>
              ))}
            </div>
          ) : loadState === "not-connected" ? (
            <div className="quorum-picker-msg">
              {tab === "github_repo" ? (
                <>
                  <IconGitHub size={28} />
                  <b>Connect GitHub first</b>
                  <span className="caption">
                    Install the Quorum app on your GitHub account, then pick the repos
                    it should read here.
                  </span>
                  <a
                    className="dom-btn dom-btn--primary dom-btn--sm"
                    href={oauthAuthorizeUrl("github")}
                  >
                    Connect GitHub
                  </a>
                </>
              ) : (
                <a
                  className="dom-btn dom-btn--primary dom-btn--sm"
                  href={oauthAuthorizeUrl("linear")}
                >
                  Connect Linear
                </a>
              )}
            </div>
          ) : loadState === "error" ? (
            <div className="quorum-picker-msg">
              <div className="quorum-callout-err" role="alert">
                {errorMessage}
              </div>
              {errorStatus !== null
                ? renderErrorAction(errorStatus, () => void loadAvailable())
                : null}
            </div>
          ) : listEmpty ? (
            <div className="quorum-picker-msg">
              {tab === "github_repo" ? (
                <>
                  <b>No repos to show</b>
                  <span className="caption">
                    {githubConnection?.account_label
                      ? `The Quorum app can't see any repos on @${githubConnection.account_label} yet. Give it access to the ones you want, then come back.`
                      : null}
                  </span>
                </>
              ) : null}
            </div>
          ) : searchNoMatch ? (
            <div className="quorum-picker-msg">
              <b>Nothing matches &quot;{query.trim()}&quot;</b>
              {tab === "github_repo" ? (
                <span className="caption">
                  Check the spelling, or give Quorum access to more repos in GitHub.
                </span>
              ) : null}
            </div>
          ) : (
            <div className="quorum-picker-list">
              {filtered.map((item) => {
                const on = selected.includes(item.key);
                return (
                  <button
                    type="button"
                    key={item.key}
                    className="quorum-picker-row"
                    data-selected={on}
                    disabled={item.already_added}
                    aria-pressed={item.already_added ? undefined : on}
                    onClick={() => toggle(item)}
                  >
                    <span
                      className="quorum-picker-cb"
                      data-on={on}
                      data-disabled={item.already_added}
                    >
                      {on || item.already_added ? <IconCheck size={12} /> : null}
                    </span>
                    <span className="quorum-picker-row-text">
                      <span className="quorum-picker-name">{item.name}</span>
                      <span className="quorum-picker-sub caption">
                        {tab === "github_repo" ? (
                          <>
                            {item.private ? <IconLock /> : null}
                            {item.private ? "Private" : "Public"}
                          </>
                        ) : (
                          item.key
                        )}
                      </span>
                    </span>
                    {item.already_added ? (
                      <span className="quorum-picker-added">
                        <IconCheck size={10} />
                        Added
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {tab === "github_repo" && loadState !== "not-connected" ? (
          <div className="quorum-picker-access caption">
            Don&apos;t see a repo?{" "}
            <a
              className="quorum-link"
              href={GITHUB_ACCESS_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Give Quorum access in GitHub
              <IconExternal />
            </a>
          </div>
        ) : null}
        <div className="quorum-picker-footer">
          {addError ? (
            <div className="quorum-picker-add-err">
              <div className="quorum-callout-err" role="alert">
                {addError.message}
              </div>
              {renderErrorAction(addError.status, () => void handleAdd(), true)}
            </div>
          ) : null}
          <div className="quorum-picker-footer-actions">
            <button
              type="button"
              className="dom-btn dom-btn--ghost"
              onClick={closeAndReturnFocus}
            >
              Cancel
            </button>
            <button
              type="button"
              className="dom-btn dom-btn--primary"
              disabled={selectedCount === 0 || adding || loadState === "loading"}
              onClick={() => void handleAdd()}
            >
              {adding ? (
                <>
                  <span className="quorum-spin" aria-hidden="true" />
                  Adding
                </>
              ) : (
                addSourcesButtonLabel(selectedCount)
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
