import { prisma } from "@tidysync/database";
import { getShopGraphqlClient } from "../shopify";

const PRODUCT_MERGE = `#graphql
  mutation productMerge($input: ProductMergeInput!) {
    productMerge(input: $input) {
      product { id title }
      userErrors { field message }
    }
  }
`;

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
  let success = 0;
  let failed = 0;
  let processed = 0;

  for (const mergedId of duplicateProductIds) {
    processed++;
    if (mergedId === primaryProductId) {
      continue;
    }

    try {
      const response = await client.request(PRODUCT_MERGE, {
        variables: {
          input: {
            productId: primaryProductId,
            mergedProductId: mergedId,
          },
        },
      });

      const data = response.data as {
        productMerge?: {
          product?: { id: string; title?: string } | null;
          userErrors?: Array<{ message: string }>;
        };
      };

      const errors = data.productMerge?.userErrors ?? [];
      if (errors.length) {
        failed++;
        await prisma.jobLineItem.create({
          data: {
            tenantId,
            jobId,
            rowIndex: processed,
            resourceType: "product",
            resourceId: mergedId,
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
          ? `Merged ${success} duplicate product(s) into the primary listing.`
          : "No products were merged.",
      errorSummary: failed > 0 ? `${failed} merge(s) failed` : null,
    },
  });
}
