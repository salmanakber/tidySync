"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  Banner,
  IndexTable,
  Badge,
  TextField,
  BlockStack,
  InlineStack,
  ProgressBar,
  EmptyState,
  Modal,
  Select,
  Divider,
  Icon,
} from "@shopify/polaris";
import {
  ImportIcon,
  ExportIcon,
  MagicIcon,
  ProductIcon,
  ClockIcon,
  RefreshIcon,
  CalendarIcon,
  CashDollarIcon,
  AlertTriangleIcon,
} from "@shopify/polaris-icons";
import {
  gqlRequest,
  uploadFile,
  downloadExport,
  downloadAuditExport,
  QUERIES,
  MUTATIONS,
} from "../lib/graphql";
import { MappingEditor } from "./MappingEditor";
import { FileDropzone } from "./FileDropzone";
import { AiStudio } from "./AiStudio";
import { DiffPreviewPanel } from "./DiffPreviewPanel";
import { DashboardSkeleton } from "./DashboardSkeleton";
import { useShop } from "../providers";

interface Tenant {
  shopDomain: string;
  shopName?: string;
  productCount: number;
  aiCreditsUsed: number;
  extraAiCredits?: number;
  billingStatus?: string;
  billingBypass?: boolean;
  installApproved?: boolean;
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

const RESOURCE_OPTIONS = [
  { label: "Products", value: "products" },
  { label: "Collections", value: "collections" },
  { label: "Customers", value: "customers" },
  { label: "Metafields", value: "metafields" },
  { label: "Discounts", value: "discounts" },
];

export function Dashboard() {
  const {
    shop: urlShop,
    ready: shopReady,
    authenticated,
    authError,
    beginInstall,
  } = useShop();
  const [sessionShop, setSessionShop] = useState("");
  const shop = urlShop || sessionShop;

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [tab, setTab] = useState(0);
  const [nlPrompt, setNlPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
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
  const [mappingRows, setMappingRows] = useState<
    Array<{ sourceColumn: string; targetField: string; suggested?: boolean }>
  >([]);
  const [auditLogs, setAuditLogs] = useState<Array<{ id: string; action: string; createdAt: string }>>([]);
  const [schedules, setSchedules] = useState<
    Array<{ id: string; name: string; schedule: string; jobType: string }>
  >([]);
  const [brandVoice, setBrandVoice] = useState("professional, helpful");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [creditTopUp, setCreditTopUp] = useState("10");
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!shop) return;
    try {
      const tenantData = await gqlRequest<{ meTenant: Tenant }>(QUERIES.meTenant, {}, shop);
      setTenant(tenantData.meTenant);
      if (tenantData.meTenant?.shopDomain) {
        setSessionShop(tenantData.meTenant.shopDomain);
      }
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
      setError(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load";
      setError(message);
      if (
        message.includes("Unauthorized") ||
        message.includes("not installed") ||
        message.includes("merchant session")
      ) {
        // Let user reconnect rather than spam OAuth loops from the poller
        setError("Shopify session missing. Click Connect to install / re-authorize TidySync.");
      }
    }
  }, [shop]);

