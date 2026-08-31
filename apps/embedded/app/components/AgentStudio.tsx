"use client";

import { useCallback, useEffect, useState } from "react";
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

interface AgentJob {
  id: string;
  type: string;
  status: string;
  nlPrompt?: string;
  impactSummary?: string;
  diffPreview?: {
    rows?: Array<{
      resourceTitle?: string;
      field: string;
      before: string | number | null;
      after: string | number | null;
    }>;
  };
}

interface AgentRunResult {
  intent: string;
  message: string;
  scan?: StoreScanResult | null;
  previewJob?: AgentJob | null;
  agentRunsUsed: number;
  suggestedActions: string[];
}

interface AgentStudioProps {
  shop: string;
  onApprove?: (jobId: string) => void;
  onUpgrade?: () => void;
}

const QUICK_ACTIONS = [
  {
    id: "fix",
    label: "Fix my store",
    desc: "Full catalog scan — SEO, SKUs, images",
    prompt: "Fix my store — analyze everything and show what's wrong",
    icon: AlertTriangleIcon,
    tone: "warn",
  },
  {
    id: "seo",
    label: "Improve product SEO",
    desc: "Title, meta & description for one product",
    prompt: "Improve SEO and description for (product name)",
    icon: ProductIcon,
    tone: "seo",
  },
  {
    id: "backup",
    label: "Snapshot catalog",
    desc: "Save a recoverable backup",
    prompt: "Create a catalog backup",
    icon: MagicIcon,
    tone: "vault",
  },
  {
    id: "price",
    label: "Bulk price change",
    desc: "Natural language bulk edit",
    prompt: "Increase all prices by 10%",
    icon: AutomationIcon,
    tone: "edit",
  },
];

function scoreClass(score: number): string {
  if (score >= 75) return "is-good";
  if (score >= 50) return "is-mid";
  return "is-low";
}

function severityClass(severity: string): string {
  if (severity === "critical") return "is-critical";
  if (severity === "warning") return "is-warning";
  return "is-info";
}

