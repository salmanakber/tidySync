import { merchantGraphqlRequest } from "../shopify/client";
import { analyzeProductSeoMetrics } from "./product-seo";

const PRODUCTS_SCAN_QUERY = `#graphql
  query StoreScanProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          handle
          descriptionHtml
          vendor
          status
          seo { title description }
          featuredImage { url altText }
          images(first: 5) { nodes { url altText } }
          variants(first: 10) {
            edges { node { id sku price } }
          }
        }
      }
    }
  }
`;

export interface StoreScanIssue {
  id: string;
  severity: "critical" | "warning" | "info";
  category: string;
  title: string;
  detail: string;
  productId?: string;
  productTitle?: string;
  score?: number;
}

export interface StoreScanResult {
  productCount: number;
  overallHealthScore: number;
  seoScore: number;
  catalogScore: number;
  issues: StoreScanIssue[];
  summary: string;
}

export async function scanStoreHealth(
  shop: string,
  sessionToken?: string,
  maxProducts = 100,
): Promise<StoreScanResult> {
  const products: Array<Record<string, unknown>> = [];
  let after: string | null = null;
  let hasNext = true;

  while (hasNext && products.length < maxProducts) {
    const response: {
      data?: {
        products?: {
          pageInfo: { hasNextPage: boolean; endCursor: string };
          edges: Array<{ node: Record<string, unknown> }>;
        };
      };
    } = await merchantGraphqlRequest(shop, sessionToken, PRODUCTS_SCAN_QUERY, {
      first: Math.min(50, maxProducts - products.length),
      after,
    });

    const block = response.data?.products;
    if (!block) break;

    for (const edge of block.edges) {
      products.push(edge.node);
    }
    hasNext = block.pageInfo.hasNextPage;
    after = block.pageInfo.endCursor;
  }

  const issues: StoreScanIssue[] = [];
  const skuMap = new Map<string, string>();
  let seoTotal = 0;
  let catalogPoints = 0;
  let catalogMax = 0;

  for (const raw of products) {
    const title = String(raw.title ?? "");
    const id = String(raw.id);
    const descriptionHtml = raw.descriptionHtml as string | null;
    const seo = raw.seo as { title?: string | null; description?: string | null } | null;
    const featuredImage = raw.featuredImage as { url?: string; altText?: string | null } | null;
    const images = (raw.images as { nodes?: Array<{ url?: string; altText?: string | null }> })?.nodes ?? [];
    const variants = (raw.variants as { edges?: Array<{ node: { id: string; sku?: string; price?: string } }> })?.edges ?? [];

    const metrics = analyzeProductSeoMetrics({
      title,
      descriptionHtml,
      seo,
      featuredImage,
      images,
    });
    seoTotal += metrics.overallScore;

    if (metrics.overallScore < 50) {
      issues.push({
        id: `seo-low-${id}`,
        severity: "warning",
        category: "SEO",
        title: "Poor SEO score",
        detail: `Score ${metrics.overallScore}/100 — improve title, meta, and description.`,
        productId: id,
        productTitle: title,
        score: metrics.overallScore,
      });
    }

    if (!seo?.title?.trim()) {
      issues.push({
        id: `seo-title-${id}`,
        severity: "warning",
        category: "SEO",
        title: "Missing SEO title",
        detail: "No custom search listing title set.",
        productId: id,
        productTitle: title,
      });
    }

    if (!seo?.description?.trim()) {
      issues.push({
        id: `seo-meta-${id}`,
        severity: "info",
        category: "SEO",
        title: "Missing meta description",
        detail: "Add a meta description for Google snippets.",
        productId: id,
        productTitle: title,
      });
    }

    catalogMax += 3;
    if (!descriptionHtml?.trim()) {
      issues.push({
        id: `desc-empty-${id}`,
        severity: "critical",
        category: "Catalog",
        title: "Empty description",
        detail: "Product has no description — hurts conversion and SEO.",
        productId: id,
        productTitle: title,
      });
    } else {
      catalogPoints += 1;
    }

    if (!featuredImage?.url) {
      issues.push({
        id: `img-missing-${id}`,
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

    if (variants.length === 0) {
      issues.push({
        id: `variant-missing-${id}`,
        severity: "critical",
        category: "Catalog",
        title: "No variants",
        detail: "Product has no sellable variant.",
        productId: id,
        productTitle: title,
      });
    } else {
      catalogPoints += 1;
    }

    for (const { node } of variants) {
      const sku = node.sku?.trim();
      if (!sku) continue;
      if (skuMap.has(sku)) {
        issues.push({
          id: `dup-sku-${sku}-${id}`,
          severity: "critical",
          category: "Catalog",
          title: "Duplicate SKU",
          detail: `SKU "${sku}" also used on ${skuMap.get(sku)}.`,
          productId: id,
          productTitle: title,
        });
      } else {
        skuMap.set(sku, title);
      }
    }
  }

  const productCount = products.length;
  const seoScore = productCount > 0 ? Math.round(seoTotal / productCount) : 0;
  const catalogScore = catalogMax > 0 ? Math.round((catalogPoints / catalogMax) * 100) : 0;
  const overallHealthScore = Math.round((seoScore + catalogScore) / 2);

  const critical = issues.filter((i) => i.severity === "critical").length;
  const warning = issues.filter((i) => i.severity === "warning").length;

  const summary =
    productCount === 0
      ? "No products found in your catalog."
      : `Scanned ${productCount} products. Found ${critical} critical and ${warning} warning issues. Overall health ${overallHealthScore}/100.`;

  return {
    productCount,
    overallHealthScore,
    seoScore,
    catalogScore,
    issues: issues.slice(0, 80),
    summary,
  };
}
