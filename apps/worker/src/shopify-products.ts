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

export async function buildDiffFromMutationPlan(
  shop: string,
  plan: import("@tidysync/shared").MutationPlan,
) {
  const products = await fetchProductsForExport(shop, 100);
  const rows: Array<{
    resourceType: string;
    resourceId: string;
    resourceTitle?: string;
    field: string;
    before: string | number | null;
    after: string | number | null;
  }> = [];

  for (const product of products as Array<{
    id: string;
    title: string;
    variants: { edges: Array<{ node: Record<string, unknown> }> };
  }>) {
    for (const step of plan.steps) {
      if (step.field.startsWith("variants.")) {
        const variantField = step.field.replace("variants.", "");
        for (const { node: variant } of product.variants.edges) {
          const before = variant[variantField];
          let after: number | string | null = before as number | string | null;

          if (step.action === "multiply" && typeof before === "string") {
            const num = parseFloat(before);
            after = (num * (step.value as number)).toFixed(2);
          } else if (step.action === "set") {
            after = step.value as string | number;
          }

          rows.push({
            resourceType: "variant",
            resourceId: variant.id as string,
            resourceTitle: product.title,
            field: step.field,
            before: before as string | number | null,
            after,
          });
        }
      }
    }
  }

  return { rows, totalChanges: rows.length };
}
