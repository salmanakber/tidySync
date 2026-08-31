"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Icon, Spinner } from "@shopify/polaris";
import { AutomationIcon, MagicIcon, AlertTriangleIcon, ProductIcon } from "@shopify/polaris-icons";
import { gqlRequest, QUERIES, MUTATIONS } from "../lib/graphql";
import { alertFromError } from "../lib/graphql-errors";
import { AppAlert } from "./AppAlert";
import { DiffPreviewPanel } from "./DiffPreviewPanel";

interface AgentStatus {
  enabled: boolean;
  runsUsed: number;
  runsLimit: number;
  runsRemaining: number;
}

interface StoreScanIssue {
  id: string;
  severity: string;
  category: string;
  title: string;
  detail: string;
  productId?: string;
  productTitle?: string;
  score?: number;
}

interface StoreScanResult {
  productCount: number;
  overallHealthScore: number;
  seoScore: number;
  catalogScore: number;
  issues: StoreScanIssue[];
  summary: string;
}

interface AgentStep {
  id: string;
  label: string;
  status: string;
  detail?: string;
}

interface AgentJob {
  id: string;
  type: string;
  status: string;
  rowCount?: number;
  nlPrompt?: string;
  impactSummary?: string;
  errorSummary?: string;
  mutationPlan?: {
    steps?: AgentStep[];
    phase?: string;
    intent?: string;
    previewJobId?: string;
    suggestedActions?: string[];
  };
  diffPreview?: StoreScanResult & {
    rows?: Array<{
      resourceTitle?: string;
      field: string;
      before: string | number | null;
      after: string | number | null;
    }>;
  };
}

interface AgentStudioProps {
  shop: string;
  onApprove?: (jobId: string) => void;
  onUpgrade?: () => void;
  onJobStarted?: (jobId: string, meta?: { isImport?: boolean; rowCount?: number }) => void;
}

const QUICK_ACTIONS = [
  {
    id: "fix",
    label: "Fix my store",
    desc: "Deep catalog scan (1 AI credit)",
    mode: "scan" as const,
    icon: AlertTriangleIcon,
    tone: "warn",
  },
  {
    id: "seo",
    label: "Improve product SEO",
    desc: "Agent mission · uses 1 agent run",
    prompt: "Improve SEO and meta descriptions for products missing SEO titles",
    mode: "agent" as const,
    icon: ProductIcon,
    tone: "seo",
  },
  {
    id: "backup",
    label: "Snapshot catalog",
    desc: "Agent mission · vault backup",
    prompt: "Create a full catalog backup before I make changes",
    mode: "agent" as const,
    icon: MagicIcon,
    tone: "vault",
  },
  {
    id: "price",
    label: "Bulk price change",
    desc: "Agent mission · bulk edit plan",
    prompt: "Increase all variant prices by 10%",
    mode: "agent" as const,
    icon: AutomationIcon,
    tone: "edit",
  },
];

function scoreRingClass(score: number): string {
  if (score >= 75) return "is-good";
  if (score >= 50) return "is-mid";
  return "is-low";
}

function severityClass(severity: string): string {
  if (severity === "critical") return "is-critical";
  if (severity === "warning") return "is-warning";
  return "is-info";
}

function isScanResult(v: unknown): v is StoreScanResult {
  return Boolean(v && typeof v === "object" && "overallHealthScore" in (v as object));
}

