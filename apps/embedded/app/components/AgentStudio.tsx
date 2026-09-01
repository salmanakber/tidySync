"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Icon, Spinner } from "@shopify/polaris";
import { AutomationIcon, AlertTriangleIcon, ProductIcon } from "@shopify/polaris-icons";
import { gqlRequest, QUERIES, MUTATIONS } from "../lib/graphql";
import { alertFromError } from "../lib/graphql-errors";
import { AppAlert } from "./AppAlert";
import { DiffPreviewPanel } from "./DiffPreviewPanel";
import { ProductMentionTextarea, mentionValueToPrompt } from "./ProductMentionTextarea";

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
  onJobStarted?: (
    jobId: string,
    meta?: {
      isImport?: boolean;
      rowCount?: number;
      kind?: "import" | "export" | "bulk" | "agent" | "backup";
      label?: string;
    },
  ) => void;
  onFixPreview?: (job: AgentJob) => void;
  onGoToBackups?: () => void;
  /** When set, auto-runs the Improve product SEO mission once */
  autoStartSeo?: boolean;
  onAutoStartSeoConsumed?: () => void;
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
    id: "descriptions",
    label: "Polish thin descriptions",
    desc: "Agent mission · richer product copy",
    prompt: "Find products with thin descriptions and draft richer product copy I can review",
    mode: "agent" as const,
    icon: ProductIcon,
    tone: "seo",
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