export function AgentStudio({ shop, onApprove, onUpgrade }: AgentStudioProps) {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentRunResult | null>(null);
  const [errorAlert, setErrorAlert] = useState<ReturnType<typeof alertFromError> | null>(null);

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

  const run = async (text?: string) => {
    const value = (text ?? prompt).trim();
    if (!value) return;
    setPrompt(value);
    setLoading(true);
    setErrorAlert(null);
    setResult(null);
    try {
      const data = await gqlRequest<{ runAgent: AgentRunResult }>(
        MUTATIONS.runAgent,
        { prompt: value },
        shop,
      );
      setResult(data.runAgent);
      void loadStatus();
    } catch (e) {
      setErrorAlert(alertFromError(e, onUpgrade));
    } finally {
      setLoading(false);
    }
  };

  const runsPct =
    status && status.runsLimit > 0
      ? Math.round((status.runsRemaining / status.runsLimit) * 100)
      : 0;

  return (
    <div className={`tidysync-agent-pro${loading ? " is-running" : ""}`}>
      <header className="tidysync-agent-pro-hero">
        <div className="tidysync-agent-pro-hero-bg" aria-hidden="true" />
        <div className="tidysync-agent-pro-hero-inner">
          <div className="tidysync-agent-pro-hero-copy">
            <div className="tidysync-agent-pro-badge-row">
              <span className="tidysync-agent-pro-badge">
                <Icon source={AutomationIcon} />
                Autonomous agent
              </span>
              {status && (
                <span className={`tidysync-agent-pro-status${status.enabled ? "" : " is-locked"}`}>
                  {status.enabled ? "Active on your plan" : "Upgrade to unlock"}
                </span>
              )}
            </div>
            <h2 className="tidysync-agent-pro-title">Command your catalog with natural language</h2>
            <p className="tidysync-agent-pro-sub">
              Scan store health, improve SEO, run bulk edits, or create backups — always with a review step before Shopify changes.
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
                  <span>runs left</span>
                </div>
              </div>
              <div className="tidysync-agent-pro-usage-meta">
                <span>{status.runsUsed} used</span>
                <span>{status.runsLimit} monthly</span>
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
              disabled={loading}
              onClick={() => run(action.prompt)}
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
          Custom command
        </label>
        <div className="tidysync-agent-pro-composer-box">
          <textarea
            id="agent-prompt"
            className="tidysync-agent-pro-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what you want — e.g. Fix duplicate SKUs and improve thin descriptions"
            rows={4}
            disabled={loading}
          />
          <div className="tidysync-agent-pro-composer-footer">
            <span className="tidysync-agent-pro-hint">Uses 1 agent run · Changes require your approval</span>
            <Button variant="primary" onClick={() => run()} loading={loading} disabled={!prompt.trim()}>
              Run agent
            </Button>
          </div>
        </div>
      </section>

      {loading && (
        <div className="tidysync-agent-pro-thinking">
          <div className="tidysync-agent-pro-thinking-orbs" aria-hidden="true">
            <span /><span /><span />
          </div>
          <Spinner size="small" />
          <p>Analyzing catalog, building mutation plan, and preparing your briefing…</p>
        </div>
      )}

      {result && !loading && (
        <section className="tidysync-agent-pro-results">
          <div className="tidysync-agent-pro-result-banner">
            <span className="tidysync-agent-pro-intent">{result.intent.replace(/_/g, " ")}</span>
            <p>{result.message}</p>
          </div>

          {result.suggestedActions.length > 0 && (
            <div className="tidysync-agent-pro-steps">
              <h4>Next steps</h4>
              <ol>
                {result.suggestedActions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ol>
            </div>
          )}

          {result.scan && (
            <div className="tidysync-agent-pro-scan">
              <div className="tidysync-agent-pro-scan-header">
                <h4>Store intelligence report</h4>
                <p>{result.scan.summary}</p>
              </div>

              <div className="tidysync-agent-pro-score-row">
                {[
                  { label: "Overall", value: result.scan.overallHealthScore },
                  { label: "SEO", value: result.scan.seoScore },
                  { label: "Catalog", value: result.scan.catalogScore },
                  { label: "Products", value: result.scan.productCount, raw: true },
                ].map((item) => (
                  <div key={item.label} className={`tidysync-agent-pro-score-card${item.raw ? " is-count" : scoreClass(item.value as number)}`}>
                    <span className="tidysync-agent-pro-score-value">{item.value}</span>
                    <span className="tidysync-agent-pro-score-label">{item.label}</span>
                  </div>
                ))}
              </div>

              <div className="tidysync-agent-pro-issues">
                {result.scan.issues.slice(0, 24).map((issue) => (
                  <article key={issue.id} className={`tidysync-agent-pro-issue ${severityClass(issue.severity)}`}>
                    <div className="tidysync-agent-pro-issue-top">
                      <span className="tidysync-agent-pro-issue-cat">{issue.category}</span>
                      <span className="tidysync-agent-pro-issue-sev">{issue.severity}</span>
                    </div>
                    <h5>{issue.title}</h5>
                    <p>{issue.detail}</p>
                    {issue.productTitle && <span className="tidysync-agent-pro-issue-product">{issue.productTitle}</span>}
                  </article>
                ))}
              </div>
            </div>
          )}

          {result.previewJob?.diffPreview?.rows && result.previewJob.diffPreview.rows.length > 0 && (
            <div className="tidysync-agent-pro-preview">
              <h4>Proposed Shopify changes</h4>
              <p className="tidysync-agent-pro-preview-note">Nothing is live until you approve.</p>
              <DiffPreviewPanel
                rows={result.previewJob.diffPreview.rows}
                impactSummary={result.previewJob.impactSummary}
              />
              {onApprove && result.previewJob.status === "PREVIEW" && (
                <div className="tidysync-agent-pro-preview-cta">
                  <Button variant="primary" onClick={() => onApprove(result.previewJob!.id)}>
                    Approve and apply to Shopify
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
