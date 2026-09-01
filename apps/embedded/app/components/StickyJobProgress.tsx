"use client";

import { ProgressBar, Text } from "@shopify/polaris";
import type { ImportProgressState, JobProgressKind } from "./ImportProgressLoader";

const KIND_LABELS: Record<JobProgressKind, { active: string; done: string }> = {
  import: {
    active: "Importing to Shopify",
    done: "Import finished",
  },
  export: {
    active: "Building export file",
    done: "Export ready to download",
  },
  bulk: {
    active: "Applying bulk changes",
    done: "Bulk changes applied",
  },
  agent: {
    active: "Agent is working",
    done: "Agent mission complete",
  },
  backup: {
    active: "Creating backup",
    done: "Backup created",
  },
};

function formatCount(n: number) {
  return n.toLocaleString();
}

export function StickyJobProgress({ state }: { state: ImportProgressState }) {
  const kind = state.kind ?? "import";
  const labels = KIND_LABELS[kind];
  const rowTotal = state.rowCount ?? 0;
  const success = state.successCount ?? 0;
  const failed = state.failedCount ?? 0;
  const hasCounts = rowTotal > 0;
  const pct =
    state.phase === "complete"
      ? 100
      : hasCounts
        ? Math.min(100, Math.round((success / rowTotal) * 100))
        : state.phase === "importing"
          ? undefined
          : 0;

  const title =
    state.phase === "complete"
      ? labels.done
      : state.phase === "failed"
        ? "Job failed"
        : labels.active;

  const detail = (() => {
    if (state.message) return state.message;
    if (state.phase === "importing" && hasCounts) {
      return `${formatCount(success)} of ${formatCount(rowTotal)} processed`;
    }
    if (state.phase === "importing" && kind === "agent") {
      return "Planning and executing your mission in the background…";
    }
    if (state.phase === "importing" && kind === "export") {
      return "Pulling catalog data and packaging your file…";
    }
    if (state.phase === "importing" && kind === "backup") {
      return "Snapshotting products to secure storage…";
    }
    if (state.phase === "complete" && hasCounts) {
      return `${formatCount(success)} ok · ${formatCount(failed)} failed`;
    }
    if (state.phase === "complete" && kind === "export") {
      return "Download your file below or from Jobs.";
    }
    return state.fileName ?? state.label ?? "";
  })();

  return (
    <div
      className={`tidysync-sticky-progress is-${kind} is-${state.phase}`}
      role="status"
      aria-live="polite"
    >
      <div className="tidysync-sticky-progress-pulse" aria-hidden="true" />
      <div className="tidysync-sticky-progress-inner">
        <div className="tidysync-sticky-progress-copy">
          <Text as="p" variant="bodyMd" fontWeight="semibold">
            {title}
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            {detail}
          </Text>
        </div>
        {state.phase === "importing" && (
          <div className="tidysync-sticky-progress-bar-wrap">
            <ProgressBar
              progress={pct}
              size="small"
              tone={kind === "agent" ? "highlight" : "primary"}
            />
          </div>
        )}
        {state.phase === "complete" && (
          <span className="tidysync-sticky-progress-done" aria-hidden="true">✓</span>
        )}
        {state.phase === "failed" && (
          <span className="tidysync-sticky-progress-fail" aria-hidden="true">!</span>
        )}
      </div>
    </div>
  );
}
