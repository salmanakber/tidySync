"use client";

import { useEffect, useState } from "react";
import { Banner, BlockStack, Text } from "@shopify/polaris";

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
}

export function DiffPreviewPanel({
  impactSummary,
  anomalies,
  steps = [],
  rows = [],
  failedItems = [],
  streamPlan = true,
  jobType,
  jobStatus,
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

  return (
    <BlockStack gap="400">
      {impactSummary && <Banner tone="info">{impactSummary}</Banner>}

      {anomalies?.map((a) => (
        <Banner key={a.message} tone={a.severity === "high" ? "critical" : "warning"}>
          {a.message}
        </Banner>
      ))}

      {steps.length > 0 && (
        <BlockStack gap="200">
          <Text as="h3" variant="headingSm">
            Mutation plan
          </Text>
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
        </BlockStack>
      )}

      {rows.length > 0 && (
        <BlockStack gap="200">
          <Text as="h3" variant="headingSm">
            Diff preview ({Math.min(rows.length, 50)} of {rows.length} changes)
          </Text>
          {rows.slice(0, 50).map((row, i) => (
            <div
              key={`${row.resourceTitle}-${row.field}-${i}`}
              className="tidysync-diff-row"
              style={{ animationDelay: `${i * 28}ms` }}
            >
              <Text as="p" variant="bodySm" fontWeight="semibold">
                {row.resourceTitle ?? "Item"} · {row.field}
              </Text>
              <Text as="p" variant="bodySm">
                <span className="tidysync-diff-before">{String(row.before ?? "—")}</span>
                {" → "}
                <span className="tidysync-diff-after">{String(row.after ?? "—")}</span>
              </Text>
            </div>
          ))}
        </BlockStack>
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
          ) : jobType === "AGENT_RUN" && impactSummary ? (
            <Banner tone="info">{impactSummary}</Banner>
          ) : jobType === "BACKUP" && jobStatus === "RUNNING" ? (
            <Banner tone="info">
              Your catalog snapshot is still running — check the progress bar at the top of the page.
            </Banner>
          ) : (
            <Banner tone="warning">
              I didn&apos;t find any product changes to preview for this job. Try something like &quot;Increase all
              prices by 10%&quot; or &quot;Polish thin product descriptions&quot; in the Agent tab.
            </Banner>
          )}
        </>
      )}
    </BlockStack>
  );
}
