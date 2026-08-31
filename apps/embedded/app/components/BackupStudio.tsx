"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Icon, Spinner } from "@shopify/polaris";
import { DatabaseIcon, DeleteIcon, RefreshIcon, UndoIcon } from "@shopify/polaris-icons";
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
  onJobStarted?: (jobId: string, meta?: { rowCount?: number }) => void;
}

const RESTORE_FIELDS = [
  { id: "title", label: "Title" },
  { id: "descriptionHtml", label: "Description" },
  { id: "vendor", label: "Vendor" },
  { id: "tags", label: "Tags" },
  { id: "productType", label: "Product type" },
  { id: "status", label: "Status" },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BackupStudio({ shop, maxBackups = 0, onUpgrade, onJobStarted }: BackupStudioProps) {
  const [backups, setBackups] = useState<StoreBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<StoreBackup | null>(null);
  const [vendorFilter, setVendorFilter] = useState("");
  const [titleFilter, setTitleFilter] = useState("");
  const [tagsFilter, setTagsFilter] = useState("");
  const [productIdsFilter, setProductIdsFilter] = useState("");
  const [selectedFields, setSelectedFields] = useState<string[]>([
    "title",
    "descriptionHtml",
    "vendor",
    "tags",
  ]);
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
      const data = await gqlRequest<{ createStoreBackup: { id: string; status: string } }>(
        MUTATIONS.createStoreBackup,
        {},
        shop,
      );
      if (onJobStarted && data.createStoreBackup?.id) {
        onJobStarted(data.createStoreBackup.id);
      }
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

  const openRestore = (backup: StoreBackup) => {
    setRestoreTarget(backup);
    setVendorFilter("");
    setTitleFilter("");
    setTagsFilter("");
    setProductIdsFilter("");
    setSelectedFields(["title", "descriptionHtml", "vendor", "tags"]);
  };

  const closeRestore = () => {
    if (!restoring) setRestoreTarget(null);
  };

  const toggleField = (fieldId: string) => {
    setSelectedFields((prev) =>
      prev.includes(fieldId) ? prev.filter((f) => f !== fieldId) : [...prev, fieldId],
    );
  };

  const runRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    setErrorAlert(null);
    try {
      const tags = tagsFilter
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const productIds = productIdsFilter
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter(Boolean);

      const data = await gqlRequest<{
        restoreStoreBackup: { id: string; status: string; rowCount?: number };
      }>(
        MUTATIONS.restoreStoreBackup,
        {
          id: restoreTarget.id,
          vendor: vendorFilter.trim() || undefined,
          titleContains: titleFilter.trim() || undefined,
          tags: tags.length > 0 ? tags : undefined,
          productIds: productIds.length > 0 ? productIds : undefined,
          fields: selectedFields.length > 0 ? selectedFields : undefined,
        },
        shop,
      );

      if (onJobStarted && data.restoreStoreBackup?.id) {
        onJobStarted(data.restoreStoreBackup.id, {
          rowCount: data.restoreStoreBackup.rowCount ?? restoreTarget.productCount,
        });
      }
      setRestoreTarget(null);
      await load();
    } catch (e) {
      setErrorAlert(alertFromError(e, onUpgrade));
    } finally {
      setRestoring(false);
    }
  };

  const usedPct = maxBackups > 0 ? Math.min(100, Math.round((backups.length / maxBackups) * 100)) : 0;
  const totalProducts = backups.reduce((sum, b) => sum + b.productCount, 0);
  const totalSize = backups.reduce((sum, b) => sum + b.sizeBytes, 0);

  return (
    <div className="tidysync-vault">
      <header className="tidysync-vault-hero">
        <div className="tidysync-vault-hero-pattern" aria-hidden="true" />
        <div className="tidysync-vault-hero-inner">
          <div className="tidysync-vault-hero-copy">
            <span className="tidysync-vault-badge">
              <Icon source={DatabaseIcon} />
              Catalog vault
            </span>
            <h2 className="tidysync-vault-title">Secure product snapshots</h2>
            <p className="tidysync-vault-sub">
              Point-in-time backups stored in TidySync. Restore to Shopify anytime with optional filters — vendor, title, tags, or specific product IDs.
            </p>
          </div>

          <div className="tidysync-vault-capacity">
            <div className="tidysync-vault-capacity-head">
              <span>Vault usage</span>
              <strong>{backups.length} / {maxBackups}</strong>
            </div>
            <div className="tidysync-vault-capacity-track">
              <div className="tidysync-vault-capacity-fill" style={{ width: `${usedPct}%` }} />
            </div>
            <div className="tidysync-vault-capacity-meta">
              <span>{totalProducts.toLocaleString()} products saved</span>
              <span>{formatBytes(totalSize)} total</span>
            </div>
          </div>
        </div>
      </header>

      {errorAlert && (
        <div className="tidysync-vault-alert">
          <AppAlert
            tone={errorAlert.tone}
            title={errorAlert.title}
            message={errorAlert.message}
            primaryAction={errorAlert.primaryAction}
            onDismiss={() => setErrorAlert(null)}
          />
        </div>
      )}

      <div className="tidysync-vault-toolbar">
        <button
          type="button"
          className="tidysync-vault-create"
          disabled={creating || maxBackups <= 0 || backups.length >= maxBackups}
          onClick={() => createBackup()}
        >
          {creating ? (
            <>
              <Spinner size="small" />
              <span>Creating snapshot…</span>
            </>
          ) : (
            <>
              <span className="tidysync-vault-create-icon">+</span>
              <span>
                <strong>Create new backup</strong>
                <small>Full product catalog JSON snapshot</small>
              </span>
            </>
          )}
        </button>
        <Button icon={RefreshIcon} onClick={() => load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="tidysync-vault-loading">
          <Spinner />
          <p>Loading your vault…</p>
        </div>
      ) : backups.length === 0 ? (
        <div className="tidysync-vault-empty">
          <div className="tidysync-vault-empty-icon" aria-hidden="true">
            <Icon source={DatabaseIcon} />
          </div>
          <h3>No backups yet</h3>
          <p>
            Create a snapshot before your next import or AI bulk edit. You can restore any backup to Shopify with filters when you need to roll back.
          </p>
          {maxBackups > 0 && (
            <Button variant="primary" onClick={() => createBackup()} loading={creating}>
              Create first backup
            </Button>
          )}
        </div>
      ) : (
        <div className="tidysync-vault-grid">
          {backups.map((b) => (
            <article key={b.id} className="tidysync-vault-card">
              <div className="tidysync-vault-card-icon" aria-hidden="true">
                <Icon source={DatabaseIcon} />
              </div>
              <div className="tidysync-vault-card-body">
                <h4>{b.label}</h4>
                <ul className="tidysync-vault-card-meta">
                  <li>{b.productCount.toLocaleString()} products</li>
                  <li>{formatBytes(b.sizeBytes)}</li>
                  <li>{formatDate(b.createdAt)}</li>
                </ul>
                {b.expiresAt && (
                  <p className="tidysync-vault-card-expires">
                    Expires {new Date(b.expiresAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="tidysync-vault-card-footer">
                <span className={`tidysync-vault-status is-${b.status.toLowerCase()}`}>{b.status}</span>
                <div className="tidysync-vault-card-actions">
                  {b.status === "COMPLETED" && (
                    <button
                      type="button"
                      className="tidysync-vault-restore"
                      onClick={() => openRestore(b)}
                      aria-label="Restore backup"
                    >
                      <Icon source={UndoIcon} />
                      <span>Restore</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="tidysync-vault-delete"
                    onClick={() => deleteBackup(b.id)}
                    aria-label="Delete backup"
                  >
                    <Icon source={DeleteIcon} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {restoreTarget && (
        <div className="tidysync-vault-restore-modal" role="dialog" aria-modal="true">
          <div className="tidysync-vault-restore-backdrop" onClick={closeRestore} />
          <div className="tidysync-vault-restore-panel">
            <header>
              <h3>Restore to Shopify</h3>
              <p>
                From <strong>{restoreTarget.label}</strong> · {restoreTarget.productCount.toLocaleString()} products in snapshot
              </p>
            </header>

            <div className="tidysync-vault-restore-filters">
              <h4>Filters (optional)</h4>
              <p className="tidysync-vault-restore-hint">Leave blank to restore all products in this backup.</p>
              <label>
                <span>Vendor equals</span>
                <input
                  type="text"
                  value={vendorFilter}
                  onChange={(e) => setVendorFilter(e.target.value)}
                  placeholder="e.g. Nike"
                />
              </label>
              <label>
                <span>Title contains</span>
                <input
                  type="text"
                  value={titleFilter}
                  onChange={(e) => setTitleFilter(e.target.value)}
                  placeholder="e.g. Summer"
                />
              </label>
              <label>
                <span>Tags (comma-separated)</span>
                <input
                  type="text"
                  value={tagsFilter}
                  onChange={(e) => setTagsFilter(e.target.value)}
                  placeholder="sale, featured"
                />
              </label>
              <label>
                <span>Product IDs (optional)</span>
                <input
                  type="text"
                  value={productIdsFilter}
                  onChange={(e) => setProductIdsFilter(e.target.value)}
                  placeholder="gid://shopify/Product/…"
                />
              </label>
            </div>

            <div className="tidysync-vault-restore-fields">
              <h4>Fields to restore</h4>
              <div className="tidysync-vault-restore-field-grid">
                {RESTORE_FIELDS.map((field) => (
                  <label key={field.id} className="tidysync-vault-restore-field">
                    <input
                      type="checkbox"
                      checked={selectedFields.includes(field.id)}
                      onChange={() => toggleField(field.id)}
                    />
                    <span>{field.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <footer className="tidysync-vault-restore-footer">
              <Button onClick={closeRestore} disabled={restoring}>Cancel</Button>
              <Button variant="primary" onClick={() => runRestore()} loading={restoring}>
                Start restore job
              </Button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
