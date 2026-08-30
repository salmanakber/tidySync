import type { MutationPlan } from "@tidysync/shared";
import { buildDiffFromProducts, type ProductForMutation } from "@tidysync/shared";
import { getShopGraphqlClient } from "./shopify";

const PRODUCTS_QUERY = `#graphql
  query Products($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          descriptionHtml
          vendor
          productType
          tags
          status
          variants(first: 50) {
            edges {
              node {
                id
                sku
                price
                compareAtPrice
                inventoryQuantity
                weight
                barcode
              }
            }
          }
        }
      }
    }
  }
`;

export async function fetchProductsForExport(shop: string, limit = 250) {
  const client = await getShopGraphqlClient(shop);
  const products: unknown[] = [];
  let after: string | null = null;
  let hasNext = true;

  while (hasNext && products.length < limit) {
    const response = await client.request(PRODUCTS_QUERY, {
      variables: { first: 50, after },
    });
    const data = response.data as {
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string };
        edges: Array<{ node: unknown }>;
      };
    };

    for (const edge of data.products.edges) {
      products.push(edge.node);
    }

    hasNext = data.products.pageInfo.hasNextPage;
    after = data.products.pageInfo.endCursor;
  }

  return products;
}

function normalizeProduct(raw: Record<string, unknown>): ProductForMutation {
  const variantsRaw = raw.variants as { edges?: Array<{ node: Record<string, unknown> }> };
  return {
    id: String(raw.id),
    title: String(raw.title ?? ""),
    descriptionHtml: raw.descriptionHtml ? String(raw.descriptionHtml) : undefined,
    vendor: raw.vendor ? String(raw.vendor) : undefined,
    productType: raw.productType ? String(raw.productType) : undefined,
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    status: raw.status ? String(raw.status) : undefined,
    variants: (variantsRaw?.edges ?? []).map(({ node }) => ({
      id: String(node.id),
      sku: node.sku ? String(node.sku) : undefined,
      price: node.price as string | number | undefined,
      compareAtPrice: node.compareAtPrice as string | number | null | undefined,
      inventoryQuantity:
        typeof node.inventoryQuantity === "number" ? node.inventoryQuantity : undefined,
      weight: typeof node.weight === "number" ? node.weight : undefined,
      barcode: node.barcode ? String(node.barcode) : undefined,
    })),
  };
}

export async function buildDiffFromMutationPlan(shop: string, plan: MutationPlan) {
  const products = await fetchProductsForExport(shop, 250);
  const normalized = products.map((p) => normalizeProduct(p as Record<string, unknown>));
  return buildDiffFromProducts(normalized, plan);
}
