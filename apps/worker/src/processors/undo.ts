import { prisma } from "@tidysync/database";
import { getShopGraphqlClient } from "../shopify";

const VARIANT_UPDATE = `#graphql
  mutation productVariantUpdate($input: ProductVariantInput!) {
    productVariantUpdate(input: $input) {
      productVariant { id }
      userErrors { field message }
    }
  }
`;

const PRODUCT_DELETE = `#graphql
  mutation productDelete($input: ProductDeleteInput!) {
    productDelete(input: $input) {
      deletedProductId
      userErrors { field message }
    }
  }
`;

export async function processUndoJob(
  jobId: string,
  tenantId: string,
  shop: string,
  undoJobId: string,
) {
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  const snapshots = await prisma.jobSnapshot.findMany({
    where: { tenantId, jobId: undoJobId },
  });

  const client = await getShopGraphqlClient(shop);
  let success = 0;
  let failed = 0;

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const before = snap.beforeState as Record<string, unknown>;
    const after = snap.afterState as Record<string, unknown>;

    try {
      if (snap.resourceType === "variant" || (after?.price && snap.resourceId.includes("ProductVariant"))) {
        const restorePrice = before.price ?? before["variants.price"];
        if (restorePrice !== undefined) {
          await client.request(VARIANT_UPDATE, {
            variables: {
              input: {
                id: snap.resourceId,
                price: String(restorePrice),
              },
            },
          });
        }
      } else if (snap.resourceType === "product" && Object.keys(before).length === 0) {
        await client.request(PRODUCT_DELETE, {
          variables: { input: { id: snap.resourceId } },
        });
      }
      success++;
    } catch {
      failed++;
    }

    await prisma.job.update({
      where: { id: jobId },
      data: { processedCount: i + 1, successCount: success, failedCount: failed },
    });
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "COMPLETED",
      finishedAt: new Date(),
      rowCount: snapshots.length,
      successCount: success,
      failedCount: failed,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      action: "job.undo",
      resourceType: "job",
      resourceId: undoJobId,
      metadata: { undoJobId: jobId },
    },
  });
}