export function AgentStudio({ shop, onApprove, onUpgrade, onJobStarted }: AgentStudioProps) {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scan, setScan] = useState<StoreScanResult | null>(null);
  const [agentJob, setAgentJob] = useState<AgentJob | null>(null);
  const [previewJob, setPreviewJob] = useState<AgentJob | null>(null);
  const [message, setMessage] = useState("");
  const [intent, setIntent] = useState("");
  const [suggestedActions, setSuggestedActions] = useState<string[]>([]);
  const [errorAlert, setErrorAlert] = useState<ReturnType<typeof alertFromError> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const data = await gqlRequest<{ agentStatus: AgentStatus }>(QUERIES.agentStatus, {}, shop);
      setStatus(data.agentStatus);
    } catch {
      /* optional */
    }
  }, [shop]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const clearPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => () => clearPoll(), []);

  const pollAgentJob = (jobId: string) => {
    clearPoll();
    pollRef.current = setInterval(async () => {
      try {
        const data = await gqlRequest<{ job: AgentJob }>(QUERIES.job, { id: jobId }, shop);
        const j = data.job;
        if (!j) return;
        setAgentJob(j);

        if (j.status === "COMPLETED" || j.status === "FAILED") {
          clearPoll();
          setLoading(false);
          setMessage(j.impactSummary ?? j.errorSummary ?? "Mission complete");
          setIntent(j.mutationPlan?.intent ?? "AGENT_MISSION");
          setSuggestedActions(j.mutationPlan?.suggestedActions ?? []);

          if (j.diffPreview && isScanResult(j.diffPreview)) {
            setScan(j.diffPreview);
          }

          const previewId = j.mutationPlan?.previewJobId;
          if (previewId) {
            const preview = await gqlRequest<{ job: AgentJob }>(QUERIES.job, { id: previewId }, shop);
            setPreviewJob(preview.job);
            if (preview.job?.type === "BACKUP" && onJobStarted) {
              onJobStarted(previewId, { rowCount: preview.job.rowCount });
            }
          }
          void loadStatus();
        }
      } catch {
        clearPoll();
        setLoading(false);
      }
    }, 1800);
  };

  const runScan = async () => {
    setScanLoading(true);
    setErrorAlert(null);
    setScan(null);
    try {
      const data = await gqlRequest<{ scanStore: StoreScanResult }>(MUTATIONS.scanStore, {}, shop);
      setScan(data.scanStore);
      setMessage(data.scanStore.summary);
      setIntent("STORE_SCAN");
    } catch (e) {
      setErrorAlert(alertFromError(e, onUpgrade));
    } finally {
      setScanLoading(false);
    }
  };

  const runAgentMission = async (text?: string) => {
    const value = (text ?? prompt).trim();
    if (!value) return;
    setPrompt(value);
    setLoading(true);
    setErrorAlert(null);
    setScan(null);
    setPreviewJob(null);
    setAgentJob(null);
    setMessage("Agent is thinking…");

    try {
      const data = await gqlRequest<{
        runAgent: {
          intent: string;
          message: string;
          agentJobId?: string;
          previewJob?: AgentJob;
          suggestedActions: string[];
        };
      }>(MUTATIONS.runAgent, { prompt: value }, shop);

      setIntent(data.runAgent.intent);
      setMessage(data.runAgent.message);
      setSuggestedActions(data.runAgent.suggestedActions);

      const jobId = data.runAgent.agentJobId ?? data.runAgent.previewJob?.id;
      if (jobId) {
        setAgentJob(data.runAgent.previewJob ?? { id: jobId, type: "AGENT_RUN", status: "QUEUED" });
        if (onJobStarted) onJobStarted(jobId);
        pollAgentJob(jobId);
      } else {
        setLoading(false);
      }
      void loadStatus();
    } catch (e) {
      setErrorAlert(alertFromError(e, onUpgrade));
      setLoading(false);
    }
  };

  const handleQuickAction = (action: typeof QUICK_ACTIONS[number]) => {
    if (action.mode === "scan") {
      void runScan();
    } else {
      void runAgentMission(action.prompt);
    }
  };

  const steps = agentJob?.mutationPlan?.steps ?? [];
  const runsPct =
    status && status.runsLimit > 0
      ? Math.round((status.runsRemaining / status.runsLimit) * 100)
      : 0;

  const filteredIssues = scan?.issues ?? [];

  return (
    <div className={`tidysync-agent-pro${loading || scanLoading ? " is-running" : ""}`}>
      <header className="tidysync-agent-pro-hero">
        <div className="tidysync-agent-pro-hero-bg" aria-hidden="true" />
        <div className="tidysync-agent-pro-hero-inner">
          <div className="tidysync-agent-pro-hero-copy">
            <div className="tidysync-agent-pro-badge-row">
              <span className="tidysync-agent-pro-badge">
                <Icon source={AutomationIcon} />
                Catalog agent
              </span>
              {status && (
                <span className={`tidysync-agent-pro-status${status.enabled ? "" : " is-locked"}`}>
                  {status.enabled ? "Mission runs available" : "Upgrade for agent missions"}
                </span>
              )}
            </div>
            <h2 className="tidysync-agent-pro-title">Deep missions on your catalog</h2>
            <p className="tidysync-agent-pro-sub">
              Scans use <strong>1 AI credit</strong>. Full agent missions use <strong>1 agent run</strong> and execute in the background via Redis — multi-step planning, then review before anything goes live.
            </p>
          </div>
          {status && (
            <div className="tidysync-agent-pro-usage">
              <div className="tidysync-agent-pro-usage-ring" data-pct={runsPct}>
                <svg viewBox="0 0 120 120" className="tidysync-agent-pro-usage-svg">
                  <circle cx="60" cy="60" r="52" className="tidysync-agent-pro-usage-track" />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    className="tidysync-agent-pro-usage-fill"
                    strokeDasharray={`${(runsPct / 100) * 326} 326`}
                  />
                </svg>
                <div className="tidysync-agent-pro-usage-label">
                  <strong>{status.runsRemaining}</strong>
                  <span>agent runs</span>
                </div>
              </div>
              <div className="tidysync-agent-pro-usage-meta">
                <span>{status.runsUsed} used</span>
                <span>{status.runsLimit} / month</span>
              </div>
            </div>
          )}
        </div>
      </header>

      {errorAlert && (
        <div className="tidysync-agent-pro-alert">
          <AppAlert
            tone={errorAlert.tone}
            title={errorAlert.title}
            message={errorAlert.message}
            primaryAction={errorAlert.primaryAction}
            onDismiss={() => setErrorAlert(null)}
          />
        </div>
      )}

      <section className="tidysync-agent-pro-actions">
        <h3 className="tidysync-agent-pro-section-title">Quick missions</h3>
        <div className="tidysync-agent-pro-action-grid">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              className={`tidysync-agent-pro-action is-${action.tone}`}
              disabled={loading || scanLoading}
              onClick={() => handleQuickAction(action)}
            >
              <span className="tidysync-agent-pro-action-icon">
                <Icon source={action.icon} />
              </span>
              <span className="tidysync-agent-pro-action-label">{action.label}</span>
              <span className="tidysync-agent-pro-action-desc">{action.desc}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="tidysync-agent-pro-composer">
        <label className="tidysync-agent-pro-composer-label" htmlFor="agent-prompt">
          Agent command (multi-step mission)
        </label>
        <div className="tidysync-agent-pro-composer-box">
          <textarea
            id="agent-prompt"
            className="tidysync-agent-pro-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe a complex mission — e.g. Scan my store, fix SEO on worst products, then snapshot the catalog"
            rows={4}
            disabled={loading}
          />
          <div className="tidysync-agent-pro-composer-footer">
            <span className="tidysync-agent-pro-hint">Uses 1 agent run · Runs in background · Approve changes before apply</span>
            <Button variant="primary" onClick={() => runAgentMission()} loading={loading} disabled={!prompt.trim()}>
              Run agent mission
            </Button>
          </div>
        </div>
      </section>

      {(loading || scanLoading) && (
        <div className="tidysync-agent-thinking-panel">
          <div className="tidysync-agent-thinking-head">
            <div className="tidysync-agent-thinking-orbs" aria-hidden="true">
              <span /><span /><span />
            </div>
            <div>
              <strong>{scanLoading ? "Scanning catalog…" : "Agent is working…"}</strong>
              <p>{scanLoading ? "Using 1 AI credit · analyzing products in Shopify" : message}</p>
            </div>
            <Spinner size="small" />
          </div>
          {steps.length > 0 && (
            <ul className="tidysync-agent-step-timeline">
              {steps.map((step) => (
                <li key={step.id} className={`tidysync-agent-step is-${step.status}`}>
                  <span className="tidysync-agent-step-dot" />
                  <div>
                    <strong>{step.label}</strong>
                    {step.detail && <span>{step.detail}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {scan && !scanLoading && (
        <section className="tidysync-agent-scan-v2">
          <div className="tidysync-agent-scan-v2-header">
            <div>
              <h3>Store intelligence</h3>
              <p>{scan.summary}</p>
            </div>
            <div className="tidysync-agent-scan-v2-rings">
              {[
                { label: "Health", value: scan.overallHealthScore },
                { label: "SEO", value: scan.seoScore },
                { label: "Catalog", value: scan.catalogScore },
              ].map((m) => (
                <div key={m.label} className={`tidysync-agent-ring ${scoreRingClass(m.value)}`}>
                  <span className="tidysync-agent-ring-value">{m.value}</span>
                  <span className="tidysync-agent-ring-label">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="tidysync-agent-scan-v2-stats">
            <span>{scan.productCount} products scanned</span>
            <span>{scan.issues.length} issues found</span>
          </div>
          <div className="tidysync-agent-issue-grid">
            {filteredIssues.slice(0, 30).map((issue) => (
              <article key={issue.id} className={`tidysync-agent-issue-v2 ${severityClass(issue.severity)}`}>
                <header>
                  <span className="tidysync-agent-issue-cat">{issue.category}</span>
                  <span className={`tidysync-agent-issue-sev ${severityClass(issue.severity)}`}>
                    {issue.severity}
                  </span>
                </header>
                <h4>{issue.title}</h4>
                <p>{issue.detail}</p>
                {issue.productTitle && <footer>{issue.productTitle}</footer>}
              </article>
            ))}
          </div>
        </section>
      )}

      {!scanLoading && message && !loading && intent && !scan && (
        <div className="tidysync-agent-pro-result-banner">
          <span className="tidysync-agent-pro-intent">{intent.replace(/_/g, " ")}</span>
          <p>{message}</p>
        </div>
      )}

      {suggestedActions.length > 0 && !loading && (
        <div className="tidysync-agent-pro-steps">
          <h4>Suggested next steps</h4>
          <ol>
            {suggestedActions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ol>
        </div>
      )}

      {previewJob?.diffPreview?.rows && previewJob.diffPreview.rows.length > 0 && (
        <div className="tidysync-agent-pro-preview">
          <h4>Proposed Shopify changes</h4>
          <p className="tidysync-agent-pro-preview-note">Nothing is live until you approve.</p>
          <DiffPreviewPanel
            rows={previewJob.diffPreview.rows}
            impactSummary={previewJob.impactSummary}
          />
          {onApprove && previewJob.status === "PREVIEW" && (
            <div className="tidysync-agent-pro-preview-cta">
              <Button variant="primary" onClick={() => onApprove(previewJob.id)}>
                Approve and apply to Shopify
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
