import { getShopGraphqlClient } from "./shopify";

const COLLECTIONS_QUERY = `#graphql
  query collections($first: Int!) {
    collections(first: $first) {
      edges {
        node {
          id
          title
          handle
          descriptionHtml
          sortOrder
          ruleSet { appliedDisjunctively rules { column relation condition } }
        }
      }
    }
  }
`;

const CUSTOMERS_QUERY = `#graphql
  query customers($first: Int!) {
    customers(first: $first) {
      edges {
        node {
          id
          email
          firstName
          lastName
          phone
          tags
          note
          acceptsMarketing
          defaultAddress {
            address1
            city
            province
            country
            zip
          }
        }
      }
    }
  }
`;

export async function fetchCollectionsForExport(shop: string, limit = 500) {
  const client = await getShopGraphqlClient(shop);
  const response = await client.request(COLLECTIONS_QUERY, {
    variables: { first: Math.min(limit, 250) },
  });
  const edges = (response.data as {
    collections: { edges: Array<{ node: Record<string, unknown> }> };
  }).collections.edges;
  return edges.map((e) => e.node);
}

export async function fetchCustomersForExport(shop: string, limit = 500) {
  const client = await getShopGraphqlClient(shop);
  const response = await client.request(CUSTOMERS_QUERY, {
    variables: { first: Math.min(limit, 250) },
  });
  const edges = (response.data as {
    customers: { edges: Array<{ node: Record<string, unknown> }> };
  }).customers.edges;
  return edges.map((e) => e.node);
}

const DISCOUNTS_QUERY = `#graphql
  query codeDiscountNodes($first: Int!) {
    codeDiscountNodes(first: $first) {
      edges {
        node {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              title
              codes(first: 1) { edges { node { code } } }
              startsAt
              endsAt
              usageLimit
              appliesOncePerCustomer
              customerGets {
                value { ... on DiscountPercentage { percentage } ... on DiscountAmount { amount { amount } } }
              }
            }
          }
        }
      }
    }
  }
`;

const METAFIELDS_QUERY = `#graphql
  query productMetafields($first: Int!) {
    products(first: $first) {
      edges {
        node {
          id
          title
          metafields(first: 20) {
            edges {
              node {
                id
                namespace
                key
                value
                type
                description
              }
            }
          }
        }
      }
    }
  }
`;

export async function fetchDiscountsForExport(shop: string, limit = 250) {
  const client = await getShopGraphqlClient(shop);
  const response = await client.request(DISCOUNTS_QUERY, {
    variables: { first: Math.min(limit, 250) },
  });
  const edges = (response.data as {
    codeDiscountNodes: { edges: Array<{ node: Record<string, unknown> }> };
  }).codeDiscountNodes.edges;
  return edges.map((e) => e.node);
}

export async function fetchMetafieldsForExport(shop: string, limit = 250) {
  const client = await getShopGraphqlClient(shop);
  const response = await client.request(METAFIELDS_QUERY, {
    variables: { first: Math.min(limit, 250) },
  });
  const products = (response.data as {
    products: { edges: Array<{ node: Record<string, unknown> }> };
  }).products.edges;

  const rows: Record<string, unknown>[] = [];
  for (const edge of products) {
    const product = edge.node as {
      id: string;
      title: string;
      metafields?: { edges: Array<{ node: Record<string, unknown> }> };
    };
    const metafields = product.metafields?.edges ?? [];
    for (const mf of metafields) {
      const node = mf.node;
      rows.push({
        ownerType: "PRODUCT",
        ownerId: product.id,
        ownerTitle: product.title,
        namespace: node.namespace,
        key: node.key,
        value: node.value,
        type: node.type,
        description: node.description,
      });
    }
  }
  return rows;
}
