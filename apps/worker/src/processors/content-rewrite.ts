import { prisma } from "@tidysync/database";
import { rewriteProductContent } from "@tidysync/ai";
import { fetchProductsForExport } from "../shopify-products";
import { getShopGraphqlClient } from "../shopify";
import { notifyJobComplete } from "./notify";

const PRODUCT_UPDATE = `#graphql
  mutation productUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id title descriptionHtml }
      userErrors { field message }
    }
  }
`;

export async function processContentRewrite(jobId: string, tenantId: string, shop: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  const brandVoice =
    (job?.mutationPlan as { brandVoice?: string })?.brandVoice ?? "professional, clear";

  await prisma.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  const products = await fetchProductsForExport(shop, 50);
  const batch = (products as Array<{ id: string; title: string; descriptionHtml?: string }>).map(
    (p) => ({ title: p.title, description: p.descriptionHtml ?? "" }),
  );

  const rewritten = await rewriteProductContent(batch, brandVoice);
  const client = await getShopGraphqlClient(shop);
  let success = 0;
  let failed = 0;

  for (let i = 0; i < products.length && i < rewritten.length; i++) {
    const product = products[i] as { id: string; title: string; descriptionHtml?: string };
    const newContent = rewritten[i];

    try {
      await prisma.jobSnapshot.create({
        data: {
          tenantId,
          jobId,
          resourceType: "product",
          resourceId: product.id,
          beforeState: { title: product.title, descriptionHtml: product.descriptionHtml },
          afterState: { title: newContent.title, descriptionHtml: newContent.description },
        },
      });

      const response = await client.request(PRODUCT_UPDATE, {
        variables: {
          product: {
            id: product.id,
            title: newContent.title,
            descriptionHtml: newContent.description,
          },
        },
      });

      const data = response.data as {
        productUpdate: { userErrors: Array<{ message: string }> };
      };

      if (data.productUpdate.userErrors?.length) {
        failed++;
      } else {
        success++;
      }
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
      rowCount: products.length,
      successCount: success,
      failedCount: failed,
    },
  });

  await notifyJobComplete(tenantId, jobId, "COMPLETED");
}
