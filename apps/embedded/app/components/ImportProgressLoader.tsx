"use client";

import { Text } from "@shopify/polaris";

export type ImportLoaderPhase =
  | "uploading"
  | "analyzing"
  | "mapping"
  | "importing"
  | "complete"
  | "failed";

export type JobProgressKind = "import" | "export" | "bulk" | "agent" | "backup";

export interface ImportProgressState {
  phase: ImportLoaderPhase;
  fileName?: string;
  jobId?: string;
  rowCount?: number;
  processedCount?: number;
  successCount?: number;
  failedCount?: number;
  message?: string;
  kind?: JobProgressKind;
  label?: string;
}

const PHASE_LABELS: Record<ImportLoaderPhase, string> = {
  uploading: "Uploading",
  analyzing: "Reading file",
  mapping: "Column mapping",
  importing: "Writing to Shopify",
  complete: "Done",
  failed: "Failed",
};

function formatCount(n: number) {
  return n.toLocaleString();
}

export function ImportProgressLoader({ state }: { state: ImportProgressState }) {
  const rowTotal = state.rowCount ?? 0;
  const success = state.successCount ?? 0;
  const failed = state.failedCount ?? 0;
  const hasRealProgress = state.phase === "importing" && rowTotal > 0;

  const pct = (() => {
    if (state.phase === "complete") return 100;
    if (state.phase === "failed") return 0;
    if (hasRealProgress) return Math.min(100, Math.round((success / rowTotal) * 100));
    return null;
  })();

  const headline = (() => {
    if (state.phase === "importing" && rowTotal > 0) {
      return `${formatCount(success)} of ${formatCount(rowTotal)} in Shopify`;
    }
    if (state.phase === "importing") {
      return "Working on your catalog…";
    }
    if (state.phase === "analyzing" && rowTotal > 0) {
      return `${formatCount(rowTotal)} rows detected`;
    }
    if (state.phase === "complete") {
      return failed > 0
        ? `${formatCount(success)} added · ${formatCount(failed)} failed`
        : `${formatCount(success)} products ready in Shopify`;
    }
    return PHASE_LABELS[state.phase];
  })();

  const showOrbitPct = pct !== null;

  return (
    <div className="tidysync-import-loader tidysync-import-loader--calm" role="status" aria-live="polite">
      <div className="tidysync-import-loader-orbit">
        <div className="tidysync-import-loader-ring" />
        <div className="tidysync-import-loader-ring tidysync-import-loader-ring--delay" />
        <div className="tidysync-import-loader-core">
          {showOrbitPct ? (
            <span className="tidysync-import-loader-pct">{pct}%</span>
          ) : (
            <span className="tidysync-import-loader-dot" aria-hidden="true" />
          )}
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

      {(state.phase === "importing" || state.phase === "complete") && (
        <div className="tidysync-import-loader-stats">
          <div className="tidysync-import-stat is-success">
            <span className="tidysync-import-stat-value">{formatCount(success)}</span>
            <span className="tidysync-import-stat-label">In Shopify</span>
          </div>
          <div className="tidysync-import-stat is-failed">
            <span className="tidysync-import-stat-value">{formatCount(failed)}</span>
            <span className="tidysync-import-stat-label">Failed</span>
          </div>
        </div>
      )}

      <div className="tidysync-import-loader-track">
        {pct !== null ? (
          <div className="tidysync-import-loader-bar" style={{ width: `${pct}%` }} />
        ) : (
          <div className="tidysync-import-loader-bar tidysync-import-loader-bar--pulse" />
        )}
      </div>

      <div className="tidysync-import-loader-steps tidysync-import-loader-steps--compact">
        {(["uploading", "analyzing", "mapping", "importing"] as ImportLoaderPhase[]).map((step) => {
          const active = state.phase === step;
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
