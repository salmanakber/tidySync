import fs from "node:fs";
import path from "node:path";
import { prisma } from "@tidysync/database";
import { getShopGraphqlClient } from "../shopify";

const PRODUCT_UPDATE = `#graphql
  mutation productUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id title }
      userErrors { field message }
    }
  }
`;

interface RestoreFilters {
  vendor?: string;
  titleContains?: string;
  tags?: string[];
  productIds?: string[];
}

interface BackupProduct {
  id: string;
  title?: string;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  status?: string;
}

function matchesFilters(product: BackupProduct, filters: RestoreFilters): boolean {
  if (filters.productIds?.length && !filters.productIds.includes(product.id)) return false;
  if (filters.vendor && product.vendor !== filters.vendor) return false;
  if (filters.titleContains && !product.title?.toLowerCase().includes(filters.titleContains.toLowerCase())) {
    return false;
  }
  if (filters.tags?.length) {
    const tags = product.tags ?? [];
    const ok = filters.tags.some((t) => tags.includes(t));
    if (!ok) return false;
  }
  return true;
}

export async function processRestoreBackupJob(jobId: string, tenantId: string, shop: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("Restore job not found");

  const plan = job.mutationPlan as unknown as {
    backupId: string;
    filters?: RestoreFilters;
    fields?: string[];
  };

  const backup = await prisma.storeBackup.findFirst({
    where: { id: plan.backupId, tenantId, status: "COMPLETED" },
  });
  if (!backup?.filePath || !fs.existsSync(backup.filePath)) {
    throw new Error("Backup file not found on server");
  }

  const payload = JSON.parse(fs.readFileSync(backup.filePath, "utf8")) as {
    products: BackupProduct[];
  };

  const filters = plan.filters ?? {};
  const fields = plan.fields ?? ["title", "descriptionHtml", "vendor", "tags"];
  const targets = payload.products.filter((p) => matchesFilters(p, filters));

  await prisma.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date(), rowCount: targets.length },
  });

  const client = await getShopGraphqlClient(shop);
  let success = 0;
  let failed = 0;

  for (const product of targets) {
    const input: Record<string, unknown> = { id: product.id };
    if (fields.includes("title") && product.title) input.title = product.title;
    if (fields.includes("descriptionHtml") && product.descriptionHtml) {
      input.descriptionHtml = product.descriptionHtml;
    }
    if (fields.includes("vendor") && product.vendor) input.vendor = product.vendor;
    if (fields.includes("tags") && product.tags) input.tags = product.tags;
    if (fields.includes("status") && product.status) input.status = product.status;

    try {
      const res = await client.request(PRODUCT_UPDATE, { variables: { product: input } });
      const data = res.data as {
        productUpdate?: { userErrors?: Array<{ message: string }> };
      };
      const errors = data.productUpdate?.userErrors ?? [];
      if (errors.length) {
        failed++;
      } else {
        success++;
      }
    } catch {
      failed++;
    }

    await prisma.job.update({
      where: { id: jobId },
      data: { processedCount: success + failed, successCount: success, failedCount: failed },
    });
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: failed > 0 && success === 0 ? "FAILED" : "COMPLETED",
      finishedAt: new Date(),
      successCount: success,
      failedCount: failed,
      impactSummary: `Restored ${success} product(s) from backup "${backup.label}". ${failed} failed.`,
      errorSummary: failed > 0 ? `${failed} products could not be restored` : null,
    },
  });
}
