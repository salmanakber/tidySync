"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  AutomationIcon,
  DatabaseIcon,
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
import { mentionValueToPrompt } from "./ProductMentionTextarea";
import { DiffPreviewPanel } from "./DiffPreviewPanel";
import { DashboardSkeleton } from "./DashboardSkeleton";
import { PlatformPicker } from "./PlatformPicker";
import { ImportProgressLoader, type ImportProgressState } from "./ImportProgressLoader";
import { ProductSeoStudio } from "./ProductSeoStudio";
import { AgentStudio } from "./AgentStudio";
import { BackupStudio } from "./BackupStudio";
import { DuplicateStudio } from "./DuplicateStudio";
import { GoogleSheetsStudio } from "./GoogleSheetsStudio";
import { MigrationWizard } from "./MigrationWizard";
import { WorkspaceNav } from "./WorkspaceNav";
import { LiveJobsBar } from "./LiveJobsBar";
import { StickyJobProgress } from "./StickyJobProgress";
import { AppAlertStack } from "./AppAlert";
import { subscribeToJobProgress } from "../lib/job-events";
import {
  alertFromError,
  planUsageAlerts,
  type AppAlertModel,
  errorMessage,
} from "../lib/graphql-errors";
import {
  isAgentPlanLocked,
  isBackupsPlanLocked,
  isSchedulesPlanLocked,
  catalogAtLimit,
  upgradePlanLabel,
} from "../lib/plan-features";
import { PlanUpgradePanel } from "./PlanUpgradePanel";
import { useShop } from "../providers";

const IMPORT_PLATFORMS = [
  { key: "csv", name: "Generic CSV", blurb: "Custom / unknown spreadsheet" },
  { key: "shopify", name: "Shopify", blurb: "Native Shopify CSV" },
  { key: "woocommerce", name: "WooCommerce", blurb: "WordPress product export" },
  { key: "bigcommerce", name: "BigCommerce", blurb: "BigCommerce catalog" },
  { key: "magento", name: "Magento / Adobe", blurb: "Magento Commerce CSV" },
  { key: "squarespace", name: "Squarespace", blurb: "Squarespace Commerce" },
  { key: "etsy", name: "Etsy", blurb: "Etsy listing CSV" },
  { key: "wix", name: "Wix", blurb: "Wix Stores export" },
  { key: "amazon", name: "Amazon", blurb: "Amazon seller flat file" },
  { key: "ebay", name: "eBay", blurb: "eBay File Exchange" },
  { key: "prestashop", name: "PrestaShop", blurb: "PrestaShop product CSV" },
  { key: "opencart", name: "OpenCart", blurb: "OpenCart export" },
  { key: "google_merchant", name: "Google Merchant", blurb: "Merchant Center feed" },
  { key: "square", name: "Square", blurb: "Square item library" },
  { key: "lightspeed", name: "Lightspeed", blurb: "Lightspeed Retail / eCom" },
  { key: "ecwid", name: "Ecwid", blurb: "Ecwid product CSV" },
  { key: "tiktok_shop", name: "TikTok Shop", blurb: "TikTok product template" },
  { key: "facebook_catalog", name: "Meta Catalog", blurb: "Facebook / Instagram catalog" },
  { key: "shift4shop", name: "Shift4Shop", blurb: "Shift4Shop / 3dcart" },
];

const EXPORT_PLATFORMS = IMPORT_PLATFORMS.filter((p) => p.key !== "csv");

