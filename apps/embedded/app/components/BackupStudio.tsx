"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  BlockStack,
  Button,
  InlineStack,
  Spinner,
  Text,
} from "@shopify/polaris";
import { gqlRequest, QUERIES, MUTATIONS } from "../lib/graphql";
import { alertFromError } from "../lib/graphql-errors";
import { AppAlert } from "./AppAlert";

interface StoreBackup {
  id: string;
  label: string;
  productCount: number;
  sizeBytes: number;
  status: string;
  expiresAt?: string | null;
  createdAt: string;
}

interface BackupStudioProps {
  shop: string;
  maxBackups?: number;
  onUpgrade?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BackupStudio({ shop, maxBackups = 0, onUpgrade }: BackupStudioProps) {
  const [backups, setBackups] = useState<StoreBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [errorAlert, setErrorAlert] = useState<ReturnType<typeof alertFromError> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await gqlRequest<{ storeBackups: StoreBackup[] }>(QUERIES.storeBackups, {}, shop);
      setBackups(data.storeBackups);
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

  const createBackup = async () => {
    setCreating(true);
    setErrorAlert(null);
    try {
      await gqlRequest(MUTATIONS.createStoreBackup, {}, shop);
      await load();
    } catch (e) {
      setErrorAlert(alertFromError(e, onUpgrade));
    } finally {
      setCreating(false);
    }
  };

  const deleteBackup = async (id: string) => {
    try {
      await gqlRequest(MUTATIONS.deleteStoreBackup, { id }, shop);
      setBackups((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      setErrorAlert(alertFromError(e, onUpgrade));
    }
  };

  return (
    <div className="tidysync-backup-studio">
      <div className="tidysync-seo-header">
        <BlockStack gap="100">
          <Text as="h3" variant="headingMd">Catalog backups</Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Snapshot your product catalog to TidySync. Plan limit: {maxBackups} saved backup{maxBackups === 1 ? "" : "s"}.
          </Text>
        </BlockStack>
        <Badge tone="info">{`${backups.length} / ${maxBackups}`}</Badge>
      </div>

      {errorAlert && (
        <AppAlert
          tone={errorAlert.tone}
          title={errorAlert.title}
          message={errorAlert.message}
          primaryAction={errorAlert.primaryAction}
          onDismiss={() => setErrorAlert(null)}
        />
      )}

      <InlineStack gap="300" wrap>
        <Button variant="primary" onClick={() => createBackup()} loading={creating} disabled={maxBackups <= 0}>
          Create backup now
        </Button>
        <Button onClick={() => load()}>Refresh</Button>
      </InlineStack>

      {loading ? (
        <div className="tidysync-seo-list-loading" style={{ marginTop: 24 }}>
          <Spinner size="small" />
          <Text as="p" variant="bodySm" tone="subdued">Loading backups…</Text>
        </div>
      ) : backups.length === 0 ? (
        <div style={{ marginTop: 24 }}>
          <Text as="p" variant="bodySm" tone="subdued">
            No backups yet. Create one before major imports or bulk edits.
          </Text>
        </div>
      ) : (
        <div className="tidysync-backup-list">
          {backups.map((b) => (
            <div key={b.id} className="tidysync-backup-card">
              <BlockStack gap="100">
                <Text as="p" variant="bodyMd" fontWeight="semibold">{b.label}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {b.productCount} products · {formatBytes(b.sizeBytes)} · {new Date(b.createdAt).toLocaleString()}
                </Text>
                {b.expiresAt && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    Expires {new Date(b.expiresAt).toLocaleDateString()}
                  </Text>
                )}
              </BlockStack>
              <InlineStack gap="200">
                <Badge tone={b.status === "COMPLETED" ? "success" : "info"}>{b.status}</Badge>
                <Button size="slim" onClick={() => deleteBackup(b.id)}>Delete</Button>
              </InlineStack>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
