import { prisma } from "@tidysync/database";
import {
  buildImpactSummary,
  detectAnomalies,
  validateImportMappings,
  type ImportDefaults,
} from "@tidysync/shared";
import type { ImportCondition } from "@tidysync/shared/import-settings";
import { parseFilePreview } from "./file-parser";
import type { GoogleSheetsConfig } from "./google-sheets";

export async function previewImportJobMappings(
  tenantId: string,
  jobId: string,
  mappings: Array<{ sourceColumn: string; targetField: string }>,
  options?: {
    defaults?: ImportDefaults;
    conditions?: ImportCondition[];
    integrationId?: string;
  },
) {
  const job = await prisma.job.findFirst({ where: { id: jobId, tenantId } });
  if (!job?.filePath) throw new Error("Import job file not found");

  const mappedCount = mappings.filter((m) => m.targetField).length;
  if (mappedCount === 0) {
    throw new Error("Map at least one column to a Shopify field before previewing.");
  }

  const resType = job.resourceType ?? "products";
  const validation = validateImportMappings(resType, mappings, options?.defaults);
  if (!validation.ok) {
    throw new Error(
      `Required fields missing: ${validation.missing.map((m) => m.label).join(", ")}. Map a column or set a default value.`,
    );
  }

  const previewRows = await parseFilePreview(job.filePath, 100);
  const totalRows = job.rowCount > 0 ? job.rowCount : previewRows.length;

  const diffRows: Array<{
    resourceType: string;
    resourceId: string;
    resourceTitle?: string;
    field: string;
    before: string | number | null;
    after: string | number | null;
  }> = [];

  const titleSource =
    mappings.find((m) => m.targetField === "title" || m.targetField === "email")?.sourceColumn;

  for (let i = 0; i < previewRows.length; i++) {
    const row = previewRows[i];
    for (const mapping of mappings) {
      if (!mapping.targetField) continue;
      const after = row[mapping.sourceColumn] ?? null;
      diffRows.push({
        resourceType: resType,
        resourceId: `preview-${i}`,
        resourceTitle: (titleSource ? row[titleSource] : null) ?? `Row ${i + 1}`,
        field: mapping.targetField,
        before: null,
        after: after as string | number | null,
      });
    }
  }

  const anomalies = detectAnomalies(
    diffRows.map((r) => ({ field: r.field, before: r.before, after: r.after })),
  );
  const impactSummary = buildImpactSummary(diffRows.length, diffRows);
  const existingPlan = (job.mutationPlan as Record<string, unknown> | null) ?? {};

  const updated = await prisma.job.update({
    where: { id: job.id },
    data: {
      status: "PREVIEW",
      mutationPlan: {
        ...existingPlan,
        mappings,
        defaults: options?.defaults ?? null,
        conditions: options?.conditions ?? null,
      } as object,
      diffPreview: { rows: diffRows, totalChanges: diffRows.length, anomalies },
      impactSummary,
      rowCount: totalRows,
    },
    include: { lineItems: { take: 0 } },
  });

  const integrationId = options?.integrationId;
  if (integrationId) {
    const integration = await prisma.tenantIntegration.findFirst({
      where: { id: integrationId, tenantId, type: "GOOGLE_SHEETS" },
    });
    if (integration) {
      const cfg = integration.config as unknown as GoogleSheetsConfig;
      await prisma.tenantIntegration.update({
        where: { id: integration.id },
        data: {
          config: {
            ...cfg,
            savedMappings: mappings,
            savedDefaults: options?.defaults ?? cfg.savedDefaults,
          } as object,
        },
      });
    }
  }

  return updated;
}
