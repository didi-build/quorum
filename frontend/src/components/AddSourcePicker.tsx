import { useCallback, useEffect, useMemo, useState } from "react";
import { humanizeApiError } from "../lib/authErrors";
import { addSourcesButtonLabel, addedSourcesToast } from "../lib/addSourceLabels";
import { SourcesApiError } from "../lib/api/sources";
import type { SourcesApi } from "../lib/api/sources";
import { oauthAuthorizeUrl } from "../lib/api/sources";
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
  onClose: () => void;
  onAdded: (createdCount: number) => void;
}

type LoadState = "idle" | "loading" | "error" | "not-connected";

export function AddSourcePicker({
  open,
  connections,
  api,
  initialTab = "github_repo",
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
  const [adding, setAdding] = useState(false);

  const githubConnection = connections.find((c) => c.provider === "github");
  const linearConnection = connections.find((c) => c.provider === "linear");
  const activeConnection = tab === "github_repo" ? githubConnection : linearConnection;

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
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery("");
    void loadAvailable();
  }, [open, tab, loadAvailable]);

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
      onClose();
      const toast = document.getElementById("quorum-sources-toast");
      if (toast) {
        toast.textContent = addedSourcesToast(selectedCount);
        toast.hidden = false;
        window.setTimeout(() => {
          toast.hidden = true;
        }, 5000);
      }
    } catch (error) {
      if (error instanceof SourcesApiError) {
        setErrorStatus(error.status);
        setErrorMessage(
          humanizeApiError(error.status, error.detail, {
            provider: activeConnection.provider,
          }),
        );
        setLoadState("error");
      }
    } finally {
      setAdding(false);
    }
  };

  if (!open) {
    return null;
  }

  const caption =
    tab === "github_repo"
      ? githubConnection?.account_label
        ? `Repos the Quorum app can access on @${githubConnection.account_label}`
        : "Repos the Quorum app can access on your GitHub account"
      : linearConnection?.account_label
        ? `Teams in ${linearConnection.account_label}`
        : "Teams in your Linear workspace";

  const showSearch = loadState !== "not-connected";
  const listEmpty = items.length === 0 && loadState === "idle";
  const searchNoMatch =
    loadState === "idle" && items.length > 0 && filtered.length === 0;

  const connectProvider = tab === "github_repo" ? "github" : "linear";

  return (
    <div className="quorum-picker-shell">
      <button
        type="button"
        className="quorum-picker-scrim"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
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
            className="quorum-icon-btn"
            aria-label="Close"
            onClick={onClose}
          >
            <IconX size={16} />
          </button>
        </div>
        <div className="quorum-picker-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className="quorum-picker-tab"
            aria-selected={tab === "github_repo"}
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
            role="tab"
            className="quorum-picker-tab"
            aria-selected={tab === "linear"}
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
            <p className="quorum-picker-cap caption">{caption}</p>
          </>
        ) : null}
        <div className="quorum-picker-body">
          {loadState === "loading" ? (
            <div
              className="quorum-picker-list"
              role="status"
              aria-label="Loading sources"
            >
              {[0, 1, 2, 3, 4].map((i) => (
                <div className="quorum-picker-row quorum-picker-row--sk" key={i}>
                  <span className="quorum-skel quorum-skel--cb" />
                  <span className="quorum-skel" style={{ width: 150 + (i % 3) * 40 }} />
                </div>
              ))}
            </div>
          ) : loadState === "not-connected" ? (
            <div className="quorum-picker-msg">
              {connectProvider === "github" ? (
                <IconGitHub size={28} />
              ) : (
                <IconLinear size={28} />
              )}
              <b>Connect {connectProvider === "github" ? "GitHub" : "Linear"} first</b>
              <span className="caption">
                {connectProvider === "github"
                  ? "Install the Quorum app on your GitHub account, then pick the repos it should read here."
                  : "Connect Linear so Quorum can read your team's issues, then pick the teams it should read here."}
              </span>
              <a
                className="dom-btn dom-btn--primary dom-btn--sm"
                href={oauthAuthorizeUrl(connectProvider)}
              >
                Connect {connectProvider === "github" ? "GitHub" : "Linear"}
              </a>
            </div>
          ) : loadState === "error" ? (
            <div className="quorum-picker-msg">
              <div className="quorum-callout-err" role="alert">
                {errorMessage}
              </div>
              {errorStatus === 429 ? (
                <button
                  type="button"
                  className="dom-btn dom-btn--secondary dom-btn--sm"
                  onClick={() => void loadAvailable()}
                >
                  <IconRefresh size={13} />
                  Try again
                </button>
              ) : (
                <button
                  type="button"
                  className="dom-btn dom-btn--secondary dom-btn--sm"
                  onClick={() => void loadAvailable()}
                >
                  <IconRefresh size={13} />
                  Try again
                </button>
              )}
            </div>
          ) : listEmpty ? (
            <div className="quorum-picker-msg">
              <b>{tab === "github_repo" ? "No repos to show" : "No teams to show"}</b>
              <span className="caption">
                {tab === "github_repo"
                  ? `The Quorum app can't see any repos on @${githubConnection?.account_label ?? "your account"} yet. Give it access to the ones you want, then come back.`
                  : `Quorum can't see any teams in ${linearConnection?.account_label ?? "your workspace"} yet.`}
              </span>
            </div>
          ) : searchNoMatch ? (
            <div className="quorum-picker-msg">
              <b>Nothing matches &quot;{query.trim()}&quot;</b>
              <span className="caption">
                {tab === "github_repo"
                  ? "Check the spelling, or give Quorum access to more repos in GitHub."
                  : "Check the spelling, or confirm the team exists in Linear."}
              </span>
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
              rel="noreferrer"
            >
              Give Quorum access in GitHub
              <IconExternal />
            </a>
          </div>
        ) : null}
        <div className="quorum-picker-footer">
          <button type="button" className="dom-btn dom-btn--ghost" onClick={onClose}>
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
  );
}
