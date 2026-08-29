"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  Banner,
  IndexTable,
  Badge,
  Tabs,
  TextField,
  BlockStack,
  InlineStack,
  ProgressBar,
  EmptyState,
  Modal,
  Select,
} from "@shopify/polaris";
import {
  gqlRequest,
  uploadFile,
  downloadExport,
  downloadAuditExport,
  QUERIES,
  MUTATIONS,
} from "../lib/graphql";
import { MappingEditor } from "./MappingEditor";

interface Tenant {
  shopDomain: string;
  shopName?: string;
  productCount: number;
  aiCreditsUsed: number;
  extraAiCredits?: number;
  billingStatus?: string;
  plan?: {
    name: string;
    slug?: string;
    aiCreditsRemaining?: number;
    maxProducts: number;
    priceMonthlyCents?: number;
    isFree?: boolean;
  };
}

interface PlanOption {
  id: string;
  name: string;
  slug: string;
  maxProducts: number;
  aiCreditsPerMonth: number;
  priceMonthlyCents: number;
  isFree: boolean;
}

interface Job {
  id: string;
  type: string;
  status: string;
  rowCount: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  impactSummary?: string;
  errorSummary?: string;
  createdAt: string;
  finishedAt?: string;
  fileName?: string;
  nlPrompt?: string;
  mutationPlan?: { steps?: Array<{ description: string }> };
  diffPreview?: {
    rows?: Array<{
      resourceTitle?: string;
      field: string;
      before: string | number | null;
      after: string | number | null;
    }>;
    anomalies?: Array<{ severity: string; message: string }>;
  };
  lineItems?: Array<{
    rowIndex: number;
    status: string;
    errorMessage?: string;
    autoFixSuggestion?: string;
  }>;
}

