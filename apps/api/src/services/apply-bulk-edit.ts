import { prisma } from "@tidysync/database";
import type { ExtendedDiffRow, MutationPlan } from "@tidysync/shared";
import { generateProductSeoImprovements, rewriteProductContent } from "@tidysync/ai";
import { merchantGraphqlRequest } from "../shopify/client";

const SMALL_BULK_SYNC_LIMIT = 50;
/** Agent SEO can touch many products — still apply via live session (worker offline is unreliable). */
const AI_SEO_SYNC_LIMIT = 250;

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

const PRODUCT_FOR_SEO = `#graphql
  query ProductForSeo($id: ID!) {
    product(id: $id) {
      id title handle descriptionHtml
      seo { title description }
    }
  }
`;

const PRODUCT_FOR_REWRITE = `#graphql
  query ProductForRewrite($id: ID!) {
    product(id: $id) { id title descriptionHtml }
  }
`;

/** Prefer sync when the change set is small — especially AI SEO (worker offline tokens are often stale). */
export function canApplyBulkEditSynchronously(
  job: {
    type: string;
    rowCount: number | null;
    mutationPlan: unknown;
    diffPreview: unknown;
  },
  options?: { hasSessionToken?: boolean },
): boolean {
  if (job.type !== "BULK_EDIT") return false;

  const plan = job.mutationPlan as MutationPlan | null;
  if (!plan?.steps?.length) return false;

  const root = job.mutationPlan as { action?: string };
  if (root.action === "merge_products" || root.action === "bulk_merge_products") return false;

  const rows = (job.diffPreview as { rows?: unknown[] } | null)?.rows;
  const count = Array.isArray(rows) && rows.length > 0 ? rows.length : (job.rowCount ?? 0);
  if (count <= 0) return false;
  if (!Array.isArray(rows) || rows.length === 0) return false;

  const needsAiWorker = plan.steps.some(
    (s) => s.action === "ai_improve_seo" || s.action === "ai_rewrite_description",
  );
  if (needsAiWorker) {
    // Always prefer live session for AI SEO/description — never depend on worker offline token
    if (!options?.hasSessionToken) return false;
    return count <= AI_SEO_SYNC_LIMIT;
  }

  return count <= SMALL_BULK_SYNC_LIMIT;
}

export function isSmallBulkEditJob(job: {
  type: string;
  rowCount: number | null;
  diffPreview: unknown;
}): boolean {
  if (job.type !== "BULK_EDIT") return false;
  const rows = (job.diffPreview as { rows?: unknown[] } | null)?.rows;
  const count = Array.isArray(rows) && rows.length > 0 ? rows.length : (job.rowCount ?? 0);
  return count > 0 && count <= AI_SEO_SYNC_LIMIT;
}

function variantBulkInput(row: ExtendedDiffRow): Record<string, unknown> {
  const input: Record<string, unknown> = { id: row.resourceId };
  if (row.field === "variants.price") input.price = String(row.after);
  if (row.field === "variants.compareAtPrice") {
    input.compareAtPrice = row.after == null ? null : String(row.after);
  }
  if (row.field === "variants.sku" || row.field === "variants.barcode") {
    const inventoryItem: Record<string, unknown> = {};
    if (row.field === "variants.sku") inventoryItem.sku = String(row.after ?? "");
    if (row.field === "variants.barcode") inventoryItem.barcode = String(row.after ?? "");
    input.inventoryItem = inventoryItem;
  }
  return input;
}

