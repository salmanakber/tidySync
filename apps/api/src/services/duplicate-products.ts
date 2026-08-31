import { merchantGraphqlRequest } from "../shopify/client";

const PRODUCTS_DUPLICATE_QUERY = `#graphql
  query DuplicateScanProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          handle
          vendor
          featuredImage { url }
          variants(first: 5) { edges { node { id sku } } }
        }
      }
    }
  }
`;

export interface DuplicateProductEntry {
  id: string;
  title: string;
  handle?: string;
  vendor?: string;
  imageUrl?: string;
  variantCount: number;
}

export interface DuplicateProductGroup {
  id: string;
  reason: string;
  matchKey: string;
  products: DuplicateProductEntry[];
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHandle(handle: string): string {
  return handle.toLowerCase().trim();
}

export async function findDuplicateProducts(
  shop: string,
  sessionToken?: string,
  maxProducts = 250,
): Promise<DuplicateProductGroup[]> {
  const products: Array<{
    id: string;
    title: string;
    handle?: string;
    vendor?: string;
    imageUrl?: string;
    variantCount: number;
  }> = [];

  let after: string | null = null;
  let hasNext = true;

  while (hasNext && products.length < maxProducts) {
    const response: {
      data?: {
        products?: {
          pageInfo: { hasNextPage: boolean; endCursor: string };
          edges: Array<{
            node: {
              id: string;
              title: string;
              handle?: string;
              vendor?: string;
              featuredImage?: { url?: string } | null;
              variants?: { edges: Array<{ node: { id: string } }> };
            };
          }>;
        };
      };
    } = await merchantGraphqlRequest(shop, sessionToken, PRODUCTS_DUPLICATE_QUERY, {
      first: Math.min(50, maxProducts - products.length),
      after,
    });

    const block = response.data?.products;
    if (!block) break;

    for (const { node } of block.edges) {
      products.push({
        id: node.id,
        title: node.title,
        handle: node.handle,
        vendor: node.vendor,
        imageUrl: node.featuredImage?.url,
        variantCount: node.variants?.edges?.length ?? 0,
      });
    }
    hasNext = block.pageInfo.hasNextPage;
    after = block.pageInfo.endCursor;
  }

  const titleGroups = new Map<string, DuplicateProductEntry[]>();
  const handleGroups = new Map<string, DuplicateProductEntry[]>();
  const vendorTitleGroups = new Map<string, DuplicateProductEntry[]>();

  for (const p of products) {
    const entry: DuplicateProductEntry = {
      id: p.id,
      title: p.title,
      handle: p.handle,
      vendor: p.vendor,
      imageUrl: p.imageUrl,
      variantCount: p.variantCount,
    };

    const normTitle = normalizeTitle(p.title);
    if (normTitle.length >= 3) {
      const list = titleGroups.get(normTitle) ?? [];
      list.push(entry);
      titleGroups.set(normTitle, list);
    }

    if (p.handle) {
      const normHandle = normalizeHandle(p.handle);
      const list = handleGroups.get(normHandle) ?? [];
      list.push(entry);
      handleGroups.set(normHandle, list);
    }

    if (p.vendor && normTitle.length >= 3) {
      const key = `${p.vendor.toLowerCase()}::${normTitle}`;
      const list = vendorTitleGroups.get(key) ?? [];
      list.push(entry);
      vendorTitleGroups.set(key, list);
    }
  }

  const groups: DuplicateProductGroup[] = [];
  const seenProductSets = new Set<string>();

  const addGroup = (reason: string, matchKey: string, entries: DuplicateProductEntry[]) => {
    if (entries.length < 2) return;
    const ids = entries.map((e) => e.id).sort().join(",");
    if (seenProductSets.has(ids)) return;
    seenProductSets.add(ids);
    groups.push({
      id: `dup-${reason}-${matchKey.slice(0, 32)}`,
      reason,
      matchKey,
      products: entries,
    });
  };

  for (const [key, entries] of titleGroups) {
    addGroup("Same product title", key, entries);
  }
  for (const [key, entries] of vendorTitleGroups) {
    addGroup("Same vendor + title", key, entries);
  }
  for (const [key, entries] of handleGroups) {
    if (entries.length >= 2 && key.length > 2) {
      addGroup("Same URL handle", key, entries);
    }
  }

  return groups.sort((a, b) => b.products.length - a.products.length).slice(0, 40);
}
