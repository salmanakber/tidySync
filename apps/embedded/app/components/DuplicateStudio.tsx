"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Icon, Spinner } from "@shopify/polaris";
import { ProductIcon } from "@shopify/polaris-icons";
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
  const [merging, setMerging] = useState(false);
  const [primaryByGroup, setPrimaryByGroup] = useState<Record<string, string>>({});
  const [errorAlert, setErrorAlert] = useState<ReturnType<typeof alertFromError> | null>(null);
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);

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
      for (const g of data.findDuplicateProducts) {
        defaults[g.id] = g.products[0]?.id ?? "";
      }
      setPrimaryByGroup(defaults);
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

    setMerging(true);
    setErrorAlert(null);
    try {
      const data = await gqlRequest<{ previewMergeProducts: { id: string } }>(
        MUTATIONS.previewMergeProducts,
        { primaryProductId: primaryId, duplicateProductIds: duplicateIds },
        shop,
      );
      setPreviewJobId(data.previewMergeProducts.id);
      if (onApprove) {
        onApprove(data.previewMergeProducts.id);
      }
    } catch (e) {
      setErrorAlert(alertFromError(e, onUpgrade));
    } finally {
      setMerging(false);
    }
  };

  const totalDuplicates = groups.reduce((sum, g) => sum + g.products.length - 1, 0);

  return (
    <div className="tidysync-duplicates">
      <header className="tidysync-duplicates-hero">
        <div>
          <span className="tidysync-duplicates-badge">
            <Icon source={ProductIcon} />
            Duplicate finder
          </span>
          <h2>Find & merge duplicate products</h2>
          <p>
            Detect listings with the same title, handle, or vendor match. Pick the primary product —
            variants merge in and duplicates are removed safely.
          </p>
        </div>
        <div className="tidysync-duplicates-stats">
          <strong>{groups.length}</strong>
          <span>duplicate groups</span>
          <strong>{totalDuplicates}</strong>
          <span>extra listings</span>
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

      <div className="tidysync-duplicates-toolbar">
        <Button onClick={() => load()} disabled={loading}>Scan again</Button>
      </div>

      {loading ? (
        <div className="tidysync-duplicates-loading">
          <Spinner />
          <p>Scanning your catalog for duplicates…</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="tidysync-duplicates-empty">
          <h3>No duplicate groups found</h3>
          <p>Your catalog looks clean — or try scanning again after a large import.</p>
        </div>
      ) : (
        <div className="tidysync-duplicates-list">
          {groups.map((group) => (
            <article key={group.id} className="tidysync-duplicate-group">
              <header>
                <div>
                  <strong>{group.reason}</strong>
                  <span>{group.products.length} listings · {group.matchKey.slice(0, 60)}</span>
                </div>
                <Button
                  variant="primary"
                  onClick={() => mergeGroup(group)}
                  loading={merging}
                  disabled={merging}
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
                        <img src={p.imageUrl} alt="" className="tidysync-duplicate-thumb" />
                      ) : (
                        <div className="tidysync-duplicate-thumb is-empty">
                          <Icon source={ProductIcon} />
                        </div>
                      )}
                      <div>
                        <strong>{p.title}</strong>
                        <span>
                          {p.vendor ?? "No vendor"} · {p.variantCount} variant(s)
                        </span>
                        {isPrimary && <span className="tidysync-duplicate-primary-tag">Primary</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="tidysync-duplicate-hint">
                Click a product to set it as primary. Others will merge into it.
              </p>
            </article>
          ))}
        </div>
      )}

      {previewJobId && (
        <p className="tidysync-duplicates-preview-note">
          Merge preview created — confirm in the review modal to apply.
        </p>
      )}
    </div>
  );
}
