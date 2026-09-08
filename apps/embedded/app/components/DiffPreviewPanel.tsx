"use client";

import { useEffect, useState } from "react";
import { Banner, Text } from "@shopify/polaris";

interface DiffRow {
  resourceTitle?: string;
  field: string;
  before: string | number | null;
  after: string | number | null;
}

interface DiffPreviewProps {
  impactSummary?: string;
  anomalies?: Array<{ severity: string; message: string }>;
  steps?: Array<{ description: string }>;
  rows?: DiffRow[];
  failedItems?: Array<{ rowIndex: number; errorMessage?: string; autoFixSuggestion?: string }>;
  streamPlan?: boolean;
  jobType?: string;
  jobStatus?: string;
  nlPrompt?: string | null;
}

function friendlyField(field: string): string {
  const map: Record<string, string> = {
    title: "Title",
    "variants.price": "Price",
    "variants.compareAtPrice": "Compare-at price",
    "variants.sku": "SKU",
    "variants.barcode": "Barcode",
    descriptionHtml: "Description",
    tags: "Tags",
    vendor: "Vendor",
    productType: "Product type",
    seo: "SEO",
  };
  return map[field] ?? field.replace(/^variants\./, "").replace(/([A-Z])/g, " $1");
}

export function DiffPreviewPanel({
  impactSummary,
  anomalies = [],
  steps = [],
  rows = [],
  failedItems = [],
  streamPlan = true,
  jobType,
  jobStatus,
  nlPrompt,
}: DiffPreviewProps) {
  const [visibleSteps, setVisibleSteps] = useState(streamPlan ? 0 : steps.length);

  useEffect(() => {
    if (!streamPlan || steps.length === 0) {
      setVisibleSteps(steps.length);
      return;
    }
    setVisibleSteps(0);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setVisibleSteps(i);
      if (i >= steps.length) window.clearInterval(id);
    }, 220);
    return () => window.clearInterval(id);
  }, [steps, streamPlan]);

  const changeCount = rows.length;

  return (
    <div className="tidysync-diff-panel">
      {(impactSummary || nlPrompt) && (
        <div className="tidysync-diff-hero">
          {nlPrompt ? (
            <p className="tidysync-diff-hero-ask">
              <span className="tidysync-diff-hero-label">You asked</span>
              {nlPrompt}
            </p>
          ) : null}
          {impactSummary ? <p className="tidysync-diff-hero-summary">{impactSummary}</p> : null}
          {changeCount > 0 ? (
            <div className="tidysync-diff-hero-meta">
              <span className="tidysync-diff-pill">{changeCount} change{changeCount === 1 ? "" : "s"}</span>
              <span className="tidysync-diff-pill is-safe">Nothing live until you confirm</span>
            </div>
          ) : null}
        </div>
      )}

      {anomalies.map((a) => (
        <Banner key={a.message} tone={a.severity === "high" ? "critical" : "warning"}>
          {a.message}
        </Banner>
      ))}

      {steps.length > 0 && (
        <section className="tidysync-diff-section">
          <h3 className="tidysync-diff-section-title">Here&apos;s what I&apos;ll do</h3>
          <div className="tidysync-diff-steps">
            {steps.slice(0, visibleSteps).map((step, i) => (
              <div
                key={`${step.description}-${i}`}
                className="tidysync-plan-step"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="tidysync-plan-step-num">{i + 1}</div>
                <Text as="p" variant="bodyMd">
                  {step.description}
                </Text>
              </div>
            ))}
            {streamPlan && visibleSteps < steps.length && (
              <div className="tidysync-generating-line" style={{ width: "70%" }} />
            )}
          </div>
        </section>
      )}

      {rows.length > 0 && (
        <section className="tidysync-diff-section">
          <div className="tidysync-diff-section-head">
            <h3 className="tidysync-diff-section-title">Preview changes</h3>
            <span className="tidysync-diff-count">
              Showing {Math.min(rows.length, 50)} of {rows.length}
            </span>
          </div>
          <div className="tidysync-diff-list">
            {rows.slice(0, 50).map((row, i) => (
              <div
                key={`${row.resourceTitle}-${row.field}-${i}`}
                className="tidysync-diff-row"
                style={{ animationDelay: `${i * 28}ms` }}
              >
                <div className="tidysync-diff-row-top">
                  <span className="tidysync-diff-product">{row.resourceTitle ?? "Item"}</span>
                  <span className="tidysync-diff-field">{friendlyField(row.field)}</span>
                </div>
                <div className="tidysync-diff-values">
                  <span className="tidysync-diff-before">{String(row.before ?? "—")}</span>
                  <span className="tidysync-diff-arrow" aria-hidden="true">
                    →
                  </span>
                  <span className="tidysync-diff-after">{String(row.after ?? "—")}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {failedItems.map((item) => (
        <Banner key={item.rowIndex} tone="warning">
          Row {item.rowIndex + 1}: {item.errorMessage}
          {item.autoFixSuggestion ? ` — Suggestion: ${item.autoFixSuggestion}` : ""}
        </Banner>
      ))}

      {steps.length === 0 && rows.length === 0 && (
        <>
          {jobType === "BACKUP" && jobStatus === "COMPLETED" ? (
            <Banner tone="success">
              Your catalog snapshot finished successfully. Open the Backups tab to view, download, or restore this
              snapshot anytime.
            </Banner>
          ) : jobType === "IMPORT" && jobStatus === "MAPPING" ? (
            <Banner tone="info">
              This import is waiting for column mapping. Open <strong>Import</strong> or click the job again to map
              spreadsheet columns to Shopify fields before preview.
            </Banner>
          ) : jobType === "IMPORT" && jobStatus === "PREVIEW" ? (
            <Banner tone="warning">
              Import preview is empty — check your column mapping and required fields (title, price), then preview
              again.
            </Banner>
          ) : jobType === "IMPORT" && jobStatus === "COMPLETED" ? (
            <Banner tone="success">
              Import finished. Review success and failed row counts in the job summary above.
            </Banner>
          ) : jobType === "IMPORT" && (jobStatus === "RUNNING" || jobStatus === "QUEUED") ? (
            <Banner tone="info">
              Import is running — products are being created or updated in Shopify. Check the progress bar at the top.
            </Banner>
          ) : jobType === "AGENT_RUN" && impactSummary ? (
            <Banner tone="info">{impactSummary}</Banner>
          ) : jobType === "BACKUP" && jobStatus === "RUNNING" ? (
            <Banner tone="info">
              Your catalog snapshot is still running — check the progress bar at the top of the page.
            </Banner>
          ) : (
            <Banner tone="warning">
              I couldn&apos;t match that to any products yet. Try naming the product with @, or something like
              &quot;Increase all prices by 10%&quot;.
            </Banner>
          )}
        </>
      )}
    </div>
  );
}
