import { clearSessionTokenCache, getAuthSessionToken } from "./session-token";
import { GraphQLClientError, parseGraphQLClientError } from "./graphql-errors";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/graphql";
const UPLOAD_URL = process.env.NEXT_PUBLIC_UPLOAD_URL ?? "/api/upload";
const DOWNLOAD_BASE = process.env.NEXT_PUBLIC_DOWNLOAD_URL ?? "/download";

async function authHeaders(shop?: string, forceRefresh = false): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const token = await getAuthSessionToken(forceRefresh);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (shop) {
    headers["x-tidysync-shop"] = shop;
    headers["x-shopify-shop"] = shop;
  }
  return headers;
}

const REQUEST_TIMEOUT_MS = 90_000;

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("Request timed out. Check your connection and try again.");
    }
    throw e;
  } finally {
    window.clearTimeout(timer);
  }
}

export { GraphQLClientError } from "./graphql-errors";

export async function gqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
  shop?: string,
): Promise<T> {
  const body = JSON.stringify({ query, variables });

  const send = async (forceRefresh = false) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(await authHeaders(shop, forceRefresh)),
    };
    return fetchWithTimeout(API_URL, { method: "POST", headers, body });
  };

  const parseResponse = async (response: Response): Promise<T> => {
    const json = await response.json();
    if (json.errors?.length) {
      throw parseGraphQLClientError(json.errors);
    }
    return json.data as T;
  };

  let res = await send();
  if (res.status === 401) {
    clearSessionTokenCache();
    res = await send(true);
  }

  try {
    return await parseResponse(res);
  } catch (error) {
    if (error instanceof GraphQLClientError) {
      const message = error.message;
      if (
        res.status === 401 ||
        message.includes("Unauthorized") ||
        message.includes("session token")
      ) {
        clearSessionTokenCache();
        const retryRes = await send(true);
        return parseResponse(retryRes);
      }
    }
    throw error;
  }
}

export async function uploadFile(file: File, shop: string) {
  const form = new FormData();
  form.append("file", file);
  const headers = await authHeaders(shop);

  const res = await fetch(UPLOAD_URL, { method: "POST", headers, body: form });
  if (!res.ok) throw new Error("Upload failed");
  return res.json() as Promise<{ filePath: string; fileName: string }>;
}

export async function downloadAuditExport(shop: string) {
  const headers = await authHeaders(shop);
  const base = process.env.NEXT_PUBLIC_API_URL?.replace("/graphql", "") ?? "";
  const res = await fetch(`${base}/audit/export/all`, { headers });
  if (!res.ok) throw new Error("Audit export failed");
  const blob = await res.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `tidysync-audit-${shop}.csv`;
  link.click();
}

export async function downloadExport(jobId: string, shop: string) {
  const headers = await authHeaders(shop);

  const res = await fetch(`${DOWNLOAD_BASE}/${jobId}`, { headers });
  if (!res.ok) throw new Error("Download failed");
  const blob = await res.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `tidysync-export-${jobId}.csv`;
  link.click();
}

export const QUERIES = {
  meTenant: `
    query MeTenant {
      meTenant {
        id shopDomain shopName productCount aiCreditsUsed extraAiCredits agentRunsUsed agentRunsRemaining
        billingStatus billingBypass installApproved
        plan {
          name slug maxProducts aiCreditsPerMonth aiCreditsRemaining maxBackups backupRetentionDays
          agentEnabled agentRunsPerMonth isFree scheduledJobs crossPlatform multiStore priceMonthlyCents
        }
      }
    }
  `,
  storeBackups: `
    query StoreBackups {
      storeBackups {
        id label productCount sizeBytes status expiresAt createdAt
      }
    }
  `,
  agentStatus: `
    query AgentStatus {
      agentStatus {
        enabled runsUsed runsLimit runsRemaining
      }
    }
  `,
  availablePlans: `
    query AvailablePlans {
      availablePlans {
        id name slug maxProducts aiCreditsPerMonth priceMonthlyCents isFree scheduledJobs crossPlatform multiStore
      }
    }
  `,
  jobs: `
    query Jobs($limit: Int) {
      jobs(limit: $limit) {
        id type status rowCount processedCount successCount failedCount
        impactSummary errorSummary createdAt startedAt finishedAt fileName nlPrompt
      }
    }
  `,
  catalogProducts: `
    query CatalogProducts($first: Int, $query: String) {
      catalogProducts(first: $first, query: $query) {
        id title handle status featuredImageUrl
      }
    }
  `,
  job: `
    query Job($id: ID!) {
      job(id: $id) {
        id type status rowCount processedCount successCount failedCount skippedCount
        mutationPlan diffPreview impactSummary errorSummary nlPrompt isAiGenerated
        status approvedAt startedAt finishedAt createdAt fileName sourcePlatform
        lineItems {
          id rowIndex resourceType resourceId status
          beforeValue afterValue errorMessage autoFixSuggestion
        }
      }
    }
  `,
  platformProfiles: `
    query PlatformProfiles {
      platformProfiles { id platformKey version name mappings }
    }
  `,
  mappingTemplates: `
    query MappingTemplates {
      mappingTemplates { id name platformKey mappings }
    }
  `,
  auditLogs: `
    query AuditLogs($limit: Int) {
      auditLogs(limit: $limit) {
        id action resourceType resourceId metadata createdAt
      }
    }
  `,
  scheduledJobs: `
    query ScheduledJobs {
      scheduledJobs {
        id name jobType schedule enabled lastRunAt nextRunAt
      }
    }
  `,
  notificationSettings: `
    query NotificationSettings {
      notificationSettings {
        email emailOnComplete emailOnFailure slackWebhook
      }
    }
  `,
  findDuplicateProducts: `
    query FindDuplicateProducts($limit: Int) {
      findDuplicateProducts(limit: $limit) {
        id reason matchKey
        products { id title handle vendor imageUrl variantCount }
      }
    }
  `,
  tenantIntegrations: `
    query TenantIntegrations {
      tenantIntegrations {
        id type enabled config createdAt updatedAt
      }
    }
  `,
};

