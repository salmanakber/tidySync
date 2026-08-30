import { getSessionToken } from "../providers";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/graphql";
const UPLOAD_URL = process.env.NEXT_PUBLIC_UPLOAD_URL ?? "/api/upload";
const DOWNLOAD_BASE = process.env.NEXT_PUBLIC_DOWNLOAD_URL ?? "/download";

/** Reuse App Bridge session token between GraphQL calls (avoids spamming idToken). */
let cachedSessionToken: { value: string; expiresAt: number } | null = null;

async function authHeaders(shop?: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const now = Date.now();
  if (cachedSessionToken && cachedSessionToken.expiresAt > now) {
    headers.Authorization = `Bearer ${cachedSessionToken.value}`;
  } else {
    const token = await getSessionToken(4);
    if (token) {
      cachedSessionToken = { value: token, expiresAt: now + 50_000 };
      headers.Authorization = `Bearer ${token}`;
    }
  }
  if (shop) {
    headers["x-tidysync-shop"] = shop;
    headers["x-shopify-shop"] = shop;
  }
  return headers;
}

export async function gqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
  shop?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await authHeaders(shop)),
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }
  return json.data as T;
}

export async function uploadFile(file: File, shop: string) {
  const form = new FormData();
  form.append("file", file);
  const headers = await authHeaders(shop);

  const res = await fetch(UPLOAD_URL, { method: "POST", headers, body: form });
  if (!res.ok) throw new Error("Upload failed");
  return res.json() as Promise<{ filePath: string; fileName: string }>;
}

export function pollJobProgress(
  jobId: string,
  shop: string,
  onUpdate: (data: Record<string, unknown>) => void,
  untilStatuses = ["COMPLETED", "FAILED", "CANCELLED"],
  options?: { intervalMs?: number; maxPolls?: number },
) {
  const intervalMs = options?.intervalMs ?? 2500;
  const maxPolls = options?.maxPolls ?? 180;
  let cancelled = false;
  let pollCount = 0;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const cleanup = () => {
    cancelled = true;
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
  };

  const poll = async () => {
    if (cancelled) return;
    pollCount += 1;
    try {
      const data = await gqlRequest<{ job: Record<string, unknown> }>(
        QUERIES.job,
        { id: jobId },
        shop,
      );
      if (cancelled) return;
      onUpdate(data.job);
      const status = data.job.status as string;
      if (untilStatuses.includes(status)) {
        cleanup();
        return;
      }
      if (pollCount >= maxPolls) {
        onUpdate({
          ...data.job,
          status: "FAILED",
          errorSummary: "Timed out waiting for the job to finish. Check the Jobs tab for status.",
        });
        cleanup();
      }
    } catch {
      cleanup();
    }
  };

  void poll();
  intervalId = setInterval(poll, intervalMs);
  return cleanup;
}

export async function waitForJobStatus(
  jobId: string,
  shop: string,
  targetStatuses: string[],
  onUpdate?: (job: Record<string, unknown>) => void,
  timeoutMs = 600000,
): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await gqlRequest<{ job: Record<string, unknown> }>(QUERIES.job, { id: jobId }, shop);
    const job = data.job;
    onUpdate?.(job);
    const status = job.status as string;
    if (targetStatuses.includes(status)) return job;
    if (["FAILED", "CANCELLED"].includes(status)) return job;
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error("Timed out waiting for file analysis. Try a smaller file or CSV format.");
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
        id shopDomain shopName productCount aiCreditsUsed extraAiCredits billingStatus billingBypass installApproved
        plan { name slug maxProducts aiCreditsPerMonth aiCreditsRemaining isFree scheduledJobs crossPlatform multiStore priceMonthlyCents }
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
        impactSummary errorSummary createdAt finishedAt fileName
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
  createSchedule: `
    mutation CreateSchedule($name: String!, $jobType: JobType!, $schedule: String!, $config: JSON) {
      createScheduledJob(name: $name, jobType: $jobType, schedule: $schedule, config: $config) {
        id name schedule enabled
      }
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
