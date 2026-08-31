"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Checkbox, Select, Spinner, TextField } from "@shopify/polaris";
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
  onOpenImport?: () => void;
  compact?: boolean;
}

const SYNC_MODE_OPTIONS = [
  { label: "Create only (first import)", value: "create" },
  { label: "Update by SKU (live feed)", value: "update_by_sku" },
  { label: "Update by barcode", value: "update_by_barcode" },
  { label: "Upsert (update + create new)", value: "upsert" },
];

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

  const feedSettingsBlock = sheetsIntegration ? (
    <div className="tidysync-feed-settings">
      <p className="tidysync-feed-settings-title">Live supplier feed</p>
      <Select
        label="Sync mode"
        options={SYNC_MODE_OPTIONS}
        value={syncMode}
        onChange={(v) => setSyncMode(v as FeedSyncMode)}
      />
      {isLiveMode && !hasMapping && (
        <p className="tidysync-sheets-compact-hint">
          Run one sync in <strong>create</strong> mode, map columns, preview, and approve — then switch to live update mode.
        </p>
      )}
      {isLiveMode && hasMapping && (
        <>
          <Select label="Schedule" options={SCHEDULE_OPTIONS} value={schedule} onChange={setSchedule} />
          <Checkbox
            label="Auto-sync on schedule"
            checked={autoSyncEnabled}
            onChange={setAutoSyncEnabled}
            helpText="Worker checks every minute and runs when the interval elapses."
          />
          <Checkbox
            label="Auto-apply without preview"
            checked={autoApprove}
            onChange={setAutoApprove}
            helpText="Skip manual approve — only enable if you trust the supplier file."
          />
        </>
      )}
      <Button onClick={() => saveFeedSettings(sheetsIntegration.id)} loading={savingFeed}>
        Save feed settings
      </Button>
    </div>
  ) : null;

  if (compact) {
    return (
      <div className="tidysync-sheets-compact">
        {errorAlert && (
          <AppAlert
            tone={errorAlert.tone}
            title={errorAlert.title}
            message={errorAlert.message}
            onDismiss={() => setErrorAlert(null)}
          />
        )}
        {loading ? (
          <Spinner size="small" />
        ) : sheetsIntegration ? (
          <>
            <div className="tidysync-sheets-compact-row">
              <span>
                Connected · {cfg?.sheetName ?? "Sheet"}
                {hasMapping ? " · mapping saved" : ""}
                {isLiveMode && hasMapping ? " · live feed" : ""}
              </span>
              <Button
                size="slim"
                onClick={() => sync(sheetsIntegration.id)}
                loading={syncing === sheetsIntegration.id}
              >
                {isLiveMode && hasMapping ? "Sync feed" : "Sync sheet"}
              </Button>
              <Button size="slim" onClick={() => disconnect(sheetsIntegration.id)}>Disconnect</Button>
            </div>
            {feedSettingsBlock}
          </>
        ) : (
          <div className="tidysync-sheets-compact-connect">
            <TextField
              label="Sheet URL (shared as Viewer)"
              labelHidden
              value={sheetUrl}
              onChange={setSheetUrl}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              autoComplete="off"
            />
            <Button variant="primary" onClick={() => connect()} loading={connecting} disabled={!sheetUrl.trim()}>
              Connect & sync
            </Button>
          </div>
        )}
        <p className="tidysync-sheets-compact-hint">
          Map once, then use <strong>Update by SKU</strong> for scheduled price/stock updates without duplicates.
        </p>
      </div>
    );
  }

  return (
    <div className="tidysync-sheets">
      <header className="tidysync-sheets-hero">
        <h2>Google Sheets supplier feed</h2>
        <p>
          Connect a supplier spreadsheet. First import maps columns; live feed matches by SKU or barcode and updates
          price, stock, and titles on a schedule.
        </p>
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

      {loading ? (
        <div className="tidysync-sheets-loading">
          <Spinner />
        </div>
      ) : sheetsIntegration ? (
        <div className="tidysync-sheets-connected">
          <div className="tidysync-sheets-card">
            <h3>Connected spreadsheet</h3>
            <p>ID: {cfg?.spreadsheetId}</p>
            {cfg?.lastSyncAt && (
              <p className="tidysync-sheets-meta">
                Last sync: {new Date(cfg.lastSyncAt).toLocaleString()}
              </p>
            )}
            <div className="tidysync-sheets-actions">
              <Button
                variant="primary"
                onClick={() => sync(sheetsIntegration.id)}
                loading={syncing === sheetsIntegration.id}
              >
                {isLiveMode && hasMapping ? "Run feed sync" : "Sync now"}
              </Button>
              <Button onClick={() => disconnect(sheetsIntegration.id)} tone="critical">
                Disconnect
              </Button>
            </div>
          </div>
          {feedSettingsBlock}
        </div>
      ) : (
        <div className="tidysync-sheets-connect">
          <TextField
            label="Google Sheets URL or spreadsheet ID"
            value={sheetUrl}
            onChange={setSheetUrl}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            autoComplete="off"
          />
          <TextField
            label="Sheet label"
            value={sheetName}
            onChange={setSheetName}
            autoComplete="off"
          />
          <Button variant="primary" onClick={() => connect()} loading={connecting} disabled={!sheetUrl.trim()}>
            Connect spreadsheet
          </Button>
        </div>
      )}
    </div>
  );
}
