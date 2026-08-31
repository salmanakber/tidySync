import { fetchProductsForExport } from "../shopify-products";

export interface StoreScanIssue {
  id: string;
  severity: "critical" | "warning" | "info";
  category: string;
  title: string;
  detail: string;
  productId?: string;
  productTitle?: string;
}

export interface StoreScanResult {
  productCount: number;
  overallHealthScore: number;
  seoScore: number;
  catalogScore: number;
  issues: StoreScanIssue[];
  summary: string;
}

export async function scanStoreInWorker(shop: string, maxProducts = 150): Promise<StoreScanResult> {
  const products = (await fetchProductsForExport(shop, maxProducts)) as Array<{
    id: string;
    title: string;
    descriptionHtml?: string;
    vendor?: string;
    tags?: string[];
    featuredImage?: { url?: string } | null;
    variants?: { edges?: Array<{ node: { id: string; sku?: string; price?: string } }> };
  }>;

  const issues: StoreScanIssue[] = [];
  const skuMap = new Map<string, string>();
  let seoPoints = 0;
  let catalogPoints = 0;
  let catalogMax = 0;

  for (const product of products) {
    const id = product.id;
    const title = product.title ?? "";
    catalogMax += 3;

    if (!product.descriptionHtml?.trim() || product.descriptionHtml.length < 40) {
      issues.push({
        id: `desc-${id}`,
        severity: "warning",
        category: "Catalog",
        title: "Thin description",
        detail: "Description is missing or very short.",
        productId: id,
        productTitle: title,
      });
      seoPoints += 30;
    } else {
      seoPoints += 70;
      catalogPoints += 1;
    }

    if (!product.featuredImage?.url) {
      issues.push({
        id: `img-${id}`,
        severity: "warning",
        category: "Catalog",
        title: "No featured image",
        detail: "Add a primary product image.",
        productId: id,
        productTitle: title,
      });
    } else {
      catalogPoints += 1;
    }

    const variants = product.variants?.edges ?? [];
    if (variants.length === 0) {
      issues.push({
        id: `var-${id}`,
        severity: "critical",
        category: "Catalog",
        title: "No variants",
        detail: "Product has no sellable variant.",
        productId: id,
        productTitle: title,
      });
    } else {
      catalogPoints += 1;
      for (const { node } of variants) {
        const sku = node.sku?.trim();
        if (!sku) continue;
        if (skuMap.has(sku)) {
          issues.push({
            id: `sku-${sku}-${id}`,
            severity: "critical",
            category: "Catalog",
            title: "Duplicate SKU",
            detail: `SKU "${sku}" also on ${skuMap.get(sku)}.`,
            productId: id,
            productTitle: title,
          });
        } else {
          skuMap.set(sku, title);
        }
      }
    }
  }

  const productCount = products.length;
  const seoScore = productCount > 0 ? Math.round(seoPoints / productCount) : 0;
  const catalogScore = catalogMax > 0 ? Math.round((catalogPoints / catalogMax) * 100) : 0;
  const overallHealthScore = Math.round((seoScore + catalogScore) / 2);
  const critical = issues.filter((i) => i.severity === "critical").length;
  const warning = issues.filter((i) => i.severity === "warning").length;

  return {
    productCount,
    overallHealthScore,
    seoScore,
    catalogScore,
    issues: issues.slice(0, 80),
    summary:
      productCount === 0
        ? "No products found."
        : `Scanned ${productCount} products — ${critical} critical, ${warning} warnings. Health ${overallHealthScore}/100.`,
  };
}
