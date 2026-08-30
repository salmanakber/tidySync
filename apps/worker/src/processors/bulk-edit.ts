import { prisma } from "@tidysync/database";
import type { ExtendedDiffRow } from "@tidysync/shared";
import { getShopGraphqlClient } from "../shopify";
import { buildDiffFromMutationPlan } from "../shopify-products";

const VARIANTS_BULK_UPDATE = `#graphql
  mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id price compareAtPrice }
      userErrors { field message }
    }
  }
`;

const PRODUCT_UPDATE = `#graphql
  mutation productUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id title tags }
      userErrors { field message }
    }
  }
`;

function variantBulkInput(row: ExtendedDiffRow): Record<string, unknown> {
  const input: Record<string, unknown> = { id: row.resourceId };
  if (row.field === "variants.price") input.price = String(row.after);
  if (row.field === "variants.compareAtPrice") {
    input.compareAtPrice = row.after == null ? null : String(row.after);
  }
  if (row.field === "variants.sku") input.sku = String(row.after ?? "");
  if (row.field === "variants.barcode") input.barcode = String(row.after ?? "");
  return input;
}

function productUpdateInput(row: ExtendedDiffRow): Record<string, unknown> {
  const input: Record<string, unknown> = { id: row.resourceId };
  if (row.field === "title") input.title = String(row.after ?? "");
  if (row.field === "descriptionHtml") input.descriptionHtml = String(row.after ?? "");
  if (row.field === "vendor") input.vendor = String(row.after ?? "");
  if (row.field === "productType") input.productType = String(row.after ?? "");
  if (row.field === "tags") {
    input.tags = String(row.after ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return input;
}

export async function processBulkEditJob(jobId: string, tenantId: string, shop: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job?.mutationPlan) throw new Error("Bulk edit job missing plan");

  await prisma.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  const plan = job.mutationPlan as unknown as import("@tidysync/shared").MutationPlan;
  const diff = await buildDiffFromMutationPlan(shop, plan);
  const rows = diff.rows as ExtendedDiffRow[];
  const client = await getShopGraphqlClient(shop);

  let success = 0;
  let failed = 0;
  let processed = 0;

  const variantRowsByProduct = new Map<string, ExtendedDiffRow[]>();
  const productRows: ExtendedDiffRow[] = [];

  for (const row of rows) {
    if (row.resourceType === "variant" && row.productId) {
      const list = variantRowsByProduct.get(row.productId) ?? [];
      list.push(row);
      variantRowsByProduct.set(row.productId, list);
    } else if (row.resourceType === "product") {
      productRows.push(row);
    }
  }

  for (const [productId, variantRows] of variantRowsByProduct) {
    const variants = variantRows.map((row) => variantBulkInput(row));
    try {
      const response = await client.request(VARIANTS_BULK_UPDATE, {
        variables: { productId, variants },
      });
      const data = response.data as {
        productVariantsBulkUpdate: {
          userErrors: Array<{ message: string }>;
        };
      };
      const errors = data.productVariantsBulkUpdate.userErrors ?? [];

      if (errors.length) {
        for (const row of variantRows) {
          failed++;
          processed++;
          await prisma.jobLineItem.create({
            data: {
              tenantId,
              jobId,
              rowIndex: processed,
              resourceType: row.resourceType,
              resourceId: row.resourceId,
              status: "FAILED",
              beforeValue: { value: row.before },
              afterValue: { value: row.after },
              errorMessage: errors.map((e) => e.message).join(", "),
            },
          });
        }
      } else {
        for (const row of variantRows) {
          success++;
          processed++;
          await prisma.jobSnapshot.create({
            data: {
              tenantId,
              jobId,
              resourceType: row.resourceType,
              resourceId: row.resourceId,
              beforeState: { [row.field]: row.before },
              afterState: { [row.field]: row.after },
            },
          });
          await prisma.jobLineItem.create({
            data: {
              tenantId,
              jobId,
              rowIndex: processed,
              resourceType: row.resourceType,
              resourceId: row.resourceId,
              status: "SUCCESS",
              beforeValue: { [row.field]: row.before },
              afterValue: { [row.field]: row.after },
            },
          });
        }
      }
    } catch (err) {
      for (const row of variantRows) {
        failed++;
        processed++;
        await prisma.jobLineItem.create({
          data: {
            tenantId,
            jobId,
            rowIndex: processed,
            resourceType: row.resourceType,
            resourceId: row.resourceId,
            status: "FAILED",
            errorMessage: err instanceof Error ? err.message : "Unknown error",
          },
        });
      }
    }

    await prisma.job.update({
      where: { id: jobId },
      data: { processedCount: processed, successCount: success, failedCount: failed },
    });
  }

  for (const row of productRows) {
    processed++;
    try {
      const productInput = productUpdateInput(row);
      await prisma.jobSnapshot.create({
        data: {
          tenantId,
          jobId,
          resourceType: row.resourceType,
          resourceId: row.resourceId,
          beforeState: { [row.field]: row.before },
          afterState: { [row.field]: row.after },
        },
      });

      const response = await client.request(PRODUCT_UPDATE, {
        variables: { product: productInput },
      });
      const data = response.data as {
        productUpdate: { userErrors: Array<{ message: string }> };
      };

      if (data.productUpdate.userErrors?.length) {
        failed++;
        await prisma.jobLineItem.create({
          data: {
            tenantId,
            jobId,
            rowIndex: processed,
            resourceType: row.resourceType,
            resourceId: row.resourceId,
            status: "FAILED",
            beforeValue: { [row.field]: row.before },
            afterValue: { [row.field]: row.after },
            errorMessage: data.productUpdate.userErrors.map((e) => e.message).join(", "),
          },
        });
      } else {
        success++;
        await prisma.jobLineItem.create({
          data: {
            tenantId,
            jobId,
            rowIndex: processed,
            resourceType: row.resourceType,
            resourceId: row.resourceId,
            status: "SUCCESS",
            beforeValue: { [row.field]: row.before },
            afterValue: { [row.field]: row.after },
          },
        });
      }
    } catch (err) {
      failed++;
      await prisma.jobLineItem.create({
        data: {
          tenantId,
          jobId,
          rowIndex: processed,
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "Unknown error",
        },
      });
    }

    await prisma.job.update({
      where: { id: jobId },
      data: { processedCount: processed, successCount: success, failedCount: failed },
    });
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: failed > 0 && success === 0 ? "FAILED" : "COMPLETED",
      finishedAt: new Date(),
      rowCount: rows.length,
      errorSummary: failed > 0 ? `${failed} updates failed` : null,
    },
  });
}
