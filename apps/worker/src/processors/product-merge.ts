import { prisma } from "@tidysync/database";
import { getShopGraphqlClient } from "../shopify";

const PRODUCT_FOR_MERGE = `#graphql
  query ProductForMerge($id: ID!) {
    product(id: $id) {
      id
      title
      hasOnlyDefaultVariant
      options {
        id
        name
      }
      variants(first: 100) {
        edges {
          node {
            id
            title
            sku
            price
            compareAtPrice
            barcode
            selectedOptions {
              name
              value
            }
          }
        }
      }
    }
  }
`;

const VARIANTS_BULK_CREATE = `#graphql
  mutation productVariantsBulkCreate(
    $productId: ID!
    $variants: [ProductVariantsBulkInput!]!
    $strategy: ProductVariantsBulkCreateStrategy
  ) {
    productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: $strategy) {
      productVariants {
        id
        title
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCT_DELETE = `#graphql
  mutation productDelete($input: ProductDeleteInput!, $synchronous: Boolean) {
    productDelete(input: $input, synchronous: $synchronous) {
      deletedProductId
      userErrors {
        field
        message
      }
    }
  }
`;

interface VariantNode {
  id: string;
  title: string;
  sku?: string | null;
  price?: string | null;
  compareAtPrice?: string | null;
  barcode?: string | null;
  selectedOptions?: Array<{ name: string; value: string }>;
}

interface ProductMergeNode {
  id: string;
  title: string;
  hasOnlyDefaultVariant?: boolean;
  options?: Array<{ id: string; name: string }>;
  variants?: { edges: Array<{ node: VariantNode }> };
}

function ensureGid(productId: string): string {
  if (productId.startsWith("gid://")) return productId;
  return `gid://shopify/Product/${productId.replace(/\D/g, "")}`;
}

function slugSuffix(text: string, index: number): string {
  const base = text
    .replace(/[^\w\s-]/g, "")
    .trim()
    .slice(0, 40)
    .replace(/\s+/g, "-");
  return `${base || "variant"}-${index}`;
}

async function fetchProductForMerge(
  client: Awaited<ReturnType<typeof getShopGraphqlClient>>,
  productId: string,
): Promise<ProductMergeNode | null> {
  const response = await client.request(PRODUCT_FOR_MERGE, {
    variables: { id: ensureGid(productId) },
  });
  const data = response.data as { product?: ProductMergeNode | null };
  return data.product ?? null;
}

function buildVariantCreateInputs(
  duplicate: ProductMergeNode,
  duplicateIndex: number,
  existingSkus: Set<string>,
): Array<Record<string, unknown>> {
  const variants = duplicate.variants?.edges?.map((e) => e.node) ?? [];
  if (!variants.length) return [];

  const inputs: Array<Record<string, unknown>> = [];
  const dupLabel = duplicate.title?.trim() || `Duplicate ${duplicateIndex + 1}`;

  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const optionValues =
      v.selectedOptions?.length
        ? v.selectedOptions.map((o) => ({
            optionName: o.name,
            name: `${o.value} (${slugSuffix(dupLabel, i)})`,
          }))
        : [
            {
              optionName: "Title",
              name: `${v.title?.trim() || dupLabel} (${slugSuffix(dupLabel, i)})`,
            },
          ];

    let sku = v.sku?.trim() || "";
    if (sku && existingSkus.has(sku)) {
      sku = `${sku}-m${duplicateIndex}`;
    }
    if (sku) existingSkus.add(sku);

    const input: Record<string, unknown> = {
      optionValues,
      price: v.price ?? "0.00",
    };
    if (v.compareAtPrice) input.compareAtPrice = v.compareAtPrice;
    if (sku) input.inventoryItem = { sku };
    if (v.barcode) input.barcode = v.barcode;
    inputs.push(input);
  }

  return inputs;
}

async function mergeOneDuplicate(
  client: Awaited<ReturnType<typeof getShopGraphqlClient>>,
  primaryId: string,
  duplicateId: string,
  duplicateIndex: number,
  existingSkus: Set<string>,
): Promise<{ ok: boolean; error?: string }> {
  const duplicate = await fetchProductForMerge(client, duplicateId);
  if (!duplicate) {
    return { ok: false, error: "Duplicate product not found" };
  }

  const variantsToCreate = buildVariantCreateInputs(duplicate, duplicateIndex, existingSkus);
  if (variantsToCreate.length > 0) {
    const createRes = await client.request(VARIANTS_BULK_CREATE, {
      variables: {
        productId: ensureGid(primaryId),
        variants: variantsToCreate,
        strategy: "REMOVE_STANDALONE_VARIANT",
      },
    });
    const createData = createRes.data as {
      productVariantsBulkCreate?: {
        userErrors?: Array<{ message: string }>;
      };
    };
    const createErrors = createData.productVariantsBulkCreate?.userErrors ?? [];
    if (createErrors.length) {
      return { ok: false, error: createErrors.map((e) => e.message).join(", ") };
    }
  }

  const deleteRes = await client.request(PRODUCT_DELETE, {
    variables: {
      input: { id: ensureGid(duplicateId) },
      synchronous: true,
    },
  });
  const deleteData = deleteRes.data as {
    productDelete?: {
      deletedProductId?: string | null;
      userErrors?: Array<{ message: string }>;
    };
  };
  const deleteErrors = deleteData.productDelete?.userErrors ?? [];
  if (deleteErrors.length) {
    return { ok: false, error: deleteErrors.map((e) => e.message).join(", ") };
  }

  return { ok: true };
}

