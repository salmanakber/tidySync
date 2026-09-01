"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Checkbox, Collapsible, Select, Spinner, TextField } from "@shopify/polaris";
import { gqlRequest, QUERIES, MUTATIONS } from "../lib/graphql";
import { alertFromError } from "../lib/graphql-errors";
import { AppAlert } from "./AppAlert";

type FeedSyncMode = "create" | "update_by_sku" | "update_by_barcode" | "upsert";

interface SheetsConfig {
  spreadsheetId?: string;
  sheetName?: string;
  sheetGid?: string;
  lastSyncAt?: string;
  syncMode?: FeedSyncMode;
  matchField?: string;
  schedule?: string;
  autoSyncEnabled?: boolean;
  autoApprove?: boolean;
  savedMappings?: Array<{ sourceColumn: string; targetField: string }>;
}

interface TenantIntegration {
  id: string;
  type: string;
  enabled: boolean;
  config: SheetsConfig;
}

interface GoogleSheetsStudioProps {
  shop: string;
  onUpgrade?: () => void;
  onJobStarted?: (jobId: string) => void;
  compact?: boolean;
}

const SYNC_MODE_OPTIONS = [
  { label: "Create only (first import)", value: "create" },
  { label: "Update by SKU (live feed)", value: "update_by_sku" },
  { label: "Update by barcode", value: "update_by_barcode" },
  { label: "Upsert (update + create new)", value: "upsert" },
];

const SHEET_URL_HELP =
  "Share → General access: Anyone with the link → Viewer. Open the tab you want to sync and paste the full URL from your browser (include #gid=…). Test in a private window — it must open without signing into Google.";

