import { prisma } from "@tidysync/database";
import { getShopGraphqlClient } from "../shopify";
import { buildDiffFromMutationPlan } from "../shopify-products";

const PRODUCT_UPDATE = `#graphql
  mutation productVariantUpdate($input: ProductVariantInput!) {
    productVariantUpdate(input: $input) {
      productVariant { id price }
      userErrors { field message }
    }
  }
`;

export async function processBulkEditJob(jobId: string, tenantId: string, shop: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job?.mutationPlan) throw new Error("Bulk edit job missing plan");

  await prisma.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  const plan = job.mutationPlan as unknown as import("@tidysync/shared").MutationPlan;
  const diff = await buildDiffFromMutationPlan(shop, plan);
  const client = await getShopGraphqlClient(shop);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < diff.rows.length; i++) {
    const row = diff.rows[i];
    try {
      if (row.field === "variants.price" && row.resourceType === "variant") {
        const beforeSnapshot = await prisma.jobSnapshot.findFirst({
          where: { tenantId, resourceId: row.resourceId },
        });

        if (!beforeSnapshot) {
          await prisma.jobSnapshot.create({
            data: {
              tenantId,
              jobId,
              resourceType: row.resourceType,
              resourceId: row.resourceId,
              beforeState: { price: row.before },
              afterState: { price: row.after },
            },
          });
        }

        const response = await client.request(PRODUCT_UPDATE, {
          variables: {
            input: {
              id: row.resourceId,
              price: String(row.after),
            },
          },
        });

        const data = response.data as {
          productVariantUpdate: {
            userErrors: Array<{ message: string }>;
          };
        };

        if (data.productVariantUpdate.userErrors?.length) {
          failed++;
          await prisma.jobLineItem.create({
            data: {
              tenantId,
              jobId,
              rowIndex: i,
              resourceType: row.resourceType,
              resourceId: row.resourceId,
              status: "FAILED",
              beforeValue: { price: row.before },
              afterValue: { price: row.after },
              errorMessage: data.productVariantUpdate.userErrors.map((e) => e.message).join(", "),
            },
          });
        } else {
          success++;
          await prisma.jobLineItem.create({
            data: {
              tenantId,
              jobId,
              rowIndex: i,
              resourceType: row.resourceType,
              resourceId: row.resourceId,
              status: "SUCCESS",
              beforeValue: { price: row.before },
              afterValue: { price: row.after },
            },
          });
        }
      }
    } catch (err) {
      failed++;
      await prisma.jobLineItem.create({
        data: {
          tenantId,
          jobId,
          rowIndex: i,
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "Unknown error",
        },
      });
    }

    await prisma.job.update({
      where: { id: jobId },
      data: {
        processedCount: i + 1,
        successCount: success,
        failedCount: failed,
      },
    });
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: failed > 0 && success === 0 ? "FAILED" : "COMPLETED",
      finishedAt: new Date(),
      rowCount: diff.rows.length,
      errorSummary: failed > 0 ? `${failed} updates failed` : null,
    },
  });
}
