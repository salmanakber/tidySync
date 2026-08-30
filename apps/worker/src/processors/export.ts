import { prisma } from "@tidysync/database";
import { stringify } from "csv-stringify/sync";
import fs from "node:fs";
import path from "node:path";
import { fetchProductsForExport } from "../shopify-products";
import { fetchCollectionsForExport, fetchCustomersForExport, fetchDiscountsForExport, fetchMetafieldsForExport } from "../shopify-resources";

export async function processExportJob(
  jobId: string,
  tenantId: string,
  shop: string,
  platformKey?: string,
  resourceType = "products",
) {
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  let rows: Record<string, string>[] = [];

  if (resourceType === "collections") {
    const collections = await fetchCollectionsForExport(shop, 500);
    for (const col of collections as Array<{
      title: string;
      handle?: string;
      descriptionHtml?: string;
      sortOrder?: string;
      ruleSet?: { rules?: Array<{ column: string; relation: string; condition: string }> };
    }>) {
      const rules = col.ruleSet?.rules?.map((r) => `${r.column}:${r.relation}:${r.condition}`).join("|") ?? "";
      rows.push({
        title: col.title,
        handle: col.handle ?? "",
        descriptionHtml: col.descriptionHtml ?? "",
        sortOrder: col.sortOrder ?? "",
        ruleSet: rules,
      });
    }
  } else if (resourceType === "customers") {
    const customers = await fetchCustomersForExport(shop, 500);
    for (const c of customers as Array<{
      email?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      tags?: string[];
      note?: string;
      acceptsMarketing?: boolean;
      defaultAddress?: {
        address1?: string;
        city?: string;
        province?: string;
        country?: string;
        zip?: string;
      };
    }>) {
      const addr = c.defaultAddress;
      rows.push({
        email: c.email ?? "",
        firstName: c.firstName ?? "",
        lastName: c.lastName ?? "",
        phone: c.phone ?? "",
        tags: (c.tags ?? []).join(","),
        note: c.note ?? "",
        acceptsMarketing: String(c.acceptsMarketing ?? false),
        address1: addr?.address1 ?? "",
        city: addr?.city ?? "",
        province: addr?.province ?? "",
        country: addr?.country ?? "",
        zip: addr?.zip ?? "",
      });
    }
  } else if (resourceType === "discounts") {
    const discounts = await fetchDiscountsForExport(shop, 250);
    for (const node of discounts as Array<{
      id: string;
      codeDiscount?: {
        title?: string;
        codes?: { edges: Array<{ node: { code: string } }> };
        startsAt?: string;
        endsAt?: string;
        usageLimit?: number;
        appliesOncePerCustomer?: boolean;
        customerGets?: {
          value?: { percentage?: number; amount?: { amount: string } };
        };
      };
    }>) {
      const d = node.codeDiscount;
      const code = d?.codes?.edges?.[0]?.node?.code ?? "";
      const value = d?.customerGets?.value;
      const valueType = value?.percentage != null ? "percentage" : "fixed_amount";
      const valueAmount = value?.percentage ?? value?.amount?.amount ?? "";
      rows.push({
        title: d?.title ?? "",
        code,
        valueType,
        value: String(valueAmount),
        startsAt: d?.startsAt ?? "",
        endsAt: d?.endsAt ?? "",
        usageLimit: String(d?.usageLimit ?? ""),
        appliesOncePerCustomer: String(d?.appliesOncePerCustomer ?? false),
      });
    }
  } else if (resourceType === "metafields") {
    const metafields = await fetchMetafieldsForExport(shop, 250);
    for (const mf of metafields as Array<Record<string, unknown>>) {
      rows.push({
        ownerType: String(mf.ownerType ?? "PRODUCT"),
        ownerId: String(mf.ownerId ?? ""),
        ownerTitle: String(mf.ownerTitle ?? ""),
        namespace: String(mf.namespace ?? ""),
        key: String(mf.key ?? ""),
        value: String(mf.value ?? ""),
        type: String(mf.type ?? "single_line_text_field"),
        description: String(mf.description ?? ""),
      });
    }
  } else {
    const products = await fetchProductsForExport(shop, 500);
    for (const product of products as Array<{
      title: string;
      descriptionHtml?: string;
      productType?: string;
      tags: string[];
      variants: { edges: Array<{ node: Record<string, unknown> }> };
    }>) {
      const variant = product.variants.edges[0]?.node;
      const row: Record<string, string> = {
        title: product.title,
        descriptionHtml: product.descriptionHtml ?? "",
        productType: product.productType ?? "",
        tags: (product.tags ?? []).join(","),
        sku: String(variant?.sku ?? ""),
        price: String(variant?.price ?? ""),
        compareAtPrice: String(variant?.compareAtPrice ?? ""),
        inventoryQuantity: String(variant?.inventoryQuantity ?? ""),
      };

      if (platformKey === "woocommerce") {
        rows.push({
          Name: row.title,
          SKU: row.sku,
          "Regular price": row.price,
          Stock: row.inventoryQuantity,
          Description: row.descriptionHtml,
          Categories: row.productType,
          Tags: row.tags,
        });
      } else if (platformKey === "bigcommerce") {
        rows.push({
          "Product Name": row.title,
          SKU: row.sku,
          Price: row.price,
          "Current Stock": row.inventoryQuantity,
          Description: row.descriptionHtml,
          Category: row.productType,
        });
      } else if (platformKey === "magento") {
        rows.push({
          name: row.title,
          sku: row.sku,
          price: row.price,
          qty: row.inventoryQuantity,
          description: row.descriptionHtml,
          categories: row.productType,
        });
      } else if (platformKey === "etsy") {
        rows.push({
          TITLE: row.title,
          DESCRIPTION: row.descriptionHtml,
          SKU: row.sku,
          PRICE: row.price,
          QUANTITY: row.inventoryQuantity,
          TAGS: row.tags,
        });
      } else if (platformKey === "amazon") {
        rows.push({
          "item-name": row.title,
          "item-description": row.descriptionHtml,
          "seller-sku": row.sku,
          "standard-price": row.price,
          quantity: row.inventoryQuantity,
          "product-type": row.productType,
        });
      } else if (platformKey === "google_merchant" || platformKey === "facebook_catalog") {
        rows.push({
          id: row.sku || row.title,
          title: row.title,
          description: row.descriptionHtml,
          price: row.price ? `${row.price} USD` : "",
          availability: Number(row.inventoryQuantity) > 0 ? "in stock" : "out of stock",
          brand: "",
          "product type": row.productType,
        });
      } else if (platformKey === "ebay") {
        rows.push({
          "*Title": row.title,
          Description: row.descriptionHtml,
          CustomLabel: row.sku,
          "*StartPrice": row.price,
          "*Quantity": row.inventoryQuantity,
        });
      } else if (platformKey && platformKey !== "shopify") {
        // Generic cross-platform row using common headers
        rows.push({
          title: row.title,
          description: row.descriptionHtml,
          sku: row.sku,
          price: row.price,
          compare_at_price: row.compareAtPrice,
          inventory: row.inventoryQuantity,
          product_type: row.productType,
          tags: row.tags,
        });
      } else {
        rows.push(row);
      }
    }
  }

  const uploadDir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
  const fileName = `export-${resourceType}-${jobId}.csv`;
  const filePath = path.join(uploadDir, fileName);
  const csv = stringify(rows, { header: true });
  fs.writeFileSync(filePath, csv);

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "COMPLETED",
      finishedAt: new Date(),
      rowCount: rows.length,
      processedCount: rows.length,
      successCount: rows.length,
      fileName,
      filePath,
      resourceType,
    },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      action: "export.completed",
      resourceType: "job",
      resourceId: jobId,
      metadata: { rowCount: rows.length, platformKey, resourceType },
    },
  });
}
