import { useCallback, useEffect, useMemo, useState } from "react";
import { AddSourcePicker } from "../components/AddSourcePicker";
import {
  IconCheck,
  IconGitHub,
  IconLinear,
  IconPlus,
  IconRefresh,
  IconX,
} from "../components/icons";
import { removeSourceErrorMessage, SourceListItem } from "../components/SourceListItem";
import { humanizeApiError } from "../lib/authErrors";
import {
  getSourcesApi,
  oauthAuthorizeUrl,
  SourcesApiError,
  type SourcesApi,
} from "../lib/api/sources";
import { parseConnectionCallback, providerDisplayName } from "../lib/routing";
import type { Connection } from "../types/connections";
import type { KnowledgeSource, SourceType } from "../types/sources";

const POLL_MS = 4000;

export interface ConnectionsViewProps {
  api?: SourcesApi;
}

export function ConnectionsView({ api: apiProp }: ConnectionsViewProps = {}) {
  const api = apiProp ?? getSourcesApi();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<SourceType>("github_repo");
  const [bannerProvider, setBannerProvider] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [nextConnections, nextSources] = await Promise.all([
        api.listConnections(),
        api.listSources(),
      ]);
      setConnections(nextConnections);
      setSources(nextSources);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const { provider, status } = parseConnectionCallback();
    if (provider && status === "connected") {
      setBannerProvider(provider);
      const url = new URL(window.location.href);
      url.searchParams.delete("provider");
      url.searchParams.delete("status");
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    }
  }, []);

  const needsPoll = useMemo(
    () => sources.some((s) => s.status === "pending" || s.status === "indexing"),
    [sources],
  );

  useEffect(() => {
    if (!needsPoll) {
      return;
    }
    const id = window.setInterval(() => {
      void api
        .listSources()
        .then(setSources)
        .catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [api, needsPoll]);

  const readyCount = sources.filter((s) => s.status === "ready").length;
  const anyConnected = connections.some((c) => c.connected);
  const showEmptyList = !loading && !loadError && sources.length === 0;

  const dismissBanner = () => setBannerProvider(null);

  const bannerCopy = (() => {
    if (bannerProvider === "github") {
      return "GitHub connected. Add the repos Quorum should read.";
    }
    if (bannerProvider === "linear") {
      return "Linear connected. Add the teams Quorum should read.";
    }
    return null;
  })();

  const openPicker = (tab: SourceType = "github_repo") => {
    setPickerTab(tab);
    setPickerOpen(true);
  };

  const handleRefresh = async (source: KnowledgeSource) => {
    setRefreshingIds((prev) => new Set(prev).add(source.id));
    try {
      const updated = await api.refreshSource(source.id);
      setSources((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch {
      // keep row as-is; user can retry
    } finally {
      setRefreshingIds((prev) => {
        const next = new Set(prev);
        next.delete(source.id);
        return next;
      });
    }
  };

  const handleRemove = async (source: KnowledgeSource) => {
    try {
      await api.deleteSource(source.id);
      setSources((prev) => prev.filter((s) => s.id !== source.id));
    } catch (error) {
      const message =
        error instanceof SourcesApiError
          ? removeSourceErrorMessage(error.status, source.external_ref)
          : humanizeApiError(500, "");
      throw new Error(message);
    }
  };

  return (
    <>
      <div
        id="quorum-sources-toast"
        className="quorum-sources-toast"
        role="status"
        hidden
      />
      <section className="quorum-connections-page">
        {bannerCopy ? (
          <div className="quorum-conn-banner" role="status">
            <IconCheck size={14} />
            {bannerCopy}
            <button
              type="button"
              className="quorum-icon-btn quorum-conn-banner__dismiss"
              aria-label="Dismiss"
              onClick={dismissBanner}
            >
              <IconX size={14} />
            </button>
          </div>
        ) : null}

        <div>
          <div className="quorum-conn-sec-h">
            <span className="overline">Accounts</span>
          </div>
          <div className="quorum-conn-accts">
            {connections.map((connection) => (
              <AccountCard
                key={connection.id}
                connection={connection}
                onAddSources={() =>
                  openPicker(
                    connection.provider === "linear" ? "linear" : "github_repo",
                  )
                }
              />
            ))}
          </div>
        </div>

        <div>
          <div className="quorum-conn-sec-h">
            <span className="overline">Knowledge sources</span>
            {!loading && !loadError && anyConnected ? (
              <span className="quorum-conn-sec-actions">
                <span className="quorum-conn-ready caption">
                  {readyCount} of {sources.length} ready
                </span>
                <button
                  type="button"
                  className="dom-btn dom-btn--primary dom-btn--sm"
                  onClick={() => openPicker()}
                >
                  <IconPlus />
                  Add sources
                </button>
              </span>
            ) : null}
          </div>

          {loading ? (
            <div
              className="quorum-source-list"
              role="status"
              aria-label="Loading sources"
            >
              {[0, 1, 2].map((i) => (
                <div className="quorum-source-row quorum-source-row--sk" key={i}>
                  <span className="quorum-skel quorum-skel--ic" />
                  <div className="quorum-source-row__body">
                    <span className="quorum-skel" style={{ width: 180 + i * 30 }} />
                    <span
                      className="quorum-skel quorum-skel--sm"
                      style={{ width: 90 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="quorum-conn-list-msg">
              <div className="quorum-callout-err" role="alert">
                Something went wrong on our side. Try again in a moment.
              </div>
              <button
                type="button"
                className="dom-btn dom-btn--secondary dom-btn--sm"
                onClick={() => {
                  setLoading(true);
                  void loadAll();
                }}
              >
                <IconRefresh size={13} />
                Try again
              </button>
            </div>
          ) : showEmptyList ? (
            <div className="quorum-conn-list-msg quorum-conn-list-empty">
              <b>No knowledge sources yet</b>
              <span className="caption">
                Connect GitHub or Linear above, then add the repos and teams Quorum
                should read.
              </span>
            </div>
          ) : (
            <div className="quorum-source-list">
              {sources.map((source) => (
                <SourceListItem
                  key={source.id}
                  source={source}
                  refreshing={refreshingIds.has(source.id)}
                  onRefresh={() => void handleRefresh(source)}
                  onRemove={() => handleRemove(source)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <AddSourcePicker
        open={pickerOpen}
        connections={connections}
        api={api}
        initialTab={pickerTab}
        onClose={() => setPickerOpen(false)}
        onAdded={() => void loadAll()}
      />
    </>
  );
}

function AccountCard({
  connection,
  onAddSources,
}: {
  connection: Connection;
  onAddSources: () => void;
}) {
  const isGithub = connection.provider === "github";
  const title = providerDisplayName(connection.provider);

  return (
    <div className="quorum-conn-acct">
      <div className="quorum-conn-acct-h">
        {isGithub ? <IconGitHub size={18} /> : <IconLinear size={16} />}
        <b>{title}</b>
        {connection.connected ? (
          <span
            className="quorum-dot quorum-dot--ready quorum-conn-acct-dot"
            aria-label="Connected"
          />
        ) : (
          <span className="caption quorum-conn-acct-nc">Not connected</span>
        )}
      </div>
      <span className="caption">
        {connection.connected
          ? isGithub
            ? `Connected as @${connection.account_label ?? "your-account"}`
            : `Connected to ${connection.account_label ?? "your workspace"}`
          : isGithub
            ? "Install the Quorum app on the repos you want it to read."
            : "Let Quorum read your team's issues."}
      </span>
      <div>
        {connection.connected ? (
          <button
            type="button"
            className="dom-btn dom-btn--secondary dom-btn--sm"
            onClick={onAddSources}
          >
            {isGithub ? "Add repos" : "Add teams"}
          </button>
        ) : (
          <a
            className="dom-btn dom-btn--primary dom-btn--sm"
            href={oauthAuthorizeUrl(connection.provider)}
          >
            Connect {title}
          </a>
        )}
      </div>
    </div>
  );
}