export const MUTATIONS = {
  createExport: `
    mutation CreateExport($platformKey: String, $resourceType: String) {
      createExportJob(platformKey: $platformKey, resourceType: $resourceType) { id status type resourceType }
    }
  `,
  uploadImport: `
    mutation UploadImport($filePath: String!, $fileName: String!, $resourceType: String) {
      uploadImportFile(filePath: $filePath, fileName: $fileName, resourceType: $resourceType) {
        id status sourcePlatform resourceType rowCount
        diffPreview
      }
    }
  `,
  suggestMappings: `
    mutation SuggestMappings($jobId: ID!, $platformKey: String!, $useAi: Boolean) {
      suggestFieldMappings(jobId: $jobId, platformKey: $platformKey, useAi: $useAi) {
        sourceColumn targetField suggested confidence matchReason
      }
    }
  `,
  updateMappings: `
    mutation UpdateMappings($jobId: ID!, $mappings: JSON!) {
      updateJobMappings(jobId: $jobId, mappings: $mappings) {
        id status diffPreview impactSummary
      }
    }
  `,
  nlBulkEdit: `
    mutation NlBulkEdit($prompt: String!) {
      generateNlBulkEdit(prompt: $prompt) {
        id status mutationPlan diffPreview impactSummary
      }
    }
  `,
  approveJob: `
    mutation ApproveJob($jobId: ID!) {
      approveJob(jobId: $jobId) { id status }
    }
  `,
  undoJob: `
    mutation UndoJob($jobId: ID!) {
      undoJob(jobId: $jobId) { id status type }
    }
  `,
  saveTemplate: `
    mutation SaveTemplate($name: String!, $platformKey: String!, $mappings: JSON!) {
      saveMappingTemplate(name: $name, platformKey: $platformKey, mappings: $mappings) {
        id name
      }
    }
  `,
  catalogScan: `
    mutation CatalogScan {
      runCatalogHealthScan { id status type }
    }
  `,
  contentRewrite: `
    mutation ContentRewrite($brandVoice: String!) {
      runContentRewrite(brandVoice: $brandVoice) { id status }
    }
  `,
  analyzeProductSeo: `
    mutation AnalyzeProductSeo($productId: ID!) {
      analyzeProductSeo(productId: $productId) {
        productId title handle featuredImageUrl creditsUsed aiExplanation
        metrics {
          overallScore titleScore descriptionScore metaScore mediaScore readabilityScore
          titleLength metaDescriptionLength descriptionWordCount imageCount imagesWithAlt
          hasCustomSeoTitle hasCustomSeoDescription
          checks { id label status detail score }
        }
      }
    }
  `,
  applyProductSeo: `
    mutation ApplyProductSeo($productId: ID!) {
      applyProductSeo(productId: $productId) {
        productId title handle featuredImageUrl creditsUsed aiExplanation
        applied
        metrics {
          overallScore titleScore descriptionScore metaScore mediaScore readabilityScore
          titleLength metaDescriptionLength descriptionWordCount imageCount imagesWithAlt
          hasCustomSeoTitle hasCustomSeoDescription
          checks { id label status detail score }
        }
      }
    }
  `,
  createStoreBackup: `
    mutation CreateStoreBackup($label: String) {
      createStoreBackup(label: $label) { id status type createdAt }
    }
  `,
  deleteStoreBackup: `
    mutation DeleteStoreBackup($id: ID!) {
      deleteStoreBackup(id: $id)
    }
  `,
  scanStore: `
    mutation ScanStore {
      scanStore {
        productCount overallHealthScore seoScore catalogScore summary
        issues { id severity category title detail productId productTitle score }
      }
    }
  `,
  runAgent: `
    mutation RunAgent($prompt: String!) {
      runAgent(prompt: $prompt) {
        intent message agentRunsUsed suggestedActions agentJobId
        scan {
          productCount overallHealthScore seoScore catalogScore summary
          issues { id severity category title detail productId productTitle score }
        }
        previewJob {
          id type status nlPrompt impactSummary mutationPlan diffPreview
        }
      }
    }
  `,
  restoreStoreBackup: `
    mutation RestoreStoreBackup($id: ID!, $vendor: String, $titleContains: String, $tags: [String!], $productIds: [ID!], $fields: [String!]) {
      restoreStoreBackup(id: $id, options: {
        filters: { vendor: $vendor, titleContains: $titleContains, tags: $tags, productIds: $productIds }
        fields: $fields
      }) { id status type rowCount impactSummary }
    }
  `,
  polishImportSample: `
    mutation PolishImportSample($jobId: ID!, $brandVoice: String) {
      polishImportSample(jobId: $jobId, brandVoice: $brandVoice) {
        creditsUsed
        rows { rowIndex field before after }
      }
    }
  `,
  createSchedule: `
    mutation CreateSchedule($name: String!, $jobType: JobType!, $schedule: String!, $config: JSON) {
      createScheduledJob(name: $name, jobType: $jobType, schedule: $schedule, config: $config) {
        id name schedule enabled
      }
    }
  `,
  deleteSchedule: `
    mutation DeleteSchedule($id: ID!) {
      deleteScheduledJob(id: $id)
    }
  `,
  updateSchedule: `
    mutation UpdateSchedule($id: ID!, $enabled: Boolean!) {
      updateScheduledJob(id: $id, enabled: $enabled) {
        id name schedule enabled lastRunAt nextRunAt jobType
      }
    }
  `,
  cancelJob: `
    mutation CancelJob($jobId: ID!) {
      cancelJob(jobId: $jobId) { id status }
    }
  `,
  fixScanIssues: `
    mutation FixScanIssues($category: String!, $productIds: [ID!]!) {
      fixScanIssues(category: $category, productIds: $productIds) {
        id status mutationPlan diffPreview impactSummary rowCount
      }
    }
  `,
  previewMergeProducts: `
    mutation PreviewMergeProducts($primaryProductId: ID!, $duplicateProductIds: [ID!]!) {
      previewMergeProducts(primaryProductId: $primaryProductId, duplicateProductIds: $duplicateProductIds) {
        id status diffPreview impactSummary rowCount
      }
    }
  `,
  connectGoogleSheet: `
    mutation ConnectGoogleSheet($spreadsheetUrl: String!, $sheetName: String) {
      connectGoogleSheet(spreadsheetUrl: $spreadsheetUrl, sheetName: $sheetName) {
        id type enabled config
      }
    }
  `,
  syncGoogleSheet: `
    mutation SyncGoogleSheet($integrationId: ID!) {
      syncGoogleSheet(integrationId: $integrationId) { id status type rowCount impactSummary }
    }
  `,
  updateGoogleSheetFeed: `
    mutation UpdateGoogleSheetFeed(
      $integrationId: ID!
      $syncMode: String
      $matchField: String
      $schedule: String
      $autoSyncEnabled: Boolean
      $autoApprove: Boolean
    ) {
      updateGoogleSheetFeed(
        integrationId: $integrationId
        syncMode: $syncMode
        matchField: $matchField
        schedule: $schedule
        autoSyncEnabled: $autoSyncEnabled
        autoApprove: $autoApprove
      ) {
        id type enabled config updatedAt
      }
    }
  `,
  disconnectGoogleSheet: `
    mutation DisconnectGoogleSheet($id: ID!) {
      disconnectGoogleSheet(id: $id)
    }
  `,
  updateNotifications: `
    mutation UpdateNotifications($email: String, $emailOnComplete: Boolean, $emailOnFailure: Boolean, $slackWebhook: String) {
      updateNotificationSettings(email: $email, emailOnComplete: $emailOnComplete, emailOnFailure: $emailOnFailure, slackWebhook: $slackWebhook) {
        email emailOnComplete emailOnFailure slackWebhook
      }
    }
  `,
  pauseJob: `
    mutation PauseJob($jobId: ID!) {
      pauseJob(jobId: $jobId) { id status }
    }
  `,
  purchaseCredits: `
    mutation PurchaseCredits($credits: Int!) {
      purchaseCreditTopUp(credits: $credits) {
        confirmationUrl
        chargeId
      }
    }
  `,
  subscribePlan: `
    mutation SubscribePlan($planSlug: String!) {
      createPlanSubscription(planSlug: $planSlug) {
        confirmationUrl
        chargeId
      }
    }
  `,
};
