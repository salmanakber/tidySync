import { prisma } from "@tidysync/database";
import { bulkEditQueue } from "../queues";
import {
  downloadGoogleSheetCsv,
  type GoogleSheetsConfig,
  type FeedSyncMode,
  type FeedMatchField,
} from "./google-sheets";

export async function enqueueSupplierFeedSync(
  tenantId: string,
  shop: string,
  integrationId: string,
): Promise<{ jobId: string }> {
  const integration = await prisma.tenantIntegration.findFirst({
    where: { id: integrationId, tenantId, type: "GOOGLE_SHEETS" },
  });
  if (!integration) throw new Error("Google Sheets connection not found");

  const config = integration.config as unknown as GoogleSheetsConfig;
  if (!config.savedMappings?.length) {
    throw new Error(
      "Save a column mapping first — run one import sync, map columns, preview, then enable live feed.",
    );
  }

  const syncMode = config.syncMode ?? "update_by_sku";
  if (syncMode === "create") {
    throw new Error("Set sync mode to update by SKU, barcode, or upsert for live feed sync.");
  }

  const downloaded = await downloadGoogleSheetCsv(config.spreadsheetId, config.sheetGid);
  const matchField: FeedMatchField =
    config.matchField ??
    (syncMode === "update_by_barcode" ? "variants.barcode" : "variants.sku");

  const job = await prisma.job.create({
    data: {
      tenantId,
      type: "SUPPLIER_FEED_SYNC",
      status: "QUEUED",
      filePath: downloaded.filePath,
      fileName: downloaded.fileName,
      resourceType: "products",
      rowCount: Math.max(0, downloaded.rowEstimate - 1),
      mutationPlan: {
        integrationId: integration.id,
        spreadsheetId: config.spreadsheetId,
        sheetGid: config.sheetGid,
        syncMode,
        matchField,
        mappings: config.savedMappings,
        defaults: config.savedDefaults,
        autoApprove: config.autoApprove ?? false,
        source: "google_sheets",
      },
      impactSummary: `Supplier feed sync queued — matching by ${matchField.replace("variants.", "")}`,
    },
  });

  await bulkEditQueue.add("supplier-feed", { jobId: job.id, tenantId, shop });

  await prisma.tenantIntegration.update({
    where: { id: integration.id },
    data: {
      config: { ...config, lastSyncAt: new Date().toISOString() } as object,
    },
  });

  return { jobId: job.id };
}

export async function runScheduledSupplierFeeds(): Promise<void> {
  const integrations = await prisma.tenantIntegration.findMany({
    where: { type: "GOOGLE_SHEETS", enabled: true },
    include: { tenant: true },
  });

  const now = Date.now();

  for (const integration of integrations) {
    const config = integration.config as unknown as GoogleSheetsConfig;
    if (!config.autoSyncEnabled) continue;
    if (!config.savedMappings?.length) continue;

    const syncMode = config.syncMode ?? "create";
    if (syncMode === "create") continue;

    const schedule = config.schedule ?? "daily";
    const intervalMs = parseFeedScheduleInterval(schedule);
    if (!intervalMs) continue;

    const last = config.lastSyncAt ? new Date(config.lastSyncAt).getTime() : 0;
    if (now - last < intervalMs) continue;

    try {
      await enqueueSupplierFeedSync(
        integration.tenantId,
        integration.tenant.shopDomain,
        integration.id,
      );
    } catch (err) {
      console.error(
        `[supplier-feed] Scheduled sync failed for integration ${integration.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

function parseFeedScheduleInterval(schedule: string): number | null {
  if (schedule === "daily") return 86400000;
  if (schedule === "weekly") return 604800000;
  const hourly = schedule.match(/^every (\d+)h$/);
  if (hourly) return Number(hourly[1]) * 3600000;
  return 86400000;
}

export function normalizeFeedSyncMode(mode?: string): FeedSyncMode {
  if (
    mode === "update_by_sku" ||
    mode === "update_by_barcode" ||
    mode === "upsert" ||
    mode === "create"
  ) {
    return mode;
  }
  return "create";
}
