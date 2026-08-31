import { prisma } from "@tidysync/database";
import {
  applyImportDefaults,
  applyMappingsToRow,
  type ExtendedDiffRow,
  type SupplierFeedMutationPlan,
  buildProductMatchIndex,
  buildSupplierFeedDiffRows,
  getMatchKeyFromMapped,
} from "@tidysync/shared";
import { streamFileRows } from "../file-parser";
import { getShopGraphqlClient } from "../shopify";
import { fetchProductsForFeedMatch } from "../shopify-products";
import { createProductFromMappedRow, buildVariantBulkInput, type MappedProductRow } from "../shopify-product-create";

const PRODUCT_UPDATE = `#graphql
  mutation productUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id title }
      userErrors { field message }
    }
  }
`;

const VARIANTS_BULK_UPDATE = `#graphql
  mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id }
      userErrors { field message }
    }
  }
`;

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
  if (row.field === "status") input.status = String(row.after ?? "").toUpperCase();
  return input;
}

function variantBulkInput(row: ExtendedDiffRow): Record<string, unknown> {
  const fields: {
    sku?: string;
    price?: string | number;
    compareAtPrice?: string | number | null;
    barcode?: string;
  } = {};
  if (row.field === "variants.price") fields.price = String(row.after);
  if (row.field === "variants.compareAtPrice") {
    fields.compareAtPrice = row.after == null ? null : String(row.after);
  }
  if (row.field === "variants.sku") fields.sku = String(row.after ?? "");
  if (row.field === "variants.barcode") fields.barcode = String(row.after ?? "");
  return buildVariantBulkInput(row.resourceId, fields);
}

async function applyDiffRows(
  jobId: string,
  tenantId: string,
  shop: string,
  rows: ExtendedDiffRow[],
): Promise<{ success: number; failed: number }> {
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
    processed++;
    try {
      const variants = variantRows.map((r) => variantBulkInput(r));
      const response = await client.request(VARIANTS_BULK_UPDATE, {
        variables: { productId, variants },
      });
      const data = response.data as {
        productVariantsBulkUpdate?: { userErrors?: Array<{ message: string }> };
      };
      const errors = data.productVariantsBulkUpdate?.userErrors ?? [];
      if (errors.length) {
        failed += variantRows.length;
        for (const row of variantRows) {
          await prisma.jobLineItem.create({
            data: {
              tenantId,
              jobId,
              rowIndex: processed,
              resourceType: row.resourceType,
              resourceId: row.resourceId,
              status: "FAILED",
              errorMessage: errors.map((e) => e.message).join(", "),
            },
          });
        }
      } else {
        success += variantRows.length;
        for (const row of variantRows) {
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
      failed += variantRows.length;
      for (const row of variantRows) {
        await prisma.jobLineItem.create({
          data: {
            tenantId,
            jobId,
            rowIndex: processed,
            resourceType: row.resourceType,
            resourceId: row.resourceId,
            status: "FAILED",
            errorMessage: err instanceof Error ? err.message : "Variant update failed",
          },
        });
      }
    }
  }

  for (const row of productRows) {
    processed++;
    try {
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
        variables: { product: productUpdateInput(row) },
      });
      const data = response.data as {
        productUpdate?: { userErrors?: Array<{ message: string }> };
      };
      const errors = data.productUpdate?.userErrors ?? [];
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
          resourceType: row.resourceType,
          resourceId: row.resourceId,
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "Product update failed",
        },
      });
    }
  }

  return { success, failed };
}

async function applyPendingCreates(
  jobId: string,
  tenantId: string,
  shop: string,
  filePath: string,
  plan: SupplierFeedMutationPlan,
  rowIndices: number[],
): Promise<{ success: number; failed: number }> {
  if (!rowIndices.length) return { success: 0, failed: 0 };
  const client = await getShopGraphqlClient(shop);
  const indexSet = new Set(rowIndices);
  let success = 0;
  let failed = 0;

  await streamFileRows(filePath, async (row, index) => {
    if (!indexSet.has(index)) return;
    let mapped = applyMappingsToRow(row, plan.mappings);
    mapped = applyImportDefaults(mapped, plan.defaults, index);
    try {
      const created = await createProductFromMappedRow(client, mapped as MappedProductRow, index);
      success++;
      await prisma.jobSnapshot.create({
        data: {
          tenantId,
          jobId,
          resourceType: "product",
          resourceId: created.productId,
          beforeState: {},
          afterState: mapped as object,
        },
      });
      await prisma.jobLineItem.create({
        data: {
          tenantId,
          jobId,
          rowIndex: index,
          resourceType: "product",
          resourceId: created.productId,
          status: "SUCCESS",
          afterValue: mapped as object,
        },
      });
    } catch (err) {
      failed++;
      await prisma.jobLineItem.create({
        data: {
          tenantId,
          jobId,
          rowIndex: index,
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "Create failed",
        },
      });
    }
  });

  return { success, failed };
}

