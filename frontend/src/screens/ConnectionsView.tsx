import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddSourcePicker } from "../components/AddSourcePicker";
import {
  IconCheck,
  IconGitHub,
  IconLinear,
  IconPlus,
  IconRefresh,
  IconX,
} from "../components/icons";
import {
  refreshSourceErrorMessage,
  removeSourceErrorMessage,
  SourceListItem,
} from "../components/SourceListItem";
import { addedSourcesToast } from "../lib/addSourceLabels";
import { humanizeApiError } from "../lib/authErrors";
import {
  oauthAuthorizeUrl,
  resolveSourcesApi,
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
  const [api, setApi] = useState<SourcesApi | null>(apiProp ?? null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [refreshErrors, setRefreshErrors] = useState<Record<string, string>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<SourceType>("github_repo");
  const [bannerProvider, setBannerProvider] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const addSourcesButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (apiProp) {
      setApi(apiProp);
      return;
    }
    void resolveSourcesApi()
      .then(setApi)
      .catch(() => setLoadError(true));
  }, [apiProp]);

  const resolvedApi = api ?? apiProp ?? null;

  const loadAll = useCallback(async () => {
    if (!resolvedApi) {
      return;
    }
    try {
      const [nextConnections, nextSources] = await Promise.all([
        resolvedApi.listConnections(),
        resolvedApi.listSources(),
      ]);
      setConnections(nextConnections);
      setSources(nextSources);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [resolvedApi]);

  useEffect(() => {
    if (!resolvedApi) {
      return;
    }
    void loadAll();
  }, [loadAll, resolvedApi]);

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

  useEffect(() => {
    if (!toastMessage) {
      return;
    }
    const id = window.setTimeout(() => setToastMessage(null), 5000);
    return () => window.clearTimeout(id);
  }, [toastMessage]);

  const needsPoll = useMemo(
    () => sources.some((s) => s.status === "pending" || s.status === "indexing"),
    [sources],
  );

  useEffect(() => {
    if (!needsPoll || !resolvedApi) {
      return;
    }
    const id = window.setInterval(() => {
      void resolvedApi
        .listSources()
        .then(setSources)
        .catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [resolvedApi, needsPoll]);

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
    if (!resolvedApi) {
      return;
    }
    setRefreshingIds((prev) => new Set(prev).add(source.id));
    setRefreshErrors((prev) => {
      const next = { ...prev };
      delete next[source.id];
      return next;
    });
    try {
      const updated = await resolvedApi.refreshSource(source.id);
      setSources((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (error) {
      const status = error instanceof SourcesApiError ? error.status : 500;
      const message = refreshSourceErrorMessage(
        status,
        source.external_ref,
        source.source_type === "linear" ? "linear" : "github",
      );
      setRefreshErrors((prev) => ({ ...prev, [source.id]: message }));
    } finally {
      setRefreshingIds((prev) => {
        const next = new Set(prev);
        next.delete(source.id);
        return next;
      });
    }
  };

  const handleRemove = async (source: KnowledgeSource) => {
    if (!resolvedApi) {
      return;
    }
    try {
      await resolvedApi.deleteSource(source.id);
      setSources((prev) => prev.filter((s) => s.id !== source.id));
    } catch (error) {
      const message =
        error instanceof SourcesApiError
          ? removeSourceErrorMessage(error.status, source.external_ref)
          : humanizeApiError(500, "");
      throw new Error(message);
    }
  };

  const handleSourcesAdded = (count: number) => {
    setToastMessage(addedSourcesToast(count));
    void loadAll();
  };

  if (!resolvedApi && !loadError) {
    return (
      <section className="quorum-connections-page">
        <div className="quorum-source-list" role="status" aria-label="Loading sources">
          {[0, 1, 2].map((i) => (
            <div className="quorum-source-row quorum-source-row--sk" key={i}>
              <span className="quorum-skel quorum-skel--ic" />
              <div className="quorum-source-row__body">
                <span className="quorum-skel" style={{ width: 180 + i * 30 }} />
                <span className="quorum-skel quorum-skel--sm" style={{ width: 90 }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <>
      {toastMessage ? (
        <div className="quorum-sources-toast" role="status">
          <IconCheck size={14} />
          {toastMessage}
        </div>
      ) : null}
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
                  ref={addSourcesButtonRef}
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
                  refreshError={refreshErrors[source.id] ?? null}
                  onRefresh={() => void handleRefresh(source)}
                  onRemove={() => handleRemove(source)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {resolvedApi ? (
        <AddSourcePicker
          open={pickerOpen}
          connections={connections}
          api={resolvedApi}
          initialTab={pickerTab}
          returnFocusRef={addSourcesButtonRef}
          onClose={() => setPickerOpen(false)}
          onAdded={handleSourcesAdded}
        />
      ) : null}
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

  const connectedLine =
    connection.connected && connection.account_label
      ? isGithub
        ? `Connected as @${connection.account_label}`
        : `Connected to ${connection.account_label}`
      : null;

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
      {connectedLine ? <span className="caption">{connectedLine}</span> : null}
      {!connection.connected ? (
        <span className="caption">
          {isGithub
            ? "Install the Quorum app on the repos you want it to read."
            : "Let Quorum read your team's issues."}
        </span>
      ) : null}
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
