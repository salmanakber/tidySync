"use client";

import { Text } from "@shopify/polaris";

export type ImportLoaderPhase =
  | "uploading"
  | "analyzing"
  | "mapping"
  | "importing"
  | "complete"
  | "failed";

export interface ImportProgressState {
  phase: ImportLoaderPhase;
  fileName?: string;
  jobId?: string;
  rowCount?: number;
  processedCount?: number;
  successCount?: number;
  failedCount?: number;
  message?: string;
}

const PHASE_LABELS: Record<ImportLoaderPhase, string> = {
  uploading: "Uploading file",
  analyzing: "Scanning catalog",
  mapping: "Matching columns with AI",
  importing: "Importing products",
  complete: "Import complete",
  failed: "Import failed",
};

function formatCount(n: number) {
  return n.toLocaleString();
}

export function ImportProgressLoader({ state }: { state: ImportProgressState }) {
  const pct = (() => {
    if (state.phase === "importing" && state.rowCount && state.rowCount > 0) {
      return Math.min(100, Math.round(((state.processedCount ?? 0) / state.rowCount) * 100));
    }
    if (state.phase === "analyzing" && state.rowCount && state.rowCount > 0) {
      return 100;
    }
    if (state.phase === "mapping") return 85;
    if (state.phase === "uploading") return 35;
    if (state.phase === "complete") return 100;
    return 0;
  })();

  const headline = (() => {
    if (state.phase === "importing" && state.rowCount) {
      return `${formatCount(state.processedCount ?? 0)} of ${formatCount(state.rowCount)} updated`;
    }
    if (state.phase === "analyzing" && state.rowCount) {
      return `${formatCount(state.rowCount)} products found`;
    }
    return PHASE_LABELS[state.phase];
  })();

  return (
    <div className="tidysync-import-loader" role="status" aria-live="polite">
      <div className="tidysync-import-loader-orbit">
        <div className="tidysync-import-loader-ring" />
        <div className="tidysync-import-loader-ring tidysync-import-loader-ring--delay" />
        <div className="tidysync-import-loader-core">
          <span className="tidysync-import-loader-pct">{pct}%</span>
        </div>
      </div>

      <div className="tidysync-import-loader-copy">
        <Text as="p" variant="headingMd" alignment="center">
          {headline}
        </Text>
        <Text as="p" variant="bodySm" tone="subdued" alignment="center">
          {state.message ?? PHASE_LABELS[state.phase]}
        </Text>
        {state.fileName && (
          <Text as="p" variant="bodySm" tone="subdued" alignment="center">
            {state.fileName}
          </Text>
        )}
      </div>

      {state.phase === "importing" && (
        <div className="tidysync-import-loader-stats">
          <div className="tidysync-import-stat is-success">
            <span className="tidysync-import-stat-value">{formatCount(state.successCount ?? 0)}</span>
            <span className="tidysync-import-stat-label">Imported</span>
          </div>
          <div className="tidysync-import-stat is-failed">
            <span className="tidysync-import-stat-value">{formatCount(state.failedCount ?? 0)}</span>
            <span className="tidysync-import-stat-label">Failed</span>
          </div>
        </div>
      )}

      <div className="tidysync-import-loader-track">
        <div className="tidysync-import-loader-bar" style={{ width: `${pct}%` }} />
      </div>

      <div className="tidysync-import-loader-steps">
        {(["uploading", "analyzing", "mapping", "importing"] as ImportLoaderPhase[]).map((step) => {
          const active =
            state.phase === step ||
            (state.phase === "complete" && step === "importing") ||
            (["mapping", "importing", "complete"].includes(state.phase) &&
              ["uploading", "analyzing"].includes(step)) ||
            (["importing", "complete"].includes(state.phase) && step === "mapping");
          const done =
            state.phase === "complete" ||
            (state.phase === "importing" && step !== "importing") ||
            (state.phase === "mapping" && ["uploading", "analyzing"].includes(step)) ||
            (state.phase === "analyzing" && step === "uploading");
          return (
            <span
              key={step}
              className={`tidysync-import-step${active ? " is-active" : ""}${done ? " is-done" : ""}`}
            >
              {PHASE_LABELS[step]}
            </span>
          );
        })}
      </div>
    </div>
  );
}
