"use client";

import { ProgressBar, Badge, Button } from "@shopify/polaris";

export interface LiveJob {
  id: string;
  type: string;
  status: string;
  rowCount: number;
  successCount: number;
  failedCount: number;
  fileName?: string | null;
  nlPrompt?: string | null;
  impactSummary?: string | null;
  errorSummary?: string | null;
  createdAt?: string | null;
  startedAt?: string | null;
}

function isLikelyStuck(job: LiveJob): boolean {
  const now = Date.now();
  if (job.status === "QUEUED" && job.createdAt) {
    return now - new Date(job.createdAt).getTime() > 20 * 60 * 1000;
  }
  if (job.status === "RUNNING") {
    const since = job.startedAt ?? job.createdAt;
    if (since) return now - new Date(since).getTime() > 45 * 60 * 1000;
  }
  return false;
}

export function LiveJobsBar({
  jobs,
  onCancel,
  cancelingId,
}: {
  jobs: LiveJob[];
  onCancel?: (jobId: string) => void;
  cancelingId?: string | null;
}) {
  const active = jobs.filter((j) => j.status === "RUNNING" || j.status === "QUEUED");
  if (active.length === 0) return null;

  return (
    <div className="tidysync-live-bar">
      <div className="tidysync-live-bar-head">
        <span className="tidysync-live-bar-title">Live progress</span>
        <Badge tone="info">{`${active.length} active`}</Badge>
      </div>
      <div className="tidysync-live-bar-list">
        {active.map((job) => {
          const label =
            job.fileName ??
            job.nlPrompt?.slice(0, 48) ??
            job.impactSummary?.slice(0, 48) ??
            job.type;
          const pct =
            job.rowCount > 0 ? Math.min(100, Math.round((job.successCount / job.rowCount) * 100)) : 0;
          const showPct = job.rowCount > 0;
          const stuck = isLikelyStuck(job);

          return (
            <div key={job.id} className={`tidysync-live-bar-item${stuck ? " is-stuck" : ""}`}>
              <div className="tidysync-live-bar-item-top">
                <span className="tidysync-live-bar-type">{job.type.replace(/_/g, " ")}</span>
                <span className="tidysync-live-bar-label">{label}</span>
                <span className="tidysync-live-bar-pct">
                  {showPct ? `${pct}%` : job.status}
                </span>
                {onCancel && (
                  <Button
                    size="slim"
                    onClick={() => onCancel(job.id)}
                    loading={cancelingId === job.id}
                    disabled={cancelingId != null && cancelingId !== job.id}
                  >
                    Cancel
                  </Button>
                )}
              </div>
              <ProgressBar
                progress={showPct ? pct : undefined}
                size="small"
                tone={stuck ? "critical" : job.status === "FAILED" ? "critical" : "primary"}
              />
              {stuck && (
                <span className="tidysync-live-bar-stuck">
                  Taking longer than expected — worker or Redis may be down. Cancel and retry after
                  checking your server.
                </span>
              )}
              {job.rowCount > 0 && (
                <span className="tidysync-live-bar-meta">
                  {job.successCount.toLocaleString()} ok · {job.failedCount} failed ·{" "}
                  {job.rowCount.toLocaleString()} total
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