export function AgentStudio({
  shop,
  onApprove,
  onUpgrade,
  onJobStarted,
  onFixPreview,
  onGoToBackups,
  autoStartSeo,
  onAutoStartSeoConsumed,
}: AgentStudioProps) {
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
  const [fixLoading, setFixLoading] = useState<string | null>(null);
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
    const raw = (text ?? prompt).trim();
    const value = text ?? prompt;
    if (!mentionValueToPrompt(raw || value).trim()) return;
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
          scan?: StoreScanResult | null;
        };
      }>(MUTATIONS.runAgent, { prompt: mentionValueToPrompt(value) }, shop);

      setIntent(data.runAgent.intent);
      setMessage(data.runAgent.message);
      setSuggestedActions(data.runAgent.suggestedActions);

      if (data.runAgent.scan && isScanResult(data.runAgent.scan)) {
        setScan(data.runAgent.scan);
      }

      const jobId = data.runAgent.agentJobId ?? data.runAgent.previewJob?.id;
      if (jobId) {
        setAgentJob(data.runAgent.previewJob ?? { id: jobId, type: "AGENT_RUN", status: "QUEUED" });
        if (onJobStarted) {
          onJobStarted(jobId, { kind: "agent", label: value.slice(0, 72) });
        }
        pollAgentJob(jobId);
        setLoading(false);
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

  const seoAutoStarted = useRef(false);
  useEffect(() => {
    if (!autoStartSeo) {
      seoAutoStarted.current = false;
      return;
    }
    if (seoAutoStarted.current) return;
    seoAutoStarted.current = true;
    onAutoStartSeoConsumed?.();
    const seoAction = QUICK_ACTIONS.find((a) => a.id === "seo");
    if (seoAction?.prompt) {
      void runAgentMission(seoAction.prompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot from SEO studio bulk button
  }, [autoStartSeo]);

  const steps = agentJob?.mutationPlan?.steps ?? [];
  const runsPct =
    status && status.runsLimit > 0
      ? Math.round((status.runsRemaining / status.runsLimit) * 100)
      : 0;

  const filteredIssues = scan?.issues ?? [];

  const seoProductIds = [
    ...new Set(
      (scan?.issues ?? [])
        .filter((i) => i.category === "SEO" && i.productId)
        .map((i) => i.productId as string),
    ),
  ];
  const descriptionProductIds = [
    ...new Set(
      (scan?.issues ?? [])
        .filter(
          (i) =>
            i.productId &&
            (i.id.startsWith("desc-") || i.title.toLowerCase().includes("description")),
        )
        .map((i) => i.productId as string),
    ),
  ];

  const runFixAll = async (category: string, productIds: string[]) => {
    if (!productIds.length) return;
    setFixLoading(category);
    setErrorAlert(null);
    try {
      const data = await gqlRequest<{
        fixScanIssues: AgentJob;
      }>(MUTATIONS.fixScanIssues, { category, productIds }, shop);
      setPreviewJob(data.fixScanIssues);
      setMessage(`Fix plan ready — ${productIds.length} products. Review before apply.`);
      if (onFixPreview) {
        onFixPreview(data.fixScanIssues);
      }
    } catch (e) {
      setErrorAlert(alertFromError(e, onUpgrade));
    } finally {
      setFixLoading(null);
    }
  };

  return (
    <div className={`tidysync-agent-pro${scanLoading ? " is-running" : ""}`}>
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
          <ProductMentionTextarea
            shop={shop}
            id="agent-prompt"
            value={prompt}
            onChange={setPrompt}
            placeholder="Describe a mission — e.g. Scan my store, polish thin descriptions, or improve SEO for @Product Name"
            rows={4}
            disabled={loading}
            hint="Type @ to mention a product by name"
          />
          <div className="tidysync-agent-pro-composer-footer">
            <span className="tidysync-agent-pro-hint">Uses 1 agent run · Runs in background · Approve changes before apply</span>
            <Button variant="primary" onClick={() => runAgentMission()} loading={loading} disabled={!mentionValueToPrompt(prompt).trim()}>
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
              <strong>{scanLoading ? "Scanning catalog…" : "Starting agent mission…"}</strong>
              <p>
                {scanLoading
                  ? "Using 1 AI credit · analyzing products in Shopify"
                  : "Queuing your mission — progress will appear at the top"}
              </p>
            </div>
            <Spinner size="small" />
          </div>
        </div>
      )}

      {agentJob &&
        (agentJob.status === "QUEUED" || agentJob.status === "RUNNING") &&
        steps.length > 0 && (
        <div className="tidysync-agent-thinking-panel is-inline">
          <div className="tidysync-agent-thinking-head">
            <div>
              <strong>Agent is working</strong>
              <p>{message || "Executing steps in the background…"}</p>
            </div>
            <Spinner size="small" />
          </div>
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

          {(seoProductIds.length > 0 || descriptionProductIds.length > 0) && (
            <div className="tidysync-agent-fix-all">
              <h4>Fix with one click</h4>
              <p>Creates a preview job — nothing changes until you approve (uses 1 AI credit per action).</p>
              <div className="tidysync-agent-fix-all-buttons">
                {seoProductIds.length > 0 && (
                  <Button
                    variant="primary"
                    onClick={() => runFixAll("SEO", seoProductIds)}
                    loading={fixLoading === "SEO"}
                    disabled={fixLoading != null && fixLoading !== "SEO"}
                  >
                    Fix all SEO ({seoProductIds.length.toString()})
                  </Button>
                )}
                {descriptionProductIds.length > 0 && (
                  <Button
                    onClick={() => runFixAll("Catalog", descriptionProductIds)}
                    loading={fixLoading === "Catalog"}
                    disabled={fixLoading != null && fixLoading !== "Catalog"}
                  >
                    Fix all descriptions ({descriptionProductIds.length.toString()})
                  </Button>
                )}
              </div>
            </div>
          )}

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

      {!scanLoading && message && !loading && intent && (!scan || intent === "IMPROVE_DESCRIPTION" || intent === "CREATE_BACKUP") && (
        <div className="tidysync-agent-pro-result-banner">
          <span className="tidysync-agent-pro-intent">{intent.replace(/_/g, " ")}</span>
          <p>{message}</p>
          {intent === "CREATE_BACKUP" && onGoToBackups && (
            <div className="tidysync-agent-pro-preview-cta">
              <Button variant="primary" onClick={onGoToBackups}>Open Backups</Button>
            </div>
          )}
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

      {previewJob?.type === "BACKUP" && (
        <div className="tidysync-agent-pro-preview">
          <h4>Catalog snapshot</h4>
          <p>
            {previewJob.status === "COMPLETED"
              ? "Your backup finished successfully. View and restore it from the Backups tab."
              : "Your backup is still running — watch the progress bar at the top."}
          </p>
          {onGoToBackups && (
            <div className="tidysync-agent-pro-preview-cta">
              <Button onClick={onGoToBackups}>Open Backups</Button>
            </div>
          )}
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
          {onApprove && (previewJob.status === "PREVIEW" || previewJob.status === "MAPPING") && (
            <div className="tidysync-agent-pro-preview-cta">
              <Button variant="primary" onClick={() => onApprove(previewJob.id)}>
                Approve and apply to Shopify
              </Button>
            </div>
          )}
        </div>
      )}

      {previewJob?.diffPreview && !previewJob.diffPreview.rows?.length && previewJob.impactSummary && (
        <div className="tidysync-agent-pro-preview">
          <h4>Fix plan ready</h4>
          <p>{previewJob.impactSummary}</p>
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