  useEffect(() => {
    if (!shopReady) return;
    if (!shop || !authenticated) {
      setBootstrapping(false);
      return;
    }
    setBootstrapping(true);
    loadData().finally(() => setBootstrapping(false));
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData, shopReady, shop, authenticated]);

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
      setTab(0);
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
      }>(MUTATIONS.suggestMappings, { jobId: result.uploadImportFile.id, platformKey: importPlatform }, shop);
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
      setTab(0);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setLoading(false);
    }
  };

  const handleUndo = async (jobId: string) => {
    setUndoingId(jobId);
    setLoading(true);
    try {
      await gqlRequest(MUTATIONS.undoJob, { jobId }, shop);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Undo failed");
    } finally {
      setLoading(false);
      window.setTimeout(() => setUndoingId(null), 500);
    }
  };

  const openJob = async (jobId: string) => {
    const detail = await gqlRequest<{ job: Job }>(QUERIES.job, { id: jobId }, shop);
    setSelectedJob(detail.job);
    setPreviewOpen(true);
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
    { id: "home", content: "Home" },
    { id: "jobs", content: "Jobs" },
    { id: "import", content: "Import" },
    { id: "export", content: "Export" },
    { id: "ai", content: "AI Edit" },
    { id: "health", content: "Health" },
    { id: "audit", content: "Audit" },
    { id: "schedules", content: "Schedules" },
    { id: "settings", content: "Billing" },
  ];

  useEffect(() => {
    if (!shop) return;
    if (tab === 6) void loadAudit();
    if (tab === 7) void loadSchedules();
  }, [tab, shop]);

  const loadAudit = async () => {
    const data = await gqlRequest<{ auditLogs: typeof auditLogs }>(QUERIES.auditLogs, { limit: 50 }, shop);
    setAuditLogs(data.auditLogs);
  };

  const loadSchedules = async () => {
    const data = await gqlRequest<{ scheduledJobs: typeof schedules }>(QUERIES.scheduledJobs, {}, shop);
    setSchedules(data.scheduledJobs);
  };

  const runningJobs = useMemo(() => jobs.filter((j) => j.status === "RUNNING"), [jobs]);
  const productUsage = tenant?.plan?.maxProducts
    ? Math.min(100, Math.round((tenant.productCount / tenant.plan.maxProducts) * 100))
    : 0;

  const needsBilling =
    tenant &&
    !tenant.billingBypass &&
    tenant.billingStatus &&
    tenant.billingStatus !== "ACTIVE" &&
    !tenant.plan?.isFree;

  if (!shopReady || bootstrapping) {
    return (
      <div className="tidysync-page-shell" style={{ padding: "16px 20px" }}>
        <DashboardSkeleton />
      </div>
    );
  }

  if (!authenticated || !shop) {
    return (
      <Page title="TidySync">
        <Layout>
          <Layout.Section>
            <Banner
              tone="warning"
              title="Connect your Shopify store"
              action={{ content: "Connect / install", onAction: beginInstall }}
            >
              {authError ??
                "Open TidySync from Shopify Admin, or click Connect to complete OAuth so App Bridge can issue a session token."}
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  if (tenant && tenant.installApproved === false) {
    return (
      <Page title="TidySync">
        <Banner tone="warning" title="Store pending approval">
          Your store is waiting for TidySync approval. Contact support if you need access sooner.
        </Banner>
      </Page>
    );
  }

  return (
    <div className="tidysync-page-shell">
    <Page
      title="TidySync"
      subtitle={tenant?.shopName ?? tenant?.shopDomain ?? shop}
      primaryAction={{
        content: "Refresh",
        icon: RefreshIcon,
        onAction: loadData,
      }}
      secondaryActions={[
        { content: "Import", onAction: () => setTab(2) },
        { content: "AI edit", onAction: () => setTab(4) },
      ]}
    >
      <Layout>
        {error && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => setError(null)}>
              {error}
            </Banner>
          </Layout.Section>
        )}

        {needsBilling && (
          <Layout.Section>
            <Banner
              tone="warning"
              title="Complete your subscription"
              action={{ content: "View plans", onAction: () => setTab(8) }}
            >
              Choose a plan to unlock imports, exports, and AI bulk edits.
            </Banner>
          </Layout.Section>
        )}

        {tenant && (
          <Layout.Section>
            <div className="tidysync-stats-grid">
              <div className="tidysync-stat-card tidysync-enter tidysync-enter-delay-1">
                <div className="tidysync-stat-label">Plan</div>
                <div className="tidysync-stat-value">{tenant.plan?.name ?? "Free"}</div>
                <div className="tidysync-stat-meta">
                  {tenant.billingBypass ? "Testing mode" : tenant.billingStatus ?? "ACTIVE"}
                </div>
              </div>
              <div className="tidysync-stat-card tidysync-enter tidysync-enter-delay-2">
                <div className="tidysync-stat-label">Products</div>
                <div className="tidysync-stat-value">{tenant.productCount.toLocaleString()}</div>
                <div className="tidysync-stat-meta" style={{ marginTop: 10 }}>
                  <ProgressBar progress={productUsage} size="small" />
                </div>
              </div>
              <div className="tidysync-stat-card tidysync-enter tidysync-enter-delay-3">
                <div className="tidysync-stat-label">AI credits</div>
                <div className="tidysync-stat-value">{tenant.plan?.aiCreditsRemaining ?? "—"}</div>
                <div className="tidysync-stat-meta">remaining this month</div>
              </div>
              <div className="tidysync-stat-card tidysync-enter tidysync-enter-delay-4">
                <div className="tidysync-stat-label">Live jobs</div>
                <div className="tidysync-stat-value">{runningJobs.length}</div>
                <div className="tidysync-stat-meta">{jobs.length} recent total</div>
              </div>
            </div>
          </Layout.Section>
        )}

        <Layout.Section>
          <div className="tidysync-workspace">
            <nav className="tidysync-nav" aria-label="TidySync sections">
              {tabs.map((t, index) => (
                <button
                  key={t.id}
                  type="button"
                  className={`tidysync-nav-btn${tab === index ? " is-active" : ""}`}
                  onClick={() => setTab(index)}
                >
                  {t.content}
                </button>
              ))}
            </nav>
            <div className="tidysync-panel">
                {tab === 0 && (
                  <BlockStack gap="500">
                    <div>
                      <p className="tidysync-section-title">What do you want to do?</p>
                      <p className="tidysync-section-sub">
                        Import catalogs, export Shopify data, or describe a change in plain English.
                      </p>
                      <div className="tidysync-action-grid">
                        <button type="button" className="tidysync-action-card" onClick={() => setTab(2)}>
                          <div className="tidysync-action-icon">
                            <Icon source={ImportIcon} />
                          </div>
                          <p className="tidysync-action-title">Import catalog</p>
                          <p className="tidysync-action-desc">
                            Drop a CSV/XLSX — we map fields, preview every change, then commit.
                          </p>
                        </button>
                        <button type="button" className="tidysync-action-card" onClick={() => setTab(3)}>
                          <div className="tidysync-action-icon">
                            <Icon source={ExportIcon} />
                          </div>
                          <p className="tidysync-action-title">Export data</p>
                          <p className="tidysync-action-desc">
                            Pull products, collections, customers and more into platform-ready files.
                          </p>
                        </button>
                        <button
                          type="button"
                          className="tidysync-action-card is-ai"
                          onClick={() => setTab(4)}
                        >
                          <div className="tidysync-action-icon">
                            <Icon source={MagicIcon} />
                          </div>
                          <p className="tidysync-action-title">AI bulk edit</p>
                          <p className="tidysync-action-desc">
                            Describe a change — get a mutation plan and staggered diff before anything runs.
                          </p>
                        </button>
                        <button type="button" className="tidysync-action-card" onClick={() => setTab(5)}>
                          <div className="tidysync-action-icon">
                            <Icon source={ProductIcon} />
                          </div>
                          <p className="tidysync-action-title">Catalog health</p>
                          <p className="tidysync-action-desc">
                            Scan for missing images, thin content, and pricing anomalies.
                          </p>
                        </button>
                      </div>
                    </div>

                    {runningJobs.length > 0 && (
                      <BlockStack gap="300">
                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="h3" variant="headingSm">
                            Live progress
                          </Text>
                          <Badge tone="info">{`${runningJobs.length} running`}</Badge>
                        </InlineStack>
                        {runningJobs.map((job) => {
                          const pct =
                            job.rowCount > 0 ? Math.round((job.processedCount / job.rowCount) * 100) : 0;
                          return (
                            <div key={job.id} className="tidysync-job-live is-running">
                              <InlineStack align="space-between" blockAlign="center">
                                <BlockStack gap="100">
                                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                                    {job.type} · {job.fileName ?? "In progress"}
                                  </Text>
                                  <Text as="span" variant="bodySm" tone="subdued">
                                    {job.processedCount.toLocaleString()} / {job.rowCount.toLocaleString()}{" "}
                                    records
                                  </Text>
                                </BlockStack>
                                <Text as="span" variant="headingSm">
                                  {pct}%
                                </Text>
                              </InlineStack>
                              <div style={{ marginTop: 10 }}>
                                <ProgressBar progress={pct} size="small" tone="primary" />
                              </div>
                              <div className="tidysync-live-counters">
                                <Text as="span" variant="bodySm">
                                  Success <strong>{job.successCount}</strong>
                                </Text>
                                <Text as="span" variant="bodySm">
                                  Failed <strong>{job.failedCount}</strong>
                                </Text>
                              </div>
                            </div>
                          );
                        })}
                      </BlockStack>
                    )}

                    <Divider />

                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="h3" variant="headingSm">
                          Recent jobs
                        </Text>
                        <Button variant="plain" onClick={() => setTab(1)}>
                          View all
                        </Button>
                      </InlineStack>
                      {jobs.length === 0 ? (
                        <EmptyState
                          heading="No jobs yet"
                          action={{ content: "Import a file", onAction: () => setTab(2) }}
                          secondaryAction={{ content: "Try AI edit", onAction: () => setTab(4) }}
                          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                        >
                          <p>Import a catalog or describe a bulk change to get started.</p>
                        </EmptyState>
                      ) : (
                        jobs.slice(0, 5).map((job) => (
                          <div
                            key={job.id}
                            className={`tidysync-job-live${undoingId === job.id ? " is-undoing" : ""}`}
                          >
                            <InlineStack align="space-between" blockAlign="center" wrap={false}>
                              <InlineStack gap="300" blockAlign="center">
                                <Icon source={ClockIcon} tone="subdued" />
                                <BlockStack gap="100">
                                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                                    {job.type}
                                  </Text>
                                  <Text as="span" variant="bodySm" tone="subdued">
                                    {new Date(job.createdAt).toLocaleString()} · {job.successCount}/
                                    {job.rowCount} ok
                                  </Text>
                                </BlockStack>
                              </InlineStack>
                              <InlineStack gap="200" blockAlign="center">
                                {statusBadge(job.status)}
                                <Button size="slim" onClick={() => openJob(job.id)}>
                                  Review
                                </Button>
                              </InlineStack>
                            </InlineStack>
                          </div>
                        ))
                      )}
                    </BlockStack>
                  </BlockStack>
                )}

                {tab === 1 && (
                  <BlockStack gap="400">
                    <div>
                      <p className="tidysync-section-title">Jobs</p>
                      <p className="tidysync-section-sub">
                        Live counters update every few seconds while a job is running.
                      </p>
                    </div>
                    {jobs.length === 0 ? (
                      <EmptyState
                        heading="No jobs yet"
                        action={{ content: "Import a file", onAction: () => setTab(2) }}
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
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
                          { title: "Progress" },
                          { title: "Created" },
                          { title: "Actions" },
                        ]}
                        selectable={false}
                      >
                        {jobs.map((job, index) => (
                          <IndexTable.Row id={job.id} key={job.id} position={index}>
                            <IndexTable.Cell>
                              <Text as="span" fontWeight="semibold">
                                {job.type}
                              </Text>
                            </IndexTable.Cell>
                            <IndexTable.Cell>{statusBadge(job.status)}</IndexTable.Cell>
                            <IndexTable.Cell>
                              {job.status === "RUNNING" ? (
                                <BlockStack gap="100">
                                  <ProgressBar
                                    progress={
                                      job.rowCount > 0
                                        ? (job.processedCount / job.rowCount) * 100
                                        : 0
                                    }
                                    size="small"
                                  />
                                  <Text as="span" variant="bodySm" tone="subdued">
                                    {job.processedCount}/{job.rowCount} · ✓{job.successCount} · ✕
                                    {job.failedCount}
                                  </Text>
                                </BlockStack>
                              ) : (
                                `${job.successCount}/${job.rowCount}`
                              )}
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              {new Date(job.createdAt).toLocaleString()}
                            </IndexTable.Cell>
                            <IndexTable.Cell>
                              <InlineStack gap="200">
                                <Button size="slim" onClick={() => openJob(job.id)}>
                                  View
                                </Button>
                                {job.status === "COMPLETED" && job.type === "EXPORT" && (
                                  <Button size="slim" onClick={() => downloadExport(job.id, shop)}>
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

                {tab === 2 && (
                  <BlockStack gap="400">
                    <div>
                      <p className="tidysync-section-title">Import</p>
                      <p className="tidysync-section-sub">
                        Upload a catalog export. We suggest field mappings, show a diff, then wait for
                        your approval.
                      </p>
                    </div>
                    <InlineStack gap="400" wrap={false}>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <Select
                          label="Resource type"
                          options={RESOURCE_OPTIONS}
                          value={importResourceType}
                          onChange={setImportResourceType}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: 180 }}>
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
                      </div>
                    </InlineStack>
                    <FileDropzone loading={loading} onFile={handleImport} />
                  </BlockStack>
                )}

                {tab === 3 && (
                  <BlockStack gap="500">
                    <div>
                      <p className="tidysync-section-title">Export catalog data</p>
                      <p className="tidysync-section-sub">
                        Choose what to export and the destination format. Your file appears in Jobs when ready.
                      </p>
                    </div>

                    <div>
                      <Text as="h3" variant="headingSm">
                        Resource
                      </Text>
                      <div className="tidysync-feature-grid" style={{ marginTop: 12 }}>
                        {RESOURCE_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            className={`tidysync-feature-card is-clickable${
                              exportResourceType === opt.value ? " is-selected" : ""
                            }`}
                            onClick={() => setExportResourceType(opt.value)}
                          >
                            <div className="tidysync-feature-icon">
                              <Icon source={ProductIcon} />
                            </div>
                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                              {opt.label}
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              Export {opt.label.toLowerCase()} from this store
                            </Text>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Text as="h3" variant="headingSm">
                        Format
                      </Text>
                      <div className="tidysync-feature-grid" style={{ marginTop: 12 }}>
                        {[
                          {
                            value: "shopify",
                            title: "Shopify CSV",
                            desc: "Native Shopify Admin import format",
                          },
                          {
                            value: "woocommerce",
                            title: "WooCommerce",
                            desc: "Cross-platform product spreadsheet",
                          },
                          {
                            value: "bigcommerce",
                            title: "BigCommerce",
                            desc: "BigCommerce catalog-ready export",
                          },
                        ].map((fmt) => (
                          <button
                            key={fmt.value}
                            type="button"
                            className={`tidysync-feature-card is-clickable${
                              exportPlatform === fmt.value ? " is-selected" : ""
                            }`}
                            onClick={() => setExportPlatform(fmt.value)}
                          >
                            <div className="tidysync-feature-icon">
                              <Icon source={ExportIcon} />
                            </div>
                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                              {fmt.title}
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {fmt.desc}
                            </Text>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="tidysync-soft-panel">
                      <InlineStack align="space-between" blockAlign="center" wrap={false}>
                        <BlockStack gap="100">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            Ready to export {exportResourceType} → {exportPlatform}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Large catalogs run in the background with live progress on Jobs.
                          </Text>
                        </BlockStack>
                        <Button variant="primary" icon={ExportIcon} onClick={handleExport} loading={loading}>
                          Start export
                        </Button>
                      </InlineStack>
                    </div>
                  </BlockStack>
                )}

                {tab === 4 && (
                  <AiStudio
                    value={nlPrompt}
                    onChange={setNlPrompt}
                    onSubmit={handleNlBulkEdit}
                    loading={loading}
                    creditsRemaining={tenant?.plan?.aiCreditsRemaining}
                  />
                )}

                {tab === 5 && (
                  <BlockStack gap="500">
                    <div>
                      <p className="tidysync-section-title">Catalog health</p>
                      <p className="tidysync-section-sub">
                        Scan for catalog issues, then optionally rewrite thin content with your brand voice.
                      </p>
                    </div>

                    <div className="tidysync-feature-grid">
                      <div className="tidysync-feature-card">
                        <div className="tidysync-feature-icon is-warn">
                          <Icon source={AlertTriangleIcon} />
                        </div>
                        <Text as="h3" variant="headingSm">
                          Health scan
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Detect missing images, empty descriptions, and pricing anomalies.
                        </Text>
                        <ul className="tidysync-checklist">
                          <li>Missing media & thin SEO content</li>
                          <li>Price / compare-at mismatches</li>
                          <li>Results land in Jobs with severity tags</li>
                        </ul>
                        <div style={{ marginTop: 16 }}>
                          <Button
                            fullWidth
                            onClick={async () => {
                              setLoading(true);
                              try {
                                await gqlRequest(MUTATIONS.catalogScan, {}, shop);
                                setTab(1);
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
                        </div>
                      </div>

                      <div className="tidysync-feature-card">
                        <div className="tidysync-feature-icon is-ai">
                          <Icon source={MagicIcon} />
                        </div>
                        <Text as="h3" variant="headingSm">
                          AI content rewrite
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Rewrite up to 50 product descriptions using your brand voice.
                        </Text>
                        <div style={{ marginTop: 12 }}>
                          <TextField
                            label="Brand voice"
                            value={brandVoice}
                            onChange={setBrandVoice}
                            autoComplete="off"
                            multiline={2}
                            helpText="Example: warm, concise, premium lifestyle"
                          />
                        </div>
                        <div style={{ marginTop: 12 }}>
                          <Button
                            fullWidth
                            variant="primary"
                            onClick={async () => {
                              setLoading(true);
                              try {
                                await gqlRequest(MUTATIONS.contentRewrite, { brandVoice }, shop);
                                setTab(1);
                                await loadData();
                              } catch (e) {
                                setError(e instanceof Error ? e.message : "Rewrite failed");
                              } finally {
                                setLoading(false);
                              }
                            }}
                            loading={loading}
                          >
                            Rewrite product content
                          </Button>
                        </div>
                      </div>
                    </div>
                  </BlockStack>
                )}

                {tab === 6 && (
                  <BlockStack gap="400">
                    <div>
                      <p className="tidysync-section-title">Audit log</p>
                      <p className="tidysync-section-sub">
                        Every import, export, AI edit, and undo is recorded for support and compliance.
                      </p>
                    </div>
                    <InlineStack gap="200">
                      <Button icon={RefreshIcon} onClick={loadAudit}>
                        Refresh
                      </Button>
                      <Button onClick={() => downloadAuditExport(shop)}>Export CSV</Button>
                    </InlineStack>
                    {auditLogs.length === 0 ? (
                      <div className="tidysync-empty-block">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          No audit events yet
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Run an import, export, or AI edit and activity will appear here.
                        </Text>
                      </div>
                    ) : (
                      auditLogs.map((log) => (
                        <div key={log.id} className="tidysync-job-live">
                          <InlineStack align="space-between" blockAlign="center">
                            <BlockStack gap="100">
                              <Text as="p" variant="bodyMd" fontWeight="semibold">
                                {log.action}
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {new Date(log.createdAt).toLocaleString()}
                              </Text>
                            </BlockStack>
                            <Badge>Event</Badge>
                          </InlineStack>
                        </div>
                      ))
                    )}
                  </BlockStack>
                )}

                {tab === 7 && (
                  <BlockStack gap="500">
                    <div>
                      <p className="tidysync-section-title">Schedules</p>
                      <p className="tidysync-section-sub">
                        Automate recurring exports and scans so catalog work runs without babysitting.
                      </p>
                    </div>

                    <div className="tidysync-feature-grid">
                      <button
                        type="button"
                        className="tidysync-feature-card is-clickable"
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
                        <div className="tidysync-feature-icon">
                          <Icon source={ExportIcon} />
                        </div>
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          Daily export
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Export products every day into Jobs downloads.
                        </Text>
                      </button>
                      <button
                        type="button"
                        className="tidysync-feature-card is-clickable"
                        onClick={async () => {
                          await gqlRequest(
                            MUTATIONS.createSchedule,
                            {
                              name: "Weekly health scan",
                              jobType: "CATALOG_HEALTH_SCAN",
                              schedule: "weekly",
                              config: {},
                            },
                            shop,
                          );
                          await loadSchedules();
                        }}
                      >
                        <div className="tidysync-feature-icon is-warn">
                          <Icon source={AlertTriangleIcon} />
                        </div>
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          Weekly health scan
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Catch missing images and thin content every week.
                        </Text>
                      </button>
                    </div>

                    <div className="tidysync-soft-panel">
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="200" blockAlign="center">
                          <Icon source={CalendarIcon} />
                          <Text as="p" variant="headingSm">
                            Active schedules
                          </Text>
                        </InlineStack>
                        <Button icon={RefreshIcon} onClick={loadSchedules}>
                          Refresh
                        </Button>
                      </InlineStack>
                    </div>

                    {schedules.length === 0 ? (
                      <div className="tidysync-empty-block">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          No schedules yet
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Pick a template above to create your first automated job.
                        </Text>
                      </div>
                    ) : (
                      schedules.map((s) => (
                        <div key={s.id} className="tidysync-schedule-card">
                          <InlineStack gap="300" blockAlign="center">
                            <div className="tidysync-feature-icon" style={{ marginBottom: 0 }}>
                              <Icon source={CalendarIcon} />
                            </div>
                            <BlockStack gap="100">
                              <Text as="p" variant="bodyMd" fontWeight="semibold">
                                {s.name}
                              </Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                {s.jobType} · {s.schedule}
                              </Text>
                            </BlockStack>
                          </InlineStack>
                          <Badge tone="success">Enabled</Badge>
                        </div>
                      ))
                    )}
                  </BlockStack>
                )}

                {tab === 8 && (
                  <BlockStack gap="500">
                    <div className="tidysync-billing-hero">
                      <InlineStack align="space-between" blockAlign="start" wrap>
                        <div>
                          <Text as="h2" variant="headingMd">
                            <span style={{ color: "#fff" }}>
                              {tenant?.plan?.name ?? "Free"} plan
                            </span>
                          </Text>
                          <div className="meta">
                            {tenant?.productCount?.toLocaleString() ?? 0} products ·{" "}
                            {tenant?.plan?.aiCreditsRemaining ?? "—"} AI credits left
                            {tenant?.billingBypass ? " · Testing mode on" : ""}
                          </div>
                        </div>
                        <div className="tidysync-feature-icon" style={{ background: "rgba(255,255,255,0.12)", color: "#fff", marginBottom: 0 }}>
                          <Icon source={CashDollarIcon} />
                        </div>
                      </InlineStack>
                    </div>

                    <div>
                      <p className="tidysync-section-title">Choose a plan</p>
                      <p className="tidysync-section-sub">
                        Upgrade for higher product limits and more AI credits. Billing runs through Shopify.
                      </p>
                    </div>

                    <div className="tidysync-plan-cards">
                      {plans.map((plan) => {
                        const isCurrent = tenant?.plan?.slug === plan.slug;
                        return (
                          <div
                            key={plan.id}
                            className={`tidysync-plan-card${isCurrent ? " is-current" : ""}`}
                          >
                            <InlineStack align="space-between" blockAlign="center">
                              <Text as="h3" variant="headingSm">
                                {plan.name}
                              </Text>
                              {isCurrent && <Badge tone="success">Current</Badge>}
                            </InlineStack>
                            <div className="tidysync-plan-price">
                              {plan.isFree ? "Free" : `$${(plan.priceMonthlyCents / 100).toFixed(0)}`}
                              {!plan.isFree && (
                                <span style={{ fontSize: 14, fontWeight: 500, color: "#6d7175" }}>
                                  /mo
                                </span>
                              )}
                            </div>
                            <ul className="tidysync-checklist">
                              <li>{plan.maxProducts.toLocaleString()} products</li>
                              <li>{plan.aiCreditsPerMonth} AI credits / month</li>
                              <li>{plan.isFree ? "Core import & export" : "Priority AI + scheduled jobs"}</li>
                            </ul>
                            <div style={{ marginTop: "auto", paddingTop: 8 }}>
                              {isCurrent ? (
                                <Button fullWidth disabled>
                                  Current plan
                                </Button>
                              ) : plan.isFree ? (
                                <Button fullWidth disabled={tenant?.plan?.isFree}>
                                  Included
                                </Button>
                              ) : (
                                <Button
                                  fullWidth
                                  variant="primary"
                                  onClick={async () => {
                                    const result = await gqlRequest<{
                                      createPlanSubscription: { confirmationUrl: string };
                                    }>(MUTATIONS.subscribePlan, { planSlug: plan.slug }, shop);
                                    window.open(result.createPlanSubscription.confirmationUrl, "_top");
                                  }}
                                >
                                  Upgrade to {plan.name}
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="tidysync-feature-grid">
                      <div className="tidysync-feature-card">
                        <div className="tidysync-feature-icon is-ai">
                          <Icon source={MagicIcon} />
                        </div>
                        <Text as="h3" variant="headingSm">
                          Buy AI credits
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          $1 per credit · one-time Shopify charge
                        </Text>
                        <div style={{ marginTop: 12 }}>
                          <TextField
                            label="Credits"
                            value={creditTopUp}
                            onChange={setCreditTopUp}
                            autoComplete="off"
                            type="number"
                          />
                        </div>
                        <div style={{ marginTop: 12 }}>
                          <Button
                            fullWidth
                            onClick={async () => {
                              const credits = Number(creditTopUp) || 10;
                              const result = await gqlRequest<{
                                purchaseCreditTopUp: { confirmationUrl: string };
                              }>(MUTATIONS.purchaseCredits, { credits }, shop);
                              window.open(result.purchaseCreditTopUp.confirmationUrl, "_top");
                            }}
                            disabled={tenant?.plan?.isFree}
                          >
                            Purchase credits
                          </Button>
                        </div>
                      </div>

                      <div className="tidysync-feature-card">
                        <div className="tidysync-feature-icon">
                          <Icon source={ClockIcon} />
                        </div>
                        <Text as="h3" variant="headingSm">
                          Job notifications
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Get emailed when large jobs finish or fail.
                        </Text>
                        <div style={{ marginTop: 12 }}>
                          <TextField
                            label="Notification email"
                            value={notifyEmail}
                            onChange={setNotifyEmail}
                            autoComplete="email"
                          />
                        </div>
                        <div style={{ marginTop: 12 }}>
                          <Button
                            fullWidth
                            onClick={async () => {
                              await gqlRequest(
                                MUTATIONS.updateNotifications,
                                { email: notifyEmail, emailOnComplete: true, emailOnFailure: true },
                                shop,
                              );
                            }}
                          >
                            Save notifications
                          </Button>
                        </div>
                      </div>
                    </div>
                  </BlockStack>
                )}
            </div>
          </div>
        </Layout.Section>
      </Layout>

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Review before commit"
        primaryAction={
          selectedJob?.status === "PREVIEW"
            ? {
                content: "Approve & run",
                onAction: () => selectedJob && handleApprove(selectedJob.id),
                loading,
              }
            : undefined
        }
        secondaryActions={[{ content: "Close", onAction: () => setPreviewOpen(false) }]}
        size="large"
      >
        <Modal.Section>
          <DiffPreviewPanel
            impactSummary={selectedJob?.impactSummary}
            anomalies={selectedJob?.diffPreview?.anomalies}
            steps={selectedJob?.mutationPlan?.steps}
            rows={selectedJob?.diffPreview?.rows}
            failedItems={selectedJob?.lineItems?.filter((l) => l.status === "FAILED")}
            streamPlan={selectedJob?.status === "PREVIEW"}
          />
        </Modal.Section>
      </Modal>

      <Modal
        open={mappingOpen}
        onClose={() => setMappingOpen(false)}
        title="Map columns before import"
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
    </div>
  );
}