export async function processProductMergeJob(
  jobId: string,
  tenantId: string,
  shop: string,
  primaryProductId: string,
  duplicateProductIds: string[],
) {
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date(), rowCount: duplicateProductIds.length },
  });

  const client = await getShopGraphqlClient(shop);
  const primary = await fetchProductForMerge(client, primaryProductId);
  if (!primary) {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorSummary: "Primary product not found",
      },
    });
    return;
  }

  const existingSkus = new Set<string>();
  for (const edge of primary.variants?.edges ?? []) {
    const sku = edge.node.sku?.trim();
    if (sku) existingSkus.add(sku);
  }

  let success = 0;
  let failed = 0;
  let processed = 0;

  for (let i = 0; i < duplicateProductIds.length; i++) {
    const mergedId = duplicateProductIds[i];
    processed++;
    if (mergedId === primaryProductId) continue;

    try {
      const result = await mergeOneDuplicate(client, primaryProductId, mergedId, i, existingSkus);
      if (!result.ok) {
        failed++;
        await prisma.jobLineItem.create({
          data: {
            tenantId,
            jobId,
            rowIndex: processed,
            resourceType: "product",
            resourceId: mergedId,
            status: "FAILED",
            errorMessage: result.error ?? "Merge failed",
          },
        });
      } else {
        success++;
        await prisma.jobLineItem.create({
          data: {
            tenantId,
            jobId,
            rowIndex: processed,
            resourceType: "product",
            resourceId: mergedId,
            status: "SUCCESS",
            afterValue: { mergedInto: primaryProductId },
          },
        });
        await prisma.jobSnapshot.create({
          data: {
            tenantId,
            jobId,
            resourceType: "product",
            resourceId: mergedId,
            beforeState: { id: mergedId },
            afterState: { mergedInto: primaryProductId, deleted: true },
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
          resourceId: mergedId,
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "Merge failed",
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
      successCount: success,
      failedCount: failed,
      impactSummary:
        success > 0
          ? `Merged ${success} duplicate listing(s) into the primary product. Variants were combined and duplicates removed.`
          : "No products were merged.",
      errorSummary: failed > 0 ? `${failed} merge(s) failed` : null,
    },
  });
}

export interface MergePair {
  primaryProductId: string;
  duplicateProductIds: string[];
}

export async function processBulkProductMergeJob(
  jobId: string,
  tenantId: string,
  shop: string,
  merges: MergePair[],
) {
  const totalRows = merges.reduce((sum, m) => sum + m.duplicateProductIds.length, 0);
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date(), rowCount: totalRows },
  });

  let success = 0;
  let failed = 0;
  let processed = 0;

  for (const merge of merges) {
    const duplicateIds = merge.duplicateProductIds.filter((id) => id !== merge.primaryProductId);
    if (!duplicateIds.length) continue;

    const client = await getShopGraphqlClient(shop);
    const primary = await fetchProductForMerge(client, merge.primaryProductId);
    if (!primary) {
      for (const dupId of duplicateIds) {
        processed++;
        failed++;
        await prisma.jobLineItem.create({
          data: {
            tenantId,
            jobId,
            rowIndex: processed,
            resourceType: "product",
            resourceId: dupId,
            status: "FAILED",
            errorMessage: "Primary product not found",
          },
        });
      }
      continue;
    }

    const existingSkus = new Set<string>();
    for (const edge of primary.variants?.edges ?? []) {
      const sku = edge.node.sku?.trim();
      if (sku) existingSkus.add(sku);
    }

    for (let i = 0; i < duplicateIds.length; i++) {
      processed++;
      const mergedId = duplicateIds[i];
      try {
        const result = await mergeOneDuplicate(
          client,
          merge.primaryProductId,
          mergedId,
          i,
          existingSkus,
        );
        if (!result.ok) {
          failed++;
          await prisma.jobLineItem.create({
            data: {
              tenantId,
              jobId,
              rowIndex: processed,
              resourceType: "product",
              resourceId: mergedId,
              status: "FAILED",
              errorMessage: result.error ?? "Merge failed",
            },
          });
        } else {
          success++;
          await prisma.jobLineItem.create({
            data: {
              tenantId,
              jobId,
              rowIndex: processed,
              resourceType: "product",
              resourceId: mergedId,
              status: "SUCCESS",
              afterValue: { mergedInto: merge.primaryProductId },
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
            resourceId: mergedId,
            status: "FAILED",
            errorMessage: err instanceof Error ? err.message : "Merge failed",
          },
        });
      }

      await prisma.job.update({
        where: { id: jobId },
        data: { processedCount: processed, successCount: success, failedCount: failed },
      });
    }
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: failed > 0 && success === 0 ? "FAILED" : "COMPLETED",
      finishedAt: new Date(),
      successCount: success,
      failedCount: failed,
      impactSummary:
        success > 0
          ? `Merged ${success} duplicate listing(s) across ${merges.length} group(s).`
          : "No products were merged.",
      errorSummary: failed > 0 ? `${failed} merge(s) failed` : null,
    },
  });
}
