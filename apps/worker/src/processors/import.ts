import { prisma } from "@tidysync/database";
import { applyMappingsToRow } from "@tidysync/shared";
import { streamFileRows } from "../file-parser";
import { getShopGraphqlClient } from "../shopify";

const PRODUCT_CREATE = `#graphql
  mutation productCreate($input: ProductInput!) {
    productCreate(input: $input) {
      product { id title }
      userErrors { field message }
    }
  }
`;

const COLLECTION_CREATE = `#graphql
  mutation collectionCreate($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection { id title }
      userErrors { field message }
    }
  }
`;

const CUSTOMER_CREATE = `#graphql
  mutation customerCreate($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer { id email }
      userErrors { field message }
    }
  }
`;

const METAFIELDS_SET = `#graphql
  mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key }
      userErrors { field message }
    }
  }
`;

const DISCOUNT_CREATE = `#graphql
  mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }
`;

export async function processImportJob(jobId: string, tenantId: string, shop: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job?.filePath) throw new Error("Import job missing file");

  const mutationPlan = job.mutationPlan as { mappings?: Array<{ sourceColumn: string; targetField: string }> };
  const mappings = mutationPlan?.mappings ?? [];
  const resourceType = job.resourceType ?? "products";

  await prisma.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  const client = await getShopGraphqlClient(shop);
  let processed = 0;
  let success = 0;
  let failed = 0;

  await streamFileRows(job.filePath, async (row, index) => {
    processed++;
    const mapped = applyMappingsToRow(row, mappings);

    try {
      if (resourceType === "collections") {
        const title = (mapped.title as string) ?? `Imported collection ${index + 1}`;
        const response = await client.request(COLLECTION_CREATE, {
          variables: {
            input: {
              title,
              handle: mapped.handle as string | undefined,
              descriptionHtml: mapped.descriptionHtml as string | undefined,
            },
          },
        });
        const data = response.data as {
          collectionCreate: {
            collection: { id: string; title: string } | null;
            userErrors: Array<{ message: string }>;
          };
        };
        if (data.collectionCreate.userErrors?.length) {
          failed++;
          await prisma.jobLineItem.create({
            data: {
              tenantId,
              jobId,
              rowIndex: index,
              status: "FAILED",
              errorMessage: data.collectionCreate.userErrors.map((e) => e.message).join(", "),
            },
          });
        } else if (data.collectionCreate.collection) {
          success++;
          const collectionId = data.collectionCreate.collection.id;
          await prisma.jobSnapshot.create({
            data: {
              tenantId,
              jobId,
              resourceType: "collection",
              resourceId: collectionId,
              beforeState: {},
              afterState: mapped as object,
            },
          });
          await prisma.jobLineItem.create({
            data: {
              tenantId,
              jobId,
              rowIndex: index,
              resourceType: "collection",
              resourceId: collectionId,
              status: "SUCCESS",
              afterValue: mapped as object,
            },
          });
        }
      } else if (resourceType === "customers") {
        const email = mapped.email as string | undefined;
        const response = await client.request(CUSTOMER_CREATE, {
          variables: {
            input: {
              email,
              firstName: mapped.firstName as string | undefined,
              lastName: mapped.lastName as string | undefined,
              phone: mapped.phone as string | undefined,
              tags: mapped.tags as string[] | undefined,
              note: mapped.note as string | undefined,
              acceptsMarketing: mapped.acceptsMarketing === "true" || mapped.acceptsMarketing === true,
            },
          },
        });
        const data = response.data as {
          customerCreate: {
            customer: { id: string; email: string } | null;
            userErrors: Array<{ message: string }>;
          };
        };
        if (data.customerCreate.userErrors?.length) {
          failed++;
          await prisma.jobLineItem.create({
            data: {
              tenantId,
              jobId,
              rowIndex: index,
              status: "FAILED",
              errorMessage: data.customerCreate.userErrors.map((e) => e.message).join(", "),
            },
          });
        } else if (data.customerCreate.customer) {
          success++;
          const customerId = data.customerCreate.customer.id;
          await prisma.jobSnapshot.create({
            data: {
              tenantId,
              jobId,
              resourceType: "customer",
              resourceId: customerId,
              beforeState: {},
              afterState: mapped as object,
            },
          });
          await prisma.jobLineItem.create({
            data: {
              tenantId,
              jobId,
              rowIndex: index,
              resourceType: "customer",
              resourceId: customerId,
              status: "SUCCESS",
              afterValue: mapped as object,
            },
          });
        }
      } else if (resourceType === "metafields") {
        const ownerId = mapped.ownerId as string;
        const namespace = mapped.namespace as string;
        const key = mapped.key as string;
        const value = String(mapped.value ?? "");
        const type = (mapped.type as string) ?? "single_line_text_field";
        if (!ownerId || !namespace || !key) {
          failed++;
          await prisma.jobLineItem.create({
            data: {
              tenantId,
              jobId,
              rowIndex: index,
              status: "FAILED",
              errorMessage: "ownerId, namespace, and key are required for metafields",
            },
          });
        } else {
          const response = await client.request(METAFIELDS_SET, {
            variables: {
              metafields: [
                {
                  ownerId,
                  namespace,
                  key,
                  value,
                  type,
                },
              ],
            },
          });
          const data = response.data as {
            metafieldsSet: {
              metafields: Array<{ id: string }> | null;
              userErrors: Array<{ message: string }>;
            };
          };
          if (data.metafieldsSet.userErrors?.length) {
            failed++;
            await prisma.jobLineItem.create({
              data: {
                tenantId,
                jobId,
                rowIndex: index,
                status: "FAILED",
                errorMessage: data.metafieldsSet.userErrors.map((e) => e.message).join(", "),
              },
            });
          } else {
            success++;
            const mfId = data.metafieldsSet.metafields?.[0]?.id ?? `mf-${index}`;
            await prisma.jobSnapshot.create({
              data: {
                tenantId,
                jobId,
                resourceType: "metafield",
                resourceId: mfId,
                beforeState: {},
                afterState: mapped as object,
              },
            });
            await prisma.jobLineItem.create({
              data: {
                tenantId,
                jobId,
                rowIndex: index,
                resourceType: "metafield",
                resourceId: mfId,
                status: "SUCCESS",
                afterValue: mapped as object,
              },
            });
          }
        }
      } else if (resourceType === "discounts") {
        const title = (mapped.title as string) ?? `Discount ${index + 1}`;
        const code = (mapped.code as string) ?? `IMPORT${Date.now()}${index}`;
        const valueType = (mapped.valueType as string) ?? "percentage";
        const valueNum = Number(mapped.value ?? 10);
        const customerGets =
          valueType === "percentage"
            ? { percentage: valueNum / 100 }
            : { discountAmount: { amount: String(valueNum), appliesOnEachItem: false } };

        const response = await client.request(DISCOUNT_CREATE, {
          variables: {
            basicCodeDiscount: {
              title,
              code,
              startsAt: (mapped.startsAt as string | undefined) ?? new Date().toISOString(),
              endsAt: mapped.endsAt as string | undefined,
              usageLimit: mapped.usageLimit ? Number(mapped.usageLimit) : undefined,
              appliesOncePerCustomer: mapped.appliesOncePerCustomer === "true" || mapped.appliesOncePerCustomer === true,
              customerGets: { value: customerGets, items: { all: true } },
              customerSelection: { all: true },
            },
          },
        });
        const data = response.data as {
          discountCodeBasicCreate: {
            codeDiscountNode: { id: string } | null;
            userErrors: Array<{ message: string }>;
          };
        };
        if (data.discountCodeBasicCreate.userErrors?.length) {
          failed++;
          await prisma.jobLineItem.create({
            data: {
              tenantId,
              jobId,
              rowIndex: index,
              status: "FAILED",
              errorMessage: data.discountCodeBasicCreate.userErrors.map((e) => e.message).join(", "),
            },
          });
        } else if (data.discountCodeBasicCreate.codeDiscountNode) {
          success++;
          const discountId = data.discountCodeBasicCreate.codeDiscountNode.id;
          await prisma.jobSnapshot.create({
            data: {
              tenantId,
              jobId,
              resourceType: "discount",
              resourceId: discountId,
              beforeState: {},
              afterState: mapped as object,
            },
          });
          await prisma.jobLineItem.create({
            data: {
              tenantId,
              jobId,
              rowIndex: index,
              resourceType: "discount",
              resourceId: discountId,
              status: "SUCCESS",
              afterValue: mapped as object,
            },
          });
        }
      } else {
        const title = (mapped.title as string) ?? `Imported product ${index + 1}`;
        const response = await client.request(PRODUCT_CREATE, {
          variables: {
            input: {
              title,
              descriptionHtml: mapped.descriptionHtml as string | undefined,
              productType: mapped.productType as string | undefined,
              tags: mapped.tags as string[] | undefined,
              variants: mapped.variants
                ? [
                    {
                      sku: (mapped.variants as Record<string, unknown>).sku as string | undefined,
                      price: String((mapped.variants as Record<string, unknown>).price ?? "0"),
                      inventoryQuantities: [
                        {
                          availableQuantity: Number(
                            (mapped.variants as Record<string, unknown>).inventoryQuantity ?? 0,
                          ),
                          locationId: "gid://shopify/Location/1",
                        },
                      ],
                    },
                  ]
                : undefined,
            },
          },
        });

        const data = response.data as {
          productCreate: {
            product: { id: string; title: string } | null;
            userErrors: Array<{ message: string }>;
          };
        };

        if (data.productCreate.userErrors?.length) {
          failed++;
          await prisma.jobLineItem.create({
            data: {
              tenantId,
              jobId,
              rowIndex: index,
              status: "FAILED",
              errorMessage: data.productCreate.userErrors.map((e) => e.message).join(", "),
              autoFixSuggestion: "Check required fields and SKU uniqueness",
            },
          });
        } else if (data.productCreate.product) {
          success++;
          const productId = data.productCreate.product.id;
          await prisma.jobSnapshot.create({
            data: {
              tenantId,
              jobId,
              resourceType: "product",
              resourceId: productId,
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
              resourceId: productId,
              status: "SUCCESS",
              afterValue: mapped as object,
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
          rowIndex: index,
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "Unknown error",
        },
      });
    }

    await prisma.job.update({
      where: { id: jobId },
      data: { processedCount: processed, successCount: success, failedCount: failed },
    });
  });

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: failed > 0 && success === 0 ? "FAILED" : "COMPLETED",
      finishedAt: new Date(),
      rowCount: processed,
      errorSummary: failed > 0 ? `${failed} rows failed` : null,
    },
  });
}