export async function processSupplierFeedSync(jobId: string, tenantId: string, shop: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job?.filePath) throw new Error("Supplier feed job missing file");
  const plan = job.mutationPlan as SupplierFeedMutationPlan | null;
  if (!plan?.mappings?.length) throw new Error("Supplier feed missing saved column mapping");

  const isApplyPhase = job.approvedAt != null && job.diffPreview != null;

  if (isApplyPhase) {
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    const preview = job.diffPreview as { rows?: ExtendedDiffRow[] };
    const rows = preview?.rows ?? [];
    const updateResult = await applyDiffRows(jobId, tenantId, shop, rows);

    let createSuccess = 0;
    let createFailed = 0;
    const pending = plan.pendingCreateRowIndices ?? [];
    if (pending.length > 0) {
      const createResult = await applyPendingCreates(
        jobId,
        tenantId,
        shop,
        job.filePath,
        plan,
        pending,
      );
      createSuccess = createResult.success;
      createFailed = createResult.failed;
    }

    const totalSuccess = updateResult.success + createSuccess;
    const totalFailed = updateResult.failed + createFailed;

    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: totalFailed > 0 && totalSuccess === 0 ? "FAILED" : "COMPLETED",
        finishedAt: new Date(),
        successCount: totalSuccess,
        failedCount: totalFailed,
        impactSummary: `Feed sync applied — ${totalSuccess} updated/created, ${totalFailed} failed.`,
        errorSummary: totalFailed > 0 ? `${totalFailed} row(s) failed` : null,
      },
    });
    return;
  }

  await prisma.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  const products = await fetchProductsForFeedMatch(shop, 5000);
  const matchField = plan.matchField ?? "variants.sku";
  const syncMode = plan.syncMode ?? "update_by_sku";
  const index = buildProductMatchIndex(products, matchField);

  const diffRows: ExtendedDiffRow[] = [];
  const pendingCreateRowIndices: number[] = [];
  let totalRows = 0;
  let matchedRows = 0;
  let noMatchRows = 0;

  await streamFileRows(job.filePath, async (row, rowIndex) => {
    totalRows++;
    let mapped = applyMappingsToRow(row, plan.mappings);
    mapped = applyImportDefaults(mapped, plan.defaults, rowIndex);

    const matchKey = getMatchKeyFromMapped(mapped, matchField);
    if (!matchKey) {
      noMatchRows++;
      return;
    }

    const hit = index.get(matchKey);
    if (!hit) {
      noMatchRows++;
      if (syncMode === "upsert" || syncMode === "create") {
        pendingCreateRowIndices.push(rowIndex);
      }
      return;
    }

    matchedRows++;
    const rowDiffs = buildSupplierFeedDiffRows(
      mapped,
      hit.product,
      hit.variantId,
      plan.mappings,
      rowIndex,
    );
    diffRows.push(...rowDiffs);
  });

  const impactSummary =
    diffRows.length > 0
      ? `${diffRows.length} field change(s) across ${matchedRows} matched row(s). ${pendingCreateRowIndices.length} new product(s) to create.`
      : pendingCreateRowIndices.length > 0
        ? `${pendingCreateRowIndices.length} new product(s) ready to create. No updates on matched SKUs.`
        : `No changes detected — ${matchedRows} matched, ${noMatchRows} skipped (no match or empty key).`;

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "PREVIEW",
      rowCount: totalRows,
      mutationPlan: { ...plan, pendingCreateRowIndices } as object,
      diffPreview: {
        rows: diffRows.slice(0, 3000),
        totalChanges: diffRows.length,
      } as object,
      impactSummary,
      processedCount: totalRows,
    },
  });

  if (plan.autoApprove && (diffRows.length > 0 || pendingCreateRowIndices.length > 0)) {
    await prisma.job.update({
      where: { id: jobId },
      data: { approvedAt: new Date(), status: "QUEUED" },
    });
    const refreshed = await prisma.job.findUnique({ where: { id: jobId } });
    if (refreshed) {
      await processSupplierFeedSync(jobId, tenantId, shop);
    }
  }
}
