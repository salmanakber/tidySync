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

export async function processAnalyzeImportJob(jobId: string, tenantId: string) {
  const job = await prisma.job.findFirst({ where: { id: jobId, tenantId } });
  if (!job?.filePath) throw new Error("Import analyze job missing file");

  await prisma.job.update({
    where: { id: jobId },
    data: {
      errorSummary: null,
    },
  });

  try {
    const headers = await parseFileHeaders(job.filePath);
    const rowCount = await countFileRows(job.filePath);
    const detection = detectPlatformWithConfidence(headers);
    const detected = detection.platformKey ?? detectPlatformFromHeaders(headers);
    const preview = await parseFilePreview(job.filePath, 5);

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "MAPPING",
        sourcePlatform: detected ?? "csv",
        rowCount,
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