const SCHEDULE_OPTIONS = [
  { label: "Every 6 hours", value: "every 6h" },
  { label: "Every 12 hours", value: "every 12h" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
];

export function GoogleSheetsStudio({
  shop,
  onUpgrade,
  onJobStarted,
  compact = false,
}: GoogleSheetsStudioProps) {
  const [integrations, setIntegrations] = useState<TenantIntegration[]>([]);
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetName, setSheetName] = useState("Products");
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [savingFeed, setSavingFeed] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [syncMode, setSyncMode] = useState<FeedSyncMode>("create");
  const [schedule, setSchedule] = useState("daily");
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [autoApprove, setAutoApprove] = useState(false);
  const [errorAlert, setErrorAlert] = useState<ReturnType<typeof alertFromError> | null>(null);

  const sheetsIntegration = integrations.find((i) => i.type === "GOOGLE_SHEETS");
  const cfg = sheetsIntegration?.config;
  const hasMapping = Boolean(cfg?.savedMappings?.length);
  const isLiveMode = syncMode !== "create";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await gqlRequest<{ tenantIntegrations: TenantIntegration[] }>(
        QUERIES.tenantIntegrations,
        {},
        shop,
      );
      setIntegrations(data.tenantIntegrations);
      const sheets = data.tenantIntegrations.find((i) => i.type === "GOOGLE_SHEETS");
      if (sheets?.config) {
        setSyncMode((sheets.config.syncMode as FeedSyncMode) ?? "create");
        setSchedule(sheets.config.schedule ?? "daily");
        setAutoSyncEnabled(sheets.config.autoSyncEnabled ?? false);
        setAutoApprove(sheets.config.autoApprove ?? false);
        if (sheets.config.syncMode && sheets.config.syncMode !== "create") {
          setFeedOpen(true);
        }
      }
      setErrorAlert(null);
    } catch (e) {
      setErrorAlert(alertFromError(e, onUpgrade));
    } finally {
      setLoading(false);
    }
  }, [shop, onUpgrade]);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async () => {
    if (!sheetUrl.trim()) return;
    setConnecting(true);
    setErrorAlert(null);
    try {
      await gqlRequest(
        MUTATIONS.connectGoogleSheet,
        { spreadsheetUrl: sheetUrl.trim(), sheetName: sheetName.trim() || "Products" },
        shop,
      );
      setSheetUrl("");
      await load();
    } catch (e) {
      setErrorAlert(alertFromError(e, onUpgrade));
    } finally {
      setConnecting(false);
    }
  };

  const sync = async (integrationId: string) => {
    setSyncing(integrationId);
    setErrorAlert(null);
    try {
      const data = await gqlRequest<{ syncGoogleSheet: { id: string } }>(
        MUTATIONS.syncGoogleSheet,
        { integrationId },
        shop,
      );
      if (onJobStarted) onJobStarted(data.syncGoogleSheet.id);
      await load();
    } catch (e) {
      setErrorAlert(alertFromError(e, onUpgrade));
    } finally {
      setSyncing(null);
    }
  };

  const saveFeedSettings = async (integrationId: string) => {
    setSavingFeed(true);
    setErrorAlert(null);
    try {
      const matchField =
        syncMode === "update_by_barcode" ? "variants.barcode" : "variants.sku";
      await gqlRequest(
        MUTATIONS.updateGoogleSheetFeed,
        {
          integrationId,
          syncMode,
          matchField,
          schedule,
          autoSyncEnabled,
          autoApprove,
        },
        shop,
      );
      await load();
    } catch (e) {
      setErrorAlert(alertFromError(e, onUpgrade));
    } finally {
      setSavingFeed(false);
    }
  };

  const disconnect = async (id: string) => {
    try {
      await gqlRequest(MUTATIONS.disconnectGoogleSheet, { id }, shop);
      await load();
    } catch (e) {
      setErrorAlert(alertFromError(e, onUpgrade));
    }
  };

  const feedSettingsPanel = sheetsIntegration ? (
    <div className="tidysync-sheets-feed-panel">
      <button
        type="button"
        className="tidysync-sheets-feed-toggle"
        onClick={() => setFeedOpen((o) => !o)}
        aria-expanded={feedOpen}
      >
        <span>Live supplier feed settings</span>
        <span className="tidysync-sheets-feed-toggle-meta">
          {isLiveMode && hasMapping ? "Active" : isLiveMode ? "Needs mapping" : "Import mode"}
        </span>
      </button>
      <Collapsible open={feedOpen} id="sheets-feed-settings">
        <div className="tidysync-sheets-feed-body">
          <Select
            label="Sync mode"
            options={SYNC_MODE_OPTIONS}
            value={syncMode}
            onChange={(v) => setSyncMode(v as FeedSyncMode)}
          />
          {isLiveMode && !hasMapping && (
            <p className="tidysync-sheets-hint">
              Run one sync in <strong>Create only</strong> mode, map columns, preview, and approve — then switch to live update.
            </p>
          )}
          {isLiveMode && hasMapping && (
            <>
              <Select label="Schedule" options={SCHEDULE_OPTIONS} value={schedule} onChange={setSchedule} />
              <Checkbox
                label="Auto-sync on schedule"
                checked={autoSyncEnabled}
                onChange={setAutoSyncEnabled}
                helpText="Runs on your worker schedule (hourly check)."
              />
              <Checkbox
                label="Auto-apply without preview"
                checked={autoApprove}
                onChange={setAutoApprove}
                helpText="Only enable if you fully trust the supplier file."
              />
            </>
          )}
          <Button onClick={() => saveFeedSettings(sheetsIntegration.id)} loading={savingFeed}>
            Save feed settings
          </Button>
        </div>
      </Collapsible>
    </div>
  ) : null;

  if (compact) {
    return (
      <div className="tidysync-sheets-panel">
        <div className="tidysync-sheets-panel-head">
          <h4>Google Sheets supplier feed</h4>
          <p>Connect a shared spreadsheet — map once, then sync by SKU for price and stock updates.</p>
        </div>

        {errorAlert && (
          <AppAlert
            tone={errorAlert.tone}
            title={errorAlert.title}
            message={errorAlert.message}
            onDismiss={() => setErrorAlert(null)}
          />
        )}

        {loading ? (
          <div className="tidysync-studio-loading-inline">
            <Spinner size="small" />
            <span>Loading connection…</span>
          </div>
        ) : sheetsIntegration ? (
          <>
            <div className="tidysync-sheets-connected-bar">
              <div className="tidysync-sheets-connected-info">
                <span className="tidysync-studio-tag is-success">Connected</span>
                <strong>{cfg?.sheetName ?? "Spreadsheet"}</strong>
                {hasMapping && <span className="tidysync-sheets-meta-pill">Mapping saved</span>}
                {isLiveMode && hasMapping && (
                  <span className="tidysync-sheets-meta-pill is-live">Live feed</span>
                )}
                {cfg?.lastSyncAt && (
                  <span className="tidysync-sheets-last-sync">
                    Last sync {new Date(cfg.lastSyncAt).toLocaleString()}
                  </span>
                )}
              </div>
              <div className="tidysync-sheets-connected-actions">
                <Button
                  variant="primary"
                  onClick={() => sync(sheetsIntegration.id)}
                  loading={syncing === sheetsIntegration.id}
                >
                  {isLiveMode && hasMapping ? "Sync feed" : "Sync sheet"}
                </Button>
                <Button onClick={() => disconnect(sheetsIntegration.id)}>Disconnect</Button>
              </div>
            </div>
            {feedSettingsPanel}
          </>
        ) : (
          <div className="tidysync-sheets-connect-form">
            <TextField
              label="Sheet URL"
              value={sheetUrl}
              onChange={setSheetUrl}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              helpText={SHEET_URL_HELP}
              autoComplete="off"
            />
            <div className="tidysync-sheets-connect-row">
              <TextField
                label="Label"
                value={sheetName}
                onChange={setSheetName}
                autoComplete="off"
              />
              <Button
                variant="primary"
                onClick={() => connect()}
                loading={connecting}
                disabled={!sheetUrl.trim()}
              >
                Connect & sync
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="tidysync-studio tidysync-sheets">
      <header className="tidysync-studio-hero">
        <div className="tidysync-studio-hero-pattern" aria-hidden="true" />
        <div className="tidysync-studio-hero-inner tidysync-studio-hero-inner--single">
          <div className="tidysync-studio-hero-copy">
            <span className="tidysync-studio-badge is-brand">Google Sheets</span>
            <h2 className="tidysync-studio-title">Supplier feed sync</h2>
            <p className="tidysync-studio-sub">
              Connect a spreadsheet, map columns once, then match by SKU or barcode for scheduled price and inventory updates.
            </p>
          </div>
        </div>
      </header>

      {errorAlert && (
        <AppAlert
          tone={errorAlert.tone}
          title={errorAlert.title}
          message={errorAlert.message}
          primaryAction={errorAlert.primaryAction}
          onDismiss={() => setErrorAlert(null)}
        />
      )}

      <div className="tidysync-studio-panel">
        {loading ? (
          <div className="tidysync-studio-empty">
            <Spinner />
            <p>Loading…</p>
          </div>
        ) : sheetsIntegration ? (
          <>
            <div className="tidysync-sheets-connected-bar">
              <div className="tidysync-sheets-connected-info">
                <span className="tidysync-studio-tag is-success">Connected</span>
                <strong>{cfg?.sheetName ?? "Spreadsheet"}</strong>
                <span className="tidysync-sheets-id">ID {cfg?.spreadsheetId?.slice(0, 12)}…</span>
              </div>
              <div className="tidysync-sheets-connected-actions">
                <Button
                  variant="primary"
                  onClick={() => sync(sheetsIntegration.id)}
                  loading={syncing === sheetsIntegration.id}
                >
                  {isLiveMode && hasMapping ? "Run feed sync" : "Sync now"}
                </Button>
                <Button tone="critical" onClick={() => disconnect(sheetsIntegration.id)}>
                  Disconnect
                </Button>
              </div>
            </div>
            {feedSettingsPanel}
          </>
        ) : (
          <div className="tidysync-sheets-connect-form">
            <TextField
              label="Google Sheets URL or spreadsheet ID"
              value={sheetUrl}
              onChange={setSheetUrl}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              helpText={SHEET_URL_HELP}
              autoComplete="off"
            />
            <TextField label="Sheet label" value={sheetName} onChange={setSheetName} autoComplete="off" />
            <Button variant="primary" onClick={() => connect()} loading={connecting} disabled={!sheetUrl.trim()}>
              Connect spreadsheet
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
