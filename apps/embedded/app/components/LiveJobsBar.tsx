"use client";

import { ProgressBar, Badge } from "@shopify/polaris";

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
}

export function LiveJobsBar({ jobs }: { jobs: LiveJob[] }) {
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
          return (
            <div key={job.id} className="tidysync-live-bar-item">
              <div className="tidysync-live-bar-item-top">
                <span className="tidysync-live-bar-type">{job.type.replace(/_/g, " ")}</span>
                <span className="tidysync-live-bar-label">{label}</span>
                <span className="tidysync-live-bar-pct">
                  {showPct ? `${pct}%` : job.status}
                </span>
              </div>
              <ProgressBar
                progress={showPct ? pct : undefined}
                size="small"
                tone={job.status === "FAILED" ? "critical" : "primary"}
              />
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
