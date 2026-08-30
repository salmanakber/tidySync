type AdminGraphqlClient = {
  request: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<unknown>;
};

const PRODUCT_CREATE = `#graphql
  mutation productCreate($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
    productCreate(product: $product, media: $media) {
      product {
        id
        title
        variants(first: 1) {
          edges { node { id } }
        }
      }
      userErrors { field message }
    }
  }
`;

const VARIANTS_BULK_UPDATE = `#graphql
  mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants {
        id
        price
        compareAtPrice
        inventoryItem { sku }
      }
      userErrors { field message }
    }
  }
`;

const LOCATIONS_QUERY = `#graphql
  query ShopLocations {
    locations(first: 1) {
      edges { node { id } }
    }
  }
`;

export async function fetchPrimaryLocationId(client: AdminGraphqlClient): Promise<string | null> {
  const res = (await client.request(LOCATIONS_QUERY)) as {
    data?: { locations?: { edges: Array<{ node: { id: string } }> } };
  };
  return res.data?.locations?.edges?.[0]?.node?.id ?? null;
}

export interface MappedProductRow {
  title?: string;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  status?: string;
  images?: string[];
  variants?: {
    sku?: string;
    price?: string | number;
    compareAtPrice?: string | number | null;
    inventoryQuantity?: number;
    barcode?: string;
  };
}

function productCreateInput(mapped: MappedProductRow): Record<string, unknown> {
  const input: Record<string, unknown> = {
    title: mapped.title ?? "Imported product",
  };
  if (mapped.descriptionHtml) input.descriptionHtml = mapped.descriptionHtml;
  if (mapped.vendor) input.vendor = mapped.vendor;
  if (mapped.productType) input.productType = mapped.productType;
  if (mapped.tags?.length) input.tags = mapped.tags;
  if (mapped.status) {
    const s = String(mapped.status).toUpperCase();
    if (["ACTIVE", "DRAFT", "ARCHIVED"].includes(s)) input.status = s;
  }
  return input;
}

function mediaInput(imageUrls?: string[]): Array<{ originalSource: string; mediaContentType: string }> | undefined {
  if (!imageUrls?.length) return undefined;
  return imageUrls.slice(0, 5).map((url) => ({
    originalSource: url,
    mediaContentType: "IMAGE",
  }));
}

export function buildVariantBulkInput(
  variantId: string,
  fields: {
    sku?: string;
    price?: string | number;
    compareAtPrice?: string | number | null;
    barcode?: string;
  },
): Record<string, unknown> {
  const input: Record<string, unknown> = { id: variantId };
  if (fields.price != null && fields.price !== "") {
    input.price = String(fields.price);
  }
  if (fields.compareAtPrice != null && fields.compareAtPrice !== "") {
    input.compareAtPrice = String(fields.compareAtPrice);
  }
  const inventoryItem: Record<string, unknown> = {};
  if (fields.sku) inventoryItem.sku = String(fields.sku);
  if (fields.barcode) inventoryItem.barcode = String(fields.barcode);
  if (Object.keys(inventoryItem).length > 0) {
    input.inventoryItem = inventoryItem;
  }
  return input;
}

export async function createProductFromMappedRow(
  client: AdminGraphqlClient,
  mapped: MappedProductRow,
  rowIndex: number,
): Promise<{ productId: string; title: string }> {
  const createRes = (await client.request(PRODUCT_CREATE, {
    variables: {
      product: productCreateInput(mapped),
      media: mediaInput(mapped.images),
    },
  })) as {
    data?: {
      productCreate?: {
        product?: {
          id: string;
          title: string;
          variants?: { edges: Array<{ node: { id: string } }> };
        } | null;
        userErrors?: Array<{ message: string }>;
      };
    };
  };

  const createData = createRes.data?.productCreate;
  if (createData?.userErrors?.length) {
    throw new Error(createData.userErrors.map((e) => e.message).join(", "));
  }

  const product = createData?.product;
  if (!product?.id) {
    throw new Error("Shopify did not return a product ID");
  }

  const variantId = product.variants?.edges?.[0]?.node?.id;
  const variantFields = mapped.variants;

  if (variantId && variantFields) {
    const variantInput = buildVariantBulkInput(variantId, {
      sku: variantFields.sku,
      price: variantFields.price,
      compareAtPrice: variantFields.compareAtPrice,
      barcode: variantFields.barcode,
    });

    if (Object.keys(variantInput).length > 1) {
      const updateRes = (await client.request(VARIANTS_BULK_UPDATE, {
        variables: {
          productId: product.id,
          variants: [variantInput],
        },
      })) as {
        data?: {
          productVariantsBulkUpdate?: {
            userErrors?: Array<{ message: string }>;
          };
        };
      };
      const errors = updateRes.data?.productVariantsBulkUpdate?.userErrors;
      if (errors?.length) {
        throw new Error(errors.map((e) => e.message).join(", "));
      }
    }
  } else if (variantFields?.price != null && !variantId) {
    throw new Error(`Row ${rowIndex + 1}: could not update variant price — no default variant returned`);
  }

  return { productId: product.id, title: product.title };
}
