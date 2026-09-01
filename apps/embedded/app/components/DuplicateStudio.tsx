"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Icon, Spinner } from "@shopify/polaris";
import { ProductIcon, RefreshIcon } from "@shopify/polaris-icons";
import { gqlRequest, QUERIES, MUTATIONS } from "../lib/graphql";
import { alertFromError } from "../lib/graphql-errors";
import { AppAlert } from "./AppAlert";

interface DuplicateEntry {
  id: string;
  title: string;
  handle?: string;
  vendor?: string;
  imageUrl?: string;
  variantCount: number;
}

interface DuplicateGroup {
  id: string;
  reason: string;
  matchKey: string;
  products: DuplicateEntry[];
}

interface DuplicateStudioProps {
  shop: string;
  onUpgrade?: () => void;
  onApprove?: (jobId: string) => void;
}

export function DuplicateStudio({ shop, onUpgrade, onApprove }: DuplicateStudioProps) {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [mergingGroupId, setMergingGroupId] = useState<string | null>(null);
  const [bulkMerging, setBulkMerging] = useState(false);
  const [primaryByGroup, setPrimaryByGroup] = useState<Record<string, string>>({});
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [errorAlert, setErrorAlert] = useState<ReturnType<typeof alertFromError> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await gqlRequest<{ findDuplicateProducts: DuplicateGroup[] }>(
        QUERIES.findDuplicateProducts,
        { limit: 250 },
        shop,
      );
      setGroups(data.findDuplicateProducts);
      const defaults: Record<string, string> = {};
      const selected = new Set<string>();
      for (const g of data.findDuplicateProducts) {
        defaults[g.id] = g.products[0]?.id ?? "";
        selected.add(g.id);
      }
      setPrimaryByGroup(defaults);
      setSelectedGroups(selected);
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

  const mergeGroup = async (group: DuplicateGroup) => {
    const primaryId = primaryByGroup[group.id];
    if (!primaryId) return;
    const duplicateIds = group.products.map((p) => p.id).filter((id) => id !== primaryId);
    if (!duplicateIds.length) return;

    setMergingGroupId(group.id);
    setErrorAlert(null);
    try {
      const data = await gqlRequest<{ previewMergeProducts: { id: string } }>(
        MUTATIONS.previewMergeProducts,
        { primaryProductId: primaryId, duplicateProductIds: duplicateIds },
        shop,
      );
      if (onApprove) onApprove(data.previewMergeProducts.id);
    } catch (e) {
      setErrorAlert(alertFromError(e, onUpgrade));
    } finally {
      setMergingGroupId(null);
    }
  };

  const mergeSelectedGroups = async () => {
    const merges = groups
      .filter((g) => selectedGroups.has(g.id))
      .map((g) => {
        const primaryId = primaryByGroup[g.id];
        const duplicateIds = g.products.map((p) => p.id).filter((id) => id !== primaryId);
        return { primaryProductId: primaryId, duplicateProductIds: duplicateIds };
      })
      .filter((m) => m.primaryProductId && m.duplicateProductIds.length > 0);

    if (!merges.length) {
      setErrorAlert({
        tone: "warning",
        message: "Select at least one group with duplicates to merge.",
      });
      return;
    }

    setBulkMerging(true);
    setErrorAlert(null);
    try {
      const data = await gqlRequest<{ previewBulkMergeProducts: { id: string } }>(
        MUTATIONS.previewBulkMergeProducts,
        { merges },
        shop,
      );
      if (onApprove) onApprove(data.previewBulkMergeProducts.id);
    } catch (e) {
      setErrorAlert(alertFromError(e, onUpgrade));
    } finally {
      setBulkMerging(false);
    }
  };

  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const totalDuplicates = groups.reduce((sum, g) => sum + g.products.length - 1, 0);
  const selectedCount = groups.filter((g) => selectedGroups.has(g.id)).length;

  return (
    <div className="tidysync-studio tidysync-duplicates">
      <header className="tidysync-studio-hero">
        <div className="tidysync-studio-hero-pattern" aria-hidden="true" />
        <div className="tidysync-studio-hero-inner">
          <div className="tidysync-studio-hero-copy">
            <span className="tidysync-studio-badge is-purple">
              <Icon source={ProductIcon} />
              Duplicate finder
            </span>
            <h2 className="tidysync-studio-title">Find & merge duplicate products</h2>
            <p className="tidysync-studio-sub">
              Detect listings with the same title, handle, or vendor. Pick the primary — variants combine and
              duplicates are removed after you approve the preview.
            </p>
          </div>
          <div className="tidysync-studio-stat-box">
            <div className="tidysync-studio-stat">
              <strong>{groups.length}</strong>
              <span>groups</span>
            </div>
            <div className="tidysync-studio-stat-divider" aria-hidden="true" />
            <div className="tidysync-studio-stat">
              <strong>{totalDuplicates}</strong>
              <span>extra listings</span>
            </div>
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

      <div className="tidysync-studio-toolbar">
        <Button icon={RefreshIcon} onClick={() => load()} loading={loading}>
          Scan again
        </Button>
        {groups.length > 1 && (
          <Button
            variant="primary"
            onClick={() => mergeSelectedGroups()}
            loading={bulkMerging}
            disabled={mergingGroupId != null || selectedCount === 0}
          >
            Bulk merge {String(selectedCount)} group{selectedCount === 1 ? "" : "s"}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="tidysync-studio-empty">
          <Spinner />
          <p>Scanning your catalog for duplicates…</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="tidysync-studio-empty">
          <div className="tidysync-studio-empty-icon">
            <Icon source={ProductIcon} />
          </div>
          <h3>No duplicate groups found</h3>
          <p>Your catalog looks clean — or try scanning again after a large import.</p>
        </div>
      ) : (
        <div className="tidysync-duplicates-list">
          {groups.map((group) => (
            <article key={group.id} className="tidysync-duplicate-group">
              <header className="tidysync-duplicate-group-head">
                <div className="tidysync-duplicate-group-head-left">
                  {groups.length > 1 && (
                    <label className="tidysync-duplicate-bulk-check">
                      <input
                        type="checkbox"
                        checked={selectedGroups.has(group.id)}
                        onChange={() => toggleGroupSelection(group.id)}
                      />
                      <span>Bulk merge</span>
                    </label>
                  )}
                  <div>
                    <span className="tidysync-duplicate-reason">{group.reason}</span>
                    <h4>{group.matchKey.slice(0, 80)}{group.matchKey.length > 80 ? "…" : ""}</h4>
                    <p>{group.products.length} listings · click a product to set as primary</p>
                  </div>
                </div>
                <Button
                  variant="primary"
                  onClick={() => mergeGroup(group)}
                  loading={mergingGroupId === group.id}
                  disabled={bulkMerging || (mergingGroupId != null && mergingGroupId !== group.id)}
                >
                  Preview merge
                </Button>
              </header>
              <div className="tidysync-duplicate-products">
                {group.products.map((p) => {
                  const isPrimary = primaryByGroup[group.id] === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`tidysync-duplicate-product${isPrimary ? " is-primary" : ""}`}
                      onClick={() =>
                        setPrimaryByGroup((prev) => ({ ...prev, [group.id]: p.id }))
                      }
                    >
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt="" className="tidysync-duplicate-thumb" />
                      ) : (
                        <div className="tidysync-duplicate-thumb is-empty">
                          <Icon source={ProductIcon} />
                        </div>
                      )}
                      <div className="tidysync-duplicate-product-body">
                        <strong>{p.title}</strong>
                        <span>
                          {p.vendor ?? "No vendor"} · {p.variantCount} variant
                          {p.variantCount === 1 ? "" : "s"}
                        </span>
                      </div>
                      {isPrimary && <span className="tidysync-duplicate-primary-tag">Primary</span>}
                    </button>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
