import { prisma } from "@tidysync/database";
import type { ExtendedDiffRow, MutationPlan } from "@tidysync/shared";
import { generateProductSeoImprovements, rewriteProductContent } from "@tidysync/ai";
import { getShopGraphqlClient } from "../shopify";
import { buildDiffFromMutationPlan } from "../shopify-products";
import { buildVariantBulkInput } from "../shopify-product-create";

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

async function processAiSeoImprovements(
  jobId: string,
  tenantId: string,
  shop: string,
  plan: MutationPlan,
  client: Awaited<ReturnType<typeof getShopGraphqlClient>>,
): Promise<{ success: number; failed: number; processed: number } | null> {
  const seoSteps = plan.steps.filter((s) => s.action === "ai_improve_seo");
  if (!seoSteps.length) return null;

  const seoPlan: MutationPlan = { steps: seoSteps };
  const diff = await buildDiffFromMutationPlan(shop, seoPlan);
  const productIds = [...new Set(diff.rows.map((r) => (r as ExtendedDiffRow).productId ?? r.resourceId))];

  let success = 0;
  let failed = 0;
  let processed = 0;

  for (const productId of productIds) {
    processed++;
    try {
      const productRes = (await client.request(
        `#graphql
          query ProductForSeo($id: ID!) {
            product(id: $id) {
              id title handle descriptionHtml
              seo { title description }
            }
          }`,
        { variables: { id: productId } },
      )) as {
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

      const productInput: Record<string, unknown> = {
        id: productId,
        descriptionHtml: improvements.descriptionHtml,
        seo: {
          title: improvements.seoTitle,
          description: improvements.seoDescription,
        },
      };

      const updateRes = (await client.request(PRODUCT_UPDATE, {
        variables: { product: productInput },
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

async function processAiDescriptionRewrite(
  jobId: string,
  tenantId: string,
  shop: string,
  plan: MutationPlan,
  client: Awaited<ReturnType<typeof getShopGraphqlClient>>,
): Promise<{ success: number; failed: number; processed: number } | null> {
  const rewriteSteps = plan.steps.filter((s) => s.action === "ai_rewrite_description");
  if (!rewriteSteps.length) return null;

  const rewritePlan: MutationPlan = { steps: rewriteSteps };
  const diff = await buildDiffFromMutationPlan(shop, rewritePlan);
  const productIds = [...new Set(diff.rows.map((r) => (r as ExtendedDiffRow).productId ?? r.resourceId))];

  let success = 0;
  let failed = 0;
  let processed = 0;
  const brandVoice =
    String(rewriteSteps[0]?.value ?? "professional, helpful, SEO-optimized");

  for (const productId of productIds) {
    processed++;
    try {
      const productRes = (await client.request(
        `#graphql
          query ProductForRewrite($id: ID!) {
            product(id: $id) { id title descriptionHtml }
          }`,
        { variables: { id: productId } },
      )) as {
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

      const updateRes = (await client.request(PRODUCT_UPDATE, {
        variables: { product: { id: productId, descriptionHtml: newHtml } },
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

export async function processBulkEditJob(jobId: string, tenantId: string, shop: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job?.mutationPlan) throw new Error("Bulk edit job missing plan");

  const planRoot = job.mutationPlan as { action?: string; primaryProductId?: string; duplicateProductIds?: string[] };
  if (planRoot.action === "merge_products" && planRoot.primaryProductId && planRoot.duplicateProductIds) {
    const { processProductMergeJob } = await import("./product-merge");
    await processProductMergeJob(
      jobId,
      tenantId,
      shop,
      planRoot.primaryProductId,
      planRoot.duplicateProductIds,
    );
    return;
  }

  await prisma.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  const plan = job.mutationPlan as unknown as MutationPlan;
  const client = await getShopGraphqlClient(shop);

  const aiSeoResult = await processAiSeoImprovements(jobId, tenantId, shop, plan, client);
  if (aiSeoResult && plan.steps.every((s) => s.action === "ai_improve_seo")) {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: aiSeoResult.failed > 0 && aiSeoResult.success === 0 ? "FAILED" : "COMPLETED",
        finishedAt: new Date(),
        rowCount: aiSeoResult.processed,
        errorSummary: aiSeoResult.failed > 0 ? `${aiSeoResult.failed} SEO updates failed` : null,
      },
    });
    return;
  }

  const aiRewriteResult = await processAiDescriptionRewrite(jobId, tenantId, shop, plan, client);
  if (aiRewriteResult && plan.steps.every((s) => s.action === "ai_rewrite_description")) {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: aiRewriteResult.failed > 0 && aiRewriteResult.success === 0 ? "FAILED" : "COMPLETED",
        finishedAt: new Date(),
        rowCount: aiRewriteResult.processed,
        errorSummary: aiRewriteResult.failed > 0 ? `${aiRewriteResult.failed} description updates failed` : null,
      },
    });
    return;
  }

  const nonSeoPlan: MutationPlan = {
    steps: plan.steps.filter((s) => s.action !== "ai_improve_seo" && s.action !== "ai_rewrite_description"),
  };

  const diff =
    nonSeoPlan.steps.length > 0
      ? await buildDiffFromMutationPlan(shop, nonSeoPlan)
      : { rows: [], totalChanges: 0 };
  const rows = diff.rows as ExtendedDiffRow[];

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
