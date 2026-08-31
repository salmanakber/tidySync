"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  BlockStack,
  Button,
  InlineStack,
  Spinner,
  Text,
  TextField,
} from "@shopify/polaris";
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

const AGENT_CHIPS = [
  "Fix my store — analyze everything",
  "Improve SEO and description for (product name)",
  "Create a catalog backup",
  "Increase all prices by 10%",
  "Import with Nike brand 10% discount rule",
];

function severityTone(severity: string): "critical" | "warning" | "info" {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "warning";
  return "info";
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

  const run = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setErrorAlert(null);
    setResult(null);
    try {
      const data = await gqlRequest<{ runAgent: AgentRunResult }>(
        MUTATIONS.runAgent,
        { prompt: prompt.trim() },
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

  return (
    <div className={`tidysync-agent-studio${loading ? " is-generating" : ""}`}>
      <div className="tidysync-agent-hero">
        <BlockStack gap="200">
          <InlineStack gap="200" blockAlign="center">
            <span className="tidysync-ai-badge">AGENT</span>
            <Text as="h3" variant="headingMd">TidySync AI Agent</Text>
          </InlineStack>
          <Text as="p" variant="bodySm" tone="subdued">
            Autonomous store operations: scan health, improve SEO, run bulk edits, create backups — with plan-scoped agent runs.
          </Text>
          {status && (
            <InlineStack gap="200" wrap>
              <Badge tone={status.enabled ? "success" : "warning"}>
                {status.enabled ? "Agent enabled" : "Upgrade to unlock"}
              </Badge>
              <Badge tone="info">{`${status.runsRemaining} / ${status.runsLimit} runs left`}</Badge>
            </InlineStack>
          )}
        </BlockStack>
      </div>

      {errorAlert && (
        <AppAlert
          tone={errorAlert.tone}
          title={errorAlert.title}
          message={errorAlert.message}
          primaryAction={errorAlert.primaryAction}
          onDismiss={() => setErrorAlert(null)}
        />
      )}

      <TextField
        label="What should the agent do?"
        labelHidden
        value={prompt}
        onChange={setPrompt}
        placeholder="e.g. Fix my store, or improve SEO for (Leather Wallet)"
        autoComplete="off"
        multiline={4}
        disabled={loading}
      />

      <div className="tidysync-prompt-chips">
        {AGENT_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            className="tidysync-chip"
            disabled={loading}
            onClick={() => setPrompt(chip)}
          >
            {chip}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <Button variant="primary" onClick={() => run()} loading={loading} disabled={!prompt.trim()}>
          Run agent (1 agent run)
        </Button>
      </div>

      {loading && (
        <div className="tidysync-agent-thinking" style={{ marginTop: 24 }}>
          <Spinner size="small" />
          <Text as="p" variant="bodySm">Agent is analyzing your store and planning actions…</Text>
        </div>
      )}

      {result && !loading && (
        <div style={{ marginTop: 24 }}>
        <BlockStack gap="400">
          <div className="tidysync-agent-result-header">
            <Badge tone="info">{result.intent.replace(/_/g, " ")}</Badge>
            <Text as="p" variant="bodyMd">{result.message}</Text>
          </div>

          {result.suggestedActions.length > 0 && (
            <BlockStack gap="100">
              <Text as="p" variant="headingSm">Suggested next steps</Text>
              {result.suggestedActions.map((a, i) => (
                <Text key={i} as="p" variant="bodySm" tone="subdued">• {a}</Text>
              ))}
            </BlockStack>
          )}

          {result.scan && (
            <div className="tidysync-agent-scan">
              <div className="tidysync-agent-score-grid">
                <div className="tidysync-seo-kpi">
                  <span className="tidysync-seo-kpi-value">{result.scan.overallHealthScore}</span>
                  <span className="tidysync-seo-kpi-label">Health</span>
                </div>
                <div className="tidysync-seo-kpi">
                  <span className="tidysync-seo-kpi-value">{result.scan.seoScore}</span>
                  <span className="tidysync-seo-kpi-label">SEO</span>
                </div>
                <div className="tidysync-seo-kpi">
                  <span className="tidysync-seo-kpi-value">{result.scan.catalogScore}</span>
                  <span className="tidysync-seo-kpi-label">Catalog</span>
                </div>
                <div className="tidysync-seo-kpi">
                  <span className="tidysync-seo-kpi-value">{result.scan.productCount}</span>
                  <span className="tidysync-seo-kpi-label">Products</span>
                </div>
              </div>

              <Text as="p" variant="bodySm" tone="subdued">{result.scan.summary}</Text>

              <BlockStack gap="200">
                <Text as="h4" variant="headingSm">Issues found</Text>
                {result.scan.issues.slice(0, 20).map((issue) => (
                  <div key={issue.id} className={`tidysync-seo-check is-${issue.severity}`}>
                    <Badge tone={severityTone(issue.severity)}>
                      {issue.category}
                    </Badge>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">{issue.title}</Text>
                    <Text as="p" variant="bodySm">{issue.detail}</Text>
                    {issue.productTitle && (
                      <Text as="p" variant="bodySm" tone="subdued">{issue.productTitle}</Text>
                    )}
                  </div>
                ))}
              </BlockStack>
            </div>
          )}

          {result.previewJob?.diffPreview?.rows && result.previewJob.diffPreview.rows.length > 0 && (
            <BlockStack gap="300">
              <Text as="h4" variant="headingSm">Proposed changes — confirm before apply</Text>
              <DiffPreviewPanel
                rows={result.previewJob.diffPreview.rows}
                impactSummary={result.previewJob.impactSummary}
              />
              {onApprove && result.previewJob.status === "PREVIEW" && (
                <Button
                  variant="primary"
                  onClick={() => onApprove(result.previewJob!.id)}
                >
                  Approve and run in Shopify
                </Button>
              )}
            </BlockStack>
          )}
        </BlockStack>
        </div>
      )}
    </div>
  );
}
