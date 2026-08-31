"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Spinner, TextField } from "@shopify/polaris";
import { gqlRequest, QUERIES, MUTATIONS } from "../lib/graphql";
import { alertFromError } from "../lib/graphql-errors";
import { AppAlert } from "./AppAlert";

interface TenantIntegration {
  id: string;
  type: string;
  enabled: boolean;
  config: {
    spreadsheetId?: string;
    sheetName?: string;
    sheetGid?: string;
    lastSyncAt?: string;
  };
}

interface GoogleSheetsStudioProps {
  shop: string;
  onUpgrade?: () => void;
  onSyncStarted?: (jobId: string) => void;
  onOpenImport?: () => void;
}

export function GoogleSheetsStudio({ shop, onUpgrade, onSyncStarted, onOpenImport }: GoogleSheetsStudioProps) {
  const [integrations, setIntegrations] = useState<TenantIntegration[]>([]);
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetName, setSheetName] = useState("Products");
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [errorAlert, setErrorAlert] = useState<ReturnType<typeof alertFromError> | null>(null);

  const sheetsIntegration = integrations.find((i) => i.type === "GOOGLE_SHEETS");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await gqlRequest<{ tenantIntegrations: TenantIntegration[] }>(
        QUERIES.tenantIntegrations,
        {},
        shop,
      );
      setIntegrations(data.tenantIntegrations);
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
      await gqlRequest(MUTATIONS.connectGoogleSheet, {
        spreadsheetUrl: sheetUrl.trim(),
        sheetName: sheetName.trim() || "Products",
      }, shop);
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
      if (onSyncStarted) onSyncStarted(data.syncGoogleSheet.id);
      await load();
      if (onOpenImport) onOpenImport();
    } catch (e) {
      setErrorAlert(alertFromError(e, onUpgrade));
    } finally {
      setSyncing(null);
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

  return (
    <div className="tidysync-sheets">
      <header className="tidysync-sheets-hero">
        <h2>Google Sheets sync</h2>
        <p>
          Connect a spreadsheet as a live product feed. Share the sheet as{" "}
          <strong>Anyone with the link → Viewer</strong>, paste the URL, then sync to import rows into Shopify.
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
            <p>ID: {sheetsIntegration.config.spreadsheetId}</p>
            <p>Sheet: {sheetsIntegration.config.sheetName ?? "Default"}</p>
            {sheetsIntegration.config.lastSyncAt && (
              <p className="tidysync-sheets-meta">
                Last sync: {new Date(sheetsIntegration.config.lastSyncAt).toLocaleString()}
              </p>
            )}
            <div className="tidysync-sheets-actions">
              <Button
                variant="primary"
                onClick={() => sync(sheetsIntegration.id)}
                loading={syncing === sheetsIntegration.id}
              >
                Sync now
              </Button>
              <Button onClick={() => disconnect(sheetsIntegration.id)} tone="critical">
                Disconnect
              </Button>
            </div>
          </div>
          <div className="tidysync-sheets-tip">
            <strong>Automate:</strong> Create a daily schedule (Schedules tab) after your first successful sync.
            Use scheduled IMPORT jobs with the same sheet config.
          </div>
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
            label="Sheet name (label)"
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
