import { prisma } from "@tidysync/database";
import { fetchProductsForExport } from "../shopify-products";
import { notifyJobComplete } from "./notify";

export async function processCatalogHealthScan(jobId: string, tenantId: string, shop: string) {
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  const products = await fetchProductsForExport(shop, 500);
  const issues: Array<{
    severity: string;
    message: string;
    resourceId: string;
    resourceTitle: string;
  }> = [];

  const skuSet = new Map<string, string>();

  for (const product of products as Array<{
    id: string;
    title: string;
    descriptionHtml?: string;
    variants: { edges: Array<{ node: { sku?: string } }> };
  }>) {
    if (!product.descriptionHtml || product.descriptionHtml.length < 50) {
      issues.push({
        severity: "medium",
        message: "Thin or missing description",
        resourceId: product.id,
        resourceTitle: product.title,
      });
    }

    for (const { node: variant } of product.variants.edges) {
      if (variant.sku) {
        if (skuSet.has(variant.sku)) {
          issues.push({
            severity: "high",
            message: `Duplicate SKU: ${variant.sku}`,
            resourceId: product.id,
            resourceTitle: product.title,
          });
        } else {
          skuSet.set(variant.sku, product.id);
        }
      }
    }
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "COMPLETED",
      finishedAt: new Date(),
      rowCount: issues.length,
      successCount: issues.length,
      diffPreview: { issues },
      impactSummary: `Found ${issues.length} catalog health issue(s)`,
    },
  });

  await notifyJobComplete(tenantId, jobId, "COMPLETED");
}