interface Tenant {
  shopDomain: string;
  shopName?: string;
  productCount: number;
  aiCreditsUsed: number;
  extraAiCredits?: number;
  agentRunsUsed?: number;
  agentRunsRemaining?: number;
  billingStatus?: string;
  billingBypass?: boolean;
  installApproved?: boolean;
  plan?: {
    name: string;
    slug?: string;
    aiCreditsRemaining?: number;
    maxProducts: number;
    maxBackups?: number;
    agentEnabled?: boolean;
    agentRunsPerMonth?: number;
    scheduledJobs?: boolean;
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
  startedAt?: string;
  finishedAt?: string;
  fileName?: string;
  nlPrompt?: string;
  resourceType?: string;
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
  const [aiLoading, setAiLoading] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AppAlertModel[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dismissedPlanAlertKeys, setDismissedPlanAlertKeys] = useState<Set<string>>(new Set());
  const jobStatusRef = useRef<Map<string, string>>(new Map());
  const jobToastSeededRef = useRef(false);
  const toastedJobIdsRef = useRef<Set<string>>(new Set());
  const [exportPlatform, setExportPlatform] = useState("shopify");
  const [importPlatform, setImportPlatform] = useState("csv");
  const [detectedPlatform, setDetectedPlatform] = useState<string | null>(null);
  const [detectedConfidence, setDetectedConfidence] = useState<number | undefined>();
  const [importResourceType, setImportResourceType] = useState("products");
  const [exportResourceType, setExportResourceType] = useState("products");
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [mappingTemplates, setMappingTemplates] = useState<
    Array<{ id: string; name: string; platformKey: string; mappings: unknown }>
  >([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [overlayProgress, setOverlayProgress] = useState<ImportProgressState | null>(null);
  const [stickyProgress, setStickyProgress] = useState<ImportProgressState | null>(null);
  const [mappingJobId, setMappingJobId] = useState("");
  const [mappingRows, setMappingRows] = useState<
    Array<{
      sourceColumn: string;
      targetField: string;
      suggested?: boolean;
      confidence?: number;
      matchReason?: string | null;
    }>
  >([]);
  const [auditLogs, setAuditLogs] = useState<Array<{ id: string; action: string; createdAt: string }>>([]);
  const [schedules, setSchedules] = useState<
    Array<{
      id: string;
      name: string;
      schedule: string;
      jobType: string;
      enabled?: boolean;
      lastRunAt?: string | null;
      nextRunAt?: string | null;
    }>
  >([]);
  const [scheduleActionId, setScheduleActionId] = useState<string | null>(null);
  const [migrationBackupDone, setMigrationBackupDone] = useState(false);
  const [cancelingJobId, setCancelingJobId] = useState<string | null>(null);
  const [agentAutoStartSeo, setAgentAutoStartSeo] = useState(false);
  const [brandVoice, setBrandVoice] = useState("professional, helpful");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [creditTopUp, setCreditTopUp] = useState("10");
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const jobEventCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => jobEventCleanupRef.current?.();
  }, []);

  const goToBilling = useCallback(() => setTab(11), []);

  const pushAlert = useCallback((alert: Omit<AppAlertModel, "id">) => {
    const id = `${alert.code ?? "alert"}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const next: AppAlertModel = {
      ...alert,
      id,
      autoDismissMs:
        alert.autoDismissMs ??
        (alert.tone === "success" || alert.code === "JOB_SUCCESS" ? 4500 : undefined),
    };
    setAlerts((prev) => [...prev, next]);
  }, []);

  const showOperationalError = useCallback(
    (err: unknown, context?: string) => {
      const model = alertFromError(err, goToBilling);
      if (context) {
        model.message = `${context}: ${model.message}`;
      }
      pushAlert(model);
      setError(model.message);
    },
    [goToBilling, pushAlert],
  );

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    setError(null);
  }, []);

  const loadData = useCallback(async (options?: { refreshCatalog?: boolean }) => {
    if (!shop) return;
    try {
      const tenantData = await gqlRequest<{ meTenant: Tenant }>(
        QUERIES.meTenant,
        { refreshCatalog: options?.refreshCatalog ?? false },
        shop,
      );
      setTenant(tenantData.meTenant);
      if (tenantData.meTenant?.shopDomain) {
        setSessionShop(tenantData.meTenant.shopDomain);
      }
      const jobsData = await gqlRequest<{ jobs: Job[] }>(QUERIES.jobs, { limit: 8 }, shop);
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
      const message = errorMessage(e, "Failed to load dashboard data");
      if (
        message.includes("Unauthorized") ||
        message.includes("not installed") ||
        message.includes("merchant session")
      ) {
        setError("Shopify session missing. Click Connect to install / re-authorize TidySync.");
        pushAlert({
          tone: "warning",
          title: "Session expired",
          message: "Open TidySync from Shopify Admin, or click Connect to re-authorize.",
          primaryAction: { content: "Connect", onAction: beginInstall },
        });
      } else {
        showOperationalError(e, "Dashboard load failed");
      }
    }
  }, [shop, beginInstall, pushAlert, showOperationalError]);

  const beginJobProgress = useCallback(
    (
      jobId: string,
      meta: {
        fileName?: string;
        rowCount?: number;
        isImport?: boolean;
        kind?: ImportProgressState["kind"];
        label?: string;
      },
    ) => {
      jobEventCleanupRef.current?.();
      const kind =
        meta.kind ??
        (meta.isImport ? "import" : "bulk");
      const defaultMessage = (() => {
        switch (kind) {
          case "export":
            return "Pulling catalog data and packaging your file…";
          case "agent":
            return "Agent is planning and executing your mission…";
          case "backup":
            return "Snapshotting products to secure storage…";
          case "bulk":
            return "Applying your approved changes to Shopify…";
          default:
            return "Creating products in your Shopify store…";
        }
      })();

      setStickyProgress({
        phase: "importing",
        jobId,
        kind,
        label: meta.label,
        fileName: meta.fileName,
        rowCount: meta.rowCount ?? 0,
        successCount: 0,
        failedCount: 0,
        processedCount: 0,
        message: defaultMessage,
      });

      jobEventCleanupRef.current = subscribeToJobProgress(
        jobId,
        shop,
        (ev) => {
          const done = ["COMPLETED", "FAILED", "CANCELLED"].includes(ev.status);
          const rowTotal = ev.rowCount > 0 ? ev.rowCount : meta.rowCount ?? 0;
          const progressMessage = (() => {
            if (done) {
              if (ev.status === "COMPLETED") {
                if (kind === "export") {
                  return "Your file is ready — download below or from Jobs.";
                }
                return `${ev.successCount.toLocaleString()} in Shopify · ${ev.failedCount} failed`;
              }
              return "Some rows could not be processed — see Jobs for details";
            }
            if (kind === "agent") {
              return rowTotal > 0
                ? `Agent working · ${ev.successCount.toLocaleString()} of ${rowTotal.toLocaleString()} steps`
                : "Agent is working on your catalog mission…";
            }
            if (kind === "export") {
              return rowTotal > 0
                ? `Exported ${ev.successCount.toLocaleString()} of ${rowTotal.toLocaleString()} rows`
                : "Building your export file…";
            }
            if (rowTotal > 0) {
              return `${ev.successCount.toLocaleString()} of ${rowTotal.toLocaleString()} live in Shopify`;
            }
            return defaultMessage;
          })();

          setStickyProgress({
            phase: done ? (ev.status === "COMPLETED" ? "complete" : "failed") : "importing",
            jobId,
            kind,
            label: meta.label,
            fileName: meta.fileName,
            rowCount: rowTotal,
            successCount: ev.successCount,
            failedCount: ev.failedCount,
            processedCount: ev.successCount,
            message: progressMessage,
          });
          if (done) {
            jobEventCleanupRef.current = null;
            if (ev.status === "COMPLETED" || ev.status === "FAILED") {
              toastedJobIdsRef.current.add(jobId);
            }
            if (ev.status === "COMPLETED") {
              if (kind === "export") {
                pushAlert({
                  tone: "success",
                  code: "EXPORT_SUCCESS",
                  title: "Export ready",
                  message:
                    meta.label
                      ? `${meta.label} is ready — download from Export or Jobs.`
                      : "Your export file is ready — download from Export or Jobs.",
                  autoDismissMs: 6000,
                });
              } else {
                pushAlert({
                  tone: "success",
                  code: "JOB_SUCCESS",
                  title: "Job completed",
                  message:
                    ev.successCount > 0
                      ? `${ev.successCount.toLocaleString()} items processed successfully${
                          ev.failedCount ? ` · ${ev.failedCount} failed` : ""
                        }`
                      : "Your job finished successfully.",
                  autoDismissMs: 4500,
                });
              }
            } else if (ev.status === "FAILED") {
              pushAlert({
                tone: "critical",
                code: "JOB_FAILED",
                title: "Job failed",
                message: "Some rows could not be processed — check Jobs for details.",
                autoDismissMs: 7000,
              });
            }
            window.setTimeout(() => setStickyProgress(null), 3200);
            void loadData();
          }
        },
        () => void loadData(),
      );
    },
    [shop, loadData, pushAlert],
  );

  useEffect(() => {
    if (!shopReady) return;
    if (!shop || !authenticated) {
      setBootstrapping(false);
      return;
    }
    setBootstrapping(true);
    loadData().finally(() => setBootstrapping(false));
  }, [loadData, shopReady, shop, authenticated]);

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    const platformName =
      EXPORT_PLATFORMS.find((p) => p.key === exportPlatform)?.name ?? exportPlatform;
    const exportLabel = `${exportResourceType} → ${platformName}`;
    try {
      const result = await gqlRequest<{
        createExportJob: { id: string; status: string; rowCount?: number; resourceType?: string };
      }>(
        MUTATIONS.createExport,
        {
          platformKey: exportPlatform === "shopify" ? null : exportPlatform,
          resourceType: exportResourceType,
        },
        shop,
      );
      const job = result.createExportJob;
      beginJobProgress(job.id, {
        kind: "export",
        label: exportLabel,
        fileName: exportLabel,
        rowCount: job.rowCount,
      });
      await loadData();
    } catch (e) {
      showOperationalError(e, "Export failed");
    } finally {
      setLoading(false);
    }
  };

  const recentExports = useMemo(
    () => jobs.filter((j) => j.type === "EXPORT").slice(0, 6),
    [jobs],
  );

  const formatExportLabel = (job: Job) => {
    const resource = job.resourceType ?? "products";
    const platform =
      job.fileName?.includes("→")
        ? job.fileName
        : `${resource} export`;
    return platform;
  };

  const handleImport = async (file: File) => {
    setLoading(true);
    setError(null);
    setOverlayProgress({ phase: "uploading", fileName: file.name, message: "Securely uploading your catalog…" });
    try {
      const uploaded = await uploadFile(file, shop);
      setOverlayProgress({
        phase: "analyzing",
        fileName: file.name,
        message: "Detecting platform and reading columns…",
      });

      const result = await gqlRequest<{
        uploadImportFile: {
          id: string;
          status: string;
          sourcePlatform?: string;
          rowCount?: number;
          diffPreview?: {
            detection?: { platformKey?: string; confidence?: number };
          };
        };
      }>(
        MUTATIONS.uploadImport,
        {
          filePath: uploaded.filePath,
          fileName: uploaded.fileName,
          resourceType: importResourceType,
        },
        shop,
      );

      const jobId = result.uploadImportFile.id;
      if (result.uploadImportFile.status === "FAILED") {
        throw new Error("File analysis failed");
      }

      const detected =
        result.uploadImportFile.diffPreview?.detection?.platformKey ??
        result.uploadImportFile.sourcePlatform ??
        null;
      const confidence = result.uploadImportFile.diffPreview?.detection?.confidence;
      if (detected && detected !== "unknown") {
        setDetectedPlatform(detected);
        setDetectedConfidence(confidence);
        setImportPlatform(detected === "unknown" ? "csv" : detected);
      }

      setOverlayProgress({
        phase: "mapping",
        fileName: file.name,
        jobId,
        rowCount: result.uploadImportFile.rowCount ?? 0,
        message: "Opening column mapper…",
      });

      setMappingJobId(jobId);
      setMappingRows([]);
      setOverlayProgress(null);
      setMappingOpen(true);
      await loadData();
    } catch (e) {
      const message = errorMessage(e, "Import failed");
      setOverlayProgress({
        phase: "failed",
        fileName: file.name,
        message,
      });
      showOperationalError(e, "Import failed");
      setTimeout(() => setOverlayProgress(null), 4500);
    } finally {
      setLoading(false);
    }
  };

  const remapColumns = async () => {
    const mappings = await gqlRequest<{
      suggestFieldMappings: Array<{
        sourceColumn: string;
        targetField: string;
        suggested: boolean;
        confidence?: number;
        matchReason?: string | null;
      }>;
    }>(MUTATIONS.suggestMappings, { jobId: mappingJobId, platformKey: importPlatform, useAi: true }, shop);
    setMappingRows(mappings.suggestFieldMappings);
    return mappings.suggestFieldMappings;
  };

  const handleNlBulkEdit = async () => {
    if (!mentionValueToPrompt(nlPrompt).trim()) return;
    setAiLoading(true);
    setError(null);
    try {
      const result = await gqlRequest<{ generateNlBulkEdit: Job }>(
        MUTATIONS.nlBulkEdit,
        { prompt: mentionValueToPrompt(nlPrompt) },
        shop,
      );
      setSelectedJob(result.generateNlBulkEdit);
      setPreviewOpen(true);
      setNlPrompt("");
      void loadData();
    } catch (e) {
      showOperationalError(e, "Bulk edit failed");
    } finally {
      setAiLoading(false);
    }
  };

  const handleApprove = async (jobId: string) => {
    const previewMeta = selectedJob;
    setApproveLoading(true);
    setError(null);
    setNotice(null);
    setPreviewOpen(false);
    setSelectedJob(null);
    setTab(0);

    try {
      await gqlRequest(MUTATIONS.approveJob, { jobId }, shop);

      const jobDetail = await gqlRequest<{ job: Job }>(QUERIES.job, { id: jobId }, shop);
      const job = jobDetail.job;
      const isImport = job.type === "IMPORT";
      const tracksLive =
        job.type === "IMPORT" || job.type === "BULK_EDIT";

      if (tracksLive) {
        beginJobProgress(jobId, {
          fileName: job.fileName ?? job.nlPrompt ?? previewMeta?.fileName,
          rowCount: job.rowCount,
          isImport,
          kind: isImport ? "import" : "bulk",
        });
        setNotice(
          isImport
            ? "Import started — watch live counts below."
            : "Changes are applying — watch live progress below.",
        );
      } else {
        setNotice("Job approved and queued.");
      }

      void loadData();
    } catch (e) {
      showOperationalError(e, "Approve failed");
    } finally {
      setApproveLoading(false);
    }
  };

  const handleUndo = async (jobId: string) => {
    setUndoingId(jobId);
    setLoading(true);
    try {
      await gqlRequest(MUTATIONS.undoJob, { jobId }, shop);
      await loadData();
    } catch (e) {
      showOperationalError(e, "Undo failed");
    } finally {
      setLoading(false);
      window.setTimeout(() => setUndoingId(null), 500);
    }
  };

  const openJob = async (jobId: string) => {
    const detail = await gqlRequest<{ job: Job }>(QUERIES.job, { id: jobId }, shop);
    const job = detail.job;
    if (job.type === "IMPORT" && job.status === "MAPPING") {
      setMappingJobId(job.id);
      setMappingRows([]);
      setImportPlatform("csv");
      setMappingOpen(true);
      return;
    }
    setSelectedJob(job);
    setPreviewOpen(true);
  };

  const handleGoogleSheetJobStarted = useCallback(
    (
      jobId: string,
      meta?: {
        status?: string;
        type?: string;
        rowCount?: number;
        fileName?: string;
      },
    ) => {
      if (meta?.status === "MAPPING") {
        setMappingJobId(jobId);
        setMappingRows([]);
        setImportPlatform("csv");
        setMappingOpen(true);
        setStickyProgress(null);
        pushAlert({
          tone: "info",
          title: "Map your spreadsheet",
          message:
            "Match columns from your Google Sheet to Shopify fields. Nothing is imported until you preview and approve.",
        });
        void loadData();
        return;
      }
      if (meta?.status === "PREVIEW" && meta?.type === "IMPORT") {
        void (async () => {
          const detail = await gqlRequest<{ job: Job }>(QUERIES.job, { id: jobId }, shop);
          setSelectedJob(detail.job);
          setPreviewOpen(true);
          await loadData();
        })();
        return;
      }
      beginJobProgress(jobId, {
        kind: "import",
        rowCount: meta?.rowCount,
        fileName: meta?.fileName,
      });
      void loadData();
    },
    [shop, beginJobProgress, pushAlert, loadData],
  );

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
    { id: "migrate", content: "Migrate" },
    { id: "import", content: "Import" },
    { id: "export", content: "Export" },
    { id: "duplicates", content: "Duplicates" },
    { id: "ai", content: "AI Edit" },
    { id: "seo", content: "SEO" },
    { id: "health", content: "Health" },
    { id: "audit", content: "Audit" },
    { id: "schedules", content: "Schedules" },
    { id: "settings", content: "Billing" },
    { id: "agent", content: "Agent" },
    { id: "backups", content: "Backups" },
  ];

  useEffect(() => {
    if (!shop) return;
    if (tab === 9) void loadAudit();
    if (tab === 10) void loadSchedules();
  }, [tab, shop]);

  const loadAudit = async () => {
    const data = await gqlRequest<{ auditLogs: typeof auditLogs }>(QUERIES.auditLogs, { limit: 50 }, shop);
    setAuditLogs(data.auditLogs);
  };

  const loadSchedules = async () => {
    const data = await gqlRequest<{ scheduledJobs: typeof schedules }>(QUERIES.scheduledJobs, {}, shop);
    setSchedules(data.scheduledJobs);
  };

  const handleDeleteSchedule = async (id: string) => {
    setScheduleActionId(id);
    try {
      await gqlRequest(MUTATIONS.deleteSchedule, { id }, shop);
      await loadSchedules();
    } catch (e) {
      showOperationalError(e, "Could not delete schedule");
    } finally {
      setScheduleActionId(null);
    }
  };

  const handleToggleSchedule = async (id: string, enabled: boolean) => {
    setScheduleActionId(id);
    try {
      await gqlRequest(MUTATIONS.updateSchedule, { id, enabled }, shop);
      await loadSchedules();
    } catch (e) {
      showOperationalError(e, "Could not update schedule");
    } finally {
      setScheduleActionId(null);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    setCancelingJobId(jobId);
    try {
      await gqlRequest(MUTATIONS.cancelJob, { jobId }, shop);
      await loadData();
    } catch (e) {
      showOperationalError(e, "Could not cancel job");
    } finally {
      setCancelingJobId(null);
    }
  };

  const runningJobs = useMemo(
    () => jobs.filter((j) => j.status === "RUNNING" || j.status === "QUEUED"),
    [jobs],
  );

  useEffect(() => {
    if (!shop || runningJobs.length === 0) return;
    const timer = window.setInterval(() => void loadData(), 3500);
    return () => window.clearInterval(timer);
  }, [shop, runningJobs.length, loadData]);

  // Toast when jobs finish (including ones not tracked via SSE import progress)
  useEffect(() => {
    if (jobs.length === 0) return;
    const prev = jobStatusRef.current;
    if (!jobToastSeededRef.current) {
      jobStatusRef.current = new Map(jobs.map((j) => [j.id, j.status]));
      jobToastSeededRef.current = true;
      return;
    }

    for (const job of jobs) {
      const was = prev.get(job.id);
      if (!was) continue;
      if (toastedJobIdsRef.current.has(job.id)) continue;
      if ((was === "RUNNING" || was === "QUEUED") && job.status === "COMPLETED") {
        toastedJobIdsRef.current.add(job.id);
        if (job.type === "EXPORT") {
          pushAlert({
            tone: "success",
            code: "EXPORT_SUCCESS",
            title: "Export ready",
            message: "Your export file is ready — download from Export or Jobs.",
            autoDismissMs: 6000,
          });
        } else {
          const label = job.type.replace(/_/g, " ");
          pushAlert({
            tone: "success",
            code: "JOB_SUCCESS",
            title: `${label} completed`,
            message:
              job.successCount > 0
                ? `${job.successCount.toLocaleString()} ok${
                    job.failedCount ? ` · ${job.failedCount} failed` : ""
                  }`
                : "Finished successfully.",
            autoDismissMs: 4500,
          });
        }
      } else if ((was === "RUNNING" || was === "QUEUED") && job.status === "FAILED") {
        toastedJobIdsRef.current.add(job.id);
        pushAlert({
          tone: "critical",
          code: "JOB_FAILED",
          title: `${job.type.replace(/_/g, " ")} failed`,
          message: job.errorSummary?.slice(0, 160) || "Check the Jobs tab for details.",
          autoDismissMs: 7000,
        });
      }
    }
    jobStatusRef.current = new Map(jobs.map((j) => [j.id, j.status]));
  }, [jobs, pushAlert]);

  const productUsage = tenant?.plan?.maxProducts
    ? Math.min(100, Math.round((tenant.productCount / tenant.plan.maxProducts) * 100))
    : 0;

  const needsBilling =
    tenant &&
    !tenant.billingBypass &&
    tenant.billingStatus &&
    tenant.billingStatus !== "ACTIVE" &&
    !tenant.plan?.isFree;

  const planGates = useMemo(() => {
    const plan = tenant?.plan;
    return {
      agent: isAgentPlanLocked(plan),
      schedules: isSchedulesPlanLocked(plan),
      backups: isBackupsPlanLocked(plan),
      catalogFull: tenant ? catalogAtLimit(tenant) : false,
    };
  }, [tenant]);

  const lockedNavTabs = useMemo(
    () => ({
      agent: planGates.agent,
      schedules: planGates.schedules,
      backups: planGates.backups,
    }),
    [planGates],
  );

  const upgradeLabel = upgradePlanLabel(tenant?.plan);

  const planAlerts = useMemo(() => {
    if (!tenant) return [] as AppAlertModel[];
    return planUsageAlerts(tenant, goToBilling)
      .map((alert, index) => ({
        ...alert,
        id: `plan-${alert.code ?? "info"}-${index}`,
      }))
      .filter((alert) => !dismissedPlanAlertKeys.has(alert.id));
  }, [tenant, goToBilling, dismissedPlanAlertKeys]);

  const dismissPlanAlert = (id: string) => {
    setDismissedPlanAlertKeys((prev) => new Set(prev).add(id));
  };

  const allAlerts = useMemo(() => [...planAlerts, ...alerts], [planAlerts, alerts]);

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
    <AppAlertStack
      mode="toasts"
      alerts={allAlerts}
      onDismiss={(id) => {
        if (id.startsWith("plan-")) dismissPlanAlert(id);
        else dismissAlert(id);
      }}
    />
    <Page
      fullWidth
      title="TidySync"
      subtitle={tenant?.shopName ?? tenant?.shopDomain ?? shop}
      primaryAction={{
        content: "Refresh",
        icon: RefreshIcon,
        onAction: () => loadData({ refreshCatalog: true }),
      }}
      secondaryActions={[
        { content: "Import", onAction: () => setTab(3) },
        { content: "AI edit", onAction: () => setTab(6) },
      ]}
    >
      <Layout>
        {allAlerts.some(
          (a) =>
            a.tone !== "success" &&
            a.code !== "JOB_SUCCESS" &&
            a.code !== "JOB_FAILED" &&
            a.code !== "EXPORT_SUCCESS",
        ) && (
          <Layout.Section>
            <AppAlertStack
              mode="banners"
              alerts={allAlerts}
              onDismiss={(id) => {
                if (id.startsWith("plan-")) dismissPlanAlert(id);
                else dismissAlert(id);
              }}
            />
          </Layout.Section>
        )}

        {error &&
          allAlerts.filter(
            (a) =>
              a.tone !== "success" &&
              a.code !== "JOB_SUCCESS" &&
              a.code !== "JOB_FAILED" &&
              a.code !== "EXPORT_SUCCESS",
          ).length === 0 && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => setError(null)}>
              {error}
            </Banner>
          </Layout.Section>
        )}

        {notice && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => setNotice(null)}>
              {notice}
            </Banner>
          </Layout.Section>
        )}

        {approveLoading && (
          <Layout.Section>
            <Banner tone="info">Queuing your approved changes…</Banner>
          </Layout.Section>
        )}

        {needsBilling && (
          <Layout.Section>
            <Banner
              tone="warning"
              title="Complete your subscription"
              action={{ content: "View plans", onAction: () => setTab(11) }}
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
                <div className="tidysync-stat-meta">
                  in your Shopify store
                  {tenant.plan?.maxProducts ? (
                    <span> · limit {tenant.plan.maxProducts.toLocaleString()}</span>
                  ) : null}
                </div>
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
          <div
            className={`tidysync-workspace tidysync-workspace--sidebar${
              sidebarCollapsed ? " is-sidebar-collapsed" : ""
            }`}
          >
            <WorkspaceNav
              tabs={tabs}
              activeIndex={tab}
              onSelect={setTab}
              collapsed={sidebarCollapsed}
              onCollapsedChange={setSidebarCollapsed}
              lockedTabIds={lockedNavTabs}
            />
            <div className="tidysync-workspace-main">
              {stickyProgress && <StickyJobProgress state={stickyProgress} />}
              <LiveJobsBar
                jobs={jobs}
                onCancel={handleCancelJob}
                cancelingId={cancelingJobId}
              />
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
                          <p className="tidysync-action-title">Migration wizard</p>
                          <p className="tidysync-action-desc">
                            Guided move from WooCommerce, Amazon, Etsy, and more — with backup snapshot.
                          </p>
                        </button>
                        <button type="button" className="tidysync-action-card" onClick={() => setTab(3)}>
                          <div className="tidysync-action-icon">
                            <Icon source={ImportIcon} />
                          </div>
                          <p className="tidysync-action-title">Import catalog</p>
                          <p className="tidysync-action-desc">
                            Drop a CSV/XLSX or Google Sheet — map fields, preview every change, then commit.
                          </p>
                        </button>
                        <button type="button" className="tidysync-action-card" onClick={() => setTab(4)}>
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
                          onClick={() => setTab(6)}
                        >
                          <div className="tidysync-action-icon">
                            <Icon source={MagicIcon} />
                          </div>
                          <p className="tidysync-action-title">AI bulk edit</p>
                          <p className="tidysync-action-desc">
                            Describe a change — get a mutation plan and staggered diff before anything runs.
                          </p>
                        </button>
                        <button type="button" className="tidysync-action-card" onClick={() => setTab(7)}>
                          <div className="tidysync-action-icon">
                            <Icon source={ProductIcon} />
                          </div>
                          <p className="tidysync-action-title">Product SEO</p>
                          <p className="tidysync-action-desc">
                            Deep SEO scores, charts, and AI strategist briefings per product (1 credit).
                          </p>
                        </button>
                        <button
                          type="button"
                          className={`tidysync-action-card is-ai${planGates.agent ? " is-locked" : ""}`}
                          onClick={() => (planGates.agent ? goToBilling() : setTab(12))}
                        >
                          <div className="tidysync-action-icon">
                            <Icon source={AutomationIcon} />
                          </div>
                          <p className="tidysync-action-title">AI Agent</p>
                          <p className="tidysync-action-desc">
                            {planGates.agent
                              ? "Upgrade to Starter for autonomous catalog missions."
                              : "Fix my store, improve SEO, bulk edits, and backups — one command center."}
                          </p>
                        </button>
                        <button
                          type="button"
                          className={`tidysync-action-card${planGates.backups ? " is-locked" : ""}`}
                          onClick={() => (planGates.backups ? goToBilling() : setTab(13))}
                        >
                          <div className="tidysync-action-icon">
                            <Icon source={DatabaseIcon} />
                          </div>
                          <p className="tidysync-action-title">Catalog backups</p>
                          <p className="tidysync-action-desc">
                            Snapshot products before risky imports or bulk changes.
                          </p>
                        </button>
                        <button type="button" className="tidysync-action-card" onClick={() => setTab(8)}>
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
                            job.rowCount > 0
                              ? Math.round((job.successCount / job.rowCount) * 100)
                              : 0;
                          return (
                            <div key={job.id} className="tidysync-job-live is-running">
                              <InlineStack align="space-between" blockAlign="center">
                                <BlockStack gap="100">
                                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                                    {job.type} · {job.fileName ?? job.nlPrompt ?? "In progress"}
                                  </Text>
                                  <Text as="span" variant="bodySm" tone="subdued">
                                    {job.successCount.toLocaleString()} in Shopify /{" "}
                                    {job.rowCount.toLocaleString()} total
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
                          action={{ content: "Import a file", onAction: () => setTab(3) }}
                          secondaryAction={{ content: "Try AI edit", onAction: () => setTab(6) }}
                          image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                        >
                          <p>Import a catalog or describe a bulk change to get started.</p>
                        </EmptyState>
                      ) : (
                        jobs.slice(0, 3).map((job) => (
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
                                  {job.type === "IMPORT" && job.status === "MAPPING" ? "Map" : "Review"}
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
                        Showing your 8 most recent jobs. Progress reflects products live in Shopify.
                      </p>
                    </div>
                    {jobs.length === 0 ? (
                      <EmptyState
                        heading="No jobs yet"
                        action={{ content: "Import a file", onAction: () => setTab(3) }}
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
                                        ? (job.successCount / job.rowCount) * 100
                                        : 0
                                    }
                                    size="small"
                                  />
                                  <Text as="span" variant="bodySm" tone="subdued">
                                    {job.successCount}/{job.rowCount} in Shopify · ✕{job.failedCount}
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
                                  {job.type === "IMPORT" && job.status === "MAPPING" ? "Map" : "View"}
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
                  <MigrationWizard
                    platforms={IMPORT_PLATFORMS}
                    importPlatform={importPlatform}
                    onPlatformChange={setImportPlatform}
                    detectedPlatform={detectedPlatform}
                    detectedConfidence={detectedConfidence}
                    onUpload={handleImport}
                    onCreateBackup={async () => {
                      await gqlRequest(MUTATIONS.createStoreBackup, {}, shop);
                      setMigrationBackupDone(true);
                    }}
                    onOpenMapping={() => setMappingOpen(true)}
                    importProgress={overlayProgress}
                    mappingReady={Boolean(mappingJobId && mappingRows.some((m) => m.targetField))}
                    backupCreated={migrationBackupDone}
                    loading={loading}
                  />
                )}

                {tab === 3 && (
                  <BlockStack gap="400">
                    {planGates.catalogFull && (
                      <PlanUpgradePanel
                        title="Product limit reached"
                        message={`Your ${tenant?.plan?.name ?? "plan"} allows ${tenant?.plan?.maxProducts?.toLocaleString() ?? "—"} products. Upgrade to import more.`}
                        upgradeLabel={upgradeLabel}
                        onUpgrade={goToBilling}
                      />
                    )}
                    <div>
                      <p className="tidysync-section-title">Import</p>
                      <p className="tidysync-section-sub">
                        Drop a CSV/XLSX — we auto-detect the platform when possible, map columns with
                        AI + fuzzy matching, then show a diff before commit.
                      </p>
                    </div>
                    <Select
                      label="Resource type"
                      options={RESOURCE_OPTIONS}
                      value={importResourceType}
                      onChange={setImportResourceType}
                    />
                    <PlatformPicker
                      label="Source platform"
                      platforms={IMPORT_PLATFORMS}
                      value={importPlatform}
                      onChange={setImportPlatform}
                      detectedKey={detectedPlatform}
                      detectedConfidence={detectedConfidence}
                    />
                    <FileDropzone loading={loading} onFile={handleImport} />
                    <div className="tidysync-import-divider">
                      <span>Or import from Google Sheets</span>
                    </div>
                    <GoogleSheetsStudio
                      shop={shop}
                      onUpgrade={goToBilling}
                      scheduledJobsEnabled={tenant?.plan?.scheduledJobs ?? false}
                      compact
                      onJobStarted={handleGoogleSheetJobStarted}
                    />
                  </BlockStack>
                )}

                {tab === 4 && (
                  <BlockStack gap="500">
                    <div>
                      <p className="tidysync-section-title">Export catalog data</p>
                      <p className="tidysync-section-sub">
                        Choose what to export and the destination format. Downloads appear below when ready.
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
                      <div style={{ marginTop: 12 }}>
                        <PlatformPicker
                          label=""
                          platforms={EXPORT_PLATFORMS}
                          value={exportPlatform}
                          onChange={setExportPlatform}
                        />
                      </div>
                    </div>

                    <div className="tidysync-soft-panel">
                      <InlineStack align="space-between" blockAlign="center" wrap={false}>
                        <BlockStack gap="100">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            Ready to export {exportResourceType} →{" "}
                            {EXPORT_PLATFORMS.find((p) => p.key === exportPlatform)?.name ??
                              exportPlatform}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Large catalogs run in the background — progress stays visible at the top while you work.
                          </Text>
                        </BlockStack>
                        <Button variant="primary" icon={ExportIcon} onClick={handleExport} loading={loading}>
                          Start export
                        </Button>
                      </InlineStack>
                    </div>

                    {recentExports.length > 0 && (
                      <div className="tidysync-export-recent">
                        <div className="tidysync-export-recent-head">
                          <Text as="h3" variant="headingSm">Recent exports</Text>
                          <Button size="slim" onClick={() => setTab(1)}>View all jobs</Button>
                        </div>
                        <ul className="tidysync-export-recent-list">
                          {recentExports.map((job) => (
                            <li key={job.id} className="tidysync-export-recent-item">
                              <div className="tidysync-export-recent-copy">
                                <Text as="p" variant="bodyMd" fontWeight="semibold">
                                  {formatExportLabel(job)}
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  {new Date(job.createdAt).toLocaleString()}
                                  {job.rowCount > 0
                                    ? ` · ${job.successCount.toLocaleString()}/${job.rowCount.toLocaleString()} rows`
                                    : ""}
                                </Text>
                              </div>
                              <InlineStack gap="200" blockAlign="center">
                                {statusBadge(job.status)}
                                {job.status === "COMPLETED" && (
                                  <Button size="slim" onClick={() => downloadExport(job.id, shop)}>
                                    Download
                                  </Button>
                                )}
                                {(job.status === "RUNNING" || job.status === "QUEUED") && (
                                  <Badge tone="info">In progress</Badge>
                                )}
                              </InlineStack>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </BlockStack>
                )}

                {tab === 5 && (
                  <DuplicateStudio
                    shop={shop}
                    onUpgrade={goToBilling}
                    onApprove={(jobId) => openJob(jobId)}
                  />
                )}

                {tab === 6 && (
                  <AiStudio
                    shop={shop}
                    value={nlPrompt}
                    onChange={setNlPrompt}
                    onSubmit={handleNlBulkEdit}
                    loading={aiLoading}
                    creditsRemaining={tenant?.plan?.aiCreditsRemaining}
                    error={tab === 6 ? error : null}
                  />
                )}

                {tab === 7 && (
                  <ProductSeoStudio
                    shop={shop}
                    creditsRemaining={tenant?.plan?.aiCreditsRemaining}
                    onCreditsRefresh={() => loadData()}
                    onUpgrade={goToBilling}
                    onBulkApplySeo={() => {
                      if (planGates.agent) {
                        goToBilling();
                        return;
                      }
                      setAgentAutoStartSeo(true);
                      setTab(12);
                    }}
                  />
                )}

                {tab === 8 && (
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
                                showOperationalError(e, "Catalog scan failed");
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
                                showOperationalError(e, "Content rewrite failed");
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

                {tab === 9 && (
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

                {tab === 10 && (
                  <BlockStack gap="500">
                    {planGates.schedules ? (
                      <PlanUpgradePanel
                        title="Scheduled automation is a paid feature"
                        message="Daily exports, weekly health scans, and Google Sheets auto-sync need Starter or higher."
                        upgradeLabel={upgradeLabel}
                        onUpgrade={goToBilling}
                      />
                    ) : (
                      <>
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
                                {s.jobType.replace(/_/g, " ")} · {s.schedule}
                                {s.nextRunAt
                                  ? ` · next ${new Date(s.nextRunAt).toLocaleString()}`
                                  : ""}
                              </Text>
                            </BlockStack>
                          </InlineStack>
                          <InlineStack gap="200" blockAlign="center">
                            <Badge tone={s.enabled ?? true ? "success" : "warning"}>
                              {s.enabled ?? true ? "Active" : "Paused"}
                            </Badge>
                            <Button
                              size="slim"
                              onClick={() => handleToggleSchedule(s.id, !(s.enabled ?? true))}
                              loading={scheduleActionId === s.id}
                              disabled={scheduleActionId != null && scheduleActionId !== s.id}
                            >
                              {s.enabled ?? true ? "Pause" : "Resume"}
                            </Button>
                            <Button
                              size="slim"
                              tone="critical"
                              onClick={() => handleDeleteSchedule(s.id)}
                              loading={scheduleActionId === s.id}
                              disabled={scheduleActionId != null && scheduleActionId !== s.id}
                            >
                              Delete
                            </Button>
                          </InlineStack>
                        </div>
                      ))
                    )}
                      </>
                    )}
                  </BlockStack>
                )}

                {tab === 11 && (
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

                {tab === 12 && (
                  planGates.agent ? (
                    <PlanUpgradePanel
                      title="AI Agent requires Starter or higher"
                      message="Autonomous catalog missions (SEO polish, bulk edits, multi-step plans) are not included on the Free plan. Store scans still use AI credits from AI Edit or SEO tabs."
                      upgradeLabel={upgradeLabel}
                      onUpgrade={goToBilling}
                    />
                  ) : (
                  <AgentStudio
                    shop={shop}
                    onUpgrade={goToBilling}
                    onApprove={(jobId) => handleApprove(jobId)}
                    onJobStarted={(jobId, meta) =>
                      beginJobProgress(jobId, {
                        ...meta,
                        kind: meta?.kind ?? "agent",
                        label: meta?.label,
                      })
                    }
                    onFixPreview={(job) => {
                      setSelectedJob(job as Job);
                      setPreviewOpen(true);
                    }}
                    onGoToBackups={() => setTab(13)}
                    autoStartSeo={agentAutoStartSeo}
                    onAutoStartSeoConsumed={() => setAgentAutoStartSeo(false)}
                  />
                  )
                )}

                {tab === 13 && (
                  planGates.backups ? (
                    <PlanUpgradePanel
                      title="Catalog backups require a paid plan"
                      message="Point-in-time product snapshots and restore are included on Starter and above."
                      upgradeLabel={upgradeLabel}
                      onUpgrade={goToBilling}
                    />
                  ) : (
                  <BackupStudio
                    shop={shop}
                    maxBackups={tenant?.plan?.maxBackups ?? 0}
                    onUpgrade={goToBilling}
                    onJobStarted={(jobId, meta) =>
                      beginJobProgress(jobId, { ...meta, kind: "backup" })
                    }
                  />
                  )
                )}
              </div>
            </div>
          </div>
        </Layout.Section>
      </Layout>

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title={
          selectedJob?.type === "BACKUP"
            ? "Catalog snapshot"
            : selectedJob?.type === "AGENT_RUN"
              ? "Agent mission result"
              : selectedJob?.type === "IMPORT"
                ? "Review import — confirmation required"
                : "Review AI changes — confirmation required"
        }
        primaryAction={
          selectedJob?.status === "PREVIEW" &&
          selectedJob?.type !== "BACKUP" &&
          selectedJob?.type !== "AGENT_RUN"
            ? {
                content:
                  selectedJob?.type === "IMPORT" ? "Confirm & import to Shopify" : "Confirm & apply changes",
                onAction: () => selectedJob && handleApprove(selectedJob.id),
                loading: approveLoading,
                disabled: approveLoading,
              }
            : undefined
        }
        secondaryActions={[
          selectedJob?.type === "BACKUP"
            ? {
                content: "Open Backups",
                onAction: () => {
                  setPreviewOpen(false);
                  setTab(13);
                },
              }
            : {
                content: "Close",
                onAction: () => setPreviewOpen(false),
                disabled: approveLoading,
              },
        ]}
        size="large"
      >
        <Modal.Section>
          <BlockStack gap="400">
            {selectedJob?.status === "PREVIEW" &&
              selectedJob?.type !== "BACKUP" &&
              selectedJob?.type !== "AGENT_RUN" && (
              <Banner tone="warning">
                {selectedJob?.type === "IMPORT"
                  ? "Nothing is created in Shopify until you click "
                  : "Nothing is changed in your Shopify store until you click "}
                <strong>
                  {selectedJob?.type === "IMPORT" ? "Confirm & import to Shopify" : "Confirm & apply changes"}
                </strong>
                . Review every row below before confirming.
              </Banner>
            )}
            <DiffPreviewPanel
              impactSummary={selectedJob?.impactSummary}
              anomalies={selectedJob?.diffPreview?.anomalies}
              steps={selectedJob?.mutationPlan?.steps}
              rows={selectedJob?.diffPreview?.rows}
              failedItems={selectedJob?.lineItems?.filter((l) => l.status === "FAILED")}
              streamPlan={false}
              jobType={selectedJob?.type}
              jobStatus={selectedJob?.status}
            />
          </BlockStack>
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
            key={mappingJobId}
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
            onRemap={remapColumns}
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

      {overlayProgress &&
        ["uploading", "analyzing", "mapping"].includes(overlayProgress.phase) && (
        <div className="tidysync-import-overlay" aria-modal="true">
          <div className="tidysync-import-overlay-card">
            <ImportProgressLoader state={overlayProgress} />
          </div>
        </div>
      )}
    </Page>
    </div>
  );
}
