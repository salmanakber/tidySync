import { prisma } from "@tidysync/database";
import {
  detectPlatformFromHeaders,
  detectPlatformWithConfidence,
} from "@tidysync/shared";
import {
  countFileRows,
  parseFileHeaders,
  parseFilePreview,
} from "../file-parser";

/**
 * Background enrichment after a fast sync upload.
 * Prefer updating rowCount / detection without blocking the merchant UI.
 */
export async function processAnalyzeImportJob(jobId: string, tenantId: string) {
  const job = await prisma.job.findFirst({ where: { id: jobId, tenantId } });
  if (!job?.filePath) throw new Error("Import analyze job missing file");

  try {
    const headers = await parseFileHeaders(job.filePath);
    const rowCount = await countFileRows(job.filePath);
    const detection = detectPlatformWithConfidence(headers);
    const detected = detection.platformKey ?? detectPlatformFromHeaders(headers);
    const preview = await parseFilePreview(job.filePath, 5);

    const keepStatus =
      job.status === "MAPPING" || job.status === "PREVIEW" || job.status === "QUEUED"
        ? job.status
        : "MAPPING";

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: keepStatus,
        sourcePlatform: detected ?? job.sourcePlatform ?? "csv",
        rowCount,
        errorSummary: null,
        diffPreview: {
          headers,
          previewRows: preview,
          detection: {
            platformKey: detected,
            confidence: detection.confidence,
            scores: detection.scores,
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        action: "import.analyzed",
        resourceType: "job",
        resourceId: jobId,
        metadata: {
          rowCount,
          detectedPlatform: detected,
          detectionConfidence: detection.confidence,
        },
      },
    });
  } catch (err) {
    // Don't fail the job if merchant already has MAPPING from sync path
    if (job.status === "MAPPING" || job.status === "PREVIEW") {
      console.error(`[import-analyze] enrichment failed for ${jobId}:`, err);
      return;
    }
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorSummary: err instanceof Error ? err.message : "File analysis failed",
      },
    });
    throw err;
  }
}