export function Dashboard() {
  const searchParams = useSearchParams();
  const shop = searchParams.get("shop") ?? "";

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [tab, setTab] = useState(0);
  const [nlPrompt, setNlPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportPlatform, setExportPlatform] = useState("shopify");
  const [importPlatform, setImportPlatform] = useState("woocommerce");
  const [importResourceType, setImportResourceType] = useState("products");
  const [exportResourceType, setExportResourceType] = useState("products");
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [mappingTemplates, setMappingTemplates] = useState<
    Array<{ id: string; name: string; platformKey: string; mappings: unknown }>
  >([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [mappingJobId, setMappingJobId] = useState("");
  const [mappingRows, setMappingRows] = useState<Array<{ sourceColumn: string; targetField: string; suggested?: boolean }>>([]);
  const [auditLogs, setAuditLogs] = useState<Array<{ id: string; action: string; createdAt: string }>>([]);
  const [schedules, setSchedules] = useState<Array<{ id: string; name: string; schedule: string; jobType: string }>>([]);
  const [brandVoice, setBrandVoice] = useState("professional, helpful");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [creditTopUp, setCreditTopUp] = useState("10");

  const loadData = useCallback(async () => {
    if (!shop) return;
    try {
      const tenantData = await gqlRequest<{ meTenant: Tenant }>(QUERIES.meTenant, {}, shop);
      setTenant(tenantData.meTenant);
      const jobsData = await gqlRequest<{ jobs: Job[] }>(QUERIES.jobs, { limit: 20 }, shop);
      setJobs(jobsData.jobs);
      const plansData = await gqlRequest<{ availablePlans: PlanOption[] }>(QUERIES.availablePlans, {}, shop);
      setPlans(plansData.availablePlans);
      const templatesData = await gqlRequest<{ mappingTemplates: typeof mappingTemplates }>(
        QUERIES.mappingTemplates,
        {},
        shop,
      );
      setMappingTemplates(templatesData.mappingTemplates);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [shop]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    try {
      await gqlRequest(
        MUTATIONS.createExport,
        {
          platformKey: exportPlatform === "shopify" ? null : exportPlatform,
          resourceType: exportResourceType,
        },
        shop,
      );
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const uploaded = await uploadFile(file, shop);
      const result = await gqlRequest<{ uploadImportFile: Job }>(
        MUTATIONS.uploadImport,
        {
          filePath: uploaded.filePath,
          fileName: uploaded.fileName,
          resourceType: importResourceType,
        },
        shop,
      );
      const mappings = await gqlRequest<{
        suggestFieldMappings: Array<{ sourceColumn: string; targetField: string; suggested: boolean }>;
      }>(
        MUTATIONS.suggestMappings,
        { jobId: result.uploadImportFile.id, platformKey: importPlatform },
        shop,
      );
      setMappingJobId(result.uploadImportFile.id);
      setMappingRows(mappings.suggestFieldMappings);
      setMappingOpen(true);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const handleNlBulkEdit = async () => {
    if (!nlPrompt.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await gqlRequest<{ generateNlBulkEdit: Job }>(
        MUTATIONS.nlBulkEdit,
        { prompt: nlPrompt },
        shop,
      );
      setSelectedJob(result.generateNlBulkEdit);
      setPreviewOpen(true);
      setNlPrompt("");
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk edit failed");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (jobId: string) => {
    setLoading(true);
    try {
      await gqlRequest(MUTATIONS.approveJob, { jobId }, shop);
      setPreviewOpen(false);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setLoading(false);
    }
  };

  const handleUndo = async (jobId: string) => {
    setLoading(true);
    try {
      await gqlRequest(MUTATIONS.undoJob, { jobId }, shop);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Undo failed");
    } finally {
      setLoading(false);
    }
  };

  const statusBadge = (status: string) => {
    const tone =
      status === "COMPLETED"
        ? "success"
        : status === "FAILED"
          ? "critical"
          : status === "RUNNING"
            ? "info"
            : "attention";
    return <Badge tone={tone}>{status}</Badge>;
  };

  const tabs = [
    { id: "jobs", content: "Jobs" },
    { id: "import", content: "Import" },
    { id: "export", content: "Export" },
    { id: "ai", content: "AI Bulk Edit" },
    { id: "health", content: "Catalog Health" },
    { id: "audit", content: "Audit Log" },
    { id: "schedules", content: "Schedules" },
    { id: "settings", content: "Settings" },
  ];

  const loadAudit = async () => {
    const data = await gqlRequest<{ auditLogs: typeof auditLogs }>(QUERIES.auditLogs, { limit: 50 }, shop);
    setAuditLogs(data.auditLogs);
  };

  const loadSchedules = async () => {
    const data = await gqlRequest<{ scheduledJobs: typeof schedules }>(QUERIES.scheduledJobs, {}, shop);
    setSchedules(data.scheduledJobs);
  };

  if (!shop) {
    return (
      <Page title="TidySync">
        <Banner tone="warning">
          Open this app from Shopify Admin or add ?shop=your-store.myshopify.com
        </Banner>
      </Page>
    );
  }

  return (
    <Page
      title="TidySync"
      subtitle="AI-guided bulk data for your store"
      primaryAction={{
        content: "Refresh",
        onAction: loadData,
      }}
    >
      <Layout>
        {error && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => setError(null)}>
              {error}
            </Banner>
          </Layout.Section>
        )}

        {tenant?.plan && (
          <Layout.Section>
            <Card>
              <InlineStack gap="400" align="space-between">
                <Text as="span" variant="bodyMd">
                  Plan: <strong>{tenant.plan.name}</strong> · {tenant.productCount} products
                </Text>
                <Text as="span" variant="bodyMd">
                  AI credits remaining: {tenant.plan.aiCreditsRemaining ?? "—"}
                </Text>
              </InlineStack>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <Tabs tabs={tabs} selected={tab} onSelect={setTab}>
              {tab === 0 && (
                <BlockStack gap="400">
                  {jobs.length === 0 ? (
                    <EmptyState
                      heading="No jobs yet"
                      action={{ content: "Import a file", onAction: () => setTab(1) }}
                      image=""
                    >
                      <p>Import a file or run an AI bulk edit to get started.</p>
                    </EmptyState>
                  ) : (
                    <IndexTable
                      resourceName={{ singular: "job", plural: "jobs" }}
                      itemCount={jobs.length}
                      headings={[
                        { title: "Type" },
                        { title: "Status" },
                        { title: "Rows" },
                        { title: "Progress" },
                        { title: "Created" },
                        { title: "Actions" },
                      ]}
                      selectable={false}
                    >
                      {jobs.map((job, index) => (
                        <IndexTable.Row id={job.id} key={job.id} position={index}>
                          <IndexTable.Cell>{job.type}</IndexTable.Cell>
                          <IndexTable.Cell>{statusBadge(job.status)}</IndexTable.Cell>
                          <IndexTable.Cell>{job.rowCount}</IndexTable.Cell>
                          <IndexTable.Cell>
                            {job.status === "RUNNING" ? (
                              <ProgressBar
                                progress={
                                  job.rowCount > 0
                                    ? (job.processedCount / job.rowCount) * 100
                                    : 0
                                }
                                size="small"
                              />
                            ) : (
                              `${job.successCount}/${job.rowCount}`
                            )}
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            {new Date(job.createdAt).toLocaleString()}
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <InlineStack gap="200">
                              <Button
                                size="slim"
                                onClick={async () => {
                                  const detail = await gqlRequest<{ job: Job }>(
                                    QUERIES.job,
                                    { id: job.id },
                                    shop,
                                  );
                                  setSelectedJob(detail.job);
                                  setPreviewOpen(true);
                                }}
                              >
                                View
                              </Button>
                              {job.status === "COMPLETED" && job.type === "EXPORT" && (
                                <Button
                                  size="slim"
                                  onClick={() => downloadExport(job.id, shop)}
                                >
                                  Download
                                </Button>
                              )}
                              {job.status === "COMPLETED" && job.type !== "UNDO" && (
                                <Button size="slim" onClick={() => handleUndo(job.id)}>
                                  Undo
                                </Button>
                              )}
                            </InlineStack>
                          </IndexTable.Cell>
                        </IndexTable.Row>
                      ))}
                    </IndexTable>
                  )}
                </BlockStack>
              )}

              {tab === 1 && (
                <BlockStack gap="400">
                  <Select
                    label="Resource type"
                    options={[
                      { label: "Products", value: "products" },
                      { label: "Collections", value: "collections" },
                      { label: "Customers", value: "customers" },
                      { label: "Metafields", value: "metafields" },
                      { label: "Discounts", value: "discounts" },
                    ]}
                    value={importResourceType}
                    onChange={setImportResourceType}
                  />
                  <Select
                    label="Source platform"
                    options={[
                      { label: "WooCommerce", value: "woocommerce" },
                      { label: "BigCommerce", value: "bigcommerce" },
                      { label: "Generic CSV", value: "unknown" },
                    ]}
                    value={importPlatform}
                    onChange={setImportPlatform}
                  />
                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImport(file);
                    }}
                  />
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Upload a CSV export from your source platform. TidySync will map columns,
                    show a diff preview, then import after you approve.
                  </Text>
                </BlockStack>
              )}

              {tab === 2 && (
                <BlockStack gap="400">
                  <Select
                    label="Resource type"
                    options={[
                      { label: "Products", value: "products" },
                      { label: "Collections", value: "collections" },
                      { label: "Customers", value: "customers" },
                      { label: "Metafields", value: "metafields" },
                      { label: "Discounts", value: "discounts" },
                    ]}
                    value={exportResourceType}
                    onChange={setExportResourceType}
                  />
                  <Select
                    label="Export format"
                    options={[
                      { label: "Shopify CSV", value: "shopify" },
                      { label: "WooCommerce", value: "woocommerce" },
                      { label: "BigCommerce", value: "bigcommerce" },
                    ]}
                    value={exportPlatform}
                    onChange={setExportPlatform}
                  />
                  <Button onClick={handleExport} loading={loading}>
                    Start export
                  </Button>
                </BlockStack>
              )}

              {tab === 3 && (
                <BlockStack gap="400">
                  <div className="tidysync-ai-accent" style={{ paddingLeft: 12 }}>
                    <TextField
                      label="Natural language bulk edit"
                      value={nlPrompt}
                      onChange={setNlPrompt}
                      placeholder="e.g. Increase all Summer Collection prices by 10%"
                      autoComplete="off"
                      multiline={3}
                    />
                  </div>
                  <Button onClick={handleNlBulkEdit} loading={loading} variant="primary">
                    Generate preview
                  </Button>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Describe the change in plain English. TidySync will build a mutation plan,
                    show every change in a diff preview, and run only after you approve.
                  </Text>
                </BlockStack>
              )}

              {tab === 4 && (
                <BlockStack gap="400">
                  <Button
                    onClick={async () => {
                      setLoading(true);
                      try {
                        await gqlRequest(MUTATIONS.catalogScan, {}, shop);
                        await loadData();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Scan failed");
                      } finally {
                        setLoading(false);
                      }
                    }}
                    loading={loading}
                  >
                    Run catalog health scan
                  </Button>
                  <TextField
                    label="Brand voice for content rewrite"
                    value={brandVoice}
                    onChange={setBrandVoice}
                    autoComplete="off"
                  />
                  <Button
                    onClick={async () => {
                      setLoading(true);
                      try {
                        await gqlRequest(MUTATIONS.contentRewrite, { brandVoice }, shop);
                        await loadData();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Rewrite failed");
                      } finally {
                        setLoading(false);
                      }
                    }}
                    loading={loading}
                  >
                    AI content rewrite (up to 50 products)
                  </Button>
                </BlockStack>
              )}

              {tab === 5 && (
                <BlockStack gap="400">
                  <Button onClick={loadAudit}>Load audit log</Button>
                  <Button onClick={() => downloadAuditExport(shop)}>Export audit CSV</Button>
                  {auditLogs.map((log) => (
                    <Text key={log.id} as="p" variant="bodySm">
                      {new Date(log.createdAt).toLocaleString()} — {log.action}
                    </Text>
                  ))}
                </BlockStack>
              )}

              {tab === 6 && (
                <BlockStack gap="400">
                  <Button onClick={loadSchedules}>Refresh schedules</Button>
                  <Button
                    onClick={async () => {
                      await gqlRequest(
                        MUTATIONS.createSchedule,
                        {
                          name: "Daily export",
                          jobType: "EXPORT",
                          schedule: "daily",
                          config: {},
                        },
                        shop,
                      );
                      await loadSchedules();
                    }}
                  >
                    Add daily export schedule
                  </Button>
                  {schedules.map((s) => (
                    <Text key={s.id} as="p" variant="bodySm">
                      {s.name} · {s.jobType} · {s.schedule}
                    </Text>
                  ))}
                </BlockStack>
              )}

              {tab === 7 && (
                <BlockStack gap="400">
                  <Text as="h3" variant="headingSm">Plans & billing</Text>
                  {plans.map((plan) => (
                    <InlineStack key={plan.id} gap="400" align="space-between">
                      <Text as="span" variant="bodyMd">
                        <strong>{plan.name}</strong> — {plan.maxProducts.toLocaleString()} products ·{" "}
                        {plan.aiCreditsPerMonth} AI credits/mo · $
                        {(plan.priceMonthlyCents / 100).toFixed(0)}/mo
                      </Text>
                      {tenant?.plan?.slug !== plan.slug && !plan.isFree && (
                        <Button
                          size="slim"
                          onClick={async () => {
                            const result = await gqlRequest<{
                              createPlanSubscription: { confirmationUrl: string };
                            }>(MUTATIONS.subscribePlan, { planSlug: plan.slug }, shop);
                            window.open(result.createPlanSubscription.confirmationUrl, "_top");
                          }}
                        >
                          Upgrade
                        </Button>
                      )}
                      {tenant?.plan?.slug === plan.slug && (
                        <Badge tone="success">Current</Badge>
                      )}
                    </InlineStack>
                  ))}
                  <TextField
                    label="AI credit top-up (paid plans)"
                    value={creditTopUp}
                    onChange={setCreditTopUp}
                    autoComplete="off"
                    helpText="$1 per credit — billed via Shopify"
                  />
                  <Button
                    onClick={async () => {
                      const credits = Number(creditTopUp) || 10;
                      const result = await gqlRequest<{
                        purchaseCreditTopUp: { confirmationUrl: string };
                      }>(MUTATIONS.purchaseCredits, { credits }, shop);
                      window.open(result.purchaseCreditTopUp.confirmationUrl, "_top");
                    }}
                    disabled={tenant?.plan?.isFree}
                  >
                    Purchase AI credits
                  </Button>
                  <TextField
                    label="Notification email"
                    value={notifyEmail}
                    onChange={setNotifyEmail}
                    autoComplete="email"
                  />
                  <Button
                    onClick={async () => {
                      await gqlRequest(
                        MUTATIONS.updateNotifications,
                        { email: notifyEmail, emailOnComplete: true, emailOnFailure: true },
                        shop,
                      );
                    }}
                  >
                    Save notification settings
                  </Button>
                </BlockStack>
              )}
            </Tabs>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Diff preview — review before commit"
        primaryAction={
          selectedJob?.status === "PREVIEW"
            ? {
                content: "Approve & run",
                onAction: () => selectedJob && handleApprove(selectedJob.id),
                loading: loading,
              }
            : undefined
        }
        secondaryActions={[{ content: "Close", onAction: () => setPreviewOpen(false) }]}
        size="large"
      >
        <Modal.Section>
          <BlockStack gap="400">
            {selectedJob?.impactSummary && (
              <Banner tone="info">{selectedJob.impactSummary}</Banner>
            )}
            {selectedJob?.diffPreview?.anomalies?.map((a) => (
              <Banner key={a.message} tone={a.severity === "high" ? "critical" : "warning"}>
                {a.message}
              </Banner>
            ))}
            {selectedJob?.mutationPlan?.steps?.map((step, i) => (
              <Text key={i} as="p" variant="bodyMd">
                Step {i + 1}: {step.description}
              </Text>
            ))}
            {selectedJob?.diffPreview?.rows?.slice(0, 50).map((row, i) => (
              <div
                key={i}
                className="tidysync-diff-row"
                style={{ animationDelay: `${i * 30}ms`, padding: "4px 0" }}
              >
                <Text as="p" variant="bodySm">
                  <strong>{row.resourceTitle ?? "Item"}</strong> · {row.field}:{" "}
                  <span style={{ color: "#bf0711" }}>{String(row.before ?? "—")}</span>
                  {" → "}
                  <span style={{ color: "#008060" }}>{String(row.after ?? "—")}</span>
                </Text>
              </div>
            ))}
            {selectedJob?.lineItems?.filter((l) => l.status === "FAILED").map((item) => (
              <Banner key={item.rowIndex} tone="warning">
                Row {item.rowIndex + 1}: {item.errorMessage}
                {item.autoFixSuggestion && ` — Suggestion: ${item.autoFixSuggestion}`}
              </Banner>
            ))}
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={mappingOpen}
        onClose={() => setMappingOpen(false)}
        title="Field mapping — review before import"
        size="large"
      >
        <Modal.Section>
          <MappingEditor
            shop={shop}
            jobId={mappingJobId}
            platformKey={importPlatform}
            resourceType={importResourceType}
            initialMappings={mappingRows}
            templates={mappingTemplates.filter(
              (t) => t.platformKey === importPlatform || importResourceType === "products",
            ) as Array<{
              id: string;
              name: string;
              mappings: Array<{ sourceColumn: string; targetField: string }>;
            }>}
            onComplete={async () => {
              setMappingOpen(false);
              const jobDetail = await gqlRequest<{ job: Job }>(QUERIES.job, { id: mappingJobId }, shop);
              setSelectedJob(jobDetail.job);
              setPreviewOpen(true);
              await loadData();
            }}
          />
        </Modal.Section>
      </Modal>
    </Page>
  );
}
