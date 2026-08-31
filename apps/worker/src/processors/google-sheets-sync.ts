import fs from "node:fs";
import { prisma } from "@tidysync/database";
import { importQueue } from "../queues";

interface SheetsConfig {
  spreadsheetId: string;
  sheetGid?: string;
  sheetName?: string;
  resourceType?: string;
}

function buildExportUrl(spreadsheetId: string, gid?: string): string {
  const base = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;
  return gid ? `${base}&gid=${gid}` : `${base}&gid=0`;
}

export async function processGoogleSheetsSync(jobId: string, tenantId: string, shop: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  const plan = job?.mutationPlan as SheetsConfig & { integrationId?: string } | null;
  if (!plan?.spreadsheetId) throw new Error("Google Sheets sync missing spreadsheetId");

  await prisma.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  const url = buildExportUrl(plan.spreadsheetId, plan.sheetGid);
  const res = await fetch(url, { headers: { "User-Agent": "TidySync/1.0" }, redirect: "follow" });

  if (!res.ok) {
    throw new Error(`Sheet download failed (HTTP ${res.status}). Check sharing settings.`);
  }

  const csv = await res.text();
  if (csv.includes("<!DOCTYPE html")) {
    throw new Error("Sheet is not publicly accessible. Set sharing to Anyone with the link can view.");
  }

  const filePath = job?.filePath;
  if (!filePath) throw new Error("Import file path missing on job");

  fs.writeFileSync(filePath, csv, "utf8");
  const rowCount = csv.split(/\r?\n/).filter((l) => l.trim()).length;

  const importJob = await prisma.job.create({
    data: {
      tenantId,
      type: "IMPORT",
      status: "QUEUED",
      filePath,
      fileName: `google-sheet-${plan.spreadsheetId.slice(0, 8)}.csv`,
      resourceType: plan.resourceType ?? "products",
      rowCount: Math.max(0, rowCount - 1),
      mutationPlan: {
        source: "google_sheets",
        spreadsheetId: plan.spreadsheetId,
        parentSyncJobId: jobId,
      } as object,
    },
  });

  await importQueue.add("import", { jobId: importJob.id, tenantId, shop });

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "COMPLETED",
      finishedAt: new Date(),
      rowCount: Math.max(0, rowCount - 1),
      successCount: 1,
      impactSummary: `Sheet synced — import job ${importJob.id.slice(0, 8)}… queued (${Math.max(0, rowCount - 1)} rows).`,
      mutationPlan: { ...plan, childImportJobId: importJob.id } as object,
    },
  });

  return importJob.id;
}
