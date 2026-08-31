import { prisma } from "@tidysync/database";
import { importQueue, exportQueue, bulkEditQueue, catalogScanQueue } from "./queues";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function buildSheetsCsvExportUrl(spreadsheetId: string, gid?: string): string {
  const base = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
  return gid ? `${base}&gid=${gid}` : `${base}&gid=0`;
}

async function downloadSheetCsv(spreadsheetId: string, gid?: string) {
  const url = buildSheetsCsvExportUrl(spreadsheetId, gid);
  const res = await fetch(url, { headers: { "User-Agent": "TidySync/1.0" }, redirect: "follow" });
  if (!res.ok) throw new Error(`Sheet download failed HTTP ${res.status}`);
  const text = await res.text();
  if (text.includes("<!DOCTYPE html")) throw new Error("Sheet not publicly accessible");
  const rowEstimate = text.split(/\r?\n/).filter((l) => l.trim()).length;
  const fileName = `google-sheet-${spreadsheetId.slice(0, 8)}.csv`;
  const filePath = path.join(os.tmpdir(), `tidysync-${Date.now()}-${fileName}`);
  fs.writeFileSync(filePath, text, "utf8");
  return { filePath, fileName, rowEstimate };
}

function parseFeedScheduleInterval(schedule: string): number | null {
  if (schedule === "daily") return 86400000;
  if (schedule === "weekly") return 604800000;
  const hourly = schedule.match(/^every (\d+)h$/);
  if (hourly) return Number(hourly[1]) * 3600000;
  return 86400000;
}

async function runSupplierFeedScheduler() {
  const integrations = await prisma.tenantIntegration.findMany({
    where: { type: "GOOGLE_SHEETS", enabled: true },
    include: { tenant: true },
  });
  const now = Date.now();

  for (const integration of integrations) {
    const config = integration.config as {
      spreadsheetId?: string;
      sheetGid?: string;
      autoSyncEnabled?: boolean;
      savedMappings?: Array<{ sourceColumn: string; targetField: string }>;
      syncMode?: string;
      matchField?: string;
      savedDefaults?: Record<string, string>;
      autoApprove?: boolean;
      schedule?: string;
      lastSyncAt?: string;
    };

    if (!config.autoSyncEnabled || !config.savedMappings?.length || !config.spreadsheetId) continue;
    const syncMode = config.syncMode ?? "create";
    if (syncMode === "create") continue;

    const intervalMs = parseFeedScheduleInterval(config.schedule ?? "daily");
    if (!intervalMs) continue;
    const last = config.lastSyncAt ? new Date(config.lastSyncAt).getTime() : 0;
    if (now - last < intervalMs) continue;

    try {
      const downloaded = await downloadSheetCsv(config.spreadsheetId, config.sheetGid);
      const matchField =
        config.matchField ??
        (syncMode === "update_by_barcode" ? "variants.barcode" : "variants.sku");

      const job = await prisma.job.create({
        data: {
          tenantId: integration.tenantId,
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
          impactSummary: `Scheduled supplier feed — match by ${matchField.replace("variants.", "")}`,
        },
      });

      await bulkEditQueue.add("supplier-feed", {
        jobId: job.id,
        tenantId: integration.tenantId,
        shop: integration.tenant.shopDomain,
      });

      await prisma.tenantIntegration.update({
        where: { id: integration.id },
        data: {
          config: { ...config, lastSyncAt: new Date().toISOString() } as object,
        },
      });
    } catch (err) {
      console.error(
        `[scheduler] Supplier feed failed for ${integration.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

export async function runScheduler() {
  const due = await prisma.scheduledJob.findMany({
    where: { enabled: true },
    include: { tenant: true },
  });

  const now = Date.now();

  for (const sched of due) {
    const intervalMs = parseScheduleInterval(sched.schedule);
    if (!intervalMs) continue;

    const last = sched.lastRunAt?.getTime() ?? 0;
    if (now - last < intervalMs) continue;

    const tenant = sched.tenant;
    const job = await prisma.job.create({
      data: {
        tenantId: tenant.id,
        type: sched.jobType,
        status: "QUEUED",
        mutationPlan: sched.config as object,
      },
    });

    const payload = { jobId: job.id, tenantId: tenant.id, shop: tenant.shopDomain };

    switch (sched.jobType) {
      case "IMPORT":
        await importQueue.add("import", payload);
        break;
      case "EXPORT":
        await exportQueue.add("export", payload);
        break;
      case "BULK_EDIT":
        await bulkEditQueue.add("bulk-edit", payload);
        break;
      case "CATALOG_HEALTH_SCAN":
        await catalogScanQueue.add("catalog-scan", payload);
        break;
      case "BACKUP":
        await exportQueue.add("backup", payload);
        break;
      default:
        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            finishedAt: new Date(),
            errorSummary: `Scheduled job type ${sched.jobType} is not supported for automation yet.`,
          },
        });
        continue;
    }

    await prisma.scheduledJob.update({
      where: { id: sched.id },
      data: { lastRunAt: new Date(), nextRunAt: new Date(now + intervalMs) },
    });
  }

  await runSupplierFeedScheduler();
}

function parseScheduleInterval(schedule: string): number | null {
  if (schedule === "daily") return 86400000;
  if (schedule === "weekly") return 604800000;
  const hourly = schedule.match(/^every (\d+)h$/);
  if (hourly) return Number(hourly[1]) * 3600000;
  return 86400000;
}