function productUpdateInput(row: ExtendedDiffRow): Record<string, unknown> {
  const input: Record<string, unknown> = { id: row.resourceId };
  if (row.field === "title") input.title = String(row.after ?? "");
  if (row.field === "descriptionHtml") input.descriptionHtml = String(row.after ?? "");
  if (row.field === "vendor") input.vendor = String(row.after ?? "");
  if (row.field === "productType") input.productType = String(row.after ?? "");
  if (row.field === "status") {
    const s = String(row.after ?? "").toUpperCase();
    if (["ACTIVE", "DRAFT", "ARCHIVED"].includes(s)) input.status = s;
  }
  if (row.field === "tags") {
    input.tags = String(row.after ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return input;
}

function productIdsFromRows(rows: ExtendedDiffRow[]): string[] {
  return [
    ...new Set(
      rows
        .map((r) => r.productId ?? (r.resourceType === "product" ? r.resourceId : undefined))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

async function applyAiSeoSynchronously(
  jobId: string,
  tenantId: string,
  shop: string,
  productIds: string[],
  sessionToken?: string,
): Promise<{ success: number; failed: number; processed: number }> {
  let success = 0;
  let failed = 0;
  let processed = 0;

  for (const productId of productIds) {
    processed++;
    try {
      const productRes = (await merchantGraphqlRequest(shop, sessionToken, PRODUCT_FOR_SEO, {
        id: productId,
      })) as {
        data?: {
          product?: {
            id: string;
            title: string;
            handle?: string;
            descriptionHtml?: string;
            seo?: { title?: string; description?: string };
          };
        };
      };
      const product = productRes.data?.product;
      if (!product) {
        failed++;
        continue;
      }

      const improvements = await generateProductSeoImprovements(
        {
          title: product.title,
          handle: product.handle,
          descriptionHtml: product.descriptionHtml,
          seo: product.seo,
        },
        {},
      );

      const updateRes = (await merchantGraphqlRequest(shop, sessionToken, PRODUCT_UPDATE, {
        product: {
          id: productId,
          descriptionHtml: improvements.descriptionHtml,
          seo: {
            title: improvements.seoTitle,
            description: improvements.seoDescription,
          },
        },
      })) as {
        data?: { productUpdate?: { userErrors?: Array<{ message: string }> } };
      };
      const errors = updateRes.data?.productUpdate?.userErrors ?? [];
      if (errors.length) {
        failed++;
        await prisma.jobLineItem.create({
          data: {
            tenantId,
            jobId,
            rowIndex: processed,
            resourceType: "product",
            resourceId: productId,
            status: "FAILED",
            errorMessage: errors.map((e) => e.message).join(", "),
          },
        });
      } else {
        success++;
        await prisma.jobSnapshot.create({
          data: {
            tenantId,
            jobId,
            resourceType: "product",
            resourceId: productId,
            beforeState: {
              seo: product.seo,
              descriptionHtml: product.descriptionHtml,
            },
            afterState: improvements as object,
          },
        });
        await prisma.jobLineItem.create({
          data: {
            tenantId,
            jobId,
            rowIndex: processed,
            resourceType: "product",
            resourceId: productId,
            status: "SUCCESS",
            afterValue: {
              seoTitle: improvements.seoTitle,
              seoDescription: improvements.seoDescription,
            },
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
          resourceType: "product",
          resourceId: productId,
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "SEO improve failed",
        },
      });
    }

    await prisma.job.update({
      where: { id: jobId },
      data: { processedCount: processed, successCount: success, failedCount: failed },
    });
  }

  return { success, failed, processed };
}

async function applyAiRewriteSynchronously(
  jobId: string,
  tenantId: string,
  shop: string,
  productIds: string[],
  brandVoice: string,
  sessionToken?: string,
): Promise<{ success: number; failed: number; processed: number }> {
  let success = 0;
  let failed = 0;
  let processed = 0;

  for (const productId of productIds) {
    processed++;
    try {
      const productRes = (await merchantGraphqlRequest(shop, sessionToken, PRODUCT_FOR_REWRITE, {
        id: productId,
      })) as {
        data?: { product?: { id: string; title: string; descriptionHtml?: string } };
      };
      const product = productRes.data?.product;
      if (!product) {
        failed++;
        continue;
      }

      const rewritten = await rewriteProductContent(
        [{ title: product.title, description: product.descriptionHtml ?? "" }],
        brandVoice,
      );
      const newHtml = rewritten[0]?.description ?? product.descriptionHtml ?? "";

      const updateRes = (await merchantGraphqlRequest(shop, sessionToken, PRODUCT_UPDATE, {
        product: { id: productId, descriptionHtml: newHtml },
      })) as {
        data?: { productUpdate?: { userErrors?: Array<{ message: string }> } };
      };
      const errors = updateRes.data?.productUpdate?.userErrors ?? [];
      if (errors.length) {
        failed++;
      } else {
        success++;
        await prisma.jobSnapshot.create({
          data: {
            tenantId,
            jobId,
            resourceType: "product",
            resourceId: productId,
            beforeState: { descriptionHtml: product.descriptionHtml },
            afterState: { descriptionHtml: newHtml },
          },
        });
      }
    } catch {
      failed++;
    }

    await prisma.job.update({
      where: { id: jobId },
      data: { processedCount: processed, successCount: success, failedCount: failed },
    });
  }

  return { success, failed, processed };
}

/** Apply an approved bulk edit immediately with the merchant session (no Redis/worker). */
export async function applyBulkEditSynchronously(
  jobId: string,
  tenantId: string,
  shop: string,
  sessionToken?: string,
): Promise<{ success: number; failed: number; processed: number }> {
  const job = await prisma.job.findFirst({ where: { id: jobId, tenantId } });
  if (!job) throw new Error("Job not found");

  const plan = job.mutationPlan as MutationPlan | null;
  const rows = ((job.diffPreview as { rows?: ExtendedDiffRow[] } | null)?.rows ??
    []) as ExtendedDiffRow[];
  if (!rows.length) throw new Error("No preview rows to apply");

  await prisma.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  const seoOnly = Boolean(plan?.steps?.length) && plan!.steps.every((s) => s.action === "ai_improve_seo");
  const rewriteOnly =
    Boolean(plan?.steps?.length) && plan!.steps.every((s) => s.action === "ai_rewrite_description");

  if (seoOnly || rewriteOnly) {
    const productIds = productIdsFromRows(rows);
    const result = seoOnly
      ? await applyAiSeoSynchronously(jobId, tenantId, shop, productIds, sessionToken)
      : await applyAiRewriteSynchronously(
          jobId,
          tenantId,
          shop,
          productIds,
          String(plan!.steps[0]?.value ?? "professional, helpful, SEO-optimized"),
          sessionToken,
        );

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: result.failed > 0 && result.success === 0 ? "FAILED" : "COMPLETED",
        finishedAt: new Date(),
        rowCount: productIds.length,
        processedCount: result.processed,
        successCount: result.success,
        failedCount: result.failed,
        errorSummary: result.failed > 0 ? `${result.failed} updates failed` : null,
      },
    });
    return result;
  }

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
      const response = (await merchantGraphqlRequest(shop, sessionToken, VARIANTS_BULK_UPDATE, {
        productId,
        variants,
      })) as {
        data?: {
          productVariantsBulkUpdate?: { userErrors?: Array<{ message: string }> };
        };
      };
      const errors = response.data?.productVariantsBulkUpdate?.userErrors ?? [];
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
              beforeValue: { [row.field]: row.before },
              afterValue: { [row.field]: row.after },
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

      const response = (await merchantGraphqlRequest(shop, sessionToken, PRODUCT_UPDATE, {
        product: productInput,
      })) as {
        data?: { productUpdate?: { userErrors?: Array<{ message: string }> } };
      };
      const errors = response.data?.productUpdate?.userErrors ?? [];
      if (errors.length) {
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
            errorMessage: errors.map((e) => e.message).join(", "),
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
      processedCount: processed,
      successCount: success,
      failedCount: failed,
      errorSummary: failed > 0 ? `${failed} updates failed` : null,
    },
  });

  return { success, failed, processed };
}
